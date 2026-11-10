// 執行：node --test tools/telemetry/overnight.test.js
// 整夜批次驗證工具的檢查：彙整數字手算對得上、同一個 seed 同一局、σ 抽樣、報告照設計席門檻判定、表格欄位齊全。
// 不檢查通關率本身（那是規則與數值的事，會隨規則角色調整而變），只檢查工具算得對、跑得動。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Bots = require('./troy-bots.js');

const load = () => import('./overnight-sim.mjs');

test('summarizeBatch：通關率、通關時間中位、高度警覺、N1 兩把尺、死因、各區停留，手算對得上', async () => {
  const { summarizeBatch } = await load();
  const rs = [
    { win: true, t: 40, n1: 0.8, n1c: 0.9, zone: 4, cause: null, alerted: 1, zoneTime: { 1: 2, 2: 8, 3: 10, 4: 20 } },
    { win: true, t: 60, n1: 0.6, n1c: 0.7, zone: 4, cause: null, alerted: 3, zoneTime: { 1: 3, 2: 9, 3: 3, 4: 45 } },
    { win: false, t: 5, n1: 0.4, n1c: 0.5, zone: 2, cause: 'caught_seen', alerted: 0, zoneTime: { 1: 1, 2: 4 } },
    { win: false, t: 420, n1: 0.2, n1c: 0.3, zone: 4, cause: 'timeout', alerted: 4, zoneTime: { 1: 4, 2: 6, 3: 10, 4: 400 } }
  ];
  const s = summarizeBatch(rs);
  assert.equal(s.n, 4); assert.equal(s.wins, 2); assert.equal(s.winRate, 0.5);
  assert.ok(Math.abs(s.n1 - 0.5) < 1e-12); assert.ok(Math.abs(s.n1c - 0.6) < 1e-12);
  assert.equal(s.winTimeMedian, 50, '兩局通關 40、60 → 中位 50');
  assert.equal(s.alertedMean, 2, '(1+3+0+4)/4'); assert.equal(s.alertedMeanWin, 2);
  assert.deepEqual(s.causes, { caught_seen: 1, timeout: 1 });
  assert.equal(s.reach3, 0.75); assert.equal(s.reachGate, 0.75);
  assert.deepEqual(s.zones[1], { visits: 4, meanSec: 2.5 });
});

test('runGame：同一個 seed、同一種玩家得到同一局；回傳欄位齊全；死因是規則的 failCode', () => {
  for (const cover of [true, false]) {
    const a = Bots.runGame(cover, 3, Bots.BOTS.forward.make(cover, 3));
    const b = Bots.runGame(cover, 3, Bots.BOTS.forward.make(cover, 3));
    assert.deepEqual(a, b);
    for (const k of ['win', 't', 'n1', 'n1c', 'zone', 'cause', 'zoneTime', 'alerted']) assert.ok(k in a, k);
    assert.ok(a.n1 >= 0 && a.n1 <= 1 && a.n1c >= 0 && a.n1c <= 1);
    if (!a.win) assert.equal(typeof a.cause, 'string');
  }
});

test('σ 玩家：抽樣的平均接近 0、標準差接近 σ；同一個 seed 可重現；四種玩家都在清單裡', () => {
  const rnd = Bots.R.mulberry32(5);
  const xs = Array.from({ length: 20000 }, () => Bots.gauss(rnd) * 0.12);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  assert.ok(Math.abs(m) < 0.005, '平均 ' + m);
  assert.ok(Math.abs(sd - 0.12) < 0.005, 'σ ' + sd);
  const a = Bots.runGame(true, 2, Bots.BOTS.sigma12.make(true, 2), { maxT: 60 });
  const b = Bots.runGame(true, 2, Bots.BOTS.sigma12.make(true, 2), { maxT: 60 });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(Bots.BOTS), ['forward', 'perfect', 'sigma12', 'sigma25']);
});

test('overnight-report judge：設計席 7.5 錄音門檻、7.8 程式玩家門檻；通關率只列不判', async () => {
  const { judge, recNumbers } = await import('./overnight-report.mjs');
  const st = (winRate, winTimeMedian, alertedMean) => ({ n: 100, winRate, winTimeMedian, alertedMean });
  const sim = { results: [
    { mode: 'cover', bot: 'forward', stats: st(0.31, null, 0) },
    { mode: 'cover', bot: 'perfect', stats: st(1, 50, 0.2) },
    { mode: 'cover', bot: 'sigma12', stats: st(0.92, 61, 1.5) },      // 61 ÷ 50 = 1.22 倍、1.5 次 → 過
    { mode: 'cover', bot: 'sigma25', stats: st(0.85, 65, 2.5) }       // 低 7 個百分點、65 ÷ 61 = 1.07 倍 → 不過
  ] };
  const row = (o) => Object.assign({ confound: [], alertWin: false }, o);
  const an = { coverMode: true, coverRows: [row({ riseDb: 20, tailSec: 0.6 }), row({ riseDb: 14, tailSec: 0.7 }), row({ riseDb: 11, tailSec: 0.9 }), row({ alertWin: true, riseDb: 9 }), row({ confound: ['dash'], riseDb: -5, tailSec: 0 })],
    speaker: { steps: { riseDiffDb: 11.5 } }, checks: [] };
  const R = recNumbers(an);
  assert.equal(R.rise, 14); assert.equal(R.tail, 0.7); assert.equal(R.alertRise, 9); assert.equal(R.windows, 3);
  const J = judge(sim, { raw: R, spk: null }, { raw: null }, { sim: 's', cover: 'c', gap: 'g' });
  const by = (s) => J.find((r) => r.item.startsWith(s));
  assert.equal(by('只按前進').ok, false, '31% > 30%');
  assert.equal(by('完美踩拍').ok, true);
  assert.equal(by('σ 0.12 錯了要付代價').ok, true);
  assert.equal(by('σ 0.25 越不準越吃虧').ok, false);
  assert.equal(by('σ 0.12 通關率').ok, undefined, '只列不判');
  assert.equal(by('餘韻中位（不停，原始）').ok, true);
  assert.equal(by('重合擊突出中位（不停，原始）').ok, true);
  assert.equal(by('警戒輕版重擊突出中位（不停，原始）').ok, true);
  assert.equal(by('餘韻中位（不停，喇叭模擬）').ok, null, '沒有喇叭模擬＝無資料');
  assert.equal(by('不合拍與合拍腳步 1～4 kHz 差（不停）').ok, false);
  assert.equal(by('不合拍與合拍腳步 1～4 kHz 差（留空檔）').ok, null);
  // σ 0.12 高度警覺不到 1 次就不過
  const sim2 = JSON.parse(JSON.stringify(sim)); sim2.results[2].stats.alertedMean = 0.8;
  assert.equal(judge(sim2, null, null, { sim: 's', cover: 'c', gap: 'g' }).find((r) => r.item.startsWith('σ 0.12 錯了')).ok, false);
});

test('runBatch＋formatTable：小樣本跑得動，表格每組一列、欄位齊', async () => {
  const { runBatch, formatTable } = await load();
  const stats = runBatch('cover', 'forward', 3);
  assert.equal(stats.n, 3);
  const md = formatTable([{ mode: 'cover', bot: 'forward', stats }, { mode: 'gap', bot: 'perfect', stats }]);
  const rows = md.split('\n');
  assert.equal(rows.length, 4);
  assert.ok(rows[2].includes('只按前進') && rows[3].includes('完美時機'));
  assert.equal(rows[2].split('|').length, rows[0].split('|').length);
});
