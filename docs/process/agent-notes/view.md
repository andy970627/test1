# 角色筆記：畫面

負責：`prototypes/*/index.html`（含 11/10 新增的 `layer-ride/`）、`prototypes/nav.js`、`prototypes/telemetry.js`。
規則檔（`risset.js`／`rules.js`／`vengeance.js` 與測試）、`audio.js`、`tools/` 都不是我的；要改就回訊主對話。

## 1. 檔案結構與入口

### 共通
- 原型 `index.html` 是 **HTML 片段**（開頭是 `<title>`，沒有 doctype）。打包工具 `tools/build-itch.mjs` 和錄音工具的伺服器（`record.mjs` 的 `wrapFragment`）會自動包上 doctype／charset／viewport 外殼；claude.ai 試玩頁發布時平台也會包。**不要自己加 doctype**，加了打包工具就不再包。
- 載入順序（木馬之夜、大廳復仇）：`../nav.js` → 用 `document.write` 載 telemetry（claude.ai 沙盒載同目錄 `telemetry.js`，其他載 `../telemetry.js`）→ three.js r128（cdnjs）→ `audio.js` → 規則檔 → 頁面主程式（IIFE，`'use strict'`）。
- 比箭 Risset 版沒接 telemetry（只載 `../nav.js`）。
- 總首頁是 `prototypes/index.html`；`odyssey-series/index.html` 是系列章節選單；`beggar-hall`、`bow-contest` 是舊原型（對照組，本週不動）。

### 木馬之夜 `troy-prologue/index.html`（1829 行）
- 規則全域 `window.RissetRules`（頁內叫 `Rules`），聲音 `window.RissetAudio`；常數一律 `K()` ＝ `game.T || Rules.T`，`num(...)` 取第一個有限數當備援。
- 主迴圈 `loop()`（約 1222 行）：`audio.now()` → `game.step(t, readInput())` → `collectBeats(t)` → `audio.setListener` → `audio.update(game)` → 盲區開頭 `audio.cue('blind')` → `drain()` → `telFrame(dt)` → `worldHints(t)` → `sync()` 算畫面 → `hud()` → `telHud()`。
- `readInput()`：組 `{yaw, mx, mz, breath, dash, takedown, calm, actAt, calmAt, interact, start}`；`pend` 是只維持一幀的按下事件，`actAt` 和 `telNow()` 同一公式（`currentTime − outputLatency`）。
- `drain()`：取走 `game.out`，先 `telOut()` 原樣記，再分派 `sfx`（`audio.cue`；`step_loud` 衛兵側頭、`step_masked` 腳印發亮）、`hint`（`queueHint`，≥2 階記 `HW.lastLadder`）、`msg`（`showMsg`）。p 高時用 `lag()` 慢 `DESYNC_LAG`。
- 提示排隊：`queueHint`／`nextHint`／`showHint`，`HINT_MIN 4000`、`HINT_SKIP 1200`、`HINT_LAST 7000`（毫秒，畫面節奏，不是規則數字）；`keyText` 把鍵名框起來。
- 視覺輔助：`aidTarget()`（開關 `#oAid` on/off/auto，auto 讀 `game.visualAid`，沒有就 0、1 區＝1、2 區＝0.5、其後 0）；`visPhase()` 以 `cycle.anchor` 外推相位（和聲音層同公式）；`collectBeats()` 優先用 `Rules.beatsBetween`，沒有才用相位估；`visFrame()` 做盲區凝結、隨拍跳動、月亮相位鐘；`hintVisuals()` 做同伴的手、感知光圈。
- 世界內暗示 `worldHints()`：讀 `Rules.hintSignals(g)`（`breathWarn`、`blindIn`、`guards[]`、`latch`），觸發同伴倒吸氣、「就是現在」、衛兵低吼、門閂「喀」。
- 開局 `startFromTop()` → `makeAudio()` → `newGame()`（`Rules.createLevel(opts)`）→ `telStart()`；重來 `retryZone()`（`game.retry()`）；回開場 `backToIntro()`。
- 除錯物件 `window.TroyDebug`（`game`、`audio`、`actx`、`hintState`、`V`、`keys`、`scene`、`vis`、`hw`、`collectBeats`、`telemetry`），自動驗證用。

### 大廳復仇 `vengeance/index.html`（1018 行）
- 規則 `Rules`（`vengeance.js`），`K = Rules.T`；難度常數 `Rules.constantsFor(difficulty)`、`Rules.DIFFICULTY[d].label`。
- 主迴圈 `loop(now)`（約 678 行）：`Rules.step(game, t, input)`，事件逐筆進 `onEvent(e)`（`switch e.type`），`onHint` 走暗示階梯；`updateHud(t)` 讀 `Rules.bassBeatNear`、`activeAttacks`、`hintLevel`、`leadersLeft`。
- 開局 `startGame()`（`Rules.createGame({t0, seed, hints, difficulty, dynamic})`）、`onWin`／`onFail`、`backToIntro`；輸入 `shootNow()`、`teleNow()`（Q／右鍵舉盾）。除錯物件 `VengeanceDebug`。

### 比箭 Risset 版 `bow-risset/index.html`（1047 行）
- 規則 `BowRissetRules`（頁內 `R`），聲音 `BowRissetAudio`；`update(dt)` → `onEvents(evs)`（`heckleCue`、`dropStart`、`fire`、`pass`、`stop`、`result`、`hint`…）→ `render()`；`loop(now)` 約 978 行。
- 文字從 `R.TEXT` 取（例如 `dropWord`）。`?debug` 或錄音工具注入 `window.__rec` 時開除錯，`window.__bowEvents` 收事件。

### `nav.js`
- `OdysseyNav.hubUrl()／hasHub()／goHub()`。總首頁＝本檔同層 `index.html`；在 claude.ai 沙盒改用 `HUB_ARTIFACT`（目前空字串 → 回總首頁按鈕隱藏）。

### `telemetry.js`
- UMD：瀏覽器 `window.Telemetry`，Node `module.exports`（`tools/telemetry/summarize.mjs` 與測試共用）。純邏輯，只有匯出時碰 DOM。
- 常數在檔頭：`SCHEMA 'odyssey-telemetry/1'`、`STORE_KEY 'odyssey.telemetry.v1'`、`MAX_RUNS 20`、`MAX_EVENTS／MAX_INPUTS 8000`、`SAVE_EVERY_MS 5000`、`BLIND_OFF_MAX 1.0`、`BLIND_FAIL_WIN 1.5`。
- `summarizeRun(run)` 是唯一算摘要的地方（即時面板、匯出、summarize.mjs 共用）。`create(cfg)` 可傳假 storage 與時鐘給測試用。

## 2. 介面約定

### 畫面從規則讀的東西（不抄常數，總綱原則第 7、12 條）
- 狀態：`game.phase`（intro/play/fail/win）、`zone`、`cycle`（`T`、`p`、`blind`、`index`、`start`、`blindFrom`、`alertBlind`、`fake`、`nextFake`、`desync`、`anchor{t,p,T,index,start}`）、`bass{anchor, period}`、`panic.active`、`hunted`、`player`、`guards[]`（`state`、`susp`、`active`）、`level`、`visualAid`、`failCode`／`failReason`、`retries`。
- 函式：`createLevel`、`step`、`retry`、`start`、`beatsBetween(a, b, game, {minGain})`、`bassBeatNear(at, anchor, period, win)`、`radiusAt(p, alert, k)`、`hintSignals(g)`、`blindLen()`、`layerGain`／`layerCount`／`layerBeats`（都有 `typeof` 檢查與備援）。
- 常數（`K()`）：`CYCLE`、`BLIND_LEN`、`BASS_PERIOD`、`BASS_WIN`、`MASK_GAIN`、`HIGH_P`、`GATE_LOW_P`、`LATCH_R`、`STEP_R`、`DESYNC_P`、`DESYNC_LAG`、`BEAT_MIN_GAIN`。
- 事件 `game.out`（木馬之夜）：`{type:'sfx', a, x, z, beatT, index}`（`step_masked`／`step_loud`／`calm_ok`／`calm_bad`／`calm_done`／`latch_step`／`takedown`／`down`／`hunt`／`caught`…）、`{type:'hint', a, key, level}`、`{type:'msg', a}`。大廳復仇直接用 `e.type` 當名稱（`shoot`、`tele_ok`、`tele_miss`、`attack_warn`、`hint{key, level, text, keys}`、`cycle{len, beats}`…）。
- **提示文字一律來自規則事件或規則常數**（`e.a`、`e.text`、`R.TEXT`）；畫面只負責排隊、框鍵名、淡入淡出。
- 每個跟拍輸入都要有畫面呈現（總綱第 5、6 節）：盲區凝結、月亮相位鐘、衛兵火焰低音心跳、合拍腳印、出聲時衛兵側頭、盾牌低音反光、攻擊那一側火把閃。強度乘 `visualAid`。

### 畫面給聲音的東西：11/28 新開場的掛點（照聲音角色 a7b5f7d 的介面）
- 序（黑底一次一句，`STORY_CARDS.prologue`）：每換一句叫 `audio.raw.storyCue(name)`（`audio` 是畫面的包裝，模組本體在 `.raw`）；**跳過**（略過鈕或 Esc）時叫 `audio.raw.storyCueStop(0.3)`；自然播完不叫，最後一句的 `feast` 傳 `{dur}`（至少撐到序結束）。同時記在 `game.storyCue`／`game.storyCueN`（每換一句加 1）給自動驗證讀。整段序 `game.story` 仍是 `'intro'`（隔木板悶聲照舊；序聲音走自己的匯流排不受影響）。
  - `cart`「黃昏。特洛伊人拉著粗繩，把木馬拖進城門。」
  - `gate`「城門在木馬身後關上。」
  - `cheer`「全城點起火把，歌聲和鼓聲一路傳到城牆。」
  - （不放新聲音）「夜深了。火把一支支熄滅，醉倒的人睡在街上。」
  - `feast`「木馬肚子裡，有人屏住了呼吸。」：祭典的鼓隔著木板，聽的位置換到木馬肚子裡
- 每句停 `max(3.4 秒, 那段聲音長度 − 0.6 秒)`，長度讀 `RissetAudio.STORY_CUES`；最後一句 5 秒。五句約 21 秒，點擊或空白鍵提早換。
- 腹中四步：`TroyDebug.intro.step` 1 聽／2 跟著他敲（校準，`TroyDebug.calib.mode === 'belly'`，遊戲總音量壓到 6%，校準拍由另一個 `createAudio` 聲音層的 `calibClicks` 出）／3 踩著它走（預告圈）／4 暗門開（規則的 `trapdoor_open`）。第二批的「只剩低鼓」低通可以照 `step` 1、2 開、`trapdoor_open` 收。
- 鏡頭動畫（`?intro=cam`）：演出時 `game.story === 'cam'`（聲音不認這個值＝照常出聲）；聲音角色要配樂再約名稱。

### 畫面給 telemetry 的東西（`docs/design/2026-11-08-telemetry.md`）
- `Telemetry.start({proto, version, device, env, clock})`：`proto` 為 `troy-prologue`／`vengeance`；`version` 取 `<meta name="odyssey-build">` 或 `window.ODYSSEY_BUILD`，沒有就 `dev`（打包工具目前還沒寫入，所以都是 dev）；`device` 取 `input[name="oDevice"]`（speaker/wired/bt/unknown）；`clock()` 回 `{t, ci, p, z}`（規則音訊時間、循環編號、相位、區域；大廳復仇 `z` 為 null）。
- `env`：`collectEnv({outputLatency, baseLatency, sampleRate, toggles:{phaseBar, visualAid, cycle, music, synthVol, trackVol}, query})`；開局 2 秒後再補一次延遲。
- 事件：`'out'`（規則事件原樣）、`'zone'{from, to}`、`'fail'{code, reason, zone}`、`'retry'{zone}`、`'win'{retries}`。
- 輸入：`Telemetry.input(code, actAt, {down, state, off})`。木馬之夜只記 `TEL_KEYS`（WASD、方向鍵、Space、Shift、E、Q、R、`Mouse2`）。`state`：`blind`｜`gap`｜`fake`｜`alert`｜`hunt`｜`patrol`（大廳復仇 `blind`｜`drum`）。`off`（秒，正＝晚按）：`bass`＝警戒中的 Q（大廳復仇 Q／Mouse2）對最近低音拍；`blind`＝Shift／E（大廳復仇放箭）對最近盲區開頭；`beat`＝對最近可聽鼓點（音量 ≥ `MASK_GAIN`）。
- 每幀 `Telemetry.tick(dt, {active, state, frameDt})`：dt 用規則音訊時間差；`active` 由 `telActive()`（N1 主動時間）判。
- 結束 `endRun({outcome})`：`win`｜`fail`（大廳復仇）｜`quit`｜`restart`｜`unload`。快問 `survey({drop, difficulty, fun, note, skipped, when})`，一局只問一次。
- 摘要欄位（`summarizeRun`）：`zones`、`fails`／`failCodes`、`blind{attempts, ok, rate, firstOk}`、`calm{ok, bad, rate, done, firstOk, firstDone}`、`steps{masked, loud, rate}`、`off{bass, blind, beat}`（n/mean/sd/median/min/max）、`activeRatio`、`timeByState`、`hints{total, byKey}`、`retries`、`survey`、`fpsMedian`、`dropped`。改欄位名要同步 `tools/telemetry/summarize.mjs`（錄音與工具角色）。
- 安撫與舉盾用正規式對照：`calm_ok|tele_ok`、`calm_bad|tele_miss`。新原型的事件名要對得上，否則摘要算不到。

