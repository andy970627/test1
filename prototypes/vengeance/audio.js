/* 大廳復仇：聲音層（UMD 全域 VengeanceAudio）
 * 純 Web Audio，所有聲音都是程式合成。
 *
 * 來源：以下部分從木馬之夜 prototypes/troy-prologue/audio.js 複製後精簡（不跨資料夾引用，兩邊各自演進）：
 *   - 合成小工具 env／tone／noise、柔性削峰、殘響 makeIR
 *   - 四種打擊 lowDrum／frameDrum／clap／metal 與依「速度位置」交叉混合的 playHit
 *   - 慢低音 bassHit
 *   - 里拉琴（Karplus-Strong）ksBuffer／lyre、號角 horn、主題動機 THEME（當作閃回：回家的動機）
 *   - 倒地悶響 down
 *   - Worker 計時器（25 ms tick，主執行緒 setInterval 備援）＋用 ctx.currentTime 絕對時間預排 0.5 秒
 * 和木馬之夜不同的地方：
 *   - 循環長度固定（規則的 CYCLE = 7.2 秒 = 3 個低音拍），所以拍點直接由 (t0, CYCLE) 算，不需要 anchor 外推與重排。
 *   - 每個循環額外一條「人群低吼」（濾波噪音），音量與亮度隨相位 p 爬升，驟降時一起斷掉：「越近越兇」。
 *   - 沒有音樂層（夜風、低吟、謝帕德）：大廳裡只有打擊、低吼、低音與動作音效，空檔更乾淨。
 *
 * Risset 節奏【改編】：4 層打擊，第 k 層第 n 拍在 p = log2(1 + n ÷ (M·2^k))；音量 = 鐘形 bell((k + p) ÷ 4)。
 *   空檔（驟降，第 1 個循環起每輪開頭 GAP 秒）不排拍，節奏匯流排（含殘響）與低吼壓到幾乎無聲。
 *   低音不經過 gate，是忒勒馬科斯的拍子；網格錯開半拍（t0 + 1.2 + m·2.4），所以空檔裡也沒有低音尾巴。
 *
 * 世界內暗示的聲音（docs/design/2026-11-07-hint-guidance.md 第 4 節）【改編】：
 *   attack_warn：出手前一拍。擲矛＝青銅矛出鞘（刮擦往上滑）、撲上來＝倒吸一口氣＋低吼；都依 data.pan 放在立體聲的那一側。
 *   spear_fly：矛飛過來的破風聲（立體聲，從出手那一側）。
 *   tele_ok：對拍時盾牌「咚」一聲（加在里拉琴前面）。
 *   arrow_land：落地的箭彈了幾下（data.pan、data.dist 給位置）。畫面層保證排在空檔之外。
 *   以上都由畫面層依規則事件呼叫；規則保證預備不在空檔裡，所以這些暗示聲不會蓋住驟降。
 *
 * 介面：
 *   createAudio(ctx, {t0, cycle, gap, bassPeriod, master}) → api
 *   api.setClock({t0, cycle, gap})   重新開局：舊的預排全部靜音，從新的 t0 接著排
 *   api.stopRhythm(dur)              勝利／失敗：打擊、低吼淡出（低音也淡出）
 *   api.cue(name, t, data)           動作音效（t 省略 = 現在）
 *   api.now()  api.destroy()  api.CONST
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VengeanceAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    CYCLE: 7.2, GAP: 0.6, BASS_PERIOD: 2.4, BASS_OFFSET: 1.2,   // 和規則同值；實際以 createAudio 的 opts 為準
    LAYERS: 4, M: 7, BELL_SIGMA: 0.22, MIN_GAIN: 0.02,
    TENSION_LO: 0.7, TENSION_HI: 1.0,          // 節奏匯流排：循環開頭 → 結尾
    GATE_FLOOR: 0.03, GATE_FALL: 0.08, GATE_RISE: 0.12,
    MURMUR_MAX: 0.32,                          // 人群低吼最高音量（p → 1）
    MURMUR_LP_LO: 260, MURMUR_LP_HI: 1100,     // 低吼的低通隨 p 打開
    BASS_GAIN: 0.26,
    LOOKAHEAD: 0.5, TICK_MS: 25, CATCHUP_MAX: 4,
    LYRE_LEN: 1.8, LYRE_DECAY: 0.996, LYRE_VEL: 0.12
  };

  // 主題動機（從木馬之夜複製：回家的動機，D 多利安）。忒勒馬科斯每次對拍舉盾，里拉琴奏下一個音；勝利時號角奏一次。
  var THEME = { name: '回家的動機', notes: [62, 69, 71, 69, 65, 64, 62], units: [2, 1, 1, 2, 1, 1, 4] };
  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function log2(v) { return Math.log(v) / Math.LN2; }

  function createAudio(ctx, opts) {
    opts = opts || {};
    var clk = { t0: opts.t0 != null ? +opts.t0 : ctx.currentTime, T: +opts.cycle || C.CYCLE, gap: opts.gap != null ? +opts.gap : C.GAP };
    var BP = +opts.bassPeriod || C.BASS_PERIOD, BO = opts.bassOffset != null ? +opts.bassOffset : C.BASS_OFFSET;   // 低音網格 = t0 + BO + m·BP（和規則 bass.anchor 一致）
    var sr = ctx.sampleRate, dead = false, stopped = false;

    // ---------- 共用素材（複製自木馬之夜） ----------
    var noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    (function () { var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();
    function makeIR(sec, decay) {
      var len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch), lp = 0;
        for (var i = 0; i < len; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / len, decay); }
      }
      return b;
    }

    // ---------- 匯流排 ----------
    var comp = ctx.createWaveShaper();             // 柔性削峰（±0.6 以內線性），不用有前視延遲的 DynamicsCompressor
    comp.curve = (function () {
      var n = 2048, c = new Float32Array(n);
      for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1, ax = Math.abs(x);
        c[i] = ax <= 0.6 ? x : (x > 0 ? 1 : -1) * (0.6 + 0.4 * Math.tanh((ax - 0.6) / 0.4)); }
      return c;
    })();
    comp.connect(ctx.destination);
    var master = ctx.createGain(); master.gain.value = opts.master != null ? opts.master : 0.8; master.connect(comp);

    // 節奏：rhythmOut（重開局時整條換掉）→ 乾／殘響 → gate（空檔）→ tension（相位）→ fade（勝負淡出）→ master
    var fade = ctx.createGain(); fade.gain.value = 1; fade.connect(master);
    var tension = ctx.createGain(); tension.gain.value = C.TENSION_LO; tension.connect(fade);
    var gate = ctx.createGain(); gate.gain.value = 1; gate.connect(tension);
    var verb = ctx.createConvolver(); verb.buffer = makeIR(2.2, 3);          // 石造大廳
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut); verbOut.connect(gate);
    var rhythmOut = null;
    function newRhythmOut() {
      if (rhythmOut) { try { rhythmOut.disconnect(); } catch (e) {} }
      rhythmOut = ctx.createGain(); rhythmOut.gain.value = 1;
      var dry = ctx.createGain(); dry.gain.value = 0.85; rhythmOut.connect(dry); dry.connect(gate);
      var send = ctx.createGain(); send.gain.value = 0.3; rhythmOut.connect(send); send.connect(verb);
    }
    newRhythmOut();

    // 人群低吼：循環噪音 → 低通（隨 p 打開）→ murmurGain（隨 p 爬升，空檔斷）→ fade
    var murmurSrc = ctx.createBufferSource(); murmurSrc.buffer = noiseBuf; murmurSrc.loop = true;
    var murmurLP = ctx.createBiquadFilter(); murmurLP.type = 'lowpass'; murmurLP.frequency.value = C.MURMUR_LP_LO; murmurLP.Q.value = 0.9;
    var murmurBP = ctx.createBiquadFilter(); murmurBP.type = 'peaking'; murmurBP.frequency.value = 420; murmurBP.gain.value = 6; murmurBP.Q.value = 1.4;
    var murmurGain = ctx.createGain(); murmurGain.gain.value = 0;
    murmurSrc.connect(murmurLP); murmurLP.connect(murmurBP); murmurBP.connect(murmurGain); murmurGain.connect(fade);
    murmurSrc.start();

    // 低音：不經 gate，空檔裡照響
    var bassFade = ctx.createGain(); bassFade.gain.value = 1; bassFade.connect(master);
    var bassBus = ctx.createGain(); bassBus.gain.value = C.BASS_GAIN; bassBus.connect(bassFade);

    // 音效：獨立殘響
    var cueBus = ctx.createGain(); cueBus.gain.value = 1; cueBus.connect(master);
    var cueVerb = ctx.createConvolver(); cueVerb.buffer = makeIR(2.4, 2.6);
    var cueSend = ctx.createGain(); cueSend.gain.value = 0.3; cueBus.connect(cueSend); cueSend.connect(cueVerb);
    var cueVerbOut = ctx.createGain(); cueVerbOut.gain.value = 0.5; cueVerb.connect(cueVerbOut); cueVerbOut.connect(master);

    // ---------- 合成小工具（複製自木馬之夜） ----------
    function env(param, t, peak, att, dec) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
      param.exponentialRampToValueAtTime(0.0001, t + att + dec);
    }
    function tone(dest, t, type, f1, f2, glide, peak, att, dec) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
      env(g.gain, t, peak, att, dec);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + att + dec + 0.05);
      return o;
    }
    function noise(dest, t, ftype, freq, q, peak, att, dec, rate) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; if (rate) s.playbackRate.value = rate;
      f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      env(g.gain, t, peak, att, dec);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random() * 1.5); s.stop(t + att + dec + 0.05);
      return f;
    }

    // ---------- 四種打擊（複製自木馬之夜） ----------
    var INST = [
      function lowDrum(d, t, g) { tone(d, t, 'sine', 96, 48, 0.32, 0.9 * g, 0.003, 0.65); tone(d, t, 'sine', 152, 80, 0.18, 0.22 * g, 0.002, 0.22); noise(d, t, 'lowpass', 260, 0.7, 0.35 * g, 0.002, 0.07); },
      function frameDrum(d, t, g) { tone(d, t, 'sine', 205, 150, 0.12, 0.55 * g, 0.002, 0.26); noise(d, t, 'bandpass', 900, 1.1, 0.55 * g, 0.001, 0.06); },
      function clap(d, t, g) { for (var i = 0; i < 3; i++) noise(d, t + i * 0.011, 'bandpass', 1250, 1.3, 0.5 * g, 0.001, 0.012); noise(d, t + 0.033, 'bandpass', 1150, 1, 0.35 * g, 0.002, 0.09); },
      function metal(d, t, g) {
        var base = 1180, parts = [1, 1.483, 1.932, 2.546, 2.63], amp = [1, 0.6, 0.45, 0.3, 0.25];
        for (var i = 0; i < parts.length; i++) tone(d, t, 'sine', base * parts[i], 0, 0, 0.09 * g * amp[i], 0.001, 0.32 - i * 0.04);
        noise(d, t, 'highpass', 5200, 0.7, 0.08 * g, 0.001, 0.008);
      }
    ];
    function playHit(dest, x, t, g) {
      var pos = clamp(x, 0, 1) * 4 - 0.5;
      var i0 = clamp(Math.floor(pos), 0, 3), i1 = clamp(i0 + 1, 0, 3), w = clamp(pos - i0, 0, 1);
      if (pos < 0) { i0 = i1 = 0; w = 0; }
      if (1 - w > 0.05) INST[i0](dest, t, g * (1 - w));
      if (w > 0.05 && i1 !== i0) INST[i1](dest, t, g * w);
    }
    function bassHit(t) {                    // 慢低音：深鼓＋一聲低吟般的嗡（複製自木馬之夜）
      var d = bassBus;
      tone(d, t, 'sine', 64, 43, 0.45, 0.95, 0.004, 1.15);
      tone(d, t, 'sine', 128, 88, 0.3, 0.25, 0.004, 0.5);
      noise(d, t, 'lowpass', 140, 0.8, 0.4, 0.003, 0.12);
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 1.2);
    }

    // ---------- 里拉琴、號角（複製自木馬之夜） ----------
    var ksCache = {};
    function ksBuffer(midi) {
      if (ksCache[midi]) return ksCache[midi];
      var f = midiHz(midi), N = Math.max(2, Math.round(sr / f - 0.5)), len = Math.floor(sr * C.LYRE_LEN);
      var b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(N), lp = 0, i, peak = 0, dc = 0;
      for (i = 0; i < N; i++) { lp = lp * 0.45 + (Math.random() * 2 - 1) * 0.55; ring[i] = lp; }
      for (i = 0; i < N; i++) dc += ring[i] / N;
      for (i = 0; i < N; i++) ring[i] -= dc;
      var idx = 0;
      for (i = 0; i < len; i++) {
        var cur = ring[idx], nx = ring[(idx + 1) % N];
        d[i] = cur; ring[idx] = C.LYRE_DECAY * 0.5 * (cur + nx); idx = (idx + 1) % N;
        if (Math.abs(cur) > peak) peak = Math.abs(cur);
      }
      var fd = Math.floor(sr * 0.12);
      for (i = 0; i < len; i++) { d[i] /= (peak || 1); if (i > len - fd) d[i] *= (len - i) / fd; }
      ksCache[midi] = { buf: b, rate: f * (N + 0.5) / sr };
      return ksCache[midi];
    }
    function lyre(dest, t, midi, vel) {
      var k = ksBuffer(midi), s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = k.buf; s.playbackRate.value = k.rate; g.gain.value = vel;
      s.connect(g); g.connect(dest); s.start(t); s.stop(t + C.LYRE_LEN);
    }
    function horn(dest, tt, f, dur, pk) {
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), lf = ctx.createOscillator(), lg = ctx.createGain();
      var fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004;
      lf.frequency.value = 5; lg.gain.value = f * 0.006; lf.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      fl.type = 'lowpass'; fl.Q.value = 1.5;
      fl.frequency.setValueAtTime(f * 1.5, tt); fl.frequency.linearRampToValueAtTime(f * 5, tt + Math.min(0.25, dur * 0.4));
      fl.frequency.linearRampToValueAtTime(f * 2, tt + dur);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(pk, tt + Math.min(0.15, dur * 0.3));
      g.gain.setValueAtTime(pk, tt + Math.max(dur - 0.3, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
      [o, o2, lf].forEach(function (n) { n.start(tt); n.stop(tt + dur + 0.05); });
    }

    // ---------- 排程（固定循環：拍點直接由 t0、T 算） ----------
    var bell = function (x) { var d = (x - 0.5) / C.BELL_SIGMA; return Math.exp(-d * d); };
    var tables = [];
    for (var k = 0; k < C.LAYERS; k++) { var Mk = C.M * Math.pow(2, k), a = []; for (var n = 0; n < Mk; n++) a.push(log2(1 + n / Mk)); tables.push(a); }
    var linEnd = 0, autoCycle = -1, bassEnd = 0, log = opts.log ? [] : null;

    function scheduleBeats(a, b) {           // [a, b) 的 Risset 拍
      var T = clk.T, t0 = clk.t0;
      var c0 = Math.max(0, Math.floor((a - t0) / T)), c1 = Math.floor((b - t0) / T);
      for (var c = c0; c <= c1; c++) for (var kk = 0; kk < C.LAYERS; kk++) {
        var tab = tables[kk];
        for (var i = 0; i < tab.length; i++) {
          var p = tab[i], t = t0 + (c + p) * T;
          if (t < a || t >= b) continue;
          if (c >= 1 && p * T < clk.gap) continue;
          var w = bell((kk + p) / C.LAYERS);
          if (w < C.MIN_GAIN) continue;
          playHit(rhythmOut, (kk + p) / C.LAYERS, t, w);
          if (log && log.length < 5000) log.push({ t: t, k: kk, w: w });
        }
      }
    }
    function scheduleAuto(c) {               // 第 c 個循環的 gate／tension／低吼自動化
      var T = clk.T, s = clk.t0 + c * T, e = s + T, g0 = c >= 1 ? s + clk.gap : s;
      if (c >= 1) {
        gate.gain.setValueAtTime(1, Math.max(ctx.currentTime, s - C.GATE_FALL));
        gate.gain.linearRampToValueAtTime(C.GATE_FLOOR, s);
        gate.gain.setValueAtTime(C.GATE_FLOOR, s + clk.gap);
        gate.gain.linearRampToValueAtTime(1, s + clk.gap + C.GATE_RISE);
      }
      tension.gain.setValueAtTime(C.TENSION_LO, g0);
      tension.gain.linearRampToValueAtTime(C.TENSION_HI, e - 0.02);
      // 低吼：空檔後從無聲起，p² 曲線爬升（分 6 段近似），驟降前 0.06 秒斷
      murmurGain.gain.setValueAtTime(0.0001, g0);
      murmurLP.frequency.setValueAtTime(C.MURMUR_LP_LO, g0);
      for (var j = 1; j <= 6; j++) {
        var p = j / 6, tt = s + p * T - (j === 6 ? 0.08 : 0);
        if (tt <= g0) continue;
        murmurGain.gain.linearRampToValueAtTime(C.MURMUR_MAX * p * p + 0.0001, tt);
        murmurLP.frequency.linearRampToValueAtTime(C.MURMUR_LP_LO + (C.MURMUR_LP_HI - C.MURMUR_LP_LO) * p, tt);
      }
      murmurGain.gain.linearRampToValueAtTime(0.0001, e - 0.02);
    }
    function scheduleBass(a, b) {
      var t0 = clk.t0 + BO;
      for (var m = Math.ceil((a - t0) / BP - 1e-9); t0 + m * BP < b; m++) {
        var t = t0 + m * BP;
        if (t >= a && m >= 0) bassHit(t);
      }
    }
    function scheduleTo(end, now) {
      if (stopped || dead) return;
      if (linEnd < now - C.CATCHUP_MAX) linEnd = now - C.CATCHUP_MAX;
      var from = Math.max(linEnd, now);
      if (end > from) { scheduleBeats(from, end); linEnd = end; }
      if (end > bassEnd) { scheduleBass(Math.max(bassEnd, now), end); bassEnd = end; }
      // 自動化：提早 0.3 秒排下一個循環
      var cNext = Math.floor((end + 0.3 - clk.t0) / clk.T);
      while (autoCycle < cNext) { autoCycle++; if (autoCycle >= 0 && clk.t0 + (autoCycle + 1) * clk.T > now) scheduleAuto(autoCycle); }
    }
    function tick() { if (!dead) scheduleTo(ctx.currentTime + C.LOOKAHEAD, ctx.currentTime); }

    // 計時器：Worker 送 tick，主執行緒 setInterval 一直保留當備援（複製自木馬之夜）
    var worker = null, workerURL = null, timer = null;
    function startTimer() {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        try {
          workerURL = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + C.TICK_MS + ');'], { type: 'text/javascript' }));
          worker = new Worker(workerURL);
          worker.onmessage = tick;
          worker.onerror = stopWorker;
        } catch (e) { stopWorker(); }
      }
      timer = setInterval(tick, C.TICK_MS);
    }
    function stopWorker() {
      if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
      if (workerURL) { try { URL.revokeObjectURL(workerURL); } catch (e) {} workerURL = null; }
    }

    function resetAuto(now) {
      [gate.gain, tension.gain, murmurGain.gain, murmurLP.frequency, fade.gain, bassFade.gain].forEach(function (p) { p.cancelScheduledValues(now); });
      gate.gain.setValueAtTime(1, now); tension.gain.setValueAtTime(C.TENSION_LO, now);
      murmurGain.gain.setValueAtTime(0.0001, now); murmurLP.frequency.setValueAtTime(C.MURMUR_LP_LO, now);
      fade.gain.setValueAtTime(1, now); bassFade.gain.setValueAtTime(1, now);
    }

    // ---------- 動作音效 ----------
    var teleN = 0;
    // 立體聲：攻擊從哪邊來，聲音就從哪邊來（pan −1 左 … +1 右）；gain 依距離
    function panDest(pan, gain) {
      var g = ctx.createGain(); g.gain.value = gain == null ? 1 : gain;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.pan.value = clamp(+pan || 0, -1, 1);
        g.connect(p); p.connect(cueBus);
      } else g.connect(cueBus);
      return g;
    }
    function arrowWhoosh(t, k) { noise(cueBus, t, 'bandpass', 2200, 2.5, 0.22 * k, 0.01, 0.16, 1.3); }
    var CUES = {
      shoot: function (t, d) {               // 弓弦一響＋箭破空；空檔外的弓弦更刺耳（暴露）
        var off = d && d.gap === false;
        tone(cueBus, t, 'triangle', off ? 210 : 165, off ? 140 : 110, 0.09, off ? 0.5 : 0.35, 0.002, 0.18);
        noise(cueBus, t, 'bandpass', off ? 3200 : 1800, 3, off ? 0.35 : 0.18, 0.001, 0.05);
        arrowWhoosh(t + 0.02, 1);
      },
      miss: function (t) {                    // 箭撞上石牆、彈落地上
        noise(cueBus, t, 'bandpass', 2600, 4, 0.22, 0.001, 0.05);
        tone(cueBus, t + 0.05, 'square', 900, 700, 0.05, 0.04, 0.001, 0.06);
        noise(cueBus, t + 0.22, 'bandpass', 1800, 3, 0.1, 0.001, 0.05);
      },
      shield_hit: function (t) {              // 箭釘在桌板上：厚木頭的一聲「咚」
        tone(cueBus, t, 'sine', 210, 120, 0.08, 0.6, 0.001, 0.2);
        noise(cueBus, t, 'bandpass', 700, 2, 0.4, 0.001, 0.08);
      },
      down: function (t, d) {                 // 倒地：悶響＋遠遠一點青銅碰撞（複製自木馬之夜，頭目更重）
        var k = d && d.leader ? 1.2 : 0.9;
        tone(cueBus, t + 0.15, 'sine', 75, 38, 0.4, 0.9 * k, 0.004, 0.6);
        noise(cueBus, t + 0.15, 'lowpass', 220, 0.8, 0.6 * k, 0.003, 0.25);
        tone(cueBus, t + 0.24, 'sine', 820, 0, 0, 0.04, 0.001, 0.25);
        tone(cueBus, t + 0.24, 'sine', 1310, 0, 0, 0.025, 0.001, 0.18);
      },
      attack_warn: function (t, d) {          // 預備（出手前一拍）：擲矛＝青銅矛出鞘；撲上來＝倒吸一口氣＋低吼＋踏步。放在出手那一側
        var dst = panDest(d && d.pan, 1);
        if (d && d.kind === 'lunge') {
          var f = noise(dst, t, 'bandpass', 700, 1.6, 0.32, 0.28, 0.12);            // 吸氣：氣流聲往上爬
          f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(1700, t + 0.38);
          noise(dst, t + 0.4, 'bandpass', 380, 3, 0.38, 0.04, 0.3);
          tone(dst, t + 0.4, 'sawtooth', 110, 90, 0.3, 0.08, 0.04, 0.28);
          noise(dst, t + 0.62, 'lowpass', 400, 1, 0.38, 0.002, 0.07);
        } else {
          var sh = noise(dst, t, 'bandpass', 2400, 5, 0.22, 0.03, 0.32);           // 出鞘：金屬刮擦往上滑
          sh.frequency.setValueAtTime(1800, t); sh.frequency.exponentialRampToValueAtTime(6200, t + 0.32);
          tone(dst, t + 0.3, 'sine', 2350, 0, 0, 0.05, 0.002, 0.5);                // 出鞘後矛頭一聲輕鳴
          tone(dst, t + 0.3, 'sine', 3480, 0, 0, 0.025, 0.002, 0.35);
        }
      },
      spear_fly: function (t, d) {             // 矛破空飛來（從出手那一側）
        var dst = panDest(d && d.pan, 1);
        var f = noise(dst, t, 'bandpass', 900, 2, 0.28, 0.2, 0.12, 1.1);
        f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
      },
      arrow_land: function (t, d) {            // 箭落地：木桿在石地上彈兩三下（位置＝落點）
        var dst = panDest(d && d.pan, clamp(3 / ((d && d.dist) || 3), 0.3, 1));
        for (var i = 0; i < 3; i++) {
          var tt = t + i * (0.09 - i * 0.02), k = 1 - i * 0.3;
          tone(dst, tt, 'triangle', 1100 - i * 120, 900 - i * 100, 0.03, 0.07 * k, 0.001, 0.05);
          noise(dst, tt, 'bandpass', 2600, 3, 0.12 * k, 0.001, 0.03);
        }
      },
      dodge: function (t) { noise(cueBus, t, 'bandpass', 600, 1, 0.25, 0.02, 0.18); },   // 衣袍一甩
      dodge_ok: function (t, d) {             // 擦身而過：矛從耳邊呼嘯過去、插進門框
        if (d && d.kind === 'spear') { arrowWhoosh(t - 0.1, 1.4); tone(cueBus, t + 0.05, 'sine', 160, 90, 0.08, 0.5, 0.001, 0.25); }
        else noise(cueBus, t, 'lowpass', 300, 1, 0.5, 0.002, 0.2);
      },
      breath_ok: function (t) { noise(cueBus, t, 'lowpass', 280, 1, 0.55, 0.002, 0.25); tone(cueBus, t, 'sine', 70, 40, 0.3, 0.4, 0.003, 0.3); },  // 撲空撞上門框
      block: function (t) {                   // 青銅盾擋下：鏘
        var part = [1, 1.52, 2.07, 2.7], amp = [1, 0.6, 0.4, 0.25];
        for (var i = 0; i < part.length; i++) tone(cueBus, t, 'sine', 520 * part[i], 0, 0, 0.18 * amp[i], 0.001, 0.9 - i * 0.15);
        noise(cueBus, t, 'bandpass', 2400, 1.5, 0.35, 0.001, 0.06);
      },
      hurt: function (t) {                    // 受傷：悶重一擊＋喘一口
        tone(cueBus, t, 'sine', 90, 45, 0.2, 0.9, 0.002, 0.35);
        noise(cueBus, t, 'lowpass', 500, 1, 0.5, 0.002, 0.15);
        noise(cueBus, t + 0.18, 'bandpass', 900, 1.5, 0.15, 0.05, 0.3);
      },
      tele_ok: function (t) {                 // 忒勒馬科斯舉盾：盾牌「咚」＋盾緣輕碰＋里拉琴奏主題下一個音
        tone(cueBus, t, 'sine', 170, 95, 0.12, 0.45, 0.002, 0.22);               // 咚：厚木包青銅的悶響
        noise(cueBus, t, 'bandpass', 420, 1.5, 0.25, 0.001, 0.06);
        lyre(cueBus, t, THEME.notes[teleN % THEME.notes.length], C.LYRE_VEL * (teleN % THEME.notes.length === 0 ? 1.15 : 1));
        teleN++;
        tone(cueBus, t, 'sine', 640, 0, 0, 0.05, 0.001, 0.3);
      },
      tele_miss: function (t) { teleN = 0; tone(cueBus, t, 'sine', 300, 200, 0.12, 0.12, 0.003, 0.15); noise(cueBus, t, 'bandpass', 500, 2, 0.12, 0.002, 0.08); },
      tele_busy: function (t) { tone(cueBus, t, 'sine', 240, 0, 0, 0.04, 0.002, 0.08); },
      breath_in: function (t) { noise(cueBus, t, 'bandpass', 1400, 1.2, 0.16, 0.05, 0.18); },
      breath_out: function (t) { noise(cueBus, t, 'lowpass', 900, 0.8, 0.08, 0.1, 0.35); },
      gasp: function (t) { for (var i = 0; i < 3; i++) noise(cueBus, t + i * 0.32, 'bandpass', 1100, 1, 0.3, 0.04, 0.22); },
      pick: function (t, d) { var n = Math.min(5, (d && d.n) || 1); for (var i = 0; i < n; i++) tone(cueBus, t + i * 0.05, 'triangle', 1400 + i * 90, 0, 0, 0.03, 0.001, 0.05); },
      pick_none: function () {},
      empty: function (t) { noise(cueBus, t, 'bandpass', 3000, 3, 0.06, 0.001, 0.03); },
      bow_busy: function (t) { tone(cueBus, t, 'triangle', 120, 0, 0, 0.05, 0.002, 0.06); },
      exposed: function () {},
      pre_gap: function () {},
      gap: function () {},
      surrender: function (t, d) {            // 兵器一把把丟在石地上
        var n = Math.min(8, (d && d.count) || 6);
        for (var i = 0; i < n; i++) { var tt = t + 0.3 + i * 0.17 + Math.random() * 0.08; tone(cueBus, tt, 'sine', 700 + Math.random() * 500, 0, 0, 0.05, 0.001, 0.4); noise(cueBus, tt, 'bandpass', 2000, 2, 0.12, 0.001, 0.05); }
      },
      win: function (t) {                     // 號角奏主題（回家的動機）
        var tt = t + 2.2;
        for (var i = 0; i < THEME.notes.length; i++) { var dur = THEME.units[i] * 0.32; horn(cueBus, tt, midiHz(THEME.notes[i] - 12), dur + 0.1, 0.07); tt += dur; }
      },
      fall: function (t) { tone(cueBus, t, 'sine', 60, 30, 0.6, 1, 0.004, 1.2); noise(cueBus, t, 'lowpass', 180, 0.8, 0.7, 0.003, 0.5); }
    };

    startTimer();
    tick();

    return {
      CONST: C, THEME: THEME, log: log,
      now: function () { return ctx.currentTime; },
      setClock: function (o) {
        var now = ctx.currentTime;
        clk.t0 = o.t0 != null ? +o.t0 : now;
        if (o.cycle) clk.T = +o.cycle;
        if (o.gap != null) clk.gap = +o.gap;
        newRhythmOut();                  // 舊的預排接在舊匯流排上，斷開就不出聲
        var oldBass = bassBus; bassBus = ctx.createGain(); bassBus.gain.value = C.BASS_GAIN; bassBus.connect(bassFade);
        try { oldBass.disconnect(); } catch (e) {}
        resetAuto(now);
        stopped = false; linEnd = now; bassEnd = now; autoCycle = Math.floor((now - clk.t0) / clk.T) - 1; teleN = 0;
        tick();
      },
      stopRhythm: function (dur) {
        var now = ctx.currentTime; dur = dur || 0.5; stopped = true;
        [gate.gain, tension.gain, murmurGain.gain, fade.gain, bassFade.gain].forEach(function (p) { p.cancelScheduledValues(now); });
        gate.gain.setValueAtTime(gate.gain.value, now);
        murmurGain.gain.setValueAtTime(murmurGain.gain.value, now); murmurGain.gain.linearRampToValueAtTime(0.0001, now + dur);
        fade.gain.setValueAtTime(fade.gain.value, now); fade.gain.linearRampToValueAtTime(0.0001, now + dur);
        bassFade.gain.setValueAtTime(bassFade.gain.value, now); bassFade.gain.linearRampToValueAtTime(0.0001, now + dur * 3);
      },
      cue: function (name, t, data) {
        var f = CUES[name];
        if (!f || dead) return;
        try { f(t != null ? Math.max(t, ctx.currentTime) : ctx.currentTime, data || {}); } catch (e) {}
      },
      destroy: function () {
        dead = true; stopWorker(); if (timer) clearInterval(timer);
        try { murmurSrc.stop(); } catch (e) {}
        try { master.disconnect(); } catch (e) {}
      }
    };
  }

  return { createAudio: createAudio, CONST: C, THEME: THEME };
});
