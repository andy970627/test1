#!/usr/bin/env node
/* 短展示版（prototypes/troy-prologue/level-troy-demo.js，?map=demo）追殺緊張度量測：只印、不改規則或難度。
 *
 *   node tools/telemetry/demo-hunt-sim.mjs                         # σ0.12 500 局，另附完美、σ0.25 對照
 *   node tools/telemetry/demo-hunt-sim.mjs --n 500 --bots sigma12 --json out.json
 *
 * 一局一條命（第一次失敗就結束，同 overnight-sim／final-map-sim）、最多 600 秒、COVER_MODE 開，其餘照規則預設。
 * 程式玩家＝troy-bots.js 的 makeBot（地圖 botRoute；σ 只模擬起步那一下的手誤）。
 * 「人類視角」（錄音工具 --human-cam）只換畫出來的鏡頭，不影響移動與判定，所以 Node 批次不需要也無從模擬。
 * 量：被追殺的局數比例、追殺時間佔遊玩時間比例、每次追殺從被發現（g.hunted 由假變真）到甩掉（由真變假且還活著）的秒數分布、
 *     被抓（追殺中失敗）比例、通關率、通關時間分布、各區追殺次數。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');
const R = Bots.R;
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prototypes/troy-prologue/level-troy-demo.js');

export function runOne(level, seed, bot, maxT = 600) {
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, level, T: { COVER_MODE: true } });
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2, play = 0, huntT = 0, cur = null, checks = 0;
  const hunts = [];
  g.step(t, {}); g.step(t, { start: true });
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > maxT) break;
    const dt = jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : 1 / 60;
    t += dt;
    g.step(t, bot(g));
    for (const e of g.drain()) if (e.type === 'sfx' && e.a === 'check_start') checks++;
    if (g.phase === 'play') { play += dt; if (g.hunted) huntT += dt; }
    if (g.hunted && !cur) cur = { start: t - 2, zone: g.zone };
    else if (!g.hunted && cur && g.phase === 'play') { cur.dur = t - 2 - cur.start; cur.end = 'escape'; hunts.push(cur); cur = null; }
  }
  const win = g.phase === 'win';
  if (cur) { cur.dur = t - 2 - cur.start; cur.end = win ? 'win' : g.phase === 'fail' ? 'caught' : 'timeout'; hunts.push(cur); }
  const cause = win ? null : g.phase === 'fail' ? (g.failCode || 'unknown') : 'timeout';
  return { seed, win, t: t - 2, play, huntT, hunts, checks, cause, zone: g.zone };
}

export function simulate(level, botKey, n, maxT = 600) {
  const bo = Bots.forBotLevel(level), rs = [];
  for (let s = 1; s <= n; s++) {
    const base = botKey === 'perfect' ? {} : { sigma: botKey === 'sigma12' ? 0.12 : 0.25, seed: s };
    rs.push(runOne(level, s, Bots.makeBot(Object.assign({ cover: true }, base, bo)), maxT));
  }
  return rs;
}

const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const f1 = (v) => (v == null ? '—' : v.toFixed(1));
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');

export function summarize(rs) {
  const n = rs.length, wins = rs.filter((r) => r.win), hunted = rs.filter((r) => r.hunts.length);
  const all = rs.flatMap((r) => r.hunts), esc = all.filter((h) => h.end === 'escape');
  const ed = esc.map((h) => h.dur), wt = wins.map((r) => r.t);
  const bins = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 15], [15, 20], [20, 30], [30, 1e9]];
  const byZone = {};
  for (const h of all) byZone[h.zone] = (byZone[h.zone] || 0) + 1;
  const causes = {};
  for (const r of rs) if (!r.win) causes[r.cause] = (causes[r.cause] || 0) + 1;
  return {
    n, winRate: wins.length / n, huntedGames: hunted.length, huntedRate: hunted.length / n,
    huntTimeShare: rs.reduce((a, r) => a + r.huntT, 0) / Math.max(1e-9, rs.reduce((a, r) => a + r.play, 0)),
    huntsPerGame: all.length / n, hunts: all.length, escapes: esc.length,
    caught: all.filter((h) => h.end === 'caught').length, huntEndWin: all.filter((h) => h.end === 'win').length,
    escape: { min: q(ed, 0), p25: q(ed, 0.25), med: q(ed, 0.5), p75: q(ed, 0.75), p90: q(ed, 0.9), max: q(ed, 1), mean: ed.length ? ed.reduce((a, b) => a + b, 0) / ed.length : null,
      hist: bins.map(([a, b]) => ({ from: a, to: b, n: ed.filter((d) => d >= a && d < b).length })) },
    clear: { min: q(wt, 0), p25: q(wt, 0.25), med: q(wt, 0.5), p75: q(wt, 0.75), p90: q(wt, 0.9), max: q(wt, 1) },
    winHunted: hunted.filter((r) => r.win).length, winClean: rs.filter((r) => r.win && !r.hunts.length).length, clean: n - hunted.length,
    clearMedHunted: q(wins.filter((r) => r.hunts.length).map((r) => r.t), 0.5), clearMedClean: q(wins.filter((r) => !r.hunts.length).map((r) => r.t), 0.5),
    checksPerGame: rs.reduce((a, r) => a + r.checks, 0) / n, byZone, causes
  };
}

export function report(level, name, s) {
  const zn = (z) => `${z} ${(level.zones[z] || {}).name || ''}`.trim();
  const L = [`### ${name}：${s.n} 局`, '',
    '| 項目 | 數字 |', '|---|---|',
    `| 通關率 | ${pct(s.winRate * s.n, s.n)}（${Math.round(s.winRate * s.n)}／${s.n}） |`,
    `| 通關時間（秒） | 中位 ${f1(s.clear.med)}；四分位 ${f1(s.clear.p25)}～${f1(s.clear.p75)}；P90 ${f1(s.clear.p90)}；範圍 ${f1(s.clear.min)}～${f1(s.clear.max)} |`,
    `| 被追殺過的局 | ${pct(s.huntedGames, s.n)}（${s.huntedGames} 局；每局平均 ${s.huntsPerGame.toFixed(2)} 次） |`,
    `| 追殺時間佔遊玩時間 | ${(s.huntTimeShare * 100).toFixed(1)}% |`,
    `| 追殺結局 | 共 ${s.hunts} 次：甩掉 ${s.escapes}（${pct(s.escapes, s.hunts)}）、被抓 ${s.caught}（${pct(s.caught, s.hunts)}）、追殺中通關 ${s.huntEndWin} |`,
    `| 被發現到甩掉（秒，只算甩掉的） | 中位 ${f1(s.escape.med)}；四分位 ${f1(s.escape.p25)}～${f1(s.escape.p75)}；P90 ${f1(s.escape.p90)}；範圍 ${f1(s.escape.min)}～${f1(s.escape.max)}；平均 ${f1(s.escape.mean)} |`,
    `| 被追過的局通關率／通關時間中位 | ${pct(s.winHunted, s.huntedGames)}／${f1(s.clearMedHunted)} 秒 |`,
    `| 沒被追過的局通關率／通關時間中位 | ${pct(s.winClean, s.clean)}／${f1(s.clearMedClean)} 秒 |`,
    `| 衛兵查看 | ${s.checksPerGame.toFixed(2)} 次／局 |`,
    `| 追殺發生在哪區 | ${Object.entries(s.byZone).map(([z, c]) => `${zn(+z)} ${c}`).join('、') || '—'} |`,
    `| 死因 | ${Object.entries(s.causes).map(([k, v]) => `${k} ${v}`).join('、') || '—'} |`,
    '', '甩掉秒數分布：', '', '| 秒 | 次數 |', '|---|---|',
    ...s.escape.hist.map((h) => `| ${h.from}～${h.to > 1e8 ? '' : h.to} | ${h.n} |`), ''];
  return L.join('\n');
}

function main(argv) {
  const o = { n: 500, bots: 'sigma12,perfect,sigma25', json: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') o.n = +argv[++i];
    else if (argv[i] === '--bots') o.bots = argv[++i];
    else if (argv[i] === '--json') o.json = argv[++i];
  }
  const level = R.resolveLevel(require(DEMO));
  const out = [`地圖：level-troy-demo.js（${level.size.w} × ${level.size.h}，${level.zones.length - 1} 區可玩）`, ''], js = {};
  for (const b of o.bots.split(',')) {
    const t0 = Date.now(), s = summarize(simulate(level, b, o.n));
    js[b] = s; out.push(report(level, Bots.BOTS[b].name, s));
    process.stderr.write(`[demo-hunt-sim] ${b} 完成 ${((Date.now() - t0) / 1000).toFixed(0)} 秒\n`);
  }
  console.log(out.join('\n'));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(js, null, 1));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));