// 執行：node --test prototypes/troy-prologue/risset.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./risset.js');

const K = R.T;
const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** 舊規則測試用：固定 10 秒循環（T.DYNAMIC = false），時間點和第 6.2 節一樣好算。 */
const lvl = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({ DYNAMIC: false }, o.T || {}) }));

/** 從 from 跑到 to（每幀 DT），inputFn(g, t) 回傳該幀輸入。 */
function run(g, from, to, inputFn) {
  let t = from;
  while (t < to - 1e-9) { t = Math.min(to, t + DT); g.step(t, inputFn ? inputFn(g, t) : {}); }
  return t;
}
/** 只留一名衛兵（固定站在 x,z、朝 yaw），其他放倒，方便單獨測一條規則。 */
function solo(g, id, x, z, yaw) {
  let one = null;
  for (const q of g.guards) {
    if (q.id === id) { one = q; q.x = x; q.z = z; q.route = [{ x, z }]; q.wp = 0; q.baseYaw = yaw; q.yaw = yaw; q.susp = 0; }
    else { q.state = 'down'; q.active = false; }
  }
  return one;
}
const place = (g, x, z) => { g.player.x = x; g.player.z = z; };
const sfx = (g) => g.drain().filter((e) => e.type === 'sfx').map((e) => e.a);

// ---------------- 相位、盲區、感知半徑、低音 ----------------

test('相位與盲區：p = ((t − t0)/T) mod 1，每個循環開頭 BLIND_LEN（0.6）秒是盲區', () => {
  assert.equal(K.BLIND_LEN, 0.6);
  assert.equal(K.BLIND, K.BLIND_LEN, '舊名 BLIND 跟著 BLIND_LEN');
  assert.ok(near(R.phaseAt(0, 0, K), 0));
  assert.ok(near(R.phaseAt(7.5, 0, K), 0.75));
  assert.ok(near(R.phaseAt(12.5, 2.5, K), 0));
  assert.ok(near(R.phaseAt(1, 3, 10), 0.8), 't < t0 也要落在 0…1');
  assert.equal(R.cycleIndex(25, 0, K), 2);
  assert.equal(R.cycleIndex(-1, 0, K), -1);
  assert.equal(R.inBlind(10.2, 0, K), true);
  assert.equal(R.inBlind(10.49, 0, K), true);
  assert.equal(R.inBlind(10.59, 0, K), true);
  assert.equal(R.inBlind(10.61, 0, K), false);
  assert.equal(R.inBlind(9.99, 0, K), false, '最快的尾端不是盲區');
  const g = lvl({ t0: 1.5, startZone: 2 });
  g.step(13.7, {});
  assert.ok(near(g.cycle.p, 0.22));
  assert.equal(g.cycle.index, 1);
  assert.equal(g.cycle.blind, false);
  assert.equal(g.cycle.T, 10);
  g.step(21.6, {});
  assert.equal(g.cycle.blind, true);
  g.step(29.6, {});
  assert.equal(g.cycle.desync, true, 'p > 0.8 時畫面要延遲加雜訊');
});

test('感知半徑 r(p) = 2 + 8p²，警戒 ×1.3', () => {
  assert.ok(near(R.radiusAt(0), 2));
  assert.ok(near(R.radiusAt(0.5), 4));
  assert.ok(near(R.radiusAt(1), 10));
  assert.ok(near(R.radiusAt(0.5, true), 5.2));
});

test('低音拍點：最近一拍、±0.15 秒、下一拍', () => {
  const a = R.bassBeatNear(5.0, 0.2, 2.4);
  assert.ok(near(a.beat, 5.0) && a.ok && near(a.next, 5.0));
  const b = R.bassBeatNear(5.14, 0.2, 2.4);
  assert.ok(b.ok && near(b.off, 0.14) && near(b.next, 7.4));
  assert.equal(R.bassBeatNear(5.16, 0.2, 2.4).ok, false);
  assert.equal(R.bassBeatNear(4.86, 0.2, 2.4).ok, true);
  assert.equal(R.bassBeatNear(4.84, 0.2, 2.4).ok, false);
  const g = lvl({ t0: 0.2, startZone: 2 });
  g.step(3.0, {});
  assert.ok(near(g.bass.nextBeat, 5.0));
  assert.equal(g.bass.period, 2.4);
});

test('BLIND_LEN 可調：createLevel 的 opts.T 改了，盲區長度跟著改', () => {
  const g = lvl({ startZone: 2, T: { BLIND_LEN: 1.0 } });
  g.step(10.9, {});
  assert.equal(g.cycle.blind, true);
  assert.equal(g.T.BLIND, 1.0);
  g.step(11.1, {});
  assert.equal(g.cycle.blind, false);
});

test('盲區預告：盲區前 0.4 秒發一次 sfx pre_blind，每個循環一次', () => {
  assert.equal(K.PRE_BLIND, 0.4);
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  g.step(9, {});
  run(g, 9, 9.58, () => ({}));
  assert.ok(!sfx(g).includes('pre_blind'), '9.6 秒前不預告');
  run(g, 9.58, 9.62, () => ({}));
  assert.deepEqual(sfx(g).filter((x) => x === 'pre_blind'), ['pre_blind']);
  run(g, 9.62, 10.5, () => ({}));
  assert.ok(!sfx(g).includes('pre_blind'), '同一個盲區只預告一次');
  run(g, 10.5, 20.2, () => ({}));
  assert.equal(sfx(g).filter((x) => x === 'pre_blind').length, 1, '下一個循環再預告一次');
});

test('step 用絕對時間，每次最多推進 0.1 秒', () => {
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 25, 19);
  g.step(3, {});
  g.step(4, { mx: 1 });
  assert.ok(near(g.player.x - 25, K.WALK * K.MAX_DT, 1e-9));
});

test('開場字卡 → start 進入區 1', () => {
  const g = R.createLevel();
  assert.equal(g.phase, 'intro'); assert.equal(g.zone, 0);
  g.step(0, {}); g.step(0.1, { mx: 1 });
  assert.equal(g.phase, 'intro');
  g.step(0.2, { start: true });
  assert.equal(g.phase, 'play'); assert.equal(g.zone, 1);
  assert.equal(g.player.y, K.BELLY_Y);
  const out = g.drain();
  assert.ok(out.some((e) => e.type === 'hint' && /屏住呼吸/.test(e.a)));
  assert.ok(out.some((e) => e.type === 'msg' && e.a === '木馬腹中'));
});

test('開場：屏息提示和盲區提示不同時出；盲區提示等到下一個循環以後', () => {
  for (const startT of [0.2, 9.0]) { // 9.0：開始後 1 秒就是盲區，也不能馬上出
    const g = R.createLevel();
    g.step(startT, {}); g.step(startT, { start: true });
    const blindHints = [];
    const t0 = startT;
    const i0 = g.cycle.index;
    let t = t0;
    g.guards.forEach((q) => { q.state = 'down'; q.active = false; });
    let breathAt = null;
    for (const e of g.drain()) if (e.type === 'hint' && /屏住呼吸/.test(e.a)) breathAt = t0;
    assert.equal(breathAt, t0);
    while (t < 40) {
      t += DT; g.step(t, {});
      for (const e of g.drain()) if (e.type === 'hint' && e.a === R.HINTS.blind) { blindHints.push(t); assert.ok(g.cycle.blind && g.cycle.index > i0, '在之後循環的盲區裡'); }
    }
    assert.equal(blindHints.length, 1, '盲區提示出一次');
    assert.ok(blindHints[0] - t0 >= K.HINT_GAP, `start ${startT}：盲區提示在 ${blindHints[0]}`);
  }
});

// ---------------- 機制 A：屏息、移動、盲區、衝刺 ----------------

test('屏息：不能移動、最多 6 秒，超過就喘氣（大聲），放開後恢復', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 15, 3, 0);
  place(g, 25, 19);
  g.step(0, {});
  let t = run(g, 0, 2, () => ({ breath: true, mx: 1 }));
  assert.equal(g.player.breathing, true);
  assert.equal(g.player.x, 25, '屏息時不能動');
  assert.ok(near(g.player.breathT, 2, 0.02));
  t = run(g, t, 6.1, () => ({ breath: true }));
  assert.equal(g.player.breathing, false, '超過 6 秒被迫換氣');
  assert.equal(g.player.breathLock, true, '繼續按住也不能再屏息，要先放開');
  const s = sfx(g);
  assert.ok(s.includes('breath_in') && s.includes('gasp'));
  t = run(g, t, 8.1, () => ({}));
  assert.ok(near(g.player.breathT, K.BREATH_MAX - 2.1 * K.BREATH_RECOVER, 0.1), `breathT=${g.player.breathT}`);
  run(g, t, 8.5, () => ({ breath: true }));
  assert.equal(g.player.breathing, true);
});

