/*
 * 方向乙「換層」試驗場：聲音層（純 Web Audio 合成）
 *
 * 規格依據：docs/design/2026-11-10-direction-b-layer-sandbox.md 第 5 節
 * 寫法參考：prototypes/troy-prologue/audio.js（排程架構、預排佇列、物理合成）
 *
 * 核心規範：
 *   - 純 Web Audio 合成，不依賴任何外部音檔。
 *   - 節奏拍點與年齡增益全部讀取規則（beatsBetween、gainAt、T），不自行計算相位。
 *   - 排程策略：每 25 ms 預排未來 0.3 秒的拍點（以 ctx.currentTime 絕對時間排定）。
 *   - 鼓聲從頭到尾不中斷，嚴禁任何將鼓聲整體壓低或靜音的排程。
 *   - 筆電喇叭可聽度：剛進場聲部（u < 1.3）增補 400～800 Hz 木頭敲擊成分。
 *   - UMD 架構：瀏覽器全域 LayerRideAudio，Node.js 模組匯出。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LayerRideAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 規格預設靜態事件表（測試與靜態反射用）
  var CUES = {
    window_open: function () {},
    window_close: function () {},
    voice_in: function () {},
    switch_none: function () {},
    switch_ok: function () {},
    switch_off: function () {},
    step_masked: function () {},
    step_loud: function () {},
    guard_hear: function () {},
    caught: function () {},
    win: function () {}
  };

  /** 建立音訊核心模組 */
  function createAudio(ctx, opts) {
    opts = opts || {};
    var rules = opts.rules || (typeof LayerRideRules !== 'undefined' ? LayerRideRules : null);
    if (!ctx) {
      return {
        update: function () {},
        cue: function () {},
        CUES: CUES,
        setMaster: function () {},
        dispose: function () {},
        now: function () { return 0; }
      };
    }

    var sr = ctx.sampleRate || 44100;

    // ---------- 白噪音緩衝區 ----------
    var noiseLen = Math.floor(sr * 2);
    var noiseBuf = ctx.createBuffer(1, noiseLen, sr);
    var nData = noiseBuf.getChannelData(0);
    for (var i = 0; i < noiseLen; i++) {
      nData[i] = Math.random() * 2 - 1;
    }

    // ---------- 簡易殘響脈衝合成 ----------
    function createImpulse(sec, decay) {
      var len = Math.floor(sr * sec);
      var b = ctx.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch);
        var lp = 0;
        for (var j = 0; j < len; j++) {
          lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
          d[j] = lp * Math.pow(1 - j / len, decay);
        }
      }
      return b;
    }

    // ---------- 主混音線路 ----------
    var master = ctx.createGain();
    master.gain.value = opts.master != null ? opts.master : 0.85;
    master.connect(ctx.destination);

    // 鼓聲節奏匯流排（永不斷音、不壓低）
    var drumBus = ctx.createGain();
    drumBus.gain.value = 1.0;
    drumBus.connect(master);

    // 音效匯流排
    var sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);

    // 空間殘響
    var verb = ctx.createConvolver();
    verb.buffer = createImpulse(1.8, 3.5);
    var verbSend = ctx.createGain();
    verbSend.gain.value = 0.22;
    var verbOut = ctx.createGain();
    verbOut.gain.value = 0.4;

    drumBus.connect(verbSend);
    sfxBus.connect(verbSend);
    verbSend.connect(verb);
    verb.connect(verbOut);
    verbOut.connect(master);

    // ---------- 合成輔助工具 ----------
    function env(param, t, peak, att, dec) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
      param.exponentialRampToValueAtTime(0.0001, t + att + dec);
    }

    function playTone(dest, t, type, fStart, fEnd, glide, peak, att, dec) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(fStart, t);
      if (fEnd && fEnd !== fStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t + glide);
      }
      env(g.gain, t, peak, att, dec);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + att + dec + 0.05);
      return osc;
    }

    function playNoise(dest, t, fType, freq, q, peak, att, dec) {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var flt = ctx.createBiquadFilter();
      flt.type = fType;
      flt.frequency.setValueAtTime(freq, t);
      flt.Q.value = q;
      var g = ctx.createGain();
      env(g.gain, t, peak, att, dec);
      src.connect(flt);
      flt.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 1.5);
      src.stop(t + att + dec + 0.05);
      return flt;
    }

    // ---------- 四種打擊音色（隨 u / LAYERS 平滑過渡） ----------
    // 0: 低鼓 (90 Hz)
    function synthLowDrum(t, gain) {
      playTone(drumBus, t, 'sine', 96, 42, 0.22, 0.95 * gain, 0.003, 0.45);
      playNoise(drumBus, t, 'lowpass', 240, 0.8, 0.3 * gain, 0.002, 0.08);
    }

    // 1: 框鼓 (250 Hz)
    function synthFrameDrum(t, gain) {
      playTone(drumBus, t, 'sine', 260, 160, 0.12, 0.6 * gain, 0.002, 0.22);
      playNoise(drumBus, t, 'bandpass', 750, 1.2, 0.5 * gain, 0.001, 0.06);
    }

    // 2: 手拍 (900 Hz)
    function synthHandClap(t, gain) {
      for (var k = 0; k < 3; k++) {
        playNoise(drumBus, t + k * 0.012, 'bandpass', 920, 1.4, 0.45 * gain, 0.001, 0.015);
      }
      playNoise(drumBus, t + 0.035, 'bandpass', 880, 1.0, 0.35 * gain, 0.002, 0.08);
    }

    // 3: 金屬 (3 kHz 附近)
    function synthMetal(t, gain) {
      var base = 1200;
      var ratios = [1, 1.45, 1.95, 2.52];
      var amps = [0.8, 0.6, 0.4, 0.3];
      for (var m = 0; m < ratios.length; m++) {
        playTone(drumBus, t, 'sine', base * ratios[m], 0, 0, 0.1 * gain * amps[m], 0.001, 0.25 - m * 0.04);
      }
      playNoise(drumBus, t, 'highpass', 4500, 0.8, 0.12 * gain, 0.001, 0.012);
    }

    var INSTRUMENTS = [synthLowDrum, synthFrameDrum, synthHandClap, synthMetal];

    /** 依據位置 x (0~1) 進行四音色交叉漸變混合 */
    function playHit(x, t, gain) {
      if (gain < 0.005) return;
      var pos = Math.max(0, Math.min(1, x)) * 3; // 0..3 線性跨接
      var i0 = Math.floor(pos);
      var i1 = Math.min(3, i0 + 1);
      var w = pos - i0;

      if (1 - w > 0.02) {
        INSTRUMENTS[i0](t, gain * (1 - w));
      }
      if (w > 0.02 && i1 !== i0) {
        INSTRUMENTS[i1](t, gain * w);
      }
    }

    /** 剛進場聲部的中頻木頭敲擊（喇叭可聽度強化，400～800 Hz） */
    function playEnterKnock(t, gain) {
      if (gain < 0.005) return;
      playTone(drumBus, t, 'triangle', 620, 380, 0.04, 0.6 * gain, 0.002, 0.05);
      playNoise(drumBus, t, 'bandpass', 580, 2.5, 0.7 * gain, 0.001, 0.04);
    }

    // ---------- 音效合成（依據規格第 5 節清單） ----------

    // step_masked: 很輕的布料腳步（500～900 Hz，音量 0.08）
    function sfxStepMasked(ev) {
      var t = ctx.currentTime;
      playNoise(sfxBus, t, 'bandpass', 680, 1.5, 0.08, 0.005, 0.06);
    }

    // step_loud: 碎石「喀嚓」（1.5～3.5 kHz，音量 0.5）
    function sfxStepLoud(ev) {
      var t = ctx.currentTime;
      playNoise(sfxBus, t, 'bandpass', 2400, 1.8, 0.5, 0.002, 0.09);
      playNoise(sfxBus, t + 0.02, 'highpass', 3000, 1.0, 0.35, 0.002, 0.07);
    }

    // switch_ok: 里拉琴（古希臘弦樂）撥一個音（500～900 Hz）
    function sfxSwitchOk(ev) {
      var t = ctx.currentTime;
      // 587 Hz (D5) 弦樂撥音
      playTone(sfxBus, t, 'triangle', 587, 0, 0, 0.45, 0.003, 0.65);
      playTone(sfxBus, t, 'sine', 1174, 0, 0, 0.18, 0.002, 0.35);
    }

    // switch_off: 腳下一亂的摩擦聲（1～3 kHz）
    function sfxSwitchOff(ev) {
      var t = ctx.currentTime;
      playNoise(sfxBus, t, 'bandpass', 1800, 1.2, 0.45, 0.005, 0.14);
      playNoise(sfxBus, t + 0.03, 'bandpass', 2200, 1.5, 0.35, 0.004, 0.11);
    }

    // switch_none: 很輕的悶聲（300 Hz，音量 0.1）
    function sfxSwitchNone(ev) {
      var t = ctx.currentTime;
      playTone(sfxBus, t, 'sine', 300, 180, 0.08, 0.1, 0.003, 0.08);
    }

    // guard_hear: 衛兵「嗯？」短促一聲，疑心越高越長（200～600 Hz）
    function sfxGuardHear(ev) {
      var t = ctx.currentTime;
      var susp = (ev && ev.susp != null) ? ev.susp : 0.3;
      var dur = 0.12 + Math.min(1, susp) * 0.22;
      playTone(sfxBus, t, 'sawtooth', 220, 380, dur * 0.8, 0.25, 0.01, dur);
    }

    // caught: 短號角下行（300～1200 Hz）
    function sfxCaught(ev) {
      var t = ctx.currentTime;
      // 下行三音：A4 -> F4 -> D4
      var notes = [440, 349, 293];
      for (var idx = 0; idx < notes.length; idx++) {
        var nt = t + idx * 0.2;
        playTone(sfxBus, nt, 'sawtooth', notes[idx], notes[idx] * 0.98, 0.18, 0.4, 0.015, 0.28);
      }
    }

    // win: 短號角上行（300～1200 Hz）
    function sfxWin(ev) {
      var t = ctx.currentTime;
      // 上行三音：D4 -> F4 -> A4 -> D5
      var notes = [293, 349, 440, 587];
      for (var idx = 0; idx < notes.length; idx++) {
        var nt = t + idx * 0.18;
        playTone(sfxBus, nt, 'sawtooth', notes[idx], notes[idx] * 1.02, 0.22, 0.42, 0.015, 0.32);
      }
    }

    // 建立實體 cue 派發字典
    var cueMap = {
      window_open: function (e) {},
      window_close: function (e) {},
      voice_in: function (e) {},
      switch_none: sfxSwitchNone,
      switch_ok: sfxSwitchOk,
      switch_off: sfxSwitchOff,
      step_masked: sfxStepMasked,
      step_loud: sfxStepLoud,
      guard_hear: sfxGuardHear,
      caught: sfxCaught,
      win: sfxWin
    };

    function cue(event) {
      if (!event || !event.type) return;
      var fn = cueMap[event.type];
      if (typeof fn === 'function') {
        fn(event);
      }
    }

    // ---------- 排程系統（每 25 ms 預排未來 0.3 秒的拍點） ----------
    var lastScheduledT = ctx.currentTime;
    var currentGame = null;
    var timerId = null;

    function scheduleBeats() {
      if (!currentGame || !rules) return;
      var now = ctx.currentTime;
      var lookahead = 0.3; // 預排 0.3 秒
      var targetT = now + lookahead;

      if (targetT <= lastScheduledT) return;

      var beats = rules.beatsBetween(lastScheduledT, targetT, currentGame);
      var rideId = currentGame.ride ? currentGame.ride.id : null;
      var boostMul = Math.pow(10, (currentGame.T.RIDE_BOOST_DB || 2) / 20);

      for (var b = 0; b < beats.length; b++) {
        var item = beats[b];
        var isRidden = (item.id === rideId);
        var u = rules.voiceU(item.id, item.t, currentGame);
        var x = u / currentGame.T.LAYERS;
        var gain = item.gain * (isRidden ? boostMul : 1.0);

        playHit(x, item.t, gain);

        // 剛進場聲部 (u < 1.3) 疊加中頻木頭敲擊
        if (u < 1.3) {
          var knockGain = item.gain * (currentGame.T.ENTER_KNOCK_GAIN || 0.5);
          playEnterKnock(item.t, knockGain);
        }
      }

      lastScheduledT = targetT;
    }

    timerId = setInterval(scheduleBeats, 25);

    function update(game) {
      currentGame = game;
      // 每一幀檢查並及時推進排程
      scheduleBeats();
    }

    function setMaster(v) {
      if (master) {
        master.gain.setValueAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime);
      }
    }

    function dispose() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      try {
        master.disconnect();
      } catch (e) {}
    }

    function now() {
      return ctx.currentTime;
    }

    return {
      update: update,
      cue: cue,
      CUES: cueMap,
      setMaster: setMaster,
      dispose: dispose,
      now: now
    };
  }

  return {
    createAudio: createAudio,
    CUES: CUES
  };
});
