// 開場跟拍校準（calibration.js）與規則的本局偏差（state.inputOffsetMs）測試
// 執行：node --test prototypes/troy-prologue/calibration.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./calibration.js');
const R = require('./risset.js');
const Bots = require('../../tools/telemetry/troy-bots.js');

// 拍點：每 0.5 秒一拍，從 1.0 秒起 12 拍（聲音層 calibClicks() 會回傳類似的陣列）
const BEATS = Array.from({ length: 12 }, (_, i) => 1 + i * 0.5);

test('estimate 正常：8 下都晚 40 毫秒上下 → offsetMs 約 40、ok、spreadMs 小', () => {
  const jit = [0, 5, -5, 3, -3, 8, -8, 0];
  const taps = jit.map((j, i) => BEATS[i + 2] + (40 + j) / 1000);
  const r = C.estimate(taps, BEATS);
  assert.equal(r.ok, true);
  assert.equal(r.used, 8);
  assert.equal(r.total, 8);
  assert.equal(r.offsetMs, 40);
  assert.equal(r.medianMs, 40);
  assert.ok(r.spreadMs > 0 && r.spreadMs <= 5, `spreadMs = ${r.spreadMs}`);
  // 偏早也一樣：每下早 60 毫秒 → −60
  const early = C.estimate(BEATS.slice(0, 6).map((b) => b - 0.06), BEATS);
  assert.equal(early.ok, true);
  assert.equal(early.offsetMs, -60);
  // 拍點順序打亂也照樣找最近的拍
  const shuffled = BEATS.slice().reverse();
  assert.deepEqual(C.estimate(taps, shuffled), r);
});

test('estimate 有離群值：|差| > 200 毫秒的剔除，不影響中位數', () => {
  const good = [30, 35, 40, 45, 50].map((d, i) => BEATS[i] + d / 1000);
  // 兩下離群：差 +230、−210 毫秒（拍距 0.5 秒，最近的拍還是同一拍）
  const bad = [BEATS[7] + 0.23, BEATS[9] - 0.21];
  const r = C.estimate(good.concat(bad), BEATS);
  assert.equal(r.total, 7);
  assert.equal(r.used, 5);
  assert.equal(r.ok, true);
  assert.equal(r.offsetMs, 40);
  // 剛好 200 毫秒還算有效
  assert.equal(C.estimate([BEATS[0] + 0.2], BEATS).used, 1);
  // 非數字、NaN、Infinity 不算進 total
  const r2 = C.estimate(good.concat([NaN, Infinity, 'x', null]), BEATS);
  assert.equal(r2.total, 5);
  assert.equal(r2.offsetMs, 40);
});

test('estimate 敲擊太少：有效 < 5 下 → ok 為 false、offsetMs 一律 0（畫面直接寫進去也不會亂偏）', () => {
  const r = C.estimate([0, 1, 2, 3].map((i) => BEATS[i] + 0.07), BEATS);
  assert.equal(r.ok, false);
  assert.equal(r.used, 4);
  assert.equal(r.offsetMs, 0);
  assert.equal(r.medianMs, 70, '沒夾的中位數照樣給，畫面可以顯示');
  // 5 下但其中 1 下是離群 → 有效 4 下，還是不夠
  const r2 = C.estimate([0, 1, 2, 3].map((i) => BEATS[i] + 0.07).concat([BEATS[5] + 0.24]), BEATS);
  assert.equal(r2.ok, false);
  assert.equal(r2.used, 4);
  // 空陣列、沒有拍點
  const e = C.estimate([], BEATS);
  assert.deepEqual(e, { offsetMs: 0, spreadMs: null, ok: false, used: 0, medianMs: null, total: 0 });
  const nb = C.estimate([1, 2, 3, 4, 5], []);
  assert.equal(nb.ok, false);
  assert.equal(nb.used, 0);
  assert.equal(C.estimate(undefined, undefined).ok, false);
});

test('estimate 超出上限：中位數 180 毫秒 → 夾到 150；−190 → −150', () => {
  const late = C.estimate(BEATS.slice(0, 6).map((b) => b + 0.18), BEATS);
  assert.equal(late.ok, true);
  assert.equal(late.medianMs, 180);
  assert.equal(late.offsetMs, 150);
  const early = C.estimate(BEATS.slice(0, 6).map((b) => b - 0.19), BEATS);
  assert.equal(early.offsetMs, -150);
  assert.equal(C.MAX_MS, 150);
  assert.equal(C.OUTLIER_MS, 200);
  assert.equal(C.MIN_TAPS, 5);
});

test('apply 與 inputOffsetSec：扣偏差、夾 ±150、非數字當 0', () => {
  assert.ok(Math.abs(C.apply(10, 40) - 9.96) < 1e-12);
  assert.ok(Math.abs(C.apply(10, 900) - 9.85) < 1e-12);
  assert.equal(C.apply(10, NaN), 10);
  assert.equal(C.apply(10, undefined), 10);
  assert.equal(R.inputOffsetSec({ inputOffsetMs: 0 }), 0);
  assert.equal(R.inputOffsetSec({}), 0);
  assert.equal(R.inputOffsetSec(null), 0);
  assert.equal(R.inputOffsetSec({ inputOffsetMs: '40' }), 0, '字串不算');
  assert.ok(Math.abs(R.inputOffsetSec({ inputOffsetMs: 40 }) - 0.04) < 1e-12);
  assert.equal(R.inputOffsetSec({ inputOffsetMs: 999 }), 0.15);
  assert.equal(R.inputOffsetSec({ inputOffsetMs: -999 }), -0.15);
});

