# 角色筆記：聲音

負責 `prototypes/*/audio.js`（三個檔，全部純 Web Audio 程式合成）。規則檔、畫面、錄音工具都不是我的檔，要改就回訊主對話。
專有詞：**盲區／空檔／驟降**＝鼓聲故意斷掉的 0.6 秒，玩家行動的時機；**Risset 節奏**＝多層鼓每層速度兩倍、音量鐘形淡入淡出，聽起來一直加速；**gate**＝在盲區把整條匯流排（一組聲音的總音量旋鈕）壓到幾乎無聲的開關。

## 1. 檔案結構與入口

三個檔都是 UMD（瀏覽器掛全域、Node 可 `require`），對外只有 `createAudio(ctx, opts) → api`。
共同骨架：**計時器只負責補排程，不負責計時**。Worker 裡 25 ms 的 `setInterval` 送 tick（背景分頁不降速，建不起來改主執行緒），
每次 tick 呼叫 `scheduleTo(現在 + LOOKAHEAD)`，所有聲音用 `ctx.currentTime` 絕對時間預排，不用畫面幀時間。

### 木馬之夜 `prototypes/troy-prologue/audio.js`（1787 行，全域 `RissetAudio`）
- 檔頭註解（1～66 行）是本檔的規格摘要，改功能先改這裡。常數表 `C` 在 72 行起（含 11/08 喇叭可聽度那組：`PRE_BLIND_GAIN`、`BRIGHT_*`、`BASS_MID_GAIN`、`ALERT_DUCK_*`、`STEP_CRUNCH_GAIN`）。
- 兩層分工：**功能層**（Risset 打擊、失控層、警戒慢低音、提示音）時間與音量和**音樂層**（夜風、低吟、合唱和弦、謝帕德音階、主題動機；或自備音檔）完全無關。
- 主要入口：
  - `api.update(state)`（約 1563 行）：畫面層每幀呼叫。讀規則常數、低音網格、`cycle.anchor`、假驟降、`cycle.blind` 最後裁決、分區、門閂、警戒／追殺匯流排、警戒開頭壓低、`hintSignals`、衛兵 3D，最後 `scheduleTo`。
  - `scheduleTo(end, now)`（約 1117 行）→ `scheduleBeats`（Risset 拍）、`scheduleFakeTails`（假驟降尾音）、`scheduleLinear`（低音、預告音等）、`scheduleMusic`、`planShep`。
  - 節拍外推：`takeAnchor`（767）、`Pof`／`tAt`／`Tof`（555～570，累計相位 ↔ 時間）、`replan`（751，偏差 > 1 ms 取消重排）。
  - 盲區：`windowsBetween`（648，預測盲區時段）、`Gate` 類別（697）。五個 gate：`gateR` 節奏、`gateM` 音樂、`gateG` 衛兵、`gateH` 暗示、`gateB`。
  - 打擊：`playHit(dest, x, t, g)`（344），x＝速度位置 0..1，低鼓→框鼓→手拍→金屬交叉混合。慢低音 `bassHit`（355）。
  - 提示音表 `CUES`（約 1380～1540 行），對外 `api.cue(name, when|data|event)`；名稱經 `CUE_ALIAS` 正規化（`step_loud`＝`stepLoud`）。底線開頭的是內部用。
  - 其他對外：`setListener`、`setMaster`、`suspend/resume`、`loadTrack/clearTrack/setTrackVolume/setSynthVolume/setMusicMode('synth'|'track'|'mix')`、`setMusicLayer`、`setMusicZone`、`playTheme`、`dispose`；測試用 `phase/cyclePhase/timeAtPhase/isBlind/isFakeAt/beatSource/_voices`。
  - 模組匯出：`{ createAudio, phaseAt, beatTimes, decode, CONST, THEME, midiHz }`。

