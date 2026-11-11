// 執行：node --test prototypes/troy-prologue/risset.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./risset.js');

const K = R.T;
const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** 舊規則測試用：固定 10 秒循環（T.DYNAMIC = false），時間點和第 6.2 節一樣好算。 */
/** 11/10 起 T.COVER_MODE 預設 true（殘響掩護）。既有測試是舊盲區版的回歸測試，一律用 COVER_MODE = false；新版另外寫（檔尾）。 */
const OLD = { COVER_MODE: false };
/** 舊模式的提示文字（OH／OL 是預設常數產生的，現在是殘響掩護版）。 */
const OH = R.hintsFor(Object.assign({}, R.T, OLD));
const OL = R.hintLadderFor(Object.assign({}, R.T, OLD));
const lvl = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({ DYNAMIC: false }, OLD, o.T || {}) }));
/** 舊盲區版、動態循環（原本直接呼叫 R.createLevel 的測試）。 */
const dynLvl = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({}, OLD, o.T || {}) }));

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
const moveHighTwice = (g, t, input) => { g.step(t, {}); g.step(t + DT, input || { mx: 1 }); g.step(t + DT * 2, input || { mx: 1 }); };

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

test('11/09 4A 常數：ESCAPE_STILL、R_BASE、R_GAIN 與新增常數存在且有限', () => {
  assert.equal(K.ESCAPE_STILL, 6);
  assert.equal(K.R_BASE, 3);
  assert.equal(K.R_GAIN, 10);
  assert.ok(near(R.radiusAt(1, false, K), 13));
  for (const key of ['DASH_HUNT', 'HUNT_STEP_ESCAPE', 'HUNT_SLOW_MUL', 'HUNT_SLOW_DUR', 'ALERTED_DURATION', 'ALERTED_SUSP', 'FIRE_BASE', 'FIRE_P_GAIN', 'FIRE_BLIND']) {
    assert.ok(Number.isFinite(K[key]), `${key} 應存在且為有限數`);
  }
  assert.ok(near(R.radiusAt(0.5), 5.5));
  assert.ok(near(R.radiusAt(0.5, true), 7.15));
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
  const g = dynLvl();
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
    const g = dynLvl();
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
      for (const e of g.drain()) if (e.type === 'hint' && e.a === OH.blind) { blindHints.push(t); assert.ok(g.cycle.blind && g.cycle.index > i0, '在之後循環的盲區裡'); }
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

test('喘氣是大聲音：低頻時附近衛兵起疑，高頻時先進高度警覺、再犯才追殺', () => {
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
  assert.equal(q2.state, 'alerted');
  h.step(7.6 + DT, { mx: 1 });
  assert.equal(q2.state, 'hunted');
  assert.equal(h.hunted, true);
});

test('11/09 4A：高頻（p > 0.6）在衛兵範圍內第一次 move_high 只進高度警覺，再犯才追殺', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0); // 3 m，背對，靠聽覺
  place(g, 25, 19);
  g.step(7, {});
  g.step(7 + DT, { mx: 1 }); // 第一次：alerted
  const ev = g.drain();
  assert.equal(q.state, 'alerted');
  assert.equal(g.hunted, false);
  assert.equal(g.phase, 'play');
  assert.equal(q.susp, K.ALERTED_SUSP);
  assert.ok(ev.some((e) => e.type === 'sfx' && e.a === 'alerted'));
  assert.ok(ev.every((e) => !(e.type === 'sfx' && e.a === 'hunt')));
  g.step(7 + DT * 2, { mx: 1 }); // 再犯：hunt
  assert.equal(q.state, 'hunted');
  assert.equal(g.hunted, true);
  assert.equal(g.alarm, 1);
});

test('11/10 4A 複審：起疑（安撫中）的衛兵在節奏最快時聽到喘氣，照舊直接追殺，不會降成高度警覺', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0);
  place(g, 25, 19);                                   // 站在他看得到的地方，等他起疑
  let t = 1; g.step(t, {});
  while (q.state === 'patrol' && t < 9) { t += DT; g.step(t, {}); }
  assert.equal(q.state, 'suspicious');
  g.drain();
  let ev = [];
  while (!ev.includes('gasp') && t < 30) { t += DT; g.step(t, { breath: true }); ev = ev.concat(sfx(g)); }
  assert.ok(ev.includes('gasp'), '憋到喘氣');
  assert.ok(g.cycle.p > K.HIGH_P || ev.includes('hunt'), `喘氣時 p = ${g.cycle.p}`);
  assert.ok(ev.includes('hunt') && !ev.includes('alerted'), '起疑中喘氣 → 追殺，不是高度警覺');
});

test('11/10 複審：高度警覺中站著被看見會累積疑心（和巡邏一樣），撐到 1 就追殺；只發一次提示、訊息說發生了什麼', () => {
  for (const cover of [true, false]) {
    const g = cover ? cvr({ startZone: 2 }) : lvl({ startZone: 2, T: { FAKE: false } });
    const q = solo(g, 'g2a', 25, 22, 0);                 // 面向 −z，看著玩家
    place(g, 25, 19);
    let t = 7; g.step(t, { breath: true }); g.drain();
    // 讓他進高度警覺：被看見時移動（兩版都算）
    t += DT; g.step(t, { mx: 1 });                       // 憋氣時不能走，這一幀放開
    assert.equal(q.state, 'alerted');
    const out = g.drain();
    const alertedText = (cover ? R.hintsFor(g.T) : OH).alerted;
    const same = out.filter((e) => (e.type === 'msg' || e.type === 'hint') && e.a === alertedText);
    assert.equal(same.length, 1, '提示只出一次（之前 msg 和 hint 都發同一句）');
    const msg = out.find((e) => e.type === 'msg');
    assert.ok(msg && msg.a !== alertedText && /被發現了/.test(msg.a), `訊息說發生了什麼：${msg && msg.a}`);
    if (cover) assert.ok(msg.a.includes('腳步露了聲') && !/亂動/.test(msg.a));
    // 站著不動、屏息（不出聲），但他看得見你
    const s0 = q.susp;
    t = run(g, t, t + 0.5, () => ({ breath: true }));
    assert.ok(q.susp > s0, `看得見就累積：${s0} → ${q.susp}`);
    run(g, t, t + 6, () => ({ breath: true }));
    assert.ok(g.hunted, '一直站在他眼前 → 疑心到 1 → 追殺');
  }
});

test('11/09 4A：高度警覺持續時間到期會回巡邏，並發 alert_over', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, 0);
  place(g, 25, 19);
  g.step(7, {});
  g.step(7 + DT, { mx: 1 });
  assert.equal(q.state, 'alerted');
  // 11/10 複審起，站在高度警覺的衛兵眼前會累積疑心（和巡邏一樣）；要測「沒再犯就到期」，觸發後就退到他察覺不到的地方
  place(g, 25 - (R.radiusAt(1, true, g.T) + 0.5), 22);
  const out = [];
  run(g, 7 + DT, 17.2, (gg, t) => { if (Math.abs(t - (7 + DT)) > 1e-9) out.push(...gg.drain()); return {}; });
  out.push(...g.drain());
  assert.equal(q.state, 'patrol');
  assert.equal(q.susp, 0);
  assert.equal(g.alerted, false);
  assert.ok(out.some((e) => e.type === 'sfx' && e.a === 'alert_over'));
});

test('高頻時在範圍外移動、或屏息不動且不在視野內，都不會被發現', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 29, 0); // 10 m（11/09 4A 感知放遠後仍在範圍外）
  place(g, 25, 19);
  g.step(7, {});
  run(g, 7, 7.5, () => ({ mx: -1 })); // r(0.7..0.75) ≈ 7.9～8.6 < 10
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

test('衝刺：盲區外無效、平常約 3 公尺；追殺中盲區約 6 公尺，dash 事件帶 hunt 旗標', () => {
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
  {
    const ev = g.drain().find((e) => e.type === 'sfx' && e.a === 'dash');
    assert.ok(ev && ev.hunt === false);
  }
  g.step(10.2, { dash: true, mx: 1 });
  assert.ok(g.player.x < 26.5, '同一個盲區不能衝第二次');
  g.step(20.1, {});
  g.step(20.1 + DT, { dash: true, mz: -1 });
  assert.ok(near(g.player.z, 19 - 3 - K.WALK * DT, 1e-6), '下一個盲區可以再衝');

  const h = lvl({ startZone: 2 });
  for (const q of h.guards) { q.state = 'down'; q.active = false; }
  place(h, 23, 19);
  h.hunted = true;
  h.step(10.1, {});
  h.step(10.1 + DT, { dash: true, mx: 1 });
  assert.ok(Math.abs(h.player.x - (23 + K.DASH_HUNT + K.WALK * DT)) <= 0.1);
  {
    const ev = h.drain().find((e) => e.type === 'sfx' && e.a === 'dash');
    assert.ok(ev && ev.hunt === true);
  }
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
  moveHighTwice(h, 7, { mx: 0.1 }); // 11/09 4A：第一次 alerted，第二次才追殺
  run(h, 7 + DT * 2, 10, () => ({}));
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

test('11/09 4A 追殺：躲進陰影、一整個循環不動 → 擺脫', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 17, 18, Math.PI); // 南側拱廊（z ≥ 24）以北 6 m
  place(g, 17, 24.3); // 已在陰影邊緣
  moveHighTwice(g, 9.5, { mz: 1 }); // 11/09 4A：第二次 move_high 才追殺
  assert.equal(g.hunted, true);
  let t = run(g, 9.5 + DT * 2, 10.1, () => ({ breath: true }));
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

test('11/09 4A 追殺：在陰影裡亂動會被聽到，撐不住的計時歸零', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 17, 16, Math.PI);
  place(g, 17, 24.3);
  moveHighTwice(g, 9.5, { mz: 1 });
  run(g, 9.5 + DT * 2, 10.1, () => ({ breath: true }));
  g.step(10.1 + DT, { dash: true, mz: 1 });
  let t = run(g, 10.1 + DT, 13, () => ({}));
  assert.equal(g.phase, 'play');
  assert.ok(g.stillT > 2);
  // 4A：追殺衝刺是 DASH_HUNT（6 m），衝完已在聽覺半徑外（這正是生路）。
  // 原地不動等相位升高、追殺感知半徑 r(p) 蓋過距離，再動一下，才是「在陰影裡亂動」的情境。
  const q = g.guards.find((x) => x.id === 'g2a');
  const dist = () => Math.hypot(q.x - g.player.x, q.z - g.player.z);
  while (R.radiusAt(g.cycle.p, true, g.T) <= dist() + 0.2) { t += DT; g.step(t, {}); }
  assert.ok(g.hunted && g.stillT > 2 && g.stillT < K.ESCAPE_STILL, '還在追殺、還沒撐到擺脫');
  g.step(t + DT, { mx: 0.2 });
  assert.equal(g.stillT, 0);
  assert.ok(Math.hypot(q.lastKnown.x - g.player.x, q.lastKnown.z - g.player.z) < 0.1, '動了會被聽到，衛兵知道你在哪');
});

test('11/09 4A：追殺中連續 step_masked 會觸發 hunt_step／hunt_slip，並在 3 秒內減速', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 17, 5, 0);
  place(g, 17, 22);
  q.state = 'hunted'; q.lastKnown = { x: g.player.x, z: g.player.z }; g.hunted = true;
  g.step(11, {});
  const maskedTimes = [];
  for (const b of R.beatsBetween(11.2, 16, g, { minGain: K.MASK_GAIN })) {
    if (!maskedTimes.length || b.t - maskedTimes[maskedTimes.length - 1] > K.STEP_GAP * K.STEP_GAP_MIN + 0.02) maskedTimes.push(b.t);
    if (maskedTimes.length >= 3) break;
  }
  assert.equal(maskedTimes.length, 3, '要能找到三個可用拍點');
  const got = [];
  for (const bt of maskedTimes) {
    g.step(bt - DT, {});
    g.step(bt, { mx: 0.2 });
    const ev = g.drain();
    assert.ok(ev.some((e) => e.type === 'sfx' && e.a === 'step_masked'), `t=${bt}`);
    got.push(...ev.filter((e) => e.type === 'sfx' && (e.a === 'hunt_step' || e.a === 'hunt_slip')));
  }
  assert.deepEqual(got.filter((e) => e.a === 'hunt_step').map((e) => e.index), [1, 2, 3]);
  assert.equal(got.filter((e) => e.a === 'hunt_slip').length, 1);

  const t0 = maskedTimes[2] + 0.05;
  g.step(t0, {});
  const z0 = q.z;
  run(g, t0, t0 + 1);
  const slowV = Math.abs(q.z - z0) / 1;
  assert.ok(Math.abs(slowV - K.HUNT_SPEED * K.HUNT_SLOW_MUL) <= 0.15, `slow=${slowV}`);
  run(g, t0 + 1, t0 + K.HUNT_SLOW_DUR + 0.2);
  const z2 = q.z;
  run(g, t0 + K.HUNT_SLOW_DUR + 0.2, t0 + K.HUNT_SLOW_DUR + 1.2);
  const normalV = Math.abs(q.z - z2) / 1;
  assert.ok(Math.abs(normalV - K.HUNT_SPEED) <= 0.2, `normal=${normalV}`);
});

test('11/09 4A：追殺中 step_loud 會把 huntSteps 歸零', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 5, 0);
  place(g, 25, 19);
  q.state = 'hunted'; q.lastKnown = { x: g.player.x, z: g.player.z }; g.hunted = true;
  g.huntSteps = 2;
  const loud = R.beatsBetween(2, 5, g, { minGain: K.MASK_GAIN });
  let t0 = null;
  for (let i = 1; i < loud.length; i++) if (loud[i].t - loud[i - 1].t > K.STEP_WIN * 2 + 0.02) { t0 = (loud[i].t + loud[i - 1].t) / 2; break; }
  assert.ok(t0 != null);
  g.step(t0 - DT, {});
  g.step(t0, { mx: 0.15 });
  const ev = g.drain();
  assert.ok(ev.some((e) => e.type === 'sfx' && e.a === 'step_loud'));
  assert.equal(g.huntSteps, 0);
});

test('追殺：被追到 1 公尺內 → 失敗', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 25, 23, 0);
  place(g, 25, 19);
  moveHighTwice(g, 7, { mx: 0.1 });
  assert.equal(g.hunted, true);
  run(g, 7 + DT * 2, 10, () => ({}));
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

