// 試玩數據（prototypes/telemetry.js）與摘要工具（tools/telemetry/summarize.mjs）的測試：用一份假資料驗算。
// 執行：node --test tools/telemetry/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Telemetry = require('../../prototypes/telemetry.js');

/** 假的 localStorage；quota 設定後超過就丟錯（模擬存滿）。 */
function fakeStorage(quota) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (quota && String(v).length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    _m: m
  };
}
/** 可手動推進的時鐘（音訊時間 t、循環、相位、區域）。 */
function fakeClock() {
  const c = { t: 100, ci: 0, p: 0, z: 1 };
  return { c, fn: () => ({ t: c.t, ci: c.ci, p: c.p, z: c.z }) };
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);

/**
 * 一局假資料（數字都是手算得出來的）：
 *   區 1 進場 t=100；Q 在警戒中按 4 次，對低音拍偏 −0.1、0、+0.1、+0.2（平均 0.05、σ = √0.0125 ≈ 0.1118）；
 *   另有一次平常狀態按 Q（頁面不填 off，不算）；Shift 在盲區按 2 次（偏 +0.05、+0.15），第 2 次後 1 秒被追殺 → 1/2 成功；
 *   Shift 離盲區 2 秒按一次（不算進時間差）；calm_ok ×3、calm_bad ×1；step_masked ×3、step_loud ×1；
 *   提示：教學 1 則、blind 第 2 階 1 則；t=120 失敗一次（區 1），重來，t=125 進區 2，t=130 過關。
 *   時間：主動 6 秒（盲區 2＋巡邏 4）、被動 4 秒（警戒）→ N1 = 60%。
 */
function makeRun(device, opts = {}) {
  const st = opts.storage || fakeStorage();
  const T = Telemetry.create({ storage: st, wall: () => Date.UTC(2026, 10, 10, 6, 30) });
  const { c, fn } = fakeClock();
  T.start({ proto: 'troy-prologue', version: 'abc1234', device, clock: fn, env: { outputLatency: 0.02, toggles: { visualAid: 'auto' } }, runId: opts.runId });
  T.event('out', { type: 'hint', a: '教學提示' });
  for (const [i, off] of [-0.1, 0, 0.1, 0.2].entries()) {
    c.t = 101 + i; T.input('KeyQ', c.t, { down: true, state: i % 2 ? 'gap' : 'alert', off: { bass: off, beat: off / 2 } });
  }
  c.t = 105.5; T.input('KeyQ', c.t, { down: true, state: 'patrol', off: null });                       // 平常按 Q：頁面不填 off，不算
  c.t = 106; T.input('ShiftLeft', c.t, { down: true, state: 'blind', off: { blind: 0.05, beat: 0.01 } });
  c.t = 108; T.input('ShiftLeft', c.t, { down: true, state: 'blind', off: { blind: 0.15, beat: 0.03 } });
  c.t = 108.2; T.input('ShiftLeft', c.t, { down: false, state: 'blind' });                              // 放開不算行動
  c.t = 109; T.event('out', { type: 'sfx', a: 'hunt' });                                                // 第 2 次衝刺後 1 秒被追殺
  c.t = 110; T.input('KeyE', c.t, { down: true, state: 'patrol', off: { blind: 2.0 } });                // 離盲區 2 秒：不算
  for (const a of ['calm_ok', 'calm_ok', 'calm_bad', 'calm_ok', 'calm_done']) T.event('out', { type: 'sfx', a });
  T.event('out', { type: 'tele_ok' }); T.event('out', { type: 'tele_miss' });                           // 大廳復仇的舉盾也算進安撫對拍
  for (const a of ['step_masked', 'step_masked', 'step_loud', 'step_masked']) T.event('out', { type: 'sfx', a, x: 1.23456789, beatT: null });
  T.event('out', { type: 'hint', a: '提示', key: 'blind', level: 2 });
  for (let i = 0; i < 4; i++) T.tick(0.5, { active: true, state: 'blind', frameDt: 1 / 60 });          // 每幀 0.5 秒（方便算）
  for (let i = 0; i < 8; i++) T.tick(0.5, { active: true, state: 'patrol', frameDt: 1 / 60 });
  for (let i = 0; i < 8; i++) T.tick(0.5, { active: false, state: 'alert', frameDt: 1 / 30 });
  T.tick(5, { active: true, state: 'patrol' });                                                         // 超過 1 秒的幀（分頁休眠）不算
  c.t = 120; T.event('fail', { code: 'caught_seen', reason: '被看到' });
  T.event('retry', { zone: 1 });
  c.t = 125; c.z = 2; T.event('zone', { from: 1, to: 2 });
  c.t = 130; T.event('win', {});
  const run = T.endRun({ outcome: 'win' });
  T.survey({ drop: 4, difficulty: 6, fun: '5', note: '好玩' });
  return { T, run, st };
}

