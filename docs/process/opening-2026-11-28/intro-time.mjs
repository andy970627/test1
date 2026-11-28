// 新開場量時間：從按「開始」到走出木馬（離開腹中區）。Chrome 無頭、--mute-audio（系統靜音，聽不到），
// 不帶 ?mute=1 是因為 mute=1 會整段跳過校準；程式玩家跟著同伴敲（校準拍點）、在鼓點上起步。
// 用法：ROOT=<prototypes 路徑> node intro-time.mjs <輸出資料夾> [額外網址參數]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
const ROOT = process.env.ROOT, OUT = process.argv[2], EXTRA = process.argv[3] || ''; fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let b = fs.readFileSync(p); const e = path.extname(p);
  if (e === '.html' && !/^\s*<!doctype/i.test(b.toString('utf8', 0, 40))) b = Buffer.concat([Buffer.from('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n'), b]);
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/troy-prologue/index.html`;
const PORT = 9400 + Math.floor(Math.random() * 400), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'intro-prof-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 75; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(s.result.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base + '?map=final&nolock=1' + EXTRA }); await sleep(1500);
for (let i = 0; i < 60; i++) { try { if (await ev('!!(window.TroyDebug && document.getElementById("btnStart"))')) break; } catch (e) {} await sleep(250); }
await ev('document.fonts.ready.then(()=>1)'); await sleep(500);
await shot('0-標題');
// 程式玩家（頁面裡跑）：校準時照拍點敲空白鍵；第 3 步起在鼓點上點一下 W（站定後起步），亮滿之後按住 W 走到暗門
await ev(`(()=>{
  const D = window.TroyDebug, R = window.RissetRules, log = window.__log = { t0: performance.now(), ev: [], shots: {} };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace('Key','').toLowerCase(), bubbles: true }));
  let tapI = 0, wDownAt = null, lastUp = -1e9, zone0 = null, lastStep = null;
  const tick = () => {
    const g = D.game, I = D.intro, C = D.calib, now = performance.now();
    if (!g) return requestAnimationFrame(tick);
    if (zone0 == null) zone0 = g.zone;
    if (I.step !== lastStep) { log.ev.push(['step' + I.step, Math.round(now - log.t0)]); lastStep = I.step; }
    if (C.open && C.phase === 'listen' && Array.isArray(C.beats) && D.actx) {
      const t = D.actx.currentTime - (D.actx.outputLatency || D.actx.baseLatency || 0);
      if (tapI < C.beats.length && t >= C.beats[tapI] + 0.01) { key('keydown', 'Space'); key('keyup', 'Space'); tapI++; }
    }
    if (I.step >= 3 && g.phase === 'play' && g.zone === zone0 && g.belly) {
      const ready = g.belly.ready;
      if (ready) { if (wDownAt == null) { key('keydown', 'KeyW'); wDownAt = now; } }
      else if (wDownAt != null && now - wDownAt > 180) { key('keyup', 'KeyW'); wDownAt = null; lastUp = now; }
      else if (wDownAt == null && now - lastUp > 450) {
        let ok = false; try { ok = R.stepMasked(g.time, g, g.T.STEP_WIN); } catch (e) {}
        if (ok) { key('keydown', 'KeyW'); wDownAt = now; }
      }
    }
    if (g.zone !== zone0 && !log.out) { log.out = Math.round(now - log.t0); key('keyup', 'KeyW'); log.ev.push(['outOfHorse', log.out]); return; }
    requestAnimationFrame(tick);
  };
  log.start = () => { log.t0 = performance.now(); document.getElementById('btnStart').click(); requestAnimationFrame(tick); };
})()`);
await ev('window.__log.start()');
const T0 = Date.now(); const shotsAt = { 3000: '1-序第一句', 23000: null };
let done = false, s1 = false, s2 = false, s3 = false;
while (Date.now() - T0 < 150000) {
  const st = await ev('({ out: window.__log.out, step: TroyDebug.intro.step, story: TroyDebug.story.kind, cal: TroyDebug.calib.open && TroyDebug.calib.phase, belly: TroyDebug.game && TroyDebug.game.belly })');
  if (!s1 && st.story === 'prologue' && Date.now() - T0 > 1500) { await shot('1-序第一句'); s1 = true; }
  if (!s2 && st.cal === 'listen') { await sleep(1200); await shot('2-跟著他敲'); s2 = true; }
  if (!s3 && st.step === 3) { await sleep(1500); await shot('3-踩著它走'); s3 = true; }
  if (st.out) { done = true; break; }
  await sleep(200);
}
const res = await ev(`({ log: window.__log, marks: TroyDebug.intro.marks, cues: TroyDebug.story.cues, offsetMs: TroyDebug.calib.offsetMs, belly: TroyDebug.game.belly, inputOffsetMs: TroyDebug.game.inputOffsetMs, hint: TroyDebug.hintState() })`);
res.errors = errs.slice(0, 8); res.done = done;
console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
