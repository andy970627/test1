#!/usr/bin/env node
/* 整夜批次驗證：木馬之夜程式玩家（Node 直接跑規則層，不開瀏覽器）
 *
 *   node tools/telemetry/overnight-sim.mjs                       # 兩模式 × 四種玩家，各 500 局
 *   node tools/telemetry/overnight-sim.mjs --n 20                # 小樣本試跑
 *   node tools/telemetry/overnight-sim.mjs --modes cover --bots forward,sigma12 --n 100
 *   node tools/telemetry/overnight-sim.mjs --out 結果.json        # 另存 JSON（給 overnight-report.mjs）
 *
 * 每局一條命（第一次失敗就結束，和規則測試 runGame 相同），最多 420 秒；seed 1..N，t0 與幀率抖動由 seed 決定（同 seed 同一局）。
 * 輸出：通關率、通關時間中位數、每局平均進高度警覺次數、N1（主動時間比例，每局平均；自己規則與同一把尺兩種）、死因分布（g.failCode；逾時記 timeout）、各區平均停留秒數、走到窄巷／城門的比例。
 * 玩家定義見 tools/telemetry/troy-bots.js。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');

export const MODES = { cover: { name: '鼓聲不停（殘響掩護，COVER_MODE = true）', cover: true }, gap: { name: '留空檔（舊盲區版，COVER_MODE = false）', cover: false } };

/** 把一組 runGame 結果彙整成統計。 */
export function summarizeBatch(rs) {
  const n = rs.length, wins = rs.filter(r => r.win);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = (a) => { if (!a.length) return null; const q = [...a].sort((x, y) => x - y), m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
  const causes = {};
  for (const r of rs) if (!r.win) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const zones = {};
  for (const r of rs) for (const [z, s] of Object.entries(r.zoneTime || {})) { const a = zones[z] || (zones[z] = { visits: 0, sec: 0 }); a.visits++; a.sec += s; }
  const zoneMean = Object.fromEntries(Object.entries(zones).map(([z, a]) => [z, { visits: a.visits, meanSec: +(a.sec / a.visits).toFixed(2) }]));
  const failZone = {};
  for (const r of rs) if (!r.win) failZone[r.zone] = (failZone[r.zone] || 0) + 1;
  return {
    n, wins: wins.length, winRate: n ? wins.length / n : null,
    reach3: n ? rs.filter(r => r.win || r.zone >= 3).length / n : null,
    reachGate: n ? rs.filter(r => r.win || r.zone >= 4).length / n : null,
    n1: mean(rs.map(r => r.n1)), n1c: mean(rs.map(r => r.n1c)), n1Win: mean(wins.map(r => r.n1)), winTime: mean(wins.map(r => r.t)), winTimeMedian: median(wins.map(r => r.t)),
    alertedMean: mean(rs.map(r => r.alerted || 0)), alertedMeanWin: mean(wins.map(r => r.alerted || 0)),
    causes, failZone, zones: zoneMean
  };
}

/** 跑一組（模式 × 玩家 × N 局）。onProgress(i) 每 50 局叫一次。 */
export function runBatch(modeKey, botKey, n, opts = {}) {
  const M = MODES[modeKey], B = Bots.BOTS[botKey];
  if (!M || !B) throw new Error('未知的模式或玩家：' + modeKey + ' / ' + botKey);
  const rs = [];
  const from = opts.seedFrom || 1;
  for (let s = from; s < from + n; s++) {
    rs.push(Bots.runGame(M.cover, s, B.make(M.cover, s), { T: opts.T }));
    if (opts.onProgress && (s - from + 1) % 50 === 0) opts.onProgress(s - from + 1);
  }
  return summarizeBatch(rs);
}

const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const CAUSE_NAMES = { timeout: '逾時（420 秒沒過）', unknown: '不明' };
export function causeText(c, n) {
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return e.length ? e.map(([k, v]) => `${CAUSE_NAMES[k] || k} ${v}（${(v / n * 100).toFixed(0)}%）`).join('、') : '無';
}
export function formatTable(results) {
  const L = ['| 模式 | 玩家 | 局數 | 通關率 | 通關時間中位（秒） | 每局進高度警覺 | N1（自己規則／同一把尺） | 走到窄巷／城門 | 各區平均停留秒數（1／2／3／4） | 死因分布 |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const s = r.stats, z = (k) => (s.zones[k] ? s.zones[k].meanSec.toFixed(1) : '—');
    const bn = r.bot === 'perfect' && !MODES[r.mode].cover ? '完美時機（舊版沒有踩拍走）' : Bots.BOTS[r.bot].name;
    L.push(`| ${MODES[r.mode].cover ? '不停' : '留空檔'} | ${bn} | ${s.n} | ${pct(s.winRate)} | ${s.winTimeMedian == null ? '—' : s.winTimeMedian.toFixed(1)} | ${s.alertedMean == null ? '—' : s.alertedMean.toFixed(2)} 次 | ${pct(s.n1)}／${pct(s.n1c)} | ${pct(s.reach3)}／${pct(s.reachGate)} | ${z(1)}／${z(2)}／${z(3)}／${z(4)} | ${causeText(s.causes, s.n)} |`);
  }
  return L.join('\n');
}

function main(argv) {
  const o = { n: 500, modes: 'cover,gap', bots: 'forward,perfect,sigma12,sigma25', out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') o.n = +argv[++i];
    else if (a === '--modes') o.modes = argv[++i];
    else if (a === '--bots') o.bots = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 0; }
  }
  const t0 = Date.now(), results = [];
  for (const m of o.modes.split(',')) for (const b of o.bots.split(',')) {
    const t1 = Date.now();
    const stats = runBatch(m, b, o.n, { onProgress: (i) => process.stderr.write(`  ${m}/${b} ${i}/${o.n}\r`) });
    results.push({ mode: m, bot: b, stats, sec: +((Date.now() - t1) / 1000).toFixed(1) });
    process.stderr.write(`[overnight-sim] ${m}/${b}：${o.n} 局，通關 ${pct(stats.winRate)}，N1 ${pct(stats.n1)}（${((Date.now() - t1) / 1000).toFixed(0)} 秒）\n`);
  }
  const doc = { created: new Date().toISOString(), rules: path.relative(process.cwd(), Bots.RULES_PATH), n: o.n, command: 'node tools/telemetry/overnight-sim.mjs ' + argv.join(' '),
    constants: pickT(), totalSec: +((Date.now() - t0) / 1000).toFixed(1), results };
  if (o.out) { fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true }); fs.writeFileSync(o.out, JSON.stringify(doc, null, 1)); }
  console.log(formatTable(results));
  return 0;
}
/** 記下這次跑的規則常數（報告要寫清楚是哪一版規則量的）。 */
function pickT() {
  const T = Bots.R.T, keys = ['COVER_MODE', 'COVER_EAR_P', 'HIGH_P', 'R_BASE', 'R_GAIN', 'BLIND_LEN', 'STEP_WIN', 'MASK_GAIN', 'SUSP_MOVE', 'SUSP_STEP', 'ALERTED_DURATION'];
  return Object.fromEntries(keys.filter(k => k in T).map(k => [k, T[k]]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
