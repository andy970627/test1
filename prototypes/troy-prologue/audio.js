/* 特洛伊的迴響：聲音層（UMD 全域 RissetAudio）
 * 純 Web Audio，所有聲音都是程式合成，不載入任何音檔。
 *
 * Risset 節奏【改編】：
 *   - 4 層打擊（k = 0..3），每層在一個循環 T 內速度從 v·2^k 指數加速到 v·2^(k+1)。
 *   - 相位 p = ((t − t0) ÷ T) mod 1，和規則（risset.js）同一條公式。
 *   - 第 k 層第 n 拍落在 p = log2(1 + n ÷ (M·2^k))，n = 0 .. M·2^k − 1。
 *     （速度 f(p) = f0·2^(k+p)，積分後拍數 = M·2^k·(2^p − 1)，M = f0·T ÷ ln2 取整數）
 *     所以每層每個循環剛好整數拍，p = 1 時第 k 層的速度、拍點和下一循環第 k+1 層 p = 0 完全接上。
 *   - 增益是「速度位置」x = (k + p) ÷ 4 的鐘形曲線：最慢的從無聲淡入、最快的淡出到無聲。
 *   - 音色跟著 x 走（低鼓 → 框鼓 → 手拍 → 金屬敲擊），交接時音色也連續，聽起來一直加速卻不會變快。
 *   - 例外（遊戲要的）：p 從接近 1 跳回 0 的 0.5 秒是盲區：不排拍、節奏匯流排（含殘響）壓到幾乎無聲，
 *     只剩夜風與低吟，聽得出「斷掉、空掉 → 現在可以動」。
 *   - p 越大，節奏匯流排越響（0.7 → 1.0），讓「越來越危險」聽得出來。
 *
 * 排程：每一拍都用 ctx.currentTime 的絕對時間預先排程；setInterval 只負責「補排程」（lookahead 0.15 秒），
 *       不負責計時。不使用畫面幀時間。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RissetAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    T: 10,             // 循環週期（秒），規則同值
    BLIND: 0.5,        // 盲區（秒）
    LAYERS: 4,         // 打擊層數
    M: 7,              // 最慢層每循環拍數；f0 = M·ln2 ÷ T ≈ 0.485 拍/秒（29→58 BPM），最快層 233→466 BPM
    BELL_SIGMA: 0.22,  // 鐘形曲線寬度（x 為 0..1）
    MIN_GAIN: 0.02,    // 低於這個增益的拍不排
    TENSION_LO: 0.7,   // 盲區後節奏匯流排起始增益
    TENSION_HI: 1.0,   // p 接近 1 時
    GATE_FLOOR: 0.03,  // 盲區時節奏匯流排殘留增益
    GATE_FALL: 0.08,   // 進盲區前的下滑時間（秒）
    GATE_RISE: 0.12,   // 出盲區後的回升時間（秒）
    LOOKAHEAD: 0.15,   // 預先排程長度（秒）
    TICK_MS: 25,       // 補排程間隔
    BASS_PERIOD: 2.4,  // 低音週期，規則同值
    BASS_BASE: 0.22,   // 巡邏時低音增益
    HUNT_FLOOR: 0.55   // 追殺時每層最低增益（所有層疊加）
  };

  // 各 cue 名稱與別名（規則層的 sfx 名稱不確定時都接得住）
  var CUE_ALIAS = {
    breath: 'breathIn', breathin: 'breathIn', hold: 'breathIn', inhale: 'breathIn',
    breathend: 'breathOut', breathout: 'breathOut', release: 'breathOut', exhale: 'breathOut',
    gasp: 'gasp', pant: 'gasp',
    step: 'step', footstep: 'step', move: 'step',
    latch: 'latch', bolt: 'latch', door: 'latch', push: 'latch',
    down: 'down', thud: 'down', fall: 'down', takedown: 'down', kill: 'down',
    bell: 'bell', alarm: 'bell', alert: 'bell', caught: 'bell', hunted: 'bell',
    blind: 'blind', gap: 'blind',
    win: 'win', victory: 'win', gate: 'win', open: 'win'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function frac(v) { return v - Math.floor(v); }
  function bell(x) { var d = (x - 0.5) / C.BELL_SIGMA; return Math.exp(-d * d); }
  function log2(v) { return Math.log(v) / Math.LN2; }

  function phaseAt(t, T, t0) { return frac((t - t0) / T); }
  // 第 k 層、第 c 個循環的所有拍點（絕對時間），規則與測試可用
  function beatTimes(k, c, T, t0) {
    var Mk = C.M * Math.pow(2, k), out = [];
    for (var n = 0; n < Mk; n++) out.push(t0 + (c + log2(1 + n / Mk)) * T);
    return out;
  }

  function createAudio(ctx, opts) {
    opts = opts || {};
    var T = opts.T || C.T, t0 = (opts.t0 != null) ? opts.t0 : ctx.currentTime;
    var mute = opts.mute || {};          // {rhythm, bass, ambient}：測試用
    var solo = (opts.solo != null) ? opts.solo : null;  // 只放某一層（測試用）
    var log = opts.log ? [] : null;      // 排程紀錄（測試用）
    var sr = ctx.sampleRate;

    // ---------- 共用素材 ----------
    var noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    (function () { var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();

    function makeIR(sec, decay) {
      var len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch), lp = 0;
        for (var i = 0; i < len; i++) {
          lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;      // 稍微悶一點：石牆、夜晚
          d[i] = lp * Math.pow(1 - i / len, decay);
        }
      }
      return b;
    }
    function shaperCurve(k) {
      var n = 1024, c = new Float32Array(n);
      for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
      return c;
    }

    // ---------- 匯流排 ----------
    // 輸出保護用柔性削峰（WaveShaper），不用 DynamicsCompressor：後者內建約 6 ms 前視延遲，會讓拍點整體晚到
    var comp = ctx.createWaveShaper();
    comp.curve = (function () {          // ±0.6 以內完全線性，以上柔性壓到 1
      var n = 2048, c = new Float32Array(n);
      for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1, ax = Math.abs(x);
        c[i] = ax <= 0.6 ? x : (x > 0 ? 1 : -1) * (0.6 + 0.4 * Math.tanh((ax - 0.6) / 0.4)); }
      return c;
    })();
    comp.connect(ctx.destination);
    var master = ctx.createGain(); master.gain.value = (opts.master != null) ? opts.master : 0.8;
    master.connect(comp);

    // 節奏：rhythmBus → 高通（警戒時讓出低頻給低音）→ 乾 / 殘響 / 失真 → gate → master
    var gate = ctx.createGain(); gate.gain.value = 0; gate.connect(master);
    var rhythmBus = ctx.createGain(); rhythmBus.gain.value = mute.rhythm ? 0 : 1;
    var rhythmHP = ctx.createBiquadFilter(); rhythmHP.type = 'highpass'; rhythmHP.frequency.value = 30; rhythmHP.Q.value = 0.5;
    rhythmBus.connect(rhythmHP);
    var dry = ctx.createGain(); dry.gain.value = 0.85; rhythmHP.connect(dry); dry.connect(gate);
    var verb = ctx.createConvolver(); verb.buffer = makeIR(2.4, 3);
    var verbSend = ctx.createGain(); verbSend.gain.value = 0.28; rhythmHP.connect(verbSend); verbSend.connect(verb);
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.6; verb.connect(verbOut); verbOut.connect(gate);
    var shaper = ctx.createWaveShaper(); shaper.curve = shaperCurve(6); shaper.oversample = '2x';
    var distWet = ctx.createGain(); distWet.gain.value = 0; rhythmHP.connect(distWet); distWet.connect(shaper);
    var distOut = ctx.createGain(); distOut.gain.value = 0.5; shaper.connect(distOut); distOut.connect(gate);

    // 失控層：alarmBus → 重失真 → alarmGain → gate（盲區時也要斷）
    var alarmBus = ctx.createGain(); alarmBus.gain.value = mute.rhythm ? 0 : 1;
    var alarmShaper = ctx.createWaveShaper(); alarmShaper.curve = shaperCurve(12); alarmShaper.oversample = '2x';
    var alarmGain = ctx.createGain(); alarmGain.gain.value = 0;
    alarmBus.connect(alarmShaper); alarmShaper.connect(alarmGain); alarmGain.connect(gate);
    var alarmVerb = ctx.createGain(); alarmVerb.gain.value = 0.3; alarmGain.connect(alarmVerb); alarmVerb.connect(verb);

    // 低音：不經過 gate，盲區、警戒都持續，是玩家的參考拍
    var bassBus = ctx.createGain(); bassBus.gain.value = mute.bass ? 0 : 1;
    var bassGain = ctx.createGain(); bassGain.gain.value = C.BASS_BASE;
    bassBus.connect(bassGain); bassGain.connect(master);

    // 音效：獨立殘響，直接到 master
    var cueBus = ctx.createGain(); cueBus.gain.value = 1; cueBus.connect(master);
    var cueVerb = ctx.createConvolver(); cueVerb.buffer = makeIR(2.8, 2.6);
    var cueSend = ctx.createGain(); cueSend.gain.value = 0.35; cueBus.connect(cueSend); cueSend.connect(cueVerb);
    var cueVerbOut = ctx.createGain(); cueVerbOut.gain.value = 0.5; cueVerb.connect(cueVerbOut); cueVerbOut.connect(master);

    // ---------- 合成小工具 ----------
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
      var off = Math.random() * 1.5;
      s.start(t, off); s.stop(t + att + dec + 0.05);
      return f;
    }

    // ---------- 四種打擊（以「速度位置」x 交叉混合） ----------
    var INST = [
      function lowDrum(d, t, g) {        // 低鼓：皮面大鼓，悶而深
        tone(d, t, 'sine', 96, 48, 0.32, 0.9 * g, 0.003, 0.65);
        tone(d, t, 'sine', 152, 80, 0.18, 0.22 * g, 0.002, 0.22);
        noise(d, t, 'lowpass', 260, 0.7, 0.35 * g, 0.002, 0.07);
      },
      function frameDrum(d, t, g) {      // 框鼓：手掌拍皮，中音帶「啪」
        tone(d, t, 'sine', 205, 150, 0.12, 0.55 * g, 0.002, 0.26);
        noise(d, t, 'bandpass', 900, 1.1, 0.55 * g, 0.001, 0.06);
      },
      function clap(d, t, g) {           // 手拍：三次極短的拍 + 尾巴
        for (var i = 0; i < 3; i++) noise(d, t + i * 0.011, 'bandpass', 1250, 1.3, 0.5 * g, 0.001, 0.012);
        noise(d, t + 0.033, 'bandpass', 1150, 1, 0.35 * g, 0.002, 0.09);
      },
      function metal(d, t, g) {          // 金屬敲擊：青銅指鈸，不和諧泛音
        var base = 1180, parts = [1, 1.483, 1.932, 2.546, 2.63], amp = [1, 0.6, 0.45, 0.3, 0.25];
        for (var i = 0; i < parts.length; i++) tone(d, t, 'sine', base * parts[i], 0, 0, 0.09 * g * amp[i], 0.001, 0.32 - i * 0.04);
        noise(d, t, 'highpass', 5200, 0.7, 0.08 * g, 0.001, 0.008);
      }
    ];
    var INST_NAME = ['低鼓', '框鼓', '手拍', '金屬'];
    function playHit(dest, x, t, g) {
      var pos = clamp(x, 0, 1) * 4 - 0.5;           // 0..3 之間線性交叉
      var i0 = clamp(Math.floor(pos), 0, 3), i1 = clamp(i0 + 1, 0, 3), w = clamp(pos - i0, 0, 1);
      if (pos < 0) { i0 = i1 = 0; w = 0; }
      if (1 - w > 0.05) INST[i0](dest, t, g * (1 - w));
      if (w > 0.05 && i1 !== i0) INST[i1](dest, t, g * w);
    }

    function bassHit(t) {                 // 極慢重低音：深鼓 + 一聲低吟般的嗡
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

    // ---------- 環境：夜風 + 低吟 ----------
    var ambient = ctx.createGain(); ambient.gain.value = 0; ambient.connect(master);
    if (!mute.ambient) {
      var w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
      var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8;
      var wl = ctx.createOscillator(); wl.frequency.value = 0.07; var wlg = ctx.createGain(); wlg.gain.value = 220;
      wl.connect(wlg); wlg.connect(wf.frequency);
      var wg = ctx.createGain(); wg.gain.value = 0.022;
      w.connect(wf); wf.connect(wg); wg.connect(ambient); w.start(); wl.start();
      // 低吟：D2、A2 兩條鋸齒，經低通共鳴成「嗯—」的人聲感，緩慢起伏像呼吸
      var chant = ctx.createGain(); chant.gain.value = 0.009;
      var cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 420; cf.Q.value = 5;
      [73.42, 73.9, 110.0].forEach(function (fq) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq; o.connect(cf); o.start(); });
      var cl = ctx.createOscillator(); cl.frequency.value = 0.11; var clg = ctx.createGain(); clg.gain.value = 0.006;
      cl.connect(clg); clg.connect(chant.gain); cl.start();
      cf.connect(chant); chant.connect(ambient);
      ambient.gain.setValueAtTime(0, ctx.currentTime);
      ambient.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    }

    // ---------- 狀態 ----------
    var st = { alarm: 0, hunted: false, bassPeriod: C.BASS_PERIOD, bassAnchor: t0,
               alarmStart: null, alarmNext: 0, lastBass: -1e9 };
    var schedEnd = ctx.currentTime;          // 已排程到哪個時間（不含）
    var gateCycle = null;                    // 已排好 gate 自動化的最後一個循環
    var timer = null, dead = false;

    function cycleIndex(t) { return Math.floor((t - t0) / T); }
    function gateValue(t) {                  // 只用於中途起始時算目前值
      var local = (t - t0) - cycleIndex(t) * T;
      if (local < C.BLIND) return C.GATE_FLOOR;
      if (local < C.BLIND + C.GATE_RISE) return C.GATE_FLOOR + (C.TENSION_LO - C.GATE_FLOOR) * (local - C.BLIND) / C.GATE_RISE;
      if (local < T - C.GATE_FALL) return C.TENSION_LO + (C.TENSION_HI - C.TENSION_LO) * (local - C.BLIND - C.GATE_RISE) / (T - C.GATE_FALL - C.BLIND - C.GATE_RISE);
      return C.TENSION_HI + (C.GATE_FLOOR - C.TENSION_HI) * (local - (T - C.GATE_FALL)) / C.GATE_FALL;
    }
    function scheduleGate(c, from) {
      var cs = t0 + c * T, ev = [
        ['set', cs, C.GATE_FLOOR], ['set', cs + C.BLIND, C.GATE_FLOOR],
        ['lin', cs + C.BLIND + C.GATE_RISE, C.TENSION_LO],
        ['lin', cs + T - C.GATE_FALL, C.TENSION_HI],
        ['lin', cs + T, C.GATE_FLOOR]
      ];
      var p = gate.gain;
      if (from != null) { p.cancelScheduledValues(from); p.setValueAtTime(gateValue(from), from); }
      for (var i = 0; i < ev.length; i++) {
        if (from != null && ev[i][1] <= from) continue;
        if (ev[i][0] === 'set') p.setValueAtTime(ev[i][2], ev[i][1]);
        else p.linearRampToValueAtTime(ev[i][2], ev[i][1]);
      }
      gateCycle = c;
    }

    function scheduleRange(a, b) {
      var nowT = ctx.currentTime - 0.002;
      // gate：目前循環起（中途接上）再到 b 之後的下一個循環
      if (gateCycle == null) scheduleGate(cycleIndex(a), a);
      while (t0 + (gateCycle + 1) * T < b + 0.3) scheduleGate(gateCycle + 1, null);

      var c0 = cycleIndex(a), c1 = cycleIndex(b);
      var nLayers = C.LAYERS + (st.hunted ? 1 : 0);
      for (var k = 0; k < nLayers; k++) {
        if (solo != null && k !== solo) continue;
        var Mk = C.M * Math.pow(2, k);
        for (var c = c0; c <= c1; c++) {
          var cs = t0 + c * T;
          var pa = clamp((a - cs) / T, 0, 1), pb = clamp((b - cs) / T, 0, 1);
          if (pb <= pa) continue;
          var nA = Math.max(0, Math.floor(Mk * (Math.pow(2, pa) - 1)) - 1);
          var nB = Math.min(Mk - 1, Math.ceil(Mk * (Math.pow(2, pb) - 1)) + 1);
          for (var n = nA; n <= nB; n++) {
            var p = log2(1 + n / Mk), t = cs + p * T;
            if (t < a || t >= b || t < nowT) continue;
            if (p * T < C.BLIND) continue;                    // 盲區不排拍
            var x = (k + p) / C.LAYERS, g;
            if (k >= C.LAYERS) g = 0.4;                        // 追殺額外層
            else { g = bell(x); if (st.hunted) g = Math.max(g, C.HUNT_FLOOR); }
            if (g < C.MIN_GAIN) continue;
            g *= 0.95 + Math.random() * 0.1;                  // 只抖音量，不抖時間
            playHit(rhythmBus, x, t, g);
            if (log) log.push({ type: 'beat', k: k, n: n, c: c, t: t, p: p, g: g });
          }
        }
      }

      // 失控層：不規則、越來越快（警戒或追殺時）
      var eff = Math.max(st.alarm, st.hunted ? 0.6 : 0);
      if (eff > 0.02) {
        if (st.alarmStart == null) { st.alarmStart = a; st.alarmNext = Math.max(a, ctx.currentTime); }
        while (st.alarmNext < b) {
          var ta = st.alarmNext, el = ta - st.alarmStart;
          var local = (ta - t0) - cycleIndex(ta) * T;
          if (local >= C.BLIND && ta >= nowT) {
            var xa = 0.45 + Math.random() * 0.5, ga = 0.5 + Math.random() * 0.5;
            playHit(alarmBus, xa, ta, ga);
            if (Math.random() < 0.25) playHit(alarmBus, xa, ta + 0.018 + Math.random() * 0.02, ga * 0.6);  // 亂拍、雙擊
            if (log) log.push({ type: 'alarm', t: ta });
          }
          var rate = 4 + 8 * eff + Math.min(12, el * 1.6);
          st.alarmNext = ta + (1 / rate) * (0.5 + Math.random());
        }
      } else st.alarmStart = null;

      // 低音：拍點 = anchor + n·period
      var per = st.bassPeriod, an = st.bassAnchor;
      for (var m = Math.ceil((a - an) / per - 1e-9); ; m++) {
        var tb = an + m * per;
        if (tb >= b) break;
        if (tb < a || tb < nowT || tb < st.lastBass + per * 0.5) continue;
        bassHit(tb); st.lastBass = tb;
        if (log) log.push({ type: 'bass', t: tb });
      }
    }

    function tick() {
      if (dead) return;
      var end = ctx.currentTime + C.LOOKAHEAD;
      if (schedEnd < ctx.currentTime) schedEnd = ctx.currentTime;   // 分頁被降速後不補排已過去的拍
      if (end > schedEnd) { scheduleRange(schedEnd, end); schedEnd = end; }
    }
    if (opts.autoStart !== false) { tick(); timer = setInterval(tick, C.TICK_MS); }

    // ---------- 音效 ----------
    var CUES = {
      breathIn: function (t) {            // 屏息：急吸一口氣
        var f = noise(cueBus, t, 'bandpass', 600, 1.2, 0.35, 0.25, 0.25);
        f.frequency.exponentialRampToValueAtTime(1700, t + 0.4);
      },
      breathOut: function (t) {           // 憋氣結束：緩緩吐氣
        var f = noise(cueBus, t, 'bandpass', 1300, 0.9, 0.28, 0.05, 0.55);
        f.frequency.exponentialRampToValueAtTime(500, t + 0.55);
      },
      gasp: function (t) {                // 喘氣：大口、連續，故意很響
        for (var i = 0; i < 3; i++) {
          var f = noise(cueBus, t + i * 0.38, 'bandpass', 900, 1, 0.75, 0.04, 0.26);
          f.frequency.exponentialRampToValueAtTime(i % 2 ? 1800 : 450, t + i * 0.38 + 0.28);
          tone(cueBus, t + i * 0.38, 'sawtooth', 140, 110, 0.2, 0.05, 0.03, 0.2);   // 喉音
        }
      },
      step: function (t) {                // 腳步：赤腳／皮鞋踩石板
        noise(cueBus, t, 'lowpass', 380 + Math.random() * 120, 1, 0.45, 0.002, 0.07);
        noise(cueBus, t + 0.004, 'bandpass', 2500, 2, 0.06, 0.001, 0.02);
      },
      latch: function (t) {               // 門閂：木頭摩擦 + 撞擊
        var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 85; lfo.frequency.value = 23; lg.gain.value = 25;
        lfo.connect(lg); lg.connect(o.frequency);
        f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 3;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.06);
        g.gain.setValueAtTime(0.25, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        o.connect(f); f.connect(g); g.connect(cueBus); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
        tone(cueBus, t + 0.42, 'sine', 180, 120, 0.08, 0.5, 0.002, 0.18);
        noise(cueBus, t + 0.42, 'bandpass', 1100, 1.5, 0.4, 0.001, 0.05);
      },
      down: function (t) {                // 倒地：悶響 + 遠遠一點青銅碰撞
        tone(cueBus, t, 'sine', 75, 38, 0.4, 0.9, 0.004, 0.6);
        noise(cueBus, t, 'lowpass', 220, 0.8, 0.6, 0.003, 0.25);
        tone(cueBus, t + 0.09, 'sine', 820, 0, 0, 0.04, 0.001, 0.25);
        tone(cueBus, t + 0.09, 'sine', 1310, 0, 0, 0.025, 0.001, 0.18);
      },
      bell: function (t) {                // 警鐘：青銅鐘，敲三下
        var part = [0.56, 0.92, 1.19, 1.71, 2, 2.74, 3, 3.76], amp = [1, 0.7, 0.6, 0.45, 0.4, 0.25, 0.2, 0.15];
        for (var s = 0; s < 3; s++) for (var i = 0; i < part.length; i++)
          tone(cueBus, t + s * 0.55, 'sine', 330 * part[i], 0, 0, 0.12 * amp[i], 0.002, 2.6 - i * 0.22);
      },
      blind: function (t) {               // 盲區提示：很輕、很悶的一下
        tone(cueBus, t, 'sine', 300, 220, 0.06, 0.05, 0.003, 0.12);
        noise(cueBus, t, 'lowpass', 700, 0.7, 0.03, 0.01, 0.15);
      },
      win: function (t) {                 // 勝利：城門大開（轟隆、木頭呻吟）＋號角
        noise(cueBus, t, 'lowpass', 120, 0.7, 0.8, 0.6, 2.6);
        tone(cueBus, t, 'sine', 45, 38, 2.5, 0.6, 0.5, 2.8);
        CUES.latch(t + 0.1); CUES.latch(t + 0.7);
        function horn(tt, f, dur, pk) {    // 號角：鋸齒＋低通開合＋微顫音
          var o = ctx.createOscillator(), o2 = ctx.createOscillator(), lf = ctx.createOscillator(), lg = ctx.createGain();
          var fl = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004;
          lf.frequency.value = 5; lg.gain.value = f * 0.006; lf.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
          fl.type = 'lowpass'; fl.Q.value = 1.5;
          fl.frequency.setValueAtTime(f * 1.5, tt); fl.frequency.linearRampToValueAtTime(f * 5, tt + 0.25);
          fl.frequency.linearRampToValueAtTime(f * 2, tt + dur);
          g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(pk, tt + 0.15);
          g.gain.setValueAtTime(pk, tt + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
          o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(cueBus);
          [o, o2, lf].forEach(function (n) { n.start(tt); n.stop(tt + dur + 0.05); });
        }
        horn(t + 1.4, 146.8, 1.4, 0.16); horn(t + 2.9, 220, 1.0, 0.16); horn(t + 3.9, 293.7, 2.6, 0.18);
        horn(t + 3.9, 146.8, 2.6, 0.12);
        for (var i = 0; i < 8; i++) CUES._drum(t + 3.9 + i * 0.32, i % 4 === 0 ? 1 : 0.6);
      },
      _drum: function (t, g) { INST[0](cueBus, t, 0.8 * g); }
    };

    // ---------- 對外 ----------
    var api = {
      CONST: C,
      INSTRUMENTS: INST_NAME,
      get T() { return T; }, get t0() { return t0; },
      now: function () { return ctx.currentTime; },
      phase: function (t) { return phaseAt(t == null ? ctx.currentTime : t, T, t0); },
      isBlind: function (t) { t = (t == null ? ctx.currentTime : t); return phaseAt(t, T, t0) * T < C.BLIND; },
      // 讀規則狀態：cycle、alarm、hunted、bass（可以直接傳整個 game）
      update: function (s) {
        if (!s || dead) return;
        var now = ctx.currentTime, k = 0.08;
        if (s.cycle && isFinite(s.cycle.T) && isFinite(s.cycle.t0) &&
            (Math.abs(s.cycle.T - T) > 1e-6 || Math.abs(s.cycle.t0 - t0) > 1e-6)) {
          T = s.cycle.T; t0 = s.cycle.t0; scheduleGate(cycleIndex(schedEnd), schedEnd);
        }
        if (s.bass) {
          if (isFinite(s.bass.period) && s.bass.period > 0) st.bassPeriod = s.bass.period;
          if (isFinite(s.bass.nextBeat)) st.bassAnchor = s.bass.nextBeat;
        }
        var al = clamp(+s.alarm || 0, 0, 1), hu = !!s.hunted;
        if (Math.abs(al - st.alarm) > 1e-4 || hu !== st.hunted) {
          st.alarm = al; st.hunted = hu;
          alarmGain.gain.setTargetAtTime(Math.max(al * 0.9, hu ? 0.6 : 0), now, k);
          distWet.gain.setTargetAtTime(al * 0.55 + (hu ? 0.25 : 0), now, k);
          rhythmHP.frequency.setTargetAtTime(30 + al * 220, now, k);
          bassGain.gain.setTargetAtTime(hu ? 0.6 : C.BASS_BASE + (1 - C.BASS_BASE) * al, now, k);
          rhythmBus.gain.setTargetAtTime(mute.rhythm ? 0 : (hu ? 1.3 : 1), now, k);
        }
      },
      cue: function (name, when) {
        if (dead || !name) return false;
        var key = CUE_ALIAS[String(name).toLowerCase().replace(/[\s_-]/g, '')] || name;
        var fn = CUES[key];
        if (!fn || key.charAt(0) === '_') return false;
        fn(when != null ? when : ctx.currentTime + 0.005);
        return true;
      },
      cueNames: ['breathIn', 'breathOut', 'gasp', 'step', 'latch', 'down', 'bell', 'blind', 'win'],
      setMaster: function (v) { master.gain.setTargetAtTime(clamp(+v || 0, 0, 1.5), ctx.currentTime, 0.03); },
      suspend: function () { return ctx.suspend ? ctx.suspend() : Promise.resolve(); },
      resume: function () { return (ctx.resume ? ctx.resume() : Promise.resolve()).then(function () { tick(); }); },
      // 離線渲染／測試用：一次排到 tEnd
      scheduleUntil: function (tEnd) { if (tEnd > schedEnd) { scheduleRange(schedEnd, tEnd); schedEnd = tEnd; } },
      log: log,
      dispose: function () { dead = true; if (timer) clearInterval(timer); try { master.disconnect(); } catch (e) {} }
    };
    return api;
  }

  return { createAudio: createAudio, phaseAt: phaseAt, beatTimes: beatTimes, CONST: C };
});
