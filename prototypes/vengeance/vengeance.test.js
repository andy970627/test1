// 大廳復仇規則測試：node --test prototypes/vengeance/vengeance.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./vengeance.js');
const K = R.T;

const T0 = 1;
const cs = (c) => T0 + c * K.CYCLE;          // 第 c 個循環開始的時間
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 把遊戲推進到時間 t（每 1/30 秒一步，不給輸入）
function runTo(g, t, inputFn) {
  let x = g.time;
  while (x < t - 1e-9) { x = Math.min(t, x + 1 / 30); R.step(g, x, inputFn ? inputFn(x) : {}); }
  return g;
}
// 把指定的攻擊全部取消，方便單獨測其他規則
function calm(g) { for (const A of g.attacks) A.cancelled = true; }
function aimAt(g, id, t) {
  const s = g.suitors.find((x) => x.id === id), P = g.player, q = R.suitorPos(g, s, t);
  const dx = q.x - P.x, dz = q.z - P.z, d = Math.hypot(dx, dz);
  return { yaw: R.yawTo(dx, dz), pitch: Math.atan((K.CHEST_Y - K.EYE_Y) / d) };
}

// ---------- 循環與空檔 ----------
test('循環：相位、序號、空檔只在第 1 個循環起的開頭 0.6 秒', () => {
  assert.equal(K.CYCLE, 7.2);
  assert.equal(K.GAP_LEN, 0.6);
  const c0 = R.cycleAt(T0 + 0.1, T0);
  assert.equal(c0.index, 0); assert.equal(c0.gap, false, '第 0 個循環沒有驟降');
  const a = R.cycleAt(cs(1) + 0.01, T0);
  assert.equal(a.index, 1); assert.ok(a.gap); assert.ok(near(a.p, 0.01 / 7.2, 1e-9));
  assert.ok(R.inGap(cs(3) + 0.59, T0));
  assert.ok(!R.inGap(cs(3) + 0.61, T0));
  assert.ok(!R.inGap(cs(3) - 0.01, T0), '驟降前一刻是最高速，不是空檔');
  assert.ok(near(R.cycleAt(cs(2) + 3.6, T0).p, 0.5, 1e-9));
  assert.equal(R.cycleAt(T0 - 1, T0).index, -1);
  const gs = R.gapsBetween(T0, cs(4), T0);
  assert.deepEqual(gs.map((x) => +x[0].toFixed(6)), [cs(1), cs(2), cs(3), cs(4)].map((v) => +v.toFixed(6)));
});

test('低音拍：每 2.4 秒，驟降剛好落在低音拍上；±0.15 秒判定（晚按多給 0.05）', () => {
  assert.ok(near(K.CYCLE / K.BASS_PERIOD, 3, 1e-9));
  for (let c = 1; c < 5; c++) assert.ok(near(R.bassBeatNear(cs(c), T0).off, 0, 1e-9));
  assert.ok(R.bassBeatNear(T0 + 2.4 + 0.14, T0, 2.4, 0.15, 0.05).ok);
  assert.ok(R.bassBeatNear(T0 + 2.4 + 0.19, T0, 2.4, 0.15, 0.05).ok, '晚 0.19 秒還算（延遲寬限）');
  assert.ok(!R.bassBeatNear(T0 + 2.4 - 0.19, T0, 2.4, 0.15, 0.05).ok, '早 0.19 秒不算');
  assert.ok(!R.bassBeatNear(T0 + 3.6, T0, 2.4, 0.15, 0.05).ok);
});

