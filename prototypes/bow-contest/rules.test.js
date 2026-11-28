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

// ---------------------------------------------------------------- 系列模式：帳 → 手穩
test('帳的晃動倍率：max(0.6, 1 − 0.04 × 帳)；亂填當 0', () => {
  assert.equal(R.ledgerSwayMul(0), 1);
  assert.ok(Math.abs(R.ledgerSwayMul(5) - 0.8) < 1e-12);
  assert.ok(Math.abs(R.ledgerSwayMul(10) - 0.6) < 1e-12);
  assert.equal(R.ledgerSwayMul(30), 0.6);
  assert.equal(R.ledgerSwayMul(-3), 1);
  assert.equal(R.ledgerSwayMul('壞'), 1);
  // 同一個亂數種子：帳 10 的晃動正好是帳 0 的 0.6 倍
  const rms = mul => {
    const s = R.createDrawState(R.createRng(9)); let sum = 0, n = 0;
    for (let i = 0; i < 180; i++) { R.stepDraw(s, DT, { down: true, swayMul: mul }); sum += s.sway.yaw ** 2 + s.sway.pitch ** 2; n++; }
    return Math.sqrt(sum / n);
  };
  assert.ok(Math.abs(rms(0.6) / rms(1) - 0.6) < 1e-9);
  const r = R.createRound({ stringPhase: false, ledger: 10 }, R.createRng(1));
  assert.ok(Math.abs(r.swayMul - 0.6) < 1e-12);
});

// ---------------------------------------------------------------- 起鬨
test('起鬨：先預告、lead 秒後才推手；尖峰大小隨帳變小（有下限）', () => {
  const K = R.TUNING.heckle;
  assert.equal(R.heckleScale(0), 1);
  assert.ok(R.heckleScale(5) < R.heckleScale(0) && R.heckleScale(10) < R.heckleScale(5));
  assert.equal(R.heckleScale(100), K.minScale);
  // 一次起鬨的尖峰：和 heckleScale 成正比
  const peak = scale => {
    const h = R.createHeckleState();
    let ev = R.stepHeckle(h, DT, true, true, () => 0, 1);   // rng 0：一定起鬨、第一次在 firstMin
    let cueT = null, hitT = null, max = 0;
    for (let i = 0; i < 60 * 6; i++) {
      ev = R.stepHeckle(h, DT, true, false, () => 0, 1);
      for (const e of ev) { if (e.type === 'heckleCue' && cueT === null) cueT = h.t; if (e.type === 'heckleHit' && hitT === null) hitT = h.t; }
      const o = R.heckleOffset(h, scale);
      if (hitT === null) assert.equal(Math.hypot(o.yaw, o.pitch), 0, '預告期間不能推手');
      max = Math.max(max, Math.hypot(o.yaw, o.pitch));
    }
    assert.ok(cueT !== null && hitT !== null);
    assert.ok(Math.abs(hitT - cueT - K.lead) < DT * 1.5, `lead ${hitT - cueT}`);
    assert.ok(cueT >= K.firstMin - DT && cueT <= K.firstMax + DT);
    return max;
  };
  const p0 = peak(R.heckleScale(0)), p10 = peak(R.heckleScale(10));
  assert.ok(Math.abs(p10 / p0 - R.heckleScale(10)) < 1e-9);
  assert.ok(p0 > 0.006, `帳 0 的尖峰要大到推出瞄準窗：${p0}`);
});

test('起鬨：不拉弓就不起鬨；拉弓中的尖峰真的會讓窗中心的箭失手，等它過去就沒事', () => {
  const run = (opts, policy) => {
    let wins = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = R.createRound(Object.assign({ stringPhase: false, difficulty: 'normal', heckle: true }, opts), R.createRng(seed));
      const w = R.solveWindow(1, 'normal', { step: 0.0001 }); r.aim.yaw = w.yawMid; r.aim.pitch = w.pitchMid;
      for (let k = 0; k < 60 * 12 && r.phase === 'aim'; k++) R.stepRound(r, DT, { down: !(r.draw.power >= 1 && policy(r)) });
      if (r.flight && r.flight.res.win) wins++;
    }
    return wins;
  };
  const blind = r => r.draw.fullTime >= 1.8;
  const patient = r => {   // 看到預告就等，等尖峰退了再放
    const h = r.heckle, busy = h.list.some(e => h.t >= e.cueAt && h.t < e.hitAt + 1.0);
    return r.draw.fullTime >= 0.8 && !busy;
  };
  const b0 = run({ ledger: 0 }, blind), b10 = run({ ledger: 10 }, blind), p0 = run({ ledger: 0 }, patient);
  assert.ok(b0 < 110, `帳 0 不看預告：${b0}/120`);
  assert.ok(b10 > b0, `帳多手穩：${b10} > ${b0}`);
  assert.ok(p0 >= 117, `會等的人：${p0}/120`);
  const idle = R.createRound({ stringPhase: false, heckle: true }, R.createRng(3));
  const ev = []; for (let i = 0; i < 600; i++) ev.push(...R.stepRound(idle, DT, { down: false }));
  assert.equal(ev.filter(e => e.type === 'heckleCue').length, 0);
});

