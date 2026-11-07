// 執行：node --test prototypes/bow-risset/rules.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rules.js');

const DT = 1 / 60;
const H = R.TUNING.heart;

// 跑一次拉弓（瞄準窗中心、不放手），逐格記下心跳狀態與晃動
function holdDraw(seed, seconds, opts) {
  opts = opts || {};
  const round = R.createRound({ stringPhase: false, heckle: opts.heckle !== false, fatigue: opts.fatigue !== false }, R.createRng(seed), null, 0);
  const w = R.aimWindow('normal');
  round.aim.yaw = w.yawMid; round.aim.pitch = w.pitchMid;
  const frames = [];
  const evs = [];
  for (let i = 0; i < seconds * 60; i++) {
    const e = R.stepRound(round, DT, { down: true });
    evs.push(...e);
    const d = round.draw;
    frames.push({ t: round.clock, hb: round.hb, stage: d.stage, amp: d.amp, mag: Math.hypot(d.sway.yaw, d.sway.pitch), crowd: round.crowd });
  }
  return { round, frames, evs };
}

const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));

test('Risset 拍點公式和木馬之夜一致：每層每循環整數拍，p = 1 接上下一層 p = 0', () => {
  for (let k = 0; k < H.layers; k++) {
    assert.equal(R.layerBeats(k), H.M * Math.pow(2, k));
    assert.equal(R.beatPhase(k, 0), 0);
    // 最後一拍之後的下一拍（n = Mk）落在 p = 1
    assert.ok(Math.abs(R.beatPhase(k, R.layerBeats(k)) - 1) < 1e-12);
  }
  // 鐘形：中間的層最響，最慢層的開頭與最快層的結尾都幾乎無聲
  assert.ok(R.layerGain(0, 0) < 0.01);
  assert.ok(R.layerGain(H.layers - 1, 1) < 0.01);
  assert.ok(R.layerGain(2, 0) > 0.9);
});

test('心跳時間表：第一次驟降在開始拉弓後 3 秒，之後一輪比一輪短，驟降約 0.5 秒', () => {
  const h = R.createHeart('risset', 10);
  const drops = R.heartDropsBetween(h, 10, 30);
  assert.ok(Math.abs(drops[0].t - (10 + H.firstDrop)) < 1e-9);
  for (const d of drops) assert.ok(Math.abs(d.end - d.t - 0.5) < 1e-9);
  for (let i = 1; i < drops.length - 1; i++) {
    const g0 = drops[i].t - drops[i - 1].t, g1 = drops[i + 1].t - drops[i].t;
    assert.ok(g1 <= g0 + 1e-9, '一輪比一輪短（或到下限）');
    assert.ok(g1 >= H.cycleMin - 1e-9);
  }
  // 驟降裡沒有心跳拍，驟降外有
  for (const d of drops) {
    assert.equal(R.heartBeatsBetween(h, d.t, d.end).length, 0, '驟降裡心跳斷掉');
    assert.ok(R.heartBeatsBetween(h, d.t - 0.5, d.t).length > 3, '驟降前心跳很密');
  }
  // heartAt 和 heartDropsBetween 說的是同一件事
  const hb = R.heartAt(h, drops[1].t + 0.2);
  assert.equal(hb.drop, true); assert.equal(hb.j, 1);
  assert.ok(Math.abs(hb.dropT - 0.2) < 1e-9);
  assert.equal(R.heartAt(h, drops[1].t + 0.6).drop, false);
});

test('越接近最高速，心跳拍越密；驟降剛過最疏', () => {
  const h = R.createHeart('risset', 0);
  const d = R.heartDropsBetween(h, 0, 20)[1];         // 第 2 次驟降
  const C = R.cycleLen(1);
  const early = R.heartBeatsBetween(h, d.end, d.end + 0.5).reduce((s, b) => s + b.gain, 0);
  const late = R.heartBeatsBetween(h, d.t + C - 0.5, d.t + C).reduce((s, b) => s + b.gain, 0);
  const lateFastest = R.heartBeatsBetween(h, d.t + C - 0.5, d.t + C).map(b => b.x);
  assert.ok(late > early, `最高速前 0.5 秒的拍（${late.toFixed(2)}）比驟降剛過（${early.toFixed(2)}）多`);
  assert.ok(Math.max(...lateFastest) > 0.85, '最快的一層在最高速時還聽得到');
});

test('晃動幅度：驟降最小、最高速最大（同一輪）', () => {
  const h = R.createHeart('risset', 0);
  const j = 1, d = R.heartDropsBetween(h, 0, 20)[j];
  const drop = R.swayAmplitude(true, 1, R.heartAt(h, d.t + 0.25), true);
  const mid = R.swayAmplitude(true, 1, R.heartAt(h, d.t + R.cycleLen(j) * 0.5), true);
  const peak = R.swayAmplitude(true, 1, R.heartAt(h, d.t + R.cycleLen(j) * 0.98), true);
  assert.equal(drop.stage, 'drop'); assert.equal(peak.stage, 'fast');
  assert.ok(drop.amp < mid.amp && mid.amp < peak.amp, `${drop.amp} < ${mid.amp} < ${peak.amp}`);
  assert.ok(peak.amp > drop.amp * 8, '最高速至少是驟降的 8 倍');
});

