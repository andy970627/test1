/* 特洛伊的迴響：聲音層（UMD 全域 RissetAudio）
 * 純 Web Audio，所有聲音都是程式合成；唯一例外是「自備配樂」測試模式（設計文件 7.1）：
 * 使用者在選單選自己電腦上的音檔，loadTrack(arrayBuffer) 解碼後只在瀏覽器本機循環播放，不打包、不上傳。
 *
 * 兩層分工（設計文件第 7 節）：
 *   - 功能層：Risset 打擊、失控層、警戒低音。時間與音量和音樂層完全無關。
 *   - 音樂層：合成與自備音檔兩條，setMusicMode('synth'|'track'|'mix') 切換，各自有音量。
 *     合成＝夜風＋原創四元素（第 7 節）：低吟（類母音合成）、合唱和弦、謝帕德音階、主題動機（里拉琴／號角），
 *     依 state.zone 分區編曲、2～4 秒過渡；勝利時號角奏一次主題。主題資料匯出為 THEME（給其他章當閃回）。
 *     兩條都經過同一組音樂匯流排：盲區時短漸變壓到約 −40 dB；警戒時壓低約 −12 dB 並低切約 200 Hz，
 *     讓慢低音最清楚；追殺時略提高。所有音量變化都用 ctx.currentTime 排程的 ramp。
 *
 * Risset 節奏【改編】：
 *   - 4 層打擊（k = 0..3，層數、M、σ、門檻全部讀 RissetRules.T），每層在一個循環內速度從 v·2^k 指數加速到 v·2^(k+1)。
 *     追殺時規則多給第 5 層（k = 4），5 層都走鐘形曲線（音量由 RissetRules.layerGain 決定，這裡不自己算）。
 *   - 節拍唯一來源是規則（設計文件 8.1、8.4）：循環長度 T 跟著危險程度變，聲音層不自己算相位，
 *     每次 update(state) 讀 state.cycle.anchor {t, p, T}，用 p(t) = anchor.p + (t − anchor.t) ÷ anchor.T 外推排程
 *     （另外由相鄰兩次 anchor 估 T 的變化率，外推更準；新 anchor 一到，已預排還沒響的拍偏差超過 1 ms 就取消重排）。
 *     沒有 anchor 的舊規則：退回固定 T 與 t0（anchor = {t: t0, p: 0, T}）。
 *   - 拍點公式以規則為準：有 RissetRules.beatPhases／beatsBetween 就用它算每層拍點的相位表，沒有才用下面的公式。
 *   - 第 k 層第 n 拍落在 p = log2(1 + n ÷ (M·2^k))，n = 0 .. M·2^k − 1。
 *     （速度 f(p) = f0·2^(k+p)，積分後拍數 = M·2^k·(2^p − 1)，M = f0·T ÷ ln2 取整數）
 *     所以每層每個循環剛好整數拍，p = 1 時第 k 層的速度、拍點和下一循環第 k+1 層 p = 0 完全接上。
 *   - 增益是「速度位置」x = (k + p) ÷ 層數 的鐘形曲線：最慢的從無聲淡入、最快的淡出到無聲。
 *     每拍的實際響度和規則的 gain 成正比：不抖音量（只抖音色：頻率 ±3%），節奏匯流排也不隨 p 變。
 *   - 音色跟著 x 走（低鼓 → 框鼓 → 手拍 → 金屬敲擊），交接時音色也連續，聽起來一直加速卻不會變快。
 *   - 例外（遊戲要的）：p 從接近 1 跳回 0 的盲區（長度跟規則 BLIND_LEN 同值，目前 0.6 秒，以秒計、不隨 T 變）：
 *     不排拍、節奏匯流排（含殘響）壓到幾乎無聲，音樂層（夜風、低吟或自備音檔）也一起壓到約 −40 dB，聽得出「斷掉、空掉 → 現在可以動」。
 *     警戒時（規則的 panic）快速循環的盲區暫停，改在兩個低音拍正中央（規則決定；有 RissetRules.blindWindows 就用它）。
 *     預測的盲區用來精準排 gate；規則每幀給的 state.cycle.blind 是最後裁決，連續兩幀不一致就以規則為準強制靜音／打開。
 *   - 節奏匯流排的音量固定（RHYTHM_GAIN）：以前隨 p 從 0.7 漲到 1.0、交接掉回 0.7（−3.1 dB），假驟降時那 3 dB 就是接縫。
 *     「越來越危險」交給拍點越來越密、音色往金屬走，以及音樂層（謝帕德音階本來就隨 p 上升）。
 *   - 假驟降（設計文件 8.5）：規則的 cycle.fake（這一輪開頭）／cycle.nextFake（下一次交接）為真時，那次交接照常排拍、
 *     不排盲區靜音（節奏、音樂、衛兵都不壓）、謝帕德音階不留空；規則也不會發 pre_blind。
 *     聽得出差別：交接處多兩拍極輕的金屬尾音。尾音拍由規則給：beatsBetween(a, b, game, { includeFakeTail: true })
 *     回傳 tail: true 的拍（k = 3 與 k = 4 各一拍，gain = T.FAKE_TAIL_GAIN），這裡只負責排程，不自己算。
 *     交接必須無縫：除了尾音以外，交接前後的響度差 < 0.5 dB（匯流排不隨 p 變＋規則的層音量交接連續）。
 *
 * 聲音互動（設計文件 8.3）：腳步 step_masked／step_loud、安撫哼唱 calm_ok／calm_bad（低吟唱主題第 index 個音）、
 *   門閂 latch_step（里拉琴奏主題第 index 個音，8 音）、衛兵 3D 聽聲辨位（setListener＋每名衛兵一個 HRTF PannerNode，最多 6 名）。
 *
 * 暗示聲（設計文件 2026-11-07-hint-guidance.md 第 2 節）【改編】：新加的聲音暗示全部走暗示匯流排（hintBus → 盲區 gate，壓到約 −46 dB），
 *   單發的再用 hintFree() 檢查不和預測的盲區重疊，盲區仍是乾淨的空檔。聲音暗示一直都在（不乘 visualAid）。
 *   cue：companionGasp（同伴倒吸氣＋氣聲「別動」）、whisperNow（氣聲「就是現在」）、growl（衛兵起疑低吼，3D）、
 *   gravel（不合拍腳步後碎石滾動，stepLoud 自動帶）、latchClick（推門閂時節奏快要變快的「喀」）；高頻推門閂的 latch 開頭多一聲刺耳的「喀」。
 *   衛兵聲音隨相位變清楚；背對你、可暗殺的衛兵（規則 hintSignals）在盲區前呼吸放大、時間對準盲區開頭。
 *   路線（2.2 節）：風從暗門外（區 1）、城門方向（區 2、4）、巷尾（區 3）傳來（3D）；區 2 起偶爾有遠方號角從城門外吹響
 *   （只在盲區剛結束、吹完碰不到下一段盲區時）；城門區門外大軍的低語隨門閂進度越來越近。警戒時路線環境聲退後。
 *
 * 喇叭可聽度（11/08，回應 11/07 喇叭試玩「驟降、慢低音、腳步合拍都聽不出來」；設計文件 2026-11-08 第 3 節第 2 點）【改編】：
 *   筆電喇叭 150～200 Hz 以下幾乎聽不到，200～4000 Hz 最清楚，所以三個核心訊號都在中頻補一份、不只靠低頻與左右聲道。
 *   - 驟降：預告音 pre_blind 改成兩聲短促的木魚（1.3／2.0／2.8 kHz，PRE_BLIND_GAIN），不再是極輕的弦泛音；
 *     盲區前最後 BRIGHT_LEAD 秒節奏匯流排的高架濾波（BRIGHT_HZ 以上）往上開 BRIGHT_DB，金屬、手拍（k = 2、3）稍亮，盲區一到全部靜下。
 *     只改音色濾波，不改拍點與音量曲線；用和盲區 gate 同一份預測時段，所以假驟降（沒有盲區）既沒有預告音也不變亮。
 *   - 慢低音：低音拍多一層 200～600 Hz 的鼓皮拍擊＋木框敲擊（BASS_MID_GAIN），音色和 Risset 低鼓／框鼓分開；
 *     警戒開始（規則 panic.active 轉真，低音第一拍在 BASS_LEAD 後）到第一拍後 ALERT_DUCK_BEATS 拍之間，
 *     節奏與失控層一起壓低 ALERT_DUCK_GAIN（約 −6 dB），讓低音先單獨出來一兩拍，之後 0.6 秒回來。
 *   - 腳步：step_loud 多一聲 1～4 kHz 的碎石「喀嚓」（STEP_CRUNCH_GAIN），最近 8 公尺內的衛兵短促吸一口氣（被聽到的回饋）；
 *     step_masked 維持極輕、極悶。
 *
 * 排程：每一拍都用 ctx.currentTime 的絕對時間預先排程；計時器只負責「補排程」（預排 0.5 秒），不負責計時。
 *       不使用畫面幀時間。計時器優先用 Worker 裡的 setInterval（25 ms）送 tick 給主執行緒（背景分頁不被降到 1 秒），
 *       建不起來就用主執行緒 setInterval。畫面每幀很慢（例如 200 ms）時，0.5 秒的預排仍蓋得住；
 *       萬一主執行緒卡更久，從上次排到的地方接著補：還沒過的拍照排，已經過的跳過，不累積誤差。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RissetAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    T: 10,             // 循環週期（秒），規則同值
    BASS_TAIL: 1.1,    // 低音拍的餘音長度（秒）：巡邏時離盲區開始不到這麼久的拍不排
    BLIND: 0.6,        // 盲區預設（秒）；實際值以規則為準：createAudio 的 opts.blind，或 update(state) 讀 state.T.BLIND_LEN
    // 下面四個只是規則還沒載入時的備援預設；執行時一律讀 RissetRules.T（RISSET_LAYERS、RISSET_M、BELL_SIGMA、BEAT_MIN_GAIN）
    LAYERS: 4,         // 打擊層數（備援）
    M: 7,              // 最慢層每循環拍數（備援）；f0 = M·ln2 ÷ T ≈ 0.485 拍/秒（29→58 BPM），最快層 233→466 BPM
    BELL_SIGMA: 0.22,  // 鐘形曲線寬度（備援；x 為 0..1）
    MIN_GAIN: 0.02,    // 低於這個增益的拍不排（備援）
    RHYTHM_GAIN: 1.0,  // 節奏匯流排固定增益：不隨 p 變，假驟降交接才無縫
    TIMBRE_JITTER: 0.03, // 每拍音色抖動：所有頻率 ×(1 ± 3%)；音量不抖，實際響度 ∝ 規則 gain
    GATE_FLOOR: 0.03,  // 盲區時節奏匯流排殘留增益
    GATE_FALL: 0.08,   // 進盲區前的下滑時間（秒）
    GATE_RISE: 0.12,   // 出盲區後的回升時間（秒）
    LOOKAHEAD: 0.5,    // 預先排程長度（秒）：主執行緒每幀卡到約 0.4 秒也不丟拍
    CATCHUP_MAX: 4,    // 落後超過這麼多秒（分頁休眠）就不回頭掃，直接從現在接上
    TICK_MS: 25,       // 補排程間隔
    BASS_PERIOD: 2.4,  // 低音週期，規則同值
    BASS_BASE: 0.22,   // 巡邏時低音增益
    // 音樂層（合成與自備音檔共用）
    MUSIC_BLIND_FLOOR: 0.01,   // 盲區時音樂層增益（−40 dB）
    MUSIC_FALL: 0.05,          // 進盲區前的下滑時間（秒）
    MUSIC_RISE: 0.15,          // 出盲區後的回升時間（秒）
    MUSIC_ALARM_DB: -12,       // 警戒滿值時音樂層壓低（dB）
    MUSIC_HP_BASE: 20,         // 平時音樂層低切頻率（Hz，等於沒切）
    MUSIC_HP_ALARM: 200,       // 警戒滿值時低切頻率（Hz）
    MUSIC_HUNT_GAIN: 1.15,     // 追殺時音樂層略提高
    MUSIC_RAMP: 0.25,          // 模式、音量、警戒變化的 ramp 長度（秒）
    TRACK_VOL: 0.35,           // 自備音檔預設音量（市售音檔通常很滿，先放低）
    SYNTH_VOL: 1,              // 合成音樂層預設音量
    // 原創音樂層（第 7 節）：頻段、分區、各元素參數
    MUSIC_EQ_HP: 130,          // 音樂層高通（Hz）：讓出低音拍（43–128 Hz）與低鼓
    MUSIC_EQ_NOTCH: 1200,      // 挖掉手拍、金屬敲擊的主頻（Hz）
    MUSIC_EQ_NOTCH_DB: -8,
    ECHO_TIME: 0.27, ECHO_FB: 0.32, ECHO_WET: 0.35,   // 音樂層回聲
    ZONE_XFADE: 3,             // 分區過渡（秒）
    CHANT_GAIN: 0.05,          // 低吟
    CHORUS_GAIN: 0.035,        // 合唱和弦（每聲部總和前）
    SHEP_VOICES: 6,            // 謝帕德聲部數（6 個八度）
    SHEP_BASE: 73.42,          // 最低聲部 p=0 時的頻率（D2）；鐘形中心在 D5 附近（587 Hz）
    SHEP_SIGMA: 0.18,          // 謝帕德鐘形寬度（八度位置 x 為 0..1）
    SHEP_GAIN: 0.011,          // 每條振盪器峰值增益
    SHEP_DETUNE: 7,            // 合唱感：每聲部兩條 ±7 cents
    SHEP_LP_LO: 1400, SHEP_LP_HI: 4200,   // 低通隨 p 打開（Hz）
    LYRE_LEN: 1.8,             // 里拉琴撥弦長度（秒）
    LYRE_DECAY: 0.996,         // Karplus-Strong 每週期衰減
    LYRE_VEL: 0.09,            // 里拉琴音量
    FAKE_TAIL_GAIN: 0.035,     // 假驟降的金屬尾音音量（備援；正本是規則 T.FAKE_TAIL_GAIN，尾音拍本身也由規則給）
    THEME_N0: 4,               // 主題第一個音最早落在第 3 層第幾拍；循環短時往後找，直到盲區＋回升之後
    // 跟隨規則節拍
    RESCHED_TOL: 0.001,        // 已預排的拍和新預測差超過這麼多秒就取消重排
    RESCHED_MARGIN: 0.01,      // 這麼多秒內就要響的拍不動
    JUMP: 0.08,                // 新 anchor 和預測相差超過這麼多個循環：視為重來（重開局、檢查點），清掉預排
    SHEP_STEP: 0.05,           // 謝帕德音階控制點間隔（秒）
    // 聲音互動（8.3）
    HUM_GAIN: 0.16,            // 安撫哼唱
    LATCH_VEL: 0.17,           // 門閂的里拉琴音量
    STEP_MASKED_GAIN: 0.05,    // 被鼓聲蓋過的腳步
    STEP_LOUD_GAIN: 0.55,      // 清楚的腳步
    STEP_CRUNCH_GAIN: 0.6,     // 不合拍腳步的碎石「喀嚓」（1～4 kHz，喇叭也清楚；單獨量 1～4 kHz 峰值約 −25 dB，和一下鼓點相當或更亮）
    // 喇叭可聽度（11/08）
    PRE_BLIND_GAIN: 0.4,       // 盲區預告：木魚兩聲的音量
    BRIGHT_HZ: 1800,           // 盲區前節奏匯流排高架濾波的轉折頻率（Hz）：主要碰到手拍、金屬（k = 2、3）
    BRIGHT_DB: 4,              // 盲區前最後 BRIGHT_LEAD 秒亮多少（dB）
    BRIGHT_LEAD: 0.3,          // 盲區前多久開始變亮（秒）
    BASS_MID_GAIN: 0.85,       // 低音拍的中頻敲擊成分（200～600 Hz）
    ALERT_DUCK_GAIN: 0.5,      // 警戒開始時節奏層壓到多少（−6 dB），讓低音先單獨出來
    ALERT_DUCK_BEATS: 1.5,     // 壓到低音第一拍之後幾拍才回來
    // 衛兵 3D
    MAX_GUARD_VOICES: 6,       // 同時有聲音的衛兵上限（HRTF 很吃 CPU）
    GUARD_FAR: 30,             // 超過這個距離（公尺）不出聲；最後 8 公尺淡出
    GUARD_BLIND_FLOOR: 0.08,   // 盲區時衛兵聲音壓到多少（約 −22 dB：盲區要聽起來是空檔，貼身的衛兵仍隱約可辨）
    EAR_Y: 1.6,                // 聽者耳朵高度（公尺）
    // 暗示聲（設計文件 2026-11-07-hint-guidance.md 第 2 節）：全部走 hintBus → 盲區 gate
    HINT_BLIND_FLOOR: 0.005,   // 盲區時暗示聲壓到多少（約 −46 dB）：盲區要是乾淨的空檔
    HINT_GAIN: 1,              // 暗示聲總音量
    WHISPER_GAIN: 0.9,         // 同伴的氣聲低語（窄帶通後能量小，所以峰值設高）
    GROWL_GAIN: 0.3,           // 衛兵起疑的低吼
    GRAVEL_GAIN: 0.12,         // 不合拍腳步後的碎石滾動
    WIND_GAIN: 0.05,           // 路線的風（從城門／巷尾／暗門方向）
    HORN_GAIN: 0.05,           // 遠方希臘大軍的號角（從城門方向）
    HORN_EVERY: 22,            // 號角大約每幾秒一次（只在盲區剛結束時吹，吹完不碰到下一段盲區）
    MURMUR_GAIN: 0.06,         // 城門外大軍的低語（越推門閂越近）
    KILL_BREATH_MUL: 1.8,      // 盲區前，背對你、可暗殺的衛兵呼吸聲放大幾倍
    GUARD_P_GAIN: 0.5          // 衛兵聲音隨相位變清楚：×(0.75 + 0.5·p)
  };

  // ---------- 主題動機（原創，D 多利安）----------
  // 其他章當作創傷閃回時直接讀這份資料：midi 音高、units 時值（1 unit ≈ 0.22 秒，里拉琴；號角 0.32 秒）。
  // 輪廓：D 往上跳五度到 A，碰一下多利安特有的 B（大六度），再沿 F、E 走回 D。前 4 音（D A B A）是「可以走了」的短句。
  var THEME = {
    name: '回家的動機', mode: 'D 多利安', tonic: 62,
    notes: [
      { midi: 62, name: 'D4', units: 2 },
      { midi: 69, name: 'A4', units: 1 },
      { midi: 71, name: 'B4', units: 1 },
      { midi: 69, name: 'A4', units: 2 },
      { midi: 65, name: 'F4', units: 1 },
      { midi: 64, name: 'E4', units: 1 },
      { midi: 62, name: 'D4', units: 4 }
    ]
  };
  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 各 cue 名稱與別名（規則層的 sfx 名稱不確定時都接得住）
  var CUE_ALIAS = {
    breath: 'breathIn', breathin: 'breathIn', hold: 'breathIn', inhale: 'breathIn',
    breathend: 'breathOut', breathout: 'breathOut', release: 'breathOut', exhale: 'breathOut',
    gasp: 'gasp', pant: 'gasp',
    step: 'step', footstep: 'step', move: 'step',
    latch: 'latch', bolt: 'latch', door: 'latch', push: 'latch',
    down: 'down', thud: 'down', fall: 'down', takedown: 'down', kill: 'down',
    bell: 'bell', alarm: 'bell', hunt: 'bell', hunted: 'bell',
    alert: 'alert', suspicious: 'alert',
    caught: 'caught', fail: 'caught',
    takedownfail: 'takedownFail',
    calmok: 'calmOk', calmbad: 'calmBad', calmdone: 'calmDone',
    stepmasked: 'stepMasked', steploud: 'stepLoud', latchstep: 'latchStep',
    checkpoint: 'checkpoint', dash: 'dash', escape: 'escape', trapdoor: 'trapdoor',
    gravel: 'gravel', companiongasp: 'companionGasp', whispernow: 'whisperNow', growl: 'growl', latchclick: 'latchClick',
    blind: 'blind', gap: 'blind',
    preblind: 'preBlind', blindsoon: 'preBlind', preblindcue: 'preBlind',
    win: 'win', victory: 'win', gate: 'win', open: 'win', gateopen: 'win'
  };
  // risset.js 的 game.out sfx 名稱：alert breath_in breath_out calm_ok calm_bad calm_done caught checkpoint
  //   dash escape gasp gate_open hunt latch takedown takedown_fail trapdoor（底線、大小寫都忽略）

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function frac(v) { return v - Math.floor(v); }
  function bell(x, sigma) { var d = (x - 0.5) / (sigma || C.BELL_SIGMA); return Math.exp(-d * d); }
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
    var BL = isFinite(opts.blind) && opts.blind >= 0 ? +opts.blind : C.BLIND;   // 盲區長度（秒），跟規則 BLIND_LEN 對齊
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
    // gate 只管盲區（精準排程）；rhythmOut 是節奏匯流排的固定總增益（A1：不隨 p 變，假驟降交接才沒有接縫）
    var rhythmOut = ctx.createGain(); rhythmOut.gain.value = C.RHYTHM_GAIN; rhythmOut.connect(master);
    // 警戒開始時節奏＋失控層一起壓低（ALERT_DUCK_GAIN），讓低音先單獨出來一兩拍；平時 1
    var rhythmDuck = ctx.createGain(); rhythmDuck.gain.value = 1; rhythmDuck.connect(rhythmOut);
    var gate = ctx.createGain(); gate.gain.value = 1; gate.connect(rhythmDuck);
    var rhythmBus = ctx.createGain(); rhythmBus.gain.value = mute.rhythm ? 0 : 1;
    var rhythmHP = ctx.createBiquadFilter(); rhythmHP.type = 'highpass'; rhythmHP.frequency.value = 30; rhythmHP.Q.value = 0.5;
    rhythmBus.connect(rhythmHP);
    // 盲區前的「亮度」：高架濾波，平時 0 dB，盲區前 BRIGHT_LEAD 秒內開到 BRIGHT_DB（由 gateB 照預測的盲區時段排程）
    var bright = ctx.createBiquadFilter(); bright.type = 'highshelf'; bright.frequency.value = C.BRIGHT_HZ; bright.gain.value = 0;
    rhythmHP.connect(bright);
    var dry = ctx.createGain(); dry.gain.value = 0.85; bright.connect(dry); dry.connect(gate);
    var verb = ctx.createConvolver(); verb.buffer = makeIR(2.4, 3);
    var verbSend = ctx.createGain(); verbSend.gain.value = 0.28; bright.connect(verbSend); verbSend.connect(verb);
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.6; verb.connect(verbOut); verbOut.connect(gate);
    var shaper = ctx.createWaveShaper(); shaper.curve = shaperCurve(6); shaper.oversample = '2x';
    var distWet = ctx.createGain(); distWet.gain.value = 0; bright.connect(distWet); distWet.connect(shaper);
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
    var collect = null;                  // 不是 null 時，tone／noise 建出的音源都記進來（一拍可以整個取消）
    var jit = 1;                         // 音色抖動：playHit 期間所有 tone／noise 的頻率乘這個值（A3：抖音色不抖音量）
    function env(param, t, peak, att, dec) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
      param.exponentialRampToValueAtTime(0.0001, t + att + dec);
    }
    function tone(dest, t, type, f1, f2, glide, peak, att, dec) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f1 * jit, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2 * jit, t + glide);
      env(g.gain, t, peak, att, dec);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + att + dec + 0.05);
      if (collect) collect.push(o);
      return o;
    }
    function noise(dest, t, ftype, freq, q, peak, att, dec, rate) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; if (rate) s.playbackRate.value = rate;
      f.type = ftype; f.frequency.setValueAtTime(freq * jit, t); f.Q.value = q;
      env(g.gain, t, peak, att, dec);
      s.connect(f); f.connect(g); g.connect(dest);
      var off = Math.random() * 1.5;
      s.start(t, off); s.stop(t + att + dec + 0.05);
      if (collect) collect.push(s);
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
      jit = 1 + (Math.random() * 2 - 1) * C.TIMBRE_JITTER;    // 只抖音色（頻率），音量照 g
      if (1 - w > 0.05) INST[i0](dest, t, g * (1 - w));
      if (w > 0.05 && i1 !== i0) INST[i1](dest, t, g * w);
      jit = 1;
    }

    var bassPending = [];                 // 已排程、還沒響的低音拍（重新對齊時取消舊網格）
    function bassHit(t) {                 // 極慢重低音：深鼓 + 一聲低吟般的嗡
      var d = ctx.createGain(); d.connect(bassBus);
      bassPending.push({ t: t, out: d });
      tone(d, t, 'sine', 64, 43, 0.45, 0.95, 0.004, 1.15);
      tone(d, t, 'sine', 128, 88, 0.3, 0.25, 0.004, 0.5);
      noise(d, t, 'lowpass', 140, 0.8, 0.4, 0.003, 0.12);
      // 中頻敲擊（200～600 Hz，11/08）：鼓皮被手掌拍到的「啪」＋木框一聲，筆電喇叭聽得到拍點；
      // 音色和 Risset 低鼓（96→48 Hz）、框鼓（205→150 Hz＋900 Hz 噪音）分開，短促、不拖尾
      tone(d, t, 'triangle', 330, 290, 0.06, C.BASS_MID_GAIN * 0.6, 0.002, 0.1);
      noise(d, t, 'bandpass', 430, 1.6, C.BASS_MID_GAIN, 0.002, 0.06);
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 1.2);
    }

    // ---------- 音樂層匯流排 ----------
    // synthLevel / trackLevel（模式與各自音量）→ musicHP（警戒低切）→ musicDuck（警戒／追殺）→ musicGate（盲區）→ master
    var musicGate = ctx.createGain(); musicGate.gain.value = 1; musicGate.connect(master);
    var musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(musicGate);
    var musicHP = ctx.createBiquadFilter(); musicHP.type = 'highpass'; musicHP.frequency.value = C.MUSIC_HP_BASE; musicHP.Q.value = 0.7;
    musicHP.connect(musicDuck);
    var music = { mode: 'synth', synthVol: C.SYNTH_VOL, trackVol: C.TRACK_VOL, buf: null, src: null };
    var synthLevel = ctx.createGain(); synthLevel.gain.value = music.synthVol; synthLevel.connect(musicHP);
    var trackLevel = ctx.createGain(); trackLevel.gain.value = 0; trackLevel.connect(musicHP);
    function rampTo(param, v, dur, expo) {      // 從現在的值排程 ramp 到 v（ctx.currentTime 為準）
      var now = ctx.currentTime, cur = param.value;
      param.cancelScheduledValues(now); param.setValueAtTime(cur, now);
      if (expo) param.exponentialRampToValueAtTime(Math.max(v, 1e-4), now + dur);
      else param.linearRampToValueAtTime(v, now + dur);
    }
    function applyMusicLevels(dur) {
      var d = dur == null ? C.MUSIC_RAMP : dur;
      rampTo(synthLevel.gain, music.mode === 'track' ? 0 : music.synthVol, d);
      rampTo(trackLevel.gain, (music.mode !== 'synth' && music.buf) ? music.trackVol : 0, d);
    }
    function stopTrack() {
      if (music.src) { try { music.src.stop(); } catch (e) {} try { music.src.disconnect(); } catch (e) {} music.src = null; }
    }

    // ---------- 環境：夜風（合成音樂層的底） ----------
    var persist = [];                       // 常駐的振盪器／音源，dispose 時一起停（不然斷開後仍佔 CPU）
    var ambient = ctx.createGain(); ambient.gain.value = 0; ambient.connect(synthLevel);
    if (!mute.ambient) {
      var w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
      var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8;
      var wl = ctx.createOscillator(); wl.frequency.value = 0.07; var wlg = ctx.createGain(); wlg.gain.value = 220;
      wl.connect(wlg); wlg.connect(wf.frequency);
      var wg = ctx.createGain(); wg.gain.value = 0.022;
      w.connect(wf); wf.connect(wg); wg.connect(ambient); w.start(); wl.start();
      persist.push(w, wl);
      ambient.gain.setValueAtTime(0, ctx.currentTime);
      ambient.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    }

    // ---------- 原創音樂層（設計文件第 7 節）【改編】 ----------
    // 四個元素：低吟（常駐）、合唱和弦（偶爾）、謝帕德音階（每循環）、主題動機（盲區剛結束）。
    // 全部接在 musicEQ → synthLevel 之前，所以都經過 musicHP（警戒低切）→ musicDuck（警戒退後）→ musicGate（盲區靜音）。
    // 頻段：musicEQ 先高通 130 Hz（讓出低音拍 43–128 Hz 與低鼓），再在 1.2 kHz 挖 −8 dB（手拍、金屬敲擊的主頻）。
    var ML = opts.musicLayers || {};
    var layerOn = { chant: ML.chant !== false, chorus: ML.chorus !== false, shepard: ML.shepard !== false, theme: ML.theme !== false };
    if (mute.music) layerOn = { chant: false, chorus: false, shepard: false, theme: false };
    var forcedZone = (opts.musicZone != null && isFinite(opts.musicZone)) ? clamp(Math.round(+opts.musicZone), 0, 4) : null;

    var mEQhp = ctx.createBiquadFilter(); mEQhp.type = 'highpass'; mEQhp.frequency.value = C.MUSIC_EQ_HP; mEQhp.Q.value = 0.7;
    var mEQnotch = ctx.createBiquadFilter(); mEQnotch.type = 'peaking'; mEQnotch.frequency.value = C.MUSIC_EQ_NOTCH;
    mEQnotch.Q.value = 1.4; mEQnotch.gain.value = C.MUSIC_EQ_NOTCH_DB;
    mEQhp.connect(mEQnotch); mEQnotch.connect(synthLevel);
    // 便宜的回聲（延遲＋回授＋低通），代替第二個捲積殘響：主題、合唱用。也在 musicGate 之前，盲區一樣被壓掉
    var echoIn = ctx.createGain(); echoIn.gain.value = 1;
    var echoD = ctx.createDelay(1); echoD.delayTime.value = C.ECHO_TIME;
    var echoFb = ctx.createGain(); echoFb.gain.value = C.ECHO_FB;
    var echoLP = ctx.createBiquadFilter(); echoLP.type = 'lowpass'; echoLP.frequency.value = 1800;
    echoIn.connect(echoD); echoD.connect(echoLP); echoLP.connect(echoFb); echoFb.connect(echoD);
    var echoOut = ctx.createGain(); echoOut.gain.value = C.ECHO_WET; echoLP.connect(echoOut); echoOut.connect(mEQhp);

    function bus(send) {                     // 每個元素一條匯流排：分區音量在這裡 ramp
      var g = ctx.createGain(); g.gain.value = 0; g.connect(mEQhp);
      if (send) { var s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(echoIn); }
      return g;
    }
    var chantBus = bus(0), chorusBus = bus(0.5), shepBus = bus(0.15), themeBus = bus(0.8);

    // 低吟：男聲「ㄚ—ㄛ—」。D3＋略走音的 D3＋A3 三條鋸齒（基音 147／220 Hz，在低音拍之上），
    // 經三個帶通共振峰（F1、F2、F3）；共振峰被一個很慢的 LFO 在「ㄚ」(730/1090) 和「ㄛ」(570/840) 之間推移，像換氣換字。
    var chantLP = ctx.createBiquadFilter(); chantLP.type = 'lowpass'; chantLP.frequency.value = 2400; chantLP.connect(chantBus);
    if (!mute.music) {
      var chantSrc = ctx.createGain(); chantSrc.gain.value = 1;
      [[146.83, 1], [147.6, 0.8], [220.0, 0.55]].forEach(function (v) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = v[0]; g.gain.value = v[1];
        o.connect(g); g.connect(chantSrc); o.start(); persist.push(o);
      });
      var chantAmp = ctx.createGain(); chantAmp.gain.value = C.CHANT_GAIN; chantAmp.connect(chantLP);
      var vowelLFO = ctx.createOscillator(); vowelLFO.frequency.value = 0.045; vowelLFO.start(); persist.push(vowelLFO);
      [[650, 80, 6, 1], [965, 125, 8, 0.55], [2450, 0, 10, 0.12]].forEach(function (fm) {   // [中心, LFO 深度, Q, 音量]
        var f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = fm[0]; f.Q.value = fm[2]; g.gain.value = fm[3];
        if (fm[1]) { var d = ctx.createGain(); d.gain.value = fm[1]; vowelLFO.connect(d); d.connect(f.frequency); }
        chantSrc.connect(f); f.connect(g); g.connect(chantAmp);
      });
      var breathLFO = ctx.createOscillator(); breathLFO.frequency.value = 0.11;     // 呼吸般的起伏（±35%）
      var breathD = ctx.createGain(); breathD.gain.value = C.CHANT_GAIN * 0.35;
      breathLFO.connect(breathD); breathD.connect(chantAmp.gain); breathLFO.start(); persist.push(breathLFO);
    }

    // 分區編曲：每區各元素的目標音量（ramp 長度 ZONE_XFADE 秒）
    //   chant 低吟、chorus 合唱、shep 謝帕德、theme 主題動機奏幾個音（0＝不奏）、far＝低吟像從遠處（低通 450 Hz）、
    //   chorusEvery 每幾個循環一次合唱和弦（0＝不唱）
    var ZONE_MIX = [
      { chant: 0.4, chorus: 0, shep: 0, theme: 0, far: true, chorusEvery: 0 },   // 0 開場字卡
      { chant: 0.4, chorus: 0, shep: 0, theme: 0, far: true, chorusEvery: 0 },   // 1 木馬腹中：心跳＋鼓，只剩很遠的低吟
      { chant: 1, chorus: 1, shep: 0, theme: 4, far: false, chorusEvery: 3 },    // 2 神殿廣場：加低吟（主題只露前 4 音）
      { chant: 1, chorus: 1, shep: 1, theme: 4, far: false, chorusEvery: 3 },    // 3 窄巷：加謝帕德音階
      { chant: 1.1, chorus: 1, shep: 1, theme: 7, far: false, chorusEvery: 2 },  // 4 城門：全部疊上，主題完整
      { chant: 1.3, chorus: 1, shep: 0, theme: 0, far: false, chorusEvery: 0 }   // 5 勝利：謝帕德收掉，低吟撐起，號角奏主題
    ];
    var mz = { zone: -1, mix: ZONE_MIX[1], won: false, chorusN: 0 };
    function applyZone(z, dur) {
      if (z === mz.zone) return;
      var m = ZONE_MIX[z] || ZONE_MIX[1], d = dur == null ? C.ZONE_XFADE : dur;
      mz.zone = z; mz.mix = m;
      rampTo(chantBus.gain, layerOn.chant ? m.chant : 0, d);
      rampTo(chorusBus.gain, layerOn.chorus ? m.chorus : 0, d);
      rampTo(shepBus.gain, layerOn.shepard ? m.shep : 0, d);
      rampTo(themeBus.gain, layerOn.theme ? 1 : 0, Math.min(d, 0.5));
      rampTo(chantLP.frequency, m.far ? 450 : 2400, d, true);
    }
    applyZone(forcedZone != null ? forcedZone : (opts.zone != null ? clamp(opts.zone | 0, 0, 4) : 0), 0.01);

    // 里拉琴（Karplus-Strong 撥弦）：每個音高預先算一段緩衝（只算一次），播放時一個 BufferSource。
    // 音高 = sr ÷ (N + 0.5)（平均濾波多半格延遲），用 playbackRate 補到準確頻率。
    var ksCache = {};
    function ksBuffer(midi) {
      if (ksCache[midi]) return ksCache[midi];
      var f = midiHz(midi), N = Math.max(2, Math.round(sr / f - 0.5)), len = Math.floor(sr * C.LYRE_LEN);
      var b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(N), lp = 0, i, peak = 0, dc = 0;
      for (i = 0; i < N; i++) { lp = lp * 0.45 + (Math.random() * 2 - 1) * 0.55; ring[i] = lp; }   // 指腹撥：帶一點低通的噪音
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
    }
    // 號角：兩條略走音的鋸齒＋低通開合＋微顫音（勝利時奏主題）
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
    // 主題動機奏一次。voice：'lyre'（里拉琴，主題動機原調）｜'horn'（號角，低八度、有八度疊奏）
    // unit：一個時值單位的秒數；回傳結束時間
    function playTheme(voice, t, opt) {
      opt = opt || {};
      var dest = opt.dest || (voice === 'horn' ? cueBus : themeBus), unit = opt.unit || (voice === 'horn' ? 0.32 : 0.22);
      var n = Math.min(opt.notes || THEME.notes.length, THEME.notes.length), at = 0;
      for (var i = 0; i < n; i++) {
        var nt = THEME.notes[i], last = i === n - 1;
        if (voice === 'horn') {
          var dur = nt.units * unit * (last ? 1.6 : 0.95) + 0.12;
          horn(dest, t + at * unit, midiHz(nt.midi - 12), dur, 0.15);
          if (last || i === 0) horn(dest, t + at * unit, midiHz(nt.midi - 24), dur, 0.1);
        } else lyre(dest, t + at * unit, nt.midi, C.LYRE_VEL * (i === 0 ? 1.1 : 1));
        at += nt.units;
      }
      return t + at * unit;
    }

    // ---------- 節拍來源：規則的 cycle.anchor（設計文件 8.1、8.4）----------
    // 內部一律用「累計相位」P：整數部分＝第幾個循環，小數部分＝p。外推模型 seg = {t, P, T, a, Tt}：
    //   從音訊時間 t 起循環長度 T(s) = T + a·(s − t)，到達目標 Tt（規則的 targetT）後停住；P(s) = P + ∫ ds ÷ T(s)。
    //   a = 0 就是設計文件的 p(t) = anchor.p + (t − anchor.t) ÷ anchor.T。a 由相鄰兩次 anchor 的 T 估出
    //   （規則每秒最多變 20%），讓 0.5 秒預排的誤差從最多約 25 ms 降到 1 ms 左右；剩下的誤差靠「取消重排」補。
    var seg = { t: t0, P: 0, T: T, a: 0, Tt: null };
    var segLast = null;                       // 上一次收到的 anchor（估斜率、判斷重複）
    function segTs(sg) {                      // T 到達目標的時間（不會到達 → Infinity）
      if (!sg.a || sg.Tt == null) return Infinity;
      var d = (sg.Tt - sg.T) / sg.a;
      return d > 0 ? sg.t + d : Infinity;
    }
    function Pof(s, sg) {
      sg = sg || seg;
      var ts = segTs(sg), u = Math.min(s, ts) - sg.t, P;
      if (Math.abs(sg.a) < 1e-7) P = sg.P + u / sg.T;
      else P = sg.P + Math.log(Math.max(1e-6, (sg.T + sg.a * u) / sg.T)) / sg.a;
      if (s > ts) P += (s - ts) / sg.Tt;
      return P;
    }
    function tAt(P, sg) {
      sg = sg || seg;
      var dP = P - sg.P, ts = segTs(sg), Pts = ts === Infinity ? Infinity : Pof(ts, sg) - sg.P;
      if (dP > Pts) return ts + (dP - Pts) * sg.Tt;
      if (Math.abs(sg.a) < 1e-7) return sg.t + dP * sg.T;
      return sg.t + sg.T * (Math.exp(sg.a * dP) - 1) / sg.a;
    }
    function Tof(s) { var ts = segTs(seg); return s >= ts ? seg.Tt : Math.max(0.5, seg.T + seg.a * (s - seg.t)); }

    // ---------- 拍點相位表：以規則為準 ----------
    // tables[k] = 第 k 層一個循環內所有拍點的相位（0..1，遞增）。規則有 beatPhases(k)（回傳陣列）或 beatPhases(k, n)（第 n 拍）
    // 就用它；只有 beatsBetween(a, b, game) 時，拿一個 T = 1 的假循環問一次；都沒有或格式不對，用自己的公式。
    var R = opts.rules || null;
    function getRules() { if (!R && typeof self !== 'undefined' && self.RissetRules) R = self.RissetRules; return R; }
    // 規則常數：優先用 update(state) 傳進來的 state.T，其次全域 RissetRules.T，都沒有才用本檔備援（A2）
    function RK() { var Rr = getRules(); return (lastState && lastState.T && typeof lastState.T === 'object') ? lastState.T : (Rr && Rr.T) || null; }
    // 層數：規則的 layerCount(hunted)（巡邏 4、追殺 5；追殺層數是 T.HUNT_LAYERS），都沒有才用備援
    function layerCount(hunted) {
      var Rr = getRules(), K = RK();
      if (Rr && typeof Rr.layerCount === 'function') { try { var n = Rr.layerCount(!!hunted, K || undefined); if (isFinite(n) && n > 0) return n | 0; } catch (e) {} }
      if (hunted && K && isFinite(K.HUNT_LAYERS) && K.HUNT_LAYERS > 0) return K.HUNT_LAYERS | 0;
      var base = (K && isFinite(K.RISSET_LAYERS) && K.RISSET_LAYERS > 0) ? K.RISSET_LAYERS | 0 : C.LAYERS;
      return hunted ? base + 1 : base;
    }
    function nLayers() { return layerCount(false); }
    function ruleM() { var K = RK(); return (K && isFinite(K.RISSET_M) && K.RISSET_M > 0) ? K.RISSET_M | 0 : C.M; }
    function minGain() { var K = RK(); return (K && isFinite(K.BEAT_MIN_GAIN)) ? +K.BEAT_MIN_GAIN : C.MIN_GAIN; }
    // 第 k 層在相位 p 的音量：以規則的 layerGain 為準（追殺時 5 層都走鐘形），沒有規則才用備援鐘形
    function beatGain(k, p, hunted) {
      var Rr = getRules(), K = RK();
      if (Rr && typeof Rr.layerGain === 'function') { try { var g = Rr.layerGain(k, p, hunted, K || undefined); if (isFinite(g)) return g; } catch (e) {} }
      var nL = layerCount(hunted), sig = (K && K.BELL_SIGMA) || C.BELL_SIGMA;
      return bell((k + p) / nL, sig * nLayers() / nL);         // 備援：層距隨層數縮，σ 同比例
    }
    var tables = [], tabFromRules = false;
    function ownTable(k, M) { var Mk = (M || ruleM()) * Math.pow(2, k), a = []; for (var n = 0; n < Mk; n++) a.push(log2(1 + n / Mk)); return a; }
    function validTab(a) {
      if (!a || a.length < 2) return false;
      for (var i = 0; i < a.length; i++) if (!(isFinite(a[i]) && a[i] >= 0 && a[i] < 1) || (i && a[i] <= a[i - 1])) return false;
      return true;
    }
    function rulesTables(nk) {
      var Rr = getRules(), out = [], i, k;
      if (!Rr) return null;
      try {
        if (typeof Rr.beatPhases === 'function') {
          for (k = 0; k < nk; k++) {
            var r = Rr.beatPhases(k), tab;
            if (r && typeof r === 'object' && typeof r.length === 'number') tab = Array.prototype.slice.call(r);
            else { tab = []; for (i = 0; i < 8192; i++) { var v = Rr.beatPhases(k, i); if (typeof v !== 'number' || !isFinite(v) || v >= 1 - 1e-12) break; tab.push(v); } }
            out.push(validTab(tab) ? tab : null);
          }
          if (out[0]) return out;
        }
        if (typeof Rr.beatsBetween === 'function') {
          var fake = { time: 0, phase: 'play', alarm: 0, hunted: true, T: Rr.T || {},   // hunted：連追殺的第 5 層一起問
                       cycle: { T: 1, targetT: 1, t0: 0, p: 0, index: 0, blind: false, anchor: { t: 0, p: 0, T: 1 } } };
          var list = Rr.beatsBetween(0, 1 - 1e-9, fake, { includeQuiet: true, includeBlind: true }) || [];
          out = []; for (k = 0; k < nk; k++) out.push([]);
          for (i = 0; i < list.length; i++) {
            var b = list[i]; if (!b) continue;
            var kk = b.k != null ? b.k : b.layer, ph = isFinite(b.p) ? b.p : (isFinite(b.phase) ? b.phase : b.t);
            if (kk >= 0 && kk < nk && isFinite(ph)) out[kk].push(frac(ph));
          }
          for (k = 0; k < nk; k++) { out[k].sort(function (x, y) { return x - y; }); if (!validTab(out[k])) out[k] = null; }
          if (out[0]) return out;
        }
      } catch (e) {}
      return null;
    }
    function refreshTables() {
      var nk = Math.max(layerCount(true), nLayers()), rt = rulesTables(nk) || [];   // 含追殺的額外層
      tabFromRules = !!rt[0];
      var M0 = rt[0] ? rt[0].length : ruleM();          // 規則沒給的層照最慢層拍數擴展
      tables = [];
      for (var k = 0; k < nk; k++) tables.push(rt[k] || ownTable(k, M0));
    }
    refreshTables();
    function lowerBound(a, v) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }

    // ---------- 盲區預測 ----------
    // 巡邏／追殺：每個循環開頭（相位跳回 0）起 BL 秒。警戒（bassMode）：兩個低音拍正中央 BLB 秒。
    // 規則若匯出 blindWindows(a, b, game) 就以它為準。suppress：規則說「不是盲區」而預測說是的時段（以規則為準，排除）。
    var BLB = BL, bassMode = false, lastState = null, suppress = [], mismN = 0;
    var fakeC = {};                           // 假驟降：累計相位的循環編號 c → 那一輪開頭的交接是假的（沒有盲區）
    function windowsBetween(a, b) {
      var out = [], i, Rr = getRules();
      if (Rr && typeof Rr.blindWindows === 'function' && lastState) {
        try {
          var r = Rr.blindWindows(a, b, lastState);
          if (r && r.length != null) {
            for (i = 0; i < r.length; i++) {
              var w = r[i]; if (!w) continue;
              var s0 = w.s != null ? w.s : (w.start != null ? w.start : w[0]), e0 = w.e != null ? w.e : (w.end != null ? w.end : w[1]);
              if (isFinite(s0) && isFinite(e0) && e0 > s0) out.push({ s: +s0, e: +e0 });
            }
            return filterSup(out);
          }
        } catch (e) {}
      }
      if (bassMode) {
        var per = st.bassPeriod, an = st.gridAnchor, half = BLB / 2;
        for (var m = Math.max(0, Math.floor((a - an) / per - 0.5) - 1); out.length < 64; m++) {
          var mid = an + (m + 0.5) * per;
          if (mid - half >= b) break;
          if (mid + half > a) out.push({ s: mid - half, e: mid + half });
        }
      } else {
        for (var c = Math.floor(Pof(a - BL)); out.length < 64; c++) {
          var s1 = tAt(c);
          if (s1 >= b) break;
          if (fakeC[c]) continue;                // 假驟降：照常交接，沒有盲區
          if (s1 + BL > a) out.push({ s: s1, e: s1 + BL });
        }
      }
      // 規則給的目前／下一段盲區（cycle.blindFrom／blindTo）最準：和它重疊的預測時段換成規則的值
      var cy = lastState && lastState.cycle;
      if (cy && isFinite(cy.blindFrom) && isFinite(cy.blindTo) && cy.blindTo > cy.blindFrom) {
        for (i = 0; i < out.length; i++) if (Math.abs(out[i].s - cy.blindFrom) < 0.3) { out[i] = { s: +cy.blindFrom, e: +cy.blindTo }; break; }
      }
      return filterSup(out);
    }
    function filterSup(ws) {
      if (!suppress.length) return ws;
      return ws.filter(function (w) { for (var i = 0; i < suppress.length; i++) if (w.s < suppress[i].e && w.e > suppress[i].s) return false; return true; });
    }
    function inWins(t, ws, pad) {
      pad = pad || 0;
      for (var i = 0; i < ws.length; i++) if (t >= ws[i].s - pad && t < ws[i].e + pad) return ws[i];
      return null;
    }

    // ---------- 盲區 gate：照預測的時段精準排程，時段變了就從安全點起重排 ----------
    // base：平時的值（預設 1；亮度濾波的 gain 平時 0、盲區前升到 floor = BRIGHT_DB）
    function Gate(param, floor, fall, rise, base) { this.p = param; this.floor = floor; this.fall = fall; this.rise = rise; this.base = base == null ? 1 : base; this.done = []; this.forced = false; }
    Gate.prototype.plan = function (ws, now) {
      if (this.forced) return;
      var g = this, cut = now + 0.02, i;
      for (i = 0; i < g.done.length; i++) {        // 進行中的時段不動，從它結束（含回升）之後才重排
        var d = g.done[i];
        if (d.s - g.fall <= cut && cut < d.e + g.rise) cut = d.e + g.rise + 0.001;
      }
      var A = g.done.filter(function (w) { return w.s - g.fall >= cut; });
      var B = ws.filter(function (w) { return w.s - g.fall >= cut; });
      var same = A.length === B.length;
      for (i = 0; same && i < A.length; i++) same = Math.abs(A[i].s - B[i].s) < C.RESCHED_TOL && Math.abs(A[i].e - B[i].e) < C.RESCHED_TOL;
      if (same) return;
      var p = g.p, base = g.base;
      p.cancelScheduledValues(cut); p.setValueAtTime(base, cut);
      for (i = 0; i < B.length; i++) {
        p.setValueAtTime(base, B[i].s - g.fall); p.linearRampToValueAtTime(g.floor, B[i].s);
        p.setValueAtTime(g.floor, B[i].e); p.linearRampToValueAtTime(base, B[i].e + g.rise);
      }
      g.done = g.done.filter(function (w) { return w.s - g.fall < cut && w.e + g.rise > now - 2; }).concat(B);
    };
    Gate.prototype.force = function (blind, now) {   // 以規則的 cycle.blind 為準：立刻靜音／打開
      var p = this.p;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now);
      p.setTargetAtTime(blind ? this.floor : this.base, now, blind ? 0.015 : this.rise / 3);
      this.forced = blind;
      this.done = blind ? [] : [{ s: now - 1, e: now + this.rise }];
    };
    var gateR = new Gate(gate.gain, C.GATE_FLOOR, C.GATE_FALL, C.GATE_RISE);
    // 盲區前的亮度（11/08）：和 gateR 同一份預測時段，所以假驟降（沒有盲區）不會變亮；盲區結束後 10 ms 內回 0 dB
    var gateB = new Gate(bright.gain, C.BRIGHT_DB, C.BRIGHT_LEAD, 0.01, 0);

    // ---------- 預排事件：以累計相位定位，可取消重排 ----------
    // 每一拍（以及跟著拍點的主題音）是一筆 rec = {key, P, t, dest, play, gated}；play(t, out) 把聲音接到 out。
    var evs = {}, pending = [];
    function fire(rec) {
      var out = ctx.createGain(); out.connect(rec.dest);
      collect = [];
      try { rec.play(rec.t, out); } finally { rec.nodes = collect; collect = null; }
      rec.out = out;
      if (rec.logRef) rec.logRef.t = rec.t;
    }
    function kill(rec, now) {
      for (var i = 0; i < rec.nodes.length; i++) { try { rec.nodes[i].stop(now); } catch (e) {} }   // 還沒開始的音源：停止時間早於開始＝不發聲
      try { rec.out.gain.setValueAtTime(0, now); rec.out.disconnect(); } catch (e) {}
      rec.nodes = [];
    }
    function addEvent(key, P, dest, play, gated, logRef) {
      var rec = { key: key, P: P, t: tAt(P), dest: dest, play: play, gated: !!gated, logRef: logRef || null, nodes: [] };
      evs[key] = rec; fire(rec); pending.push(rec);
      return rec;
    }
    // 新的外推（或盲區改變）之後：還沒響的拍若時間差超過 RESCHED_TOL 就取消重排；落進盲區的取消
    var stats = { resched: 0, dropped: 0, jumps: 0 };
    function replan(now) {
      var ws = windowsBetween(now - 1, now + C.LOOKAHEAD + 1.5), keep = [];
      for (var i = 0; i < pending.length; i++) {
        var r = pending[i];
        if (r.t < now - 0.05) continue;                       // 已響過：不再追蹤（evs 留著做去重）
        if (r.t < now + C.RESCHED_MARGIN) { keep.push(r); continue; }
        var t2 = tAt(r.P), blocked = r.gated && (inWins(t2, ws) || gateR.forced);
        if (Math.abs(t2 - r.t) <= C.RESCHED_TOL && !blocked) { keep.push(r); continue; }
        kill(r, now);
        if (!blocked && t2 > now + 0.004) { r.t = t2; fire(r); keep.push(r); stats.resched++; }
        else { delete evs[r.key]; stats.dropped++; }
      }
      pending = keep;
    }

    // ---------- 收到規則的 anchor ----------
    function takeAnchor(cy, now) {
      var an = cy.anchor, t, p, TT;
      if (an && isFinite(an.t) && isFinite(an.p) && isFinite(an.T) && an.T > 0) { t = +an.t; p = +an.p; TT = +an.T; }
      else if (isFinite(cy.T) && cy.T > 0 && isFinite(cy.t0)) { t = +cy.t0; p = 0; TT = +cy.T; }   // 舊規則：固定 T 與 t0
      else return false;
      if (segLast && Math.abs(t - segLast.t) < 1e-9 && Math.abs(p - segLast.p) < 1e-9 && Math.abs(TT - segLast.T) < 1e-9) return false;
      var Tt = isFinite(cy.targetT) && cy.targetT > 0 ? +cy.targetT : null, a = 0;
      if (segLast && t - segLast.t > 0.004 && t - segLast.t < 0.6) {
        var raw = (TT - segLast.T) / (t - segLast.t);
        a = 0.6 * raw + 0.4 * (segLast.a || 0);
      }
      if (Tt != null && (Math.abs(Tt - TT) < 1e-4 || a * (Tt - TT) <= 0)) a = 0;   // 已到目標、或不往目標走：不外推變化
      a = clamp(a, -0.35 * TT, 0.35 * TT);
      // 和目前外推接上：取和預測最接近的循環編號（不依賴規則的 p 是 0..1 還是累計）
      var Pp = Pof(t), f = frac(p), Pn = Math.round(Pp - f) + f;
      var jump = Math.abs(Pn - Pp) > C.JUMP;
      seg = { t: t, P: Pn, T: TT, a: a, Tt: Tt };
      segLast = { t: t, p: p, T: TT, a: a };
      if (jump) {                                  // 重開局、檢查點：清掉預排，從新的節拍重來
        stats.jumps++;
        for (var i = 0; i < pending.length; i++) if (pending[i].t > now + C.RESCHED_MARGIN) kill(pending[i], now);
        pending = pending.filter(function (r) { return r.t <= now + C.RESCHED_MARGIN; });
        evs = {}; themePlan = {}; chorusDone = {}; fakeC = {};
        if (log) log.push({ type: 'jump', t: now, from: Pp, to: Pn });
      }
      return true;
    }

    // ---------- 謝帕德音階（跟著外推相位連續控制）----------
    // SHEP_VOICES 個八度的柔和音色（正弦＋少量 2、3、4 次泛音），每聲部兩條振盪器略走音（合唱感）。
    // 第 i 聲部頻率 = SHEP_BASE · 2^(i + p)，音量 = 鐘形(x)，x = (i + p) ÷ SHEP_VOICES。p 從 0 到 1 每聲部剛好升一個八度，
    // p = 1 時第 i 聲部接上第 i+1 聲部 → 無限上升。振盪器常駐，每 SHEP_STEP 秒排一個控制點：
    // 共用 detune = 1200·p（ConstantSource 一條推全部振盪器），所以循環長度變了，上滑速度跟著變。
    // 循環開頭到盲區結束（＋0.2 秒淡入）、循環尾前 0.06 秒都靜音：音高在靜音時跳回底部，從底部重來。
    var shepWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.18, 0.07, 0.03]));
    var shepLP = ctx.createBiquadFilter(); shepLP.type = 'lowpass'; shepLP.frequency.value = 1400; shepLP.Q.value = 0.5;
    shepLP.connect(shepBus);
    function shepBell(x) { var d = (x - 0.5) / C.SHEP_SIGMA; return Math.exp(-d * d); }
    var shep = null;
    function ensureShep() {
      if (shep) return shep;
      shep = { gains: [], det: [], planned: -1 };
      var cs = ctx.createConstantSource ? ctx.createConstantSource() : null;
      if (cs) { cs.offset.value = 0; cs.start(); persist.push(cs); shep.det.push(cs.offset); }
      for (var i = 0; i < C.SHEP_VOICES; i++) {
        var g = ctx.createGain(); g.gain.value = 0; g.connect(shepLP); shep.gains.push(g.gain);
        [-C.SHEP_DETUNE, C.SHEP_DETUNE].forEach(function (cents) {
          var o = ctx.createOscillator(); o.setPeriodicWave(shepWave); o.frequency.value = C.SHEP_BASE * Math.pow(2, i);
          o.detune.value = cents;
          if (cs) cs.connect(o.detune); else shep.det.push({ param: o.detune, off: cents });
          o.connect(g); o.start(); persist.push(o);
        });
      }
      return shep;
    }
    function shepValues(t) {
      var P = Pof(t), c = Math.floor(P), f = P - c;
      var since = t - tAt(c), to = tAt(c + 1) - t;
      var edge = clamp((since - (fakeC[c] ? 0 : BL)) / 0.2, 0, 1) * clamp((to - 0.06) / 0.1, 0, 1);   // 假驟降不留空
      var g = [];
      for (var i = 0; i < C.SHEP_VOICES; i++) g.push(C.SHEP_GAIN * shepBell((i + f) / C.SHEP_VOICES) * (0.5 + 0.5 * f) * edge);
      return { det: 1200 * f, g: g, lp: C.SHEP_LP_LO * Math.pow(C.SHEP_LP_HI / C.SHEP_LP_LO, f) };
    }
    function shepSet(t, v, ramp) {
      for (var i = 0; i < shep.det.length; i++) {
        var d = shep.det[i], prm = d.param || d, val = v.det + (d.off || 0);
        if (ramp) prm.linearRampToValueAtTime(val, t); else prm.setValueAtTime(val, t);
      }
      for (i = 0; i < shep.gains.length; i++) { if (ramp) shep.gains[i].linearRampToValueAtTime(v.g[i], t); else shep.gains[i].setValueAtTime(v.g[i], t); }
      if (ramp) shepLP.frequency.linearRampToValueAtTime(v.lp, t); else shepLP.frequency.setValueAtTime(v.lp, t);
    }
    function planShep(end, now) {
      if (!layerOn.shepard || mute.music) return;
      if (!(mz.mix.shep > 0 || shepBus.gain.value > 0.005)) { if (shep) shep.planned = -1; return; }
      ensureShep();
      if (shep.planned < now) { shep.planned = now + 0.01; shepSet(shep.planned, shepValues(shep.planned), false); }
      while (shep.planned < end) { shep.planned += C.SHEP_STEP; shepSet(shep.planned, shepValues(shep.planned), true); }
    }

    // 合唱和弦：三個鋸齒聲部（多利安的 i 級 Dm 與 IV 級 G，輪流），經「ㄛ」共振峰，在循環中段（p 0.25～0.75）浮起又退去，
    // 避開盲區與 p 最高的緊繃段。
    var CHORDS = [[50, 57, 65], [55, 59, 62]];       // D3 A3 F4 ／ G3 B3 D4
    function chorusChord(t, dur, notes, dest) {
      var env = ctx.createGain(); env.gain.value = 0; env.connect(dest);
      var f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain();
      f1.type = f2.type = 'bandpass'; f1.frequency.value = 570; f1.Q.value = 5; f2.frequency.value = 840; f2.Q.value = 7; g2.gain.value = 0.6;
      f1.connect(env); f2.connect(g2); g2.connect(env);
      var att = Math.min(1.8, dur * 0.4);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(C.CHORUS_GAIN, t + att);
      env.gain.setValueAtTime(C.CHORUS_GAIN, t + dur - att); env.gain.linearRampToValueAtTime(0, t + dur);
      notes.forEach(function (m) {
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = (Math.random() - 0.5) * 10;
        o.connect(f1); o.connect(f2); o.start(t); o.stop(t + dur + 0.05);
      });
    }

    // ---------- 音樂層排程（主題、合唱）----------
    // 主題動機：盲區剛結束、低頻時段。音符落在第 3 層（k=3）Risset 拍點上（從 THEME_N0 起，找第一個在盲區＋回升之後的拍，
    // 再依時值往後數拍），和鼓同時起音；每個音是一筆可重排的事件，循環長度變了也跟著拍點走。
    var themePlan = {}, chorusDone = {};
    function planTheme(c) {
      var m = mz.mix, tab = tables[3];
      if (mute.music || !layerOn.theme || !(m.theme > 0) || mz.won || st.alarm > 0.3 || st.hunted || !tab) return null;
      var cs = tAt(c), n = C.THEME_N0;
      while (n < tab.length && tAt(c + tab[n]) - cs < BL + C.MUSIC_RISE) n++;
      var ns = [];
      for (var i = 0; i < m.theme && n < tab.length; i++) { ns.push(n); n += THEME.notes[i].units; }
      return ns.length ? ns : null;
    }
    function scheduleMusic(from, end) {
      if (mute.music) return;
      var Pa = Pof(from), Pb = Pof(end), m = mz.mix;
      for (var c = Math.floor(Pa); c <= Math.floor(Pb); c++) {
        if (!(c in themePlan)) {
          themePlan[c] = planTheme(c);
          if (themePlan[c] && log) log.push({ type: 'theme', c: c, t: tAt(c + tables[3][themePlan[c][0]]), notes: themePlan[c].length,
                                              times: themePlan[c].map(function (n) { return tAt(c + tables[3][n]); }) });
        }
        var tp = themePlan[c];
        if (tp) for (var i = 0; i < tp.length; i++) {
          var P = c + tables[3][tp[i]], key = 'th' + c + ':' + i;
          if (P < Pa || P >= Pb || evs[key]) continue;
          (function (midi, vel) { addEvent(key, P, themeBus, function (t, out) { lyre(out, t, midi, vel); }, false); })(THEME.notes[i].midi, C.LYRE_VEL * (i === 0 ? 1.1 : 1));
        }
        // 合唱和弦：偶爾（每 chorusEvery 個循環），循環 1/4 處浮起、3/4 處退去
        if (layerOn.chorus && m.chorusEvery > 0 && ((c % m.chorusEvery) + m.chorusEvery) % m.chorusEvery === 0 && !chorusDone[c]) {
          var ta = tAt(c + 0.25);
          if (ta >= from && ta < end) {
            chorusDone[c] = true;
            chorusChord(ta, tAt(c + 0.75) - ta, CHORDS[mz.chorusN++ % CHORDS.length], chorusBus);
            if (log) log.push({ type: 'chorus', c: c, t: ta });
          }
        }
      }
      for (var k in themePlan) if (+k < Math.floor(Pa) - 3) { delete themePlan[k]; delete chorusDone[k]; }
    }
    // 勝利：號角完整奏一次主題，底下一個長長的 Dm 合唱。走 cueBus（不經 musicGate），盲區不會把號角切斷
    function winTheme(t) {
      var end = playTheme('horn', t, { dest: cueBus });
      chorusChord(t - 0.6, end - t + 2.6, CHORDS[0], cueBus);
      if (log) log.push({ type: 'winTheme', t: t, until: end });
    }

    // ---------- 狀態 ----------
    var st = { alarm: 0, hunted: false, bassPeriod: C.BASS_PERIOD, bassAnchor: t0, gridAnchor: t0,
               alarmStart: null, alarmNext: 0, lastBass: -1e9, panic: 0, lastCreak: -1e9, panicOn: false };
    var linEnd = ctx.currentTime;            // 失控層、低音已排到哪個時間（不含）
    var timer = null, dead = false;
    var gateM = new Gate(musicGate.gain, C.MUSIC_BLIND_FLOOR, C.MUSIC_FALL, C.MUSIC_RISE);
    var guardOut = ctx.createGain(); guardOut.gain.value = 1; guardOut.connect(master);   // 衛兵 3D 聲音（盲區壓低、不全靜音）
    var gateG = new Gate(guardOut.gain, C.GUARD_BLIND_FLOOR, C.MUSIC_FALL, C.MUSIC_RISE);

    // ---------- 暗示聲（設計文件 2026-11-07-hint-guidance.md 第 2.1、2.2 節）【改編】 ----------
    // 新加的暗示聲（同伴倒吸氣與低語、碎石滾動、衛兵起疑低吼、推門閂前的「喀」、風、號角、門外低語）全部走
    // hintBus → hintOut（盲區 gate，壓到 HINT_BLIND_FLOOR）→ master，不送進共用殘響（殘響尾巴會拖進盲區）。
    // 單發的暗示聲另外用 hintFree(t, 長度) 檢查：和預測的盲區重疊就不發。聲音暗示一直都在，不乘 visualAid。
    var hintOut = ctx.createGain(); hintOut.gain.value = 1; hintOut.connect(master);
    var gateH = new Gate(hintOut.gain, C.HINT_BLIND_FLOOR, C.MUSIC_FALL, C.MUSIC_RISE);
    var hintBus = ctx.createGain(); hintBus.gain.value = C.HINT_GAIN; hintBus.connect(hintOut);
    var routeDuck = ctx.createGain(); routeDuck.gain.value = 1; routeDuck.connect(hintBus);   // 路線環境聲：警戒時退後，讓慢低音最清楚
    function hintFree(t, dur) {
      if (gateR.forced) return false;
      var ws = windowsBetween(t - 1, t + dur + 1);
      for (var i = 0; i < ws.length; i++) if (ws[i].s < t + dur + 0.05 && ws[i].e > t - 0.05) return false;
      return true;
    }
    // 3D 位置的暗示聲：輪流用幾個 panner（HRTF 很吃 CPU，不每次新建）
    var hintPans = [], hintPanI = 0;
    function hintAt(x, z, y) {
      if (!isFinite(x) || !isFinite(z)) return hintBus;
      if (hintPans.length < 4) { var np = makePanner(); np.refDistance = 2; np.rolloffFactor = 1; np.connect(hintBus); hintPans.push(np); }
      var p = hintPans[hintPanI++ % hintPans.length];
      setPos(p, x, y == null ? 1 : y, z, ctx.currentTime, true);
      return p;
    }
    // 同伴的氣聲低語：程式合成的耳語（沒有聲帶振動，只有氣流經過「口腔共振峰」），字幕由畫面層顯示。
    // 一個音節 = 子音（短的高頻氣聲）＋母音（兩個窄帶通噪音當 F1、F2，可以滑動）。
    var CONS_F = { b: 1400, d: 2900, j: 4300, sh: 3300, x: 5400, z: 5800 };
    function whisperSyl(dest, t, syl, pk) {
      var c = syl.c, d = syl.d || 0.16, tv = t;
      if (c) {
        var long = c === 'sh' || c === 'x';
        noise(dest, t, 'bandpass', CONS_F[c], 2.2, pk * (long ? 0.45 : 0.6), 0.004, long ? 0.07 : 0.025);
        tv = t + (long ? 0.06 : 0.025);
      }
      var f1 = noise(dest, tv, 'bandpass', syl.v[0], 6, pk, 0.025, d);
      var f2 = noise(dest, tv, 'bandpass', syl.v[1], 8, pk * 0.55, 0.025, d);
      if (syl.v[2]) f1.frequency.linearRampToValueAtTime(syl.v[2], tv + d);
      if (syl.v[3]) f2.frequency.linearRampToValueAtTime(syl.v[3], tv + d);
      return tv + d + 0.03 - t;
    }
    function whisper(dest, t, syls, pk) {
      var tt = t;
      for (var i = 0; i < syls.length; i++) tt += whisperSyl(dest, tt, syls[i], pk * (i === 0 ? 1 : 0.9)) + 0.02;
      return tt - t;
    }
    // 「別動」bié dòng、「就是現在」jiù shì xiàn zài（母音 [F1, F2, F1 終, F2 終]）
    var SAY = {
      dontMove: [{ c: 'b', v: [320, 2250, 520, 1850], d: 0.14 }, { c: 'd', v: [460, 820, 420, 760], d: 0.2 }],
      now: [{ c: 'j', v: [320, 2200, 460, 950], d: 0.1 }, { c: 'sh', v: [420, 1550], d: 0.07 },
            { c: 'x', v: [320, 2250, 620, 1850], d: 0.1 }, { c: 'z', v: [760, 1250, 420, 2000], d: 0.11 }]
    };
    var companionPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;   // 同伴在左手邊
    if (companionPan) { companionPan.pan.value = -0.45; companionPan.connect(hintBus); }
    var companionOut = companionPan || hintBus;

    // 路線的環境聲（2.2 節）：風（暗門外／城門方向／巷尾）、城門外大軍的低語；號角另外單發
    var routeLive = [];
    function routePanner(ref) { var p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 0.6; p.maxDistance = 200; p.connect(routeDuck); return p; }
    var windPan = routePanner(6), windGain = ctx.createGain(); windGain.gain.value = 0; windGain.connect(windPan);
    var murmurPan = routePanner(8), murmurGain = ctx.createGain(); murmurGain.gain.value = 0; murmurGain.connect(murmurPan);
    var hornPan = routePanner(14);
    if (!mute.ambient) {
      var ws0 = ctx.createBufferSource(); ws0.buffer = noiseBuf; ws0.loop = true;
      var wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 0.7;
      var wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.13; var wlg = ctx.createGain(); wlg.gain.value = 260; wlfo.connect(wlg); wlg.connect(wbp.frequency);
      var gust = ctx.createGain(); gust.gain.value = C.WIND_GAIN;
      var glfo = ctx.createOscillator(); glfo.frequency.value = 0.09; var glg = ctx.createGain(); glg.gain.value = C.WIND_GAIN * 0.5; glfo.connect(glg); glg.connect(gust.gain);
      ws0.connect(wbp); wbp.connect(gust); gust.connect(windGain); ws0.start(); wlfo.start(); glfo.start();
      routeLive.push(ws0, wlfo, glfo);
      // 低語：三個「母音」共振峰的噪音，音量被兩條不同速的 LFO 隨機起伏，像很多人壓低聲音說話
      var ms = ctx.createBufferSource(); ms.buffer = noiseBuf; ms.loop = true; ms.playbackRate.value = 0.8;
      var mAmp = ctx.createGain(); mAmp.gain.value = C.MURMUR_GAIN;
      [[380, 5, 1], [820, 6, 0.6], [1500, 7, 0.25]].forEach(function (fm) {
        var f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = fm[0]; f.Q.value = fm[1]; g.gain.value = fm[2];
        ms.connect(f); f.connect(g); g.connect(mAmp);
      });
      [[3.1, 0.45], [4.7, 0.3], [0.6, 0.35]].forEach(function (l) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = l[0]; g.gain.value = C.MURMUR_GAIN * l[1];
        o.connect(g); g.connect(mAmp.gain); o.start(); routeLive.push(o);
      });
      mAmp.connect(murmurGain); ms.start(); routeLive.push(ms);
    }
    // 每區的風從哪裡來（世界座標；y 是高度）
    var WIND_AT = [null, { x: 11, y: 0.2, z: 15, g: 0.7 }, { x: 62, y: 5, z: 15, g: 0.8 }, { x: 49, y: 2, z: 22.5, g: 0.9 }, { x: 62, y: 4, z: 15, g: 0.7 }];
    var route = { zone: -1, nextHorn: ctx.currentTime + 6, prog: -1 };
    function updateRoute(s, now) {
      var z = clamp((+s.zone || 0) | 0, 0, 4), won = s.phase === 'win';
      if (z !== route.zone) {
        route.zone = z;
        var W = WIND_AT[z];
        if (W) setPos(windPan, W.x, W.y, W.z, now, true);
        windGain.gain.setTargetAtTime(W ? W.g : 0, now, 1.2);
        setPos(murmurPan, 63, 1.5, 15, now, true); setPos(hornPan, 75, 6, 15, now, true);
        if (z >= 2 && route.nextHorn < now + 4) route.nextHorn = now + 4 + Math.random() * 4;
      }
      var prog = s.gate && s.gate.need ? clamp(s.gate.progress / s.gate.need, 0, 1) : 0;
      var mg = won ? 0 : (z === 4 ? 0.25 + 0.75 * prog : 0);
      if (Math.abs(mg - route.prog) > 0.01) { route.prog = mg; murmurGain.gain.setTargetAtTime(mg, now, 0.8); }
      var al = clamp(+s.alarm || 0, 0, 1);
      routeDuck.gain.setTargetAtTime(s.hunted ? 0.35 : 1 - 0.75 * al, now, 0.3);
      // 號角：只在盲區剛結束、整段吹完都碰不到下一段盲區時吹（警戒、追殺不吹）
      var cy = s.cycle || {};
      if (z >= 2 && !won && s.phase === 'play' && !s.hunted && !cy.alertBlind && now >= route.nextHorn && !cy.blind) {
        var t = now + 0.05;
        if (hintFree(t, 2.9)) {
          horn(hornPan, t, 146.83, 1.3, C.HORN_GAIN); horn(hornPan, t + 1.15, 220, 1.5, C.HORN_GAIN * 0.85);
          route.nextHorn = now + C.HORN_EVERY * (0.8 + Math.random() * 0.4);
          if (log) log.push({ type: 'horn', t: t });
        }
      }
    }
    var hintSig = null;                      // 規則的 hintSignals(state)：可暗殺的衛兵、離盲區幾秒

    // Risset 打擊：[from, end) 內每層每拍，已排過的（evs 有）跳過，盲區不排。
    // 拍點時間用本檔的外推（tAt），音量用規則的 layerGain（A2），追殺時 5 層、音色位置 x = (k + p) ÷ 層數。
    function scheduleBeats(from, end, ws) {
      var Pa = Pof(from), Pb = Pof(end), nL = layerCount(st.hunted), gMin = minGain();   // 追殺 5 層、巡邏 4 層（規則決定）
      if (tables.length < nL) refreshTables();
      for (var k = 0; k < nL; k++) {
        if (solo != null && k !== solo) continue;
        var tab = tables[k];
        if (!tab) continue;
        for (var c = Math.floor(Pa); c <= Math.floor(Pb); c++) {
          for (var n = lowerBound(tab, Pa - c); n < tab.length && c + tab[n] < Pb; n++) {
            var key = 'b' + c + ':' + k + ':' + n;
            if (evs[key]) continue;
            var p = tab[n], P = c + p, t = tAt(P);
            if (t < from || t >= end || inWins(t, ws) || gateR.forced) continue;   // 盲區不排拍
            var x = (k + p) / nL, g = beatGain(k, p, st.hunted);
            if (g < gMin) continue;                             // 音量不抖（A3）：實際響度 ∝ 規則 gain
            var le = log ? { type: 'beat', k: k, n: n, c: c, t: t, p: p, g: g } : null;
            if (le) log.push(le);
            (function (x, g) { addEvent(key, P, rhythmBus, function (tt, out) { playHit(out, x, tt, g); }, true, le); })(x, g);
          }
        }
      }
      scheduleFakeTails(from, end);
    }
    // 假驟降的金屬尾音（A4）：規則 beatsBetween(..., { includeFakeTail: true }) 回傳 tail: true 的拍，這裡只排程。
    // 規則的時間是線性外推；這裡用拍的 cycle/p 換成本檔外推的時間（和其他拍同一個時鐘），
    // 循環編號用本檔累計相位對齊（規則的 index 和本檔的 c 可能差一個常數）。
    function scheduleFakeTails(from, end) {
      var Rr = getRules();
      if (!lastState || !Rr || typeof Rr.beatsBetween !== 'function' || !lastState.cycle) return;
      var list;
      try { list = Rr.beatsBetween(from - 0.1, end + 0.1, lastState, { includeFakeTail: true }) || []; } catch (e) { return; }
      var K = RK(), gTail = (K && isFinite(K.FAKE_TAIL_GAIN)) ? +K.FAKE_TAIL_GAIN : C.FAKE_TAIL_GAIN;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b || !b.tail || !isFinite(b.t)) continue;
        var ph = isFinite(b.p) ? frac(b.p) : 0, c = Math.round(Pof(b.t) - ph);   // 交接處：整數相位附近
        var P = c + ph, t = tAt(P), key = 'tail' + c + ':' + (b.k | 0) + ':' + (b.n | 0);
        if (evs[key] || t < from || t >= end || gateR.forced) continue;
        var g = isFinite(b.gain) ? +b.gain : gTail;
        if (!(g > 0)) continue;
        var le = log ? { type: 'beat', tail: true, k: b.k | 0, n: b.n | 0, c: c, t: t, p: ph, g: g } : null;
        if (le) log.push(le);
        (function (g) { addEvent(key, P, rhythmBus, function (tt, out) { playHit(out, 1, tt, g); }, true, le); })(g);   // x = 1：純金屬
      }
    }

    // 失控層與低音：照時間往前推（不跟循環相位）
    function scheduleLinear(a, b, ws) {
      var nowT = ctx.currentTime - 0.002;
      // 失控層：不規則、越來越快（警戒或追殺時）
      var eff = Math.max(st.alarm, st.panic * 0.8, st.hunted ? 0.6 : 0);
      if (eff > 0.02) {
        if (st.alarmStart == null) { st.alarmStart = a; st.alarmNext = Math.max(a, ctx.currentTime); }
        while (st.alarmNext < b) {
          var ta = st.alarmNext, el = ta - st.alarmStart;
          if (!inWins(ta, ws) && ta >= nowT) {
            var xa = 0.45 + Math.random() * 0.5, ga = 0.5 + Math.random() * 0.5;
            playHit(alarmBus, xa, ta, ga);
            if (Math.random() < 0.25) playHit(alarmBus, xa, ta + 0.018 + Math.random() * 0.02, ga * 0.6);  // 亂拍、雙擊
            if (log) log.push({ type: 'alarm', t: ta });
          }
          var rate = 4 + 8 * eff + 6 * st.panic + Math.min(12, el * 1.6);
          st.alarmNext = ta + (1 / rate) * (0.5 + Math.random());
        }
      } else st.alarmStart = null;

      // 低音：拍點 = anchor + n·period（規則給的 nextBeat）
      var per = st.bassPeriod, an = st.bassAnchor;
      for (var m = Math.ceil((a - an) / per - 1e-9); ; m++) {
        var tb = an + m * per;
        if (tb >= b) break;
        if (tb < a || tb < nowT || tb < st.bassAnchor - 1e-4 || tb < st.lastBass + 0.25) continue;
        // 一般盲區（不是警戒、不是追殺）：會落進盲區、或餘音拖進盲區的低音拍不排，讓盲區真的空掉。
        // 警戒時保留：那時低音是安撫要跟的拍子（盲區改在兩拍正中央，餘音 1.1 秒碰不到）。
        if (!bassMode && !st.hunted) {
          var skip = false;
          for (var i = 0; i < ws.length; i++) if (tb > ws[i].s - C.BASS_TAIL && tb < ws[i].e) { skip = true; break; }
          if (skip) continue;
        }
        bassHit(tb); st.lastBass = tb;
        if (log) log.push({ type: 'bass', t: tb });
      }
    }

    function scheduleTo(end, now) {
      if (dead) return;
      var ws = windowsBetween(now - 1, end + C.BASS_TAIL + 0.2);
      gateR.plan(ws, now); gateM.plan(ws, now); gateG.plan(ws, now); gateH.plan(ws, now); gateB.plan(ws, now);
      var from = now + 0.004;
      scheduleBeats(from, end, ws);
      scheduleMusic(from, end);
      planShep(end, now);
      // 落後太久（分頁休眠）就不回頭補，直接從現在接上；已經過的拍各自跳過，不累積誤差
      if (linEnd < now - C.CATCHUP_MAX) linEnd = now - C.CATCHUP_MAX;
      if (end > linEnd) { scheduleLinear(linEnd, end, ws); linEnd = end; }
      // 去重表清理
      if (pending.length > 400 || Math.random() < 0.05) {
        for (var key in evs) if (evs[key].t < now - 2) delete evs[key];
        pending = pending.filter(function (r) { return r.t >= now - 0.05; });
      }
    }
    function tick() {
      if (dead) return;
      var now = ctx.currentTime;
      scheduleTo(now + C.LOOKAHEAD, now);
    }
    // 計時器：Worker 送 tick（不受主執行緒 rAF 與背景分頁降速影響），失敗就用主執行緒 setInterval
    var worker = null, workerURL = null;
    function startTimer() {
      var forceMain = opts.timer === 'main';
      if (!forceMain && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        try {
          workerURL = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + C.TICK_MS + ');'], { type: 'text/javascript' }));
          worker = new Worker(workerURL);
          worker.onmessage = tick;
          worker.onerror = function () { stopWorker(); if (!timer && !dead) timer = setInterval(tick, C.TICK_MS); };
        } catch (e) { stopWorker(); }
      }
      // 主執行緒計時器一直保留當備援（Worker 正常時兩邊都只是補排，重複呼叫沒有副作用）
      timer = setInterval(tick, C.TICK_MS);
    }
    function stopWorker() {
      if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
      if (workerURL) { try { URL.revokeObjectURL(workerURL); } catch (e) {} workerURL = null; }
    }

    // ---------- 3D 聽聲辨位（設計文件 8.3）----------
    // 聽者：setListener({x, z, yaw})，yaw = 0 面向 −z（和規則的 forward 一樣：前方 = (−sin yaw, −cos yaw)）。
    // 每名衛兵一個 HRTF PannerNode（反比距離衰減），同時最多 MAX_GUARD_VOICES 名（最近的優先），其餘不出聲；
    // 超出 GUARD_FAR 的不出聲、最後 8 公尺淡出；倒下或非作用中的 0.15 秒內淡掉。
    // 衛兵移動時依速度踩出腳步，停著時有低沉的呼吸（起疑、追殺時呼吸較急）。
    var lis = { x: 0, z: 0, yaw: 0 };
    function makePanner() {
      var p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = 1.5; p.rolloffFactor = 1.3; p.maxDistance = 60;
      return p;
    }
    function setPos(p, x, y, z, now, snap) {
      if (p.positionX) {
        if (snap) { p.positionX.setValueAtTime(x, now); p.positionY.setValueAtTime(y, now); p.positionZ.setValueAtTime(z, now); }
        else { p.positionX.setTargetAtTime(x, now, 0.03); p.positionY.setTargetAtTime(y, now, 0.03); p.positionZ.setTargetAtTime(z, now, 0.03); }
      } else p.setPosition(x, y, z);
    }
    function setListener(o) {
      if (!o || dead) return;
      var x = +o.x, z = +o.z, yaw = +o.yaw;
      if (!isFinite(x) || !isFinite(z)) return;
      if (!isFinite(yaw)) yaw = lis.yaw;
      var first = !lis.set, now = ctx.currentTime, L = ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      lis.x = x; lis.z = z; lis.yaw = yaw; lis.set = true;
      if (L.positionX) {
        if (first) { L.positionX.setValueAtTime(x, now); L.positionZ.setValueAtTime(z, now); }
        else { L.positionX.setTargetAtTime(x, now, 0.03); L.positionZ.setTargetAtTime(z, now, 0.03); }
        L.positionY.setValueAtTime(C.EAR_Y, now);
        // 方向不用平滑：分量各自內插會在大轉身時經過零向量
        L.forwardX.setValueAtTime(fx, now); L.forwardY.setValueAtTime(0, now); L.forwardZ.setValueAtTime(fz, now);
        L.upX.setValueAtTime(0, now); L.upY.setValueAtTime(1, now); L.upZ.setValueAtTime(0, now);
      } else {
        L.setPosition(x, C.EAR_Y, z); L.setOrientation(fx, 0, fz, 0, 1, 0);
      }
    }
    var voices = [];
    function newVoice() {
      var g = ctx.createGain(); g.gain.value = 0;
      var p = makePanner(); g.connect(p); p.connect(guardOut);
      var v = { id: null, input: g, p: p, freeAt: 0, lx: 0, lz: 0, lt: 0, speed: 0, nextStep: 0, nextBreath: 0 };
      voices.push(v);
      return v;
    }
    function guardStep(v, t, heavy) {       // 衛兵的皮靴踩石板＋青銅脛甲輕碰
      var k = heavy ? 1.4 : 1;
      noise(v.input, t, 'lowpass', 320 + Math.random() * 120, 1, 0.5 * k, 0.003, 0.09);
      noise(v.input, t + 0.006, 'bandpass', 1800, 1.5, 0.08 * k, 0.002, 0.04);
      if (Math.random() < 0.6) tone(v.input, t + 0.01, 'sine', 2350 + Math.random() * 300, 0, 0, 0.018 * k, 0.001, 0.12);
    }
    function guardBreath(v, t, fast) {      // 低沉的呼吸：吸（帶通上滑）→ 吐（低通下滑）＋一絲喉音
      var inh = fast ? 0.45 : 0.8, k = fast ? 1.3 : 1;
      var f = noise(v.input, t, 'bandpass', 380, 1.3, 0.07 * k, inh * 0.6, inh * 0.5); f.frequency.exponentialRampToValueAtTime(700, t + inh);
      var f2 = noise(v.input, t + inh + 0.1, 'lowpass', 650, 0.8, 0.09 * k, 0.08, fast ? 0.6 : 1.1);
      f2.frequency.exponentialRampToValueAtTime(260, t + inh + 1.1);
      tone(v.input, t + inh + 0.1, 'sawtooth', 96, 82, 0.8, 0.008 * k, 0.1, fast ? 0.5 : 0.9);
    }
    var guardP = 0;
    function updateGuards(list, now) {
      var cand = [], i;
      for (i = 0; i < list.length; i++) {
        var q = list[i];
        if (!q || !isFinite(q.x) || !isFinite(q.z) || q.active === false || q.state === 'down') continue;
        var d = Math.sqrt((q.x - lis.x) * (q.x - lis.x) + (q.z - lis.z) * (q.z - lis.z));
        if (d > C.GUARD_FAR) continue;
        cand.push({ q: q, d: d, id: q.id != null ? String(q.id) : 'i' + i });
      }
      cand.sort(function (a, b) { return a.d - b.d; });
      cand = cand.slice(0, C.MAX_GUARD_VOICES);
      var want = {};
      cand.forEach(function (c) { want[c.id] = c; });
      voices.forEach(function (v) {
        if (v.id != null && !want[v.id]) { v.input.gain.setTargetAtTime(0, now, 0.15); v.id = null; v.freeAt = now + 0.8; }
      });
      cand.forEach(function (c) {
        var v = null, j;
        for (j = 0; j < voices.length; j++) if (voices[j].id === c.id) { v = voices[j]; break; }
        if (!v) {
          for (j = 0; j < voices.length; j++) if (voices[j].id == null && now >= voices[j].freeAt) { v = voices[j]; break; }
          if (!v && voices.length < C.MAX_GUARD_VOICES) v = newVoice();
          if (!v) return;
          v.id = c.id; v.lx = c.q.x; v.lz = c.q.z; v.lt = now; v.speed = 0;
          v.nextStep = now + Math.random() * 0.3; v.nextBreath = now + 0.4 + Math.random() * 2;
          setPos(v.p, c.q.x, 1, c.q.z, now, true);
        } else setPos(v.p, c.q.x, 1, c.q.z, now, false);
        var dt = now - v.lt;
        if (dt > 0.03) {
          var sp = Math.sqrt((c.q.x - v.lx) * (c.q.x - v.lx) + (c.q.z - v.lz) * (c.q.z - v.lz)) / dt;
          if (sp > 15) sp = 0;                                  // 瞬移（重來、換區）不算走路
          v.speed = v.speed * 0.5 + sp * 0.5; v.lx = c.q.x; v.lz = c.q.z; v.lt = now;
        }
        // 越快越近，衛兵的呼吸與腳步越清楚；背對你、可暗殺的衛兵在盲區前呼吸特別清楚（2.1 節）
        var kill = hintSig && hintSig.kill && hintSig.kill[c.id];
        var gk = (1 - C.GUARD_P_GAIN / 2 + C.GUARD_P_GAIN * guardP) * (kill ? C.KILL_BREATH_MUL : 1);
        v.input.gain.setTargetAtTime(clamp((C.GUARD_FAR - c.d) / 8, 0, 1) * gk, now, 0.2);
        var alert = c.q.state === 'hunted' || c.q.state === 'suspicious';
        // 可暗殺：盲區前 0.7 秒內吸一口氣，吐氣正好蓋過盲區開頭（衛兵聲在盲區照樣被 gateG 壓低）
        if (kill && hintSig.blindIn != null && hintSig.blindIn < 0.7 && hintSig.blindIn > 0.2 && now >= v.nextBreath - 1.2) v.nextBreath = now;
        if (v.speed > 0.25) {
          if (now >= v.nextStep - 0.05) {
            var ts = Math.max(now + 0.01, v.nextStep);
            guardStep(v, ts, c.q.state === 'hunted');
            v.nextStep = ts + clamp(0.7 / v.speed, 0.26, 0.8) * (0.95 + Math.random() * 0.1);
          }
          v.nextBreath = Math.max(v.nextBreath, now + 0.8);
        } else {
          v.nextStep = Math.max(v.nextStep, now + 0.15);
          if (now >= v.nextBreath) { guardBreath(v, now + 0.02, alert); v.nextBreath = now + (alert ? 2.2 : 3.6) + Math.random() * 0.9; }
        }
      });
    }
    // 不合拍的腳步被聽到（11/08）：最近 8 公尺內出聲中的衛兵短促吸一口氣、喉嚨「嗯？」，呼吸與腳步節奏被打斷；
    // 走衛兵自己的 3D 聲道（有方向、隨距離變小，盲區照 gateG 壓低）
    function guardStartle(t) {
      var best = null, bd = 8;
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i]; if (v.id == null) continue;
        var d = Math.sqrt((v.lx - lis.x) * (v.lx - lis.x) + (v.lz - lis.z) * (v.lz - lis.z));
        if (d < bd) { bd = d; best = v; }
      }
      if (!best) return;
      var f = noise(best.input, t, 'bandpass', 700, 1.6, 0.16, 0.05, 0.14); f.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
      tone(best.input, t + 0.02, 'sawtooth', 110, 125, 0.15, 0.012, 0.03, 0.12);
      best.nextBreath = Math.max(best.nextBreath, t + 1.2); best.nextStep = Math.max(best.nextStep, t + 0.35);
    }
    // 玩家自己的清楚腳步：一個常駐的 panner，放在腳步的位置（不經盲區 gate：盲區裡移動也要聽得到自己）
    var selfPan = null;
    function selfPanner() { if (!selfPan) { selfPan = makePanner(); selfPan.refDistance = 1; selfPan.connect(master); } return selfPan; }

    // ---------- 安撫哼唱（8.3）：男聲低吟唱主題的一個音 ----------
    // 低八度（D3～B3，在低音拍頻段之上）。鋸齒＋三角經「ㄇ／ㄨ」鼻音共振峰（300、900、2300 Hz），0.15 秒後加微顫音。
    // opt.cents：走音（calm_bad 用 ±30～60 音分）；opt.crack：破音（中途往上翻五度一下、帶氣聲、略失真）。
    var humCurve = shaperCurve(3);
    function hum(t, midi, opt) {
      opt = opt || {};
      var f = midiHz(midi - 12) * Math.pow(2, (opt.cents || 0) / 1200), dur = 0.85;
      var out = ctx.createGain(); out.gain.value = 0; out.connect(cueBus);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.connect(out);
      var src = ctx.createGain(); src.gain.value = 1;
      [[300, 4, 1], [900, 6, 0.35], [2300, 8, 0.08]].forEach(function (fm) {
        var bp = ctx.createBiquadFilter(), g = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = fm[1]; g.gain.value = fm[2] * 3;
        src.connect(bp); bp.connect(g); g.connect(lp);
      });
      var dry = ctx.createGain(); dry.gain.value = 0.25; src.connect(dry); dry.connect(lp);   // 一點原聲，讓音高清楚
      var vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2;
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.004, t + 0.35); vib.connect(vg);
      var sh = null;
      if (opt.crack) {                      // 破音帶一點失真（每次自己一個 shaper，不共用）
        sh = ctx.createWaveShaper(); sh.curve = humCurve;
        var hs = ctx.createGain(); hs.gain.value = 0.6; sh.connect(hs); hs.connect(src);
      }
      var oscs = [['sawtooth', 1, 0], ['triangle', 0.7, 4]].map(function (w) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = w[0]; o.detune.value = w[2]; g.gain.value = w[1];
        o.frequency.setValueAtTime(f * (opt.crack ? 0.985 : 1), t);
        if (opt.crack) {                    // 起音偏低滑上來，0.2 秒處破音往上翻、再掉回走音的音
          o.frequency.linearRampToValueAtTime(f, t + 0.12);
          o.frequency.setValueAtTime(f * 1.5, t + 0.2); o.frequency.setValueAtTime(f * 0.97, t + 0.27);
          o.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
        }
        vg.connect(o.frequency); o.connect(g);
        g.connect(opt.crack ? sh : src);
        o.start(t); o.stop(t + dur + 0.05);
        return o;
      });
      if (opt.crack) {
        noise(out, t + 0.2, 'bandpass', 1500, 1.5, 0.35, 0.005, 0.07);   // 破音時的氣聲
      }
      vib.start(t); vib.stop(t + dur + 0.05);
      var pk = C.HUM_GAIN * (opt.crack ? 0.9 : 1);
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(pk, t + 0.07);
      out.gain.setValueAtTime(pk, t + dur - 0.3); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      return oscs;
    }
    // 安撫是第幾個音：規則給 index 就用它（calm_ok 0～3＝第幾個對拍；calm_bad＝當下已對拍次數，也就是「本來要唱的那個音」），
    // 沒給就自己數（間隔超過 3 秒從頭）
    var calmSeq = { n: 0, lastT: -1e9 };
    function calmNoteIndex(d, ok, now) {
      var idx = d && isFinite(d.index) ? +d.index : null, i;
      if (idx != null) i = Math.round(idx);
      else { if (now - calmSeq.lastT > 3) calmSeq.n = 0; i = calmSeq.n; }
      if (ok) { calmSeq.n = i + 1; calmSeq.lastT = now; }
      var L = THEME.notes.length;
      return ((i % L) + L) % L;
    }
    // 門閂：推進每 1/8 奏主題的一個音。主題 7 音，第 8 步擴展成收尾的和弦（D4＋A4＋D5 撥奏）；超過 8 就循環
    var latchSeq = { n: 0, lastT: -1e9 };
    function latchNote(t, d) {
      var now = ctx.currentTime, idx;
      if (d && isFinite(d.index)) idx = +d.index;
      else { if (now - latchSeq.lastT > 12) latchSeq.n = 0; idx = latchSeq.n; }
      latchSeq.n = idx + 1; latchSeq.lastT = now;
      idx = ((Math.round(idx) % 8) + 8) % 8;
      if (idx < THEME.notes.length) lyre(cueBus, t, THEME.notes[idx].midi, C.LATCH_VEL * (idx === 0 ? 1.1 : 1));
      else [62, 69, 74].forEach(function (m, i) { lyre(cueBus, t + i * 0.035, m, C.LATCH_VEL * 0.9); });
      tone(cueBus, t, 'sine', 170, 120, 0.06, 0.12, 0.002, 0.1);          // 門閂木頭輕輕一頓
      noise(cueBus, t, 'bandpass', 900, 1.5, 0.06, 0.002, 0.04);
      return idx;
    }
    function stepSound(dest, t, k) {        // 赤腳／皮鞋踩石板（k＝音量倍數）
      noise(dest, t, 'lowpass', 380 + Math.random() * 120, 1, 0.45 * k, 0.002, 0.07);
      noise(dest, t + 0.004, 'bandpass', 2500, 2, 0.06 * k, 0.001, 0.02);
    }

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
      step: function (t) { stepSound(cueBus, t, 1); },   // 腳步：赤腳／皮鞋踩石板
      stepMasked: function (t) {          // 合拍的腳步：被鼓聲蓋過，極小聲、更悶
        noise(cueBus, t, 'lowpass', 260 + Math.random() * 60, 0.8, C.STEP_MASKED_GAIN, 0.003, 0.06);
      },
      stepLoud: function (t, d) {         // 不合拍的腳步：清楚，有 {x, z} 就放在那個位置（3D）
        var dest = cueBus;
        if (d && isFinite(d.x) && isFinite(d.z)) {
          var p = selfPanner(); setPos(p, +d.x, 0.05, +d.z, ctx.currentTime, true);
          dest = ctx.createGain(); dest.gain.value = 1; dest.connect(p);
        }
        stepSound(dest, t, C.STEP_LOUD_GAIN / 0.45);
        // 碎石被踩碎的「喀嚓」（11/08）：1～4 kHz 為主、要比鼓點亮，筆電喇叭也聽得清楚。
        // 腳就在自己腳下，不走 HRTF（會損失約 6 dB），直接進 cueBus；幾顆小石子互相碰的短促「叮」錯開 12 ms，加三段摩擦噪音
        var cg = C.STEP_CRUNCH_GAIN;
        for (var i = 0; i < 5; i++) tone(cueBus, t + 0.004 + i * 0.012, 'sine', 1500 + Math.random() * 2000, 0, 0, cg * 0.5, 0.001, 0.03);
        noise(cueBus, t + 0.004, 'bandpass', 1800, 0.8, cg * 2.2, 0.001, 0.05);
        noise(cueBus, t + 0.012, 'bandpass', 2800, 1.0, cg * 1.8, 0.001, 0.07);
        noise(cueBus, t + 0.03, 'bandpass', 2200, 1.5, cg * 1.1, 0.002, 0.1);
        CUES.gravel(t + 0.05, d);           // 暗示：碎石滾動一聲（走暗示匯流排，盲區不響）
        guardStartle(t + 0.12);             // 最近的衛兵短促吸氣：你被聽到了
      },
      // ---------- 暗示聲（2.1 節）：全部走 hintBus，和盲區重疊就不發 ----------
      gravel: function (t, d) {           // 碎石滾動：幾顆小石子一路滾開，越來越輕
        if (!hintFree(t, 0.45)) return;
        var out = d && isFinite(d.x) ? hintAt(+d.x + 0.4, +d.z + 0.3, 0.05) : hintBus;
        for (var i = 0; i < 6; i++) {
          var ti = t + i * (0.045 + Math.random() * 0.04), k = 1 - i / 7;
          noise(out, ti, 'bandpass', 2400 + Math.random() * 2000, 3, C.GRAVEL_GAIN * k, 0.001, 0.018);   // 2.4～4.4 kHz：喇叭最清楚的那一帶
          tone(out, ti, 'sine', 2200 + Math.random() * 1800, 0, 0, C.GRAVEL_GAIN * 0.12 * k, 0.001, 0.03);
        }
      },
      companionGasp: function (t) {       // 同伴倒吸一口氣，壓低聲音說「別動」（字幕由畫面層顯示）
        if (!hintFree(t, 0.85)) return;
        var f = noise(companionOut, t, 'bandpass', 1100, 1.4, C.WHISPER_GAIN * 0.35, 0.05, 0.16);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
        whisper(companionOut, t + 0.3, SAY.dontMove, C.WHISPER_GAIN);
      },
      whisperNow: function (t) {          // 同伴低聲說「就是現在」：排在盲區之前結束（盲區開始時正好說完）
        if (!hintFree(t, 0.62)) return;
        whisper(companionOut, t, SAY.now, C.WHISPER_GAIN * 0.85);
      },
      growl: function (t, d) {            // 衛兵起疑：喉嚨裡一聲低吼（「嗯？」），從衛兵的位置傳來
        if (!hintFree(t, 0.8)) return;
        var out = d && isFinite(d.x) ? hintAt(+d.x, +d.z, 1.6) : hintBus;
        var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), tr = ctx.createOscillator(), tg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(92, t); o.frequency.linearRampToValueAtTime(118, t + 0.35); o.frequency.linearRampToValueAtTime(84, t + 0.7);
        lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
        tr.frequency.value = 17; tg.gain.value = 0.35; tr.connect(tg); tg.connect(g.gain);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(C.GROWL_GAIN, t + 0.08);
        g.gain.setValueAtTime(C.GROWL_GAIN, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(t); tr.start(t); o.stop(t + 0.8); tr.stop(t + 0.8);
        noise(out, t, 'lowpass', 600, 0.8, C.GROWL_GAIN * 0.5, 0.05, 0.5);   // 鼻息
      },
      latchClick: function (t) {          // 門閂快要發出聲音：鐵環輕輕「喀」一下（節奏正往快走，該放手了）
        if (!hintFree(t, 0.15)) return;
        tone(hintBus, t, 'square', 2900, 2100, 0.01, 0.025, 0.001, 0.03);
        noise(hintBus, t, 'highpass', 4500, 1, 0.08, 0.001, 0.02);
      },
      latchStep: function (t, d) { latchNote(t, d); },
      latch: function (t) {               // 門閂：木頭摩擦 + 撞擊；開頭一聲刺耳的「喀」（高頻推只會在 p > 0.5，碰不到盲區）
        tone(cueBus, t, 'square', 2600, 1900, 0.02, 0.06, 0.001, 0.04);
        noise(cueBus, t, 'highpass', 4200, 1, 0.22, 0.001, 0.03);
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
      preBlind: function (t) {            // 盲區快到了（11/08 改）：木魚「叩、叩」兩聲，短促、木質，1～3 kHz 為主，喇叭上也聽得出來
        function tok(tt, g) {             // 木魚：空腔共鳴 1.35 kHz 為主＋兩個不諧和泛音，木槌敲到的「嗒」；0.1 秒內收掉
          tone(cueBus, tt, 'sine', 1350, 1280, 0.05, 0.55 * g, 0.001, 0.11);
          tone(cueBus, tt, 'sine', 2050, 2000, 0.04, 0.3 * g, 0.001, 0.07);
          tone(cueBus, tt, 'sine', 2780, 0, 0, 0.16 * g, 0.001, 0.045);
          noise(cueBus, tt, 'bandpass', 1900, 1.4, 0.5 * g, 0.001, 0.02);
        }
        tok(t, C.PRE_BLIND_GAIN); tok(t + 0.095, C.PRE_BLIND_GAIN * 0.7);   // 兩聲在 0.2 秒內結束，離盲區還有 0.2 秒
      },
      blind: function (t) {               // 盲區提示：很輕、很悶的一下
        tone(cueBus, t, 'sine', 300, 220, 0.06, 0.05, 0.003, 0.12);
        noise(cueBus, t, 'lowpass', 700, 0.7, 0.03, 0.01, 0.15);
      },
      win: function (t) {                 // 勝利：城門大開（轟隆、木頭呻吟）＋號角
        noise(cueBus, t, 'lowpass', 120, 0.7, 0.8, 0.6, 2.6);
        tone(cueBus, t, 'sine', 45, 38, 2.5, 0.6, 0.5, 2.8);
        CUES.latch(t + 0.1); CUES.latch(t + 0.7);
        // 號角奏主題：在 update 看到 phase === 'win' 時排（音樂層，見 winTheme），這裡只留城門與鼓
        for (var i = 0; i < 8; i++) CUES._drum(t + 3.9 + i * 0.32, i % 4 === 0 ? 1 : 0.6);
      },
      alert: function (t) {               // 起疑：衛兵猛然轉身，短促的青銅刮擦＋低鼓一擊
        tone(cueBus, t, 'sine', 70, 45, 0.25, 0.6, 0.003, 0.4);
        var f = noise(cueBus, t, 'bandpass', 2400, 6, 0.35, 0.01, 0.35); f.frequency.exponentialRampToValueAtTime(3600, t + 0.3);
        tone(cueBus, t + 0.02, 'sine', 990, 1180, 0.3, 0.05, 0.01, 0.4);
        tone(cueBus, t + 0.02, 'sine', 1050, 1240, 0.3, 0.04, 0.01, 0.4);   // 兩條略不和諧
      },
      caught: function (t) {              // 被抓：重擊＋警鐘
        tone(cueBus, t, 'sine', 90, 35, 0.5, 1.0, 0.002, 0.9);
        noise(cueBus, t, 'lowpass', 600, 0.8, 0.7, 0.002, 0.3);
        CUES.bell(t + 0.15);
      },
      takedown: function (t) { CUES.down(t); },
      takedownFail: function (t) {        // 暗殺失手：扭打、青銅碰撞
        noise(cueBus, t, 'bandpass', 700, 1, 0.4, 0.01, 0.2);
        tone(cueBus, t + 0.12, 'sine', 760, 0, 0, 0.08, 0.001, 0.4);
        tone(cueBus, t + 0.12, 'sine', 1137, 0, 0, 0.06, 0.001, 0.3);
        CUES.step(t + 0.25); CUES.step(t + 0.4);
      },
      calmOk: function (t, d) {           // 安撫成功一次：低吟唱主題動機的下一個音（4 次＝唱完前 4 音的短句）
        var i = calmNoteIndex(d, true, ctx.currentTime);
        hum(t, THEME.notes[i].midi);
        if (log) log.push({ type: 'hum', t: t, i: i, ok: true });
      },
      calmBad: function (t, d) {          // 安撫失敗：唱歪了——偏 30～60 音分、破音
        var i = calmNoteIndex(d, false, ctx.currentTime);
        var cents = (30 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1);
        hum(t, THEME.notes[i].midi, { cents: cents, crack: true });
        noise(cueBus, t, 'lowpass', 300, 0.7, 0.12, 0.003, 0.15);
        if (log) log.push({ type: 'hum', t: t, i: i, ok: false, cents: cents });
      },
      calmDone: function (t) {            // 衛兵回到巡邏：長長吐一口氣＋低吟和聲
        CUES.breathOut(t);
        tone(cueBus, t + 0.1, 'sine', 146.8, 0, 0, 0.07, 0.3, 1.4);
        tone(cueBus, t + 0.1, 'sine', 220, 0, 0, 0.05, 0.3, 1.4);
      },
      checkpoint: function (t) {          // 檢查點：一聲撥弦（像里拉琴），很輕
        [293.7, 440].forEach(function (f, i) {
          tone(cueBus, t + i * 0.12, 'triangle', f, 0, 0, 0.09, 0.002, 1.1);
          tone(cueBus, t + i * 0.12, 'sine', f * 2, 0, 0, 0.03, 0.002, 0.6);
        });
      },
      dash: function (t) {                // 衝刺：一陣風聲＋兩步
        var f = noise(cueBus, t, 'bandpass', 500, 0.8, 0.3, 0.06, 0.25); f.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
        CUES.step(t + 0.05); CUES.step(t + 0.2);
      },
      escape: function (t) {              // 甩掉追兵：喘一口氣，節奏退去後的空
        var f = noise(cueBus, t, 'bandpass', 1200, 0.8, 0.3, 0.1, 0.8); f.frequency.exponentialRampToValueAtTime(450, t + 0.9);
        tone(cueBus, t, 'sine', 73.4, 0, 0, 0.08, 0.4, 1.8);
      },
      trapdoor: function (t) {            // 木馬暗門：木頭吱呀＋落地
        CUES._creak(t, 0.3); CUES._creak(t + 0.35, 0.22);
        tone(cueBus, t + 0.8, 'sine', 130, 90, 0.1, 0.4, 0.002, 0.25);
        noise(cueBus, t + 0.8, 'lowpass', 500, 0.8, 0.35, 0.002, 0.1);
      },
      _creak: function (t, g) {           // 木頭摩擦一聲
        var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), gg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 30, t); o.frequency.linearRampToValueAtTime(110 + Math.random() * 40, t + 0.3);
        lfo.frequency.value = 18 + Math.random() * 10; lg.gain.value = 20; lfo.connect(lg); lg.connect(o.frequency);
        f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 4;
        gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.05); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(f); f.connect(gg); gg.connect(cueBus); o.start(t); lfo.start(t); o.stop(t + 0.35); lfo.stop(t + 0.35);
      },
      _drum: function (t, g) { INST[0](cueBus, t, 0.8 * g); }
    };

    if (opts.autoStart !== false) { tick(); startTimer(); }

    // ---------- 對外 ----------
    var api = {
      CONST: C,
      INSTRUMENTS: INST_NAME,
      get T() { return Tof(ctx.currentTime); }, get t0() { return tAt(Math.floor(Pof(ctx.currentTime))); }, get blindLen() { return BL; },
      get beatSource() { return tabFromRules ? 'rules' : 'audio'; },   // 拍點公式來自規則還是本檔
      isFakeAt: function (t) { var c = Math.floor(Pof(t == null ? ctx.currentTime : t)); return !!fakeC[c]; },   // 測試用：t 所在這一輪是不是假驟降
      now: function () { return ctx.currentTime; },
      phase: function (t) { return frac(Pof(t == null ? ctx.currentTime : t)); },
      cyclePhase: function (t) { return Pof(t == null ? ctx.currentTime : t); },   // 累計相位（測試用）
      timeAtPhase: function (P) { return tAt(P); },
      isBlind: function (t) { t = (t == null ? ctx.currentTime : t); return !!inWins(t, windowsBetween(t - 1, t + 1)) || gateR.forced; },
      // 讀規則狀態：cycle（anchor、blind）、alarm、hunted、bass、panic、zone、guards（可以直接傳整個 game）
      update: function (s) {
        if (!s || dead) return;
        var now = ctx.currentTime, k = 0.08;
        lastState = s;
        if (!tabFromRules && getRules()) refreshTables();
        // 規則常數：盲區長度 BLIND_LEN（舊名 BLIND）；警戒時的盲區長度（有專用常數就用，沒有同 BLIND_LEN）
        var K = s.T && typeof s.T === 'object' ? s.T : null;
        var bl = K ? (K.BLIND_LEN != null ? +K.BLIND_LEN : +K.BLIND) : (isFinite(s.blindLen) ? +s.blindLen : NaN);
        if (isFinite(bl) && bl >= 0) BL = bl;
        var blb = K ? [K.ALERT_BLIND_LEN, K.BASS_BLIND_LEN, K.PANIC_BLIND_LEN].filter(function (v) { return isFinite(v) && v > 0; })[0] : null;
        BLB = blb != null ? +blb : BL;
        if (s.bass) {
          if (isFinite(s.bass.period) && s.bass.period > 0) st.bassPeriod = s.bass.period;
          if (isFinite(s.bass.anchor)) st.gridAnchor = +s.bass.anchor;
          // 只看規則給的 nextBeat（起疑時規則會重新對齊），不自己算固定網格
          var nb = isFinite(s.bass.nextBeat) ? s.bass.nextBeat : (isFinite(s.bass.anchor) ? s.bass.anchor : null);
          if (!isFinite(s.bass.anchor) && nb != null) st.gridAnchor = nb;
          if (nb != null && Math.abs(nb - st.bassAnchor) > 1e-4) {
            var per = st.bassPeriod, off = (nb - st.bassAnchor) / per;
            var moved = Math.abs(off - Math.round(off)) * per > 0.01;   // 換了網格（不是單純往下一拍走）
            st.bassAnchor = nb;
            if (moved) {
              // 取消舊網格上已預排、還沒響的拍；並允許新網格第一拍
              bassPending = bassPending.filter(function (b) {
                if (b.t > now && Math.abs((b.t - nb) / per - Math.round((b.t - nb) / per)) * per > 0.01) {
                  b.out.gain.cancelScheduledValues(now); b.out.gain.setValueAtTime(0, now); return false;
                }
                return true;
              });
              if (st.lastBass > now) st.lastBass = -1e9;
            }
          }
          bassPending = bassPending.filter(function (b) { return b.t > now - 2; });
        }
        // 警戒時盲區改在低音拍之間（規則決定；規則有 cycle.blindMode 就照它，沒有就看 panic.active）
        var cy = s.cycle || {};
        var bm = cy.alertBlind != null ? !!cy.alertBlind : !!(s.panic && typeof s.panic === 'object' && s.panic.active && !s.hunted);
        var changed = bm !== bassMode; bassMode = bm;
        // 節拍：讀 anchor 外推；有新 anchor、盲區規則或假驟降改了，就把已預排的拍對到新預測
        var took = takeAnchor(cy, now);
        if (cy.fake != null || cy.nextFake != null) {   // 假驟降：規則提早一個循環決定，這裡記到累計相位的循環編號上
          var c0 = Math.floor(seg.P + 1e-9), f0 = !!cy.fake, f1 = !!cy.nextFake;
          if (!!fakeC[c0] !== f0 || !!fakeC[c0 + 1] !== f1) { fakeC[c0] = f0; fakeC[c0 + 1] = f1; changed = true; }
          for (var fk in fakeC) if (+fk < c0 - 3) delete fakeC[fk];
        }
        if (took || changed) replan(now);
        // 規則的 cycle.blind 是最後裁決：在規則自己的時間點比對預測，連續兩幀不一致就以規則為準
        if (cy.blind != null) {
          var ts = cy.anchor && isFinite(cy.anchor.t) ? +cy.anchor.t : (isFinite(s.time) ? +s.time : now);
          var sb = !!cy.blind, ws = windowsBetween(ts - 2, ts + 2);
          var w = inWins(ts, ws, -0.03), mis = sb ? !inWins(ts, ws, 0.03) : !!w;
          if (gateR.forced && !sb) { gateR.force(false, now); gateM.force(false, now); gateG.force(false, now); gateH.force(false, now); gateB.force(false, now); mismN = 0; }
          else if (mis && !gateR.forced) {
            if (++mismN >= 2) {
              mismN = 0;
              if (sb) { gateR.force(true, now); gateM.force(true, now); gateG.force(true, now); gateH.force(true, now); gateB.force(true, now); replan(now); }
              else if (w) {
                suppress.push({ s: w.s, e: w.e });
                gateR.force(false, now); gateM.force(false, now); gateG.force(false, now); gateH.force(false, now); gateB.force(false, now);
              }
              if (log) log.push({ type: 'blindFix', t: now, blind: sb });
            }
          } else mismN = 0;
          suppress = suppress.filter(function (x) { return x.e > now - 3; });
        }
        st.panic = clamp(+(typeof s.panic === 'object' ? 0 : s.panic) || 0, 0, 1);
        // 分區編曲：state.zone 0～4；勝利時城門大開，號角完整奏一次主題
        if (s.phase === 'win') {
          if (!mz.won) { mz.won = true; applyZone(5); winTheme(now + 1.4); }
        } else applyZone(forcedZone != null ? forcedZone : clamp((+s.zone || 0) | 0, 0, 4));
        // 推門閂：推的時候每 0.45 秒一聲木頭摩擦（越接近完成越響），高頻時鬆手就不會有聲音
        if (s.gate && s.gate.pushing && !s.gate.open && now - st.lastCreak > 0.45) {
          st.lastCreak = now;
          var prog = s.gate.need ? clamp(s.gate.progress / s.gate.need, 0, 1) : 0.5;
          CUES._creak(now + 0.01, 0.12 + 0.18 * prog);
        }
        var al = clamp(+s.alarm || 0, 0, 1), hu = !!s.hunted;
        if (Math.abs(al - st.alarm) > 1e-4 || hu !== st.hunted) {
          st.alarm = al; st.hunted = hu;
          alarmGain.gain.setTargetAtTime(Math.max(al * 0.9, hu ? 0.6 : 0), now, k);
          distWet.gain.setTargetAtTime(al * 0.55 + (hu ? 0.25 : 0), now, k);
          rhythmHP.frequency.setTargetAtTime(30 + al * 220, now, k);
          bassGain.gain.setTargetAtTime(hu ? 0.6 : C.BASS_BASE + (1 - C.BASS_BASE) * al, now, k);
          rhythmBus.gain.setTargetAtTime(mute.rhythm ? 0 : (hu ? 1.3 : 1), now, k);
          // 音樂層：警戒退後＋低切（讓慢低音最清楚），追殺略提高；功能層不受影響
          rampTo(musicDuck.gain, hu ? C.MUSIC_HUNT_GAIN : Math.pow(10, C.MUSIC_ALARM_DB * al / 20), C.MUSIC_RAMP);
          rampTo(musicHP.frequency, hu ? C.MUSIC_HP_BASE : C.MUSIC_HP_BASE * Math.pow(C.MUSIC_HP_ALARM / C.MUSIC_HP_BASE, al), C.MUSIC_RAMP, true);
        }
        // 警戒開始（11/08）：節奏＋失控層先壓低 ALERT_DUCK_GAIN，到低音第一拍（規則 anchor = 起疑 + BASS_LEAD）後 ALERT_DUCK_BEATS 拍，
        // 再用 0.6 秒回來；讓玩家先單獨聽到一兩下低音，知道「要跟的就是這個」。追殺或安撫完成就立刻回 1。
        var pa = !!(s.panic && typeof s.panic === 'object' && s.panic.active) && !hu;
        if (pa !== st.panicOn) {
          st.panicOn = pa;
          var dg = rhythmDuck.gain;
          dg.cancelScheduledValues(now); dg.setValueAtTime(dg.value, now);
          if (pa) {
            var an0 = (s.bass && isFinite(s.bass.anchor)) ? +s.bass.anchor : st.bassAnchor;
            var tEnd = Math.max(now + 0.5, an0 + C.ALERT_DUCK_BEATS * st.bassPeriod);
            dg.linearRampToValueAtTime(C.ALERT_DUCK_GAIN, now + 0.12);
            dg.setValueAtTime(C.ALERT_DUCK_GAIN, tEnd);
            dg.linearRampToValueAtTime(1, tEnd + 0.6);
            if (log) log.push({ type: 'alertDuck', t: now, until: tEnd });
          } else dg.linearRampToValueAtTime(1, now + 0.3);
        }
        // 暗示：規則的 hintSignals（可暗殺的衛兵、離盲區幾秒）；路線的風、號角、門外低語
        hintSig = null;
        var Rh = getRules();
        if (Rh && typeof Rh.hintSignals === 'function' && s.player) {
          try {
            var hs = Rh.hintSignals(s), km = {};
            (hs.guards || []).forEach(function (gq) { if (gq.killable) km[String(gq.id)] = true; });
            hintSig = { kill: km, blindIn: hs.blindIn };
          } catch (e) { hintSig = null; }
        }
        guardP = s.cycle && isFinite(s.cycle.p) && !s.cycle.blind ? clamp(+s.cycle.p, 0, 1) : 0;
        updateRoute(s, now);
        // 衛兵 3D：倒下、非作用中的靜音；沒有衛兵清單就全部淡掉
        if (s.guards && s.guards.length != null) updateGuards(s.guards, now);
        // 立刻補排一次（新外推、新盲區），不等下一個 tick
        scheduleTo(now + C.LOOKAHEAD, now);
      },
      setListener: setListener,
      // cue(name[, when])、cue(name, data)、cue(event)：data／event 可帶 index（calm_ok、calm_bad、latch_step）與 x、z（step_loud）。
      // event 可以是 game.out 的一筆 {type:'sfx', a:'calm_ok', index}（資料也可放在 a 物件或 data 裡）
      cue: function (name, arg) {
        if (dead || !name) return false;
        var data = {}, when = null;
        function take(o) { if (!o || typeof o !== 'object') return; ['index', 'x', 'z'].forEach(function (f) { if (o[f] != null && data[f] == null) data[f] = o[f]; }); }
        if (typeof name === 'object') {
          var ev = name; take(ev); take(ev.data);
          name = ev.a != null ? ev.a : (ev.name || ev.sfx || ev.cue);
          if (name && typeof name === 'object') { take(name); take(name.data); name = name.name || name.sfx || name.type || name.cue; }
        }
        if (typeof arg === 'number') when = arg;
        else if (arg && typeof arg === 'object') { take(arg); take(arg.data); if (arg.a && typeof arg.a === 'object') take(arg.a); if (isFinite(arg.when)) when = +arg.when; }
        if (typeof name !== 'string' || !name) return false;
        var key = CUE_ALIAS[name.toLowerCase().replace(/[\s_-]/g, '')] || name;
        var fn = CUES[key];
        if (!fn || key.charAt(0) === '_') return false;
        fn(when != null ? when : ctx.currentTime + 0.005, data);
        return true;
      },
      cueNames: ['breathIn', 'breathOut', 'gasp', 'step', 'stepMasked', 'stepLoud', 'latch', 'latchStep', 'down', 'bell', 'preBlind', 'blind', 'win',
                 'alert', 'caught', 'takedownFail', 'calmOk', 'calmBad', 'calmDone', 'checkpoint', 'dash', 'escape', 'trapdoor',
                 'gravel', 'companionGasp', 'whisperNow', 'growl', 'latchClick'],
      setMaster: function (v) { master.gain.setTargetAtTime(clamp(+v || 0, 0, 1.5), ctx.currentTime, 0.03); },
      suspend: function () { return ctx.suspend ? ctx.suspend() : Promise.resolve(); },
      resume: function () { return (ctx.resume ? ctx.resume() : Promise.resolve()).then(function () { tick(); }); },
      // 離線渲染／測試用：一次排到 tEnd
      scheduleUntil: function (tEnd) { scheduleTo(tEnd, ctx.currentTime); },
      // 測試／除錯：重排統計、衛兵聲部
      _stats: stats,
      _hint: { out: hintOut, bus: hintBus, wind: windGain, murmur: murmurGain, route: route, free: function (t, d) { return hintFree(t, d); } },
      _voices: function () { return voices.map(function (v) { return { id: v.id, speed: +v.speed.toFixed(2) }; }); },
      // ---------- 音樂層：自備配樂（測試模式，設計文件 7.1）與模式切換 ----------
      // loadTrack 接受 ArrayBuffer（會被解碼、脫離）或已解碼的 AudioBuffer；回傳 Promise<AudioBuffer>。
      // 只換音檔，不改模式；模式由 setMusicMode 決定。
      loadTrack: function (data) {
        if (dead) return Promise.reject(new Error('audio disposed'));
        var p = (data && typeof data.getChannelData === 'function') ? Promise.resolve(data) : decode(ctx, data);
        return p.then(function (buf) {
          if (dead) return buf;
          stopTrack();
          var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
          src.connect(trackLevel); src.start(ctx.currentTime + 0.02);
          music.buf = buf; music.src = src;
          applyMusicLevels();
          return buf;
        });
      },
      clearTrack: function () {
        rampTo(trackLevel.gain, 0, 0.05);
        var src = music.src; music.src = null; music.buf = null;
        if (src) { try { src.stop(ctx.currentTime + 0.06); } catch (e) {} }
        if (music.mode !== 'synth') music.mode = 'synth';
        applyMusicLevels();
      },
      hasTrack: function () { return !!music.buf; },
      setTrackVolume: function (v) { music.trackVol = clamp(+v || 0, 0, 1.5); applyMusicLevels(0.08); },
      setSynthVolume: function (v) { music.synthVol = clamp(+v || 0, 0, 1.5); applyMusicLevels(0.08); },
      // 'synth' 合成｜'track' 只播自備音檔｜'mix' 兩者都播。沒有音檔時只接受 'synth'，回傳是否成功
      setMusicMode: function (m) {
        if (m !== 'synth' && m !== 'track' && m !== 'mix') return false;
        if (m !== 'synth' && !music.buf) return false;
        music.mode = m; applyMusicLevels(); return true;
      },
      getMusic: function () { return { mode: music.mode, synthVol: music.synthVol, trackVol: music.trackVol, hasTrack: !!music.buf,
                                       duration: music.buf ? music.buf.duration : 0 }; },
      // ---------- 原創音樂層：各元素開關、強制分區、主題 ----------
      THEME: THEME,
      // name: 'chant'|'chorus'|'shepard'|'theme'；實驗用，關掉的元素 ZONE_XFADE 秒內淡出
      setMusicLayer: function (name, on) {
        if (!(name in layerOn) || mute.music) return false;
        layerOn[name] = !!on; var z = mz.zone; mz.zone = -1; applyZone(z, 0.5); return true;
      },
      getMusicLayers: function () { return { chant: layerOn.chant, chorus: layerOn.chorus, shepard: layerOn.shepard, theme: layerOn.theme,
                                              zone: mz.zone, forcedZone: forcedZone }; },
      setMusicZone: function (z) { forcedZone = (z == null || !isFinite(z)) ? null : clamp(Math.round(+z), 0, 4); if (forcedZone != null) applyZone(forcedZone); },
      // 主題動機奏一次（其他章的閃回也可用）：voice 'lyre'｜'horn'，opt {notes, unit}；回傳結束時間
      playTheme: function (voice, when, opt) { return dead ? 0 : playTheme(voice || 'lyre', when != null ? when : ctx.currentTime + 0.02, opt); },
      // 測試用：音樂層節點（讀 gain.value 驗證壓低）
      _music: { gate: musicGate, duck: musicDuck, hp: musicHP, synth: synthLevel, track: trackLevel,
                chant: chantBus, chorus: chorusBus, shepard: shepBus, theme: themeBus },
      log: log,
      dispose: function () {
        dead = true; if (timer) clearInterval(timer); stopWorker(); stopTrack();
        persist.forEach(function (n) { try { n.stop(); } catch (e) {} });
        routeLive.forEach(function (n) { try { n.stop(); } catch (e) {} });
        try { master.disconnect(); } catch (e) {}
      }
    };
    return api;
  }

  // decodeAudioData：新版回傳 Promise，舊版（Safari）只有回呼，兩種都接
  function decode(ctx, ab) {
    return new Promise(function (res, rej) {
      if (!ab || typeof ab.byteLength !== 'number') { rej(new Error('不是音檔資料')); return; }
      var r = ctx.decodeAudioData(ab, res, function (e) { rej(e || new Error('無法解碼音檔')); });
      if (r && typeof r.then === 'function') r.then(res, rej);
    });
  }

  return { createAudio: createAudio, phaseAt: phaseAt, beatTimes: beatTimes, decode: decode, CONST: C, THEME: THEME, midiHz: midiHz };
});