test('事件、輸入、環境、主觀四類都有記', () => {
  const { run } = makeRun('wired');
  assert.equal(run.schema, 'odyssey-telemetry/1');
  assert.equal(run.device, 'wired');
  assert.equal(run.version, 'abc1234');
  assert.match(run.runId, /^[0-9a-f]{8}$/);
  assert.ok(run.events.length >= 17);
  assert.equal(run.inputs.length, 9);
  assert.equal(run.env.outputLatency, 0.02);
  assert.deepEqual({ drop: run.survey.drop, difficulty: run.survey.difficulty, fun: run.survey.fun }, { drop: 4, difficulty: null, fun: 5 }, '超出 1～5 的分數記成 null');
  // 每筆有 t、gt、ci、p、z；gt 從第一筆起算
  const e0 = run.events[0];
  for (const k of ['t', 'gt', 'ci', 'p', 'z', 'name']) assert.ok(k in e0, k);
  assert.equal(e0.gt, 0);
  const q = run.inputs[0];
  assert.equal(q.gt, 1); assert.equal(q.agt, 1); assert.equal(q.state, 'alert');
  // 數字四捨五入到 0.1 毫秒
  const step = run.events.find((e) => e.data && e.data.a === 'step_masked');
  assert.equal(step.data.x, 1.2346);
  // 不收個人資料：沒有這些欄位
  const text = JSON.stringify(run);
  for (const bad of ['"name":"玩家', 'email', '"ip"', 'account']) assert.ok(!text.includes(bad), bad);
});

test('一局摘要：時間差、盲區、安撫、腳步、N1、每區、提示', () => {
  const { run } = makeRun('wired');
  const s = Telemetry.summarizeRun(run, { values: true });
  assert.equal(s.outcome, 'win');
  near(s.elapsed, 30);
  // Q 對低音：頁面只在警戒中填 bass → 4 次
  assert.equal(s.off.bass.n, 4);
  near(s.off.bass.mean, 0.05);
  near(s.off.bass.sd, Math.sqrt(0.0125));
  near(s.off.bass.median, 0.05);
  // Shift／E 對盲區：±1 秒內的 2 次
  assert.equal(s.off.blind.n, 2);
  near(s.off.blind.mean, 0.1); near(s.off.blind.sd, 0.05);
  // 對鼓點：Q 4 次＋Shift 2 次（平常的 Q、E 沒有 beat 欄位）
  assert.equal(s.off.beat.n, 6);
  // 盲區行動：2 次，第 2 次 1 秒後被追殺
  assert.deepEqual([s.blind.attempts, s.blind.ok], [2, 1]);
  near(s.blind.rate, 0.5); near(s.blind.firstOk, 6);
  // 安撫
  assert.deepEqual([s.calm.ok, s.calm.bad, s.calm.done], [4, 2, 1]);
  near(s.calm.rate, 4 / 6); near(s.calm.firstOk, 10);
  // 腳步
  near(s.steps.rate, 0.75);
  // N1：主動 6 ÷ 總 10
  near(s.activeRatio, 0.6); near(s.playTime, 10);
  near(s.timeByState.alert, 4);
  // 幀率中位：12 幀 17 ms、8 幀 33 ms → 中位 17 ms → 59 fps
  assert.equal(s.fpsMedian, 59);
  // 每區：區 1 用 25 秒、失敗 1；區 2 用 5 秒
  assert.equal(s.zones.length, 2);
  assert.deepEqual(s.zones.map((z) => [z.z, Math.round(z.time), z.fails]), [[1, 25, 1], [2, 5, 0]]);
  assert.deepEqual(s.zones[0].codes, { caught_seen: 1 });
  assert.equal(s.fails, 1); assert.equal(s.retries, 1);
  // 提示：教學 1、blind 第 2 階 1
  assert.equal(s.hints.total, 2);
  assert.deepEqual(s.hints.byKey, { tutorial: { 1: 1 }, blind: { 2: 1 } });
});

test('局結束後的摘要不帶原始陣列；快問記在剛結束那一局', () => {
  const { T, run } = makeRun('bt');
  assert.equal(run.summary.off.bass.values, undefined);
  assert.equal(T.surveyed(), true);
  assert.equal(T.last().survey.fun, 5);
  assert.equal(T.active(), false);
  assert.equal(T.event('x', {}), null, '沒有進行中的局：事件不記、不報錯');
});