test('11/09 4A 木馬腹中：第一次 move_high 只進高度警覺，再犯才失敗', () => {
  const g = lvl({ startZone: 1 });
  const q = g.guards.find((x) => x.id === 'g1');
  assert.equal(q.active, true);
  g.step(7, {});
  q.x = 6; q.z = 15;
  g.step(7 + DT, { mx: 1 });
  assert.equal(g.phase, 'play');
  assert.equal(q.state, 'alerted');
  g.step(7 + DT * 2, { mx: 1 });
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

test('11/09 4A 城門：高頻推門閂是大聲音，附近衛兵先高度警覺、再犯轉追殺', () => {
  const g = lvl({ startZone: 4 });
  const q = solo(g, 'g4b', 52, 15 - 3, 0);
  const L = g.level.gate.latch;
  place(g, L.x - 0.5, L.z);
  g.step(7, {});
  g.step(7 + DT, { interact: true });
  assert.equal(q.state, 'alerted');
  g.step(7 + DT + K.LATCH_NOISE_GAP + 0.02, { interact: true });
  assert.equal(q.state, 'hunted');
});

test('城門：累積 GATE_NEED（7）秒的低頻推門 → 城門打開、過關；城門區實際約 3 個循環、不超過 4 個', () => {
  assert.equal(K.GATE_NEED, 7);
  const g = lvl({ startZone: 4 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const L = g.level.gate.latch;
  place(g, L.x, L.z + 0.5);
  g.step(0, {});
  // 固定 10 秒循環：0～5 秒推 5 秒，10 秒起再推 2 秒 → 12 秒開門
  run(g, 0, 11.9, (gg) => ({ interact: gg.cycle.p <= K.GATE_LOW_P }));
  assert.equal(g.phase, 'play');
  run(g, 11.9, 12.2, (gg) => ({ interact: gg.cycle.p <= K.GATE_LOW_P }));
  assert.equal(g.phase, 'win');
  assert.equal(g.gate.open, true);
  assert.ok(sfx(g).includes('gate_open'));
  // 城門區的循環長度（衛兵在 4 m、第 4 區）：每循環可推 GATE_LOW_P × T 秒，需要的循環數 ≤ 4
  const Tg = R.cycleTargetFor({ dist: 4, zone: 4 }, K);
  assert.ok(K.GATE_NEED / (K.GATE_LOW_P * Tg) <= 4, `需要 ${K.GATE_NEED / (K.GATE_LOW_P * Tg)} 個循環`);
  // 動態循環、沒有衛兵：實際跑一次，從開始推到開門不超過 4 個循環
  const h = dynLvl({ startZone: 4 });
  for (const q of h.guards) { q.state = 'down'; q.active = false; }
  place(h, L.x, L.z + 0.5);
  h.step(0, {});
  const i0 = h.cycle.index;
  let t = 0;
  while (h.phase === 'play' && t < 60) { t += DT; h.step(t, { interact: h.cycle.p <= K.GATE_LOW_P }); }
  assert.equal(h.phase, 'win');
  assert.ok(h.cycle.index - i0 <= 4, `用了 ${h.cycle.index - i0 + 1} 個循環`);
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
  // 離巡邏線夠遠：低頻時（p 約 0.3）每名區 4 衛兵的路線點都在感知半徑外
  for (const d of g.level.guards.filter((q) => q.zone === 4)) {
    for (const pt of d.route) assert.ok(Math.hypot(pt.x - s.x, pt.z - s.z) > R.radiusAt(0.3), d.id);
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
  for (const [k, v] of Object.entries(OH)) {
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
  const g = dynLvl({ startZone: 2 });
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
  const g2 = dynLvl({ startZone: 2 });
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
  const h = dynLvl({ startZone: 3 });
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
  const g = dynLvl({ startZone: 1 });
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
  const g = dynLvl({ startZone: 2 });
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
  assert.ok(g.drain().some((e) => e.type === 'hint' && e.a === OH.alertBlind));
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
  // 音量：中間最大、兩端接近無聲；追殺 5 層也是鐘形，沒有固定底限（R1）
  assert.ok(near(R.layerGain(2, 0), 1));
  assert.ok(R.layerGain(0, 0) < 0.01 && R.layerGain(3, 0.999) < 0.01);
  assert.equal(R.layerGain(4, 0.3, false), 0, '平常沒有第 5 層');
  assert.equal(K.HUNT_LAYERS, 5); assert.equal(R.layerCount(true), 5); assert.equal(R.layerCount(false), 4);
  assert.ok(R.layerGain(0, 0, true) < 0.01 && R.layerGain(4, 0.999, true) < 0.01, '追殺時兩端也淡到接近無聲');
  assert.ok(near(R.layerGain(2, 0.5, true), 1), '追殺時正中央的層最響');
  assert.ok(!('HUNT_FLOOR' in K) && !('HUNT_LAYER_GAIN' in K), '固定底限、固定第 5 層音量已移除');
});

test('R1 追殺 5 層：交接連續（第 k 層 p→1 ＝ 第 k+1 層 p→0）、各層音量和恆定（起伏 < 1%）、和平常 4 層的總音量接近', () => {
  for (const hunted of [false, true]) {
    const L = R.layerCount(hunted);
    for (let k = 0; k < L - 1; k++) assert.ok(near(R.layerGain(k, 1, hunted), R.layerGain(k + 1, 0, hunted), 1e-12), `k=${k} 交接不連續`);
    let mn = Infinity, mx = 0;
    for (let p = 0; p <= 1; p += 0.001) {
      let s = 0; for (let k = 0; k < L; k++) s += R.layerGain(k, p, hunted);
      mn = Math.min(mn, s); mx = Math.max(mx, s);
    }
    assert.ok((mx - mn) / mx < 0.01, `${hunted ? '追殺' : '平常'}音量和起伏 ${((mx - mn) / mx * 100).toFixed(2)}%`);
    if (hunted) {
      // 層距 ÷ σ 和 4 層一樣，所以總音量差不多：追殺開始時不會整體變響或變輕
      let s4 = 0, s5 = 0; for (let k = 0; k < 4; k++) s4 += R.layerGain(k, 0.5, false); for (let k = 0; k < 5; k++) s5 += R.layerGain(k, 0.5, true);
      assert.ok(Math.abs(s5 - s4) / s4 < 0.02, `4 層 ${s4} vs 5 層 ${s5}`);
    }
  }
  // 遊戲物件：追殺時 beatsBetween 的 gain 就是 layerGain(k, p, true)，x = (k + p) ÷ 5；每一層都有拍、第 5 層會淡入淡出
  const an = { t: 100, p: 0, T: 3, index: 3 };
  const H = Object.assign({ T: K, cycle: { anchor: an }, hunted: true, panic: { active: false }, bass: { anchor: 0, period: 2.4 } });
  const hb = R.beatsBetween(100, 103, H, { includeBlind: true, includeQuiet: true });
  assert.equal(hb.length, 7 + 14 + 28 + 56 + 112);
  for (const b of hb) { assert.ok(near(b.gain, R.layerGain(b.k, b.p, true), 1e-12)); assert.ok(near(b.x, (b.k + b.p) / 5, 1e-12)); }
  const k4 = hb.filter((b) => b.k === 4);
  assert.ok(k4[0].gain > k4[k4.length - 1].gain * 10, '第 5 層從可聽淡到無聲，不是固定音量');
});

const fakeGame = (an, extra) => Object.assign({ T: K, cycle: { anchor: an }, hunted: false, panic: { active: false }, bass: { anchor: 0, period: 2.4 } }, extra || {});

test('11/10 fireBrightness(game)：亮度跟實際速度 danger 走；舊模式盲區壓暗到 FIRE_BLIND', () => {
  const span = K.CYCLE_FAR - K.CYCLE_HUNT;
  const at = (len, blind, cover) => R.fireBrightness({ T: Object.assign({}, K, { COVER_MODE: cover }), cycle: { T: len, blind } });
  for (const cover of [true, false]) {
    assert.ok(near(at(K.CYCLE_FAR, false, cover), K.FIRE_BASE), '附近沒人（最慢）= FIRE_BASE');
    assert.ok(near(at(K.CYCLE_HUNT, false, cover), Math.min(1, K.FIRE_BASE + K.FIRE_P_GAIN)), '追殺（最快）= FIRE_BASE + FIRE_P_GAIN');
    assert.ok(near(at(K.CYCLE_FAR - span / 2, false, cover), K.FIRE_BASE + K.FIRE_P_GAIN / 2), '中間線性');
    assert.ok(near(at(20, false, cover), K.FIRE_BASE) && near(at(1, false, cover), 1), '超出範圍夾住');
  }
  assert.ok(near(at(6, true, false), K.FIRE_BLIND), '舊模式：盲區壓暗');
  assert.ok(near(at(6, true, true), at(6, false, true)), '殘響掩護：掩護窗不壓暗');
  // 跑一局：舊模式盲區幀 = FIRE_BLIND；game.danger 與 game.fire 一致
  const g = lvl({ startZone: 2 });
  g.step(10.1, {});
  assert.equal(g.cycle.blind, true);
  assert.ok(near(g.fire, K.FIRE_BLIND));
  assert.ok(near(g.danger, (K.CYCLE_FAR - g.cycle.T) / span));
});

test('11/09 4A：blindWindows 匯出一般盲區、nextFake 與警戒 alert 盲區', () => {
  const an = { t: 0, p: 0, T: 10, index: 0, start: 0 };
  const G = fakeGame(an, { cycle: { anchor: an, index: 0, p: 0, T: 10, start: 0, fake: false, nextFake: false }, panic: { active: false } });
  const ws = R.blindWindows(0, 30, G);
  assert.deepEqual(ws.map((w) => [w.from, w.to, w.kind]), [[0, 0.6, 'blind'], [10, 10.6, 'blind'], [20, 20.6, 'blind']]);

  const F = fakeGame(an, { cycle: { anchor: an, index: 0, p: 0, T: 10, start: 0, fake: false, nextFake: true }, panic: { active: false } });
  const wf = R.blindWindows(0, 30, F);
  assert.deepEqual(wf.map((w) => [w.from, w.to]), [[0, 0.6], [20, 20.6]]);

  const A = fakeGame(an, { panic: { active: true }, bass: { anchor: 0, period: 2.4 } });
  const wa = R.blindWindows(0, 8, A);
  assert.ok(wa.length >= 3 && wa.every((w) => w.kind === 'alert'));
});

test('11/09 4A：blindWindows 與逐幀 cycle.blind 取樣一致（0.05 秒）', () => {
  const g = lvl({ startZone: 2, t0: 0 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const ws = R.blindWindows(0, 30, g);
  assert.deepEqual(ws.map((w) => [w.from, w.to]), [[0, 0.6], [10, 10.6], [20, 20.6]]);
  for (let t = 0; t < 30; t += 0.05) {
    g.step(t, {});
    const byWin = ws.some((w) => t >= w.from - 1e-9 && t < w.to - 1e-9);
    assert.equal(g.cycle.blind, byWin, `t=${t.toFixed(2)}`);
  }
});

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
  // 追殺：多一層（k = 4），5 層都走鐘形曲線，x 以 5 層算
  const H = fakeGame(an, { hunted: true });
  const hb = R.beatsBetween(100, 108, H);
  assert.ok(hb.some((b) => b.k === 4));
  assert.ok(hb.every((b) => b.gain >= K.BEAT_MIN_GAIN && near(b.gain, R.layerGain(b.k, b.p, true), 1e-12) && near(b.x, (b.k + b.p) / 5)));
  // 警戒：循環開頭不略過，改成略過低音拍正中央的 0.6 秒
  const A = fakeGame(an, { panic: { active: true }, bass: { anchor: 101, period: 2.4 } });
  const ab = R.beatsBetween(100, 108, A);
  assert.ok(ab.some((b) => b.t >= 106 && b.t < 106.6), '警戒時循環開頭有拍');
  for (const b of ab) assert.ok(!R.alertBlindAt(b.t, 101, 2.4).blind, `拍 ${b.t} 落在警戒盲區`);
});

test('8.4 beatsBetween 讀遊戲物件：和本幀 cycle 一致', () => {
  const g = dynLvl({ startZone: 1 });
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

test('8.3 腳步跟著鼓走：起步那一步照 stepMasked 判，之後每步對齊下一個可聽拍（beatT），沒拍才照 STEP_GAP × 1.6 落步出聲', () => {
  assert.equal(K.STEP_GAP, 0.45); assert.equal(K.STEP_GAP_MIN, 0.6); assert.equal(K.STEP_GAP_MAX, 1.6);
  const g = dynLvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 14, 22);
  g.step(1, {}); g.drain();
  let t = 1; const steps = [];
  while (t < 6) {
    t += DT; g.step(t, { mx: 1 });
    for (const e of g.drain()) if (e.type === 'sfx' && /^step_/.test(e.a)) {
      steps.push({ t, e });
      assert.ok(near(e.x, g.player.x) && near(e.z, g.player.z), '帶腳步位置');
      assert.ok('beatT' in e, '帶 beatT');
      if (e.beatT != null) {
        assert.equal(e.a, 'step_masked', '對齊到拍的步被蓋過');
        assert.ok(Math.abs(e.beatT - t) <= K.STEP_WIN + DT, `beatT ${e.beatT} 離落步的這一幀 ${t} 太遠`);
        assert.ok(R.beatsBetween(e.beatT - 1e-6, e.beatT + 1e-6, g, { minGain: K.MASK_GAIN }).length > 0, 'beatT 是一個可聽拍');
      }
      assert.equal(e.a === 'step_masked', R.stepMasked(t, g), `t=${t}：和 stepMasked 一致`);
    }
  }
  assert.ok(near(steps[0].t, 1 + DT, 1e-9), '起步那一幀就有第一步');
  assert.ok(steps.length >= 6 && steps.length <= 14, `5 秒走了 ${steps.length} 步`);
  for (let i = 1; i < steps.length; i++) {
    const gap = steps[i].t - steps[i - 1].t;
    assert.ok(gap >= K.STEP_GAP * K.STEP_GAP_MIN - DT - 1e-9 && gap <= K.STEP_GAP * K.STEP_GAP_MAX + DT + 1e-9, `步距 ${gap}`);
    if (steps[i].e.beatT == null) assert.ok(near(gap, K.STEP_GAP * K.STEP_GAP_MAX, DT + 1e-9), '沒拍可對時照 STEP_GAP × 1.6 落步');
  }
  assert.ok(steps.slice(1).filter((s) => s.e.a === 'step_masked').length >= (steps.length - 1) * 0.8, '持續走，之後的步幾乎都被蓋過');
  // 站著不動或屏息不出腳步聲
  run(g, t, t + 2, () => ({ breath: true, mx: 1 }));
  assert.ok(!g.drain().some((e) => /^step_/.test(e.a)));
  // 起步：在可聽拍上起步安靜、離拍起步出聲（固定 10 秒循環，T 不變好找時間點）
  const G0 = fakeGame({ t: 0, p: 0, T: 10, index: 0, start: 0 });
  const loud = R.beatsBetween(1, 9, G0, { minGain: K.MASK_GAIN });
  let gapT = null;
  for (let i = 1; i < loud.length; i++) if (loud[i].t - loud[i - 1].t > 0.3) { gapT = (loud[i].t + loud[i - 1].t) / 2; break; }
  const onBeat = loud.find((b) => b.t > 2).t;
  for (const [t0, want] of [[onBeat, 'step_masked'], [gapT, 'step_loud']]) {
    const h = lvl({ startZone: 2 });
    for (const q of h.guards) { q.state = 'down'; q.active = false; }
    place(h, 14, 22);
    h.step(t0 - DT, {}); h.drain();
    h.step(t0, { mx: 1 });
    const ev = h.drain().filter((e) => /^step_/.test(e.a));
    assert.equal(ev.length, 1); assert.equal(ev[0].a, want, `t0=${t0}`);
    assert.equal(ev[0].beatT != null, want === 'step_masked');
  }
});

test('8.3 腳步跟著鼓走：持續走 10 秒，被蓋住的腳步 ≥ 80%（T = 12、6、4，隨機起步 60 次）；慢速時也不再多數出聲', () => {
  const rng = R.mulberry32(7);
  for (const P of [12, 6, 4]) {
    let masked = 0, loud = 0, later = [0, 0];
    for (let i = 0; i < 60; i++) {
      const g = lvl({ startZone: 2, T: { CYCLE: P } });
      for (const q of g.guards) { q.state = 'down'; q.active = false; }
      place(g, 15, 22);
      const t0 = 1 + rng() * P * 3;
      g.step(t0 - DT, {}); g.drain();
      let t = t0, dir = 1, first = true;
      while (t < t0 + 10) {
        g.step(t, { mx: dir });
        if (g.player.x > 27) dir = -1; if (g.player.x < 15) dir = 1;
        for (const e of g.drain()) if (/^step_/.test(e.a)) {
          const m = e.a === 'step_masked';
          if (m) masked++; else loud++;
          if (!first) later[m ? 0 : 1]++;
          first = false;
        }
        t += DT;
      }
    }
    const ratio = masked / (masked + loud);
    assert.ok(ratio >= 0.8, `T=${P}：被蓋住 ${(ratio * 100).toFixed(1)}%`);
    assert.ok(later[0] / (later[0] + later[1]) >= 0.85, `T=${P}：起步以後的步被蓋住 ${(later[0] / (later[0] + later[1]) * 100).toFixed(1)}%`);
  }
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
  // r(p) 與 STEP_R 都到不了的距離：不合拍也聽不到（距離由常數推算；4A 放大 R_BASE／R_GAIN 後 3.2 m 已在 r 內）
  const h = lvl({ startZone: 2 });
  const farD = Math.max(K.STEP_R, R.radiusAt(2.8 / K.CYCLE, false, h.T)) + 0.4;
  const q2 = solo(h, 'g2a', 25, 19 + farD, Math.PI);
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
  assert.equal(dynLvl().visualAid, 1);
  const want = { 1: 1, 2: 0.5, 3: 0, 4: 0 };
  for (const z of [1, 2, 3, 4]) {
    const g = dynLvl({ startZone: z });
    g.step(0, {});
    assert.equal(g.visualAid, want[z], '區 ' + z);
    assert.equal(dynLvl({ startZone: z, visualAid: 'on' }).visualAid, 1);
    assert.equal(dynLvl({ startZone: z, visualAid: 'off' }).visualAid, 0);
  }
  const g = dynLvl({ startZone: 2 });
  g.step(0, {}); place(g, 30.5, 22); g.step(0.05, {});
  assert.equal(g.zone, 3); assert.equal(g.visualAid, 0, '進下一區跟著變');
  g.visualAidMode = 'on'; g.step(0.1, {});
  assert.equal(g.visualAid, 1);
  assert.equal(R.visualAidFor(2, 'auto', Object.assign({}, K, OLD)), 0.5);
});

test('11/10 設計席 7.9：殘響掩護版的視覺輔助與木魚晚一區淡出——區 0～2 = 1、區 3 = 0.5、區 4 = 0；舊版不變；on／off／數字照舊', () => {
  const want = { 0: 1, 1: 1, 2: 1, 3: 0.5, 4: 0 };
  for (const z of [0, 1, 2, 3, 4]) {
    assert.equal(R.visualAidFor(z, 'auto'), want[z], '預設（殘響掩護）區 ' + z);
    assert.equal(R.visualAidFor(z, 'on'), 1);
    assert.equal(R.visualAidFor(z, 'off'), 0);
    assert.equal(R.visualAidFor(z, 0.3), 0.3);
  }
  for (const z of [1, 2, 3, 4]) {
    const g = R.createLevel({ startZone: z });
    g.step(0, {});
    assert.equal(g.visualAid, want[z], '關卡裡區 ' + z);
  }
  assert.equal(R.createLevel({ startZone: 0 }).visualAid, 1, '開場');
  // 進下一區跟著變：區 2 → 3 從 1 變 0.5
  const g = R.createLevel({ startZone: 2 });
  g.step(0, {}); place(g, 30.5, 22); g.step(0.05, {});
  assert.equal(g.zone, 3); assert.equal(g.visualAid, 0.5);
  // 舊版維持原表
  const old = { 1: 1, 2: 0.5, 3: 0, 4: 0 };
  for (const z of [1, 2, 3, 4]) assert.equal(R.visualAidFor(z, 'auto', Object.assign({}, K, OLD)), old[z]);
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
 *   opts.cover（11/10 甲）：COVER_MODE 下多一條路——p > COVER_EAR_P 時，只要範圍內沒有衛兵看得到下一步的位置，
 *   就踩著鼓點走（起步只在可聽拍上；之後腳步自己跟著鼓走）。
 *   opts.sigma（11/10 設計席 7.1）：起步誤差。每次從停下到起步抽一個 e ~ N(0, sigma)，用「t − e 那一刻」的狀態
 *   （在不在掩護窗、那時起步會不會踩在鼓點上、相位）決定要不要起步：e < 0 太早、e > 0 太晚。走著的時候、停下、
 *   衝刺與暗殺都用真實狀態（只模擬「起步」這一下的手誤）。opts.seed 決定誤差序列。
 */
function makeBot(opts = {}) {
  const WP = {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0, calmBeat = null, walkingPrev = false;
  const erng = R.mulberry32((opts.seed || 1) * 97 + 13);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = erng(); v = erng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let curErr = opts.sigma ? gauss() * opts.sigma : 0;
  const inner = function (g) {
    const K = g.T, t = g.time, pl = g.player, c = g.cycle, p = c.p, blind = c.blind;
    const inp = { mx: 0, mz: 0 };
    // 起步誤差：停著的時候，用 t − e 那一刻的狀態判斷「現在起步可不可以」
    const err = (walkingPrev || !opts.sigma) ? 0 : curErr;
    const tv = t - err;
    const pV = err === 0 ? p : (((p + (tv - t) / c.T) % 1) + 1) % 1;
    const blindV = err === 0 ? blind : R.blindWindows(tv - 1e-6, tv + 1e-6, g).some((w) => tv >= w.from && tv < w.to);
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
    let w = WP[g.zone][wi];
    let dx = w.x - pl.x, dz = w.z - pl.z, dw = Math.hypot(dx, dz);
    // 11/11 修：到了路線點同一幀就轉向下一個點，不停一幀（停了再起步，幀率抖動時起步那一步可能離拍出聲；
    // 整夜驗證 seed 191、315 就是這樣在窄巷驚動 g3a、之後被盯著站在他面前而被抓）
    while (dw < 0.35) {
      wi++;
      if (!WP[g.zone][wi]) return inp;
      w = WP[g.zone][wi]; dx = w.x - pl.x; dz = w.z - pl.z; dw = Math.hypot(dx, dz);
    }
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
    // 殘響掩護：範圍內的衛兵都看不到下一步的位置（在陰影裡，或在視野外留 0.2 rad 餘裕）
    const hiddenAt = (x, z) => g.level.shadows.some((s) => R.inRect(x, z, s));
    const unseen = act.every((q) => {
      const d = Math.hypot(q.x - nx, q.z - nz, pl.y || 0);
      if (d > r(q, Math.min(1, p + 0.03)) + 0.6) return true;
      if (hiddenAt(nx, nz)) return true;
      const f = R.forward(q.yaw);
      return R.angDiff(Math.atan2(nx - q.x, nz - q.z), Math.atan2(f.x, f.z)) > K.FOV + 0.2;
    });
    // 11/11：起步要看「下一幀」會不會踩在鼓點上，而下一幀可能在 1/144～1/30 秒後（幀率抖動），整段都踩得到才起步
    const coverStep = !!opts.cover && K.COVER_MODE && pV > K.COVER_EAR_P + 0.01 && unseen &&
      (walkingPrev || [1 / 144, 1 / 60, 1 / 30].every((d) => R.stepMasked(tv + d, g))) && act.every((q) => Math.hypot(q.x - nx, q.z - nz) > K.STEP_R);
    const canMove = blindV || (pV <= 0.57 && safe) || coverStep;
    if (canMove) {
      inp.mx = ux; inp.mz = uz;
      if (blind && dw > 1.5 && !(tgt && g.zone === 3)) inp.dash = true;
    } else {
      inp.breath = pl.breathT < K.BREATH_MAX - 0.4 && wantBreath();
    }
    return inp;
  };
  return function (g) {
    const out = inner(g);
    const moving = !!(out.mx || out.mz);
    if (moving && !walkingPrev && opts.sigma) curErr = gauss() * opts.sigma;   // 起步了：下一次起步重新抽誤差
    walkingPrev = moving;
    return out;
  };
}

function playthrough(seed, t0, jitter) {
  const g = dynLvl({ t0, seed });
  const bot = makeBot();
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2;
  const fails = [], sounds = {};
  let Tmin = Infinity, Tmax = 0;
  const fakeByZone = {}; let lastIdx = null;
  g.step(t, {});
  g.step(t, { start: true });
  while (g.phase !== 'win' && t < 600) {
    t += jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : DT;
    g.step(t, bot(g));
    Tmin = Math.min(Tmin, g.cycle.T); Tmax = Math.max(Tmax, g.cycle.T);
    if (g.cycle.index !== lastIdx) { lastIdx = g.cycle.index; if (g.cycle.fake) fakeByZone[g.zone] = (fakeByZone[g.zone] || 0) + 1; }
    for (const e of g.drain()) if (e.type === 'sfx') sounds[e.a] = (sounds[e.a] || 0) + 1;
    if (g.phase === 'fail') { fails.push(g.zone + ' ' + g.failReason); g.retry(); }
  }
  return { g, t, fails, sounds, Tmin, Tmax, fakeByZone };
}

test('程式玩家用固定策略通關整關（動態循環；不同 t0、種子、不穩定幀率）', () => {
  const cases = [[1, 0, false], [2, 3.7, false], [3, 8.2, true], [4, 5.5, true], [5, 1.1, true],
    [6, 2.2, false], [7, 6.6, true], [8, 9.4, true]];
  let fakes = 0;
  for (const [seed, t0, jitter] of cases) {
    const { g, t, fails, sounds, Tmin, Tmax, fakeByZone } = playthrough(seed, t0, jitter);
    assert.ok(!fakeByZone[1] && !fakeByZone[2], `seed ${seed}：前兩區出現假驟降`);
    fakes += (fakeByZone[3] || 0) + (fakeByZone[4] || 0);
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
  assert.ok(fakes >= cases.length, `通關過程中第 3、4 區有遇到假驟降（共 ${fakes} 次）`);
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
  assert.equal(OH.fake, '有時鼓聲只是換手，並沒有斷：沒有那聲預告，就不要動。');
  for (const z of [1, 2]) for (const dyn of [false, true]) {
    const g = allDown(dyn ? dynLvl({ startZone: z, seed: 11 }) : lvl({ startZone: z, seed: 11 }));
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
    const fh = hints.filter((x) => x.a === OH.fake);
    assert.equal(fh.length, 1, '提示只出一次');
    assert.equal(fh[0].idx, fakes[0].index, '在第一次假驟降時提示');
  }
});

test('8.5 假驟降：nextFake 提早一個循環決定；blindFrom 指向再下一輪；beatsBetween 照常回傳開頭的拍', () => {
  const g = allDown(lvl({ startZone: 3, seed: 2 }));
  let t = 0; g.step(t, {});
  // 抽中的那一幀正是真盲區的開頭（剛跳回 0）；等盲區過了再看預估
  while (!(g.cycle.nextFake && !g.cycle.blind) && t < 2000) { t += 1 / 30; g.step(t, {}); }
  assert.ok(g.cycle.nextFake, '找到假驟降');
  const c = g.cycle, idx = c.index, next = t + (1 - c.p) * c.T;
  assert.ok(near(c.blindFrom, next + c.T, 1e-6), '下一段盲區在假驟降的再下一輪');
  const bs = R.beatsBetween(next - 0.01, next + K.BLIND_LEN, g);
  assert.ok(bs.length > 3 && bs.some((b) => b.t >= next + 0.1 && b.t < next + K.BLIND_LEN && b.k === 2), '假驟降開頭 0.6 秒照常有拍');
  // 到了假驟降那一輪：fake = true、nextFake = false（不連續）、blind = false
  while (g.cycle.index === idx) { t += 1 / 30; g.step(t, {}); }
  assert.equal(g.cycle.fake, true); assert.equal(g.cycle.nextFake, false); assert.equal(g.cycle.blind, false);
  const bs2 = R.beatsBetween(g.cycle.start, g.cycle.start + K.BLIND_LEN, g);
  assert.ok(bs2.length >= 3, '這一輪開頭照常有拍');
  assert.equal(bs2.length, R.beatsBetween(g.cycle.start, g.cycle.start + K.BLIND_LEN, g, { includeBlind: true }).length, '一拍都沒略過');
  // 對照：真的交接，開頭 0.6 秒沒有拍
  while (g.cycle.index === idx + 1) { t += 1 / 30; g.step(t, {}); }
  assert.equal(g.cycle.fake, false);
  assert.equal(R.beatsBetween(g.cycle.start, g.cycle.start + K.BLIND_LEN - 1e-6, g).length, 0);
});

/** 不放衛兵一路跑到條件成立（最多 maxT 秒），回傳時間。 */
function runUntil(g, t, cond, maxT = 3000) { while (!cond(g) && t < maxT) { t += 1 / 30; g.step(t, {}); } assert.ok(cond(g), '條件沒有成立'); return t; }

test('8.5 假驟降：衛兵照常聽得到、衝刺沒有用', () => {
  const g = allDown(lvl({ startZone: 3, seed: 2 }));
  let t = 0; g.step(t, {});
  t = runUntil(g, t, (gg) => gg.cycle.fake);          // 假驟降剛開始
  assert.ok(t - g.cycle.start < 0.1);
  const q = solo(g, 'g3a', 38, 23, 0); q.state = 'patrol'; q.active = true;
  place(g, 38, 22);    // 在衛兵背後 1 公尺：低頻時也在感知範圍（2 公尺）內
  const s0 = q.susp, x0 = g.player.x;
  g.step(t + 0.03, { mx: 1, dash: true });
  assert.ok(Math.abs(g.player.x - x0) < 0.5, '沒有衝刺');
  run(g, t + 0.03, t + 0.4, () => ({ mx: 0.2 }));
  assert.equal(g.cycle.blind, false);
  assert.ok(q.susp > s0, `移動被聽到（疑心 ${s0} → ${q.susp}）`);
  assert.ok(!sfx(g).includes('dash'));
});

test('8.5 假驟降：警戒、追殺中不抽；追殺開始時取消已抽中的', () => {
  const h = lvl({ startZone: 3, seed: 2 });
  // 先待在遠處：等假驟降抽中時，衛兵連站著的呼吸聲都聽不到（r(1) × BREATH_HEAR 之外；4A 放大半徑後原本 5.8 m 不夠遠）
  const q = solo(h, 'g3a', 45, 18, 0);
  place(h, 33, 26);
  assert.ok(Math.hypot(45 - 33, 18 - 26) > R.radiusAt(1, false, h.T) * K.BREATH_HEAR + 0.5);
  let u = 0; h.step(u, {});
  u = runUntil(h, u, (gg) => gg.cycle.nextFake && gg.cycle.p > 0.1 && gg.cycle.p < 0.5);
  solo(h, 'g3a', 38, 23, 0);                          // 衛兵回到原位，玩家貼到他背後
  place(h, 38, 24.2);
  h.step(u + 0.01, { takedown: true });               // 盲區外按 → 起疑
  assert.equal(h.panic.active, true);
  assert.equal(q.state, 'suspicious');
  h.step(u + 0.3, { calm: true });                    // 不在拍上 → 追殺
  assert.equal(h.hunted, true);
  assert.equal(h.cycle.nextFake, false, '追殺開始時取消');
  const { list } = handoffs(h, u + 0.3, u + 80, 1 / 30, (gg) => { gg.hunted = true; gg.stillT = 0; return {}; });
  assert.ok(list.length > 5 && list.every((x) => !x.fake), '追殺中不出現');
  // 警戒中也不抽
  const a = lvl({ startZone: 3, seed: 2 });
  solo(a, 'g3a', 38, 23, 0); place(a, 33, 26);
  let v = 0; a.step(v, {});
  const { list: l2 } = handoffs(a, 0, 80, 1 / 30, (gg) => { gg.panic.active = true; gg.panic.start = 1e9; return {}; });
  assert.ok(l2.length > 5 && l2.every((x) => !x.fake), '警戒中不出現');
});

// ---------------- 2026-11-07 稽核修正：盲區前沿寬限、按鍵時間、假驟降尾音、盲區基準、提示數字 ----------------

test('11/09 4A：盲區前沿寬限與 move_high（第一次只進高度警覺）', () => {
  assert.equal(K.BLIND_LEAD_GRACE, 0.15);
  // 固定 10 秒循環：盲區 10.0 起。9.86 動 → 寬限；9.8 動 → move_high
  for (const [t0, state] of [[9.86, 'patrol'], [9.99, 'patrol'], [9.8, 'alerted'], [9.6, 'alerted']]) {
    const g = lvl({ startZone: 2 });
    const q = solo(g, 'g2a', 25, 22, R.yawTo(0, 1));   // 3 m，面向 +z 背對玩家，靠聽覺
    place(g, 25, 19);
    g.step(t0 - DT, {});
    g.step(t0, { mx: 1 });
    assert.equal(q.state, state, `t=${t0}`);
    if (state === 'patrol') assert.equal(q.susp, 0, '寬限裡移動不累積疑心');
  }
  // 假驟降：下一次交接是假的 → 交接前 0.15 秒動照樣 move_high（第一次 alerted）
  const f = lvl({ startZone: 3, T: { FAKE: false } });
  const q = solo(f, 'g3a', 38, 23, Math.PI);   // 面向 +z，玩家在他正前方 1.3 m
  place(f, 38, 24.3);
  f.step(9.5, {});
  f.cycle.nextFake = true;
  f.step(9.86, {});
  assert.ok(f.cycle.blindFrom > 19, '下一段盲區在再下一輪');
  f.step(9.88, { mx: 1 });
  assert.equal(q.state, 'alerted', '假驟降前沒有寬限');
  void q;
});

test('盲區前沿寬限：衝刺、暗殺在盲區前 0.15 秒內可用，並算進下一段盲區（衝刺每段一次）', () => {
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 23, 19);
  g.step(9.7, {});
  g.step(9.7 + DT, { dash: true, mx: 1 });
  assert.ok(g.player.x < 23.5, '0.15 秒之外衝不出去');
  g.step(9.88, {});
  g.step(9.88 + DT, { dash: true, mx: 1 });
  assert.ok(g.player.x > 26, '寬限裡可以衝');
  g.step(10.2, { dash: true, mx: 1 });
  assert.ok(g.player.x < 27.5, '同一段盲區不能再衝');
  // 暗殺
  const h = lvl({ startZone: 3 });
  const q = solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 24.2);
  h.step(9.88, {});
  h.step(9.88 + DT, { takedown: true });
  assert.equal(q.state, 'down');
});

test('按鍵時間 input.actAt：衝刺、暗殺、門閂、安撫都用按鍵當下的音訊時間，沒有才用幀時間', () => {
  // 幀晚了 0.1 秒才處理，按鍵當下（actAt）在盲區裡 → 衝刺成功；反過來按鍵當下還沒到寬限 → 不行
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  place(g, 23, 19);
  g.step(9.5, {});
  g.step(9.95, { dash: true, mx: 1, actAt: 9.7 });
  assert.ok(g.player.x < 23.5, '按鍵當下（9.7）還不是盲區');
  g.step(10.05, { dash: true, mx: 1, actAt: 10.02 });
  assert.ok(g.player.x > 26, '按鍵當下在盲區');
  // 暗殺：幀已經出了盲區（10.7），按鍵當下 10.5 還在
  const h = lvl({ startZone: 3 });
  const q = solo(h, 'g3a', 38, 23, 0);
  place(h, 38, 24.2);
  h.step(10.5, {});
  h.step(10.7, { takedown: true, actAt: 10.5 });
  assert.equal(q.state, 'down');
  const h2 = lvl({ startZone: 3 });
  const q2 = solo(h2, 'g3a', 38, 23, 0);
  place(h2, 38, 24.2);
  h2.step(10.5, {});
  h2.step(10.55, { takedown: true, actAt: 9.7 });
  assert.equal(q2.state, 'suspicious', '按鍵當下（9.7）在盲區與寬限之外 → 失手');
  // 門閂：幀時間 p = 0.52（高頻），按鍵當下 p = 0.49 → 算推進、不出聲
  const d = lvl({ startZone: 4 });
  for (const x of d.guards) { x.state = 'down'; x.active = false; }
  const L = d.level.gate.latch;
  place(d, L.x - 0.5, L.z);
  d.step(4.8, {});
  d.step(5.2, { interact: true, actAt: 4.9 });
  assert.ok(d.gate.progress > 0 && !sfx(d).includes('latch'));
  d.step(5.3, { interact: true });
  assert.ok(sfx(d).includes('latch'), '沒有 actAt 就用幀時間：高頻推門出聲');
  // 安撫：沒有 calmAt 時用 actAt
  const a = panicSetup();
  a.g.step(a.beats[0] + 0.3, { calm: true, actAt: a.beats[0] + 0.02 });
  assert.equal(a.q.calm, 1);
  const b = panicSetup();
  b.g.step(b.beats[0], { calm: true, actAt: b.beats[0] - 0.2 });
  assert.equal(b.q.state, 'hunted');
});

test('8.5 includeFakeTail：假驟降的循環多回傳交接處 2 拍尾音（k = 3、4，gain = FAKE_TAIL_GAIN，tail: true），真的循環沒有', () => {
  assert.equal(K.FAKE_TAIL_GAIN, 0.035);
  const an = { t: 100, p: 0.5, T: 8, index: 3, start: 96 };
  const base = { T: K, hunted: false, panic: { active: false }, bass: { anchor: 0, period: 2.4 } };
  // 下一次交接（t = 104，循環 4）是假的
  const G = Object.assign({ cycle: { anchor: an, fake: false, nextFake: true } }, base);
  const plain = R.beatsBetween(100, 112, G);
  assert.ok(!plain.some((b) => b.tail), '預設不回傳尾音');
  const withTail = R.beatsBetween(100, 112, G, { includeFakeTail: true });
  const tails = withTail.filter((b) => b.tail);
  assert.equal(tails.length, 2);
  assert.deepEqual(tails.map((b) => b.k), [3, 4]);
  for (const b of tails) { assert.ok(near(b.t, 104, 1e-9)); assert.equal(b.gain, K.FAKE_TAIL_GAIN); assert.equal(b.cycle === 4 || b.cycle === 3, true); }
  assert.deepEqual(withTail.filter((b) => !b.tail).map((b) => b.t), plain.map((b) => b.t), '其他拍不變');
  assert.ok(!R.beatsBetween(100, 103.9, G, { includeFakeTail: true }).some((b) => b.tail), '區間不含交接就沒有');
  // 這一輪就是假的（fake = true，交接在 anchor.start = 96）
  const F = Object.assign({ cycle: { anchor: an, fake: true, nextFake: false } }, base);
  const ft = R.beatsBetween(95, 112, F, { includeFakeTail: true }).filter((b) => b.tail);
  assert.equal(ft.length, 2); assert.ok(ft.every((b) => near(b.t, 96, 1e-9)));
  // 真的循環：沒有尾音
  const N = Object.assign({ cycle: { anchor: an, fake: false, nextFake: false } }, base);
  assert.equal(R.beatsBetween(90, 120, N, { includeFakeTail: true }).filter((b) => b.tail).length, 0);
  // 遊戲物件：跑到抽中假驟降，尾音正好在交接處
  const g = allDown(lvl({ startZone: 3, seed: 2 }));
  let t = 0; g.step(t, {});
  while (!(g.cycle.nextFake && !g.cycle.blind) && t < 2000) { t += 1 / 30; g.step(t, {}); }
  const next = t + (1 - g.cycle.p) * g.cycle.T;
  const gt = R.beatsBetween(t, t + 2 * g.cycle.T, g, { includeFakeTail: true }).filter((b) => b.tail);
  assert.equal(gt.length, 2); assert.ok(gt.every((b) => near(b.t, next, 1e-6)));
});

test('R2 盲區基準：beatsBetween 用 anchor.start 判盲區，T 在循環內變化時和 updateClock 一致', () => {
  // 動態循環，衛兵全關、強制追殺讓 T 從約 10.8 一路縮到 3：每個循環裡 T 都在變
  const g = dynLvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  g.step(0, {});
  let t = 0, checked = 0, drift = 0;
  while (t < 30) {
    t += DT; g.hunted = true; g.stillT = 0; g.step(t, {});
    const c = g.cycle, an = c.anchor;
    assert.equal(an.start, c.start, 'anchor 帶 start');
    drift = Math.max(drift, Math.abs(c.start - (t - c.p * c.T)));
    // 和 updateClock 同一個基準：本輪開頭 BLIND_LEN 秒沒有拍，之後一拍都不少
    assert.equal(R.beatsBetween(c.start, c.start + K.BLIND_LEN - 1e-9, g).length, 0, `t=${t}`);
    const a = c.start + K.BLIND_LEN, b = Math.min(a + 0.5, t + (1 - c.p) * c.T - 1e-6);
    if (b > a) {
      assert.equal(R.beatsBetween(a, b, g, { includeQuiet: true }).length, R.beatsBetween(a, b, g, { includeBlind: true, includeQuiet: true }).length, `t=${t}：盲區外的拍被略過`);
      checked++;
    }
    // 本幀 updateClock 說是盲區 ⇔ 這一刻落在 [start, start + BLIND_LEN)
    assert.equal(c.blind, t - c.start < K.BLIND_LEN && t >= c.start - 1e-9);
  }
  assert.ok(checked > 100);
  assert.ok(drift > 0.05, `用 p × T 反推的開頭和實際 start 最多差 ${drift.toFixed(3)} 秒（要夠大，測試才有意義）`);
});

test('11/09 4A 提示文字：文字裡的數字由常數生成，和 T 一致；改常數文字跟著變；不再寫「一整個循環」', () => {
  const allowed = new Set([K.BREATH_MAX, K.CALM_NEED, K.CALM_TIMEOUT, K.ESCAPE_STILL, K.BLIND_LEN, K.BASS_PERIOD, K.TAKEDOWN_R, K.ALERTED_DURATION, K.HUNT_STEP_ESCAPE].map(String));
  const texts = [];
  for (const [k, v] of Object.entries(OH)) texts.push(['HINTS.' + k, v]);
  for (const [k, v] of Object.entries(OL)) { texts.push(['LADDER.' + k + '.text', v.text]); texts.push(['LADDER.' + k + '.keys', v.keys]); }
  let found = 0;
  for (const [name, txt] of texts) {
    assert.ok(!/3D/.test(txt.replace('3D', '')) || true);
    for (const m of txt.replace(/3D/g, '').match(/\d+(\.\d+)?/g) || []) { found++; assert.ok(allowed.has(m), `${name} 裡的數字 ${m} 不在常數裡`); }
  }
  assert.ok(found >= 8, `抓到 ${found} 個數字`);
  assert.ok(!/循環/.test(OH.hunted) && OH.hunted.includes(`不動 ${K.ESCAPE_STILL} 秒`));
  assert.ok(OH.hunted.includes(`連續 ${K.HUNT_STEP_ESCAPE} 步`));
  assert.ok(OH.alerted.includes(`${K.ALERTED_DURATION} 秒`));
  assert.ok(OH.panic.includes(`${K.CALM_NEED} 次`) && !/四次/.test(OH.panic));
  assert.ok(!/等鼓點密起來/.test(OL.step.keys) && /起步踩在鼓點上/.test(OL.step.keys), '腳步提示不再和屏息規則矛盾');
  // 改常數：文字跟著變（createLevel 也用改過的）
  const K2 = Object.assign({}, K, { ESCAPE_STILL: 7, CALM_NEED: 3, BREATH_MAX: 5, ALERTED_DURATION: 9, HUNT_STEP_ESCAPE: 4 });
  assert.ok(R.hintsFor(K2).hunted.includes('不動 7 秒'));
  assert.ok(R.hintsFor(K2).hunted.includes('連續 4 步'));
  assert.ok(R.hintsFor(K2).alerted.includes('9 秒'));
  assert.ok(R.hintLadderFor(K2).calm.keys.includes('對準 3 次') && R.hintLadderFor(K2).breath.keys.includes('約 5 秒'));
  assert.ok(R.ladderText('breath', 3, R.hintLadderFor(K2)).includes('約 5 秒'));
  const g = lvl({ startZone: 2, T: { ESCAPE_STILL: 7 } });
  solo(g, 'g2a', 25, 22, 0); place(g, 25, 19);
  moveHighTwice(g, 7, { mx: 1 });
  assert.ok(g.drain().some((e) => e.type === 'hint' && e.a.includes('不動 7 秒')));
});

// ---------------- 暗示階梯（設計文件 2026-11-07-hint-guidance.md 第 1、2.1、5 節） ----------------

const ladder = (g) => g.drain().filter((e) => e.type === 'hint' && e.key);

test('暗示階梯：文字照設計文件 2.1 節「提示文字」欄；第 3 階多一段按鍵說明', () => {
  const want = {
    breath: '「節奏最快時，按住空白鍵屏住呼吸，別動。」',
    blind: '「鼓聲一斷，就是你移動的時候。」',
    radius: '「火光照到的範圍，就是他聽得到的範圍。」',
    step: '「踩著鼓點走，腳步聲會被蓋過。」',
    calm: '「別跟著亂掉的鼓聲快。聽最低的那個聲音，跟著它按 Q。」',
    takedown: '「鼓聲斷掉時，從背後靠近按 E。」',
    fake: '「有時鼓聲只是換手，沒有那聲預告，就不要動。」',
    listen: '「戴上耳機，聽聲音從哪邊來。」',
    latch: '「節奏慢的時候才推，快的時候放手。」'
  };
  assert.deepEqual(Object.keys(OL).sort(), Object.keys(want).sort());
  for (const [k, v] of Object.entries(want)) {
    assert.equal(OL[k].text, v, k);
    assert.equal(R.ladderText(k, 1, OL), null, '第 1 階沒有文字');
    assert.equal(R.ladderText(k, 2, OL), v.slice(1, -1));
    const l3 = R.ladderText(k, 3, OL);
    assert.ok(l3.startsWith(v.slice(1, -1)) && l3.length > v.length, k);
    assert.ok(/空白鍵|W A S D|\bE\b|\bQ\b|滑鼠/.test(OL[k].keys), `${k} 的按鍵說明要寫出按鍵`);
    assert.ok(!/電影|諾蘭|奧德賽/.test(OL[k].keys + v), k);
  }
  const g = lvl({ startZone: 1 });
  for (const k of Object.keys(want)) assert.deepEqual(g.hints[k], { fails: 0, level: 1, lastFail: -1e9 }, '一開始都在第 1 階');
});

test('暗示階梯：暗殺失手 1 次只有世界內暗示，2 次第 2 階、3 次第 3 階；成功一次退回第 1 階', () => {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);
  place(g, 38, 21.9);                   // 站在他面前：按 E 一定失手
  g.step(3, {});
  g.step(3 + DT, { takedown: true });
  assert.equal(g.hints.takedown.fails, 1);
  assert.equal(g.hints.takedown.level, 1);
  assert.equal(ladder(g).length, 0, '第 1 次：沒有文字');
  g.step(3.5, { takedown: true });      // HINT_FAIL_GAP 內：不重複算
  assert.equal(g.hints.takedown.fails, 1);
  g.step(5.2, { takedown: true });
  let h = ladder(g);
  assert.equal(g.hints.takedown.level, 2);
  assert.equal(h.length, 1);
  assert.deepEqual({ key: h[0].key, level: h[0].level }, { key: 'takedown', level: 2 });
  assert.equal(h[0].a, '鼓聲斷掉時，從背後靠近按 E。');
  g.step(7.4, { takedown: true });
  h = ladder(g);
  assert.equal(g.hints.takedown.level, 3);
  assert.equal(h[0].level, 3);
  assert.ok(h[0].a.includes('按 E') && h[0].a.includes('1.5 公尺'), '第 3 階有按鍵說明');
  // 成功：繞到背後，等盲區按 E（衛兵起疑中、還沒追殺）
  assert.notEqual(q.state, 'hunted');
  q.state = 'patrol'; q.yaw = 0; q.susp = 0; q.grace = 9; g.panic.active = false;
  place(g, 38, 24.2);
  run(g, 7.4, 10.1);
  g.step(10.1 + DT, { takedown: true });
  assert.equal(q.state, 'down');
  assert.deepEqual([g.hints.takedown.fails, g.hints.takedown.level], [0, 1], '成功一次退回第 1 階');
});

test('暗示階梯：屏息憋太久（喘氣）算屏息失敗；跨重來也累積', () => {
  const g = lvl({ startZone: 2 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  g.step(0, {});
  run(g, 0, 6.5, () => ({ breath: true }));
  assert.equal(g.hints.breath.fails, 1);
  run(g, 6.5, 13, () => ({}));          // 換氣
  run(g, 13, 19.5, () => ({ breath: true }));
  const h = ladder(g);
  assert.equal(g.hints.breath.level, 2);
  assert.deepEqual(h.map((e) => [e.key, e.level]), [['breath', 2]]);
  g.phase = 'fail'; g.retry();
  assert.equal(g.hints.breath.level, 2, '重來不會清掉階梯');
});

test('暗示階梯：屏息救了你（最快時衛兵就在身邊）→ 屏息退回第 1 階', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 20, 20, 0);
  place(g, 20, 21.5);
  g.hints.breath.fails = 2; g.hints.breath.level = 2;
  g.step(6, {});
  run(g, 6, 9.9, (gg) => ({ breath: gg.cycle.p > 0.55 }));
  assert.equal(q.state, 'patrol');
  run(g, 9.9, 10.3, () => ({}));       // 盲區：放開換氣
  assert.deepEqual([g.hints.breath.fails, g.hints.breath.level], [0, 1]);
});

test('暗示階梯：高頻推門閂（喀的一聲）算門閂失敗，低頻推進一格就退回第 1 階', () => {
  const g = lvl({ startZone: 4 });
  for (const q of g.guards) { q.state = 'down'; q.active = false; }
  const L = g.level.gate.latch;
  place(g, L.x - 0.5, L.z);
  g.step(6, {});
  run(g, 6, 9.5, () => ({ interact: true }));   // p 0.6～0.95：每 0.5 秒一聲，但 2 秒內只算一次
  assert.equal(g.hints.latch.fails, 2);
  assert.deepEqual(ladder(g).map((e) => [e.key, e.level]), [['latch', 2]]);
  run(g, 9.5, 10, () => ({}));
  run(g, 10, 12.5, () => ({ interact: true }));  // 低頻：推進 1/8 以上
  assert.deepEqual([g.hints.latch.fails, g.hints.latch.level], [0, 1]);
});

test('暗示階梯：安撫失敗（按太急、錯拍）算安撫；高頻亂動被發現算驟降', () => {
  const { g, beats } = panicSetup();
  g.step(beats[0], { calm: true });
  g.step(beats[0] + 0.3, { calm: true });         // 太急 → 追殺
  assert.equal(g.hints.calm.fails, 1);
  const h = lvl({ startZone: 2 });
  solo(h, 'g2a', 20, 20, 0);
  place(h, 20, 22);
  h.step(7, {});
  h.step(7.1, { mx: 1 });
  assert.equal(h.guards.find((q) => q.id === 'g2a').state, 'alerted');
  assert.equal(h.hints.blind.fails, 1);
});

test('暗示階梯：被背後的衛兵發現算「聽聲辨位」；轉身面對背後的衛兵就退回第 1 階', () => {
  const g = lvl({ startZone: 2 });
  const q = solo(g, 'g2a', 20, 22, 0);           // 衛兵在玩家背後（玩家面向 −z，衛兵在 +z）
  place(g, 20, 20); g.player.yaw = 0;
  g.step(7, { yaw: 0 });
  g.step(7.1, { yaw: 0, mx: 1 });
  g.step(7.1 + DT, { yaw: 0, mx: 1 });
  assert.equal(g.hunted, true);
  assert.equal(g.hints.listen.fails, 1);
  const h = lvl({ startZone: 2 });
  const q2 = solo(h, 'g2a', 20, 25, 0);
  place(h, 20, 20); h.player.yaw = 0;
  h.hints.listen.fails = 2; h.hints.listen.level = 2;
  h.step(1, { yaw: 0 });
  h.step(1.5, { yaw: Math.PI });                 // 轉身：衛兵到正前方
  assert.equal(q2.state, 'patrol');
  assert.deepEqual([h.hints.listen.fails, h.hints.listen.level], [0, 1]);
  void q;
});

test('暗示階梯：不合拍的腳步被聽到算腳步；假驟降時動了被聽到算假驟降', () => {
  const g = lvl({ startZone: 2 });
  solo(g, 'g2a', 20, 20, 0);
  place(g, 20, 21.6);
  // 低相位、在旁邊、離拍起步：那一步出聲會被聽到（腳步跟著鼓走以後，只有起步離拍或鼓很稀疏時才會出聲）
  const loud = R.beatsBetween(1, 4, g, { minGain: K.MASK_GAIN });
  g.step(1.2, {});
  let t0 = null;
  for (let i = 1; i < loud.length; i++) if (loud[i].t - loud[i - 1].t > K.STEP_WIN * 2 + 0.02) { t0 = (loud[i].t + loud[i - 1].t) / 2; break; }
  assert.ok(t0 != null && t0 > 1.2);
  g.step(t0 - DT, {});
  g.step(t0, { mx: 0.15 });
  assert.ok(g.hints.step.fails >= 1, `腳步失敗 ${g.hints.step.fails}`);
  assert.ok(g.drain().some((e) => e.a === 'step_loud'));
  // 假驟降：強制這一輪是假的
  const f = lvl({ startZone: 3, T: { FAKE: false } });
  solo(f, 'g3a', 38, 23, Math.PI);               // 面向 +z
  place(f, 38, 24.3);
  f.step(9.8, {});
  f.cycle.nextFake = true;
  run(f, 9.8, 10.05);
  assert.equal(f.cycle.fake, true);
  run(f, 10.05, 10.3, () => ({ mx: 1 }));
  assert.ok(f.hints.fake.fails >= 1);
});

test('hintSignals：屏息警告、可暗殺、背後有人、門閂旁的高低頻、離盲區幾秒', () => {
  const g = lvl({ startZone: 3 });
  const q = solo(g, 'g3a', 38, 23, 0);           // 面向 −z
  place(g, 38, 25); g.player.yaw = 0;             // 玩家在衛兵背後、面向 −z（看著衛兵的背）
  g.step(5.8, { yaw: 0 });
  let s = R.hintSignals(g);
  assert.ok(s.breathWarn > 0, '節奏往最快走、衛兵在身邊：屏息警告');
  assert.equal(s.warnGuard, 'g3a');
  assert.equal(s.guards[0].killable, true);
  assert.equal(s.guards[0].ready, false, '2 公尺：還要再靠近');
  assert.ok(near(s.blindIn, 10 - 5.8, 1e-6));
  g.step(5.9, { yaw: 0, breath: true });
  assert.equal(R.hintSignals(g).breathWarn, 0, '屏息中不再警告');
  // 背後有人
  q.x = 38; q.z = 28; q.yaw = 0;
  place(g, 38, 25.5); g.step(6, { yaw: 0 });
  s = R.hintSignals(g);
  assert.ok(s.back && s.back.id === 'g3a' && Math.abs(s.back.side) < 0.2, JSON.stringify(s.back));
  q.x = 40.5; q.z = 27;
  s = R.hintSignals(g);
  assert.ok(s.back && s.back.side > 0.5, '右後方');
  // 盲區：感知半徑 0
  g.step(10.1, { yaw: 0 });
  assert.equal(R.hintSignals(g).guards[0].r, 0);
  // 門閂
  const h = lvl({ startZone: 4 });
  const L = h.level.gate.latch;
  place(h, L.x - 0.5, L.z); h.step(2, {});
  assert.deepEqual(Object.assign({}, R.hintSignals(h).latch, { d: 0 }), { near: true, low: true, d: 0 });
  h.step(7, {});
  assert.equal(R.hintSignals(h).latch.low, false);
});

// ---------------- 11/10 核心方向甲「殘響掩護」（COVER_MODE，docs/design/2026-11-10-core-direction-illusion.md 第 1 節） ----------------

/** 殘響掩護版、固定 10 秒循環。 */
const cvr = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({ DYNAMIC: false, COVER_MODE: true }, o.T || {}) }));
/** 從 t 開始空跑到 cond(g, t) 成立為止（每幀 DT），回傳那時的 t。 */
function idleUntil(g, t, cond, maxT) {
  while (!cond(g, t + DT) && t < maxT) { t += DT; g.step(t, {}); }
  assert.ok(t < maxT, '找不到符合條件的時刻');
  return t;
}

test('11/10 甲：COVER_MODE 預設開；coverWindows 是 blindWindows 的別名；dangerOf 匯出', () => {
  assert.equal(K.COVER_MODE, true);
  assert.equal(R.coverWindows, R.blindWindows);
  assert.equal(typeof R.dangerOf, 'function');
  assert.equal(dynLvl().T.COVER_MODE, false, '測試用的舊版開關關得掉');
});

test('11/10 甲 第 1 條：每次交接都無縫，第 3、4 區也不抽假驟降（fake、nextFake 恆為 false）', () => {
  for (const z of [3, 4]) {
    for (const dyn of [false, true]) {
      const g = allDown(dyn ? R.createLevel({ startZone: z, seed: 2 }) : cvr({ startZone: z, seed: 2 }));
      let t = 0, cycles = 0, last = g.cycle.index, pre = 0;
      g.step(t, {});
      while (cycles < 40) {
        t += 1 / 30; g.step(t, {});
        assert.ok(!g.cycle.fake && !g.cycle.nextFake, `區 ${z}${dyn ? '（動態）' : ''}：t=${t.toFixed(2)} 出現假驟降`);
        if (g.cycle.index !== last) { last = g.cycle.index; cycles++; }
        pre += g.drain().filter((e) => e.a === 'pre_blind').length;
      }
      assert.ok(pre >= cycles - 1, '每一輪交接前都照常預告（掩護窗每輪都有）');
    }
  }
});

test('11/10 甲：時間窗一格都不搬——同樣條件下，cycle.blind 逐幀和舊版（關掉假驟降）完全一樣，blindWindows 也一樣', () => {
  const a = allDown(cvr({ startZone: 2, t0: 1.3 }));
  const b = allDown(lvl({ startZone: 2, t0: 1.3, T: { FAKE: false } }));
  let t = 1.3; a.step(t, {}); b.step(t, {});
  let blindFrames = 0;
  while (t < 41.3) {
    t += DT; a.step(t, {}); b.step(t, {});
    assert.equal(a.cycle.blind, b.cycle.blind, `t=${t.toFixed(3)}`);
    if (a.cycle.blind) blindFrames++;
  }
  assert.ok(blindFrames > 100, '有掩護窗');
  assert.deepEqual(R.coverWindows(t, t + 30, a), R.blindWindows(t, t + 30, b));
  const ws = R.coverWindows(t, t + 30, a);
  assert.ok(ws.length >= 3 && ws.every((w) => near(w.to - w.from, K.BLIND_LEN, 1e-9) && w.kind === 'blind'), JSON.stringify(ws));
});

test('11/10 甲 第 2 條：節奏最快時在他背後踩著鼓點走，衛兵聽不出來（不進高度警覺）；舊版同樣走法會進', () => {
  for (const cover of [true, false]) {
    const g = cover ? cvr({ startZone: 2 }) : lvl({ startZone: 2, T: { FAKE: false } });
    const q = solo(g, 'g2a', 25, 22, R.yawTo(0, 1));   // 面向 +z，背對玩家：只能靠耳朵
    place(g, 25, 19);                                   // 3 m：在 r(p) 內、在 STEP_R（2.5 m）外
    let t = 6.4; g.step(t, { breath: true });
    // 等到 p > HIGH_P、而且下一幀起步正好踩在可聽拍上
    t = idleUntil(g, t, (gg, tt) => gg.cycle.p > K.HIGH_P + 0.02 && R.stepMasked(tt, gg), 9);
    g.drain();
    const ev = [];
    let dir = 1;
    while (t < 9.6 && q.state === 'patrol') {
      t += DT; g.step(t, { mx: dir });
      if (g.player.x > 25.6) dir = -1; if (g.player.x < 24.4) dir = 1;
      ev.push(...sfx(g));
    }
    assert.ok(R.radiusAt(g.cycle.p, false, g.T) > 3.2, '一直在感知範圍內');
    if (cover) {
      assert.ok(ev.filter((e) => e === 'step_masked').length >= 2, `有踩在鼓點上的腳步：${ev.join(' ')}`);
      assert.ok(!ev.includes('step_loud'), '最快的時候鼓點很密，不會有出聲的腳步');
      assert.equal(q.state, 'patrol', '耳朵被鼓聲騙過');
      assert.ok(!ev.includes('alerted'));
    } else {
      assert.equal(q.state, 'alerted', '舊版：最快時在範圍內移動就被聽見');
    }
  }
});

test('11/10 甲 第 2 條：節奏最快時離拍起步（step_loud）→ 高度警覺；被看見照舊（踩在鼓點上也沒用）', () => {
  // 出聲的腳步
  const g = cvr({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 22, R.yawTo(0, 1));
  place(g, 25, 19);
  let t = 6.4; g.step(t, { breath: true });
  t = idleUntil(g, t, (gg, tt) => gg.cycle.p > K.HIGH_P + 0.02 && !R.stepMasked(tt, gg), 9);
  g.drain();
  t += DT; g.step(t, { mx: 1 });
  const ev = sfx(g);
  assert.ok(ev.includes('step_loud'), ev.join(' '));
  assert.ok(ev.includes('alerted') && q.state === 'alerted', '出聲的腳步才進高度警覺');
  assert.equal(g.hunted, false, '不是直接追殺');
  // 被看見：面對玩家、玩家不在陰影裡，踩著鼓點走也一樣進高度警覺
  const h = cvr({ startZone: 2 });
  const q2 = solo(h, 'g2a', 25, 22, 0);               // 面向 −z，看著玩家
  place(h, 25, 19);
  let u = 6.4; h.step(u, { breath: true });
  assert.equal(h.player.hidden, false);
  u = idleUntil(h, u, (gg, tt) => gg.cycle.p > K.HIGH_P + 0.02 && R.stepMasked(tt, gg), 9);
  h.drain();
  u += DT; h.step(u, { mx: 1 });
  const ev2 = sfx(h);
  assert.ok(ev2.includes('step_masked') && !ev2.includes('step_loud'), ev2.join(' '));
  assert.equal(q2.state, 'alerted', '眼睛不能用鼓聲騙');
});

test('11/10 甲 第 3 條：掩護窗內感知仍為 0、衝刺有效', () => {
  const g = cvr({ startZone: 2 });
  const q = solo(g, 'g2a', 25, 20.5, 0);              // 面對玩家 1.5 m
  place(g, 25, 19);
  g.step(9.99, { breath: true }); g.drain();
  run(g, 9.99, 10.4, () => ({ mx: 0.3 }));
  assert.equal(q.susp, 0, '掩護窗裡在他眼前走也沒事');
  g.step(10.4 + DT, { dash: true, mx: 1 });
  assert.ok(sfx(g).includes('dash'), '掩護窗裡可以衝刺');
});

test('11/10 設計席 7.1：COVER_EAR_P = 0，慢的時候踩著鼓點走也聽不見；出聲的腳步只在 STEP_R 內加 SUSP_STEP；設 0.6 回到舊行為', () => {
  assert.equal(K.COVER_EAR_P, 0);
  /** 慢的時候（p 0.1～0.5）在背對的衛兵身後來回走；回傳 {susp, ev}。 */
  const walk = (T, dz) => {
    const g = R.createLevel({ startZone: 2, T: Object.assign({ DYNAMIC: false, FAKE: false }, T) });
    const q = solo(g, 'g2a', 25, 19 + dz, R.yawTo(0, 1));
    place(g, 25, 19);
    g.step(1, {}); g.drain();
    let t = 1; const ev = [];
    while (t < 5) {
      if (dz <= K.STEP_R) q.susp = 0;                  // 每幀歸零，才看得出這一幀加了多少
      t += DT; g.step(t, { mx: g.player.x > 25.4 ? -1 : (g.player.x < 24.6 ? 1 : (g.player.x >= 25 ? 1 : -1)) });
      const e = sfx(g); ev.push(...e);
      if (dz <= K.STEP_R) {
        if (e.includes('step_loud')) assert.ok(near(q.susp, K.SUSP_STEP - K.SUSP_DECAY * DT, 0.01), `出聲的腳步只加 SUSP_STEP：${q.susp}`);
        else assert.equal(q.susp, 0, `t=${t.toFixed(2)} 沒出聲就沒加：${q.susp}`);
      }
      assert.notEqual(q.state, 'alerted', '慢的時候不會進高度警覺');
    }
    return { susp: g.guards.find((x) => x.id === 'g2a').susp, ev };
  };
  // 3 m：在 r(p) 內、STEP_R 外——新版怎麼走都聽不見（出聲的腳步傳不到 3 m）；舊版範圍內移動會累積
  assert.ok(R.radiusAt(0.1, false, K) > 3);
  const a = walk({ COVER_MODE: true }, 3);
  assert.ok(a.ev.includes('step_masked'), '有踩在鼓點上的腳步');
  assert.equal(a.susp, 0, '新版：慢的時候踩著鼓點走，衛兵聽不見');
  assert.ok(walk({ COVER_MODE: false }, 3).susp > 0, '舊版：範圍內移動累積疑心');
  assert.ok(walk({ COVER_MODE: true, COVER_EAR_P: 0.6 }, 3).susp > 0, 'COVER_EAR_P = 0.6 回到 11/10 晚的行為');
  // 2 m：STEP_R 內——出聲的腳步加 SUSP_STEP（逐幀檢查在 walk 裡）
  walk({ COVER_MODE: true }, 2);                     // 踩拍的步：逐幀檢查都沒加
  // 離拍起步（出聲）：STEP_R 內加 SUSP_STEP，不進高度警覺
  const h = cvr({ startZone: 2 });
  const q = solo(h, 'g2a', 25, 21, R.yawTo(0, 1));
  place(h, 25, 19);
  let t = 1; h.step(t, {});
  t = idleUntil(h, t, (gg, tt) => gg.cycle.p < K.HIGH_P && !R.stepMasked(tt, gg), 5);
  h.drain(); q.susp = 0;
  t += DT; h.step(t, { mx: 1 });
  assert.ok(sfx(h).includes('step_loud'));
  assert.ok(near(q.susp, K.SUSP_STEP - K.SUSP_DECAY * DT, 1e-9), `加 SUSP_STEP、同一幀照常退 SUSP_DECAY：${q.susp}`);
  assert.equal(q.state, 'patrol');
});

test('11/10 設計席 7.4：殘響掩護版的提示文字表（數字由常數生成）；舊版不變', () => {
  const H = R.hintsFor(K), L = R.hintLadderFor(K), C = R.causesFor(K);
  const n = (v) => String(v);
  assert.equal(H.blind, '所有的鼓同時落下的那一擊最響，餘韻約 ' + n(K.BLIND_LEN) + ' 秒。這段時間衛兵什麼都察覺不到——趁這時移動。');
  assert.equal(H.step, '踩著鼓點走，腳步聲會被鼓聲蓋過，衛兵聽不出來——但他看得見你。起步要踩在鼓點上，之後腳步會自己跟著鼓走；離拍起步、或鼓很稀疏時，身邊的衛兵聽得到。');
  assert.equal(H.breath, '節奏越快，衛兵越敏銳。來不及躲開時，按住空白鍵屏住呼吸，站著別動。');
  assert.equal(H.alertBlind, '衛兵起疑時，兩聲低音正中間會有一記較輕的重擊，那時可以移動。');
  assert.equal(L.blind.name, '最響的一擊');
  assert.equal(L.blind.keys, '所有鼓同時落下的那一擊和它的餘韻，約 ' + n(K.BLIND_LEN) + ' 秒；這時按 W A S D 走，按 Shift 可以多衝一段。');
  assert.equal(L.radius.text, '「火光照到的範圍，就是他察覺得到的範圍。」');
  assert.equal(L.radius.keys, '在火光圈裡要踩著鼓點走，別走到他面前；被盯上就停下，或按住 空白鍵。');
  assert.equal(L.breath.text, '「來不及躲開時，按住空白鍵屏住呼吸，站著別動。」');
  assert.equal(C.move_high, '節奏最快時，你的腳步沒踩在鼓點上，衛兵聽見了');
  assert.equal(R.CAUSES.move_high, C.move_high, '預設常數就是新版');
  // 舊版保留原文
  assert.equal(R.causesFor(Object.assign({}, K, OLD)).move_high, '節奏最快時你動了，衛兵聽見了');
  assert.equal(OL.radius.text, '「火光照到的範圍，就是他聽得到的範圍。」');
  assert.ok(/斷/.test(OH.blind));
});

test('11/10 甲：火光跟實際速度走，掩護窗不壓暗；提示文字不再說「斷掉」，數字由常數生成', () => {
  const g = cvr({ startZone: 2 });
  g.step(10.1, {});
  assert.equal(g.cycle.blind, true);
  assert.ok(near(g.fire, K.FIRE_BASE + K.FIRE_P_GAIN * g.danger), '掩護窗：不壓暗');
  assert.ok(g.fire > K.FIRE_BLIND);
  // 動態循環：衛兵越近、循環越短，火光越亮；同一圈裡不隨相位掉回去
  const d = R.createLevel({ startZone: 2 });
  let t = 0; d.step(t, {});
  const samples = [];
  while (t < 30) { t += DT; d.step(t, {}); samples.push([d.cycle.T, d.fire]); }
  for (const [len, f] of samples) assert.ok(near(f, R.fireBrightness({ T: d.T, cycle: { T: len } })), '亮度只看循環長度');
  const H = R.hintsFor(K), L = R.hintLadderFor(K);
  // 殘響掩護版所有提示（暗殺教學、衝刺、驟降、腳步……）都不准說「斷」；只有假驟降那則例外（這版不抽假驟降，不會出現）
  for (const [k, s] of Object.entries(H)) if (k !== 'fake') assert.ok(!/斷/.test(s), 'HINTS.' + k + '：' + s);
  for (const [k, v] of Object.entries(L)) if (k !== 'fake') for (const s of [v.text, v.keys]) assert.ok(!/斷/.test(s), 'LADDER.' + k + '：' + s);
  assert.ok(H.takedown.includes('最響的那一擊落下時') && L.takedown.text.includes('最響的那一擊落下時'), '暗殺教學用掩護窗的說法');
  // 遊戲裡實際發出的提示也一樣（畫面層 createLevel 有傳 opts.T 時走 hintsFor(K)）
  const gg = R.createLevel({ T: {} });
  assert.equal(gg.T.COVER_MODE, true);
  assert.ok(!/斷/.test(R.hintsFor(gg.T).takedown));
  assert.ok(H.blind.includes(`約 ${K.BLIND_LEN} 秒`) && L.blind.keys.includes(`約 ${K.BLIND_LEN} 秒`));
  assert.ok(R.hintsFor(Object.assign({}, K, { BLIND_LEN: 0.8 })).blind.includes('約 0.8 秒'), '改常數文字跟著變');
  assert.ok(/斷/.test(OH.blind) && /斷/.test(OL.blind.text), '舊版文字保留');
});

// ---------------- 11/10 甲：程式玩家兩種模式各 50 局（N1 主動時間比例、通關率；只按前進鍵的通關率） ----------------

/*
 * N1（總綱第 7 節）：玩家「至少有一個會改變狀態的合法動作」的時間 ÷ 總時間。每幀照程式玩家當下的位置查，算主動的情況：
 *   掩護窗（盲區）裡；p ≤ HIGH_P 而且不在任何衛兵的 r(p) 內；城門區站在門閂旁而且 p ≤ GATE_LOW_P；
 *   踩拍走：p > COVER_EAR_P 而且 r(p) 內的衛兵都看不到你（在陰影裡或在視野外）——這時踩著鼓點走是合法動作。
 *   起疑（安撫）、只能屏息或等待都算被動；只算 phase = 'play' 的幀。
 * ruler：'own' ＝各版照自己的規則量（舊版沒有踩拍走這條）；'cover' ＝新版量法（設計席 7.6：舊版也照算踩拍走，
 *   COVER_EAR_P 取 0），兩版用同一把尺才能比。
 */
function activeNow(g, ruler = 'own') {
  const K = g.T, pl = g.player, p = g.cycle.p;
  if (g.cycle.blind) return true;
  if (g.panic.active) return false;
  const act = g.guards.filter((q) => q.active);
  const rq = (q) => R.radiusAt(p, q.state !== 'patrol', K);
  const d = (q) => Math.hypot(q.x - pl.x, q.z - pl.z, pl.y || 0);
  const L = g.level.gate && g.level.gate.latch;
  if (g.zone === 4 && L && Math.hypot(L.x - pl.x, L.z - pl.z) <= K.LATCH_R && p <= K.GATE_LOW_P) return true;
  const stepRule = ruler === 'cover' || !!K.COVER_MODE;
  const earP = (ruler === 'own' && K.COVER_MODE) ? K.COVER_EAR_P : 0;
  return act.every((q) => {
    if (p <= K.HIGH_P && d(q) > rq(q)) return true;
    if (!stepRule || p <= earP) return false;
    if (d(q) > rq(q) || pl.hidden) return true;
    const f = R.forward(q.yaw);
    return R.angDiff(Math.atan2(pl.x - q.x, pl.z - q.z), Math.atan2(f.x, f.z)) > K.FOV;
  });
}
/** 只按住前進鍵：照路線點一直走，不看衛兵、不屏息、不衝刺、不安撫、不暗殺；到城門就一直按住 E。 */
function makeForwardBot() {
  const WP = {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0;
  return function (g) {
    const pl = g.player;
    if (g.zone !== zone) { zone = g.zone; wi = 0; }
    const w = (WP[g.zone] || [])[wi];
    if (!w) return { interact: true };
    const dx = w.x - pl.x, dz = w.z - pl.z, dw = Math.hypot(dx, dz);
    if (dw < 0.35) { wi++; return {}; }
    return { mx: dx / dw, mz: dz / dw };
  };
}
/** 一局：一條命（第一次 fail 就算沒過），最多 maxT 秒。回傳 {win, t, n1, zone}。 */
function runGame(cover, seed, botMaker, maxT = 420) {
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, T: { COVER_MODE: cover } });
  const bot = botMaker();
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2, act = 0, actC = 0, all = 0, alerted = 0;
  g.step(t, {}); g.step(t, { start: true });
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > maxT) break;
    const dt = jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : DT;
    t += dt;
    g.step(t, bot(g));
    for (const e of g.drain()) if (e.type === 'sfx' && e.a === 'alerted') alerted++;
    if (g.phase === 'play') { all += dt; if (activeNow(g)) act += dt; if (activeNow(g, 'cover')) actC += dt; }
  }
  return { win: g.phase === 'win', t, alerted, n1: all > 0 ? act / all : 0, n1c: all > 0 ? actC / all : 0, zone: g.zone, why: g.failReason };
}
function stats(cover, botMaker, n) {
  const rs = [];
  for (let seed = 1; seed <= n; seed++) rs.push(runGame(cover, seed, () => botMaker(seed)));
  const wins = rs.filter((r) => r.win);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = (a) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const stuck = {};
  for (const r of rs) if (!r.win) stuck[r.zone] = (stuck[r.zone] || 0) + 1;
  return { n, winRate: wins.length / n, reachGate: rs.filter((r) => r.win || r.zone >= 4).length / n, reach3: rs.filter((r) => r.win || r.zone >= 3).length / n, alerted: mean(rs.map((r) => r.alerted)), tMed: median(wins.map((r) => r.t - 2)), n1: mean(rs.map((r) => r.n1)), n1c: mean(rs.map((r) => r.n1c)), n1Win: mean(wins.map((r) => r.n1)), tWin: mean(wins.map((r) => r.t - 2)), stuck };
}

test('11/10 7.8 改：程式玩家各 50 局——只按前進 ≤ 30%、完美 100%；錯了要付代價（σ0.12 時間 ≥ 完美 1.2 倍、每局進高度警覺 ≥ 1 次）；越不準越吃虧（σ0.25 比 σ0.12 差）', () => {
  const N = 50;
  const pct = (v) => (v * 100).toFixed(0) + '%';
  const fmt = (s) => `通關 ${pct(s.winRate)}（走到窄巷 ${pct(s.reach3)}、城門 ${pct(s.reachGate)}）、通關時間中位 ${Number.isFinite(s.tMed) ? s.tMed.toFixed(0) : '—'} 秒、每局進高度警覺 ${s.alerted.toFixed(2)} 次、N1 ${(s.n1 * 100).toFixed(1)}%（新版量法 ${(s.n1c * 100).toFixed(1)}%）、卡關區 ${JSON.stringify(s.stuck)}`;
  const oldBot = stats(false, () => makeBot(), N);
  const oldSigma = stats(false, (seed) => makeBot({ sigma: 0.12, seed }), N);
  const perfect = stats(true, () => makeBot({ cover: true }), N);
  const s12 = stats(true, (seed) => makeBot({ cover: true, sigma: 0.12, seed }), N);
  const s25 = stats(true, (seed) => makeBot({ cover: true, sigma: 0.25, seed }), N);
  const fwdCover = stats(true, makeForwardBot, N);
  const fwdOld = stats(false, makeForwardBot, N);
  console.log('[11/10 7.8 程式玩家，各 ' + N + ' 局，一條命；COVER_EAR_P = ' + K.COVER_EAR_P + '、R_GAIN = ' + K.R_GAIN + ']');
  console.log('  舊盲區版   完美起步：' + fmt(oldBot));
  console.log('  舊盲區版   起步誤差 σ 0.12：' + fmt(oldSigma));
  console.log('  殘響掩護版 完美踩拍：' + fmt(perfect));
  console.log('  殘響掩護版 起步誤差 σ 0.12：' + fmt(s12));
  console.log('  殘響掩護版 起步誤差 σ 0.25：' + fmt(s25));
  console.log('  殘響掩護版 只按前進鍵：' + fmt(fwdCover));
  console.log('  舊盲區版   只按前進鍵：' + fmt(fwdOld));
  // 保留的兩條
  assert.ok(fwdCover.winRate <= 0.3, `只按前進鍵通關率 ${fwdCover.winRate} 要 ≤ 30%`);
  assert.equal(perfect.winRate, 1, '完美踩拍要 100%');
  // 7.8 新增的兩條：今晚只量、不改規則；沒過的先印出來（設計席 7.8 第 4 點：登記後等 11/11 試玩一起看）
  const costTime = s12.tMed / perfect.tMed, costAlert = s12.alerted;
  const worseRate = s12.winRate - s25.winRate, worseTime = s25.tMed / s12.tMed;
  const pay = costTime >= 1.2 && costAlert >= 1;
  const worse = worseRate >= 0.1 || worseTime >= 1.2;
  console.log(`  7.8 錯了要付代價：σ0.12 通關時間中位 ÷ 完美 = ${costTime.toFixed(2)}（要 ≥ 1.2）、每局進高度警覺 ${costAlert.toFixed(2)} 次（要 ≥ 1）→ ${pay ? '過' : '⚠ 沒過'}`);
  console.log(`  7.8 越不準越吃虧：σ0.25 通關率比 σ0.12 低 ${(worseRate * 100).toFixed(0)} 個百分點（要 ≥ 10）、時間中位 ÷ σ0.12 = ${worseTime.toFixed(2)}（要 ≥ 1.2）→ ${worse ? '過' : '⚠ 沒過'}`);
  for (const s of [oldBot, oldSigma, perfect, s12, s25, fwdCover, fwdOld]) assert.ok(s.n1 >= 0 && s.n1 <= 1 && s.n1c >= s.n1 - 1e-9);
});

// ---------------- 11/10 夜 教學順序 M9（殘響掩護版：踩拍走 → 最響的一擊 → 被看見與屏息 → 警戒；舊版不變） ----------------

/** 程式玩家打一整關，記下每則主動提示（type 'hint'、沒有 level 的那種）第一次出現的 {key, zone, t, index}。 */
function hintTimeline(cover, seed) {
  const g = R.createLevel({ t0: (seed * 1.37) % 10, seed, T: { COVER_MODE: cover } });
  const H = R.hintsFor(g.T);
  const byText = new Map(Object.entries(H).map(([k, v]) => [v, k]));
  const bot = makeBot({ cover });
  const seen = [], all = [];
  let t = 2; g.step(t, {}); g.step(t, { start: true });
  while (g.phase !== 'win' && t < 600) {
    t += DT; g.step(t, bot(g));
    for (const e of g.drain()) {
      if (e.type === 'hint' || e.type === 'msg') all.push(e.a);
      if (e.type === 'hint' && !e.level && byText.has(e.a)) seen.push({ key: byText.get(e.a), zone: g.zone, t, index: g.cycle.index });
    }
    if (g.phase === 'fail') g.retry();
  }
  return { g, seen, all, first: (k) => seen.find((x) => x.key === k) };
}

test('11/10 夜 M9：殘響掩護版教學順序——區 1 踩拍走、區 2 最響的一擊再衝刺、區 3 暗殺再屏息、區 4 城門；一次一則、不說「斷」', () => {
  for (const seed of [1, 2, 3]) {
    const { g, seen, all, first } = hintTimeline(true, seed);
    assert.equal(g.phase, 'win', `seed ${seed} 過關`);
    const z = (k) => first(k) && first(k).zone;
    assert.equal(z('step'), 1, '踩拍走在木馬腹中先教');
    assert.equal(z('blind'), 2, '最響的一擊在神殿廣場');
    assert.equal(z('dash'), 2, '衝刺也在神殿廣場');
    // 衝刺提示也會在「窗外按 Shift」時即時出現（事件教學），所以整關裡只要求它在區 2；主動排序另有一條單獨測
    assert.equal(z('takedown'), 3, '暗殺在窄巷');
    assert.equal(z('breath'), 3, '被看見與屏息在窄巷、暗殺之後');
    assert.ok(first('breath').t - first('takedown').t >= K.HINT_GAP, '屏息提示和暗殺提示隔開');
    assert.equal(z('gate'), 4);
    const order = ['step', 'blind', 'takedown', 'breath', 'gate'].map((k) => first(k).t);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `順序：${seen.map((x) => x.key).join(' → ')}`);
    // 一次一則：同一幀不出兩則主動提示
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i].t > seen[i - 1].t, `${seen[i - 1].key} 與 ${seen[i].key} 同一幀`);
    for (const a of all) assert.ok(!/斷/.test(a), `殘響掩護版出現「斷」：${a}`);
  }
});