test('Risset 拍：空檔裡不排，每層每循環整數拍，交接處音量連續', () => {
  const bs = R.beatsBetween(cs(1), cs(3), T0);
  assert.ok(bs.length > 50);
  for (const b of bs) assert.ok(!R.inGap(b.t, T0), '空檔裡不該有拍 ' + b.t);
  assert.equal(R.beatPhases(0).length, 7);
  assert.equal(R.beatPhases(3).length, 56);
  // 第 k 層 p = 1 的音量 = 第 k+1 層 p = 0 的音量
  for (let k = 0; k < 3; k++) assert.ok(near(R.layerGain(k, 1), R.layerGain(k + 1, 0), 1e-12));
  // 第 0 個循環開頭有拍（還沒驟降）
  assert.ok(R.beatsBetween(T0, T0 + 0.6, T0).length > 0);
});

// ---------- 逼近 ----------
test('求婚者：節奏越快越近，空檔凍結在最近處', () => {
  const g = R.createGame({ t0: T0, seed: 3 });
  const s = g.suitors.find((x) => x.id === 'antinous');
  const d = (t) => { const q = R.suitorPos(g, s, t); return Math.hypot(q.x - g.player.x, q.z - g.player.z); };
  const d1 = d(cs(1) + 1.0), d2 = d(cs(1) + 4.0), d3 = d(cs(1) + 7.0), dg = d(cs(2) + 0.3);
  assert.ok(d1 > d2 && d2 > d3, `越來越近：${d1.toFixed(2)} > ${d2.toFixed(2)} > ${d3.toFixed(2)}`);
  assert.ok(dg <= d3 + 1e-9, '空檔裡在最近處');
  assert.ok(dg >= K.MIN_DIST - 1e-9, '不會貼到玩家身上');
  assert.ok(near(d(cs(2) + 0.1), d(cs(2) + 0.5), 1e-9), '空檔裡不動');
});

// ---------- 射箭 ----------
test('空檔內射箭：照瞄準方向命中，一個空檔只能一箭', () => {
  const g = R.createGame({ t0: T0, seed: 5 });
  runTo(g, cs(1) + 0.1); calm(g);
  const t = g.time, a = aimAt(g, 'antinous', t);
  R.step(g, t + 0.02, { shoot: true, yaw: a.yaw, pitch: a.pitch });
  const ev = g.events.find((e) => e.type === 'shoot');
  assert.ok(ev.gap);
  assert.ok(g.events.some((e) => e.type === 'down' && e.id === 'antinous'), '傲慢的安提諾俄斯倒下');
  assert.equal(g.player.arrows, 11);
  assert.ok(!g.events.some((e) => e.type === 'exposed'), '空檔內放箭不暴露');
  R.step(g, t + 0.2, { shoot: true, yaw: a.yaw, pitch: a.pitch });
  assert.ok(g.events.some((e) => e.type === 'bow_busy'));
  assert.equal(g.player.arrows, 11, '同一個空檔第二箭不射出、不扣箭');
});

test('空檔外射箭：大多失準，而且暴露位置（多一次擲矛）', () => {
  let hitGap = 0, hitOff = 0, exposed = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    for (const gap of [true, false]) {
      const g = R.createGame({ t0: T0, seed: 100 + i });
      const t = gap ? cs(1) + 0.3 : cs(1) + 3.0;
      runTo(g, t - 0.02); calm(g);
      // 瞄準沒被擋住的頭目；算「射中想射的人」
      const a = R.pickTarget(g, t);
      R.step(g, t, { shoot: true, yaw: a.yaw, pitch: a.pitch });
      const ev = g.events.find((e) => e.type === 'shoot');
      assert.equal(ev.gap, gap);
      const hit = ev.target === a.id;
      if (gap) hitGap += hit ? 1 : 0;
      else { hitOff += hit ? 1 : 0; if (g.events.some((e) => e.type === 'exposed')) exposed++; }
    }
  }
  assert.equal(hitGap, N, '空檔內每箭都中想射的人');
  assert.ok(hitOff / N < 0.5, `空檔外射中想射的人的比率 ${(hitOff / N * 100).toFixed(0)}% 應低於 50%`);
  assert.equal(exposed, N, '空檔外每一箭都暴露位置');
});

