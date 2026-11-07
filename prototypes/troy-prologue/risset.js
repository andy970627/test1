/*
 * 序章《特洛伊的迴響》木馬之夜：規則模組（純邏輯）
 *
 * 不碰 DOM、不碰 Web Audio，只有數字進、數字出，之後可以一對一翻成 C#（Unity，用 dspTime 推進）。
 * 瀏覽器：全域 RissetRules；Node：module.exports。
 * 規格：docs/design/2026-11-06-risset-troy-prologue.md 第 2、6、8 節（6.3、8.4 是介面）。
 *
 * 座標（公尺、秒、弧度）：
 *   地面是 x（向右，0…60）× z（向下／向南，0…30），y 向上。整關由西（木馬）往東（城門）走。
 *   朝向 yaw：正前方 forward(yaw) = (−sin yaw, −cos yaw)，和 three.js 物件 rotation.y、相機一致
 *   （yaw = 0 面向 −z）。yawTo(dx, dz) 是反函數。
 *   輸入 mx、mz 是「世界座標」的移動方向（−1…1，長度超過 1 會被壓成 1）；畫面層自己依鏡頭轉換。
 *
 * 時間：一律用音訊時鐘的絕對時間（AudioContext.currentTime）。step() 內部自己算 dt，最多 0.1 秒
 *   （只限制移動與規則；循環時鐘照實際經過的音訊時間推進，分段做平滑，和聲音保持同步）。
 *   越危險越快（第 8.1 節）：目標循環長度 targetT 依最近衛兵距離、警戒、追殺、區域決定，
 *   實際長度 T 每秒最多改變 CYCLE_RATE（20%）逼近 targetT；相位累加 p += dt ÷ T，p ≥ 1 時跳回 0、index + 1。
 *   盲區 = 相位跳回 0 之後的 BLIND_LEN（0.6）秒（以秒計，不隨 T 變）；
 *   警戒（起疑、還沒追殺）時暫停這個盲區，改成「兩個低音拍之間正中央的 0.6 秒」。
 *   game.cycle.anchor = {t, p, T, index, start}：本幀的音訊時間、相位、長度；
 *   聲音層用 p(t) = anchor.p + (t − anchor.t) ÷ anchor.T 外推排程（beatsBetween 也是這樣算）。
 *   T.DYNAMIC = false 時固定 T = CYCLE（舊規則，測試用）。
 *   盲區前 PRE_BLIND 秒發一次 sfx 'pre_blind'（預告，給聲音做很輕的預備音；只在一般盲區前發）。
 *   Risset 拍點公式（從聲音層移過來，兩邊共用）：第 k 層第 n 拍在 p = log2(1 + n ÷ (M·2^k))，
 *   n = 0 .. M·2^k − 1；音量 = 鐘形曲線 bell((k + p) ÷ LAYERS)。
 *   腳步（第 8.3 節）：移動時每 STEP_GAP 秒一步；落在音量夠大的拍點 ±STEP_WIN 秒內 → 'step_masked'（不出聲），
 *   否則 'step_loud'，半徑 STEP_R 內的衛兵疑心 + SUSP_STEP。
 *   低音拍點：anchor + k × BASS_PERIOD（k 為整數）。平常 anchor = t0；
 *   每次「新的一次起疑」開始時，anchor 重設為「當下 + BASS_LEAD」，讓第一拍在 1.5 秒後響
 *   （先讓玩家讀完提示）；CALM_TIMEOUT 12 秒內有 5 拍，對準 4 拍就成功，可以漏一拍。
 *   起疑那一幀 bass.nextBeat 就會更新。聲音模組每幀讀 bass.nextBeat／bass.anchor 排程即可。
 *   安撫判定時間：有 input.calmAt（按鍵當下的音訊時間減輸出延遲）就用它，沒有才用幀時間。
 *
 *   事件附帶欄位：step_* 帶 {x, z}；calm_ok／calm_bad 帶 index；latch_step 帶 index（0～7）。
 *
 * 出處（CLAUDE.md：大眾熟知的經典段落為主、自由改編、電影輔助）：
 *   木馬、特洛伊陷落之夜、從木馬裡出來打開城門【經典】（電影的演法與配樂〈Troy〉當參考，細節待確認）
 *   越危險越快、腳步合拍掩護、門閂奏主題、視覺輔助【改編：第 8 節】
 *   Risset 節奏驅動衛兵感知、屏息、盲區、衝刺、恐慌共振、低音安撫【改編：交接包】
 *   致命一擊只在特洛伊戰場允許【改編：專案決定】
 *   木馬暗門、城門門閂、陰影區、衛兵巡邏路線【改編】
 *
 * 簡化（原型階段）：
 *   聽覺與視覺都不被牆擋（只算距離與視角）；木馬腹中的玩家高度 BELLY_Y，距離用 3D 算。
 *   在木馬腹中被發現（進入追殺）＝立刻失敗（衛兵爬不上來，但會叫人）。
 *   追殺中不能離開這一區，要先擺脫。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RissetRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數（第 6.2 節，全部可調） ----------
  const T = Object.freeze({
    CYCLE: 10,            // 固定模式（DYNAMIC = false）的循環秒數；也是舊函式 phaseAt 等的預設週期
    DYNAMIC: true,        // 越危險越快（第 8.1 節）；false = 固定 CYCLE 秒
    CYCLE_FAR: 12,        // 附近沒有衛兵時的目標循環長度
    CYCLE_NEAR: 6,        // 衛兵很近時最短
    CYCLE_ALERT: 4,       // 警戒（起疑）時
    CYCLE_HUNT: 3,        // 追殺時
    DIST_FAR: 20,         // 最近衛兵 ≥ 20 m（感知範圍最大值 r(1) = 10 m 的兩倍）→ CYCLE_FAR
    DIST_NEAR: 4,         // 最近衛兵 ≤ 4 m → CYCLE_NEAR；中間線性
    ZONE_MUL: 0.9,        // 每往城門一區（區 1 起算），巡邏時的目標長度 ×0.9（警戒、追殺不乘）
    CYCLE_RATE: 0.2,      // 實際長度每秒最多改變 20%
    CLOCK_MAX_GAP: 30,    // 兩幀相隔超過這麼多秒（分頁休眠）就不分段平滑，直接接上
    RISSET_LAYERS: 4,     // Risset 打擊層數（聲音層同值）
    RISSET_M: 7,          // 最慢層每循環拍數
    BELL_SIGMA: 0.22,     // 層音量鐘形曲線寬度
    BEAT_MIN_GAIN: 0.02,  // 低於這個音量的拍不排、不算
    HUNT_FLOOR: 0.55,     // 追殺時每層最低音量
    HUNT_LAYER_GAIN: 0.4, // 追殺時額外第 5 層（k = 4）的音量
    STEP_GAP: 0.45,       // 腳步間隔（秒）
    STEP_WIN: 0.08,       // 腳步落在拍點 ±0.08 秒內就被蓋過
    MASK_GAIN: 0.3,       // 只有音量 ≥ 0.3 的拍點蓋得住腳步
    STEP_R: 2.5,          // 不合拍腳步聲傳多遠
    SUSP_STEP: 0.2,       // 聽到一次不合拍腳步增加的疑心
    BLIND_LEN: 0.6,       // 盲區秒數（感知 = 0）：相位跳回 0 之後；警戒時是兩個低音拍正中央
    BLIND: 0.6,           // 舊名，等於 BLIND_LEN（畫面、聲音還在讀）；只改 BLIND_LEN 時會跟著改
    PRE_BLIND: 0.4,       // 盲區前幾秒發出 sfx 'pre_blind'（預告）
    R_BASE: 2,            // 感知半徑 r(p) = R_BASE + R_GAIN × p²
    R_GAIN: 8,
    ALERT_MUL: 1.3,       // 警戒（起疑）與追殺時感知 ×1.3
    FOV: Math.PI / 3,     // 視野半角 ±60°
    HIGH_P: 0.6,          // p > 0.6：範圍內移動 = 立即追殺
    BREATH_HEAR: 0.6,     // 沒屏息、站著不動的呼吸聲，在 r × 0.6 內聽得到
    BREATH_MAX: 6,        // 屏息上限秒數，超過 = 喘氣（大聲）
    BREATH_RECOVER: 1.2,  // 不屏息時，屏息計量每秒恢復幾秒
    LOUD_R: 8,            // 大聲（喘氣、門閂聲）傳多遠（至少這麼遠，或 r 較大時用 r）
    WALK: 2.6,            // 潛行速度 m/s
    DASH: 3,              // 衝刺距離 m（只在盲區，每個盲區一次）
    BODY_R: 0.3,          // 玩家與衛兵的碰撞半徑
    SUSP_MOVE: 0.9,       // p ≤ 0.6 時，範圍內移動每秒增加的疑心
    SUSP_SEEN_HIGH: 1.5,  // 站著被看到／聽到呼吸：p > 0.6 時每秒疑心
    SUSP_SEEN_LOW: 0.4,   //                       p ≤ 0.6 時每秒疑心
    SUSP_DECAY: 0.2,      // 沒察覺時每秒退的疑心
    TAKEDOWN_R: 1.5,      // 致命一擊：背後 1.5 m 內
    BASS_PERIOD: 2.4,     // 底層低音週期
    BASS_WIN: 0.15,       // 拍點容許 ±0.15 秒
    LATENCY_GRACE: 0.05,  // 偏晚那側多給的秒數（按鍵到判定的延遲），晚按容許 +0.20
    BASS_LEAD: 1.5,       // 起疑後第一拍在幾秒後（先讓玩家讀提示）
    CALM_GAP: 1.0,        // 兩次安撫間隔小於 1 秒 = 太急 → 追殺
    CALM_NEED: 4,         // 累積幾次對拍回到巡邏（漏拍不歸零，只有按錯或太急才失敗）
    CALM_TIMEOUT: 12,     // 幾秒內沒安撫完 → 追殺
    CALM_GRACE: 3,        // 安撫或擺脫後，衛兵幾秒內不累積疑心
    HUNT_SPEED: 3.0,      // 追殺時衛兵速度
    CATCH_R: 1.0,         // 被追到 1 m 內 = 失敗
    ESCAPE_STILL: 10,     // 躲在陰影裡不動多久擺脫（= 一整個循環）
    PATROL_SPEED: 1.2,    // 巡邏速度
    PATROL_PAUSE: 1.0,    // 到路線點停多久（×0.8～1.2 隨機）
    SEARCH_TURN: 2.0,     // 追到最後位置後原地張望的轉速 rad/s
    GATE_LOW_P: 0.5,      // 城門：p ≤ 0.5 時推門閂才安靜
    GATE_NEED: 15,        // 需要累積的低頻推門秒數（每 1/8 發一次 latch_step）
    LATCH_R: 1.6,         // 離門閂多近才推得到
    LATCH_NOISE_GAP: 0.5, // 高頻時按住，每隔幾秒響一次門閂聲
    TRAPDOOR_R: 0.6,      // 木馬暗門觸發半徑
    BELLY_Y: 2.5,         // 木馬腹中離地高度
    DESYNC_P: 0.8,        // p > 0.8：畫面刻意延遲加雜訊
    DESYNC_LAG: 0.15,
    HINT_GAP: 4,          // 開場屏息提示之後，至少隔幾秒才出盲區提示
    MAX_DT: 0.1           // step 每次最多推進 0.1 秒
  });

  // ---------- 純函式 ----------
  const per = (K) => (typeof K === 'number' ? K : (K || T).CYCLE);
  const pmod = (a, b) => ((a % b) + b) % b;

  /** 循環相位 p（0…1）。K 可以是常數物件或週期秒數。 */
  function phaseAt(t, t0, K) { const P = per(K); return pmod(t - t0, P) / P; }
  /** 第幾個循環（整數，可為負）。 */
  function cycleIndex(t, t0, K) { return Math.floor((t - t0) / per(K)); }
  /** 盲區長度（秒）：BLIND_LEN，沒有才用舊名 BLIND。 */
  function blindLen(K) {
    if (typeof K !== 'object' || !K) return T.BLIND_LEN;
    return K.BLIND_LEN != null ? K.BLIND_LEN : (K.BLIND != null ? K.BLIND : T.BLIND_LEN);
  }
  /** 是否在盲區（每個循環開頭 BLIND_LEN 秒）。 */
  function inBlind(t, t0, K) {
    const P = per(K), b = blindLen(K);
    return pmod(t - t0, P) < b;
  }
  /** 感知半徑 r(p)，alert 為真時 ×ALERT_MUL。 */
  function radiusAt(p, alert, K) {
    K = K || T;
    return (K.R_BASE + K.R_GAIN * p * p) * (alert ? K.ALERT_MUL : 1);
  }
  /**
   * 離 t 最近的低音拍點：{beat, off（t − beat，正 = 晚按）, ok, next（≥ t 的下一拍）}。
   * ok：−win ≤ off ≤ win + late（late = 偏晚那側多給的秒數，預設 0）。
   */
  function bassBeatNear(t, anchor, period, win, late) {
    period = period || T.BASS_PERIOD; win = win == null ? T.BASS_WIN : win; late = late || 0;
    const k = Math.round((t - anchor) / period);
    const beat = anchor + k * period;
    const off = t - beat;
    const next = anchor + Math.ceil((t - anchor) / period - 1e-9) * period;
    return { beat, off, ok: off >= -win - 1e-9 && off <= win + late + 1e-9, next };
  }
  // ---------- 越危險越快（第 8.1 節） ----------
  /** 區域基準倍率：區 1 = 1，每往城門一區 ×ZONE_MUL。 */
  function zoneMul(zone, K) { K = K || T; return Math.pow(K.ZONE_MUL, Math.max(0, (zone | 0) - 1)); }
  /**
   * 目標循環長度。s = {dist（最近衛兵距離，沒有 = Infinity）, alert, hunted, zone}。
   * 追殺 > 警戒 > 依距離（再乘區域基準）。DYNAMIC = false 時固定 CYCLE。
   */
  function cycleTargetFor(s, K) {
    K = K || T; s = s || {};
    if (!K.DYNAMIC) return K.CYCLE;
    if (s.hunted) return K.CYCLE_HUNT;
    if (s.alert) return K.CYCLE_ALERT;
    const d = s.dist == null ? Infinity : s.dist;
    const f = Math.max(0, Math.min(1, (d - K.DIST_NEAR) / (K.DIST_FAR - K.DIST_NEAR)));
    return (K.CYCLE_NEAR + (K.CYCLE_FAR - K.CYCLE_NEAR) * f) * zoneMul(s.zone, K);
  }

  // ---------- Risset 拍點公式（從 audio.js 移來，規則是節拍的唯一來源） ----------
  const log2 = (v) => Math.log(v) / Math.LN2;
  /** 第 k 層每循環的拍數 M·2^k。 */
  function layerBeats(k, K) { return (K || T).RISSET_M * Math.pow(2, k); }
  /**
   * 第 k 層第 n 拍的相位 log2(1 + n ÷ (M·2^k))；不給 n 就回傳這一層整個循環的相位陣列。
   * （速度 f(p) = f0·2^(k+p)，積分後拍數 = M·2^k·(2^p − 1)：每層每循環整數拍，p = 1 時和下一層 p = 0 接上）
   */
  function beatPhases(k, n, K) {
    const Mk = layerBeats(k, K);
    if (n != null) return log2(1 + n / Mk);
    const out = [];
    for (let i = 0; i < Mk; i++) out.push(log2(1 + i / Mk));
    return out;
  }
  /** 第 k 層在相位 p 的音量：bell((k + p) ÷ LAYERS)；追殺時至少 HUNT_FLOOR，額外層（k ≥ LAYERS）固定 HUNT_LAYER_GAIN。 */
  function layerGain(k, p, hunted, K) {
    K = K || T;
    if (k >= K.RISSET_LAYERS) return K.HUNT_LAYER_GAIN;
    const d = ((k + p) / K.RISSET_LAYERS - 0.5) / K.BELL_SIGMA;
    const g = Math.exp(-d * d);
    return hunted ? Math.max(g, K.HUNT_FLOOR) : g;
  }
  /** 警戒時的盲區：低音第一拍之後，每兩拍正中央 BLIND_LEN 秒。回傳 {blind, k, from, to}（from/to 是目前或下一段）。 */
  function alertBlindAt(t, anchor, period, K) {
    K = K || T; period = period || K.BASS_PERIOD;
    const half = blindLen(K) / 2;
    let k = Math.max(0, Math.floor((t - anchor) / period));
    let mid = anchor + (k + 0.5) * period;
    if (t > mid + half) { k++; mid += period; }
    const blind = t >= anchor && Math.abs(t - mid) <= half + 1e-12;
    return { blind, k, from: mid - half, to: mid + half };
  }
  /**
   * [a, b) 內的 Risset 拍點（依 game.cycle.anchor 外推），照時間排序。
   * 每個 {t（音訊時間）, k（層）, n, cycle（第幾個循環）, p（相位）, x（音色位置 (k+p)/LAYERS）, gain}。
   * 預設略過音量 < BEAT_MIN_GAIN 的拍，以及落在盲區的拍（一般：循環開頭 BLIND_LEN 秒；警戒：低音拍正中央）。
   * opts：{includeBlind, includeQuiet, minGain}。game 只需要 {T, cycle:{anchor}, bass, panic, hunted}。
   */
  function beatsBetween(a, b, game, opts) {
    opts = opts || {};
    const K = (game && game.T) || T, c = game.cycle;
    const an = c.anchor || { t: game.time || 0, p: c.p || 0, T: c.T || K.CYCLE, index: c.index || 0 };
    const u0 = (an.index != null ? an.index : (c.index || 0)) + an.p;
    const ua = u0 + (a - an.t) / an.T, ub = u0 + (b - an.t) / an.T;
    const hunted = !!game.hunted;
    const alert = !!(game.panic && game.panic.active) && !hunted;
    const nL = K.RISSET_LAYERS + (hunted ? 1 : 0);
    const BL = blindLen(K);
    const minGain = opts.minGain != null ? opts.minGain : (opts.includeQuiet ? 0 : K.BEAT_MIN_GAIN);
    const out = [];
    if (!(ub > ua)) return out;
    for (let cyc = Math.floor(ua); cyc <= Math.floor(ub); cyc++) {
      const pa = Math.max(0, Math.min(1, ua - cyc)), pb = Math.max(0, Math.min(1, ub - cyc));
      if (pb <= pa) continue;
      for (let k = 0; k < nL; k++) {
        const Mk = layerBeats(k, K);
        const nA = Math.max(0, Math.floor(Mk * (Math.pow(2, pa) - 1)) - 1);
        const nB = Math.min(Mk - 1, Math.ceil(Mk * (Math.pow(2, pb) - 1)) + 1);
        for (let n = nA; n <= nB; n++) {
          const ph = log2(1 + n / Mk);
          const t = an.t + (cyc + ph - u0) * an.T;
          if (t < a || t >= b) continue;
          const gain = layerGain(k, ph, hunted, K);
          if (gain < minGain) continue;
          if (!opts.includeBlind) {
            if (alert) { if (game.bass && alertBlindAt(t, game.bass.anchor, game.bass.period, K).blind) continue; }
            else if (ph * an.T < BL) continue;
          }
          out.push({ t, k, n, cycle: cyc, p: ph, x: (k + ph) / K.RISSET_LAYERS, gain });
        }
      }
    }
    out.sort((x, y) => x.t - y.t || x.k - y.k);
    return out;
  }
  /** 時間 t 的腳步是否被鼓聲蓋過：±STEP_WIN 秒內有音量 ≥ MASK_GAIN 的拍點。 */
  function stepMasked(t, game) {
    const K = (game && game.T) || T;
    return beatsBetween(t - K.STEP_WIN - 1e-9, t + K.STEP_WIN + 1e-9, game, { minGain: K.MASK_GAIN }).length > 0;
  }
  /** 視覺輔助強度：'on' = 1，'off' = 0，數字照用，'auto'：區 0、1 = 1，區 2 = 0.5，其後 0。 */
  function visualAidFor(zone, mode) {
    if (mode === 'on') return 1;
    if (mode === 'off') return 0;
    if (typeof mode === 'number' && Number.isFinite(mode)) return Math.max(0, Math.min(1, mode));
    return zone <= 1 ? 1 : zone === 2 ? 0.5 : 0;
  }

  function forward(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
  function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }
  function angDiff(a, b) { return Math.abs(pmod(a - b + Math.PI, 2 * Math.PI) - Math.PI); }
  function inRect(x, z, r) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
  function circleHitsRect(x, z, rad, r) {
    const cx = Math.max(r.x0, Math.min(x, r.x1)), cz = Math.max(r.z0, Math.min(z, r.z1));
    return (x - cx) * (x - cx) + (z - cz) * (z - cz) < rad * rad;
  }
  /** 預設亂數（固定種子，結果可重現）。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 提示（每個機制第一次出現時一行；畫面層可以覆寫 HINTS 改按鍵說法） ----------
  const HINTS = {
    breath: '節奏越快，衛兵越敏銳。節奏快起來時按住空白鍵屏住呼吸，不要動。',
    blind: '聽到節奏「斷掉、重來」的那一瞬間，衛兵什麼都察覺不到——趁這時移動。',
    trapdoor: '木馬前端有一道暗門，走到那裡就能爬下去。',
    gasp: '憋太久，喘出聲了！屏息最多約 6 秒，節奏慢下來時記得換氣。',
    dash: '節奏斷掉的瞬間按 Shift，可以快速衝出一小段。平常按沒有用。',
    panic: '有衛兵起疑了！別跟著急促的節奏亂按。聽最底下那聲很慢的低音，每響一下按一次 Q，連續四次。',
    hunted: '被發現了！快躲進陰影裡，一動也不動撐過一整個循環（約 10 秒）。被追到身邊就失敗。',
    takedown: '節奏斷掉的瞬間，從衛兵背後靠近按 E，可以把他放倒。時機不對，他會起疑。',
    gate: '城門的門閂要在節奏慢的時候按住 E 推；節奏一快就放手，否則門閂聲會被聽見。',
    lockedExit: '還在被追，先甩掉追兵才能往前走。',
    step: '腳步要踩在鼓點上，聲音才會被蓋過；亂踩的腳步，身邊的衛兵聽得到。',
    alertBlind: '衛兵起疑時，兩聲低音正中間有一小段安靜，那時可以移動。'
  };
  // 失敗原因（g.failReason 是一句完整的話，畫面層直接顯示；g.failCode 是代號）
  const CAUSES = {
    move_high: '節奏最快時你動了，衛兵聽見了',
    loud: '你發出的聲音太大，衛兵聽見了',
    calm_fast: '安撫時按得太急',
    calm_off: '安撫時沒對準那聲慢慢的低音',
    calm_slow: '安撫得太慢，衛兵喊了人',
    seen: '衛兵發現了你'
  };
  const ZONE_NAMES = ['開場', '木馬腹中', '神殿廣場', '城牆下的窄巷', '城門'];

  // ---------- 關卡資料：木馬之夜（整關 60 × 30 m） ----------
  function buildLevel() {
    const R = (x0, z0, x1, z1, name) => ({ x0, z0, x1, z1, name });
    const walls = [
      // 外框
      R(-1, -1, 61, 0, '北界'), R(-1, 30, 61, 31, '南界'), R(-1, 0, 0, 30, '西界'), R(60, 0, 61, 30, '城門牆'),
      // 區 1／2 之間：木馬停在廣場西緣
      // 區 2 神殿廣場
      R(19, 2, 27, 8, '神殿'),
      R(21, 12.5, 23, 14.5, '雕像台座'),
      R(30, 0, 31, 18, '廣場東牆（北段）'), R(30, 27, 31, 30, '廣場東牆（南段）'),
      // 區 3 窄巷：北邊是城牆根的屋舍，南邊是倉庫
      R(31, 0, 46, 17, '屋舍'), R(31, 28, 46, 30, '倉庫'),
      R(35, 24.5, 37, 28, '貨堆'), R(40, 18, 41.5, 21, '水缸'),
      R(46, 0, 47, 17, '巷口北牆'), R(46, 28, 47, 30, '巷口南牆'),
      // 區 4 城門
      R(52, 13, 53.5, 17, '石墩')
    ];
    const shadows = [
      R(5, 14.2, 11.8, 15.8, '木馬腹中'),
      R(11, 16, 15, 20, '木馬的影子'),
      R(18, 8, 28, 10.5, '神殿柱廊'),
      R(20, 14.5, 24, 18, '雕像的影子'),
      R(14, 24, 20, 29, '南側拱廊'),
      R(26.5, 23.5, 30, 27, '廣場東南角'),
      R(31, 23.5, 35, 28, '巷口屋簷'),
      R(37, 24.5, 40, 28, '貨堆後'),
      R(41.5, 17, 44, 21, '水缸旁'),
      R(47, 23, 51, 28, '城門南側廊下'),
      R(53.5, 12, 59.8, 18, '城門拱道')
    ];
    const P = (x, z) => ({ x, z });
    const zones = [
      { id: 0, name: ZONE_NAMES[0], start: { x: 6, z: 15, y: T.BELLY_Y, yaw: -Math.PI / 2 } },
      { id: 1, name: ZONE_NAMES[1], start: { x: 5.8, z: 15, y: T.BELLY_Y, yaw: -Math.PI / 2 },
        belly: R(5.3, 14.5, 11.5, 15.5, '木馬腹中'),
        exit: { kind: 'trapdoor', x: 11, z: 15, to: 2 } },
      { id: 2, name: ZONE_NAMES[2], start: { x: 13, z: 18.5, y: 0, yaw: -Math.PI / 2 },
        exit: { kind: 'rect', rect: R(30, 18, 31.5, 27), to: 3 } },
      // place：走進下一區時把玩家移到下一區的起點（＝重來時的起點，城門南側廊下的暗處）
      { id: 3, name: ZONE_NAMES[3], start: { x: 32, z: 25.5, y: 0, yaw: -Math.PI / 2 },
        exit: { kind: 'rect', rect: R(46, 17, 47.5, 28), to: 4, place: true } },
      { id: 4, name: ZONE_NAMES[4], start: { x: 48, z: 25, y: 0, yaw: -Math.PI / 2 },
        exit: { kind: 'gate', to: null } }
    ];
    // 衛兵：route 是巡邏點（迴圈）；只有一點 = 站崗，朝 yaw。
    const guards = [
      { id: 'g1', zone: 1, route: [P(9, 15), P(1.5, 15), P(15.5, 15)], note: '木馬下來回巡的衛兵' },
      { id: 'g2a', zone: 2, route: [P(15, 12), P(29, 12), P(29, 15.5), P(15, 15.5)], note: '繞廣場的衛兵' },
      { id: 'g2b', zone: 2, route: [P(28, 21), P(16, 21)], note: '橫越廣場南側、會起疑的衛兵' },
      { id: 'g3a', zone: 3, route: [P(39, 23)], yaw: yawTo(1, 0), note: '背對巷口站崗（可暗殺）' },
      { id: 'g3b', zone: 3, route: [P(44.5, 18.5), P(44.5, 27)], note: '巷尾南北巡' },
      { id: 'g3c', zone: 3, route: [P(42, 22.5), P(45.5, 22.5)], note: '巷尾東西巡，與南北巡交錯' },
      { id: 'g4a', zone: 4, route: [P(49, 5), P(57, 5)], note: '城門北側守衛' },
      { id: 'g4b', zone: 4, route: [P(48, 20), P(51, 20), P(51, 9)], note: '城門西側守衛' }
    ];
    return {
      size: { w: 60, h: 30 },
      walls, shadows, zones, guards,
      horse: { x0: 4.5, z0: 13, x1: 12.5, z1: 17, bellyY: T.BELLY_Y, trapdoor: { x: 11, z: 15 }, drop: { x: 13, z: 18.5 } },
      gate: { x0: 59.8, z0: 11, x1: 60, z1: 19, latch: { x: 58.6, z: 15 } }
    };
  }

  // ---------- 遊戲 ----------
  function createLevel(opts) {
    opts = opts || {};
    const K = Object.assign({}, T, opts.T || {});
    const oT = opts.T || {};
    if (oT.BLIND_LEN == null && oT.BLIND != null) K.BLIND_LEN = oT.BLIND;
    K.BLIND = K.BLIND_LEN;
    const rng = opts.rng || mulberry32(opts.seed == null ? 1 : opts.seed);
    const level = opts.level || buildLevel();
    const t0 = opts.t0 || 0;
    const startZone = Math.max(0, Math.min(4, opts.startZone | 0));

    const g = {
      T: K,
      phase: startZone === 0 ? 'intro' : 'play',
      zone: startZone,
      time: null,
      // t0：起始對齊（不變，巡邏時低音以它對齊）；start：本循環 p = 0 的音訊時間；
      // blindFrom／blindTo：目前或下一段盲區（預估）；alertBlind：盲區是否改成低音拍之間
      cycle: { T: K.CYCLE, targetT: K.CYCLE, t0, start: t0, p: 0, blind: false, index: 0, desync: false,
        anchor: { t: t0, p: 0, T: K.CYCLE, index: 0, start: t0 }, blindFrom: t0, blindTo: t0 + K.BLIND_LEN, alertBlind: false },
      bass: { period: K.BASS_PERIOD, anchor: t0, nextBeat: t0 },
      player: null,
      guards: [],
      panic: { active: false, start: 0, count: 0, lastPress: null },
      gate: { progress: 0, need: K.GATE_NEED, pushing: false, open: false },
      alarm: 0,
      hunted: false,
      stillT: 0,
      failReason: null,
      failCode: null,
      retries: 0,
      level,
      out: [],
      hintsShown: {},
      visualAidMode: opts.visualAid == null ? 'auto' : opts.visualAid, // 畫面層可隨時改：'auto'|'on'|'off'|數字
      visualAid: 1
    };
    g.visualAid = visualAidFor(g.zone, g.visualAidMode);
    let last = null;
    let latchNoiseAt = -1e9;
    let dashCycle = null; // 每個盲區只能衝刺一次
    let preBlindCycle = null; // 每個循環只預告一次
    let blindHintGate = null; // {i, t}：進區 1 時的循環與時間；盲區提示要等到下一個循環以後
    let huntCause = null;
    let clockT = null;    // 循環時鐘上次推進到的音訊時間
    let stepAcc = 0;      // 腳步計時

    const emit = (type, a, extra) => g.out.push(extra ? Object.assign({ type, a }, extra) : { type, a });
    const hint = (key) => { if (!g.hintsShown[key]) { g.hintsShown[key] = true; emit('hint', HINTS[key]); } };

    function makePlayer(z) {
      const s = level.zones[z].start;
      return { x: s.x, z: s.z, y: s.y || 0, yaw: s.yaw || 0, breathing: false, breathT: 0, breathLock: false,
        hidden: false, moving: false, inBelly: !!level.zones[z].belly };
    }
    function makeGuard(d) {
      const p0 = d.route[0], p1 = d.route[1] || p0;
      return {
        id: d.id, zone: d.zone, x: p0.x, z: p0.z,
        yaw: d.yaw != null ? d.yaw : yawTo(p1.x - p0.x, p1.z - p0.z),
        baseYaw: d.yaw, state: 'patrol', susp: 0, calm: 0,
        route: d.route, wp: d.route.length > 1 ? 1 : 0, pause: 0, grace: 0,
        lookAt: null, lastKnown: null, active: false
      };
    }
    function resetGuards(fromZone) {
      level.guards.forEach((d, i) => {
        if (d.zone >= fromZone || !g.guards[i]) g.guards[i] = makeGuard(d);
      });
    }
    function setActive() { g.guards.forEach((q) => { q.active = q.zone === g.zone && q.state !== 'down'; }); }
    function refreshBass(t) {
      if (t == null) t = g.time;
      g.bass.nextBeat = t == null ? g.bass.anchor : bassBeatNear(t, g.bass.anchor, K.BASS_PERIOD, K.BASS_WIN).next;
    }
    function clearPanic() { g.panic.active = false; g.panic.count = 0; g.panic.lastPress = null; g.bass.anchor = t0; refreshBass(); }

    function enterZone(z, quiet) {
      g.zone = z;
      setActive();
      clearPanic();
      g.player.inBelly = !!level.zones[z].belly;
      g.visualAid = visualAidFor(z, g.visualAidMode);
      stepAcc = 0;
      if (!quiet) { emit('msg', level.zones[z].name); emit('sfx', 'checkpoint'); }
      if (z === 1) { hint('breath'); blindHintGate = null; }
      if (z === 2) hint('dash');
      if (z === 3) hint('takedown');
      if (z === 4) hint('gate');
    }

    g.player = makePlayer(Math.max(1, startZone));
    resetGuards(0);
    setActive();
    if (startZone > 0) enterZone(startZone, true);

    // ----- 移動與碰撞 -----
    function blocked(x, z, rad) {
      for (const w of level.walls) if (circleHitsRect(x, z, rad, w)) return true;
      return false;
    }
    function moveBody(b, dx, dz) {
      if (b === g.player && b.inBelly) {
        const r = level.zones[1].belly;
        b.x = Math.max(r.x0, Math.min(r.x1, b.x + dx));
        b.z = Math.max(r.z0, Math.min(r.z1, b.z + dz));
        return;
      }
      if (!blocked(b.x + dx, b.z, K.BODY_R)) b.x += dx;
      if (!blocked(b.x, b.z + dz, K.BODY_R)) b.z += dz;
    }
    function moveToward(b, tx, tz, speed, dt) {
      const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
      if (d < 1e-6) return 0;
      const s = Math.min(d, speed * dt);
      b.yaw = yawTo(dx, dz);
      moveBody(b, dx / d * s, dz / d * s);
      return d - s;
    }
    function isHidden(pl) {
      if (pl.inBelly) return true;
      for (const s of level.shadows) if (inRect(pl.x, pl.z, s)) return true;
      return false;
    }
    const dist3 = (q, pl) => Math.hypot(q.x - pl.x, q.z - pl.z, pl.y || 0);
    const dist2 = (q, pl) => Math.hypot(q.x - pl.x, q.z - pl.z);

    // ----- 狀態轉換 -----
    function fail(reason, code) {
      if (g.phase !== 'play') return;
      g.phase = 'fail'; g.failReason = reason; g.failCode = code || null;
      emit('sfx', 'caught'); emit('msg', reason);
    }
    function makeSuspicious(q, t) {
      if (q.state !== 'patrol') return;
      q.state = 'suspicious'; q.susp = 1;
      q.lookAt = { x: g.player.x, z: g.player.z };
      if (!g.panic.active) {
        g.panic.active = true; g.panic.start = t; g.panic.count = 0; g.panic.lastPress = null;
        g.bass.anchor = t + K.BASS_LEAD;
        refreshBass(t); // 同一幀就換成新網格的下一拍
        emit('sfx', 'alert');
      }
      q.calm = g.panic.count;
      hint('panic');
    }
    /** cause：CAUSES 的代號；reason：當下的訊息。 */
    function startHunt(q, cause, reason) {
      cause = cause || 'seen';
      if (g.player.inBelly) { fail(CAUSES[cause] + '——你在木馬裡被發現了。', 'belly_' + cause); return; }
      if (!g.hunted) huntCause = cause;
      const pl = g.player;
      const wasHunted = g.hunted;
      for (const o of g.guards) {
        if (!o.active) continue;
        if (o === q || o.state === 'suspicious') {
          o.state = 'hunted'; o.susp = 1; o.lastKnown = { x: pl.x, z: pl.z }; o.calm = 0;
        }
      }
      clearPanic();
      g.hunted = true; g.stillT = 0;
      if (!wasHunted) { emit('sfx', 'hunt'); if (reason) emit('msg', reason); }
      hint('hunted');
    }
    function endHunt() {
      for (const o of g.guards) if (o.state === 'hunted') { o.state = 'patrol'; o.susp = 0; o.grace = K.CALM_GRACE; o.lastKnown = null; }
      g.hunted = false; g.stillT = 0; huntCause = null;
      emit('sfx', 'escape'); emit('msg', '追兵走遠了。');
    }

    // ----- 每幀 -----
    function normInput(i) {
      i = i || {};
      return {
        yaw: Number.isFinite(i.yaw) ? i.yaw : null,
        mx: +i.mx || 0, mz: +i.mz || 0,
        breath: !!i.breath, dash: !!i.dash, takedown: !!i.takedown, calm: !!i.calm,
        calmAt: Number.isFinite(i.calmAt) ? i.calmAt : null,
        interact: !!i.interact, start: !!i.start
      };
    }
    // ----- 循環時鐘（越危險越快） -----
    function nearestGuardDist() {
      let d = Infinity;
      for (const q of g.guards) if (q.active) d = Math.min(d, dist3(q, g.player));
      return d;
    }
    function cycleTarget() {
      return cycleTargetFor({
        dist: nearestGuardDist(), zone: g.zone,
        hunted: g.phase === 'play' && g.hunted,
        alert: g.phase === 'play' && g.panic.active
      }, K);
    }
    /** 首幀或重來：T 直接等於目標，相位照 t0 對齊。 */
    function snapClock(t) {
      const c = g.cycle;
      c.targetT = cycleTarget(); c.T = c.targetT;
      const u = (t - c.t0) / c.T;
      c.index = Math.floor(u); c.p = u - c.index;
      if (c.p >= 1 - 1e-12) { c.p = 0; c.index++; }
      c.start = t - c.p * c.T;
    }
    /** 照實際經過的音訊時間推進相位：每段 ≤ MAX_DT，T 每秒最多變 CYCLE_RATE，p += h ÷ T。 */
    function advanceClock(t) {
      const c = g.cycle;
      if (clockT == null) { snapClock(t); clockT = t; return; }
      let el = t - clockT;
      c.targetT = cycleTarget();
      if (el <= 0) return;
      clockT = t;
      if (el > K.CLOCK_MAX_GAP) {
        c.T = c.targetT;
        const u = c.p + el / c.T, w = Math.floor(u);
        c.p = u - w; c.index += w;
        if (w > 0) c.start = t - c.p * c.T;
        return;
      }
      let ts = t - el;
      while (el > 1e-12) {
        const h = Math.min(el, K.MAX_DT);
        const maxd = c.T * K.CYCLE_RATE * h;
        c.T += Math.max(-maxd, Math.min(maxd, c.targetT - c.T));
        const np = c.p + h / c.T;
        if (np >= 1) { c.start = ts + (1 - c.p) * c.T; c.index++; c.p = np - 1; }
        else c.p = np;
        ts += h; el -= h;
      }
    }
    function updateClock(t) {
      advanceClock(t);
      const c = g.cycle;
      const BL = K.BLIND_LEN;
      c.alertBlind = g.phase === 'play' && g.panic.active && !g.hunted;
      if (c.alertBlind) {
        const ab = alertBlindAt(t, g.bass.anchor, K.BASS_PERIOD, K);
        c.blind = ab.blind; c.blindId = 'b' + ab.k + '@' + g.bass.anchor;
        c.blindFrom = ab.from; c.blindTo = ab.to;
      } else {
        c.blind = t >= c.start - 1e-9 && t - c.start < BL;
        c.blindId = 'c' + c.index;
        if (c.blind) { c.blindFrom = c.start; c.blindTo = c.start + BL; }
        else { c.blindFrom = t + (1 - c.p) * c.T; c.blindTo = c.blindFrom + BL; }
      }
      c.desync = c.p > K.DESYNC_P;
      c.anchor = { t, p: c.p, T: c.T, index: c.index, start: c.start };
      g.visualAid = visualAidFor(g.zone, g.visualAidMode);
      refreshBass(t);
    }

    g.step = function (t, input) {
      const inp = normInput(input);
      const dt = last == null ? 0 : Math.max(0, Math.min(K.MAX_DT, t - last));
      last = t; g.time = t;
      updateClock(t);
      if (g.phase === 'intro') { if (inp.start) g.start(); return g; }
      if (g.phase !== 'play') { g.alarm = g.phase === 'fail' ? 1 : 0; return g; }

      const pl = g.player, c = g.cycle, p = c.p, blind = c.blind;
      if (inp.yaw != null) pl.yaw = inp.yaw;
      // 盲區預告：循環最後 PRE_BLIND 秒發一次
      if (!c.alertBlind && (1 - p) * c.T <= K.PRE_BLIND + 1e-9 && preBlindCycle !== c.index) {
        preBlindCycle = c.index; emit('sfx', 'pre_blind');
      }
      let loud = false;

      // 屏息
      if (inp.breath && !pl.breathLock) {
        if (!pl.breathing) emit('sfx', 'breath_in');
        pl.breathing = true;
        pl.breathT += dt;
        if (pl.breathT >= K.BREATH_MAX) {
          pl.breathT = K.BREATH_MAX; pl.breathing = false; pl.breathLock = true; loud = true;
          emit('sfx', 'gasp'); hint('gasp');
        }
      } else {
        if (pl.breathing) emit('sfx', 'breath_out');
        pl.breathing = false;
        pl.breathT = Math.max(0, pl.breathT - K.BREATH_RECOVER * dt);
        if (!inp.breath) pl.breathLock = false;
      }

      // 移動與衝刺（屏息時不能動）
      const ox = pl.x, oz = pl.z;
      let walked = false;
      if (!pl.breathing) {
        let mx = inp.mx, mz = inp.mz;
        const len = Math.hypot(mx, mz);
        if (len > 1) { mx /= len; mz /= len; }
        if (len > 1e-6) {
          const bx = pl.x, bz = pl.z;
          moveBody(pl, mx * K.WALK * dt, mz * K.WALK * dt);
          walked = Math.hypot(pl.x - bx, pl.z - bz) > 1e-6;
        }
        if (inp.dash) {
          if (blind && dashCycle !== c.blindId) {
            dashCycle = c.blindId;
            let dx = mx, dz = mz;
            const l = Math.hypot(dx, dz);
            if (l < 1e-6) { const f = forward(pl.yaw); dx = f.x; dz = f.z; } else { dx /= l; dz /= l; }
            const n = Math.ceil(K.DASH / 0.1);
            for (let k = 0; k < n; k++) moveBody(pl, dx * K.DASH / n, dz * K.DASH / n);
            emit('sfx', 'dash');
          } else if (!blind) hint('dash');
        }
      }
      const moved = Math.hypot(pl.x - ox, pl.z - oz) > 1e-4;
      pl.moving = moved;
      pl.hidden = isHidden(pl);

      // 腳步（第 8.3 節）：走路時每 STEP_GAP 秒一步，合拍被蓋過，不合拍出聲
      let stepLoud = false;
      if (walked) {
        stepAcc += dt;
        if (stepAcc >= K.STEP_GAP - 1e-9) {
          stepAcc -= K.STEP_GAP;
          const masked = stepMasked(t, g);
          stepLoud = !masked;
          emit('sfx', masked ? 'step_masked' : 'step_loud', { x: pl.x, z: pl.z });
        }
      }

      // 致命一擊
      // 站在門閂旁時，E 只算推門閂，不算暗殺
      const atLatch = g.zone === 4 && !g.gate.open && level.gate && Math.hypot(pl.x - level.gate.latch.x, pl.z - level.gate.latch.z) <= K.LATCH_R;
      if (inp.takedown && !pl.inBelly && !atLatch) {
        let best = null, bd = Infinity;
        for (const q of g.guards) {
          if (!q.active) continue;
          const d = dist2(q, pl);
          if (d <= K.TAKEDOWN_R && d < bd) { best = q; bd = d; }
        }
        if (best) {
          const f = forward(best.yaw);
          const behind = f.x * (pl.x - best.x) + f.z * (pl.z - best.z) < 0;
          if (blind && behind) {
            best.state = 'down'; best.active = false; best.susp = 0;
            emit('sfx', 'takedown');
          } else {
            emit('sfx', 'takedown_fail');
            if (best.state === 'patrol') makeSuspicious(best, t);
          }
        }
      }

      // 城門門閂（按住 interact）
      g.gate.pushing = false;
      if (g.zone === 4 && inp.interact && !g.gate.open) {
        const L = level.gate.latch;
        if (Math.hypot(pl.x - L.x, pl.z - L.z) <= K.LATCH_R) {
          if (p <= K.GATE_LOW_P) {
            g.gate.pushing = true;
            const before = g.gate.progress;
            g.gate.progress = Math.min(K.GATE_NEED, g.gate.progress + dt);
            // 每推進 1/8 奏一個音（index 0～7，推滿正好第 8 個）
            const s0 = Math.floor(before / K.GATE_NEED * 8 + 1e-9), s1 = Math.floor(g.gate.progress / K.GATE_NEED * 8 + 1e-9);
            for (let i = s0; i < Math.min(8, s1); i++) emit('sfx', 'latch_step', { index: i });
          } else if (t - latchNoiseAt >= K.LATCH_NOISE_GAP) {
            latchNoiseAt = t; loud = true; emit('sfx', 'latch');
          }
        }
      }

      // 安撫（機制 B）
      // 判定時間：按鍵當下的音訊時間（calmAt），沒有才用幀時間；比起疑還早的按鍵不算
      const calmT = inp.calmAt != null ? Math.min(inp.calmAt, t) : t;
      if (inp.calm && g.panic.active && calmT >= g.panic.start) {
        const P = g.panic;
        const b = bassBeatNear(calmT, g.bass.anchor, K.BASS_PERIOD, K.BASS_WIN, K.LATENCY_GRACE);
        if (P.lastPress != null && calmT - P.lastPress < K.CALM_GAP) {
          emit('sfx', 'calm_bad', { index: P.count }); startHunt(null, 'calm_fast', '太急了——衛兵聽出不對勁。');
        } else if (!b.ok) {
          emit('sfx', 'calm_bad', { index: P.count }); startHunt(null, 'calm_off', '亂了節拍——衛兵聽出不對勁。');
        } else {
          P.lastPress = calmT; P.count++;
          emit('sfx', 'calm_ok', { index: P.count - 1 });
          for (const q of g.guards) if (q.active && q.state === 'suspicious') q.calm = P.count;
          if (P.count >= K.CALM_NEED) {
            for (const q of g.guards) if (q.active && q.state === 'suspicious') {
              q.state = 'patrol'; q.susp = 0; q.calm = 0; q.grace = K.CALM_GRACE; q.lookAt = null;
            }
            clearPanic();
            emit('sfx', 'calm_done'); emit('msg', '衛兵搖搖頭，走回原路。');
          }
        }
      }
      if (g.phase !== 'play') return g;
      if (g.panic.active && t - g.panic.start > K.CALM_TIMEOUT) startHunt(null, 'calm_slow', '安撫得太慢——衛兵大喊有人！');
      if (g.phase !== 'play') return g;

      // 盲區提示：不和開場的屏息提示同時出，等到進區 1 之後的下一個循環、而且隔 HINT_GAP 秒以上
      if (g.zone === 1) {
        if (!blindHintGate) blindHintGate = { i: c.index, t };
        if (blind && c.index > blindHintGate.i && t - blindHintGate.t >= K.HINT_GAP) hint('blind');
      }
      if (c.alertBlind && blind && g.panic.count > 0) hint('alertBlind');

      // 感知
      for (const q of g.guards) {
        if (!q.active || g.phase !== 'play') continue;
        if (q.grace > 0) q.grace = Math.max(0, q.grace - dt);
        if (blind) continue; // 盲區：感知 = 0
        const alert = q.state === 'suspicious' || q.state === 'hunted';
        const r = radiusAt(p, alert, K);
        const d = dist3(q, pl);
        const f = forward(q.yaw);
        const toward = Math.atan2(pl.x - q.x, pl.z - q.z); // 與 forward 同一參考：比較方向向量夾角
        const fa = Math.atan2(f.x, f.z);
        const inFov = d < 1e-6 || angDiff(toward, fa) <= K.FOV;
        const seen = !pl.hidden && d <= r && inFov;
        const heardMove = moved && d <= r;
        const heardBreath = !pl.breathing && !moved && d <= r * K.BREATH_HEAR;
        const heardLoud = loud && d <= Math.max(r, K.LOUD_R);
        const heardStep = stepLoud && d < K.STEP_R;

        if (q.state === 'hunted') {
          if (seen || heardMove || heardLoud || heardStep || (!pl.hidden && !blind)) q.lastKnown = { x: pl.x, z: pl.z };
          continue;
        }
        if (heardLoud) {
          if (p > K.HIGH_P) startHunt(q, 'loud', '那聲音太大了——衛兵衝過來！');
          else { if (q.state === 'patrol') makeSuspicious(q, t); q.lookAt = { x: pl.x, z: pl.z }; }
          continue;
        }
        if (heardStep && q.grace <= 0) { q.susp += K.SUSP_STEP; hint('step'); }
        if (moved && (heardMove || seen)) {
          if (p > K.HIGH_P) { startHunt(q, 'move_high', '節奏最快的時候亂動——被發現了！'); continue; }
          if (q.grace <= 0) q.susp += K.SUSP_MOVE * dt;
          if (q.state === 'suspicious') q.lookAt = { x: pl.x, z: pl.z };
        } else if (seen || heardBreath) {
          if (q.grace <= 0) q.susp += (p > K.HIGH_P ? K.SUSP_SEEN_HIGH : K.SUSP_SEEN_LOW) * dt;
        } else if (q.state === 'patrol') {
          q.susp = Math.max(0, q.susp - K.SUSP_DECAY * dt);
        }
        q.susp = Math.min(1, q.susp);
        if (q.susp >= 1 && q.state === 'patrol') makeSuspicious(q, t);
      }
      if (g.phase !== 'play') return g;

      // 衛兵行動
      for (const q of g.guards) {
        if (!q.active) continue;
        if (q.state === 'patrol') {
          if (q.route.length === 1) {
            const s = q.route[0];
            if (Math.hypot(s.x - q.x, s.z - q.z) > 0.05) moveToward(q, s.x, s.z, K.PATROL_SPEED, dt);
            else if (q.baseYaw != null) q.yaw = q.baseYaw;
          } else if (q.pause > 0) {
            q.pause -= dt;
            if (q.pause <= 0) { const n = q.route[q.wp]; q.yaw = yawTo(n.x - q.x, n.z - q.z); }
          } else {
            const w = q.route[q.wp];
            const rest = moveToward(q, w.x, w.z, K.PATROL_SPEED, dt);
            if (rest < 0.05) {
              q.wp = (q.wp + 1) % q.route.length;
              q.pause = K.PATROL_PAUSE * (0.8 + 0.4 * rng());
            }
          }
        } else if (q.state === 'suspicious') {
          if (q.lookAt) q.yaw = yawTo(q.lookAt.x - q.x, q.lookAt.z - q.z);
        } else if (q.state === 'hunted') {
          const L = q.lastKnown || { x: pl.x, z: pl.z };
          if (Math.hypot(L.x - q.x, L.z - q.z) > 0.3) moveToward(q, L.x, L.z, K.HUNT_SPEED, dt);
          else q.yaw += K.SEARCH_TURN * dt;
          if (dist2(q, pl) < K.CATCH_R) { fail(CAUSES[huntCause || 'seen'] + '，之後被追上、抓住了。', 'caught_' + (huntCause || 'seen')); return g; }
        }
      }

      // 擺脫追殺
      if (g.hunted) {
        if (pl.hidden && !moved) g.stillT += dt; else g.stillT = 0;
        if (g.stillT >= K.ESCAPE_STILL) endHunt();
      }

      // 區域出口
      const Z = level.zones[g.zone];
      if (Z.exit) {
        let reached = false;
        if (Z.exit.kind === 'trapdoor') {
          reached = Math.hypot(pl.x - Z.exit.x, pl.z - Z.exit.z) <= K.TRAPDOOR_R;
          if (pl.x > Z.belly.x0 + 2) hint('trapdoor');
        } else if (Z.exit.kind === 'rect') reached = inRect(pl.x, pl.z, Z.exit.rect);
        if (reached) {
          if (g.hunted) hint('lockedExit');
          else {
            if (Z.exit.kind === 'trapdoor' || Z.exit.place) {
              const s = level.zones[Z.exit.to].start;
              pl.x = s.x; pl.z = s.z; pl.y = s.y || 0; pl.yaw = s.yaw || 0; pl.inBelly = false;
              pl.hidden = isHidden(pl);
              if (Z.exit.kind === 'trapdoor') emit('sfx', 'trapdoor');
            }
            enterZone(Z.exit.to);
          }
        }
      }
      if (g.zone === 4 && g.gate.progress >= K.GATE_NEED && !g.gate.open) {
        g.gate.open = true; g.phase = 'win';
        emit('sfx', 'gate_open'); emit('msg', '門閂落地，城門開了。火把的光從城外湧進來。');
      }

      // 給音訊的失控程度
      if (g.hunted) g.alarm = 1;
      else if (g.panic.active) g.alarm = Math.min(1, 0.5 + 0.5 * (t - g.panic.start) / K.CALM_TIMEOUT);
      else {
        let m = 0;
        for (const q of g.guards) if (q.active) m = Math.max(m, q.susp);
        g.alarm = 0.4 * m;
      }
      return g;
    };

    /** 從開場字卡進入區 1。 */
    g.start = function () {
      if (g.phase !== 'intro') return g;
      g.phase = 'play';
      g.player = makePlayer(1);
      enterZone(1);
      return g;
    };

    /** 失敗後從這一區開頭重來（這一區與之後的衛兵復原；已放倒的前區衛兵維持）。 */
    g.retry = function () {
      const z = Math.max(1, g.zone);
      g.player = makePlayer(z);
      resetGuards(z);
      g.hunted = false; g.stillT = 0; g.failReason = null; g.failCode = null; huntCause = null;
      g.gate.progress = 0; g.gate.pushing = false; g.gate.open = false;
      g.phase = 'play'; g.retries++;
      latchNoiseAt = -1e9;
      enterZone(z, true);
      if (g.time != null) { snapClock(g.time); clockT = g.time; updateClock(g.time); }
      emit('msg', '從「' + level.zones[z].name + '」重新開始。');
      g.alarm = 0;
      return g;
    };

    /** 畫面層每幀取走事件。 */
    g.drain = function () { return g.out.splice(0, g.out.length); };

    return g;
  }

  return {
    T, HINTS, ZONE_NAMES, CAUSES,
    createLevel, buildLevel,
    phaseAt, cycleIndex, inBlind, blindLen, radiusAt, bassBeatNear,
    zoneMul, cycleTargetFor, layerBeats, beatPhases, layerGain, beatsBetween, alertBlindAt, stepMasked, visualAidFor,
    forward, yawTo, angDiff, inRect, mulberry32
  };
});
