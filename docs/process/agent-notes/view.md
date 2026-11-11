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
- 11/11（畫面）C3 補充裁決修正：鏡頭升到 A（暗門東 16、高 8）後，等那一擊期間慢慢推到 B（東 9、高 5、越過雕像台座），那一擊前 0.3 秒停穩不動；那一擊落下時同伴落地、離暗門 HORSE_SIGNAL_R（8）內的衛兵 0.3 秒傾倒（只動畫面），衛兵在鏡頭轉回時就面朝東。同伴改成站姿約 1.8 公尺（腹中的坐姿剪影太矮）。時機：過關時 `cinPlan()` 依規則 blindWindows 決定鏡頭何時開始動（`CIN.tReady`）；之後每幀重算下一個真的窗（`cinNextWindow`，規則過關後節奏還會變，過關當下算的差約 1 秒）讓鏡頭照它定位；那一擊以規則的 horse_signal 為準，訊號若在鏡頭就位前就到，改用下一個真的窗。保險改用音訊時間 30 秒（測試時背景分頁音訊時鐘會停，牆上時鐘 60 秒只當最後保險）。跳過時呼叫 audio.raw.stopHorseSignal()。注意 `CIN_GAP, CIN_FALL, …, CIN_N` 那一行被聲音角色的 audio.test.js 讀取，常數順序別改。驗證：?horse=1 強制過關，訊號 5.69 秒、鏡頭 5.39 秒停穩，兩名衛兵倒下，同伴站高佔畫面 11.3～11.5%（要求 ≥ 8%）；302 項測試通過；截圖在暫存 `shots-horse3b/`。
- （已由規則角色依模式切換）規則層提示文字仍寫「節奏斷掉的瞬間」（例如暗殺教學），不中斷模式下要改，屬規則角色。
- 要人眼確認：邊緣白閃亮度、高度警覺暈和既有起疑暈（`#edge`）疊在一起會不會太橘、追殺衝刺速度線的量、火光基準亮度（FIRE_BASE 0.35 讓平常比以前暗）。