test('知情的人：忒勒馬科斯知道 → 起鬨機率變低', () => {
  assert.equal(R.knowersEffect(null).heckleChance, R.TUNING.heckle.chance);
  assert.ok(R.knowersEffect({ tele: 'knows' }).heckleChance < R.knowersEffect({ tele: 'suspects' }).heckleChance);
  assert.ok(R.knowersEffect({ tele: 'suspects' }).heckleChance < R.TUNING.heckle.chance);
  assert.equal(R.knowersEffect({ eum: 'knows', pen: 'knows' }).lines.length, 2);
});

// ---------------------------------------------------------------- 呼吸
test('呼吸：一個循環 3.5 秒；從拉弓起算，拉滿時吸滿，拉滿後 0.9 … 2.5 秒是呼氣窗（和最穩重疊）', () => {
  const B = R.TUNING.breath;
  assert.equal(B.period, 3.5);
  assert.ok(R.breathLung(B.inhale) > 0.99);
  assert.equal(R.breathLung(B.inhale + B.exhale + 0.1), 0);
  assert.equal(R.inBreathWindow(0.05), false);                 // 吸氣開頭肺量也低，但不算
  assert.equal(R.inBreathWindow(B.period - 0.01), true);
  const s = R.createDrawState(R.createRng(2)), win = [];
  for (let i = 0; i < 60 * 5; i++) { R.stepDraw(s, DT, { down: true, breath: true }); if (s.power >= 1) win.push([s.fullTime, s.breathWin]); }
  for (const [ft, w] of win) {
    if (ft > 0.95 && ft < 2.45) assert.equal(w, true, `拉滿後 ${ft.toFixed(2)} 秒應在窗裡`);
    if (ft < 0.6 || (ft > 2.55 && ft < 3.4)) assert.equal(w, false, `拉滿後 ${ft.toFixed(2)} 秒不該在窗裡`);
  }
  // 呼吸開時，最穩延到 2.5 秒才開始累
  assert.equal(R.swayAmplitude(true, 1, 2.3, true, B.steadyEnd).stage, 'steady');
  assert.equal(R.swayAmplitude(true, 1, 2.3, true).stage, 'tremble');
});

test('呼吸：呼氣窗裡晃得最少；在窗裡放箭比吸滿時放更穩', () => {
  // 同樣在「最穩」階段比：窗裡（拉滿後 1.0 … 2.4）對上關掉呼吸的同一段
  const rms = (breath, from, to) => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = R.createDrawState(R.createRng(seed));
      for (let i = 0; i < 60 * 4; i++) {
        R.stepDraw(s, DT, { down: true, breath, fatigue: false });
        if (s.power >= 1 && s.fullTime >= from && s.fullTime < to) { sum += s.sway.yaw ** 2 + s.sway.pitch ** 2; n++; }
      }
    }
    return Math.sqrt(sum / n);
  };
  const inWin = rms(true, 1.0, 2.4), off = rms(false, 1.0, 2.4), early = rms(true, 0, 0.2);
  assert.ok(inWin < off * 0.7, `窗裡 ${inWin} 關掉呼吸 ${off}`);
  assert.ok(early > inWin * 2, `剛拉滿（還吸著）${early}`);
  // 嚴格難度：拉滿就放（吸滿）對上在窗裡放
  const rate = when => {
    let wins = 0; const w = R.solveWindow(1, 'hard');
    for (let seed = 1; seed <= 150; seed++) {
      const s = R.createDrawState(R.createRng(seed));
      while (!(s.power >= 1 && when(s))) R.stepDraw(s, DT, { down: true, breath: true });
      const rel = R.releaseDraw(s);
      if (R.simulate(R.makeShot({ yaw: w.yawMid, pitch: w.pitchMid, power: rel.power, sway: rel.sway }), 'hard').win) wins++;
    }
    return wins;
  };
  const atInhale = rate(s => true), inWindow = rate(s => s.breathWin && s.fullTime >= 1.0);
  assert.ok(inWindow > atInhale + 20, `窗裡 ${inWindow} 吸滿 ${atInhale}`);
});

