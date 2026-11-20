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

test('低音拍：每 2.4 秒、一個循環 3 拍，錯開半拍避開空檔；±0.15 秒判定（晚按多給 0.05）', () => {
  assert.ok(near(K.CYCLE / K.BASS_PERIOD, 3, 1e-9));
  const g = R.createGame({ t0: T0 });
  const A = g.bass.anchor;
  assert.ok(near(A, T0 + K.BASS_OFFSET, 1e-9));
  for (let c = 1; c < 5; c++) {
    const b = R.bassBeatNear(cs(c), A);
    assert.ok(Math.abs(b.off) >= K.BASS_PERIOD / 2 - 1e-9, '驟降離最近的低音拍半拍遠');
    // 驟降前最後一拍的尾音（約 1.15 秒）在空檔開始前結束
    assert.ok(cs(c) - (b.next - K.BASS_PERIOD) >= 1.15);
  }
  assert.ok(R.bassBeatNear(A + 2.4 + 0.14, A, 2.4, 0.15, 0.05).ok);
  assert.ok(R.bassBeatNear(A + 2.4 + 0.19, A, 2.4, 0.15, 0.05).ok, '晚 0.19 秒還算（延遲寬限）');
  assert.ok(!R.bassBeatNear(A + 2.4 - 0.19, A, 2.4, 0.15, 0.05).ok, '早 0.19 秒不算');
  assert.ok(!R.bassBeatNear(A + 1.2, A, 2.4, 0.15, 0.05).ok);
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
  const A0 = g.bass.anchor, beat = A0 + Math.floor((impact - A0) / K.BASS_PERIOD) * K.BASS_PERIOD;   // 命中前最後一拍
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
  const A0 = g.bass.anchor, beat = A0 + Math.floor((impact - A0) / K.BASS_PERIOD) * K.BASS_PERIOD;
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
  const beat = g.bass.anchor + 2 * K.BASS_PERIOD;
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

// ---------- 暗示階梯（docs/design/2026-11-07-hint-guidance.md 第 1、4、5 節） ----------
const hintsOf = (g) => g.log.filter((e) => e.type === 'hint');

test('暗示文字：五種機制都有第 2 階文字與第 3 階按鍵說明（照設計文件第 4 節）', () => {
  assert.equal(R.HINTS.attack.text, '他舉起長矛時，下一拍就會出手：閃開或屏息。');
  assert.equal(R.HINTS.dodge.text, '聽聲音從哪邊來，往另一邊閃。');
  assert.equal(R.HINTS.gap.text, '鼓聲一斷，才是放箭的時候。');
  assert.equal(R.HINTS.tele.text, '跟著最低的聲音按 Q，你兒子會替你擋。');
  assert.equal(R.HINTS.arrows.text, '箭用完了，地上還有。');
  for (const k in R.HINTS) assert.ok(R.HINTS[k].keys.length > 8, k + ' 有按鍵說明');
});

test('空檔外放箭：第 1 次只有世界內暗示、第 2 次加文字、第 3 次加按鍵；空檔裡放一箭退回第 1 階', () => {
  const g = R.createGame({ t0: T0 });
  runTo(g, cs(1) + 2); calm(g);
  for (let i = 0; i < 3; i++) { const t = cs(1) + 2.2 + i * 0.3; R.step(g, t, { shoot: true, yaw: 2.5, pitch: 0.5 }); calm(g); }
  const h = hintsOf(g).filter((e) => e.key === 'gap');
  assert.deepEqual(h.map((e) => e.level), [1, 2, 3]);
  assert.equal(h[0].text, undefined);
  assert.equal(h[1].text, '鼓聲一斷，才是放箭的時候。'); assert.equal(h[1].keys, undefined);
  assert.ok(/左鍵/.test(h[2].keys));
  runTo(g, cs(2) + 0.1, () => ({})); calm(g);
  R.step(g, cs(2) + 0.15, { shoot: true, yaw: 2.5, pitch: 0.5 });
  const last = hintsOf(g).filter((e) => e.key === 'gap').pop();
  assert.deepEqual([last.level, last.text], [1, undefined], '空檔裡放箭：退回第 1 階');
  assert.equal(R.hintLevel(g.hints, 'gap'), 1);
});

test('按 Q 錯拍：失敗次數往上加；對拍一次退回第 1 階', () => {
  const g = R.createGame({ t0: T0 });
  const A = g.bass.anchor;
  for (let i = 0; i < 3; i++) { runTo(g, A + i * 2.4 + 1.2); calm(g); R.step(g, A + i * 2.4 + 1.21, { tele: true }); }
  assert.deepEqual(hintsOf(g).filter((e) => e.key === 'tele').map((e) => e.level), [1, 2, 3]);
  runTo(g, A + 4 * 2.4); calm(g);
  R.step(g, A + 4 * 2.4 + 0.01, { tele: true, teleAt: A + 4 * 2.4 });
  assert.equal(R.hintLevel(g.hints, 'tele'), 1);
  assert.equal(hintsOf(g).pop().level, 1);
});

test('被攻擊打中：記 attack；按了閃避還是被打中另記 dodge；閃過一次退回第 1 階', () => {
  const g = R.createGame({ t0: T0, seed: 3 });
  let hurt = 0, pressed = false;
  // 什麼都不做，等被打中兩次；第二次在命中前 0.8 秒（太早）按閃避
  while (hurt < 2 && g.time < T0 + 60) {
    const t = g.time + 1 / 30;
    const A = g.attacks.find((a) => !a.done && !a.cancelled);
    const inp = {};
    if (hurt === 1 && A && !pressed && t >= A.impact - 0.8) { inp.dodge = true; pressed = true; }
    R.step(g, t, inp);
    hurt = g.stats.hurts;
  }
  const att = hintsOf(g).filter((e) => e.key === 'attack');
  assert.deepEqual(att.map((e) => e.level), [1, 2]);
  assert.equal(att[1].text, '他舉起長矛時，下一拍就會出手：閃開或屏息。');
  assert.ok(hintsOf(g).some((e) => e.key === 'dodge'), '按了閃避還是被打中 → dodge');
  // 接著閃過一次
  let ok = false;
  const st = {};
  while (!ok && g.phase === 'play' && g.time < T0 + 120) {
    const t = g.time + 1 / 30, A = g.attacks.find((a) => !a.done && !a.cancelled && t >= a.warn);
    const inp = {};
    if (A && !st[A.id] && t >= A.impact - 0.1) { inp.dodge = true; st[A.id] = 1; }
    R.step(g, t, inp);
    ok = g.events.some((e) => e.type === 'dodge_ok');
  }
  assert.ok(ok);
  assert.equal(R.hintLevel(g.hints, 'attack'), 1);
  assert.equal(R.hintLevel(g.hints, 'dodge'), 1);
});

test('箭用完：射光那一下記一次、空箭袋再按放箭再記；撿到箭退回第 1 階', () => {
  const g = R.createGame({ t0: T0 });
  runTo(g, cs(1) + 1); calm(g);
  g.player.arrows = 1;
  R.step(g, cs(1) + 1.1, { shoot: true, yaw: 2.8, pitch: -0.9 }); calm(g);
  R.step(g, cs(1) + 1.2, { shoot: true, yaw: 2.8, pitch: -0.9 }); calm(g);
  R.step(g, cs(1) + 1.3, { shoot: true, yaw: 2.8, pitch: -0.9 }); calm(g);
  const lv = hintsOf(g).filter((e) => e.key === 'arrows').map((e) => e.level);
  assert.deepEqual(lv, [1, 2, 3]);
  assert.equal(hintsOf(g).filter((e) => e.key === 'arrows')[1].text, '箭用完了，地上還有。');
  const a = g.floorArrows[0];
  g.player.x = a.x; g.player.z = a.z;
  R.step(g, cs(1) + 1.4, { pick: true });
  assert.equal(R.hintLevel(g.hints, 'arrows'), 1);
});

test('重來沿用暗示階梯：createGame({hints}) 接著上一局的失敗次數', () => {
  const g = R.createGame({ t0: T0 });
  runTo(g, cs(1) + 2); calm(g);
  R.step(g, cs(1) + 2.1, { shoot: true, yaw: 2.5, pitch: 0.5 });
  const g2 = R.createGame({ t0: 50, hints: g.hints });
  runTo(g2, 50 + K.CYCLE + 2); calm(g2);
  R.step(g2, 50 + K.CYCLE + 2.1, { shoot: true, yaw: 2.5, pitch: 0.5 });
  assert.equal(hintsOf(g2).find((e) => e.key === 'gap').level, 2);
});

test('預備動作：每輪的出手預備落在最高速（p ≥ 0.75）；所有預備（含暴露位置引來的）都不在空檔裡', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = R.createGame({ t0: T0, seed });
    const rng = R.makeRng(seed);
    g.player.hp = 99;                                    // 只看時機，不讓它倒下
    runTo(g, T0 + 80, (t) => (rng() < 0.03 ? { shoot: true, yaw: (rng() - 0.5) * 2, pitch: -0.05 } : { dodge: rng() < 0.05, breath: false }));
    const warns = g.log.filter((e) => e.type === 'attack_warn');
    assert.ok(warns.length > 5);
    for (const w of warns) {
      const A = g.attacks.find((a) => a.id === w.attack);
      assert.ok(!R.inGap(w.t, T0), `種子 ${seed}：預備在空檔裡 ${w.t}`);
      assert.ok(Number.isFinite(w.x) && Number.isFinite(w.z), '預備事件帶出手者位置（立體聲、火把用）');
      if (A && A.reason === 'cycle') assert.ok(R.cycleAt(A.warn, T0).p >= 0.75, `預備相位 ${R.cycleAt(A.warn, T0).p}`);
    }
  }
});