### 比箭・Risset 版 `prototypes/bow-risset/audio.js`（386 行，全域 `BowRissetAudio`）
- 規格：`docs/design/2026-11-07-risset-bow-vengeance.md` 第 2 節。打擊、里拉琴、Worker、謝帕德從木馬之夜**複製**後改成心跳用（不跨資料夾引用）。
- 入口：`createAudio(ctx, { rules, log })`，`rules` 預設 `self.BowRissetRules`。`follow(heart, offset)`：音訊時間＝規則時鐘＋offset（畫面層給，開播後固定）。`heart.seq` 一換（拉弓、放手、取消）就取消未響的拍重排。
- `scheduleTo`：心跳拍取自 `R.heartBeatsBetween`；驟降時人聲與火聲用 ramp 壓低；人聲每 50 ms 讀 `R.crowdLevel` 一個控制點。
- 其他：`setShepard(on, pos)`（上弦無限上爬）、`playNotes(notes, at)`（箭穿孔奏主題）、`setGrind(level)`（指針偏離亮區的弦摩擦）、`setCreak`、sfx（`knock` 杯底敲桌三下、`twang`、`swallow`、`thunder`、`thunk`、`slip`、`land`、`laugh`、`win`、`cue(kind)`、`hit(kind)`）、`drainLog`、`close`。LOOKAHEAD 0.4 秒。
- 模組匯出：`{ createAudio, CONST, midiHz }`。

### 大廳復仇 `prototypes/vengeance/audio.js`（486 行，全域 `VengeanceAudio`）
- 從木馬之夜複製精簡：沒有音樂層，多一條「人群低吼」（濾波噪音，隨相位 p 變大變亮，空檔一起斷）。
- 入口：`createAudio(ctx, { t0, cycle, gap, bassPeriod, bassOffset, cycleAt, master, log })`。畫面層傳 `cycleAt = t => VengeanceRules.cycleOf(game, t)`；循環永遠是整數個低音拍，長度只在交接時換。
- 拍點在約 225～245 行（本檔自己的相位表＋鐘形）。低音不經 gate，網格錯開半拍（`t0 + 1.2 + m·2.4`）。
- 對外：`setClock(o)`（重開局）、`stopRhythm(dur)`、`cue(name, t, data)`、`now`、`destroy`、`CONST`。模組匯出 `{ createAudio, CONST, THEME }`。cue 名稱見第 2 節。

## 2. 介面約定

**原則：規則是節拍與常數的唯一來源，聲音層只排程，不自己算相位、不抄常數**（音樂核心概念第 5 節第 7 條）。本檔 `C` 裡和規則同名的值只是規則還沒載入時的備援。

### 木馬之夜：從規則讀什麼（`RissetRules`，`risset.js`）
- 常數取用順序：`state.T` → 全域 `RissetRules.T` → 本檔備援（函式 `RK()`）。
  - `RISSET_LAYERS`、`RISSET_M`、`BELL_SIGMA`、`BEAT_MIN_GAIN`、`HUNT_LAYERS`、`FAKE_TAIL_GAIN`。
  - `BLIND_LEN`（舊名 `BLIND`）；警戒盲區長度依序找 `ALERT_BLIND_LEN`／`BASS_BLIND_LEN`／`PANIC_BLIND_LEN`，都沒有就同 `BLIND_LEN`。
- 函式（有就用，沒有才退回本檔公式）：`beatPhases`／`beatsBetween(a, b, game, { includeFakeTail: true })`（尾音拍 `tail: true`）、`layerGain`、`layerCount(hunted)`、`blindWindows`、`hintSignals(state)` → `{ guards: [{id, killable}], blindIn }`。
- `update(state)` 讀的欄位：
  - `state.cycle`：`anchor {t, p, T}`（外推節拍）、`blind`（最後裁決）、`fake`／`nextFake`（假驟降）、`alertBlind`、`p`。
  - `state.bass`：`period`、`anchor`、`nextBeat`（只信規則的 nextBeat，換網格就取消舊拍）。
  - `state.panic`（物件 `{active}` 或 0..1 數字）、`state.alarm` 0..1、`state.hunted`、`state.phase`（`'win'` 觸發號角主題）、`state.zone` 0～4、`state.gate {pushing, open, progress, need}`、`state.guards[]`、`state.player`、`state.time`、`state.blindLen`（舊）。
