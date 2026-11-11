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
 *   假驟降（第 8.5 節）：從 FAKE_FROM_ZONE 區起，每次相位跳回 0 時用 rng 抽「下一次交接」是否為假
 *   （機率 1 ÷ (FAKE_EVERY − 1)，平均約每 FAKE_EVERY 個循環 1 次；這一次是假的，下一次一定是真的，不會連續）。
 *   cycle.fake = 這一輪開頭的交接是假驟降（沒有盲區、感知照常）；cycle.nextFake = 下一次交接是假驟降
 *   （提早一整個循環決定，聲音才來得及不排靜音、不發 pre_blind）。警戒、追殺中不抽；追殺開始時取消已抽中的。
 *   11/09 4A：高頻亂動／大聲先進「高度警覺」再追殺；追殺中可用盲區衝刺與連續合拍甩追兵；火光亮度公式與 blindWindows
 *   匯出，讓聲音層、畫面層與規則判定共用同一份盲區時段。
 *   Risset 拍點公式（從聲音層移過來，兩邊共用）：第 k 層第 n 拍在 p = log2(1 + n ÷ (M·2^k))，
 *   n = 0 .. M·2^k − 1；音量 = 鐘形曲線 bell((k + p) ÷ 層數)，平常 4 層、追殺 5 層（σ 按層距等比例縮），
 *   沒有固定底限，所以交接連續、各層音量和恆定，追殺時 Risset 錯覺照樣成立。
 *   腳步（第 8.3 節，跟著鼓走）：起步那一步照 stepMasked 判（拍點 ±STEP_WIN 秒內、音量 ≥ MASK_GAIN → 'step_masked'，
 *   否則 'step_loud'）；之後每一步對齊 nextStepAt 預測的下一個可聽拍（STEP_GAP × STEP_GAP_MIN 之後第一拍，被蓋過），
 *   STEP_GAP × STEP_GAP_MAX 內沒拍就照時間落一步（出聲）。'step_loud' 時半徑 STEP_R 內的衛兵疑心 + SUSP_STEP。
 *   盲區前沿：真盲區開始前 BLIND_LEAD_GRACE 秒內，移動、衝刺、暗殺照盲區規則（聽到預告就動不會被冤枉）；假驟降前沒有。
 *   按鍵時間：衝刺、暗殺、門閂、安撫用 input.actAt（按鍵當下的音訊時間，畫面層給），沒有才用幀時間。
 *   低音拍點：anchor + k × BASS_PERIOD（k 為整數）。平常 anchor = t0；
 *   每次「新的一次起疑」開始時，anchor 重設為「當下 + BASS_LEAD」，讓第一拍在 1.5 秒後響
 *   （先讓玩家讀完提示）；CALM_TIMEOUT 12 秒內有 5 拍，對準 4 拍就成功，可以漏一拍。
 *   起疑那一幀 bass.nextBeat 就會更新。聲音模組每幀讀 bass.nextBeat／bass.anchor 排程即可。
 *   安撫判定時間：有 input.calmAt（按鍵當下的音訊時間減輸出延遲）就用它，沒有才用幀時間。
 *
 *   事件附帶欄位：step_* 帶 {x, z, beatT（對齊到的拍時間，沒有 = null）}；calm_ok／calm_bad 帶 index；latch_step 帶 index（0～7）。
 *
 * 暗示階梯（設計文件 2026-11-07-hint-guidance.md 第 1、2.1 節）：game.hints[key] = {fails, level, lastFail}，
 *   key：breath 屏息（喘氣、最快時站著被聽到）｜blind 驟降（最快時亂動被發現）｜radius 感知範圍（慢時在火光圈裡走到起疑）｜
 *   step 腳步太吵｜calm 安撫失敗｜takedown 暗殺失手｜fake 假驟降時動了｜listen 被背後的衛兵發現｜latch 推門閂太吵。
 *   同一種失敗 HINT_FAIL_GAP 秒內只算一次；第 2 次發 {type:'hint', a: 提示文字, key, level: 2}，第 3 次起 level 3（文字＋按鍵說明）；
 *   成功一次（屏息時衛兵就在身邊、盲區裡走動或衝刺、火光圈外安全走、合拍腳步、安撫完成、暗殺成功、假驟降沒動、轉身面對背後的人、
 *   低頻推進門閂）就退回第 1 階。重來不清除。第 1 階只靠世界內暗示：hintSignals(game) 給畫面層與聲音層共用的訊號。
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
    // 11/10 核心方向甲「殘響掩護」（docs/design/2026-11-10-core-direction-illusion.md 第 1 節）：
    // true ＝鼓聲不中斷，交接那一下的重合擊與殘響當掩護；false ＝舊的盲區版（對照、測試用）。
    // 兩版的時間窗（cycle.blind／blindWindows＝coverWindows、BLIND_LEN、BLIND_LEAD_GRACE）完全一樣，差別只有三條：
    //   1. 不抽假驟降（cycle.fake、nextFake 恆為 false）；
    //   2. p > HIGH_P 時，踩在可聽拍上的腳步（step_masked）不算被聽見，出聲的腳步（step_loud）才進高度警覺；被看見照舊；
    //   3. 掩護窗內感知仍為 0（和盲區一樣）。另外火光改讀實際速度 danger，FIRE_BLIND 不用。
    COVER_MODE: true,
    // 11/11 木馬第 1 批（docs/design/2026-11-11-trojan-horse-directions.md 第 1、3、4.1、6 節）：木馬新內容全部藏在這個開關後面；
    // 關著時所有路徑和 11/11 報告版（c1d4aa3）完全一樣。網址 ?horse=1 開；createLevel({lab: 'belly'}) 自己開。
    HORSE_MODE: false,
    BELLY_STEPS_NEED: 4,  // 木馬腹中練習：亮滿幾格，同伴才在下一個掩護窗替你拉開暗門。只有「起步」算數（第 1.1 節）【假設，待量】
    BELLY_MISS_COST: 1,   // 木馬腹中練習：起步踩歪扣幾格（最少扣到 0）【第 1.1 節；0、1、4 實測後取三條驗收都過的最小值】
    // 11/11 搭配動作（docs/design/2026-11-11-companion-mechanics.md 第 7 節）：跑（按住 Shift）、蹲走（按住 C）。
    // 預設開（和木馬不同）；網址 ?moves=0 關。關著時所有路徑和報告版（c1d4aa3）完全一樣。新常數都是假設值。
    MOVES_MODE: true,
    RUN_HOLD: 0.2,        // 按住 Shift 超過這麼多秒才算跑（點一下仍是衝刺）
    RUN_SPEED_MUL: 2,     // 跑的速度 = WALK × 2
    RUN_R: 8,             // 掩護窗外跑的每一步，這麼遠內的衛兵進高度警覺（已警覺的轉追殺）
    RUN_STEP_GAP: 0.3,    // 跑步的步距秒數（規格沒寫，規則角色暫擬）
    CROUCH_SPEED_MUL: 0.5, // 蹲走速度 = WALK × 0.5
    CROUCH_STEP_WIN: 0.16, // 蹲走時起步判定寬度（取代 STEP_WIN）
    CROUCH_R: 1.2,        // 蹲走離拍的腳步聲傳多遠（約站著走 STEP_R 的一半；第 8 節：跟 MOVES_STEP_R 等比例）
    // 搭配動作第 12 節（追殺重做，只在 MOVES_MODE 開時）
    SEARCH_PAUSE: 0.8,    // 追兵搜影子：每到一點（消失點、影子中心、最遠端）停幾秒環顧
    SEARCH_BREATH_R: 2.5, // 追兵幾公尺內聽得到你沒屏住的呼吸
    SEARCH_STEP_R: 5,     // 追殺中踩歪的腳步傳多遠（他正在專心聽；蹲著照 CROUCH_R ÷ MOVES_STEP_R 等比例縮）
    RUN_PANT_AFTER: 1.5,  // 連續跑超過幾秒，停下後會喘
    RUN_PANT_DUR: 2.5,    // 喘幾秒：不能屏息、呼吸聲傳 RUN_PANT_MUL 倍遠
    RUN_PANT_MUL: 1.6,    // 喘的時候呼吸聲的距離倍率
    HUNT_CALL_R: 12,      // 追殺開始時那一聲喊，幾公尺內巡邏的衛兵進高度警覺
    CALM_MEMORY: 30,      // 同一名衛兵幾秒內……
    CALM_MEMORY_N: 3,     // ……第幾次被注意到就不再查看，直接追殺（第 13 節；第 12 節原本是「不能安撫、直接高度警覺」）
    // 搭配動作第 13 節：拿掉安撫，改成衛兵過來查看（checking 取代起疑與高度警覺；只在 MOVES_MODE 開時）
    CHECK_TURN: 0.5,      // 查看：先轉向引起注意的位置，幾秒（這段不判定；第 15 節：規則角色可在 0.5～0.8 內調）
    CHECK_WALK: 5,        // 查看：朝那個位置最多走幾公尺（巡邏速度）
    CHECK_LISTEN: 4,      // 查看：到了停幾秒，左右轉頭聽
    // 第 15 節：查看有一條慢慢滿的疑心（q.check.susp，同步到 q.susp 給火把顏色），滿了才追殺
    CHECK_SUSP0: 0.4,     // 進入查看時的疑心
    CHECK_SEE_TIME: 1.5,  // 看到你時，3 公尺內從 CHECK_SUSP0 升到滿要幾秒（8 公尺約兩倍，中間線性；規則角色可在 1.5～2.5 內調）
    CHECK_STEP_SUSP: 0.3, // 聽到踩歪的腳步：疑心 +0.3，改朝聲音的位置走
    CHECK_BREATH_RATE: 0.3, // 聽到沒屏住的呼吸（SEARCH_BREATH_R 內）：疑心每秒 +0.3，朝你走
    CHECK_DECAY: 0.1,     // 沒看到、沒聽到時疑心每秒退多少
    CHECK_STOP_R: 2.5,    // 第 17.2 節：查看離目標這麼近就停下張望（改目標時也一樣）；規則角色可在 2～3 內調
    HUNT_START_DELAY: 0.8, // 第 17.2 節：疑心滿、追殺開始時先喊一聲（hunt_call），這段時間追兵站著不動；規則角色可在 0.6～1.0 內調
    CALL_LOOK_ONLY: false, // 第 16.1 節方向 (a)：追殺開始的喊聲叫來的衛兵只轉頭看、不走過來（查看的「走過去」跳過）
    // 走法試驗場（第 11.4 節，?lab=walk；不進預設版）：'glide' 現狀（按住就滑）｜'stride' P1 步子跟著鼓｜'manual' P1＋P2 火光圈內自己踩
    STEP_MODE: 'glide',
    STRIDE_LEN: 0.9,      // P1：每一步前進幾公尺（蹲著 × CROUCH_SPEED_MUL）
    STRIDE_SLIDE: 0.18,   // P1：一步花幾秒滑過去，其餘時間腳是停的
    MANUAL_STEP_R: 4,     // 第 16.4 節：STEP_MODE 'manual' 時，巡邏中的衛兵聽得到踩歪腳步的固定半徑（不再「快的時候整個 r(p) 都聽得到」）；也是 P2 圈的半徑
    MOVES_STEP_R: 2.5,    // 第 8 節：開關開著時，出聲的腳步傳多遠（取代 STEP_R；關著照舊 STEP_R 2.5）。2.5／4／5／6 實測後取值
    COVER_EAR_P: 0,      // 殘響掩護：相位高於它才適用「踩在鼓點上聽不見」；0 ＝全程（設計席 7.1）；設 0.6 就回到 11/10 晚的行為
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
    BELL_SIGMA: 0.22,     // 層音量鐘形曲線寬度（4 層時；追殺 5 層時按層距等比例縮成 0.22 × 4/5）
    BEAT_MIN_GAIN: 0.02,  // 低於這個音量的拍不排、不算
    HUNT_LAYERS: 5,       // 追殺時的層數（多一層 k = 4 純金屬）；5 層都走鐘形曲線，沒有固定底限，交接才連續（修 R1）
    FAKE_TAIL_GAIN: 0.035, // 假驟降交接處的金屬尾音音量（約 −29 dB），beatsBetween({includeFakeTail}) 回傳 tail 拍用
    STEP_GAP: 0.45,       // 腳步的基準間隔（秒）：腳步跟著鼓走，實際落在下一個可聽拍上
    STEP_GAP_MIN: 0.6,    // 下一步最早在 STEP_GAP × 0.6 之後（不會因為拍很密而變成小跑）
    STEP_GAP_MAX: 1.6,    // STEP_GAP × 1.6 內沒有可聽拍，就在那時落一步（這一步沒拍可蓋，會出聲）
    STEP_WIN: 0.08,       // 腳步落在拍點 ±0.08 秒內就被蓋過
    MASK_GAIN: 0.3,       // 只有音量 ≥ 0.3 的拍點蓋得住腳步
    STEP_R: 2.5,          // 不合拍腳步聲傳多遠
    SUSP_STEP: 0.2,       // 聽到一次不合拍腳步增加的疑心
    BLIND_LEN: 0.6,       // 盲區秒數（感知 = 0）：相位跳回 0 之後；警戒時是兩個低音拍正中央
    BLIND: 0.6,           // 舊名，等於 BLIND_LEN（畫面、聲音還在讀）；只改 BLIND_LEN 時會跟著改
    BLIND_LEAD_GRACE: 0.15, // 真盲區開始前這麼多秒內，移動、衝刺、暗殺都照盲區規則處理（聽到預告就動的人不會被判 move_high）；假驟降前沒有寬限
    PRE_BLIND: 0.4,       // 盲區前幾秒發出 sfx 'pre_blind'（預告）
    FAKE: true,           // 假驟降（第 8.5 節）；false = 關掉。COVER_MODE 下一律不抽（每次交接都無縫）
    FAKE_FROM_ZONE: 3,    // 從第 3 區（窄巷）起才會出現
    FAKE_EVERY: 4,        // 平均每幾個循環 1 次：每次交接以 1 ÷ (FAKE_EVERY − 1) 的機率抽，抽中後下一次一定是真的
    R_BASE: 3,            // 感知半徑 r(p) = R_BASE + R_GAIN × p²（11/09 4A：感知放遠）
    R_GAIN: 10,           // 感知半徑 r(p) = R_BASE + R_GAIN × p²（11/09 4A：感知放遠）
    ALERT_MUL: 1.3,       // 警戒（起疑）與追殺時感知 ×1.3
    FOV: Math.PI / 3,     // 視野半角 ±60°
    HIGH_P: 0.6,          // p > 0.6：範圍內移動／大聲先進高度警覺；再犯才追殺（11/09 4A）
    BREATH_HEAR: 0.6,     // 沒屏息、站著不動的呼吸聲，在 r × 0.6 內聽得到
    BREATH_MAX: 6,        // 屏息上限秒數，超過 = 喘氣（大聲）
    BREATH_RECOVER: 1.2,  // 不屏息時，屏息計量每秒恢復幾秒
    LOUD_R: 8,            // 大聲（喘氣、門閂聲）傳多遠（至少這麼遠，或 r 較大時用 r）
    WALK: 2.6,            // 潛行速度 m/s
    DASH: 3,              // 衝刺距離 m（只在盲區，每個盲區一次；平常）
    DASH_HUNT: 6,         // 追殺中在盲區衝刺的距離 m（11/09 4A：追殺生路）
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
    HUNT_STEP_ESCAPE: 3,  // 追殺中連續幾步踩在鼓點上（step_masked）就讓追兵減速
    HUNT_SLOW_MUL: 0.6,   // 追兵減速倍率：HUNT_SPEED × HUNT_SLOW_MUL
    HUNT_SLOW_DUR: 3,     // 追兵減速持續秒數
    CATCH_R: 1.0,         // 被追到 1 m 內 = 失敗
    ESCAPE_STILL: 6,      // 躲在陰影裡不動多少秒擺脫（11/09 4A：追殺生路；提示文字由這個常數生成）
    ALERTED_DURATION: 10, // 高度警覺持續秒數（期間再犯就轉追殺）
    ALERTED_SUSP: 0.8,    // 進入高度警覺時，疑心直接設成這個值
    PATROL_SPEED: 1.2,    // 巡邏速度
    PATROL_PAUSE: 1.0,    // 到路線點停多久（×0.8～1.2 隨機）
    SEARCH_TURN: 2.0,     // 追到最後位置後原地張望的轉速 rad/s
    GATE_LOW_P: 0.5,      // 城門：p ≤ 0.5 時推門閂才安靜
    GATE_NEED: 7,         // 需要累積的低頻推門秒數（每 1/8 發一次 latch_step）；城門區循環約 4.4 秒、每循環可推一半，約 3 個循環
    LATCH_R: 1.6,         // 離門閂多近才推得到
    LATCH_NOISE_GAP: 0.5, // 高頻時按住，每隔幾秒響一次門閂聲
    TRAPDOOR_R: 0.6,      // 木馬暗門觸發半徑
    BELLY_Y: 2.5,         // 木馬腹中離地高度
    DESYNC_P: 0.8,        // p > 0.8：畫面刻意延遲加雜訊
    DESYNC_LAG: 0.15,
    HINT_GAP: 4,          // 開場屏息提示之後，至少隔幾秒才出盲區提示
    HINT_FAIL_GAP: 2,     // 暗示階梯：同一種失敗，間隔不到幾秒只算一次（例如連續幾步都太吵）
    HINT_WARN_LEAD: 0.25, // 世界內暗示 hintSignals：屏息警告看「再過一會兒」的感知半徑，p 往上看這麼多
    HINT_BACK_R: 8,       //   背後有人：幾公尺內
    HINT_BACK_ANG: 1.9,   //   背後有人：和玩家正前方夾角超過幾弧度（約 110°）
    HINT_KILL_R: 3.2,     //   可暗殺：背後幾公尺內就開始提示（真正出手要 TAKEDOWN_R 內）
    FIRE_BASE: 0.35,      // 火光亮度基準（0～1）
    FIRE_P_GAIN: 0.65,    // 火光亮度隨危險度 danger 增加的量（danger = 1，即循環縮到 CYCLE_HUNT 時到 1.0）；名稱沿用 4A
    FIRE_BLIND: 0.15,     // 盲區時的火光亮度（只有舊模式 COVER_MODE = false 用；殘響掩護版不壓暗）
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
  /** 目前的 Risset 層數：平常 RISSET_LAYERS（4），追殺 HUNT_LAYERS（5）。 */
  function layerCount(hunted, K) { K = K || T; return hunted ? (K.HUNT_LAYERS || K.RISSET_LAYERS + 1) : K.RISSET_LAYERS; }
  /**
   * 第 k 層在相位 p 的音量：bell((k + p) ÷ 層數)，σ 按層距等比例（BELL_SIGMA × RISSET_LAYERS ÷ 層數），
   * 所以 4 層與 5 層的「層距 ÷ σ」一樣：各層音量和幾乎恆定（起伏 < 1%）、追殺開始時總音量不跳，
   * 而且 p → 1 的第 k 層等於 p → 0 的第 k + 1 層（交接連續，Risset 錯覺在追殺時也成立）。
   * 超出層數的層（平常的 k = 4）回 0。
   */
  function layerGain(k, p, hunted, K) {
    K = K || T;
    const L = layerCount(hunted, K);
    if (k >= L || k < 0) return 0;
    const sigma = K.BELL_SIGMA * K.RISSET_LAYERS / L;
    const d = ((k + p) / L - 0.5) / sigma;
    return Math.exp(-d * d);
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
   * 危險度：跟「實際速度」（目前循環長度 cycle.T）走，不跟相位 p 走——跟 p 走會每個循環掉回去一次，等於用眼睛指出交接點。
   * danger = (CYCLE_FAR − T) ÷ (CYCLE_FAR − CYCLE_HUNT)，夾在 0～1：附近沒人 12 秒一圈 = 0，追殺 3 秒一圈 = 1。
   */
  function dangerOf(game) {
    const K = (game && game.T) || T;
    const c = (game && game.cycle) || {};
    const len = Number.isFinite(c.T) ? c.T : K.CYCLE;
    const span = K.CYCLE_FAR - K.CYCLE_HUNT;
    return span > 0 ? Math.max(0, Math.min(1, (K.CYCLE_FAR - len) / span)) : 0;
  }
  /**
   * 火光亮度（11/10 甲版改讀 game）：FIRE_BASE + FIRE_P_GAIN × danger，夾在 0～1。
   * 只有舊模式（COVER_MODE = false）在盲區內壓暗到 FIRE_BLIND；殘響掩護版不壓暗。
   */
  function fireBrightness(game) {
    const K = (game && game.T) || T;
    const blind = !!(game && game.cycle && game.cycle.blind);
    const v = (!K.COVER_MODE && blind) ? K.FIRE_BLIND : (K.FIRE_BASE + K.FIRE_P_GAIN * dangerOf(game));
    return Math.max(0, Math.min(1, v));
  }
  /**
   * [a, b) 內的盲區時段：[{from, to, kind}]。
   * kind = 'blind'（一般：循環開頭 BLIND_LEN 秒）或 'alert'（警戒：兩個低音拍正中央 BLIND_LEN 秒）。
   * 一般盲區用 cycle.anchor 外推，並遵守 nextFake：下一次交接是假驟降時，該次沒有盲區。
   */
  function blindWindows(a, b, game) {
    if (!(b > a) || !game) return [];
    const K = game.T || T;
    const BL = blindLen(K);
    const out = [];

    const hunted = !!game.hunted;
    const alert = !!(game.panic && game.panic.active) && !hunted;

    if (alert) {
      const bass = game.bass || {};
      const period = bass.period || K.BASS_PERIOD;
      const anchor = Number.isFinite(bass.anchor) ? bass.anchor : 0;
      const half = BL / 2;
      let k = Math.max(0, Math.floor((a - anchor - half) / period));
      while (true) {
        const mid = anchor + (k + 0.5) * period;
        const from = mid - half;
        const to = mid + half;
        if (from >= b) break;
        if (to > a) {
          out.push({ from, to, kind: 'alert' });
        }
        k++;
      }
      out.sort((x, y) => x.from - y.from);
      return out;
    }

    const c = game.cycle || {};
    const an = c.anchor || { t: game.time || 0, p: c.p || 0, T: c.T || K.CYCLE, index: c.index || 0, start: c.start };
    const aIdx = an.index != null ? an.index : (c.index || 0);
    const u0 = aIdx + (an.p || 0);
    const ua = u0 + (a - an.t) / an.T;
    const ub = u0 + (b - an.t) / an.T;

    const fakeCyc = (cyc) => (cyc === aIdx && !!c.fake) || (cyc === aIdx + 1 && !!c.nextFake);
    const startOf = (cyc) => (cyc === aIdx && Number.isFinite(an.start)) ? an.start : an.t + (cyc - u0) * an.T;

    const minCyc = Math.floor(ua) - 1;
    const maxCyc = Math.ceil(ub) + 1;

    for (let cyc = minCyc; cyc <= maxCyc; cyc++) {
      if (fakeCyc(cyc)) continue;
      const from = startOf(cyc);
      const to = from + BL;
      if (to <= a || from >= b) continue;
      out.push({ from, to, kind: 'blind' });
    }
    out.sort((x, y) => x.from - y.from);
    return out;
  }
  /**
   * [a, b) 內的 Risset 拍點（依 game.cycle.anchor 外推），照時間排序。
   * 每個 {t（音訊時間）, k（層）, n, cycle（第幾個循環）, p（相位）, x（音色位置 (k+p)/LAYERS）, gain}。
   * 預設略過音量 < BEAT_MIN_GAIN 的拍，以及落在盲區的拍（一般：循環開頭 BLIND_LEN 秒；警戒：低音拍正中央）。
   * 盲區用「時間落在哪一段 [開始, 開始 + BLIND_LEN)」判：本輪的開始取 anchor.start（和 updateClock 同一個基準；修 R2），
   * 其他輪用外推的 p = 0 時刻。T 在循環內變過時，上一輪尾端外推出來、卻已經落進本輪盲區的拍，也照盲區略過。
   * opts：{includeBlind, includeQuiet, minGain, includeFakeTail}。
   *   includeFakeTail：標記為假驟降的循環，另外回傳交接處的金屬尾音 2 拍
   *   {t（交接時刻）, k: 3 與 4, n, cycle, p, x, gain: FAKE_TAIL_GAIN, tail: true}（聲音層排尾音、錄音工具當期望拍）。
   * game 只需要 {T, cycle:{anchor, fake, nextFake}, bass, panic, hunted}。
   */
  function beatsBetween(a, b, game, opts) {
    opts = opts || {};
    const K = (game && game.T) || T, c = game.cycle;
    const an = c.anchor || { t: game.time || 0, p: c.p || 0, T: c.T || K.CYCLE, index: c.index || 0, start: c.start };
    const u0 = (an.index != null ? an.index : (c.index || 0)) + an.p;
    const ua = u0 + (a - an.t) / an.T, ub = u0 + (b - an.t) / an.T;
    const hunted = !!game.hunted;
    const alert = !!(game.panic && game.panic.active) && !hunted;
    const nL = layerCount(hunted, K);
    const BL = blindLen(K);
    const aIdx = an.index != null ? an.index : (c.index || 0);
    const fakeCyc = (cyc) => (cyc === aIdx && !!c.fake) || (cyc === aIdx + 1 && !!c.nextFake);
    /** 第 cyc 輪 p = 0 的音訊時間：本輪用 anchor.start，其他輪外推。 */
    const startOf = (cyc) => (cyc === aIdx && Number.isFinite(an.start)) ? an.start : an.t + (cyc - u0) * an.T;
    const curStart = startOf(aIdx);
    /** 時間 t（屬於第 cyc 輪的拍）是否落在一般盲區（含假驟降例外）。 */
    const inBlindAt = (t, cyc) => {
      if (t >= curStart - 1e-9 && t - curStart < BL) return !fakeCyc(aIdx);          // 本輪的真盲區（updateClock 同一個算法）
      if (cyc !== aIdx && t - startOf(cyc) < BL) return !fakeCyc(cyc);              // 其他輪：外推的開頭
      return false;
    };
    const minGain = opts.minGain != null ? opts.minGain : (opts.includeQuiet ? 0 : K.BEAT_MIN_GAIN);
    const out = [];
    if (!(ub > ua)) return out;
    for (let cyc = Math.floor(ua); cyc <= Math.floor(ub); cyc++) {
      const pa = Math.max(0, Math.min(1, ua - cyc)), pb = Math.max(0, Math.min(1, ub - cyc));
      if (pb <= pa) continue;
      const t0c = startOf(cyc);
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
            else if (inBlindAt(t, cyc)) continue;   // 假驟降：交接照常，開頭的拍照響
          }
          out.push({ t, k, n, cycle: cyc, p: ph, x: (k + ph) / nL, gain });
        }
      }
      // 假驟降的金屬尾音：交接處 k = 3（上一輪最高層收尾）與 k = 4（新一輪的金屬餘韻）各一拍
      if (opts.includeFakeTail && !alert && fakeCyc(cyc) && t0c >= a && t0c < b) {
        const tails = [
          { t: t0c, k: K.RISSET_LAYERS - 1, n: layerBeats(K.RISSET_LAYERS - 1, K), cycle: cyc - 1, p: 1 },
          { t: t0c, k: K.RISSET_LAYERS, n: 0, cycle: cyc, p: 0 }
        ];
        for (const tl of tails) out.push(Object.assign(tl, { x: (tl.k + tl.p) / (K.RISSET_LAYERS + 1), gain: K.FAKE_TAIL_GAIN, tail: true }));
      }
    }
    out.sort((x, y) => x.t - y.t || x.k - y.k);
    return out;
  }
  /** 時間 t 的腳步是否被鼓聲蓋過：±STEP_WIN 秒內有音量 ≥ MASK_GAIN 的拍點。 */
  function stepMasked(t, game, win) {
    const K = (game && game.T) || T;
    const w = win == null ? K.STEP_WIN : win;   // 蹲走時傳 CROUCH_STEP_WIN
    return beatsBetween(t - w - 1e-9, t + w + 1e-9, game, { minGain: K.MASK_GAIN }).length > 0;
  }
  /**
   * 腳步跟著鼓走（審議 A 席：腳步掩護方向要對）。上一步在 lastT，下一步落在哪：
   * 回傳 {t, beatT}：lastT + STEP_GAP × STEP_GAP_MIN 之後第一個可聽拍（音量 ≥ MASK_GAIN、不在盲區）；
   * 到 lastT + STEP_GAP × STEP_GAP_MAX（再多 STEP_WIN 的餘裕）都沒有拍，就在 MAX 那時落一步（beatT = null，這一步會出聲）。
   */
  function nextStepAt(lastT, game) {
    const K = (game && game.T) || T;
    const lo = lastT + K.STEP_GAP * K.STEP_GAP_MIN, hi = lastT + K.STEP_GAP * K.STEP_GAP_MAX;
    const bs = beatsBetween(lo, hi + K.STEP_WIN, game, { minGain: K.MASK_GAIN });
    return bs.length ? { t: bs[0].t, beatT: bs[0].t } : { t: hi, beatT: null };
  }
  /** 時間 t 附近（±STEP_WIN）最近的可聽拍時間，沒有 = null（起步那一步的 beatT）。 */
  function nearestMaskBeat(t, game, win) {
    const K = (game && game.T) || T;
    const w = win == null ? K.STEP_WIN : win;
    const bs = beatsBetween(t - w - 1e-9, t + w + 1e-9, game, { minGain: K.MASK_GAIN });
    if (!bs.length) return null;
    let best = bs[0];
    for (const b of bs) if (Math.abs(b.t - t) < Math.abs(best.t - t)) best = b;
    return best.t;
  }
  /**
   * 視覺輔助強度（畫面的輔助與聲音的木魚預告都讀它）：'on' = 1，'off' = 0，數字照用；'auto' 依區：
   *   舊盲區版：區 0、1 = 1，區 2 = 0.5，其後 0。
   *   殘響掩護版（設計席 7.9：教完的下一區才開始拿掉；最響的一擊在區 2 才教）：區 0～2 = 1，區 3 = 0.5，區 4 = 0。
   * K 不給時用預設常數（COVER_MODE = true）。
   */
  function visualAidFor(zone, mode, K) {
    K = K || T;
    if (mode === 'on') return 1;
    if (mode === 'off') return 0;
    if (typeof mode === 'number' && Number.isFinite(mode)) return Math.max(0, Math.min(1, mode));
    if (K.COVER_MODE) return zone <= 2 ? 1 : zone === 3 ? 0.5 : 0;
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
  // 文字裡的數字一律從常數生成（hintsFor(K)），改常數提示跟著變，不會「說一套做一套」（修 R3、審議 1.5 節第 2 項）。
  /** 秒數的寫法：整數照印，小數去掉尾零（0.6、2.4、1.5）。 */
  const num = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
  /** 速度倍率的說法（由常數生成）：2 →「快一倍」、0.5 →「慢一半」，其他照印倍數。 */
  /** 小整數的中文（「第三次」）；其他照印。 */
  const cnNum = (n) => ('〇一二三四五六七八九十'[n] || num(n));
  const speedText = (m) => (m === 2 ? '快一倍' : m === 0.5 ? '慢一半' : '變成平常的 ' + num(m) + ' 倍');
  function hintsFor(K) {
    K = K || T;
    const cover = !!K.COVER_MODE;   // 殘響掩護版：鼓聲不斷，時機改說「最響的那一擊」（文字照設計席 7.4）
    const moves = !!K.MOVES_MODE;   // 搭配動作（第 7 節）：dash 講兩種用法、breath 補一句、多一則 crouch
    const listen = moves ? '屏住時聽得到衛兵的腳步在哪。' : '';
    // 第 10 節短版：跑很吵，只有最響的一擊蓋得住；被追的時候就跑。（9.2 的「鼓慢、火暗、附近沒人可以跑」先拿掉：現在的關卡幾乎做不到）
    const beat = cover ? '最響的那一擊' : '節奏斷掉的瞬間';
    const runDash = '按住 Shift 可以跑，速度' + speedText(K.RUN_SPEED_MUL) + '，但很吵，' + num(K.RUN_R) + ' 公尺內的衛兵都聽得到，只有' + beat +
      '蓋得住；被追的時候就跑。' + beat + (cover ? '落下時' : '') + '點一下 Shift，再近也能衝出一小段。';
    const H = {
      breath: (cover ? '節奏越快，衛兵越敏銳。來不及躲開時，按住空白鍵屏住呼吸，站著別動。'
        : '節奏越快，衛兵越敏銳。節奏快起來時按住空白鍵屏住呼吸，不要動。') + listen,
      blind: cover ? '所有的鼓同時落下的那一擊最響，餘韻約 ' + num(K.BLIND_LEN) + ' 秒。這段時間衛兵什麼都察覺不到——趁這時移動。'
        : '聽到節奏「斷掉、重來」的那一瞬間，衛兵什麼都察覺不到——趁這時移動。',
      trapdoor: '木馬前端有一道暗門，走到那裡就能爬下去。',
      belly: '站定，等鼓點，再踏出去。站定後的第一步踩在鼓點上才亮一格，亮滿 ' + num(K.BELLY_STEPS_NEED) + ' 格，同伴就替你開門。',   // HORSE_MODE 的木馬腹中（第 1.1 節：只算起步；規則角色暫擬，畫面角色可改）
      gasp: '憋太久，喘出聲了！屏息最多約 ' + num(K.BREATH_MAX) + ' 秒，節奏慢下來時記得換氣。',
      dash: moves ? runDash
        : cover ? '最響的那一擊落下時按 Shift，可以快速衝出一小段。平常按沒有用。'
        : '節奏斷掉的瞬間按 Shift，可以快速衝出一小段。平常按沒有用。',
      panic: '有衛兵起疑了！別跟著急促的節奏亂按。聽最底下那聲很慢的低音，每響一下按一次 Q，對準 ' + num(K.CALM_NEED) + ' 次；' + num(K.CALM_TIMEOUT) + ' 秒內要完成。' +
        (moves ? '同一個人 ' + num(K.CALM_MEMORY) + ' 秒內騙不了第' + cnNum(K.CALM_MEMORY_N) + '次。' : ''),
      alerted: '衛兵高度警覺了！' + num(K.ALERTED_DURATION) + ' 秒內別再動、別出聲，否則就會被追殺。',
      hunted: moves ? '被發現了！按住 Shift 跑開，躲進陰影。'   // 第 17.4 節：分兩次出現，這是第一次被追殺（畫面角色定稿）
        : '被發現了！躲進陰影不動 ' + num(K.ESCAPE_STILL) + ' 秒，或連續 ' + num(K.HUNT_STEP_ESCAPE) + ' 步踩在鼓點上甩開他。',
      takedown: cover ? '最響的那一擊落下時，從衛兵背後靠近按 E，可以把他放倒。時機不對，他會起疑。'
        : '節奏斷掉的瞬間，從衛兵背後靠近按 E，可以把他放倒。時機不對，他會起疑。',
      gate: '城門的門閂要在節奏慢的時候按住 E 推；節奏一快就放手，否則門閂聲會被聽見。',
      lockedExit: '還在被追，先甩掉追兵才能往前走。',
      step: cover ? '踩著鼓點走，腳步聲會被鼓聲蓋過，衛兵聽不出來——但他看得見你。起步要踩在鼓點上，之後腳步會自己跟著鼓走；離拍起步、或鼓很稀疏時，身邊的衛兵聽得到。'
        : '起步踩在鼓點上，之後腳步會自己跟著鼓走、被蓋過；離拍起步、或鼓很稀疏時走，身邊的衛兵聽得到。',
      alertBlind: cover ? '衛兵起疑時，兩聲低音正中間會有一記較輕的重擊，那時可以移動。'
        : '衛兵起疑時，兩聲低音正中間有一小段安靜，那時可以移動。',
      fake: '有時鼓聲只是換手，並沒有斷：沒有那聲預告，就不要動。'
    };
    // 蹲走（只有開關開時才有這一則；關著時提示表和報告版一模一樣）
    // 第 13 節：查看（開關開著時取代安撫；字句待畫面角色照 7.4 格式定稿）
    // 第 17.4 節：第一次躲進陰影、追兵開始搜時的第二句（畫面角色定稿）
    if (moves) H.huntSearch = '他順著你進來的方向搜過來了：往旁邊躲開，他走近就按住空白鍵屏息。';
    if (moves) H.check = '他聽到了，正走過來查看：踩著鼓點退開，或躲進陰影；他走近時按住空白鍵屏息。';   // 畫面角色定稿
    if (moves) H.crouch = '按住 C 蹲著走，速度' + speedText(K.CROUCH_SPEED_MUL) + '；起步不必那麼準（鼓點前後 ' + num(K.CROUCH_STEP_WIN) +
      ' 秒內都算），離拍的腳步聲也只傳約 ' + num(K.CROUCH_R) + ' 公尺。蹲著時，水缸、貨堆這類矮東西擋得住衛兵的視線。要暗殺、推門閂得先站起來。';
    return H;
  }
  const HINTS = hintsFor(T);
  // ---------- 暗示階梯（設計文件 2026-11-07-hint-guidance.md 第 1、2.1 節）----------
  // 同一種失敗：第 1 次只有世界內暗示（聲音、畫面，畫面層與聲音層負責）；第 2 次發 level 2（text）；
  // 第 3 次起發 level 3（text＋keys）；成功一次退回第 1 階。text 照設計文件 2.1 節「提示文字」欄；keys 裡的數字從常數生成。
  function hintLadderFor(K) {
    K = K || T;
    const cover = !!K.COVER_MODE;
    const L = {
      breath: { name: '屏息', text: cover ? '「來不及躲開時，按住空白鍵屏住呼吸，站著別動。」' : '「節奏最快時，按住空白鍵屏住呼吸，別動。」',
        keys: '按住 空白鍵 屏息，放開就換氣；最多撐約 ' + num(K.BREATH_MAX) + ' 秒，節奏慢下來就放開。' },
      blind: cover
        ? { name: '最響的一擊', text: '「最響的那一擊落下，就是你移動的時候。」',
          keys: '所有鼓同時落下的那一擊和它的餘韻，約 ' + num(K.BLIND_LEN) + ' 秒；這時按 W A S D 走，按 Shift 可以多衝一段。' }
        : { name: '驟降（盲區）', text: '「鼓聲一斷，就是你移動的時候。」',
          keys: '鼓聲斷掉的那 ' + num(K.BLIND_LEN) + ' 秒才按 W A S D 走；那一瞬間按 Shift 可以多衝一段。' },
      radius: cover
        ? { name: '衛兵感知範圍', text: '「火光照到的範圍，就是他察覺得到的範圍。」',
          keys: '在火光圈裡要踩著鼓點走，別走到他面前；被盯上就停下，或按住 空白鍵。' }
        : { name: '衛兵感知範圍', text: '「火光照到的範圍，就是他聽得到的範圍。」',
          keys: '火光圈外才按 W A S D 移動；被照到時停下，或按住 空白鍵。' },
      step: { name: '腳步合拍', text: '「踩著鼓點走，腳步聲會被蓋過。」',
        keys: '起步踩在鼓點上，然後按住 W A S D 不放、跟著鼓走，腳步會自己落在鼓點上；離拍起步或鼓很稀疏時才會出聲。' },
      calm: { name: '警戒與安撫', text: '「別跟著亂掉的鼓聲快。聽最低的那個聲音，跟著它按 Q。」',
        keys: '最低的那聲約 ' + num(K.BASS_PERIOD) + ' 秒響一次，每響一聲按一下 Q，對準 ' + num(K.CALM_NEED) + ' 次（' + num(K.CALM_TIMEOUT) + ' 秒內，漏一拍沒關係）；不要連按。' },
      takedown: cover
        ? { name: '衝刺與暗殺', text: '「最響的那一擊落下時，從背後靠近按 E。」',
          keys: '用 W A S D 繞到他背後 ' + num(K.TAKEDOWN_R) + ' 公尺內，那一擊落下就按 E。' }
        : { name: '衝刺與暗殺', text: '「鼓聲斷掉時，從背後靠近按 E。」',
          keys: '用 W A S D 繞到他背後 ' + num(K.TAKEDOWN_R) + ' 公尺內，鼓聲一斷就按 E。' },
      fake: { name: '假驟降', text: '「有時鼓聲只是換手，沒有那聲預告，就不要動。」',
        keys: '沒聽到那聲預告的輕響，就不要按 W A S D；等下一次真的斷掉再走。' },
      listen: { name: '3D 聽聲辨位', text: '「戴上耳機，聽聲音從哪邊來。」',
        keys: '移動滑鼠（或拖曳畫面）轉身，把腳步聲轉到正前方。' },
      latch: { name: '城門門閂', text: '「節奏慢的時候才推，快的時候放手。」',
        keys: '站在門閂旁按住 E 推；節奏一快就放開 E，等慢下來再按住。' }
    };
    // 第 13 節：開關開著時，教學那格「警戒與安撫」改教「查看」（字句待畫面角色定稿）
    if (K.MOVES_MODE) {
      delete L.calm;
      L.check = { name: '查看', text: '「他聽到了，正走過來。退開，或躲進陰影。」',   // 畫面角色定稿
        keys: '踩著鼓點按 W A S D 退開，或走進陰影；他走近時按住 空白鍵 屏住呼吸，走遠了再放開。他聽完就會走回原路。' };
    }
    return L;
  }
  const HINT_LADDER = hintLadderFor(T);
  /** 暗示階梯第 level 階的文字：1 = 沒有文字（null），2 = 提示文字，3 = 提示文字＋按鍵說明。ladder 不給就用預設常數的。 */
  function ladderText(key, level, ladder) {
    const L = (ladder || HINT_LADDER)[key];
    if (!L || level < 2) return null;
    const t = L.text.replace(/^「|」$/g, '');
    return level >= 3 ? t + '　' + L.keys : t;
  }

  // 失敗原因（g.failReason 是一句完整的話，畫面層直接顯示；g.failCode 是代號）
  function causesFor(K) {
    K = K || T;
    const C = {
    move_high: K.COVER_MODE ? '節奏最快時，你的腳步沒踩在鼓點上，衛兵聽見了' : '節奏最快時你動了，衛兵聽見了',
    loud: '你發出的聲音太大，衛兵聽見了',
    run: '你在鼓聲蓋不住的時候跑，衛兵聽見了',   // 搭配動作 A1（MOVES_MODE）
    calm_fast: '安撫時按得太急',
    calm_off: '安撫時沒對準那聲慢慢的低音',
    calm_slow: '安撫得太慢，衛兵喊了人',
    seen: '衛兵發現了你'
    };
    // 第 13 節：開關開著時沒有安撫；查看中聽到你的腳步或呼吸也會直接追殺
    if (K.MOVES_MODE) {
      delete C.calm_fast; delete C.calm_off; delete C.calm_slow;
      C.step = '衛兵過來查看時，聽見你沒踩在鼓點上的腳步';
      C.breath = '衛兵過來查看時，聽見你的呼吸';
    }
    return C;
  }
  const CAUSES = causesFor(T);
  const ZONE_NAMES = ['開場', '木馬腹中', '神殿廣場', '城牆下的窄巷', '城門'];

  // ---------- 關卡資料：木馬之夜（整關 60 × 30 m） ----------
  /** 木馬陰影（C1，HORSE_MODE）：木馬東緣往外 3 公尺、和木馬同寬的矩形。畫面層可以直接拿來畫。 */
  function horseShadowFor(level) {
    const h = level && level.horse;
    if (!h) return null;
    return { x0: h.x1, z0: h.z0, x1: h.x1 + 3, z1: h.z1, name: '木馬東側的影子' };
  }
  function buildLevel() {
    const R = (x0, z0, x1, z1, name) => ({ x0, z0, x1, z1, name });
    // 矮掩體（搭配動作 A2）：low: true 的牆，蹲著時擋得住衛兵視線；只有 MOVES_MODE 開著才讀
    const LOW = (x0, z0, x1, z1, name) => ({ x0, z0, x1, z1, name, low: true });
    const walls = [
      // 外框
      R(-1, -1, 61, 0, '北界'), R(-1, 30, 61, 31, '南界'), R(-1, 0, 0, 30, '西界'), R(60, 0, 61, 30, '城門牆'),
      // 區 1／2 之間：木馬停在廣場西緣
      // 區 2 神殿廣場
      R(19, 2, 27, 8, '神殿'),
      LOW(21, 12.5, 23, 14.5, '雕像台座'),
      R(30, 0, 31, 18, '廣場東牆（北段）'), R(30, 27, 31, 30, '廣場東牆（南段）'),
      // 區 3 窄巷：北邊是城牆根的屋舍，南邊是倉庫
      R(31, 0, 46, 17, '屋舍'), R(31, 28, 46, 30, '倉庫'),
      LOW(35, 24.5, 37, 28, '貨堆'), LOW(40, 18, 41.5, 21, '水缸'),
      R(46, 0, 47, 17, '巷口北牆'), R(46, 28, 47, 30, '巷口南牆'),
      // 區 4 城門
      LOW(52, 13, 53.5, 17, '石墩')
    ];
    const shadows = [
      R(5, 14.2, 11.8, 15.8, '木馬腹中'),
      R(11, 16, 15, 20, '木馬的影子'),
      R(18, 8, 28, 10.5, '神殿柱廊'),
      R(20, 14.5, 24, 18, '雕像的影子'),
      R(14, 24, 20, 30, '南側拱廊'),
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

  // ---------- 世界內暗示的訊號（設計文件 2026-11-07 第 2.1 節；畫面層、聲音層共用，純讀 game 不改它） ----------
  /**
   * 回傳 {breathWarn, warnGuard, guards, back, latch, blindIn}：
   *   breathWarn 0～1：沒屏息、不在盲區，有衛兵在「再過一會兒」的感知範圍內，而且節奏正往最快走（同伴倒吸氣、抓手臂）。
   *   guards：每名作用中衛兵 {id, r（此刻感知半徑，盲區 = 0）, d, behind（玩家在他背後）, killable（背後 HINT_KILL_R 內）,
   *           ready（背後 TAKEDOWN_R 內，盲區按 E 就成功）}。
   *   back：玩家背後 HINT_BACK_R 內最近的衛兵 {id, d, side（−1 左…1 右）, k（0～1，越近越大）}，沒有 = null。
   *   latch：城門區在門閂旁 {near, low（p ≤ GATE_LOW_P，推了安靜）}，否則 null。
   *   blindIn：離下一段（真的）盲區還有幾秒（警戒、追殺中 = null）。
   */
  function hintSignals(game) {
    const K = (game && game.T) || T;
    const out = { breathWarn: 0, warnGuard: null, guards: [], back: null, latch: null, blindIn: null };
    if (!game || !game.player || !game.cycle) return out;
    const pl = game.player, c = game.cycle, p = c.p || 0, blind = !!c.blind;
    const pf = forward(pl.yaw || 0), pr = { x: -pf.z, z: pf.x };   // 右方 = (cos yaw, −sin yaw)
    const pAhead = Math.min(1, p + K.HINT_WARN_LEAD);
    for (const q of game.guards || []) {
      if (!q.active || q.state === 'down') continue;
      const alert = q.state === 'suspicious' || q.state === 'hunted';
      const d = Math.hypot(q.x - pl.x, q.z - pl.z, pl.y || 0), d2 = Math.hypot(q.x - pl.x, q.z - pl.z);
      const r = blind ? 0 : radiusAt(p, alert, K);
      const f = forward(q.yaw || 0);
      const behind = f.x * (pl.x - q.x) + f.z * (pl.z - q.z) < 0;
      const killable = behind && !pl.inBelly && q.state !== 'hunted' && d2 <= K.HINT_KILL_R;
      out.guards.push({ id: q.id, r, d, behind, killable, ready: killable && d2 <= K.TAKEDOWN_R });
      // 屏息警告：p 從 0.4 起漸強，快到 HIGH_P 時最強；衛兵落在 r(p + lead) 內
      if (!blind && !pl.breathing && game.phase === 'play' && p > 0.4) {
        const rA = radiusAt(pAhead, alert, K);
        if (d <= rA) {
          const k = Math.min(1, (p - 0.4) / Math.max(1e-6, K.HIGH_P - 0.4)) * Math.min(1, 1.3 - d / rA);
          if (k > out.breathWarn) { out.breathWarn = Math.max(0, Math.min(1, k)); out.warnGuard = q.id; }
        }
      }
      // 背後有人（玩家看不到的那一側）
      if (d2 > 0.3 && d2 <= K.HINT_BACK_R) {
        const ux = (q.x - pl.x) / d2, uz = (q.z - pl.z) / d2;
        const ang = Math.acos(Math.max(-1, Math.min(1, ux * pf.x + uz * pf.z)));
        if (ang >= K.HINT_BACK_ANG && (!out.back || d2 < out.back.d)) {
          const side = Math.max(-1, Math.min(1, 2 * (ux * pr.x + uz * pr.z)));   // 正後方 = 0，偏右 → 1
          out.back = { id: q.id, d: d2, side, k: Math.max(0, Math.min(1, 1 - d2 / K.HINT_BACK_R)) };
        }
      }
    }
    if (game.zone === 4 && game.level && game.level.gate && !(game.gate && game.gate.open)) {
      const L = game.level.gate.latch, d = Math.hypot(pl.x - L.x, pl.z - L.z);
      if (d <= K.LATCH_R * 2.5) out.latch = { near: d <= K.LATCH_R, low: p <= K.GATE_LOW_P, d };
    }
    if (!c.alertBlind && !game.hunted && Number.isFinite(c.blindFrom) && Number.isFinite(game.time)) out.blindIn = Math.max(0, c.blindFrom - game.time);
    return out;
  }

  // ---------- 遊戲 ----------
  function createLevel(opts) {
    opts = opts || {};
    const K = Object.assign({}, T, opts.T || {});
    const oT = opts.T || {};
    if (oT.BLIND_LEN == null && oT.BLIND != null) K.BLIND_LEN = oT.BLIND;
    K.BLIND = K.BLIND_LEN;
    // 試驗場（opts.T 可再覆寫）：都是循環固定。
    //   ?lab=belly：木馬開關開、沒有衛兵；只有腹中；爬下暗門就算過關。
    //   ?lab=horse（第 3 節 C2）：木馬開關開、沒有衛兵；從第 2 區開始自由走，不會過關也不會失敗（出口擋住）；木馬陰影照開關邏輯加入。
    //   ?lab=run／crouch／listen（搭配動作第 7.4 節）：MOVES_MODE 開、衛兵照常（要看得到驚動與否）、出口擋住；
    //     run 在第 2 區（空曠的廣場），crouch、listen 在第 3 區（有水缸、貨堆）。被抓照常失敗，畫面層 retry 回起點。
    //   ?lab=hunt（第 12 節）：第 2 區，一名追兵（g2b）從背後 6 公尺開始追，玩家離東南角的影子 6 公尺；出口擋住。
    //     第一幀開始追殺；甩掉或被抓都留在原地（畫面層 retry 重來）。
    //   ?lab=check（第 13 節）：第 2 區，一名衛兵（g2b）在玩家南方 6 公尺、背對玩家；循環固定；
    //     g.labNotice(x, z) 在指定位置製造一次「被聽到」（他過來查看那一點）。出口擋住。
    //   ?lab=walk（第 11.4 節）：第 2 區，一名衛兵在玩家要走的路中間來回巡邏；循環固定；STEP_MODE 預設 'stride'（P1），
    //     opts.T.STEP_MODE = 'manual' 切 P1＋P2、'glide' 切回現狀。玩家從 (15, 20) 往東走到 (29, 20)，非得穿過他的圈。
    const LABS = { belly: 1, horse: 2, run: 2, crouch: 3, listen: 3, hunt: 2, check: 2, walk: 2 };
    const lab = LABS[opts.lab] ? opts.lab : null;
    const horseLab = lab === 'belly' || lab === 'horse';
    if (horseLab && oT.HORSE_MODE == null) K.HORSE_MODE = true;
    if (lab && !horseLab && oT.MOVES_MODE == null) K.MOVES_MODE = true;
    if (lab === 'walk' && oT.STEP_MODE == null) K.STEP_MODE = 'stride';
    if (lab && oT.DYNAMIC == null) K.DYNAMIC = false;
    // 搭配動作第 8 節：開關開著時，這一局的 STEP_R 換成 MOVES_STEP_R（g.T.STEP_R 就是實際半徑；直接給 opts.T.STEP_R 的以它為準）
    if (K.MOVES_MODE && oT.STEP_R == null) K.STEP_R = K.MOVES_STEP_R;
    const rng = opts.rng || mulberry32(opts.seed == null ? 1 : opts.seed);
    let level = opts.level || buildLevel();
    if (horseLab) level = Object.assign({}, level, { guards: [] });
    if (K.HORSE_MODE) {
      const hs = horseShadowFor(level);
      if (hs && !level.shadows.some((s) => s.name === hs.name)) level = Object.assign({}, level, { shadows: level.shadows.concat([hs]) });
    }
    const t0 = opts.t0 || 0;
    const startZone = lab ? LABS[lab] : Math.max(0, Math.min(4, opts.startZone | 0));

    const g = {
      T: K,
      lab,
      // 木馬腹中練習（HORSE_MODE）：n 連續踩準幾步、need 要幾步、ready 達成（等下一個掩護窗）、open 暗門開了
      belly: { n: 0, need: K.BELLY_STEPS_NEED, ready: false, open: false },
      phase: startZone === 0 ? 'intro' : 'play',
      zone: startZone,
      time: null,
      // t0：起始對齊（不變，巡邏時低音以它對齊）；start：本循環 p = 0 的音訊時間；
      // blindFrom／blindTo：目前或下一段盲區（預估）；alertBlind：盲區是否改成低音拍之間
      cycle: { T: K.CYCLE, targetT: K.CYCLE, t0, start: t0, p: 0, blind: false, index: 0, desync: false, fake: false, nextFake: false,
        anchor: { t: t0, p: 0, T: K.CYCLE, index: 0, start: t0 }, blindFrom: t0, blindTo: t0 + K.BLIND_LEN, alertBlind: false },
      bass: { period: K.BASS_PERIOD, anchor: t0, nextBeat: t0 },
      player: null,
      guards: [],
      panic: { active: false, start: 0, count: 0, lastPress: null },
      gate: { progress: 0, need: K.GATE_NEED, pushing: false, open: false },
      alarm: 0,
      fire: fireBrightness({ T: K, cycle: { T: K.CYCLE, blind: false } }),
      danger: dangerOf({ T: K, cycle: { T: K.CYCLE } }),   // 0～1，跟實際速度走（火光、畫面危險度共用）
      hunted: false,
      alerted: false,
      huntSteps: 0,
      huntSlowUntil: 0,
      huntIdleT: 0,
      stillT: 0,
      failReason: null,
      failCode: null,
      retries: 0,
      level,
      out: [],
      hintsShown: {},
      // 暗示階梯：每種機制 {fails（連續失敗次數，成功歸零）, level（1～3）, lastFail（上次算進去的音訊時間）}
      hints: {},
      visualAidMode: opts.visualAid == null ? 'auto' : opts.visualAid, // 畫面層可隨時改：'auto'|'on'|'off'|數字
      visualAid: 1
    };
    g.visualAid = visualAidFor(g.zone, g.visualAidMode, K);
    for (const k of Object.keys(Object.assign({}, hintLadderFor(Object.assign({}, K, { MOVES_MODE: false })), hintLadderFor(K)))) g.hints[k] = { fails: 0, level: 1, lastFail: -1e9 };
    let last = null;
    let latchNoiseAt = -1e9;
    let dashCycle = null; // 每個盲區只能衝刺一次
    let preBlindCycle = null; // 每個循環只預告一次
    let blindHintGate = null; // {i, t}：進教盲區那一區時的循環與時間；盲區提示要等到下一個循環以後
    let dashHintGate = null;  // 殘響掩護教學：最響的一擊提示出過之後的循環；衝刺提示等到下一個掩護窗
    let horseSignalSent = false; // C3：城門開了之後，下一個掩護窗開頭發一次 horse_signal
    let horsePrevBlind = true; // 木馬腹中練習：上一幀是否在掩護窗（偵測「窗剛開」那一幀；開局當作在窗裡，不會一開局就開門）
    let crouchHintAt = null;  // 搭配動作：第 3 區先教蹲走（進區），隔 HINT_GAP 秒後的掩護窗再教暗殺
    let runStepT = -1e9;      // 搭配動作：上一個跑步步的音訊時間
    let idleWatch = null;     // 搭配動作第 8 節：{name（哪一塊影子）, idx（上次看到的循環）, n（站著不動跨過幾次交接）}
    let breathHintAt = null;  // 殘響掩護教學：第 3 區暗殺提示出現的時間；屏息提示至少隔 HINT_GAP 秒、等節奏快起來
    let huntCause = null;
    let clockT = null;    // 循環時鐘上次推進到的音訊時間
    let lastStepT = -1e9; // 上一步的音訊時間（腳步跟著鼓走：下一步由 nextStepAt 決定）
    let walking = false;  // 上一幀有沒有在走（起步那一步照 stepMasked 判）
    let radiusOkT = 0;    // 暗示階梯「感知範圍」：在火光圈外、但就在旁邊安全走了幾秒
    let fakeWatch = null; // 暗示階梯「假驟降」：{index, moved}，這一輪假驟降的頭 BLIND_LEN 秒有沒有動

    // 提示文字：沒改常數就用共用的 HINTS／HINT_LADDER（畫面層可覆寫按鍵說法）；改了常數就照改過的數字重新生成
    const HTXT = (opts.T || lab) ? hintsFor(K) : HINTS;
    const LADDER = opts.T ? hintLadderFor(K) : HINT_LADDER;
    const CZ = opts.T ? causesFor(K) : CAUSES;
    const RUN_MSG = '跑步聲傳開了——衛兵高度警覺！';
    const RUN_HUNT_MSG = '又聽到跑步聲——衛兵衝過來！';
    const CHECK_AGAIN_MSG = '同一個衛兵第' + cnNum(K.CALM_MEMORY_N) + '次注意到你——這次直接衝過來！';
    const CHECK_MSG = { run: '跑步聲傳開了——衛兵走過來查看。', move_high: K.COVER_MODE ? '腳步露了聲——衛兵走過來查看。' : '你動了——衛兵走過來查看。',
      loud: '那聲音引來了衛兵，他走過來查看。', susp: '衛兵覺得不對勁，走過來查看。' };
    const MOVE_HIGH_MSG = K.COVER_MODE ? '節奏最快的時候腳步露了聲——被發現了！' : '節奏最快的時候亂動——被發現了！';
    const emit = (type, a, extra) => g.out.push(extra ? Object.assign({ type, a }, extra) : { type, a });
    const hint = (key) => { if (!g.hintsShown[key]) { g.hintsShown[key] = true; emit('hint', HTXT[key]); } };
    /** 暗示階梯：key 這件事失敗一次（HINT_FAIL_GAP 秒內重複的只算一次）。第 2 次起發 hint {key, level}。 */
    function hintFail(key) {
      const H = g.hints[key]; if (!H) return;
      const t = g.time == null ? 0 : g.time;
      if (t - H.lastFail < K.HINT_FAIL_GAP) return;
      H.lastFail = t; H.fails++;
      H.level = Math.max(1, Math.min(3, H.fails));
      if (H.level >= 2) emit('hint', ladderText(key, H.level, LADDER), { key, level: H.level });
    }
    /** 暗示階梯：key 這件事成功一次 → 退回第 1 階。 */
    function hintOk(key) {
      const H = g.hints[key]; if (!H) return;
      H.fails = 0; H.level = 1; H.lastFail = -1e9;
    }
    /** 衛兵是否在玩家看不到的背後（3D 聽聲辨位）。 */
    function behindPlayer(q) {
      const pl = g.player, d = Math.hypot(q.x - pl.x, q.z - pl.z);
      if (d < 0.3 || d > K.HINT_BACK_R * 1.5) return false;
      const f = forward(pl.yaw || 0);
      return Math.acos(Math.max(-1, Math.min(1, ((q.x - pl.x) * f.x + (q.z - pl.z) * f.z) / d))) >= K.HINT_BACK_ANG;
    }

    function makePlayer(z) {
      const s = level.zones[z].start;
      return { x: s.x, z: s.z, y: s.y || 0, yaw: s.yaw || 0, breathing: false, breathT: 0, breathLock: false,
        hidden: false, moving: false, inBelly: !!level.zones[z].belly, running: false, crouching: false, runHeld: 0,
        runT: 0, pantUntil: -1e9, panting: false,
        slide: null, nextStrideT: -1e9, nextStrideBeat: null, lastStrideT: -1e9, dirHeld: false, inCircle: false };
    }
    function makeGuard(d) {
      const p0 = d.route[0], p1 = d.route[1] || p0;
      return {
        id: d.id, zone: d.zone, x: p0.x, z: p0.z,
        yaw: d.yaw != null ? d.yaw : yawTo(p1.x - p0.x, p1.z - p0.z),
        baseYaw: d.yaw, state: 'patrol', susp: 0, calm: 0, alertUntil: 0,
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
      g.visualAid = visualAidFor(z, g.visualAidMode, K);
      walking = false; lastStepT = -1e9; idleWatch = null;
      if (!quiet) { emit('msg', level.zones[z].name); emit('sfx', 'checkpoint'); }
      // 教學順序（M9）。一區只主動教一件新事；起疑、高度警覺、追殺、腳步太吵是「第一次發生時」才教（要馬上會解）。
      if (K.COVER_MODE) {
        // 殘響掩護版（總控 11/10 夜）：踩拍走 → 最響的一擊（衝刺、暗殺） → 被看見與屏息 → 警戒
        if (z === 1) hint(K.HORSE_MODE ? 'belly' : 'step');          // 木馬腹中：踩著鼓點走，腳步被蓋過（HORSE_MODE：連續踩準幾步才開門）
        if (z === 2) { blindHintGate = null; dashHintGate = null; }  // 神殿廣場：第一個掩護窗教最響的一擊，下一個教衝刺
        // 窄巷：最響的一擊暗殺；之後教被看見與屏息。MOVES_MODE：進區先教蹲走（那裡有水缸、貨堆），暗殺改到隔 HINT_GAP 秒後的掩護窗
        if (z === 3) { if (K.MOVES_MODE) { hint('crouch'); crouchHintAt = null; } else hint('takedown'); breathHintAt = null; }
        if (z === 4) hint('gate');
      } else {
        if (z === 1) { hint('breath'); blindHintGate = null; }
        if (z === 2) hint('dash');
        if (z === 3) hint('takedown');
        if (z === 4) hint('gate');
      }
    }

    g.player = makePlayer(Math.max(1, startZone));
    resetGuards(0);
    setActive();
    if (startZone > 0) enterZone(startZone, true);
    let huntLabPending = false;   // ?lab=hunt：第一個 play 幀開始追殺
    /** ?lab=hunt 的固定場景（第 12 節）：影子 x 26.5～30、z 23.5～27；玩家在它正南方 6 公尺，追兵再往南 6 公尺。 */
    function setupHuntLab() {
      const tx = 28.25, pz = 17.5;
      g.player.x = tx; g.player.z = pz; g.player.yaw = 0;
      for (const q of g.guards) {
        if (q.id === 'g2b') Object.assign(q, { x: tx, z: pz - 6, route: [{ x: tx, z: pz - 6 }], wp: 0, baseYaw: 0, yaw: 0, state: 'patrol', susp: 0 });
        else { q.state = 'down'; q.active = false; }
      }
      huntLabPending = true;
    }
    if (lab === 'hunt') setupHuntLab();
    /** ?lab=check 的固定場景：玩家在東南角影子（x 26.5～30、z 23.5～27）南方 2 公尺，衛兵再往南 6 公尺、面朝南。 */
    function setupCheckLab() {
      const tx = 28.25, pz = 21.5;
      g.player.x = tx; g.player.z = pz; g.player.yaw = 0;
      const back = yawTo(0, -1);
      for (const q of g.guards) {
        if (q.id === 'g2b') Object.assign(q, { x: tx, z: pz - 6, route: [{ x: tx, z: pz - 6 }], wp: 0, baseYaw: back, yaw: back, state: 'patrol', susp: 0, check: null, suspHist: [] });
        else { q.state = 'down'; q.active = false; }
      }
    }
    /** ?lab=walk 的場景：玩家在 (15, 20) 面朝東；衛兵 g2b 在 (22, 18)～(22, 22) 來回巡邏（路的正中間）。 */
    function setupWalkLab() {
      g.player.x = 15; g.player.z = 20; g.player.yaw = yawTo(1, 0);
      for (const q of g.guards) {
        if (q.id === 'g2b') Object.assign(q, { x: 22, z: 18, route: [{ x: 22, z: 18 }, { x: 22, z: 22 }], wp: 1, yaw: yawTo(0, 1), baseYaw: null, state: 'patrol', susp: 0, check: null, suspHist: [] });
        else { q.state = 'down'; q.active = false; }
      }
    }
    if (lab === 'walk') setupWalkLab();
    if (lab === 'check') {
      setupCheckLab();
      /** 試驗場按鈕：在 (x, z) 製造一次被聽到（巡邏中的衛兵過來查看）。 */
      g.labNotice = function (x, z) {
        const q = g.guards.find((o) => o.id === 'g2b');
        if (q && q.active && g.phase === 'play') enterCheck(q, g.time == null ? 0 : g.time, { x, z }, 'lab');
        return g;
      };
    }

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
    /** 線段 a→b 是否穿過矩形 r（slab 法）。 */
    function segHitsRect(ax, az, bx, bz, r) {
      let u0 = 0, u1 = 1;
      for (const [a, d, lo, hi] of [[ax, bx - ax, r.x0, r.x1], [az, bz - az, r.z0, r.z1]]) {
        if (Math.abs(d) < 1e-12) { if (a < lo || a > hi) return false; continue; }
        let s0 = (lo - a) / d, s1 = (hi - a) / d;
        if (s0 > s1) { const k = s0; s0 = s1; s1 = k; }
        u0 = Math.max(u0, s0); u1 = Math.min(u1, s1);
        if (u0 > u1) return false;
      }
      return true;
    }
    /** 搭配動作 A2：蹲著時，衛兵到玩家之間有矮掩體（low: true）就看不到。 */
    function lowCover(q, pl) {
      for (const w of level.walls) if (w.low && segHitsRect(q.x, q.z, pl.x, pl.z, w)) return true;
      return false;
    }
    /** 玩家站在哪一塊影子裡（名稱），不在影子裡 = null。木馬腹中算一塊。 */
    function shadowAt(pl) {
      if (pl.inBelly) return '木馬腹中';
      for (const s of level.shadows) if (inRect(pl.x, pl.z, s)) return s.name;
      return null;
    }
    /** 搭配動作第 8 節：久站影子時，暗示階梯往上推一階（至少第 2 階、有文字），提示這一區的下一步。只引導，不懲罰。 */
    function idleNudge() {
      const tgt = g.guards.find((q) => q.id === 'g3a');
      const key = g.zone === 1 ? 'step' : g.zone === 3 && tgt && tgt.active ? 'takedown' : g.zone === 4 ? 'latch' : 'blind';
      const H = g.hints[key]; if (!H) return;
      H.fails = Math.max(H.fails + 1, 2); H.level = Math.min(3, H.fails); H.lastFail = g.time;
      emit('hint', ladderText(key, H.level, LADDER), { key, level: H.level, idle: true });
    }
    /** 走法試驗場 P2 的圈半徑＝這名衛兵聽得到踩歪腳步的距離（規則裡同一個常數，不另訂 MANUAL_R）。 */
    function manualR(q) { return q.state === 'checking' || q.state === 'hunted' ? K.SEARCH_STEP_R : K.MANUAL_STEP_R; }
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
      // 第 13 節：開關開著時沒有起疑與安撫，改成過來查看你當時的位置（追殺中才注意到你的也一樣）
      if (K.MOVES_MODE) { enterCheck(q, t, { x: g.player.x, z: g.player.z }, g.hunted ? 'hunt' : 'susp'); return; }
      if (behindPlayer(q)) hintFail('listen');
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
    function makeAlerted(q, t, cause) {
      if (!q || q.state !== 'patrol') return;
      // 第 13 節：開關開著時沒有高度警覺，改成過來查看（聽到的是聲音的位置＝你當時的位置）
      if (K.MOVES_MODE) { enterCheck(q, t, { x: g.player.x, z: g.player.z }, g.hunted ? 'hunt' : cause); return; }
      if (cause === 'move_high') hintFail('blind');
      q.state = 'alerted';
      q.susp = K.ALERTED_SUSP;
      q.alertUntil = t + K.ALERTED_DURATION;
      q.lookAt = { x: g.player.x, z: g.player.z };
      emit('sfx', 'alerted', { id: q.id, cause: cause || null });
      // 11/10 複審：之前 msg 和 hint 都發 HTXT.alerted，同一句出現兩次。改成 msg 說「發生了什麼」（每次進入都發，
      // 只有腳步露聲才有；大聲沒有另外的訊息），hint 說「接下來怎麼辦」（第一次）。
      if (cause === 'move_high') emit('msg', MOVE_HIGH_MSG);
      if (cause === 'run') emit('msg', RUN_MSG);
      hint('alerted');
    }
    /**
     * 第 13 節：衛兵過來查看 pos（引起注意的位置）。轉向 CHECK_TURN 秒 → 朝 pos 最多走 CHECK_WALK 公尺（巡邏速度）
     * → 停 CHECK_LISTEN 秒左右轉頭聽 → 走回開始查看的位置，回到巡邏（CALM_GRACE 秒內不累積疑心）。
     * 同一名衛兵 CALM_MEMORY 秒內第 CALM_MEMORY_N 次被注意到：不查看，直接追殺。
     * cause：susp（疑心滿）｜move_high｜run｜loud｜call（追殺開始的喊聲）｜hunt（追殺中才注意到）｜lab（試驗場按鈕）。
     */
    function enterCheck(q, t, pos, cause) {
      if (!q || q.state !== 'patrol') return;
      q.suspHist = (q.suspHist || []).filter((x) => t - x < K.CALM_MEMORY);
      if (cause !== 'call') q.suspHist.push(t);   // 第 15.3 節：喊聲叫來的不算「同一人第三次」
      if (q.suspHist.length >= K.CALM_MEMORY_N) {
        q.suspHist = [];
        startHunt(q, cause === 'run' || cause === 'loud' || cause === 'move_high' ? cause : 'seen', CHECK_AGAIN_MSG);
        return;
      }
      const dx = pos.x - q.x, dz = pos.z - q.z, d = Math.hypot(dx, dz);
      // 第 17.2 節：最多走 CHECK_WALK，而且離目標 CHECK_STOP_R 就停（不走到你身上）
      const k = cause === 'call' && K.CALL_LOOK_ONLY ? 0 : d > 1e-6 ? Math.min(K.CHECK_WALK, Math.max(0, d - K.CHECK_STOP_R)) / d : 0;
      const walkTo = { x: q.x + dx * k, z: q.z + dz * k };
      q.state = 'checking'; q.susp = K.CHECK_SUSP0; q.calm = 0;
      q.check = { target: { x: pos.x, z: pos.z }, walkTo, home: { x: q.x, z: q.z }, phase: 'turn', from: t, until: t + K.CHECK_TURN,
        yaw0: q.yaw, yaw1: d > 1e-6 ? yawTo(dx, dz) : q.yaw, cause, stuckT: 0, susp: K.CHECK_SUSP0, breathAt: -1e9 };
      q.lookAt = { x: pos.x, z: pos.z };
      // check_start 就是轉向開始的那一刻（聲音：短促的疑問聲）；susp＝疑心起點
      emit('sfx', 'check_start', { id: q.id, x: pos.x, z: pos.z, walkTo: { x: walkTo.x, z: walkTo.z }, cause, susp: K.CHECK_SUSP0 });
      if (CHECK_MSG[cause]) emit('msg', CHECK_MSG[cause]);
      hint('check');
    }
    /** 第 15 節：查看中聽到聲音 → 改朝聲音的位置走（從他現在的位置最多 CHECK_WALK 公尺；轉向不再判定一次，直接走）。 */
    function retargetCheck(q, t, pos, why) {
      const C = q.check;
      const dx = pos.x - q.x, dz = pos.z - q.z, d = Math.hypot(dx, dz);
      const k = d > 1e-6 ? Math.min(K.CHECK_WALK, Math.max(0, d - K.CHECK_STOP_R)) / d : 0;   // 改目標時最近也只到 CHECK_STOP_R
      C.target = { x: pos.x, z: pos.z }; C.walkTo = { x: q.x + dx * k, z: q.z + dz * k };
      if (C.phase !== 'turn') { C.phase = 'walk'; C.stuckT = 0; }
      q.lookAt = { x: pos.x, z: pos.z };
      if (why !== 'breath' || t - C.breathAt > 1) emit('sfx', 'check_retarget', { id: q.id, x: pos.x, z: pos.z, why, susp: C.susp });
      if (why === 'breath') C.breathAt = t;
    }
    /** cause：CAUSES 的代號；reason：當下的訊息。 */
    function startHunt(q, cause, reason) {
      cause = cause || 'seen';
      // 暗示階梯：亂動 → 驟降；安撫失敗 → 安撫；被背後的衛兵發現 → 聽聲辨位（大聲的喘氣、門閂在發聲的地方就算過了）
      if (cause === 'move_high') hintFail('blind');
      else if (/^calm_/.test(cause)) hintFail('calm');
      if (q && behindPlayer(q)) hintFail('listen');
      if (g.player.inBelly) { fail(CZ[cause] + '——你在木馬裡被發現了。', 'belly_' + cause); return; }
      if (!g.hunted) huntCause = cause;
      const pl = g.player;
      const wasHunted = g.hunted;
      const tNow = g.time;
      for (const o of g.guards) {
        if (!o.active) continue;
        // 第 12 節：追殺已經開始後（開關開），只有發現你的這一名加入；被喊聲叫到的高度警覺衛兵要再犯才加入
        const join = o === q || (!(K.MOVES_MODE && wasHunted) && (o.state === 'suspicious' || o.state === 'alerted' || o.state === 'checking'));
        if (join) {
          o.state = 'hunted'; o.susp = 1; o.lastKnown = { x: pl.x, z: pl.z }; o.calm = 0;
          o.knownAt = tNow; o.search = null; o.stuckT = 0; o.check = null;
        }
      }
      if (K.MOVES_MODE) g.huntKnownAt = tNow;
      // 第 17.2 節：追殺一開始先喊一聲，HUNT_START_DELAY 秒內追兵站著不動（玩家的反應時間）
      if (K.MOVES_MODE && !wasHunted) g.huntStartUntil = tNow + K.HUNT_START_DELAY;
      clearPanic();
      g.hunted = true; g.stillT = 0; g.huntSteps = 0; g.huntSlowUntil = 0; g.huntIdleT = 0;
      g.cycle.nextFake = false;   // 追殺中不要假驟降（擺脫要靠真的盲區判斷時機）
      if (!wasHunted) { emit('sfx', 'hunt'); if (reason) emit('msg', reason); }
      // 第 12 節第 7 點：追殺開始時發現你的那一名喊一聲；HUNT_CALL_R 內還在巡邏的衛兵進高度警覺、轉向喊聲
      if (K.MOVES_MODE && !wasHunted) {
        let caller = q && q.state === 'hunted' ? q : null;
        if (!caller) for (const o of g.guards) if (o.active && o.state === 'hunted' && (!caller || dist2(o, pl) < dist2(caller, pl))) caller = o;
        if (caller) {
          const called = [];
          for (const o of g.guards) {
            if (!o.active || o.state !== 'patrol' || Math.hypot(o.x - caller.x, o.z - caller.z) > K.HUNT_CALL_R) continue;
            enterCheck(o, tNow, { x: caller.x, z: caller.z }, 'call');   // 第 13 節：被喊聲驚動的過來查看喊聲的位置
            if (o.state === 'checking') called.push(o.id);
          }
          emit('sfx', 'hunt_call', { x: caller.x, z: caller.z, id: caller.id, called, delay: K.HUNT_START_DELAY });   // delay：追兵站著不動的空檔（喊聲、火把猛地變紅）
        }
      }
      hint('hunted');
    }
    function endHunt() {
      for (const o of g.guards) if (o.state === 'hunted') { o.state = 'patrol'; o.susp = 0; o.grace = K.CALM_GRACE; o.lastKnown = null; o.search = null; }
      g.hunted = false; g.stillT = 0; g.huntSteps = 0; g.huntSlowUntil = 0; g.huntIdleT = 0; huntCause = null; g.huntStartUntil = null;
      emit('sfx', 'escape'); emit('msg', '追兵走遠了。');
    }
    /**
     * 第 12 節第 1 點：追兵到了消失點 v 之後的搜索路線（固定）：v → 影子中心 → 影子「最遠端」。
     * 影子：包含 v 的那一塊，沒有就取離 v 最近的一塊（矩形距離 3 公尺內）；都沒有就只在 v 環顧。
     * 最遠端：從 v 經過中心的射線穿出影子的那一點（往內縮 0.3 公尺）；v 就在中心時取離 v 最遠的角。
     */
    function searchRoute(v) {
      let best = null, bd = 1e9;
      for (const s of level.shadows) {
        const cx = Math.max(s.x0, Math.min(v.x, s.x1)), cz = Math.max(s.z0, Math.min(v.z, s.z1));
        const d = Math.hypot(cx - v.x, cz - v.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best || bd > 3) return [{ x: v.x, z: v.z }];
      const ins = 0.3, x0 = best.x0 + ins, x1 = best.x1 - ins, z0 = best.z0 + ins, z1 = best.z1 - ins;
      const c = { x: (best.x0 + best.x1) / 2, z: (best.z0 + best.z1) / 2 };
      let dx = c.x - v.x, dz = c.z - v.z;
      const l = Math.hypot(dx, dz);
      let far;
      if (l < 0.1) {
        far = null; let fd = -1;
        for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) { const d = Math.hypot(x - v.x, z - v.z); if (d > fd) { fd = d; far = { x, z }; } }
      } else {
        dx /= l; dz /= l;
        let sMax = Infinity;
        if (dx > 1e-9) sMax = Math.min(sMax, (x1 - c.x) / dx); else if (dx < -1e-9) sMax = Math.min(sMax, (x0 - c.x) / dx);
        if (dz > 1e-9) sMax = Math.min(sMax, (z1 - c.z) / dz); else if (dz < -1e-9) sMax = Math.min(sMax, (z0 - c.z) / dz);
        sMax = Math.max(0, sMax);
        far = { x: c.x + dx * sMax, z: c.z + dz * sMax };
      }
      return [{ x: v.x, z: v.z }, c, far];
    }

    // ----- 每幀 -----
    function normInput(i) {
      i = i || {};
      return {
        yaw: Number.isFinite(i.yaw) ? i.yaw : null,
        mx: +i.mx || 0, mz: +i.mz || 0,
        breath: !!i.breath, dash: !!i.dash, takedown: !!i.takedown, calm: !!i.calm,
        calmAt: Number.isFinite(i.calmAt) ? i.calmAt : null,
        actAt: Number.isFinite(i.actAt) ? i.actAt : null,   // 按鍵當下的音訊時間（衝刺、暗殺、門閂、安撫用）
        interact: !!i.interact, start: !!i.start,
        run: !!i.run, crouch: !!i.crouch   // 搭配動作：Shift、C 是否按住（dash 仍是「按下那一刻」）
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
    /** 假驟降：相位跳回 0 時抽下一次交接（這一次是假的就不抽，不會連續）。 */
    function rollFake() {
      const c = g.cycle;
      c.fake = K.COVER_MODE ? false : c.nextFake;   // 殘響掩護：每次交接都無縫，沒有「假」可言
      c.nextFake = false;
      if (K.COVER_MODE || !K.FAKE || c.fake || g.phase !== 'play' || g.zone < K.FAKE_FROM_ZONE || g.hunted || g.panic.active) return;
      c.nextFake = rng() < 1 / Math.max(1, K.FAKE_EVERY - 1);
    }
    /** 首幀或重來：T 直接等於目標，相位照 t0 對齊。 */
    function snapClock(t) {
      const c = g.cycle;
      c.fake = false; c.nextFake = false;
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
        if (w > 0) { c.start = t - c.p * c.T; c.nextFake = false; rollFake(); }
        return;
      }
      let ts = t - el;
      while (el > 1e-12) {
        const h = Math.min(el, K.MAX_DT);
        const maxd = c.T * K.CYCLE_RATE * h;
        c.T += Math.max(-maxd, Math.min(maxd, c.targetT - c.T));
        const np = c.p + h / c.T;
        if (np >= 1) { c.start = ts + (1 - c.p) * c.T; c.index++; c.p = np - 1; rollFake(); }
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
        c.blind = !c.fake && t >= c.start - 1e-9 && t - c.start < BL;
        c.blindId = 'c' + c.index;
        if (c.blind) { c.blindFrom = c.start; c.blindTo = c.start + BL; }
        else {   // 下一段（預估）；下一次交接是假驟降就再晚一個循環（假驟降不會連續）
          c.blindFrom = t + (1 - c.p) * c.T + (c.nextFake ? c.T : 0); c.blindTo = c.blindFrom + BL;
        }
      }
      c.desync = c.p > K.DESYNC_P;
      c.anchor = { t, p: c.p, T: c.T, index: c.index, start: c.start };
      g.danger = dangerOf(g);
      g.fire = fireBrightness(g);
      g.visualAid = visualAidFor(g.zone, g.visualAidMode, K);
      refreshBass(t);
    }

    g.step = function (t, input) {
      const inp = normInput(input);
      const dt = last == null ? 0 : Math.max(0, Math.min(K.MAX_DT, t - last));
      last = t; g.time = t;
      updateClock(t);
      if (g.phase === 'intro') { if (inp.start) g.start(); return g; }
      if (g.phase !== 'play') {
        // C3 結尾鏡頭（HORSE_MODE，第 3 節）：城門開了（phase 已是 win、通關時間算到開門那一刻），循環時鐘照走；
        // 下一個掩護窗一開始，發 horse_signal {x, z}（木馬中心），畫面趁這一擊演同伴從暗門落地。畫面要在 win 之後繼續呼叫 step。
        if (K.HORSE_MODE && g.phase === 'win' && g.gate.open && !horseSignalSent) {
          const b = !!g.cycle.blind;
          if (b && !horsePrevBlind) {
            horseSignalSent = true;
            const h = level.horse;
            emit('sfx', 'horse_signal', { x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2 });
          }
          horsePrevBlind = b;
        }
        g.alarm = g.phase === 'fail' ? 1 : 0;
        return g;
      }

      const pl = g.player, c = g.cycle, p = c.p, blind = c.blind;
      if (huntLabPending) {
        huntLabPending = false;
        const hq = g.guards.find((q) => q.id === 'g2b');
        if (hq && hq.active) startHunt(hq, 'seen', '追兵從背後衝過來了！');
      }
      if (inp.yaw != null) pl.yaw = inp.yaw;
      // 按鍵的判定時間：按鍵當下的音訊時間（畫面層給 actAt），沒有才用幀時間；不會晚於本幀
      const actT = inp.actAt != null ? Math.min(inp.actAt, t) : t;
      /** 時間 tt 是否算盲區：真盲區本身，或真盲區開始前 BLIND_LEAD_GRACE 秒內（假驟降前 blindFrom 在再下一輪，自然沒有寬限）。 */
      const blindLike = (tt) => {
        if (c.alertBlind) return alertBlindAt(tt, g.bass.anchor, K.BASS_PERIOD, K).blind;
        if (!c.fake && tt >= c.start - 1e-9 && tt - c.start < K.BLIND_LEN) return true;
        return !blind && tt < c.blindFrom && c.blindFrom - tt <= K.BLIND_LEAD_GRACE + 1e-9;
      };
      const lead = !blind && !c.alertBlind && blindLike(t);   // 本幀在盲區前沿的寬限裡（移動照盲區規則）
      g.alerted = false;
      /** 時間 tt 的相位（本幀外推，門閂用）。 */
      const pAt = (tt) => Math.max(0, Math.min(1, p + (tt - t) / c.T));
      // 盲區預告：循環最後 PRE_BLIND 秒發一次
      // 假驟降之前不預告（聽得出差別：沒有預告音就不是真的斷）
      if (!c.alertBlind && !c.nextFake && (1 - p) * c.T <= K.PRE_BLIND + 1e-9 && preBlindCycle !== c.index) {
        preBlindCycle = c.index; emit('sfx', 'pre_blind');
      }
      let loud = false;

      // 第 12 節第 5 點：跑完會喘（RUN_PANT_DUR 秒內不能屏息，呼吸聲傳 RUN_PANT_MUL 倍遠）
      const panting = K.MOVES_MODE && t < pl.pantUntil - 1e-9;
      if (pl.panting && !panting) emit('sfx', 'pant_end', { x: pl.x, z: pl.z });
      pl.panting = panting;
      // 跑超過 RUN_PANT_AFTER 之後，停下那一幀就算喘（不能趁那一幀屏息）
      const noBreath = panting || (K.MOVES_MODE && pl.running && pl.runT > K.RUN_PANT_AFTER + 1e-9);
      // 屏息
      if (inp.breath && !pl.breathLock && !noBreath) {
        if (!pl.breathing) { emit('sfx', 'breath_in'); pl.breathSaved = false; }
        pl.breathing = true;
        pl.breathT += dt;
        // 屏息真的救了你：節奏最快時，有衛兵就在感知範圍內
        if (p > K.HIGH_P && !blind) for (const q of g.guards) {
          if (q.active && dist3(q, pl) <= radiusAt(p, q.state !== 'patrol', K)) { pl.breathSaved = true; break; }
        }
        if (pl.breathT >= K.BREATH_MAX) {
          pl.breathT = K.BREATH_MAX; pl.breathing = false; pl.breathLock = true; loud = true; pl.breathSaved = false;
          emit('sfx', 'gasp'); hint('gasp'); hintFail('breath');
        }
      } else {
        if (pl.breathing) { emit('sfx', 'breath_out'); if (pl.breathSaved) hintOk('breath'); pl.breathSaved = false; }
        pl.breathing = false;
        pl.breathT = Math.max(0, pl.breathT - K.BREATH_RECOVER * dt);
        if (!inp.breath) pl.breathLock = false;
      }

      // 走法試驗場 P2（STEP_MODE 'manual'）：在任何一名衛兵「聽得到踩歪腳步」的圈裡（巡邏中 STEP_R；查看、追殺中 SEARCH_STEP_R）
      // 每按一下方向鍵才走一步、不能跑；圈外照 P1。進圈、出圈各發一次 manual_on／manual_off。
      const strideMode = K.STEP_MODE === 'stride' || K.STEP_MODE === 'manual';
      const inCircle = K.STEP_MODE === 'manual' && g.guards.some((q) => q.active && dist2(q, pl) <= manualR(q));
      if (inCircle !== pl.inCircle) emit('sfx', inCircle ? 'manual_on' : 'manual_off', { x: pl.x, z: pl.z });
      pl.inCircle = inCircle;
      // 搭配動作（MOVES_MODE）：按住 Shift 超過 RUN_HOLD 而且有方向鍵 = 跑（屏息時不能跑）；按住 C = 蹲（跑的時候站起來）
      let running = false, crouching = false;
      if (K.MOVES_MODE) {
        pl.runHeld = inp.run && !pl.breathing ? (pl.runHeld || 0) + dt : 0;
        running = pl.runHeld >= K.RUN_HOLD - 1e-9 && Math.hypot(inp.mx, inp.mz) > 1e-6 && !inCircle;
        crouching = inp.crouch && !running;
        if (running !== !!pl.running) emit('sfx', running ? 'run_start' : 'run_stop', { x: pl.x, z: pl.z });
        if (crouching !== !!pl.crouching) emit('sfx', crouching ? 'crouch_on' : 'crouch_off', { x: pl.x, z: pl.z });
        pl.running = running; pl.crouching = crouching;
        if (running) pl.runT += dt;
        else if (pl.runT > 0) {
          if (pl.runT > K.RUN_PANT_AFTER + 1e-9) {
            pl.pantUntil = t + K.RUN_PANT_DUR; pl.panting = true;
            emit('sfx', 'pant_start', { x: pl.x, z: pl.z, dur: K.RUN_PANT_DUR, ran: pl.runT });
          }
          pl.runT = 0;
        }
      }
      const speed = running ? K.WALK * K.RUN_SPEED_MUL : crouching ? K.WALK * K.CROUCH_SPEED_MUL : K.WALK;
      const stepWin = crouching ? K.CROUCH_STEP_WIN : undefined;
      const stepX = (o) => (crouching ? Object.assign(o, { crouch: true }) : o);   // 蹲走的腳步事件多帶 crouch: true

      // 移動與衝刺（屏息時不能動）
      const ox = pl.x, oz = pl.z;
      let walked = false;
      let strideStepNow = null;   // 走法試驗場：這一幀踏出的一步 {masked, beatT, start, manual}
      if (!pl.breathing) {
        let mx = inp.mx, mz = inp.mz;
        const len = Math.hypot(mx, mz);
        if (len > 1) { mx /= len; mz /= len; }
        if (strideMode && !running) {
          // 第 11.4 節 P1：一步 STRIDE_LEN、花 STRIDE_SLIDE 秒滑過去；按住方向鍵時下一步落在下一個聽得到的鼓點（nextStepAt，最密 0.27 秒）。
          // 站定後的第一步、以及 P2 圈內每一步（新按下方向鍵）都照起步判定（stepMasked，蹲著寬度 CROUCH_STEP_WIN），判定時間用按鍵當下（actAt）。
          const pressed = len > 1e-6, edge = pressed && !pl.dirHeld;
          pl.dirHeld = pressed;
          const bx = pl.x, bz = pl.z;
          if (pl.slide) {
            const S = pl.slide, k = Math.min(1, (t - S.t0) / K.STRIDE_SLIDE);
            moveBody(pl, S.dx * (k - S.k), S.dz * (k - S.k)); S.k = k;
            if (k >= 1 - 1e-9) pl.slide = null;
          } else if (pressed) {
            const rested = t - pl.lastStrideT > K.STEP_GAP * K.STEP_GAP_MAX + 1e-9;
            const go = inCircle ? edge : (rested || t >= pl.nextStrideT - 1e-9);
            if (go) {
              const L = K.STRIDE_LEN * (crouching ? K.CROUCH_SPEED_MUL : 1);
              const judgeT = inCircle ? actT : t;
              const start = inCircle || rested;
              const masked = start ? stepMasked(judgeT, g, stepWin) : pl.nextStrideBeat != null;
              strideStepNow = { masked, beatT: masked ? (start ? nearestMaskBeat(judgeT, g, stepWin) : pl.nextStrideBeat) : null, start, manual: inCircle };
              pl.slide = { dx: mx * L, dz: mz * L, t0: t, k: 0 };
              pl.lastStrideT = t;
              const nx = nextStepAt(t, g);
              pl.nextStrideT = nx.t; pl.nextStrideBeat = nx.beatT;
            }
          }
          walked = Math.hypot(pl.x - bx, pl.z - bz) > 1e-6;
        } else if (len > 1e-6) {
          const bx = pl.x, bz = pl.z;
          moveBody(pl, mx * speed * dt, mz * speed * dt);
          walked = Math.hypot(pl.x - bx, pl.z - bz) > 1e-6;
        }
        if (inp.dash) {
          // 衝刺：按鍵當下在盲區（或盲區前沿寬限）才算；寬限裡衝的算下一段盲區那一次
          const dashBlind = blindLike(actT);
          const dashId = blind || c.alertBlind || !dashBlind ? c.blindId : 'c' + (c.index + 1);
          if (dashBlind && dashCycle !== dashId) {
            dashCycle = dashId;
            let dx = mx, dz = mz;
            const l = Math.hypot(dx, dz);
            if (l < 1e-6) { const f = forward(pl.yaw); dx = f.x; dz = f.z; } else { dx /= l; dz /= l; }
            const dashDist = g.hunted ? K.DASH_HUNT : K.DASH;
            const n = Math.ceil(dashDist / 0.1);
            for (let k = 0; k < n; k++) moveBody(pl, dx * dashDist / n, dz * dashDist / n);
            emit('sfx', 'dash', { hunt: !!g.hunted }); hintOk('blind');
          } else if (!dashBlind) hint('dash');
        }
      }
      const moved = Math.hypot(pl.x - ox, pl.z - oz) > 1e-4;
      pl.moving = moved;
      pl.hidden = isHidden(pl);

      // 腳步（第 8.3 節，腳步跟著鼓走）：起步那一刻先落一步，照 stepMasked 判（在拍上安靜、離拍出聲）；
      // 之後每一步對齊 nextStepAt 預測的下一個可聽拍（被蓋過）；STEP_GAP × STEP_GAP_MAX 內沒拍就照時間落一步（出聲）。
      // 事件 step_masked／step_loud 帶 {x, z, beatT}，beatT = 對齊到的拍時間（沒有 = null）。
      let stepLoud = false;
      let runLoud = false;   // 搭配動作 A1：這一幀有一步掩護窗外的跑步（RUN_R 內的衛兵進高度警覺）
      if (walked && running) {
        // 跑：每 RUN_STEP_GAP 秒一步；掩護窗（含前沿寬限）內的步不算出聲，其餘都算。不走一般腳步（不發 step_masked／step_loud）
        if (t - runStepT >= K.RUN_STEP_GAP - 1e-9) {
          runStepT = t; lastStepT = t;
          const masked = !!(blind || lead);
          runLoud = !masked;
          emit('sfx', 'run_step', { x: pl.x, z: pl.z, masked });
        }
      } else if (walked || strideStepNow) {
        let stepNow = strideMode ? strideStepNow : null;   // {masked, beatT}；走法試驗場的步在上面移動時就決定了
        if (strideMode) { /* 照上面 */ }
        else if (!walking && t - lastStepT >= K.STEP_GAP * K.STEP_GAP_MIN - 1e-9) {
          const masked = stepMasked(t, g, stepWin);
          stepNow = { masked, beatT: masked ? nearestMaskBeat(t, g, stepWin) : null, start: true };   // 起步：站定後踏出的第一步
        } else {
          const nx = nextStepAt(lastStepT, g);
          if (t >= nx.t - 1e-9) stepNow = nx.beatT != null ? { masked: true, beatT: nx.beatT } : { masked: stepMasked(t, g, stepWin), beatT: null };
        }
        if (stepNow) {
          lastStepT = t;
          stepLoud = !stepNow.masked;
          if (K.HORSE_MODE && pl.inBelly) {
            // 木馬腹中練習（第 1.1 節）：零失敗，衛兵什麼都聽不到。只有「起步」算數：
            //   起步踩準亮一格、帶 {n, need, start: true}；起步踩歪發 belly_hush、扣 BELLY_MISS_COST 格（最少 0）；
            //   接著連續走的後續步不亮不扣，帶 start: false，出聲的照一般腳步發 step_loud。
            const B = g.belly, start = !!stepNow.start;
            stepLoud = false;
            if (stepNow.masked) {
              if (start && !B.ready) B.n = Math.min(B.need, B.n + 1);
              emit('sfx', 'step_masked', stepX({ x: pl.x, z: pl.z, beatT: stepNow.beatT, n: B.n, need: B.need, start }));
              if (start && !B.ready && B.n >= B.need) { B.ready = true; emit('sfx', 'belly_ready'); }
            } else if (start) {
              if (!B.ready) B.n = Math.max(0, B.n - K.BELLY_MISS_COST);
              emit('sfx', 'belly_hush', stepX({ x: pl.x, z: pl.z, n: B.n, need: B.need, cost: K.BELLY_MISS_COST }));
            } else {
              emit('sfx', 'step_loud', stepX({ x: pl.x, z: pl.z, beatT: null, start: false }));
            }
          } else
          emit('sfx', stepNow.masked ? 'step_masked' : 'step_loud', stepX(strideMode ? { x: pl.x, z: pl.z, beatT: stepNow.beatT, stride: true, manual: !!stepNow.manual } : { x: pl.x, z: pl.z, beatT: stepNow.beatT }));
          if (g.hunted && !K.MOVES_MODE) {   // 第 16.2 節：開關開著時拿掉「連續踩準三步讓追兵減速」（走路是自動對齊鼓點的，不算玩家的技巧）
            if (stepNow.masked) {
              g.huntSteps++;
              g.huntIdleT = 0;
              emit('sfx', 'hunt_step', { index: g.huntSteps });
              if (g.huntSteps >= K.HUNT_STEP_ESCAPE) {
                g.huntSlowUntil = Math.max(g.huntSlowUntil, t + K.HUNT_SLOW_DUR);
                g.huntSteps = 0;
                emit('sfx', 'hunt_slip');
              }
            } else g.huntSteps = 0;
          }
          if (stepNow.masked && g.guards.some((q) => q.active && dist2(q, pl) < K.STEP_R * 2)) hintOk('step');
        }
      }
      walking = walked;
      if (g.hunted) {
        if (walked) g.huntIdleT = 0;
        else {
          g.huntIdleT += dt;
          if (g.huntIdleT > K.BASS_PERIOD) g.huntSteps = 0;
        }
      }
      // 暗示階梯的成功：盲區裡在衛兵附近走動（驟降）；在火光圈外、但就在旁邊走（感知範圍）；假驟降時沒動
      if (walked && g.guards.some((q) => q.active && dist3(q, pl) <= radiusAt(1, false, K))) {
        if (blind) hintOk('blind');
        else {
          let inR = false, nearR = false;
          for (const q of g.guards) {
            if (!q.active) continue;
            const r = radiusAt(p, q.state !== 'patrol', K), d = dist3(q, pl);
            if (d <= r) inR = true; else if (d <= 2 * r) nearR = true;
          }
          if (inR) radiusOkT = 0;
          else if (nearR && (radiusOkT += dt) >= 1.5) { radiusOkT = 0; hintOk('radius'); }
        }
      }
      if (!c.alertBlind && c.fake) {
        if (!fakeWatch || fakeWatch.index !== c.index) fakeWatch = { index: c.index, moved: false, done: false };
        if (t - c.start < K.BLIND_LEN) { if (moved) fakeWatch.moved = true; }
        else if (!fakeWatch.done) {
          fakeWatch.done = true;
          if (!fakeWatch.moved && g.guards.some((q) => q.active && dist3(q, pl) <= radiusAt(1, false, K))) hintOk('fake');
        }
      }

      // 致命一擊
      // 站在門閂旁時，E 只算推門閂，不算暗殺
      const atLatch = g.zone === 4 && !g.gate.open && level.gate && Math.hypot(pl.x - level.gate.latch.x, pl.z - level.gate.latch.z) <= K.LATCH_R;
      if (inp.takedown && !pl.inBelly && !atLatch && !crouching) {   // 蹲著不能暗殺（要站起來）
        let best = null, bd = Infinity;
        for (const q of g.guards) {
          if (!q.active) continue;
          const d = dist2(q, pl);
          if (d <= K.TAKEDOWN_R && d < bd) { best = q; bd = d; }
        }
        if (best) {
          const f = forward(best.yaw);
          const behind = f.x * (pl.x - best.x) + f.z * (pl.z - best.z) < 0;
          if (blindLike(actT) && behind) {   // 按鍵當下在盲區（含前沿寬限）
            best.state = 'down'; best.active = false; best.susp = 0;
            emit('sfx', 'takedown'); hintOk('takedown');
          } else {
            emit('sfx', 'takedown_fail'); hintFail('takedown');
            if (best.state === 'patrol') makeSuspicious(best, t);
          }
        }
      }

      // 城門門閂（按住 interact）
      g.gate.pushing = false;
      if (g.zone === 4 && inp.interact && !g.gate.open && !crouching) {   // 蹲著推不了門閂
        const L = level.gate.latch;
        if (Math.hypot(pl.x - L.x, pl.z - L.z) <= K.LATCH_R) {
          if (pAt(actT) <= K.GATE_LOW_P) {   // 按住的判定用按鍵當下的相位
            g.gate.pushing = true;
            const before = g.gate.progress;
            g.gate.progress = Math.min(K.GATE_NEED, g.gate.progress + dt);
            // 每推進 1/8 奏一個音（index 0～7，推滿正好第 8 個）
            const s0 = Math.floor(before / K.GATE_NEED * 8 + 1e-9), s1 = Math.floor(g.gate.progress / K.GATE_NEED * 8 + 1e-9);
            for (let i = s0; i < Math.min(8, s1); i++) { emit('sfx', 'latch_step', { index: i }); hintOk('latch'); }
          } else if (t - latchNoiseAt >= K.LATCH_NOISE_GAP) {
            latchNoiseAt = t; loud = true; emit('sfx', 'latch'); hintFail('latch');
          }
        }
      }

      // 安撫（機制 B）
      // 判定時間：按鍵當下的音訊時間（calmAt，沒有就 actAt），再沒有才用幀時間；比起疑還早的按鍵不算
      const calmT = inp.calmAt != null ? Math.min(inp.calmAt, t) : actT;
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
            emit('sfx', 'calm_done'); hintOk('calm'); emit('msg', '衛兵搖搖頭，走回原路。');
          }
        }
      }
      if (g.phase !== 'play') return g;
      if (g.panic.active && t - g.panic.start > K.CALM_TIMEOUT) startHunt(null, 'calm_slow', '安撫得太慢——衛兵大喊有人！');
      if (g.phase !== 'play') return g;

      // 木馬腹中練習：達成之後的下一個掩護窗一開始，同伴趁那一擊拉開木栓（玩家什麼都不用按）
      if (K.HORSE_MODE && g.zone === 1 && g.belly.ready && !g.belly.open && blind && !horsePrevBlind) {
        g.belly.open = true;
        emit('sfx', 'trapdoor_open');
      }
      horsePrevBlind = blind;
      // 盲區提示：不和進區提示同時出，等到進區之後的下一個循環、而且隔 HINT_GAP 秒以上。
      // 舊版在區 1（屏息之後）；殘響掩護版在區 2（踩拍走之後），出過之後下一個掩護窗再教衝刺。
      if (g.zone === (K.COVER_MODE ? 2 : 1)) {
        if (!blindHintGate) blindHintGate = { i: c.index, t };
        if (blind && c.index > blindHintGate.i && t - blindHintGate.t >= K.HINT_GAP) {
          if (!g.hintsShown.blind) { hint('blind'); dashHintGate = c.index; }
          else if (K.COVER_MODE && dashHintGate != null && c.index > dashHintGate) hint('dash');
        }
      }
      // 殘響掩護版：窄巷的暗殺提示之後隔 HINT_GAP 秒，等節奏快起來（被看見最危險的時候）才教屏息
      if (K.COVER_MODE && g.zone === 3) {
        // MOVES_MODE：進區教了蹲走，隔 HINT_GAP 秒後的掩護窗（暗殺有效的時候）才教暗殺；屏息再隔 HINT_GAP 秒
        if (K.MOVES_MODE && !g.hintsShown.takedown) {
          if (crouchHintAt == null) crouchHintAt = t;
          if (blind && !c.alertBlind && t - crouchHintAt >= K.HINT_GAP) hint('takedown');   // 真的掩護窗（起疑時的低音空檔另有提示）
        }
        if (g.hintsShown.takedown) {
          if (breathHintAt == null) breathHintAt = t;
          if (!blind && p > K.HIGH_P && t - breathHintAt >= K.HINT_GAP) hint('breath');
        }
      }
      if (c.alertBlind && blind && g.panic.count > 0) hint('alertBlind');
      if (!c.alertBlind && c.fake && t - c.start < K.BLIND_LEN) hint('fake');   // 第一次假驟降時說明

      // 感知
      for (const q of g.guards) {
        if (!q.active || g.phase !== 'play') continue;
        if (q.grace > 0) q.grace = Math.max(0, q.grace - dt);
        if (q.state === 'alerted' && t >= q.alertUntil) {
          q.state = 'patrol'; q.susp = 0; q.grace = K.CALM_GRACE; q.lookAt = null;
          emit('sfx', 'alert_over');
          continue;
        }
        if (blind) continue; // 盲區：感知 = 0
        if (K.HORSE_MODE && pl.inBelly) continue;   // 木馬腹中練習：衛兵什麼都察覺不到（零失敗）
        const alert = q.state === 'suspicious' || q.state === 'hunted' || q.state === 'alerted' || q.state === 'checking';
        const r = radiusAt(p, alert, K);
        const d = dist3(q, pl);
        const f = forward(q.yaw);
        const toward = Math.atan2(pl.x - q.x, pl.z - q.z); // 與 forward 同一參考：比較方向向量夾角
        const fa = Math.atan2(f.x, f.z);
        const inFov = d < 1e-6 || angDiff(toward, fa) <= K.FOV;
        const seen = !pl.hidden && d <= r && inFov && !(crouching && lowCover(q, pl));   // 蹲著時矮掩體擋視線
        const mv = (moved || !!strideStepNow) && !lead;   // 走法試驗場：落步那一幀還沒位移，也算在動   // 盲區前沿的寬限：移動照盲區規則，不算 move_high、不累積疑心
        // 4A 的 M7 只改 R_BASE／R_GAIN，不做感知分級：移動聲、呼吸聲仍以整個 r(p) 判定（分級是 4B 的事）
        // 殘響掩護（COVER_MODE）第 2 條（設計席 7.1：p > COVER_EAR_P，預設全程）：耳朵可以用鼓聲騙——
        // 踩在可聽拍上的腳步（step_masked）聽不見；出聲的腳步（step_loud）才算，後果和舊版一樣：
        // p ≤ HIGH_P 時是 STEP_R 內加 SUSP_STEP（heardStep 那一行），p > HIGH_P 時 r(p) 內進高度警覺。被看見（seen）照舊。
        const coverEar = !!K.COVER_MODE && p > K.COVER_EAR_P;
        const hearR = crouching ? Math.min(r, K.CROUCH_R) : r;   // 蹲走：離拍的聲音只傳 CROUCH_R
        // 第 16.4 節：STEP_MODE 'manual' 時踩歪的腳步一律固定半徑（巡邏 MANUAL_STEP_R、查看／追殺 SEARCH_STEP_R 在各自的分支），
        // 快的時候不再是整個 r(p) 內都聽得到；後果照舊（快的時候進查看、慢的時候加疑心）
        const manualEar = K.STEP_MODE === 'manual';
        const manualStepR = crouching ? K.MANUAL_STEP_R * K.CROUCH_R / K.MOVES_STEP_R : K.MANUAL_STEP_R;
        const heardMove = manualEar ? (stepLoud && p > K.HIGH_P && d <= manualStepR)
          : mv && d <= hearR && (!coverEar || (stepLoud && p > K.HIGH_P));
        const pantMul = pl.panting ? K.RUN_PANT_MUL : 1;
        // 走法試驗場：P1 兩步之間腳是停的，但按著方向鍵、還在走的節奏裡，不算「站著不動」（不然巡邏的衛兵會在你走路途中聽到站著的呼吸）
        const standing = !moved && !(strideMode && pl.dirHeld && t - pl.lastStrideT < K.STEP_GAP * K.STEP_GAP_MAX);
        const heardBreath = !pl.breathing && standing && d <= r * K.BREATH_HEAR * pantMul;
        const heardLoud = loud && d <= Math.max(r, K.LOUD_R);
        const heardStep = stepLoud && d < (manualEar ? manualStepR : crouching ? K.CROUCH_R : K.STEP_R);
        const heardRun = runLoud && d <= K.RUN_R;   // 搭配動作 A1：掩護窗外的跑步

        if (q.state === 'hunted') {
          // 第 12 節第 2、3 點（開關開）：追兵聽得到 SEARCH_BREATH_R 內沒屏住的呼吸（喘時 × RUN_PANT_MUL）、SEARCH_STEP_R 內踩歪的腳步
          const huntBreath = K.MOVES_MODE && !pl.breathing && d <= K.SEARCH_BREATH_R * pantMul;
          const huntStep = K.MOVES_MODE && stepLoud && d <= (crouching ? K.SEARCH_STEP_R * K.CROUCH_R / K.MOVES_STEP_R : K.SEARCH_STEP_R);
          const knows = seen || heardMove || heardLoud || heardStep || heardRun || (!pl.hidden && !blind);
          if (knows || huntBreath || huntStep) {
            if (K.MOVES_MODE && !knows && (q.search || t - q.knownAt > 0.5)) emit('sfx', 'hunt_heard', { id: q.id, x: q.x, z: q.z, why: huntBreath ? 'breath' : 'step' });
            q.lastKnown = { x: pl.x, z: pl.z };
            if (K.MOVES_MODE) { q.knownAt = t; g.huntKnownAt = t; if (q.search) { q.search = null; q.stuckT = 0; } }
          }
          continue;
        }
        if (q.state === 'checking') {
          // 第 15 節：查看有一條慢慢滿的疑心（C.susp），滿了才追殺。耳朵用第 12 節搜索的數字。
          //   看到你：每秒 +(1 − CHECK_SUSP0) ÷ 秒數，秒數＝3 公尺內 CHECK_SEE_TIME、8 公尺兩倍、中間線性（更遠照線性延伸）；
          //   踩歪的腳步（SEARCH_STEP_R 內）：+CHECK_STEP_SUSP，改朝聲音的位置走；沒屏住的呼吸（SEARCH_BREATH_R 內）：每秒 +CHECK_BREATH_RATE，朝你走；
          //   都沒有：每秒退 CHECK_DECAY。跑、大聲（喘出聲、門閂響）照舊直接追殺。最響的一擊時整段跳過（上面的 blind continue），疑心不動。
          const chkBreath = !pl.breathing && d <= K.SEARCH_BREATH_R * pantMul;
          const chkStep = stepLoud && d <= (crouching ? K.SEARCH_STEP_R * K.CROUCH_R / K.MOVES_STEP_R : K.SEARCH_STEP_R);
          // 轉向的 CHECK_TURN 秒裡他還在轉頭、不算看到或聽到（不然「被看見一陣子 → 查看」的下一幀就因為還被看見而直接追殺）
          if (q.check && q.check.phase === 'turn') continue;
          if (heardLoud) { startHunt(q, 'loud', '那聲音太大了——衛兵衝過來！'); continue; }
          if (heardRun) { startHunt(q, 'run', RUN_HUNT_MSG); continue; }
          const C = q.check;
          let why = null;
          if (seen) {
            const secs = K.CHECK_SEE_TIME * (1 + Math.max(0, d - 3) / 5);
            C.susp += (1 - K.CHECK_SUSP0) / secs * dt; why = 'seen';
          }
          if (chkStep) { C.susp += K.CHECK_STEP_SUSP; why = why || 'step'; retargetCheck(q, t, { x: pl.x, z: pl.z }, 'step'); }
          if (chkBreath) { C.susp += K.CHECK_BREATH_RATE * dt; why = why || 'breath'; retargetCheck(q, t, { x: pl.x, z: pl.z }, 'breath'); }
          if (!why) C.susp = Math.max(0, C.susp - K.CHECK_DECAY * dt);
          C.susp = Math.min(1, C.susp); q.susp = C.susp;
          if (C.susp >= 1 - 1e-9) {
            startHunt(q, why || 'seen', why === 'step' ? '他聽見你的腳步——追兵衝過來！' : why === 'breath' ? '他聽見你的呼吸——追兵衝過來！' : '他看清楚是你了——追兵衝過來！');
          }
          continue;
        }
        if (q.state === 'alerted') {
          if (q.lookAt) q.yaw = yawTo(q.lookAt.x - q.x, q.lookAt.z - q.z);
          const moveHigh = p > K.HIGH_P && mv && (heardMove || seen);
          if (heardLoud || moveHigh || heardRun) {
            const msg = heardLoud ? '那聲音太大了——衛兵衝過來！' : heardRun ? RUN_HUNT_MSG : MOVE_HIGH_MSG;
            startHunt(q, heardLoud ? 'loud' : heardRun ? 'run' : 'move_high', msg);
            continue;
          }
          if (heardStep && q.grace <= 0) { q.susp += K.SUSP_STEP; hint('step'); hintFail('step'); }
          if (mv && (heardMove || seen)) { if (q.grace <= 0) q.susp += K.SUSP_MOVE * dt; }
          else if (seen || heardBreath) {
            // 11/10 複審：站著被看見（或聽到呼吸）和巡邏時一樣累積疑心；之前高度警覺的衛兵反而看著你也不加
            if (q.grace <= 0) q.susp += (p > K.HIGH_P ? K.SUSP_SEEN_HIGH : K.SUSP_SEEN_LOW) * dt;
          } else if (!heardStep && !heardLoud) {
            q.susp = Math.max(K.ALERTED_SUSP, q.susp - K.SUSP_DECAY * dt);
          }
          q.susp = Math.max(K.ALERTED_SUSP, Math.min(1, q.susp));
          if (q.susp >= 1) {
            startHunt(q, 'seen', '衛兵盯住了你——追兵衝過來！');
            continue;
          }
          continue;
        }
        if (heardLoud) {
          if (p > K.HIGH_P) {
            // 只有巡邏中的衛兵先進高度警覺；起疑（安撫中）的照舊直接追殺（起疑流程不變）
            if (q.state === 'patrol') makeAlerted(q, t, 'loud');
            else startHunt(q, 'loud', '那聲音太大了——衛兵衝過來！');
          }
          else { if (q.state === 'patrol') makeSuspicious(q, t); q.lookAt = { x: pl.x, z: pl.z }; }
          continue;
        }
        if (heardRun) {   // 不分快慢：巡邏的進高度警覺，起疑（安撫中）的直接追殺
          if (q.state === 'patrol') makeAlerted(q, t, 'run');
          else startHunt(q, 'run', RUN_HUNT_MSG);
          continue;
        }
        if (heardStep && q.grace <= 0) { q.susp += K.SUSP_STEP; hint('step'); hintFail('step'); }
        let why = heardStep ? 'step' : null;
        if (mv && (heardMove || seen)) {
          if (p > K.HIGH_P) {
            if (q.state === 'patrol') makeAlerted(q, t, 'move_high');
            else startHunt(q, 'move_high', MOVE_HIGH_MSG);
            continue;
          }
          // 假驟降的頭 BLIND_LEN 秒裡動了，被聽見 → 算「假驟降」；平常 → 算「感知範圍」
          why = (!c.alertBlind && c.fake && t - c.start < K.BLIND_LEN + 0.3) ? 'fake' : 'radius';
          if (why === 'fake') hintFail('fake');
          if (q.grace <= 0) q.susp += K.SUSP_MOVE * dt;
          if (q.state === 'suspicious') q.lookAt = { x: pl.x, z: pl.z };
        } else if (seen || heardBreath) {
          if (q.grace <= 0) q.susp += (p > K.HIGH_P ? K.SUSP_SEEN_HIGH : K.SUSP_SEEN_LOW) * dt;
          if (!pl.breathing && p > K.HIGH_P) why = 'breath';
        } else if (q.state === 'patrol') {
          q.susp = Math.max(0, q.susp - K.SUSP_DECAY * dt);
        }
        q.susp = Math.min(1, q.susp);
        if (q.susp >= 1 && q.state === 'patrol') {
          if (why === 'radius' || why === 'breath' || why === 'step') hintFail(why);
          makeSuspicious(q, t);
        }
      }
      g.alerted = g.guards.some((q) => q.active && (q.state === 'alerted' || q.state === 'checking'));
      g.checking = g.guards.some((q) => q.active && q.state === 'checking');
      if (g.phase !== 'play') return g;

      // 暗示階梯「聽聲辨位」的成功：背後的衛兵，3 秒內被你轉身面對（8 公尺內、正前方 ±40°）
      for (const q of g.guards) {
        if (!q.active) continue;
        if (behindPlayer(q)) q.behindAt = t;
        else if (q.behindAt != null && t - q.behindAt < 3) {
          const d = dist2(q, pl), f = forward(pl.yaw || 0);
          if (d > 0.3 && d <= K.HINT_BACK_R && ((q.x - pl.x) * f.x + (q.z - pl.z) * f.z) / d >= Math.cos(0.7)) { q.behindAt = null; hintOk('listen'); }
        }
      }

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
        } else if (q.state === 'checking') {
          const C = q.check;
          const go = (tx, tz) => {   // 走向 (tx, tz)；到了或卡住 1.5 秒回傳 true
            const d0 = Math.hypot(tx - q.x, tz - q.z);
            if (d0 <= 0.05) return true;
            moveToward(q, tx, tz, K.PATROL_SPEED, dt);
            C.stuckT = d0 - Math.hypot(tx - q.x, tz - q.z) < 0.005 ? C.stuckT + dt : 0;
            return C.stuckT > 1.5;
          };
          if (C.phase === 'turn') {
            const u = Math.min(1, (t - C.from) / K.CHECK_TURN);
            let dy = C.yaw1 - C.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            q.yaw = C.yaw0 + dy * u;
            if (t >= C.until - 1e-9) { C.phase = 'walk'; C.stuckT = 0; }
          } else if (C.phase === 'walk') {
            if (go(C.walkTo.x, C.walkTo.z)) {
              C.phase = 'listen'; C.from = t; C.until = t + K.CHECK_LISTEN; C.baseYaw = q.yaw; C.stuckT = 0;
              emit('sfx', 'check_arrive', { id: q.id, x: q.x, z: q.z });
            }
          } else if (C.phase === 'listen') {
            q.yaw = C.baseYaw + 0.6 * Math.sin(2 * Math.PI * (t - C.from) / 2);   // 左右轉頭
            if (t >= C.until - 1e-9) { C.phase = 'back'; C.stuckT = 0; }
          } else if (go(C.home.x, C.home.z)) {
            q.state = 'patrol'; q.susp = 0; q.grace = K.CALM_GRACE; q.lookAt = null; q.check = null;
            emit('sfx', 'check_over', { id: q.id, x: q.x, z: q.z });
          }
        } else if (q.state === 'suspicious') {
          if (q.lookAt) q.yaw = yawTo(q.lookAt.x - q.x, q.lookAt.z - q.z);
        } else if (q.state === 'alerted') {
          if (q.lookAt) q.yaw = yawTo(q.lookAt.x - q.x, q.lookAt.z - q.z);
        } else if (q.state === 'hunted' && K.MOVES_MODE) {
          // 第 12 節第 1 點：追到消失點後搜影子（巡邏速度、每點停 SEARCH_PAUSE 秒環顧）；又知道你在哪就回頭追。
          // 卡住（1.5 秒沒前進，例如被牆擋）就當作到了那一點。
          const hs = t < g.huntSlowUntil ? K.HUNT_SPEED * K.HUNT_SLOW_MUL : K.HUNT_SPEED;
          if (g.huntStartUntil != null && t < g.huntStartUntil - 1e-9) {   // 喊聲的空檔：站著不動、看著你（碰到 1 公尺內照樣算被抓）
            q.yaw = yawTo(pl.x - q.x, pl.z - q.z);
            if (dist2(q, pl) < K.CATCH_R) { fail(CZ[huntCause || 'seen'] + '，之後被追上、抓住了。', 'caught_' + (huntCause || 'seen')); return g; }
            continue;
          }
          const stuckCheck = (d0, tx, tz) => {
            const d1 = Math.hypot(tx - q.x, tz - q.z);
            q.stuckT = d0 - d1 < 0.005 ? (q.stuckT || 0) + dt : 0;
            return q.stuckT > 1.5;
          };
          if (!q.search) {
            const L = q.lastKnown || { x: pl.x, z: pl.z };
            const dL = Math.hypot(L.x - q.x, L.z - q.z);
            let arrived = dL <= 0.3;
            if (!arrived) { moveToward(q, L.x, L.z, hs, dt); arrived = stuckCheck(dL, L.x, L.z); }
            if (arrived) {
              q.search = { route: searchRoute(L), i: 0, pause: K.SEARCH_PAUSE, done: false };
              q.stuckT = 0;
              emit('sfx', 'search_start', { id: q.id, route: q.search.route.map((w) => ({ x: w.x, z: w.z })) });
              if (pl.hidden) hint('huntSearch');   // 第 17.4 節：第一次躲進陰影、追兵開始搜時才講怎麼躲
            }
          } else if (!q.search.done) {
            const S = q.search, w = S.route[S.i];
            const dW = Math.hypot(w.x - q.x, w.z - q.z);
            let there = dW <= 0.05;
            if (!there) { moveToward(q, w.x, w.z, K.PATROL_SPEED, dt); there = stuckCheck(dW, w.x, w.z); S.pause = K.SEARCH_PAUSE; }
            if (there) {
              q.yaw += K.SEARCH_TURN * dt;
              S.pause -= dt;
              if (S.pause <= 0) {
                S.i++; q.stuckT = 0;
                if (S.i >= S.route.length) { S.done = true; emit('sfx', 'search_done', { id: q.id, x: q.x, z: q.z }); }
              }
            }
          } else q.yaw += K.SEARCH_TURN * dt;
          if (dist2(q, pl) < K.CATCH_R) { fail(CZ[huntCause || 'seen'] + '，之後被追上、抓住了。', 'caught_' + (huntCause || 'seen')); return g; }
        } else if (q.state === 'hunted') {
          const L = q.lastKnown || { x: pl.x, z: pl.z };
          const hs = t < g.huntSlowUntil ? K.HUNT_SPEED * K.HUNT_SLOW_MUL : K.HUNT_SPEED;
          if (Math.hypot(L.x - q.x, L.z - q.z) > 0.3) moveToward(q, L.x, L.z, hs, dt);
          else q.yaw += K.SEARCH_TURN * dt;
          if (dist2(q, pl) < K.CATCH_R) { fail(CZ[huntCause || 'seen'] + '，之後被追上、抓住了。', 'caught_' + (huntCause || 'seen')); return g; }
        }
      }

      // 擺脫追殺
      if (g.hunted) {
        if (pl.hidden && !moved) g.stillT += dt; else g.stillT = 0;
        if (!K.MOVES_MODE && g.stillT >= K.ESCAPE_STILL) endHunt();
        // 第 12 節第 4 點：追兵都搜完了，而且最後一次知道你在哪已過 ESCAPE_STILL 秒 → 甩掉（取代站著不動 6 秒）
        if (K.MOVES_MODE && g.guards.every((q) => !q.active || q.state !== 'hunted' || (q.search && q.search.done)) &&
          t - (g.huntKnownAt == null ? -1e9 : g.huntKnownAt) >= K.ESCAPE_STILL - 1e-9) endHunt();
      }

      // 搭配動作第 8 節：站在同一塊影子裡、超過三個循環沒動（跨過 4 次交接）→ 給下一步提示；之後每再久站三個循環一次。
      // 追殺（躲影子本來就是解法）、起疑、高度警覺時不算。
      if (K.MOVES_MODE) {
        const sh = !moved && !g.hunted && !g.panic.active && !g.alerted ? shadowAt(pl) : null;
        if (!sh || !idleWatch || idleWatch.name !== sh) idleWatch = sh ? { name: sh, idx: c.index, n: 0 } : null;
        else if (c.index !== idleWatch.idx) {
          idleWatch.n += c.index - idleWatch.idx; idleWatch.idx = c.index;
          if (idleWatch.n >= 4) { idleWatch.n = 0; idleNudge(); }
        }
      }

      // 區域出口
      const Z = level.zones[g.zone];
      if (Z.exit) {
        let reached = false;
        if (Z.exit.kind === 'trapdoor') {
          reached = Math.hypot(pl.x - Z.exit.x, pl.z - Z.exit.z) <= K.TRAPDOOR_R;
          if (K.HORSE_MODE && !g.belly.open) reached = false;      // 腹中練習：同伴還沒拉開木栓，暗門不開
          if (pl.x > Z.belly.x0 + 2 && (!K.HORSE_MODE || g.belly.open)) hint('trapdoor');
        } else if (Z.exit.kind === 'rect') reached = inRect(pl.x, pl.z, Z.exit.rect);
        if (lab && lab !== 'belly') reached = false;             // 試驗場：自由走，不離開起始區
        if (reached) {
          if (g.hunted) hint('lockedExit');
          else {
            if (Z.exit.kind === 'trapdoor' || Z.exit.place) {
              const s = level.zones[Z.exit.to].start;
              pl.x = s.x; pl.z = s.z; pl.y = s.y || 0; pl.yaw = s.yaw || 0; pl.inBelly = false;
              pl.hidden = isHidden(pl);
              if (Z.exit.kind === 'trapdoor') emit('sfx', 'trapdoor');
            }
            if (lab === 'belly' && Z.exit.kind === 'trapdoor') { g.phase = 'win'; return g; }   // 試驗場：爬下暗門就過關
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
      g.hunted = false; g.alerted = false; g.huntSteps = 0; g.huntSlowUntil = 0; g.huntIdleT = 0;
      g.stillT = 0; g.failReason = null; g.failCode = null; huntCause = null;
      g.gate.progress = 0; g.gate.pushing = false; g.gate.open = false;
      g.phase = 'play'; g.retries++;
      latchNoiseAt = -1e9;
      enterZone(z, true);
      if (lab === 'hunt') setupHuntLab();
      if (lab === 'check') setupCheckLab();
      if (lab === 'walk') setupWalkLab();
      // 循環時鐘不重設：相位保持連續（聲音已排好的拍不會錯位），長度自己平滑逼近新目標
      emit('msg', '從「' + level.zones[z].name + '」重新開始。');
      g.alarm = 0;
      return g;
    };

    /** 畫面層每幀取走事件。 */
    g.drain = function () { return g.out.splice(0, g.out.length); };

    return g;
  }

  return {
    T, HINTS, HINT_LADDER, hintsFor, hintLadderFor, ladderText, hintSignals, ZONE_NAMES, CAUSES, causesFor,
    createLevel, buildLevel, horseShadowFor,
    phaseAt, cycleIndex, inBlind, blindLen, radiusAt, bassBeatNear,
    zoneMul, cycleTargetFor, layerBeats, layerCount, beatPhases, layerGain, beatsBetween, alertBlindAt, fireBrightness, dangerOf, blindWindows, coverWindows: blindWindows,
    stepMasked, nextStepAt, nearestMaskBeat, visualAidFor,
    forward, yawTo, angDiff, inRect, mulberry32
  };
});
