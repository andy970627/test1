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

test('慢機器（每幀 0.2 秒）：拉弓跟得上心跳時鐘，程式玩家照樣能贏', () => {
  let w = 0;
  for (let i = 0; i < 20; i++) {
    const r = R.playRound({ difficulty: 'normal' }, 300 + i, { release: 'drop' }, 0.2);
    if (r.result.win && r.result.inDrop) w++;
  }
  assert.ok(w >= 18, `贏 ${w} / 20`);
});

// ---------------------------------------------------------------- 暗示階梯（docs/design/2026-11-07-hint-guidance.md 第 1、3、5 節）
// 用程式玩家跑一輪，沿用上一輪的 hints，收集全部事件
function playWithHints(options, seed, botOpts, hints) {
  const round = R.createRound(options, R.createRng(seed), { hints }, 0), bot = R.createBot(botOpts), evs = [];
  for (let n = 0; round.phase !== 'result' && n < 3600; n++) evs.push(...R.stepRound(round, DT, bot(round)));
  return { round, evs, hints: round.hints, hint: evs.filter(e => e.type === 'hint') };
}

test('暗示階梯：失敗 1 次只有世界內暗示、2 次加文字、3 次加按鍵；成功一次退回第 1 階', () => {
  const h = R.createHints();
  const e1 = R.hintFail(h, 'drop');
  assert.deepEqual([e1.type, e1.key, e1.level], ['hint', 'drop', 1]);
  assert.equal(e1.text, undefined, '第 1 階沒有文字');
  const e2 = R.hintFail(h, 'drop');
  assert.equal(e2.level, 2);
  assert.equal(e2.text, '心跳斷掉的那一瞬間放箭。', '文字照設計文件第 3 節');
  assert.equal(e2.keys, undefined, '第 2 階還沒有按鍵說明');
  const e3 = R.hintFail(h, 'drop');
  assert.equal(e3.level, 3); assert.ok(e3.text && /放開/.test(e3.keys), '第 3 階有按鍵說明');
  assert.equal(R.hintFail(h, 'drop').level, 3, '最多第 3 階');
  assert.equal(R.hintLevel(h, 'string'), 1, '各機制分開計');
  const ok = R.hintSuccess(h, 'drop');
  assert.deepEqual([ok.key, ok.level, ok.text], ['drop', 1, undefined], '成功一次退回第 1 階');
  assert.equal(R.hintSuccess(h, 'drop'), null, '本來就在第 1 階時成功不再發事件');
  assert.equal(R.hintFail(h, 'drop').level, 1, '退回後重新計數');
});

test('暗示文字：四種機制都有第 2 階文字與第 3 階按鍵說明（照設計文件第 3 節）', () => {
  assert.equal(R.HINTS.string.text, '左右移動，讓指針留在亮處。');
  assert.equal(R.HINTS.heart.text, '心跳越快，手越不穩。');
  assert.equal(R.HINTS.drop.text, '心跳斷掉的那一瞬間放箭。');
  assert.equal(R.HINTS.heckle.text, '有人舉杯，起鬨就要來了。');
  for (const k in R.HINTS) assert.ok(R.HINTS[k].keys.length > 8, k + ' 有按鍵說明');
});

test('上弦滑掉：每滑一次記一次，跨輪沿用；第 2 次出文字、第 3 次出按鍵；上好弦退回第 1 階', () => {
  let hints;
  const levels = [];
  for (let i = 0; i < 3; i++) {
    // 不修正指針，一直按著：一定滑掉
    const round = R.createRound({ difficulty: 'normal' }, R.createRng(5 + i), { hints }, 0), evs = [];
    for (let n = 0; round.phase !== 'result' && n < 1200; n++) evs.push(...R.stepRound(round, DT, { down: true, stringDx: 0 }));
    assert.equal(round.result && round.result.reason, 'slip');
    const h = evs.filter(e => e.type === 'hint');
    assert.equal(h.length, 1); assert.equal(h[0].key, 'string');
    levels.push(h[0].level); hints = round.hints;
  }
  assert.deepEqual(levels, [1, 2, 3]);
  const r = playWithHints({ difficulty: 'normal' }, 9, { release: 'drop' }, hints);
  const back = r.hint.find(e => e.key === 'string');
  assert.ok(back && back.level === 1, '上好弦：退回第 1 階');
  assert.equal(R.hintLevel(r.hints, 'string'), 1);
});