- 提示音事件（畫面層把規則的 `game.out` 裡 `{type:'sfx', a:名稱, index, x, z}` 原樣丟給 `cue`）：
  `step`、`step_masked`、`step_loud {x,z}`、`gravel`、`latch`、`latch_step {index}`、`latch_click`、`calm_ok {index}`、`calm_bad`、`calm_done`、
  `pre_blind`（木魚兩聲）、`blind`、`alert`、`caught`、`takedown`、`takedown_fail`、`down`、`bell`、`checkpoint`、`dash`、`escape`、`trapdoor`、`win`、
  暗示：`companion_gasp`、`whisper_now`、`growl {x,z}`；呼吸：`breath_in`、`breath_out`、`gasp`。完整清單看 `api.cueNames`。
- 規則保證：假驟降那輪**不發** `pre_blind`；聲音層的預告音、變亮、gate 都用同一份預測盲區，所以假驟降自然沒有預告也不變亮。

### 比箭：從規則讀什麼（`BowRissetRules`，`rules.js`）
- `R.heartBeatsBetween(heart, a, b)` → 拍 `{t, ...}`（規則時鐘）；`R.heartAt(heart, t)` → `{drop, ...}`（驟降 0.5 秒）；`R.crowdLevel(heart, t)` 0..1。心跳越快越響由規則的 heartGain 決定，聲音層不另加。
- 畫面層呼叫：`follow(heart, offset)`、`setShepard(on, pos)`（pos＝張力 × 3，規則給）、`playNotes`、`setGrind`、`sfx.knock()`（起鬨預告）。

### 大廳復仇：從規則讀什麼（`VengeanceRules`，`vengeance.js`）
- 經畫面層傳入：`cycle: KT.CYCLE`、`gap: KT.GAP_LEN`、`bassPeriod: KT.BASS_PERIOD`、`bassOffset: KT.BASS_OFFSET`、`cycleAt = cycleOf(game, t)` → `{index, start, len}`。
- cue（畫面層依規則事件呼叫，規則保證預備不落在空檔）：`attack_warn {pan, kind}`、`spear_fly`、`arrow_land {pan, dist}`、`shoot`、`miss`、`shield_hit`、`down`、`dodge`、`dodge_ok`、`breath_ok`、`block`、`hurt`、
  `tele_ok`（里拉琴奏主題下一音）、`tele_miss`、`tele_busy`、`breath_in/out`、`gasp`、`pick {n}`、`empty`、`bow_busy`、`surrender`、`win`、`fall`；`pick_none`、`exposed`、`pre_gap`、`gap` 目前是空函式。
- **注意**：層數、M、σ、最小增益目前是本檔自己的 `C.LAYERS/M/BELL_SIGMA/MIN_GAIN`，沒讀規則（見陷阱）。

### 和錄音工具的約定
- 錄音工具在 `destination` 前分接錄音；`log: true` 時聲音層把排程起音記進 log，分析拿來對照規則拍點。改排程或 log 格式先回訊「錄音與工具」。

## 3. 陷阱

