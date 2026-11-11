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
 *
 * 喇叭可聽度（11/08 加，回應 11/07 喇叭試玩「三個核心訊號聽不出來」）：
 *   - 設定檔 analysis.speaker 宣告三項「中頻可辨」檢查（預告音 1～3 kHz、低音拍 200～600 Hz、腳步 1～4 kHz 差），
 *     用短時 FFT（1024 點、hop 256 ≈ 5.8 ms）算各頻帶能量隨時間的曲線，再以時間軸事件（盲區、低音拍、cue）對齊量峰值。
 *   - 喇叭模擬：把錄音先過 200 Hz 高通（ffmpeg，兩級 = 24 dB/oct，近似筆電喇叭聽不到的低頻），
 *     以 `--speaker` 子行程重跑全部檢查，寫成 analysis-speaker.json；主報告多一節「原始 vs 喇叭模擬」兩組數字。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const SPK = process.argv.includes('--speaker');                 // 喇叭模擬子行程：讀高通後的 wav，只寫 analysis-speaker.json
const SPEAKER_HP = +(process.env.SPEAKER_HP || 200);           // 喇叭模擬的高通頻率（Hz）
const dir = path.resolve(process.argv.filter(a => !a.startsWith('--'))[2] || '.');
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
  clipSamples: 0,         // 允許的削峰樣本數
  // 殘響掩護版（COVER_MODE = true，11/10 核心方向甲）第 1 項改量重合擊與殘響；門檻依 11/10 兩模式各 60 秒實錄定（見 report 說明）
  coverBand: [300, 1200], // 重合擊的厚擊頻帶（聲音層實作 420～1100 Hz，留邊）
  coverRiseMedianDb: 12,  // 重合擊突出中位下限（設計席 7.5）；11/10 第一次實錄 +12.6
  coverRiseMinDb: 6,      // 每一次下限（錄音檢查一貫的「有訊號」門檻）
  coverTailMinSec: 0.5,   // 餘韻中位：0.5～0.8 秒（設計席 7.5：聽到的長度要等於判定的長度，窗 0.6 秒）
  coverTailMaxSec: 0.8,
  coverTailBase: 'median', // 餘韻的背景：'median'＝窗前包絡中位數（11/10 第一版量法；設計席 7.5 的 1.3 秒與 0.5～0.8 秒門檻就是用它量的）｜'mean'＝窗前平均（設計文字的字面定義）
  coverAlertRiseDb: 8,    // 警戒時的輕版重擊突出中位下限（設計席 7.5）
  coverLouderDb: -3,      // 窗內整體音量比前後：中位下限（掩護版 −0.5、舊版 −24.9 dB）——窗內不能變安靜
  coverTailAboveDb: 3,
  fireTol: 0.02,          // fireSync：game.fire 與 FIRE_BASE + FIRE_P_GAIN × danger 的容許誤差
  stepMinN: 3,            // stepBand：不合拍、合拍腳步各至少幾步才判定
  horseBand: [300, 1200], // 木馬共鳴（C2）量的頻帶
  horseNearM: 6,          // 貼近：離木馬中心幾公尺內
  horseFarM: 25,          // 遠處：幾公尺外（聲音層 HORSE_BOOM_R 25 m 外共鳴為 0）
  horseDiffDb: 3,         // 貼近比遠處厚幾 dB（設計 C2）
  horseBoomOverHitDb: 0,  // 貼近時共鳴峰值最多比重合擊峰值高幾 dB（0＝不能比重擊響）
  fireDrop: 0.05,         // fireSync：相鄰兩幀 fire 掉超過這個量、而 danger 沒掉（< 0.01）＝「火光掉回」
  // 玩家自己的動作音（走提示音匯流排，盲區不壓）：盲區內有這些 cue 時，那次盲區照列但不計入盲區檢查
  blindConfoundCues: '^(dash|trapdoor|checkpoint|step_loud|gasp|takedown|takedown_fail|latch|latch_step|calm_ok|calm_bad|calm_done|alert|caught|hunt|escape|gate_open)$'
}, (profile && profile.analysis && profile.analysis.thresholds) || {});
const log = (...a) => console.log(SPK ? '[analyze:喇叭模擬]' : '[analyze]', ...a);

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
let wavFile = path.join(dir, meta.audio.file || 'audio.wav');
if (SPK) {   // 喇叭模擬：兩級 200 Hz 高通（24 dB/oct）；筆電喇叭 150～200 Hz 以下幾乎聽不到
  const out = path.join(dir, 'audio-speaker.wav');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wavFile, '-af', `highpass=f=${SPEAKER_HP}:poles=2,highpass=f=${SPEAKER_HP}:poles=2`, '-c:a', 'pcm_s16le', out], { encoding: 'utf8' });
  if (r.status !== 0) { console.error('[analyze:喇叭模擬] ffmpeg 高通失敗', r.stderr); process.exit(2); }
  wavFile = out;
}
const wav = readWav(wavFile);
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
// 區段：設定檔有 intervals 就用它（應以遊戲規則時間軸記錄的實際區段為準，不要用 t0 + k × T 推算）；
// 沒有才用每幀布林值連成區段。IV.fake（可選）＝假驟降：照常交接、不該有空檔，給報告對照。
let IV = profile && profile.intervals ? profile.intervals(TL, meta, EV) : null;
IV = Object.assign({ blind: boolIntervals('blind'), alert: boolIntervals('alert'), hunted: boolIntervals('hunted'), fake: [] }, IV || {});
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
const expectedEarly = profile && profile.expectedBeats ? profile.expectedBeats(TL, meta) : [];
const dips = dipsOf(IV.blind), fakeDips = dipsOf(IV.fake || []);
function dipsOf(list) {
const dips = [];
for (const [a, b] of list) {
  if (a - 1.0 < T0 || b + 1.0 > T0 + DUR || gapFrac(a - 1.0, b + 1.0) > 0.2) continue;
  const inside = powerIn(a + 0.1, b - 0.03), before = powerIn(a - 1.0, a - 0.15), after = powerIn(b + 0.25, b + 1.0);
  if (inside == null || before == null || after == null) continue;
  const ref = (db(before) + db(after)) / 2;
  // 盲區內（含前 0.3 秒，殘響會拖進來）還在響的規則拍點與 cue，幫助判斷「為什麼不夠空」
  const inBeats = expectedEarly.filter(x => x.t >= a - 0.3 && x.t < b).map(x => x.kind === 'bass' ? '低音拍 ' + (x.t - a >= 0 ? '+' : '') + (x.t - a).toFixed(2) + 's' : null).filter(Boolean);
  const inCues = EV.filter(e => e.type === 'cue' && (e.at || e.t) >= a - 0.3 && (e.at || e.t) < b && !/^(pre_?blind|blind)$/i.test(e.name)).map(e => e.name + ' ' + ((e.at || e.t) - a >= 0 ? '+' : '') + ((e.at || e.t) - a).toFixed(2) + 's');
  const conf = EV.filter(e => e.type === 'cue' && (e.at || e.t) >= a - 0.05 && (e.at || e.t) < b && new RegExp(TH.blindConfoundCues, 'i').test(e.name)).map(e => e.name);
  dips.push({ confound: conf, t: +a.toFixed(3), len: +(b - a).toFixed(3), insideDb: r1(db(inside)), beforeDb: r1(db(before)), afterDb: r1(db(after)), dipDb: r1(ref - db(inside)), sounding: [...inBeats, ...inCues] });
}
return dips;
}
// 鼓聲模式：規則 T.COVER_MODE（profile 的 prepare 記在 meta.prepared.coverMode／rulesT）；沒有就當舊盲區版
const PREP = meta.prepared || {};
const RULE_COVER = PREP.coverMode != null ? !!PREP.coverMode : !!((PREP.rulesT || {}).COVER_MODE);   // 規則實際用的模式（fireSync 一律看這個）
// 環境變數 ANALYZE_COVER=1｜0 可強制第 1 項用某一種量法（對照用：拿舊盲區版錄音跑掩護量法，看門檻分不分得開）
const COVER = process.env.ANALYZE_COVER != null ? process.env.ANALYZE_COVER === '1' : RULE_COVER;
// 1'. 殘響掩護版：掩護窗開頭的重合擊在 coverBand 比窗前突出多少、殘響尾巴多長；並列整體音量比前後「響」多少（只列不判）
const coverRows = [], coverSub = [];
if (COVER) {
  const band = TH.coverBand, CS = bandSeries([band]), arr = CS.p[0];
  const fI = (t) => Math.round((t - CS.t[0]) / CS.hop);
  const gapAt = (f) => gapMask[Math.min(wav.n - 1, Math.max(0, Math.round((CS.t[f] - T0) * SR)))];
  const meanP = (a, b) => { let s = 0, n = 0; for (let f = Math.max(0, fI(a)); f <= Math.min(arr.length - 1, fI(b)); f++) { if (gapAt(f)) continue; s += arr[f]; n++; } return n ? s / n : null; };
  for (const [a, b] of IV.blind) {
    if (a - 1.0 < T0 || b + 1.0 > T0 + DUR || gapFrac(a - 1.0, b + 1.0) > 0.2) continue;
    const base = meanP(a - 1.0, a - 0.15);
    let pk = 0, pkF = -1;
    for (let f = Math.max(0, fI(a - 0.01)); f <= Math.min(arr.length - 1, fI(a + 0.15)); f++) if (!gapAt(f) && arr[f] > pk) { pk = arr[f]; pkF = f; }
    if (base == null || pkF < 0) continue;
    // 餘韻（設計席 7.5）：重合擊後，全頻 50 ms RMS 包絡落回「窗前背景 + coverTailAboveDb」以內的時間，自窗開始算。
    // 窗前 1 秒取 [−1.0, −0.15] 秒（和突出的背景同一段，避開窗前 0.15 秒的「變亮」與預告）。
    // 背景預設取窗前包絡的中位數（TH.coverTailBase；拍與拍之間的底）。另一種背景（平均，會被窗前鼓點拉高、餘韻量得短）列在 tailAltSec 對照。
    const pre = env.filter(e => e.t >= a - 1.0 && e.t <= a - 0.15).map(e => e.db);
    const before = powerIn(a - 1.0, a - 0.15), envMean = before != null ? db(before) : null, envMed = median(pre);
    const tPk = CS.t[pkF];
    const tailTo = (bdb) => { if (bdb == null) return null; for (const e of env) { if (e.t <= tPk + 0.025) continue; if (e.t > a + 1.5) break; if (e.db <= bdb + TH.coverTailAboveDb) return e.t - a; } return 1.5; };
    const tailMean = tailTo(envMean), tailMed = tailTo(envMed);   // 1.5 秒內沒回到背景：記 1.5（上限）
    const tail = TH.coverTailBase === 'mean' ? tailMean : tailMed, tailAlt = TH.coverTailBase === 'mean' ? tailMed : tailMean;
    const alertWin = IV.normalBlind ? !IV.normalBlind.some(([x]) => Math.abs(x - a) < 1e-3) : false;   // 警戒時低音拍之間的窗（聲音層只打較輕的重合擊）
    const inside = powerIn(a + 0.02, b - 0.03), after = powerIn(b + 0.25, b + 1.0);
    const conf = EV.filter(e => e.type === 'cue' && (e.at || e.t) >= a - 0.05 && (e.at || e.t) < b && new RegExp(TH.blindConfoundCues, 'i').test(e.name)).map(e => e.name);
    coverRows.push({ t: +a.toFixed(3), len: +(b - a).toFixed(3), alertWin, confound: conf, envMeanDb: r1(envMean), envMedDb: r1(envMed), baseDb: r1(db(base)), peakDb: r1(db(pk)), riseDb: r1(db(pk) - db(base)), peakAt: +(CS.t[pkF] - a).toFixed(3),
      tailSec: tail == null ? null : +tail.toFixed(3), tailAltSec: tailAlt == null ? null : +tailAlt.toFixed(3), louderDb: inside != null && before != null && after != null ? r1(db(inside) - (db(before) + db(after)) / 2) : null });
  }
  const clean = coverRows.filter(x => !x.confound.length && !x.alertWin), conf = coverRows.filter(x => x.confound.length), aw = coverRows.filter(x => x.alertWin && !x.confound.length);
  const rs = clean.map(x => x.riseDb), ts = clean.map(x => x.tailSec).filter(v => v != null), tsM = clean.map(x => x.tailAltSec).filter(v => v != null), ld = clean.map(x => x.louderDb).filter(v => v != null);
  const mdR = median(rs), mnR = rs.length ? Math.min(...rs) : null, mdT = median(ts), mdL = median(ld);
  const awR = median(aw.map(x => x.riseDb));
  const okRise = rs.length ? mdR >= TH.coverRiseMedianDb && mnR >= TH.coverRiseMinDb : null;
  const okTail = mdT == null ? null : mdT >= TH.coverTailMinSec && mdT <= TH.coverTailMaxSec;
  const okLoud = mdL == null ? null : mdL >= TH.coverLouderDb;
  const okAlert = aw.length ? awR >= TH.coverAlertRiseDb : null;   // 這次錄製沒有警戒窗：不判
  coverSub.push({ key: 'rise', ok: okRise }, { key: 'tail', ok: okTail }, { key: 'louder', ok: okLoud }, { key: 'alert', ok: okAlert });
  const parts = [okRise, okTail, okLoud, okAlert].filter(v => v != null);
  const mk = (v) => v == null ? '（無資料）' : v ? '（過）' : '（不過）';
  add('blind', `掩護窗：重合擊在 ${band[0]}～${band[1]} Hz 突出、餘韻長度、警戒輕版（殘響掩護版）`,
    rs.length ? parts.every(Boolean) : null,
    (rs.length ? `突出：中位 +${mdR} dB、最小 +${mnR} dB${mk(okRise)}；餘韻：中位 ${r1(mdT)} 秒（${r1(Math.min(...ts))}～${r1(Math.max(...ts))}）${mk(okTail)}，背景改用${TH.coverTailBase === 'mean' ? '中位數' : '平均'}時 ${r1(median(tsM))} 秒；` +
      `整體比前後：中位 ${mdL >= 0 ? '+' : ''}${mdL} dB${mk(okLoud)}（${rs.length} 次一般窗）` : '沒有可量的一般掩護窗') +
    (aw.length ? `；警戒輕版 ${aw.length} 次：突出中位 ${awR >= 0 ? '+' : ''}${awR} dB${mk(okAlert)}` : '；這次沒有警戒窗（輕版不判）') +
    (conf.length ? `；另 ${conf.length} 次窗內有玩家自己的動作音，照列不計` : ''),
    `模式：規則 T.COVER_MODE = true（鼓聲不停）。門檻（設計席 docs/design/2026-11-10-core-direction-illusion.md 第 7.5 節）：` +
    `重合擊突出中位 ≥ ${TH.coverRiseMedianDb} dB（每次 ≥ ${TH.coverRiseMinDb} dB）；餘韻中位在 ${TH.coverTailMinSec}～${TH.coverTailMaxSec} 秒；警戒時的輕版重擊突出中位 ≥ ${TH.coverAlertRiseDb} dB；` +
    `另加本工具的防呆：窗內整體音量比前後的中位 ≥ ${TH.coverLouderDb} dB（窗內不能變安靜，舊盲區版約 −25 dB）。` +
    `突出＝窗開頭 [−0.01, +0.15] 秒內 ${band[0]}～${band[1]} Hz 頻帶（短時 FFT 1024 點）的峰值，減去窗前 1.0～0.15 秒的平均。` +
    `餘韻＝重合擊後全頻 50 ms RMS 包絡落回「窗前 1.0～0.15 秒包絡的${TH.coverTailBase === 'mean' ? '平均' : '中位數'} + ${TH.coverTailAboveDb} dB」以內的時間，自窗開始算（1.5 秒內沒回到記 1.5）。` +
    `設計文字寫「窗前 1 秒平均」，但 7.5 的 1.3 秒與門檻是用中位數背景量的（11/10 聲音角色），所以預設用中位數；平均背景的數字一起列出，請設計席確認用哪一把尺。` +
    `一般窗與警戒窗分開判：警戒窗落在兩個低音拍正中間，聲音層打的是輕版重擊。` +
    `11/10 第一次實錄（聲音層讀不到掩護窗、重合擊沒排上的版本）：突出中位 +12.6 dB、餘韻（中位數背景）0.18 秒、警戒輕版 −0.8 dB。`);
} else {
  const clean = dips.filter(x => !x.confound.length), conf = dips.filter(x => x.confound.length);
  const d = clean.map(x => x.dipDb), md = median(d), mn = d.length ? Math.min(...d) : null;
  add('blind', '盲區時整體音量比前後低', d.length ? md >= TH.blindDipMedianDb && mn >= TH.blindDipMinDb : null,
    (d.length ? `中位 ${md} dB、最小 ${mn} dB（${d.length} 次盲區）` : '沒有可量的盲區') +
    (conf.length ? `；另 ${conf.length} 次盲區內有玩家自己的動作音（${conf.map(x => x.t + ' 秒：' + [...new Set(x.confound)].join('、')).join('；')}），照列不計` : ''),
    `門檻：中位 ≥ ${TH.blindDipMedianDb} dB 且每次 ≥ ${TH.blindDipMinDb} dB。盲區內取 [+0.10, 結束−0.03] 秒，前後取盲區前 1.0～0.15 秒與結束後 0.25～1.0 秒的平均。` +
    `區段以規則時間軸記錄的實際盲區為準。玩家自己的動作音（衝刺、暗門、檢查點、不合拍腳步、安撫哼唱等）走提示音匯流排、盲區本來就不壓，盲區內有這些 cue 的那幾次列在表裡但不計入。`);
}