test('程式玩家帶著暗示階梯照樣通關，不會累積到第 2 階', () => {
  let hints;
  for (const seed of [11, 12, 13]) {
    const g = R.createGame({ t0: T0, seed, hints });
    const st = {};
    let t = T0;
    while (t < T0 + 150 && g.phase === 'play') { t += 1 / 15; R.step(g, t, R.botInput(g, t, st)); }
    assert.equal(g.phase, 'win');
    assert.ok(!hintsOf(g).some((e) => e.level >= 2 && e.key !== 'attack'), JSON.stringify(hintsOf(g)));
    hints = g.hints;
  }
});

// ---------- 難度預設與越危險越快（docs/design/2026-11-07-risset-bow-vengeance.md 第 3 節）【改編】 ----------
test('三段難度預設：常數照設計文件；循環一律整數個低音拍；空檔三段都 0.6 秒', () => {
  assert.deepEqual(R.DIFFICULTY_ORDER, ['easy', 'normal', 'hard']);
  const E = R.createGame({ difficulty: 'easy' }).T, N = R.createGame({ difficulty: 'normal' }).T, H = R.createGame({ difficulty: 'hard' }).T;
  // 輕鬆
  assert.equal(E.CYCLE_BEATS, 4); assert.ok(near(E.CYCLE, 9.6)); assert.equal(E.DODGE_EARLY, 0.5);
  assert.equal(E.TWO_ATTACKS_FROM, Infinity); assert.equal(E.ARROWS, 14); assert.equal(E.HP, 4);
  // 標準＝現在的數值
  assert.equal(N.CYCLE_BEATS, 3); assert.ok(near(N.CYCLE, 7.2)); assert.equal(N.DODGE_EARLY, 0.35);
  assert.equal(N.TWO_ATTACKS_FROM, 2); assert.equal(N.ARROWS, 12); assert.equal(N.HP, 3); assert.equal(N.SPREAD_OFF, 0.2);
  // 殘酷
  assert.equal(H.CYCLE_BEATS, 2); assert.ok(near(H.CYCLE, 4.8)); assert.equal(H.DODGE_EARLY, 0.25); assert.equal(H.DODGE_COOL, 0.4);
  assert.equal(H.TWO_ATTACKS_FROM, 1); assert.equal(H.ARROWS, 10); assert.equal(H.HP, 2);
  assert.equal(H.SPREAD_OFF, 0.3); assert.equal(H.PITCH_SPREAD_OFF, 0.15); assert.equal(H.WARN_LEAD, 0.7);
  for (const X of [E, N, H]) {
    assert.equal(X.GAP_LEN, 0.6, '空檔長度不隨難度變');
    assert.equal(X.BASS_PERIOD, 2.4); assert.equal(X.BASS_OFFSET, 1.2);
    assert.ok(near(X.CYCLE / X.BASS_PERIOD, X.CYCLE_BEATS, 1e-9), '循環 = 整數個低音拍');
  }
  // 沒給、給錯 → 標準；R.T 本身不變
  assert.equal(R.createGame({}).difficulty, 'normal');
  assert.equal(R.createGame({ difficulty: 'nightmare' }).difficulty, 'normal');
  assert.equal(R.T.CYCLE, 7.2); assert.equal(R.T.HP, 3);
  const g = R.createGame({ difficulty: 'hard' });
  assert.equal(g.player.hp, 2); assert.equal(g.player.arrows, 10);
  assert.equal(R.createGame({ difficulty: 'easy' }).player.arrows, 14);
});

