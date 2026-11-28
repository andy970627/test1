// 滑鼠鎖定六條 Esc 路徑。無頭 Chrome 拿不到真的指標鎖定，改用假的鎖定（頁面載入前注入）：
//   requestPointerLock 只在「1 秒內有真的點擊」（開局建場景要幾百毫秒；Chrome 的點擊效力是 5 秒）且「玩家按 Esc 解除後超過 1 秒」才成功（比 Chrome 嚴：Esc 解除後一律要點擊），否則送 pointerlockerror；
//   __userEsc() 模擬瀏覽器的 Esc：直接解除鎖定、送 pointerlockchange（瀏覽器吃掉那下 Esc，頁面收不到）。
//   點擊、按鍵都用 CDP Input（算真的使用者輸入）。全部 --mute-audio，?mute=1 能用就用（校準那條要聲音層，不帶 mute）。
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
const ROOT = process.env.ROOT, ONLY = process.argv[2] || 'all';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let b = fs.readFileSync(p); const e = path.extname(p);
  if (e === '.html' && !/^\s*<!doctype/i.test(b.toString('utf8', 0, 40))) b = Buffer.concat([Buffer.from('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"></head><body>\n'), b]);
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/troy-prologue/index.html`;
const PORT = 9400 + Math.floor(Math.random() * 400), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-prof-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{let el=null,userExitAt=-1e9,clickAt=-1e9;window.__pl={log:[]};
  ['mousedown','pointerdown','click'].forEach(t=>window.addEventListener(t,e=>{if(e.isTrusted)clickAt=performance.now()},true));
  Object.defineProperty(Document.prototype,'pointerLockElement',{get(){return el},configurable:true});
  const fire=t=>setTimeout(()=>document.dispatchEvent(new Event(t)),0);
  Element.prototype.requestPointerLock=function(){const now=performance.now(),g=now-clickAt<1000,ok=g&&now-userExitAt>1000&&!window.__plDeny;__pl.log.push(['req',ok,g]);
    if(ok){const t=this;setTimeout(()=>{el=t;document.dispatchEvent(new Event('pointerlockchange'))},0);return Promise.resolve()} fire('pointerlockerror');return Promise.reject(new DOMException('fake','NotAllowedError'))};
  Document.prototype.exitPointerLock=function(){if(el){setTimeout(()=>{el=null;document.dispatchEvent(new Event('pointerlockchange'))},0)}};
  window.__userEsc=()=>{if(el){el=null;userExitAt=performance.now();document.dispatchEvent(new Event('pointerlockchange'))}};
})()` });
const open = async q => { errs.length = 0; await send('Page.navigate', { url: base + q }); await sleep(1200);
  for (let i = 0; i < 60; i++) { try { if (await ev('!!(window.TroyDebug && document.getElementById("btnStart"))')) break; } catch (e) {} await sleep(250); }
  await sleep(300); };