// 1b. fireSync：火光 game.fire 跟 game.danger（實際速度）走，不能每循環掉回一次（11/10 甲；核心方向文件第 2 節 fireBrightness 改讀 danger）
const fireInfo = {};
{
  const KT = PREP.rulesT || {};
  const fr = TL.filter(s => s.phase === 'play' && s.fire != null && s.dg != null);
  if (!fr.length) add('fireSync', '火光跟著實際速度（danger）走、不每循環掉回', null, '時間軸沒有 fire／danger（舊規則檔或舊錄製）', '設定檔 probe 要記 game.fire 與 game.danger。');
  else {
    const hasK = Number.isFinite(KT.FIRE_BASE) && Number.isFinite(KT.FIRE_P_GAIN);
    const oldBlind = (s) => !RULE_COVER && s.blind && Number.isFinite(KT.FIRE_BLIND);   // 舊模式盲區照設計壓暗
    const expect = (s) => oldBlind(s) ? KT.FIRE_BLIND : Math.min(1, Math.max(0, KT.FIRE_BASE + KT.FIRE_P_GAIN * s.dg));
    const off = hasK ? fr.filter(s => Math.abs(s.fire - expect(s)) > TH.fireTol) : [];
    const drops = [];
    for (let i = 1; i < fr.length; i++) {
      const A = fr[i - 1], B = fr[i];
      if (B.t - A.t > 0.5 || oldBlind(A) || oldBlind(B)) continue;
      if (A.fire - B.fire > TH.fireDrop && A.dg - B.dg < 0.01) drops.push({ t: +B.t.toFixed(3), from: A.fire, to: B.fire, p: B.p });
    }
    const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null; };
    const nb = fr.filter(s => !oldBlind(s));
    Object.assign(fireInfo, { frames: fr.length, offFrames: off.length, drops: drops.slice(0, 20), dropCount: drops.length, corrDanger: corr(nb.map(s => s.fire), nb.map(s => s.dg)), corrP: corr(nb.map(s => s.fire), nb.map(s => s.p)),
      fireRange: [Math.min(...fr.map(s => s.fire)), Math.max(...fr.map(s => s.fire))], dangerRange: [Math.min(...fr.map(s => s.dg)), Math.max(...fr.map(s => s.dg))] });
    const okOff = !hasK || off.length / fr.length <= 0.01;
    add('fireSync', '火光跟著實際速度（danger）走、不每循環掉回', okOff && drops.length === 0,
      `${fr.length} 幀：${hasK ? `和 FIRE_BASE + FIRE_P_GAIN × danger 差 > ${TH.fireTol} 的 ${off.length} 幀；` : '（規則常數缺，只看掉回）'}掉回 ${drops.length} 次${drops.length ? '（' + drops.slice(0, 5).map(d => d.t + ' 秒 p=' + d.p).join('、') + '）' : ''}；` +
      `相關係數 fire×danger ${fireInfo.corrDanger ?? '—'}、fire×p ${fireInfo.corrP ?? '—'}；fire ${fireInfo.fireRange.map(v => v.toFixed(2)).join('～')}、danger ${fireInfo.dangerRange.map(v => v.toFixed(2)).join('～')}`,
      `門檻：誤差 > ${TH.fireTol} 的幀 ≤ 1%，且沒有「相鄰兩幀 fire 掉超過 ${TH.fireDrop}、danger 卻沒掉（< 0.01）」的掉回。舊模式（COVER_MODE = false）盲區幀照設計壓到 FIRE_BLIND，不算掉回。` +
      `fire×p 的相關係數是對照：火光若跟著循環相位走，等於用眼睛把交接點指出來（核心方向文件第 2 節）。danger 在錄製中變化小時兩個相關係數都可能不穩，只看前兩條。`);
  }
}