test('輕鬆：頭目倒了 3 名還是每輪只出手一次；殘酷：倒 1 名就每輪兩次；標準要 2 名', () => {
  function attacksPerCycle(difficulty, downs) {
    const g = R.createGame({ t0: T0, seed: 2, difficulty });
    g.suitors.filter((s) => s.leader).slice(0, downs).forEach((s) => { s.down = true; s.dx = s.x; s.dz = s.z; });
    runTo(g, T0 + g.T.CYCLE + 0.05);
    return g.attacks.filter((A) => A.cycle === 1 && A.reason === 'cycle').length;
  }
  assert.equal(attacksPerCycle('easy', 3), 1);
  assert.equal(attacksPerCycle('normal', 1), 1);
  assert.equal(attacksPerCycle('normal', 2), 2);
  assert.equal(attacksPerCycle('hard', 0), 1);
  assert.equal(attacksPerCycle('hard', 1), 2);
});

test('殘酷：4.8 秒一輪，兩次出手相隔 0.43 秒，冷卻 0.4 秒內兩下都躲得掉；預備仍不在空檔裡', () => {
  const g = R.createGame({ t0: T0, seed: 3, difficulty: 'hard' });
  const s = g.suitors.find((x) => x.id === 'antinous'); s.down = true; s.dx = s.x; s.dz = s.z;
  runTo(g, T0 + 4.8 + 0.05);
  const As = g.attacks.filter((A) => A.cycle === 1).sort((a, b) => a.impact - b.impact);
  assert.equal(As.length, 2);
  assert.ok(near(As[1].impact - As[0].impact, 0.09 * 4.8, 1e-9));
  assert.ok(As[1].impact - As[0].impact > g.T.DODGE_COOL);
  for (const A of As) assert.ok(!R.cycleOf(g, A.warn).gap);
  // 兩下都用 Shift 躲（第一下命中前 0.05、第二下命中前 0.05：相隔 0.43 > 冷卻 0.4）
  const d1 = As[0].impact - 0.05, d2 = As[1].impact - 0.05;
  let p1 = false, p2 = false;
  runTo(g, As[1].impact + 0.3, (x) => {
    if (!p1 && x >= d1) { p1 = true; return { dodge: true, dodgeAt: d1 }; }
    if (!p2 && x >= d2) { p2 = true; return { dodge: true, dodgeAt: d2 }; }
    return {};
  });
  assert.deepEqual(As.map((A) => A.result), ['dodge', 'dodge']);
  assert.equal(g.player.hp, 2);
});