test('喘氣是大聲音：低頻時附近衛兵起疑，高頻時直接追殺', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 12, 0); // 7 m 外，背對
  place(g, 25, 19);
  g.step(15, {});
  run(g, 15, 21.1, () => ({ breath: true })); // 21 秒喘氣時 p = 0.1
  assert.equal(q.state, 'suspicious');
  assert.equal(g.panic.active, true);

  const h = lvl({ startZone: 2 });
  const q2 = solo(h, 'g2a', 25, 12, 0);
  place(h, 25, 19);
  h.step(1.5, {});
  run(h, 1.5, 7.6, () => ({ breath: true }));
  assert.equal(q2.state, 'hunted');
  assert.equal(h.hunted, true);
});

test('高頻（p > 0.6）在衛兵範圍內移動 = 立刻追殺', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0); // 3 m，背對，靠聽覺
  place(g, 25, 19);
  g.step(7, {});
  g.step(7 + DT, { mx: 1 });
  assert.equal(q.state, 'hunted');
  assert.equal(g.hunted, true);
  assert.equal(g.alarm, 1);
});

test('高頻時在範圍外移動、或屏息不動且不在視野內，都不會被發現', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 27, 0); // 8 m
  place(g, 25, 19);
  g.step(7, {});
  run(g, 7, 7.5, () => ({ mx: -1 })); // r(0.7..0.75) ≈ 5.9～6.5 < 8
  assert.equal(q.state, 'patrol');
  q.x = 25; q.z = 22; // 3 m，背對（朝 −z 會看向玩家……改朝 +z）
  q.baseYaw = q.yaw = R.yawTo(0, 1);
  q.route = [{ x: 25, z: 22 }];
  place(g, 25, 19);
  run(g, 7.5, 9.9, () => ({ breath: true }));
  assert.equal(q.state, 'patrol');
  assert.ok(q.susp < 1e-9);
});

test('低頻（p ≤ 0.6）在範圍內移動：疑心上升但不會立刻追殺；疑心滿了就起疑', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 21, Math.PI); // 背對玩家（朝 +z）
  place(g, 25, 19);
  g.step(3, {}); g.drain();
  run(g, 3, 3.5, () => ({ mx: 1 }));
  assert.equal(q.state, 'patrol');
  const loudSteps = sfx(g).filter((x) => x === 'step_loud').length; // 不合拍的腳步每次 +SUSP_STEP
  const base = q.susp - loudSteps * K.SUSP_STEP;
  assert.ok(base > 0.3 && base < 0.6, `susp=${q.susp}`);
  run(g, 3.5, 4.2, () => ({ mx: -1 }));
  assert.equal(q.state, 'suspicious');
  assert.equal(g.panic.active, true);
});

test('站著不動但被看到（不在陰影、在視野與範圍內）也會累積疑心；陰影裡看不到', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0); // 面向 −z，正對玩家
  place(g, 25, 19);
  g.step(5, {});
  run(g, 5, 7, () => ({ breath: true }));
  assert.ok(q.susp > 0.5, '被看到，屏息也沒用');
  const h = lvl({ startZone: 2 });
  const q2 = solo(h, 'g2a', 17, 23, R.yawTo(0, 1)); // 面向 +z，看著南側拱廊
  place(h, 17, 25.5);
  h.step(5, {});
  run(h, 5, 7, () => ({ breath: true }));
  assert.equal(h.player.hidden, true);
  assert.ok(q2.susp < 1e-9, '陰影裡看不到');
});

test('盲區：感知是 0，貼著衛兵走也沒事', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 20, 0);
  place(g, 25, 19);
  g.step(9.99, { breath: true });
  run(g, 10.0, 10.48, () => ({ mx: 1 }));
  assert.equal(q.state, 'patrol');
  assert.equal(q.susp, 0);
});

test('衝刺：只能在盲區、每個盲區一次，衝 3 公尺', () => {
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 23, 19);
  g.step(5, {});
  g.step(5 + DT, { dash: true });
  assert.ok(g.player.x === 23, '盲區外衝不出去');
  assert.ok(g.drain().some((e) => e.type === 'hint' && /Shift/.test(e.a)));
  g.step(10.1, {});
  g.step(10.1 + DT, { dash: true, mx: 1 });
  assert.ok(near(g.player.x, 23 + 3 + K.WALK * DT, 1e-6));
  assert.ok(sfx(g).includes('dash'));
  g.step(10.2, { dash: true, mx: 1 });
  assert.ok(g.player.x < 26.5, '同一個盲區不能衝第二次');
  g.step(20.1, {});
  g.step(20.1 + DT, { dash: true, mz: -1 });
  assert.ok(near(g.player.z, 19 - 3 - K.WALK * DT, 1e-6), '下一個盲區可以再衝');
});

test('衝刺會被牆擋住', () => {
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 25, 9.5); // 神殿南牆 z = 8
  g.step(10.1, {});
  g.step(10.1 + DT, { dash: true, mz: -1 });
  assert.ok(g.player.z >= 8 + K.BODY_R - 1e-9);
});

// ---------------- 致命一擊 ----------------

test('致命一擊：盲區內、背後 1.5 m 內 → 衛兵倒下', () => {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0); // 面向 −z
  place(g, 38, 24.2); // 在他背後
  g.step(10.1, {});
  g.step(10.1 + DT, { takedown: true });
  assert.equal(q.state, 'down');
  assert.equal(q.active, false);
  assert.ok(sfx(g).includes('takedown'));
});

test('致命一擊：盲區外按 → 那名衛兵立刻起疑（進入恐慌共振）', () => {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 24.2);
  g.step(3, {});
  g.step(3 + DT, { takedown: true });
  assert.equal(q.state, 'suspicious');
  assert.equal(g.panic.active, true);
  assert.ok(near(g.bass.anchor, 3 + DT + K.BASS_LEAD), '低音重新對齊，第一拍 1.5 秒後');
  assert.ok(near(g.bass.nextBeat, g.bass.anchor), '起疑那一幀 nextBeat 就換成新網格');
  const s = sfx(g);
  assert.ok(s.includes('takedown_fail') && s.includes('alert'));
});

test('致命一擊：盲區內但站在衛兵正面 → 起疑；太遠 → 沒反應', () => {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 21.9); // 在他面前
  g.step(10.1, {});
  g.step(10.1 + DT, { takedown: true });
  assert.equal(q.state, 'suspicious');
  const h = lvl({ startZone: 3 });
  const q2 = solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 25);
  h.step(10.1, {});
  h.step(10.1 + DT, { takedown: true });
  assert.equal(q2.state, 'patrol');
});

// ---------------- 機制 B：恐慌共振 ----------------

/** 讓 g3a 在 t=3 起疑（盲區外暗殺失敗），回傳 {g, q, beats}。 */
function panicSetup() {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 24.2);
  g.step(3, {});
  g.step(3, { takedown: true });
  const a = g.bass.anchor;
  return { g, q, beats: [a, a + 2.4, a + 4.8, a + 7.2] };
}

test('機制 B：第一拍在起疑後 1.5 秒；起疑那一幀 nextBeat 就是新網格', () => {
  assert.equal(K.BASS_LEAD, 1.5);
  assert.equal(K.CALM_TIMEOUT, 12);
  const g = lvl({ startZone: 3 });
  solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 24.2);
  g.step(3.3, {});
  const old = g.bass.nextBeat;
  assert.ok(near(old, 4.8), '起疑前：舊網格（t0 = 0）');
  g.step(3.3, { takedown: true });
  assert.ok(near(g.bass.nextBeat, 3.3 + K.BASS_LEAD));
  assert.ok(near(g.bass.anchor, 3.3 + K.BASS_LEAD));
});

test('機制 B：在低音拍點 ±0.15 秒內按 4 次 → 回到巡邏', () => {
  const { g, q, beats } = panicSetup();
  assert.ok(near(beats[0], 4.5));
  const offs = [0, 0.14, -0.14, 0.05];
  beats.forEach((b, i) => {
    g.step(b + offs[i] - 0.05, {});
    g.step(b + offs[i], { calm: true });
    if (i < 3) { assert.equal(q.calm, i + 1); assert.equal(q.state, 'suspicious'); }
  });
  assert.equal(q.state, 'patrol');
  assert.equal(g.panic.active, false);
  assert.equal(g.hunted, false);
  assert.ok(near(q.grace, K.CALM_GRACE, 0.1));
  assert.ok(near(g.bass.anchor, g.cycle.t0), '低音回到平常的對齊');
  assert.ok(sfx(g).filter((s) => s === 'calm_ok').length === 4);
});

test('機制 B：起疑時 alarm 隨時間升高', () => {
  const { g } = panicSetup();
  const a0 = g.alarm;
  g.step(3.1, {}); const a1 = g.alarm;
  g.step(3.2, {}); g.step(7, {});
  assert.ok(a1 >= 0.5 && g.alarm > a1 && g.alarm <= 1, `${a0} ${a1} ${g.alarm}`);
});

test('機制 B：兩次間隔不到 1 秒（被高頻帶著按太快）→ 追殺', () => {
  const { g, q, beats } = panicSetup();
  g.step(beats[0], { calm: true });
  assert.equal(q.calm, 1);
  g.step(beats[0] + 0.5, { calm: true });
  assert.equal(q.state, 'hunted');
  assert.equal(g.hunted, true);
  assert.equal(g.panic.active, false);
});