// 1c. 木馬共鳴（C2，HORSE_MODE；docs/design/2026-11-11-trojan-horse-directions.md 第 3 節）：時間軸有 hd（離木馬中心距離）而且貼近、遠處都有掩護窗才跑。
// 量法：每個一般掩護窗，那一擊後 [+0.05, +0.55] 秒 300～1200 Hz 的平均能量，減去窗前 1.0～0.15 秒同頻帶平均（不用峰值：峰值永遠是重合擊本身）。
// 貼近（hd ≤ horseNearM）與遠處（hd ≥ horseFarM）各取中位，差 ≥ horseDiffDb 才過。剛換位置的那個窗（窗前 1 秒內換過位置）不算。
const horseInfo = {};
{
  const hasHd = TL.some(s => s.hd != null);
  if (hasHd) {
    const band = TH.horseBand, HS = bandSeries([band]), arr = HS.p[0];
    const fI = (t) => Math.round((t - HS.t[0]) / HS.hop);
    const meanP = (a, b) => { let s = 0, n = 0; for (let f = Math.max(0, fI(a)); f <= Math.min(arr.length - 1, fI(b)); f++) { if (gapMask[Math.min(wav.n - 1, Math.max(0, Math.round((HS.t[f] - T0) * SR)))]) continue; s += arr[f]; n++; } return n ? s / n : null; };
    const hdAt = (t) => { let best = null; for (const s of TL) { if (s.t > t) break; best = s; } return best ? best.hd : null; };
    const rows = [];
    for (const [a] of (IV.normalBlind && IV.normalBlind.length ? IV.normalBlind : IV.blind)) {
      if (a - 1.0 < T0 || a + 0.6 > T0 + DUR) continue;
      const d0 = hdAt(a - 1.0), d1 = hdAt(a + 0.55);
      if (d0 == null || d1 == null || Math.abs(d0 - d1) > 0.5) continue;   // 窗前到窗後位置要一樣
      const pre = meanP(a - 1.0, a - 0.15), post = meanP(a + 0.05, a + 0.55);
      if (pre == null || post == null) continue;
      // 共鳴不能比重擊還響（聲音角色 11/11 的設計約束）：重合擊峰值取 [−0.01, +0.05] 秒，共鳴峰值取 [+0.05, +0.25] 秒（共鳴晚 HORSE_BOOM_DELAY 0.07 秒）
      const pk = (x, y) => { let m = 0; for (let f = Math.max(0, fI(x)); f <= Math.min(arr.length - 1, fI(y)); f++) if (arr[f] > m) m = arr[f]; return m; };
      const hitPk = pk(a - 0.01, a + 0.05), boomPk = pk(a + 0.05, a + 0.25);
      rows.push({ t: +a.toFixed(3), dist: d1, postDb: r1(db(post)), preDb: r1(db(pre)), riseDb: r1(db(post) - db(pre)), hitPeakDb: r1(db(hitPk)), boomPeakDb: r1(db(boomPk)), boomOverHitDb: r1(db(boomPk) - db(hitPk)) });
    }
    const near = rows.filter(r => r.dist <= TH.horseNearM), far = rows.filter(r => r.dist >= TH.horseFarM);
    const mN = median(near.map(r => r.riseDb)), mF = median(far.map(r => r.riseDb));
    const aN = median(near.map(r => r.postDb)), aF = median(far.map(r => r.postDb));
    const overN = median(near.map(r => r.boomOverHitDb));
    Object.assign(horseInfo, { rows, near: near.length, far: far.length, nearRiseDb: mN, farRiseDb: mF, diffDb: mN != null && mF != null ? r1(mN - mF) : null, nearPostDb: aN, farPostDb: aF, nearBoomOverHitDb: overN });
    add('horseBoom', `木馬共鳴：貼近比 ${TH.horseFarM} 公尺外，那一擊後 0.5 秒 ${band[0]}～${band[1]} Hz 厚 ≥ ${TH.horseDiffDb} dB，且共鳴不比重擊響`,
      near.length && far.length ? mN - mF >= TH.horseDiffDb && overN <= TH.horseBoomOverHitDb : null,
      near.length && far.length ? `貼近（≤ ${TH.horseNearM} m，${near.length} 窗）相對窗前中位 ${mN >= 0 ? '+' : ''}${mN} dB；遠處（≥ ${TH.horseFarM} m，${far.length} 窗）${mF >= 0 ? '+' : ''}${mF} dB；差 ${r1(mN - mF)} dB（絕對能量差 ${r1(aN - aF)} dB）；貼近時共鳴峰值比重合擊峰值 ${overN >= 0 ? '高' : '低'} ${r1(Math.abs(overN))} dB（上限：高 ${TH.horseBoomOverHitDb} dB）`
        : `貼近 ${near.length} 窗、遠處 ${far.length} 窗，兩邊都要有才判（錄音要用 --horse-test 與 --page "index.html?lab=horse"）`,
      `量法：每個一般掩護窗，那一擊後 [+0.05, +0.55] 秒 ${band[0]}～${band[1]} Hz 平均能量減去窗前 1.0～0.15 秒同頻帶平均（不用峰值：峰值永遠是重合擊本身，聲音角色 11/11）。` +
      `距離用聲音層 horseInfo().dist（離木馬中心）。貼近 ≤ ${TH.horseNearM} m、遠處 ≥ ${TH.horseFarM} m 各取中位，差 ≥ ${TH.horseDiffDb} dB（設計 C2），而且貼近時共鳴峰值（[+0.05, +0.25] 秒）不比重合擊峰值（[−0.01, +0.05] 秒）高超過 ${TH.horseBoomOverHitDb} dB（共鳴比重擊還響就違反設計，聲音角色 11/11）才過。窗前到窗後位置有變的窗不算。`);
  }
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
    `低音：中位 ${beatStats.bass.medianAbsMs} ms、命中 ${beatStats.bass.hitRate30 == null ? '—' : (beatStats.bass.hitRate30 * 100).toFixed(0) + '%'}（${beatStats.bass.n} 拍）` +
    `；期望拍另含追殺第 5 層 ${expected.filter(b => b.hunt).length} 拍（顯著的 ${strong.filter(b => b.hunt).length}）、假驟降尾音 ${expected.filter(b => b.tail).length} 拍（極輕，不比對）`,
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
// 喇叭模擬：高通濾波會抬高峰值（相位旋轉），濾波後的削峰不代表遊戲輸出有爆音，所以不判定、只列峰值
add('clip', '有無爆音（削峰）', SPK ? null : wav.clip <= TH.clipSamples && (meta.audio.clipSamplesFloat || 0) <= TH.clipSamples,
  SPK ? `（高通後不判定）濾波後峰值 ${r1(db(wav.peak * wav.peak))} dBFS、超過 16-bit 範圍的樣本 ${wav.clip}` :
    `削峰樣本 ${wav.clip}（16-bit）／${meta.audio.clipSamplesFloat ?? '—'}（浮點 ≥ 0.999）；峰值 ${r1(db(wav.peak * wav.peak))} dBFS`,
  `門檻：削峰樣本 ≤ ${TH.clipSamples}。喇叭模擬（高通後）不判定這項：濾波會改變峰值。`);

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

// ---------- 6～8. 喇叭可聽度：中頻帶能量對事件對齊（設定檔 analysis.speaker 宣告） ----------
// 短時 FFT：1024 點漢寧窗、hop 256（≈ 5.8 ms），一次算完所有要看的頻帶，回傳每個頻帶的 dB 曲線。
function bandSeries(bands) {
  const N = 1024, Hh = 256, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const bins = bands.map(([f0, f1]) => [Math.ceil(f0 * N / SR), Math.min(N / 2, Math.floor(f1 * N / SR))]);
  const nF = Math.max(0, Math.floor((wav.n - N) / Hh) + 1);
  const out = bands.map(() => new Float32Array(nF)), tt = new Float32Array(nF);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nF; f++) {
    const i0 = f * Hh;
    tt[f] = tOf(i0 + N / 2);
    for (let k = 0; k < N; k++) { re[k] = wav.mono[i0 + k] * win[k]; im[k] = 0; }
    fft(re, im);
    bins.forEach(([k0, k1], bi) => { let p = 0; for (let k = k0; k <= k1; k++) p += re[k] * re[k] + im[k] * im[k]; out[bi][f] = p / (N * N); });
  }
  return { t: tt, p: out, hop: Hh / SR };
}
const SPKC = (profile && profile.analysis && profile.analysis.speaker) || null;
const speaker = { checks: [] };
if (SPKC) {
  const bandList = [SPKC.preBlind && SPKC.preBlind.band, SPKC.bassMid && SPKC.bassMid.band, SPKC.steps && SPKC.steps.band].filter(Boolean);
  const BS = bandSeries(bandList);
  const fIdx = (t) => Math.round((t - BS.t[0]) / BS.hop);
  const bandOf = (band) => BS.p[bandList.indexOf(band)];
  // 區間內的峰值 dB、平均功率 dB（略過音訊斷塊）
  const peakDb = (arr, a, b) => { let m = 0, any = false; for (let f = Math.max(0, fIdx(a)); f <= Math.min(arr.length - 1, fIdx(b)); f++) { if (gapMask[Math.min(wav.n - 1, Math.round((BS.t[f] - T0) * SR))]) continue; any = true; if (arr[f] > m) m = arr[f]; } return any ? db(m) : null; };
  const meanDb = (arr, a, b) => { let s = 0, n = 0; for (let f = Math.max(0, fIdx(a)); f <= Math.min(arr.length - 1, fIdx(b)); f++) { if (gapMask[Math.min(wav.n - 1, Math.round((BS.t[f] - T0) * SR))]) continue; s += arr[f]; n++; } return n ? db(s / n) : null; };
  const inRange = (a, b) => a >= T0 && b <= T0 + DUR;
  const fmtList = (xs) => xs.map(v => (v >= 0 ? '+' : '') + r1(v)).join('、');

  // 6. 盲區前 0.4 秒有沒有預告音：1～3 kHz 頻帶峰值相對前 1 秒平均 ≥ +6 dB（只看一般盲區；假驟降前不該有）
  if (SPKC.preBlind) {
    const cfg = SPKC.preBlind, arr = bandOf(cfg.band), lead = cfg.lead || 0.4, need = cfg.minDb || 6;
    const normal = (IV.normalBlind && IV.normalBlind.length ? IV.normalBlind : IV.blind);
    const rows = [], fakeRows = [];
    const measure = (a) => {
      const w0 = a - lead - 0.05, w1 = a - 0.01, b0 = w0 - 1.0, b1 = w0;
      if (!inRange(b0, w1) || gapFrac(b0, w1) > 0.2) return null;
      const pk = peakDb(arr, w0, w1), bg = meanDb(arr, b0, b1);
      if (pk == null || bg == null) return null;
      return { t: +a.toFixed(3), peakDb: r1(pk), baseDb: r1(bg), riseDb: r1(pk - bg) };
    };
    for (const [a] of normal) { const m = measure(a); if (m) rows.push(m); }
    for (const [a] of IV.fake || []) { const m = measure(a); if (m) fakeRows.push(m); }
    const rises = rows.map(r => r.riseDb), md = median(rises), mn = rises.length ? Math.min(...rises) : null;
    const okN = rises.filter(v => v >= need).length;
    const pass = rises.length ? (md >= need && okN / rises.length >= 0.8) : null;
    const fakeOk = fakeRows.every(r => r.riseDb < need);
    add('preBlindMid', `盲區前 ${lead} 秒的預告音在 ${cfg.band[0] / 1000}～${cfg.band[1] / 1000} kHz 聽得出來`, pass == null ? null : pass && fakeOk,
      (rises.length ? `相對前 1 秒平均：中位 +${md} dB、最小 ${mn >= 0 ? '+' : ''}${mn} dB、≥ +${need} dB 的 ${okN}／${rises.length} 次（${fmtList(rises)}）` : '沒有可量的一般盲區') +
      (fakeRows.length ? `；假驟降前（不該有）：${fmtList(fakeRows.map(r => r.riseDb))} dB${fakeOk ? '' : '（**有加強，不對**）'}` : ''),
      `門檻：每次一般盲區，盲區前 [${lead + 0.05}, 0.01] 秒內 ${cfg.band[0]}～${cfg.band[1]} Hz 頻帶的峰值，比再往前 1 秒的平均高 ≥ ${need} dB；中位 ≥ ${need} 且八成以上達標才通過。假驟降前量到的必須 < ${need} dB（沒有預告音才是假的）。短時 FFT 1024 點、hop ${(BS.hop * 1000).toFixed(1)} ms。`);
    speaker.preBlind = { rows, fakeRows, medianDb: md, minDb: mn };
  }
  // 7. 警戒時低音拍在 200～600 Hz 是否可辨：拍點附近的峰值相對背景 ≥ +6 dB
  if (SPKC.bassMid) {
    const cfg = SPKC.bassMid, arr = bandOf(cfg.band), need = cfg.minDb || 6;
    const inAlert = (t) => IV.alert.some(([a, b]) => t >= a && t <= b);
    const rows = [], patrolRows = [];
    for (const b of expected.filter(x => x.kind === 'bass')) {
      const w0 = b.t - 0.02, w1 = b.t + 0.15, b0 = b.t - 1.0, b1 = b.t - 0.12;
      if (!inRange(b0, w1) || gapFrac(b0, w1) > 0.2) continue;
      const pk = peakDb(arr, w0, w1), bg = meanDb(arr, b0, b1);
      if (pk == null || bg == null) continue;
      (inAlert(b.t) ? rows : patrolRows).push({ t: +b.t.toFixed(3), peakDb: r1(pk), baseDb: r1(bg), riseDb: r1(pk - bg) });
    }
    const rises = rows.map(r => r.riseDb), md = median(rises), mn = rises.length ? Math.min(...rises) : null, okN = rises.filter(v => v >= need).length;
    const pass = rises.length ? (md >= need && okN / rises.length >= 0.8) : null;
    const pr = patrolRows.map(r => r.riseDb);
    add('bassMid', `警戒時低音拍在 ${cfg.band[0]}～${cfg.band[1]} Hz 聽得出來`, pass,
      (rises.length ? `警戒 ${rises.length} 拍：相對前 1 秒背景 中位 +${md} dB、最小 ${mn >= 0 ? '+' : ''}${mn} dB、≥ +${need} dB 的 ${okN} 拍（${fmtList(rises)}）` : '這次錄製沒有警戒時的低音拍') +
      (pr.length ? `；巡邏時（對照，不計）${pr.length} 拍中位 ${median(pr) >= 0 ? '+' : ''}${median(pr)} dB` : ''),
      `門檻：警戒段每個規則低音拍，[−0.02, +0.15] 秒內 ${cfg.band[0]}～${cfg.band[1]} Hz 頻帶的峰值比前 1 秒（到 −0.12 秒）的平均高 ≥ ${need} dB；中位 ≥ ${need} 且八成以上達標才通過。這一帶是筆電喇叭聽得到的最低頻段，低音拍要靠它被認出來。`);
    speaker.bassMid = { rows, patrolRows, medianDb: md, minDb: mn };
  }
  // 8. step_loud 與 step_masked 的 1～4 kHz 能量差 ≥ 12 dB（用時間軸事件對齊）
  if (SPKC.steps) {
    const cfg = SPKC.steps, arr = bandOf(cfg.band), need = cfg.minDb || 12;
    const cueT = (re) => EV.filter(e => e.type === 'cue' && re.test(e.name)).map(e => e.at || e.t).filter(t => inRange(t - 0.3, t + 0.15) && gapFrac(t - 0.3, t + 0.15) < 0.2);
    const loudT = cueT(new RegExp(cfg.loud, 'i')), maskT = cueT(new RegExp(cfg.masked, 'i'));
    const meas = (t) => { const pk = peakDb(arr, t - 0.005, t + 0.12), bg = meanDb(arr, t - 0.3, t - 0.02); return pk == null ? null : { t: +t.toFixed(3), peakDb: r1(pk), riseDb: bg == null ? null : r1(pk - bg) }; };
    const loud = loudT.map(meas).filter(Boolean), masked = maskT.map(meas).filter(Boolean);
    const mdL = median(loud.map(x => x.peakDb)), mdM = median(masked.map(x => x.peakDb));
    const diff = mdL != null && mdM != null ? r1(mdL - mdM) : null;
    const rL = median(loud.map(x => x.riseDb)), rM = median(masked.map(x => x.riseDb));
    // 合拍的腳步照設計是被鼓點蓋住，量到的多半是鼓；另列「附近沒有顯著拍（±60 ms 內 w ≥ 0.2）」的那幾步作對照
    const noBeat = (t) => !expected.some(b => b.kind !== 'bass' && b.w >= 0.2 && Math.abs(b.t - t) < 0.06);
    const maskedClean = masked.filter(x => noBeat(x.t));
    // 判定用「相對前 0.3 秒的上升量」的差：合拍腳步照設計落在鼓點上，絕對峰值量到的是那一下鼓，
    // 玩家聽到的差別其實是「突然冒出一聲」對「什麼都沒多出來」，所以比上升量才對
    const riseDiff = rL != null && rM != null ? r1(rL - rM) : null;
    const fewSteps = loud.length < TH.stepMinN || masked.length < TH.stepMinN;   // 11/11：1 步就判會被單一樣本左右，兩種各要 ≥ stepMinN 步
    add('stepBand', `不合拍腳步比合拍腳步在 ${cfg.band[0] / 1000}～${cfg.band[1] / 1000} kHz 突出 ≥ ${need} dB`, riseDiff == null || fewSteps ? null : riseDiff >= need,
      riseDiff == null || fewSteps ? `樣本不夠（每種要 ≥ ${TH.stepMinN} 步；${cfg.loud} ${loud.length} 步、${cfg.masked} ${masked.length} 步${riseDiff != null ? '，差 ' + riseDiff + ' dB 只列' : ''}）` :
        `相對前 0.3 秒的上升中位：${cfg.loud} ${rL} dB（${loud.length} 步）、${cfg.masked} ${rM} dB（${masked.length} 步），差 ${riseDiff} dB；絕對峰值 ${mdL} 對 ${mdM} dB（差 ${diff} dB）` +
        (maskedClean.length ? `；合拍腳步中附近沒有顯著鼓點的 ${maskedClean.length} 步峰值中位 ${median(maskedClean.map(x => x.peakDb))} dB` : ''),
      `門檻：每個 cue 後 [−0.005, +0.12] 秒內 ${cfg.band[0]}～${cfg.band[1]} Hz 頻帶的峰值減去前 0.3 秒的平均（＝這一步讓聲音突然多出多少），兩種腳步各取中位，差 ≥ ${need} dB。合拍腳步照設計落在鼓點上，絕對峰值含那一下鼓，所以只列出來對照、不拿來判定。`);
    speaker.steps = { loud, masked, diffDb: diff, riseLoud: rL, riseMasked: rM, riseDiffDb: riseDiff };
  }
}