// ---- 規則：本局偏差扣在按鍵時間上（以下輔助函式照 risset.test.js 的寫法） ----
const OLD = { COVER_MODE: false, MOVES_MODE: false };
const lvl = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({ DYNAMIC: false }, OLD, o.T || {}) }));
function solo(g, id, x, z, yaw) {
  let one = null;
  for (const q of g.guards) {
    if (q.id === id) { one = q; q.x = x; q.z = z; q.route = [{ x, z }]; q.wp = 0; q.baseYaw = yaw; q.yaw = yaw; q.susp = 0; }
    else { q.state = 'down'; q.active = false; }
  }
  return one;
}
const place = (g, x, z) => { g.player.x = x; g.player.z = z; };
function panicSetup(offsetMs) {
  const g = lvl({ startZone: 3 });
  if (offsetMs != null) g.inputOffsetMs = offsetMs;
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 24.2);
  g.step(3, {});
  g.step(3, { takedown: true });
  const a = g.bass.anchor;
  return { g, q, beats: [a, a + 2.4, a + 4.8, a + 7.2] };
}

test('state.inputOffsetMs 預設 0，只在這一局（新的一局又是 0）', () => {
  const g = lvl({ startZone: 3 });
  assert.equal(g.inputOffsetMs, 0);
  g.inputOffsetMs = 80;
  assert.equal(lvl({ startZone: 3 }).inputOffsetMs, 0);
});

test('安撫：按鍵晚 0.30 秒（超過 +0.20）本來偏了；偏差 +120 毫秒時判成晚 0.18 → 算對', () => {
  const a = panicSetup();
  a.g.step(a.beats[0] + 0.35, { calm: true, calmAt: a.beats[0] + 0.30 });
  assert.equal(a.q.state, 'hunted');
  const b = panicSetup(120);
  b.g.step(b.beats[0] + 0.35, { calm: true, calmAt: b.beats[0] + 0.30 });
  assert.equal(b.q.calm, 1);
  assert.ok(Math.abs(b.g.panic.lastPress - (b.beats[0] + 0.18)) < 1e-9, '間隔也用校正後的時間算');
  // 偏早：早 0.25 秒本來偏了；偏差 −120 毫秒時判成早 0.13 → 算對
  const c = panicSetup();
  c.g.step(c.beats[0], { calm: true, calmAt: c.beats[0] - 0.25 });
  assert.equal(c.q.state, 'hunted');
  const d = panicSetup(-120);
  d.g.step(d.beats[0], { calm: true, calmAt: d.beats[0] - 0.25 });
  assert.equal(d.q.calm, 1);
  // 偏差設錯也會害到：+150 時早 0.05 的按鍵判成早 0.20（超過 −0.15）→ 偏了
  const e = panicSetup(150);
  e.g.step(e.beats[0], { calm: true, calmAt: e.beats[0] - 0.05 });
  assert.equal(e.q.state, 'hunted');
});

test('沒有 calmAt 時用 actAt，同樣扣偏差；兩個都沒有（幀時間）不扣', () => {
  const a = panicSetup(120);
  a.g.step(a.beats[0] + 0.35, { calm: true, actAt: a.beats[0] + 0.30 });
  assert.equal(a.q.calm, 1);
  // 幀時間正好在拍上：偏差 +150 不影響（幀時間不扣）
  const b = panicSetup(150);
  b.g.step(b.beats[0], { calm: true });
  assert.equal(b.q.calm, 1);
});

test('暗殺：幀已出盲區（10.7），按鍵當下 10.65 也在盲區外本來失手；偏差 +100 毫秒判成 10.55（盲區內）→ 成功', () => {
  const mk = (off) => {
    const h = lvl({ startZone: 3 });
    if (off != null) h.inputOffsetMs = off;
    const q = solo(h, 'g3a', 38, 23, 0);
    place(h, 38, 24.2);
    h.step(10.5, {});
    h.step(10.7, { takedown: true, actAt: 10.65 });
    return q;
  };
  assert.equal(mk().state, 'suspicious');
  assert.equal(mk(100).state, 'down');
  // 偏差超過上限也只扣 150：+900 和 +150 一樣（判成 10.50，盲區內）
  assert.equal(mk(900).state, 'down');
  // 偏差往反方向（−100）→ 判成 10.75，還是失手
  assert.equal(mk(-100).state, 'suspicious');
});

test('偏差為 0 時，三張地圖的程式玩家帶 actAt＝幀時間跑，和不帶 actAt 逐局相同（各 20 局，500 局另用量測腳本比）', () => {
  const maps = [
    ['預設', R.buildLevel()],
    ['七段 ?map=final', R.resolveLevel(require('./level-troy-final.js'))],
    ['短版 ?map=demo', R.resolveLevel(require('./level-troy-demo.js'))],
  ];
  const runOne = (level, seed, withAct) => {
    const g = R.createLevel({ t0: (seed * 1.37) % 10, seed, level, T: { COVER_MODE: true } });
    if (withAct) g.inputOffsetMs = 0;
    const bot = Bots.makeBot(Object.assign({ cover: true, sigma: 0.12, seed }, Bots.forBotLevel(level)));
    let t = 2; g.step(t, {}); g.step(t, { start: true });
    const log = [];
    while ((g.phase === 'play' || g.phase === 'intro') && t < 300) {
      t += 1 / 60;
      const inp = bot(g);
      g.step(t, withAct ? Object.assign({}, inp, { actAt: t }) : inp);
      for (const e of g.drain()) log.push(e.type + ':' + e.a);
    }
    return JSON.stringify({ phase: g.phase, zone: g.zone, x: g.player.x, z: g.player.z, n: log.length, log: log.join(',') });
  };
  for (const [name, level] of maps) {
    for (let s = 1; s <= 20; s++) assert.equal(runOne(level, s, true), runOne(level, s, false), `${name} 第 ${s} 局`);
  }
});
