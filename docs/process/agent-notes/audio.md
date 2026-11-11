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
- 2026-11-09／11-10：`RissetRules.blindWindows(a, b, game)` 11/10 已匯出，回傳 **`{from, to, kind}`**（kind＝'blind'／'alert'）。聲音層原本只認 s/e、start/end、陣列，from/to 全被丟掉，結果清單是空的，而且「規則有這個函式」就不再自己預測。舊版靜音只靠 `cycle.blind` 連兩幀不一致的強制修正（晚、T 在變時漏掉三次盲區）；掩護版的重合擊與殘響從沒排上。11/10 晚已改成先讀 from/to，讀不懂才退回自己預測。**規則回傳格式一改，這裡就會默默失效**：改 `windowsBetween` 或規則格式時，跑一次錄音看第 1 項。
- 2026-11-10 夜（裁決 7.5）：**餘韻長度量的是全頻包絡**（窗前 1.0～0.15 秒包絡中位數 +3 dB），被低頻主導。中頻餘韻再加重也拉不長；短殘響太短（0.2 秒），長殘響又拖到 0.9 秒。可控的做法是：長殘響照推，窗結束時用 `gateVD` 把殘響輸出壓低。
- 2026-11-10 夜：離線渲染（關音樂層或開音樂層都一樣）會把餘韻高估約 0.3 秒，長度只能拿錄音調。另外，同一套程式的兩段錄音可以差 0.4 秒（0.5 對 0.9），看餘韻要看每次窗的明細，不要只看中位數。
- 2026-11-10 夜：兩段錄音同時跑，電腦會忙到掉幀（2111 → 660 幀、丟拍 12%），結果不能用。**一次只錄一段**。PowerShell 的工作目錄可能飄到 `out/`，指令前先 `Set-Location` 回 worktree 根目錄。
- 2026-11-10 夜：警戒輕版的 300～1200 Hz 突出靠的是 700～1200 Hz 的主體（`COVER_ALERT_BODY`），不是各層係數。上半層是手拍、金屬，能量多在 1200 Hz 以上，量不到。
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
- **11/10 晚：錄音與工具回報兩個問題，已修**（未提交，只改 `audio.js`）：
  - 根本原因同一個：規則 `blindWindows` 的 `{from, to}` 欄位沒讀到（見第 3 段）。修好後舊版靜音提前排好，掩護版的重合擊與推高殘響也真的排上了。
  - 殘響尾巴加中頻：`coverHit` 多兩層帶通雜訊（850 Hz、1700 Hz），約 0.6 秒收掉，新常數 `COVER_TAIL_GAIN` 0.12。
  - 警戒窗的 `coverHit` 改看規則的 `kind === 'alert'`（沒有 kind 才看 `bassMode`）。
  - 驗證：
    - `node --test` 242 過。
    - 錄音各 60 秒（`--cover gap|cover`，`out/fix-gap`、`out/fix-cover`），兩版都全過。
    - 舊版盲區：最少壓低 29.4 dB，原本三次只有 −0.6～9 dB。
    - 掩護版：重合擊突出 +24.1 dB（原 +12.6）；殘響中位 1.3 秒，喇叭模擬 0.7 秒、最短 0.6 秒（原 0.10，門檻 0.12）；整體比前後 +9.4 dB。
  - 待設計席／人耳：
    - 掩護版殘響現在長到 1.3 秒（推高的殘響本身的尾巴），會不會糊成一片、分不出窗結束。要短就把 `COVER_VERB_RELEASE` 調小或 `COVER_VERB_OUT` 調低。
    - 警戒窗突出只有 3.8 dB、殘響 0.1 秒（刻意輕，讓出低音拍），喇叭上分不分得出。