test('機制 B：偏離拍點 → 追殺（早 0.15 秒內、晚 0.15 + LATENCY_GRACE 秒內才算對）', () => {
  assert.equal(K.LATENCY_GRACE, 0.05);
  const { g, q, beats } = panicSetup();
  g.step(beats[0] + 1.2, { calm: true });
  assert.equal(q.state, 'hunted');
  assert.match(g.drain().filter((e) => e.type === 'msg').map((e) => e.a).join(), /亂了節拍/);
  const h = panicSetup();
  h.g.step(h.beats[0] - 0.16, { calm: true });
  assert.equal(h.q.state, 'hunted', '早 0.16 秒就算偏了');
  const k = panicSetup();
  k.g.step(k.beats[0] + 0.19, { calm: true });
  assert.equal(k.q.calm, 1, '晚 0.19 秒還算（偏晚那側多給 0.05）');
  const m = panicSetup();
  m.g.step(m.beats[0] + 0.21, { calm: true });
  assert.equal(m.q.state, 'hunted', '晚 0.21 秒就偏了');
});

test('機制 B：漏拍不歸零，12 秒內累積 4 次對拍就成功', () => {
  const { g, q, beats } = panicSetup();
  const b4 = beats[3] + 2.4; // 第 5 拍：起疑後 1.5 + 4 × 2.4 = 11.1 秒
  for (const b of [beats[0], beats[2], beats[3], b4]) { // 漏掉第 2 拍
    run(g, g.time, b - 0.01, () => ({}));
    g.step(b, { calm: true });
  }
  assert.ok(b4 - 3 < K.CALM_TIMEOUT);
  assert.equal(q.state, 'patrol');
  assert.equal(g.hunted, false);
});

test('機制 B：12 秒內沒安撫完 → 追殺', () => {
  const { g, q, beats } = panicSetup();
  g.step(beats[0], { calm: true });
  g.step(beats[1], { calm: true });
  run(g, beats[1], 3 + 11.9, () => ({}));
  assert.equal(q.state, 'suspicious');
  run(g, 3 + 11.9, 3 + 12.1, () => ({}));
  assert.equal(q.state, 'hunted');
});

test('機制 B：判定用 input.calmAt（按鍵當下的音訊時間），沒有才用幀時間', () => {
  // 幀晚了 0.3 秒才處理，但按鍵當下正好在拍點上 → 算對
  const a = panicSetup();
  a.g.step(a.beats[0] + 0.3, { calm: true, calmAt: a.beats[0] + 0.02 });
  assert.equal(a.q.calm, 1);
  assert.equal(a.g.panic.lastPress, a.beats[0] + 0.02, '間隔也用按鍵時間算');
  // 幀時間在拍點上，但按鍵其實早了 0.2 秒 → 偏了
  const b = panicSetup();
  b.g.step(b.beats[0], { calm: true, calmAt: b.beats[0] - 0.2 });
  assert.equal(b.q.state, 'hunted');
  // calmAt 晚 0.19 秒（LATENCY_GRACE 內）還算
  const c = panicSetup();
  c.g.step(c.beats[0] + 0.25, { calm: true, calmAt: c.beats[0] + 0.19 });
  assert.equal(c.q.calm, 1);
  // 太急也用按鍵時間：兩次按鍵相隔 0.9 秒
  const d = panicSetup();
  d.g.step(d.beats[0] + 0.01, { calm: true, calmAt: d.beats[0] });
  d.g.step(d.beats[0] + 1.5, { calm: true, calmAt: d.beats[0] + 0.9 });
  assert.equal(d.q.state, 'hunted');
  // 起疑之前就按下的鍵（同一幀才送到）不算
  const e = lvl({ startZone: 3 });
  const qe = solo(e, 'g3a', 38, 23, 0);
  place(e, 38, 24.2);
  e.step(3, {});
  e.step(3.02, { takedown: true, calm: true, calmAt: 2.99 });
  assert.equal(qe.state, 'suspicious');
  assert.equal(e.panic.count, 0);
  // calmAt 不是數字 → 用幀時間
  const f = panicSetup();
  f.g.step(f.beats[0], { calm: true, calmAt: 'x' });
  assert.equal(f.q.calm, 1);
});

test('失敗原因：failReason 是一句完整、看得懂的話', () => {
  const { g, beats } = panicSetup();
  g.step(beats[0], { calm: true });
  g.step(beats[0] + 0.5, { calm: true }); // 太急
  const b = g.guards.find((q) => q.id === 'g3a');
  b.x = g.player.x + 0.5; b.z = g.player.z;
  g.step(beats[0] + 0.6, {});
  assert.equal(g.phase, 'fail');
  assert.match(g.failReason, /安撫時按得太急/);
  assert.match(g.failReason, /追上/);
  assert.match(g.failReason, /。$/);
  assert.equal(g.failCode, 'caught_calm_fast');
  g.retry();
  assert.equal(g.failReason, null); assert.equal(g.failCode, null);

  const h = lvl({ startZone: 2 });
  solo(h, 'g2a', 25, 23, 0);
  place(h, 25, 19);
  h.step(7, {});
  h.step(7 + DT, { mx: 0.1 }); // 高頻時動
  run(h, 7 + DT, 10, () => ({}));
  assert.equal(h.phase, 'fail');
  assert.match(h.failReason, /節奏最快時你動了，衛兵聽見了/);
  for (const v of Object.values(R.CAUSES)) assert.ok(/[一-鿿]/.test(v) && !/電影/.test(v));
});

test('機制 B：起疑時又有第二名衛兵起疑，一起算在同一輪安撫裡', () => {
  const g = lvl({ startZone: 3 });
  const a = g.guards.find((q) => q.id === 'g3a'), b = g.guards.find((q) => q.id === 'g3b');
  for (const q of g.guards) if (q !== a && q !== b) { q.state = 'down'; q.active = false; }
  for (const [q, z] of [[a, 23], [b, 25.4]]) { q.x = 38; q.z = z; q.route = [{ x: 38, z }]; q.baseYaw = q.yaw = R.yawTo(1, 0); }
  place(g, 38, 24.2);
  g.step(3, {});
  g.step(3, { takedown: true }); // 選到較近的一名
  const first = [a, b].find((q) => q.state === 'suspicious');
  const other = first === a ? b : a;
  const beat0 = g.bass.anchor;
  g.step(beat0, { calm: true });
  other.susp = 1; // 第二名也起疑
  g.step(beat0 + 0.1, {});
  assert.equal(other.state, 'suspicious');
  assert.equal(other.calm, 1);
  for (let k = 1; k < 4; k++) { g.step(beat0 + 2.4 * k - 0.05, {}); g.step(beat0 + 2.4 * k, { calm: true }); }
  assert.equal(a.state, 'patrol'); assert.equal(b.state, 'patrol');
});

// ---------------- 追殺 ----------------

test('追殺：躲進陰影、一整個循環不動 → 擺脫', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 17, 18, Math.PI); // 南側拱廊（z ≥ 24）以北 6 m
  place(g, 17, 24.3); // 已在陰影邊緣
  g.step(9.5, {});
  g.step(9.5 + DT, { mz: 1 }); // 高頻時移動：被聽到
  assert.equal(g.hunted, true);
  let t = run(g, 9.5 + DT, 10.1, () => ({ breath: true }));
  g.step(t + DT, { dash: true, mz: 1 }); t += DT; // 盲區裡往陰影深處衝
  assert.ok(g.player.z > 27);
  t = run(g, t, t + K.ESCAPE_STILL - 0.3, (gg) => ({ breath: gg.player.breathT < 5 && gg.cycle.p > 0.5 }));
  assert.equal(g.hunted, true, '還沒撐滿一個循環');
  assert.equal(g.phase, 'play', '追兵到最後位置，但沒抓到人');
  assert.ok(Math.hypot(q.x - 17, q.z - 24.3) < 1.5, '衛兵追到最後看到的位置');
  run(g, t, t + 1, () => ({}));
  assert.equal(g.hunted, false);
  assert.equal(q.state, 'patrol');
  assert.ok(sfx(g).includes('escape'));
});

test('追殺：在陰影裡亂動會被聽到，撐不住的計時歸零', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 17, 16, Math.PI);
  place(g, 17, 24.3);
  g.step(9.5, {});
  g.step(9.5 + DT, { mz: 1 });
  run(g, 9.5 + DT, 10.1, () => ({ breath: true }));
  g.step(10.1 + DT, { dash: true, mz: 1 });
  run(g, 10.1 + DT, 13, () => ({}));
  assert.equal(g.phase, 'play');
  assert.ok(g.stillT > 2);
  g.step(13 + DT, { mx: 0.2 });
  assert.equal(g.stillT, 0);
  const q = g.guards.find((x) => x.id === 'g2a');
  assert.ok(Math.hypot(q.lastKnown.x - g.player.x, q.lastKnown.z - g.player.z) < 0.1, '動了會被聽到，衛兵知道你在哪');
});

