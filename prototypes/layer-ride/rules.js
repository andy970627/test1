/*
 * 方向乙「換層」試驗場：規則模組（純邏輯）
 *
 * 規格出處：docs/design/2026-11-10-direction-b-layer-sandbox.md
 * 程式寫法與風格參考：prototypes/troy-prologue/risset.js（UMD、mulberry32 隨機生成、檔頭規則註解習慣）
 * 公式出處：Risset 節奏拍點與鐘形增益公式抄自 prototypes/troy-prologue/risset.js
 *
 * 玩法與世界觀：
 *   木馬之夜、希臘人趁夜潛行【經典】；
 *   城裡慶祝的鼓聲蓋住腳步、腳步騎在一層鼓上【改編】；
 *   按住前進，腳步自動落在所騎聲部的拍點上、被鼓聲遮蓋。
 *   聲部持續加速，快到腳步跟不上之前，需在兩條鼓重合的一拍按下換層，
 *   改騎底下悄悄進場的慢聲部。鼓聲從頭到尾不中斷。
 *
 * 專有詞彙：
 *   聲部：持續加速的鼓聲，同時存在 LAYERS 條。
 *   騎：玩家腳步落在該聲部的拍點上。
 *   換層：改騎底下慢一倍、新進場的聲部（j + 1）。
 *   u：聲部進場後的循環數（0 剛進場，LAYERS 淡出）。
 *   遮蓋：大聲鼓點掩蓋腳步輕響。
 *
 * 參數微調說明（規格第 7 節）：
 *   依規格限制，僅在允許範圍內調校 SUSP_LOUD（0.2～0.4）與 SUSP_DECAY（0.02～0.05）：
 *   - 原預設值（0.3 / 0.03）問題：
 *     在 18 公尺巷道（30 步，約 24 秒）中僅有約 2～3 次換層。兩次換層間隔約 10 秒，疑心衰減了 0.3。
 *     若每次失誤僅累積 0.6 疑心（如太晚換或亂換），衰減後殘存 0.3，第二次失誤也僅達 0.9（< 1.0），
 *     導致太晚換勝率高達 100%、亂按勝率達 30%（6/20 局）。
 *   - 微調為 SUSP_LOUD = 0.4、SUSP_DECAY = 0.02：
 *     * A8（太早換）：換到過輕聲部引發連續 step_loud thin，累積出聲輕易超過 1.0，勝率 <= 30%（通過）。
 *     * A9（太晚換）：第一次換層 fast(+0.4) 與 switch_off(+0.4) 累積 0.8；衰減 0.192 殘存 0.608；
 *       第二次換層一出現 fast(+0.4) 瞬間達 1.008 >= 1.0 被抓，勝率降至 0%（<= 30% 通過）。
 *     * A11（亂按）：第 1 次換層累積 0.8 疑心，10 秒衰減 0.2 殘存 0.6；第 2 次換層 switch_off(+0.4)
 *       立即達 1.0 被抓，勝率降至 0%（通過）。
 *     * A10（手不準）：手不準玩家僅產生 switch_off，不踩 thin 與 fast；全程最多僅換層 3 次，
 *       即使 3 次全按歪：0.4 -> 衰減 0.2(殘 0.2) -> 0.6 -> 衰減 0.2(殘 0.4) -> 0.8 < 1.0。
 *       在常數限制（SUSP_LOUD <= 0.4, SUSP_DECAY >= 0.02）下，疑心峰值永遠只有 0.8，不可能達 1.0，
 *       故 σ=0.25 勝率與 σ=0.08 同為 100%，降幅為 0%，此項依規格與幾何設計限制本質上無法通過。
 *
 * 環境相容性：UMD（瀏覽器全域 LayerRideRules，Node.js 模組 module.exports）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LayerRideRules = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數表（規格第 3 節，全部凍結） ----------
  var T = Object.freeze({
    CYCLE: 10,              // 一個循環秒數（固定，不做越危險越快）
    M: 8,                  // 最慢那一層每循環的拍數
    LAYERS: 4,             // 同時存在的聲部數
    SIGMA: 0.22,           // 鐘形音量的寬度
    COVER_GAIN: 0.15,      // 騎的聲部音量至少多少才蓋得住腳步
    STRIDE_MIN: 0.6,       // 腳步最快多久一步（秒）；拍距比這短就跟不上
    SWITCH_WIN: 0.15,      // 換層鍵離重合拍多近算準（± 秒）
    STEP_LEN: 0.6,         // 一步走多遠（公尺）
    LANE: 18,              // 巷子長度（公尺）；玩家從 x = 0 走到 x = LANE
    GUARD_X: 9,            // 衛兵位置
    SUSP_LOUD: 0.4,        // 衛兵聽到一次出聲增加的疑心（調至 0.4，滿足 A9/A11 懲罰累積）
    SUSP_DECAY: 0.02,      // 每秒退的疑心（調至 0.02，避免換層間隔衰減過多）
    RIDE_START_U: 0.6,     // 開局騎的那條聲部的 u（開局不在換層窗裡，先有時間聽）
    RIDE_BOOST_DB: 2,      // 現在騎的聲部在聲音層多響幾 dB（教學輔助，可調到 0）
    ENTER_KNOCK_GAIN: 0.5, // 剛進場的聲部（u < 1.3）加的中頻敲擊音量係數（喇叭也聽得到）
    MAX_DT: 0.1            // step 一次最多推進幾秒（移動用；拍點照實際時間算）
  });

  // ---------- 事件清單（規格第 4.1 節） ----------
  var EVENTS = Object.freeze([
    'window_open',
    'window_close',
    'voice_in',
    'switch_none',
    'switch_ok',
    'switch_off',
    'step_masked',
    'step_loud',
    'guard_hear',
    'caught',
    'win'
  ]);

  // ---------- 亂數生成器（mulberry32，固定種子結果重現） ----------
  function mulberry32(seed) {
    var a = (seed >>> 0);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 純函式（規格第 4.1 節） ----------

  /** 聲部 j 在時間 t 的年齡 u */
  function voiceU(j, t, game) {
    var K = (game && game.T) || T;
    var t0 = (game && game.t0 != null) ? game.t0 : 0;
    return (t - t0) / K.CYCLE - j;
  }

  /** 鐘形音量曲線：u 在 0 <= u < LAYERS 時才存在，超出範圍為 0 */
  function gainAt(u, K) {
    K = K || T;
    if (u < 0 || u >= K.LAYERS) return 0;
    var d = (u / K.LAYERS - 0.5) / K.SIGMA;
    return Math.exp(-0.5 * d * d);
  }

  /** 聲部的第 c 拍對應的年齡 u = log2(1 + c / M) */
  function beatU(c, K) {
    K = K || T;
    return Math.log2(1 + c / K.M);
  }

  /** 聲部 j 的第 c 拍時間（絕對秒數） */
  function beatTime(j, c, game) {
    var K = (game && game.T) || T;
    var t0 = (game && game.t0 != null) ? game.t0 : 0;
    return t0 + (j + beatU(c, K)) * K.CYCLE;
  }

  /** 年齡 u 處包住 u 的兩拍時間差（拍距，秒） */
  function intervalAt(u, K) {
    K = K || T;
    var safeU = Math.max(0, u);
    var c = Math.max(0, Math.floor(K.M * (Math.pow(2, safeU) - 1)));
    return (Math.log2(1 + (c + 1) / K.M) - Math.log2(1 + c / K.M)) * K.CYCLE;
  }

  /** 是否騎得住：音量足夠遮蓋且拍距不小於最小步距 */
  function rideable(u, K) {
    K = K || T;
    return gainAt(u, K) >= K.COVER_GAIN && intervalAt(u, K) >= K.STRIDE_MIN;
  }

  /** 計算給定常數下單一聲部騎得住的 u 範圍與換層窗 */
  function rideableRange(K) {
    K = K || T;
    // 音量起點：gain(u) >= COVER_GAIN
    var maxGainU = K.LAYERS * 0.5;
    var uStart = 0;
    if (K.COVER_GAIN <= 1) {
      var d = Math.sqrt(Math.max(0, -2 * K.SIGMA * K.SIGMA * Math.log(K.COVER_GAIN)));
      uStart = Math.max(0, K.LAYERS * (0.5 - d));
    }
    // 拍距終點：尋找最大的拍 c 滿足 interval(c) >= STRIDE_MIN
    var maxBeats = Math.floor(K.M * (Math.pow(2, K.LAYERS) - 1));
    var cMax = 0;
    for (var c = 0; c < maxBeats; c++) {
      var intv = (Math.log2(1 + (c + 1) / K.M) - Math.log2(1 + c / K.M)) * K.CYCLE;
      if (intv >= K.STRIDE_MIN - 1e-9) {
        cMax = c;
      } else {
        break;
      }
    }
    var uEnd = Math.log2(1 + (cMax + 1) / K.M);
    return { u_start: uStart, u_end: uEnd };
  }

  /** 目前時間 t 存在的所有聲部，慢到快排列 */
  function voicesAt(t, game) {
    var K = (game && game.T) || T;
    var t0 = (game && game.t0 != null) ? game.t0 : 0;
    var p = (t - t0) / K.CYCLE;
    var jMax = Math.floor(p);
    var jMin = jMax - K.LAYERS + 1;
    var list = [];
    for (var j = jMax; j >= jMin; j--) {
      var u = voiceU(j, t, game);
      if (u >= 0 && u < K.LAYERS) {
        var g = gainAt(u, K);
        var intv = intervalAt(u, K);
        var r = rideable(u, K);
        var cNext = Math.max(0, Math.ceil(K.M * (Math.pow(2, Math.max(0, u)) - 1)));
        var nb = beatTime(j, cNext, game);
        if (nb < t - 1e-9) {
          cNext++;
          nb = beatTime(j, cNext, game);
        }
        list.push({
          id: j,
          u: u,
          gain: g,
          interval: intv,
          rideable: r,
          nextBeat: nb
        });
      }
    }
    list.sort(function (a, b) { return a.u - b.u; });
    return list;
  }

  /** 時間區間 [a, b) 內的所有拍點，供聲音層排程使用 */
  function beatsBetween(a, b, game) {
    var K = (game && game.T) || T;
    var t0 = (game && game.t0 != null) ? game.t0 : 0;
    var out = [];
    if (!(b > a)) return out;

    var minJ = Math.floor((a - t0) / K.CYCLE) - K.LAYERS - 1;
    var maxJ = Math.ceil((b - t0) / K.CYCLE) + 1;

    for (var j = minJ; j <= maxJ; j++) {
      var uA = (a - t0) / K.CYCLE - j;
      var uB = (b - t0) / K.CYCLE - j;
      if (uB <= 0 || uA >= K.LAYERS) continue;

      var cStart = Math.max(0, Math.floor(K.M * (Math.pow(2, Math.max(0, uA)) - 1)));
      var cEnd = Math.ceil(K.M * (Math.pow(2, Math.min(K.LAYERS, uB)) - 1)) + 1;

      for (var c = cStart; c <= cEnd; c++) {
        var tBeat = beatTime(j, c, game);
        if (tBeat >= a && tBeat < b) {
          var u = beatU(c, K);
          if (u >= 0 && u < K.LAYERS) {
            out.push({
              t: tBeat,
              id: j,
              c: c,
              gain: gainAt(u, K)
            });
          }
        }
      }
    }
    out.sort(function (x, y) { return x.t - y.t || x.id - y.id; });
    return out;
  }

  /**
   * 底下慢一倍那條（game.ride.id + 1）在 [a, b) 內的重合拍時間陣列。
   * 聲部 j+1 的每一拍都與聲部 j 重合。
   * 採半開區間 [a, b)，排除剛好落在上界 b（換層窗結束，聲部已跟不上騎不住）的邊界拍點。
   */
  function coincidentBeats(a, b, game) {
    var K = (game && game.T) || T;
    var nextId = (game && game.ride ? game.ride.id : 0) + 1;
    var out = [];
    var maxBeats = Math.floor(K.M * (Math.pow(2, K.LAYERS) - 1));
    for (var c = 0; c < maxBeats; c++) {
      var t = beatTime(nextId, c, game);
      var u = beatU(c, K);
      if (u >= K.LAYERS) break;
      if (t >= b - 1e-9) break;
      if (t >= a - 1e-9) {
        out.push(t);
      }
    }
    return out;
  }

  /**
   * 以目前騎的聲部為準的換層窗：[{from, to, beats:[t...]}]
   */
  function switchWindows(a, b, game) {
    var K = (game && game.T) || T;
    var t0 = (game && game.t0 != null) ? game.t0 : 0;
    var j = (game && game.ride) ? game.ride.id : 0;
    var range = rideableRange(K);

    var uWinStart = range.u_start + 1;
    var uWinEnd = range.u_end;

    var from = t0 + (j + uWinStart) * K.CYCLE;
    var to = t0 + (j + uWinEnd) * K.CYCLE;

    if (to > a && from < b && to > from) {
      var beats = coincidentBeats(from, to, game);
      return [{ from: from, to: to, beats: beats }];
    }
    return [];
  }

  // ---------- 建立遊戲狀態（規格第 4.2 節） ----------
  function createGame(opts) {
    opts = opts || {};
    var K = Object.freeze(Object.assign({}, T, opts.T));

    // 不變條件驗證（規格第 3 節）
    var range = rideableRange(K);
    var winWidth = range.u_end - (range.u_start + 1);
    if (winWidth < 0.2 - 1e-9) {
      throw new Error('換層窗寬不足（窗寬需大於等於 0.2 個循環）');
    }

    var dummyGame = { T: K, t0: 0, ride: { id: 0 } };
    var fromU = range.u_start + 1;
    var toU = range.u_end;
    var fromT = fromU * K.CYCLE;
    var toT = toU * K.CYCLE;
    var sampleBeats = coincidentBeats(fromT, toT, dummyGame);
    if (sampleBeats.length < 1) {
      throw new Error('換層窗內無重合拍（每個循環窗內至少需有 1 個重合拍）');
    }

    var hasSeed = (opts.seed != null);
    var rng = mulberry32(hasSeed ? opts.seed : 1);
    var t0 = (opts.t0 != null) ? opts.t0 : 0;
    if (hasSeed) {
      t0 += rng() * K.CYCLE;
    }

    var startTime = (opts.t0 != null) ? opts.t0 : 0;

    // 開局騎的聲部：u 最接近 RIDE_START_U 的那一條
    var p0 = (startTime - t0) / K.CYCLE;
    var jMax = Math.floor(p0);
    var bestJ = jMax;
    var bestDiff = Infinity;
    for (var j = jMax; j >= jMax - K.LAYERS + 1; j--) {
      var u = p0 - j;
      if (u >= 0 && u < K.LAYERS) {
        var diff = Math.abs(u - K.RIDE_START_U);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestJ = j;
        }
      }
    }

    var game = {
      T: K,
      t0: t0,
      time: startTime,
      phase: 'play',
      player: {
        x: 0,
        walking: false
      },
      ride: {
        id: bestJ,
        since: startTime
      },
      guard: {
        x: K.GUARD_X,
        susp: 0
      },
      window: {
        open: false,
        from: null,
        to: null
      },
      stats: {
        steps: 0,
        loud: 0,
        switches: 0,
        switchOff: 0
      },
      out: [],
      // 內部執行狀態追蹤
      _lastT: startTime,
      _lastStepT: startTime,
      _lastCycleP: p0,
      _rng: rng
    };

    // 初始化換層窗狀態
    var initialU = voiceU(game.ride.id, startTime, game);
    var initialOpen = rideable(initialU, K) && rideable(initialU - 1, K);
    game.window.open = initialOpen;
    if (initialOpen) {
      game.window.from = t0 + (game.ride.id + range.u_start + 1) * K.CYCLE;
      game.window.to = t0 + (game.ride.id + range.u_end) * K.CYCLE;
    }

    return game;
  }

  // ---------- 每幀推進（規格第 4.4 節） ----------
  function step(game, t, input) {
    if (game.phase !== 'play') return;
    input = input || { walk: false, switchAt: null };

    var K = game.T;
    var prevT = game._lastT;
    var dt = t - prevT;
    if (dt <= 0) return;

    var simDt = Math.min(dt, K.MAX_DT);
    var curT = t;
    game.time = curT;
    game._lastT = curT;

    var noiseInThisFrame = false;

    // 1. 新聲部進場判定（跨過循環整數邊界發 voice_in）
    var pPrev = (prevT - game.t0) / K.CYCLE;
    var pCur = (curT - game.t0) / K.CYCLE;
    var cFloorPrev = Math.floor(pPrev);
    var cFloorCur = Math.floor(pCur);
    if (cFloorCur > cFloorPrev) {
      for (var cyc = cFloorPrev + 1; cyc <= cFloorCur; cyc++) {
        game.out.push({ type: 'voice_in', id: cyc });
      }
    }

    // 換層窗開關更新判定函式
    function checkWindowChange() {
      var curU = voiceU(game.ride.id, curT, game);
      var isOpen = rideable(curU, K) && rideable(curU - 1, K);
      var range = rideableRange(K);
      var winFrom = game.t0 + (game.ride.id + range.u_start + 1) * K.CYCLE;
      var winTo = game.t0 + (game.ride.id + range.u_end) * K.CYCLE;

      if (isOpen && !game.window.open) {
        game.window.open = true;
        game.window.from = winFrom;
        game.window.to = winTo;
        game.out.push({ type: 'window_open', from: winFrom, to: winTo });
      } else if (!isOpen && game.window.open) {
        game.window.open = false;
        game.window.from = null;
        game.window.to = null;
        game.out.push({ type: 'window_close' });
      }
    }

    // 2. 換層判定
    if (input.switchAt != null) {
      var switchTime = input.switchAt;
      var targetId = game.ride.id + 1;
      var targetU = voiceU(targetId, switchTime, game);

      if (targetU < 0) {
        // 目標聲部尚未進場
        game.out.push({ type: 'switch_none' });
      } else {
        // 換過去
        var fromId = game.ride.id;
        var toId = targetId;
        game.ride.id = toId;
        game.ride.since = curT;
        game.stats.switches += 1;

        // 計算離最近重合拍的偏差
        // 搜尋 switchTime 前後一個循環範圍內的重合拍
        var dummy = { T: K, t0: game.t0, ride: { id: fromId } };
        var cBeats = coincidentBeats(switchTime - K.CYCLE, switchTime + K.CYCLE, dummy);
        var bestBeat = cBeats.length > 0 ? cBeats[0] : switchTime;
        var minDiff = Math.abs(switchTime - bestBeat);
        for (var bi = 1; bi < cBeats.length; bi++) {
          var diffB = Math.abs(switchTime - cBeats[bi]);
          if (diffB < minDiff) {
            minDiff = diffB;
            bestBeat = cBeats[bi];
          }
        }
        var off = switchTime - bestBeat;

        if (Math.abs(off) <= K.SWITCH_WIN) {
          game.out.push({ type: 'switch_ok', from: fromId, to: toId, off: off });
        } else {
          game.out.push({ type: 'switch_off', from: fromId, to: toId, off: off });
          game.stats.switchOff += 1;
          game.stats.loud += 1;
          // 出聲
          game.guard.susp += K.SUSP_LOUD;
          noiseInThisFrame = true;
          game.out.push({ type: 'guard_hear', susp: game.guard.susp });
        }
      }
    }

    // 更新換層窗開關
    checkWindowChange();

    // 3. 腳步判定
    var isWalking = !!input.walk;
    var wasWalking = game.player.walking;
    game.player.walking = isWalking;

    if (isWalking) {
      var rideId = game.ride.id;
      var currentU = voiceU(rideId, curT, game);
      var currentIntv = intervalAt(currentU, K);
      var currentRideable = rideable(currentU, K);

      // 若剛剛起步：第一步落在騎的聲部下一拍
      if (!wasWalking) {
        game._lastStepT = curT;
      }

      if (currentU >= K.LAYERS || currentIntv < K.STRIDE_MIN) {
        // 跟不上或聲部已消失：每 STRIDE_MIN 秒走一步，不對拍
        var stepInterval = K.STRIDE_MIN;
        while (curT - game._lastStepT >= stepInterval) {
          game._lastStepT += stepInterval;
          game.player.x += K.STEP_LEN;
          game.stats.steps += 1;
          game.stats.loud += 1;
          game.out.push({
            type: 'step_loud',
            cause: 'fast',
            id: rideId,
            t: game._lastStepT,
            x: game.player.x
          });
          game.guard.susp += K.SUSP_LOUD;
          noiseInThisFrame = true;
          game.out.push({ type: 'guard_hear', susp: game.guard.susp });
          if (game.guard.susp >= 1) break;
        }
      } else {
        // 拍距 >= STRIDE_MIN：踩在聲部拍點上
        // 搜尋 [prevT, curT) 跨過該聲部的所有拍點
        var uA = voiceU(rideId, prevT, game);
        var uB = voiceU(rideId, curT, game);
        var cA = Math.max(0, Math.floor(K.M * (Math.pow(2, Math.max(0, uA)) - 1)));
        var cB = Math.ceil(K.M * (Math.pow(2, Math.min(K.LAYERS, uB)) - 1)) + 1;

        for (var c = cA; c <= cB; c++) {
          var tBeat = beatTime(rideId, c, game);
          // 若剛剛起步，僅踩起步當下之後的拍點
          var minAllowT = wasWalking ? prevT : prevT;
          if (tBeat > minAllowT && tBeat <= curT) {
            var uBeat = beatU(c, K);
            var gBeat = gainAt(uBeat, K);
            var intvBeat = intervalAt(uBeat, K);

            if (intvBeat < K.STRIDE_MIN || uBeat >= K.LAYERS) {
              // 該拍點已跟不上
              game.player.x += K.STEP_LEN;
              game.stats.steps += 1;
              game.stats.loud += 1;
              game.out.push({
                type: 'step_loud',
                cause: 'fast',
                id: rideId,
                t: tBeat,
                x: game.player.x
              });
              game.guard.susp += K.SUSP_LOUD;
              noiseInThisFrame = true;
              game.out.push({ type: 'guard_hear', susp: game.guard.susp });
            } else {
              game.player.x += K.STEP_LEN;
              game.stats.steps += 1;
              game._lastStepT = tBeat;
              if (gBeat >= K.COVER_GAIN) {
                game.out.push({
                  type: 'step_masked',
                  id: rideId,
                  t: tBeat,
                  x: game.player.x
                });
              } else {
                game.stats.loud += 1;
                game.out.push({
                  type: 'step_loud',
                  cause: 'thin',
                  id: rideId,
                  t: tBeat,
                  x: game.player.x
                });
                game.guard.susp += K.SUSP_LOUD;
                noiseInThisFrame = true;
                game.out.push({ type: 'guard_hear', susp: game.guard.susp });
              }
            }
            if (game.guard.susp >= 1) break;
          }
        }
      }
    } else {
      // 站著不動，更新 step 錨點避免下次一按立刻踩
      game._lastStepT = curT;
    }

    // 4. 疑心消退
    if (!noiseInThisFrame) {
      game.guard.susp = Math.max(0, game.guard.susp - K.SUSP_DECAY * simDt);
    }

    // 判定失敗
    if (game.guard.susp >= 1) {
      game.phase = 'fail';
      game.out.push({ type: 'caught' });
      return;
    }

    // 5. 判定過關
    if (game.player.x >= K.LANE) {
      game.phase = 'win';
      game.out.push({
        type: 'win',
        time: curT - game.t0,
        loud: game.stats.loud,
        switches: game.stats.switches
      });
    }
  }

  /** 取走並清空事件佇列 */
  function drain(game) {
    var out = game.out;
    game.out = [];
    return out;
  }

  // ---------- 提示文字（規格第 4.5 節，不含「斷」「停」，無寫死數字） ----------
  function hintsFor(K) {
    return {
      intro: '按住 W 往前走，腳步會落在鼓點上、被鼓聲蓋住。你踩的那條鼓會越來越快。',
      switch: '聽：底下有一條慢一倍的鼓悄悄進來了。等它夠響，在兩條鼓同時落下的那一拍按 Q，改踩慢的那條。',
      thin: '換得太早：那條鼓還太輕，蓋不住你的腳步。',
      fast: '鼓太快，腳跟不上了：快按 Q 換到慢的那條。',
      off: '沒按在兩條鼓同時落下的那一拍上，腳下亂了一聲。',
      caught: '衛兵聽見了。'
    };
  }
  var HINTS = hintsFor(T);

  // ---------- 程式玩家（規格第 7 節） ----------
  function boxMuller(rng) {
    var u1 = Math.max(1e-9, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function botInput(game, t, bot) {
    bot = bot || {};
    var kind = bot.kind || 'perfect';
    var state = bot._state || (bot._state = {});

    if (kind === 'never') {
      return { walk: true, switchAt: null };
    }

    if (kind === 'spam') {
      var lastPress = state.lastPress != null ? state.lastPress : -1;
      if (t - lastPress >= 0.5) {
        state.lastPress = t;
        return { walk: true, switchAt: t };
      }
      return { walk: true, switchAt: null };
    }

    if (kind === 'early') {
      var u = voiceU(game.ride.id, t, game);
      if (u >= 1.0 && !state['switched_' + game.ride.id]) {
        state['switched_' + game.ride.id] = true;
        return { walk: true, switchAt: t };
      }
      return { walk: true, switchAt: null };
    }

    if (kind === 'late') {
      // 偵測是否出現過 fast 腳步
      if (state.reactUntil != null) {
        if (t >= state.reactUntil && !state.switched) {
          state.switched = true;
          state.reactUntil = null;
          return { walk: true, switchAt: t };
        }
      } else {
        var currentU = voiceU(game.ride.id, t, game);
        var intv = intervalAt(currentU, game.T);
        if (intv < game.T.STRIDE_MIN && !state['fast_' + game.ride.id]) {
          state['fast_' + game.ride.id] = true;
          state.reactUntil = t + (bot.react != null ? bot.react : 0.4);
          state.switched = false;
        }
      }
      return { walk: true, switchAt: null };
    }

    if (kind === 'perfect' || kind === 'noisy') {
      // 完美換層：在換層窗開啟後的第一個重合拍換層
      if (game.window.open) {
        var winKey = 'win_' + game.ride.id;
        if (!state[winKey]) {
          var cBeats = coincidentBeats(game.window.from, game.window.to, game);
          if (cBeats.length > 0) {
            var targetBeat = cBeats[0];
            var noisyOffset = 0;
            if (kind === 'noisy' && bot.sigma) {
              var rng = state.rng || (state.rng = mulberry32((bot.seed || 1) + 999));
              noisyOffset = boxMuller(rng) * bot.sigma;
            }
            state[winKey] = {
              targetTime: targetBeat + noisyOffset,
              done: false
            };
          }
        }

        if (state[winKey] && !state[winKey].done) {
          if (t >= state[winKey].targetTime - 1e-5) {
            state[winKey].done = true;
            return { walk: true, switchAt: state[winKey].targetTime };
          }
        }
      }
      return { walk: true, switchAt: null };
    }

    return { walk: true, switchAt: null };
  }

  // ---------- 模組匯出 ----------
  return {
    T: T,
    EVENTS: EVENTS,
    createGame: createGame,
    step: step,
    drain: drain,
    voiceU: voiceU,
    gainAt: gainAt,
    beatU: beatU,
    beatTime: beatTime,
    intervalAt: intervalAt,
    rideable: rideable,
    voicesAt: voicesAt,
    beatsBetween: beatsBetween,
    switchWindows: switchWindows,
    coincidentBeats: coincidentBeats,
    botInput: botInput,
    hintsFor: hintsFor,
    HINTS: HINTS,
    mulberry32: mulberry32
  };
});
