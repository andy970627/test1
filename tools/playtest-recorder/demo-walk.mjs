#!/usr/bin/env node
/* 短展示版實走與聲音累積檢查（?map=demo，11/23）
 *
 *   node tools/playtest-recorder/demo-walk.mjs [--root prototypes] [--rounds 3] [--max 480] [--json 結果.json]
 *
 * 怎麼走：頁面裡跑 troy-bots.js 的 makeBot（完美踩拍，路線＝地圖 botRoute），輸出只轉成輸入事件：
 *   KeyboardEvent（W、空白、Q、Shift、E）與滑鼠拖曳（?nolock=1 時遊戲用拖曳轉視角）。
 *   只「讀」game 與 V.yaw 來決定下一步，不寫玩家座標、視角或任何遊戲狀態。事件是腳本送出的（isTrusted=false），遊戲目前不檢查這點。
 * 一輪：開場字卡按空白→木馬下→神殿廣場→城門→結局→空白鍵再玩一次。輸了也用空白鍵重開，記成失敗輪、不算一輪完成。
 * 聲音（不出聲）：網址 mute=1、瀏覽器 --mute-audio。
 *   量得到：累計建立的節點、仍在播的音源（start 後還沒 ended）、connect 減 disconnect、接到靜音總閘前的訊號 RMS／峰值、JS 記憶體。
 *   量不到：瀏覽器內部實際還活著的節點數（垃圾回收不可見）、喇叭實際音量、真人聽感。
 * 退出碼：完成指定輪數且 0 錯誤為 0，否則 1；執行出錯為 2。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(REPO, opt('root', 'prototypes')), ROUNDS = +opt('rounds', 3), MAX = +opt('max', 480);
const req = createRequire(import.meta.url);
function pw() {
  for (const t of ['playwright', ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright'))]) { try { return req(t); } catch (e) { /* 下一個 */ } }
  throw new Error('找不到 playwright（設定 NODE_PATH）');
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const serve = () => new Promise((ok) => {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  s.listen(0, '127.0.0.1', () => ok(s));
});

// 頁面腳本載入前：只加計數與分接，不改聲音路徑
function audioProbe() {
  const A = window.__demoAudio = { created: 0, live: 0, connects: 0, disconnects: 0, an: null, buf: null, tapIn: null };
  const BC = BaseAudioContext.prototype, AN = AudioNode.prototype, oc = AN.connect, od = AN.disconnect;
  for (const k of Object.getOwnPropertyNames(BC)) {
    if (!/^create(?!Buffer$|PeriodicWave$)/.test(k)) continue;
    const d = Object.getOwnPropertyDescriptor(BC, k);
    if (typeof d.value !== 'function') continue;
    const f = d.value;
    BC[k] = function () { A.created++; return f.apply(this, arguments); };
  }
  const SP = AudioScheduledSourceNode.prototype, st = SP.start;
  SP.start = function () { A.live++; this.addEventListener('ended', () => { A.live--; }, { once: true }); return st.apply(this, arguments); };
  AN.connect = function (d) {
    A.connects++;
    const c = this.context, gate = c.__muteGate;
    if (gate && d === gate) {
      if (!A.an) { A.an = c.createAnalyser(); A.an.fftSize = 2048; A.buf = new Float32Array(2048); A.tapIn = c.createGain(); oc.call(A.tapIn, A.an); }
      oc.call(this, A.tapIn);
    }
    return oc.apply(this, arguments);
  };
  AN.disconnect = function () { A.disconnects++; return od.apply(this, arguments); };
  A.level = () => {
    if (!A.an) return null;
    A.an.getFloatTimeDomainData(A.buf);
    let s = 0, p = 0;
    for (const v of A.buf) { s += v * v; p = Math.max(p, Math.abs(v)); }
    return { r: s / A.buf.length, p };
  };
}

