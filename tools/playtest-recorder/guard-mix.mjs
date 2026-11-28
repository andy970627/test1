#!/usr/bin/env node
/* 衛兵聲在總輸出裡有多大（查看／追殺，11/11）
 *
 *   node tools/playtest-recorder/guard-mix.mjs <錄音資料夾> [--json]
 *
 * 要用 --lab-bot check|hunt（或 --listen-test）錄的，時間軸每幀有 lg：
 *   gp＝衛兵總線 guardOut（過盲區閘門後）× master 的取樣峰值（dBFS），mp＝總輸出峰值，bp[k]／bg[k]＝慢低音候選線的峰值與增益。
 *   慢低音：候選裡「平常增益 ≈ BASS_BASE」的那條（profiles/troy-prologue.mjs 的找法會連鼓聲總線一起找到）。
 * 量法（2048 點取樣窗、每幀一筆，所以是「約 46 毫秒內的峰值」，和離線量的單一樣本峰值可能差 1～2 dB）：
 *   鼓峰值：每 0.5 秒總輸出峰值的最大值，取衛兵總線比它低 ≥ 10 dB 的段，中位數。
 *   腳步：每 0.25 秒衛兵總線峰值的最大值，排除人聲事件前 0.1 秒到後 1 秒，依衛兵狀態與距離分組，中位數。
 *   人聲（疑問聲、喊人、搜索等）：事件後 0.8 秒內衛兵總線峰值的最大值，和鼓峰值比。
 *   慢低音：每 1 秒慢低音線峰值的最大值，依最近一名查看中衛兵的距離分組。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VOICE = ['check_start', 'check_arrive', 'check_over', 'hunt_call', 'hunt_heard', 'search_start', 'search_done', 'pant_start'];
const med = (a) => { a = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function guardMix(TL, EV, opts = {}) {
  const fr = TL.filter((s) => s.lg && s.lg.gp != null && s.lg.mp != null && s.phase === 'play');
  if (!fr.length) return null;
  const binMax = (dt, f) => { const m = new Map(); for (const s of fr) { const k = Math.floor(s.t / dt); const v = f(s); if (v == null) continue; const o = m.get(k); if (!o || v > o.v) m.set(k, { v, s }); } return [...m.values()]; };
  // 鼓峰值
  const drum = med(binMax(0.5, (s) => s.lg.mp).filter((b) => b.s.lg.gp < b.v - 10).map((b) => b.v));
  // 人聲事件
  const cues = EV.filter((e) => e.type === 'cue' && VOICE.includes(e.name)).map((e) => ({ name: e.name, t: e.at != null ? e.at : e.t }));
  const nearCue = (t) => cues.some((c) => t > c.t - 0.1 && t < c.t + 1.0);
  // 腳步：依狀態與距離
  const steps = {};
  for (const b of binMax(0.25, (s) => s.lg.gp)) {
    if (b.v < -90 || nearCue(b.s.t) || b.s.gd == null) continue;
    const st = b.s.gs === 'checking' ? 'checking' : (b.s.gs === 'hunted' || b.s.gs === 'search') ? 'hunted' : b.s.gs === 'patrol' ? 'patrol' : null;
    if (!st) continue;
    const d = +b.s.gd, k = st + (d >= 2 && d <= 4 ? '@3m' : d > 4 && d <= 7 ? '@4-7m' : d > 7 ? '@>7m' : '@<2m');
    (steps[k] || (steps[k] = [])).push(b.v);
  }
  const stepRows = Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { n: v.length, medDb: r1(med(v)), vsDrumDb: drum == null ? null : r1(med(v) - drum) }]));
  // 人聲
  const voice = {};
  for (const c of cues) {
    let m = -140; for (const s of fr) if (s.t >= c.t && s.t <= c.t + 0.8 && s.lg.gp > m) m = s.lg.gp;
    (voice[c.name] || (voice[c.name] = [])).push(m);
  }
  const voiceRows = Object.fromEntries(Object.entries(voice).map(([k, v]) => [k, { n: v.length, medDb: r1(med(v)), vsDrumDb: drum == null ? null : r1(med(v) - drum) }]));
  // 慢低音：挑平常增益最接近 BASS_BASE 的候選
  const base = opts.bassBase != null ? opts.bassBase : 0.22;
  const nC = (fr.find((s) => s.lg.bg && s.lg.bg.length) || { lg: { bg: [] } }).lg.bg.length;
  let bi = null, bestErr = 1e9;
  for (let k = 0; k < nC; k++) { const e = Math.abs(med(fr.filter((s) => s.gs === 'patrol').map((s) => s.lg.bg[k])) - base); if (e < bestErr) { bestErr = e; bi = k; } }
  const bass = {};
  if (bi != null && bestErr < 0.05) {
    for (const b of binMax(1, (s) => (s.lg.bp ? s.lg.bp[bi] : null))) {
      if (b.v < -90) continue;
      const k = b.s.gs === 'checking' && b.s.gd != null ? Math.round(+b.s.gd) + 'm' : b.s.gs === 'patrol' ? '巡邏' : null;
      if (!k) continue;
      (bass[k] || (bass[k] = { pk: [], g: [] })).pk.push(b.v); bass[k].g.push(b.s.lg.bg[bi]);
    }
  }
  const bassRows = Object.fromEntries(Object.entries(bass).map(([k, v]) => [k, { n: v.pk.length, medDb: r1(med(v.pk)), gain: +(med(v.g) || 0).toFixed(3) }]));
  return { drumPeakDb: r1(drum), steps: stepRows, voice: voiceRows, bass: bassRows, bassIndex: bi };
}

function main(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 1; }
  const J = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const r = guardMix(J.timeline || J, J.events || []);
  if (!r) { console.log('時間軸沒有 lg（要用 --lab-bot 或 --listen-test 錄）'); return 1; }
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return 0; }
  console.log(`鼓峰值（總輸出，衛兵低 10 dB 以上的段）：${r.drumPeakDb} dBFS`);
  console.log('衛兵腳步（衛兵總線峰值，dBFS；比鼓）：');
  for (const [k, v] of Object.entries(r.steps).sort()) console.log(`  ${k}：${v.medDb}（${v.vsDrumDb >= 0 ? '+' : ''}${v.vsDrumDb}），${v.n} 段`);
  console.log('衛兵人聲（事件後 0.8 秒內峰值）：');
  for (const [k, v] of Object.entries(r.voice).sort()) console.log(`  ${k}：${v.medDb}（${v.vsDrumDb >= 0 ? '+' : ''}${v.vsDrumDb}），${v.n} 次`);
  console.log('慢低音（每秒峰值，依查看中衛兵距離）：');
  for (const [k, v] of Object.entries(r.bass).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))) console.log(`  ${k}：${v.medDb} dBFS（增益 ${v.gain}），${v.n} 秒`);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
