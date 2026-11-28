#!/usr/bin/env node
/* 第二步難度診斷（docs/design/2026-11-12-free-hit-schedule.md 第 12.2 節）：出聲的腳步分類，只印、不改規則。
 *
 *   node tools/telemetry/loud-steps.mjs                 # 新鼓聲（規則檔預設：MOVES 開），每圈 7 拍與 6 拍，σ0.12 各 500 局
 *   node tools/telemetry/loud-steps.mjs --n 100 --bot sigma25 --ms 7,6
 *
 * 每一個 step_loud 事件分成三類（照 risset.js 一般走法 glide 的腳步邏輯，從外面判斷）：
 *   起步沒踩準：上一幀沒在動（規則的 walking＝上一幀有沒有走），這一步是站定後的第一步，照 stepMasked 判成出聲；
 *   等太久沒有拍：連續走著，STEP_GAP × STEP_GAP_MAX 內沒有可聽拍，照時間落的那一步；
 *   追殺中強制出聲：第 18.7 節（新鼓聲、被追殺、不在影子裡、不在掩護窗）不論拍點一律出聲。
 * 另印：踩準的步、跑步出聲（run_step masked = false）、通關率、通關時間中位、每局被追殺次數。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');
const R = Bots.R;

function runOne(seed, bot, T) {
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, T: Object.assign({ COVER_MODE: true }, T) });
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2, prevMoving = false;
  const c = { start: 0, gap: 0, forced: 0, masked: 0, runLoud: 0, hunts: 0 };
  g.step(t, {}); g.step(t, { start: true });
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > 420) break;
    t += jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : 1 / 60;
    g.step(t, bot(g));
    for (const e of g.drain()) {
      if (e.type !== 'sfx') continue;
      if (e.a === 'step_masked') c.masked++;
      else if (e.a === 'step_loud') {
        if (g.T.DRUMS !== 'old' && g.hunted && !g.player.hidden && !g.cycle.blind) c.forced++;
        else if (!prevMoving) c.start++;
        else c.gap++;
      } else if (e.a === 'run_step' && e.masked === false) c.runLoud++;
      else if (e.a === 'hunt') c.hunts++;
    }
    prevMoving = !!g.player.moving;
  }
  return Object.assign(c, { win: g.phase === 'win', t: t - 2 });
}

const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function main(argv) {
  const o = { n: 500, bot: 'sigma12', ms: '7,6' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') o.n = +argv[++i];
    else if (argv[i] === '--bot') o.bot = argv[++i];
    else if (argv[i] === '--ms') o.ms = argv[++i];
  }
  const L = ['| 每圈拍數 | 局數 | 踩準的步 | 起步沒踩準 | 等太久沒有拍 | 追殺中強制出聲 | 出聲合計（佔走路步） | 跑步出聲 | 通關率 | 通關時間中位（秒） | 被追殺（次／局；被追殺過的局） |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const m of o.ms.split(',').map(Number)) {
    const rs = [];
    for (let s = 1; s <= o.n; s++) rs.push(runOne(s, Bots.BOTS[o.bot].make(true, s), { RISSET_M: m }));
    const S = (k) => rs.reduce((a, r) => a + r[k], 0);
    const loud = S('start') + S('gap') + S('forced'), all = loud + S('masked');
    const wins = rs.filter(r => r.win);
    L.push(`| ${m} | ${o.n} | ${S('masked')} | ${S('start')} | ${S('gap')} | ${S('forced')} | ${loud}（${(loud / all * 100).toFixed(1)}%） | ${S('runLoud')} | ${(wins.length / o.n * 100).toFixed(1)}% | ${med(wins.map(r => r.t)).toFixed(1)} | ${S('hunts')}（${(S('hunts') / o.n).toFixed(3)}）；${rs.filter(r => r.hunts > 0).length} 局 |`);
    process.stderr.write(`[loud-steps] RISSET_M ${m} 完成\n`);
  }
  console.log(`玩家：${Bots.BOTS[o.bot].name}；鼓聲不停、規則檔預設（MOVES 開、新鼓聲），只換 RISSET_M\n` + L.join('\n'));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
