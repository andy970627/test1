# 角色筆記：規則

負責：`prototypes/troy-prologue/risset.js`、`prototypes/bow-risset/rules.js`、`prototypes/vengeance/vengeance.js` 與各自的 `*.test.js`（`bow-contest/rules.js` 是比箭舊版，也算規則檔，目前沒有在動）。
三個檔都是**純邏輯**：不碰 DOM、three.js、Web Audio，數字進、數字出，之後要一對一翻成 C#（Unity 用 dspTime 推進）。
最後更新：2026-11-09（第一次接手）。

## 1. 檔案結構與入口

三個檔都用 UMD 包裝（一種讓同一個檔案在瀏覽器變全域變數、在 Node 變 `module.exports` 的寫法）。檔頭註解是最完整的規則說明，改規則前先讀檔頭。

### 木馬之夜 `troy-prologue/risset.js`（1219 行，全域 `RissetRules`）
- 規格：`docs/design/2026-11-06-risset-troy-prologue.md` 第 6.2、6.3、8 節（**循環長度與盲區以 8.1 節為準**，6.2 是第一版）。
- 常數表：`const T = Object.freeze({...})`，第 70～150 行左右，每個常數旁有中文註解。
- 入口：`createLevel(opts)` 回傳遊戲物件 `g`，方法掛在 `g` 上：
  - `g.step(t, input)`（第 848 行起，主迴圈）：`t` 是音訊時鐘絕對秒數；內部算 dt，最多 `MAX_DT` 0.1 秒（只限制移動與規則，循環時鐘照實際經過的音訊時間推進）。
  - `g.start()`、`g.retry()`、`g.drain()`（取走本幀事件 `g.out`）。
  - `opts`：`{T（覆寫常數）, seed, rng, level, t0, startZone, visualAid}`。
- 循環時鐘：`updateClock → advanceClock / snapClock`（在 `createLevel` 閉包內）；目標長度 `cycleTargetFor`，實際長度每秒最多改 `CYCLE_RATE` 20%。
- 匯出的純函式：`phaseAt`、`cycleIndex`、`inBlind`、`blindLen`、`radiusAt`、`bassBeatNear`、`zoneMul`、`cycleTargetFor`、`layerBeats`、`layerCount`、`beatPhases`、`layerGain`、`beatsBetween`、`alertBlindAt`、`stepMasked`、`nextStepAt`、`nearestMaskBeat`、`visualAidFor`、`hintSignals`、`hintsFor`、`hintLadderFor`、`ladderText`，以及幾何小工具。

### 比箭 Risset 版 `bow-risset/rules.js`（915 行，全域 `BowRissetRules`）
- 規格：`docs/design/2026-11-07-risset-bow-vengeance.md` 第 2 節。
- 常數表：`var TUNING = {...}`（第 63 行起，含 `heart`、`string`、`aim`、`difficulties` 子表）；主題 12 音 `THEME12`；提示文字 `HINTS`、`TEXT`。
- 入口：`createRound(options, rng, carry, now)` → `stepRound(round, dt, input)`（第 699 行，主迴圈；`input.now` 給了就以音訊時鐘為準）→ `fireRound`。
- 心跳（Risset 節奏）：`createHeart`、`heartAt(h, t)`、`heartBeatsBetween`、`heartDropsBetween`、`cycleLen(j)`；第一次驟降在開始拉弓後 `firstDrop` 秒，之前是 j = −1 的預備循環。
- 其他：上弦 `stepString`（謝帕德）、拉弓 `stepDraw`、彈道 `simulate`、飛行與主題對時 `flightTimeline / realTimeAt / arrowTimeAt`、起鬨 `heckleOffset`、程式玩家 `createBot`、`playRound`。

### 大廳復仇 `vengeance/vengeance.js`（761 行，全域 `VengeanceRules`）
- 規格：現行版是 `docs/design/2026-11-07-risset-bow-vengeance.md` 第 3 節；**下一版（合成版 v2）** 是 `docs/design/2026-11-08-vengeance-v2-spec.md`（常數表第 13 節、介面第 13.6 與 17.1 節、測試清單第 16 節）。
- 常數表：`const T`（第 60～130 行左右）；難度覆寫 `DIFFICULTY`（第 134 行起，只列和 T 不同的值）；`constantsFor(difficulty, extra)` 合成 `game.T`。
- 入口：`createGame({t0, seed, difficulty, dynamic, cycle, K, hints})` → `step(g, t, input)`（第 570 行，主迴圈）；事件在 `game.events`（每幀重設）。
- 循環：`cycleOf(g, t)`（查任何時間的循環資訊）、`cycleLenFor(g)`（下一個循環長度，只在交接時決定）、`commitCycles`；固定模式下 `cycleOf` ≡ `cycleAt(t, t0, K)`。
- 其他：`planCycle`（排每輪出手）、`shoot`、`traceShot`、`resolveAttack`、`expose`（空檔外放箭引來的擲矛）、程式玩家 `botInput`。