test('11/10 夜 M9：殘響掩護版區 2 不按 Shift 時，第一個掩護窗教最響的一擊、下一個掩護窗才教衝刺', () => {
  const g = allDown(cvr({ startZone: 2 }));
  const H = R.hintsFor(g.T);
  const got = [];
  let t = 0; g.step(t, {});
  while (t < 40) {
    t += DT; g.step(t, {});
    for (const e of g.drain()) if (e.type === 'hint' && (e.a === H.blind || e.a === H.dash)) got.push({ a: e.a === H.blind ? 'blind' : 'dash', i: g.cycle.index, blind: g.cycle.blind });
  }
  assert.deepEqual(got.map((x) => x.a), ['blind', 'dash']);
  assert.ok(got.every((x) => x.blind), '都在掩護窗裡出');
  assert.equal(got[1].i, got[0].i + 1, '衝刺在下一個掩護窗');
});

test('11/10 夜 M9：舊盲區版教學順序不變（區 1 屏息再盲區、區 2 衝刺、區 3 暗殺、區 4 城門）', () => {
  const { g, first } = hintTimeline(false, 1);
  assert.equal(g.phase, 'win');
  assert.equal(first('breath').zone, 1);
  assert.equal(first('blind').zone, 1);
  assert.ok(first('blind').t > first('breath').t);
  assert.equal(first('dash').zone, 2);
  assert.equal(first('takedown').zone, 3);
  assert.equal(first('gate').zone, 4);
});

