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

// 新鼓聲（鼓聲換皮）：docs/design/2026-11-11-illusion-not-heard.md 第 13.3 節第一步
test('新鼓聲：規則認定踩得上的拍（規則音量 ≥ MASK_GAIN），在新聲音裡都 ≥ 最大聲那條的 0.4 倍（巡邏 4 層、追殺 5 層，掃整圈）', () => {
  const R = require('./risset.js');
  for (const hunted of [false, true]) {
    const nL = R.layerCount(hunted, R.T);
    let n = 0, worst = Infinity;
    for (let i = 0; i < 1000; i++) {
      const p = i / 1000, g = A.newDrumGains(p, nL, (k, pp) => R.layerGain(k, pp, hunted, R.T)), mx = Math.max(...g);
      for (let k = 0; k < nL; k++) {
        if (R.layerGain(k, p, hunted, R.T) < R.T.MASK_GAIN) continue;
        n++; worst = Math.min(worst, g[k + 1] / mx);
        assert.ok(g[k + 1] >= 0.4 * mx, `hunted=${hunted} p=${p} 規則第 ${k} 層：新聲音 ${g[k + 1].toFixed(3)} < 0.4 × ${mx.toFixed(3)}`);
      }
    }
    assert.ok(n > 0 && worst >= 0.4);
  }
});

test('新鼓聲：最慢那條進場、最快那條退場時 ≤ −40 dB（接縫淡到零），總和和規則一樣', () => {
  const R = require('./risset.js');
  for (const hunted of [false, true]) {
    const nL = R.layerCount(hunted, R.T), rg = (k, pp) => R.layerGain(k, pp, hunted, R.T);
    const g0 = A.newDrumGains(0, nL, rg), g1 = A.newDrumGains(1 - 1e-9, nL, rg);
    assert.ok(g0[0] / Math.max(...g0) <= 0.01, `進場 ${g0[0] / Math.max(...g0)}`);
    assert.ok(g1[nL + 1] / Math.max(...g1) <= 0.01, `退場 ${g1[nL + 1] / Math.max(...g1)}`);
    for (const p of [0, 0.3, 0.77]) {
      const s = A.newDrumGains(p, nL, rg).reduce((a, b) => a + b, 0); let sr = 0; for (let k = 0; k < nL; k++) sr += rg(k, p);
      assert.ok(Math.abs(s - sr * C.DN_SCALE) < 1e-9);
    }
  }
});

// 弓弦最小原型（docs/design/2026-11-14-style-and-input-ideas.md 第 1.1、1.3 節）
test('弓弦：張力 0 起、BOW_FULL 秒拉滿、之後維持 1，中間單調上升', () => {
  assert.strictEqual(A.bowTension(0), 0);
  assert.strictEqual(A.bowTension(-1), 0);
  assert.strictEqual(A.bowTension(C.BOW_FULL), 1);
  assert.strictEqual(A.bowTension(C.BOW_FULL * 3), 1);
  let prev = -1;
  for (let t = 0; t <= C.BOW_FULL + 1e-9; t += C.BOW_FULL / 40) { const u = A.bowTension(t); assert.ok(u >= prev, `t = ${t}`); prev = u; }
  assert.ok(A.bowTension(C.BOW_FULL / 2) > 0.5, '一開始升得快、快滿時變慢');
});

test('弓弦：上升音從 BOW_F0 到 BOW_F1、依張力等比例，壞值夾住', () => {
  assert.strictEqual(A.bowPitch(0), C.BOW_F0);
  assert.strictEqual(A.bowPitch(1), C.BOW_F1);
  assert.ok(Math.abs(A.bowPitch(0.5) - Math.sqrt(C.BOW_F0 * C.BOW_F1)) < 1e-9);
  assert.strictEqual(A.bowPitch(2), C.BOW_F1);
  assert.strictEqual(A.bowPitch(NaN), C.BOW_F0);
  assert.ok(C.BOW_CREAK_AFTER > 0 && C.BOW_PLUCK_HZ > 0);
});

