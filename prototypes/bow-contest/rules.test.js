// 執行：node --test prototypes/bow-contest/rules.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rules.js');

const DT = 1 / 60;

test('拉滿時每種斧孔都有能穿過十二孔的瞄準窗', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const w = R.solveWindow(1, d);
    assert.ok(w, `${d} 應該有窗`);
    assert.ok(w.pitchMax - w.pitchMin > 0.0005, `${d} pitch 窗太窄`);
    assert.ok(w.yawMax - w.yawMin > 0.001, `${d} yaw 窗太窄`);
    const res = R.simulate(R.makeShot({ yaw: w.yawMid, pitch: w.pitchMid, power: 1 }), d);
    assert.equal(res.win, true);
    assert.equal(res.passed, 12);
    assert.equal(res.events.length, 12);
  }
});

test('窗的大小：寬鬆 > 普通 > 嚴格，嚴格很窄', () => {
  const size = d => { const w = R.solveWindow(1, d); return (w.pitchMax - w.pitchMin) * (w.yawMax - w.yawMin); };
  const e = size('easy'), n = size('normal'), h = size('hard');
  assert.ok(e > n && n > h);
  const wh = R.solveWindow(1, 'hard');
  assert.ok(wh.pitchMax - wh.pitchMin < 0.004, '嚴格的 pitch 窗應小於 4 mrad');
});

test('普通：拉不到 0.8 怎麼瞄都穿不完', () => {
  for (const p of [0.3, 0.5, 0.7, 0.79]) assert.equal(R.solveWindow(p, 'normal', { step: 0.00005 }), null, `power ${p}`);
});

test('結果會說明停在哪裡、為什麼', () => {
  const w = R.solveWindow(1, 'normal');
  const high = R.simulate(R.makeShot({ yaw: 0, pitch: w.pitchMax + 0.004, power: 1 }), 'normal');
  assert.equal(high.win, false);
  assert.equal(high.stop.dir, 'high');
  assert.match(R.describe(high), /偏高/);
  const left = R.simulate(R.makeShot({ yaw: 0.02, pitch: w.pitchMid, power: 1 }), 'normal');
  assert.equal(left.stop.dir, 'left');
  const right = R.simulate(R.makeShot({ yaw: -0.02, pitch: w.pitchMid, power: 1 }), 'normal');
  assert.equal(right.stop.dir, 'right');
  const highOk = R.simulate(R.makeShot({ yaw: 0, pitch: w.pitchMax + 0.004, power: 1 }), 'normal');
  assert.doesNotMatch(R.describe(highOk), /沒拉滿/);
  // 拉不滿又抬高：撞在斧頭上，也要說弓沒拉滿
  const weakHit = R.simulate(R.makeShot({ yaw: 0, pitch: w.pitchMid + 0.03, power: 0.7 }), 'normal');
  assert.equal(weakHit.stop.kind, 'hit', JSON.stringify(weakHit.stop));
  assert.match(R.describe(weakHit), /弓沒拉滿/);
  const weak = R.simulate(R.makeShot({ yaw: 0, pitch: 0, power: 0.2 }), 'normal');
  assert.equal(weak.stop.kind, 'short');
  assert.match(R.describe(weak), /落地/);
  const ok = R.simulate(R.makeShot({ yaw: w.yawMid, pitch: w.pitchMid, power: 1 }), 'normal');
  assert.match(R.describe(ok), /十二/);
});

// 簡單控制器：看到（延遲後的）指針偏哪邊，就往同一邊移手；單位是指針單位。
// range：手離按下位置最多能移多遠（指針單位），模擬手指碰到螢幕邊緣。
function runString(seed, controller, range = Infinity) {
  const s = R.createStringState(R.createRng(seed));
  const lag = Math.round(0.15 / DT), seen = [];
  for (let i = 0; i < 60 * 15; i++) {
    seen.push(s.needle);
    const n = seen[Math.max(0, seen.length - 1 - lag)];   // 150 ms 反應延遲
    let dx = controller ? Math.max(-0.09, Math.min(0.09, n * 0.12)) : 0;
    dx = Math.max(-range, Math.min(range, s.hand + dx)) - s.hand;
    R.stepString(s, DT, { down: true, dx });
    if (s.failed || s.done) break;
  }
  return s;
}

test('上弦：150 ms 反應延遲的簡單控制器能上好弦', () => {
  let done = 0;
  for (let seed = 1; seed <= 100; seed++) if (runString(seed, true).done) done++;
  assert.ok(done >= 95, `只成功 ${done}/100`);
});