// ---------------- 11/11 木馬第 1 批（HORSE_MODE：A 腹中練習、C1 木馬陰影、?lab=belly；docs/design/2026-11-11-trojan-horse-directions.md） ----------------

/** 木馬開關開、固定 10 秒循環的關卡。 */
const hrs = (o = {}) => R.createLevel(Object.assign({}, o, { T: Object.assign({ DYNAMIC: false, HORSE_MODE: true }, o.T || {}) }));
/** 從 t 推到 t1（每幀 DT），回傳 {t, ev}：ev 是 sfx 事件（含附帶欄位與發生時間 t）。 */
function runEv(g, t, t1, inputFn) {
  const ev = [];
  while (t < t1 - 1e-9 && g.phase === 'play') {
    t = Math.min(t1, t + DT);
    g.step(t, inputFn ? inputFn(g, t) : {});
    for (const e of g.drain()) if (e.type === 'sfx') ev.push(Object.assign({ t }, e));
  }
  return { t, ev };
}
/** 腹中來回走的方向：靠近兩端就掉頭（不去踩暗門）。 */
function paceDir(g, dir) { const x = g.player.x; return x > 10.2 ? -1 : x < 6 ? 1 : dir; }

test('11/11 木馬：HORSE_MODE 預設關；開關關著時腹中、陰影都和原本一樣', () => {
  assert.equal(K.HORSE_MODE, false);
  assert.equal(K.BELLY_STEPS_NEED, 4);
  const off = R.createLevel({ startZone: 1 });
  assert.ok(!off.level.shadows.some((s) => s.name === '木馬東側的影子'), '關著不多陰影');
  assert.equal(off.level.shadows.length, R.buildLevel().shadows.length);
  const on = R.createLevel({ startZone: 1, T: { HORSE_MODE: true } });
  assert.equal(on.level.shadows.length, R.buildLevel().shadows.length + 1);
  // 開關關著：腹中照舊可以直接從暗門下去（不用先踩準）
  const g = R.createLevel({ startZone: 1, T: { DYNAMIC: false } });
  g.step(0, {}); g.drain();
  place(g, 11, 15); g.step(DT, {});
  assert.equal(g.zone, 2, '開關關著：走到暗門就下去');
});

