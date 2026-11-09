# 角色筆記：錄音與工具

負責：`tools/playtest-recorder/`、`tools/telemetry/`、`tools/build-itch.*`、`.github/workflows/`。
別人的檔（`prototypes/*` 的規則、聲音、畫面、`telemetry.js`）要改時回訊主對話，不自己改。

## 1. 檔案結構與入口

### 錄音工具 `tools/playtest-recorder/`
| 檔案 | 作用 |
|---|---|
| `record.mjs` | 入口。開本機 http 伺服器（只服務設定檔的 `dir`）→ 無頭 Chromium 開頁 → 錄 PCM＋畫面＋每幀狀態 → ffmpeg 合成 mp4 → 呼叫 `analyze.mjs` |
| `analyze.mjs` | 讀 `audio.wav`＋`timeline.json`，出頻譜圖、包絡、`analysis.json`、`report.md`。門檻表 `TH` 在第 37～47 行，設定檔 `analysis.thresholds` 可覆寫 |
| `lib/inject.js` | 頁面載入前改寫 `AudioNode.prototype.connect`：接到 `destination` 的節點改接分接點，AudioWorklet 逐塊回傳 PCM；同時記 `start(when)` 預定起音 |
| `profiles/*.mjs` | 每個原型一份：`troy-prologue`、`bow-risset`、`vengeance`。匯出 `dir`、`page`、`prepare`、`probe`（每幀 `{t, blind, alert, hunted, events}`）、可選 `bot`、`intervals`、`expectedBeats`、`analysis` |
| `out/` | 輸出，**不進 git**（`.gitignore` 第 118 行） |

