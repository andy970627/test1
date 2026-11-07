/* 比箭・Risset 版：聲音層（UMD 全域 BowRissetAudio）
 * 純 Web Audio，全部程式合成。規格：docs/design/2026-11-07-risset-bow-vengeance.md 第 2 節。
 *
 * 規則是唯一的時間來源（BowRissetRules）：心跳拍點、驟降、求婚者人聲的大小都由規則算，
 * 這裡只用「音訊時間 = 規則時鐘 + offset」預先排程（offset 由畫面層給，開始播放後固定不變）。
 *   - 心跳：follow(heart) 之後，計時器每 25 ms 補排 LOOKAHEAD（0.4 秒）內的拍（rules.heartBeatsBetween）。
 *     heart.seq 一換（開始拉弓、放手、取消）就取消還沒響的拍，從現在重排。
 *   - 驟降：rules.heartAt(...).drop 的那 0.5 秒，人聲、環境聲（火）都用排程好的 ramp 壓到幾乎無聲，心跳本來就不排拍。
 *   - 求婚者人聲：rules.crowdLevel 每 50 ms 一個控制點，linearRamp 接起來。
 *   - 謝帕德音階（上弦）：setShepard(on, pos)，pos 是規則給的八度位置（張力 × 3），6 個八度的鐘形音量，無限上爬的錯覺。
 *   - 主題動機（箭飛行）：playNotes(notes, at)，射出那一刻把穿過的每一孔的音排進音訊時鐘（里拉琴）。
 * 計時器：Worker 裡的 setInterval（25 ms）送 tick（背景分頁不被降速），建不起來就用主執行緒 setInterval，兩邊都只是補排。
 *
 * 來源：
 *   四種打擊（低鼓、框鼓、手拍、金屬）與交叉混合 playHit、里拉琴（Karplus-Strong）、Worker 計時器、謝帕德鐘形
 *     —— 複製自 prototypes/troy-prologue/audio.js（RissetAudio），參數改成心跳用。
 *   弦聲、燕子、雷聲、斧頭鳴響、笑聲、起鬨等效果音 —— 複製自 prototypes/bow-contest/index.html 的 sfx。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowRissetAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    LOOKAHEAD: 0.4,        // 預先排程長度（秒）
    TICK_MS: 25,
    CTRL_STEP: 0.05,       // 人聲、環境聲控制點間隔（秒）
    CANCEL_MARGIN: 0.005,  // 這麼快就要響的拍不取消
    HEART_GAIN: 0.9,       // 心跳匯流排
    REST_GAIN: 0.35,       // 平靜心跳
    CROWD_GAIN: 0.16,      // 人聲（crowdLevel = 1 時）
    AMB_GAIN: 1,           // 環境（火）平時
    AMB_DROP: 0.03,        // 驟降時環境聲（約 −30 dB）
    DROP_FALL: 0.04,       // 進驟降前的下滑（秒）
    SHEP_VOICES: 6,
    SHEP_BASE: 55,         // 最低聲部（A1）
    SHEP_SIGMA: 0.2,
    SHEP_GAIN: 0.03,
    LYRE_LEN: 2.2,
    LYRE_DECAY: 0.996,
    LYRE_VEL: 0.32
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function createAudio(ctx, opts) {
    opts = opts || {};
    var R = opts.rules || (typeof self !== 'undefined' && self.BowRissetRules);
    var sr = ctx.sampleRate;
    var master = ctx.createGain(); master.gain.value = 0.8;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    var heartBus = ctx.createGain(); heartBus.gain.value = C.HEART_GAIN; heartBus.connect(master);
    var crowdBus = ctx.createGain(); crowdBus.gain.value = 0; crowdBus.connect(master);
    var ambBus = ctx.createGain(); ambBus.gain.value = C.AMB_GAIN; ambBus.connect(master);
    var musicBus = ctx.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
    var sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);

    var noiseBuf = ctx.createBuffer(1, sr * 3, sr);
    (function () { var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();

    // ---------- 基本合成 ----------
    function envG(g, t0, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    function osc(type, f, t0, dur, peak, slideTo, dest) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      envG(g, t0, 0.005, peak, dur); o.connect(g); g.connect(dest || sfxBus); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function noise(t0, dur, peak, type, freq, q, dest) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
      envG(g, t0, 0.004, peak, dur); s.connect(f); f.connect(g); g.connect(dest || sfxBus);
      s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.05);
      return f;
    }
    // 打擊用（複製自木馬之夜）：f1 → f2 滑音，attack／decay
    function tone(dest, t, type, f1, f2, glide, peak, att, dec) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t);
      if (f2 && glide) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + att + dec + 0.05);
    }
    function nz(dest, t, ftype, freq, q, peak, att, dec) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + att + dec + 0.05);
    }

    // ---------- 心跳：四種打擊以「速度位置」x 交叉混合（複製自 troy-prologue/audio.js，低鼓改成「撲通」兩下）----------
    var INST = [
      function lowDrum(d, t, g) {        // 心跳：撲（重）—通（輕）
        tone(d, t, 'sine', 92, 46, 0.2, 0.9 * g, 0.003, 0.32);
        nz(d, t, 'lowpass', 220, 0.7, 0.3 * g, 0.002, 0.06);
        tone(d, t + 0.13, 'sine', 80, 44, 0.16, 0.5 * g, 0.003, 0.24);
      },
      function frameDrum(d, t, g) {
        tone(d, t, 'sine', 150, 90, 0.1, 0.6 * g, 0.002, 0.2);
        nz(d, t, 'bandpass', 700, 1.1, 0.35 * g, 0.001, 0.05);
      },
      function clap(d, t, g) {
        tone(d, t, 'sine', 210, 150, 0.06, 0.35 * g, 0.002, 0.1);
        for (var i = 0; i < 2; i++) nz(d, t + i * 0.01, 'bandpass', 1250, 1.3, 0.35 * g, 0.001, 0.014);
      },
      function metal(d, t, g) {          // 最快：血管裡的嗡嗡抽動（青銅指鈸的泛音，壓暗）
        var base = 980, parts = [1, 1.483, 1.932], amp = [1, 0.55, 0.35];
        for (var i = 0; i < parts.length; i++) tone(d, t, 'sine', base * parts[i], 0, 0, 0.07 * g * amp[i], 0.001, 0.12);
        tone(d, t, 'sine', 120, 70, 0.05, 0.3 * g, 0.002, 0.07);
      }
    ];
    function playHit(dest, x, t, g) {
      var pos = clamp(x, 0, 1) * 4 - 0.5;
      var i0 = clamp(Math.floor(pos), 0, 3), i1 = clamp(i0 + 1, 0, 3), w = clamp(pos - i0, 0, 1);
      if (pos < 0) { i0 = i1 = 0; w = 0; }
      if (1 - w > 0.05) INST[i0](dest, t, g * (1 - w));
      if (w > 0.05 && i1 !== i0) INST[i1](dest, t, g * w);
    }

    // ---------- 環境：火的劈啪聲、低底噪（驟降時一起壓掉）----------
    var amb = (function () {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 320; g.gain.value = 0.05;
      s.connect(f); f.connect(g); g.connect(ambBus); s.start();
      return s;
    })();
    function crackle(t) { nz(ambBus, t, 'highpass', 1500 + Math.random() * 2000, 1, 0.03 + Math.random() * 0.05, 0.002, 0.02 + Math.random() * 0.03); }

    // ---------- 求婚者人聲：兩條「ㄚ」共振峰噪音＋慢速起伏（嘈雜交談）----------
    (function () {
      [[480, 0.9], [1150, 0.5], [2400, 0.18]].forEach(function (fm, i) {
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = fm[0]; f.Q.value = 4;
        g.gain.value = fm[1]; lfo.frequency.value = 2.3 + i * 1.7; lg.gain.value = fm[1] * 0.6;
        lfo.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); g.connect(crowdBus); s.start(Math.max(0, ctx.currentTime), i * 0.7); lfo.start();
      });
    })();

    // ---------- 謝帕德音階（上弦）----------
    var shepWave = (function () {
      var re = new Float32Array([0, 1, 0.3, 0.12, 0.05]), im = new Float32Array(re.length);
      return ctx.createPeriodicWave(re, im);
    })();
    var shepLP = ctx.createBiquadFilter(); shepLP.type = 'lowpass'; shepLP.frequency.value = 1800; shepLP.Q.value = 0.5;
    var shepOut = ctx.createGain(); shepOut.gain.value = 0; shepLP.connect(shepOut); shepOut.connect(musicBus);
    var shep = null;
    function ensureShep() {
      if (shep) return shep;
      shep = { gains: [], oscs: [] };
      for (var i = 0; i < C.SHEP_VOICES; i++) {
        var g = ctx.createGain(); g.gain.value = 0; g.connect(shepLP); shep.gains.push(g.gain);
        [-6, 6].forEach(function (cents) {
          var o = ctx.createOscillator(); o.setPeriodicWave(shepWave);
          o.frequency.value = C.SHEP_BASE * Math.pow(2, i); o.detune.value = cents;
          o.connect(g); o.start(); shep.oscs.push({ o: o, off: cents });
        });
      }
      return shep;
    }
    function shepBell(x) { var d = (x - 0.5) / C.SHEP_SIGMA; return Math.exp(-d * d); }
    // on：是否在拉弦；pos：八度位置（規則 shepardPos）；tension 0..1 讓音量、亮度跟著繃緊
    function setShepard(on, pos, tension) {
      ensureShep();
      var t = ctx.currentTime, f = pos - Math.floor(pos);
      for (var i = 0; i < shep.oscs.length; i++) shep.oscs[i].o.detune.setTargetAtTime(1200 * f + shep.oscs[i].off, t, 0.03);
      // 跨八度那一刻 detune 從 1200 跳回 0：鐘形音量讓跳的聲部剛好在邊緣（幾乎無聲），所以聽不出來
      if (f < 0.02 || f > 0.98) for (i = 0; i < shep.oscs.length; i++) shep.oscs[i].o.detune.setValueAtTime(1200 * f + shep.oscs[i].off, t);
      for (i = 0; i < C.SHEP_VOICES; i++) shep.gains[i].setTargetAtTime(C.SHEP_GAIN * shepBell((i + f) / C.SHEP_VOICES), t, 0.03);
      shepOut.gain.setTargetAtTime(on ? 0.6 + 0.6 * clamp(tension || 0, 0, 1) : 0, t, on ? 0.05 : 0.25);
      shepLP.frequency.setTargetAtTime(1200 + 2600 * clamp(tension || 0, 0, 1), t, 0.1);
    }

    // ---------- 里拉琴（Karplus-Strong，複製自木馬之夜）----------
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
      var fade = Math.floor(sr * 0.12);
      for (i = 0; i < len; i++) { d[i] /= (peak || 1); if (i > len - fade) d[i] *= (len - i) / fade; }
      ksCache[midi] = { buf: b, rate: f * (N + 0.5) / sr };
      return ksCache[midi];
    }
    function lyre(dest, t, midi, vel) {
      var k = ksBuffer(midi), s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = k.buf; s.playbackRate.value = k.rate; g.gain.value = vel;
      s.connect(g); g.connect(dest); s.start(t); s.stop(t + C.LYRE_LEN);
      return s;
    }
    var noteNodes = [];
    // notes：[{ axe, at（射出後幾秒）, midi }]；at0：射出那一刻的音訊時間。每個音配一聲斧頭的青銅餘響（很輕）。
    function playNotes(notes, at0) {
      stopNotes();
      notes.forEach(function (n) {
        var t = Math.max(ctx.currentTime, at0 + n.at);
        var g = ctx.createGain(); g.gain.value = 1; g.connect(musicBus);
        lyre(g, t, n.midi, C.LYRE_VEL * (n.axe === 11 ? 1.25 : 1));
        lyre(g, t, n.midi - 12, C.LYRE_VEL * 0.35);
        tone(g, t, 'sine', midiHz(n.midi) * 2.76, 0, 0, 0.012, 0.002, 0.5);
        noteNodes.push({ t: t, g: g });
        if (log) log.push({ type: 'note', t: t, midi: n.midi, axe: n.axe });
      });
      [62, 69, 74].forEach(function (m) { ksBuffer(m); });
    }
    function stopNotes() {
      var now = ctx.currentTime;
      noteNodes.forEach(function (r) { if (r.t > now) { try { r.g.disconnect(); } catch (e) {} } });
      noteNodes = [];
    }

    // ---------- 跟隨規則的心跳 ----------
    var heart = null, seq = -1, offset = 0, upTo = -Infinity, ctrlUpTo = -Infinity, pending = [], crackleNext = 0;
    var log = opts.log ? [] : null;
    function follow(h, off) {
      if (off != null) offset = off;
      heart = h;
      if (h && h.seq !== seq) {
        var now = ctx.currentTime;
        seq = h.seq;
        pending = pending.filter(function (r) {
          if (r.t > now + C.CANCEL_MARGIN) { try { r.out.disconnect(); } catch (e) {} return false; }
          return r.t > now - 1;
        });
        upTo = now - offset;                       // 從現在（規則時鐘）重排
        ctrlUpTo = now;
        [crowdBus.gain, ambBus.gain].forEach(function (p) { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); });
        scheduleTo(now + C.LOOKAHEAD);
      }
    }
    function setOffset(off) { offset = off; }
    function scheduleTo(end) {
      if (!heart || !R) return;
      var now = ctx.currentTime;
      var a = Math.max(upTo, now - offset), b = end - offset;
      if (b > a) {
        var beats = R.heartBeatsBetween(heart, a, b);
        for (var i = 0; i < beats.length; i++) {
          var bt = beats[i], t = bt.t + offset;
          if (t < now) continue;
          var out = ctx.createGain(); out.connect(heartBus);
          var g = bt.k < 0 ? C.REST_GAIN : bt.gain;
          playHit(out, bt.x, t, g);
          pending.push({ t: t, out: out });
          if (log) log.push({ type: 'beat', t: t, gain: +g.toFixed(3), k: bt.k, x: +bt.x.toFixed(3) });
        }
        upTo = b;
      }
      // 人聲、環境聲：控制點（驟降時壓掉）
      var c0 = Math.max(ctrlUpTo, now);
      while (c0 < end) {
        c0 += C.CTRL_STEP;
        var rt = c0 - offset, hb = R.heartAt(heart, rt);
        var dropSoon = hb.mode === 'risset' && (hb.drop || (hb.nextDrop - rt > 0 && hb.nextDrop - rt < C.DROP_FALL));
        crowdBus.gain.linearRampToValueAtTime(C.CROWD_GAIN * (dropSoon ? 0 : R.crowdLevel(heart, rt)), c0);
        ambBus.gain.linearRampToValueAtTime(dropSoon ? C.AMB_DROP : (hb.mode === 'still' ? 0.4 : C.AMB_GAIN), c0);
        if (!dropSoon && hb.mode !== 'still' && c0 > crackleNext && Math.random() < 0.15) { crackle(c0); crackleNext = c0 + 0.1; }
      }
      ctrlUpTo = c0;
      if (pending.length > 400) pending = pending.filter(function (r) { return r.t > now - 1; });
    }
    function tick() { scheduleTo(ctx.currentTime + C.LOOKAHEAD); }
    var worker = null, workerURL = null, timer = null;
    (function startTimer() {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        try {
          workerURL = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + C.TICK_MS + ');'], { type: 'text/javascript' }));
          worker = new Worker(workerURL);
          worker.onmessage = tick;
          worker.onerror = function () { try { worker.terminate(); } catch (e) {} worker = null; };
        } catch (e) { worker = null; }
      }
      timer = setInterval(tick, C.TICK_MS);   // 備援；重複呼叫只是補排
    })();

    // ---------- 效果音（複製自 bow-contest/index.html）----------
    var creak = null;
    function setCreak(level) {
      if (!creak) {
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 6; g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(sfxBus); s.start(); creak = { g: g, f: f };
      }
      creak.g.gain.setTargetAtTime(level * 0.1, ctx.currentTime, 0.05);
      creak.f.frequency.setTargetAtTime(200 + level * 220, ctx.currentTime, 0.1);
    }
    var sfx = {
      twang: function () { var t = ctx.currentTime; osc('sawtooth', 210, t, 0.45, 0.16, 70); osc('triangle', 420, t, 0.25, 0.08, 160); noise(t, 0.08, 0.25, 'bandpass', 1800, 2); },
      swallow: function () { var t = ctx.currentTime; for (var i = 0; i < 3; i++) osc('sine', 2600 + i * 180, t + i * 0.13, 0.11, 0.06, 3400); },
      thunder: function () {
        var t = ctx.currentTime + 0.25;
        var f = noise(t, 3.2, 0.5, 'lowpass', 180, 0.7); f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(70, t + 3);
        noise(t + 0.35, 2.2, 0.3, 'lowpass', 110, 0.7);
      },
      thunk: function () { var t = ctx.currentTime; osc('square', 130, t, 0.18, 0.12, 55); noise(t, 0.12, 0.35, 'lowpass', 900); osc('sine', 880, t, 0.5, 0.03, 860); },
      slip: function () { var t = ctx.currentTime; osc('sawtooth', 300, t, 0.5, 0.12, 60); noise(t, 0.2, 0.2, 'highpass', 2000); },
      land: function () { var t = ctx.currentTime; noise(t, 0.25, 0.25, 'lowpass', 500); osc('triangle', 160, t, 0.15, 0.06, 80); },
      laugh: function () {
        var t0 = ctx.currentTime + 0.15;
        for (var v = 0; v < 5; v++) {
          var base = 150 + Math.random() * 120, start = t0 + v * 0.18 + Math.random() * 0.2, n = 5 + (Math.random() * 4 | 0);
          for (var k = 0; k < n; k++) {
            var t = start + k * (0.12 + Math.random() * 0.03);
            var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(base * (1.15 - k * 0.02), t); o.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.09);
            f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 300; f.Q.value = 3;
            envG(g, t, 0.01, 0.05, 0.1); o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.14);
          }
        }
      },
      win: function (at) { var t = (at || ctx.currentTime) + 0.2; [62, 69, 74].forEach(function (m, i) { osc('sine', midiHz(m), t + i * 0.05, 2.4, 0.05); }); },
      cue: function (kind) {
        var t = ctx.currentTime, f;
        if (kind === 'pound') { noise(t, 0.35, 0.12, 'bandpass', 380, 3); osc('sawtooth', 120, t, 0.3, 0.03, 90); }
        else if (kind === 'jeer') { f = noise(t, 0.5, 0.1, 'bandpass', 2500, 4); f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.45); }
        else { f = noise(t, 0.5, 0.14, 'bandpass', 500, 2); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.48); }
      },
      hit: function (kind) {
        var t = ctx.currentTime, i;
        if (kind === 'pound') { for (i = 0; i < 2; i++) { noise(t + i * 0.16, 0.22, 0.5, 'lowpass', 220); osc('sine', 70, t + i * 0.16, 0.2, 0.2, 45); } osc('sine', 1300, t + 0.02, 0.4, 0.02, 1250); }
        else if (kind === 'jeer') { noise(t, 0.5, 0.18, 'bandpass', 3000, 3); sfx.laugh(); }
        else { for (i = 0; i < 5; i++) { var k = t + i * (0.07 + Math.random() * 0.05); osc('square', 900 + Math.random() * 600, k, 0.05, 0.05, 500); noise(k, 0.04, 0.2, 'highpass', 2500); } }
      }
    };

    return {
      CONST: C, ctx: ctx, now: function () { return ctx.currentTime; },
      follow: follow, setOffset: setOffset, setShepard: setShepard, setCreak: setCreak,
      playNotes: playNotes, stopNotes: stopNotes, sfx: sfx,
      get log() { return log; },
      drainLog: function () { return log ? log.splice(0, log.length) : []; },
      close: function () {
        if (worker) { try { worker.terminate(); } catch (e) {} }
        if (workerURL) { try { URL.revokeObjectURL(workerURL); } catch (e) {} }
        if (timer) clearInterval(timer);
        try { amb.stop(); } catch (e) {}
      }
    };
  }

  return { createAudio: createAudio, CONST: C, midiHz: midiHz };
});