test('追殺：被追到 1 公尺內 → 失敗', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 25, 23, 0);
  place(g, 25, 19);
  g.step(7, {});
  g.step(7 + DT, { mx: 0.1 });
  assert.equal(g.hunted, true);
  run(g, 7 + DT, 10, () => ({}));
  assert.equal(g.phase, 'fail');
  assert.match(g.failReason, /追上/);
});

test('追殺中不能離開這一區', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 15, 3, 0);
  place(g, 29.5, 22);
  g.step(7, {});
  g.guards.find((q) => q.id === 'g2a').state = 'patrol';
  g.hunted = true; g.guards.find((q) => q.id === 'g2a').state = 'hunted';
  g.step(7.2, { mx: 1 });
  g.step(7.4, { mx: 1 });
  assert.equal(g.zone, 2);
  assert.ok(g.drain().some((e) => e.type === 'hint' && /甩掉/.test(e.a)));
});

test('木馬腹中被發現 = 立刻失敗（衛兵會叫人）', () => {
  const g = lvl({ startZone: 1 });
  const q = g.guards.find((x) => x.id === 'g1');
  assert.equal(q.active, true);
  g.step(7, {});
  q.x = 6; q.z = 15;
  g.step(7 + DT, { mx: 1 });
  assert.equal(g.phase, 'fail');
  assert.match(g.failReason, /木馬/);
});

test('木馬腹中：玩家在 2.5 m 高，衛兵就在正下方也有 2.5 m 距離；走到暗門就下到廣場', () => {
  const g = lvl({ startZone: 1 });
  const q = g.guards.find((x) => x.id === 'g1');
  q.x = 6; q.z = 15; q.route = [{ x: 6, z: 15 }];
  g.step(1, {});
  run(g, 1, 2.5, () => ({ mx: 1 })); // r(0.1..0.25) ≤ 2.5
  assert.equal(g.phase, 'play');
  assert.ok(g.player.z >= 14.5 && g.player.z <= 15.5, '被限制在木馬腹中');
  q.x = 1; q.route = [{ x: 1, z: 15 }];
  run(g, 2.5, 5, () => ({ mx: 1 }));
  assert.equal(g.zone, 2);
  assert.equal(g.player.y, 0);
  assert.ok(sfx(g).includes('trapdoor'));
});

// ---------------- 城門 ----------------