// ---------------------------------------------------------------- 先看求婚者、斧列偏移
test('斧列偏移：求婚者的箭釘在孔的哪一邊，就能推回斧列偏向（每種難度、每個種子都一致）', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const r = R.holeRadius(d);
    for (let seed = 1; seed <= 60; seed++) {
      const rng = R.createRng(seed), off = R.makeAxeOffset(rng, d), w = R.createWatch(d, off, rng);
      assert.ok(Math.abs(off.x) >= r * 0.55 - 1e-12 && Math.abs(off.x) <= r * 0.95 + 1e-12);
      const shots = w.beats.filter(b => b.shoot);
      assert.equal(shots.length, 2);
      for (const b of shots) {
        assert.equal(b.res.win, false, '求婚者不能贏');
        assert.equal(b.res.stop.kind, 'hit', `${d} ${seed}`);
        assert.match(b.hitText, off.x > 0 ? /孔的左/ : /孔的右/);
      }
      const inf = R.inferOffset(w);
      assert.equal(Math.sign(inf.x), Math.sign(off.x));
      assert.ok(Math.abs(inf.x - off.x) < 0.02, `${d} ${seed} 推估 ${inf.x} 實際 ${off.x}`);
      // 偏了也一定有窗，而且窗往偏的那邊移
      const win = R.solveWindow(1, d, { offset: off, step: 0.00005 });
      assert.ok(win, `${d} ${seed} 沒有窗`);
      assert.equal(Math.sign(-win.yawMid), Math.sign(off.x));
    }
  }
});

test('斧列偏移：看懂了才射得準——照不偏的窗瞄，嚴格難度一定失手；照偏過的窗瞄，穿過十二孔', () => {
  let nominalWins = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const off = R.makeAxeOffset(R.createRng(seed), 'hard');
    const nom = R.nominalAim('hard');
    if (R.simulate(R.makeShot({ yaw: 0, pitch: nom.pitch, power: 1 }), 'hard', off).win) nominalWins++;
    const w = R.solveWindow(1, 'hard', { offset: off, step: 0.00005 });
    assert.equal(R.simulate(R.makeShot({ yaw: w.yawMid, pitch: w.pitchMid, power: 1 }), 'hard', off).win, true);
  }
  assert.equal(nominalWins, 0);
});

test('一輪：先看求婚者 → 兩支箭 → 上弦；空白鍵跳過也拿得到資訊；重來不再看、斧列不變', () => {
  const r = R.createRound({ watch: true, difficulty: 'normal' }, R.createRng(11));
  assert.equal(r.phase, 'watch');
  assert.notEqual(r.axeOffset.x, 0);
  const ev = [];
  for (let i = 0; i < 60 * 40 && r.phase === 'watch'; i++) ev.push(...R.stepRound(r, DT, {}));
  assert.equal(ev.filter(e => e.type === 'beat').length, R.WATCH_SCRIPT.length);
  assert.equal(ev.filter(e => e.type === 'suitorFire').length, 2);
  assert.equal(ev.filter(e => e.type === 'suitorStop').length, 2);
  const end = ev.find(e => e.type === 'watchEnd');
  assert.ok(end && !end.skipped);
  assert.match(end.summary, /孔的(左|右)邊/);
  assert.equal(r.phase, 'string');
  assert.equal(r.watched, true);

  const s = R.createRound({ watch: true, stringPhase: false }, R.createRng(12));
  R.stepRound(s, DT, {});
  const sev = R.stepRound(s, DT, { skip: true });
  assert.equal(s.phase, 'aim');
  assert.equal(sev.filter(e => e.type === 'suitorStop').length, 2, '跳過時兩支箭也要落定（畫面照樣釘上去）');
  assert.ok(sev.find(e => e.type === 'watchEnd').skipped);

  const again = R.createRound({ watch: true }, R.createRng(13), { watched: s.watched, axeOffset: s.axeOffset, strungOnce: true });
  assert.equal(again.phase, 'aim');
  assert.deepEqual(again.axeOffset, s.axeOffset);
  // 不開這個開關：斧列不偏、不看
  const plain = R.createRound({}, R.createRng(14));
  assert.equal(plain.phase, 'string');
  assert.deepEqual(plain.axeOffset, { x: 0, y: 0 });
});