const VK = { Escape: 27, Space: 32, KeyR: 82, KeyW: 87 };
const key = async c => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code: c, key: c === 'Escape' ? 'Escape' : c === 'Space' ? ' ' : c.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[c] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: c, key: c, windowsVirtualKeyCode: VK[c] }); };
const clickXY = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }); };
const clickEl = async sel => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`); await clickXY(r[0], r[1]); };
const clickCanvas = async () => { const p = await ev(`(()=>{for(const [x,y] of [[640,160],[300,200],[980,200],[640,500]]){const e=document.elementFromPoint(x,y);if(e&&e.tagName==='CANVAS')return [x,y]}return [640,160]})()`); await clickXY(p[0], p[1]); };
const st = () => ev(`(()=>{const s=TroyDebug.lockState();return { locked:s.locked, failed:s.lockFailed, hint:s.hint, paused:s.paused, pauseShown:!document.getElementById('pause').hidden, failShown:!document.getElementById('fail').hidden, story:TroyDebug.story.kind, step:TroyDebug.intro.step, cam:TroyDebug.cam.active, calib:TroyDebug.calib.open, phase:TroyDebug.game&&TroyDebug.game.phase }})()`);
const res = {};
const run = async (name, fn) => { if (ONLY !== 'all' && ONLY !== name) return; const steps = []; const rec = async label => { await sleep(250); steps.push([label, await st()]); };
  try { await fn(rec); } catch (e) { steps.push(['例外', String(e).slice(0, 200)]); }
  res[name] = { steps, reqLog: await ev('window.__pl.log.slice(-8)').catch(() => null), errors: errs.slice(0, 5) }; };

await run('1暫停後繼續', async rec => {
  await open('?map=final&mute=1&story=0');
  await clickEl('#btnStart'); await rec('開始（點擊）');
  await ev('__userEsc()'); await rec('瀏覽器 Esc 解除');
  await key('Escape'); await rec('同一下 Esc 也送進頁面（若瀏覽器有送）');
  await sleep(500); await key('Escape'); await rec('再按 Esc 繼續');
  await clickCanvas(); await rec('點畫面');
  await ev('__userEsc()'); await sleep(300); await clickEl('#btnResume'); await rec('Esc 解除後 0.3 秒內點「繼續」');
  await sleep(1200); await clickCanvas(); await rec('過 1 秒後點畫面');
});
await run('2序按Esc', async rec => {
  await open('?map=final&mute=1');
  await clickEl('#btnStart'); await rec('開始（點擊）＝序');
  await key('Escape'); await rec('Esc 跳過序＝聽');
  await sleep(4300); await rec('聽完（mute 略過校準）＝第 3 步');
  await clickCanvas(); await rec('點畫面');
});
await run('3聽按Esc', async rec => {
  await open('?map=final&mute=1');
  await clickEl('#btnStart'); await key('Escape'); await sleep(400); await rec('序跳過＝聽');
  await key('Escape'); await rec('Esc 整段跳過＝第 3 步');
  await clickCanvas(); await rec('點畫面');
});
await run('4校準跳過', async rec => {
  await open('?map=final');   // 不帶 mute：校準要聲音層（--mute-audio 系統靜音）
  await clickEl('#btnStart'); await rec('開始＝序'); await key('Escape'); await rec('Esc 跳過序＝聽'); await sleep(4600); await rec('聽完＝校準');
  await clickEl('#calibSkip'); await rec('點「跳過」');
  await open('?map=final');
  await clickEl('#btnStart'); await key('Escape'); await sleep(4600); await rec('（第二次）校準');
  await key('Escape'); await rec('按 Esc 跳過校準');
  await clickCanvas(); await rec('點畫面');
});
await run('5鏡頭動畫Esc', async rec => {
  await open('?map=final&mute=1&intro=cam');
  await ev("localStorage.removeItem('troy-intro-cam-seen')");
  await open('?map=final&mute=1&intro=cam');
  await clickEl('#btnStart'); await sleep(300); await clickEl('#storySkip'); await rec('點略過序＝鏡頭動畫');
  await ev('__userEsc()'); await rec('（鏡頭動畫中瀏覽器 Esc）');
  await key('Escape'); await rec('Esc 跳過鏡頭＝聽');
  await sleep(4300); await rec('聽完＝第 3 步');
  await clickCanvas(); await rec('點畫面');
});
await run('6失敗重來', async rec => {
  const caught = async () => {
    await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x));if(q){g.player.x=q.x+1.2;g.player.z=q.z;}})()`);
    for (let i = 0; i < 80; i++) {
      if (await ev("TroyDebug.game.phase === 'fail'")) break;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 }); await sleep(120);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 }); await sleep(130);
      if (i % 10 === 5) await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x)&&q.state!=='down');if(q){g.player.x=q.x+1;g.player.z=q.z;}})()`);
    }
    await sleep(1500);
  };
  await open('?map=final&mute=1&startZone=3&story=0');
  await clickEl('#btnStart'); await rec('開始（點擊）');
  await caught(); await rec('被抓＝失敗畫面');
  await clickEl('#btnRetry'); await rec('點「重來」');
  await caught(); await rec('再被抓');
  await key('KeyR'); await rec('按 R 重來');
  await clickCanvas(); await rec('點畫面');
});
await run('7頁面不給鎖', async rec => {   // 像 claude.ai 試玩頁：點擊也鎖不了 → 改拖曳、不再提示
  await open('?map=final&mute=1&story=0'); await ev('window.__plDeny=true');
  await clickEl('#btnStart'); await rec('開始（點擊，被拒）');
  await clickCanvas(); await rec('點畫面（被拒）');
});
console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
