// 配色 A 截圖對照（?ui=0 與新預設）＋失敗畫面第二行（g.failHowLine）三個情境。無頭、--mute-audio、?mute=1&nolock=1。
// 用法：ROOT=<prototypes 路徑> node pal-check.mjs <輸出資料夾> [pal|how|all]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import os from 'node:os';
const ROOT = process.env.ROOT, OUT = process.argv[2], ONLY = process.argv[3] || 'all'; fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let b = fs.readFileSync(p); const e = path.extname(p);
  if (e === '.html' && !/^\s*<!doctype/i.test(b.toString('utf8', 0, 40))) b = Buffer.concat([Buffer.from('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n'), b]);
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`, GAME = HOST + 'troy-prologue/index.html';
const PORT = 9400 + Math.floor(Math.random() * 400), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-prof-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 75; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const shot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(s.result.data, 'base64')); };
const size = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
await send('Page.enable'); await send('Runtime.enable'); await size(1280, 720);
const go = async (url, ready = 'document.readyState === "complete"') => { errs.length = 0; await send('Page.navigate', { url }); await sleep(900);
  for (let i = 0; i < 60; i++) { try { if (await ev(ready)) break; } catch (e) {} await sleep(250); }
  await ev('document.fonts.ready.then(()=>1)'); await sleep(500); };
const gameReady = '!!(window.TroyDebug && document.getElementById("btnStart"))';
const caught = async () => {
  await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x));if(q){g.player.x=q.x+1.2;g.player.z=q.z;}})()`);
  for (let i = 0; i < 100; i++) {
    if (await ev("TroyDebug.game.phase === 'fail'")) break;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 }); await sleep(120);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 }); await sleep(130);
    if (i % 10 === 5) await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x)&&q.state!=='down');if(q){g.player.x=q.x+1;g.player.z=q.z;}})()`);
    if (globalThis.__seed) await globalThis.__seed();   // 成功一次會清掉那一格，補回去
  }
  await sleep(1300);
};
const res = {};
if (ONLY === 'all' || ONLY === 'pal') {
  for (const [tag, q] of [['ui0', '&ui=0'], ['A', '']]) {
    const r = res[tag] = {};
    await size(1280, 720);
    await go(GAME + '?map=final&mute=1&nolock=1' + q, gameReady);
    await shot(tag + '-1-標題');
    r.intro = await ev(`(()=>{const c=getComputedStyle(document.getElementById('intro'));const h=document.querySelector('#intro h1');return {bg:c.backgroundColor,img:c.backgroundImage.slice(0,40),color:c.color,h1:getComputedStyle(h).color,cls:document.documentElement.className,btn:getComputedStyle(document.getElementById('btnStart')).backgroundColor}})()`);
    await ev(`document.getElementById('opts').scrollIntoView({block:'start'})`); await sleep(300);
    await shot(tag + '-2-設定');
    await go(GAME + '?map=final&mute=1&nolock=1&story=0' + q, gameReady);
    await ev("document.getElementById('btnStart').click()"); await sleep(2500);
    await shot(tag + '-3-遊戲中HUD');
    r.hud = await ev(`({zone:getComputedStyle(document.getElementById('zone')).color, torch:getComputedStyle(document.documentElement).getPropertyValue('--torch').trim(), hintBg:getComputedStyle(document.getElementById('hint')).backgroundColor})`);
    await go(GAME + '?map=final&mute=1&nolock=1&story=0&startZone=3' + q, gameReady);
    await ev("document.getElementById('btnStart').click()"); await sleep(1500);
    await caught(); await shot(tag + '-4-失敗畫面');
    for (const [name, page] of [['5-作品集入口', 'showcase.html'], ['6-關卡編輯器', 'level-editor.html'], ['7-切換台', 'switch.html']]) {
      await go(HOST + page + (q ? '?ui=0' : '')); await shot(tag + '-' + name);
    }
    await size(375, 812, true);
    await go(HOST + 'showcase.html' + (q ? '?ui=0' : ''));
    r.showcase375 = await ev('({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, cls: document.documentElement.className })');
    await shot(tag + '-8-作品集入口-375');
    r.errors = errs.slice(0, 5);
  }
  await size(1280, 720);
  for (const page of ['index.html', 'bard-table/index.html', 'blind-cave-web/index.html', 'troy-prologue/audio-test.html', 'playtest-today.html']) {   // 沒有 palA 的頁：看一眼有沒有壞
    await go(HOST + page); await shot('other-' + page.replace(/[\/.]/g, '_'));
    (res.other ||= {})[page] = { bg: await ev('getComputedStyle(document.body).backgroundColor'), cls: await ev('document.documentElement.className'), errors: errs.slice(0, 3) };
  }
}
if (ONLY === 'all' || ONLY === 'how') {
  await size(1280, 720);
  await go(GAME + '?map=final&mute=1&nolock=1&story=0&startZone=3', gameReady);
  await ev("document.getElementById('btnStart').click()"); await sleep(1500);
  res.how = [];
  for (let n = 1; n <= 3; n++) {
    // 無頭模式每次被抓的原因不一定一樣（火光、鼓聲最急……），所以第 2、3 次先把這一區每種原因的次數設成 n−1（規則的計數有自己的測試），只看畫面照 failHowLine 顯示
    await ev(`(()=>{const g=TroyDebug.game;const q=g.guards.find(q=>q.active!==false&&Number.isFinite(q.x));if(q){g.player.x=q.x+1.2;g.player.z=q.z;}})()`); await sleep(500);   // 先走到衛兵旁（可能換區，換區會把次數歸零），再設次數
    const seed = () => ev(`(()=>{const g=TroyDebug.game,H=RissetRules.failHowFor(g.T);g.causeFails={zone:g.zone,n:Object.fromEntries(Object.keys(H).map(k=>[k,${n - 1}]))};return g.zone})()`);
    if (n > 1) { res['seedZone' + n] = await seed(); globalThis.__seed = seed; } else globalThis.__seed = null;
    await caught();
    res.how.push(await ev(`(()=>{const g=TroyDebug.game,fh=document.getElementById('failHint');return {n:${n},cause:g.failCause,level:g.failHowLevel,line:g.failHowLine,why:document.getElementById('failWhy').textContent,hintHidden:fh.hidden,hintText:fh.textContent,keys:[...fh.querySelectorAll('.k')].map(k=>k.textContent)}})()`));
    await shot('how-' + n + '-第' + n + '次');
    if (n < 3) { await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 }); await sleep(1200); }
  }
  res.howErrors = errs.slice(0, 5);
}
console.log(JSON.stringify(res, null, 1));
ws.close(); chrome.kill(); srv.close(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