// ---------- 圖 ----------
const W = Math.max(1000, Math.min(4000, Math.round(DUR * 20))), H = 480;
const xOf = (t) => (t - T0) / DUR * W;
const COLORS = { blind: '#4aa3ff', alert: '#ff9a2e', hunted: '#ff3b30', fake: '#c86bff' };
// 頻譜圖（含座標軸）；喇叭模擬只出這一張（spectrogram-speaker.png），其餘圖與報告由主行程做
spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wavFile, '-lavfi',
  `showspectrumpic=s=${W}x512:legend=1:fscale=log:start=20:stop=16000:color=intensity:gain=1.5`, path.join(dir, SPK ? 'spectrogram-speaker.png' : 'spectrogram.png')]);
// 頻譜圖＋區段（無座標軸，x 與時間線性對應）
if (!SPK) {
  const boxes = [];
  const box = (x, y, w, h, c, t) => boxes.push(`drawbox=x=${Math.round(x)}:y=${y}:w=${Math.max(1, Math.round(w))}:h=${h}:color=${c}:t=${t}`);
  for (const k of ['alert', 'hunted', 'blind', 'fake']) for (const [a, b] of IV[k] || []) {
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
if (!SPK) {
  const top = 30, ph = 300, bottom = top + ph, yOf = (d) => top + (Math.max(-80, Math.min(0, d)) / -80) * ph;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 60}" height="${bottom + 70}" viewBox="0 0 ${W + 60} ${bottom + 70}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11">`);
  parts.push(`<rect width="100%" height="100%" fill="#101218"/><g transform="translate(50,0)">`);
  for (const k of ['alert', 'hunted', 'blind', 'fake']) for (const [a, b] of IV[k] || [])
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
  parts.push(`<text x="0" y="16" fill="#ddd" font-size="12">RMS 50ms (dBFS)   blue=blind  purple=fake drop  orange=alert  red=hunted   ticks: cyan=Risset beats(w&gt;=0.5)  yellow=bass beats  green=detected onsets  magenta=capture gaps</text>`);
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

// ---------- 設定檔的額外一節（例如循環長度統計） ----------
let SUM = null;
if (profile && profile.summary) { try { SUM = profile.summary(TL, meta, EV, IV); } catch (e) { log('summary 失敗', e.message); } }

// ---------- 輸出 ----------
const analysis = { speakerSim: SPK ? { highpassHz: SPEAKER_HP, wav: path.basename(wavFile) } : null, speaker, summary: SUM ? SUM.data : null, coverMode: COVER, coverRows, coverSub, fire: fireInfo, horse: horseInfo, fakeDips, thresholds: TH, durationSec: DUR, startAudioTime: T0, onsets: onsets.length, expectedBeats: expected.length,
  intervals: { blind: IV.blind.length, blindList: IV.blind.map(x => x.map(v => +v.toFixed(3))), fake: (IV.fake || []).map(x => x.map(v => +v.toFixed(3))), alert: IV.alert.map(x => x.map(v => +v.toFixed(2))), hunted: IV.hunted.map(x => x.map(v => +v.toFixed(2))) },
  checks, dips, beatStats, silences, cueCount, fails, gaps: meta.audio.gapList, frames: meta.frames };
fs.writeFileSync(path.join(dir, SPK ? 'analysis-speaker.json' : 'analysis.json'), JSON.stringify(analysis, null, 2));
if (SPK) { for (const c of checks) log(c.pass === true ? '✅ 通過' : c.pass === false ? '❌ 不通過' : '— 無資料', c.name, '—', c.value); process.exit(0); }
// 喇叭模擬：以 --speaker 子行程把同一套檢查跑在 200 Hz 高通後的錄音上，兩組數字並列
let SPEAK = null;
{
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), dir, '--speaker'], { encoding: 'utf8', env: process.env });
  if (r.status === 0 && fs.existsSync(path.join(dir, 'analysis-speaker.json'))) SPEAK = JSON.parse(fs.readFileSync(path.join(dir, 'analysis-speaker.json'), 'utf8'));
  else log('喇叭模擬失敗', (r.stderr || '').slice(0, 300));
}

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
if (exists('spectrogram-marked.png')) L.push('![頻譜圖＋標記](spectrogram-marked.png)', '', '藍＝盲區、紫＝假驟降（照常交接，不該有空檔）、橘＝警戒、紅＝追殺；底部黃色刻度＝低音拍、洋紅＝音訊斷塊。', '');
if (exists('envelope.png')) L.push('![音量包絡](envelope.png)', '');
const spkOf = (id) => SPEAK ? SPEAK.checks.find(x => x.id === id) : null;
L.push('## 自動檢查', '', `| 檢查 | 原始 | 喇叭模擬（${SPEAKER_HP} Hz 高通） | 數字（原始） |`, '|---|---|---|---|');
for (const c of checks) { const sc = spkOf(c.id); L.push(`| ${c.name} | ${mark(c.pass)} | ${sc ? mark(sc.pass) : '—'} | ${c.value} |`); }
L.push('');
L.push(`- 鼓聲模式：**${COVER ? '不中斷（殘響掩護，COVER_MODE = true）：第 1 項改量重合擊與殘響' : '留空檔（舊盲區版，COVER_MODE = false）：第 1 項量盲區壓低'}**；fireSync（火光跟實際速度走）11/10 加。`);
L.push(`- 第 1～6 項是基本檢查；後面 3 項（預告音、低音拍中頻、腳步頻帶差）是「喇叭可聽度」檢查（11/08 加）。「喇叭模擬」欄＝把錄音先過兩級 ${SPEAKER_HP} Hz 高通（24 dB/oct，近似筆電喇叭聽不到的低頻）再跑同一套檢查；「警戒時低頻最突出」在高通後本來就會不通過，看的是其他項在喇叭上還成不成立。`, '');
for (const c of checks) L.push(`- **${c.name}**：${c.detail}`);
L.push('');
if (beatStats.scheduled) L.push(`- 通用對照：偵測到的 ${beatStats.scheduled.onsets} 個起音中，${beatStats.scheduled.within20ms} 個在某個 \`start(when)\` 排程時間 ±20 ms 內（中位 |誤差| ${beatStats.scheduled.medianAbsMs} ms，帶正負號 ${beatStats.scheduled.medianSignedMs} ms）。`, '');
if (COVER && coverRows.length) {
  L.push('### 每次掩護窗（殘響掩護版）', '', `| 窗開始（音訊秒） | 種類 | 窗前 ${TH.coverBand[0]}～${TH.coverBand[1]} Hz dB | 峰值 dB | 突出 dB | 峰值在窗開始後（秒） | 殘響（秒） | 整體比前後 dB | 玩家動作音（不計） |`, '|---|---|---|---|---|---|---|---|---|');
  for (const d of coverRows) L.push(`| ${d.t} | ${d.alertWin ? '警戒（只列）' : '一般'} | ${d.baseDb} | ${d.peakDb} | ${d.riseDb} | ${d.peakAt} | ${d.tailSec} | ${d.louderDb ?? '—'} | ${d.confound.join('、') || '—'} |`);
  L.push('');
}
if (dips.length && !COVER) {
  L.push('### 每次盲區', '', '| 盲區開始（音訊秒） | 長度（秒） | 前 dB | 盲區內 dB | 後 dB | 壓低 dB | 盲區內（含前 0.3 秒）還在響的 |', '|---|---|---|---|---|---|---|');
  for (const d of dips) L.push(`| ${d.t} | ${d.len} | ${d.beforeDb} | ${d.insideDb} | ${d.afterDb} | ${d.dipDb} | ${d.sounding.join('、') || '—'} |`);
  const withBass = dips.filter(d => d.sounding.some(x => x.startsWith('低音拍'))), noBass = dips.filter(d => !d.sounding.some(x => x.startsWith('低音拍')));
  if (withBass.length && noBass.length) L.push('', `- 盲區內有低音拍的 ${withBass.length} 次：中位壓低 ${median(withBass.map(d => d.dipDb))} dB；沒有的 ${noBass.length} 次：中位壓低 ${median(noBass.map(d => d.dipDb))} dB。`);
  L.push('');
}
if (fakeDips.length) {
  L.push('### 每次假驟降（對照：不該有空檔）', '', '| 交接（音訊秒） | 前 dB | 交接後 0.6 秒內 dB | 後 dB | 壓低 dB |', '|---|---|---|---|---|');
  for (const d of fakeDips) L.push(`| ${d.t} | ${d.beforeDb} | ${d.insideDb} | ${d.afterDb} | ${d.dipDb} |`);
  L.push('');
}
if (SPEAK) {
  L.push('## 喇叭可聽度：原始 vs 喇叭模擬', '', `喇叭模擬＝錄音先過兩級 ${SPEAKER_HP} Hz 高通（ffmpeg \`highpass\`，24 dB/oct）；檔案 \`${SPEAK.speakerSim.wav}\`、頻譜圖 \`spectrogram-speaker.png\`。`, '',
    '| 檢查 | 原始 | 喇叭模擬 |', '|---|---|---|');
  for (const c of checks) { const sc = spkOf(c.id); L.push(`| ${c.name} | ${mark(c.pass)}：${c.value} | ${sc ? mark(sc.pass) + '：' + sc.value : '—'} |`); }
  L.push('');
  const sp = speaker;
  if (sp.preBlind && sp.preBlind.rows.length) {
    L.push('### 每次一般盲區前的預告音（1～3 kHz，原始）', '', '| 盲區開始（音訊秒） | 前 1 秒平均 dB | 預告窗峰值 dB | 高出 dB |', '|---|---|---|---|');
    for (const r of sp.preBlind.rows) L.push(`| ${r.t} | ${r.baseDb} | ${r.peakDb} | ${r.riseDb >= 0 ? '+' : ''}${r.riseDb} |`);
    L.push('');
  }
  if (sp.bassMid && sp.bassMid.rows.length) {
    L.push('### 警戒時每個低音拍的中頻（200～600 Hz，原始）', '', '| 拍點（音訊秒） | 前 1 秒背景 dB | 拍點峰值 dB | 高出 dB |', '|---|---|---|---|');
    for (const r of sp.bassMid.rows) L.push(`| ${r.t} | ${r.baseDb} | ${r.peakDb} | ${r.riseDb >= 0 ? '+' : ''}${r.riseDb} |`);
    L.push('');
  }
}
if (SUM) { L.push(`## ${SUM.title}`, '', ...SUM.lines, ''); }
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