test('暴露位置的擲矛不會落在空檔裡', () => {
  const g = R.createGame({ t0: T0, seed: 9 });
  const t = cs(1) - 1.0;            // 1.3 秒後剛好是第 2 循環的空檔
  runTo(g, t - 0.02); calm(g);
  R.step(g, t, { shoot: true, yaw: 0, pitch: 0.5 });
  const ex = g.events.find((e) => e.type === 'exposed');
  assert.ok(ex);
  assert.ok(!R.inGap(ex.impact, T0), '擲矛延到空檔之後');
});

test('桌板當盾：歐律馬科斯第一箭釘在桌板上，第二箭才倒下', () => {
  const g = R.createGame({ t0: T0, seed: 2 });
  const s = g.suitors.find((x) => x.id === 'eurymachus');
  // 把擋路的人先放倒，只測桌板
  for (const o of g.suitors) if (o.id !== 'eurymachus') { o.down = true; o.dx = 99; o.dz = 99; }
  s.leader = true;
  for (let c = 1; c <= 2; c++) {
    runTo(g, cs(c) + 0.1); calm(g);
    const a = aimAt(g, 'eurymachus', g.time);
    R.step(g, g.time + 0.01, { shoot: true, yaw: a.yaw, pitch: a.pitch });
    if (c === 1) {
      assert.ok(g.events.some((e) => e.type === 'shield_hit'));
      assert.ok(!s.down);
      assert.equal(g.floorArrows.length, 1, '釘在桌板上的箭掉在地上可以撿');
    } else assert.ok(s.down);
  }
});

// ---------- 閃避、屏息、忒勒馬科斯 ----------
function withAttack(type, seed = 4) {
  const g = R.createGame({ t0: T0, seed });
  runTo(g, cs(1) + 0.7);
  calm(g);
  const impact = cs(1) + 0.9 * K.CYCLE;
  g.attacks.push({ id: 999, by: 'antinous', type, warn: impact - K.WARN_LEAD, impact, warned: false, done: false, cancelled: false, cycle: 1 });
  return { g, impact };
}
const result = (g) => (g.attacks.find((A) => A.id === 999) || {}).result;

test('擲矛：命中前 0.35 秒內按 Shift 閃過；太早按會受傷', () => {
  let { g, impact } = withAttack('spear');
  runTo(g, impact - 0.2, (x) => (x >= impact - 0.2 - 1e-9 ? { dodge: true } : {}));
  runTo(g, impact + 0.3);
  assert.equal(result(g), 'dodge');
  assert.equal(g.player.hp, K.HP);

  ({ g, impact } = withAttack('spear'));
  let pressed = false;
  runTo(g, impact + 0.3, (x) => { if (!pressed && x >= impact - 0.6) { pressed = true; return { dodge: true }; } return {}; });
  assert.equal(result(g), 'hurt');
  assert.equal(g.player.hp, K.HP - 1);
});

test('撲上來：提早屏息（空白鍵按住）讓他撲空；擲矛不能用屏息躲', () => {
  let { g, impact } = withAttack('lunge');
  runTo(g, impact + 0.3, (x) => ({ breath: x >= impact - 0.5 }));
  assert.equal(result(g), 'breath');
  ({ g, impact } = withAttack('lunge'));
  runTo(g, impact + 0.3, (x) => ({ breath: x >= impact - 0.05 }));
  assert.equal(result(g), 'hurt', '太晚才憋氣');
  ({ g, impact } = withAttack('spear'));
  runTo(g, impact + 0.3, (x) => ({ breath: x >= impact - 0.5 }));
  assert.equal(result(g), 'hurt', '屏息躲不了擲矛');
});

test('屏息太久會喘氣，暴露位置', () => {
  const g = R.createGame({ t0: T0, seed: 8 });
  runTo(g, T0 + 0.5);
  const evs = [];
  runTo(g, T0 + 5.0, () => { return { breath: true }; });
  // runTo 每步都清 events，所以改看 log
  assert.ok(g.log.some((e) => e.type === 'gasp'));
  assert.ok(g.log.some((e) => e.type === 'exposed' && e.why === 'gasp'));
  assert.ok(g.player.breathLock);
  void evs;
});

