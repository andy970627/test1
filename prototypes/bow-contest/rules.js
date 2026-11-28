/*
 * 伊薩卡比箭：規則模組（純邏輯）
 *
 * 不碰 DOM、不碰 three.js，只有數字進、數字出，之後可以一對一翻成 C#（Unity）。
 * 瀏覽器：全域 BowRules；Node：module.exports。
 *
 * 座標（公尺、秒、弧度）：
 *   奧德修斯坐在 z = 0，面向 -z。y 向上，地板 y = 0。x 向右。
 *   十二把斧頭立在 x = 0 的溝裡，z = -6 … -17（間隔 1 m），孔心高度 = 射擊高度。
 *   yaw > 0 往左轉，pitch > 0 往上抬（與 three.js 相機 rotation.order = 'YXZ' 一致）。
 *
 * 出處（CLAUDE.md：電影為主、原典補充、可適度改編）：
 *   比箭、上弦、十二把斧頭、弦聲像燕子、宙斯打雷【原典：第 21 卷】；電影怎麼演【待確認】
 *   求婚者先試：勒奧得斯第一個上不了弦、說這把弓會要許多人的命；歐律馬科斯叫人把弓烤軟抹油仍上不了；
 *     安提諾俄斯說今天是阿波羅的節日、比箭改天【原典：第 21 卷】
 *     ——歐律馬科斯勉強掛上弦射出一箭、安提諾俄斯用自己的獵弓試射一箭【改編：讓玩家看出斧列偏向】
 *   斧列偏移：忒勒馬科斯挖溝、拉繩把斧頭排直【原典】；你坐的凳子不在斧列正後方，整排看起來偏一點【改編】
 *   起鬨干擾：拍桌、噓聲【改編】；丟骨頭【原典：第 20 卷克特西波斯朝乞丐丟牛蹄，借來用】
 *   呼吸判定【改編：射箭的真實技巧——拉弓時吸氣、呼到底的停頓放箭】
 *   系列模式（帳 → 手穩、知情的人）【改編】，換算同 prototypes/odyssey-series/series.js 的 bowSwayMul
 *
 * 晃動的合成模型（拉弓中，每一格）：
 *   基本幅度 amp      = swayAmplitude(階段, 拉滿秒數, 疲勞)：拉弓中 > 拉滿安定中 > 最穩；最穩之後疲勞發抖
 *   呼吸倍率 breath   = low + (high − low) × 肺量（吸滿 1，呼到底 0）；另加肺量 × bob 的上抬（胸口起伏）
 *   帳的倍率 swayMul  = max(0.6, 1 − 0.04 × 帳)（單獨遊玩帳預設 0 → 1）
 *   起鬨尖峰 spike    = jolt × 種類大小 × heckleScale(帳) × 包絡（起 0.08 秒、衰減 0.45 秒），朝隨機方向推一下
 *   最後：sway = (amp × breath × swayMul) 的雜訊 + 發抖 × swayMul + bob + spike
 *   時間對齊：呼吸從開始拉弓那一刻重新起算——拉弓 1.0 秒＝吸氣，拉滿後 0.9 秒＝呼氣，接著 1.6 秒呼到底的停頓。
 *     所以拉滿後 0.8 … 2.5 秒同時是「最穩」和「呼氣窗」；呼吸開時，疲勞從 2.5 秒才開始（不開時照舊 2.0 秒）。
 *     起鬨在拉弓後 1.3 … 2.8 秒預告、0.5 秒後才推手：窗裡一定留得下乾淨的一段，可以搶在之前放，或等它過去。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowRules = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 調整值
  var TUNING = {
    gravity: 9.8,            // m/s²
    shootHeight: 1.1,        // 箭與孔心的高度
    axeCount: 12,
    axeFirst: 6,             // 第一把斧頭距離
    axeSpacing: 1,
    plateHalf: 0.32,         // 斧頭青銅板的半寬：偏太多就是從旁邊飛過
    doorZ: -26,              // 大廳盡頭的門

    // 箭速：v = speedMin + (speedMax - speedMin) * power²
    // 用平方讓半拉的箭明顯下墜，拉不滿就穿不完十二孔。
    speedMin: 20,
    speedMax: 60,
    minFirePower: 0.15,      // 低於這個放手＝取消

    // 斧孔半徑（公尺）
    difficulties: {
      normal: { label: '普通', holeRadius: 0.110 },
      easy:   { label: '寬鬆', holeRadius: 0.140 },
      hard:   { label: '嚴格', holeRadius: 0.082 }
    },

    // 上弦
    string: {
      fillTime: 3.2,         // 一直按住、指針都在亮區時，幾秒上好弦
      decay: 0.6,            // 放手時張力每秒退回
      zone: 0.4,             // 亮區半寬（指針範圍 -1.2 … 1.2）
      outLimit: 0.9,         // 指針離開亮區累計幾秒就滑掉
      handSpan: 4.5,         // 整個輸入面（例如整個畫面寬）對應幾個指針單位：手在 ±0.45 面寬內移動就夠上好弦
      driftWave: 3.0,        // 指針漂移：慢波
      driftNoise: 10.0,      // 指針漂移：亂流
      damping: 0.985,        // 每 1/60 秒的速度保留
      tensionGain: 1.4       // 弦越緊越難控
    },

    // 瞄準
    aim: {
      drawSensitivity: 0.55, // 拉弓時瞄準變慢（乘在視角位移上）
      yawLimit: 0.7,         // 左右最多轉幾弧度
      pitchLimit: 0.35       // 上下最多抬幾弧度
    },

    flightTimeScale: 0.22,   // 箭飛行時的慢動作（遊戲時間 × 這個值＝箭的時間）
    fullDrawRemark: 0.8,     // 拉力低於這個值，結果會說「弓沒拉滿」

    // 拉弓與手晃
    draw: {
      fillTime: 1.0,         // 拉滿秒數
      settle: 0.8,           // 拉滿後多久進入最穩
      steadyEnd: 2.0,        // 最穩撐到拉滿後幾秒
      ampRest: 0.0015,       // 沒拉弓時的晃動（弧度）
      ampDraw: 0.0045,       // 拉弓中
      ampSteady: 0.0007,     // 最穩
      fatigueRate: 0.006,    // 撐太久每秒多晃
      ampMax: 0.02,
      lever: 5,              // 角度晃動對應身體平移：公尺 / 弧度
      freqLow: 1.3,          // 慢晃頻率（Hz）
      freqHigh: 7.5          // 發抖頻率（Hz）
    },

    // 呼吸【改編】：一個循環 = 吸 inhale 秒、呼 exhale 秒、其餘是呼到底的停頓
    breath: {
      period: 3.5,
      inhale: 1.0,           // 和拉弓的 fillTime 一樣：邊拉邊吸
      exhale: 0.9,
      low: 0.6,              // 呼到底時的晃動倍率
      high: 1.35,            // 吸滿時
      bob: 0.0015,           // 吸滿時弓往上抬幾弧度
      windowLung: 0.12,      // 呼氣中肺量低於這個值＝呼氣窗
      steadyEnd: 2.5         // 呼吸開時，最穩撐到拉滿後幾秒（＝第一次停頓結束）
    },

    // 起鬨【改編】
    heckle: {
      chance: 0.85,          // 每次拉弓有多少機率被起鬨
      lead: 0.5,             // 預告（看得到、聽得到）到真的推手之間的秒數
      firstMin: 1.3,         // 從開始拉弓算，第一次預告的時間
      firstMax: 2.8,
      gapMin: 2.4,           // 同一次拉弓裡，下一次預告至少隔多久
      gapMax: 3.8,
      attack: 0.08,
      decay: 0.45,
      life: 2.2,             // 一次起鬨影響多久就丟掉
      jolt: 0.012,           // 帳 0 時，大小 1 的起鬨把手推偏幾弧度（比普通的瞄準窗還大）
      shake: 0.5,            // 推一下之外的抖動（乘 jolt）
      shakeHz: 9,
      ledgerStep: 0.06,      // 每一筆帳，起鬨的影響少多少
      minScale: 0.3,
      kinds: {
        pound: { label: '拍桌子', size: 0.8, weight: 0.4 },   // 【改編】
        jeer:  { label: '噓聲',   size: 0.6, weight: 0.35 },  // 【改編】
        bone:  { label: '丟骨頭', size: 1.0, weight: 0.25 }   // 【原典：第 20 卷丟牛蹄，借來用】
      }
    },

    // 系列存檔
    series: {
      key: 'odyssey-series-v1',
      ledgerStep: 0.04,      // 晃動倍率 max(0.6, 1 − 0.04 × 帳)【改編】
      minSwayMul: 0.6
    },

    // 先看求婚者失敗【原典＋改編】
    watch: {
      offsetMin: 0.55,       // 斧列橫向偏移：孔半徑的倍數（下限）
      offsetMax: 0.95,
      power: 0.85,           // 求婚者拉不滿
      errYaw: 0.0005,        // 求婚者的手不準（弧度，正負）
      errPitch: 0.0004,
      flightScale: 0.3       // 看求婚者的箭時的慢動作
    }
  };

  // 先看求婚者失敗：一段腳本（秒）
  var WATCH_SCRIPT = [
    { id: 'intro', dur: 3.2,
      text: '潘妮洛普把奧德修斯的弓和箭袋放在大廳裡：誰能上弦、一箭穿過十二把斧頭，她就跟誰走。' },        // 【原典】電影【待確認】
    { id: 'leodes', who: '勒奧得斯', dur: 3.8, suitor: 0,
      text: '勒奧得斯第一個站上門檻。他那雙軟手怎麼也掛不上弦。「這把弓會要了許多人的命。」' },             // 【原典】
    { id: 'eury', who: '歐律馬科斯', shoot: true, strain: 2.6, hold: 2.6, suitor: 7,
      text: '歐律馬科斯叫人把弓在火上烤軟、抹了油，兩個人壓住弓臂才掛上弦——只拉開了八、九分。' },          // 【原典＋改編】
    { id: 'anti', who: '安提諾俄斯', shoot: true, strain: 2.4, hold: 2.6, suitor: 1,
      text: '安提諾俄斯說今天是阿波羅的節日，比箭改天再說；臨走前拿自己的獵弓朝斧頭射了一箭，當作笑話。' },   // 【原典＋改編】
    { id: 'outro', dur: 3.0,
      text: '你開口：讓這個乞丐也試試。求婚者破口大罵；忒勒馬科斯叫歐邁俄斯把弓交到你手上。' }               // 【原典】
  ];

  var DIR_LABEL = { high: '偏高', low: '偏低', left: '偏左', right: '偏右' };

  // ---------------------------------------------------------------- 工具
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // 可注入的亂數：mulberry32，給 seed 就能重現
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

  // 平滑一維雜訊（值雜訊 + 餘弦內插），輸出約 -1 … 1
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

  function holeRadius(difficulty) {
    var d = TUNING.difficulties[difficulty] || TUNING.difficulties.normal;
    return d.holeRadius;
  }

  function axeZ(i) { return -(TUNING.axeFirst + i * TUNING.axeSpacing); }

  // offset：整排斧頭的偏移 { x, y }（公尺），預設不偏
  function axePositions(offset) {
    var ox = (offset && offset.x) || 0, oy = (offset && offset.y) || 0, out = [];
    for (var i = 0; i < TUNING.axeCount; i++) out.push({ x: ox, y: TUNING.shootHeight + oy, z: axeZ(i) });
    return out;
  }

  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  // ---------------------------------------------------------------- 呼吸【改編】
  // t：呼吸循環裡的秒數。回傳肺量 0（呼到底）… 1（吸滿）
  function breathLung(t) {
    var B = TUNING.breath, u = ((t % B.period) + B.period) % B.period;
    if (u < B.inhale) return smooth(u / B.inhale);
    if (u < B.inhale + B.exhale) return 1 - smooth((u - B.inhale) / B.exhale);
    return 0;
  }
  function breathFactor(lung) { var B = TUNING.breath; return B.low + (B.high - B.low) * lung; }
  // 呼氣窗：已經在呼（不是在吸），而且快呼到底或正在停頓
  function inBreathWindow(t) {
    var B = TUNING.breath, u = ((t % B.period) + B.period) % B.period;
    return u >= B.inhale && breathLung(t) <= B.windowLung;
  }

  // ---------------------------------------------------------------- 系列模式【改編】
  function ledgerSwayMul(ledger) {
    var S = TUNING.series, l = Number(ledger);
    if (!isFinite(l) || l < 0) l = 0;
    return Math.max(S.minSwayMul, 1 - S.ledgerStep * l);
  }
  function heckleScale(ledger) {
    var K = TUNING.heckle, l = Number(ledger);
    if (!isFinite(l) || l < 0) l = 0;
    return Math.max(K.minScale, 1 - K.ledgerStep * l);
  }
  var KNOW = ['unknown', 'suspects', 'knows'];
  function normKnowers(k) {
    var out = { tele: 'unknown', eum: 'unknown', pen: 'unknown' };
    if (k && typeof k === 'object') for (var key in out) if (KNOW.indexOf(k[key]) >= 0) out[key] = k[key];
    return out;
  }
  // 知情的人：忒勒馬科斯知道 → 起鬨少一些【改編；原典：忒勒馬科斯喝令求婚者】；其他只是台詞
  function knowersEffect(k) {
    k = normKnowers(k);
    var chance = TUNING.heckle.chance, lines = [];
    if (k.tele === 'knows') { chance = 0.55; lines.push('忒勒馬科斯知道你是誰。他按著長矛，瞪著每一個起鬨的人。'); }
    else if (k.tele === 'suspects') { chance = 0.7; lines.push('忒勒馬科斯好像猜到了什麼，一直看著你。'); }
    if (k.eum === 'knows') lines.push('歐邁俄斯把弓交到你手上，低聲說：大門已經閂好了。');     // 【原典：第 21 卷】
    if (k.pen === 'knows') lines.push('潘妮洛普退回樓上前，看了你很久。');                       // 【原典＋改編】
    return { heckleChance: chance, lines: lines };
  }
  // search：location.search；storage：有 getItem 的物件。讀不到存檔就當單獨遊玩。
  function readSeries(search, storage) {
    var off = { on: false, ledger: 0, knowers: normKnowers(null), save: null };
    if (!/[?&]series=1(&|$)/.test(String(search || ''))) return off;
    var save;
    try {
      if (!storage) return off;
      var txt = storage.getItem(TUNING.series.key);
      save = txt ? JSON.parse(txt) : {};
      if (!save || typeof save !== 'object') save = {};
    } catch (e) { return off; }
    var l = Math.round(Number(save.ledger));
    return { on: true, ledger: isFinite(l) && l > 0 ? Math.min(l, 999) : 0, knowers: normKnowers(save.knowers), save: save };
  }
  // 一場比試的紀錄：贏過一次就算贏，穿過的孔取最好
  function bowRecord(prev, result) {
    var win = !!(prev && prev.win) || !!(result && result.win);
    var passed = Math.max(prev && prev.passed || 0, result && result.passed || 0);
    return { win: win, passed: win ? TUNING.axeCount : passed };
  }
  // 合併進存檔（不丟其他章的欄位），寫入 bow 與 step:'ending'
  function writeSeries(storage, record) {
    try {
      var cur = {}, txt = storage.getItem(TUNING.series.key);
      try { cur = txt ? JSON.parse(txt) || {} : {}; } catch (e) { cur = {}; }
      if (typeof cur !== 'object') cur = {};
      cur.bow = { win: !!record.win, passed: record.passed | 0 };
      cur.step = 'ending';
      storage.setItem(TUNING.series.key, JSON.stringify(cur));
      return cur;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- 上弦
  function createStringState(rng) {
    rng = rng || Math.random;
    return {
      tension: 0, needle: 0, drift: 0, driftVel: 0, hand: 0,
      outTime: 0, t: 0, wavePhase: rng() * Math.PI * 2,
      failed: false, done: false, rng: rng
    };
  }

  // input: { down: 是否按住, dx: 這一步手的橫移（指針單位，往右為正；換算由輸入端負責）}
  // 放手時：指針停在原地（不回中），張力慢慢退回；再按下從原處繼續。
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
      s.hand += dx;                             // 手往右，指針往左
      s.tension = Math.min(1, s.tension + dt / P.fillTime);
    } else {
      // 放手：弓慢慢彈直；指針不動，漂移的速度歸零
      s.driftVel = 0;
      s.tension = Math.max(0, s.tension - dt * P.decay);
    }
    s.needle = clamp(s.drift - s.hand, -1.2, 1.2);
    s.drift = s.needle + s.hand;                // 撞到邊就停住
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

  // ---------------------------------------------------------------- 拉弓與手晃
  function createDrawState(rng) {
    rng = rng || Math.random;
    return {
      drawing: false, power: 0, fullTime: 0, t: 0,
      phLow: rng() * 100, phHigh: rng() * 100,
      noise: [createNoise(rng), createNoise(rng), createNoise(rng), createNoise(rng),
              createNoise(rng), createNoise(rng), createNoise(rng), createNoise(rng)],
      amp: TUNING.draw.ampRest, tremble: 0,
      sway: { yaw: 0, pitch: 0, x: 0, y: 0 },
      stage: 'idle',
      breathT: TUNING.breath.inhale + TUNING.breath.exhale,   // 一開始在呼到底的停頓
      lung: 0, breathWin: false
    };
  }

  // 這一刻的晃動幅度（弧度）與發抖成分
  // steadyEnd：最穩撐到拉滿後幾秒（不給就用 TUNING.draw.steadyEnd；呼吸開時用 TUNING.breath.steadyEnd）
  function swayAmplitude(drawing, power, fullTime, fatigue, steadyEnd) {
    var D = TUNING.draw, end = steadyEnd === undefined ? D.steadyEnd : steadyEnd;
    if (!drawing) return { amp: D.ampRest, tremble: 0, stage: 'idle' };
    if (power < 1) return { amp: D.ampDraw, tremble: 0, stage: 'drawing' };
    if (fullTime < D.settle) {
      var u = fullTime / D.settle;
      return { amp: D.ampDraw + (D.ampSteady - D.ampDraw) * u, tremble: 0, stage: 'settling' };
    }
    if (fullTime < end || !fatigue) return { amp: D.ampSteady, tremble: 0, stage: 'steady' };
    var extra = Math.min(D.ampMax - D.ampSteady, D.fatigueRate * (fullTime - end));
    return { amp: D.ampSteady + extra * 0.5, tremble: extra, stage: 'tremble' };
  }

  // input: { down, fatigue, breath（呼吸判定，預設關）, swayMul（帳的倍率，預設 1）}
  function stepDraw(s, dt, input) {
    var D = TUNING.draw, B = TUNING.breath, down = !!(input && input.down), fatigue = !input || input.fatigue !== false;
    var breath = !!(input && input.breath), mul = input && input.swayMul !== undefined ? input.swayMul : 1;
    s.t += dt;
    s.breathT += dt;
    if (down) {
      if (!s.drawing) { s.drawing = true; s.power = 0; s.fullTime = 0; s.breathT = 0; }   // 邊拉邊吸
      s.power = Math.min(1, s.power + dt / D.fillTime);
      if (s.power >= 1) s.fullTime += dt;
    } else if (s.drawing) {
      s.drawing = false; s.power = 0; s.fullTime = 0;
    }
    var a = swayAmplitude(s.drawing, s.power, s.fullTime, fatigue, breath ? B.steadyEnd : D.steadyEnd);
    s.lung = breath ? breathLung(s.breathT) : 0;
    s.breathWin = breath && inBreathWindow(s.breathT);
    var bf = breath ? breathFactor(s.lung) : 1;
    var amp = a.amp * bf * mul, tremble = a.tremble * mul;
    s.amp = amp; s.tremble = tremble; s.stage = a.stage;
    s.phLow += dt * D.freqLow; s.phHigh += dt * D.freqHigh;
    var n = s.noise, L = D.lever;
    function ch(i) { return amp * n[i](s.phLow) + tremble * n[i + 4](s.phHigh); }
    var bob = breath && s.drawing ? B.bob * s.lung * mul : 0;
    s.sway.yaw = ch(0); s.sway.pitch = ch(1) + bob;
    s.sway.x = ch(2) * L; s.sway.y = ch(3) * L;
    return s;
  }

  // 放手：回傳是否射出；狀態歸零
  function releaseDraw(s) {
    var out = { fire: s.drawing && s.power >= TUNING.minFirePower, power: s.power,
                sway: { yaw: s.sway.yaw, pitch: s.sway.pitch, x: s.sway.x, y: s.sway.y } };
    s.drawing = false; s.power = 0; s.fullTime = 0;
    return out;
  }

  // ---------------------------------------------------------------- 彈道
  function speed(power) {
    var p = clamp(power, 0, 1);
    return TUNING.speedMin + (TUNING.speedMax - TUNING.speedMin) * p * p;
  }

  function aimDir(yaw, pitch) {
    var cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  }

  // aim: { yaw, pitch, power, sway? {yaw,pitch,x,y} }
  function makeShot(aim) {
    var sw = aim.sway || { yaw: 0, pitch: 0, x: 0, y: 0 };
    var d = aimDir(aim.yaw + (sw.yaw || 0), aim.pitch + (sw.pitch || 0)), v = speed(aim.power);
    return {
      origin: { x: sw.x || 0, y: TUNING.shootHeight + (sw.y || 0), z: 0 },
      vel: { x: d.x * v, y: d.y * v, z: d.z * v },
      power: aim.power
    };
  }

  function positionAt(shot, t) {
    var o = shot.origin, v = shot.vel, g = TUNING.gravity;
    return { x: o.x + v.x * t, y: o.y + v.y * t - 0.5 * g * t * t, z: o.z + v.z * t };
  }

  function velocityAt(shot, t) {
    return { x: shot.vel.x, y: shot.vel.y - TUNING.gravity * t, z: shot.vel.z };
  }

  // 箭落地的時間
  function floorTime(shot) {
    var g = TUNING.gravity, a = -0.5 * g, b = shot.vel.y, c = shot.origin.y;
    return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  // 結果：{ win, passed, events:[{axe,t,dx,dy}], stop:{kind:'hit'|'wide'|'short'|'door', axe, dir, t, pos}, endT }
  // offset：整排斧頭的偏移 { x, y }（先看求婚者失敗開著時才有）
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
        // 從斧頭下方沉下去：算落地
        return { win: false, passed: i, events: events, endT: tf, power: shot.power,
                 stop: { kind: 'short', axe: i, dir: dir, t: tf, pos: positionAt(shot, tf) } };
      }
      if (wide) {
        // 從旁邊飛過：繼續飛到地板或門
        var td = vz < 0 ? (TUNING.doorZ - shot.origin.z) / vz : Infinity;
        var tEnd = Math.min(tf, td);
        return { win: false, passed: i, events: events, endT: tEnd, power: shot.power,
                 stop: { kind: 'wide', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
      }
      return { win: false, passed: i, events: events, endT: t, power: shot.power,
               stop: { kind: 'hit', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
    }
    var tDoor = (TUNING.doorZ - shot.origin.z) / vz;
    var end = Math.min(tf, tDoor);
    return { win: true, passed: TUNING.axeCount, events: events, endT: end, power: shot.power,
             stop: { kind: 'door', axe: TUNING.axeCount, t: end, pos: positionAt(shot, end) } };
  }

  function describe(res) {
    var s = res.stop, n = res.passed;
    if (res.win) return '箭穿過全部十二把斧頭的孔，一把也沒碰到，直飛出門外。';
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

  // ---------------------------------------------------------------- 起鬨【改編】
  function createHeckleState() { return { t: 0, next: null, armed: false, list: [], seq: 0 }; }

  function pickKind(rng) {
    var K = TUNING.heckle.kinds, r = rng(), acc = 0, last = 'pound';
    for (var k in K) { acc += K[k].weight; last = k; if (r < acc) return k; }
    return last;
  }

  // 一次起鬨在 u 秒（相對推手那一刻）時的包絡：0 … 1
  function heckleEnvelope(u) {
    var K = TUNING.heckle;
    if (u < 0) return 0;
    if (u < K.attack) return u / K.attack;
    return Math.exp(-(u - K.attack) / K.decay);
  }

  // 這一刻所有起鬨加起來的偏移（弧度）。scale = heckleScale(帳)
  function heckleOffset(h, scale) {
    var K = TUNING.heckle, yaw = 0, pitch = 0;
    for (var i = 0; i < h.list.length; i++) {
      var e = h.list[i], u = h.t - e.hitAt, env = heckleEnvelope(u);
      if (env <= 0) continue;
      var A = K.jolt * e.size * scale * env, w = 2 * Math.PI * K.shakeHz * u;
      yaw += A * (e.dir.x + K.shake * Math.sin(w + e.ph));
      pitch += A * (e.dir.y + K.shake * Math.cos(w * 1.3 + e.ph));
    }
    return { yaw: yaw, pitch: pitch };
  }

  // 每格：排程、預告、推手。drawing：這一刻是否拉著弓；drawStart：這一格剛開始拉
  // 回傳事件 heckleCue（預告：看得到、聽得到）、heckleHit（真的推手）
  function stepHeckle(h, dt, drawing, drawStart, rng, chance) {
    var K = TUNING.heckle, ev = [];
    h.t += dt;
    if (drawStart) {
      h.armed = rng() < chance;
      h.next = h.armed ? h.t + K.firstMin + (K.firstMax - K.firstMin) * rng() : null;
    }
    if (!drawing) { h.armed = false; h.next = null; }
    if (h.armed && h.next !== null && h.t >= h.next) {
      var kind = pickKind(rng), ang = rng() * Math.PI * 2;
      var e = { id: ++h.seq, kind: kind, size: K.kinds[kind].size, cueAt: h.t, hitAt: h.t + K.lead,
                dir: { x: Math.cos(ang), y: Math.sin(ang) }, ph: rng() * 6.28, who: Math.floor(rng() * 14), hit: false };
      h.list.push(e);
      ev.push({ type: 'heckleCue', kind: kind, label: K.kinds[kind].label, who: e.who, id: e.id, lead: K.lead });
      h.next = e.hitAt + K.gapMin + (K.gapMax - K.gapMin) * rng();
    }
    for (var i = 0; i < h.list.length; i++) {
      var x = h.list[i];
      if (!x.hit && h.t >= x.hitAt) { x.hit = true; ev.push({ type: 'heckleHit', kind: x.kind, who: x.who, id: x.id }); }
    }
    h.list = h.list.filter(function (x) { return h.t < x.hitAt + K.life; });
    return ev;
  }

  // ---------------------------------------------------------------- 先看求婚者失敗【原典＋改編】
  // 這場比試的斧列偏移：只有橫向（偏左或偏右，孔半徑的 0.55 … 0.95 倍）。
  // 不做上下偏：求婚者拉不滿，箭一定往下沉，看不出上下偏，給了也推不出來，只會變成看不見的運氣。
  function makeAxeOffset(rng, difficulty) {
    var W = TUNING.watch, r = holeRadius(difficulty);
    var mag = r * (W.offsetMin + (W.offsetMax - W.offsetMin) * rng());
    return { x: (rng() < 0.5 ? -1 : 1) * mag, y: 0 };
  }

  var nominalCache = {};
  // 斧列不偏時、拉滿的瞄準窗中心：求婚者以為斧頭排得正，就照這個瞄
  function nominalAim(difficulty) {
    var key = difficulty || 'normal';
    if (!nominalCache[key]) {
      var w = solveWindow(1, key, { step: 0.00005 });
      nominalCache[key] = { yaw: 0, pitch: w.pitchMid };
    }
    return nominalCache[key];
  }

  function sideWord(dx, dy) {
    var h = dx > 0.01 ? '右' : dx < -0.01 ? '左' : '', v = dy < -0.03 ? '下' : dy > 0.03 ? '上' : '';
    return (h + v) || '中';
  }

  function suitorShotText(who, res) {
    var s = res.stop;
    if (res.win) return who + '的箭竟然穿過了十二個孔。';
    if (s.kind === 'hit') return who + '的箭穿過 ' + res.passed + ' 個孔，釘在第 ' + (res.passed + 1) + ' 把斧頭上——孔的' + sideWord(s.dx, s.dy) + '方。';
    if (s.kind === 'wide') return who + '的箭從第 ' + (res.passed + 1) + ' 把斧頭旁邊飛過（' + DIR_LABEL[s.dir] + '）。';
    return who + '的箭往下沉，落在第 ' + (res.passed + 1) + ' 把斧頭前。';
  }

  function createWatch(difficulty, offset, rng) {
    var W = TUNING.watch, aim = nominalAim(difficulty), t = 0, beats = [];
    WATCH_SCRIPT.forEach(function (src) {
      var b = { id: src.id, who: src.who, text: src.text, suitor: src.suitor, shoot: !!src.shoot, start: t };
      if (b.shoot) {
        var shot = makeShot({ yaw: aim.yaw + (rng() * 2 - 1) * W.errYaw, pitch: aim.pitch + (rng() * 2 - 1) * W.errPitch, power: W.power });
        b.shot = shot; b.res = simulate(shot, difficulty, offset); b.hitText = suitorShotText(src.who, b.res);
        b.fireAt = t + src.strain; b.stopAt = b.fireAt + b.res.endT / W.flightScale; b.end = b.stopAt + src.hold;
        b.fired = false; b.stopped = false;
      } else b.end = t + src.dur;
      t = b.end; beats.push(b);
    });
    return { t: 0, total: t, beats: beats, i: 0, done: false, skipped: false };
  }

  // 從求婚者的箭推斧列偏向：箭釘在孔的左邊＝斧列在箭的右邊。回傳估計的 x 偏移（公尺）
  function inferOffset(watch) {
    var sum = 0, n = 0;
    watch.beats.forEach(function (b) {
      if (b.shoot && b.res.stop && b.res.stop.kind === 'hit') { sum += -b.res.stop.dx; n++; }
    });
    return n ? { x: sum / n, y: 0, n: n } : null;
  }

  function watchSummary(watch) {
    var sides = [];
    watch.beats.forEach(function (b) { if (b.shoot && b.res.stop.kind === 'hit') sides.push(b.res.stop.dx > 0 ? '右' : '左'); });
    if (!sides.length) return '';
    var same = sides.every(function (x) { return x === sides[0]; });
    return same ? (sides.length > 1 ? '兩支箭都釘在孔的' + sides[0] + '邊。' : '那支箭釘在孔的' + sides[0] + '邊。') : '兩支箭一左一右。';
  }

  // ---------------------------------------------------------------- 一輪（狀態機）
  // 上弦 string → 瞄準 aim → 飛行 flight → 結果 result。
  // 渲染端每格呼叫 stepRound，畫回傳的狀態；事件陣列告訴它這一步發生了什麼（播聲音、亮斧孔）。
  var TEXT = {
    introString: '求婚者一個接一個都拉不開這把弓。現在輪到乞丐模樣的你。',
    introAim: '弓已上弦。等十二個孔排成一條隧道，再放手。',
    introWatch: '先看求婚者試弓。看清楚他們的箭釘在哪裡。（空白鍵跳過）',
    strung: '弓弦在指下歌唱，聲音像燕子。宙斯在天上打了一聲雷。求婚者臉色都變了。',
    cancel: '放得太早，箭還沒拉開。',
    slipTitle: '弓弦滑掉了',
    slipText: '指針離開亮區太久，弓又彈直了。求婚者哄堂大笑。',
    winTitle: '十二孔，一箭穿過',
    winTail: '大廳裡的笑聲停了。',
    missTitle: '沒有成功',
    missTail: '求婚者哄堂大笑。'
  };

  // options: { difficulty, stringPhase (預設 true), fatigue (預設 true),
  //            breath（呼吸判定，預設關）, heckle（起鬨干擾，預設關）, watch（先看求婚者失敗＋斧列偏移，預設關）,
  //            ledger（帳，預設 0）, knowers（{tele, eum, pen}，系列模式才有）}
  // carry:   { strungOnce, watched, axeOffset } 同一場比試重來時沿用：上過弦就跳過上弦、看過就不再看、斧列不變
  function createRound(options, rng, carry) {
    options = options || {}; rng = rng || Math.random; carry = carry || {};
    var strungOnce = !!carry.strungOnce;
    var needString = options.stringPhase !== false && !strungOnce;
    var difficulty = options.difficulty || 'normal';
    var watchOn = !!options.watch;
    var offset = carry.axeOffset || (watchOn ? makeAxeOffset(rng, difficulty) : { x: 0, y: 0 });
    var needWatch = watchOn && !carry.watched;
    var ledger = Number(options.ledger) || 0, kn = knowersEffect(options.knowers);
    var round = {
      phase: needWatch ? 'watch' : needString ? 'string' : 'aim',
      difficulty: difficulty,
      fatigue: options.fatigue !== false,
      breath: !!options.breath,
      heckleOn: !!options.heckle,
      ledger: ledger,
      swayMul: ledgerSwayMul(ledger),
      heckleScale: heckleScale(ledger),
      heckleChance: kn.heckleChance,
      knowerLines: kn.lines,
      axeOffset: offset,
      watched: !!carry.watched || !watchOn,
      needString: needString,
      strungOnce: strungOnce || options.stringPhase === false,
      str: createStringState(rng),
      draw: createDrawState(rng),
      aim: { yaw: (rng() - 0.5) * 0.06, pitch: -0.02 + rng() * 0.02 },
      waitRelease: false,     // 上好弦那一下還按著：要先放開才開始拉弓
      watch: null,            // createWatch(...)：求婚者的腳本
      heckle: createHeckleState(),
      flight: null,           // { shot, res, t, nextEvent, done }
      result: null,           // { win, title, text, passed, reason }
      rng: rng,
      intro: needString ? TEXT.introString : TEXT.introAim
    };
    if (needWatch) { round.watch = createWatch(difficulty, offset, rng); round.intro = TEXT.introWatch; }
    return round;
  }

  // 這一刻瞄準視角的倍率（拉弓時變慢）：渲染端也可以讀來縮放游標
  function aimSensitivity(round) {
    return round.draw.drawing ? TUNING.aim.drawSensitivity : 1;
  }

  // 射出：rel 是放手那一刻的快照 { power, sway }
  function fireRound(round, rel) {
    var A = round.aim;
    var shot = makeShot({ yaw: A.yaw, pitch: A.pitch, power: rel.power, sway: rel.sway });
    var res = simulate(shot, round.difficulty, round.axeOffset);
    round.flight = { shot: shot, res: res, t: 0, nextEvent: 0, done: false };
    round.phase = 'flight';
    return res;
  }

  function finish(round, win, title, text, reason) {
    round.phase = 'result';
    round.result = { win: win, title: title, text: text, reason: reason,
                     passed: round.flight ? round.flight.res.passed : 0 };
    return round.result;
  }

  function endWatch(round, ev, skipped) {
    var w = round.watch;
    w.done = true; w.skipped = !!skipped; w.t = Math.max(w.t, w.total);
    round.watched = true;
    round.phase = round.needString ? 'string' : 'aim';
    ev.push({ type: 'watchEnd', skipped: !!skipped, summary: watchSummary(w),
              text: round.needString ? TEXT.introString : TEXT.introAim });
  }

  function stepWatch(round, dt, input, ev) {
    var w = round.watch;
    w.t += dt;
    if (input.skip) w.t = w.total;
    while (w.i < w.beats.length && w.t >= w.beats[w.i].start) { ev.push({ type: 'beat', index: w.i, beat: w.beats[w.i] }); w.i++; }
    w.beats.forEach(function (b, i) {
      if (!b.shoot) return;
      if (!b.fired && w.t >= b.fireAt) { b.fired = true; ev.push({ type: 'suitorFire', index: i, beat: b }); }
      if (!b.stopped && w.t >= b.stopAt) { b.stopped = true; ev.push({ type: 'suitorStop', index: i, beat: b, text: b.hitText }); }
    });
    if (w.t >= w.total) endWatch(round, ev, !!input.skip);
  }

  // input: { down: 是否按住（上弦／拉弓）, stringDx: 這一步手的橫移（指針單位）,
  //          look: { yaw, pitch } 這一步想轉的角度（弧度，未乘拉弓倍率）, skip: 跳過求婚者的段落 }
  // 回傳事件：{type:'beat'|'suitorFire'|'suitorStop'|'watchEnd'|'strung'|'slip'|'fire'|'cancel'|
  //           'heckleCue'|'heckleHit'|'pass'|'stop'|'result', ...}
  function stepRound(round, dt, input) {
    input = input || {};
    var ev = [], down = !!input.down;
    if (round.phase === 'watch') {
      stepWatch(round, dt, input, ev);
    } else if (round.phase === 'string') {
      stepString(round.str, dt, { down: down, dx: input.stringDx || 0 });
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
        if (rel.fire) { var res = fireRound(round, rel); ev.push({ type: 'fire', res: res, power: rel.power }); }
        else ev.push({ type: 'cancel', text: TEXT.cancel });
      } else {
        var starting = pull && !d.drawing;
        stepDraw(d, dt, { down: pull, fatigue: round.fatigue, breath: round.breath, swayMul: round.swayMul });
        if (round.heckleOn) {
          var hev = stepHeckle(round.heckle, dt, d.drawing, starting, round.rng, round.heckleChance);
          for (var hi = 0; hi < hev.length; hi++) ev.push(hev[hi]);
          var off = heckleOffset(round.heckle, round.heckleScale);
          d.sway.yaw += off.yaw; d.sway.pitch += off.pitch;
          round.heckleNow = off;
        }
      }
    } else if (round.phase === 'flight') {
      var f = round.flight;
      f.t = Math.min(f.res.endT, f.t + dt * TUNING.flightTimeScale);
      while (f.nextEvent < f.res.events.length && f.res.events[f.nextEvent].t <= f.t) {
        ev.push({ type: 'pass', axe: f.res.events[f.nextEvent++].axe });
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
    return ev;
  }

  // ---------------------------------------------------------------- 解算（測試與除錯用）
  // 找出能穿過全部十二孔的瞄準窗：先掃 pitch（yaw 固定），再在中間 pitch 掃 yaw。
  function solveWindow(power, difficulty, opts) {
    opts = opts || {};
    var off = opts.offset, ox = (off && off.x) || 0;
    // 斧列偏了：從朝斧列中段的方向開始找（yaw > 0 往左，所以是 −x / 距離）
    var yaw0 = opts.yaw !== undefined ? opts.yaw : -ox / 11.5, sway = opts.sway, step = opts.step || 0.00002;
    var lo = opts.pitchFrom !== undefined ? opts.pitchFrom : -0.05, hi = opts.pitchTo !== undefined ? opts.pitchTo : 0.12;
    function ok(yaw, pitch) {
      return simulate(makeShot({ yaw: yaw, pitch: pitch, power: power, sway: sway }), difficulty, off).win;
    }
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
    return { pitchMin: pMin, pitchMax: pMax, pitchMid: pMid,
             yawMin: yMin, yawMax: yMax, yawMid: (yMin + yMax) / 2 };
  }

  return {
    TUNING: TUNING, DIR_LABEL: DIR_LABEL,
    createRng: createRng, createNoise: createNoise, clamp: clamp,
    holeRadius: holeRadius, axeZ: axeZ, axePositions: axePositions,
    createStringState: createStringState, stepString: stepString,
    createDrawState: createDrawState, stepDraw: stepDraw, releaseDraw: releaseDraw, swayAmplitude: swayAmplitude,
    speed: speed, aimDir: aimDir, makeShot: makeShot, positionAt: positionAt, velocityAt: velocityAt,
    floorTime: floorTime, simulate: simulate, describe: describe, solveWindow: solveWindow,
    TEXT: TEXT, createRound: createRound, stepRound: stepRound, fireRound: fireRound, aimSensitivity: aimSensitivity,
    // 呼吸
    breathLung: breathLung, breathFactor: breathFactor, inBreathWindow: inBreathWindow,
    // 起鬨
    createHeckleState: createHeckleState, stepHeckle: stepHeckle, heckleOffset: heckleOffset, heckleEnvelope: heckleEnvelope,
    // 先看求婚者
    WATCH_SCRIPT: WATCH_SCRIPT, makeAxeOffset: makeAxeOffset, nominalAim: nominalAim, createWatch: createWatch,
    inferOffset: inferOffset, watchSummary: watchSummary,
    // 系列
    ledgerSwayMul: ledgerSwayMul, heckleScale: heckleScale, knowersEffect: knowersEffect, normKnowers: normKnowers,
    readSeries: readSeries, writeSeries: writeSeries, bowRecord: bowRecord
  };
}));