test('固定模式：cycleOf 和 cycleAt 完全一樣，三段難度的循環表都是整數拍、驟降都在低音網格的半拍處', () => {
  for (const difficulty of R.DIFFICULTY_ORDER) {
    const g = R.createGame({ t0: T0, seed: 1, difficulty });
    g.player.hp = 99;
    runTo(g, T0 + 60);
    for (let t = T0 - 1; t < T0 + 65; t += 0.37) {
      const a = R.cycleOf(g, t), b = R.cycleAt(t, T0, g.T);
      assert.equal(a.index, b.index); assert.ok(near(a.p, b.p, 1e-9)); assert.equal(a.gap, b.gap); assert.ok(near(a.start, b.start, 1e-9));
    }
    assert.ok(g.cycles.length >= 6);
    for (const c of g.cycles) {
      assert.ok(near(c.len, g.T.CYCLE, 1e-9));
      const beats = (c.start - T0) / g.T.BASS_PERIOD;
      assert.ok(near(beats, Math.round(beats), 1e-6), '循環起點在低音網格上');
      assert.ok(near(Math.abs(R.bassBeatNear(c.start, g.bass.anchor, g.bass.period).off), 1.2, 1e-6), '驟降離最近的低音拍半拍');
    }
    assert.equal(g.log.filter((e) => e.type === 'cycle').length, g.cycles.length - 1, '每次交接一個 cycle 事件');
  }
});

