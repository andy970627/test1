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

  const full = B.createGame(), all = full.cells;
  check('譜面：每行 8 拍', all.length === B.CHART.length * 8, `${B.CHART.length} 行、${all.length} 拍`);
  check('譜面：一局 1～2 分鐘', full.duration >= 60 && full.duration <= 120, full.duration.toFixed(1) + ' 秒');
  check('譜面：前兩行沒有障礙（先學敲）', all.filter((x) => x.line < 2).every((x) => x.kind === 'word'));
  check('譜面：前七行沒有名字和會動的格子（先學基本）', all.filter((x) => x.line < 7).every((x) => x.kind !== 'name' && !x.to));
  check('譜面：手、食物、酒杯都出現', ['hand', 'food', 'cup'].every((k) => all.some((x) => x.kind === k)));
  check('譜面：有三次「奧德修斯」', full.names === 12);

  // 照當下格子的樣子決定敲不敲（會動的格子要先推時間才看得到變化）
  const play = (act) => {
    const g2 = B.createGame();
    for (const x of g2.cells) { if (g2.phase !== 'play') break; B.advance(g2, x.t - .001); if (act(x)) B.press(g2, x.t); }
    if (g2.phase === 'play') B.advance(g2, g2.duration);
    return g2;
  };
  const safe = play((x) => x.kind === 'word');
  check('一局：不唱名字也能滿分且結束', B.accuracy(safe) === 1 && safe.phase === 'end' && B.verdict(safe).rank === 3 && safe.counts.held === 12, `正確率 ${B.accuracy(safe)}`);
  const brave = play((x) => x.kind === 'word' || x.kind === 'name');
  check('禁忌之名：全唱零失誤撐得過且最高評價', !brave.thrown && B.verdict(brave).rank === 4 && B.score(brave) > B.score(safe), `怒氣 ${brave.anger.toFixed(1)}、分數 ${B.score(brave)} 對 ${B.score(safe)}`);
  let strikes = 0;
  const greedy = play((x) => x.kind === 'word' || x.kind === 'name' || (x.line >= 13 && x.kind !== 'name' && strikes++ < 3));
  check('禁忌之名：全唱又連敲到東西會被轟下桌', greedy.thrown && greedy.phase === 'end' && B.verdict(greedy).rank === 0, `怒氣 ${greedy.anger.toFixed(1)}`);
  const mash = play(() => true), idle = play(() => false);
  check('計分：每拍都敲會被轟下桌', mash.thrown && B.verdict(mash).rank === 0, `怒氣 ${mash.anger}`);
  check('計分：完全不敲是低評價', B.verdict(idle).rank <= 1 && !idle.thrown, `正確率 ${B.accuracy(idle).toFixed(2)}`);

  // 活的餐桌
  g = B.createGame(); const lift = g.cells.find((x) => x.to === 'word');
  check('活的餐桌：至少提前兩拍預告', lift.changeAt - lift.warnAt >= 2 * P.beat * P.finale - 1e-9 && lift.t - lift.changeAt > P.good);
  B.advance(g, lift.warnAt); check('活的餐桌：預告時格子還沒變', lift.warned && lift.kind === lift.from);
  B.advance(g, lift.changeAt); check('活的餐桌：東西移開後變成字', lift.kind === 'word');
  check('活的餐桌：移開後敲＝成功', B.press(g, lift.t).result.type === 'perfect');
  g = B.createGame(); const l2 = g.cells.find((x) => x.to === 'word'); B.advance(g, l2.t + P.good + .01);
  check('活的餐桌：移開後沒敲＝漏拍', l2.res === 'miss');
  g = B.createGame(); const drop = g.cells.find((x) => x.to === 'hoof');
  check('活的餐桌：牛蹄飛來前是字', drop.kind === 'word');
  B.advance(g, drop.changeAt);
  r = B.press(g, drop.t).result;
  check('活的餐桌：牛蹄落下後敲＝失敗', r.type === 'struck' && r.kind === 'hoof');
  g = B.createGame(); const d2 = g.cells.find((x) => x.to === 'hoof'); B.advance(g, d2.t + P.good + .01);
  check('活的餐桌：牛蹄落下後不敲＝忍住', d2.res === 'dodge');

  // 弓弦終章
  const gaps = all.slice(1).map((x, i) => x.t - all[i].t), rs = all.length - B.RAMP_LINES * 8;
  check('弓弦終章：終章前拍長固定', gaps.slice(0, rs - 1).every((x) => Math.abs(x - P.beat) < 1e-9));
  check('弓弦終章：終章一路變快', gaps.slice(rs).every((x, i, a) => i === 0 || x < a[i - 1]), `最快一拍 ${gaps.at(-1).toFixed(3)} 秒`);
  check('弓弦終章：最快時判定窗不重疊', P.good * 2 < gaps.at(-1), `±${P.good} 對一拍 ${gaps.at(-1).toFixed(3)}`);
  g = B.createGame(); const last = g.cells.at(-1);
  check('弓弦終章：變速時仍判定到正確的格子', B.press(g, last.t + .01).result.cell === last);
  const S = B.sanitize({ beat: .4, good: .5 });
  check('常數：判定窗不超過最快一拍的 45%', S.good <= .4 * S.finale * .45 + 1e-9, `good ${S.good}`);
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
  g.cells.forEach((x) => {
    if (b.phase !== 'play') return;
    b.advance(x.t - .001);
    if (b.phase !== 'play') return;
    if (x.kind === 'word' || x.kind === 'name') b.press(x.t);
    else if (strikeEvery && ++n % strikeEvery === 0) b.press(x.t);
    else b.advance(x.t + g.P.good + .001);
  });
  if (b.phase === 'play') b.advance(g.duration + .01);
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
    const countdown = await page.evaluate(() => { const g = window.__bard.state; return Math.min(g.P.lead, Math.ceil(-window.__bard.rules.posAt(g, -.12))); });
    check(`${tag}：開場倒數不超過設定拍數`, countdown === 4, String(countdown));
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
    await parkAt(page, 59); await page.waitForTimeout(120);
    await shot(page, `${tag}-禁忌之名`);
    await page.evaluate(() => { const b = window.__bard, c = b.state.cells.find((x) => x.i > 59 && ['hand', 'food', 'cup'].includes(x.kind)); b.press(c.t); });
    await page.waitForTimeout(90);
    await shot(page, `${tag}-敲到東西`);
    await page.evaluate(() => { const b = window.__bard, d = b.state.cells.find((x) => x.to === 'hoof'); b.advance((d.warnAt + d.changeAt) / 2); });
    await page.waitForTimeout(120);
    await shot(page, `${tag}-牛蹄飛來`);
    await parkAt(page, 124); await page.waitForTimeout(120);
    await shot(page, `${tag}-終章`);
    check(`${tag}：遊戲中無橫捲`, await noScroll(page));
    const full = await playAll(page, 0);
    check(`${tag}：一局完成且滿分`, full.phase === 'end' && full.end && full.acc === 1, `正確率 ${full.acc}`);
    await page.waitForTimeout(100);
    await shot(page, `${tag}-結算`);
    check(`${tag}：結算無橫捲`, await noScroll(page));
    const bad = await playAll(page, 2);
    const st = bad.counts.struck;
    check(`${tag}：敲到障礙被扣分`, bad.acc < 1 && st.hand + st.food + st.cup > 0, `正確率 ${bad.acc.toFixed(2)}`);
    await page.evaluate(() => {
      const b = window.__bard; b.start(); let g = b.state;
      const w = g.cells.findIndex((x) => x.kind === 'word'); b.press(g.cells[w].t - g.P.good - .03); b.advance(g.cells[w + 1].t + g.P.good + .01);
      b.start(); g = b.state; const d = g.cells.find((x) => x.to === 'hoof'); b.advance(d.changeAt); b.press(d.t);     // 牛蹄
      b.start(); g = b.state; b.advance(g.cells.find((x) => x.kind === 'name').t + g.P.good + .01);                     // 不唱
    });
    const sfx = await page.evaluate(() => [...new Set(window.__bard.sfx)]);
    const need = ['perfect', 'dodge', 'hand', 'food', 'cup', 'hoof', 'off', 'miss', 'sung', 'held', 'warn', 'change', 'arrow', 'thrown'];
    check(`${tag}：每種判定與事件都有自己的聲音`, need.every((n) => sfx.includes(n)), need.filter((n) => !sfx.includes(n)).join(',') || `${need.length} 種`);
    const endUi = await page.evaluate(() => { const b = window.__bard; b.start(); const g = b.state, c = g.cells.find((x) => x.kind === 'hand'); g.anger = 95; b.advance(c.t - .001); b.press(c.t); return { phase: b.phase, thrown: g.thrown, title: document.getElementById('endTitle').textContent, shown: !document.getElementById('end').hidden }; });
    check(`${tag}：怒氣滿立刻出現被轟下桌結算`, endUi.phase === 'end' && endUi.thrown && endUi.shown && endUi.title === '被轟下桌', endUi.title);

    await page.goto(BASE + '?lab=1&mute=1');
    await page.waitForFunction(() => !!window.__bard);
    if (touch) await page.touchscreen.tap(180, 200); else await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__bard.phase === 'play');
    await page.waitForTimeout(350);
    const lab = await page.evaluate(() => ({ mode: window.__bard.mode, live: document.getElementById('live').innerText, knobs: document.querySelectorAll('#knobs input').length, cells: window.__bard.state.cells.length }));
    check(`${tag}：試驗場有判定數字與常數`, lab.mode === 'lab' && /判定/.test(lab.live) && /怒氣/.test(lab.live) && lab.knobs === 6 && lab.cells === 16, `滑桿 ${lab.knobs}、固定 ${lab.cells} 拍`);
    const scenes = await page.evaluate(() => Object.keys(window.__bard.rules.LAB_SCENES).map((k) => { const g = window.__bard.setScene(k); return { k, names: g.names, moving: g.cells.filter((x) => x.to).length, ramp: g.P.ramp }; }));
    const sc = Object.fromEntries(scenes.map((x) => [x.k, x]));
    check(`${tag}：試驗場可單獨開每個機制`, sc.name.names > 0 && sc.live.moving > 0 && sc.finale.ramp > 0 && sc.basic.names === 0, scenes.map((x) => x.k).join('、'));
    await page.evaluate(() => window.__bard.setScene('basic'));
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
