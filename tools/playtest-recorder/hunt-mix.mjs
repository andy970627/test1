#!/usr/bin/env node
/* 第 18 節追殺聲音的驗收（docs/design/2026-11-11-companion-mechanics.md 18.5，門檻【假設】）
 *
 *   node tools/playtest-recorder/hunt-mix.mjs <錄音資料夾> [--json]
 *
 * 要用 --lab-bot hunt（或任何有被追殺的錄音）錄；時間軸每幀有 hm（none｜escape｜hide，照 audio.js huntUpdate 的判法）、sm（起步踩不踩得上）、
 * lg（衛兵總線峰值 gp，要分接點）。事件 cue:hunt_call＝喊聲。
 *
 * 1. 逃：鼓的起音密度（每秒幾拍）。起音＝150 Hz 以上的 1 毫秒包絡，相對前 30 毫秒最小值上升 ≥ 6 dB、彼此至少隔 25 毫秒。
 *    從喊聲（沒有喊聲時用進入「逃」的那一刻）起 2 秒內密度要到「逃的時候的穩定值」的九成；之後 5 秒內每秒密度和穩定值差不超過一成。
 * 2. 躲：1200 Hz 以上的平均能量，躲比逃低 ≥ 10 dB（各自去掉切換後 1 秒；只算衛兵總線比總輸出低 15 dB 以上的幀＝只有鼓）。
 * 3. 躲：追兵在 2～4 公尺時，每 0.25 秒衛兵總線峰值，比同一段鼓的峰值（總輸出、衛兵低 10 dB 以上的段）高 ≥ 3 dB。
 * 4. 躲：每段連續的「踩得上」（sm 為真）時段裡最響的起音，比每段其他時段裡最響的起音高 ≥ 4 dB（同樣只算只有鼓的時候；所有起音的平均差另列）。
 * 起音偵測在每秒 25 拍左右會漏掉一部分（兩拍間隔 40 毫秒、鼓的尾音沒退完），密度是下限。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const med = (a) => { a = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const db = (p) => 10 * Math.log10(Math.max(p, 1e-14));

function readWav(f) {
  const b = fs.readFileSync(f); let p = 12, ch = 2, sr = 44100, data = null;
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4); if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); sr = b.readUInt32LE(p + 12); } if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; } p += 8 + sz + (sz & 1); }
  const n = Math.floor(data.length / (2 * ch)), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch / 32768; }
  return { sr, x };
}
/** 一階高通（RC），回傳新陣列 */
function hp(x, sr, fc) { const a = 1 / (1 + 2 * Math.PI * fc / sr), y = new Float32Array(x.length); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; } return y; }