test('城門：低頻（p ≤ 0.5）按住 interact 累積，高頻按住發出門閂聲', () => {
  const g = lvl({ startZone: 4 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const L = g.level.gate.latch;
  place(g, L.x - 0.5, L.z);
  g.step(0, {});
  run(g, 0, 10, () => ({ interact: true }));
  assert.ok(near(g.gate.progress, 5, 0.05), `progress=${g.gate.progress}`);
  const s = sfx(g);
  const n = s.filter((x) => x === 'latch').length;
  assert.ok(n >= 9 && n <= 11, `門閂聲 ${n} 次`);
  run(g, 10, 15, () => ({}));
  assert.ok(near(g.gate.progress, 5, 0.05), '放手不會退，也不會增加');
  // 離門閂太遠推不到
  place(g, L.x - 3, L.z);
  run(g, 20, 22, () => ({ interact: true }));
  assert.ok(near(g.gate.progress, 5, 0.05));
});

test('城門：高頻推門閂是大聲音，附近衛兵直接追殺', () => {
  const g = lvl({ startZone: 4 });
  const q = solo(g, 'g4b', 52, 15 - 3, 0);
  const L = g.level.gate.latch;
  place(g, L.x - 0.5, L.z);
  g.step(7, {});
  g.step(7 + DT, { interact: true });
  assert.equal(q.state, 'hunted');
});

test('城門：累積約 3 個循環的低頻推門 → 城門打開、過關', () => {
  const g = lvl({ startZone: 4 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const L = g.level.gate.latch;
  place(g, L.x, L.z + 0.5);
  g.step(0, {});
  run(g, 0, 29.9, (gg) => ({ interact: gg.cycle.p <= K.GATE_LOW_P }));
  assert.equal(g.phase, 'play');
  run(g, 29.9, 30.2, (gg) => ({ interact: gg.cycle.p <= K.GATE_LOW_P }));
  assert.equal(g.phase, 'win');
  assert.equal(g.gate.open, true);
  assert.ok(sfx(g).includes('gate_open'));
});

// ---------------- 檢查點與重來 ----------------

test('retry：失敗後從這一區開頭重來，這一區衛兵復原，前一區不動', () => {
  const g = lvl({ startZone: 2 });
  g.step(0, {});
  const g2 = g.guards.find((q) => q.id === 'g2a');
  g2.state = 'down'; g2.active = false;
  place(g, 30.5, 22); // 走進區 3 出口
  g.step(0.05, {});
  assert.equal(g.zone, 3);
  const a = g.guards.find((q) => q.id === 'g3a');
  g.step(10.1, {});
  place(g, a.x - 1, a.z);
  g.step(10.15, { takedown: true });
  assert.equal(a.state, 'down');
  const b = g.guards.find((q) => q.id === 'g3b');
  b.state = 'hunted'; g.hunted = true; b.x = g.player.x + 0.5; b.z = g.player.z;
  g.step(10.2, {});
  assert.equal(g.phase, 'fail');
  g.retry();
  assert.equal(g.phase, 'play');
  assert.equal(g.zone, 3);
  const s = g.level.zones[3].start;
  assert.equal(g.player.x, s.x); assert.equal(g.player.z, s.z);
  assert.equal(g.hunted, false);
  assert.equal(g.guards.find((q) => q.id === 'g3a').state, 'patrol', '區 3 放倒的衛兵也復原');
  assert.equal(g.guards.find((q) => q.id === 'g3b').state, 'patrol');
  assert.equal(g.guards.find((q) => q.id === 'g2a').state, 'down', '前一區放倒的維持');
  assert.equal(g.retries, 1);
  assert.ok(g.drain().some((e) => e.type === 'msg' && /重新開始/.test(e.a)));
});

test('從區 3 走進區 4：玩家移到區 4 的起點（暗處），和重來時的起點一致', () => {
  const g = lvl({ startZone: 3 });
  g.step(0, {});
  place(g, 46.6, 24);
  g.step(0.05, {});
  assert.equal(g.zone, 4);
  const s = g.level.zones[4].start;
  assert.equal(g.player.x, s.x); assert.equal(g.player.z, s.z);
  assert.equal(g.player.hidden, true, '起點在暗處');
  const enterAt = { x: g.player.x, z: g.player.z };
  g.phase = 'fail';
  g.retry();
  assert.deepEqual({ x: g.player.x, z: g.player.z }, enterAt);
  // 離巡邏線夠遠：低頻時（p ≤ 0.5）每名區 4 衛兵的路線點都在 r(0.5) 外
  for (const d of g.level.guards.filter((q) => q.zone === 4)) {
    for (const pt of d.route) assert.ok(Math.hypot(pt.x - s.x, pt.z - s.z) > R.radiusAt(0.5), d.id);
  }
});

test('retry：在城門重來，門閂進度歸零', () => {
  const g = lvl({ startZone: 4 });
  g.gate.progress = 9; g.phase = 'fail';
  g.retry();
  assert.equal(g.gate.progress, 0);
  assert.equal(g.zone, 4);
});

test('提示：每個機制只提示一次，而且是繁體中文、不提電影', () => {
  for (const [k, v] of Object.entries(R.HINTS)) {
    assert.ok(/[一-鿿]/.test(v), k);
    assert.ok(!/電影|諾蘭|奧德賽/.test(v), k);
  }
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  g.step(3, {});
  g.step(3.1, { dash: true });
  g.step(3.2, { dash: true });
  assert.equal(g.drain().filter((e) => e.type === 'hint').length, 1);
});

test('關卡資料：起點不在牆裡、出口和門閂可達、每區都有衛兵', () => {
  const L = R.buildLevel();
  const hit = (x, z) => L.walls.some((w) => {
    const cx = Math.max(w.x0, Math.min(x, w.x1)), cz = Math.max(w.z0, Math.min(z, w.z1));
    return Math.hypot(x - cx, z - cz) < K.BODY_R;
  });
  for (const z of L.zones.slice(2)) assert.ok(!hit(z.start.x, z.start.z), z.name);
  for (const q of L.guards) for (const p of q.route) assert.ok(!hit(p.x, p.z), q.id);
  assert.ok(!hit(L.gate.latch.x, L.gate.latch.z));
  for (let z = 1; z <= 4; z++) assert.ok(L.guards.some((q) => q.zone === z), '區 ' + z);
  assert.equal(L.guards.filter((q) => q.zone === 2).length, 2);
  assert.equal(L.guards.filter((q) => q.zone === 3).length, 3);
  assert.equal(L.guards.filter((q) => q.zone === 4).length, 2);
  assert.ok(L.size.w === 60 && L.size.h === 30);
});

// ---------------- 第 8 節：越危險越快 ----------------

test('8.1 目標循環長度：沒人 12 秒、靠近變短（最短 6）、警戒 4、追殺 3、每區 ×0.9', () => {
  const f = (s) => R.cycleTargetFor(s, K);
  assert.equal(f({ dist: Infinity, zone: 1 }), 12);
  assert.equal(f({ dist: 20, zone: 1 }), 12, '超出感知範圍兩倍（20 m）= 12 秒');
  assert.equal(f({ dist: 4, zone: 1 }), 6);
  assert.equal(f({ dist: 1, zone: 1 }), 6, '再近也最短 6 秒');
  assert.ok(near(f({ dist: 12, zone: 1 }), 9));
  assert.ok(f({ dist: 8, zone: 1 }) < f({ dist: 14, zone: 1 }), '越近越短');
  assert.equal(f({ dist: 30, zone: 1, alert: true }), 4);
  assert.equal(f({ dist: 30, zone: 1, alert: true, hunted: true }), 3);
  assert.ok(near(f({ dist: Infinity, zone: 2 }), 12 * 0.9));
  assert.ok(near(f({ dist: 4, zone: 4 }), 6 * 0.9 ** 3));
  assert.equal(f({ zone: 4, alert: true }), 4, '警戒、追殺不乘區域基準');
  assert.equal(R.cycleTargetFor({ dist: 1 }, Object.assign({}, K, { DYNAMIC: false })), K.CYCLE);
});

test('8.1 遊戲中：targetT 跟著衛兵距離與狀態走；實際長度平滑逼近，每秒最多 ±20%', () => {
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 15, 3, 0);
  place(g, 25, 26); // 離衛兵 > 20 m
  g.step(1, {});
  assert.ok(near(g.cycle.targetT, 12 * 0.9) && near(g.cycle.T, g.cycle.targetT), '首幀直接等於目標');
  // 衛兵走到 3 m 外：目標 6 × 0.9，實際長度慢慢縮
  q.x = 25; q.z = 23; q.route = [{ x: 25, z: 23 }]; q.baseYaw = q.yaw = R.yawTo(0, -1);
  let t = 1, prev = g.cycle.T;
  for (let i = 0; i < 300; i++) {
    t += DT; g.step(t, { breath: g.player.breathT < 5 });
    q.susp = 0;
    const ratio = g.cycle.T / prev;
    assert.ok(ratio >= 1 - K.CYCLE_RATE * DT - 1e-9 && ratio <= 1 + 1e-12, `第 ${i} 幀變化太快：${ratio}`);
    prev = g.cycle.T;
  }
  assert.ok(near(g.cycle.targetT, 6 * 0.9));
  const T5 = g.cycle.T;
  assert.ok(T5 < 10.8 * 0.8 && T5 >= 10.8 * Math.exp(-0.2 * 5) - 0.01, `5 秒後 T=${T5}`);
  // 一次跳很大（例如 2 秒沒畫面）也一樣受限：分段平滑
  const g2 = R.createLevel({ startZone: 2 });
  for (const x of g2.guards) { x.state = 'down'; x.active = false; }
  g2.step(0, {});
  const a = g2.cycle.T;
  g2.hunted = true; g2.step(2, {});
  assert.equal(g2.cycle.targetT, 3);
  assert.ok(g2.cycle.T >= a * (1 - K.CYCLE_RATE * K.MAX_DT) ** 20 - 1e-9 && g2.cycle.T < a, `${a} → ${g2.cycle.T}`);
  // 很久以後收斂到目標
  for (let tt = 2; tt < 30; tt += 0.05) { g2.hunted = true; g2.stillT = 0; g2.step(tt, {}); }
  assert.ok(near(g2.cycle.T, 3, 1e-6));
});

test('8.1 遊戲中：警戒目標 4 秒、追殺目標 3 秒', () => {
  const { g } = panicSetup();
  assert.equal(g.panic.active, true);
  const h = R.createLevel({ startZone: 3 });
  const q = solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 24.2);
  h.step(3, {}); h.step(3.02, { takedown: true }); h.step(3.04, {});
  assert.equal(h.cycle.targetT, 4);
  q.susp = 1; h.step(3.06, { calm: true }); // 亂按 → 追殺
  h.step(3.08, {});
  assert.equal(h.hunted, true);
  assert.equal(h.cycle.targetT, 3);
});

test('8.1 相位累加 p += dt ÷ T；跳回 0 時 index + 1；anchor 是本幀的 {t, p, T}', () => {
  const g = R.createLevel({ startZone: 1 });
  g.step(5, {});
  let t = 5;
  for (let i = 0; i < 2000; i++) {
    const p0 = g.cycle.p, i0 = g.cycle.index;
    t += DT; g.step(t, {});
    const c = g.cycle;
    const dp = (c.p + (c.index - i0)) - p0;
    assert.ok(near(dp, DT / c.T, 1e-9), `dp=${dp} 應為 ${DT / c.T}`);
    assert.deepEqual([c.anchor.t, c.anchor.p, c.anchor.T, c.anchor.index], [t, c.p, c.T, c.index]);
  }
  assert.ok(g.cycle.index > 1);
});

/** 一路跑，量出每一段盲區的長度（秒）。 */
function blindLens(g, from, to, dt, inputFn) {
  const lens = []; let on = null, t = from;
  while (t < to) {
    t += dt; g.step(t, inputFn ? inputFn(g, t) : {});
    if (g.cycle.blind && on == null) on = t;
    if (!g.cycle.blind && on != null) { lens.push(t - on); on = null; }
  }
  return lens;
}

test('8.1 盲區固定 0.6 秒：T = 3、6、12 都一樣；T 正在變化時也一樣', () => {
  const dt = 1 / 480;
  for (const P of [3, 6, 12]) {
    const g = lvl({ startZone: 2, T: { CYCLE: P } });
    for (const q of g.guards) { q.state = 'down'; q.active = false; }
    g.step(0, {});
    const lens = blindLens(g, 0, P * 4 + 0.5, dt);
    assert.ok(lens.length >= 3, `T=${P}`);
    for (const L of lens) assert.ok(Math.abs(L - 0.6) <= dt + 1e-9, `T=${P}：盲區 ${L} 秒`);
  }
  // 動態：一開始很遠（12 秒），衛兵瞬移到身邊，T 一路縮短
  const g = R.createLevel({ startZone: 2 });
  for (const x of g.guards) { x.state = 'down'; x.active = false; }
  g.step(0, {});
  const T0 = g.cycle.T;
  // 強制追殺：目標 3 秒（只看時鐘，不跑追殺）
  const lens = blindLens(g, 0, 40, dt, (gg) => { gg.hunted = true; gg.stillT = 0; return {}; });
  assert.ok(T0 > 10 && near(g.cycle.T, 3, 0.01), `T ${T0} → ${g.cycle.T}`);
  assert.ok(lens.length >= 5);
  for (const L of lens) assert.ok(Math.abs(L - 0.6) <= dt + 1e-9, `盲區 ${L} 秒`);
});

test('8.1 警戒時：循環開頭的盲區暫停，改成兩個低音拍正中央的 0.6 秒', () => {
  const { g, beats } = panicSetup(); // 固定 10 秒循環，起疑在 t = 3，第一拍 4.5
  g.step(3.5, {});
  assert.equal(g.cycle.alertBlind, true);
  assert.equal(g.cycle.blind, false, '第一拍之前沒有盲區');
  g.step(beats[0], { calm: true }); // 對拍，維持警戒
  const mid = beats[0] + K.BASS_PERIOD / 2;
  for (const [dt, want] of [[-0.35, false], [-0.29, true], [0, true], [0.29, true], [0.35, false]]) {
    g.step(mid + dt, {});
    assert.equal(g.cycle.blind, want, `中點 ${dt >= 0 ? '+' : ''}${dt}`);
  }
  assert.ok(near(g.cycle.blindFrom, mid + 2.4 - 0.3) && near(g.cycle.blindTo, mid + 2.4 + 0.3), '過了之後指向下一段');
  // 盲區時感知 = 0：貼著衛兵走也沒事
  const q = g.guards.find((x) => x.id === 'g3a');
  const m2 = mid + 2.4;
  g.step(beats[1], { calm: true });
  g.step(m2 - 0.28, {});
  const s0 = q.susp;
  run(g, m2 - 0.28, m2 + 0.28, () => ({ mx: 0.3 }));
  assert.equal(q.state, 'suspicious'); assert.equal(q.susp, s0);
  assert.ok(g.drain().some((e) => e.type === 'hint' && e.a === R.HINTS.alertBlind));
  // 循環剛跳回 0（t = 10.0）時不算盲區
  const h = lvl({ startZone: 3 });
  solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 24.2);
  h.step(8.4, {}); h.step(8.4, { takedown: true }); // 第一拍 9.9
  h.step(9.9, { calm: true });
  h.step(10.2, {});
  assert.equal(h.panic.active, true);
  assert.equal(h.cycle.blind, false, '警戒時循環開頭不是盲區');
  h.step(9.9 + 1.2, {});
  assert.equal(h.cycle.blind, true);
});

// ---------------- 第 8 節：Risset 拍點（規則層是唯一來源） ----------------

test('8.4 beatPhases：第 k 層第 n 拍在 p = log2(1 + n ÷ (7·2^k))，每層每循環整數拍', () => {
  assert.equal(K.RISSET_M, 7); assert.equal(K.RISSET_LAYERS, 4);
  for (let k = 0; k < 4; k++) {
    const ph = R.beatPhases(k);
    assert.equal(ph.length, 7 * 2 ** k);
    assert.equal(R.layerBeats(k), 7 * 2 ** k);
    ph.forEach((p, n) => assert.ok(near(p, Math.log2(1 + n / (7 * 2 ** k)), 1e-12)));
    assert.ok(near(R.beatPhases(k, 7 * 2 ** k), 1), 'p = 1 正好接到下一循環 p = 0');
  }
  assert.equal(R.beatPhases(0, 0), 0);
  assert.ok(near(R.beatPhases(1, 7), Math.log2(1.5)));
  // 第 k 層 p → 1 的拍距和第 k+1 層 p = 0 的拍距一樣（無縫接上）
  const ph0 = R.beatPhases(0), ph1 = R.beatPhases(1);
  assert.ok(Math.abs((1 - ph0[6]) - ph1[1]) < 0.02);
  // 音量：中間最大、兩端接近無聲；追殺時至少 0.55，額外層 0.4
  assert.ok(near(R.layerGain(2, 0), 1));
  assert.ok(R.layerGain(0, 0) < 0.01 && R.layerGain(3, 0.999) < 0.01);
  assert.equal(R.layerGain(0, 0, true), K.HUNT_FLOOR);
  assert.equal(R.layerGain(4, 0.3, true), K.HUNT_LAYER_GAIN);
});

const fakeGame = (an, extra) => Object.assign({ T: K, cycle: { anchor: an }, hunted: false, panic: { active: false }, bass: { anchor: 0, period: 2.4 } }, extra || {});

test('8.4 beatsBetween：依 anchor 外推，回傳 [a, b) 內的拍點時間與層別', () => {
  const an = { t: 100, p: 0.25, T: 8, index: 3 };
  const G = fakeGame(an);
  const all = R.beatsBetween(100, 108, G, { includeBlind: true, includeQuiet: true });
  // 期望值：循環 3 的 [0.25, 1) 加循環 4 的 [0, 0.25)
  let want = 0;
  for (let k = 0; k < 4; k++) for (const p of R.beatPhases(k)) { if (p >= 0.25) want++; if (p < 0.25) want++; }
  assert.equal(all.length, want);
  for (let i = 1; i < all.length; i++) assert.ok(all[i].t >= all[i - 1].t, '照時間排序');
  for (const b of all) {
    assert.ok(b.t >= 100 && b.t < 108);
    assert.ok(near(b.t, 100 + (b.cycle + b.p - 3.25) * 8, 1e-9));
    assert.ok(near(b.p, R.beatPhases(b.k, b.n), 1e-12));
    assert.ok(near(b.x, (b.k + b.p) / 4));
  }
  const first4 = all.find((b) => b.cycle === 4 && b.k === 2 && b.n === 0);
  assert.ok(first4 && near(first4.t, 106), '循環 4 從 t = 106 開始');
  // 預設：略過太小聲與盲區（循環開頭 0.6 秒）的拍
  const def = R.beatsBetween(100, 108, G);
  assert.ok(def.length < all.length);
  for (const b of def) { assert.ok(b.gain >= K.BEAT_MIN_GAIN); assert.ok(b.p * 8 >= 0.6 - 1e-9); }
  assert.ok(!def.some((b) => b.t >= 106 && b.t < 106.6), '盲區沒有拍');
  // 往前外推、區間切開再拼起來結果一樣
  const back = R.beatsBetween(90, 100, G, { includeBlind: true, includeQuiet: true });
  assert.ok(back.length > 0 && back.every((b) => b.cycle <= 3));
  const split = R.beatsBetween(100, 103.3, G).concat(R.beatsBetween(103.3, 108, G));
  assert.deepEqual(split.map((b) => b.t), def.map((b) => b.t));
  // 追殺：多一層（k = 4），每層至少 0.55
  const H = fakeGame(an, { hunted: true });
  const hb = R.beatsBetween(100, 108, H);
  assert.ok(hb.some((b) => b.k === 4));
  assert.ok(hb.every((b) => b.gain >= 0.4));
  // 警戒：循環開頭不略過，改成略過低音拍正中央的 0.6 秒
  const A = fakeGame(an, { panic: { active: true }, bass: { anchor: 101, period: 2.4 } });
  const ab = R.beatsBetween(100, 108, A);
  assert.ok(ab.some((b) => b.t >= 106 && b.t < 106.6), '警戒時循環開頭有拍');
  for (const b of ab) assert.ok(!R.alertBlindAt(b.t, 101, 2.4).blind, `拍 ${b.t} 落在警戒盲區`);
});

test('8.4 beatsBetween 讀遊戲物件：和本幀 cycle 一致', () => {
  const g = R.createLevel({ startZone: 1 });
  g.step(3, {}); g.step(3.5, {});
  const c = g.cycle;
  const bs = R.beatsBetween(3.5, 4.0, g, { includeBlind: true, includeQuiet: true });
  for (const b of bs) assert.ok(near(b.t, 3.5 + (b.cycle - c.index + b.p - c.p) * c.T, 1e-9));
  // 接下來一個循環內的拍數 = 每層拍數總和
  const one = R.beatsBetween(3.5, 3.5 + c.T, g, { includeBlind: true, includeQuiet: true });
  assert.equal(one.length, 7 + 14 + 28 + 56);
});

// ---------------- 第 8 節：腳步合拍掩護 ----------------

test('8.3 stepMasked：響亮拍點 ±0.08 秒內被蓋過，太小聲的層不算', () => {
  const G = fakeGame({ t: 0, p: 0, T: 10, index: 0 });
  const loud = R.beatsBetween(0, 10, G, { minGain: K.MASK_GAIN });
  assert.ok(loud.length > 5);
  for (const b of loud.slice(0, 5)) {
    assert.ok(R.stepMasked(b.t + 0.079, G) && R.stepMasked(b.t - 0.079, G));
  }
  // 找一個離所有響亮拍點都超過 0.08 秒的時間 → 不被蓋過
  let gapT = null;
  for (let i = 1; i < loud.length; i++) if (loud[i].t - loud[i - 1].t > 0.3) { gapT = (loud[i].t + loud[i - 1].t) / 2; break; }
  assert.ok(gapT != null);
  assert.equal(R.stepMasked(gapT, G), false);
  // 只有小聲的拍在附近也不算
  const quiet = R.beatsBetween(0, 10, G).find((b) => b.gain < K.MASK_GAIN && loud.every((l) => Math.abs(l.t - b.t) > 0.2));
  assert.ok(quiet);
  assert.equal(R.stepMasked(quiet.t, G), false);
});

test('8.3 腳步：移動時每 0.45 秒一步，事件帶 {x, z}，合不合拍和 stepMasked 一致', () => {
  const g = R.createLevel({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 14, 22);
  g.step(1, {}); g.drain();
  let t = 1; const steps = [];
  while (t < 5.5) {
    t += DT; g.step(t, { mx: 1 });
    for (const e of g.drain()) if (e.type === 'sfx' && /^step_/.test(e.a)) {
      steps.push({ t, e });
      assert.ok(near(e.x, g.player.x) && near(e.z, g.player.z), '帶腳步位置');
      assert.equal(e.a === 'step_masked', R.stepMasked(t, g), `t=${t}`);
    }
  }
  assert.equal(steps.length, 10, '4.5 秒走 10 步');
  for (let i = 1; i < steps.length; i++) assert.ok(Math.abs(steps[i].t - steps[i - 1].t - 0.45) <= DT + 1e-9);
  // 站著不動或屏息不出腳步聲
  run(g, t, t + 2, () => ({ breath: true, mx: 1 }));
  assert.ok(!g.drain().some((e) => /^step_/.test(e.a)));
});

test('8.3 不合拍的腳步：2.5 m 內的衛兵疑心 + SUSP_STEP；合拍的不加；太遠、盲區都聽不到', () => {
  // 固定 10 秒循環，低頻時在背對的衛兵身後 2 m 來回走
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 20.5, Math.PI);
  place(g, 25, 19);
  g.step(0.7, {}); g.drain();
  let t = 0.7, loud = 0, masked = 0, dir = 1;
  while (t < 5.5) {
    q.susp = 0;
    t += DT; g.step(t, { mx: dir });
    if (g.player.x > 26) dir = -1; if (g.player.x < 24) dir = 1;
    const ev = g.drain().filter((e) => /^step_/.test(e.a));
    const base = K.SUSP_MOVE * DT;
    if (ev.some((e) => e.a === 'step_loud')) { loud++; assert.ok(near(q.susp, base + K.SUSP_STEP, 1e-9), `loud：${q.susp}`); }
    else { if (ev.length) masked++; assert.ok(near(q.susp, base, 1e-9), `t=${t}：${q.susp}`); }
  }
  assert.ok(loud >= 1 && masked >= 1, `loud ${loud} masked ${masked}`);
  // 3 m 外（r(p) 也到不了）：不合拍也聽不到
  const h = lvl({ startZone: 2 });
  const q2 = solo(h, 'g2a', 25, 22.2, Math.PI);
  place(h, 25, 19);
  h.step(0.7, {}); h.drain();
  let n = 0;
  run(h, 0.7, 2.8, (gg) => ({ mx: gg.player.x > 25.5 ? -1 : 1 }));
  n = h.drain().filter((e) => e.a === 'step_loud').length;
  assert.equal(q2.susp, 0, `${n} 次不合拍腳步`);
  // 盲區：聽不到
  const m = lvl({ startZone: 2 });
  const q3 = solo(m, 'g2a', 25, 20, Math.PI);
  place(m, 25, 19);
  m.step(9.8, { breath: true });
  run(m, 9.99, 10.58, () => ({ mx: 0.2 }));
  assert.equal(q3.susp, 0);
});

// ---------------- 第 8 節：事件附帶欄位、視覺輔助 ----------------

test('8.4 安撫事件帶 index：calm_ok 0～3，calm_bad 是當下的次數', () => {
  const { g, beats } = panicSetup();
  const idx = [];
  beats.forEach((b) => { g.step(b - 0.05, {}); g.step(b, { calm: true }); for (const e of g.drain()) if (e.a === 'calm_ok') idx.push(e.index); });
  assert.deepEqual(idx, [0, 1, 2, 3]);
  const h = panicSetup();
  h.g.step(h.beats[0], { calm: true });
  h.g.step(h.beats[0] + 1.2, { calm: true });
  const bad = h.g.drain().filter((e) => e.a === 'calm_bad');
  assert.equal(bad.length, 1); assert.equal(bad[0].index, 1);
});

test('8.4 門閂每推進 1/8 發 latch_step（index 0～7），推滿正好 8 個', () => {
  const g = lvl({ startZone: 4 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const L = g.level.gate.latch;
  place(g, L.x, L.z + 0.5);
  g.step(0, {});
  const got = [];
  let t = 0;
  while (g.phase === 'play' && t < 40) {
    t += DT; g.step(t, { interact: g.cycle.p <= K.GATE_LOW_P });
    for (const e of g.drain()) if (e.type === 'sfx' && (e.a === 'latch_step' || e.a === 'gate_open')) got.push(e.a === 'gate_open' ? 'open' : e.index);
  }
  assert.deepEqual(got, [0, 1, 2, 3, 4, 5, 6, 7, 'open']);
});

test('8.2 visualAid：區 0、1 = 1，區 2 = 0.5，其後 0；opts.visualAid 可以覆寫，執行中也能改', () => {
  assert.equal(R.createLevel().visualAid, 1);
  const want = { 1: 1, 2: 0.5, 3: 0, 4: 0 };
  for (const z of [1, 2, 3, 4]) {
    const g = R.createLevel({ startZone: z });
    g.step(0, {});
    assert.equal(g.visualAid, want[z], '區 ' + z);
    assert.equal(R.createLevel({ startZone: z, visualAid: 'on' }).visualAid, 1);
    assert.equal(R.createLevel({ startZone: z, visualAid: 'off' }).visualAid, 0);
  }
  const g = R.createLevel({ startZone: 2 });
  g.step(0, {}); place(g, 30.5, 22); g.step(0.05, {});
  assert.equal(g.zone, 3); assert.equal(g.visualAid, 0, '進下一區跟著變');
  g.visualAidMode = 'on'; g.step(0.1, {});
  assert.equal(g.visualAid, 1);
  assert.equal(R.visualAidFor(2, 'auto'), 0.5);
});

// ---------------- 程式玩家通關 ----------------

/*
 * 固定策略：
 *   照每區的路線點走；只在「盲區」或「p ≤ 0.57 而且離每名衛兵都在 r(p) + 餘裕之外」時移動，
 *   盲區時能衝就衝；不能動時，有衛兵在聽得到呼吸的距離就屏息（留 0.5 秒餘量）。
 *   起疑時站著不動，在低音拍點上按 calm（每拍一次）。
 *   窄巷：先摸到站崗衛兵背後，等盲區走近按 takedown。
 *   城門：低頻而且附近沒人時按住 interact，高頻時放手、需要就屏息。
 *   被追殺時躲進最近的陰影深處不動。
 */
function makeBot() {
  const WP = {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0, calmBeat = null;
  return function (g) {
    const K = g.T, t = g.time, pl = g.player, c = g.cycle, p = c.p, blind = c.blind;
    const inp = { mx: 0, mz: 0 };
    if (g.zone !== zone) { zone = g.zone; wi = 0; }
    const act = g.guards.filter(q => q.active);
    const r = (q, pp = p) => R.radiusAt(pp, q.state !== 'patrol', K);
    const d3 = (q, x = pl.x, z = pl.z) => Math.hypot(q.x - x, q.z - z, pl.y || 0);
    const wantBreath = () => act.some(q => d3(q) <= r(q, Math.min(1, p + 0.05)) * K.BREATH_HEAR + 0.8);
    // 追殺：躲到最近陰影深處
    if (g.hunted) {
      let best = null, bd = 1e9;
      for (const s of g.level.shadows) {
        const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, d = Math.hypot(cx - pl.x, cz - pl.z);
        if (d < bd) { bd = d; best = { x: cx, z: cz }; }
      }
      if (bd > 0.3) { inp.mx = (best.x - pl.x) / bd; inp.mz = (best.z - pl.z) / bd; if (blind) inp.dash = true; }
      return inp;
    }
    if (g.panic.active) {
      const b = R.bassBeatNear(t, g.bass.anchor, K.BASS_PERIOD, K.BASS_WIN);
      if (Math.abs(b.off) < 0.03 && calmBeat !== b.beat) { inp.calm = true; calmBeat = b.beat; }
      inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && (pl.breathing || pl.breathT < 2) && wantBreath();
      return inp;
    }
    // 城門
    if (g.zone === 4 && wi >= WP[4].length) {
      const quiet = p <= K.GATE_LOW_P - 0.02 && act.every(q => d3(q) > r(q) * K.BREATH_HEAR + 0.5);
      if (quiet) inp.interact = true;
      else inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && wantBreath();
      return inp;
    }
    const w = WP[g.zone][wi];
    const dx = w.x - pl.x, dz = w.z - pl.z, dw = Math.hypot(dx, dz);
    if (dw < 0.35) { wi++; return inp; }
    const ux = dx / dw, uz = dz / dw;
    // 暗殺目標：區 3 的站崗衛兵
    const tgt = act.find(q => q.id === 'g3a');
    if (tgt && g.zone === 3 && wi >= 2) {
      const dd = Math.hypot(tgt.x - pl.x, tgt.z - pl.z);
      if (blind && dd <= K.TAKEDOWN_R) { inp.takedown = true; return inp; }
      if (blind) { inp.mx = (tgt.x - pl.x) / dd; inp.mz = (tgt.z - pl.z) / dd; return inp; }
    }
    const nx = pl.x + ux * 0.3, nz = pl.z + uz * 0.3;
    const safe = act.every(q => {
      const mg = q === tgt ? 0.25 : 0.6;
      return Math.hypot(q.x - nx, q.z - nz, pl.y || 0) > r(q, Math.min(1, p + 0.03)) + mg;
    });
    const canMove = blind || (p <= 0.57 && safe);
    if (canMove) {
      inp.mx = ux; inp.mz = uz;
      if (blind && dw > 1.5 && !(tgt && g.zone === 3)) inp.dash = true;
    } else {
      inp.breath = pl.breathT < K.BREATH_MAX - 0.4 && wantBreath();
    }
    return inp;
  };
}

function playthrough(seed, t0, jitter) {
  const g = R.createLevel({ t0, seed });
  const bot = makeBot();
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2;
  const fails = [], sounds = {};
  let Tmin = Infinity, Tmax = 0;
  g.step(t, {});
  g.step(t, { start: true });
  while (g.phase !== 'win' && t < 600) {
    t += jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : DT;
    g.step(t, bot(g));
    Tmin = Math.min(Tmin, g.cycle.T); Tmax = Math.max(Tmax, g.cycle.T);
    for (const e of g.drain()) if (e.type === 'sfx') sounds[e.a] = (sounds[e.a] || 0) + 1;
    if (g.phase === 'fail') { fails.push(g.zone + ' ' + g.failReason); g.retry(); }
  }
  return { g, t, fails, sounds, Tmin, Tmax };
}

test('程式玩家用固定策略通關整關（動態循環；不同 t0、種子、不穩定幀率）', () => {
  const cases = [[1, 0, false], [2, 3.7, false], [3, 8.2, true], [4, 5.5, true], [5, 1.1, true],
    [6, 2.2, false], [7, 6.6, true], [8, 9.4, true]];
  for (const [seed, t0, jitter] of cases) {
    const { g, t, fails, sounds, Tmin, Tmax } = playthrough(seed, t0, jitter);
    assert.equal(g.phase, 'win', `seed ${seed}：沒過關（停在區 ${g.zone}）`);
    assert.deepEqual(fails, [], `seed ${seed} 失敗過`);
    assert.ok(t < 400, `seed ${seed} 花太久：${t}`);
    assert.ok(sounds.breath_in > 0, '用到屏息');
    assert.ok(sounds.dash > 0, '用到盲區衝刺');
    assert.ok(sounds.trapdoor === 1, '從木馬暗門爬下');
    assert.equal(sounds.takedown, 1, '窄巷暗殺一名');
    assert.equal(g.guards.find((q) => q.id === 'g3a').state, 'down');
    assert.ok(!sounds.hunt, '整關沒有被追殺');
    assert.equal(sounds.calm_ok || 0, 4 * (sounds.calm_done || 0), '每次起疑都安撫成功');
    assert.ok(sounds.step_masked > 0 && sounds.step_loud > 0, '有合拍與不合拍的腳步');
    assert.equal(sounds.latch_step, 8, '門閂奏完八個音');
    assert.ok(Tmin < 8 && Tmax > 10, `循環長度有隨危險變化：${Tmin.toFixed(2)}～${Tmax.toFixed(2)}`);
  }
});

// ---------------- 第 8.5 節：假驟降 ----------------

/** 關掉所有衛兵、固定 dt 一路跑，記下每一次交接（相位跳回 0）：{index, fake, pre（前一輪有沒有 pre_blind）, blindFrames}。 */
function handoffs(g, from, to, dt, inputFn) {
  const out = []; let t = from, lastIdx = g.cycle.index, pre = false, cur = null;
  const hints = [];
  while (t < to) {
    t += dt; g.step(t, inputFn ? inputFn(g, t) : {});
    for (const e of g.drain()) {
      if (e.type === 'sfx' && e.a === 'pre_blind') pre = true;
      if (e.type === 'hint') hints.push({ a: e.a, idx: g.cycle.index });
    }
    if (g.cycle.index !== lastIdx) {
      lastIdx = g.cycle.index;
      cur = { index: g.cycle.index, fake: g.cycle.fake, pre, blindFrames: 0, start: g.cycle.start };
      out.push(cur); pre = false;
    }
    if (cur && g.cycle.blind) cur.blindFrames++;
  }
  return { list: out, hints };
}
const allDown = (g) => { for (const q of g.guards) { q.state = 'down'; q.active = false; } return g; };

test('8.5 假驟降：常數；前兩區（木馬腹中、神殿廣場）不會出現', () => {
  assert.equal(K.FAKE_FROM_ZONE, 3);
  assert.equal(K.FAKE_EVERY, 4);
  assert.equal(R.HINTS.fake, '有時鼓聲只是換手，並沒有斷：沒有那聲預告，就不要動。');
  for (const z of [1, 2]) for (const dyn of [false, true]) {
    const g = allDown(dyn ? R.createLevel({ startZone: z, seed: 11 }) : lvl({ startZone: z, seed: 11 }));
    g.step(0, {});
    const { list } = handoffs(g, 0, 1500, 1 / 30);
    assert.ok(list.length > 100, `區 ${z}`);
    assert.ok(list.every((h) => !h.fake && h.pre && h.blindFrames > 0), `區 ${z} 出現假驟降或缺預告／盲區`);
  }
});

test('8.5 假驟降：第 3 區起約每 4 個循環 1 次、不會連續；沒有盲區、沒有 pre_blind；第一次出現時提示', () => {
  for (const seed of [1, 2, 3]) {
    const g = allDown(lvl({ startZone: 3, seed }));
    g.step(0, {});
    const { list, hints } = handoffs(g, 0, 4000, 1 / 30);
    const fakes = list.filter((h) => h.fake);
    const rate = fakes.length / list.length;
    assert.ok(rate > 0.17 && rate < 0.33, `seed ${seed}：比例 ${rate.toFixed(3)}（${fakes.length}／${list.length}）`);
    for (let i = 1; i < list.length; i++) assert.ok(!(list[i].fake && list[i - 1].fake), `seed ${seed}：連續兩次假驟降（第 ${list[i].index} 輪）`);
    for (const h of list.slice(1)) {
      if (h.fake) { assert.equal(h.blindFrames, 0, '假驟降沒有盲區'); assert.equal(h.pre, false, '假驟降前沒有 pre_blind'); }
      else { assert.ok(h.blindFrames > 0, '真的交接有盲區'); assert.equal(h.pre, true, '真的交接前有 pre_blind'); }
    }
    const fh = hints.filter((x) => x.a === R.HINTS.fake);
    assert.equal(fh.length, 1, '提示只出一次');
    assert.equal(fh[0].idx, fakes[0].index, '在第一次假驟降時提示');
  }
});

test('8.5 假驟降：nextFake 提早一個循環決定；blindFrom 指向再下一輪；beatsBetween 照常回傳開頭的拍', () => {
  const g = allDown(lvl({ startZone: 3, seed: 2 }));
  let t = 0; g.step(t, {});
  while (!g.cycle.nextFake && t < 2000) { t += 1 / 30; g.step(t, {}); }
  assert.ok(g.cycle.nextFake, '找到假驟降');
  const c = g.cycle, next = t + (1 - c.p) * c.T;
  assert.ok(near(c.blindFrom, next + c.T, 1e-6), '下一段盲區在假驟降的再下一輪');
  const bs = R.beatsBetween(next - 0.01, next + K.BLIND_LEN, g);
  assert.ok(bs.length > 3 && bs.some((b) => b.t >= next && b.t < next + K.BLIND_LEN && b.k === 1), '假驟降開頭 0.6 秒照常有拍');
  // 到了假驟降那一輪：fake = true、nextFake = false（不連續）、blind = false
  while (g.cycle.index === c.index) { t += 1 / 30; g.step(t, {}); }
  assert.equal(g.cycle.fake, true); assert.equal(g.cycle.nextFake, false); assert.equal(g.cycle.blind, false);
  const bs2 = R.beatsBetween(g.cycle.start, g.cycle.start + K.BLIND_LEN, g);
  assert.ok(bs2.length > 3, '這一輪開頭照常有拍');
  // 對照：真的交接，開頭 0.6 秒沒有拍
  while (g.cycle.index === c.index + 1) { t += 1 / 30; g.step(t, {}); }
  assert.equal(g.cycle.fake, false);
  assert.equal(R.beatsBetween(g.cycle.start, g.cycle.start + K.BLIND_LEN - 1e-6, g).length, 0);
});

test('8.5 假驟降：衛兵照常聽得到、衝刺沒有用', () => {
  const g = lvl({ startZone: 3, seed: 2 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 21);    // 在衛兵背後 2 公尺：低頻時在感知範圍內
  let t = 0; g.step(t, {});
  while (!(g.cycle.nextFake && g.cycle.p > 0.9) && t < 2000) { t += 1 / 30; g.step(t, {}); }
  while (!g.cycle.fake) { t += 1 / 30; g.step(t, {}); }
  const s0 = q.susp, x0 = g.player.x;
  g.step(t + 0.05, { mx: -1, dash: true });
  assert.ok(Math.abs(g.player.x - x0) < 0.5, '沒有衝刺');
  run(g, t + 0.05, t + 0.4, () => ({ mx: -0.3 }));
  assert.ok(q.susp > s0, `移動被聽到（疑心 ${s0} → ${q.susp}）`);
  assert.ok(!sfx(g).includes('dash'));
});

test('8.5 假驟降：警戒、追殺中不抽；追殺開始時取消已抽中的', () => {
  const g = allDown(lvl({ startZone: 3, seed: 2 }));
  let t = 0; g.step(t, {});
  while (!g.cycle.nextFake && t < 2000) { t += 1 / 30; g.step(t, {}); }
  g.hunted = true; g.stillT = 0;
  // 直接呼叫內部的 startHunt 不方便：用「警戒中按錯拍」走正常流程
  const h = lvl({ startZone: 3, seed: 2 });
  solo(h, 'g3a', 38, 23, 0); place(h, 38, 24.2);
  let u = 0; h.step(u, {});
  while (!h.cycle.nextFake && u < 2000) { u += 1 / 30; h.step(u, {}); }
  h.step(u + 0.01, { takedown: true });    // 盲區外按 → 起疑
  assert.equal(h.panic.active, true);
  h.step(u + 0.3, { calm: true });         // 不在拍上 → 追殺
  assert.equal(h.hunted, true);
  assert.equal(h.cycle.nextFake, false, '追殺開始時取消');
  const { list } = handoffs(h, u + 0.3, u + 60, 1 / 30, (gg) => { gg.hunted = true; gg.stillT = 0; return {}; });
  assert.ok(list.length > 5 && list.every((x) => !x.fake), '追殺中不出現');
});