test('11/11 木馬 A：腹中零失敗——起步出聲發 belly_hush（扣格），不進高度警覺、不失敗；衛兵就在正下方也一樣', () => {
  const g = hrs({ startZone: 1 });
  const q = g.guards.find((x) => x.zone === 1);
  q.x = 8; q.z = 15; q.route = [{ x: 8, z: 15 }]; q.wp = 0;   // 衛兵就站在腹中正下方
  let t = 6.4; g.step(t, {}); g.drain();                      // p > HIGH_P：舊版這時在腹中出聲就會被發現
  place(g, 7, 15);
  const all = [];
  let dir = 1;
  for (let k = 0; k < 6; k++) {
    t = idleUntil(g, t, (gg, tt) => !R.stepMasked(tt, gg), t + 5);   // 離拍起步 → 出聲
    g.drain();
    const r = runEv(g, t, t + 0.2, (gg) => ({ mx: (dir = paceDir(gg, dir)) }));
    t = r.t; all.push(...r.ev);
    t = runEv(g, t, t + 0.6, () => ({})).t;
  }
  const hush = all.filter((e) => e.a === 'belly_hush');
  assert.ok(hush.length >= 3, `有出聲的腳步：${all.map((e) => e.a).join(' ')}`);
  assert.ok(!all.some((e) => e.a === 'step_loud'), '腹中不發 step_loud（改發 belly_hush）');
  assert.ok(!all.some((e) => e.a === 'alerted' || e.a === 'hunt' || e.a === 'caught'));
  assert.equal(g.phase, 'play');
  assert.equal(q.state, 'patrol');
  assert.equal(q.susp, 0, '衛兵什麼都沒察覺');
  assert.equal(g.belly.ready, false);
});

