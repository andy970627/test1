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

test('C3 結尾：同伴落地時間和畫面的 CIN_FALL、CIN_GAP、CIN_N 同值（落地聲才對得上）', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const m = html.match(/CIN_GAP\s*=\s*([\d.]+)\s*,\s*CIN_FALL\s*=\s*([\d.]+)[^;]*CIN_N\s*=\s*(\d+)/);
  assert.ok(m, 'index.html 找不到 CIN_GAP／CIN_FALL／CIN_N');
  assert.strictEqual(C.HORSE_LAND_GAP, +m[1]);
  assert.strictEqual(C.HORSE_LAND_FALL, +m[2]);
  assert.strictEqual(C.HORSE_LAND_N, +m[3]);
});

test('C3 結尾的共鳴不超過錄音驗過的貼近音量（2.5 m，那時共鳴峰值比重合擊低 1.7 dB；守「共鳴不比重擊響」）', () => {
  assert.ok(A.horseBoomGain(C.HORSE_SIGNAL_REF_M) <= A.horseBoomGain(2.5));
  assert.ok(C.HORSE_SIGNAL_REF_M > 0);
});

// 搭配動作（MOVES_MODE）：docs/design/2026-11-11-companion-mechanics.md 第 7.3 節
test('屏息聽：鼓聲退 6 dB、放開後 0.3 秒內回到 99%（回復時間常數 × 5 ≤ 0.3）', () => {
  assert.strictEqual(C.LISTEN_DUCK_DB, 6);
  assert.ok(C.LISTEN_RELEASE * 5 <= 0.3 + 1e-9);
  assert.ok(C.LISTEN_WIDEN >= 1);
});

test('蹲走：腳步比站著輕（音量倍數 ≤ 0.5），衛兵吸氣的距離和規則 CROUCH_R 同值', () => {
  assert.ok(C.CROUCH_STEP_MUL > 0 && C.CROUCH_STEP_MUL <= 0.5);
  const R = require('./risset.js');
  assert.strictEqual(C.CROUCH_STARTLE_R, R.T.CROUCH_R);
});

test('跑：被蓋住的那一步比沒被蓋住的輕很多（≤ −15 dB），沒被蓋住的比走路的清楚腳步重', () => {
  const loud = C.RUN_LOUD_MUL * C.STEP_LOUD_GAIN;
  assert.ok(20 * Math.log10(C.RUN_MASKED_GAIN / loud) <= -15);
  assert.ok(C.RUN_LOUD_MUL > 1);
});

// 查看與追殺重做（MOVES_MODE）：docs/design/2026-11-11-companion-mechanics.md 第 12、13 節
test('查看／追殺中的衛兵比巡邏的更清楚，巡邏的也比開關關著時大', () => {
  assert.ok(C.MOVES_GUARD_STEP_ALERT_MUL > C.MOVES_GUARD_STEP_MUL && C.MOVES_GUARD_STEP_MUL >= 1);
  assert.ok(C.MOVES_VOICE_ALERT_MUL > C.MOVES_VOICE_MUL && C.MOVES_VOICE_MUL >= 1);
});

test('慢低音只當氣氛：查看中的衛兵貼近時比平時重，但不超過 1', () => {
  assert.ok(C.CHECK_BASS_MAX > C.BASS_BASE && C.CHECK_BASS_MAX <= 1);
  assert.ok(C.CHECK_BASS_R > 0);
});