test('localStorage：最多 20 局、存滿丟最舊、沒有 storage 也能玩', () => {
  const st = fakeStorage();
  for (let i = 0; i < 23; i++) makeRun('speaker', { storage: st, runId: 'r' + i });
  const list = JSON.parse(st.getItem(Telemetry.STORE_KEY));
  assert.equal(list.length, 20);
  assert.equal(list[0].runId, 'r3');
  // 存滿：只夠放約 2 局 → 丟掉最舊的，最新一局一定在
  const one = JSON.stringify([makeRun('speaker').run]).length;
  const small = fakeStorage(one * 2.5);
  for (let i = 0; i < 5; i++) makeRun('speaker', { storage: small, runId: 's' + i });
  const kept = JSON.parse(small.getItem(Telemetry.STORE_KEY)).map((r) => r.runId);
  assert.ok(kept.length >= 1 && kept.length <= 2, kept.join());
  assert.equal(kept[kept.length - 1], 's4');
  // 沒有 storage（隱私模式）：照樣能記、能摘要、能匯出文字
  const T = Telemetry.create({ storage: null });
  const { fn } = fakeClock();
  T.start({ proto: 'x', clock: fn });
  T.event('out', { type: 'sfx', a: 'calm_ok' });
  assert.equal(T.summary().calm.ok, 1);
  assert.ok(T.exportJSON({ download: false }).text.includes('"calm_ok"'));
  // storage 讀寫都丟錯也不影響
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const T2 = Telemetry.create({ storage: broken });
  T2.start({ proto: 'x', clock: fn }); T2.rememberDevice('bt');
  assert.equal(T2.lastDevice(), null);
  assert.ok(T2.endRun({ outcome: 'quit' }));
});

test('裝置記憶、改裝置、重開一局把上一局記成 restart', () => {
  const st = fakeStorage();
  const T = Telemetry.create({ storage: st });
  T.rememberDevice('speaker');
  assert.equal(T.lastDevice(), 'speaker');
  const { fn } = fakeClock();
  const id1 = T.start({ proto: 'troy-prologue', clock: fn, device: 'unknown' });
  T.setDevice('wired');
  T.start({ proto: 'troy-prologue', clock: fn });
  const first = T.runs().find((r) => r.runId === id1);
  assert.equal(first.result.outcome, 'restart');
  assert.equal(first.device, 'wired');
});

test('匯出：檔名含日期、原型、局號；CSV 一列一筆，含結果列', () => {
  const { T, run } = makeRun('wired');
  const j = T.exportJSON({ download: false });
  assert.match(j.filename, /^telemetry_troy-prologue_20261110-\d{4}_[0-9a-f]{8}\.json$/);
  const obj = JSON.parse(j.text);
  assert.equal(obj.runs.length, 1);
  assert.ok(obj.runs[0].summary);
  const csv = T.exportCSV({ download: false });
  assert.match(csv.filename, /\.csv$/);
  const lines = csv.text.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], Telemetry.CSV_COLS.join(','));
  assert.equal(lines.length, 1 + run.events.length + run.inputs.length + 1);
  assert.ok(lines.some((l) => l.includes(',result,')));
  assert.ok(lines.some((l) => l.startsWith(run.runId + ',troy-prologue,abc1234,wired,input,')));
});

test('summarize.mjs：多局合併、依裝置分組、直方圖、讀資料夾去重', async () => {
  const S = await import('./summarize.mjs');
  const a = makeRun('wired', { runId: 'aaaaaaaa' }).run;
  const b = makeRun('wired', { runId: 'bbbbbbbb' }).run;
  const c = makeRun('speaker', { runId: 'cccccccc' }).run;
  const res = S.summarize([a, b, c]);
  assert.deepEqual(Object.keys(res.groups).sort(), ['troy-prologue|speaker', 'troy-prologue|wired']);
  const w = res.groups['troy-prologue|wired'];
  assert.equal(w.n, 2);
  assert.equal(w.off.bass.n, 8); near(w.off.bass.mean, 0.05); near(w.off.bass.sd, Math.sqrt(0.0125));
  near(w.blind.rate, 0.5); near(w.calm.rate, 4 / 6); near(w.activeRatio, 0.6);
  assert.equal(w.zones[1].fails, 2); near(w.zones[1].time / w.zones[1].visits, 25);
  assert.equal(w.survey.answered, 2); near(w.survey.fun.mean, 5);
  // 直方圖：4 個值、每格 100 毫秒 → −0.1、0、0.1、0.2 各一格
  const h = S.histText([-0.1, 0, 0.1, 0.2], 100);
  assert.equal(h.length, 4);
  assert.ok(h.every((l) => / 1$/.test(l)), h.join('\n'));
  const txt = S.formatReport(res);
  for (const s of ['木馬之夜・依裝置：耳機（有線）', '木馬之夜・依裝置：喇叭', '主動時間比例（N1', '跟低音按', '第 1 區 木馬腹中', '「好玩」']) assert.ok(txt.includes(s), s);
  // 資料夾：同一局出現在兩個檔（一份沒結束、一份結束了），留結束的
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tel-'));
  const unfinished = Object.assign({}, a, { result: null, events: a.events.slice(0, 3) });
  fs.writeFileSync(path.join(dir, '1.json'), JSON.stringify({ schema: 'odyssey-telemetry/1', runs: [unfinished, c] }));
  fs.writeFileSync(path.join(dir, '2.json'), JSON.stringify({ schema: 'odyssey-telemetry/1', runs: [a] }));
  fs.writeFileSync(path.join(dir, 'x.csv'), 'not json');
  const { files, runs } = S.loadRuns([dir]);
  assert.equal(files.length, 2);
  assert.equal(runs.length, 2);
  assert.equal(runs.find((r) => r.runId === 'aaaaaaaa').result.outcome, 'win');
  fs.rmSync(dir, { recursive: true, force: true });
});