test('11/11 木馬 A（第 1.1 節）：只有起步算數——站定後第一步踩準亮一格（start: true），後續步不亮不扣（start: false）；起步踩歪 belly_hush 扣 BELLY_MISS_COST 格（最少 0）；亮滿 → belly_ready → 下一個掩護窗 trapdoor_open', () => {
  const g = hrs({ startZone: 1 });
  let t = 1; g.step(t, {}); g.drain();
  place(g, 11, 15); t += DT; g.step(t, {});
  assert.equal(g.zone, 1, '沒達成前走到暗門不開');
  place(g, 7, 15);
  // 起步踩準，接著連續走 2 秒：只有起步那一步亮格
  t = idleUntil(g, t, (gg, tt) => R.stepMasked(tt, gg), 9.5); g.drain();
  let r = runEv(g, t, t + 2, (gg) => ({ mx: 1 }));
  t = r.t;
  const st = r.ev.filter((e) => e.a === 'step_masked' || e.a === 'step_loud' || e.a === 'belly_hush');
  assert.ok(st.length >= 3, st.map((e) => e.a).join(' '));
  assert.equal(st[0].a, 'step_masked'); assert.equal(st[0].start, true); assert.equal(st[0].n, 1); assert.equal(st[0].need, K.BELLY_STEPS_NEED);
  assert.ok(st.slice(1).every((e) => e.start === false && e.a !== 'belly_hush'), '後續步 start: false、不扣格');
  assert.ok(st.slice(1).filter((e) => e.a === 'step_masked').every((e) => e.n === 1), '後續步不亮格');
  assert.equal(g.belly.n, 1);
  // 站定之後離拍起步：扣 BELLY_MISS_COST 格
  t = runEv(g, t, t + 1, () => ({})).t;
  t = idleUntil(g, t, (gg, tt) => !R.stepMasked(tt, gg), t + 5); g.drain();
  r = runEv(g, t, t + DT, () => ({ mx: -1 })); t = r.t;
  const hush = r.ev.find((e) => e.a === 'belly_hush');
  assert.ok(hush, r.ev.map((e) => e.a).join(' '));
  assert.equal(g.belly.n, Math.max(0, 1 - K.BELLY_MISS_COST));
  assert.equal(hush.n, g.belly.n); assert.equal(hush.cost, K.BELLY_MISS_COST);
  // 再踩歪一次也不會低於 0
  t = runEv(g, t, t + 1, () => ({})).t;
  t = idleUntil(g, t, (gg, tt) => !R.stepMasked(tt, gg), t + 5); g.drain();
  t = runEv(g, t, t + DT, () => ({ mx: 1 })).t;
  assert.equal(g.belly.n, 0, '最少扣到 0');
  // 每次站定、等鼓點、起步一步，亮滿 need 格 → belly_ready（先回到腹中中間，免得門一開就站在暗門上掉下去）
  place(g, 7, 15);
  let ready = null;
  while (!g.belly.ready && t < 120) {
    t = runEv(g, t, t + 0.4, () => ({})).t;
    t = idleUntil(g, t, (gg, tt) => R.stepMasked(tt, gg), t + 10); g.drain();
    r = runEv(g, t, t + DT, (gg) => ({ mx: gg.player.x > 9 ? -1 : 1 })); t = r.t;
    ready = r.ev.find((e) => e.a === 'belly_ready') || ready;
  }
  assert.ok(ready && g.belly.n === K.BELLY_STEPS_NEED);
  const after = runEv(g, t, t + 12, () => ({}));
  const open = after.ev.find((e) => e.a === 'trapdoor_open');
  assert.ok(open && g.belly.open, '亮滿之後才開');
  assert.equal(g.zone, 1, '門開了但還沒走過去');
  const ws = R.blindWindows(ready.t + 1e-6, open.t + 1e-6, g);
  assert.equal(ws.length, 1, `達成之後的「下一個」掩護窗：ready ${ready.t} open ${open.t} ${JSON.stringify(ws)}`);
  assert.ok(Math.abs(open.t - ws[0].from) <= DT + 1e-9, `開門在掩護窗開頭：${open.t} vs ${ws[0].from}`);
  place(g, 11, 15); g.step(after.t + DT, {});
  assert.equal(g.zone, 2, '開了之後走到暗門就下去');
});