test('實際晃動（含心跳推手、起鬨）：驟降時最小、最高速最大', () => {
  for (const seed of [1, 2, 3]) {
    const { frames } = holdDraw(seed, 16);
    const full = frames.filter(f => f.t > 1.05);
    const inDrop = full.filter(f => f.hb.drop && f.hb.dropT > 0.1).map(f => f.mag);
    const atPeak = full.filter(f => !f.hb.drop && f.hb.p > 0.9).map(f => f.mag);
    const rising = full.filter(f => !f.hb.drop && f.hb.p > 0.3 && f.hb.p < 0.6).map(f => f.mag);
    assert.ok(inDrop.length > 20 && atPeak.length > 20);
    const a = rms(inDrop), b = rms(rising), c = rms(atPeak);
    assert.ok(a < b && b < c, `種子 ${seed}：驟降 ${a.toExponential(2)} < 中段 ${b.toExponential(2)} < 最高速 ${c.toExponential(2)}`);
    assert.ok(c > a * 6, `種子 ${seed}：最高速至少是驟降的 6 倍`);
  }
});

test('越撐越晃：第 3 輪以後最高速的晃動比第 1 輪大（8 個種子合計）', () => {
  const early = [], late = [];
  for (let seed = 1; seed <= 8; seed++) {
    for (const f of holdDraw(seed, 16).frames) {
      if (f.t < 1.05 || f.hb.drop || f.hb.p <= 0.8) continue;
      if (f.hb.j === 0) early.push(f.mag); else if (f.hb.j >= 2) late.push(f.mag);
    }
  }
  assert.ok(rms(late) > rms(early) * 1.2, `後段 ${rms(late).toExponential(2)}、第 1 輪 ${rms(early).toExponential(2)}`);
});

test('驟降事件由規則發出：dropStart／dropEnd 成對，時間對得上心跳表', () => {
  const { evs, round } = holdDraw(4, 9);
  const st = evs.filter(e => e.type === 'dropStart'), en = evs.filter(e => e.type === 'dropEnd');
  assert.ok(st.length >= 2);
  assert.ok(Math.abs(st.length - en.length) <= 1);
  const drops = R.heartDropsBetween(round.heart, 0, 9);
  st.forEach((e, i) => assert.ok(Math.abs(e.at - drops[i].t) < 1e-9));
});

test('求婚者：最快時起鬨、驟降時噤聲', () => {
  const { frames, evs } = holdDraw(5, 10);
  const cues = evs.filter(e => e.type === 'heckleCue');
  const hits = evs.filter(e => e.type === 'heckleHit');
  assert.ok(cues.length >= 3 && hits.length >= 3, '每一輪都有起鬨');
  const full = frames.filter(f => f.t > 1.05);
  for (const f of full.filter(f => f.hb.drop)) assert.equal(f.crowd, 0, '驟降時人聲 0');
  const peakCrowd = full.filter(f => !f.hb.drop && f.hb.p > 0.92).map(f => f.crowd);
  assert.ok(Math.min(...peakCrowd) > 0.85, '最高速時人聲鼎沸');
  // 起鬨的推手在驟降裡被壓掉
  const h = R.createHeart('risset', 0), d = R.heartDropsBetween(h, 0, 10)[0];
  const list = [{ hitAt: d.t - 0.05, size: 1, dir: { x: 1, y: 0 }, ph: 0 }];
  assert.ok(Math.abs(R.heckleOffset(list, d.t - 0.01, R.heartAt(h, d.t - 0.01)).yaw) > 0);
  assert.equal(R.heckleOffset(list, d.t + 0.1, R.heartAt(h, d.t + 0.1)).yaw, 0);
});

test('在驟降放箭的成功率明顯高於最高速', () => {
  const N = 200, rate = bo => {
    let w = 0;
    for (let i = 0; i < N; i++) if (R.playRound({ difficulty: 'normal' }, 1000 + i, bo).result.win) w++;
    return w / N;
  };
  const drop = rate({ release: 'drop' });
  const peak = rate({ release: 'peak', peakP: 0.96 });
  const drop2 = rate({ release: 'drop', dropIndex: 1 });
  const peak2 = rate({ release: 'peak', peakP: 0.96, dropIndex: 1 });
  assert.ok(drop >= 0.9, `驟降成功率 ${drop}`);
  assert.ok(drop2 >= 0.9, `第二次驟降成功率 ${drop2}`);
  assert.ok(peak <= 0.5 && peak2 <= 0.5, `最高速成功率 ${peak}、${peak2}`);
  assert.ok(drop - peak >= 0.4, `差距 ${drop} − ${peak}`);
});