test('上弦：手只能在 ±0.45 個輸入面寬內移動（例如手機螢幕），150 ms 延遲也能上好弦', () => {
  const range = 0.45 * R.TUNING.string.handSpan;
  let done = 0;
  for (let seed = 1; seed <= 100; seed++) if (runString(seed, true, range).done) done++;
  assert.ok(done >= 95, `只成功 ${done}/100`);
});

test('上弦：放手時指針停在原地，不會回中；張力慢慢退回，再按下從原處繼續', () => {
  const s = R.createStringState(R.createRng(4));
  for (let i = 0; i < 60; i++) R.stepString(s, DT, { down: true, dx: i < 20 ? 0.02 : 0 });
  const needle = s.needle, tension = s.tension, out = s.outTime;
  assert.ok(Math.abs(needle) > 0.1, `needle ${needle}`);   // 不在中間，才看得出有沒有回中
  for (let i = 0; i < 60; i++) R.stepString(s, DT, { down: false, dx: 0 });
  assert.equal(s.needle, needle);
  assert.equal(s.outTime, out);
  assert.ok(s.tension < tension);
});

test('上弦：按住不動會滑掉；完全不按永遠上不了', () => {
  for (let seed = 1; seed <= 100; seed++) assert.equal(runString(seed, false).failed, true, `seed ${seed}`);
  const s = R.createStringState(R.createRng(7));
  for (let i = 0; i < 600; i++) R.stepString(s, DT, { down: false, dx: 0 });
  assert.equal(s.done, false);
  assert.equal(s.failed, false);
  assert.equal(s.tension, 0);
});

function swayRms(fatigue, from, to, seed = 3) {
  // from/to：拉滿後的秒數
  const s = R.createDrawState(R.createRng(seed));
  let sum = 0, n = 0;
  for (let t = 0; t < R.TUNING.draw.fillTime + to; t += DT) {
    R.stepDraw(s, DT, { down: true, fatigue });
    if (s.power >= 1 && s.fullTime >= from && s.fullTime < to) {
      sum += s.sway.yaw ** 2 + s.sway.pitch ** 2; n++;
    }
  }
  return Math.sqrt(sum / n);
}

test('拉弓：約一秒拉滿；拉滿後 0.8 … 2.0 秒最穩', () => {
  const s = R.createDrawState(R.createRng(1));
  for (let i = 0; i < 30; i++) R.stepDraw(s, DT, { down: true });
  assert.ok(s.power > 0.45 && s.power < 0.55);
  for (let i = 0; i < 31; i++) R.stepDraw(s, DT, { down: true });
  assert.equal(s.power, 1);
  const amp = ft => R.swayAmplitude(true, 1, ft, true).amp;
  assert.ok(R.swayAmplitude(true, 0.5, 0, true).amp > amp(1.2));
  assert.ok(amp(0.2) > amp(1.2));
  assert.equal(R.swayAmplitude(true, 1, 1.2, true).stage, 'steady');
  const early = swayRms(true, 0, 0.3), steady = swayRms(true, 0.8, 2.0), late = swayRms(true, 3.0, 4.0);
  assert.ok(steady < early && steady < late, `steady ${steady} early ${early} late ${late}`);
});

test('撐久手會抖：開關有效', () => {
  const on = swayRms(true, 3.0, 4.0), off = swayRms(false, 3.0, 4.0);
  assert.ok(on > off * 3, `on ${on} off ${off}`);
  assert.equal(R.swayAmplitude(true, 1, 3.5, false).stage, 'steady');
  assert.equal(R.swayAmplitude(true, 1, 3.5, true).stage, 'tremble');
});

test('最穩時瞄準窗中心，加上實際晃動，普通難度大多能過', () => {
  const w = R.solveWindow(1, 'normal');
  let wins = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const s = R.createDrawState(R.createRng(seed));
    while (!(s.power >= 1 && s.fullTime >= 1.2)) R.stepDraw(s, DT, { down: true, fatigue: true });
    const rel = R.releaseDraw(s);
    assert.equal(rel.fire, true);
    const res = R.simulate(R.makeShot({ yaw: w.yawMid, pitch: w.pitchMid, power: rel.power, sway: rel.sway }), 'normal');
    if (res.win) wins++;
  }
  assert.ok(wins >= 45, `只過 ${wins}/50`);
});

test('放手太早＝取消，不射出', () => {
  const s = R.createDrawState(R.createRng(2));
  for (let i = 0; i < 5; i++) R.stepDraw(s, DT, { down: true });
  assert.equal(R.releaseDraw(s).fire, false);
});

