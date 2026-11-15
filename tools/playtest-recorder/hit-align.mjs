#!/usr/bin/env node
/* 最響一擊的時刻對不對得上（docs/design/2026-11-12-free-hit-schedule.md 第 11.2 節第 9 條，11/14）
 *
 *   node tools/playtest-recorder/hit-align.mjs <錄音資料夾> [--tol 5] [--json] [--list]
 *
 * 規則的「一擊」時刻：
 *   事件裡有 hit（HIT_MODE 'free' 或規則接上 game.hit 之後）→ 用 hit 事件的時刻（at，沒有就用 t）。
 *   沒有 hit 事件（現行 'cycle'）→ 時間軸 cyc 加一的那一幀，取新一圈的起點 cs（＝hit-baseline.mjs 的定義）；
 *     警戒中（alert）的交接不算一擊（掩護窗改跟低音走）。
 * 錄音裡的「那一擊」：
 *   1 毫秒一格的 RMS 包絡（2 毫秒窗）；在規則時刻 ±15 毫秒內，找「比自己前 4～12 毫秒最大值高 ≥ 6 dB、而且 4 毫秒內到得了視窗最響值 6 dB 以內」的第一格當起音（＝最響那一擊的起音，不被搶在前面的腳步騙走）（包絡下限 −90 dB，免得靜音的凹陷被當成上升），
 *   起音後 30 毫秒峰值比起音前 30～10 毫秒的平均高多少 dB 記為 rise。
 *   過：|起音 − 規則時刻| ≤ tol 毫秒，而且 rise ≥ 6 dB（真的有一擊，不是背景裡的小起伏）。
 * 錄音缺口：一擊 ±20 毫秒內有 ≥ 64 格連續的 0（擷取掉幀補的）就不計，另外列出；本機無頭錄音每秒約 4 個缺口，大約一成五的一擊會被排除；算進去的少於 10 擊就該重錄。
 * 時間基準：時間軸的遊戲時間就是音訊時鐘（錄音起點 meta.audio.startAudioTime），和 hunt-mix.mjs 的 4b 相同。
 * 量法限制：只抓「有沒有一個明顯起音落在 ±tol 內」，不分辨那個起音是不是最響一擊本身（同一刻別的層也會落拍；
 *   現行版一擊和循環開頭的各層拍本來就同時）。free 版若一擊和鼓拍錯開，要看 rise 和 offset 分布判斷。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readWav(f) {
  const b = fs.readFileSync(f); let p = 12, ch = 2, sr = 44100, data = null;
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4); if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); sr = b.readUInt32LE(p + 12); } if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; } p += 8 + sz + (sz & 1); }
  const n = Math.floor(data.length / (2 * ch)), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch / 32768; }
  return { sr, x };
}
const med = (a) => { a = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const SEARCH = 15;   // 起音只在規則時刻 ±15 毫秒內找（比 tol 寬，才看得出偏多少）
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function ruleHits(TL, EV) {
  const ev = (EV || []).filter((e) => e.type === 'hit' || (e.type === 'cue' && e.name === 'hit'));
  if (ev.length) return { source: 'hit 事件', hits: ev.map((e) => ({ t: e.at != null ? e.at : e.t, id: e.id || null })) };
  const hits = [];
  for (let i = 1; i < TL.length; i++) {
    const a = TL[i - 1], b = TL[i];
    if (b.phase !== 'play' || a.phase !== 'play' || b.cyc == null || a.cyc == null || b.cyc === a.cyc) continue;
    if (b.alert || a.alert) continue;
    if (b.cs == null) continue;
    hits.push({ t: b.cs, id: 'c' + b.cyc });
  }
  return { source: '循環交接（cyc 加一，取 cs）', hits };
}

export function hitAlign(dir, opts = {}) {
  const tol = opts.tol != null ? opts.tol : 5, shift = (opts.shiftMs || 0) / 1000;   // shiftMs：反向對照用，故意把規則時刻挪開
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const J = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')), TL = J.timeline || J;
  const { source, hits } = ruleHits(TL, J.events || []);
  const mode = ((meta.prepared || {}).rulesT || {}).HIT_MODE;
  if (mode === 'free' && source !== 'hit 事件') throw new Error("HIT_MODE 是 'free' 但時間軸沒有 hit 事件：不能退回用循環交接，先讓錄音工具收到規則的 hit 事件");
  const { sr, x } = readWav(path.join(dir, meta.audio.file || 'audio.wav')), T0 = meta.audio.startAudioTime;
  const ms = sr / 1000, W = Math.round(2 * ms);
  const env = (i) => { i = Math.round(i); let s = 0; const a = Math.max(0, i - W), z = Math.min(x.length, i); for (let k = a; k < z; k++) s += x[k] * x[k]; return Math.sqrt(s / Math.max(1, z - a)); };
  const db = (v) => 20 * Math.log10(v + 1e-9);
  let rows = [];
  for (const h of hits) {
    const c = Math.round((h.t + shift - T0) * sr);
    if (c - 80 * ms < 0 || c + 80 * ms >= x.length) continue;
    // 錄音缺口（擷取掉幀時補的整段 0，通常 128 格＝2.9 毫秒）落在 −20～+20 毫秒內：那一擊的起音可能被切掉，不計
    let z = 0, gap = false; for (let i = Math.round(c - 20 * ms); i < c + 20 * ms; i++) { if (x[i] === 0) { if (++z >= 64) { gap = true; break; } } else z = 0; }
    if (gap) { rows.push({ id: h.id, t: +h.t.toFixed(4), gap: true }); continue; }
    let best = -1e9, at = null;
    const E = []; for (let d = -45; d <= 30; d++) E[d + 45] = Math.max(-90, db(env(c + d * ms)));
    // 候選起音：比自己前 4～12 毫秒最大值高 ≥ 6 dB；取「之後 4 毫秒內到得了視窗最響值 6 dB 以內」的第一個（＝最響那一擊的起音，
    //   不是剛好搶在它前面的腳步或別層）；都沒有就退回上升最多的那一格。
    let P = -90; for (let d = -SEARCH; d <= SEARCH + 8; d++) P = Math.max(P, E[d + 45]);
    const score = (d) => { let ref = -90; for (let k = d - 12; k <= d - 4; k++) ref = Math.max(ref, E[k + 45]); return E[d + 45] - ref; };
    for (let d = -SEARCH; d <= SEARCH; d++) { const s = score(d); let q = -90; for (let k = d; k <= d + 4; k++) q = Math.max(q, E[k + 45]); if (s >= 6 && q >= P - 6) { best = s; at = d; break; } }
    if (at == null) for (let d = -SEARCH; d <= SEARCH; d++) { const s = score(d); if (s > best) { best = s; at = d; } }
    // 起音精修到取樣：起音那格內 |x| 第一次超過該格峰值一半
    const i0 = Math.round(c + (at - 2) * ms), i1 = Math.round(c + (at + 1) * ms);
    let pk = 0; for (let i = i0; i < i1; i++) pk = Math.max(pk, Math.abs(x[i]));
    let fine = i1; for (let i = i0; i < i1; i++) if (Math.abs(x[i]) >= pk / 2) { fine = i; break; }
    const off = (fine - c) / ms;
    let base = 0, n = 0; for (let i = Math.round(fine - 30 * ms); i < fine - 10 * ms; i++) { base += x[i] * x[i]; n++; }
    let post = 0; for (let i = fine; i < fine + 30 * ms; i++) post = Math.max(post, Math.abs(x[i]));
    const rise = db(post) - db(Math.sqrt(base / n) * Math.SQRT2);
    rows.push({ id: h.id, t: +h.t.toFixed(4), offMs: r1(off), jumpDb: r1(best), riseDb: r1(rise), ok: Math.abs(off) <= tol && best >= 6 && rise >= 6 });
  }
  const gaps = rows.filter((r) => r.gap), all = rows; rows = rows.filter((r) => !r.gap);
  const offs = rows.map((r) => r.offMs), pass = rows.filter((r) => r.ok).length;
  return { source, tolMs: tol, n: rows.length, gapSkipped: gaps.map((r) => r.id), pass, passPct: rows.length ? r1(100 * pass / rows.length) : null,
    offMedMs: r1(med(offs)), offMinMs: offs.length ? Math.min(...offs) : null, offMaxMs: offs.length ? Math.max(...offs) : null,
    riseMedDb: r1(med(rows.map((r) => r.riseDb))), rows: all };
}

function main(argv) {
  const ti = argv.indexOf('--tol');
  const dir = argv.find((a, i) => !a.startsWith('--') && (ti < 0 || i !== ti + 1));
  if (!dir) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 1; }
  const r = hitAlign(dir, { tol: ti >= 0 ? +argv[ti + 1] : 5 });
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); return r.n && r.pass === r.n ? 0 : 2; }
  console.log(`一擊來源：${r.source}；${r.n} 擊`);
  if (r.n < 10) console.log(`算進去的只有 ${r.n} 擊（要 ≥ 10），請重錄或錄長一點`);
  console.log(`±${r.tolMs} 毫秒內有起音且上升 ≥ 6 dB：${r.pass}／${r.n}（${r.passPct}%）→ ${r.n >= 10 && r.pass === r.n ? '過' : '不過'}`);
  console.log(`偏差（錄音起音 − 規則時刻）中位 ${r.offMedMs} 毫秒，範圍 ${r.offMinMs}～${r.offMaxMs}；上升中位 ${r.riseMedDb} dB`);
  if (r.gapSkipped.length) console.log(`錄音缺口落在一擊 ±20 毫秒內、不計：${r.gapSkipped.join('、')}`);
  const bad = r.rows.filter((x) => !x.ok && !x.gap);
  for (const x of (argv.includes('--list') ? r.rows.filter((y) => !y.gap) : bad)) console.log(`  ${x.ok ? '　' : '✗'} ${x.id} ${x.t} 秒：偏差 ${x.offMs} 毫秒、上升 ${x.riseDb} dB`);
  return r.n >= 10 && r.pass === r.n ? 0 : 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