function driver({ botSrc, flSrc, rounds }) {
  const D = window.TroyDebug, R = window.RissetRules, canvas = document.querySelector('canvas');
  const S = window.__walk = { rounds: [], done: false, cur: null, cardSnap: null };
  const held = new Set();
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));
  const set = (code, on) => { if (on && !held.has(code)) { held.add(code); key('keydown', code); } else if (!on && held.has(code)) { held.delete(code); key('keyup', code); } };
  const tap = (code) => { key('keydown', code); key('keyup', code); };
  const releaseAll = () => { for (const c of [...held]) set(c, false); };
  let mx = 200, bot = null, botG = null, lastTap = 0, overAt = 0, dragG = null;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const snap = () => { const a = window.__demoAudio; return { created: a.created, live: a.live, net: a.connects - a.disconnects, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }; };
  const storyOpen = () => { const e = document.getElementById('story'); return e && !e.hidden; };
  function frame() {
    if (S.done) { releaseAll(); return; }
    requestAnimationFrame(frame);
    const now = performance.now(), g = D.game;
    if (storyOpen()) {
      releaseAll();
      if (!S.cardSnap) S.cardSnap = { at: now };
      if (!S.cardSnap.v && now - S.cardSnap.at > 1500) S.cardSnap.v = snap();   // 字卡停 1.5 秒後的節點數：上一輪的聲音該收掉了
      if (S.cardSnap.v && now - lastTap > 800) { lastTap = now; S.cur = { startSnap: S.cardSnap.v, zones: [], t0: now, rSum: 0, rN: 0, pk: 0 }; S.cardSnap = null; tap('Space'); }
      return;
    }
    if (!g || !S.cur) return;
    if (g.phase === 'win' || g.phase === 'fail') {
      releaseAll();
      if (!S.cur.end) {
        S.cur.end = g.phase; S.cur.sec = +((now - S.cur.t0) / 1000).toFixed(1); S.cur.lastZone = g.zone; S.rounds.push(S.cur); overAt = now;
        if (S.rounds.filter((x) => x.end === 'win').length >= rounds) { S.final = snap(); S.stopping = true; setTimeout(() => { S.afterWin = snap(); S.done = true; }, 3000); }
      }
      if (!S.stopping && now - overAt > 3200 && now - lastTap > 700) { lastTap = now; tap('Space'); }
      return;
    }
    if (g.phase !== 'play') return;
    if (g !== botG) {
      botG = g;
      const o = Object.assign({ cover: g.T.COVER_MODE === true }, new Function('return (' + flSrc + ')')()(R.resolveLevel(window.TroyLevelDemo)));
      bot = new Function('R', 'return (' + botSrc + ')')(R)(o);
    }
    if (dragG !== g) { dragG = g; canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: mx, clientY: 200, bubbles: true })); }
    if (S.cur.zones[S.cur.zones.length - 1] !== g.zone) S.cur.zones.push(g.zone);
    const l = window.__demoAudio.level();
    if (l) { S.cur.rSum += l.r; S.cur.rN++; S.cur.pk = Math.max(S.cur.pk, l.p); }
    S.pos = { x: +g.player.x.toFixed(2), z: +g.player.z.toFixed(2), zone: g.zone, hunted: !!g.hunted };
    const inp = bot(g) || {}, mv = !!(inp.mx || inp.mz);
    if (mv) {
      const dx = Math.round(wrap(D.V.yaw - Math.atan2(-inp.mx, -inp.mz)) / 0.0024);
      if (dx) { mx += dx; window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: mx, clientY: 200 })); }
    }
    set('KeyW', mv); set('Space', !!inp.breath && !mv);
    if (inp.calm) tap('KeyQ');
    if (inp.dash && now - (S.dashAt || 0) > 500) { S.dashAt = now; tap('ShiftLeft'); }
    if (inp.takedown && now - (S.tdAt || 0) > 300) { S.tdAt = now; set('KeyE', false); tap('KeyE'); } else if (!inp.takedown) set('KeyE', !!inp.interact);
  }
  requestAnimationFrame(frame);
}

async function main() {
  const { chromium } = pw(), B = req('../telemetry/troy-bots.js');
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = []; let out;
  try {
    const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('例外：' + String(e.message).slice(0, 200)));
    page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(r.status() + '：' + r.url().replace(base, '')); });
    await page.addInitScript(audioProbe);
    await page.goto(base + 'troy-prologue/index.html?map=demo&mute=1&nolock=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TroyDebug && window.TroyLevelDemo && window.RissetRules, null, { timeout: 30000 });
    await page.evaluate(driver, { botSrc: B.makeBot.toString(), flSrc: B.forBotLevel.toString(), rounds: ROUNDS });
    const t0 = Date.now();
    for (;;) {
      await page.waitForTimeout(1000);
      if (await page.evaluate(() => window.__walk.done) || (Date.now() - t0) / 1000 > MAX) break;
    }
    out = await page.evaluate(() => {
      const S = window.__walk, a = window.__demoAudio;
      return { done: S.done, rounds: S.rounds.map((r) => ({ end: r.end, sec: r.sec, zones: r.zones, lastZone: r.lastZone, start: r.startSnap, rmsDb: r.rN ? +(10 * Math.log10(r.rSum / r.rN + 1e-12)).toFixed(1) : null, peakDb: r.pk ? +(20 * Math.log10(r.pk)).toFixed(1) : null })), final: S.final, afterWin: S.afterWin, pos: S.pos, tapped: !!a.an };
    });
  } finally { await browser.close(); srv.close(); }
  out.errors = [...new Set(errors)];
  console.log(`根目錄：${path.relative(REPO, ROOT)}\n\n| 輪 | 結果 | 秒 | 經過的區 | 開局仍在播 | 開局累計節點 | 連線淨值 | 記憶體 MB | RMS dB | 峰值 dB |\n|---|---|---|---|---|---|---|---|---|---|`);
  out.rounds.forEach((r, i) => console.log(`| ${i + 1} | ${r.end} | ${r.sec} | ${r.zones.join('→')} | ${r.start.live} | ${r.start.created} | ${r.start.net} | ${r.start.heapMB} | ${r.rmsDb} | ${r.peakDb} |`));
  console.log(`\n結束後 3 秒：${JSON.stringify(out.afterWin)}；分接到訊號：${out.tapped}；主控台錯誤 ${out.errors.length}`);
  out.errors.forEach((e) => console.log('  ' + e));
  if (!out.done) console.log('沒走完，最後位置：' + JSON.stringify(out.pos));
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
  return out.done && !out.errors.length ? 0 : 1;
}
main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack || e.message); process.exitCode = 2; });
