#!/usr/bin/env node
/* playtest-recorder：無喇叭環境的「聽得到聲音」自動試玩錄製
 *
 *   node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 80
 *
 * 做的事：
 *   1. 起一個小型 http 伺服器服務原型資料夾（片段頁自動包上 doctype／charset／viewport／[hidden] 外殼；
 *      外部資源（CDN、字型）由 curl 走代理下載並快取，失敗就略過）。
 *   2. 頁面載入前注入 lib/inject.js：攔截 AudioContext 輸出，用 AudioWorklet 逐樣本錄下遊戲實際送出的聲音。
 *   3. Playwright recordVideo 錄畫面；結束後 ffmpeg 合成有聲 mp4（以音訊時鐘↔牆上時間對齊起點）。
 *   4. 輸入：設定檔的程式玩家（bot）和／或 JSON 劇本（--scenario）。每幀把遊戲狀態存成時間軸 JSON。
 *   5. 錄完自動跑 analyze.mjs（--no-analyze 可關）。
 *
 * 選項：
 *   --profile <名稱或路徑>   profiles/<名稱>.mjs；沒有設定檔時用 --dir/--page 錄（只錄聲音與畫面，沒有時間軸）
 *   --dir <資料夾> --page <檔名>   覆寫設定檔的服務資料夾與入口頁
 *   --scenario <file.json>  劇本（見 README）
 *   --duration <秒>          開始後錄多久（牆上時間）；預設取設定檔 defaults.duration，否則 60
 *   --cycle <秒>             放慢遊戲循環（交給設定檔的 prepare；木馬之夜＝規則與聲音的 CYCLE）
 *   --out <資料夾>           輸出位置；預設 tools/playtest-recorder/out/<設定檔名>-<時間>
 *   --no-bot  --no-video  --no-analyze  --no-phase-bar
 *   --no-sync-marker        不畫右下角的影片同步方塊（改用牆上時間估算對齊，誤差可能到 1 秒以上）
 *   --shots <秒>             每隔幾秒截一張圖（預設 10，0＝不截）
 *   --width/--height        視窗大小（預設取設定檔，否則 1280×720）
 *   --antialias             保留遊戲的 WebGL 反鋸齒設定（預設強制關掉以提高無頭幀率）
 *   --render-scale <0..1>   覆寫 devicePixelRatio 降低 WebGL 算圖解析度（預設取設定檔 renderScale）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = ['playwright', '/opt/node-tools/node_modules/playwright'];
  if (process.env.NODE_PATH) for (const p of process.env.NODE_PATH.split(':')) if (p) tries.push(path.join(p, 'playwright'));
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('找不到 playwright（試過 ' + tries.join(', ') + '）');
}
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');

// ---------- 參數 ----------
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (k.startsWith('no') && k.length > 2 && /[A-Z]/.test(k[2])) { o[k[2].toLowerCase() + k.slice(3)] = false; continue; }
    const v = argv[i + 1];
    if (v == null || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; }
  }
  return o;
}
const opt = parseArgs(process.argv.slice(2));
if (opt.help || opt.h) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }

let profile = null, profilePath = null;
if (opt.profile) {
  profilePath = fs.existsSync(opt.profile) ? path.resolve(opt.profile) : path.join(HERE, 'profiles', opt.profile.replace(/\.mjs$/, '') + '.mjs');
  profile = (await import(pathToFileURL(profilePath).href)).default;
}
const P = profile || {};
const serveDir = path.resolve(opt.dir || (P.dir ? path.resolve(path.dirname(profilePath), P.dir) : '.'));
const entry = opt.page || P.page || 'index.html';
const duration = +(opt.duration || (P.defaults && P.defaults.duration) || 60);
const vp = { width: +(opt.width || (P.viewport && P.viewport.width) || 1280), height: +(opt.height || (P.viewport && P.viewport.height) || 720) };
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const outDir = path.resolve(opt.out || path.join(HERE, 'out', (P.name || path.basename(serveDir)) + '-' + stamp));
const cacheDir = path.join(HERE, 'out', '.cache');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
const log = (...a) => console.log('[record]', ...a);

// ---------- http 伺服器 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
function wrapFragment(html) {
  const head = html.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return html;
  return '<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<style>[hidden]{display:none!important}</style>\n</head><body>\n' + html + '\n</body></html>\n';
}
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    let f = path.join(serveDir, decodeURIComponent(u.pathname));
    if (!f.startsWith(serveDir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (ext === '.html') body = Buffer.from(wrapFragment(body.toString('utf8')));
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
log('服務', serveDir, '於', base);

// ---------- 外部資源：curl（走環境的代理）下載並快取 ----------
function fetchExternal(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const bodyF = path.join(cacheDir, key), metaF = bodyF + '.json';
  if (fs.existsSync(metaF)) return { meta: JSON.parse(fs.readFileSync(metaF, 'utf8')), body: fs.readFileSync(bodyF) };
  try {
    const w = execFileSync('curl', ['-sS', '-L', '--max-time', '20', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      '-o', bodyF, '-w', '%{http_code}\t%{content_type}', url], { encoding: 'utf8' });
    const [code, ct] = w.split('\t');
    const meta = { status: +code, contentType: ct || 'application/octet-stream' };
    if (meta.status >= 200 && meta.status < 300) fs.writeFileSync(metaF, JSON.stringify(meta));
    return { meta, body: fs.readFileSync(bodyF) };
  } catch (e) { return null; }
}

// ---------- 瀏覽器 ----------
const { chromium } = loadPlaywright();
// 無 GPU：WebGL 走 SwiftShader（純 CPU）。這組旗標實測在 4 核雲端機器上讓 three.js 場景快約 1.5 倍
// --in-process-gpu 省掉每個 GL 呼叫的跨行程往返；--disable-gpu-compositing 改用軟體合成，
// 實測讓錄影（screencast）從約 2 fps、會凍結數秒，變成約 15 fps，遊戲幀的最長卡頓也從 1 秒多降到約 0.2 秒
const LAUNCH_ARGS = ['--autoplay-policy=no-user-gesture-required', '--disable-accelerated-2d-canvas', '--use-angle=swiftshader',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--in-process-gpu', '--disable-gpu-compositing'];
const browser = await chromium.launch({ args: LAUNCH_ARGS });
const renderScale = opt.renderScale != null ? +opt.renderScale : (P.renderScale || null);
const videoDir = path.join(outDir, '.video');
const context = await browser.newContext({
  viewport: vp, deviceScaleFactor: 1,
  recordVideo: opt.video === false ? undefined : { dir: videoDir, size: vp }
});
const externals = [];
await context.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
  const r = fetchExternal(url);
  externals.push({ url, status: r ? r.meta.status : 'fail' });
  if (!r || r.meta.status >= 400) return route.abort();
  const ct = r.meta.contentType;
  const headers = { 'content-type': ct, 'access-control-allow-origin': '*' };
  return route.fulfill({ status: r.meta.status, headers, body: r.body });
});
await context.addInitScript({ path: path.join(HERE, 'lib', 'inject.js') });
// 降低內部算圖解析度：覆寫 devicePixelRatio（three.js 等以 setPixelRatio(devicePixelRatio) 算圖的遊戲會變快，HUD 文字不受影響）
// 預設關掉 WebGL 反鋸齒（SwiftShader 的 MSAA 很貴）；--antialias 保留遊戲原設定
const forceNoAA = opt.antialias !== true;
if (forceNoAA) await context.addInitScript(`(() => { const o = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, a) { if (/webgl/.test(String(t))) a = Object.assign({}, a, { antialias: false }); return o.call(this, t, a); }; })();`);
if (renderScale) await context.addInitScript(`Object.defineProperty(window, 'devicePixelRatio', { get: () => ${renderScale} });`);
const consoleLog = [];
const videoStartWall = Date.now();
const page = await context.newPage();
page.on('console', m => { if (consoleLog.length < 500) consoleLog.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => consoleLog.push('[pageerror] ' + e.message));

await page.goto(base + entry, { waitUntil: 'load', timeout: 60000 });
log('已載入', entry);
let prepared = null;
if (P.prepare) prepared = await P.prepare(page, opt);
if (opt.syncMarker === false) await page.evaluate(() => { window.__rec.sync.on = false; });
if (P.probe) await page.evaluate(`window.__rec.probe = (${P.probe.toString()});`);
if (P.bot && opt.bot !== false) await page.evaluate(`window.__rec.bot = (${P.bot.toString()});`);
const startWall = Date.now();
log('開始錄製', duration, '秒', opt.cycle ? `（CYCLE=${opt.cycle}）` : '');

// ---------- 劇本 ----------
async function runScenario(file) {
  const sc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const steps = Array.isArray(sc) ? sc : (sc.steps || []);
  for (const s of steps) {
    if (Date.now() - startWall > duration * 1000) break;
    if (s.wait != null) await page.waitForTimeout(+s.wait);
    else if (s.press) await page.keyboard.press(s.press, { delay: s.hold || 40 });
    else if (s.down) await page.keyboard.down(s.down);
    else if (s.up) await page.keyboard.up(s.up);
    else if (s.click) await page.click(s.click);
    else if (s.mouse) { const m = s.mouse; await page.mouse.move(m.x, m.y); if (m.click) await page.mouse.click(m.x, m.y); }
    else if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: (s.timeout || 30) * 1000, polling: 'raf' }).catch(() => log('waitFor 逾時', s.waitFor));
    else if (s.eval) { const v = await page.evaluate(s.eval); if (s.log) log(s.log, JSON.stringify(v)); }
    else if (s.mark) await page.evaluate((m) => window.__rec.events.push({ t: window.__rec.lastT, src: 'scenario', type: 'mark', data: m }), s.mark);
    else if (s.bot != null) await page.evaluate((on) => { if (!on) { window.__rec._bot = window.__rec.bot; window.__rec.bot = null; window.__rec.api.releaseAll(); } else if (window.__rec._bot) window.__rec.bot = window.__rec._bot; }, !!s.bot);
  }
}
const scenarioDone = opt.scenario ? runScenario(path.resolve(opt.scenario)).catch(e => log('劇本錯誤', e.message)) : Promise.resolve();

// ---------- 截圖與等待 ----------
const shotsEvery = opt.shots == null ? 10 : +opt.shots;
const shotsDir = path.join(outDir, 'shots');
if (shotsEvery > 0) fs.mkdirSync(shotsDir, { recursive: true });
const shots = [];
let nextShot = shotsEvery > 0 ? 2 : Infinity;
while (Date.now() - startWall < duration * 1000) {
  const el = (Date.now() - startWall) / 1000;
  if (el >= nextShot) {
    const f = path.join(shotsDir, `shot-${String(Math.round(el)).padStart(3, '0')}s.png`);
    const t = await page.evaluate(() => window.__rec.lastT).catch(() => null);
    await page.screenshot({ path: f }).catch(() => {});
    shots.push({ file: path.relative(outDir, f), wallSec: +el.toFixed(1), audioT: t });
    nextShot += shotsEvery;
  }
  await page.waitForTimeout(250);
}
await Promise.race([scenarioDone, page.waitForTimeout(100)]);
await page.evaluate(() => { window.__rec.bot = null; window.__rec.api.releaseAll(); });

// ---------- 收資料 ----------
const stats = await page.evaluate(() => window.__rec.finish());
const syncMarks = await page.evaluate(() => window.__rec.sync.marks);
const recInfo = await page.evaluate(() => ({ timeline: window.__rec.timeline, events: window.__rec.events, starts: window.__rec.starts,
  startsDropped: window.__rec.startsDropped, errors: window.__rec.errors, frames: window.__rec.frames }));
const endWall = Date.now();
let main = -1, best = 0;
stats.forEach((s, i) => { if (s.frames > best) { best = s.frames; main = i; } });

function wavHeader(frames, sr, ch) {
  const b = Buffer.alloc(44), bytes = frames * ch * 2;
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  return b;
}
const wavPath = path.join(outDir, 'audio.wav');
let audioMeta = null;
if (main >= 0) {
  const s = stats[main];
  const fd = fs.openSync(wavPath, 'w');
  fs.writeSync(fd, wavHeader(s.frames, s.sampleRate, 2));
  const total = s.frames * 2, step = 1 << 20;
  for (let from = 0; from < total; from += step) {
    const b64 = await page.evaluate(([i, f, n]) => window.__rec.pcmSlice(i, f, n), [main, from, step]);
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
  }
  fs.closeSync(fd);
  // 音訊時間 → 牆上時間：用 JS 同時讀到的 currentTime 與 performance 時間（畫面當下對應的音訊時間）
  const offs = s.stamps.map(x => x.wall - x.ct * 1000).sort((a, b) => a - b);
  const wallAtAudio0 = offs.length ? offs[Math.floor(offs.length / 2)] : null;
  const audioStartWall = wallAtAudio0 != null ? wallAtAudio0 + s.startTime * 1000 : null;
  audioMeta = { file: 'audio.wav', sampleRate: s.sampleRate, channels: 2, frames: s.frames, seconds: s.frames / s.sampleRate,
    startAudioTime: s.startTime, captureMode: s.mode, gapFrames: s.gapFrames, gapList: s.gapList, clipSamplesFloat: s.clipSamplesFloat,
    peakFloat: s.peakFloat, audioStartWall, wallJitterMs: offs.length ? offs[offs.length - 1] - offs[0] : null,
    outputLatency: s.stamps.length ? s.stamps[s.stamps.length - 1].out : null, baseLatency: s.stamps.length ? s.stamps[0].base : null };
  log('音訊', audioMeta.seconds.toFixed(1), '秒', s.sampleRate, 'Hz', s.mode, '缺塊樣本', s.gapFrames);
} else log('沒有錄到任何 AudioContext 輸出');

const video = opt.video === false ? null : page.video();
await context.close();
const closeWall = Date.now();
await browser.close();
server.close();

// ---------- 影片＋聲音 → mp4 ----------
let videoMeta = null;
if (video) {
  const webm = await video.path();
  const webmOut = path.join(outDir, 'video.webm');
  fs.renameSync(webm, webmOut);
  fs.rmSync(videoDir, { recursive: true, force: true });
  let vdur = null;
  try {
    const pr = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', webmOut], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const ts = pr.stdout.trim().split('\n').map(Number).filter(Number.isFinite);
    if (ts.length) vdur = ts[ts.length - 1];
  } catch (e) {}
  const offStart = audioMeta && audioMeta.audioStartWall ? (audioMeta.audioStartWall - videoStartWall) / 1000 : 0;
  const offEnd = audioMeta && audioMeta.audioStartWall && vdur ? vdur - (closeWall - audioMeta.audioStartWall) / 1000 : null;
  // 同步標記：找出影片中右下角變白的時間（每個標記取第一個變亮的幀）
  let offSync = null, syncFound = [];
  if (audioMeta && syncMarks.length) {
    const pr = spawnSync(FFMPEG, ['-hide_banner', '-i', webmOut, '-vf', `crop=10:10:${vp.width - 14}:${vp.height - 14},format=gray,showinfo`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 << 20 });
    const fr = [];
    for (const line of pr.stderr.split('\n')) {
      const m = line.match(/pts_time:\s*([\d.]+).*?mean:\[(\d+)/);
      if (m) fr.push({ t: +m[1], y: +m[2] });
    }
    const rises = [];
    for (let i = 1; i < fr.length; i++) if (fr[i].y > 128 && fr[i - 1].y <= 128) rises.push(fr[i].t);
    // 每個標記配對：影片中的變亮時間 − 標記在 WAV 中的時間；取與牆上時間預估最接近的變亮
    for (const mk of syncMarks) {
      const wavT = mk.t - audioMeta.startAudioTime;
      const guess = (mk.wall - videoStartWall) / 1000;
      let best = null; for (const r of rises) if (best == null || Math.abs(r - guess) < Math.abs(best - guess)) best = r;
      if (best != null && Math.abs(best - guess) < 2.5) syncFound.push(+(best - wavT).toFixed(3));
    }
    if (syncFound.length) { const s2 = [...syncFound].sort((a, b) => a - b); offSync = s2[Math.floor(s2.length / 2)]; }
  }
  const offset = offSync != null ? offSync : offStart;
  videoMeta = { webm: 'video.webm', durationSec: vdur, offsetSec: +offset.toFixed(3), offsetMethod: offSync != null ? 'sync-marker' : 'wall-clock',
    offsetFromStartSec: +offStart.toFixed(3), offsetFromEndSec: offEnd == null ? null : +offEnd.toFixed(3),
    syncMarks: syncMarks.length, syncOffsets: syncFound };
  if (audioMeta) {
    const mp4 = path.join(outDir, 'playtest.mp4');
    const af = offset >= 0 ? `adelay=${Math.round(offset * 1000)}:all=1` : `atrim=start=${(-offset).toFixed(3)},asetpts=PTS-STARTPTS`;
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webmOut, '-i', wavPath, '-filter_complex', `[1:a]${af}[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '25',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
    if (r.status === 0) { videoMeta.mp4 = 'playtest.mp4'; log('合成', mp4, `（聲音位移 ${offset.toFixed(3)} 秒，依據 ${videoMeta.offsetMethod}；同步標記 ${syncFound.length}/${syncMarks.length} 個，分布 ${syncFound.length ? Math.min(...syncFound) + '～' + Math.max(...syncFound) : '—'}）`); }
    else log('ffmpeg 合成失敗', r.stderr);
  }
}

// ---------- 時間軸與中繼資料 ----------
const tl = recInfo.timeline;
const fdts = tl.map(s => s.fdt).filter(Number.isFinite).sort((a, b) => a - b);
const fps = fdts.length ? 1000 / fdts[Math.floor(fdts.length / 2)] : null;
const meta = {
  tool: 'playtest-recorder', version: 1, created: new Date().toISOString(),
  profile: P.name || null, profilePath: profilePath ? path.relative(outDir, profilePath) : null, title: P.title || null,
  serveDir, entry, viewport: vp, durationRequested: duration, cycleOverride: opt.cycle ? +opt.cycle : null,
  renderScale, antialiasForcedOff: forceNoAA, launchArgs: LAUNCH_ARGS,
  bot: !!(P.bot && opt.bot !== false), scenario: opt.scenario || null, prepared,
  wall: { videoStart: videoStartWall, start: startWall, end: endWall, close: closeWall },
  audio: audioMeta, video: videoMeta, shots,
  frames: { samples: tl.length, medianFps: fps ? +fps.toFixed(1) : null, p95FrameMs: fdts.length ? fdts[Math.floor(fdts.length * 0.95)] : null,
    maxFrameMs: fdts.length ? fdts[fdts.length - 1] : null },
  scheduledStarts: recInfo.starts.length, scheduledStartsDropped: recInfo.startsDropped,
  errors: recInfo.errors, externals, console: consoleLog.slice(0, 200)
};
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ meta, timeline: tl, events: recInfo.events, starts: recInfo.starts }));
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
log('時間軸', tl.length, '筆；中位幀率', meta.frames.medianFps, 'fps；事件', recInfo.events.length, '；錯誤', recInfo.errors.length);
if (recInfo.errors.length) log('頁面錯誤（前 3 筆）', recInfo.errors.slice(0, 3));

if (opt.analyze !== false && audioMeta) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'analyze.mjs'), outDir], { stdio: 'inherit' });
  if (r.status !== 0) log('analyze 失敗');
}
log('完成：', outDir);