test('程式玩家（抓驟降放箭）在一般難度能贏（含上弦）', () => {
  let w = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const r = R.playRound({ difficulty: 'normal', stringPhase: true }, 77 + i, { release: 'drop' });
    assert.ok(r.result, '跑得完一輪');
    assert.notEqual(r.result.reason, 'slip', '上弦不會滑掉');
    if (r.result.win) { w++; assert.equal(r.result.inDrop, true); assert.equal(r.result.passed, 12); }
  }
  assert.ok(w >= N * 0.9, `贏 ${w} / ${N}`);
});

test('上弦：謝帕德音階位置跟著張力上爬', () => {
  assert.equal(R.shepardPos(0), 0);
  assert.ok(R.shepardPos(0.5) > R.shepardPos(0.2));
  assert.equal(R.shepardPos(1), R.TUNING.string.shepardOctaves);
});

test('箭飛行：每穿過一個孔奏主題下一個音，間隔照主題時值，12 孔奏完', () => {
  const w = R.aimWindow('normal');
  const round = R.createRound({ stringPhase: false }, R.createRng(9), null, 0);
  round.aim.yaw = w.yawMid; round.aim.pitch = w.pitchMid;
  const res = R.fireRound(round, { power: 1, sway: { yaw: 0, pitch: 0, x: 0, y: 0 }, stage: 'drop' });
  assert.equal(res.win, true);
  const notes = round.flight.notes;
  assert.equal(notes.length, 12);
  notes.forEach((n, i) => assert.equal(n.midi, R.THEME12.notes[i].midi));
  for (let i = 1; i < 12; i++) {
    const gap = notes[i].at - notes[i - 1].at;
    assert.ok(Math.abs(gap - R.THEME12.notes[i - 1].units * R.TUNING.flight.themeUnit) < 1e-6, `第 ${i} 個間隔 ${gap}`);
  }
  assert.ok(notes[11].at - notes[0].at > 2, '慢動作：12 孔至少 2 秒');
  // 逐格推進：pass 事件依序、帶音符；最後到 result
  const passes = [];
  let guard = 0;
  while (round.phase === 'flight' && guard++ < 2000) {
    for (const e of R.stepRound(round, DT, {})) if (e.type === 'pass') passes.push(e);
  }
  assert.equal(passes.length, 12);
  passes.forEach((e, i) => { assert.equal(e.axe, i); assert.equal(e.note.midi, R.THEME12.notes[i].midi); });
  assert.equal(round.phase, 'result');
  assert.equal(round.result.win, true);
  // 對照表可逆
  const tl = round.flight.tl;
  for (const a of [0.05, 0.2, 0.3, 0.4]) assert.ok(Math.abs(R.arrowTimeAt(tl, R.realTimeAt(tl, a)) - a) < 1e-9);
});

test('射偏時主題斷在半空：只奏穿過的孔數', () => {
  const w = R.aimWindow('normal');
  const round = R.createRound({ stringPhase: false }, R.createRng(3), null, 0);
  round.aim.yaw = w.yawMid + 0.012; round.aim.pitch = w.pitchMid;
  const res = R.fireRound(round, { power: 1, sway: { yaw: 0, pitch: 0, x: 0, y: 0 } });
  assert.equal(res.win, false);
  assert.equal(round.flight.notes.length, res.passed);
  assert.ok(round.flight.stopAt >= (round.flight.notes.length ? round.flight.notes[round.flight.notes.length - 1].at : 0));
});

test('音訊時鐘推進：給 input.now 就照它走，心跳表跟著時鐘', () => {
  const round = R.createRound({ stringPhase: false }, R.createRng(1), null, 100);
  let ev = R.stepRound(round, 0, { now: 100.5, down: true });
  assert.ok(ev.some(e => e.type === 'drawStart' && Math.abs(e.at - 100.5) < 1e-9));
  for (let t = 100.5; t < 103.6; t += 0.05) ev = ev.concat(R.stepRound(round, 0, { now: t, down: true }));
  const ds = ev.find(e => e.type === 'dropStart');
  assert.ok(ds, '有驟降');
  assert.ok(Math.abs(ds.at - (100.5 + H.firstDrop)) < 1e-9, `驟降時刻 ${ds.at}`);
  // 放手 → 射出；心跳變靜止，箭落地之後回到平靜心跳
  R.stepRound(round, 0, { now: 103.6, down: false });
  assert.equal(round.phase, 'flight');
  assert.equal(round.heart.mode, 'still');
  assert.equal(R.heartBeatsBetween(round.heart, 103.6, 110).length, 0);
});

test('沒拉弓是平靜心跳；放得太早算取消、心跳回平靜', () => {
  const round = R.createRound({ stringPhase: false }, R.createRng(2), null, 0);
  const b = R.heartBeatsBetween(round.heart, 0, 5);
  assert.ok(b.length >= 5 && b.every(x => x.k === -1));
  R.stepRound(round, DT, { down: true });
  const ev = R.stepRound(round, DT, { down: false });
  assert.ok(ev.some(e => e.type === 'cancel'));
  assert.equal(round.heart.mode, 'rest');
});
