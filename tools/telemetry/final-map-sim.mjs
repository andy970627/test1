#!/usr/bin/env node
/* 期末版七段地圖（prototypes/troy-prologue/level-troy-final.js）的程式玩家量測：只印、不改規則。
 *
 *   node tools/telemetry/final-map-sim.mjs                     # 完美、σ0.12、σ0.25 各 200 局
 *   node tools/telemetry/final-map-sim.mjs --n 50 --bots sigma12 --map prototypes/troy-prologue/level-troy-final.js
 *
 * 一局一條命（第一次失敗就結束，和 overnight-sim 一樣）、最多 600 秒。規則檔預設（MOVES 開、新鼓聲、COVER）。
 * 程式玩家照地圖每一區的 botRoute 走（troy-bots.js 的 forBotLevel）。
 * 印：整關通過率、通關時間中位；每區「進來幾局、過了幾局（通過率）、過的人平均停留秒數」；死因與死在哪（區、1 公尺格）前幾名。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');
const R = Bots.R;

function runOne(level, seed, bot, maxT) {
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, level, T: { COVER_MODE: true } });
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2, zone = -1, zt0 = 0;
  const zones = [];   // {zone, t（停留秒數）, passed}
  g.step(t, {}); g.step(t, { start: true });
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > maxT) break;
    t += jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : 1 / 60;
    g.step(t, bot(g)); g.drain();
    if (g.zone !== zone) {
      if (zone >= 1) zones.push({ zone, t: t - zt0, passed: true });
      zone = g.zone; zt0 = t;
    }
  }
  const win = g.phase === 'win';
  zones.push({ zone, t: t - zt0, passed: win });
  const cause = win ? null : g.phase === 'fail' ? (g.failCode || 'unknown') : 'timeout';
  return { win, t: t - 2, zones, cause, at: win ? null : { zone: g.zone, x: Math.floor(g.player.x), z: Math.floor(g.player.z) } };
}

const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function simulate(level, botKey, n, maxT = 600) {
  const bo = Bots.forBotLevel(level);
  const rs = [];
  for (let s = 1; s <= n; s++) {
    const base = botKey === 'perfect' ? {} : { sigma: botKey === 'sigma12' ? 0.12 : 0.25, seed: s };
    rs.push(runOne(level, s, Bots.makeBot(Object.assign({ cover: true }, base, bo)), maxT));
  }
  return rs;
}

function report(level, botKey, rs) {
  const n = rs.length, wins = rs.filter((r) => r.win);
  const L = [`### ${Bots.BOTS[botKey].name}：${n} 局，整關通過 ${(wins.length / n * 100).toFixed(1)}%，通關時間中位 ${wins.length ? med(wins.map((r) => r.t)).toFixed(1) : '—'} 秒`, '',
    '| 區 | 進來 | 過了 | 通過率 | 過的人平均停留（秒） |', '|---|---|---|---|---|'];
  for (let z = 1; z < level.zones.length; z++) {
    const all = rs.flatMap((r) => r.zones.filter((o) => o.zone === z));
    const ok = all.filter((o) => o.passed);
    if (!all.length) { L.push(`| ${z} ${level.zones[z].name} | 0 | 0 | — | — |`); continue; }
    L.push(`| ${z} ${level.zones[z].name} | ${all.length} | ${ok.length} | ${(ok.length / all.length * 100).toFixed(1)}% | ${ok.length ? (ok.reduce((a, o) => a + o.t, 0) / ok.length).toFixed(1) : '—'} |`);
  }
  const causes = {}, spots = {};
  for (const r of rs) if (!r.win) {
    causes[r.cause] = (causes[r.cause] || 0) + 1;
    const k = `區 ${r.at.zone}（${r.at.x}, ${r.at.z}）`; spots[k] = (spots[k] || 0) + 1;
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join('、') || '—';
  L.push('', `死因：${top(causes)}`, `死在哪（前 6 名）：${top(spots)}`, '');
  return L.join('\n');
}

function main(argv) {
  const o = { n: 200, bots: 'perfect,sigma12,sigma25', map: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prototypes/troy-prologue/level-troy-final.js') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') o.n = +argv[++i];
    else if (argv[i] === '--bots') o.bots = argv[++i];
    else if (argv[i] === '--map') o.map = path.resolve(argv[++i]);
  }
  const level = R.resolveLevel(require(o.map));
  const out = [`地圖：${path.basename(o.map)}（${level.size.w} × ${level.size.h}，${level.zones.length - 1} 區可玩）`, ''];
  for (const b of o.bots.split(',')) { out.push(report(level, b, simulate(level, b, o.n))); process.stderr.write(`[final-map-sim] ${b} 完成\n`); }
  console.log(out.join('\n'));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
