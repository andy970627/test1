#!/usr/bin/env node
/* 短展示版前 20 秒「下一步什麼時候」小圈（#stepRing）檢查（11/24）
 *
 *   node tools/playtest-recorder/demo-stepring-check.mjs [--root prototypes] [--on 20] [--off 23] [--until 26] [--json 結果.json]
 *
 * 開 troy-prologue/index.html?map=demo&mute=1&nolock=1（瀏覽器 --mute-audio、無頭），開場字卡按空白進入遊玩，之後不再輸入（玩家站在起點）。
 * 每幀記 {遊玩秒數（game.time − 進入遊玩那一刻）, #stepRing 是否顯示}。
 *   通過：1～(on−1) 秒的取樣有 ≥ 90% 顯示，且 off～until 秒的取樣全部隱藏。
 *   略過（skip，退出碼 0）：前 on 秒一次都沒顯示（功能還沒接上）、頁面沒有 #stepRing、找不到 playwright。
 *   失敗：出現過但不符合上面的條件（退出碼 1）；執行出錯（退出碼 2）。
 * 只讀 DOM 與 TroyDebug.game，不改遊戲狀態。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(REPO, opt('root', 'prototypes')), ON = +opt('on', 20), OFF = +opt('off', 23), UNTIL = +opt('until', 26);
const req = createRequire(import.meta.url);
function pw() {
  for (const t of ['playwright', ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright'))]) { try { return req(t); } catch (e) { /* 下一個 */ } }
  return null;
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

/** 純判定（測試也用）：samples＝[{t, on}]。回傳 {status: 'pass'|'fail'|'skip', why, early, late}。 */
export function judge(samples, on = ON, off = OFF, until = UNTIL) {
  const first = samples.filter((s) => s.t >= 0 && s.t < on);
  if (!first.some((s) => s.on)) return { status: 'skip', why: `前 ${on} 秒一次都沒顯示（功能還沒接上）`, early: 0, late: null };
  const e = samples.filter((s) => s.t >= 1 && s.t <= on - 1), l = samples.filter((s) => s.t >= off && s.t <= until);
  const early = e.length ? e.filter((s) => s.on).length / e.length : 0, lateOn = l.filter((s) => s.on).length;
  if (!e.length || !l.length) return { status: 'fail', why: `取樣不足（前段 ${e.length}、後段 ${l.length}）`, early, late: lateOn };
  if (early < 0.9) return { status: 'fail', why: `1～${on - 1} 秒只有 ${(early * 100).toFixed(0)}% 顯示`, early, late: lateOn };
  if (lateOn) return { status: 'fail', why: `${off}～${until} 秒還有 ${lateOn}／${l.length} 個取樣顯示`, early, late: lateOn };
  const lastOn = Math.max(...samples.filter((s) => s.on).map((s) => s.t));
  return { status: 'pass', why: `1～${on - 1} 秒 ${(early * 100).toFixed(0)}% 顯示；最後一次顯示在 ${lastOn.toFixed(1)} 秒；${off}～${until} 秒全部隱藏`, early, late: 0 };
}

async function main() {
  const P = pw();
  if (!P) { console.log('skip：找不到 playwright（設定 NODE_PATH）'); return 0; }
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await P.chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let res, errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await page.goto(base + 'troy-prologue/index.html?map=demo&mute=1&nolock=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TroyDebug && window.RissetRules, null, { timeout: 30000 });
    const has = await page.evaluate(() => !!document.getElementById('stepRing'));
    if (!has) { console.log('skip：頁面沒有 #stepRing'); return 0; }
    await page.evaluate(({ until }) => {
      const S = window.__ring = { s: [], t0: null, done: false, lastTap: 0 };
      const story = () => { const e = document.getElementById('story'); return e && !e.hidden; };
      const tap = () => { for (const ty of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(ty, { code: 'Space', key: ' ', bubbles: true })); };
      (function f() {
        if (S.done) return; requestAnimationFrame(f);
        const g = window.TroyDebug.game, now = performance.now();
        if (story() || !g || g.phase !== 'play') { if (S.t0 == null && now - S.lastTap > 800 && (story() || (g && g.phase === 'intro'))) { S.lastTap = now; tap(); } return; }
        if (S.t0 == null) S.t0 = g.time;
        const t = g.time - S.t0, el = document.getElementById('stepRing');
        S.s.push({ t: +t.toFixed(3), on: !!el && !el.hidden && getComputedStyle(el).display !== 'none' });
        if (t > until) S.done = true;
      })();
    }, { until: UNTIL });
    await page.waitForFunction(() => window.__ring.done, null, { timeout: (UNTIL + 60) * 1000, polling: 500 });
    const samples = await page.evaluate(() => window.__ring.s);
    res = Object.assign(judge(samples), { n: samples.length, errors });
  } finally { await browser.close(); srv.close(); }
  console.log(`${res.status}：${res.why}（取樣 ${res.n} 幀；頁面例外 ${errors.length}）`);
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(res, null, 1));
  return res.status === 'fail' ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack || e.message); process.exitCode = 2; });