- **11/10 夜：裁決第 7 節（7.3、7.5）已實作**（未提交；改 `audio.js` +39／−14、`audio-test.html` +4）：
  - 7.3：新常數 `COVER_BRIGHT_DB` 4，殘響掩護下取代 `BRIGHT_DB`，不乘 visualAid。每次排程讀一次，改了就重排 `gateB`。試聽頁加「殘響掩護」勾選與「窗前變亮」0～6 dB 滑桿（直接寫 `audio.CONST.COVER_BRIGHT_DB`）。
  - 7.5：`COVER_VERB_RELEASE` 0.12、`COVER_VERB_OUT` 0.9、`COVER_VERB_HOLD` 0.3（送量只推窗前半）。光這樣餘韻還是 0.9 秒，所以另加 `gateVD`：窗結束時殘響輸出壓到 0.3 倍，維持 0.4 秒、0.35 秒回來（常數 `COVER_VERB_DUCK*`）。試過「重合擊走專用短殘響」，餘韻只剩 0.2～0.4 秒，已拿掉。`COVER_TAIL_GAIN` 0.12→0.25、新常數 `COVER_TAIL_SEC` 0.8。
  - 警戒輕版：新常數 `COVER_ALERT_GAIN` 0.85（套整記），加 `COVER_ALERT_BODY` 1.1（900 Hz 三角波＋950 Hz 帶通雜訊）。
  - 腳步：甲版那次只差 10.6 dB，是樣本問題。唯一那步不合拍腳步落在掩護窗裡，被重擊蓋住。後面幾段錄音有 8～10 步，差 16.7～18.2 dB，都過，音色沒改。
  - 驗收（錄音各 60 秒，一次只錄一段）：
    - `out/v75-cover7`：重擊突出原始 +22.9／喇叭模擬 +23.2 dB（≥ 12 過）。餘韻中位原始 0.6／喇叭模擬 0.6 秒（0.5～0.8 過），每窗 0.17～0.87 秒，其中兩窗偏短。
    - `out/v75-gap2`：留空檔版 8 項全過。
    - 警戒輕版：這輪錄音都沒進警戒，只有離線數字。突出中位 10.8 dB（最小 9.3，≥ 8 過，原 2.8）；低音拍突出只掉約 1 dB（在渲染隨機誤差內）。**還要一段有警戒的錄音確認。**
  - 測試：249 過。`prototypes/layer-ride/`（別的角色正在做、未提交的乙版原型）有 2 項規則測試不過（A3、A10），和本次無關。它的 `audio.js` 照檔名屬聲音角色範圍，但不是我建的，沒動。
- **11/10 夜：裁決 7.9「新訊號強調」**（11/11 整夜錄音跑完後已放進 `audio.js`，直接覆蓋，基準沒變）：
  - 成品在工作階段暫存區：`audio-79.js`、`audio-test-79.html`、補丁 `intro-79-audio.patch`、`intro-79-audio-test.patch`。基準是提交 65cb356 的 `audio.js`（blob ab29920）。放進來時先確認 `audio.js` 沒被別人改過，沒改就直接覆蓋，改過就套補丁。
  - 新常數 `INTRO_BOOST_DB` 4、`INTRO_CYCLES` 1、`INTRO_COVER_ZONE` 2，區號讀規則的 `state.zone`。
    - 重合擊：殘響掩護版進第 2 區後的前 1 記（不含警戒窗）×1.58，就是 +4 dB。
    - 低音拍：**整局**第一次起疑後（不限區），從低音第一拍起 1 個循環（循環長讀規則的 `cycle.T`）。
    - 其他聲音都不動。換一局（state 換成新物件）就重來。
  - 解讀：7.9 寫「該區第一個循環」，但安撫要等起疑才出現。總控 11/10 夜裁定：從「整局第一次起疑」起算、不綁區號（第一次聽到那個新訊號時加強），所以 `INTRO_CALM_ZONE` 拿掉了。
  - 試聽頁：加區號選單、「新訊號強調」0～8 dB 滑桿。state 改成同一個物件每幀更新，否則會被當成每幀換一局。
  - 驗證（離線渲染＋無頭試聽頁）：第 1 區的重合擊沒加強，進第 2 區第一記 ×1.58，之後的警戒窗照常；起疑後 13.5、15.9、18.3 秒三拍加強；設成 0 就完全不加強；試聽頁沒有錯誤。放進 repo 後要跑全套測試，並錄一段殘響掩護版。