- 2026-11-07 稽核 A1：節奏匯流排隨 p 從 0.7 漲到 1.0、交接掉回 0.7（−3.1 dB），假驟降時就是聽得出的接縫。木馬之夜已改固定 `RHYTHM_GAIN`；**大廳復仇還有 `TENSION_LO/HI` 0.7→1.0**（目前沒有假空檔所以不出事，加假空檔前要拿掉）。
- 2026-11-07 稽核 A2：聲音層寫死追殺層音量與本地 σ、層數、M，規則一改拍點跟、音量不跟。木馬之夜已改讀 `RK()`；**大廳復仇仍用本地 `C.LAYERS/M/BELL_SIGMA/MIN_GAIN`**，要改成讀規則需規則檔匯出或畫面層傳入（跨角色）。
- 2026-11-07 稽核 A3：不要抖音量（只抖音色頻率 ±3%），否則實際響度 ≠ 規則 gain，`step_masked` 判斷會錯。
- 2026-11-07 第一輪試玩：錄音「盲區比前後安靜 36 dB」全過，人在喇叭上仍「很難分辨」。**錄音通過 ≠ 人耳聽得出**，最後要真耳朵。
- 2026-11-07：筆電喇叭 150～200 Hz 以下幾乎沒聲音，關鍵訊號（預告、低音、腳步）一律在 200～4000 Hz 補一份，不能只靠低頻或左右聲道。
- 2026-11-08：預告音、變亮、gate 必須共用同一份預測盲區時段；另起一份計算，假驟降就會漏出預告（違反「假空檔前一定沒有預告」）。
- 盲區是以秒計的固定長度，不隨 T 縮；別把它寫成相位比例。
- 新的單發暗示聲要過 `hintFree(t, dur)` 並走暗示匯流排 `hintBus`，否則會蓋進盲區，盲區不再是乾淨空檔。
- 音樂層要避開功能層頻段：高通 130 Hz、1200 Hz 挖 −8 dB；新加的音樂元素別放進低音拍（43～128 Hz、中頻敲擊 200～600 Hz）與手拍／金屬主頻。
- 三個檔的打擊、里拉琴、Worker 是**複製**不是共用，修一邊的 bug 要記得看另外兩邊要不要跟。
- 衛兵 HRTF PannerNode 最多 6 名；超過要改 `updateGuards`。
- 2026-11-09：本機 Node 找不到 `playwright` 模組，錄音工具在這台跑不起來（見第 4 節），聲音改動的錄音驗證目前要靠雲端。
- 2026-11-09（規則角色發現）：木馬之夜 `audio.js` 會找 `RissetRules.blindWindows(a, b, game)`（約 650 行），但 `risset.js` 沒匯出，所以盲區時段其實是聲音層用 anchor 外推**自己預測**（`windowsBetween`），只在 `cycle.blind` 連續兩幀不一致時才強制修正。警戒時「盲區改在兩個低音拍正中央」也是本檔自己算的。規則改盲區邏輯時聲音層不會跟，預告音、變亮、gate 可能和判定差一點。要根治請規則匯出 `blindWindows`（audio.js 已有分支，匯出後自動改用）。
- 2026-11-09：工作資料夾是 worktree `C:\Users\恩\test1\.claude\worktrees\openrouter-api-key-setup-383957`（分支 `claude/gracious-bardeen-vwo4rr`），不要寫主資料夾 `C:\Users\恩\test1`（會被擋）。

## 4. 驗證方式

### 語法與載入
- `node -e "require('./prototypes/troy-prologue/audio.js')"`（另兩個同理）：確認 UMD 載得起來、沒有語法錯。11/09 三個都載得起來。
- 規則測試由「規則」角色跑；聲音層改動若碰到拍點或盲區時段，請主對話一起跑 `node --test prototypes/*/*.test.js`。

