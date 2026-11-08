# 試玩數據搜集（遙測）設計

日期：2026-11-08　狀態：已實作，接上《木馬之夜》與《大廳復仇》，給 11/10 本機第二輪試玩用

遙測（telemetry）：遊戲自己記下玩家怎麼玩（按了什麼、什麼時候按、在哪裡失敗），之後拿來算數字。

## 0. 為什麼要做

- 我們到目前為止的試玩回饋只有「玩玩看、感覺如何」。`2026-11-08-expert-lens.md` 的玩家研究員會記第一次成功盲區行動在第幾秒、每區失敗次數、按鍵相對拍點的時間差分布，並用真人的 σ（按鍵誤差的標準差）回填模擬。
- `2026-11-08-music-core-concept.md` 第 7 節 N1～N11 的驗收有一半要真人數據：N1 主動時間比例、N2 每循環選擇數、N10 真耳朵 σ。
- `docs/process/playtest-notes.md`：11/10 本機第二輪試玩（喇叭、耳機各一輪）就要用。

【改編】這是製作工具，不是遊戲內容；畫面上的文字一律用世界觀外的介面語氣。

## 1. 收什麼

每一筆紀錄都帶：`t`（規則的音訊時間）、`gt`（本局時間，從開局第一筆起算的秒數）、`ci`（循環編號）、`p`（相位 0～1）、`z`（區域；大廳復仇沒有區域，記 null）。

| 類別 | 內容 | 從哪裡來 |
|---|---|---|
| 規則事件 `events`（name = `out`） | `game.out`（木馬之夜）／`game.events`（大廳復仇）每一筆原樣記：type、a（音效名）、附帶欄位（`step_*` 的 x、z、beatT；`calm_*` 的 index；`hint` 的 key、level…） | 頁面取走事件的地方（`drain()`／`onEvent()`） |
| 頁面事件 `events` | `start`、`zone`（from、to）、`fail`（code、reason、zone）、`retry`、`win`、`pause`、`resume` | 頁面每幀比對 `game.zone`、`game.phase` |
| 輸入 `inputs` | 每次按下／放開：鍵名（`KeyW`、`Space`、`ShiftLeft`、`KeyE`、`KeyQ`…；滑鼠記 `Mouse0` 左鍵、`Mouse2` 右鍵）、`actAt`（按鍵當下的音訊時間減輸出延遲，和規則判定用的同一個值）、`agt`（換成本局時間）、`state`、`off` | keydown／keyup／mousedown／mouseup |
| 結果 `zones`＋摘要 | 每區進入、離開時間、失敗次數與代碼；提示出現（key、階）；第一次成功盲區行動、第一次安撫成功／完成的時間 | 模組由上面的事件整理 |
| 時間累計 `stats` | 遊玩總秒數、主動秒數（N1）、各狀態秒數、幀間隔直方圖（算幀率中位） | 頁面每幀 `tick()` |
| 環境 `env` | 播放裝置（開場選）、瀏覽器字串、平台、視窗大小與像素比、是否觸控、`outputLatency`／`baseLatency`／`sampleRate`（開局與兩秒後各讀一次）、實驗開關（視覺輔助、難度、相位條、音樂層與音量；大廳復仇是難度、越危險越快、節奏條）、網址參數、版本 | 開局時 |
| 主觀 `survey` | 三題 1～5 分：「聽得出驟降嗎」「難度」「好玩」，加自由填寫；可略過（記成 skipped） | 一局結束時的快問 |

**狀態 `state`**（按鍵當下）：`blind` 盲區（大廳復仇的空檔也記成 blind）｜`gap` 木馬之夜警戒時低音拍之間的空檔｜`fake` 假驟降那一下｜`alert` 警戒｜`hunt` 追殺｜`patrol` 平常｜`drum` 大廳復仇鼓聲中。

**時間差 `off`**（秒，正 = 晚按）。頁面只在「這一下是在對那個拍」時才填，摘要工具不用再猜：

| 欄位 | 木馬之夜 | 大廳復仇 |
|---|---|---|
| `bass` 最近的低音拍（`bassBeatNear` 的 off） | 衛兵起疑中按 Q | Q／右鍵舉盾 |
| `blind` 最近的盲區開頭 | Shift、E（警戒中是空檔開頭）；離開頭超過 1 秒的不進分布 | 放箭（左鍵／F）對最近的空檔開頭 |
| `beat` 最近的可聽鼓點（音量 ≥ MASK_GAIN） | Q、Shift、E | 不填 |

**版本**：頁面讀 `<meta name="odyssey-build">` 或 `window.ODYSSEY_BUILD`（打包工具之後可帶入 git 提交編號），沒有就寫 `dev`。

## 2. 不收什麼

- 不收任何個人資料：沒有姓名、帳號、IP、地理位置。每局一個隨機 8 碼局號（不和人綁）。
- 不自動上傳。沒有任何網路請求；按「匯出數據」才在本機產生檔案。
- 不記和遊戲無關的按鍵（只記上面列出的遊戲鍵），快問的自由填寫框裡打字不當遊戲按鍵、也不記成輸入。
- 開場告知一行：「本頁會在你的瀏覽器裡記錄試玩數據，只存在本機，按『匯出』才會產生檔案。不記姓名、帳號或任何個人資料。」