// ---------------------------------------------------------------- 一輪
function stepN(round, n, input) { const ev = []; for (let i = 0; i < n; i++) ev.push(...R.stepRound(round, DT, input)); return ev; }

test('一輪：上弦成功後進入瞄準；重來時跳過上弦', () => {
  const r = R.createRound({ difficulty: 'normal' }, R.createRng(1));
  assert.equal(r.phase, 'string');
  r.str.tension = 0.999;
  const ev = R.stepRound(r, DT, { down: true, stringDx: 0 });
  assert.ok(ev.some(e => e.type === 'strung'));
  assert.equal(r.phase, 'aim');
  assert.equal(r.strungOnce, true);
  // 上好弦那一下還按著：不會直接拉弓
  stepN(r, 10, { down: true });
  assert.equal(r.draw.drawing, false);
  const again = R.createRound({ difficulty: 'normal' }, R.createRng(2), { strungOnce: r.strungOnce });
  assert.equal(again.phase, 'aim');
  assert.equal(R.createRound({ stringPhase: false }, R.createRng(3)).phase, 'aim');
});

test('一輪：上弦滑掉是一個結果，附原因文字', () => {
  const r = R.createRound({}, R.createRng(5));
  let ev = [];
  for (let i = 0; i < 900 && r.phase === 'string'; i++) ev.push(...R.stepRound(r, DT, { down: true, stringDx: 0 }));
  assert.equal(r.phase, 'result');
  assert.equal(r.result.win, false);
  assert.equal(r.result.reason, 'slip');
  assert.ok(ev.some(e => e.type === 'slip'));
  assert.match(r.result.text, /亮區/);
});

test('一輪：拉弓時瞄準變慢，倍率是規則常數', () => {
  const r = R.createRound({ stringPhase: false }, R.createRng(6));
  const y0 = r.aim.yaw;
  R.stepRound(r, DT, { down: false, look: { yaw: 0.01, pitch: 0 } });
  assert.ok(Math.abs(r.aim.yaw - y0 - 0.01) < 1e-12);
  stepN(r, 5, { down: true });
  const y1 = r.aim.yaw;
  R.stepRound(r, DT, { down: true, look: { yaw: 0.01, pitch: 0 } });
  assert.ok(Math.abs(r.aim.yaw - y1 - 0.01 * R.TUNING.aim.drawSensitivity) < 1e-12);
});

test('一輪：放得太早取消；瞄準窗中心拉滿放手會穿過十二孔並得勝', () => {
  const r = R.createRound({ stringPhase: false, difficulty: 'normal', fatigue: false }, R.createRng(7));
  stepN(r, 3, { down: true });
  let ev = R.stepRound(r, DT, { down: false });
  assert.ok(ev.some(e => e.type === 'cancel'));
  assert.equal(r.phase, 'aim');

  const w = R.solveWindow(1, 'normal');
  r.aim.yaw = w.yawMid; r.aim.pitch = w.pitchMid;
  while (!(r.draw.power >= 1 && r.draw.fullTime >= 1.2)) R.stepRound(r, DT, { down: true });
  const swayAtRelease = { ...r.draw.sway };
  ev = R.stepRound(r, DT, { down: false });
  const fire = ev.find(e => e.type === 'fire');
  assert.ok(fire);
  assert.equal(fire.power, 1);
  assert.equal(r.phase, 'flight');
  assert.equal(r.flight.shot.power, 1);   // 用放手那一刻的快照，不是歸零後的狀態
  assert.ok(Math.abs(r.flight.shot.origin.x - swayAtRelease.x) < 1e-12);
  const all = [];
  for (let i = 0; i < 60 * 30 && r.phase === 'flight'; i++) all.push(...R.stepRound(r, DT, {}));
  assert.equal(r.phase, 'result');
  assert.equal(all.filter(e => e.type === 'pass').length, 12);
  assert.equal(r.result.win, true);
  assert.equal(r.result.passed, 12);
  assert.match(r.result.text, /十二/);
});

test('一輪：沒過的結果說明原因', () => {
  const r = R.createRound({ stringPhase: false }, R.createRng(8));
  R.fireRound(r, { power: 0.3, sway: { yaw: 0, pitch: 0, x: 0, y: 0 } });
  for (let i = 0; i < 60 * 30 && r.phase === 'flight'; i++) R.stepRound(r, DT, {});
  assert.equal(r.result.win, false);
  assert.equal(r.result.reason, 'short');
  assert.match(r.result.text, /弓沒拉滿/);
});