// 敲暗號：同伴回應的距離衰減（agent-notes/view.md 11/14，?lab=horse）
test('敲暗號回應：貼著木馬等於 KNOCK_REPLY_GAIN、單調遞減、R 公尺外 0', () => {
  assert.strictEqual(A.knockReplyGain(0), C.KNOCK_REPLY_GAIN);
  let prev = Infinity;
  for (let d = 0; d <= C.KNOCK_REPLY_R + 1e-9; d += 0.5) { const g = A.knockReplyGain(d); assert.ok(g <= prev && g >= 0, `d = ${d}`); prev = g; }
  for (const d of [C.KNOCK_REPLY_R, C.KNOCK_REPLY_R + 1, Infinity]) assert.strictEqual(A.knockReplyGain(d), 0, `d = ${d}`);
  assert.strictEqual(A.knockReplyGain(null), C.KNOCK_REPLY_GAIN, '距離不知道：當貼著');
  assert.strictEqual(A.knockReplyGain(5, 10, 1), 0.5);
  assert.strictEqual(C.KNOCK_REPLY_R, 20, '和試驗場「20 公尺外同伴聽不到」同一個數');
});

// 催促 DRIVE（設計 2026-11-12-free-hit-schedule 第 13.2 節；試聽頁 H0～H4）
test('催促 DRIVE：0 時前 nL + 2 條和現行新鼓聲完全相同、多的三條是 0', () => {
  const R = require('./risset.js'), K = Object.assign({}, R.T, { RISSET_M: 7 }), rg = (k, pp) => R.layerGain(k, pp, false, K);
  for (const p of [0, 0.13, 0.5, 0.87]) {
    const a = A.driveDrumGains(p, 4, rg, 0, K.MASK_GAIN).g, b = A.newDrumGains(p, 4, rg);
    for (let j = 0; j < 6; j++) assert.ok(Math.abs(a[j] - b[j]) < 1e-12, `p=${p} j=${j}`);
    assert.deepStrictEqual(a.slice(6), [0, 0, 0]);
  }
});

test('催促 DRIVE：0～1 時踩得上的拍音量不動、都 ≥ 最大聲那條 0.4 倍；1 時最大聲那條快約四倍；最上面那條淡到零', () => {
  const R = require('./risset.js'), K = Object.assign({}, R.T, { RISSET_M: 7 }), rg = (k, pp) => R.layerGain(k, pp, false, K);
  for (const d of [0, 0.25, 0.5, 0.75, 1]) {
    let pos = 0;
    for (let i = 0; i < 1000; i++) {
      const p = i / 1000, g = A.driveDrumGains(p, 4, rg, d, K.MASK_GAIN).g, base = A.newDrumGains(p, 4, rg), mx = Math.max(...g);
      pos += g.indexOf(mx) + p;
      for (let k = 0; k < 4; k++) {
        if (rg(k, p) < K.MASK_GAIN) continue;
        assert.ok(Math.abs(g[k + 1] - base[k + 1]) < 1e-12, `d=${d} p=${p} 第 ${k} 層被動到`);
        assert.ok(g[k + 1] >= 0.4 * mx, `d=${d} p=${p} 第 ${k} 層 ${g[k + 1].toFixed(3)} < 0.4 × ${mx.toFixed(3)}`);
      }
    }
    if (d === 1) assert.ok(pos / 1000 > 4.8, `最大聲平均位置 ${pos / 1000}（現行約 3，多 2 層＝快四倍）`);
    const top = A.driveDrumGains(1 - 1e-9, 4, rg, d, K.MASK_GAIN).g;
    assert.ok(top[8] <= 0.01 * Math.max(...top), `d=${d} 最上面那條退場 ${top[8]}`);
  }
});

test('催促 DRIVE：追殺時（規則 5 層）也照樣疊，踩得上的拍不動、≥ 最大聲 0.4 倍', () => {
  const R = require('./risset.js'), K = Object.assign({}, R.T, { RISSET_M: 7 }), nL = R.layerCount(true, K), rg = (k, pp) => R.layerGain(k, pp, true, K);
  for (const d of [0.3, 0.6, 1]) for (let i = 0; i < 500; i++) {
    const p = i / 500, g = A.driveDrumGains(p, nL, rg, d, K.MASK_GAIN).g, base = A.newDrumGains(p, nL, rg), mx = Math.max(...g);
    assert.strictEqual(g.length, nL + 5);
    for (let k = 0; k < nL; k++) {
      if (rg(k, p) < K.MASK_GAIN) continue;
      assert.ok(Math.abs(g[k + 1] - base[k + 1]) < 1e-12 && g[k + 1] >= 0.4 * mx, `d=${d} p=${p} 第 ${k} 層`);
    }
  }
});
