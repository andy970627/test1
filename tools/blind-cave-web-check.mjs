#!/usr/bin/env node
/* 雙盲洞穴・網頁一間房的自動檢查（11/20）。
 *
 *   node tools/blind-cave-web-check.mjs
 *
 * 一、Node 直接載入規則核心 cave.js：繞路走得到出口、直線走會吵醒巨人、撞牆只算一次。
 * 二、無頭 Chromium（--mute-audio，網址帶 mute=1，不出聲、不開視窗）：
 *   1. 鍵盤 W 真的會前進；2. 程式玩家繞路走到出口＝過關；3. 程式玩家直走撞巨人＝失敗；
 *   4. ?spectator=1 觀眾視窗收得到玩家視窗的狀態；5. ?debug=1 試驗場畫得出面板；6. 全程沒有主控台錯誤。
 * 伺服器是腳本自己開的隨機埠，一次只開一個瀏覽器，結束就關。
 * 需要 playwright（本機：NODE_PATH 指到 %LOCALAPPDATA%\test1-node-tools\node_modules）。
 * 退出碼：全過 0，否則 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(REPO, 'prototypes');
const req = createRequire(import.meta.url);
let fails = 0;
function check(name, ok, info) { console.log((ok ? '通過' : '失敗') + '｜' + name + (info ? '｜' + info : '')); if (!ok) fails++; }

// 安全路線（繞過巨人上方）與危險路線（直直走向巨人）
const SAFE = [[3, 6], [6, 4.5], [10, 4.3], [12.5, 4.6], [14, 5.6], [17, 4], [19.4, 3]];
const DANGER = [[4, 8], [11, 7]];

// ---------- 一、規則核心 ----------
const C = req(path.join(ROOT, 'blind-cave-web', 'cave.js'));
function bot(L, s, P, route, maxSteps = 4000) {
  let i = 0;
  for (let n = 0; n < maxSteps && s.phase === 'play'; n++) {
    const [tx, ty] = route[Math.min(i, route.length - 1)];
    const rel = C.wrap(Math.atan2(ty - s.y, tx - s.x) - s.a);
    C.step(L, s, { fwd: Math.abs(rel) < 0.5 ? 1 : 0, turn: Math.max(-1, Math.min(1, rel * 3)) }, 1 / 30, P);
    if (Math.hypot(tx - s.x, ty - s.y) < 0.4 && i < route.length - 1) i++;
  }
  return s;
}
{
  const L = C.LEVEL, P = C.defaultParams();
  let s = C.createState(L); s.phase = 'play'; bot(L, s, P, SAFE);
  check('規則：繞路走到出口', s.phase === 'win', `秒數 ${s.t.toFixed(1)}、撞牆 ${s.bumps}、離巨人最近 ${s.minGiant.toFixed(2)} m`);
  s = C.createState(L); s.phase = 'play'; bot(L, s, P, DANGER);
  check('規則：直走吵醒巨人', s.phase === 'fail', `離巨人最近 ${s.minGiant.toFixed(2)} m`);
  s = C.createState(L); s.phase = 'play';
  for (let n = 0; n < 300; n++) C.step(L, s, { strafe: -1 }, 1 / 30, P);   // 一直往左牆推
  check('規則：貼著牆推只算一次撞牆', s.bumps === 1, `撞牆 ${s.bumps}`);
  check('規則：背後的聲音比前面悶', C.toneCutoff(Math.PI, P) < 1500 && C.toneCutoff(0, P) > 15000);
  const d = C.LEVEL, line = [d.start.x, d.start.y, d.exit.x, d.exit.y];
  const t = ((d.giant.x - line[0]) * (line[2] - line[0]) + (d.giant.y - line[1]) * (line[3] - line[1])) / ((line[2] - line[0]) ** 2 + (line[3] - line[1]) ** 2);
  const px = line[0] + t * (line[2] - line[0]), py = line[1] + t * (line[3] - line[1]);
  check('關卡：起點直線到出口會經過巨人醒來圈', Math.hypot(px - d.giant.x, py - d.giant.y) < P.wake);
  const html = fs.readFileSync(path.join(ROOT, 'blind-cave-web', 'index.html'), 'utf8');
  check('旁白：不使用合成語音', !/speechSynthesis|SpeechSynthesisUtterance/.test(html));
}

// ---------- 二、瀏覽器 ----------
function loadPlaywright() {
  const tries = ['playwright', 'playwright-core', ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright')),
    path.join(process.env.LOCALAPPDATA || '', 'test1-node-tools', 'node_modules', 'playwright')];
  for (const t of tries) { try { return req(t); } catch (e) { /* 下一個 */ } }
  throw new Error('找不到 playwright（設定 NODE_PATH 或 npm i playwright）');
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const srv = http.createServer((rq, res) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/blind-cave-web/index.html`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext();
  const errors = [];
  const watch = (page, tag) => {
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(tag + '：' + m.text()); });
    page.on('pageerror', (e) => errors.push(tag + '：' + e.message));
  };
  const page = await ctx.newPage(); watch(page, '玩家');
  const spec = await ctx.newPage(); watch(spec, '觀眾');
  await spec.goto(BASE.replace('index.html', 'index.html?spectator=1&mute=1'));
  await page.goto(BASE + '?mute=1');
  await page.waitForFunction(() => !!window.__blindCave);

  // 1. 鍵盤
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__blindCave.state.phase === 'play');
  const y0 = await page.evaluate(() => window.__blindCave.state.y);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  const y1 = await page.evaluate(() => window.__blindCave.state.y);
  check('鍵盤：W 往前（朝北）走', y1 < y0 - 0.3, `y ${y0.toFixed(2)} → ${y1.toFixed(2)}`);
  const au = await page.evaluate(() => window.__blindCave.audio);
  check('聲音：mute=1 主音量 0', au && au.master === 0 && au.muted, JSON.stringify(au));

  // 2、3. 程式玩家
  const runRoute = (route) => page.evaluate((route) => {
    const B = window.__blindCave; B.setManual(true); B.start();
    let i = 0;
    for (let n = 0; n < 4000 && B.state.phase === 'play'; n++) {
      const s = B.state, [tx, ty] = route[Math.min(i, route.length - 1)];
      let rel = Math.atan2(ty - s.y, tx - s.x) - s.a; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
      B.step({ fwd: Math.abs(rel) < 0.5 ? 1 : 0, turn: Math.max(-1, Math.min(1, rel * 3)) }, 1 / 30);
      const s2 = B.state; if (Math.hypot(tx - s2.x, ty - s2.y) < 0.4 && i < route.length - 1) i++;
    }
    return { st: B.state, endShown: !document.getElementById('end').hidden, endText: document.getElementById('end').innerText, say: document.getElementById('say').innerText };
  }, route);
  const w = await runRoute(SAFE);
  check('瀏覽器：繞路走到出口過關', w.st.phase === 'win' && w.endShown && /秒/.test(w.endText) && /撞牆/.test(w.endText) && /離巨人最近/.test(w.endText), `秒數 ${w.st.t.toFixed(1)}、撞牆 ${w.st.bumps}、最近 ${w.st.minGiant.toFixed(2)} m`);
  check('瀏覽器：過關旁白（第三人稱）', /奧德修斯/.test(w.say), w.say);
  await page.waitForTimeout(300);
  const sv = await spec.evaluate(() => window.__blindCave.spectator);
  check('觀眾視窗收到玩家狀態', sv && sv.got > 0 && sv.last && sv.last.phase === 'win', sv ? `收到 ${sv.got} 則、最後狀態 ${sv.last && sv.last.phase}` : '沒有');
  const f = await runRoute(DANGER);
  check('瀏覽器：直走撞巨人失敗', f.st.phase === 'fail' && f.endShown, `離巨人最近 ${f.st.minGiant.toFixed(2)} m`);
  check('瀏覽器：失敗旁白（第三人稱）', /巨人/.test(f.say) && /奧德修斯/.test(f.say), f.say);
  const hist = await page.evaluate(() => window.__blindCave.history.slice(0, 2).map((h) => h.result));
  check('紀錄：最近兩局存進瀏覽器', hist[0] === 'fail' && hist[1] === 'win', hist.join(','));

  // 5. 試驗場
  await page.goto(BASE + '?debug=1&mute=1');
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const dbg = await page.evaluate(() => ({ mode: window.__blindCave.mode, live: (document.getElementById('live') || {}).innerText || '', knobs: document.querySelectorAll('#knobs input').length }));
  check('試驗場：面板有距離與常數', dbg.mode === 'debug' && /海風/.test(dbg.live) && /鼾聲/.test(dbg.live) && dbg.knobs >= 6, `滑桿 ${dbg.knobs} 個`);
  await page.close(); await spec.close();
  check('全程沒有主控台錯誤', errors.length === 0, errors.join('；'));
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `有 ${fails} 項失敗` : '全部通過');
process.exit(fails ? 1 : 0);
