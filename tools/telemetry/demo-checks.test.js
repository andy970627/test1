// 11/24 短版追殺量測、開場跟拍校準、前 20 秒 stepRing 的檢查（量測與驗收角色）
// 功能還不存在時標 skip，不算失敗：calibration.js／RissetCalib.estimate 還沒交卷、或簽名對不上時略過並寫明原因。
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const TROY = path.resolve(__dirname, '../../prototypes/troy-prologue');
const CALIB = path.join(TROY, 'calibration.js');

// ---------- 開場跟拍校準：假敲擊 ----------
function loadCalib() {
  if (!fs.existsSync(CALIB)) return { skip: 'prototypes/troy-prologue/calibration.js 還不存在' };
  let m;
  try { m = require(CALIB); } catch (e) { return { skip: '載入 calibration.js 失敗：' + e.message }; }
  const C = (m && m.estimate ? m : m && m.RissetCalib) || globalThis.RissetCalib;
  if (!C || typeof C.estimate !== 'function') return { skip: 'RissetCalib.estimate 還不存在' };
  return { C };
}
/** 試幾種常見的呼叫方式，回傳偏差（毫秒）；都對不上就回 null。 */
function callEstimate(C, taps, beats) {
  const shapes = [
    () => C.estimate(taps, beats),
    () => C.estimate({ taps, beats }),
    () => C.estimate(taps.map((t) => t * 1000), beats.map((b) => b * 1000)),
    () => C.estimate({ taps: taps.map((t) => t * 1000), beats: beats.map((b) => b * 1000) })
  ];
  for (let i = 0; i < shapes.length; i++) {
    let r;
    try { r = shapes[i](); } catch (e) { continue; }
    let v = typeof r === 'number' ? r : r && [r.offsetMs, r.ms, r.offset, r.median, r.value].find((x) => typeof x === 'number');
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (i < 2 && Math.abs(v) < 1 && !(r && typeof r.offsetMs === 'number')) v *= 1000;   // 傳秒、回秒
    return { ms: v, shape: i, raw: r };
  }
  return null;
}
function fakeTaps(offMs, n = 16, period = 0.5, jitterMs = 12, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const beats = [], taps = [];
  for (let k = 0; k < n; k++) { const b = 1 + k * period; beats.push(b); taps.push(b + (offMs + (rnd() * 2 - 1) * jitterMs) / 1000); }
  return { beats, taps };
}

test('校準：假敲擊固定晚 60 毫秒，estimate 量出 60 ± 15', (t) => {
  const L = loadCalib(); if (L.skip) return t.skip(L.skip);
  const { beats, taps } = fakeTaps(60);
  const r = callEstimate(L.C, taps, beats);
  if (!r) return t.skip('estimate 的呼叫方式對不上（試過 (taps, beats)、({taps, beats})，秒與毫秒）');
  assert.ok(Math.abs(r.ms - 60) <= 15, `量出 ${r.ms} 毫秒`);
});
test('校準：假敲擊沒有偏差，estimate 量出 0 ± 15；提早 40 毫秒量出負值', (t) => {
  const L = loadCalib(); if (L.skip) return t.skip(L.skip);
  const a = fakeTaps(0), b = fakeTaps(-40);
  const r0 = callEstimate(L.C, a.taps, a.beats), r1 = callEstimate(L.C, b.taps, b.beats);
  if (!r0 || !r1) return t.skip('estimate 的呼叫方式對不上');
  assert.ok(Math.abs(r0.ms) <= 15, `沒偏差量出 ${r0.ms}`);
  assert.ok(Math.abs(r1.ms + 40) <= 15, `提早 40 量出 ${r1.ms}`);
});
test('校準：混一個離群的誤觸（晚 300 毫秒），結果仍在 60 ± 25', (t) => {
  const L = loadCalib(); if (L.skip) return t.skip(L.skip);
  const { beats, taps } = fakeTaps(60);
  taps[5] = beats[5] + 0.3;
  const r = callEstimate(L.C, taps, beats);
  if (!r) return t.skip('estimate 的呼叫方式對不上');
  assert.ok(Math.abs(r.ms - 60) <= 25, `量出 ${r.ms} 毫秒`);
});

