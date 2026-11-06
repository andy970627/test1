#!/usr/bin/env node
/* playtest-recorder：分析一次錄製（只用 Node 標準函式庫＋ffmpeg；Playwright 若可用就順便把 SVG 圖轉 PNG）
 *
 *   node tools/playtest-recorder/analyze.mjs <錄製輸出資料夾>
 *
 * 讀 audio.wav＋timeline.json（＋設定檔的 intervals／expectedBeats），產生：
 *   spectrogram.png          ffmpeg showspectrumpic（含座標軸）
 *   spectrogram-marked.png   無座標軸版本，疊上盲區（藍）、警戒（橘）、追殺（紅）色帶與規則拍點刻度
 *   envelope.svg / .png      音量包絡（50 ms RMS，dBFS），疊上同樣的區段、偵測到的起音、規則拍點
 *   analysis.json            全部數字
 *   report.md                數字、通過／不通過、圖檔與 mp4／wav 路徑
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const dir = path.resolve(process.argv[2] || '.');
const J = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
const meta = J.meta, TL = J.timeline || [], EV = J.events || [];
let profile = null;
if (meta.profilePath) {
  const pp = path.resolve(dir, meta.profilePath);
  if (fs.existsSync(pp)) profile = (await import(pathToFileURL(pp).href)).default;
}
const TH = Object.assign({
  blindDipMedianDb: 10,   // 盲區中位壓低量至少幾 dB
  blindDipMinDb: 6,       // 每一次盲區至少幾 dB
  onsetMedianMs: 15,      // 起音誤差中位數上限
  onsetHitRate: 0.8,      // 顯著拍點（w ≥ 0.5）在 ±30 ms 內找到起音的比例下限
  dropRate: 0.1,          // 丟拍比例上限（±40 ms 內找不到起音）
  silenceSec: 0.75,       // 低於 −60 dBFS 連續多久算「完全無聲」
  clipSamples: 0          // 允許的削峰樣本數
}, (profile && profile.analysis && profile.analysis.thresholds) || {});
const log = (...a) => console.log('[analyze]', ...a);

// ---------- 讀 WAV ----------
function readWav(f) {
  const b = fs.readFileSync(f);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  const n = Math.floor(data.length / (2 * fmt.ch));
  const mono = new Float32Array(n);
  let peak = 0, clip = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const v = data.readInt16LE((i * fmt.ch + c) * 2);
      if (v >= 32766 || v <= -32767) clip++;
      const a = Math.abs(v); if (a > peak) peak = a;
      s += v;
    }
    mono[i] = s / fmt.ch / 32768;
  }
  return { sr: fmt.sr, ch: fmt.ch, n, mono, peak: peak / 32768, clip };
}
const wav = readWav(path.join(dir, meta.audio.file || 'audio.wav'));
const SR = wav.sr, T0 = meta.audio.startAudioTime, DUR = wav.n / SR;
const tOf = (i) => T0 + i / SR, iOf = (t) => Math.round((t - T0) * SR);
const gaps = (meta.audio.gapList || []).map(([t, n]) => [t, t + n / SR]);
const inGap = (a, b) => gaps.some(([g0, g1]) => g0 < b && g1 > a);
const gapMask = new Uint8Array(wav.n);
for (const [g0, g1] of gaps) for (let i = Math.max(0, iOf(g0)); i < Math.min(wav.n, iOf(g1)); i++) gapMask[i] = 1;
const gapFrac = (a, b) => { const i0 = Math.max(0, iOf(a)), i1 = Math.min(wav.n, iOf(b)); let k = 0; for (let i = i0; i < i1; i++) k += gapMask[i]; return i1 > i0 ? k / (i1 - i0) : 1; };
log('音訊', DUR.toFixed(1), '秒，起點音訊時間', T0.toFixed(3));

// ---------- 能量工具 ----------
const db = (p) => 10 * Math.log10(Math.max(p, 1e-12));
function powerIn(a, b) {        // a、b：音訊時間；回傳平均功率（略過音訊斷塊補 0 的樣本）
  let i0 = Math.max(0, iOf(a)), i1 = Math.min(wav.n, iOf(b));
  if (i1 <= i0) return null;
  let s = 0, n = 0; for (let i = i0; i < i1; i++) if (!gapMask[i]) { s += wav.mono[i] * wav.mono[i]; n++; }
  return n ? s / n : null;
}
// 50 ms RMS 包絡（hop 25 ms）
const ENV_HOP = 0.025, ENV_WIN = 0.05;
const env = [];
for (let t = 0; t + ENV_WIN <= DUR; t += ENV_HOP) env.push({ t: T0 + t + ENV_WIN / 2, db: db(powerIn(T0 + t, T0 + t + ENV_WIN)) });

// ---------- FFT ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const BANDS = [['低頻 20–250 Hz', 20, 250], ['中頻 250–2000 Hz', 250, 2000], ['高頻 2–10 kHz', 2000, 10000]];
function bandsOver(intervals) {  // intervals：[[a,b]]，回傳各頻帶平均功率（dB）
  const N = 4096, H = 2048, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const acc = BANDS.map(() => 0); let frames = 0;
  for (const [a, b] of intervals) {
    for (let i = Math.max(0, iOf(a)); i + N <= Math.min(wav.n, iOf(b)); i += H) {
      if (gapFrac(tOf(i), tOf(i + N)) > 0.02) continue;
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let k = 0; k < N; k++) re[k] = wav.mono[i + k] * win[k];
      fft(re, im);
      BANDS.forEach(([, f0, f1], bi) => {
        const k0 = Math.ceil(f0 * N / SR), k1 = Math.min(N / 2, Math.floor(f1 * N / SR));
        let s = 0; for (let k = k0; k <= k1; k++) s += re[k] * re[k] + im[k] * im[k];
        acc[bi] += s;
      });
      frames++;
    }
  }
  if (!frames) return null;
  return { frames, db: acc.map(v => +db(v / frames / (N * N)).toFixed(1)) };
}

// ---------- 起音偵測 ----------
// 預加重（強調起音的高頻）→ 128 樣本（≈2.9 ms）一格的對數能量 → 比前 20 ms 的最低值高 6 dB 以上、
// 且是局部最大上升 → 起音時間取「開始上升」的那一格（比上升前底值高 1.5 dB 的第一格）。不應期 25 ms。
function detectOnsets() {
  const F = 128, n = Math.floor(wav.n / F), e = new Float64Array(n);
  let prev = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * F; i < (f + 1) * F; i++) { const y = wav.mono[i] - 0.97 * prev; prev = wav.mono[i]; s += y * y; }
    e[f] = db(s / F);
  }
  const back = Math.round(0.02 * SR / F), refr = Math.round(0.025 * SR / F);
  const out = [];
  let last = -1e9;
  for (let f = back + 1; f < n - 1; f++) {
    let floor = Infinity; for (let k = f - back; k < f; k++) if (e[k] < floor) floor = e[k];
    const rise = e[f] - floor;
    if (rise < 6 || e[f] < -60) continue;
    if (!(e[f] >= e[f - 1] && e[f] >= e[f + 1])) continue;
    if (f - last < refr) continue;
    let s = f; while (s > f - back && e[s - 1] > floor + 1.5) s--;
    const t = tOf(s * F);
    if (inGap(t - 0.01, t + 0.01)) continue;   // 無頭環境的音訊斷塊（補 0）會造成假起音
    out.push({ t, rise: +rise.toFixed(1) });
    last = f;
  }
  return out;
}
const onsets = detectOnsets();
log('偵測到起音', onsets.length);
const nearest = (arr, t) => {        // arr 已排序（{t}）
  let lo = 0, hi = arr.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m; else hi = m; }
  return Math.abs(arr[lo].t - t) <= Math.abs(arr[hi].t - t) ? arr[lo] : arr[hi];
};

// ---------- 區段 ----------
function boolIntervals(key, filter) {
  const out = []; let cur = null;
  for (const s of TL) {
    const on = !!s[key] && (!filter || filter(s));
    if (on && !cur) cur = [s.t, s.t];
    else if (on) cur[1] = s.t;
    else if (cur) { cur[1] = s.t; out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
let IV = profile && profile.intervals ? profile.intervals(TL, meta, EV) : null;
IV = Object.assign({ blind: boolIntervals('blind'), alert: boolIntervals('alert'), hunted: boolIntervals('hunted') }, IV || {});
const clipIV = (arr) => arr.map(([a, b]) => [Math.max(a, T0), Math.min(b, T0 + DUR)]).filter(([a, b]) => b > a);
for (const k of Object.keys(IV)) IV[k] = clipIV(IV[k]);
const expected = profile && profile.expectedBeats ? profile.expectedBeats(TL, meta).filter(b => b.t > T0 + 0.05 && b.t < T0 + DUR - 0.05) : [];
const starts = (J.starts || []).filter(t => t >= T0 && t <= T0 + DUR).map(t => ({ t })).sort((a, b) => a.t - b.t);

// ---------- 檢查 ----------
const checks = [];
const add = (id, name, pass, value, detail) => checks.push({ id, name, pass, value, detail });
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const r1 = (v) => v == null ? null : Math.round(v * 10) / 10;

// 1. 盲區壓低量
const dips = [];
const expectedEarly = profile && profile.expectedBeats ? profile.expectedBeats(TL, meta) : [];
for (const [a, b] of IV.blind) {
  if (a - 1.0 < T0 || b + 1.0 > T0 + DUR || gapFrac(a - 1.0, b + 1.0) > 0.2) continue;
  const inside = powerIn(a + 0.1, b - 0.03), before = powerIn(a - 1.0, a - 0.15), after = powerIn(b + 0.25, b + 1.0);
  if (inside == null || before == null || after == null) continue;
  const ref = (db(before) + db(after)) / 2;
  // 盲區內（含前 0.3 秒，殘響會拖進來）還在響的規則拍點與 cue，幫助判斷「為什麼不夠空」
  const inBeats = expectedEarly.filter(x => x.t >= a - 0.3 && x.t < b).map(x => x.kind === 'bass' ? '低音拍 ' + (x.t - a >= 0 ? '+' : '') + (x.t - a).toFixed(2) + 's' : null).filter(Boolean);
  const inCues = EV.filter(e => e.type === 'cue' && (e.at || e.t) >= a - 0.3 && (e.at || e.t) < b && !/^(pre_?blind|blind)$/i.test(e.name)).map(e => e.name + ' ' + ((e.at || e.t) - a >= 0 ? '+' : '') + ((e.at || e.t) - a).toFixed(2) + 's');
  dips.push({ t: +a.toFixed(3), insideDb: r1(db(inside)), beforeDb: r1(db(before)), afterDb: r1(db(after)), dipDb: r1(ref - db(inside)), sounding: [...inBeats, ...inCues] });
}
{
  const d = dips.map(x => x.dipDb), md = median(d), mn = d.length ? Math.min(...d) : null;
  add('blind', '盲區時整體音量比前後低', d.length ? md >= TH.blindDipMedianDb && mn >= TH.blindDipMinDb : null,
    d.length ? `中位 ${md} dB、最小 ${mn} dB（${d.length} 次盲區）` : '沒有可量的盲區',
    `門檻：中位 ≥ ${TH.blindDipMedianDb} dB 且每次 ≥ ${TH.blindDipMinDb} dB。盲區內取 [+0.10, 結束−0.03] 秒，前後取盲區前 1.0～0.15 秒與結束後 0.25～1.0 秒的平均。`);
}

// 2. 起音與規則拍點
const beatStats = {};
function matchBeats(list, label) {
  const errs = [], hits30 = [], miss = [];
  for (const b of list) {
    if (inGap(b.t - 0.05, b.t + 0.05)) continue;
    const o = nearest(onsets, b.t);
    const e = o ? o.t - b.t : null;
    if (e != null && Math.abs(e) <= 0.04) { errs.push(e * 1000); hits30.push(Math.abs(e) <= 0.03); }
    else miss.push(+b.t.toFixed(3));
  }
  const abs = errs.map(Math.abs);
  return { label, n: errs.length + miss.length, matched: errs.length, medianAbsMs: r1(median(abs)), p90AbsMs: r1(pct(abs, 0.9)),
    medianSignedMs: r1(median(errs)), hitRate30: errs.length + miss.length ? +(hits30.filter(Boolean).length / (errs.length + miss.length)).toFixed(3) : null,
    missed: miss.length, missedTimes: miss.slice(0, 30) };
}
const strong = expected.filter(b => b.kind !== 'bass' && b.w >= 0.5);
const bassB = expected.filter(b => b.kind === 'bass');
if (expected.length) {
  beatStats.risset = matchBeats(strong, 'Risset 顯著拍（w ≥ 0.5）');
  beatStats.bass = matchBeats(bassB, '低音拍');
  const s = beatStats.risset;
  add('onset', '起音時間與規則拍點的誤差', s.n ? s.medianAbsMs != null && s.medianAbsMs <= TH.onsetMedianMs && s.hitRate30 >= TH.onsetHitRate : null,
    `Risset：中位 |誤差| ${s.medianAbsMs} ms、P90 ${s.p90AbsMs} ms、帶正負號中位 ${s.medianSignedMs} ms、±30 ms 命中 ${(s.hitRate30 * 100).toFixed(0)}%（${s.n} 拍）；` +
    `低音：中位 ${beatStats.bass.medianAbsMs} ms、命中 ${beatStats.bass.hitRate30 == null ? '—' : (beatStats.bass.hitRate30 * 100).toFixed(0) + '%'}（${beatStats.bass.n} 拍）`,
    `門檻：Risset 中位 |誤差| ≤ ${TH.onsetMedianMs} ms 且 ±30 ms 命中 ≥ ${TH.onsetHitRate * 100}%。正號＝聲音比規則晚。起音偵測解析度約 3 ms；殘響、多層同時響會讓偵測漏掉一些拍。`);
}
// 2b. 通用：偵測到的起音 vs 實際排程的 start(when)
if (starts.length) {
  const es = onsets.map(o => { const s = nearest(starts, o.t); return s ? (o.t - s.t) * 1000 : null; }).filter(v => v != null);
  const ok = es.filter(v => Math.abs(v) <= 20);
  beatStats.scheduled = { onsets: es.length, within20ms: ok.length, medianAbsMs: r1(median(ok.map(Math.abs))), medianSignedMs: r1(median(ok)) };
}

// 3. 警戒時低頻最突出
{
  const notIn = (t, arr) => !arr.some(([a, b]) => t >= a && t <= b);
  const alertIV = IV.alert.filter(([a, b]) => b - a > 0.5);
  // 巡邏（對照）：不在警戒、追殺、盲區的遊玩時段
  const patrol = [];
  let cur = null;
  for (const s of TL) {
    const ok = s.phase === undefined || s.phase === 'play';
    const good = ok && notIn(s.t, IV.alert) && notIn(s.t, IV.hunted) && notIn(s.t, IV.blind);
    if (good && !cur) cur = [s.t, s.t]; else if (good) cur[1] = s.t; else if (cur) { patrol.push(cur); cur = null; }
  }
  if (cur) patrol.push(cur);
  const A = alertIV.length ? bandsOver(alertIV) : null, Pt = bandsOver(clipIV(patrol).filter(([a, b]) => b - a > 0.3));
  let pass = null, value = '這次錄製沒有警戒區段';
  if (A) {
    const maxI = A.db.indexOf(Math.max(...A.db));
    const lowMinusMid = A.db[0] - A.db[1], lowMinusMidP = Pt ? Pt.db[0] - Pt.db[1] : null;
    pass = maxI === 0;
    value = `警戒：${BANDS.map((b, i) => b[0].split(' ')[0] + ' ' + A.db[i] + ' dB').join('、')}（低−中 ${r1(lowMinusMid)} dB）` +
      (Pt ? `；巡邏：${BANDS.map((b, i) => b[0].split(' ')[0] + ' ' + Pt.db[i] + ' dB').join('、')}（低−中 ${r1(lowMinusMidP)} dB）` : '');
  }
  add('alertLow', '警戒時低頻最突出', pass, value, '各頻帶總功率（4096 點 FFT、漢寧窗）。通過＝警戒時低頻帶是三個頻帶裡最強的；同時列出巡邏時段作對照。');
  beatStats.bands = { alert: A, patrol: Pt, alertIntervals: alertIV.length };
}

// 4. 爆音（削峰）
add('clip', '有無爆音（削峰）', wav.clip <= TH.clipSamples && (meta.audio.clipSamplesFloat || 0) <= TH.clipSamples,
  `削峰樣本 ${wav.clip}（16-bit）／${meta.audio.clipSamplesFloat ?? '—'}（浮點 ≥ 0.999）；峰值 ${r1(db(wav.peak * wav.peak))} dBFS`,
  `門檻：削峰樣本 ≤ ${TH.clipSamples}。`);

// 5. 長時間完全無聲／丟拍
const silences = [];
{
  let s0 = null;
  for (const e of env) {
    const quiet = e.db < -60;
    if (quiet && s0 == null) s0 = e.t;
    if ((!quiet || e === env[env.length - 1]) && s0 != null) {
      const len = e.t - s0;
      if (len >= TH.silenceSec && gapFrac(s0, e.t) < 0.5) silences.push({ t: +s0.toFixed(2), sec: +len.toFixed(2) });
      s0 = null;
    }
  }
  const drops = expected.length ? (beatStats.risset.missed + beatStats.bass.missed) / Math.max(1, beatStats.risset.n + beatStats.bass.n) : null;
  add('silence', '有無長時間完全無聲或丟拍', silences.length === 0 && (drops == null || drops <= TH.dropRate),
    `無聲段 ${silences.length} 個${silences.length ? '（' + silences.slice(0, 5).map(s => s.t + ' 秒起 ' + s.sec + ' 秒').join('、') + '）' : ''}；` +
    (drops != null ? `規則拍點 ±40 ms 內找不到起音：${beatStats.risset.missed + beatStats.bass.missed}／${beatStats.risset.n + beatStats.bass.n}（${(drops * 100).toFixed(1)}%）` : '沒有規則拍點可比'),
    `門檻：無 ≥ ${TH.silenceSec} 秒、低於 −60 dBFS 的段落，且丟拍比例 ≤ ${TH.dropRate * 100}%。無頭環境的音訊斷塊（補 0）不算。`);
}

// ---------- 圖 ----------
const W = Math.max(1000, Math.min(4000, Math.round(DUR * 20))), H = 480;
const xOf = (t) => (t - T0) / DUR * W;
const COLORS = { blind: '#4aa3ff', alert: '#ff9a2e', hunted: '#ff3b30' };
// 頻譜圖（含座標軸）
spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(dir, 'audio.wav'), '-lavfi',
  `showspectrumpic=s=${W}x512:legend=1:fscale=log:start=20:stop=16000:color=intensity:gain=1.5`, path.join(dir, 'spectrogram.png')]);
// 頻譜圖＋區段（無座標軸，x 與時間線性對應）
{
  const boxes = [];
  const box = (x, y, w, h, c, t) => boxes.push(`drawbox=x=${Math.round(x)}:y=${y}:w=${Math.max(1, Math.round(w))}:h=${h}:color=${c}:t=${t}`);
  for (const k of ['alert', 'hunted', 'blind']) for (const [a, b] of IV[k]) {
    const c = COLORS[k].replace('#', '0x');
    box(xOf(a), 0, xOf(b) - xOf(a), H, c + '@0.18', 'fill');
    box(xOf(a), k === 'blind' ? 0 : 14, xOf(b) - xOf(a), 14, c + '@0.95', 'fill');
  }
  for (const b of bassB) box(xOf(b.t), H - 22, 2, 22, '0xffe066@0.9', 'fill');
  for (const g of gaps) box(xOf(g[0]), H - 6, Math.max(2, xOf(g[1]) - xOf(g[0])), 6, '0xff00ff@0.9', 'fill');
  const script = path.join(dir, '.spec-filter.txt');
  fs.writeFileSync(script, `[0:a]showspectrumpic=s=${W}x${H}:legend=0:fscale=log:start=20:stop=16000:color=intensity:gain=1.5` + (boxes.length ? ',' + boxes.join(',') : '') + '[v]');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(dir, 'audio.wav'), '-filter_complex_script', script, '-map', '[v]', '-frames:v', '1', path.join(dir, 'spectrogram-marked.png')], { encoding: 'utf8' });
  if (r.status !== 0) log('spectrogram-marked 失敗', r.stderr.slice(0, 500));
  fs.rmSync(script, { force: true });
}
// 音量包絡 SVG
{
  const top = 30, ph = 300, bottom = top + ph, yOf = (d) => top + (Math.max(-80, Math.min(0, d)) / -80) * ph;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 60}" height="${bottom + 70}" viewBox="0 0 ${W + 60} ${bottom + 70}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11">`);
  parts.push(`<rect width="100%" height="100%" fill="#101218"/><g transform="translate(50,0)">`);
  for (const k of ['alert', 'hunted', 'blind']) for (const [a, b] of IV[k])
    parts.push(`<rect x="${xOf(a).toFixed(1)}" y="${top}" width="${Math.max(1, xOf(b) - xOf(a)).toFixed(1)}" height="${ph}" fill="${COLORS[k]}" opacity="${k === 'blind' ? 0.35 : 0.18}"/>`);
  for (let d = 0; d >= -80; d -= 20) parts.push(`<line x1="0" x2="${W}" y1="${yOf(d)}" y2="${yOf(d)}" stroke="#333"/><text x="-6" y="${yOf(d) + 4}" fill="#aaa" text-anchor="end">${d}</text>`);
  for (let s = Math.ceil(T0); s <= T0 + DUR; s += 5) parts.push(`<line x1="${xOf(s)}" x2="${xOf(s)}" y1="${bottom}" y2="${bottom + 5}" stroke="#aaa"/><text x="${xOf(s)}" y="${bottom + 17}" fill="#aaa" text-anchor="middle">${s}s</text>`);
  parts.push(`<polyline fill="none" stroke="#e8e2d0" stroke-width="1" points="${env.map(e => xOf(e.t).toFixed(1) + ',' + yOf(e.db).toFixed(1)).join(' ')}"/>`);
  for (const b of strong) parts.push(`<line x1="${xOf(b.t).toFixed(1)}" x2="${xOf(b.t).toFixed(1)}" y1="${bottom + 22}" y2="${bottom + 30}" stroke="#7fd1ff"/>`);
  for (const b of bassB) parts.push(`<line x1="${xOf(b.t).toFixed(1)}" x2="${xOf(b.t).toFixed(1)}" y1="${bottom + 22}" y2="${bottom + 38}" stroke="#ffe066" stroke-width="2"/>`);
  for (const o of onsets) parts.push(`<line x1="${xOf(o.t).toFixed(1)}" x2="${xOf(o.t).toFixed(1)}" y1="${bottom + 40}" y2="${bottom + 48}" stroke="#9f9"/>`);
  for (const g of gaps) parts.push(`<rect x="${xOf(g[0]).toFixed(1)}" y="${top - 6}" width="${Math.max(2, xOf(g[1]) - xOf(g[0])).toFixed(1)}" height="4" fill="#f0f"/>`);
  for (const e of EV) if (e.type === 'cue' && /alert|calm|dash|trapdoor|caught|hunt|escape|gate/i.test(e.name)) {
    const t = e.at || e.t;
    parts.push(`<line x1="${xOf(t).toFixed(1)}" x2="${xOf(t).toFixed(1)}" y1="${top}" y2="${top + 12}" stroke="#fff"/><text x="${xOf(t).toFixed(1)}" y="${top - 8}" fill="#fff" font-size="9" text-anchor="middle">${e.name}</text>`);
  }
  parts.push(`<text x="0" y="16" fill="#ddd" font-size="12">RMS 50ms (dBFS)   blue=blind  orange=alert  red=hunted   ticks: cyan=Risset beats(w&gt;=0.5)  yellow=bass beats  green=detected onsets  magenta=capture gaps</text>`);
  parts.push('</g></svg>');
  fs.writeFileSync(path.join(dir, 'envelope.svg'), parts.join('\n'));
  // SVG → PNG（有 Playwright 才做）
  try {
    const require = createRequire(import.meta.url);
    let pw = null; for (const t of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(t); break; } catch (e) {} }
    if (pw) {
      const b = await pw.chromium.launch();
      const pg = await b.newPage({ viewport: { width: W + 60, height: bottom + 70 } });
      await pg.goto(pathToFileURL(path.join(dir, 'envelope.svg')).href);
      await pg.screenshot({ path: path.join(dir, 'envelope.png') });
      await b.close();
    }
  } catch (e) { log('envelope.png 略過：', e.message); }
}

// ---------- 事件摘要 ----------
const cueCount = {};
for (const e of EV) if (e.type === 'cue') cueCount[e.name] = (cueCount[e.name] || 0) + 1;
const fails = EV.filter(e => e.type === 'state' && e.key === 'phase' && e.to === 'fail').length;

// ---------- 輸出 ----------
const analysis = { thresholds: TH, durationSec: DUR, startAudioTime: T0, onsets: onsets.length, expectedBeats: expected.length,
  intervals: { blind: IV.blind.length, alert: IV.alert.map(x => x.map(v => +v.toFixed(2))), hunted: IV.hunted.map(x => x.map(v => +v.toFixed(2))) },
  checks, dips, beatStats, silences, cueCount, fails, gaps: meta.audio.gapList, frames: meta.frames };
fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2));

const abs = (f) => path.join(dir, f);
const exists = (f) => fs.existsSync(abs(f));
const mark = (p) => p === true ? '✅ 通過' : p === false ? '❌ 不通過' : '— 無資料';
const L = [];
L.push(`# 試玩錄音報告：${meta.title || meta.profile || path.basename(meta.serveDir)}`, '');
L.push(`- 錄製時間：${meta.created}`);
L.push(`- 入口：\`${path.relative(path.resolve(HERE, '../..'), meta.serveDir)}/${meta.entry}\`；設定檔：\`${meta.profile || '（無）'}\`；程式玩家：${meta.bot ? '有' : '無'}${meta.scenario ? '；劇本：`' + meta.scenario + '`' : ''}`);
L.push(`- 長度：音訊 ${DUR.toFixed(1)} 秒（音訊時間 ${T0.toFixed(2)}～${(T0 + DUR).toFixed(2)}）；擷取方式 ${meta.audio.captureMode}，${SR} Hz 立體聲`);
L.push(`- 循環：${meta.cycleOverride ? `**放慢為 ${meta.cycleOverride} 秒**（錄製用，非遊戲預設）` : `遊戲預設（${(meta.prepared && meta.prepared.rules && meta.prepared.rules.CYCLE) || '?'} 秒）`}；畫面 ${meta.viewport.width}×${meta.viewport.height}${meta.renderScale ? `，WebGL 內部解析度 ×${meta.renderScale}` : ''}${meta.antialiasForcedOff ? '，反鋸齒關閉' : ''}`);
L.push(`- 無頭環境幀率：中位 ${meta.frames.medianFps} fps，P95 幀間隔 ${meta.frames.p95FrameMs} ms，最長 ${meta.frames.maxFrameMs} ms（**遊戲規則每幀推進一次；聲音由音訊時鐘預先排程，不受幀率影響**）`);
L.push(`- 音訊斷塊：${meta.audio.gapFrames} 個樣本（${(meta.audio.gapFrames / SR).toFixed(2)} 秒，${(meta.audio.gapList || []).length} 處；無頭環境 CPU 滿載時音訊執行緒來不及算，WAV 中補 0，分析時排除）`);
{
  const v = meta.video;
  const so = v && v.syncOffsets && v.syncOffsets.length ? v.syncOffsets : null;
  L.push(`- 影片對齊：聲音延後 ${v ? v.offsetSec : '—'} 秒放進 mp4，依據${v && v.offsetMethod === 'sync-marker' ? `右下角同步方塊（${so.length} 個標記，分布 ${Math.min(...so)}～${Math.max(...so)} 秒，誤差約一個影片幀）` : '牆上時間估算（可能差到 1 秒以上）'}`, '');
}
L.push('## 聆聽與檔案', '');
const files = [['有聲影片 mp4', 'playtest.mp4'], ['遊戲實際輸出 WAV', 'audio.wav'], ['頻譜圖（含座標軸）', 'spectrogram.png'], ['頻譜圖＋盲區／警戒標記', 'spectrogram-marked.png'],
  ['音量包絡 PNG', 'envelope.png'], ['音量包絡 SVG', 'envelope.svg'], ['狀態時間軸 JSON', 'timeline.json'], ['分析數字 JSON', 'analysis.json']];
for (const [n, f] of files) if (exists(f)) L.push(`- ${n}：[\`${f}\`](${f})　\`${abs(f)}\``);
if (meta.shots && meta.shots.length) L.push(`- 截圖：${meta.shots.map(s => `[${s.wallSec}s](${s.file})`).join('、')}`);
L.push('');
if (exists('spectrogram-marked.png')) L.push('![頻譜圖＋標記](spectrogram-marked.png)', '', '藍＝盲區、橘＝警戒、紅＝追殺；底部黃色刻度＝低音拍、洋紅＝音訊斷塊。', '');
if (exists('envelope.png')) L.push('![音量包絡](envelope.png)', '');
L.push('## 自動檢查', '', '| 檢查 | 結果 | 數字 |', '|---|---|---|');
for (const c of checks) L.push(`| ${c.name} | ${mark(c.pass)} | ${c.value} |`);
L.push('');
for (const c of checks) L.push(`- **${c.name}**：${c.detail}`);
L.push('');
if (beatStats.scheduled) L.push(`- 通用對照：偵測到的 ${beatStats.scheduled.onsets} 個起音中，${beatStats.scheduled.within20ms} 個在某個 \`start(when)\` 排程時間 ±20 ms 內（中位 |誤差| ${beatStats.scheduled.medianAbsMs} ms，帶正負號 ${beatStats.scheduled.medianSignedMs} ms）。`, '');
if (dips.length) {
  L.push('### 每次盲區', '', '| 盲區開始（音訊秒） | 前 dB | 盲區內 dB | 後 dB | 壓低 dB | 盲區內（含前 0.3 秒）還在響的 |', '|---|---|---|---|---|---|');
  for (const d of dips) L.push(`| ${d.t} | ${d.beforeDb} | ${d.insideDb} | ${d.afterDb} | ${d.dipDb} | ${d.sounding.join('、') || '—'} |`);
  const withBass = dips.filter(d => d.sounding.some(x => x.startsWith('低音拍'))), noBass = dips.filter(d => !d.sounding.some(x => x.startsWith('低音拍')));
  if (withBass.length && noBass.length) L.push('', `- 盲區內有低音拍的 ${withBass.length} 次：中位壓低 ${median(withBass.map(d => d.dipDb))} dB；沒有的 ${noBass.length} 次：中位壓低 ${median(noBass.map(d => d.dipDb))} dB。`);
  L.push('');
}
L.push('## 這次試玩發生了什麼', '');
L.push(`- 聲音層收到的 cue：${Object.entries(cueCount).map(([k, v]) => `${k}×${v}`).join('、') || '無'}`);
L.push(`- 警戒區段：${IV.alert.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} 秒`).join('、') || '無'}；追殺：${IV.hunted.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} 秒`).join('、') || '無'}；失敗 ${fails} 次`);
const botEv = EV.filter(e => e.src === 'bot');
if (botEv.length) {
  const cp = botEv.filter(e => e.type === 'calm_press');
  L.push(`- 程式玩家：按 Q ${cp.length} 次（按下時離拍點 ${cp.map(e => (e.data && e.data.off != null ? Math.round(e.data.off * 1000) + 'ms' : '?')).join('、')}）；衝刺 ${botEv.filter(e => e.type === 'dash_press').length} 次；重來 ${botEv.filter(e => e.type === 'retry').length} 次`);
}
L.push('');
L.push('## 限制', '');
L.push('- 錄到的是 Web Audio 圖送到 `destination` 的樣本，等同喇叭前的數位訊號；不含作業系統混音、喇叭與房間。');
L.push('- 無頭 Chromium 用 SwiftShader（CPU）算 WebGL，幀率比一般電腦低很多；輸入只在幀上生效，所以程式玩家的按鍵時間有幀級誤差。需要時用 `--cycle` 放慢循環或延長 `--duration`。');
L.push('- 起音偵測是能量法，殘響、多層同時響時會漏偵或合併；拍點誤差以「規則上的拍點」為準，數字適合比較前後版本，不是絕對值。');
fs.writeFileSync(path.join(dir, 'report.md'), L.join('\n') + '\n');
log('完成', path.join(dir, 'report.md'));
for (const c of checks) log(mark(c.pass), c.name, '—', c.value);
