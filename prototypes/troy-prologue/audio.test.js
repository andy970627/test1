// 木馬之夜聲音層的純函式測試（Web Audio 本身在 Node 跑不起來，聲音實際輸出另用錄音工具量）。
// 木馬共鳴 C2：docs/design/2026-11-11-trojan-horse-directions.md 第 3 節。
const test = require('node:test');
const assert = require('node:assert');
const A = require('./audio.js');

const C = A.CONST;

test('木馬共鳴：貼著木馬時等於 HORSE_BOOM_GAIN', () => {
  assert.strictEqual(A.horseBoomGain(0), C.HORSE_BOOM_GAIN);
});

test('木馬共鳴：隨距離單調遞減（0～R 每 0.25 公尺取一點）', () => {
  let prev = Infinity;
  for (let d = 0; d <= C.HORSE_BOOM_R + 1e-9; d += 0.25) {
    const g = A.horseBoomGain(d);
    assert.ok(g <= prev, `d = ${d} 時音量 ${g} 比前一點 ${prev} 大`);
    assert.ok(g >= 0);
    prev = g;
  }
});

test('木馬共鳴：HORSE_BOOM_R 公尺外為 0，壞值也為 0', () => {
  for (const d of [C.HORSE_BOOM_R, C.HORSE_BOOM_R + 0.01, 30, 100, Infinity]) assert.strictEqual(A.horseBoomGain(d), 0, `d = ${d}`);
  for (const d of [NaN, -1, undefined, null]) assert.strictEqual(A.horseBoomGain(d), 0, `d = ${d}`);
});

test('木馬共鳴：R、G 可傳入覆寫（試驗場調常數用）', () => {
  assert.strictEqual(A.horseBoomGain(5, 10, 1), 0.25);
  assert.strictEqual(A.horseBoomGain(10, 10, 1), 0);
});

test('木馬腹中常數：低通 1200 Hz、四格里拉琴音往上', () => {
  assert.strictEqual(C.BELLY_LOWPASS_HZ, 1200);
  const ns = C.BELLY_STEP_NOTES;
  assert.strictEqual(ns.length, 4);
  for (let i = 1; i < ns.length; i++) assert.ok(ns[i] > ns[i - 1], '里拉琴音要往上');
});
