// 執行：node --test prototypes/troy-prologue/risset.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./risset.js');

const K = R.T;
const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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
  const g = R.createLevel({ t0: 1.5, startZone: 2 });
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
  const g = R.createLevel({ t0: 0.2, startZone: 2 });
  g.step(3.0, {});
  assert.ok(near(g.bass.nextBeat, 5.0));
  assert.equal(g.bass.period, 2.4);
});

test('BLIND_LEN 可調：createLevel 的 opts.T 改了，盲區長度跟著改', () => {
  const g = R.createLevel({ startZone: 2, T: { BLIND_LEN: 1.0 } });
  g.step(10.9, {});
  assert.equal(g.cycle.blind, true);
  assert.equal(g.T.BLIND, 1.0);
  g.step(11.1, {});
  assert.equal(g.cycle.blind, false);
});

test('盲區預告：盲區前 0.4 秒發一次 sfx pre_blind，每個循環一次', () => {
  assert.equal(K.PRE_BLIND, 0.4);
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
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
    let t = t0;
    g.guards.forEach((q) => { q.state = 'down'; q.active = false; });
    let breathAt = null;
    for (const e of g.drain()) if (e.type === 'hint' && /屏住呼吸/.test(e.a)) breathAt = t0;
    assert.equal(breathAt, t0);
    while (t < 40) {
      t += DT; g.step(t, {});
      for (const e of g.drain()) if (e.type === 'hint' && e.a === R.HINTS.blind) blindHints.push(t);
    }
    assert.equal(blindHints.length, 1, '盲區提示出一次');
    assert.ok(blindHints[0] - t0 >= K.HINT_GAP, `start ${startT}：盲區提示在 ${blindHints[0]}`);
    assert.ok(R.cycleIndex(blindHints[0], 0, K) > R.cycleIndex(t0, 0, K));
    assert.ok(R.inBlind(blindHints[0], 0, K));
  }
});

// ---------------- 機制 A：屏息、移動、盲區、衝刺 ----------------

test('屏息：不能移動、最多 6 秒，超過就喘氣（大聲），放開後恢復', () => {
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 12, 0); // 7 m 外，背對
  place(g, 25, 19);
  g.step(15, {});
  run(g, 15, 21.1, () => ({ breath: true })); // 21 秒喘氣時 p = 0.1
  assert.equal(q.state, 'suspicious');
  assert.equal(g.panic.active, true);

  const h = R.createLevel({ startZone: 2 });
  const q2 = solo(h, 'g2a', 25, 12, 0);
  place(h, 25, 19);
  h.step(1.5, {});
  run(h, 1.5, 7.6, () => ({ breath: true }));
  assert.equal(q2.state, 'hunted');
  assert.equal(h.hunted, true);
});

test('高頻（p > 0.6）在衛兵範圍內移動 = 立刻追殺', () => {
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0); // 3 m，背對，靠聽覺
  place(g, 25, 19);
  g.step(7, {});
  g.step(7 + DT, { mx: 1 });
  assert.equal(q.state, 'hunted');
  assert.equal(g.hunted, true);
  assert.equal(g.alarm, 1);
});

test('高頻時在範圍外移動、或屏息不動且不在視野內，都不會被發現', () => {
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 21, Math.PI); // 背對玩家（朝 +z）
  place(g, 25, 19);
  g.step(3, {});
  run(g, 3, 3.5, () => ({ mx: 1 }));
  assert.equal(q.state, 'patrol');
  assert.ok(q.susp > 0.3 && q.susp < 0.6, `susp=${q.susp}`);
  run(g, 3.5, 4.2, () => ({ mx: -1 }));
  assert.equal(q.state, 'suspicious');
  assert.equal(g.panic.active, true);
});

test('站著不動但被看到（不在陰影、在視野與範圍內）也會累積疑心；陰影裡看不到', () => {
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0); // 面向 −z，正對玩家
  place(g, 25, 19);
  g.step(5, {});
  run(g, 5, 7, () => ({ breath: true }));
  assert.ok(q.susp > 0.5, '被看到，屏息也沒用');
  const h = R.createLevel({ startZone: 2 });
  const q2 = solo(h, 'g2a', 17, 23, R.yawTo(0, 1)); // 面向 +z，看著南側拱廊
  place(h, 17, 25.5);
  h.step(5, {});
  run(h, 5, 7, () => ({ breath: true }));
  assert.equal(h.player.hidden, true);
  assert.ok(q2.susp < 1e-9, '陰影裡看不到');
});

