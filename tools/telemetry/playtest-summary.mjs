#!/usr/bin/env node
/* 12/3 整關試玩摘要（七段版 ?map=final；量測與驗收，11/28）：讀遊戲「匯出數據」下載的 JSON，寫一頁手機好讀的 Markdown。
 *
 *   node tools/telemetry/playtest-summary.mjs <匯出檔.json> [--out 摘要.md] [--map final|demo|default]
 *   node tools/telemetry/playtest-summary.mjs --demo [--out 摘要.md]     # 程式玩家（σ0.5，失敗就重來這一區）在 Node 跑一局產生示範；
 *     程式玩家 30 局都沒被抓過，所以示範在神殿廣場故意走向衛兵一次，讓被抓紀錄看得到
 *
 * 每段寫：花多少時間、被抓幾次（失敗原因）、在哪裡被抓、有沒有可能迷路。
 * 資料來源全是現有遙測（prototypes/telemetry.js 的 run：zone／fail／retry 事件與規則的 out 事件），不改遊戲。
 * 限制（遙測沒記玩家座標）：
 *   - 「在哪裡被抓」寫的是被抓前 6 秒內最近一筆衛兵查看／喊人事件的衛兵位置（x, z 公尺），是玩家附近的近似，不是玩家本人的位置。
 *   - 「可能迷路」只能用時間判斷：同一段停留超過程式玩家（完美踩拍）同一段時間的 3 倍且多 30 秒，或走回上一段；
 *     看不出是在原地來回還是躲著等。要更準，需要遊戲在 fail 事件或每 2 秒記一次玩家座標（屬畫面角色的 index.html）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');
const Telemetry = require('../../prototypes/telemetry.js');
const R = Bots.R;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

function loadLevel(map) {
  if (map === 'default') return null;
  const f = path.join(REPO, 'prototypes/troy-prologue', map === 'demo' ? 'level-troy-demo.js' : 'level-troy-final.js');
  return R.resolveLevel(require(f));
}

/** 跑一局：retry＝失敗後重來這一區（頁面上按 R 的同一個 g.retry），用 Telemetry 照頁面的時機記事件。 */
function simRun(level, { sigma = 0, seed = 1, retry = false, maxT = 900, record = false, bumpZone = null } = {}) {
  const g = R.createLevel({ t0: (seed * 1.37) % 10, seed, level, T: { COVER_MODE: true } });
  const bot = Bots.makeBot(Object.assign({ cover: true }, level ? Bots.forBotLevel(level) : {}, sigma ? { sigma, seed } : {}));
  let t = 2, zone = null, phase = null, done = null, bumped = false;
  // 示範用：bumpZone 那一區第一次進來時直接走向最近的衛兵（程式玩家本身幾乎不會被抓，示範才看得到被抓紀錄）
  const act = (g) => {
    if (bumpZone != null && !bumped && g.zone === bumpZone) {
      const P = g.player; let q = null, d = 1e9;
      for (const o of g.guards || []) if (o.active) { const e = Math.hypot(o.x - P.x, o.z - P.z); if (e < d) { d = e; q = o; } }
      if (q) { const k = Math.max(d, 1e-6); return { mx: (q.x - P.x) / k, mz: (q.z - P.z) / k, yaw: Math.atan2(-(q.x - P.x), -(q.z - P.z)) }; }
    }
    return bot(g);
  };
  const tel = record ? Telemetry.create({ storage: null, wall: () => 1795000000000 + t * 1000 }) : null;
  g.step(t, {}); g.step(t, { start: true });
  if (tel) tel.start({ proto: 'troy-prologue', version: 'sim', device: 'unknown', clock: () => ({ t: g.time, z: g.zone, p: g.cycle && g.cycle.p }) });
  const zt = {};   // 程式玩家每區停留秒數
  let zEnter = t;
  for (;;) {
    t += 1 / 60;
    g.step(t, g.phase === 'play' ? act(g) : {});
    const out = g.drain ? g.drain() : [];
    if (tel) for (const e of out) tel.event('out', e);
    if (g.zone !== zone) { if (zone != null) zt[zone] = (zt[zone] || 0) + (t - zEnter); zEnter = t; if (tel) tel.event('zone', { from: zone, to: g.zone }); zone = g.zone; }
    if (g.phase !== phase) {
      phase = g.phase;
      if (phase === 'fail') { if (tel) tel.event('fail', { code: g.failCode || null, reason: g.failReason || null, zone: g.zone }); bumped = true; if (!retry) { if (tel) done = tel.endRun({ outcome: 'fail' }); break; } t += 3; g.retry(); if (tel) tel.event('retry', { zone: g.zone }); phase = g.phase; }
      if (phase === 'win') { zt[zone] = (zt[zone] || 0) + (t - zEnter); if (tel) { tel.event('win', { retries: g.retries }); done = tel.endRun({ outcome: 'win' }); } break; }
    }
    if (t > maxT) { if (tel) done = tel.endRun({ outcome: 'quit' }); break; }
  }
  return { phase: g.phase, zt, run: done, names: (level || R.buildLevel()).zones.map((z) => z.name) };
}

