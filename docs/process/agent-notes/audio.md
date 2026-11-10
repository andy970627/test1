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
- 2026-11-10（4A 審查）：**持續音不能走 `cueBus`**：`cueBus` 沒有盲區 gate，草稿的嗡鳴把盲區從 −82 灌到 −21 dB。持續音一律走 `hintBus`（或 `guardOut`），單發音也要想會不會落在盲區。
- 2026-11-10：存節點時要分清 GainNode 和它的 `.gain`（AudioParam）。草稿把 GainNode 存成 `gain`、停止時呼叫 `.cancelScheduledValues` 丟錯，被 `try {}` 吞掉，嗡鳴從來停不掉。**`try` 包住整段淡出時，至少要有一個能看到它失敗的測試**（第 4 節的離線渲染）。
- 2026-11-10：持續狀態音（嗡鳴之類）的開關要跟著**規則狀態**（`state.alerted` 等），不能只靠開始／結束兩個 cue：多名衛兵輪流警覺（第一名的 `alert_over` 會把第二名的也停掉）、重開局、失敗畫面都會漏。
- 2026-11-10（殘響掩護）：警戒時的掩護窗夾在兩個低音拍中間，任何 200～600 Hz 的重擊或推高的殘響都會墊高下一個低音拍前的背景，把要跟的低音蓋淡（錄音：+14 → +8.6 dB）。警戒窗的重合擊要往上移、不推殘響。
- 2026-11-10：錄音工具第 1 項「盲區比前後安靜」只適用舊版；殘響掩護下這項會反過來（窗內較響），腳步那項也可能因為出聲的腳步被窗蓋掉而不過。要請「錄音與工具」依 `COVER_MODE` 換成「窗開頭重擊突出量」。
- 2026-11-10：音效只加 200 Hz 以下的成分（例如草稿 takedown 的 58 Hz 悶擊），筆電喇叭聽不到，只會把峰值推高。加東西先量「喇叭模擬峰值」有沒有變。
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
- **本機跑法（11/10 可用）**：PowerShell：`$env:NODE_PATH="$env:LOCALAPPDATA\test1-node-tools\node_modules"; $env:FFMPEG=(Get-Command ffmpeg).Source; $env:FFPROBE=(Get-Command ffprobe).Source;` 再接上面的指令（細節見 `tools.md`）。60 秒錄音加分析約 2 分鐘。
- 錄音的程式玩家很少觸發高度警覺、追殺、暗殺，而且要工作分支的 `risset.js` 已經會發那些事件才錄得到。新音效改用下面的離線渲染驗。

### 離線渲染（新音效、狀態開關）
- 在無頭 Chromium 裡用 `OfflineAudioContext` 建 `RissetAudio.createAudio(ctx, { T: 10, t0: 0, blind: 0.6, mute: { rhythm, bass, ambient } })`，`a.update(假 state)`、`a.cue(...)`、`a.scheduleUntil(秒)`，再 `startRendering()` 量 RMS／峰值。中途改狀態用 `ctx.suspend(t).then(...)`。
- 喇叭模擬：把渲染結果再過兩級 200 Hz 高通量峰值。
- 11/10 的兩支腳本放在工作階段暫存區，沒進 repo：`drone-check.mjs` 量盲區與各狀態切換時的音量，`cue-bands.mjs` 量各音效的峰值與喇叭模擬峰值。要常用就請「錄音與工具」收進 `tools/`。
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
  - 大廳復仇合成版第一批（11/12 報告後）：先讀這份第 2 節的約定，新事件先和「規則」對好名稱再接。