### claude.ai 試玩頁（Artifact）
- 網址：木馬之夜 `https://claude.ai/artifact/DcxVU1LPbmcdPAfpvzEchb`、大廳復仇 `https://claude.ai/artifact/EjRjJij1T1HJxKgcFBaWxr`、比箭 Risset `https://claude.ai/artifact/9x7ZByRC7HyC1vFfvEyoxb`。
- 前兩個開了 `db`＋`user` 能力，集合 `runs` 讀寫權限 interact。頁面 `window.claude.use('db')` 拿到就 `Telemetry.setSink(r => db.doc('runs/' + r.runId).set(r))`，一局結束、填完快問自動上傳精簡版（事件、輸入各 ≤ 3000 筆，單筆上限 256 KiB）。
- **重新發布時 `capabilities` 省略＝沿用 `db`＋`user`**；傳 `{}` 會清掉，資料庫就斷了。
- 沙盒裡沒有上一層，`telemetry.js`、`audio.js`、規則檔要用 `files` 一起發布在**同一層**（published path `telemetry.js`、`audio.js`、`risset.js`／`vengeance.js`），否則頁面照玩但不記數據。
- 發布、分享試玩頁屬人工核准事項：寫進 `docs/process/approvals.md`「待核准」再回訊主對話，不自己發。

## 3. 陷阱
- （11/09）`index.html` 是片段，別加 doctype；直接雙擊開檔案沒有外殼，`[hidden]` 等樣式可能失效，要用打包或錄音工具的伺服器開。
- （11/09）錄音工具只服務單一原型資料夾，`../telemetry.js`、`../nav.js` 會 404：頁面照玩但不記數據、回總首頁按鈕隱藏。錄影要看摘要得改服務根目錄（錄音與工具角色的事）。
- （11/09）claude.ai 試玩頁靠 `document.write` 換路徑載 telemetry；改載入方式時兩條路徑都要測。重新發布漏帶 `telemetry.js` 或傳了 `capabilities: {}`，資料庫就沒有新數據，而且不會報錯。
- （11/09）大廳復仇 `vengeance/index.html` 535～537 行的難度說明把拍數、秒數、箭數、生命寫死在 HTML，違反「提示由常數生成」；規則改難度時會分家。待改成讀 `Rules.constantsFor(d)`（列入未完成）。
- （11/09）木馬之夜開場 `#oT` 選單的「10 秒／12 秒」是寫死的選項值；改循環長度時要一起看。
- （11/09）規則函式都用 `typeof Rules.x === 'function'` 包起來並有備援；規則角色改名或拿掉函式時畫面不會報錯，只會默默用備援估算。驗證時要確認 `TroyDebug.collectBeats` 的結果來自規則。
- （11/09）telemetry 的時間要用規則音訊時間（`game.time`），不要用 loop 的 dt（被壓在 0.1 秒，低幀率會少算）。按鍵時間一律 `currentTime − outputLatency`，和 `readInput` 的 `actAt` 同一公式。
- （11/09）`telemetry.js` 的盲區鍵 `BLIND_KEYS` 與安撫事件正規式是寫死的；大廳復仇合成版的鍵或事件名不同時要更新，否則盲區行動、對拍率會算成 0。
- （11/09）所有遙測呼叫要包 try/catch、先檢查 `TEL && TEL.active()`；沒載到 telemetry 時遊戲必須照玩。
- （11/09）畫面工作階段在 worktree `.claude/worktrees/openrouter-api-key-setup-383957` 工作（已切到 `claude/gracious-bardeen-vwo4rr`）；不要寫主資料夾 `C:\Users\恩\test1`，會被 hook 擋。
- （11/10）一次性特效（殘影、白環）不要每次觸發都 `new` 幾何與材質：`world.remove` 不會釋放 GPU 記憶體。木馬之夜改成 `ensureFxMeshes()` 每個場景建一次、重複用，`build()` 換場景時 `disposeFxMeshes()` 釋放。
- （11/10）放在玩家位置的 3D 物件會和鏡頭重疊，變成橫跨畫面的一條色帶。追殺殘影改放在衝刺前的位置（`prePos`），衝刺距離不到 1.5 公尺就不放。
- （11/10）`spawnPrint` 在視覺輔助 0 的區域會直接 return；`hunt_step` 跟在 `step_masked` 後面改「最新腳印」，沒先清 `S.lastPrint` 就會改到舊腳印。追殺中的腳印不受 visualAid 影響。
- （11/10）`hud()` 只在遊玩中跑，暫停或回開場時 HUD 的 opacity 會停在當下的值（靠 `body:not(.playing) .hud` 藏起來）；所以重開局要 `resetActionFx()` 歸零，不能等 hud 自己衰減。
- （11/10）內建瀏覽器面板隱藏時，背景分頁的 requestAnimationFrame 不跑，從 console 推事件不會被取走；要靠截圖推進幀數。短暫特效要截圖可以凍結 `performance.now`（例：`const t=performance.now(); performance.now=()=>t`）。
- （11/10）**瀏覽器測試一律帶 `?mute=1&nolock=1`**，測完關掉所有分頁（最後一個也關）、停伺服器。11/10 遊戲頁在背景鎖住使用者滑鼠、聲音一直播。另外：用 Edit 工具改 `index.html` 或 md 時，桌面版會自動在內建瀏覽器用 `file://` 開這個檔，改完要檢查並關掉那個分頁；大量改筆記可以改用指令碼寫檔。
- （11/10）內建瀏覽器面板隱藏時遊戲不會前進（requestAnimationFrame 停住），等時間的檢查（教學提示、掩護窗時機）改用 Node 直接跑 risset.js 照畫面條件逐幀模擬；面板顯示中才用瀏覽器。
- （11/11）面板隱藏時要讓遊戲照正常速度跑：在 console 用 `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)` 代替畫面迴圈（背景計時器約每秒 43 次），再截一張圖把卡住的那一幀放出來；只在測試時用，不改程式。
- （11/11）`troy-prologue/index.html` 在工作區是 CRLF 換行：用指令碼改檔時跨行的錨點要先把 
 換成 
 再比對，寫回時換回 CRLF（git 會再正規化）。單行錨點不受影響。
- （11/11）量場景亮度不要用遊戲畫布截圖：在頁內另開一個 WebGLRenderer（preserveDrawingBuffer）配俯視正交相機渲染同一個 scene，再 readPixels；火光每幀隨機閃，要多次取平均。
- （11/10）PointsMaterial 的點離鏡頭太近會放大成一大團光斑；灑在鏡頭四周的粒子至少離 1 公尺。
- （11/10）木馬之夜在 claude.ai 預覽以 `file://` 開時，`../nav.js`、`../telemetry.js` 都載不到；本機測試用暫存站台：複製 `nav.js`、`telemetry.js` 到根目錄，原型放子資料夾，index 包外殼，`python -m http.server 8781`（8765 埠被別的程式佔用）。
- （11/11）**畫面上的半透明大平面（月光斜光這類 AdditiveBlending 片）要在鏡頭貼近時淡掉**：站在門閂邊時那片光整片糊在臉上，看起來像穿進半透明的牆。做法見 `BEAM_NEAR`／`BEAM_FAR`（轉到那片的本地座標算距離）。
- （11/11）**HUD 置中的字幕寬度要避開左下、右下的固定欄位**：`#hint` 寬度＝min(760, 100vw − 432)；字幕變多行時 `placeWhisper()` 把「同伴低聲」推到字幕上方。新增左下或右下的 HUD 時要一起檢查。
- （11/11）**背景分頁一幀可能跨過整個時間窗**（約 1 幀／秒）：「先重算預測、再檢查到了沒」在低幀率永遠接不到，要先檢查上一幀的預測。
- （11/11）`loop()` 裡的 `playing` 是區域變數，loop 外的函式（例如 `ghostFrame`）不能用，要自己看 `game.phase`、`paused`。
- （11/11）**測試時凍結畫面迴圈要保留回呼**：rAF 替身在凍結時把 cb 存起來（`__pend`），解凍時接回去；直接丟掉的話迴圈就停了，只能重新載入。面板隱藏時用頁內 `button.click()` 開局，再截一張小圖把第一幀放出來。
- （11/11）**設定存檔**（`PREFS`，localStorage 鍵 `troy-prologue.prefs.v1`）：新增實驗開關或音樂選項時，要加進 `fields` 才會存；和選項重疊的網址參數要寫進 `urlOwns`（網址優先）。測試時改過選項記得按「恢復預設」清掉，免得影響下一次測試。
- （11/11）**總音量只能用 `audio.raw.setMaster(v)` 設**（預設 0.8，沒有讀取介面）：失敗降音量 `failDuckFrame()` 每幀依 `game.phase` 算目標值；之後別處也要改總音量時要一起考慮，免得互相蓋掉。
- （11/11）**鏡頭跟的是顯示位置 V.dx／V.dz，不是規則座標**：新增要貼著玩家畫的東西（手、武器、腳邊特效）時用 V.dx／V.dz，否則衝刺時會和鏡頭錯開；要讓鏡頭直接跳到新位置（傳送、重來）就設 V.snap = true。
- （11/11）**聲音層給的事件時間 t 可能在未來**（例如 `guardStepsSince` 比現在晚 10～50 毫秒）：查詢要傳「已拿到的最晚 t」而不是現在時間，否則還沒響的步會每幀重複拿到；拿到先排隊，音訊時間到 t 才畫。
- （11/11）**手機觸控**（layer-ride 起的做法）：按鈕用 pointerdown 觸發（不等 click）並 preventDefault；按鈕加 touch-action: none、擋 contextmenu；html 加 touch-action: manipulation 取消雙擊縮放。手機的聲音要使用者手勢才能開，放一個「點一下開始」畫面，iOS 另在 touchend／click 再 resume 一次。時刻用 currentTime − outputLatency − (performance.now() − evt.timeStamp)，鍵盤觸控共用。
- （11/11）**畫布的 fillStyle／strokeStyle 不認 `var(--x)`**，會被當成無效值、沿用上一個顏色；畫布裡一律寫色碼。
- （11/11）**地上要看得見的線不要用 THREE.Line**（WebGL 一律 1 像素，第一人稱幾乎看不見）：用貼地的細 PlaneGeometry 帶子＋圓點（見 `huntRouteSet`）。
- （11/11）**追殺類的瀏覽器測試要在截圖前凍結畫面迴圈**（rAF 替身的 `__freeze`）：截圖空檔遊戲照跑，沒人換氣就被抓；凍結後放一幀（`__unfreeze` 再 `__freeze`）才會畫出最新狀態。追殺試驗場要往正後方（S）退進「廣場東南角」影子、偏東站，別站在影子中心（那是搜索路線第 2 點）。
- （11/11）**滑鼠轉視角要擋跳值**：指標鎖定時 Windows Chrome 偶發單次幾百像素的 movementX/Y，鎖定後頭幾個事件也常是跳值；拖曳模式要看 `e.buttons`，不能只靠 mouseup（在視窗外放開收不到）。做法見 `MOUSE_SKIP`／`MOUSE_SPIKE`／`MOUSE_JUMP`。程式自己設朝向的只有開新局與重來（V.yaw = player.yaw）。
- （11/11）**開關開著沒有安撫**（第 13 節）：按鍵說明的 Q 列掛 class `calmOnly`，開關開時藏起來；衛兵中間狀態只有 `checking`（查看），`suspicious`／`alerted` 只在報告版出現。畫面的輔助圖示（查看目標圈、呼吸範圍）一般遊玩乘 `VIS.aid`（照輔助分區淡出），試驗場或相位條開時全畫。
- （11/11）**導覽與說明側欄都走 `../nav.js` 的 `OdysseyNav.mount()`**：不要每頁各寫一份。內容資料：木馬之夜試驗場在 `LAB_HELP`（index.html，面板字改了要一起改）、試聽頁與換層試驗場寫在各自頁尾的 mount 呼叫裡。換層試驗場發布成試玩頁時只帶三個檔，所以它動態找 `../nav.js` 再找同一層 `nav.js`，都沒有就不掛（發布時多帶 nav.js 就有說明欄）。整關（沒有 ?lab）不掛側欄。
- （11/11）**試聽頁的節奏圖讀聲音層的排程紀錄**：`createAudio(ctx, { log: true })` 後讀 `audio.log`（beat {k,t,g}、vEvent {t,fake}、accent {which A|B,k,t,g}、coverHit {t}），和實際播的是同一份；頁面自己定期剪掉舊紀錄。只畫已經響過的，假的過了才標，免得洩漏試聽題目的答案。
- （11/11）**錄影用 `?clean=1`**：不讀不寫首頁存檔、相位條與試玩數據摘要關、不掛說明欄與切換台按鈕；新增除錯元素時記得在 CLEAN_Q 下也關掉。
- （11/14）**?lab=flash 借規則的 run 場景**（規則沒有 flash）：`opts.lab = LAB === 'flash' ? 'run' : LAB`，所以 `g.lab` 是 run；畫面判斷一律看 `LAB`（labHud 先檢查 `LAB === 'flash'`）。最響一擊的偵測和落塵同一處（visFrame 的掩護窗開頭），之後改這段要一起顧。
- （11/14）**敲暗號判定只讀規則**：`Rules.beatsBetween(t±0.6, game, { minGain: MASK_GAIN })` 找最近的踩得上的拍、寬度 `STEP_WIN`；按鍵時刻和 pend.actAt 同算法（currentTime − 輸出延遲）。
- （11/15）**試驗場開頭三行在 `LAB_BRIEF`**（index.html，查看說明那行後面）：測／操作（按鍵寫最前面）／看。同一份顯示在開場字卡（#labBrief）、面板標題下（`withBrief()`）、說明側欄最上面（nav.js 的 `help.brief`）。新增試驗場要補一筆；「看」那行引用的面板字改了要一起改。換層試驗場的三行寫在自己頁面的開始畫面與 HELP.brief。
- （11/15）**敲暗號的拍點條用「聽到的時間」**（currentTime − 輸出延遲）畫拍，和判定同一把尺；同伴示範的出聲要排在拍的排程時間（setTimeout 到 b.t − currentTime），不能用聽到的時間。拍很密（約 4 拍／秒、同一時刻常有兩層重疊），示範挑間隔 ≥ 0.45 秒的拍。
- （11/15）**蹲＝Alt（AltLeft／AltRight）**：keydown、keyup 都 preventDefault（Windows 的 Chrome／Edge 是放開 Alt 時把焦點移到選單）。實測（內建瀏覽器送的合成按鍵）：按下與放開都被擋（defaultPrevented 為真）、按住 Alt 蹲、放開站起、按 C 不再蹲。**沒測到的**：真鍵盤按 Alt 會不會跳到瀏覽器選單、Alt＋Shift 會不會切輸入法——合成按鍵不經過作業系統，這裡量不到。這台電腦只裝一種語言（zh-Hant-TW、一個輸入法），Windows 的 Alt＋Shift 只在裝兩種以上語言時才切換，所以這台不會發生；別台電腦裝了多種語言時，Alt＋Shift 由作業系統處理，網頁擋不住。要使用者在本機真鍵盤試一次。
- （11/15）**照亮場景（REVEAL_MODE）不蓋黑幕，改乘環境光**：開關開時半球光、月光乘 1 − 暗度（暗度 0.7＝原型使用者說可接受的值，環境光 ×0.30；第 0、1 區少 0.15，×0.45），火盆、火把是點光源不受影響。巡邏衛兵的火把點光源 ×0.3，查看、追殺、喊人照舊全亮。玩家腳邊一盞 2.6 公尺的弱冷光。燈是每區重建的：用 parent 判斷換區後重新找。開關關著（又不在 ?lab=flash）時 flashFrame 第一行就 return，什麼都不碰。
- （11/15）**聲音層的新函式在 audio.raw**（index.html 的 audio 是包裝，只有 now／update／cue／stop／setListener）：knock、horseReply、bowPluck 這些要呼叫 audio.raw.xxx。knock(t) 可以排在未來，同伴示範直接排在拍的排程時間。
- （11/15）**內建瀏覽器會快取 127.0.0.1 的舊頁面**：重建測試站台後 DOM 還是舊版（fetch 拿到的是新的）。換用 localhost:8765 開就拿到新版；之後重建站台就換網址或加不同參數。
- （11/15）**試驗場面板下面的東西用 labUnder() 跟著面板底部排**（#labBtns、#flashCtl）：面板長度會變，固定 top 會壓到字。新增面板下的按鈕要加進那個清單。
- （11/15）**編輯 index.html 後，內建瀏覽器會被自動開一個 file:// 分頁**（沒有 ?mute=1），而且變成作用中的分頁：測試腳本一律指定 tabId，改完檔先看 tabs_context 把它關掉，否則按「開始」會點到那一頁、外放鼓聲（11/15 發生一次，約 5 秒）。內建瀏覽器面板隱藏時 rAF 不跑，測試站台的頁面前面加 setTimeout 版 rAF 替身。

