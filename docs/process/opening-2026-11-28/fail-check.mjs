// 失敗畫面只講一句（g.failLine）＋遙測 fail 帶 x、z；序跳過叫 storyCueStop(0.3)。無頭、靜音、?mute=1&nolock=1。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
const ROOT = process.env.ROOT;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let b = fs.readFileSync(p); const e = path.extname(p);
  if (e === '.html' && !/^\s*<!doctype/i.test(b.toString('utf8', 0, 40))) b = Buffer.concat([Buffer.from('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"></head><body>\n'), b]);
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/troy-prologue/index.html`;
const PORT = 9400 + Math.floor(Math.random() * 400), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fail-prof-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 75; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
await send('Page.enable'); await send('Runtime.enable');
const open = async q => { await send('Page.navigate', { url: base + q }); await sleep(1200); for (let i = 0; i < 60; i++) { try { if (await ev('!!(window.TroyDebug && document.getElementById("btnStart"))')) break; } catch (e) {} await sleep(250); } };
const res = {};
// 1) 序跳過：不帶 mute（才有聲音層），記 storyCue／storyCueStop 的呼叫
await open('?map=final&nolock=1');
await ev("document.getElementById('btnStart').click()"); await sleep(1500);
await ev(`(()=>{const a=TroyDebug.audio&&TroyDebug.audio.raw;window.__calls=[];if(a){const s=a.storyCue,t=a.storyCueStop;a.storyCue=(...x)=>{__calls.push(['cue',x[0],x[2]]);return s.apply(a,x)};a.storyCueStop=(...x)=>{__calls.push(['stop',x[0]]);return t.apply(a,x)}}})()`);
await sleep(5200);   // 讓第二句的 cue 出來
await ev("document.getElementById('storySkip').click()"); await sleep(300);
res.skip = await ev('({ calls: window.__calls, cues: TroyDebug.story.cues, step: TroyDebug.intro.step })');
// 2) 失敗：第 3 區（神殿廣場）把玩家擺到衛兵旁邊、亂踩出聲，等被抓
await open('?map=final&mute=1&nolock=1&startZone=3&story=0');
await ev("document.getElementById('btnStart').click()"); await sleep(1500);
await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x));if(q){g.player.x=q.x+1.2;g.player.z=q.z;}})()`);
const key = (t, c) => send('Input.dispatchKeyEvent', { type: t, code: c, key: c, windowsVirtualKeyCode: c === 'KeyW' ? 87 : 16 });
for (let i = 0; i < 80; i++) {
  if (await ev("TroyDebug.game.phase === 'fail'")) break;
  await key('keyDown', 'KeyW'); await sleep(120); await key('keyUp', 'KeyW'); await sleep(130);
  if (i % 10 === 5) await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x)&&q.state!=='down');if(q){g.player.x=q.x+1;g.player.z=q.z;}})()`);
}
await sleep(1500);
res.fail = await ev(`(()=>{const g=TroyDebug.game,T=TroyDebug.telemetry;let fe=null;try{const r=T&&(T.current?T.current():T.run||null);const evs=r&&(r.events||r.ev)||[];fe=evs.filter(e=>(e.type||e.t||e[1])==='fail').slice(-1)[0]||null;}catch(e){}
  return { phase:g.phase, failLine:g.failLine, failReason:g.failReason, shown:document.getElementById('failWhy').textContent, player:{x:g.player.x,z:g.player.z}, cur: (()=>{try{const r=T.current();const j=JSON.stringify(r);const i=j.indexOf('"fail"');return {keys:Object.keys(r||{}), near: i>=0?j.slice(Math.max(0,i-80),i+260):null}}catch(e){return String(e)}})() }})()`);
res.errors = errs.slice(0, 5);
console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