- 11/09 晚（總控）4A 聲音草稿已由 agy 寫進 `audio.js`（提交 511b817）：alerted 嗡鳴、alert_over、hunt_step、hunt_slip、追殺 dash 風切、takedown 悶擊。
- **11/10 審完 4A 草稿**（未提交，改 `audio.js`、`audio-test.html`）：
  - 嗡鳴停不掉（存了 GainNode 而不是 `.gain`，錯誤被 `try` 吞掉）→ 改存 `g.gain`。草稿 alert_over 後照響到 15 秒（−19.7 dB），修後停乾淨（−28.4，等於沒嗡鳴）。
  - 嗡鳴走 `cueBus` 灌進盲區（−20.7 dB）→ 改走 `hintBus`，盲區 −77 dB（沒嗡鳴是 −84）。
  - 嗡鳴 0.18 比整組鼓聲還響 9 dB → 新常數 `ALERTED_DRONE_GAIN` 0.04（整體只多 1.4 dB）。
  - 開關改跟規則狀態：`update` 讀 `state.alerted`，追殺、警戒（panic，讓出低音拍的 200～600 Hz）、非 play 階段都停；`alert_over` 時還有別的衛兵在警覺就不停、不放鬆口氣的兩音；規則沒有 `alerted` 欄位時照舊只靠 cue。
  - `hunt_step` 第 4 步以後繞回低音 → 改成停在最高音（規則第 3 步就歸零，實際碰不到）。
  - `takedown` 悶擊全在 200 Hz 以下、峰值 −0.9 dB → 低頻 0.75 降到 0.22，加一層 320 Hz 帶通雜訊；喇叭模擬比一般倒地多 2.3 dB。
  - 試驗場 `audio-test.html` 補 5 個新按鈕：高度警覺嗡鳴、警覺結束、暗殺成功、追殺合拍一步、甩開一段。
  - 驗證：`node --test prototypes/*/*.test.js` 227 過；錄音 60 秒 8 項全過（`out/audio-4a-review`），但工作分支的規則還沒有 PR #10，沒錄到 4A 事件；4A 改用離線渲染量。
- **4A 待人耳確認**（喇叭與耳機）：
  - 嗡鳴 0.04 夠不夠當警告：太小聲就往 0.06 調；警戒時嗡鳴停掉會不會讓人以為警覺結束。
  - `hunt_slip` 和 `step_loud` 一樣響（峰值 −7.5 對 −6.9），金屬「鏗」會不會被誤認成「踩出聲」。
  - 追殺 `dash` 風切在盲區裡響（是玩家自己的動作，和原本 dash 一樣），聽起來會不會像盲區沒空掉。
- 草稿沒動但記一筆：追殺 `dash`、`hunt_slip` 有送殘響（`cueSend`），尾巴可能拖進盲區幾十毫秒。
- **11/10 殘響掩護（核心方向甲）已實作**（未提交，只改 `audio.js`）：
  - 開關 `coverMode()`：規則 `T.COVER_MODE === true` 才開；規則沒有這個常數（11/10 晚 `risset.js` 還沒有）或為 false＝現行盲區版。
  - 開著時：靜音用的時段傳空（`wq`），節奏、音樂、衛兵、暗示、失控層、低音都照常；replan 也不因掩護窗取消拍；規則 `cycle.blind` 的強制靜音跳過。
  - 窗開頭 `coverHit`：各層第一拍同落（`COVER_LAYER_GAIN`）＋420／640 Hz 鼓皮聲、700／1100 Hz 帶通雜訊、95 Hz 身體；走 `rhythmBus`。
  - 殘響：`gateVS`（送量 0.28→0.85）、`gateVO`（輸出 0.6→1.1），窗前 0.02 秒推上去，窗結束 0.3 秒內收回。用同一個 `Gate` 類別，只是窗內值比平時高。
  - 警戒時（`bassMode`）：重合擊換成 0.9～1.4 kHz 的輕版，只打上半的層，不推殘響（讓出低音拍）。
  - 木魚預告乘 `lastState.visualAid`（< 0.02 不響）；「盲區提示」那一下不響。
  - 驗證：
    - 離線渲染：關閉狀態和現行一模一樣。開啟時窗內 RMS −15.5（窗前 −27.9）；窗開頭 300～1200 Hz 峰值 −3.6（窗前 −9.1）；窗內後半仍比窗前響 7 dB（尾巴）；窗後回到 −28.4。
    - 錄音各 60 秒：`out/cover-off` 8 項全過。`out/cover-on2`（劇本每 1.5 秒設 `game.T.COVER_MODE = true`）只有第 1 項不過，這是預期的：巡邏窗比前後響 2～7 dB。警戒低音拍 +13 dB 照過。
  - 待人耳與設計席：
    - 遊戲裡窗內只比前後響 2～7 dB（離線是 12 dB），因為循環尾端金屬層本來就最密最響，重擊夠不夠「最響」要聽。
    - 警戒窗用輕版，喇叭上分不分得出那一下。
    - 盲區前「節奏變亮」（`gateB`，+4 dB 高頻）沒拿掉，visualAid 淡出後它仍是隱性預告（1～3 kHz 約 +7 dB），要不要留。