test('在最高速放箭而且沒成功：drop 失敗；在驟降放箭：drop 退回第 1 階', () => {
  let hints, fails = 0, seed = 300;
  const levels = [];
  while (levels.length < 3 && seed < 400) {
    const r = playWithHints({ stringPhase: false, heckle: false }, seed++, { release: 'peak', peakP: 0.96 }, hints);
    hints = r.hints;
    const d = r.hint.filter(e => e.key === 'drop');
    if (!r.round.result.win) { assert.equal(d.length, 1, '最高速放、沒成功 → 記一次'); levels.push(d[0].level); fails++; }
    else assert.equal(d.length, 0, '最高速放但成功了不算失敗');
  }
  assert.deepEqual(levels, [1, 2, 3]);
  const ok = playWithHints({ stringPhase: false, heckle: false }, 7, { release: 'drop' }, hints);
  assert.ok(ok.hint.some(e => e.key === 'drop' && e.level === 1));
  assert.equal(R.hintLevel(ok.hints, 'drop'), 1);
});

test('被起鬨推偏：拿掉起鬨推力就會多穿過孔才算 heckle 失敗；起鬨過後在驟降放箭算成功', () => {
  const w = R.aimWindow('normal');
  const mk = () => { const r = R.createRound({ stringPhase: false }, R.createRng(1), null, 0); r.aim.yaw = w.yawMid; r.aim.pitch = w.pitchMid; return r; };
  // 推力大到一定射偏
  const heck = { yaw: 0.02, pitch: 0.0 };
  let round = mk();
  const rel = { power: 1, stage: 'fast', sway: { yaw: heck.yaw, pitch: heck.pitch, x: 0, y: 0 } };
  let res = R.fireRound(round, rel), ev = [];
  R.judgeRelease(round, rel, res, heck, ev);
  assert.ok(!res.win);
  assert.deepEqual(ev.map(e => e.key), ['heckle'], '被推偏只記起鬨，不記最高速');
  // 沒有起鬨推力、自己晃偏：不算起鬨
  round = mk(); ev = [];
  const rel2 = { power: 1, stage: 'fast', sway: { yaw: 0.02, pitch: 0, x: 0, y: 0 } };
  res = R.fireRound(round, rel2); R.judgeRelease(round, rel2, res, { yaw: 0, pitch: 0 }, ev);
  assert.deepEqual(ev.map(e => e.key), ['drop']);
  // 起鬨出現過、放手時推力已散、在驟降放 → heckle、drop、heart 都成功
  round = mk(); round.heckleSeen = 1; ev = [];
  round.hints.level.heckle = 2; round.hints.fails.heckle = 2;
  const rel3 = { power: 1, stage: 'drop', sway: { yaw: 0, pitch: 0, x: 0, y: 0 } };
  res = R.fireRound(round, rel3); R.judgeRelease(round, rel3, res, { yaw: 0, pitch: 0 }, ev);
  assert.ok(res.win);
  assert.ok(ev.some(e => e.key === 'heckle' && e.level === 1), '起鬨退回第 1 階');
});

test('起鬨預告一定在推手之前，而且不會落在驟降裡（敲桌、舉杯的暗示有時間反應）', () => {
  for (let s = 0; s < 6; s++) {
    const { round, evs } = holdDraw(40 + s, 14);
    const cues = evs.filter(e => e.type === 'heckleCue');
    assert.ok(cues.length >= 2);
    for (const c of cues) {
      assert.ok(c.lead >= 0.35, '預告到推手至少 0.35 秒：' + c.lead);
    }
    void round;
  }
});

test('程式玩家（抓驟降）帶著暗示階梯照樣通關，而且不會觸發失敗提示', () => {
  let hints, wins = 0;
  for (let i = 0; i < 12; i++) {
    const r = playWithHints({ difficulty: 'normal' }, 500 + i, { release: 'drop' }, hints);
    hints = r.hints;
    if (r.round.result.win) wins++;
    assert.ok(!r.hint.some(e => e.level >= 2), '抓驟降不會累積到第 2 階');
  }
  assert.ok(wins >= 10, `贏 ${wins} / 12`);
});