- **11/11：整夜驗證兩項聲音不過，已修**（未提交；`audio.js`、`audio-test.html`，含 7.9）：
  - 警戒輕版：整夜錄音 7.3／7.6 dB，離線卻量到 10.8，差在背景。警戒越久，失控層亂拍、失真（alarm 0.5→0.8）、安撫哼唱和音樂層都會墊高 300～1200 Hz；我離線時把這些都關了。另外那次 12.3 dB 的窗是碰上失控層一記亂拍，峰值被墊高。`COVER_ALERT_BODY` 1.1→1.7（約 +3.8 dB）。
  - 餘韻（喇叭模擬 0.49 秒）：`COVER_TAIL_GAIN` 0.25→0.35，只加重中頻，殘響壓低量沒動，免得原始錄音超過 0.8。
  - 驗收（錄音 90 秒，一次只錄一段；預設錄音玩家會引起警戒）：
    - `out/r1111-cover1`：警戒輕版原始 +9.4／喇叭模擬 +10.6 dB；餘韻 0.6／0.6 秒；重擊突出 +23.5／+23.4 dB；警戒低音拍原始 +14 dB（最小 8.9）、喇叭模擬 +17.4 dB。
    - `out/r1111-cover2`：警戒輕版 +9.8／+10.2 dB；餘韻 0.6／0.6 秒；重擊突出 +23／+23 dB；警戒低音拍 +15.5 dB。
    - 7.9 有錄到：進第 2 區後第一記重合擊突出 27.5 dB，其他一般窗中位約 23 dB。
    - `out/r1111-gap1`：留空檔版全過，警戒低音拍 +16.5 dB（整夜那次 +13.6，7.9 的起疑加強兩版都有）。
    - `node --test` 274 過。
  - 陷阱：離線量警戒窗要開音樂層、模擬 alarm 慢慢升高，否則會高估約 3 dB。
- **11/11：木馬第 2 批（聲音）已做**（未提交；改 `audio.js`、`audio-test.html`，新增 `audio.test.js`；設計 `2026-11-11-trojan-horse-directions.md` 方向 A、C2）。全部只在規則 `T.HORSE_MODE === true` 時發生：
  - A 腹中：
    - 節奏線（含重合擊、殘響、失控層）並聯一條兩級低通（`BELLY_LOWPASS_HZ` 1200，每八度 24 dB）。開關關著時低通路徑音量是 0，輸出逐樣本不變。一級低通 1200 Hz 以上只少 3 dB，聽不出隔著木板，所以改兩級。
    - 起步 `step_masked`（`start: true`、`n`）加里拉琴音 `BELLY_STEP_NOTES` 62→64→67→69。
    - `belly_hush`：木板空心「咚」＋氣音。`belly_ready`：主題前四音。
    - `trapdoor_open`：木栓滑開＋卡到底一聲，低通在 `BELLY_OPEN_SEC` 0.6 秒內掃到 18 kHz 再切回乾路徑。規則的 `belly.open` 也會觸發，只開一次。
  - C2 木馬共鳴：一般掩護窗那一擊，從 `level.horse` 中心發一聲（HRTF 只管方向）。
    - 音量 `horseBoomGain(d)`＝`HORSE_BOOM_GAIN`×(1 − d/R)²，R＝`HORSE_BOOM_R` 25 公尺外為 0。
    - 音色：330→200 Hz 低鳴＋380 Hz、750 Hz 帶通（能量放在 300 Hz 以上）。比那一擊晚 `HORSE_BOOM_DELAY` 0.07 秒，像空心木箱被敲後才共振。`HORSE_BOOM_MIX` 7 是內部混音倍數。
    - 腹中、警戒窗不發。警戒窗不發是我加的：低鳴會蓋到 200～600 Hz 的低音拍。
  - 對外介面：`setBellyLowpass(true|false|null)`、`horseInfo()`（`dist`、`boomGain`、`lowpass`、`lastBoom`），模組另匯出 `horseBoomGain`。試聽頁加木馬面板：開關、在腹中、低通照規則／強制開／強制關、離木馬 0～40 公尺、讀數。
  - 驗證：
    - CI 全套 299 過（原 294 條＋新 `audio.test.js` 5 條：音量隨距離單調遞減、R 外為 0、壞值為 0）。新測試抓到一個錯：`null >= 0` 在 JS 是真，已改先擋型別。
    - 開關關著，離線固定亂數比新舊版：殘響掩護版各頻段 0.000 dB；留空檔版高頻 ≤ 0.08 dB，舊版對舊版也有同樣誤差，是渲染本身的。
    - 共鳴（離線，那一擊後 0.5 秒 300～1200 Hz 比窗前）：貼著木馬 2 公尺 +14.4、12 公尺 +11.6、30 公尺 +10.7，差 3.7 dB；峰值 −0.87 dBFS 沒變，不爆音。
    - 腹中低通：2400 Hz 以上少 20.6 dB，1200 Hz 以下 +0.2 dB（骨幹還在）。暗門打開後 0.4 秒內回到和腹外相差 ±0.2 dB。
    - 錄音（開關關著，殘響掩護版 90 秒）：`out/horse2-off-cover` 全過。同條件換回提交版 `audio.js` 錄 `out/horse2-head-cover` 對照，各頻段差 0～0.7 dB；同版本兩段錄音本身會差到 1.1 dB（程式玩家走法不同）。巡邏中高頻比 11/11 早上響約 2 dB，提交版也一樣，是規則與畫面第 1 批造成的，不是聲音。
  - 陷阱：
    - 共鳴的突出量**不能用峰值量**：峰值永遠是重合擊本身，共鳴要比重擊還響才量得到，那就違反設計。改量那一擊後 0.5 秒的能量。
    - 繞過總輸出壓縮器試過，量起來沒差，已改回經壓縮器。
  - 要轉別人：
    - 畫面：`?lab=belly` 面板的低通那行接 `audio.setBellyLowpass` 與 `horseInfo()`；`?lab=horse` 面板顯示 `horseInfo().dist`、`boomGain`。
    - 規則：還沒有 `?lab=horse` 入口（`createLevel` 只認 `lab: 'belly'`）。
    - 錄音與工具：共鳴量測要站到木馬旁和 30 公尺外，量法用那一擊後 0.5 秒能量，不用峰值。
