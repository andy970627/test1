#!/usr/bin/env node
/* 最響一擊第三步（docs/design/2026-11-12-free-hit-schedule.md 第 6 節）：量「現行版」（HIT_MODE 等同 'cycle'）的現況數字。
 * 只讀：不改規則，不改程式玩家；跑 tools/telemetry/troy-bots.js 的現有玩家，逐幀記錄規則狀態。
 *
 *   node tools/telemetry/hit-baseline.mjs                    # 完美、σ0.12、σ0.25 各 500 局（鼓聲不停、規則檔預設：MOVES 開、新鼓聲）
 *   node tools/telemetry/hit-baseline.mjs --n 50 --bots perfect
 *   node tools/telemetry/hit-baseline.mjs --moves 0          # 報告版對照
 *   node tools/telemetry/hit-baseline.mjs --out 結果.json
 *
 * 現行版的「最響一擊」＝循環相位 p 跳回 0（c.index 加一）的那一刻 c.start；警戒中（panic）掩護窗改跟低音走，那時的交接不算一擊。
 * 量的項目（編號＝第 6 節表格）：
 *  1 每擊在 ±2 毫秒內同時落下幾條「踩得上的拍」（音量 ≥ MASK_GAIN；含盲區內的拍，因為那一擊本身就在窗頭）
 *  2 各區兩擊的間隔（同一局、中間沒有警戒），最短／中位／最長（秒）
 *  3 掩護窗（c.blind）佔遊玩時間的比例：每局比例的平均、通關局另算
 *  4 近似「數秒的人」：上兩擊的間隔 Δ，猜下一擊在上一擊 + Δ；猜的時刻落進真的掩護窗（前沿寬限 BLIND_LEAD_GRACE 到 BLIND_LEN）算中
 *  5 近似「聽預告的人」：p 跨過 ILL_ROLL_FROM（聲音層越打越密開始）時起算，0.2 秒反應後讀規則的下一窗預估 blindFrom，在那一刻衝
 *  6 p 只在一擊時往回跳；感知半徑 r(p) 除了一擊那一幀，沒有 > 0.5 公尺的跳動
 *  8 被注意到（check_start、alerted）、追殺（hunt）、甩掉（escape）、追殺中輸掉
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Bots = require('./troy-bots.js');
const R = Bots.R;

const ROLL_FROM = 0.75;      // audio.js ILL_ROLL_FROM：每圈末最快那條越打越密（追殺時不做）
const REACT = 0.2;

function runOne(seed, bot, T, acc) {
  const maxT = 420;
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, T: Object.assign({ COVER_MODE: true }, T || {}) });
  const K = g.T;
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2;
  g.step(t, {}); g.step(t, { start: true });
  let prevIdx = g.cycle.index, prevP = g.cycle.p, prevR = R.radiusAt(g.cycle.p, false, K);
  let playT = 0, blindT = 0, cycBlindT = 0;
  const hits = [];             // 這一局的一擊：{t, zone, state}
  let roll = null;             // 預告：{tr, idx, est?}
  let noticed = 0, hunts = 0, escapes = 0, wasHunted = false;
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > maxT) break;
    const dt = jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : 1 / 60;
    t += dt;
    g.step(t, bot(g));
    for (const e of g.drain()) if (e.type === 'sfx') {
      if (e.a === 'check_start' || e.a === 'alerted') noticed++;
      else if (e.a === 'hunt') hunts++;
      else if (e.a === 'escape') escapes++;
    }
    if (g.phase !== 'play') break;
    wasHunted = g.hunted;
    const c = g.cycle;
    playT += dt;
    if (c.blind) { blindT += dt; if (!c.alertBlind) cycBlindT += dt; }
    const state = g.hunted ? 'hunt' : (g.panic.active ? 'alert' : 'patrol');
    // 6：p 與 r(p) 的跳動
    const r = R.radiusAt(c.p, false, K);
    if (c.index === prevIdx) {
      acc.p6.frames++;
      if (c.p < prevP - 1e-9) acc.p6.pBack++;
      const dr = Math.abs(r - prevR);
      if (dr > acc.p6.maxDr) acc.p6.maxDr = dr;
      if (dr > 0.5) acc.p6.rJump++;
    } else {
      acc.p6.wraps++;
      if (c.index - prevIdx > 1) acc.p6.multiWrap++;
      const dr = Math.abs(r - prevR); if (dr > acc.p6.maxDrWrap) acc.p6.maxDrWrap = dr;
    }
    // 一擊
    if (c.index !== prevIdx && !c.alertBlind && !c.fake) {
      const h = { t: c.start, zone: g.zone, state };
      // 1：同時落下幾條踩得上的拍
      const bs = R.beatsBetween(c.start - 0.002, c.start + 0.002, g, { minGain: K.MASK_GAIN, includeBlind: true });
      const ks = new Set(bs.map(b => b.k));
      const all = R.beatsBetween(c.start - 0.002, c.start + 0.002, g, { includeBlind: true, includeQuiet: true });
      h.n = ks.size; h.layers = new Set(all.map(b => b.k)).size;
      acc.h1.push({ n: h.n, layers: h.layers, state });
      // 5：上一個預告有沒有趕上這一擊
      if (roll && roll.idx === prevIdx) {
        const lo = c.start - K.BLIND_LEAD_GRACE, hi = c.start + K.BLIND_LEN;
        const okA = roll.est != null && roll.est >= roll.tr + REACT - 1e-9 && roll.est >= lo && roll.est < hi;
        const pressB = roll.est0 + REACT;
        const okB = pressB >= lo && pressB < hi;
        acc.h5.push({ okA, okB, lead: c.start - roll.tr, errA: roll.est == null ? null : roll.est - c.start, zone: g.zone });
      }
      roll = null;
      hits.push(h);
    }
    // 5：預告開始
    if (!g.hunted && !g.panic.active && c.index === prevIdx && prevP < ROLL_FROM && c.p >= ROLL_FROM) roll = { tr: t, idx: c.index, est0: c.blindFrom, est: null };
    if (roll && roll.est == null && t >= roll.tr + REACT) roll.est = c.blind ? null : c.blindFrom;
    if (g.hunted || g.panic.active) roll = null;
    prevIdx = c.index; prevP = c.p; prevR = r;
  }
  // 2、4：同一局連續的一擊（中間是巡邏或追殺，警戒時段不算一擊，所以跨過警戒的間隔另標）
  for (let i = 1; i < hits.length; i++) {
    const a = hits[i - 1], b = hits[i];
    acc.h2.push({ gap: b.t - a.t, zone: b.zone, state: b.state, same: a.state === b.state && a.zone === b.zone });
    if (i >= 2) {
      const z = hits[i - 2];
      const pred = a.t + (a.t - z.t);
      const ok = pred >= b.t - g.T.BLIND_LEAD_GRACE && pred < b.t + g.T.BLIND_LEN;
      acc.h4.push({ ok, err: pred - b.t, state: b.state, steady: z.state === a.state && a.state === b.state && z.zone === b.zone });
    }
  }
  const win = g.phase === 'win';
  acc.h3.push({ win, play: playT, blind: blindT, cyc: cycBlindT });
  acc.h8.push({ win, noticed, hunts, escapes, lostHunted: !win && g.phase === 'fail' && wasHunted, fail: g.phase === 'fail', code: g.failCode });
}

const pct = (v) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%');
const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
const f2 = (v) => (v == null ? '—' : v.toFixed(2));

function report(bot, acc) {
  const L = [];
  L.push(`### ${Bots.BOTS[bot].name}（${acc.h3.length} 局）`);
  // 1
  const h1 = acc.h1, byN = {};
  for (const h of h1) byN[h.n] = (byN[h.n] || 0) + 1;
  const h1p = h1.filter(h => h.state === 'patrol'), h1h = h1.filter(h => h.state === 'hunt');
  const dist = (a) => { const m = {}; for (const h of a) m[h.n] = (m[h.n] || 0) + 1; return Object.entries(m).sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k} 條 ${v}（${(v / a.length * 100).toFixed(1)}%）`).join('、'); };
  L.push(`- 1 每擊同時落下的踩得上的拍：共 ${h1.length} 擊；巡邏 ${h1p.length} 擊：${dist(h1p)}；追殺 ${h1h.length} 擊：${dist(h1h) || '無'}；最少 ${Math.min(...h1.map(h => h.n))} 條。（那一刻有拍的層數，含聽不到的：${[...new Set(h1.map(h => h.layers))].join('、')} 層）`);
  // 2
  const zs = [1, 2, 3, 4];
  const row2 = (a) => a.length ? `${a.length} 個：最短 ${f2(q(a, 0))}／中位 ${f2(q(a, 0.5))}／最長 ${f2(q(a, 1))}（10%～90%：${f2(q(a, 0.1))}～${f2(q(a, 0.9))}）` : '無';
  L.push('- 2 兩擊的間隔（秒；同一局、同一區、前後都是巡邏）：');
  for (const z of zs) L.push(`  - 第 ${z} 區：${row2(acc.h2.filter(x => x.zone === z && x.state === 'patrol' && x.same).map(x => x.gap))}`);
  L.push(`  - 追殺中（前後都是追殺）：${row2(acc.h2.filter(x => x.state === 'hunt' && x.same).map(x => x.gap))}`);
  L.push(`  - 跨過警戒或換區的間隔（另列）：${row2(acc.h2.filter(x => !x.same).map(x => x.gap))}`);
  // 3
  const m = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const w = acc.h3.filter(x => x.win);
  const pool = (a, k) => a.reduce((s, x) => s + x[k], 0) / Math.max(1e-9, a.reduce((s, x) => s + x.play, 0));
  L.push(`- 3 掩護窗佔遊玩時間：每局平均 ${pct(m(acc.h3.map(x => x.blind / x.play)))}（只算循環開頭那種 ${pct(m(acc.h3.map(x => x.cyc / x.play)))}）；通關局 ${w.length} 局：每局平均 ${pct(m(w.map(x => x.blind / x.play)))}（循環開頭 ${pct(m(w.map(x => x.cyc / x.play)))}），全部加總 ${pct(pool(w, 'blind'))}`);
  // 4
  const h4s = acc.h4.filter(x => x.steady && x.state === 'patrol'), h4all = acc.h4;
  L.push(`- 4 近似「數秒的人」：前三擊都是同區巡邏 ${h4s.length} 次，猜中 ${pct(h4s.filter(x => x.ok).length / h4s.length)}（誤差絕對值中位 ${f2(q(h4s.map(x => Math.abs(x.err)), 0.5))} 秒）；不分情況 ${h4all.length} 次，猜中 ${pct(h4all.filter(x => x.ok).length / h4all.length)}`);
  // 5
  const h5 = acc.h5;
  L.push(`- 5 近似「聽預告的人」：${h5.length} 次預告；反應 0.2 秒後讀預估時刻、在那一刻衝：中 ${pct(h5.filter(x => x.okA).length / h5.length)}；預告開始時讀預估、晚 0.2 秒衝：中 ${pct(h5.filter(x => x.okB).length / h5.length)}；預告長度（預告開始到那一擊）中位 ${f2(q(h5.map(x => x.lead), 0.5))} 秒（最短 ${f2(q(h5.map(x => x.lead), 0))}、最長 ${f2(q(h5.map(x => x.lead), 1))}）；預估誤差絕對值 90% ${f2(q(h5.filter(x => x.errA != null).map(x => Math.abs(x.errA)), 0.9))} 秒`);
  // 6
  const p6 = acc.p6;
  L.push(`- 6 p 的跳動：非交接的 ${p6.frames} 幀中 p 往回 ${p6.pBack} 次、r(p) 跳 > 0.5 公尺 ${p6.rJump} 次（最大 ${p6.maxDr.toFixed(3)} 公尺）；交接 ${p6.wraps} 次（一幀跨兩圈以上 ${p6.multiWrap} 次），交接那一幀 r 最大跳 ${p6.maxDrWrap.toFixed(2)} 公尺`);
  // 8
  const h8 = acc.h8, n8 = h8.length;
  const noticedG = h8.filter(x => x.noticed > 0), huntG = h8.filter(x => x.hunts > 0);
  const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  L.push(`- 8 被注意到 ${sum(h8, 'noticed')} 次（${noticedG.length}／${n8} 局）、追殺 ${sum(h8, 'hunts')} 次（${huntG.length} 局）、甩掉 ${sum(h8, 'escapes')} 次；化解（被注意到的局裡沒被追殺）${noticedG.filter(x => x.hunts === 0).length}／${noticedG.length}＝${pct(noticedG.filter(x => x.hunts === 0).length / noticedG.length)}；被追殺的局因追殺而輸 ${huntG.filter(x => x.lostHunted).length}／${huntG.length}；通關 ${pct(h8.filter(x => x.win).length / n8)}`);
  return L.join('\n');
}

function main(argv) {
  const o = { n: 500, bots: 'perfect,sigma12,sigma25', T: undefined, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') o.n = +argv[++i];
    else if (a === '--bots') o.bots = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--moves') o.T = Object.assign({}, o.T, { MOVES_MODE: argv[++i] !== '0' });
  }
  const out = { command: 'node tools/telemetry/hit-baseline.mjs ' + argv.join(' '), n: o.n, bots: {} };
  const texts = [];
  for (const b of o.bots.split(',')) {
    const acc = { h1: [], h2: [], h3: [], h4: [], h5: [], h8: [], p6: { frames: 0, pBack: 0, rJump: 0, maxDr: 0, wraps: 0, multiWrap: 0, maxDrWrap: 0 } };
    const t1 = Date.now();
    for (let s = 1; s <= o.n; s++) {
      runOne(s, Bots.BOTS[b].make(true, s), o.T, acc);
      if (s % 50 === 0) process.stderr.write(`  ${b} ${s}/${o.n}\r`);
    }
    process.stderr.write(`[hit-baseline] ${b}：${o.n} 局（${((Date.now() - t1) / 1000).toFixed(0)} 秒）\n`);
    texts.push(report(b, acc));
    out.bots[b] = acc;
  }
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(out));
  console.log(texts.join('\n\n'));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