## 2. 介面約定（和聲音、畫面對接）

共通原則：**規則是唯一的時間來源與常數來源**。時間一律是音訊時鐘（`AudioContext.currentTime`）絕對秒數；按鍵判定用「按鍵當下的音訊時間減輸出延遲」，沒給才用幀時間。

### 木馬之夜
- 每幀順序（畫面層）：`audio.now()` → `g.step(t, input)` → 畫面 → `audio.update(g)` → `g.drain()`。
- `input`：`{yaw, mx, mz（世界座標方向）, breath（按住）, dash, takedown, calm（一幀事件）, actAt, calmAt}`。
- 狀態給聲音讀：`g.T`、`g.cycle.{T, targetT, p, index, blind, fake, nextFake, anchor:{t,p,T,index,start}, blindFrom, blindTo, alertBlind}`、`g.bass.{period, anchor, nextBeat}`、`g.alarm`、`g.hunted`、`g.visualAid`。聲音用 `p(t) = anchor.p + (t − anchor.t) ÷ anchor.T` 外推排程。
- 事件 `g.out`：`{type:'msg'|'sfx'|'hint', a, ...}`。sfx 名稱：`pre_blind`、`step_masked`／`step_loud`（帶 `x, z, beatT`）、`calm_ok`／`calm_bad`（帶 `index`）、`calm_done`、`latch_step`（`index` 0～7）、`latch`、`gate_open`、`breath_in/out`、`gasp`、`dash`、`takedown(_fail)`、`alert`、`hunt`、`escape`、`caught`、`trapdoor`、`checkpoint`。
- 聲音層讀的規則函式：`RissetRules.T`、`beatPhases`、`layerGain`、`beatsBetween`；**另外會找 `blindWindows(a, b, game)`，但規則沒有匯出**（見陷阱）。

### 比箭 Risset 版
- 聲音：`follow(heart)` 後每 25 ms 補排 0.4 秒內的拍，讀 `heartBeatsBetween`、`heartAt`；畫面每幀讀 `round.heart`／`round.hb`。
- 事件名稱：`string`、`strung`、`slip`、`heart`、`drop`、`heckle`、`fire`、`pass`、`result`、`cancel`、`stop`；暗示事件 `{type:'hint', key, level, text（第 2 階起）, keys（第 3 階）}`。

### 大廳復仇（現行版）
- `input`：`{yaw, pitch, mx, mz, shoot, shootAt, dodge, dodgeAt, breath（按住）, tele, teleAt, pick}`。
- 畫面與聲音讀：`game.T.{GAP_LEN, EYE_Y, PICK_R, BREATH_MAX, BASS_OFFSET, ARROWS}`、`VengeanceRules.cycleOf`。
- 事件：`cycle`、`pre_gap`、`gap`、`attack_warn`（帶 x, z）、`spear`、`dodge(_ok)`、`breath_*`、`block`、`shield_hit`、`hurt`、`fall`、`shoot`、`miss`、`down`、`exposed`、`pick(_none)`、`empty`、`bow_busy`、`tele_ok/miss/busy`、`surrender`、`win`、`hint`。
- v2 會新增的狀態、事件、輸入：見 v2 規格第 13.6、17.1 節（`game.phase`、`stamina`、`slots`、`cmd`、`strikeBeats`、`impactBeats`、`nearestStrike`、`createLab` 等），實作時以那兩節為約定。

## 3. 陷阱