export function huntMix(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const J = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const TL = (J.timeline || J).filter((s) => s.hm != null), EV = J.events || [];
  if (!TL.length) return null;
  const { sr, x } = readWav(path.join(dir, meta.audio.file || 'audio.wav'));
  const T0 = meta.audio.startAudioTime;
  const at = (t) => { let lo = 0, hi = TL.length - 1; if (t < TL[0].t) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TL[m].t <= t) lo = m; else hi = m; } return TL[lo]; };
  // 模式區段與切換點
  const sw = []; for (let i = 1; i < TL.length; i++) if (TL[i].hm !== TL[i - 1].hm) sw.push({ t: TL[i].t, to: TL[i].hm });
  const settled = (t, s = 1) => !sw.some((w) => t >= w.t && t < w.t + s);
  // 1 毫秒包絡（150 Hz 以上）
  const H = Math.round(sr / 1000), y = hp(hp(x, sr, 150), sr, 150), env = new Float32Array(Math.floor(y.length / H));
  for (let k = 0; k < env.length; k++) { let m = 0; for (let i = k * H; i < k * H + H; i++) { const v = Math.abs(y[i]); if (v > m) m = v; } env[k] = m; }
  const onsets = []; let last = -1e9;
  for (let k = 30; k < env.length; k++) {
    let mn = 1e9; for (let j = k - 30; j < k - 2; j++) if (env[j] < mn) mn = env[j];
    if (env[k] > 1e-4 && env[k] > mn * 2 && env[k] >= env[k - 1] && k - last >= 25) {
      let pk = env[k]; for (let j = k; j < Math.min(env.length, k + 20); j++) if (env[j] > pk) pk = env[j];
      onsets.push({ t: T0 + k / 1000, pk: 20 * Math.log10(pk) }); last = k;
    }
  }
  // 1. 逃：每秒起音數
  // 起點：每次從 none 進入 escape；前 1 秒內有喊聲（hunt_call）就用喊聲的時間（試驗場開場直接追殺，沒有喊聲）
  const callT = EV.filter((e) => e.type === 'cue' && e.name === 'hunt_call').map((e) => (e.at != null ? e.at : e.t));
  const calls = sw.filter((w, i) => w.to === 'escape' && (i === 0 ? TL[0].hm : sw[i - 1].to) === 'none').map((w) => { const c = callT.find((x) => x >= w.t - 1 && x <= w.t + 0.1); return c != null ? c : w.t; });
  const rate = (a, b) => onsets.filter((o) => o.t >= a && o.t < b).length / (b - a);
  const escSec = [];
  for (let t = Math.ceil(TL[0].t); t < TL[TL.length - 1].t - 1; t++) { const s0 = at(t), s1 = at(t + 1); if (s0 && s1 && s0.hm === 'escape' && s1.hm === 'escape' && settled(t, 2)) escSec.push(rate(t, t + 1)); }
  const steady = med(escSec);
  const callRows = [];
  for (const c of calls) {
    const s = at(c + 0.3); if (!s || s.hm !== 'escape') continue;
    const per = []; for (let k = 0; k < 7; k++) { const ss = at(c + k + 1); if (!ss || ss.hm !== 'escape') break; per.push(rate(c + k, c + k + 1)); }
    if (per.length < 3) continue;
    const reach = per.findIndex((v) => steady && v >= steady * 0.9);
    const after = per.slice(2, 7), dev = steady ? Math.max(...after.map((v) => Math.abs(v - steady) / steady)) : null;
    callRows.push({ t: +c.toFixed(2), perSec: per.map((v) => +v.toFixed(1)), reachSec: reach < 0 ? null : reach + 1, maxDev: dev == null ? null : +dev.toFixed(2), secs: after.length });
  }
  // 衛兵（腳步、人聲）當下比總輸出低 15 dB 以上的幀才算「只有鼓」（2、4 用；沒有分接點時全算）
  const quiet = (s) => !s.lg || s.lg.gp == null || s.lg.mp == null || s.lg.gp < s.lg.mp - 15;
  // 2. 躲 vs 逃：1200 Hz 以上平均功率
  const yh = hp(hp(hp(x, sr, 1200), sr, 1200), sr, 1200);
  const band = { escape: [0, 0], hide: [0, 0] }, blk = Math.round(sr * 0.05);
  for (let i = 0; i + blk <= yh.length; i += blk) {
    const t = T0 + i / sr, s = at(t); if (!s || !band[s.hm] || !settled(t) || !quiet(s)) continue;
    let q = 0; for (let k = i; k < i + blk; k++) q += yh[k] * yh[k]; band[s.hm][0] += q / blk; band[s.hm][1]++;
  }
  const hiEsc = band.escape[1] ? db(band.escape[0] / band.escape[1]) : null, hiHide = band.hide[1] ? db(band.hide[0] / band.hide[1]) : null;
  // 3. 躲：追兵 2～4 公尺的腳步 vs 鼓
  const fr = TL.filter((s) => s.hm === 'hide' && s.lg && s.lg.gp != null && settled(s.t));
  const bins = new Map(); for (const s of fr) { const k = Math.floor(s.t / 0.25), o = bins.get(k) || { gp: -140, mp: -140, d: s.gd }; o.gp = Math.max(o.gp, s.lg.gp); o.mp = Math.max(o.mp, s.lg.mp); bins.set(k, o); }
  const bv = [...bins.values()];
  const drumHide = med(bv.filter((b) => b.gp < b.mp - 10).map((b) => b.mp));
  const step3 = med(bv.filter((b) => b.d != null && +b.d >= 2 && +b.d <= 4 && b.gp > -90).map((b) => b.gp));
  // 4. 躲：踩得上的起音 vs 其他
  const hideOn = onsets.filter((o) => { const s = at(o.t), s2 = at(o.t + 0.03); return s && s2 && s.hm === 'hide' && settled(o.t) && quiet(s) && quiet(s2); });
  // 「踩得上」的時段很寬，裡面也有小拍；改成每一段連續的 sm 真／假時段各取最響的那個起音再比（＝踩得上的那一拍 vs 其他拍裡最響的）
  const runs = []; let cur = null;
  for (const o of hideOn) { const v = at(o.t).sm; if (v == null) continue; if (!cur || cur.v !== v || o.t - cur.end > 0.5) { cur = { v, pk: o.pk, end: o.t }; runs.push(cur); } else { cur.pk = Math.max(cur.pk, o.pk); cur.end = o.t; } }
  const smOn = runs.filter((r) => r.v).map((r) => r.pk), smOff = runs.filter((r) => !r.v).map((r) => r.pk);
  const allOn = hideOn.filter((o) => at(o.t).sm === true).map((o) => o.pk), allOff = hideOn.filter((o) => at(o.t).sm === false).map((o) => o.pk);
  const secHide = TL.filter((s) => s.hm === 'hide').length ? r1(bv.length * 0.25) : 0;
  return {
    calls: callRows, escapeSteadyPerSec: steady == null ? null : +steady.toFixed(1), escapeSecs: escSec.length,
    hiEscDb: r1(hiEsc), hiHideDb: r1(hiHide), hiDiffDb: hiEsc != null && hiHide != null ? r1(hiEsc - hiHide) : null,
    hideSec: secHide, drumHideDb: r1(drumHide), step3Db: r1(step3), stepOverDrumDb: drumHide != null && step3 != null ? r1(step3 - drumHide) : null,
    maskedPkDb: r1(med(smOn)), otherPkDb: r1(med(smOff)), maskedN: smOn.length, otherN: smOff.length, maskedOverDb: smOn.length && smOff.length ? r1(med(smOn) - med(smOff)) : null, allOverDb: allOn.length && allOff.length ? r1(med(allOn) - med(allOff)) : null
  };
}