test('盲區：感知是 0，貼著衛兵走也沒事', () => {
  const g = R.createLevel({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 20, 0);
  place(g, 25, 19);
  g.step(9.99, { breath: true });
  run(g, 10.0, 10.48, () => ({ mx: 1 }));
  assert.equal(q.state, 'patrol');
  assert.equal(q.susp, 0);
});

test('衝刺：只能在盲區、每個盲區一次，衝 3 公尺', () => {
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 25, 9.5); // 神殿南牆 z = 8
  g.step(10.1, {});
  g.step(10.1 + DT, { dash: true, mz: -1 });
  assert.ok(g.player.z >= 8 + K.BODY_R - 1e-9);
});

// ---------------- 致命一擊 ----------------

test('致命一擊：盲區內、背後 1.5 m 內 → 衛兵倒下', () => {
  const g = R.createLevel({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0); // 面向 −z
  place(g, 38, 24.2); // 在他背後
  g.step(10.1, {});
  g.step(10.1 + DT, { takedown: true });
  assert.equal(q.state, 'down');
  assert.equal(q.active, false);
  assert.ok(sfx(g).includes('takedown'));
});

test('致命一擊：盲區外按 → 那名衛兵立刻起疑（進入恐慌共振）', () => {
  const g = R.createLevel({ startZone: 3 });
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
  const g = R.createLevel({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 21.9); // 在他面前
  g.step(10.1, {});
  g.step(10.1 + DT, { takedown: true });
  assert.equal(q.state, 'suspicious');
  const h = R.createLevel({ startZone: 3 });
  const q2 = solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 25);
  h.step(10.1, {});
  h.step(10.1 + DT, { takedown: true });
  assert.equal(q2.state, 'patrol');
});

// ---------------- 機制 B：恐慌共振 ----------------

/** 讓 g3a 在 t=3 起疑（盲區外暗殺失敗），回傳 {g, q, beats}。 */
function panicSetup() {
  const g = R.createLevel({ startZone: 3 });
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
  const g = R.createLevel({ startZone: 3 });
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
  const e = R.createLevel({ startZone: 3 });
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

  const h = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 3 });
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
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 1 });
  const q = g.guards.find((x) => x.id === 'g1');
  assert.equal(q.active, true);
  g.step(7, {});
  q.x = 6; q.z = 15;
  g.step(7 + DT, { mx: 1 });
  assert.equal(g.phase, 'fail');
  assert.match(g.failReason, /木馬/);
});

test('木馬腹中：玩家在 2.5 m 高，衛兵就在正下方也有 2.5 m 距離；走到暗門就下到廣場', () => {
  const g = R.createLevel({ startZone: 1 });
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
  const g = R.createLevel({ startZone: 4 });
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
  const g = R.createLevel({ startZone: 4 });
  const q = solo(g, 'g4b', 52, 15 - 3, 0);
  const L = g.level.gate.latch;
  place(g, L.x - 0.5, L.z);
  g.step(7, {});
  g.step(7 + DT, { interact: true });
  assert.equal(q.state, 'hunted');
});

test('城門：累積約 3 個循環的低頻推門 → 城門打開、過關', () => {
  const g = R.createLevel({ startZone: 4 });
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
  const g = R.createLevel({ startZone: 2 });
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
  const g = R.createLevel({ startZone: 3 });
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
  const g = R.createLevel({ startZone: 4 });
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
  const g = R.createLevel({ startZone: 2 });
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
  g.step(t, {});
  g.step(t, { start: true });
  while (g.phase !== 'win' && t < 600) {
    t += jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : DT;
    g.step(t, bot(g));
    for (const e of g.drain()) if (e.type === 'sfx') sounds[e.a] = (sounds[e.a] || 0) + 1;
    if (g.phase === 'fail') { fails.push(g.zone + ' ' + g.failReason); g.retry(); }
  }
  return { g, t, fails, sounds };
}

test('程式玩家用固定策略通關整關（不同 t0、種子、不穩定幀率）', () => {
  const cases = [[1, 0, false], [2, 3.7, false], [3, 8.2, true], [4, 5.5, true], [5, 1.1, true]];
  for (const [seed, t0, jitter] of cases) {
    const { g, t, fails, sounds } = playthrough(seed, t0, jitter);
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
  }
});
