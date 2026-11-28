#!/usr/bin/env node
/* 比較幾段錄音「巡邏段」的各頻段響度（查「某個提交讓聲音變了沒」用）
 *
 *   node tools/playtest-recorder/compare-bands.mjs <錄音資料夾1> <錄音資料夾2> ... [--json]
 *
 * 巡邏段＝phase = play、沒有警戒（alert）、沒有追殺（hunted），而且離掩護窗（盲區）至少 [前 0.3 秒, 後 0.8 秒]
 * （重合擊與餘韻、盲區的靜音都排除）。音訊斷塊補 0 的地方也排除。
 * 每段錄音：各頻段平均功率（4096 點 FFT、漢寧窗、hop 2048），另分區（第 1～4 區）列；第一個資料夾當基準，其他列差值。
 * 同版本的兩段錄音本身會差（程式玩家走法、在哪一區待多久不同），所以要同版本錄兩段以上看「本來就會差多少」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BANDS = [[20, 250], [250, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
const db = (p) => 10 * Math.log10(Math.max(p, 1e-12));

function readWav(f) {
  const b = fs.readFileSync(f);
  let p = 12, ch = 2, sr = 44100, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); sr = b.readUInt32LE(p + 12); }
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  const n = Math.floor(data.length / (2 * ch)), mono = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); mono[i] = s / ch / 32768; }
  return { sr, n, mono };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** 一段錄音的巡邏段各頻段平均功率（dB），全部與分區。 */
export function patrolBands(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const TLd = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const TL = TLd.timeline || TLd;
  const wav = readWav(path.join(dir, meta.audio.file || 'audio.wav'));
  const T0 = meta.audio.startAudioTime, SR = wav.sr;
  const gaps = (meta.audio.gapList || []).map(([t, n]) => [t, t + n / SR]);
  // 掩護窗（規則記錄的實際區段）
  const wins = []; const seen = new Set();
  for (const s of TL) if (s.bf != null && s.bt != null && !seen.has(s.bf)) { seen.add(s.bf); wins.push([s.bf, s.bt]); }
  // 每個取樣幀的狀態，區間 [t_i, t_{i+1})
  const stateAt = (t) => { let lo = 0, hi = TL.length - 1; if (t < TL[0].t) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TL[m].t <= t) lo = m; else hi = m; } return TL[lo]; };
  const N = 4096, H = 2048, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const acc = { all: { p: BANDS.map(() => 0), n: 0 } };
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i + N <= wav.n; i += H) {
    const a = T0 + i / SR, b = T0 + (i + N) / SR, mid = (a + b) / 2;
    if (gaps.some(([g0, g1]) => g0 < b && g1 > a)) continue;
    if (wins.some(([w0, w1]) => a < w1 + 0.8 && b > w0 - 0.3)) continue;
    const s0 = stateAt(a), s1 = stateAt(b);
    if (!s0 || !s1) continue;
    const ok = (s) => s.phase === 'play' && !s.alert && !s.hunted;
    if (!ok(s0) || !ok(s1) || s0.zone !== s1.zone) continue;
    for (let k = 0; k < N; k++) { re[k] = wav.mono[i + k] * win[k]; im[k] = 0; }
    fft(re, im);
    const z = 'z' + s0.zone;
    for (const key of ['all', z]) {
      const A = acc[key] || (acc[key] = { p: BANDS.map(() => 0), n: 0 });
      BANDS.forEach(([f0, f1], bi) => { const k0 = Math.ceil(f0 * N / SR), k1 = Math.min(N / 2, Math.floor(f1 * N / SR)); let s = 0; for (let k = k0; k <= k1; k++) s += re[k] * re[k] + im[k] * im[k]; A.p[bi] += s / (N * N); });
      A.n++;
    }
  }
  // 各區巡邏段裡的音效（cue）次數：解釋差異是不是來自走法（屏息、喘氣、腳步次數不同）
  const cues = {};
  for (const e of (TLd.events || [])) {
    if (e.type !== 'cue') continue;
    const t = e.at != null ? e.at : e.t, st = stateAt(t);
    if (!st || st.phase !== 'play' || st.alert || st.hunted) continue;
    if (wins.some(([w0, w1]) => t > w0 - 0.3 && t < w1 + 0.8)) continue;
    const z = 'z' + st.zone; (cues[z] || (cues[z] = {}))[e.name] = (cues[z][e.name] || 0) + 1;
  }
  const out = {};
  for (const [k, A] of Object.entries(acc)) out[k] = { sec: +(A.n * H / SR).toFixed(1), db: A.n ? A.p.map(v => +db(v / A.n).toFixed(2)) : null };
  return { dir, out, cues };
}

function main(argv) {
  const dirs = argv.filter(a => !a.startsWith('--'));
  if (!dirs.length) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 1; }
  const rs = dirs.map(patrolBands);
  if (argv.includes('--json')) { console.log(JSON.stringify(rs, null, 1)); return 0; }
  const head = '| 錄音 | 區 | 秒 | ' + BANDS.map(([a, b]) => `${a < 1000 ? a : a / 1000 + 'k'}～${b < 1000 ? b : b / 1000 + 'k'}`).join(' | ') + ' |';
  console.log(head); console.log('|' + '---|'.repeat(3 + BANDS.length));
  const keys = [...new Set(rs.flatMap(r => Object.keys(r.out)))].sort();
  for (const k of keys) for (const r of rs) {
    const v = r.out[k], base = rs[0].out[k];
    if (!v || !v.db) continue;
    const cells = v.db.map((d, i) => (r === rs[0] || !base || !base.db) ? d.toFixed(1) : `${d.toFixed(1)}（${(d - base.db[i] >= 0 ? '+' : '') + (d - base.db[i]).toFixed(1)}）`);
    console.log(`| ${path.basename(r.dir)} | ${k} | ${v.sec} | ${cells.join(' | ')} |`);
  }
  console.log('');
  console.log('各區巡邏段的音效次數（排除掩護窗前後）：');
  for (const r of rs) console.log(`- ${path.basename(r.dir)}：` + Object.entries(r.cues).sort().map(([z, c]) => z + ' ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([n, k]) => n + '×' + k).join('、')).join('；'));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
