// 開場其他情境：?intro=old 舊流程、?map=demo 短展示、?intro=cam 鏡頭動畫（截 3 張、幀數比對）、標題畫面。全部 ?mute=1&nolock=1、--mute-audio。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
const ROOT = process.env.ROOT, OUT = process.argv[2], ONLY = process.argv[3] || 'all'; fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let b = fs.readFileSync(p); const e = path.extname(p);
  if (e === '.html' && !/^\s*<!doctype/i.test(b.toString('utf8', 0, 40))) b = Buffer.concat([Buffer.from('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n'), b]);
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/troy-prologue/index.html`;
const PORT = 9400 + Math.floor(Math.random() * 400), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'introc-prof-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
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
const fps = (ms = 4000) => ev(`new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<${ms})requestAnimationFrame(f);else r(Math.round(n/((performance.now()-t0)/1000)*10)/10)};requestAnimationFrame(f)})`);
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const open = async q => { errs.length = 0; await send('Page.navigate', { url: base + '?mute=1&nolock=1' + q }); await sleep(1200);
  for (let i = 0; i < 60; i++) { try { if (await ev('!!(window.TroyDebug && document.getElementById("btnStart"))')) break; } catch (e) {} await sleep(250); }
  await ev('document.fonts.ready.then(()=>1)'); await sleep(400); };
const res = {};
if (ONLY === 'all' || ONLY === 'old') {   // 舊流程：三張字卡、不校準、腹中練習關
  await open('&map=final&intro=old');
  await ev("document.getElementById('btnStart').click()"); await sleep(1200);
  res.old = await ev(`({ story: TroyDebug.story.kind, title: document.getElementById('storyTitle').textContent, seq: document.getElementById('story').classList.contains('seqCard'), horse: !!TroyDebug.game.T.HORSE_MODE })`);
  await shot('old-1-字卡');
  res.old.errors = errs.slice(0, 5);
}
if (ONLY === 'all' || ONLY === 'demo') {  // 短展示：自己的字卡＋「跟著同伴敲」的說法，不走腹中四步
  await open('&map=demo');
  res.demo = await ev(`({ calibTitle: document.getElementById('calibTitle').textContent, calibText: document.getElementById('calibText').textContent })`);
  await ev("document.getElementById('btnStart').click()"); await sleep(1200);
  res.demo.story = await ev('TroyDebug.story.kind'); res.demo.horse = await ev('!!(TroyDebug.game && TroyDebug.game.T.HORSE_MODE)'); res.demo.step = await ev('TroyDebug.intro.step');
  res.demo.errors = errs.slice(0, 5);
}
if (ONLY === 'all' || ONLY === 'new') {   // 新流程（mute=1 時校準略過）：Esc 略過序 → 聽 → Esc 整段跳過 → 第 3 步
  await open('&map=final');
  await shot('new-0-標題');
  await ev("document.getElementById('btnStart').click()"); await sleep(800);
  const k = c => send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: c, windowsVirtualKeyCode: c === 'Escape' ? 27 : 32 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: c, windowsVirtualKeyCode: c === 'Escape' ? 27 : 32 }));
  await k('Escape'); await sleep(600);
  const a = await ev('({ step: TroyDebug.intro.step, hint: TroyDebug.hintState().cur })');
  await k('Escape'); await sleep(600);
  const b = await ev('({ step: TroyDebug.intro.step, hint: TroyDebug.hintState().cur, horse: !!TroyDebug.game.T.HORSE_MODE, cal: TroyDebug.calib.done })');
  res.new = { afterSkipPrologue: a, afterSkipListen: b, errors: errs.slice(0, 5) };
}
if (ONLY === 'all' || ONLY === 'cam') {   // 鏡頭動畫：截 3 張、演出中幀數 vs 腹中遊戲幀數
  await open('&map=final&intro=cam&art=2');
  await ev("document.getElementById('btnStart').click()"); await sleep(600);
  await ev("document.getElementById('storySkip').click()"); await sleep(300);
  const c0 = await ev('({ active: TroyDebug.cam.active, story: TroyDebug.game.story, n: TroyDebug.cam.curve && TroyDebug.cam.curve.points.length, len: TroyDebug.cam.curve && Math.round(TroyDebug.cam.curve.getLength()) })');
  await sleep(2500); await shot('cam-1-城門外');
  const f1 = await fps(4000);
  await sleep(4000); await shot('cam-2-街上');
  const f2 = await fps(4000);
  await sleep(8500); await shot('cam-3-木馬前');
  let endWait = 0; while (await ev('TroyDebug.cam.active') && endWait < 80) { await sleep(250); endWait++; }
  const c1 = await ev('({ active: TroyDebug.cam.active, story: TroyDebug.game.story, step: TroyDebug.intro.step, seen: localStorage.getItem("troy-intro-cam-seen"), frames: TroyDebug.cam.frames })');
  await sleep(1500);
  const fg = await fps(4000);
  // 第二次（同一台電腦）不再出現
  await open('&map=final&intro=cam&art=2');
  await ev("document.getElementById('btnStart').click()"); await sleep(600);
  await ev("document.getElementById('storySkip').click()"); await sleep(400);
  const again = await ev('TroyDebug.cam.active');
  res.cam = { start: c0, end: c1, fpsCam: [f1, f2], fpsBelly: fg, secondTimeActive: again, errors: errs.slice(0, 5) };
}
if (ONLY === 'camseq') {   // 自己檢查用：每 3 秒拍一張，看整段有沒有貼牆
  await open('&map=final&intro=cam&art=2');
  await ev("document.getElementById('btnStart').click()"); await sleep(600);
  await ev("document.getElementById('storySkip').click()"); await sleep(300);
  for (let i = 1; i <= 8; i++) { await sleep(3000); await shot('seq-' + String(i * 3).padStart(2, '0') + 's'); }
  res.camseq = { errors: errs.slice(0, 5) };
}
console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