- （11/15）**介面設計代號在 `prototypes/ui-tokens.css`**（方向 A「夜城訊號」，docs/design/2026-11-15-ui-design-system.md）：七色一色一義（夜空墨 底、城牆石 面板、羊皮紙 字、青銅 只給可以按的、海青 準／安全、火把橘 警告／查看、血紅 失敗／追殺）、題字 Noto Serif TC 900＋內文 Noto Sans TC、數字 tabular-nums、面板 4px、按鈕 2px、不加陰影、焦點框羊皮紙。**血紅當字對比只有 2.8**：一律當底色或色條，上面的字用羊皮紙。**遊戲頁與 nav.js 各抄一份同值的變數**（claude.ai 試玩頁載不到上一層的檔），改色時三處一起改。遊戲頁舊變數名（--fire、--ash、--dim、--warn、--moon）保留，對到新代號（--fire＝青銅、--moon＝海青）。
- （11/15）**拍帶是共用元件 `prototypes/beatstrip.js`**（OdysseyBeat.mount／draw／rulesSource）：拍點照 RissetRules.beatsBetween（includeBlind；n＝0 當最響一擊，gain ≥ MASK_GAIN 當踩得上的拍），循環固定 T.CYCLE；直線在 20%，和敲暗號拍點條同幾何；prefers-reduced-motion 或 still:true 時只畫一張靜止圖。試聽頁用 still（拍帶沒跟那頁的聲音同步，動了會誤導；同步的是節奏圖）。敲暗號拍點條改用 OdysseyBeat.draw，沒載到時自己畫。
- （11/15）**試驗場面板改用 setPanel(el, lines)**（不再用 textContent）：第一行拆成題字標題＋括號小字，分隔線 ──── 之後的狀態字依 PANEL_ST 上色，開頭三行不上色。新增面板內容照舊回傳字串陣列即可。
- （11/15）**無頭截圖**：scratchpad 的 shots.mjs 直接用 CDP 開 Chrome（--headless=new --mute-audio），不用 playwright（本機沒裝套件）。**--user-data-dir 要給絕對路徑**，相對路徑 Chrome 不會起來；每次用新的設定檔資料夾，用完先砍行程再刪。

- （11/15）**所有連結在同一分頁開**（內建瀏覽器面板擋新視窗，target="_blank" 點了沒反應、window.open 回 null）：不要再加 target；要回來的頁面靠瀏覽器上一頁，狀態存 localStorage（切換台的勾選、試玩清單的答案），上一頁回來勾選、捲動位置都在（無頭實測）。
- （11/15）**主控台「Unexpected token ')'」的來源是 beatstrip.js 改版中的一版**：一行尾註解把收尾的 } 一起註解掉；當天已修（node --check 通過），之後各頁開啟皆無此錯誤。新增共用 JS 後先跑 node --check。
- （11/15）**DRIVE 試驗場（?lab=drive）**：?drive=0 轉 opts.T.DRIVE_MODE=false；面板讀 g.drive／g.driveInfo；按鍵 0～8 → g.labDriveSeg、, . → labDriveSet（以現值 ∓0.05）、K → labDriveHunt 切換、U → 三個都傳 null。這些入口只在規則 lab:'drive' 時存在，呼叫前先檢查是函式。無頭測試要讀 game 用測試站台加的 window.__G()（game 不是全域）。

- （11/17）**關卡編輯器 `prototypes/level-editor.html`＋純邏輯 `prototypes/level-editor/core.js`（Node 測試 core.test.js）**：資料格式＝buildLevel() 同結構的純 JSON，腹中高度寫 "BELLY_Y"。底稿優先用 troy-prologue/level-troy.js 的 window.TroyLevelData，沒有就 fromBuilt(buildLevel())。存在 localStorage 'troy-level-local'；遊戲 `?level=local` 讀它，有 Rules.resolveLevel 就用，沒有自己換 "BELLY_Y"；沒帶參數完全不碰。**比對要用 JSON 正規化**：舊版 buildLevel 有 name: undefined 欄位，deepStrictEqual 會判不同。**加長全圖**（insertWidth）：跨過插入線、寬 10 公尺以上的才拉長，其他照中心整塊移（否則出口被拉成 30 公尺寬）；預設插在窄巷出口東緣 47.5。各區範圍用出口推（出口西緣＝本區東界），資料裡沒有區界。

- （11/17）**遊戲頁不再寫死區號**（規則 e31150e：區數由資料決定）：index.html 頂端 lvZones／zoneIndex／bellyZoneOf／gateZoneOf／tierOf／zoneNameOf。腹中＝有 belly 的區、城門＝Rules.isGateZone、教最響一擊＝teach 'blind'、教暗殺與屏息＝teach 'takedown'（留空檔模式兩件都在腹中區）、視覺輔助與照亮暗度的退路用 Rules.zoneTier、區名讀 level.zones[z].name、?startZone 上限＝區數減 1。讀不到資料（舊規則檔）時退回原本的 1／2／3／4。試驗場的區號與座標仍照預設地圖。
- （11/17）**編輯器的區**：區號＝陣列索引；加區 C.addZone(data, x0, x1, opts) 一律放在城門區前，起點罩 4 × 4 影子、東緣 1.5 公尺寬全高的出口（place: true）、上一區出口改通往它，並寫 **area {x0, x1}（編輯器自己的欄位，規則不讀）** 當區界；沒有 area 的區照舊用出口推。刪區 C.removeZone：開場、城門區不能刪，該區衛兵一起刪，通往它的出口改通往它原本的下一區。

- （11/17）**?map=final 與故事字卡**：index.html 只在 ?map=final 時用 document.write 載 level-troy-final.js（window.TroyLevelFinal），經 Rules.resolveLevel 交 createLevel；?level=local 優先。暗區（區資料 dark: true）讓 flashOn() 為真，借 REVEAL 的環境光乘暗＋最響一擊照亮；**離開暗區時 flashFrame 會把半球光、月光還原成 rvBase、腳邊燈歸零**（以前只有整局開關，不會中途關）。字卡 STORY_CARDS（序 3、終 1），STORY_ON＝?story=1 或 ?map=final（?story=0 關）；顯示時 **game.story = 'intro'｜'outro'**（聲音角色讀它做悶鼓），收起後 null；序的時候遊戲照跑但 game.step 收到零輸入；鍵盤用 capture 監聽先接走。終在 showOver 的勝利分支先放字卡，翻完再呼叫 showOver 走原本的勝利畫面。**插圖規格：16:9**（字卡插圖框，給電繪同學；框寬最大 960 px，建議交 1920 × 1080）。

- （11/23）**短展示關卡 `?map=demo`**：只在帶參數時用 document.write 載 level-troy-demo.js（window.TroyLevelDemo），經 Rules.resolveLevel 交 createLevel；載入失敗時回到長開場頁，開場最上面顯示一行訊息、用原本地圖。DEMO_ON 時：CLEAN_Q 也算開（不讀存檔，別人留下的除錯開關帶不進展示）、不問問卷、body.demoMode 藏開發用按鈕。開場字卡是 STORY_CARDS.demo（storyShow('demo', startFromTop)），開始前 game 還是 null。結局、失敗的「再玩一次」呼叫 backToIntro（停聲音、清狀態、回字卡）；空白鍵與 Enter 先擋一下（失敗 1.2 秒、結局 2.6 秒），免得還按著屏息就跳走。

- （11/26）**3D 場景加強 `?art=2`（美術 A 試做）**：index.html 的 ART 物件，`?fx=mat,fire,fog,shadow,key` 個別開（不寫＝建議組合 mat,fire,fog,key；shadow 與 mat2 要點名，11/26 使用者選）。掛勾四處：build 結尾 artApply、buildHorse 記 S.horseGroup、新衛兵 artGuard、火光迴圈後 artFrame；ART.on 為假時全部不執行。材質是程式畫的灰階紋理（不用外部圖檔）乘原色，方塊 UV 改成每 2 公尺一張；**mat2（Phong＋凹凸）與 shadow（點光源投影）在軟體算圖只剩 1～5 幀**，mat 用 Lambert＋紋理。陰影只讓離鏡頭最近的 2 盞火投影、每秒換一次（點光源投影一盞要畫 6 次）。關口界石貼在出口矩形長邊兩端的牆邊，到膝蓋高（.42＋頂蓋）、只微微發光；離任一區出生點 2.5 公尺內的不放（出口線常常就是下一區的出生點，站在線上往前看會正對牆邊那根）。量幀數要用 `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` 才會用到顯示卡（RTX 3060），預設無頭是軟體算圖；凍結畫面用 `TroyDebug.game.step = () => g`，前後比較要固定 Math.random 種子（addScriptToEvaluateOnNewDocument）。
- （11/27）**木馬之夜離線**：Three.js r128 與字體放在 `troy-prologue/vendor/`（來源授權 `vendor/LICENSES.md`）。字體是**子集**，只含遊戲頁用到的 1,395 字；新增中文字後要跑 `python -I prototypes/troy-prologue/vendor/make-fonts.py` 重切，否則新字會退回微軟正黑或標楷體，同一行字形不一致。`fonts-ui2.css` 只在 ?ui=2 載入：Noto Sans TC 700 不能放進一般的 fonts.css，否則 ui=0 的粗體會從「500 合成粗體」變成真 700，畫面就變了。ui-tokens.css 不再 @import Google Fonts，改由其他頁面各自 <link>（bard-table、blind-cave-web、level-editor、兩個試玩清單、switch、audio-test 已補）。Google 的 text= 參數太長（約 1 萬字元網址）會被忽略、改回 108 片完整分片，所以一次只送 450 字。

