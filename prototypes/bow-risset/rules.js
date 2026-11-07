/*
 * 比箭・Risset 版：規則模組（純邏輯）
 *
 * 不碰 DOM、不碰 three.js、不碰 Web Audio，只有數字進、數字出，之後可以一對一翻成 C#（Unity，用 dspTime 推進）。
 * 瀏覽器：全域 BowRissetRules；Node：module.exports。
 * 規格：docs/design/2026-11-07-risset-bow-vengeance.md 第 2 節。
 *
 * 來源：
 *   上弦、拉弓、彈道、12 孔判定、回合狀態機 —— 複製自 prototypes/bow-contest/rules.js（BowRules），
 *     拿掉呼吸判定、先看求婚者、系列存檔，起鬨改成跟著心跳相位走。
 *   Risset 拍點公式（layerBeats／beatPhases／鐘形音量）—— 複製自 prototypes/troy-prologue/risset.js（RissetRules），
 *     改成「心跳」用：層數、每循環拍數、驟降長度不同，循環長度每一輪縮短。
 *   主題動機 —— 複製自 prototypes/troy-prologue/audio.js 的 THEME（D 多利安「回家的動機」），延伸成 12 音。
 *   不跨資料夾引用：要改兩邊都要改。
 *
 * 座標（公尺、秒、弧度）：同比箭。奧德修斯坐在 z = 0 面向 −z；十二把斧頭 z = −6 … −17；yaw > 0 往左、pitch > 0 往上。
 *
 * 時間：stepRound 的 input.now 是「音訊時鐘」的絕對秒數（AudioContext.currentTime）；給了就以它為準推進 round.clock，
 *   沒給才用 dt。心跳、驟降、起鬨的時刻全部由規則用 round.clock 算出來（heartAt／heartBeatsBetween／heartDropsBetween），
 *   聲音層用「音訊時間 = round.clock + 位移」預先排程，畫面每幀讀 round.heart 跟著演。規則是唯一來源。
 *
 * 心跳（Risset 節奏）【改編】：
 *   沒拉弓：平靜心跳，每 restPeriod 秒一下。
 *   開始拉弓：心跳變成 Risset 節奏。循環 j 從驟降那一刻 S_j 開始、長 C_j 秒；相位 p = (t − S_j) ÷ C_j。
 *     第 k 層第 n 拍在 p = log2(1 + n ÷ (M·2^k))，音量 = 鐘形 bell((k + p) ÷ LAYERS)（同木馬之夜）。
 *     p → 1 時最快的一層最響（最高速），p 跳回 0 的頭 dropLen（0.5）秒不排拍＝驟降：心跳斷掉、全場靜止、準心最穩。
 *   第一次驟降在開始拉弓後 firstDrop 秒（拉弓 1 秒＋拉滿後 2 秒）；之前是一段「預備循環」（j = −1，沒有驟降）。
 *   之後每一輪 C_j = max(cycleMin, cycle0 × cycleMul^(j+1))：越撐越急。
 *
 * 晃動的合成模型（拉滿之後，每一格）：
 *   基本幅度 amp   = ampLow + (ampHigh − ampLow) × p^ampExp（越接近最高速越大）；驟降時 = ampDrop（最小）
 *   疲勞倍率 grow  = 1 + cycleGrow × 已撐過的驟降次數（驟降時只乘一半）
 *   心跳踢一下 kick = 每一拍朝固定的雜湊方向推一下：kick × 該拍音量 × (0.4 + p)，0.02 秒起、kickDecay 衰減
 *   起鬨 heckle    = 每一輪 p 到 cueP 時預告、hitP 時推手（起 0.06 秒、decay 衰減）；驟降時噤聲（乘 0）
 *   最後：sway = amp × grow × 雜訊 + kick + heckle（都再乘帳的倍率 swayMul，這版固定 1）
 *
 * 箭飛行【改編】：慢動作，而且慢動作的速度跟著主題動機的節奏走——穿過第 i 個孔的那一刻剛好奏主題第 i 個音，
 *   第 i 孔到第 i+1 孔之間的真實秒數 = 第 i 個音的時值 × themeUnit。12 孔奏完 12 音。
 *   flightTimeline(shot) 給出「箭的時間 ↔ 真實時間」的分段線性對照，射出那一刻就能把每個音排進音訊時鐘。
 *
 * 出處（CLAUDE.md：經典段落為主、可自由改編）：
 *   比箭、上弦、十二把斧頭、弦聲像燕子、宙斯打雷【經典】（荷馬原典第 21 卷；電影怎麼演【待確認】）
 *   求婚者起鬨【改編】；丟骨頭【原典：第 20 卷克特西波斯朝乞丐丟牛蹄，借來用，只當背景細節】
 *   心跳 Risset 節奏、驟降放箭、慢動作奏主題【改編】
 *   主題動機（回家的動機，木馬之夜的閃回）【改編】
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowRissetRules = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 調整值
  var TUNING = {
    gravity: 9.8,
    shootHeight: 1.1,
    axeCount: 12,
    axeFirst: 6,
    axeSpacing: 1,
    plateHalf: 0.32,
    doorZ: -26,
    speedMin: 20,
    speedMax: 60,
    minFirePower: 0.15,

    difficulties: {
      normal: { label: '普通', holeRadius: 0.110 },
      easy:   { label: '寬鬆', holeRadius: 0.140 },
      hard:   { label: '嚴格', holeRadius: 0.082 }
    },

    // 上弦（同比箭）
    string: {
      fillTime: 3.2, decay: 0.6, zone: 0.4, outLimit: 0.9, handSpan: 4.5,
      driftWave: 3.0, driftNoise: 10.0, damping: 0.985, tensionGain: 1.4,
      shepardOctaves: 3      // 上好弦時謝帕德音階一共爬了幾個八度（聲音層讀）
    },

    aim: { drawSensitivity: 0.55, yawLimit: 0.7, pitchLimit: 0.35 },
    fullDrawRemark: 0.8,

    // 拉弓與晃動
    draw: {
      fillTime: 1.0,
      ampRest: 0.0015,       // 沒拉弓
      ampDraw: 0.0045,       // 拉弓中（還沒拉滿）
      ampLow: 0.0016,        // 拉滿、驟降剛過（p ≈ 0）
      ampHigh: 0.0095,       // 最高速（p → 1）
      ampExp: 1.6,
      ampDrop: 0.0005,       // 驟降：最穩
      cycleGrow: 0.18,       // 每多撐過一次驟降，晃動多 18%
      ampMax: 0.02,
      kick: 0.0032,          // 心跳每一拍推一下（弧度，乘拍的音量與 0.4 + p）
      kickAttack: 0.02,
      kickDecay: 0.09,
      lever: 5,
      freqLow: 1.3,
      freqHigh: 7.5
    },

    // 心跳（Risset）【改編】
    heart: {
      restPeriod: 0.95,      // 平靜心跳間隔
      firstDrop: 3.0,        // 開始拉弓後第一次驟降
      preCycle: 3.6,         // 預備循環長度（開始拉弓時已走了 preCycle − firstDrop 秒）
      cycle0: 3.6,
      cycleMul: 0.9,         // 每一輪縮短 10%
      cycleMin: 2.4,
      dropLen: 0.5,          // 驟降秒數
      layers: 4,
      M: 4,                  // 最慢層每循環拍數
      bellSigma: 0.22,
      minGain: 0.02,
      maxCycles: 60
    },

    // 起鬨【改編】：跟著相位走，最快時起鬨、驟降時噤聲
    heckle: {
      cueP: 0.6,             // 預告（看得到、聽得到）
      hitP: 0.78,            // 真的推手
      jolt: 0.0055,
      shake: 0.5,
      shakeHz: 9,
      attack: 0.06,
      decay: 0.2,
      crowdFrom: 0.45,       // 人聲鼎沸從這個相位開始
      kinds: {
        pound: { label: '拍桌子', size: 0.8, weight: 0.4 },
        jeer:  { label: '噓聲',   size: 0.6, weight: 0.35 },
        bone:  { label: '丟骨頭', size: 1.0, weight: 0.25 }
      }
    },

    // 箭飛行的慢動作
    flight: {
      preScale: 0.15,        // 離第一把斧頭還遠時：遊戲時間 × 0.15
      slowFrom: 1.5,         // 離第一把斧頭幾公尺開始進入慢動作
      leadIn: 0.5,           // 從開始變慢到穿過第一孔的真實秒數
      themeUnit: 0.18,       // 主題一個時值單位的真實秒數
      postScale: 0.12        // 穿過最後一把斧頭之後
    }
  };

  // 主題動機【改編】：木馬之夜的「回家的動機」（D 多利安：D A B A F E D），延伸成 12 音——
  // 前 7 音照原樣，後 5 音把開頭的短句往上推到高八度的 D 收尾（穿過第 12 孔＝回到家）。
  // midi 音高、units 時值（第 i 孔到第 i+1 孔之間的長度）。
  var THEME12 = {
    name: '回家的動機（12 孔版）', source: 'prototypes/troy-prologue/audio.js THEME', mode: 'D 多利安',
    notes: [
      { midi: 62, name: 'D4', units: 2 },
      { midi: 69, name: 'A4', units: 1 },
      { midi: 71, name: 'B4', units: 1 },
      { midi: 69, name: 'A4', units: 2 },
      { midi: 65, name: 'F4', units: 1 },
      { midi: 64, name: 'E4', units: 1 },
      { midi: 62, name: 'D4', units: 2 },
      { midi: 69, name: 'A4', units: 1 },
      { midi: 71, name: 'B4', units: 1 },
      { midi: 74, name: 'D5', units: 2 },
      { midi: 76, name: 'E5', units: 1 },
      { midi: 74, name: 'D5', units: 4 }
    ]
  };

  var DIR_LABEL = { high: '偏高', low: '偏低', left: '偏左', right: '偏右' };

  // ---------------------------------------------------------------- 工具
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  var log2 = function (v) { return Math.log(v) / Math.LN2; };

  function createRng(seed) {
    var a = (seed === undefined ? 1 : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function createNoise(rng) {
    var N = 256, table = new Array(N);
    for (var i = 0; i < N; i++) table[i] = rng() * 2 - 1;
    return function (x) {
      var i0 = Math.floor(x), f = x - i0;
      var a = table[((i0 % N) + N) % N], b = table[(((i0 + 1) % N) + N) % N];
      var u = (1 - Math.cos(f * Math.PI)) * 0.5;
      return a + (b - a) * u;
    };
  }
  // 整數雜湊 → 0..1（每一拍的推手方向固定，不吃亂數，測試可重現）
  function hash01(a, b, c) {
    var h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function holeRadius(difficulty) {
    var d = TUNING.difficulties[difficulty] || TUNING.difficulties.normal;
    return d.holeRadius;
  }
  function axeZ(i) { return -(TUNING.axeFirst + i * TUNING.axeSpacing); }
  function axePositions(offset) {
    var ox = (offset && offset.x) || 0, oy = (offset && offset.y) || 0, out = [];
    for (var i = 0; i < TUNING.axeCount; i++) out.push({ x: ox, y: TUNING.shootHeight + oy, z: axeZ(i) });
    return out;
  }

  // ---------------------------------------------------------------- Risset 拍點公式（複製自 troy-prologue/risset.js）
  /** 第 k 層每循環的拍數 M·2^k。 */
  function layerBeats(k, H) { return (H || TUNING.heart).M * Math.pow(2, k); }
  /** 第 k 層第 n 拍的相位 log2(1 + n ÷ (M·2^k))。 */
  function beatPhase(k, n, H) { return log2(1 + n / layerBeats(k, H)); }
  /** 第 k 層在相位 p 的音量：bell((k + p) ÷ LAYERS)。 */
  function layerGain(k, p, H) {
    H = H || TUNING.heart;
    var d = ((k + p) / H.layers - 0.5) / H.bellSigma;
    return Math.exp(-d * d);
  }

  // ---------------------------------------------------------------- 心跳【改編】
  // heart = { mode: 'rest'|'risset'|'still', t0, seq, cyc: [{s, C}] }（cyc[0] 是預備循環 j = −1）
  var heartSeq = 0;
  function createHeart(mode, t0) {
    var H = TUNING.heart, h = { mode: mode, t0: t0, seq: ++heartSeq, cyc: [] };
    if (mode === 'risset') {
      h.cyc.push({ s: t0 + H.firstDrop - H.preCycle, C: H.preCycle });
      h.cyc.push({ s: t0 + H.firstDrop, C: cycleLen(0) });
    }
    return h;
  }
  /** 第 j 輪（j ≥ 0，從第 j 次驟降開始）的長度。 */
  function cycleLen(j) {
    var H = TUNING.heart;
    return Math.max(H.cycleMin, H.cycle0 * Math.pow(H.cycleMul, j + 1));
  }
  function extendCycles(h, t) {
    var H = TUNING.heart;
    while (h.cyc.length < H.maxCycles) {
      var L = h.cyc[h.cyc.length - 1];
      if (L.s + L.C > t) break;
      h.cyc.push({ s: L.s + L.C, C: cycleLen(h.cyc.length - 1) });
    }
  }
  /**
   * 心跳在時刻 t 的狀態：{ mode, j（第幾輪；−1 = 預備循環）, s, C, p, drop, dropT（驟降已經過幾秒）, nextDrop }
   * rest：p 是平靜心跳的相位；still（箭在飛）：全靜。
   */
  function heartAt(h, t) {
    var H = TUNING.heart;
    if (!h || h.mode === 'still') return { mode: 'still', j: 0, s: 0, C: 1, p: 0, drop: false, dropT: 0, nextDrop: Infinity };
    if (h.mode === 'rest') {
      var u = (t - h.t0) / H.restPeriod, j = Math.floor(u);
      return { mode: 'rest', j: j, s: h.t0 + j * H.restPeriod, C: H.restPeriod, p: u - j, drop: false, dropT: 0, nextDrop: Infinity };
    }
    extendCycles(h, t);
    var i = h.cyc.length - 1;
    while (i > 0 && h.cyc[i].s > t) i--;
    var c = h.cyc[i], p = clamp((t - c.s) / c.C, 0, 1);
    var drop = i >= 1 && t >= c.s && t - c.s < H.dropLen;
    var nd = i >= 1 && t < c.s + H.dropLen ? c.s : c.s + c.C;
    return { mode: 'risset', j: i - 1, s: c.s, C: c.C, p: p, drop: drop, dropT: drop ? t - c.s : 0, nextDrop: nd };
  }
  /**
   * [a, b) 內的心跳拍點，照時間排序。每個 { t, k（層；平靜心跳 = −1）, n, j, p, x（音色位置 0..1）, gain }。
   * Risset：略過音量 < minGain 的拍、驟降裡的拍、開始拉弓之前的拍。
   */
  function heartBeatsBetween(h, a, b) {
    var H = TUNING.heart, out = [];
    if (!h || h.mode === 'still' || !(b > a)) return out;
    if (h.mode === 'rest') {
      for (var m = Math.ceil((a - h.t0) / H.restPeriod - 1e-9); h.t0 + m * H.restPeriod < b; m++) {
        var tr = h.t0 + m * H.restPeriod;
        if (tr >= a) out.push({ t: tr, k: -1, n: m, j: m, p: 0, x: 0.1, gain: 0.55 });
      }
      return out;
    }
    extendCycles(h, b);
    for (var i = 0; i < h.cyc.length; i++) {
      var c = h.cyc[i];
      if (c.s >= b) break;
      if (c.s + c.C <= a) continue;
      for (var k = 0; k < H.layers; k++) {
        var Mk = layerBeats(k, H);
        for (var n = 0; n < Mk; n++) {
          var ph = log2(1 + n / Mk), t = c.s + ph * c.C;
          if (t < a || t >= b || t < h.t0) continue;
          if (i >= 1 && ph * c.C < H.dropLen) continue;
          var g = layerGain(k, ph, H);
          if (g < H.minGain) continue;
          out.push({ t: t, k: k, n: n, j: i - 1, p: ph, x: (k + ph) / H.layers, gain: g });
        }
      }
    }
    out.sort(function (x, y) { return x.t - y.t || x.k - y.k; });
    return out;
  }
  /** [a, b) 內的驟降：[{ t（開始）, end, j }] */
  function heartDropsBetween(h, a, b) {
    var H = TUNING.heart, out = [];
    if (!h || h.mode !== 'risset') return out;
    extendCycles(h, b);
    for (var i = 1; i < h.cyc.length; i++) {
      var s = h.cyc[i].s;
      if (s >= b) break;
      if (s + H.dropLen > a) out.push({ t: s, end: s + H.dropLen, j: i - 1 });
    }
    return out;
  }
  /** 求婚者的人聲（0..1）：最快時鼎沸、驟降時噤聲、沒拉弓時低聲交談、箭在飛時屏息。 */
  function crowdLevel(h, t) {
    var K = TUNING.heckle, hb = heartAt(h, t);
    if (hb.mode === 'still') return 0;
    if (hb.mode === 'rest') return 0.18;
    if (hb.drop) return 0;
    return 0.18 + 0.82 * smooth((hb.p - K.crowdFrom) / (1 - K.crowdFrom));
  }

  // ---------------------------------------------------------------- 上弦（同比箭）
  function createStringState(rng) {
    rng = rng || Math.random;
    return { tension: 0, needle: 0, drift: 0, driftVel: 0, hand: 0, outTime: 0, t: 0,
             wavePhase: rng() * Math.PI * 2, failed: false, done: false, rng: rng };
  }
  function stepString(s, dt, input) {
    if (s.failed || s.done) return s;
    var P = TUNING.string, down = !!(input && input.down), dx = (input && input.dx) || 0;
    s.t += dt;
    var k = 0.6 + P.tensionGain * s.tension;
    var acc = (Math.sin(s.t * 1.9 + s.wavePhase) * P.driftWave + (s.rng() - 0.5) * P.driftNoise) * k;
    if (down) {
      s.driftVel += acc * dt;
      s.driftVel *= Math.pow(P.damping, dt * 60);
      s.drift += s.driftVel * dt;
      s.hand += dx;
      s.tension = Math.min(1, s.tension + dt / P.fillTime);
    } else {
      s.driftVel = 0;
      s.tension = Math.max(0, s.tension - dt * P.decay);
    }
    s.needle = clamp(s.drift - s.hand, -1.2, 1.2);
    s.drift = s.needle + s.hand;
    if (Math.abs(s.needle) >= 1.2) s.driftVel *= -0.3;
    if (down && Math.abs(s.needle) > P.zone) {
      s.outTime += dt;
      if (s.outTime > P.outLimit) s.failed = true;
    } else if (down) {
      s.outTime = Math.max(0, s.outTime - dt * 2);
    }
    if (!s.failed && s.tension >= 1) s.done = true;
    return s;
  }
  /** 謝帕德音階的位置（八度數，無限上爬的錯覺）：張力 × shepardOctaves。 */
  function shepardPos(tension) { return clamp(tension, 0, 1) * TUNING.string.shepardOctaves; }

  // ---------------------------------------------------------------- 拉弓與晃動
  function createDrawState(rng) {
    rng = rng || Math.random;
    var n = [];
    for (var i = 0; i < 8; i++) n.push(createNoise(rng));
    return { drawing: false, power: 0, fullTime: 0, t: 0, phLow: rng() * 100, phHigh: rng() * 100,
             noise: n, amp: TUNING.draw.ampRest, sway: { yaw: 0, pitch: 0, x: 0, y: 0 }, stage: 'idle',
             kick: { yaw: 0, pitch: 0 } };
  }
  /**
   * 這一刻的晃動幅度（弧度）：hb = heartAt(...)。
   * stage：idle 沒拉弓｜drawing 拉弓中｜drop 驟降（最穩）｜rising 加速中｜fast 最高速附近（p ≥ 0.8）
   */
  function swayAmplitude(drawing, power, hb, fatigue) {
    var D = TUNING.draw;
    if (!drawing) return { amp: D.ampRest, stage: 'idle', grow: 1 };
    if (power < 1) return { amp: D.ampDraw, stage: 'drawing', grow: 1 };
    var grow = fatigue === false ? 1 : 1 + D.cycleGrow * Math.max(0, hb.j);
    if (hb.drop) return { amp: D.ampDrop * (1 + (grow - 1) * 0.5), stage: 'drop', grow: grow };
    var amp = Math.min(D.ampMax, (D.ampLow + (D.ampHigh - D.ampLow) * Math.pow(hb.p, D.ampExp)) * grow);
    return { amp: amp, stage: hb.p >= 0.8 ? 'fast' : 'rising', grow: grow };
  }
  /** 心跳推手：t 之前 0.5 秒內所有拍的推力總和（每拍方向由雜湊決定）。 */
  function heartKick(h, t, grow) {
    var D = TUNING.draw, yaw = 0, pitch = 0;
    if (!h || h.mode !== 'risset') return { yaw: 0, pitch: 0 };
    var beats = heartBeatsBetween(h, t - 0.5, t + 1e-9);
    for (var i = 0; i < beats.length; i++) {
      var b = beats[i], u = t - b.t;
      var env = u < D.kickAttack ? u / D.kickAttack : Math.exp(-(u - D.kickAttack) / D.kickDecay);
      if (env < 0.003) continue;
      var A = D.kick * b.gain * (0.4 + b.p) * env * (grow || 1);
      var ang = hash01(b.j + 7, b.k + 3, b.n) * Math.PI * 2;
      yaw += A * Math.cos(ang); pitch += A * Math.sin(ang);
    }
    return { yaw: yaw, pitch: pitch };
  }
  // ctx: { heart, now, fatigue, swayMul }
  function stepDraw(s, dt, input, ctx) {
    var D = TUNING.draw, down = !!(input && input.down);
    ctx = ctx || {};
    var mul = ctx.swayMul !== undefined ? ctx.swayMul : 1;
    s.t += dt;
    if (down) {
      if (!s.drawing) { s.drawing = true; s.power = 0; s.fullTime = 0; }
      s.power = Math.min(1, s.power + dt / D.fillTime);
      if (s.power >= 1) s.fullTime += dt;
    } else if (s.drawing) {
      s.drawing = false; s.power = 0; s.fullTime = 0;
    }
    var hb = heartAt(ctx.heart, ctx.now !== undefined ? ctx.now : s.t);
    var a = swayAmplitude(s.drawing, s.power, hb, ctx.fatigue);
    var amp = a.amp * mul;
    s.amp = amp; s.stage = a.stage; s.hb = hb;
    s.phLow += dt * D.freqLow; s.phHigh += dt * D.freqHigh;
    var kick = s.drawing ? heartKick(ctx.heart, ctx.now !== undefined ? ctx.now : s.t, a.grow) : { yaw: 0, pitch: 0 };
    s.kick = kick;
    var n = s.noise, L = D.lever;
    var fast = s.stage === 'fast' || s.stage === 'rising' ? 0.35 : 0;     // 心跳快時多一點高頻發抖
    function ch(i) { return amp * (n[i](s.phLow) + fast * n[i + 4](s.phHigh)); }
    s.sway.yaw = ch(0) + kick.yaw * mul; s.sway.pitch = ch(1) + kick.pitch * mul;
    s.sway.x = ch(2) * L; s.sway.y = ch(3) * L;
    return s;
  }
  function releaseDraw(s) {
    var out = { fire: s.drawing && s.power >= TUNING.minFirePower, power: s.power, stage: s.stage,
                sway: { yaw: s.sway.yaw, pitch: s.sway.pitch, x: s.sway.x, y: s.sway.y } };
    s.drawing = false; s.power = 0; s.fullTime = 0;
    return out;
  }

  // ---------------------------------------------------------------- 彈道（同比箭）
  function speed(power) {
    var p = clamp(power, 0, 1);
    return TUNING.speedMin + (TUNING.speedMax - TUNING.speedMin) * p * p;
  }
  function aimDir(yaw, pitch) {
    var cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  }
  function makeShot(aim) {
    var sw = aim.sway || { yaw: 0, pitch: 0, x: 0, y: 0 };
    var d = aimDir(aim.yaw + (sw.yaw || 0), aim.pitch + (sw.pitch || 0)), v = speed(aim.power);
    return { origin: { x: sw.x || 0, y: TUNING.shootHeight + (sw.y || 0), z: 0 },
             vel: { x: d.x * v, y: d.y * v, z: d.z * v }, power: aim.power };
  }
  function positionAt(shot, t) {
    var o = shot.origin, v = shot.vel, g = TUNING.gravity;
    return { x: o.x + v.x * t, y: o.y + v.y * t - 0.5 * g * t * t, z: o.z + v.z * t };
  }
  function velocityAt(shot, t) { return { x: shot.vel.x, y: shot.vel.y - TUNING.gravity * t, z: shot.vel.z }; }
  function floorTime(shot) {
    var g = TUNING.gravity, a = -0.5 * g, b = shot.vel.y, c = shot.origin.y;
    return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }
  function simulate(shot, difficulty, offset) {
    var r = holeRadius(difficulty), H = TUNING.shootHeight, events = [];
    var ox = (offset && offset.x) || 0, oy = (offset && offset.y) || 0;
    var tf = floorTime(shot), vz = shot.vel.z;
    for (var i = 0; i < TUNING.axeCount; i++) {
      var t = vz < 0 ? (axeZ(i) - shot.origin.z) / vz : Infinity;
      if (tf < t) {
        return { win: false, passed: i, events: events, endT: tf, power: shot.power,
                 stop: { kind: 'short', axe: i, dir: 'low', t: tf, pos: positionAt(shot, tf) } };
      }
      var p = positionAt(shot, t), dx = p.x - ox, dy = p.y - H - oy;
      if (dx * dx + dy * dy <= r * r) { events.push({ axe: i, t: t, dx: dx, dy: dy }); continue; }
      var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'high' : 'low');
      var wide = Math.abs(dx) > TUNING.plateHalf || Math.abs(dy) > TUNING.plateHalf;
      if (wide && dir === 'low') {
        return { win: false, passed: i, events: events, endT: tf, power: shot.power,
                 stop: { kind: 'short', axe: i, dir: dir, t: tf, pos: positionAt(shot, tf) } };
      }
      if (wide) {
        var td = vz < 0 ? (TUNING.doorZ - shot.origin.z) / vz : Infinity;
        return { win: false, passed: i, events: events, endT: Math.min(tf, td), power: shot.power,
                 stop: { kind: 'wide', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
      }
      return { win: false, passed: i, events: events, endT: t, power: shot.power,
               stop: { kind: 'hit', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
    }
    var tDoor = (TUNING.doorZ - shot.origin.z) / vz, end = Math.min(tf, tDoor);
    return { win: true, passed: TUNING.axeCount, events: events, endT: end, power: shot.power,
             stop: { kind: 'door', axe: TUNING.axeCount, t: end, pos: positionAt(shot, end) } };
  }
  function describe(res) {
    var s = res.stop, n = res.passed;
    if (res.win) return '箭穿過全部十二把斧頭的孔，主題的最後一個音落下，箭直飛出門外。';
    var why = res.power !== undefined && res.power < TUNING.fullDrawRemark ? '弓沒拉滿，' : '';
    if (s.kind === 'short') {
      return n === 0 ? why + '箭往下沉，還沒穿過第一把斧頭就落地了。'
        : '穿過 ' + n + ' 個孔，' + why + '箭往下沉，沒能穿過第 ' + (n + 1) + ' 把斧頭（偏低），落在地上。';
    }
    var w = DIR_LABEL[s.dir];
    if (s.kind === 'wide') return n === 0 ? '箭從第一把斧頭旁邊飛過（' + w + '）。'
      : '穿過 ' + n + ' 個孔，從第 ' + (n + 1) + ' 把斧頭旁邊飛過（' + w + '）。';
    return n === 0 ? why + '箭打在第一把斧頭上（' + w + '）。'
      : '穿過 ' + n + ' 個孔，' + why + '撞在第 ' + (n + 1) + ' 把斧頭上（' + w + '）。';
  }

  // ---------------------------------------------------------------- 箭飛行的慢動作【改編】
  // 回傳分段線性對照 [{a（箭的時間）, r（真實秒數，從射出算）}]，最後一段之後用 postScale。
  function flightTimeline(shot) {
    var F = TUNING.flight, vz = shot.vel.z, pts = [{ a: 0, r: 0 }];
    if (!(vz < 0)) return { pts: pts, post: F.preScale };
    var sp = Math.abs(vz), te = [];
    for (var i = 0; i < TUNING.axeCount; i++) te.push((axeZ(i) - shot.origin.z) / vz);
    var tA = Math.max(0, te[0] - F.slowFrom / sp);
    pts.push({ a: tA, r: tA / F.preScale });
    var r = tA / F.preScale + F.leadIn;
    pts.push({ a: te[0], r: r });
    for (i = 0; i < TUNING.axeCount - 1; i++) {
      r += THEME12.notes[i].units * F.themeUnit;
      pts.push({ a: te[i + 1], r: r });
    }
    return { pts: pts, post: F.postScale };
  }
  function realTimeAt(tl, a) {
    var P = tl.pts;
    for (var i = 1; i < P.length; i++) {
      if (a <= P[i].a) return P[i - 1].r + (a - P[i - 1].a) * (P[i].r - P[i - 1].r) / Math.max(1e-9, P[i].a - P[i - 1].a);
    }
    var L = P[P.length - 1];
    return L.r + (a - L.a) / tl.post;
  }
  function arrowTimeAt(tl, r) {
    var P = tl.pts;
    for (var i = 1; i < P.length; i++) {
      if (r <= P[i].r) return P[i - 1].a + (r - P[i - 1].r) * (P[i].a - P[i - 1].a) / Math.max(1e-9, P[i].r - P[i - 1].r);
    }
    var L = P[P.length - 1];
    return L.a + (r - L.r) * tl.post;
  }

  // ---------------------------------------------------------------- 起鬨（跟著相位）【改編】
  function pickKind(rng) {
    var K = TUNING.heckle.kinds, r = rng(), acc = 0, last = 'pound';
    for (var k in K) { acc += K[k].weight; last = k; if (r < acc) return k; }
    return last;
  }
  function heckleEnvelope(u) {
    var K = TUNING.heckle;
    if (u < 0) return 0;
    if (u < K.attack) return u / K.attack;
    return Math.exp(-(u - K.attack) / K.decay);
  }
  // 這一刻的起鬨偏移；驟降時噤聲（乘 0）
  function heckleOffset(list, t, hb) {
    var K = TUNING.heckle, yaw = 0, pitch = 0;
    if (hb && hb.drop) return { yaw: 0, pitch: 0 };
    for (var i = 0; i < list.length; i++) {
      var e = list[i], u = t - e.hitAt, env = heckleEnvelope(u);
      if (env <= 0.002) continue;
      var A = K.jolt * e.size * env, w = 2 * Math.PI * K.shakeHz * u;
      yaw += A * (e.dir.x + K.shake * Math.sin(w + e.ph));
      pitch += A * (e.dir.y + K.shake * Math.cos(w * 1.3 + e.ph));
    }
    return { yaw: yaw, pitch: pitch };
  }

  // ---------------------------------------------------------------- 一輪（狀態機）
  var TEXT = {
    introString: '求婚者一個接一個都拉不開這把弓。現在輪到乞丐模樣的你。',
    introAim: '弓已上弦。拉弓時心跳會越來越快——等它突然斷掉的那半秒，放手。',
    strung: '弓弦在指下歌唱，聲音像燕子。宙斯在天上打了一聲雷。求婚者臉色都變了。',
    cancel: '放得太早，箭還沒拉開。',
    slipTitle: '弓弦滑掉了',
    slipText: '指針離開亮區太久，弓又彈直了。求婚者哄堂大笑。',
    winTitle: '十二孔，一箭穿過',
    winTail: '大廳裡沒有一個人出聲。',
    missTitle: '沒有成功',
    missTail: '主題斷在半空。求婚者哄堂大笑。',
    dropWord: '心跳斷了——',
    fastWord: '心跳快得撞胸口'
  };

  // options: { difficulty, stringPhase（預設 true）, fatigue（預設 true）, heckle（預設 true）}
  // carry:   { strungOnce } 同一場比試重來時沿用
  // now：建立當下的時鐘（音訊時間，預設 0）
  function createRound(options, rng, carry, now) {
    options = options || {}; rng = rng || Math.random; carry = carry || {};
    now = now || 0;
    var strungOnce = !!carry.strungOnce;
    var needString = options.stringPhase !== false && !strungOnce;
    return {
      phase: needString ? 'string' : 'aim',
      difficulty: options.difficulty || 'normal',
      fatigue: options.fatigue !== false,
      heckleOn: options.heckle !== false,
      swayMul: 1,
      axeOffset: { x: 0, y: 0 },
      needString: needString,
      strungOnce: strungOnce || options.stringPhase === false,
      clock: now,
      heart: createHeart('rest', now),
      hb: null,
      str: createStringState(rng),
      draw: createDrawState(rng),
      aim: { yaw: (rng() - 0.5) * 0.06, pitch: -0.02 + rng() * 0.02 },
      waitRelease: false,
      heckles: [],            // 這次拉弓的起鬨 [{ id, j, kind, size, cueAt, hitAt, dir, ph, who, hit }]
      heckleSeq: 0,
      heckleNow: { yaw: 0, pitch: 0 },
      crowd: 0.18,
      flight: null,
      result: null,
      rng: rng,
      intro: needString ? TEXT.introString : TEXT.introAim
    };
  }
  function aimSensitivity(round) { return round.draw.drawing ? TUNING.aim.drawSensitivity : 1; }

  // 射出：rel 是放手那一刻的快照 { power, sway, stage }
  function fireRound(round, rel) {
    var A = round.aim;
    var shot = makeShot({ yaw: A.yaw, pitch: A.pitch, power: rel.power, sway: rel.sway });
    var res = simulate(shot, round.difficulty, round.axeOffset);
    var tl = flightTimeline(shot);
    var notes = res.events.map(function (e) {
      var nt = THEME12.notes[e.axe];
      return { axe: e.axe, at: realTimeAt(tl, e.t), midi: nt.midi, units: nt.units, name: nt.name };
    });
    round.flight = { shot: shot, res: res, t: 0, real: 0, tl: tl, nextEvent: 0, done: false,
                     firedAt: round.clock, notes: notes, stopAt: realTimeAt(tl, res.endT), stage: rel.stage,
                     heartP: round.hb ? round.hb.p : 0, inDrop: !!(round.hb && round.hb.drop) };
    round.phase = 'flight';
    round.heart = createHeart('still', round.clock);
    round.heckles = [];
    return res;
  }
  function finish(round, win, title, text, reason) {
    round.phase = 'result';
    round.result = { win: win, title: title, text: text, reason: reason,
                     passed: round.flight ? round.flight.res.passed : 0,
                     inDrop: round.flight ? round.flight.inDrop : false, stage: round.flight ? round.flight.stage : '' };
    round.heart = createHeart('rest', round.clock);
    return round.result;
  }

  // input: { now（音訊時鐘秒，可省）, down, stringDx, look: {yaw, pitch} }
  // 回傳事件：'strung'|'slip'|'drawStart'|'fire'|'cancel'|'dropStart'|'dropEnd'|'heckleCue'|'heckleHit'|'pass'|'stop'|'result'
  function stepRound(round, dt, input) {
    input = input || {};
    if (input.now !== undefined && input.now !== null) {
      dt = Math.max(0, input.now - round.clock);
      round.clock = input.now;
    } else round.clock += dt;
    var pdt = Math.min(dt, 0.1), now = round.clock;
    var ev = [], down = !!input.down;
    var prevHb = round.hb;

    if (round.phase === 'string') {
      stepString(round.str, pdt, { down: down, dx: input.stringDx || 0 });
      if (round.str.failed) {
        ev.push({ type: 'slip' });
        ev.push({ type: 'result', result: finish(round, false, TEXT.slipTitle, TEXT.slipText, 'slip') });
      } else if (round.str.done) {
        round.strungOnce = true; round.phase = 'aim'; round.waitRelease = down;
        ev.push({ type: 'strung', text: TEXT.strung });
      }
    } else if (round.phase === 'aim') {
      if (round.waitRelease && !down) round.waitRelease = false;
      var pull = down && !round.waitRelease, d = round.draw;
      var look = input.look;
      if (look) {
        var k = aimSensitivity(round), A = TUNING.aim;
        round.aim.yaw = clamp(round.aim.yaw + (look.yaw || 0) * k, -A.yawLimit, A.yawLimit);
        round.aim.pitch = clamp(round.aim.pitch + (look.pitch || 0) * k, -A.pitchLimit, A.pitchLimit);
      }
      if (d.drawing && !pull) {
        var rel = releaseDraw(d);
        if (rel.fire) { var res = fireRound(round, rel); ev.push({ type: 'fire', res: res, power: rel.power, flight: round.flight, at: now }); }
        else {
          ev.push({ type: 'cancel', text: TEXT.cancel });
          round.heart = createHeart('rest', now); round.heckles = [];
        }
      } else {
        if (pull && !d.drawing) {
          round.heart = createHeart('risset', now); round.heckles = []; prevHb = null;
          ev.push({ type: 'drawStart', at: now });
        }
        stepDraw(d, pdt, { down: pull }, { heart: round.heart, now: now, fatigue: round.fatigue, swayMul: round.swayMul });
        var hb = d.hb;
        if (round.heckleOn && round.heart.mode === 'risset') stepHeckle(round, hb, now, ev);
        var off = round.heckleOn ? heckleOffset(round.heckles, now, hb) : { yaw: 0, pitch: 0 };
        d.sway.yaw += off.yaw; d.sway.pitch += off.pitch;
        round.heckleNow = off;
      }
    } else if (round.phase === 'flight') {
      var f = round.flight;
      f.real += dt;
      f.t = Math.min(f.res.endT, arrowTimeAt(f.tl, f.real));
      while (f.nextEvent < f.res.events.length && f.res.events[f.nextEvent].t <= f.t + 1e-9) {
        var e = f.res.events[f.nextEvent++];
        ev.push({ type: 'pass', axe: e.axe, note: f.notes[e.axe] });
      }
      if (f.t >= f.res.endT) {
        f.done = true;
        ev.push({ type: 'stop', kind: f.res.stop.kind });
        var text = describe(f.res);
        var r = f.res.win ? finish(round, true, TEXT.winTitle, text + TEXT.winTail, 'door')
                          : finish(round, false, TEXT.missTitle, text + TEXT.missTail, f.res.stop.kind);
        ev.push({ type: 'result', result: r });
      }
    }

    // 心跳事件（驟降開始／結束）：規則判定，聲音和畫面跟著
    var hbNow = heartAt(round.heart, now);
    if (round.heart.mode === 'risset') {
      if (hbNow.drop && !(prevHb && prevHb.drop && prevHb.j === hbNow.j)) ev.push({ type: 'dropStart', j: hbNow.j, at: hbNow.s });
      if (prevHb && prevHb.drop && !(hbNow.drop && hbNow.j === prevHb.j)) ev.push({ type: 'dropEnd', j: prevHb.j });
    }
    round.hb = hbNow;
    round.crowd = crowdLevel(round.heart, now);
    return ev;
  }

  // 每一輪 p 到 cueP 預告、hitP 推手（驟降時不會有，因為驟降在 p ≈ 0）
  function stepHeckle(round, hb, now, ev) {
    var K = TUNING.heckle, rng = round.rng;
    var key = hb.j;
    if (hb.p >= K.cueP && !round.heckles.some(function (x) { return x.j === key; })) {
      var kind = pickKind(rng), ang = rng() * Math.PI * 2;
      var e = { id: ++round.heckleSeq, j: key, kind: kind, size: K.kinds[kind].size, cueAt: now,
                hitAt: hb.s + K.hitP * hb.C, dir: { x: Math.cos(ang), y: Math.sin(ang) }, ph: rng() * 6.28,
                who: Math.floor(rng() * 14), hit: false };
      round.heckles.push(e);
      ev.push({ type: 'heckleCue', kind: kind, label: K.kinds[kind].label, who: e.who, id: e.id, lead: Math.max(0, e.hitAt - now) });
    }
    for (var i = 0; i < round.heckles.length; i++) {
      var x = round.heckles[i];
      if (!x.hit && now >= x.hitAt) { x.hit = true; ev.push({ type: 'heckleHit', kind: x.kind, who: x.who, id: x.id }); }
    }
    round.heckles = round.heckles.filter(function (x) { return now < x.hitAt + 2; });
  }

  // ---------------------------------------------------------------- 解算（測試與程式玩家用）
  function solveWindow(power, difficulty, opts) {
    opts = opts || {};
    var off = opts.offset, ox = (off && off.x) || 0;
    var yaw0 = opts.yaw !== undefined ? opts.yaw : -ox / 11.5, sway = opts.sway, step = opts.step || 0.00002;
    var lo = -0.05, hi = 0.12;
    function ok(yaw, pitch) { return simulate(makeShot({ yaw: yaw, pitch: pitch, power: power, sway: sway }), difficulty, off).win; }
    var pMin = null, pMax = null;
    for (var p = lo; p <= hi; p += step) {
      if (ok(yaw0, p)) { if (pMin === null) pMin = p; pMax = p; }
      else if (pMin !== null) break;
    }
    if (pMin === null) return null;
    var pMid = (pMin + pMax) / 2, yMin = null, yMax = null;
    for (var y = yaw0 - 0.03; y <= yaw0 + 0.03; y += step) {
      if (ok(y, pMid)) { if (yMin === null) yMin = y; yMax = y; }
      else if (yMin !== null) break;
    }
    return { pitchMin: pMin, pitchMax: pMax, pitchMid: pMid, yawMin: yMin, yawMax: yMax, yawMid: (yMin + yMax) / 2 };
  }
  var windowCache = {};
  function aimWindow(difficulty) {
    var k = difficulty || 'normal';
    if (!windowCache[k]) windowCache[k] = solveWindow(1, k, { step: 0.00005 });
    return windowCache[k];
  }

  /*
   * 程式玩家（測試、錄音、除錯共用）：回傳一個 next(round, dt) → input 的函式。
   * opts.release：'drop'（預設，等驟降、進去 dropAt 秒後放）｜'peak'（等最高速 p ≥ peakP 時放）
   * opts.dropIndex：等第幾次驟降（預設 0＝第一次）；opts.aimError：瞄準的誤差（弧度，預設 0）
   * 上弦：把指針往中間推；瞄準：直接轉到瞄準窗中心（玩家看得到斧孔，瞄準不是這版要比的）。
   */
  function createBot(opts) {
    opts = opts || {};
    var mode = opts.release || 'drop', dropAt = opts.dropAt !== undefined ? opts.dropAt : 0.15;
    var peakP = opts.peakP !== undefined ? opts.peakP : 0.96, dropIndex = opts.dropIndex || 0;
    var errYaw = (opts.aimError && opts.aimError.yaw) || 0, errPitch = (opts.aimError && opts.aimError.pitch) || 0;
    var st = { released: false };
    return function next(round) {
      var inp = { down: false, stringDx: 0, look: { yaw: 0, pitch: 0 } };
      if (round.phase === 'string') {
        inp.down = true; inp.stringDx = round.str.needle * 0.5;
        st.released = false;
      } else if (round.phase === 'aim') {
        var w = aimWindow(round.difficulty), k = aimSensitivity(round);
        inp.look.yaw = (w.yawMid + errYaw - round.aim.yaw) / k;
        inp.look.pitch = (w.pitchMid + errPitch - round.aim.pitch) / k;
        if (round.waitRelease || st.released) { inp.down = false; return inp; }
        var d = round.draw, hb = round.hb;
        inp.down = true;
        if (d.drawing && d.power >= 1 && hb && hb.mode === 'risset') {
          if (mode === 'drop' && hb.drop && hb.j >= dropIndex && hb.dropT >= dropAt) { inp.down = false; st.released = true; }
          if (mode === 'peak' && !hb.drop && hb.j >= dropIndex - 1 && hb.p >= peakP) { inp.down = false; st.released = true; }
        }
      }
      return inp;
    };
  }
  /** 用程式玩家跑完一輪（固定步長），回傳 { result, round, frames }。 */
  function playRound(options, seed, botOpts, dt) {
    dt = dt || 1 / 60;
    var rng = createRng(seed), round = createRound(options, rng, null, 0), bot = createBot(botOpts), n = 0;
    while (round.phase !== 'result' && n < 60 * 60) {
      stepRound(round, dt, bot(round, dt));
      n++;
    }
    return { result: round.result, round: round, frames: n };
  }

  return {
    TUNING: TUNING, THEME12: THEME12, DIR_LABEL: DIR_LABEL, TEXT: TEXT,
    createRng: createRng, createNoise: createNoise, clamp: clamp, hash01: hash01,
    holeRadius: holeRadius, axeZ: axeZ, axePositions: axePositions,
    // Risset
    layerBeats: layerBeats, beatPhase: beatPhase, layerGain: layerGain,
    createHeart: createHeart, cycleLen: cycleLen, heartAt: heartAt, heartBeatsBetween: heartBeatsBetween,
    heartDropsBetween: heartDropsBetween, crowdLevel: crowdLevel, heartKick: heartKick,
    // 上弦、拉弓
    createStringState: createStringState, stepString: stepString, shepardPos: shepardPos,
    createDrawState: createDrawState, stepDraw: stepDraw, releaseDraw: releaseDraw, swayAmplitude: swayAmplitude,
    // 彈道、飛行
    speed: speed, aimDir: aimDir, makeShot: makeShot, positionAt: positionAt, velocityAt: velocityAt,
    floorTime: floorTime, simulate: simulate, describe: describe, solveWindow: solveWindow, aimWindow: aimWindow,
    flightTimeline: flightTimeline, realTimeAt: realTimeAt, arrowTimeAt: arrowTimeAt,
    // 起鬨
    heckleEnvelope: heckleEnvelope, heckleOffset: heckleOffset,
    // 回合
    createRound: createRound, stepRound: stepRound, fireRound: fireRound, aimSensitivity: aimSensitivity,
    createBot: createBot, playRound: playRound
  };
}));