- **11/11：木馬第 3 批（C3 結尾）聲音已做**（未提交；改 `audio.js`，`audio.test.js` 加 1 條）：
  - `horse_signal`（規則在城門開後下一個掩護窗開頭發；只在 HORSE_MODE 開）：那一擊照常走節奏線。另發：
    - 木馬共鳴：固定用 `HORSE_BOOM_GAIN`。玩家在城門口，按距離算會是 0，這一次照貼著木馬發。
    - 同伴 4 人依序落地：`HORSE_LAND_FALL` 0.4＋i×`HORSE_LAND_GAP` 0.45 秒，和畫面的 CIN_FALL、CIN_GAP 同值，有測試檢查兩邊一致。
    - 0.9 秒後接主題前四音（里拉琴，和腹中 `belly_ready` 同一句）。
  - 以上全走 `sigBus`。新介面 `stopHorseSignal(fade)`：0.3 秒內收掉，下一次 `horse_signal` 自動重新打開。事件若帶 `delay`，落地時間照它延後。
  - 驗證：
    - 全套 302 過（301＋1）。
    - 離線：結尾那一擊照常（6.00 秒的重合擊）。那一擊加共鳴整體 +7.3 dB；6.8 秒呼叫收掉後，後面兩段和「沒發」相同（−28.8 dB）；開關關著收到 `horse_signal` 也不發聲。
    - 開關關著比提交版：兩版各頻段 0.000 dB。
    - 錄音 `out/horse3-off-cover` 全過。`compare-bands.mjs` 對 `horse2-off-cover`：第 2 區差 0.1～1.0 dB；第 1 區差大，是兩段程式玩家在那裡發生的事不同（起疑 2 次對 1 次），而且只有 5～7 秒。
  - 要轉畫面：`cinFinish()`（跳過與自然演完都會呼叫）加一行 `audio.stopHorseSignal && audio.stopHorseSignal()`。自然演完時主題已在收尾，收掉不突兀。
- **11/11 C3 補充裁決**：`horse_signal` 那一擊同時加一聲衛兵倒地悶響（75→40 Hz 正弦＋250 Hz 低通雜訊，走 `sigBus`，可一起收掉）。常數 `HORSE_SIGNAL_DOWN_GAIN` 0.5。
  - 離線量那一擊前後 0.5 秒，有悶響比沒悶響：0.18 時量不出（±0.07，等於渲染誤差）；0.9 時 250 Hz 以下才 +0.2 dB。重擊加共鳴的低頻很滿，悶響本來就會被蓋住，符合「不另外突出」；倒下主要靠畫面，聲音只補身體感。
  - 全套 302 過。開關關著比提交版：殘響掩護版 0.000 dB，留空檔版高頻 ±0.08 dB（渲染誤差）。開關關著的路徑沒動，所以沒重錄。