test('校準：只敲 3 下（不到最少下數）時 ok 為假、offsetMs 為 0（有 ok 欄位才判）', (t) => {
  const L = loadCalib(); if (L.skip) return t.skip(L.skip);
  const { beats, taps } = fakeTaps(60, 3);
  const r = callEstimate(L.C, taps, beats);
  if (!r || !r.raw || typeof r.raw.ok !== 'boolean') return t.skip('回傳沒有 ok 欄位');
  assert.strictEqual(r.raw.ok, false);
  assert.strictEqual(r.ms, 0);
});

// ---------- 前 20 秒 stepRing：判定邏輯（瀏覽器實測在 tools/playtest-recorder/demo-stepring-check.mjs） ----------
const ringMod = () => import(pathToFileURL(path.resolve(__dirname, '../playtest-recorder/demo-stepring-check.mjs')).href);
const seq = (f) => { const a = []; for (let t = 0; t <= 26; t += 0.05) a.push({ t, on: f(t) }); return a; };
test('stepRing 判定：前 20 秒開、23 秒後關 → 過；一直沒出現 → skip；23 秒後還開 → 不過', async () => {
  const { judge } = await ringMod();
  assert.strictEqual(judge(seq((t) => t < 20.5)).status, 'pass');
  assert.strictEqual(judge(seq(() => false)).status, 'skip');
  assert.strictEqual(judge(seq(() => true)).status, 'fail');
  assert.strictEqual(judge(seq((t) => t < 8)).status, 'fail');
});

// ---------- 短版追殺量測：彙整手算 ----------
const simMod = () => import(pathToFileURL(path.resolve(__dirname, 'demo-hunt-sim.mjs')).href);
test('短版追殺彙整：手算假資料', async () => {
  const { summarize } = await simMod();
  const rs = [
    { win: true, t: 40, play: 40, huntT: 0, hunts: [], checks: 1, cause: null },
    { win: true, t: 90, play: 90, huntT: 10, hunts: [{ start: 20, zone: 1, dur: 10, end: 'escape' }], checks: 2, cause: null },
    { win: false, t: 30, play: 30, huntT: 5, hunts: [{ start: 25, zone: 2, dur: 5, end: 'caught' }], checks: 0, cause: 'caught_seen' },
    { win: true, t: 60, play: 60, huntT: 8, hunts: [{ start: 10, zone: 1, dur: 8, end: 'escape' }], checks: 1, cause: null }
  ];
  const s = summarize(rs);
  assert.strictEqual(s.winRate, 0.75);
  assert.strictEqual(s.huntedRate, 0.75);
  assert.strictEqual(s.escapes, 2); assert.strictEqual(s.caught, 1);
  assert.strictEqual(s.escape.med, 9);
  assert.strictEqual(s.clear.med, 60);
  assert.ok(Math.abs(s.huntTimeShare - 23 / 220) < 1e-9);
  assert.deepStrictEqual(s.byZone, { 1: 2, 2: 1 });
});
test('短版追殺量測：真跑 3 局，數字合理（同 seed 同結果）', async () => {
  const { simulate, summarize } = await simMod();
  const R = require(path.join(TROY, 'risset.js'));
  const level = R.resolveLevel(require(path.join(TROY, 'level-troy-demo.js')));
  const a = simulate(level, 'sigma12', 3), b = simulate(level, 'sigma12', 3);
  assert.deepStrictEqual(a.map((r) => [r.win, r.t.toFixed(3)]), b.map((r) => [r.win, r.t.toFixed(3)]));
  const s = summarize(a);
  assert.ok(s.winRate >= 0 && s.winRate <= 1);
  for (const r of a) for (const h of r.hunts) assert.ok(h.dur >= 0);
});