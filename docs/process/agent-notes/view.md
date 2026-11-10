# 角色筆記：畫面

負責：`prototypes/*/index.html`、`prototypes/nav.js`、`prototypes/telemetry.js`。
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
- （11/10）木馬之夜在 claude.ai 預覽以 `file://` 開時，`../nav.js`、`../telemetry.js` 都載不到；本機測試用暫存站台：複製 `nav.js`、`telemetry.js` 到根目錄，原型放子資料夾，index 包外殼，`python -m http.server 8781`（8765 埠被別的程式佔用）。

## 4. 驗證方式
- **本機開原型（有外殼）**：
  - 打包：`bash tools/build-itch.sh` → 輸出 `dist/odyssey-series/`（結構同 `prototypes/`，片段自動包外殼、three.js 改本地）。在該資料夾起靜態伺服器（例如 `python -m http.server -d dist/odyssey-series 8000`），開 `http://localhost:8000/troy-prologue/index.html`。這條路徑 `../telemetry.js`、`../nav.js` 都載得到。
  - 錄音工具：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 80`（自動包外殼、錄聲音與畫面、跑 analyze；注意上面的 404 陷阱）。
  - 網址參數：`?startZone=1..4`（木馬之夜直接進某區）、`?telemetry=1`（右下角即時摘要）、`?musicZone=0..4`、`?musicOff=chant,chorus,shepard,theme`；比箭 `?debug`。
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
- 未做（規格有、草稿沒有，等派工）：M3「安撫每對拍 → 衛兵火焰收一格」、M4「p → 1 火光泛紅」。
- 要人眼確認：邊緣白閃亮度、高度警覺暈和既有起疑暈（`#edge`）疊在一起會不會太橘、追殺衝刺速度線的量、火光基準亮度（FIRE_BASE 0.35 讓平常比以前暗）。