- **11/11：木馬共鳴修正（錄音工具 `--horse-test` 實測，貼近時共鳴峰值比重合擊高 14.4 dB）**（未提交；改 `audio.js`，`audio.test.js` 加 1 條）：
  - 查證：遊戲裡沒有重複排程，每窗只排一記重擊、一聲共鳴（`?lab=horse` 開排程紀錄實測）；也沒走錯音軌。單純是 `HORSE_BOOM_MIX` 7 太大。同係數下離線估「共鳴比重擊」6.8 dB、遊戲 14.4 dB，**離線會低估約 8 dB，共鳴只能用 `--horse-test` 錄音調**。
  - 改法：
    - 共鳴改成平包絡：`HORSE_BOOM_RISE` 0.08 秒推上、維持到 `HORSE_BOOM_HOLD` 0.35、`HORSE_BOOM_END` 0.6 收掉；各成分自己衰減拉長到 3 秒，形狀交給外層。指數衰減峰值高、平均低，兩個條件的餘裕都只有 0.3～1.7 dB。
    - `HORSE_BOOM_MIX` 7→0.63。
    - C3 結尾那次改用 `horseBoomGain(HORSE_SIGNAL_REF_M=3)`（0.387），不用最大 0.5；測試守住「C3 音量 ≤ 錄音驗過的 2.5 m 音量」。
  - 驗收（`--horse-test` 120 秒，`out/boom-fix6`、`boom-fix7`）：
    - 原始：近遠差 5.0／4.8 dB（≥ 3），共鳴比重擊低 4.7／4.0 dB。
    - 喇叭模擬：近遠差 4.0／4.1 dB，共鳴比重擊低 5.1／5.1 dB。
    - 過程：7 倍 +14.4（工具）→ 1.4 倍舊形狀 +4.3 → 0.75 倍舊形狀 −1.7／−0.3（兩次差 1.4 dB，太薄）→ 平包絡 0.75 倍近遠差 5.9、−1.7 → 0.63 倍定案。
  - 全套 303 過；開關關著比提交版兩版各頻段 0.000 dB。C3 衛兵倒地悶響已由總控在 04f7ac0 提交，這輪沒動。
- **11/11：加速感試聽三版**（未提交；改 `audio.js` +33、`audio-test.html` +24；設計 `2026-11-11-illusion-not-heard.md` 第 3.1、6.1 節）：
  - 聲音層：`setIllusion({timbre, bell})`、`illusionInfo()`。預設兩個都關，所有分支都不走。
    - S1 `timbre`：所有層與重合擊各層第一拍都用 `ILL_TIMBRE_X` 0.375 的音色（`playHit` 純框鼓）。
    - S2 `bell`：`beatGain` 改用不對稱鐘形（`ILL_CENTER` 0.62、`ILL_SIG_FAST` 0.30、`ILL_SIG_SLOW` 0.16），**每個瞬間把四層總和縮放回現行的總和**。這樣總和起伏和現行完全一樣（0.015 dB）；單拍最大 0.99（現行 1），最響一擊仍是全場最大聲。
    - S2 起點值就讓「聽得到最快」翻倍，沒有再調。
    - 規則的 `layerGain`、遊戲本體都沒動。
  - 試聽頁：「加速感試聽」面板，版本（現行／S1／S2／S3）、循環（10 原本／12／6，換了重建聲音層），即時顯示最大聲那層與聽得到最快（≥ −12 dB）的每分鐘拍數、各層 dB。網址 `?ill=s1|s2|s3&cycle=12|6` 可預選，選試聽版會打開殘響掩護。
  - 三版速度（一個循環內的範圍，每分鐘拍數；S1 同現行，S3 同 S2）：

    | 版本 | 12 秒：最大聲那層 | 12 秒：聽得到最快 | 6 秒：最大聲那層 | 6 秒：聽得到最快 |
    |---|---|---|---|---|
    | 現行、S1 | 69～137 | 99～199 | 137～274 | 199～397 |
    | S2、S3 | 106～213 | 191～381 | 213～425 | 382～762 |

  - 驗證：預設輸出和提交版逐頻段 0.000 dB（兩種模式）；全套 303 過；無頭瀏覽器開 `?ill=s3&cycle=12`，預選、讀數、切版本都正常，沒有錯誤。