- 2026-11-09 木馬之夜：聲音層 `audio.js` 會優先用 `RissetRules.blindWindows(a, b, game)` 拿盲區時段，但規則**沒有匯出**這個函式，所以聲音目前用自己的預測（含警戒時低音拍之間的盲區）。等於兩邊各算一份，警戒或假驟降時可能對不上。要補就在規則加 `blindWindows` 並寫測試，再通知聲音。
- 2026-11-09 大廳復仇：`HINTS.tele.keys` 寫死「前後 0.15 秒內」，沒有從 `BASS_WIN` 生成（違反 `retrospective.md` 第 15 項）；改 `BASS_WIN` 或之後難度覆寫它時文字會錯。木馬之夜已經有 `hintsFor(K)` 的做法可照抄。
- 2026-11-09 公式複製、沒有共用：`bow-risset/rules.js` 的 `layerBeats／beatPhase／layerGain` 複製自木馬之夜，`vengeance.js` 也有自己一份 `layerBeats／beatPhases／layerGain／bassBeatNear`。規定是不跨資料夾引用，所以**改 Risset 公式要三個檔一起改**，並各自跑測試。
- 2026-11-09 名稱不一致：比箭 Risset 版是 `beatPhase`（單數）、另外兩個是 `beatPhases`；常數表名稱也不同（`T` vs `TUNING`）。聲音層對接時注意。
- 2026-11-09 舊名別名：木馬之夜 `T.BLIND` 是 `BLIND_LEN` 的舊名（畫面、聲音還在讀）；`createLevel({T:{BLIND}})` 只給舊名時會同步成 `BLIND_LEN`。改盲區只改 `BLIND_LEN`。
- 2026-11-09 聲音層備援常數：`troy-prologue/audio.js` 與 `vengeance/audio.js` 檔頭各有一份「規則沒載入時」的備援值（例如大廳的 `CYCLE: 7.2, GAP: 0.6, BASS_PERIOD: 2.4, BASS_OFFSET: 1.2`）。改規則常數時要提醒聲音角色同步備援值，不要自己改他們的檔。
- 2026-11-09 時間步長：木馬之夜 `MAX_DT` 0.1 只限制移動與規則，循環時鐘照實際音訊時間推進（分頁休眠超過 `CLOCK_MAX_GAP` 30 秒直接接上）。寫測試推時間時要分小步，不然移動會被截斷。
- 2026-11-09 v2 常數數量：v2 規格第 13.4 節初版合計寫錯過一次（56 → 57），審議後是 66 個新增、2 個刪除（`IMPACT_P1/P2`）。實作時照表逐項核對，不要信合計數字。
- 2026-11-09 「234 項」是連 `tools/telemetry/*.test.js` 7 項一起算；只跑規則與原型是 227 項（見第 4 段）。報數字時說清楚算不算遙測。
- 2026-11-09 工作位置：規則工作階段改檔一律在 worktree `C:\Users\恩\test1\.claude\worktrees\openrouter-api-key-setup-383957`（分支 `claude/gracious-bardeen-vwo4rr`），不要碰 `C:\Users\恩\test1` 主資料夾（寫檔鉤子會擋）。

## 4. 驗證方式

- 全部規則測試（在上面那個 worktree 的根目錄）：
  ```
  node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js
  ```
  看最後的 `ℹ tests` 與 `ℹ fail`。**2026-11-09 基準（分支 `claude/gracious-bardeen-vwo4rr`）：227 項，227 通過，0 失敗**，約 6 秒。
- 各檔項數（`test(` 呼叫數，加總 = 227）：木馬之夜 `risset.test.js` 82、比箭 Risset 版 `rules.test.js` 23、大廳復仇 `vengeance.test.js` 35；其他（不歸我改，但一起跑）：`beggar-hall/sim.test.js` 36、`bow-contest/rules.test.js` 29、`odyssey-series/series.test.js` 14、`underworld.test.js` 8。
- 只跑一檔：`node --test prototypes/vengeance/vengeance.test.js`。
- 程式玩家統計：`vengeance.test.js` 最後一項「程式玩家三段難度各 50 局」會印出勝率（給設計文件用）；比箭 Risset 版用 `playRound` / `createBot`。改數值後看勝率有沒有大幅移動。
- 每加一個機制：要有試驗場（v2 規格第 19 節）與自動化檢查；試驗場的預期不能是同義反覆（第 19.5 節）。
- 規則改完、要真耳朵判斷手感的事：寫進 `docs/process/approvals.md`「待核准」，不自己下結論。

## 5. 上次做到哪、未完成

- 2026-11-09：第一次接手，只讀檔與填筆記，**沒有改任何程式**。測試 227 全綠。
- 未完成（等主對話派工，不自己開工）：
  1. 大廳復仇 v2 合成版第一批（v2 規格第 17 節「規則」列）：程式裡還沒有任何 v2 常數（`STRIKE_`、`STAMINA_`、`CHARGE_` 等 0 個）。預定 11/12 期中報告後開始。
  2. 木馬之夜補匯出 `blindWindows`（第 3 段第 1 條），需要和聲音角色對接。
  3. 大廳復仇 `tele` 提示文字改由 `BASS_WIN` 生成（第 3 段第 2 條）。
  4. 第二輪真耳朵試玩回饋若有規則面的修正，由主對話轉來。