### 錄音分析（主要驗證）
```bash
node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --out tools/playtest-recorder/out/<名>
```
- 用無頭 Chromium 跑原型，錄 Web Audio 實際輸出，產出 `report.md`、`audio.wav`、`playtest.mp4`、頻譜圖、包絡圖。只重跑分析：`node tools/playtest-recorder/analyze.mjs <輸出資料夾>`。
- 設定檔：`troy-prologue`、`bow-risset`、`vengeance`（`tools/playtest-recorder/profiles/`）。**只有 troy-prologue 宣告了喇叭三項**（`analysis.speaker`），另外兩個只跑前 5 項。
- 8 項檢查（看 `report.md`）：
  1. `blind` 盲區時整體音量比前後低（11/07 中位 36.5 dB）。
  2. `onset` 起音與規則拍點誤差（11/07 中位 2.3 ms、±30 ms 命中 96%）。
  3. `alertLow` 警戒時低頻最突出。
  4. `clip` 有無削峰爆音。
  5. `silence` 有無長時間完全無聲或丟拍。
  6. `preBlindMid` 盲區前預告音在 1～3 kHz 聽得出（11/08 相對前 1 秒 +25 dB）。
  7. `bassMid` 警戒時低音拍在 200～600 Hz 聽得出（11/08 +13 dB）。
  8. `stepBand` 不合拍腳步比合拍腳步在 1～4 kHz 突出（11/08 差 28 dB）。
- **喇叭模擬**：分析會自動把 wav 過 200 Hz 高通（`audio-speaker.wav`），以 `--speaker` 子行程重跑全部檢查，報告多一節「原始 vs 喇叭模擬」。預期喇叭模擬下只有第 3 項「低頻最突出」不通過，其他 7 項要過。
- **本機狀態（11/09）**：待裝 `npx playwright install chromium`。實況：`~/AppData/Local/ms-playwright/` 已有 Chromium 1248、1254，但 Node 找不到 `playwright` 套件（專案沒有 `node_modules`，`record.mjs` 只試 `playwright`、`/opt/node-tools/...` 與 `NODE_PATH`；`NODE_PATH` 用 `:` 切，Windows 要用 `;`）。所以要先讓 Node 找得到 playwright 套件。**現在不裝**，要裝時由主對話決定。雲端環境可直接跑。
- 錄音只代表喇叭前的數位訊號，不含作業系統混音、喇叭與房間；聽感一律交真耳朵（寫進 `docs/process/approvals.md` 待核准）。

### 本機真耳朵
- 第二輪試玩表：`docs/process/playtest-notes.md`「2026-11-09 木馬之夜（第二輪）」，喇叭、耳機各一欄。回饋進來後依題號對應：1 驟降、2 低音、3 腳步、4 3D、5 假驟降、8 木魚、9 衛兵「嗯？」歸聲音。

## 5. 上次做到哪、未完成

- **11/09 接手**：只填本筆記，沒改任何 `audio.js`。目前程式等於 11/08 雲端版（木魚預告、低音中頻敲擊、腳步碎石＋衛兵吸氣、警戒開頭壓低 6 dB）。
- 等第二輪真耳朵回饋，預定要判斷的：
  - 木魚會不會太現代或太吵：備案改碰鈴或吸氣聲（都要在 1～3 kHz）。
  - 警戒開頭壓低一拍半有沒有「先聽到低音」的感覺；沒有就加長壓低或再加重中頻敲擊。
  - 衛兵「嗯？」是回饋還是嚇人。
- 待辦（未排程，碰到再提）：
  - 請規則匯出 `RissetRules.blindWindows`，聲音層就會自動改用（不用改 audio.js）。
  - 大廳復仇改讀規則常數（層數、M、σ、最小增益），拿掉 `TENSION_LO/HI` 隨 p 漲的匯流排；需要規則檔匯出常數或畫面層傳入。
  - 比箭、大廳復仇的錄音設定檔沒有喇叭三項，要請「錄音與工具」補 `analysis.speaker`（比箭：起鬨預告 `knock`；大廳復仇：`attack_warn`、低音舉盾）。
  - 本機錄音工具的 playwright 套件與 `NODE_PATH` 分隔符（`tools/` 的事，轉「錄音與工具」）。
  - 大廳復仇合成版第一批（11/12 報告後）：先讀這份第 2 節的約定，新事件先和「規則」對好名稱再接。
