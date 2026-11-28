/*
 * 《回家的路》同伴的腳步與聲音（WebAudio 合成，只在瀏覽器用）
 *
 * 岸邊點名和冥府都用這一份：同一個同伴在兩章聽起來一樣。
 * 腳步種類、節奏來自 series.js 的 STEP_KINDS；聲音種類來自 VOICE_KINDS。【改編】
 * 用法：const cv = CrewVoice.create(ac, destination);
 *       cv.walk('limp', ac.currentTime, 2.4, u => pan, u => gain);  // u：0→1 的進度
 *       cv.voice('cough', ac.currentTime + 1, pan, gain);
 */
(function (root) {
  'use strict';

  function create(ac, dest) {
    var noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    function out(pan, gain) {
      var g = ac.createGain(); g.gain.value = gain == null ? 1 : gain;
      if (ac.createStereoPanner) {
        var p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
        g.connect(p); p.connect(dest);
      } else g.connect(dest);
      return g;
    }
    function env(g, t0, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    function noise(t0, dur, type, freq, q, peak, a, o) {
      var s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); if (q) f.Q.value = q;
      var g = ac.createGain(); env(g, t0, a || 0.005, peak, dur);
      s.connect(f); f.connect(g); g.connect(o); s.start(t0); s.stop(t0 + dur + 0.05);
      return f;
    }
    function tone(t0, dur, type, f0, f1, peak, a, o, filt) {
      var osc = ac.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(f0, t0); if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      var g = ac.createGain(); env(g, t0, a || 0.005, peak, dur);
      if (filt) { osc.connect(filt); filt.connect(g); } else osc.connect(g);
      g.connect(o); osc.start(t0); osc.stop(t0 + dur + 0.05);
      return osc;
    }
    function bp(f, q) { var b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q || 4; return b; }

    var BEAT = {
      ring: function (t, o) { noise(t, 0.06, 'lowpass', 700, 0, 0.35, 0, o); tone(t, 0.5, 'sine', 2350, 0, 0.12, 0.002, o); tone(t, 0.4, 'sine', 3120, 0, 0.08, 0.002, o); },
      tap: function (t, o) { noise(t, 0.06, 'bandpass', 1700, 2, 0.5, 0, o); },
      soft: function (t, o) { noise(t, 0.05, 'lowpass', 650, 0, 0.35, 0, o); },
      thud: function (t, o) { tone(t, 0.22, 'sine', 75, 40, 0.7, 0, o); noise(t, 0.1, 'lowpass', 300, 0, 0.4, 0, o); },
      knock: function (t, o) { tone(t, 0.08, 'sine', 620, 480, 0.4, 0, o); noise(t, 0.04, 'bandpass', 950, 6, 0.4, 0, o); },
      slap: function (t, o) { noise(t, 0.035, 'highpass', 1300, 0, 0.45, 0, o); noise(t, 0.08, 'lowpass', 400, 0, 0.3, 0, o); },
      drag: function (t, o) { var f = noise(t, 0.38, 'bandpass', 1400, 1.5, 0.22, 0.08, o); f.frequency.linearRampToValueAtTime(700, t + 0.38); }
    };
    var VOICE = {
      grumble: function (t, o) {
        var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        var osc = tone(t, 1.0, 'sawtooth', 96, 82, 0.35, 0.08, o, lp);
        var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 6.5; lg.gain.value = 18;
        lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 1.05);
      },
      hum: function (t, o) { [220, 247, 196, 220].forEach(function (f, i) { tone(t + i * 0.3, 0.32, 'triangle', f, 0, 0.18, 0.05, o); }); },
      pant: function (t, o) { for (var i = 0; i < 4; i++) noise(t + i * 0.26, 0.18, 'bandpass', i % 2 ? 1000 : 1400, 2, 0.3, 0.04, o); },
      grunt: function (t, o) { tone(t, 0.3, 'sawtooth', 120, 78, 0.4, 0.02, o, bp(520, 3)); },
      whistle: function (t, o) { tone(t, 0.55, 'sine', 1350, 2100, 0.16, 0.05, o); },
      sigh: function (t, o) { var f = noise(t, 1.2, 'bandpass', 950, 1.5, 0.3, 0.35, o); f.frequency.linearRampToValueAtTime(450, t + 1.2); },
      cough: function (t, o) { [0, 0.28].forEach(function (k) { noise(t + k, 0.16, 'bandpass', 750, 2, 0.6, 0.005, o); tone(t + k, 0.12, 'square', 150, 110, 0.12, 0.005, o, bp(600, 2)); }); },
      hiccup: function (t, o) { tone(t, 0.11, 'sine', 300, 720, 0.35, 0.005, o); noise(t, 0.03, 'highpass', 2000, 0, 0.25, 0, o); }
    };

    /** 一下腳步。 */
    function beat(type, t, pan, gain) { (BEAT[type] || BEAT.tap)(t, out(pan, gain)); }
    /** 一段走路：kinds 是 OdysseySeries.STEP_KINDS 的一項；panAt/gainAt 收 0→1 的進度。 */
    function walk(kind, t0, dur, panAt, gainAt) {
      var k = (root.OdysseySeries && root.OdysseySeries.STEP_KINDS[kind]) || { period: 0.6, beats: [[0, 'tap']] };
      for (var c = 0; c * k.period < dur; c++) {
        k.beats.forEach(function (b) {
          var off = c * k.period + b[0];
          if (off >= dur) return;
          var u = off / dur;
          beat(b[1], t0 + off, panAt ? panAt(u) : 0, gainAt ? gainAt(u) : 1);
        });
      }
    }
    function voice(kind, t, pan, gain) { if (VOICE[kind]) VOICE[kind](t, out(pan, gain)); }
    return { beat: beat, walk: walk, voice: voice };
  }

  root.CrewVoice = { create: create };
}(typeof self !== 'undefined' ? self : this));