test('11/11 木馬 A：開關開時第 1 區的進區提示講「站定、等鼓點、再踏出去」（數字由常數生成、不說「斷」「停」）；關著仍是踩拍走', () => {
  const g = hrs({ startZone: 0 });
  g.step(1, {}); g.start(); const out = g.drain();
  const H = R.hintsFor(g.T);
  assert.ok(out.some((e) => e.type === 'hint' && e.a === H.belly));
  assert.ok(H.belly.includes('站定') && H.belly.includes('第一步') && H.belly.includes('亮滿 ' + K.BELLY_STEPS_NEED + ' 格'), H.belly);
  assert.ok(R.hintsFor(Object.assign({}, K, { BELLY_STEPS_NEED: 6 })).belly.includes('亮滿 6 格'));
  assert.ok(!/斷|停|跟著鼓點走/.test(H.belly), '不說斷、停，也不寫成「跟著鼓點走」（第 1.1 節第 5 點）');
  const off = R.createLevel({ startZone: 0 }); off.step(1, {}); off.start();
  assert.ok(off.drain().some((e) => e.type === 'hint' && e.a === R.hintsFor(off.T).step));
});

test('11/11 木馬 C1：開關開時多一塊木馬東緣外 3 公尺的陰影，規則照現有陰影（站進去就藏起來）', () => {
  const L = R.buildLevel();
  const hs = R.horseShadowFor(L);
  assert.deepEqual([hs.x0, hs.z0, hs.x1, hs.z1], [L.horse.x1, L.horse.z0, L.horse.x1 + 3, L.horse.z1]);
  const g = hrs({ startZone: 2 });
  assert.ok(g.level.shadows.some((s) => s.name === hs.name));
  g.step(0, {});
  place(g, (hs.x0 + hs.x1) / 2, (hs.z0 + hs.z1) / 2); g.step(DT, {});
  assert.equal(g.player.hidden, true, '在木馬陰影裡');
  const off = R.createLevel({ startZone: 2, T: { DYNAMIC: false } });
  off.step(0, {}); place(off, (hs.x0 + hs.x1) / 2, (hs.z0 + hs.z1) / 2); off.step(DT, {});
  const inOther = off.level.shadows.some((s) => R.inRect(off.player.x, off.player.z, s));
  assert.equal(off.player.hidden, inOther, '開關關著：照原本的陰影');
});