- **11/11 晚：加速感第二輪試聽 U1～U4**（未提交；`audio.js` +54、`audio-test.html` 改面板；設計同文件第 7.3 節）：
  - 面板：現行、S3（對照）、U1～U4；網址 `?ill=s3|u1|u2|u3|u4&cycle=12|6`。讀數多了「現在聽得到幾條鼓」「結尾那一刻最快那條 dB」。S1、S2 從選單拿掉（`ILL` 表還在）。
  - 聲音層：`setIllusion({ u, pitch, rise, roll, shep })`。`u` 開時層數 6（`layerCount` 包一層，原本的改名 `baseLayerCount`）、同一種鼓、低於 `ILL_U_MIN_GAIN` 0.003 才不排（現行 0.02 在進場有 −34 dB 小斷崖）。`beatGain` 拆出 `curGain`（現行，層數照規則），U 版每個瞬間把 6 層總和縮放回現行 4 層總和。
    - U1 參數：起點中心 0.55／寬 0.15 離線算出結尾最快那條 −77 dB（OK）但只有 2～3 條在 −12 dB 內、最大聲那條 169～338 拍。改成 **中心 0.52、寬 0.21**：進場 −53、結尾 −45 dB，任何時刻 3～4 條，最大聲那條 149～298 拍。
    - **「最大聲那條 150～250 拍」不可能每個瞬間都成立**：每層快一倍，一個循環裡最大聲那條一定在兩倍範圍內換手，150～250 只有 1.67 倍。改把範圍中間值（約 211）放進去。
    - U2：音高倍數 `ILL_PITCH` [1, 1.1225, 1.3348]（全音、再小三度），同一條鼓＝ c − k 不變，新進場的拿下一個音高；`playHit` 第 5 個參數乘進 `jit`，重合擊各層第一拍也照。
    - U3：U2＋每條鼓從進場到退場再升 `ILL_RISE_ST` 5 個半音（框鼓的「啪」900→1200 Hz，在 800 Hz 以上）＋謝帕德音階不分區打開。警戒時音樂層本來就有低切（`musicHP`），不蓋低音拍。
    - U4：U2＋最快那條從 `ILL_ROLL_FROM` 0.75 起依 dB 等速漸強到最大聲那條，循環結尾 0 dB，換輪時自然消失（重合擊落下）。
  - 讀數（用真的 `illusionInfo` 掃一整輪）：

    | 版本 | 12 秒：最大聲那條 | 12 秒：聽得到最快 | 6 秒：最大聲那條 | 6 秒：聽得到最快 | 聽得到幾條 | 結尾最快那條 |
    |---|---|---|---|---|---|---|
    | 現行 | 69～137 | 99～199 | 137～274 | 199～397 | 2～3 | −44.9 dB |
    | S3 | 106～212 | 191～381 | 213～425 | 382～762 | 2～3 | −12.3 dB |
    | U1、U2、U3 | 149～298 | 309～617 | 298～596 | 618～1233 | 3～4 | −45.3 dB |
    | U4 | 149～298 | 309～1550 | 298～596 | 618～3100 | 3～4 | 0 dB（故意） |

  - 實際渲染（只有節奏線、殘響掩護）：最響的一擊比其他時間峰值高 1.9～2.8 dB（S3 1.1、現行 6.8～7.7）；每秒音量起伏 U 版 3.7～7.0 dB，比現行 12.8～18.2 小；整段音量 U1 比現行大約 5 dB（S3 也大 4 dB，拍子變密）。U4 最後一秒比 U2 大約 2～4 dB。
  - 要注意：6 秒循環時 U 版最快聽得到的那條每秒 10～20 下，近乎滾奏。
  - 驗證：預設下 20 秒內每一拍的時間、層、音量和提交版完全相同（差異只在渲染結束後才排的拍）；波形差 2.4e-5，和同一份檔案自己比（≤ 1.7e-3）同等級。全套 314 過；無頭瀏覽器開 `?ill=u4&cycle=12` 預選、切 u1～u3、s3、讀數都對，沒有錯誤。