## 3. 存哪裡

- `localStorage` 鍵 `odyssey.telemetry.v1`：最近 20 局（陣列）。遊玩中每 5 秒存一次，一局結束、匯出、關分頁（pagehide）時也存。
- 存滿（QuotaExceeded）就丟最舊的一局再試。一局最多 8000 筆事件、8000 筆輸入（約 15 分鐘），超過只計數（`stats.dropped`）不存。
- 上次選的裝置存在 `odyssey.telemetry.device`。
- 所有讀寫包 try/catch：隱私模式、沙盒、沒有 localStorage 都照樣能玩、能看即時摘要、能匯出這一局。
- 「匯出數據」按鈕在開場、暫停（木馬之夜）、失敗、勝利畫面。一次下載 JSON 與 CSV 兩個檔，檔名 `telemetry_<原型>_<YYYYMMDD-HHMM>_<最新一局的局號>.json／.csv`，內容是本機存的全部（最多 20 局）。CSV 開頭有 BOM，Excel 開中文不亂碼。

JSON 格式（縮短）：

```json
{ "schema": "odyssey-telemetry/1", "exportedAt": "2026-11-10T06:30:00.000Z",
  "runs": [ {
    "schema": "odyssey-telemetry/1", "proto": "troy-prologue", "version": "dev", "runId": "9cb5108c",
    "startedAt": "…", "device": "wired",
    "env": { "ua": "…", "viewport": {"w": 960, "h": 540, "dpr": 1}, "outputLatency": 0.01, "baseLatency": 0.005,
             "toggles": {"visualAid": "auto", "cycle": 10, "music": "synth"}, "query": "?startZone=2" },
    "events": [ {"t": 3.16, "gt": 3.01, "ci": 0, "p": 0.509, "z": 2, "name": "out", "data": {"type": "sfx", "a": "step_masked", "x": 6.06, "z": 15, "beatT": 3.19}},
                {"t": 25.2, "gt": 25.0, "ci": 3, "p": 0.62, "z": 2, "name": "fail", "data": {"code": "caught_move_high", "reason": "…", "zone": 2}} ],
    "inputs": [ {"t": 12.9, "gt": 12.8, "ci": 1, "p": 0.01, "z": 2, "key": "ShiftLeft", "down": true, "actAt": 12.93, "agt": 12.78,
                 "state": "blind", "off": {"blind": -0.12, "beat": -0.04}} ],
    "zones": [ {"z": 2, "enter": 0, "leave": null, "fails": 1, "codes": {"caught_move_high": 1}} ],
    "stats": { "time": {"total": 18.1, "active": 8.9, "byState": {"patrol": 11.0, "blind": 1.4, "hunt": 5.7}}, "dtHist": {"16": 900}, "dropped": 0 },
    "result": {"outcome": "quit", "gt": 25.0, "endedAt": "…"},
    "survey": {"drop": 4, "difficulty": 3, "fun": 5, "note": "…", "skipped": false, "when": "fail"},
    "summary": { "…": "summarizeRun 的結果" } } ] }
```

`result.outcome`：`win` 過關｜`fail` 倒下（大廳復仇；木馬之夜失敗後可以重來，所以失敗是事件不是結束）｜`quit` 回開場｜`restart` 從頭開始或重來時上一局還沒結束｜`unload`／沒有 result＝分頁關掉時還在玩（摘要寫 unfinished）。

## 4. 分析：`tools/telemetry/summarize.mjs`

`node tools/telemetry/summarize.mjs <檔或資料夾>`，同一局號在好幾個檔裡出現時留結束了的那一份。一局的數字由 `prototypes/telemetry.js` 的 `summarizeRun` 算（頁面即時摘要用同一個函式）：

| 數字 | 定義 |
|---|---|
| 每區用時、失敗次數 | `zones` 的 leave − enter（沒離開用本局結束時間）；失敗算在當下的區 |
| 盲區行動成功率 | 在 `state = blind` 時按下衝刺、暗殺、移動鍵或放箭算一次行動；之後 1.5 秒內沒有 `hunt`／`caught` 就算成功。第一次成功的 `gt` 另外列 |
| 按鍵時間差分布 | `off.bass`、`off.blind`（\|off\| ≤ 1 秒）、`off.beat` 各自的個數、平均、σ（母體標準差）、中位，合併時印直方圖文字版（預設每格 50 毫秒） |
| 安撫（舉盾）對拍成功率 | `calm_ok`＋`tele_ok` ÷（再加 `calm_bad`＋`tele_miss`）；`calm_done` 次數與第一次的時間 |
| 腳步合拍率 | `step_masked` ÷（`step_masked`＋`step_loud`） |
| 主動時間比例（N1） | 見下；多局合併用時間加權（總主動秒數 ÷ 總遊玩秒數） |
| 提示 | `hint` 事件次數，依 key 與階數（沒有 key 的是第一次出現的教學提示，記 tutorial） |
| 主觀 | 三題平均、自由填寫逐條列出；略過的另計 |