test('越危險越快：循環拍數 = 基準 − 倒下的頭目數（最少 2 拍），只在交接時換，空檔仍 0.6 秒且在低音網格上', () => {
  const g = R.createGame({ t0: T0, seed: 4, difficulty: 'easy', dynamic: true });
  g.player.hp = 99;
  const BP = g.T.BASS_PERIOD;
  const cur = () => g.cycles[g.cycles.length - 1];
  assert.ok(near(cur().len, 4 * BP), '4 名頭目都站著：基準 4 拍');
  // 第 1 個循環中途放倒 1 名：這一輪長度不變，下一輪才變 3 拍
  runTo(g, cs(1) + 3.0);
  const c1 = cur(); assert.equal(c1.index, 1); assert.ok(near(c1.len, 4 * BP));
  const L = g.suitors.filter((s) => s.leader);
  L[0].down = true; L[0].dx = L[0].x; L[0].dz = L[0].z;
  runTo(g, c1.start + 4 * BP - 0.1);
  assert.ok(near(cur().len, 4 * BP), '這一輪還沒結束，長度不變');
  assert.ok(near(R.cycleOf(g, c1.start + 4 * BP + 0.1).len, 3 * BP), '還沒交接前，估下一輪 3 拍');
  runTo(g, c1.start + 4 * BP + 0.1);
  const c2 = cur(); assert.equal(c2.index, 2); assert.ok(near(c2.len, 3 * BP), '交接後 3 拍');
  assert.ok(near(c2.start, c1.start + 4 * BP, 1e-9), '交接點就是上一輪的結尾');
  const ev = g.log.filter((e) => e.type === 'cycle').pop();
  assert.equal(ev.index, 2); assert.ok(near(ev.len, 3 * BP)); assert.equal(ev.beats, 3);
  // 再倒 1 名 → 2 拍；再倒 1 名 → 仍 2 拍（最短）
  L[1].down = true; L[1].dx = L[1].x; L[1].dz = L[1].z;
  runTo(g, c2.start + 3 * BP + 0.1);
  assert.ok(near(cur().len, 2 * BP));
  L[2].down = true; L[2].dx = L[2].x; L[2].dz = L[2].z;
  runTo(g, cur().start + 2 * BP + 0.1);
  assert.ok(near(cur().len, 2 * BP), '最短 2 拍');
  // 空檔：每個循環開頭 0.6 秒，驟降在低音網格的半拍處，網格不中斷
  for (const c of g.cycles) {
    if (c.index === 0) continue;
    assert.ok(R.cycleOf(g, c.start + 0.59).gap); assert.ok(!R.cycleOf(g, c.start + 0.61).gap); assert.ok(!R.cycleOf(g, c.start - 0.01).gap);
    const beats = (c.start - T0) / BP;
    assert.ok(near(beats, Math.round(beats), 1e-6));
    assert.ok(near(Math.abs(R.bassBeatNear(c.start, g.bass.anchor, g.bass.period).off), BP / 2, 1e-6));
    assert.ok(near(c.len / BP, Math.round(c.len / BP), 1e-9), '永遠整數拍');
  }
  // 相位在交接前後連續：交接前一刻 p → 1，交接後 p → 0
  const c3 = g.cycles[3];
  assert.ok(R.cycleOf(g, c3.start - 1e-4).p > 0.999); assert.ok(R.cycleOf(g, c3.start + 1e-4).p < 0.001);
  // 標準：3 → 2 → 2；殘酷：永遠 2
  assert.ok(near(R.cycleLenFor(R.createGame({ difficulty: 'normal', dynamic: true })), 3 * BP));
  assert.ok(near(R.cycleLenFor(R.createGame({ difficulty: 'hard', dynamic: true })), 2 * BP));
  const gn = R.createGame({ difficulty: 'normal', dynamic: true });
  gn.suitors.filter((s) => s.leader)[0].down = true;
  assert.ok(near(R.cycleLenFor(gn), 2 * BP));
  gn.suitors.filter((s) => s.leader)[1].down = true;
  assert.ok(near(R.cycleLenFor(gn), 2 * BP));
  // 沒開動態：倒再多也不變
  const gs = R.createGame({ difficulty: 'normal' });
  gs.suitors.filter((s) => s.leader).forEach((s) => { s.down = true; });
  assert.ok(near(R.cycleLenFor(gs), 3 * BP));
});