test('忒勒馬科斯：低音拍 ±0.15 秒按 Q 舉盾，擋下一次攻擊', () => {
  const { g, impact } = withAttack('spear');
  const beat = T0 + Math.floor((impact - T0) / K.BASS_PERIOD) * K.BASS_PERIOD;   // 命中前最後一拍
  runTo(g, beat + 0.1);
  R.step(g, beat + 0.12, { tele: true, teleAt: beat + 0.12 });
  assert.ok(g.events.some((e) => e.type === 'tele_ok'));
  assert.ok(g.tele.until >= impact);
  runTo(g, impact + 0.3);
  assert.equal(result(g), 'block');
  assert.equal(g.player.hp, K.HP);
  assert.ok(g.tele.coolUntil > impact, '盾被撞開，要冷卻');
  // 冷卻中再按 Q：忙不過來
  R.step(g, g.time + 0.01, { tele: true });
  assert.ok(g.events.some((e) => e.type === 'tele_busy'));
});

test('忒勒馬科斯：按錯拍盾放下、沒擋住', () => {
  const { g, impact } = withAttack('spear');
  const beat = T0 + Math.floor((impact - T0) / K.BASS_PERIOD) * K.BASS_PERIOD;
  runTo(g, beat + 0.1);
  R.step(g, beat + 0.12, { tele: true, teleAt: beat + 0.12 });
  const mid = beat + 0.6;
  runTo(g, mid - 0.01);
  R.step(g, mid, { tele: true, teleAt: mid });
  assert.ok(g.events.some((e) => e.type === 'tele_miss'));
  runTo(g, impact + 0.3);
  assert.equal(result(g), 'hurt');
});

test('忒勒馬科斯：判定用 teleAt（按鍵當下的音訊時間），不是幀時間', () => {
  const g = R.createGame({ t0: T0, seed: 1 });
  const beat = T0 + 2 * K.BASS_PERIOD;
  runTo(g, beat - 0.5);
  R.step(g, beat + 0.3, { tele: true, teleAt: beat + 0.05 });   // 幀晚到 0.3 秒，但按鍵在 +0.05
  assert.ok(g.events.some((e) => e.type === 'tele_ok'));
});

// ---------- 箭數與撿箭 ----------
test('箭 12 支，射完不能射；走過去按 E 撿起附近的箭', () => {
  const g = R.createGame({ t0: T0, seed: 6 });
  assert.equal(g.player.arrows, 12);
  runTo(g, T0 + 0.5);
  let t = g.time;
  for (let i = 0; i < 12; i++) { t += 0.05; R.step(g, t, { shoot: true, yaw: 0, pitch: -0.5 }); calm(g); }   // 射向地面
  assert.equal(g.player.arrows, 0);
  assert.equal(g.floorArrows.length, 12);
  t += 0.05; R.step(g, t, { shoot: true, yaw: 0, pitch: -0.5 });
  assert.ok(g.events.some((e) => e.type === 'empty'));
  for (const a of g.floorArrows) {
    assert.ok(a.x >= K.ZONE.x0 && a.x <= K.ZONE.x1 && a.z >= K.ZONE.z0 && a.z <= K.ZONE.z1, '箭落在走得到的地方');
  }
  // 站在原地撿不到（太遠）
  const far = g.floorArrows.every((a) => Math.hypot(a.x - g.player.x, a.z - g.player.z) > K.PICK_R);
  if (far) { t += 0.05; R.step(g, t, { pick: true }); assert.ok(g.events.some((e) => e.type === 'pick_none')); }
  // 走到箭旁邊撿
  const target = g.floorArrows[0];
  while (Math.hypot(target.x - g.player.x, target.z - g.player.z) > 0.5) {
    const dx = target.x - g.player.x, dz = target.z - g.player.z, d = Math.hypot(dx, dz);
    t += 0.05; R.step(g, t, { mx: dx / d, mz: dz / d }); calm(g);
  }
  t += 0.05; R.step(g, t, { pick: true });
  const ev = g.events.find((e) => e.type === 'pick');
  assert.ok(ev && ev.n >= 1);
  assert.equal(g.player.arrows, ev.n);
  assert.equal(g.floorArrows.length, 12 - ev.n);
});