常用：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 [--out tools/playtest-recorder/out/<名>]`
只重跑分析：`node tools/playtest-recorder/analyze.mjs <輸出資料夾>`
其他選項：`--cycle <秒>` 放慢循環、`--no-bot`、`--scenario <劇本.json>`、`--render-scale 0.5`、`--no-video`、`--no-analyze`、`--dir/--page`（無設定檔，只做頻譜、包絡、爆音、無聲）。

輸出資料夾內容：`playtest.mp4`、`audio.wav`（44.1 kHz 立體聲 16-bit）、`spectrogram.png`、`spectrogram-marked.png`（盲區藍、警戒橘、追殺紅、低音拍黃刻度）、`envelope.png/.svg`（50 ms RMS）、`report.md`、`timeline.json`、`analysis.json`、`meta.json`、`shots/`（每 10 秒）；喇叭模擬另出 `audio-speaker.wav`、`spectrogram-speaker.png`、`analysis-speaker.json`。

#### 8 項自動檢查（`analyze.mjs` 第 207～430 行）
| # | id | 量什麼 | 門檻（預設） |
|---|---|---|---|
| 1 | `blind` | 盲區時整體音量比前後低多少 dB。盲區內取 [+0.10, 結束−0.03] 秒，前取 −1.0～−0.15 秒、後取 +0.25～+1.0 秒平均。盲區內有玩家動作音（`blindConfoundCues`）的那次照列、不計 | 中位 ≥ 10 dB 且每次 ≥ 6 dB |
| 2 | `onset` | 偵測到的起音 vs 規則拍點（`expectedBeats`，沒有就用 `start(when)` 排程）的誤差，正號＝聲音晚 | 中位 \|誤差\| ≤ 15 ms 且顯著拍（w ≥ 0.5）±30 ms 命中 ≥ 80% |
| 3 | `alertLow` | 警戒時段三頻帶（低 20–250、中 250–2000、高 2–10k Hz）總功率，4096 點 FFT | 低頻帶最強；沒有警戒區段＝無資料 |
| 4 | `clip` | 削峰樣本數（整數與浮點都看） | ≤ 0；喇叭模擬不判定（高通會抬峰值） |
| 5 | `silence` | 低於 −60 dBFS 的連續段落、丟拍比例（±40 ms 找不到起音） | 無 ≥ 0.75 秒的無聲段且丟拍 ≤ 10%；音訊斷塊補 0 不算 |
| 6 | `preBlindMid` | 盲區前 lead 秒內 1～3 kHz 峰值比再往前 1 秒平均高多少（預告音） | 每次 ≥ 6 dB、中位 ≥ 6 且八成達標；假驟降前必須 < 6 dB |
| 7 | `bassMid` | 警戒段每個低音拍 [−0.02, +0.15] 秒 200～600 Hz 峰值比前 1 秒平均高多少 | 同上：中位 ≥ 6 dB 且八成達標 |
| 8 | `stepBand` | 不合拍腳步 vs 合拍腳步在 1～4 kHz 的「突增量」中位差 | 差 ≥ 12 dB |

6～8 是「喇叭可聽度」檢查（11/08 加），只有設定檔有 `analysis.speaker` 才跑；目前只有 `troy-prologue` 宣告（`preBlind {band [1000,3000], lead 0.4, minDb 6}`、`bassMid {[200,600], 6}`、`steps {[1000,4000], 12}`）。短時 FFT 1024 點、hop 256 ≈ 5.8 ms。

#### 喇叭模擬
主行程跑完後以 `--speaker` 子行程重跑全部檢查：先用 ffmpeg 兩級 `highpass=f=200:poles=2`（24 dB/oct，近似筆電喇叭聽不到的低頻），輸出 `analysis-speaker.json`；`report.md` 的檢查表多一欄「喇叭模擬」，另有一節「原始 vs 喇叭模擬」。高通頻率用環境變數 `SPEAKER_HP` 改。`alertLow` 在高通後本來就會不通過，看其他項。

### 遙測工具 `tools/telemetry/`
- `summarize.mjs`：`node tools/telemetry/summarize.mjs <檔或資料夾> [--bins 25] [--json]`。一局的數字由 `prototypes/telemetry.js` 的 `summarizeRun` 算（`require('../../prototypes/telemetry.js')`），本檔只做讀檔、去重（同局號留結束的那份）、合併、排版。
- 輸出**每局**：每區用時與失敗（含失敗代碼）、盲區行動 成功/嘗試（成功率、第一次成功秒數）、安撫對拍成功率與完成次數、腳步合拍率、主動時間比例 N1（含各狀態秒數）、提示次數與階數、按鍵偏移（`bass`／`blind`／`beat` 各 n、平均、σ、中位，正＝晚按）、主觀三題（驟降、難度、好玩）與留言、幀率中位。
- **依原型＋裝置合併**（喇叭／有線／藍牙分開）：上述各項合併（N1 時間加權）、每區平均用時、失敗原因、提示總數、主觀平均，加按鍵偏移直方圖文字版（預設每格 50 ms）。參考門檻：耳機 σ ≤ 80 ms、喇叭 σ ≤ 120 ms（`docs/design/2026-11-08-expert-lens.md`）。
- `telemetry.test.js`：7 個測試，手算假資料。

### 打包 `tools/build-itch.sh`＋`build-itch.mjs`
- `bash tools/build-itch.sh` → 站台 `dist/odyssey-series/`（結構同 `prototypes/`，不含 `*.test.js`）＋ `dist/odyssey-series.zip`（`index.html` 在 zip 根）。`dist/` 不進 git。
- 原型清單 `PROTOS=(troy-prologue bow-risset vengeance bow-contest beggar-hall odyssey-series)`；清單外的新資料夾照帶並提醒。
- three.js r128 用 `npm pack three@0.128.0` 抓一次，快取 `dist/.cache/`。
- `build-itch.mjs`：HTML 片段包成完整文件、cdnjs three.js 換本地 `lib/three.min.js`、檢查相對 `.html/.js` 連結（只警告不擋）。`cave/` 資料夾（Unity WebGL）原樣保留。
- 沒有 `zip` 指令時改用 `python3 -I` 壓縮（本機就是這條路）。

### CI `.github/workflows/ci.yml`（一個檔，六個工作）
觸發：任何 push、對 main 的 PR、手動。同一 ref 新的會取消舊的。
| 工作 | 什麼時候跑 | 做什麼 |
|---|---|---|
| `changes` | 每次 | `dorny/paths-filter` 判斷 unity／web 有沒有改；推到 main、手動執行兩者都當成有改 |
| `web-tests` | web 有改：`prototypes/**`、`tools/telemetry/**`、`tools/playtest-recorder/**`、`tools/build-itch.*`、`.github/workflows/**` | Node 22 跑 `node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js`＋`build-itch.sh` 打包檢查，約 30 秒 |
| `core-tests` | unity 有改：`Assets/**`、`Packages/**`、`ProjectSettings/**`、`tools/CoreTests/**`、`tools/NightSim/**`、`tools/NightSimTests/**`、`tools/playtest/**`、`.github/workflows/**` | dotnet 10 跑 CoreTests、NightSimTests |
| `unity-tests` | unity 有改，且不是一般分支 push（PR、main、手動） | game-ci `unity-test-runner@v4.3.2` EditMode；沒授權密鑰就略過 |
| `webgl` | 同上，接在 unity-tests 後 | `unity-builder@v4.8.2` 建 WebGL、上傳成品 `BlindCave-WebGL`；有 `BUTLER_API_KEY`＋`ITCH_GAME` 才推 itch.io |
| `playtest` | 同上，webgl 後（itch 上傳失敗照跑） | Playwright 1.49.1 跑 `tools/playtest/playtest.js` 截圖錄影，成品 `Playtest-Screens` |

派工說的「四個工作流」大概指 web-tests／core-tests＋unity-tests／webgl／playtest 四類；實際只有 `ci.yml` 一個工作流檔。只改 `docs/` 時只跑 `changes`。

## 2. 介面約定
- **錄音設定檔 ↔ 原型**：`probe()`／`bot()` 會轉成字串送進頁面，只能用頁面全域：木馬之夜 `window.TroyDebug`、`window.RissetRules`、`window.RissetAudio`。規則或畫面角色改了這些全域名稱或欄位（`game.cycle.p`、`game.panic.active`…），設定檔要跟著改 → 請他們先通知。
- **cue 名稱**：盲區干擾音清單 `blindConfoundCues`、腳步 `^step_?loud$`／`^step_?masked$` 對的是聲音層發的 cue 名。聲音角色改 cue 名要通知。
- **期望拍**：`profiles/troy-prologue.mjs` 的 `expectedBeats` 自己抄了一份拍點公式（常數來自聲音層），規則改拍點公式要同步（稽核 P1、P2）。
- **遙測**：`summarize.mjs` 依賴 `prototypes/telemetry.js` 匯出 `summarizeRun`、`stats`、`histogram`（畫面角色的檔）。事件名 `calm_ok`、`calm_bad`、`calm_done`、`tele_ok`、`tele_miss`、`step_masked`、`step_loud`、`hint`、`hunt`、`caught`；裝置代碼 `speaker`／`wired`／`bt`／`unknown`。新原型要在 `PROTO_NAMES`、`ZONE_NAMES` 加名稱。
- **打包**：新原型資料夾要加進 `build-itch.sh` 的 `PROTOS` 和總首頁 `prototypes/index.html`（畫面角色）。

## 3. 陷阱
- 2026-11-09 本機沒有 `playwright` npm 套件（repo 與全域都沒有），只有瀏覽器快取 `%LOCALAPPDATA%\ms-playwright\chromium-1248/1254`。`record.mjs` 第 39～41 行找 `playwright` → `/opt/node-tools/...`（雲端路徑）→ `NODE_PATH`，本機跑會報「找不到 playwright」。裝的時候版本要對上快取的 Chromium 版號，否則會再下載瀏覽器。
- 2026-11-09 `record.mjs` 第 40 行用 `:` 切 `NODE_PATH`，Windows 是 `;`，本機設 `NODE_PATH` 不會生效（聲音角色本機跑也碰到）；修法改用 `path.delimiter`，或把套件裝在 repo 或 `tools/playtest-recorder/` 下。
- 2026-11-09 `analyze.mjs` 的 ffmpeg 預設找 `/usr/bin/ffmpeg`，找不到才用 PATH 的 `ffmpeg`；本機 PATH 有 8.1.1，可用 `FFMPEG` 環境變數指定。
- 2026-11-09 錄音伺服器只服務原型自己的資料夾，`../telemetry.js`、`../nav.js` 會 404：錄影時頁面不記遙測（遙測設計第 8 節）。
- 2026-11-08 「警戒低音拍 200～600 Hz」門檻 6 dB 偶爾差一點（樣本只有 3～4 拍），不通過時先看拍數再判斷。
- 2026-11-07 無頭環境無 GPU，木馬之夜約 15 fps；音訊斷塊（每次 3～60 ms）補 0 並排除，報告會列。程式玩家的鍵盤事件 `isTrusted = false`。
- 2026-11-07 程式玩家自己的動作也會發聲，盲區檢查要看「每次盲區」表裡盲區內還在響的 cue。
- 2026-11-09 遙測版本號一律 `dev`：`build-itch.mjs` 還沒寫 `<meta name="odyssey-build">`。
- 2026-11-09 改 `.github/workflows/**` 會同時觸發 web 與 unity 兩組（PR 上就會跑 Unity 約 25 分鐘），非必要不要和其他改動混在一起推。
- 2026-11-09 本角色在 worktree `C:\Users\恩\test1\.claude\worktrees\openrouter-api-key-setup-383957`（分支 `claude/gracious-bardeen-vwo4rr`）工作；不要寫 `C:\Users\恩\test1` 主資料夾，hook 會擋。

## 4. 驗證方式
| 改了什麼 | 跑什麼 | 看什麼 |
|---|---|---|
| `tools/telemetry/` | `node --test tools/telemetry/*.test.js` | 7 pass、0 fail |
| 全部網頁測試（同 CI） | `node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js` | 0 fail |
| 打包 | `bash tools/build-itch.sh` | 結尾「找不到的相對連結：0 個」、沒有「仍引用 cdnjs」警告、zip 大小 |
| 錄音分析 | `record.mjs --profile troy-prologue --duration 90` 後讀 `report.md` | 8 項通過／不通過＋喇叭模擬欄；11/07 基準：盲區中位 36.5 dB、Risset 起音中位 2.3 ms 命中 96%、削峰 0、丟拍 2.7% |
| 只改分析 | `analyze.mjs <舊輸出資料夾>` 重跑 | 和改前的 `analysis.json` 比數字 |
| CI 設定 | 推上去看 Actions 的 `changes` 輸出 unity／web 是否如預期 | 只改 docs 時其餘工作都 skipped |

## 5. 上次做到哪、未完成
**2026-11-09 第一輪（筆記初稿）**
- 本機環境：Node v24.22.1；Playwright Chromium 瀏覽器有（chromium-1248、1254，含 headless shell），但 **playwright npm 套件待裝**；ffmpeg 8.1.1 有（WinGet Gyan）；bash、curl、python3 3.14.6 有，`zip` 沒有（打包走 python）。
- `node --test tools/telemetry/*.test.js`：7 pass、0 fail。
- 本輪沒改任何程式。
- 11/09 起回訊與派工認「test1 總控（Opus）」；原主對話改名「test1 設計席（Fable）」，只處理設計題。

**未完成／候選工作**
- 本機錄音要先裝 playwright 套件（版本對上已有的 Chromium），並把 `record.mjs` 第 40 行（`analyze.mjs` 第 479 行沒讀 `NODE_PATH`，只寫死雲端路徑，裝好套件就找得到）改用 `path.delimiter` → 主對話 11/09 說等試玩回饋後一起派。
- 錄音伺服器根目錄改成 `prototypes/`，讓錄影時遙測與 nav 載得到。
- `build-itch.mjs` 寫入 `<meta name="odyssey-build">`（提交編號），遙測版本號才不是 `dev`。
- 稽核 P1、P2：期望拍改成直接引用規則層，並補追殺第 5 層與假驟降尾音。
- `bow-risset`、`vengeance` 設定檔還沒宣告喇叭可聽度檢查（6～8 項）。
- 11/12 期中報告要的頻譜圖與錄影：等主對話指定原型與段落。

- 11/09 晚（總控）`record.mjs` 的 `NODE_PATH` 已改用 `path.delimiter`（提交 0193cdf）；剩本機裝 playwright 與 `fireSync` 檢查。