## 4. 驗證方式
- **本機開原型（有外殼）**：
  - 打包：`bash tools/build-itch.sh` → 輸出 `dist/odyssey-series/`（結構同 `prototypes/`，片段自動包外殼、three.js 改本地）。在該資料夾起靜態伺服器（例如 `python -m http.server -d dist/odyssey-series 8000`），開 `http://localhost:8000/troy-prologue/index.html`。這條路徑 `../telemetry.js`、`../nav.js` 都載得到。
  - 錄音工具：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 80`（自動包外殼、錄聲音與畫面、跑 analyze；注意上面的 404 陷阱）。
  - 網址參數：`?mute=1`（靜音）、`?nolock=1`（不鎖滑鼠）、`?startZone=1..4`（木馬之夜直接進某區）、`?telemetry=1`（右下角即時摘要）、`?musicZone=0..4`、`?musicOff=chant,chorus,shepard,theme`；比箭 `?debug`。
- **telemetry 測試**：`node --test tools/telemetry/*.test.js`（手算答案驗摘要數字、儲存上限、匯出格式；11/09 跑過 0 失敗）。CI 全部：`node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js`。
- **數據讀出**：`node tools/telemetry/summarize.mjs <匯出.json 或資料夾>`。
- **畫面檢查**：瀏覽器 console 讀 `TroyDebug.game`、`TroyDebug.hintState()`、`TroyDebug.vis.aid`、`TroyDebug.telemetry.summary()`；大廳復仇用 `VengeanceDebug`。確認 console 沒有紅字、提示文字裡沒有寫死的數字。
- **語法快速檢查**：三個原型沒有獨立 JS 檔，把主程式 `<script>` 抽出來跑 `node --check`。

## 5. 上次做到哪、未完成
- 11/09：第一次接手，讀完負責的檔案與設計文件，填好本筆記。還沒改任何程式。
- 未完成（等主對話派工）：
  - 大廳復仇難度說明改由 `Rules.constantsFor` 生成（535～537 行）。
  - 比箭 Risset 版還沒接 telemetry。
  - `nav.js` 的 `HUB_ARTIFACT` 空著（總首頁沒發布成試玩頁），claude.ai 裡回總首頁按鈕隱藏。
  - 版本號都是 `dev`：要錄音與工具角色讓打包工具寫入 `<meta name="odyssey-build">`。
  - 11/12 期中報告錄影要「視覺輔助全開」：開場把 `#oAid` 設成 on 就行，不用改程式；需要的話可以加網址參數 `?aid=on` 方便錄影。

- 11/09 晚（總控）4A 畫面草稿已由 agy 寫進 `index.html`（提交 511b817）：game.fire 火光、火把隨疑心變色、高度警覺邊緣暈、追殺速度線與殘影、合拍腳印分階、hunt_slip 白環、暗殺短白閃。
- 11/10（畫面）審完並修好 4A 草稿（只改 `troy-prologue/index.html`，未提交）：
  - 殘影、白環改成重複使用（不洩漏）；換場景時釋放，重開局與回開場歸零（`resetActionFx`）。
  - 追殺殘影留在衝刺前的位置、0.5 秒（規格 M2）；衝刺距離太短不放。螢幕上的硬邊藍灰橢圓改成柔邊淡漸層。
  - 追殺合拍腳印照規格「紅轉藍」：第 1／2／3 步紅、紫、藍（`PRINT_COL`），視覺輔助 0 的區域也看得到。
  - 暗殺白閃從整片全白改成畫面邊緣白閃（規格 M3），先顯示再衰減，低幀率也看得到。
  - 高度警覺邊緣暈只讀 `game.alerted`／衛兵 `state === 'alerted'`，拿掉多餘的 `alertedBySfx`。
  - 驗證：PR #10 規則檔與目前規則檔都在瀏覽器實開，console 沒有錯誤；全套 `node --test` 234 項通過。截圖在畫面工作階段的暫存資料夾 `shots-4A/`。
- 11/10（畫面）核心方向甲「殘響掩護」畫面（`docs/design/2026-11-10-core-direction-illusion.md` 第 1 節；只改 `troy-prologue/index.html`，未提交）：
  - 開場「實驗開關」加「鼓聲：不中斷／留空檔」（`#oCover`），`newGame` 設定 `opts.T.COVER_MODE`。規則檔還沒有 `COVER_MODE` 常數時（`'COVER_MODE' in Rules.T` 為假）選單停用、顯示「規則檔還沒支援」，一律當舊版。判斷用 `coverMode()`。
  - 開場說明兩段跟著選單換（`.modeCover`／`.modeGap`）：不中斷版寫「最響的那一擊落下時，就是你移動的時候」。
  - 不中斷模式下，掩護窗開頭（`visBlind()` 由假變真）不凝結、不變暗，改成震波 `VIS.shock` 1 → 0，在 `BLIND_LEN` 秒內衰減：屋簷落塵（`eavePts`，360 點）、地上塵土跳起（`kickDust`）、火把與衛兵火把震歪（`rotation.z`）、鏡頭下沉再彈回。強度原本乘 visualAid，11/10 夜依裁決稿 7.2 改成至少 SHOCK_MIN（鏡頭下沉除外）。
  - 火光：優先讀 `game.fire`，沒有才試 `Rules.fireBrightness(game, K)`，非數字就維持 1。
  - 驗證：PR #10 規則檔副本加上 `COVER_MODE: true` 測兩種模式；舊規則檔下選單停用、console 沒有錯誤；全套測試 234 項通過。截圖在暫存資料夾 `shots-cover/`。
- 未做（規格有、草稿沒有，等派工）：M3「安撫每對拍 → 衛兵火焰收一格」、M4「p → 1 火光泛紅」（M4 已改成跟速度走，泛紅要等設計席說還要不要）。
- 11/10（畫面）木馬之夜加自動檢查用網址參數：`?mute=1`（所有接到喇叭的聲音改接音量 0 的總閘；音訊環境照建，因為規則靠音訊時鐘推進）、`?nolock=1`（不鎖滑鼠，當作鎖定失敗，拖曳轉視角照常）。驗證：內建瀏覽器帶參數開局，總閘音量 0、遊戲時間正常前進、點畫面不鎖滑鼠也不暫停；全套測試 234 項通過。大廳復仇、比箭還沒加，等派工。
- 11/10（畫面）殘響掩護版的畫面文字不出現「斷」：開場兩段說明、按鍵表 Shift 那一列都分成 .modeCover／.modeGap 兩份，跟著「鼓聲」選單切換（coverText），口吻照 risset.js HINTS（「最響的那一擊落下時」）。同伴字幕「就是現在」兩版通用。選單選項 11/10 夜改成「不停」，畫面文字已沒有「斷」（舊版段落除外）。
- 11/10 夜（畫面）照裁決稿第 7 節：7.2 落塵、地上塵土跳起、火把傾斜的強度改成 max(SHOCK_MIN, visualAid)（`SHOCK_MIN = .35`、`shockAmt()`，畫面節奏常數），鏡頭下沉照舊乘 visualAid，舊模式凝結不動；7.4 開場說明換新文字，選單選項改「不停（趁最響的一擊行動）」。驗證：內建瀏覽器帶 `?mute=1&nolock=1&startZone=3`，visualAid 0 時落塵不透明度 0.26、沒有凝結；全套測試 249 項通過；截圖 `shots-cover/5-第3區輔助0-震波最低強度.jpg`。
- 11/10 夜（畫面）M9 教學重排的畫面配合：同伴教學區號改由 `teachNowZone()`（殘響掩護版 2、舊版 1）與 `teachBreathZone()`（殘響掩護版 3、舊版 1）決定；「別動」和同伴的手跟著屏息教學區。殘響掩護版的「就是現在」照規則 blindHintGate 的條件（進區那個循環之後、進區滿 HINT_GAP 秒）估下一個窗，和規則的「最響的一擊」提示落在同一窗；`HW.gate` 在開局與重來時清掉。驗證：Node 照同樣條件逐幀模擬（暫存 `simm9.js`），區 2 低語 5.88 秒、窗 6.86 秒、規則提示 6.83 秒；全套測試 260 項通過。
- 11/10 夜：M9 畫面配合已由總控審過提交。區 3 同伴的手看不到的問題，由設計席 7.9 解決（殘響掩護版視覺輔助改成區 0～2 100%、區 3 50%、區 4 0%，規則角色改 `visualAidFor`），畫面不用改。注意 `aidTarget()` 的備援公式（區 0、1 是 1，區 2 是 0.5，之後 0）只有規則沒給 `game.visualAid` 時才用，和 7.9 的新比例不同，之後若要統一再改。目前待命。
- 11/11（畫面）換層試驗場 `prototypes/layer-ride/index.html` 第一次在瀏覽器實開：載入、console 無錯誤、聲部譜與數字面板在動、W 前進、Q 換層（面板顯示偏差）、提示依事件切換、滑桿按重來生效、`?CYCLE=12` 覆寫、`?aid=0` 關聲部譜都正常。補了 `?mute=1`（同木馬之夜的總閘做法；這頁不鎖滑鼠，nolock 不用處理）；`?aid=0` 時數字面板的騎的聲部、下一條、換層窗三列改顯示「（聲部譜關閉）」，免得用眼睛看出時機。總首頁照規格不加連結。截圖在暫存 `shots-layer-ride/`。
- 11/11（畫面）木馬第 1 批（設計文件 2026-11-11-trojan-horse-directions.md 方向 A、C1；規則 0e01020）：`?horse=1` 時 newGame 傳 `T.HORSE_MODE`，`?lab=belly` 時傳 `lab`；判斷用 `horseOn()`。腹中物件由 `buildBellyPractice()` 在開關開時才建（前端橫樑的刻痕 need 格、腳下淡藍光縫、東邊鉸鏈的暗門蓋、木栓與同伴的手），`bellyEvent()` 處理 step_masked（只有 start 不是 false 才亮縫）／belly_hush（同伴的手 `HW.hushKick`）；`bellyFrame()` 每幀直接讀 `game.belly.n/ready/open`（刻痕不自己數）；木板縫火光加 `VIS.pulse`。木馬陰影不用另外畫：規則把它加進 level.shadows，原有的陰影畫法就畫出來。試驗場面板 `#labPanel`／`labHud()`／`LABS`（偏差＝beatT − 事件時間，正＝早踩），低通先放占位；過關畫面在試驗場換成「爬下暗門了」。入口在實驗開關「試驗場：木馬腹中練習」（連結會帶上 mute、nolock）。驗證：內建瀏覽器三種網址都實測，沒帶參數時開關關、沒陰影、沒新物件、面板不出現；全套測試 294 項通過；截圖在暫存 `shots-horse1/`。
- 11/11（畫面）照 1.1 節定案的事件補完（b6765e5 之後，未提交）：起步 step_masked {start:true} 亮縫、續步 {start:false} 不亮但面板列「續步」；belly_hush {n, need, cost} 面板寫「起步踩歪，同伴按住你（熄 cost 格）」，刻痕照 game.belly.n；腹中的 step_loud {start:false} 面板寫「續步出聲（不扣格）」。進區提示 belly 用規則現有字句（「站定，等鼓點，再踏出去。…」），不另提。驗證：?lab=belly 實測起步、續步，另手動送 hush 與 step_loud 確認面板；294 項測試通過。
- 11/11（畫面）C1 補充裁決：開關開時路線暗示第一個火盆 (15.5, 18.3, dim 1) 移到 (17.3, 18.3)，影子不動；開關關著不動。亮度量法：頁內另開一個 WebGLRenderer，俯視正交相機（y 6，x 8～22、z 8～24，關霧），讀像素算亮度（0.2126R＋0.7152G＋0.0722B），12 次取平均（火光每幀閃）。結果：東側影子 9.06、影子外 2 公尺 34.46（比值 0.26 ≤ 0.5）、「木馬的影子」16.48，都過，不用加深；對照火盆在原位 9.25／33.2／17.45。截圖在暫存 `shots-horse-shadow/`。
- 11/11（畫面）木馬第 2 批面板（聲音 3823b7c）：腹中試驗場按 L 切低通（自動→強制開→強制關，呼叫 audio.raw.setBellyLowpass(null/true/false)，面板讀 horseInfo().lowpass；重開局歸零）。新增 `?lab=horse`（newGame 傳 lab、HORSE_MODE、startZone 2；規則已支援 lab: horse）：面板顯示離木馬幾公尺（horseInfo().dist）、這一擊的共鳴音量（boomGain）、上一聲共鳴、在不在名稱含「木馬」的陰影內。共鳴畫面 `buildHorseDust()`／`horseDustFrame()`：聲音層排好的 lastBoom.t 到了才抖，強度＝lastBoom.gain ÷ HORSE_BOOM_GAIN，木馬背上與兩側上緣的灰塵揚起、木板一震。入口在實驗開關「木馬共鳴」。驗證：?lab=horse 站 9 公尺共鳴 0.20、站在陰影內 6.5 公尺 0.27、灰塵不透明度 0.35；L 三段切換都對；全套測試 300 項通過；截圖在暫存 `shots-horse2/`。
- 11/11（畫面）木馬第 3 批 C3 結尾回頭鏡頭（只在 HORSE_MODE、非試驗場）：showOver 時 `cinWanted()` 為真就不設 5.5 秒轉黑，改 `CIN.pending`（保險 20 秒）；`cinFrame()` 在 sync 末尾、算圖前覆寫鏡頭：winT ≥ 2.6 秒起，鏡頭升到 8 公尺、拉到暗門東邊 16 公尺並對準暗門（從城門口直接回頭會被牆擋住），霧 0.045→0.012，木馬下亮一盞火；同伴 4 人從暗門落地往東散開，時機用規則的 horse_signal（有 delay 就加上，沒有就收到即落），等不到 10 秒才自己落；演完或任意鍵跳過才轉黑。為了收到 horse_signal，演出期間在 win 分支繼續呼叫 game.step（規則過關後只走循環時鐘，不動結果）。cinReset() 在 newGame、回開場時還原霧與物件。驗證：?horse=1 強制過關，約 7.3 秒收到訊號、同伴落地；按鍵立刻轉黑；開關關著 5.5 秒轉黑、霧不變、沒有演出物件；測試 301 項通過；截圖在暫存 `shots-horse3/`。
- 11/11（畫面）C3 補充裁決修正：鏡頭升到 A（暗門東 16、高 8）後，等那一擊期間慢慢推到 B（東 9、高 5、越過雕像台座），那一擊前 0.3 秒停穩不動；那一擊落下時同伴落地、離暗門 HORSE_SIGNAL_R（8）內的衛兵 0.3 秒傾倒（只動畫面），衛兵在鏡頭轉回時就面朝東。同伴改成站姿約 1.8 公尺（腹中的坐姿剪影太矮）。時機：過關時 `cinPlan()` 依規則 blindWindows 決定鏡頭何時開始動（`CIN.tReady`）；之後每幀重算下一個真的窗（`cinNextWindow`，規則過關後節奏還會變，過關當下算的差約 1 秒）讓鏡頭照它定位；那一擊以規則的 horse_signal 為準，訊號若在鏡頭就位前就到，改用下一個真的窗。保險改用音訊時間 30 秒（測試時背景分頁音訊時鐘會停，牆上時鐘 60 秒只當最後保險）。cinFinish（跳過或自然演完）都呼叫 audio.raw.stopHorseSignal()。同伴落地時間＝0.4＋i×0.45 秒，聲音層同值且有測試檢查：改 CIN_FALL、CIN_GAP 要同步告訴總控與聲音角色。注意 `CIN_GAP, CIN_FALL, …, CIN_N` 那一行被聲音角色的 audio.test.js 讀取，常數順序別改。驗證：?horse=1 強制過關，訊號 5.69 秒、鏡頭 5.39 秒停穩，兩名衛兵倒下，同伴站高佔畫面 11.3～11.5%（要求 ≥ 8%）；302 項測試通過；截圖在暫存 `shots-horse3b/`。
- 11/11 傍晚（畫面）全流程試玩兩個畫面問題（錄影 `out/fullrun-1111-b`，該錄影 HORSE_MODE 關，所以兩項都是**報告版也受影響**）：
  - 第 12 秒字幕壓到屏息標籤：`#hint` 寬 760 置中，960 寬時左緣在 100px，蓋到 18～198px 的屏息欄。改成寬度 min(760, 100vw − 432)，840px 以下全寬並移到 84px 高（原本窄螢幕 60px 也會壓到）；`placeWhisper()` 讓「同伴低聲」高過字幕頂 8px。實測 960×540：字幕 216～744px、屏息 18～198px；低語底 448、字幕頂 463。
  - 第 32 秒城門「穿牆＋雜訊」：鏡頭沒有穿牆（玩家在 (58.11, 15.82)，離門閂橫木 1.2 公尺），是兩件事疊在一起：(1) p > 0.8 的視聽不協調用了電視雪花，違反設計文件 2026-11-06 第 94 行與音樂核心概念第 289 行「重影、耳鳴般搖晃，不用數位雜訊」，改成 `ghostFrame()` 重影（每 0.12 秒拍一張畫面，模糊、錯開最多 5px 疊上，不透明度 ≤ 0.38）＋鏡頭左右輕傾 ≤ 0.018 弧度（`DESYNC_ROLL`，系統設定減少動態時不傾）；(2) 門閂旁月光斜光片離鏡頭 0.2 公尺，近看像半透明牆，改成 0.6～2.4 公尺內淡掉。
  - 順手修 C3：背景分頁低幀率時「那一擊」一直接不到，改成先檢查上一幀的預測再重算。開關開：強制過關後那一擊定下、兩名衛兵倒下、同伴落地。開關關：過關流程沒動。
  - 驗證：本機站台 960×540 重現兩個畫面，console 無新錯誤；全套測試 314 項通過。截圖在暫存 `shots-fix1111/`（before-*＝錄影原圖、after-*＝修正後）。
  - 待人眼：重影強度（目前偏淡）、輕傾會不會暈。
- 11/11 晚（畫面）總控追加三件（只改 `troy-prologue/index.html`，未提交；317 項測試通過；截圖在暫存 `shots-moves1111/`）：
  - **死亡後降音量**（使用者要求）：進 fail 後先留 0.25 秒讓被抓那一聲響完，再 1 秒內把總音量淡到 −24 dB（0.8 → 0.05），按 R 重來回 0.8；從頭開始會建新的聲音模組，本來就是原音量。過關、木馬結尾不受影響。用 `audio.raw.setMaster`，不用改 audio.js。實測：記錄 setMaster 呼叫，淡出約 1.0 秒、重來立刻回 0.8。報告版的失敗畫面也受影響（規則與 500 局數字不變）。
  - **設定存檔**（使用者要求「首頁配置儲存上一次的」）：相位條、試玩數據摘要、視覺輔助、難度、鼓聲、合成音量、音檔音量，加上載入音檔後要用「自備音檔」還是「混合」；音檔本身不存。沒有存檔時照 HTML 預設；讀寫包 try/catch；`?telemetry` 優先；實驗開關最後加「恢復預設」。實測：改四項、重新載入後都帶回，按恢復預設後存檔清空、畫面回預設。
  - **跑蹲畫面**（設計 2026-11-11-companion-mechanics.md 第 7.3、7.4、9.2 節；規則 6b24827）：每幀送 `run`（Shift 按住）、`crouch`（C 按住），dash 照舊；`?moves=0` 傳 `T.MOVES_MODE: false`；`?lab=run|crouch|listen` 傳 lab。跑：鏡頭前傾約 4°（`RUN_LEAN`）、走路晃動加大；蹲：眼睛 1.62 → 1.00（`CROUCH_EYE`）。跑步波紋從腳下擴散到 RUN_R：沒人聽到（掩護窗內或 RUN_R 內沒人）淡藍、有衛兵聽到橘色。屏息時衛兵腳步落地處淡圈。矮掩體（low: true）地上淡框，蹲著變清楚。三個試驗場入口（實驗開關，規則不支援時隱藏）與面板（`movesLabLines`）。按鍵說明加「按住 Shift」「按住 C」兩列，文字由規則常數生成，`?moves=0` 時隱藏、Shift 那列改回「Shift」。實測：三個試驗場都在瀏覽器跑過，`?moves=0` 時按 C、Shift 不蹲不跑、鏡頭不動、說明列隱藏。
  - **衛兵腳步波紋**：原本是畫面估算；11/11 晚聲音層提交 `audio.raw.guardStepsSince(t)` 後改照它（見下一條）。
  - 待人眼：前傾與蹲低的幅度、橘色波紋夠不夠醒目、淡藍會不會被當成「被聽到」、矮掩體淡框會不會太像地上的線。
- 11/11 晚（畫面）走路或衝刺中鏡頭瞬間移動（使用者回報）：原因兩個——(1) 規則的衝刺是一瞬間位移 DASH 3／DASH_HUNT 6 公尺，鏡頭直接用規則座標，一幀跳過去；(2) 遊戲時間用聲音時鐘 ctx.currentTime，它一塊一塊推進，每幀推進量不均，走路一頓一頓（藍牙、大緩衝時更明顯）。修法：sync 裡鏡頭改跟顯示位置 V.dx／V.dz，每幀以時間常數 DISP_TAU 0.045 秒追上規則位置（0.15 秒追上約 96%）；換區、重來（V.snap）、開新局、一次跳超過 DISP_SNAP 8 公尺時直接對齊；走路晃動也照顯示位置算。規則位置與判定不動。實測：模擬 3 公尺衝刺，鏡頭每幀（約 20 毫秒）依序到 1.09、1.82、2.25、2.53、2.71、2.82、2.89、2.93 公尺（約 0.15 秒追上 96%）；走路每幀位移標準差 0.0051 → 0.0033 公尺；跳 10 公尺、按 R 重來都直接對齊；?moves=0 同樣正常；317 項測試通過。待人眼：衝刺滑過去的速度感夠不夠。
- 11/11 晚（畫面）屏息時的衛兵淡圈改照聲音層 `guardStepsSince`（只改 `troy-prologue/index.html`，未提交；319 項測試通過）：每幀只拿上次最晚 t 之後的新步、排隊，音訊時間到 t 才畫；到的那一刻沒在屏息就不畫；開頁時已響超過 0.25 秒的舊步不補畫；佇列上限 64。驗證：屏息試驗場面板顯示「來源：聲音層」、屏息 3 秒畫 19 圈；把實際函式抽出接假聲音層模擬 4 秒（每 0.4 秒一步、提前 30 毫秒排程、偶爾卡一幀 0.21 秒、中間放開 0.8 秒）：0 重複、0 提早，落後最多 0.217 秒（就是卡的那一幀）。聲音層沒有這個介面時仍用步頻估算。
- 11/11 晚（畫面）換層試驗場加觸控（只改 `layer-ride/index.html`，未提交；layer-ride 25 項測試通過；截圖在共享筆記資料夾 `layer-ride-touch-1111/`）：底部固定按鈕列「前進（按住）」「換層」＋小按鈕「重來」「聲部譜」；手機觸控自動開（?touch=1 強制開、?touch=0 關）；開始畫面解鎖手機聲音；換層按下時刻和鍵盤共用 `markSwitch`；窄於 600px 時畫布內部寬改 480，手機上約 358×358；提示文字在觸控模式把「按住 W」「按 Q」換成按鈕名；切走 App 時放開前進。順手修聲部譜金框沒畫出來（畫布用了 CSS 變數）。依賴只有 rules.js、audio.js。實測 375×812：畫布 75～433px、按鈕列 635px 起不重疊，觸控前進 8 步 0 出聲、頁面不捲動；觸控與鍵盤換層都記成按下時 currentTime − 40 毫秒；?aid=0 藏聲部譜與三列；桌機寬沒有按鈕列。沒實機測：iOS 解鎖聲音、真實觸控延遲。
- 11/11 晚（畫面）追殺重做的畫面（第 12 節，規則 697da85；只改 `troy-prologue/index.html`，未提交；326 項測試通過；截圖在共享筆記資料夾 `hunt-lab-1111/`）。全部只在 MOVES_MODE 開時：`?lab=hunt` 加進白名單與試驗場入口；面板顯示追兵狀態（追你／搜影子第幾點／停頓環顧／搜完）、距離、呼吸範圍內外與屏住沒、最後一次知道你在哪幾秒前、在影子或亮處、喘、被聽到與喊人次數。`hunt_call`：喊聲處 HUNT_CALL_R 橘色大波紋、被叫到的各一小圈、訊息「追兵喊了一聲：附近 N 名衛兵轉向這裡」（轉頭由規則 yaw）；高度警覺的衛兵頭上微光變橘。搜索路線與呼吸範圍（喘時 ×1.6）只在試驗場或相位條開時畫，你在範圍內又沒屏住時圈變紅。`hunt_heard`：衛兵側頭＋短訊息（2.5 秒內不重複）。喘：畫面邊緣淡白起伏（1.7 Hz，減少動態時不動）。`alerted`、第三次起疑訊息、`hunted`／安撫提示照規則。實測：搜索路線、聽到呼吸變紅、喘息邊緣 0.21～0.45 起伏都在瀏覽器看過；?moves=0 沒有喘息邊緣、主控台無錯誤。待人眼：路線紅帶與範圍圈會不會太像遊戲物件、喘息邊緣夠不夠明顯。
- 11/11 晚（畫面）使用者回報「看的方向突然自己轉掉」（只改 `troy-prologue/index.html`，未提交）：查過所有改朝向的地方，遊玩中只有滑鼠事件會改 V.yaw；鏡頭平滑、前傾、蹲低只動位置與俯仰。修兩個洞：(1) 鎖定時的 movementX/Y 跳值：鎖定後丟前 2 個事件；單次 > 400 像素、或 > 150 且超過最近平均 8 倍的事件丟掉（真的快甩只丟第一個）；(2) 拖曳模式沒按著左鍵就結束拖曳、視窗失焦也結束。驗證：把實際程式抽出模擬（鎖定後 900／700 跳值、移動中 −650 跳值都丟掉、正常移動完全照算、從靜止甩 10 個 180 只丟第一個）；瀏覽器拖曳正常、遺失 mouseup 後不按鍵移動不轉，開關開／關都試過。鎖定模式的真實跳值這裡重現不了，要使用者本機再玩確認。
- 11/11 深夜（畫面）「查看」的畫面（第 13 節，規則 8f5af0b；改 `troy-prologue/index.html`、`switch.html`，未提交；乾淨狀態 334 項通過；截圖在共享筆記 `check-lab-1111/`）：查看中火把與頭上微光變橘（朝向照規則 yaw）；地上橘圈標出他要走去的點（轉頭、走、聽時，走回去不畫），一般遊玩乘視覺輔助；呼吸範圍在屏息時畫（試驗場、相位條一直畫），也乘視覺輔助；把第 12 節寫的「高度警覺變橘」改成查看；喊人訊息改「走過來查看」；Q 列在開關開時藏起來；`?lab=check` 入口、面板（查看階段、聽的倒數、離你多遠、要走去的點離你多遠、呼吸範圍、查看與轉追殺次數、原因）、按鈕與按鍵 N（腳下）／M（右邊 3 公尺）呼叫 `g.labNotice`；switch.html 加「查看」。實測：站亮處被看見轉追殺；退進影子後按 M，轉頭→走過來→停下來聽→走回去→巡邏走完一輪；`?moves=0` Q 列在、無錯誤。提示與教學卡字句已交總控轉規則角色。
- 11/11 深夜（畫面）導覽、說明側欄、統一樣式（第一次交；改 nav.js、switch.html、troy-prologue/index.html、audio-test.html、layer-ride/index.html，未提交；乾淨狀態 340 項通過；截圖在共享筆記 `nav-help-1111/`）：nav.js 加 `switchUrl/goSwitch/mount`（右上或頁內的「← 試玩切換台」、右側可收合說明欄、手機底部抽屜、按 H 開關、記住開關、`mobileBottom` 讓開觸控列、tokens）；木馬之夜開場／暫停／失敗／過關加「回試玩切換台」、7 個試驗場說明；試聽頁、換層試驗場加連結與說明；試聽頁、切換台、換層試驗場顏色字體換成設計 tokens（直角、night／ash／dim／fire／moon）；切換台試聽版本選單對齊試聽頁、加 10 秒、拿掉過時註記。說明內容由子代理（Sonnet）從設計文件整理、我審過並修四處。第二次交（試聽頁節奏圖）待聲音層介面。
- 11/11 深夜（畫面）走法試驗場與查看疑心（改 troy-prologue/index.html、switch.html，未提交；截圖在共享筆記 `walk-lab-1111/`）：`?lab=walk&step=glide|stride|manual` 傳 `T.STEP_MODE`；試驗場入口與切換台加 P0／P1／P2；P2 時衛兵周圍畫圈（巡邏 `MANUAL_STEP_R`，讀不到退回 `STEP_R`；查看、追殺 `SEARCH_STEP_R` 並變紅；你在圈內變橘）；每一步腳下小波紋（踩準淡、出聲橘）與鏡頭下沉（`V.dip`）；準星下小圈（圈外倒數到 `player.nextStrideT`，圈內跟著 `Rules.beatsBetween` 的下一個可聽拍收縮、在判定窗內亮「現在按一下」）；面板（走法、衛兵與圈半徑、圈內外、進圈次數、下一步、按住走與圈內自己踩的踩準／出聲）；說明欄加 walk、查看註明「調整中」；查看中火把照 `q.susp` 由橘轉紅；按 R 重來時試驗場計數歸零（`resetMovesFx`）。實測 P2 進圈、小圈亮、P1 倒數、`?moves=0` 無小圈無錯誤。乾淨狀態 339／340，唯一失敗的規則測試在純 HEAD 也失敗（第 13 節提示字句），和畫面無關。
- 11/11 深夜（畫面）試聽頁節奏圖＋錄影畫面（改 audio-test.html、troy-prologue/index.html、switch.html，未提交；乾淨狀態 342 項通過；截圖在共享筆記 `rhythm-1111/`）：節奏圖每條鼓一條橫軌（最慢在下）、拍點大小亮度＝音量、最大聲那條橘、聽得到（≥ −12 dB）藍、聽不到灰；橘色直條＝最響的一擊（vEvent 真的或 coverHit），V2 假的過了才畫虛線；V4 強拍 A 圓圈、B 方框，只畫聽得到的條；盲區灰底；上方印聽得到幾條、最大聲那條每分鐘幾拍、版本。實測現行、V2（第 16 秒出現假的）、V4。錄影：`?clean=1` 錄影模式（切換台可勾）；查看 `check_retarget` 新目標點閃一圈（橘圈本來就跟 walkTo）；第 17 節預留：收到 `hunt_call`／`hunt_shout` 時 HUNT_START_DELAY 內火把全紅閃、畫面邊緣閃紅。
- 11/11 深夜（畫面）第 17 節喊聲空檔接正式欄位（只改 troy-prologue/index.html，未提交；乾淨狀態 344 項通過；截圖共享筆記 `rhythm-1111/4-hunt-shout-gap.jpg`）：`huntShouting()` 讀 `g.huntStartUntil`（音訊時間，比 `g.time`；沒有這個欄位才退回 `hunt_call.delay` 計時）；空檔內喊人的那名火把全紅閃、畫面邊緣 #red 快速閃（0.45～1），之後回追殺的穩定紅暈。實測查看試驗場站亮處：轉頭→走過來→停下來聽→追殺，空檔內紅邊 0.47～1 閃、追兵停在 2.5 公尺外。
- 11/11 深夜（畫面）第 17.3 節：追兵搜索路線一般遊玩也畫，照 `VIS.aid`（0、1 區全、2 區半、之後不畫），試驗場與相位條照舊全畫；第一次被追殺提示要加的一句已寫進共享筆記 `view-report-1111-late.md`（待轉規則角色）。只改 index.html，未提交；乾淨狀態 344 項通過。一般遊玩前兩區的淡出只確認邏輯，沒在整關實走。
- 11/14（畫面）第一批最小原型兩個（設計 2026-11-14-style-and-input-ideas.md 第 4、3.2 節；改 troy-prologue/index.html、switch.html，未提交；乾淨狀態 348 項通過；截圖在共享筆記 `style-labs-1114/`）：
  - `?lab=flash`：暗幕（#flashDark，暗度 0～0.95，滑桿、[ ]、`?dark=`，記在 localStorage）＋最響一擊時 2D 畫布（#flashFx）把 45 公尺內所有衛兵投影成發光人形（含牆後），亮 0.06 秒、撐 0.12、0.5 秒淡完，同時暗幕退 55%；面板顯示暗度、次數、上次照出幾名。實測：暗度 0.7 平常只看得到火光附近，那一擊照出 2 名（含遠處一名）。
  - `?lab=horse` 加敲暗號：T 敲，停 1 秒算一組；三下＝引開、兩下＝現在；每下都要在踩得上的拍上（±STEP_WIN），否則「同伴聽不懂」；離木馬 20 公尺外聽不到。引開 → 木馬那邊一聲（暫用 cue bellyHush）、波紋、灰塵抖、訊息；現在只認出不動作。面板列每下離拍毫秒（✓／✗）、認出哪一種、各幾次。實測真頁：三下歪判敲歪、兩下 −21／−53 毫秒認出現在；引開路徑用放寬判定的測試副本走過。
  - **要給聲音角色的新聲音**（目前暫用現有 cue）：(1) 敲擊聲（指節敲木頭，短、乾，暫用 latchClick）；(2) 木馬裡同伴回應的一聲（有方向、從木馬位置來的悶響，暫用 bellyHush，它帶一聲「噓」不太對）。
  - 沒做：引開讓附近衛兵回頭（木馬試驗場沒有衛兵、規則沒有介面）；「現在」的動作；震波從鼓聲方向掃過（發想裡的細節，先只做輪廓）。
- 11/15（畫面）使用者試玩回饋（playtest-notes 11/14 深夜）：照亮場景好玩不用改；敲暗號「不知道怎麼敲」、各試驗場說明要清楚（改 troy-prologue/index.html、nav.js、layer-ride/index.html，未提交；乾淨狀態 351 項通過）：
  - 敲暗號：畫面下方拍點條（能敲的拍從右往左滑，碰到直線就是一拍，淺帶＝±STEP_WIN；條下短線＝你敲的位置綠／橘，條上橘色菱形＝同伴示範）、準星倒數圈（下一拍前 0.6 秒開始縮，拍落下時閃）、四步教學卡（先看 4 秒 → T 敲準 1 下 → 同伴示範三下、換你 → 示範兩下、換你；Y 隨時再聽示範，示範時敲的不算）、每下即時「準／太早／太晚 n 毫秒」、一組判完條下顯示結果。面板加「教學：第 n / 4 步」。實測：教學依序前進、敲三下歪的那組判「同伴聽不懂」、Y 示範三拍間隔 0.55／0.52 秒。
  - 開頭三行（測／操作／看，按鍵寫最前面）：木馬之夜 9 個試驗場（belly、horse、run、crouch、listen、hunt、check、walk、flash）都有，出現在開場字卡、面板、說明側欄；換層試驗場加在開始畫面與說明欄。面板改成會換行（pre-wrap），以前過長的行會超出 300px。
  - 沒改：試聽頁 audio-test.html（聲音角色有未提交的修改，避免同時改同一檔），建議三行：測＝聽不聽得出鼓聲在哪裡重來、最響的一擊好不好認；操作＝開始／暫停按鈕・版本與一圈長度選單・F 在 G0～G3 播時、覺得最響一擊要來就按・B 按住拉弓、V 空彈；看＝節奏圖、F 按下的落點統計。等聲音角色改完再補。
- 11/15（畫面）**動 audio-test.html 之前先記**（總控 11/15 派工：試聽頁的功能邏輯屬聲音角色，我只動版面與文字）：只在 `<style>` 裡 `main { … }` 那一行後面加一段寬螢幕（≥ 1200px）版面 CSS——main 改兩欄格線，第 1 個 section（開始／音量／p）橫跨上方，第 2 個 section（節奏圖，捲動時黏在上方）放左欄，第 3 個起（警戒、版本、衝、弓弦、木馬、cues）放右欄；不改任何 HTML、script、id、文字。窄螢幕完全照舊。
- 11/15（畫面）總控追加四件（改 troy-prologue/index.html、switch.html、audio-test.html 只動 CSS；未提交；乾淨狀態 353 項通過）：
  - **蹲改 Alt**：輸入、TEL_KEYS（AltLeft、AltRight 取代 KeyC）、按鍵說明、蹲試驗場三行與面板、說明側欄、切換台、提示裡框鍵名的 KEY_RE 加 Alt。規則提示由規則角色改 risset.js，我沒動。輸入法與選單的結果見第 3 節。
  - **敲暗號新聲音**（2bd09c7）：每敲一下 audio.raw.knock()；同伴示範 knock(拍的時間) 直接排程；認出引開 audio.raw.horseReply(undefined, {count: 2})；沒有這些函式時退回 latchClick／bellyHush。實測：示範三下排在 +1.18、+2.00、+2.78 秒的拍上；三下 +20／+3／+12 毫秒認出引開，horseReply 回 {gain 0.643, dist 5.7, count 2}。字句改「木馬裡回了兩下」。
  - **照亮場景規格版**（2026-11-15-hit-reveal-spec.md 第 2～4 節，?reveal=1；?lab=flash 改用同一套）：平常環境光變暗（見第 3 節）；那一擊落下時一圈光從木馬往外 0.25 秒掃過 60 公尺，掃到的衛兵亮起輪廓（只描邊、隔牆也畫）＋面向淡扇形，撐 0.5 秒、0.3 秒淡掉，環境光同時回亮 60%；追殺中撐與淡減半；[ ] 調暗度（整關版跳訊息，前兩區自動少 0.15），按鍵說明加「[ ]」列。實測：第 2 區那一擊照出 2 名、半球光 0.55→0.165；開關關著時程式不執行（逐像素截圖比對沒做，只確認了程式路徑）。
  - **頁面電腦版整理**：開場改「左欄故事＋操作（按鍵表）｜右欄設定」、卡片 1200px，1440×900 不用捲動；按鍵寫法統一成鍵名在前（「Shift 按住」「空白鍵／滑鼠右鍵 按住」「Shift 點一下」）；說明小字 12→13px。切換台改兩欄（左整關、試聽、換層；右試驗場清單，每項附一句「測什麼」），加「照亮場景版」勾選。試聽頁寬螢幕兩欄（開始列橫跨、左節奏圖黏著、右其他面板），只加 CSS。查看試驗場按鈕不再壓到面板（labUnder）。總首頁、換層試驗場原本就整齊，沒改。手機 375 寬：開場、切換台沒有橫向溢出。
  - **弓弦引開**（規則 1e9c677 的 g.noise）：?lab=check 加 V 鍵與「彈弓弦（V）」按鈕 → audio.raw.bowPluck() 出聲，時刻用按鍵當下 currentTime − 輸出延遲（和踩步同一把尺）交給 g.noise({t, x, z, kind:'bow'})；腳下波紋淡藍＝被蓋住、橘色擴到 NOISE_R＝傳出去；面板加「弓弦：彈了幾次・被拍蓋住・傳出去｜上一彈結果」，查看原因加「弓弦聲」；說明側欄與三行說明加 V。實測：拍上那一彈「蓋住了，沒人來」，兩拍中間那一彈「傳出去了，衛兵走過來」、衛兵轉查看；bowPluck 被呼叫 2 次。
  - **喘的時候按空白鍵**（規則 1e9c677：喘時只停下、不屏息）：按著空白鍵或右鍵、沒在屏息、又在喘（panting）時，屏息欄字改「還在喘，屏不住氣」並變紅；喘不過氣鎖住（breathLock）時「喘不過氣，等一下才能屏」；第一次遇到跳一則訊息「還在喘，屏不住氣：人停住了，呼吸聲照樣傳得遠。喘完還按著就會屏住。」（每次開頁一次）。實測（把 pantUntil 設成 2.5 秒後模擬喘）：喘時字與紅色、訊息都出現，喘完自動接上「屏息中」。真的跑到喘的路徑沒走到（跑試驗場跑太久被抓）。
  - 乾淨狀態 353 項通過（index.html、switch.html 換上工作區版本）。
- 11/15（畫面）弓弦面板分蓋住原因（規則工作區版 g.noise 回傳 cover：'beat'｜'blind'｜null；舊規則沒有 cover 時被蓋住一律當拍上）：面板「拍上蓋住／掩護窗內蓋住／沒蓋住（引來查看幾次）」＋「上一彈」一行；說明改「拍上或掩護窗內就蓋住」。時刻仍用按鍵當下 currentTime − 輸出延遲，不用 bowPluck 回傳的 t（那是出聲的 ctx 時間，比玩家聽到拍再按晚一個輸出延遲，藍牙 150～200 毫秒會讓每一彈都判沒蓋住）；和踩步、敲暗號同一把尺。實測（工作區規則）：掩護窗開頭 0.3 秒那一彈（±90 毫秒內沒有拍）判掩護窗內蓋住、拍上那一彈判拍上蓋住、兩拍中間判沒蓋住並引來 g2b 查看。乾淨狀態 355 項通過（HEAD＋工作區 index.html；規則的 cover 還沒提交，測試用 HEAD 規則）。
- 11/15（畫面）介面改成方向 A「夜城訊號」（未提交；乾淨狀態 361 項通過；截圖在共享筆記 `ui-system-1115/`）：新增 `ui-tokens.css`（設計代號、鍵帽、按鈕、面板、狀態字、拍帶外框）與 `beatstrip.js`（拍帶）；總首頁改題字靠左＋拍帶＋清單（不用卡片牆）；切換台改城區地圖（第 0～4 區由西往東，試驗場掛在所在區，每區「從這一區玩整關」照上面的整關設定）；遊戲頁開場題字 64px＋拍帶跨兩欄、按鍵全改鍵帽、按鈕青銅、失敗標題改血紅色條、勝利畫面文字靠左、試驗場面板題字標題＋狀態字上色、敲暗號拍點條改用共用拍帶（同伴示範改白色菱形，說明字句一起改）、HUD 字型去掉等寬；試聽頁（先記：功能是聲音角色的，只動 CSS 與頁首一個靜止拍帶）換設計代號；試玩清單頁頁首題字＋拍帶、完成用海青；nav.js 說明欄換色、加焦點框、「← 試玩切換台」不再撐滿格線。檢查：對比（皆對城牆石）羊皮紙 12.4、青銅 6.3、海青 6.1、火把橘 5.6、次要字 6.6；Tab 焦點框在切換台、開場、總首頁看得到；390 寬手機版三頁不破；?moves=0 開局無錯誤；減少動態效果時拍帶靜止。
  - 沒做：3D 場景裡的效果色（邊緣暈、輪廓、波紋的橘）沒動；面板的「查看」只在「查看中」上色；試聽頁節奏圖畫布顏色屬聲音角色的程式，沒改（圖例維持舊色、和畫布一致）。
- 11/15（畫面）連結同分頁、DRIVE 試驗場（未提交；乾淨狀態 362 項通過；截圖在共享筆記 `drive-lab-1115/`，上一頁回來的兩張在 `ui-system-1115/` 23、25）：切換台與試玩清單拿掉全部 target="_blank"、說明字改「同一分頁打開，按上一頁回來」；?drive=0 轉 T.DRIVE_MODE=false；LAB 清單、開場試驗場連結、切換台第 2 區加「越來越急（DRIVE）」；切換台整關設定加「關掉越來越急（?drive=0）」；面板（急度數字與長條、段名與起止、段內秒數、追殺／追殺前、進段值、試驗場蓋過哪些）、開頭三行、說明側欄、按鍵與按鈕列。實測：進場 0.45（段 3）；按 7 五秒後 0.90；按 K 2.6 秒到 1.00、追殺前 0.91；U 後兩下 , 定值 0.90；?drive=0 時 g.drive=null；預設整關 DRIVE 開、按鈕列不出現。
- 11/17（畫面）關卡編輯器（未提交；乾淨狀態 369 項通過，其中編輯器 7 項；截圖在共享筆記 `level-editor-1117/`）：俯視方格一格 1 公尺、滾輪縮放、空白處拖曳平移；畫牆／矮掩體／影子（拖曳，吸附 0.5 公尺）、放衛兵（一點＝站崗，可設面向；加巡邏點）、設各區起點；選取後拖曳移動、拖四角改大小、右欄打精確數字、牆／矮掩體／影子互換；Delete 刪、Ctrl+Z／Y 復原重做；插入空地加長到 90 × 30；複製 JSON、下載、匯入；自動存檔；「在遊戲裡試」同分頁開 ?level=local；檢查面板逐區（衛兵 ≤ 3、影子 ≥ 3 與相隔 ≤ 10 公尺、矮掩體數、起點在影子裡、8 公尺空地估算；關口寬與同關口衛兵列提醒）；頁首三段給沒寫過程式的人看的說明；切換台「其他」加入口。遊戲頁加 ?level=local。實測：畫影子、選衛兵拖曳、復原兩次回到和現有關卡相同、插入後 90 寬、進遊戲第 4 區玩家在 x 78、上一頁回編輯器狀態還在；預設整關仍 60 寬、沒有提示。現有關卡檢查結果：城門區影子只有 2 塊（不過）、窄巷沒有 8 公尺空地（提醒），和企劃點名的問題一致。
  - 限制：區數固定 5 區（規則 startZone 只到 4）；新空地先算在城門那區，要分成新區得由規則加出口與區；木馬、城門只顯示不能拖。
- 11/17（畫面）遊戲頁區號改讀資料、編輯器加區刪區（未提交；乾淨狀態 373 項通過，其中編輯器 9 項；截圖在共享筆記 `level-zones-1117/`）：index.html 的 12 處寫死區號照規則角色清單改成讀資料；編輯器加「區」面板（名字、教什麼、難度階、DRIVE 段、出口通往哪一區、畫出口、刪除這一區）、工具列「出口（6）」與「目前的區」、「加一區」（插入空地後自動帶入範圍）。實測：插入空地＋加「慶宴的街」→ 在遊戲裡試，從第 1 區經暗門、各區出口走到第 5 區城門，HUD 區名與進區訊息依序是 窄巷／慶宴的街／城門；上一頁回編輯器 6 區、匯入匯出相同；不帶 ?level=local 時第 1、4 區的區名與提示照舊。
- 11/17（畫面）編輯器「區」面板加配樂 music（自動＝不寫欄位、intro／belly／temple／alley／gate；資料裡是編號時顯示「第 n 組」照留）與風 wind（跟配樂那一組＝不寫、沒有風＝null、從地圖上一點吹來＝點一下設 {x, y: 0, z, g}，g 預設 1、可改 0～1.5；資料裡是編號時照留）；地圖畫各區的風（目前這一區青銅）；說明與圖例補上（聲音角色 51656c6，audio.md 最後一段）。實測：改了再全部復原和現有關卡相同、匯入匯出相同；bash tools/cleancheck.sh 375 項通過。截圖 level-zones-1117/70-music-wind.png。未提交。
- 11/17 晚（畫面）?map=final 與序、終字卡（使用者在總控選「今晚就做」；未提交；cleancheck 375 項通過；截圖在共享筆記 `story-final-1117/`）：index.html 讀期末地圖、檔案沒到時顯示一行訊息並用原本地圖（字卡翻完再說一次）；暗區調暗＋最響一擊照亮，離開暗區還原；序 3 張（木馬進城／全城慶祝／夜深）、終 1 張（城門開了），黑底、題字、插圖框 16:9 寫「插圖待放」，點擊／空白鍵／Enter／→ 翻頁，Esc 或「略過」跳過；game.story 旗標；switch.html 加「期末七段版」。旁白初稿等總控跑 humanizer-zh-tw。實測：沒帶參數無字卡、flashFx 不出現；?map=final 用規則角色的正式地圖（90 × 30、8 區）從序翻完 → 腹中 → 木馬下 → 神殿廣場 → 慶宴的街 → 窄巷 → 沒有火的後街（暗、照亮開）→ 城門 → 推開 → 終字卡 → 原本的勝利畫面。
- 11/23（畫面）木馬之夜短展示關卡接進遊戲頁（只改 troy-prologue/index.html，未提交；全套與 cleancheck 379 項通過；截圖在共享筆記 `demo-1123/`）：`?map=demo` 開一張故事兩句＋四組按鍵的字卡，空白鍵或點一下開始；結局與失敗畫面有主按鈕「再玩一次（空白鍵）」，回到乾淨字卡。無頭實測（--mute-audio、?mute=1&nolock=1）：桌機 1440 × 900、手機 390 × 844 各連跑 3 輪「開局 → 木馬下 → 神殿廣場 → 城門 → 再玩一次」，另各測一次失敗後再玩一次，主控台 0 錯誤；換區是程式移到出口、城門進度是程式設定，不是真人走完。檔案擋掉時有一行訊息；不帶參數與 ?map=final 開局正常（只做開局比對，沒做逐像素比對）。
  - 還沒解決：手機沒有觸控操作，手機寬度只驗證版面與流程，真的手機玩不了；展示請用電腦、鍵盤滑鼠。開局鏡頭面向火盆和牆，新觀眾知不知道往哪走要真人看。
- 11/26（畫面）木馬之夜 3D 場景加強試做（只改 troy-prologue/index.html，未提交；全套 400 項與 cleancheck 通過；截圖、幀數表在 `docs/process/art-trial-2026-11-26/`）：?art=2 開，五項 mat 材質、fire 火光、fog 霧、shadow 陰影、key 關鍵物件可個別開關，另有 mat2 高品質材質。關鍵物件：衛兵披風與盔甲微微自發光＋警告紅外輪廓、木馬與城門火橘描邊、各區關口兩側發光界石與地上光帶。建議 12/24 用 mat,fire,fog,key（RTX 3060 上 182～274 幀、軟體算圖 10～16 幀），shadow 與 mat2 不用。
  - 沒做：介面（美術 C）；火盆位置仍是預設地圖寫死的座標，七段地圖新區沒有火盆（原本就這樣，非這次改動）。真人要看：在展示用電腦實跑幀數、暗色寫實的程度是否太亮、界石會不會太搶眼。
  - 11/26 晚（審過提交 32761e7 後追加）：不寫 fx 預設改建議組合四項；界石改矮、改暗、出生點 2.5 公尺內不放，地上光帶保留；重截 plaza-1、gate-1。400 項與 cleancheck 通過，未提交。
- 11/26 晚（畫面）七段地圖補火盆（只改 troy-prologue/index.html，未提交；400 項與 cleancheck 通過）：先查過火盆純畫面（規則的「火光圈」是衛兵火把的感知範圍、影子是關卡資料的 shadows，都不讀火盆位置）。build 的火盆來源改成：關卡資料有 fires 欄位就照它 → ?map=final 用 index.html 的 FIRES_FINAL → 都沒有才用原本寫死的預設座標（預設地圖完全不變，木馬開關的位移也只對預設座標做）。七段配置：慶宴的街 4 盆加 3 支火把、沒有火的後街 0 個、其餘每個關口附近一支火把，全部離影子 1.5 公尺以上；art=2 的火光效果自動套用。截圖 fires-feast-art2、fires-feast-不開art、fires-back-art2。
  - 待辦：FIRES_FINAL 之後該搬進 level-troy-final.js 的 fires 欄位（關卡資料歸規則角色，畫面不能改）；搬過去後 index 的表可刪。
- 11/27（畫面）火盆表搬家＋介面風格 ui=2 試做（未提交；全套 401 項與 cleancheck 通過）：
  - 火盆：FIRES_FINAL 搬進 level-troy-final.js 各區 fires（總控派工、使用者 11/27 選定，這次准畫面改關卡檔；後街是空清單）；index 讀 L.fires → 各區 zones[].fires 依區序接起來（任一區有寫就照區的）→ 預設座標。createLevel 會保留這兩種欄位。編輯器 insertWidth 讓 fires 跟著往東移，core.test.js 加一項。驗收：map=final&art=2 火盆光源座標和 512ad94 逐一相同、map=demo 相同（只差衛兵火把晃動）。
  - ui=2：<html class="ui2">＋index.html 第一個 style 結尾的 .ui2 區塊（純 CSS，不改文字）；head 的小腳本只在 ui=2 時加 class 並載文楷與思源黑 700。截圖在 art-trial-2026-11-26/ui/。關口提示用城門門閂那句（startZone=7、站到 87.4,15 會出現）；七段地圖其他關口沒有專屬提示文字。
  - 截圖腳本陷阱：用 head | sed 組腳本時 sed 失敗，主體沒寫進去，腳本開完瀏覽器就掛著不結束；組好後先 grep 確認主體在。
- 11/27（畫面）木馬之夜離線：引擎與字體放進專案（未提交；全套 401 項與 cleancheck 通過）。vendor/three.min.js（r128、603 KB）＋ vendor/fonts/ 28 個 woff2 子集（2.07 MB），合計約 2.8 MB。index.html 三處外部網址改讀本機；ui-tokens.css 拿掉 @import，七個其他頁面補回 Google Fonts <link>（那些頁面照舊需要網路字體，畫面不變）。
  - 驗收（CDP 無頭、Fetch 攔掉所有非 127.0.0.1 請求）：?map=final&art=2 與 &ui=2 兩種，對外請求 0 個、THREE.REVISION=128、該載的字體都 loaded。和 HEAD 版（連網）同場景比：標題畫面差異只在拍帶動畫與幾個字的反鋸齒邊緣，放大看字形相同；3D 畫面差異只在火焰閃動與飄浮火星，HUD 文字無差異。沒用 Playwright（沒安裝，要另外下載），改用 Chrome CDP 的 Fetch 攔截，效果相同。
- 11/28（畫面）新開場第一批＋鏡頭動畫（未提交；全套 409 項與 cleancheck 通過，cleancheck 要連 vendor/fonts/ 一起給，否則字體涵蓋測試會失敗）。截圖與量測腳本在 `docs/process/opening-2026-11-28/`。
  - 有序時（?map=final 預設）新流程：序黑底一次一句（STORY_CARDS.prologue，叫聲音的 storyCue）→ 腹中「聽。」4 秒（按鍵不收，Esc 整段跳過）→「跟著他敲。」（校準搬進腹中：CAL.mode 'belly'，面板在下方、不按開始、遊戲聲音壓到 6%，結果直接寫 game.inputOffsetMs）→「踩著它走到暗門。」（預告圈）。規則的 'belly' 進區提示在新流程不顯示。腹中練習 HORSE_MODE 預設開（?horse=0 關）。
  - ?intro=old 回舊流程（三張字卡、不校準、腹中練習要 ?horse=1）；?map=demo 只把校準說法換成「跟著同伴敲」。標題畫面開始鍵上方加耳機與鎖滑鼠一行，按鍵說明拿掉那兩句。
  - 量時間（程式玩家）：按開始到走出木馬 36～48 秒（序約 21 秒、聽 4 秒、敲 9 秒、走 5～12 秒）。
  - ?intro=cam：序之後放約 26 秒鏡頭（camRoute 全從關卡資料算：城門外越過門頂 → 各區 botRoute 倒著走 → 停在木馬前 9 公尺、從落點那側看），黃昏轉夜；Esc／空白鍵跳過；localStorage 'troy-intro-cam-seen' 記住看過。幀數：演出中 131～209、腹中遊戲 91～111（RTX 3060、1280×720）。
  - 第二段已接（總控轉規則 b6a8afe 約定）：失敗畫面 `#failWhy` 先顯示 `g.failLine`，null 時退回 `failReason`；暗示階梯那行（`#failHint`）照舊。① 提示叫回不用改：`aidTarget()` 本來就讀 `game.visualAid`；設定選單「視覺輔助」選強制開／關時 `aidTarget()` 直接回 1／0，不會叫回（和規則的設計一致）。
  - 鏡頭動畫修貼牆（總控 11/28 審查）：botRoute 是貼影子走的路，照走會貼牆。改成三件事：街上路線每 1.5 公尺取一點，往兩側探 9 公尺找牆（`low` 的不算），移到中線，只有一側有牆就離牆 3 公尺；前後 5 點平均後每 3 公尺留一點；高度 `CAM_EYE` 12 公尺、往前看 `CAM_AHEAD` 0.08 的街面。城門外兩點標 `fixed`，從 20 公尺高越過門頂；終點也 `fixed`，在 3.2 公尺高、離木馬 9 公尺。
    - 試過的高度：3.6 公尺在窄巷裡整片都是牆；5.2～6.2 公尺仍有 3 格一半以上是牆。原因是城內牆高 4 公尺、城牆 8 公尺，街又窄又彎。12 公尺俯看時，街景、火盆、衛兵都看得到。用 `intro-check.mjs camseq` 每 3 秒拍一張檢查。幀數：演出中 144～160。
  - 遙測 `fail` 事件多帶玩家 `x`、`z`（四捨五入到 0.1），給驗收的試玩摘要工具。無頭實測：被抓時 failLine「奧德修斯在火光照得到的地方移動，被衛兵察覺了」照樣顯示、fail 事件 `{code, reason, zone, x: 28.6, z: 12}`、序跳過叫 `storyCueStop(0.3)`。
- 11/28 晚（畫面，未提交）使用者回報「按 Esc 回來後，滑鼠不會跟著動」。原因：`lockPointer` 失敗一次就把 `lockFailed` 設成 true，從此只剩拖曳。按 Esc 解除鎖定後，瀏覽器會擋掉沒有點擊的鎖定要求（用 Esc 繼續、Esc 跳過序、聽、校準或鏡頭動畫後叫的 `lockPointer`），也會擋解除後一秒多內的要求，所以一定會中。
  - 改法：只有點擊當下（80 毫秒內）叫的鎖定、又不在解除後 1.5 秒內失敗，才當作頁面不給鎖、改拖曳（claude.ai 試玩頁）；其他失敗只是這次沒鎖到，畫面中間顯示 `#lockHint`「點一下畫面，滑鼠轉頭看」，點畫面就鎖回來。
  - `pointerlockchange`：自己放開（`unlockPointer` 標 `lockSelfExit`）不暫停；本來就沒鎖的事件不算；鎖定晚到、字卡、校準或鏡頭動畫已經蓋上就放開（`lockBlocked()`）。暫停後 0.4 秒內的 Esc 不當「繼續」，以防瀏覽器把解除鎖定的那下 Esc 也送進頁面，暫停後又馬上繼續。
  - 驗證：`docs/process/opening-2026-11-28/lock-check.mjs` 在無頭模式換上假的鎖定，比 Chrome 嚴，Esc 解除後一律要點擊。六條路徑都是「回到可操作 → 沒鎖就有提示 → 點一下鎖回」；失敗畫面、字卡、校準、鏡頭動畫上都不鎖、不提示。沒測到真的 Chrome 鎖定，要人在本機試一次。
- （已由規則角色依模式切換）規則層提示文字仍寫「節奏斷掉的瞬間」（例如暗殺教學），不中斷模式下要改，屬規則角色。
- 要人眼確認：邊緣白閃亮度、高度警覺暈和既有起疑暈（`#edge`）疊在一起會不會太橘、追殺衝刺速度線的量、火光基準亮度（FIRE_BASE 0.35 讓平常比以前暗）。

## 2026-11-24 短版步伐提示與校準畫面
（畫面，代理總控；只改 `troy-prologue/index.html`，未提交；依據競品分析 `docs/design/2026-11-23-competitor-design-review.md` 3.1）
- **步伐提示**：`?map=demo`（`DEMO_ON`）開局前 20 秒顯示 `#stepRing`，之後 3 秒淡出（`DEMO_RING_ON`／`DEMO_RING_FADE`、`demoRingAlpha()`）。計時用規則時間 `game.time` 的差累計，暫停、字卡時斷開（恢復後不把暫停那段算進去）；`newGame()` 歸零，所以「再玩一次」重新給 20 秒；區域重來（R）不歸零。短版是 P0（`STEP_MODE` glide），原本 `stepRingFrame` 在 glide 不畫，所以加一個 glide 分支：小圈隨下一個聽得到的鼓點收縮（`Rules.beatsBetween`，`minGain` = `MASK_GAIN`，判定寬度 `STEP_WIN`／蹲著 `CROUCH_STEP_WIN`），字「圈縮到底＝鼓點」、落在判定窗內「鼓點：起步不出聲」、附近沒有可聽鼓點（盲區、空檔）時圈停在外面寫「鼓停了：腳步聽得到」。其他地圖、試驗場的 `stepRing` 行為不變（`demoRingAlpha` 回 null）。`backToIntro()` 會把小圈藏起來。
- **開場校準**：字卡 → `demoStart()` → 校準畫面 `#calib` → `startFromTop()`。畫面上 8 個圓點跟著空白鍵亮；按「開始（空白鍵）」才敲鼓（先 4 下輕的預備拍，聲音層決定），Esc 或「跳過」隨時跳過。
  - 聲音：另建一個只出校準拍的聲音層 `CAL.inst`（`AudioMod.createAudio`，`mute:{rhythm, bass, ambient}` 全關、四個音樂層關、`setSynthVolume(0)`），呼叫 `CAL.inst.calibClicks(8)`；不這樣做的話，`createAudio` 一建好遊戲鼓聲就自己排程，會和校準拍打架。關掉校準畫面時 `calibStop()`＋`dispose()`，開局再照常 `makeAudio`。
  - 敲擊時間 `actx.currentTime − (outputLatency || baseLatency || 0)`，和 `pend.actAt` 同一公式；拍點是 `calibClicks` 回傳的同一個 actx 排程時間。收到最後一拍＋0.6 秒（`CAL_TAIL`）才算，交給 `RissetCalib.estimate`。
  - ok：`CAL.offsetMs` 四捨五入成整數，顯示「已校準 +NN 毫秒」，1.6 秒後自動開局（或按空白鍵）；`newGame()` 把它寫進 `opts.inputOffsetMs` 和 `game.inputOffsetMs`（規則 `inputOffsetSec(game)` 讀後者）。不 ok：「只收到 N 下」或「這幾下和鼓點差得太多」，判定維持原樣，按鈕「再試一次（空白鍵）」「跳過（Esc）」。
  - 一頁只問一次（`CAL.done`）：校準成功或跳過後，「再玩一次」不再出現校準畫面，沿用本局的偏差；重新整理頁面才重量。不寫存檔。
  - 自動略過（不報錯，直接開局）：`window.RissetCalib.estimate` 或 `RissetAudio.calibClicks` 不存在、`?calib=0`、`?mute=1`（聽不到鼓沒意義；也讓 `demo-walk.mjs`、`demo-stepring-check.mjs` 這些帶 `mute=1` 的自動測試不必改）。`calibClicks` 丟例外或沒回拍點時同樣略過並 `console.warn`。
  - 頁面新增載入 `<script src="calibration.js">`（規則角色的新檔）。**claude.ai 試玩頁重新發布時 `files` 要多帶 `calibration.js`**；打包工具若是逐檔列出也要加（沒帶就自動略過校準，照玩）。
  - `TroyDebug.calib` 給自動驗證讀狀態（`phase`、`done`、`offsetMs`、`taps`、`beats`）。
- **驗證**（無頭、`--mute-audio`）：
  - `node tools/playtest-recorder/demo-stepring-check.mjs`：pass（1～19 秒 100% 顯示，最後一次 23.0 秒，23～26 秒全部隱藏）。第一版用 loop 的 dt 累計，第一幀卡頓少算 0.6 秒、23.5 秒才消失，改成規則時間後通過。
  - 自寫探針（照拍點時間派送空白鍵）：晚 50 毫秒 → 「已校準 +69 毫秒」（setTimeout 誤差），自動開局 `game.inputOffsetMs = 69`；回字卡再按空白鍵直接開局、偏差仍 69；晚 300 毫秒 → 不 ok、顯示再試一次；Esc 跳過 → 開局、偏差 0。截圖看過校準畫面與小圈版面。
  - 中途聲音角色工作區的 `audio.js` 曾在開局丟例外（`createAudio` 先 `tick()`，`calibQ` 的 var 還沒賦值），當時用暫存複本驗證；聲音角色已加上 `!calibQ ||` 防呆，最後在工作區原檔重跑：小圈檢查 pass、校準晚 50 毫秒 →「已校準 +59 毫秒」、再玩一次沿用 59，主控台 0 例外。
- 沒做：觸控敲擊（展示用鍵盤）；校準結果沒進遙測（`telStart` 在校準之後，要的話可在 `collectEnv` 加 `inputOffsetMs`）；預備拍與鼓點的音量、間距是聲音層的事。