test('11/11 木馬 C1：被追殺時躲進木馬陰影不動 ESCAPE_STILL 秒，甩掉追兵', () => {
  const g = hrs({ startZone: 2 });
  const hs = R.horseShadowFor(g.level);
  const q = solo(g, 'g2a', 25, 15, Math.PI / 2);
  place(g, (hs.x0 + hs.x1) / 2, (hs.z0 + hs.z1) / 2);
  g.step(0.7, {}); g.drain();
  q.state = 'hunted'; q.susp = 1; q.lastKnown = { x: 25, z: 15 }; g.hunted = true; g.stillT = 0;
  const r = runEv(g, 0.7, 0.7 + K.ESCAPE_STILL + 0.5, () => ({}));
  assert.ok(g.player.hidden);
  assert.ok(r.ev.some((e) => e.a === 'escape'), r.ev.map((e) => e.a).join(' '));
  assert.equal(g.hunted, false);
  assert.equal(g.phase, 'play');
});

test('11/11 木馬 ?lab=belly：只有腹中、沒有衛兵、循環固定、開關自己開；爬下暗門就過關', () => {
  const g = R.createLevel({ lab: 'belly' });
  assert.equal(g.lab, 'belly');
  assert.equal(g.T.HORSE_MODE, true);
  assert.equal(g.T.DYNAMIC, false);
  assert.equal(g.zone, 1);
  assert.equal(g.phase, 'play');
  assert.equal(g.guards.length, 0, '沒有衛兵');
  g.step(0, {});
  g.belly.open = true; place(g, 11, 15); g.step(DT, {});
  assert.equal(g.phase, 'win');
  assert.ok(g.drain().some((e) => e.a === 'trapdoor'));
});

/**
 * ?lab=belly 的程式玩家（第 1.1 節：只有起步算數，所以都是「站定 → 起步走一幀 → 站定」）。kind：
 *   'perfect'：站定夠久（STEP_GAP × STEP_GAP_MIN）後，只在下一幀落在可聽拍上時起步；
 *   'sigma'：同上，判斷用 t − e 那一刻的狀態（e ~ N(0, sigma)，每次起步重抽）；
 *   'random'：不聽拍，站定一段隨機時間（0.3～1.5 秒）就起步；
 *   'forward'：一直按住往暗門走（整局只有一次起步）。
 * 亮滿之後站著等；暗門開了就走過去（這段不算考題）。
 */
function makeBellyBot(kind, sigma, seed) {
  const rnd = R.mulberry32((seed || 1) * 31 + 7);
  const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  let dir = 1, err = sigma ? gauss() * sigma : 0, lastStep = -1e9, waitUntil = null;
  return function (g) {
    const t = g.time, B = g.belly, pl = g.player, K2 = g.T;
    if (kind === 'forward') return { mx: 1 };
    if (B.open) { const dx = 11 - pl.x, dz = 15 - pl.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d }; }
    if (B.ready) return {};
    const rested = t - lastStep >= K2.STEP_GAP * K2.STEP_GAP_MIN + 0.02;
    if (!rested) return {};
    let go = false;
    if (kind === 'random') {
      if (waitUntil == null) waitUntil = t + 0.3 + rnd() * 1.2;
      go = t >= waitUntil;
    } else {
      const tv = t - err;
      go = R.stepMasked(tv + 1 / 60, g);
    }
    if (!go) return {};
    lastStep = t + 1 / 60; waitUntil = null;
    if (sigma) err = gauss() * sigma;
    return { mx: (dir = paceDir(g, dir)) };
  };
}
function runBelly(kind, sigma, seed, T, maxT = 300) {
  const t0 = (seed * 1.37) % 10;
  const g = R.createLevel({ lab: 'belly', t0, seed, T });
  const bot = makeBellyBot(kind, sigma, seed);
  let t = t0; g.step(t, {});
  let hush = 0;
  while (g.phase === 'play' && t - t0 < maxT) { t += DT; g.step(t, bot(g)); for (const e of g.drain()) if (e.a === 'belly_hush') hush++; }
  return { win: g.phase === 'win', time: t - t0, hush };
}
const medianOf = (a) => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
/** 某個 BELLY_MISS_COST 下四種程式玩家各 20 局的結果。 */
function bellyTrial(cost) {
  const T = { BELLY_MISS_COST: cost };
  const run = (kind, sigma, maxT) => { const rs = []; for (let seed = 1; seed <= 20; seed++) rs.push(runBelly(kind, sigma, seed, T, maxT)); return rs; };
  const P = run('perfect', 0), S = run('sigma', 0.12), X = run('random', 0), F = run('forward', 0, 60);
  const m = (rs) => medianOf(rs.map((r) => r.time));
  const res = { cost, perfect: m(P), sigma: m(S), random: m(X), forwardWins: F.filter((r) => r.win).length, randomWins: X.filter((r) => r.win).length, allWin: [P, S].every((rs) => rs.every((r) => r.win)) };
  res.pass = res.perfect <= 20 && res.sigma <= 45 && res.random >= 2 * res.perfect && res.forwardWins === 0;
  return res;
}

test('11/11 木馬 ?lab=belly（第 1.1 節驗收量時間）：BELLY_MISS_COST 0／1／4 各跑完美起步、σ0.12、隨機起步 20 局；預設值是三條都過的最小值', () => {
  const rows = [0, 1, 4].map(bellyTrial);
  console.log('  [lab=belly 第 1.1 節] BELLY_MISS_COST｜完美起步中位｜σ0.12 中位｜隨機起步中位（÷ 完美）｜只按前進 60 秒內過｜三條');
  for (const r of rows) console.log(`    ${r.cost}｜${r.perfect.toFixed(1)} 秒｜${r.sigma.toFixed(1)} 秒｜${r.random.toFixed(1)} 秒（${(r.random / r.perfect).toFixed(2)} 倍）｜${r.forwardWins}/20｜${r.pass ? '過' : '不過'}（隨機起步 300 秒內過 ${r.randomWins}/20）`);
  for (const r of rows) assert.ok(r.allWin, `cost ${r.cost}：零失敗，完美起步與 σ0.12 都要過`);
  const best = rows.find((r) => r.pass);
  assert.ok(best, '三個值都過不了：回報設計席（不調 STEP_WIN）');
  assert.equal(K.BELLY_MISS_COST, best.cost, `預設 BELLY_MISS_COST 要是三條都過的最小值 ${best.cost}`);
});
