#!/usr/bin/env node
/* 吟遊詩人敲桌的自動檢查（11/22）。
 *
 *   node tools/bard-table-check.mjs            規則＋瀏覽器
 *   node tools/bard-table-check.mjs --rules    只跑規則（記憶體不夠開瀏覽器時用）
 *   node tools/bard-table-check.mjs --shots <資料夾>   另存桌機與手機截圖
 *
 * 一、Node 直接載入 bard.js：拍點判定、障礙物、漏拍、錯拍、計分、譜面長度。
 * 二、無頭 Chromium（--mute-audio，網址帶 mute=1，不出聲、不開視窗）：
 *   空白鍵開始、程式玩家完成一局、敲到障礙有回饋、試驗場、桌機與手機寬度無橫捲、全程無頁面錯誤。
 * 伺服器是腳本自己開的隨機埠，一次只開一個瀏覽器，結束就關。
 * 需要 playwright（本機：%LOCALAPPDATA%\test1-node-tools\node_modules）。退出碼：全過 0，否則 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(REPO, 'prototypes');
const req = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const RULES_ONLY = argv.includes('--rules');
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
let fails = 0;
function check(name, ok, info) { console.log((ok ? '通過' : '失敗') + '｜' + name + (info ? '｜' + info : '')); if (!ok) fails++; }

// ---------- 一、規則 ----------
const B = req(path.join(ROOT, 'bard-table', 'bard.js'));
const Risset = req(path.join(ROOT, 'troy-prologue', 'risset.js'));
const firstOf = (g, kind) => g.cells.find((x) => x.kind === kind);
{
  const P = B.DEFAULTS;
  check('判定寬度沿用木馬之夜', P.perfect === Risset.T.STEP_WIN && P.good === Risset.T.CROUCH_STEP_WIN, `±${P.perfect * 1000}／±${P.good * 1000} ms`);
  let g = B.createGame(), w = g.cells[0];
  check('拍點：正中拍＝準', B.press(g, w.t).result.type === 'perfect');
  g = B.createGame(); w = g.cells[0];
  check('拍點：準的邊界內＝準', B.press(g, w.t + P.perfect - .001).result.type === 'perfect');
  g = B.createGame(); w = g.cells[0];
  check('拍點：超過準、在差一點內＝差一點', B.press(g, w.t - P.perfect - .01).result.type === 'good');
  g = B.createGame(); w = g.cells[1];
  let r = B.press(g, w.t - P.good - .02).result;
  check('拍點：窗外偏早＝太早', r.type === 'off' && r.side === 'early', r.type + '/' + r.side);
  g = B.createGame(); w = g.cells[1];
  r = B.press(g, w.t + P.good + .02).result;
  check('拍點：窗外偏晚＝太晚', r.type === 'off' && r.side === 'late', r.type + '/' + r.side);
  g = B.createGame(); w = g.cells[0]; B.press(g, w.t);
  check('拍點：同一拍敲兩下，第二下算錯拍', B.press(g, w.t + .02).result.type === 'off');
  g = B.createGame();
  check('開場數拍時敲不判定', B.press(g, .1).result.type === 'idle' && g.counts.off === 0);

  for (const kind of ['hand', 'food', 'cup']) {
    g = B.createGame(); const c = firstOf(g, kind); r = B.press(g, c.t).result;
    check(`障礙：拍上敲到${kind}＝失敗`, r.type === 'struck' && r.kind === kind && g.counts.struck[kind] === 1 && g.combo === 0);
    g = B.createGame(); const d = firstOf(g, kind); const ev = B.advance(g, d.t + P.good + .01);
    check(`障礙：${kind}忍住不敲＝成功`, d.res === 'dodge' && ev.some((e) => e.cell === d && e.type === 'dodge'));
  }
  g = B.createGame(); w = g.cells[0];
  const ev = B.advance(g, w.t + P.good + .01);
  check('字格該敲沒敲＝漏拍', w.res === 'miss' && ev[0].type === 'miss' && g.counts.miss === 1);

  const lens = B.CHART.map((s) => Array.from(s).length);
  const all = B.parseChart(B.CHART, B.sanitize({}));
  const dur = (P.lead + all.length + 1) * P.beat;
  check('譜面：每行 8 拍', lens.every((n) => n === 8), `${lens.length} 行、${all.length} 拍`);
  check('譜面：一局 1～2 分鐘', dur >= 60 && dur <= 120, dur.toFixed(1) + ' 秒');
  check('譜面：前兩行沒有障礙（先學敲）', all.filter((x) => x.line < 2).every((x) => x.kind === 'word'));
  check('譜面：三種障礙都出現', ['hand', 'food', 'cup'].every((k) => all.some((x) => x.kind === k)));

  const play = (act) => { const g2 = B.createGame(); g2.cells.forEach((x) => { const t = act(x); if (t != null) B.press(g2, t); }); B.advance(g2, g2.duration); return g2; };
  const best = play((x) => (x.kind === 'word' ? x.t : null));
  check('一局：照規則玩滿分且結束', B.accuracy(best) === 1 && best.phase === 'end' && B.verdict(1).rank === 3, `正確率 ${B.accuracy(best)}`);
  const mash = play((x) => x.t), idle = play(() => null);
  check('計分：每拍都敲（不看障礙）拿不到前兩級', B.verdict(B.accuracy(mash)).rank <= 1, `正確率 ${B.accuracy(mash).toFixed(2)}`);
  check('計分：完全不敲是最低級', B.verdict(B.accuracy(idle)).rank === 0, `正確率 ${B.accuracy(idle).toFixed(2)}`);
  const S = B.sanitize({ beat: .4, good: .5 });
  check('常數：判定窗不超過半拍', S.good <= .4 * .45 + 1e-9, `good ${S.good}`);
  const html = fs.readFileSync(path.join(ROOT, 'bard-table', 'index.html'), 'utf8');
  check('文字：沒有合成語音', !/speechSynthesis/.test(html));
}

if (RULES_ONLY) { console.log(fails ? `有 ${fails} 項失敗` : '規則全部通過'); process.exit(fails ? 1 : 0); }

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
const BASE = `http://127.0.0.1:${srv.address().port}/bard-table/index.html`;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(tag + '：' + m.text()); });
  page.on('pageerror', (e) => errors.push(tag + '：' + e.message));
};
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
// 把畫面停在第 i 格附近：manual 模式下用 advance 推時間
const parkAt = (page, i) => page.evaluate((i) => { const b = window.__bard, c = b.state.cells[i]; b.advance(c.t - .05); }, i);
const playAll = (page, strikeEvery) => page.evaluate((strikeEvery) => {
  const b = window.__bard; b.setManual(true); b.start();
  const g = b.state; let n = 0;
  g.cells.forEach((x) => { if (x.kind === 'word') b.press(x.t); else if (strikeEvery && ++n % strikeEvery === 0) b.press(x.t); else b.advance(x.t + g.P.good + .001); });
  b.advance(g.duration + .01);
  return { phase: b.phase, acc: b.rules.accuracy(g), end: !document.getElementById('end').hidden, text: document.getElementById('end').innerText, counts: g.counts, sfx: [...new Set(b.sfx)] };
}, strikeEvery);

try {
  for (const [tag, vp, touch] of [['桌機', { width: 1280, height: 720 }, false], ['手機', { width: 375, height: 812 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage(); watch(page, tag);
    await page.goto(BASE + '?mute=1');
    await page.waitForFunction(() => !!window.__bard);
    await page.waitForTimeout(250);
    check(`${tag}：開場無橫捲`, await noScroll(page));
    await shot(page, `${tag}-開場`);
    if (touch) await page.touchscreen.tap(180, 500); else await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__bard.phase === 'play');
    check(`${tag}：${touch ? '點畫面' : '空白鍵'}開始`, true);
    check(`${tag}：mute=1 主音量 0`, (await page.evaluate(() => window.__bard.audio())).master === 0);
    // 真實時鐘：不進 manual，照拍送出真的空白鍵事件，確認時鐘、輸入和判定接得起來
    const realtime = await page.evaluate(() => new Promise((done) => {
      const b = window.__bard, g = b.state, N = 6; let i = 0;
      (function tick() {
        if (i < N && b.clock() >= g.cells[i].t) { dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); i++; }
        if (i >= N) done({ hit: g.counts.perfect + g.counts.good, off: g.counts.off, miss: g.counts.miss });
        else setTimeout(tick, 2);
      })();
    }));
    check(`${tag}：真實時鐘照拍敲 6 下都判中`, realtime.hit === 6 && realtime.off === 0 && realtime.miss === 0, JSON.stringify(realtime));
    await page.evaluate(() => { const b = window.__bard; b.setManual(true); b.start(); });
    await parkAt(page, 49); await page.waitForTimeout(120);
    await shot(page, `${tag}-遊戲中`);
    await page.evaluate(() => { const b = window.__bard, c = b.state.cells.find((x) => x.i > 49 && x.kind !== 'word'); b.press(c.t); });
    await page.waitForTimeout(90);
    await shot(page, `${tag}-敲到東西`);
    check(`${tag}：遊戲中無橫捲`, await noScroll(page));
    const full = await playAll(page, 0);
    check(`${tag}：一局完成且滿分`, full.phase === 'end' && full.end && full.acc === 1, `正確率 ${full.acc}`);
    await page.waitForTimeout(100);
    await shot(page, `${tag}-結算`);
    check(`${tag}：結算無橫捲`, await noScroll(page));
    const bad = await playAll(page, 2);
    const st = bad.counts.struck;
    check(`${tag}：敲到障礙被扣分`, bad.acc < 1 && st.hand + st.food + st.cup > 0, `正確率 ${bad.acc.toFixed(2)}`);
    await page.evaluate(() => { const b = window.__bard; b.start(); const g = b.state; const w = g.cells.findIndex((x) => x.kind === 'word'); b.press(g.cells[w].t - g.P.good - .03); b.advance(g.cells[w + 1].t + g.P.good + .01); });
    const sfx = await page.evaluate(() => [...new Set(window.__bard.sfx)]);
    const need = ['perfect', 'dodge', 'hand', 'food', 'cup', 'off', 'miss'];
    check(`${tag}：準、忍住、手、食物、酒杯、錯拍、漏拍各有聲音`, need.every((n) => sfx.includes(n)), sfx.join(','));

    await page.goto(BASE + '?lab=1&mute=1');
    await page.waitForFunction(() => !!window.__bard);
    if (touch) await page.touchscreen.tap(180, 200); else await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__bard.phase === 'play');
    await page.waitForTimeout(350);
    const lab = await page.evaluate(() => ({ mode: window.__bard.mode, live: document.getElementById('live').innerText, knobs: document.querySelectorAll('#knobs input').length, cells: window.__bard.state.cells.length }));
    check(`${tag}：試驗場有判定數字與常數`, lab.mode === 'lab' && /判定/.test(lab.live) && lab.knobs === 4 && lab.cells === 16, `滑桿 ${lab.knobs}、固定 ${lab.cells} 拍`);
    await page.evaluate(() => { const i = document.querySelector('#knobs input[data-k="perfect"]'); i.value = 50; i.dispatchEvent(new Event('input', { bubbles: true })); });
    check(`${tag}：試驗場常數即時生效`, Math.abs(await page.evaluate(() => window.__bard.state.P.perfect) - .05) < 1e-9);
    check(`${tag}：試驗場無橫捲`, await noScroll(page));
    await shot(page, `${tag}-試驗場`);
    await ctx.close();
  }
  check('全程沒有頁面錯誤', errors.length === 0, errors.join('；'));
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `有 ${fails} 項失敗` : '全部通過');
process.exit(fails ? 1 : 0);