test('一輪：全部開關都開（呼吸、起鬨、斧列偏移、帳 0），瞄偏過的窗、在呼氣窗裡避開起鬨放手，一樣穿過十二孔', () => {
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = R.createRound({ watch: true, stringPhase: false, breath: true, heckle: true, difficulty: 'normal' }, R.createRng(seed));
    R.stepRound(r, DT, { skip: true });
    const w = R.solveWindow(1, 'normal', { offset: r.axeOffset, step: 0.00005 });
    r.aim.yaw = w.yawMid; r.aim.pitch = w.pitchMid;
    for (let k = 0; k < 60 * 12 && r.phase === 'aim'; k++) {
      const d = r.draw, h = r.heckle, busy = h.list.some(e => h.t >= e.cueAt && h.t < e.hitAt + 1.0);
      R.stepRound(r, DT, { down: !(d.power >= 1 && d.breathWin && !busy) });
    }
    for (let k = 0; k < 60 * 30 && r.phase === 'flight'; k++) R.stepRound(r, DT, {});
    if (r.result && r.result.win) wins++;
  }
  assert.ok(wins >= 39, `${wins}/40`);
});

// ---------------------------------------------------------------- 系列存檔
function memStore(init) {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, data: m };
}

test('系列：沒有 ?series=1、或存檔讀不到，就是單獨遊玩', () => {
  const KEY = 'odyssey-series-v1';
  assert.equal(R.TUNING.series.key, KEY);
  const store = memStore({ [KEY]: JSON.stringify({ ledger: 7 }) });
  assert.equal(R.readSeries('', store).on, false);
  assert.equal(R.readSeries('?series=12', store).on, false);
  const boom = { getItem() { throw new Error('blocked'); } };
  assert.equal(R.readSeries('?series=1', boom).on, false);
  assert.equal(R.readSeries('?series=1', null).on, false);
  const s = R.readSeries('?debug&series=1', memStore({ [KEY]: JSON.stringify({ ledger: 7, knowers: { tele: 'knows', eum: 'x' } }) }));
  assert.equal(s.on, true);
  assert.equal(s.ledger, 7);
  assert.deepEqual(s.knowers, { tele: 'knows', eum: 'unknown', pen: 'unknown' });
  // 壞掉的存檔＝讀不到 → 單獨遊玩；沒有存檔（空的）→ 系列模式、帳 0
  const bad = R.readSeries('?series=1', memStore({ [KEY]: '{壞' }));
  assert.equal(bad.on, false);
  const empty = R.readSeries('?series=1', memStore({}));
  assert.equal(empty.on, true); assert.equal(empty.ledger, 0);
});

test('系列：結果寫進存檔——合併、不丟其他章的欄位，bow 取這場最好，step 改成 ending', () => {
  const KEY = 'odyssey-series-v1';
  const store = memStore({ [KEY]: JSON.stringify({ step: 'bow', ledger: 7, years: 8, crewLost: ['波利忒斯'] }) });
  let rec = R.bowRecord(null, { win: false, passed: 5 });
  rec = R.bowRecord(rec, { win: false, passed: 3 });
  assert.deepEqual(rec, { win: false, passed: 5 });
  R.writeSeries(store, rec);
  let saved = JSON.parse(store.data[KEY]);
  assert.deepEqual(saved.bow, { win: false, passed: 5 });
  assert.equal(saved.step, 'ending');
  assert.equal(saved.ledger, 7); assert.equal(saved.years, 8); assert.deepEqual(saved.crewLost, ['波利忒斯']);
  rec = R.bowRecord(rec, { win: true, passed: 12 });
  R.writeSeries(store, rec);
  saved = JSON.parse(store.data[KEY]);
  assert.deepEqual(saved.bow, { win: true, passed: 12 });
  // 寫不進去不會丟例外
  assert.equal(R.writeSeries({ getItem() { return null; }, setItem() { throw new Error('full'); } }, rec), null);
});