多局合併時**依原型＋裝置分組**（喇叭、耳機有線、耳機藍牙分開），不同原型不混。

**N1 主動時間**照總綱第 7 節：玩家有「至少一個會改變狀態的合法動作」的時間。頁面每幀判斷：

- 木馬之夜：盲區或空檔（`cycle.blind`）；或 p ≤ `HIGH_P` 且不在任何衛兵的 r(p) 內；或在門閂旁且 p ≤ `GATE_LOW_P` → 主動。其他（只能屏息或等）→ 被動。
- 大廳復仇：空檔（`cycle.gap`）或腳邊 `PICK_R` 內有箭可撿 → 主動。閃避、舉盾是反應，這一版不算（總綱預估規則 8 的 N1 偏低，這個數字正好用來驗）。
- 時間用規則的音訊時間差累計（幀率低時 loop 的 dt 會被壓在 0.1 秒，用它會少算）；超過 1 秒的一幀（分頁休眠）不算；暫停時音訊時鐘停住，不會算進去。

## 5. 共用模組 `prototypes/telemetry.js`

UMD（瀏覽器全域 `Telemetry`、Node `require`），寫法照 `prototypes/nav.js`：頁面用相對路徑 `../telemetry.js` 載入，沒載到時頁面照玩（裝置選擇與匯出按鈕隱藏）。純邏輯、不碰 DOM，唯一的例外是匯出時建立下載連結。

```
Telemetry.start({proto, version, device, env, clock})   clock() → {t, ci, p, z}
Telemetry.event(name, data)        規則事件 name = 'out'
Telemetry.input(key, actAt, {down, state, off})
Telemetry.tick(dt, {active, state, frameDt})
Telemetry.endRun({outcome})
Telemetry.survey({drop, difficulty, fun, note, skipped})
Telemetry.exportJSON() / exportCSV()   → {filename, text}；瀏覽器裡同時下載
Telemetry.summary()                本局重點數字
Telemetry.create({storage, wall})  另建一個記錄器（測試用假的 storage 與時鐘）
Telemetry.summarizeRun(run) / toCSV(runs) / stats(arr) / histogram(arr, lo, hi, step)
```

## 6. 接線

- 木馬之夜 `prototypes/troy-prologue/index.html`：`drain()` 取走事件處記規則事件；每幀在 `drain()` 之後比對區域、失敗、過關並 `tick()`；keydown／keyup／右鍵記輸入；`startFromTop` 開局、`retryZone` 記 retry、`backToIntro` 記 quit；開場加裝置選擇與告知、失敗與勝利畫面加快問與匯出、暫停畫面加匯出；實驗開關「顯示試玩數據摘要」或 `?telemetry=1` 顯示即時摘要（試驗場與錄影用）；`TroyDebug.telemetry`。
- 大廳復仇 `prototypes/vengeance/index.html`：`onEvent()` 記規則事件；`startGame` 開局（上一局沒結束記 restart）、`onWin`／`onFail` 結束並跳快問、`backToIntro` 記 quit；開場加裝置選擇、告知與匯出；`VengeanceDebug.telemetry`。
- 試驗場：木馬之夜用 `?startZone=1～4` 單獨開某一區時照樣記（網址參數記在 `env.query`）；`audio-test.html` 沒接（見第 8 節）。

## 7. 個別測試（試驗場與自動化檢查）

- 即時摘要面板（`?telemetry=1`）就是這個機制的試驗場：畫面上顯示局號、裝置、經過秒數、幀率、主動時間、盲區行動成功數與第一次的秒數、安撫對拍、兩種按鍵偏移的平均與 σ、腳步合拍、失敗與提示次數。
- `node --test tools/telemetry/*.test.js`：手算答案的假資料驗算全部數字、儲存上限與失敗退路、匯出格式、多局合併。
- 端到端（Playwright）：開木馬之夜 → 選裝置 → 開始 → 走、空白鍵、Shift、Q、E → 觸發失敗 → 填快問 → 匯出，檢查 JSON 有事件、輸入、環境、主觀四類，再用 `summarize.mjs` 讀。

## 8. 已知限制與下一步

- 錄音工具（`tools/playtest-recorder/`）只服務原型自己的資料夾，`../telemetry.js` 載不到（404，和 `../nav.js` 一樣），頁面照玩、只是不記；要錄影時一起看摘要，得把服務根目錄改成 `prototypes/`。
- N2（每循環選擇數）沒做：要規則層列舉每幀的合法動作集合，屬於規則檔的工作。
- `audio-test.html`（聲音試驗場）沒接，它不在這次可改的檔案裡。
- 盲區行動成敗用「1.5 秒內沒被追殺」近似，不是規則層的判定；暗殺失手、門閂太吵這類不算進盲區行動。
- 版本號目前都是 `dev`，要打包工具（`tools/build-itch.mjs`）寫入 `<meta name="odyssey-build">` 才會有提交編號。
- 匯出一次下載兩個檔，有些瀏覽器第一次會問「允許下載多個檔案」。