test('走路限制在門檻前', () => {
  const g = R.createGame({ t0: T0, seed: 6 });
  runTo(g, T0 + 6, () => ({ mx: 0, mz: -1 }));
  assert.ok(near(g.player.z, K.ZONE.z0, 1e-9));
});

// ---------- 勝負 ----------
test('勝利：四名頭目倒下，其餘投降', () => {
  const g = R.createGame({ t0: T0, seed: 1 });
  runTo(g, cs(1) + 0.1); calm(g);
  for (const s of g.suitors) if (s.leader && s.id !== 'antinous') { s.down = true; s.dx = s.x; s.dz = s.z; }
  const a = aimAt(g, 'antinous', g.time);
  R.step(g, g.time + 0.01, { shoot: true, yaw: a.yaw, pitch: a.pitch });
  assert.equal(g.phase, 'win');
  assert.ok(g.events.some((e) => e.type === 'surrender'));
  assert.ok(g.suitors.filter((s) => !s.down).every((s) => s.surrender), '其餘的人投降');
  assert.ok(g.suitors.filter((s) => !s.leader).some((s) => !s.down), '不用殺光所有人');
});

test('失敗：被擊中 3 次倒下（之後不再推進）', () => {
  const g = R.createGame({ t0: T0, seed: 3 });
  runTo(g, cs(5));          // 不做任何事，挨打
  assert.equal(g.phase, 'fail');
  assert.equal(g.player.hp, 0);
  assert.ok(g.log.some((e) => e.type === 'fall'));
  const ev = g.log.length;
  runTo(g, cs(6));
  assert.equal(g.log.length, ev);
});

// ---------- 程式玩家 ----------
test('程式玩家（只在空檔射箭、照低音按 Q、看預備動作躲）能通關，而且每箭都在空檔', () => {
  const times = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const g = R.createGame({ t0: T0, seed });
    const st = {}, jitter = R.makeRng(seed * 31);
    let t = T0;
    while (t < T0 + 150 && g.phase === 'play') {
      t += 1 / 15 + jitter() * 0.08;                      // 模擬無頭瀏覽器 8～15 fps 的不穩幀率
      R.step(g, t, R.botInput(g, t, st));
    }
    assert.equal(g.phase, 'win', `種子 ${seed}：${g.phase}，${JSON.stringify(g.stats)}`);
    assert.equal(g.stats.offShots, 0);
    assert.ok(g.stats.teleOk > 0 && g.stats.teleMiss === 0, '照低音按 Q 都對拍');
    assert.ok(g.stats.blocks > 0, '忒勒馬科斯有擋到');
    times.push(g.stats.winAt);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  assert.ok(avg < 90, `平均通關 ${avg.toFixed(1)} 秒，錄音 90 秒內要能錄完`);
});

test('只會亂射、不躲的玩家會輸', () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = R.createGame({ t0: T0, seed });
    const rng = R.makeRng(seed);
    let t = T0;
    while (t < T0 + 120 && g.phase === 'play') {
      t += 1 / 15;
      const tg = R.pickTarget(g, t);
      R.step(g, t, rng() < 0.03 && tg ? { shoot: true, yaw: tg.yaw, pitch: tg.pitch } : {});
    }
    if (g.phase === 'win') wins++;
  }
  assert.ok(wins <= 1, `亂射贏了 ${wins} 次`);
});