test('越危險越快：攻擊的預備與命中都照各輪的實際長度排，命中在最高速、預備不在空檔，Risset 拍與低音不衝突', () => {
  for (const difficulty of ['easy', 'normal']) {
    const g = R.createGame({ t0: T0, seed: 5, difficulty, dynamic: true });
    g.player.hp = 99;
    const st = {};
    let t = T0;
    while (t < T0 + 120 && g.phase === 'play') { t += 1 / 15; R.step(g, t, R.botInput(g, t, st)); }
    assert.equal(g.phase, 'win');
    const lens = new Set(g.cycles.map((c) => Math.round(c.len / g.T.BASS_PERIOD)));
    assert.ok(lens.has(2), `${difficulty}：最後縮到 2 拍 ${[...lens]}`);
    assert.ok(lens.size >= 2, '循環長度有變過');
    const byIndex = new Map(g.cycles.map((c) => [c.index, c]));
    for (const A of g.attacks) {
      if (A.reason !== 'cycle') continue;
      const c = byIndex.get(A.cycle);
      assert.ok(c, '每次出手都屬於某個已交接的循環');
      const p = (A.impact - c.start) / c.len;
      assert.ok(p >= 0.87 && p <= 0.98, `命中相位 ${p.toFixed(3)} 在這一輪的最高速`);
    }
    for (const w of g.log.filter((e) => e.type === 'attack_warn')) assert.ok(!R.cycleOf(g, w.t).gap, '預備不在空檔');
    assert.equal(g.stats.offShots, 0, '程式玩家每箭都在空檔');
  }
});

test('程式玩家三段難度各 50 局：完美玩家都能贏；熟練度 0.6 的玩家輕鬆明顯高於殘酷（印出勝率給設計文件用）', () => {
  function play(difficulty, dynamic, seed, skill) {
    const g = R.createGame({ t0: T0, seed, difficulty, dynamic });
    const st = {}, jitter = R.makeRng(seed * 31);
    let t = T0;
    while (t < T0 + 240 && g.phase === 'play') { t += 1 / 15 + jitter() * 0.08; R.step(g, t, R.botInput(g, t, st, { skill, seed })); }
    return g;
  }
  const N = 50, out = {};
  for (const skill of [1, 0.6]) for (const dynamic of [false, true]) for (const d of R.DIFFICULTY_ORDER) {
    let wins = 0, time = 0, hurts = 0;
    for (let s = 1; s <= N; s++) { const g = play(d, dynamic, s, skill); if (g.phase === 'win') { wins++; time += g.stats.winAt; } hurts += g.stats.hurts; }
    out[`${d}/${dynamic ? 'dyn' : 'fix'}/skill${skill}`] = { wins, avgTime: wins ? +(time / wins).toFixed(1) : null, avgHurts: +(hurts / N).toFixed(2) };
  }
  console.log('勝率（50 局）：' + JSON.stringify(out));
  for (const d of R.DIFFICULTY_ORDER) assert.equal(out[`${d}/fix/skill1`].wins, N, `完美玩家在${d}應全勝`);
  const e = out['easy/fix/skill0.6'].wins, n = out['normal/fix/skill0.6'].wins, h = out['hard/fix/skill0.6'].wins;
  assert.ok(e >= n && n >= h, `勝率應遞減：${e} ≥ ${n} ≥ ${h}`);
  assert.ok(e - h >= 15, `輕鬆要明顯高於殘酷（差 ${e - h} 局）`);
  assert.ok(h >= 5, `殘酷不該完全贏不了（${h}）`);
  assert.ok(out['normal/dyn/skill1'].avgTime < out['normal/fix/skill1'].avgTime, '開「越危險越快」通關更快');
});