- **11/11 晚：查「一直走動時預告音 2/8 次只比前一秒高 4～6 dB」**（`out/fullrun-1111-b`，只查不改）：
  - 原因：**不是走動，是設計上第 4 區就沒有木魚了**。殘響掩護版的木魚預告會乘上規則的 `visualAid`（`risset.js` 的 `visualAidFor`：第 0～2 區 1、第 3 區 0.5、第 4 區 0；設計席 7.9），`audio.js` 的 `preBlind` 在 va < 0.02 時整個不響。
  - 對時間：第 2 區兩次 +21 dB（峰值 −28）；第 3 區兩次 +15 dB（峰值 −32～−33，比第 2 區低約 5 dB，和 va 0.5 的 −6 dB 相符）；第 4 區（23.3 秒起）四次 +3.9～+6.8 dB，峰值 −42～−46，只是鼓聲本身的起伏。報告裡「2/8 次低於 6 dB」就是第 4 區那四次中的兩次。
  - 建議給錄音與工具角色：`preBlindMid` 檢查只算 visualAid > 0 的盲區（或第 4 區另列），否則殘響掩護版跑完全流程一定判不過。聲音這邊不用改。
- **11/11 晚：跑、蹲、屏息聽的聲音**（未提交；`audio.js` +100、`audio.test.js` +3 條；設計 `2026-11-11-companion-mechanics.md` 第 7.3 A1／A2／C1、7.4；規則 6b24827）：
  - 開關：`movesOn()`＝`RK().MOVES_MODE === true`。所有新聲音、屏息聽、蹲走變輕都只在開著時；關著時鼓拍、衛兵 panner 照舊直接接 `rhythmBus`／`guardOut`（不經新節點），新事件直接 return。
  - 跑：`runStep{masked}`：masked＝悶的一下（`RUN_MASKED_GAIN` 0.09，峰值 −37 dB）；沒蓋住＝清楚腳步 ×`RUN_LOUD_MUL` 1.3＋腳跟低悶＋碎石＋最近 8 m 衛兵吸氣（峰值 −0.9 dB，走路離拍 −2.2）。`runStart` 用力吸一口、`runStop` 吐長氣；跑的時候每 `RUN_PANT_GAP` 0.5 秒輕喘（update 看 `state.player.running`）。
  - 蹲：`step_masked`／`step_loud` 帶 `crouch: true` → ×`CROUCH_STEP_MUL` 0.5、合拍的低通再悶一點；離拍的衛兵吸氣只在 `CROUCH_R`（讀規則，1.2 m）內。峰值：合拍 −45.2（站 −42.2）、離拍 −8.2（站 −2.2）。`crouchOn`／`crouchOff` 衣料聲很輕（−33 dB）。
  - C1 屏息聽（`state.player.breathing`）：一般鼓拍改走 `beatBus`，屏息時 −`LISTEN_DUCK_DB` 6 dB（規則沒這個常數，用本檔的）；重合擊照舊直接進 `rhythmBus`，**不退**。衛兵 panner 接 `guardListen` +6 dB（腳步和呼吸一起，衛兵聲只有這兩種），側向距離 ×`LISTEN_WIDEN` 2（`guardPos`）。退後時間常數 0.08、回復 0.06（放開 0.3 秒後 0.997）。`listenInfo()` 給試驗場看狀態。
  - 驗證：開關關著（沒有 MOVES_MODE 或 false，屏息中、有衛兵、發新事件）和改之前波形差 ≤ 1.9e-5（自己比 1.2e-5～3.1e-5），排程紀錄完全相同。開著：一般鼓拍屏息時 −6.00／−5.73 dB；最響的一擊峰值屏息前後都是 0.905，比屏息時其他時間高 14.3 dB。全套 317 過。
  - 沒做到的：衛兵聲 +6 dB 只用節點音量驗（`listenInfo`），渲染時測試場景的衛兵聲太小、被暗示聲蓋住，量不出來；要用錄音工具在 `?lab=listen` 量。