function main(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 1; }
  const r = huntMix(dir);
  if (!r) { console.log('時間軸沒有 hm（要用新版設定檔錄）'); return 1; }
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return 0; }
  const ok = (b) => (b == null ? '—' : b ? '過' : '不過');
  const c2 = r.calls.filter((c) => c.reachSec != null && c.reachSec <= 2).length, cS = r.calls.filter((c) => c.maxDev != null && c.maxDev <= 0.1).length;
  console.log(`1 逃：穩定密度 每秒 ${r.escapeSteadyPerSec} 個起音（${r.escapeSecs} 秒）；開始逃 ${r.calls.length} 次，2 秒內到九成 ${c2} 次、之後 5 秒變化 ≤ 一成 ${cS} 次`);
  for (const c of r.calls) console.log(`   ${c.t} 秒起：每秒 ${c.perSec.join('、')}；到九成 ${c.reachSec ?? '沒到'} 秒；第 3～${c.secs + 2} 秒最大偏差 ${c.maxDev}`);
  console.log(`2 躲：1200 Hz 以上 逃 ${r.hiEscDb}、躲 ${r.hiHideDb} dB，差 ${r.hiDiffDb}（要 ≥ 10）→ ${ok(r.hiDiffDb == null ? null : r.hiDiffDb >= 10)}`);
  console.log(`3 躲：追兵 2～4 公尺腳步 ${r.step3Db}、同段鼓峰值 ${r.drumHideDb}，差 ${r.stepOverDrumDb}（要 ≥ 3）→ ${ok(r.stepOverDrumDb == null ? null : r.stepOverDrumDb >= 3)}（躲 ${r.hideSec} 秒）`);
  console.log(`4 躲：踩得上時段最響的起音 ${r.maskedPkDb}（${r.maskedN} 段）、其他時段最響 ${r.otherPkDb}（${r.otherN} 段），差 ${r.maskedOverDb}（要 ≥ 4；所有起音平均比 ${r.allOverDb}）→ ${ok(r.maskedOverDb == null ? null : r.maskedOverDb >= 4)}`);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