/** 程式玩家（完美）各區停留秒數的中位，當「正常要多久」的基準。 */
function baseline(level, n = 9) {
  const per = {};
  for (let s = 1; s <= n; s++) { const r = simRun(level, { seed: s }); if (r.phase !== 'win') continue; for (const [z, v] of Object.entries(r.zt)) (per[z] || (per[z] = [])).push(v); }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  return Object.fromEntries(Object.entries(per).map(([z, a]) => [z, med(a)]));
}

export function summarize(run, names, base) {
  const ev = run.events || [], zones = {};
  const Z = (z) => zones[z] || (zones[z] = { time: 0, visits: 0, fails: [], back: 0 });
  let cur = null, enter = null, maxZ = -1, lastGuard = null;
  const end = ev.length ? ev[ev.length - 1].gt : 0;
  for (const e of ev) {
    const d = e.data || {};
    if (e.name === 'zone' && Number.isFinite(d.to)) {
      if (cur != null) Z(cur).time += e.gt - enter;
      if (d.to < maxZ) Z(d.to).back++;
      maxZ = Math.max(maxZ, d.to); cur = d.to; enter = e.gt; Z(cur).visits++;
    }
    if (e.name === 'out' && d.type === 'sfx' && Number.isFinite(d.x) && /^(check_start|check_retarget|hunt_call)$/.test(d.a)) lastGuard = { gt: e.gt, x: d.x, z: d.z, a: d.a };
    if (e.name === 'fail') {
      const near = lastGuard && e.gt - lastGuard.gt <= 6 ? `衛兵在 (${lastGuard.x.toFixed(0)}, ${lastGuard.z.toFixed(0)})` : '附近沒有衛兵事件';
      Z(cur != null ? cur : d.zone).fails.push({ gt: e.gt, code: d.reason || d.code || '未知', near });
    }
  }
  if (cur != null) Z(cur).time += end - enter;
  const rows = Object.keys(zones).map(Number).sort((a, b) => a - b).map((z) => {
    const o = zones[z], b = base && base[z], lost = [];
    if (b != null && o.time > 3 * b && o.time - b > 30) lost.push(`停留 ${o.time.toFixed(0)} 秒，程式玩家約 ${b.toFixed(0)} 秒`);
    if (o.back) lost.push(`從後面走回來 ${o.back} 次`);
    return { z, name: names[z] || ('第 ' + z + ' 區'), time: o.time, fails: o.fails, lost };
  });
  return { outcome: run.result && run.result.outcome, total: end, rows };
}

const fmt = (s) => s >= 60 ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒` : `${Math.round(s)} 秒`;
export function toMarkdown(S, title) {
  const out = [`### ${title}`, '', `- 結果：${S.outcome === 'win' ? '通關' : S.outcome || '未結束'}，總共 ${fmt(S.total)}`,
    `- 被抓：${S.rows.reduce((n, r) => n + r.fails.length, 0)} 次；可能迷路：${S.rows.filter((r) => r.lost.length).map((r) => r.name).join('、') || '沒有'}`, ''];
  for (const r of S.rows) {
    out.push(`**${r.z}. ${r.name}**　${fmt(r.time)}${r.fails.length ? `，被抓 ${r.fails.length} 次` : ''}${r.lost.length ? '，⚠️可能迷路' : ''}`);
    for (const f of r.fails) out.push(`- 開局第 ${fmt(f.gt)}：${f.code}（${f.near}）`);
    for (const l of r.lost) out.push(`- 迷路線索：${l}`);
    out.push('');
  }
  out.push('<sub>位置是被抓前最近一名查看或喊人的衛兵座標（公尺），遙測沒記玩家座標；迷路只按時間判斷。</sub>');
  return out.join('\n');
}

function main() {
  const map = opt('map', 'final'), level = loadLevel(map);
  let run, title;
  if (argv.includes('--demo')) {
    let r = null;
    for (let seed = 1; seed <= 20 && !(r && r.phase === 'win' && r.run.events.some((e) => e.name === 'fail')); seed++) r = simRun(level, { sigma: 0.5, seed, retry: true, record: true, bumpZone: 3 });
    run = r.run; title = `示範：程式玩家（手很不準 σ0.5，失敗就重來這一區；在神殿廣場故意走向衛兵一次）跑七段版`;
  } else {
    const f = argv.find((a, i) => !a.startsWith('--') && !['--out', '--map'].includes(argv[i - 1]));
    if (!f) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 1; }
    const J = JSON.parse(fs.readFileSync(f, 'utf8')), runs = Array.isArray(J.runs) ? J.runs : [J];
    run = runs.filter((x) => x && x.events).sort((a, b) => b.events.length - a.events.length)[0];
    title = `試玩紀錄 ${(run.startedAt || '').slice(0, 10)}`;
  }
  const names = (level || R.buildLevel()).zones.map((z) => z.name);
  const md = toMarkdown(summarize(run, names, baseline(level)), title);
  if (opt('out')) fs.writeFileSync(opt('out'), md + '\n');
  console.log(md);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
