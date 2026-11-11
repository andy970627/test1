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

#### 9 項自動檢查（`analyze.mjs` 第 215～520 行；11/10 加 fireSync、第 1 項依模式）
| # | id | 量什麼 | 門檻（預設） |
|---|---|---|---|
| 1 | `blind`（舊盲區版 `COVER_MODE = false`） | 盲區時整體音量比前後低多少 dB。盲區內取 [+0.10, 結束−0.03] 秒，前取 −1.0～−0.15 秒、後取 +0.25～+1.0 秒平均。盲區內有玩家動作音（`blindConfoundCues`）的那次照列、不計 | 中位 ≥ 10 dB 且每次 ≥ 6 dB |
| 1' | `blind`（殘響掩護版 `COVER_MODE = true`） | 一般掩護窗：①突出＝窗開頭 [−0.01, +0.15] 秒 300～1200 Hz 峰值 − 窗前 1.0～0.15 秒平均；②餘韻＝從峰值後到全頻 50 ms 包絡回到「窗前包絡中位數 + 3 dB」，自窗開始算（`TH.coverTailBase` 可改 'mean'；另一種背景列在 `tailAltSec`）；③窗內整體比前後。警戒窗（低音拍之間）另判輕版突出 | 設計席 7.5：突出中位 ≥ 12、每次 ≥ 6 dB；餘韻中位 0.5～0.8 秒；警戒輕版 ≥ 8 dB；防呆：整體中位 ≥ −3 dB（`TH.cover*`；11/11 改） |
| 1b | `fireSync` | 每幀 `game.fire` vs `FIRE_BASE + FIRE_P_GAIN × game.danger`（舊模式盲區幀＝`FIRE_BLIND`）；相鄰兩幀 fire 掉 > 0.05 而 danger 沒掉＝掉回；列 fire×danger、fire×p 相關係數 | 誤差 > 0.02 的幀 ≤ 1%，掉回 0 次 |
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
- **整夜驗證（11/10 夜加）**：
  - `troy-bots.js`：木馬之夜程式玩家。`makeBot`（含 `opts.sigma` 起步誤差）與 `activeNow`（含 `ruler`）**逐字照搬** `risset.test.js`（提交 11b1944），只多死因、各區時間、高度警覺次數、兩把尺 N1。玩家：`forward` 只按前進、`perfect` 完美踩拍（舊版＝完美時機）、`sigma12`、`sigma25`。50 局對過規則角色的數字（σ 0.12 新 92%／舊 62%；同一把尺 N1 舊 77%／新 96%）。
  - `overnight-sim.mjs`：`node tools/telemetry/overnight-sim.mjs [--n 500] [--modes cover,gap] [--bots forward,perfect,sigma] [--out x.json]`，每局約 0.1～0.3 秒，500 局 × 6 組約 10 分鐘。
  - `overnight-report.mjs`：`--sim <json> --cover <錄音資料夾> --gap <錄音資料夾> --out <md>`，照設計席第 7 節門檻判過／不過，每個數字附來源指令。
  - `overnight-run.sh`：一鍵跑程式玩家批次＋兩版錄音（各 90 秒；不停版會故意喘氣引起警戒）＋腳步測試段（45 秒 `--step-test`）＋報告（`N=`、`DUR=`、`TAG=`、`REPORT=` 可改），輸出 `tools/playtest-recorder/out/overnight-*-<TAG>`。
  - `overnight.test.js`：5 個測試（彙整手算、同 seed 同局、σ 抽樣、報告判定照 7.5／7.8、表格）。

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
- **程式玩家**：`troy-bots.js` 的 `makeBot`／`activeNow` 是 `risset.test.js` 的逐字複本（11b1944）。規則角色改了那邊，要重新照搬（用 node 從測試檔擷取 `function makeBot(` 到 `function playthrough(`、`function activeNow(` 到 `/** 只按住前進鍵`）。最好請規則角色把玩家搬進可匯出的模組，兩邊共用。
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
- 2026-11-10 `analyze.mjs` 是 CRLF 換行：用 node 字串取代改檔時要含 `\r\n`，否則比對不到；用 Edit 工具最穩。
- 2026-11-10 掩護版的殘響不在 300～1200 Hz：重合擊在這個頻帶 50 ms 內就掉回背景，餘韻在全頻（多半是 200 Hz 以下），所以殘響量全頻包絡；喇叭模擬（200 Hz 高通）下殘響中位只剩 0.10 秒、第 1 項不通過，這是聲音本身的特性，不是量法錯。
- 2026-11-10 背景要取窗前包絡的**中位數**：鼓聲不斷時窗前平均會被鼓點拉高。
- 2026-11-10 `ANALYZE_COVER=1|0` 只換第 1 項的量法；fireSync 一律看規則實際模式（`RULE_COVER`），否則舊模式盲區照設計壓暗的火光會被誤判成掉回。
- 2026-11-10 錄製中途偶爾「Page crashed」（60 秒留空檔版第一次），重錄就好。
- **2026-11-10 本機錄製三條鐵則**（使用者 11/09 晚～11/10 一直被鎖滑鼠、喇叭一直響的原因）：
  1. 無頭 Chromium 在 Windows 上，遊戲呼叫 `requestPointerLock` 會對**實體滑鼠**做 ClipCursor，把滑鼠鎖在左上角錄影視窗大小（640×360）。`record.mjs` 開頁一律加 `nolock=1`（第 167 行）。**不要加 `mute=1`**：它把總閘音量設 0，會錄到靜音。
  2. `LAUNCH_ARGS` 預設加 `--mute-audio`（第 134 行；要聽才加 `--audible`）。已驗證不影響錄音：分接點在 `destination` 前，11/10 兩份 60 秒錄音峰值 −0.9 dBFS、檢查照常。
  3. 錄完確認沒有殘留程式：`tasklist | grep -i headless` 應該沒有結果（`chrome-native-host.exe` 是 Chrome 擴充功能的，不是錄影留下的）。**錄完隔 5 秒再數**：11/10 夜錄完立刻數到 4 個，是瀏覽器正在關；幾秒後就 0。
- 2026-11-10 夜 派工說「遊戲頁一律 `?mute=1&nolock=1`」：錄音工具**不加 `mute=1`**（會錄到靜音），用瀏覽器 `--mute-audio` 取代。其他角色在內建瀏覽器開頁照派工規矩。
- 2026-11-10 夜 11/10 白天的兩份錄音（`cover-*-1110`）是聲音層讀不到規則掩護窗 `{from, to}` 的版本：掩護版重合擊沒排上（突出 +12.6 只是鼓點）、舊版靜音錯位 0.3 秒，都是那個 bug。聲音角色 11/10 晚修好後重合擊 +23.9 dB。拿數字比較時別用那兩份。
- 2026-11-10 夜 餘韻的「背景」用中位數或平均差很多（同一窗 1.0 秒 vs 0.4 秒）。**總控 11/10 夜決定主判定用中位數**（和量出 1.3 秒、訂門檻同一把尺），平均並列當參考。
- 2026-11-10 夜 σ 玩家改用規則角色的模型（t − e、起步時重抽、城門用真相位）。自己寫時踩過：停著每幀重抽誤差會系統性提早起步；城門用帶誤差的相位會卡死到逾時。
- 2026-11-11 錄音程式玩家在殘響掩護版引不起警戒：連續走的腳步自動踩拍、聽不見；離拍腳步只在 STEP_R 2.5 m（含高度）內聽得到，木馬腹中離地面衛兵太遠。改成在衛兵正上方屏息到喘氣（loud，LOUD_R 8 m），喘氣要落在 p ≤ HIGH_P 才是起疑（進警戒），p 高只會高度警覺，所以快到上限時相位偏高先放開重來。90 秒內會進警戒（50 秒試錄：787 幀、6 個警戒窗）。
- 2026-11-11 腳步檢查 1 步就判會被單一樣本左右（試錄 1 步 vs 2 步判了不過）：`TH.stepMinN` 3，兩種腳步各不到 3 步判無資料。要樣本就錄 `--step-test` 段（第 1 區離拍起步、走 0.12 秒就停；40 秒約 19 步離拍、25 步合拍）。
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

- 11/09 晚（總控）`record.mjs` 的 `NODE_PATH` 已改用 `path.delimiter`（提交 0193cdf）；剩本機裝 playwright 與 `fireSync` 檢查（兩件 11/10 都完成）。

- 11/10 本機試錄通過：playwright@1.65.0（chromium revision 1254，對上本機快取，不用再下載）裝在 `%LOCALAPPDATA%\test1-node-tools`（`npm install --prefix`，repo 內無 package.json）。跑法（PowerShell）：`$env:NODE_PATH="$env:LOCALAPPDATA\test1-node-tools\node_modules"; $env:FFMPEG=(Get-Command ffmpeg).Source; $env:FFPROBE=(Get-Command ffprobe).Source; node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 30`。結果：錄 30 秒、中位 43.5 fps、錯誤 0、自動檢查 8 項全過、mp4 h264＋aac 約 38.9 秒（含聲音對齊位移 8.2 秒）。1.64.0 對應 1248、1.63.0 對應 1243。

**2026-11-10 第二輪：殘響掩護版的錄音檢查（總控派工）**
- 改了：`analyze.mjs`（第 1 項依 `COVER_MODE` 換量法、新增 `fireSync`、報告加「每次掩護窗」表與模式說明、`ANALYZE_COVER` 對照開關）、`profiles/troy-prologue.mjs`（`--cover cover|gap`、prepare 記 `coverMode`、probe 記 `fire`／`dg`）、`record.mjs`（預設 `--mute-audio`、`--audible`）、`README.md`（新選項）。
- 驗證：兩模式各錄 60 秒，輸出 `tools/playtest-recorder/out/cover-cover-1110/`、`cover-gap-1110/`（不進 git）。
  - 掩護版：第 1 項通過（突出中位 +12.6、最小 +10.9 dB；殘響中位 0.18 秒；整體比前後 +1.9 dB；6 個一般窗）；fireSync 通過（2236 幀誤差 0、掉回 0、fire×danger 1.0、fire×p −0.09）；其餘全過、腳步樣本不夠。喇叭模擬下第 1 項不通過（殘響 0.10 秒）。
  - 舊盲區版：fireSync 通過（2383 幀、掉回 0）；第 1 項不通過——中位 30.1 dB，但 33.3、40.5、53.0 秒三個盲區聲音只靜約 0.3 秒或晚 0.3 秒才靜，都碰上循環長度 T 正在變，疑似聲音層的靜音和規則盲區對不上（已回報總控，不是本角色的檔）。
  - 對照：舊版錄音用掩護量法跑 → 不通過（突出 +5.2、殘響 0、整體 −24.9 dB），門檻分得開。
- 未完成：殘響門檻 0.12 秒只根據一次 60 秒錄音、6 個窗，下次多錄幾段再調；腳步檢查樣本太少時應判「無資料」而不是不通過（舊版 1 步就判了）。

**2026-11-10 夜 第三輪：整夜自動驗證（新總控派工第 4 項）——腳本寫好、小樣本試跑過，等總控通知正式跑**
- 新檔：`tools/telemetry/troy-bots.js`、`overnight-sim.mjs`、`overnight-report.mjs`、`overnight-run.sh`、`overnight.test.js`；改 `analyze.mjs`（掩護版門檻改設計席 7.5：突出 ≥ 12、餘韻 0.5～0.8 秒、警戒輕版 ≥ 8 dB；餘韻背景可選）。
- 試跑（各 20 局、錄音各 20 秒，目前工作樹的規則與聲音）：只按前進 0%（過）；σ 0.12 100%（不過，上限 85%）；完美踩拍 100%、N1 88.6%；重合擊 +23.9 dB（過）；餘韻中位 1.0 秒（不過，上限 0.8；平均背景 0.4 秒）；喇叭模擬餘韻 0.5 秒；腳步差 17.3 dB（過）；20 秒錄不到警戒窗。
- 全套測試 257 項全過（含新加 5 項）。
- 正式跑：總控傳訊後 `bash tools/telemetry/overnight-run.sh`（背景，約 15 分鐘），報告寫 `docs/process/overnight-validation-2026-11-11.md`。
- 11/10 夜（續）門檻改設計席 7.8：σ0.12 通關率 50～85% 作廢、只列不判；改判「σ0.12 通關時間中位 ≥ 完美 1.2 倍且每局高度警覺 ≥ 1 次」「σ0.25 比 σ0.12 通關率低 ≥ 10 個百分點或時間中位 ≥ 1.2 倍」。50 局初步：兩條都不過（1.01 倍、0.46 次；低 6 點、1.00 倍）。全套測試 260 項全過。
- 等聲音角色殘響修改提交後，總控傳訊再正式跑 `bash tools/telemetry/overnight-run.sh`。

**2026-11-11 凌晨 第四輪：整夜驗證正式跑完成**
- 報告 `docs/process/overnight-validation-2026-11-11.md`（版本 37db718；程式玩家 500 局 × 8 組 44 秒；錄音不停 90 秒、留空檔 90 秒、腳步測試段 45 秒；殘留瀏覽器 0）。
- 判定 13 項：過 6、不過 5、無資料 2。不過：完美踩拍 99.6%（2 局被看見）；σ0.12 時間 1.01 倍、高度警覺 0.55 次／局；警戒輕版 +7.3 dB（喇叭模擬 +7.6，只有 3 個警戒窗）；喇叭模擬餘韻 0.49 秒。過：只按前進 0%、σ0.25 比 σ0.12 低 12.8 點、餘韻 0.65 秒、重合擊 +22.5 dB、腳步測試段 25.8 dB（19／30 步）。
- 只列：完美玩家通關時間舊版 87.9 秒、新版 44.1 秒；同一把尺 N1 舊 77.6%／新 95.1%；σ0.12 通關率新 93.2%／舊 70.0%。
- 本輪改：錄音程式玩家不停版用喘氣引起警戒、`--step-test`、`TH.stepMinN`；報告加腳步步數、通關時間、餘韻兩位小數、本地日期、樣本限制說明。全套測試 286 項全過。
- 未完成：警戒窗樣本少（3 個），要的話錄一段讓程式玩家多次引起起疑；完美玩家失敗的 2 局要記 seed 才能給規則角色查（`runGame` 目前沒記）。

**2026-11-11 第五輪：照搬規則角色的程式玩家修正（0f21bf8），只重跑程式玩家**
- `troy-bots.js` 的 `makeBot`／`activeNow` 重新從 `risset.test.js` 擷取，除註解外逐字相同（腳本比對 identical: true）：路線點同一幀轉向不停、踩拍起步判定涵蓋 1/144～1/30 秒。
- 500 局：完美 100%（原 99.6%）、σ0.12 94.4%、σ0.25 83.8%、舊版完美通關時間 87.3 秒／新版 44.0 秒，和規則角色的表一致。報告判定 13 項：過 7、不過 4（σ0.12 代價、警戒輕版 ×2、喇叭餘韻）、無資料 2。錄音沒重錄（37db718）。
- `overnight-sim.mjs` 的 JSON 多記 `rev`（提交＋規則檔／玩家檔有沒有未提交修改）；報告版本欄分「程式玩家」「錄音」，`--rec-rev` 指定沿用錄音的版本。

**2026-11-11 第六輪：聲音 fe71b23 後整套重跑（程式玩家＋兩模式錄音＋腳步測試段，版本 c1d4aa3，木馬之夜檔案同 fe71b23）**
- 判定 13 項：過 10、不過 1、無資料 2。唯一不過：σ0.12 錯了要付代價（時間 1.01 倍、高度警覺 0.59 次／局）——設計席 7.8 說這是回設計席的訊號，不改規則。
- 錄音全過：重合擊 +23.0 dB（喇叭 +22.9）、餘韻 0.61 秒（喇叭 0.59）、警戒輕版 +11.5 dB（喇叭 +11.7，6 個警戒窗）、腳步測試段 24.9 dB（16／33 步）。兩段一般錄音腳步不足 3 步判無資料（正常，腳步看測試段）。
- 程式玩家：完美 100%、σ0.12 94.4%、σ0.25 83.8%（低 10.6 點，過）；通關時間舊 87.3／新 44.0 秒。殘留瀏覽器 0。

**2026-11-11 第七輪：巡邏中高頻 +2 dB 查證、木馬共鳴量測（總控派工）**
- 查證結論 **(a) 走法不同，不是程式改動**。c1d4aa3 與 HEAD（3823b7c）各錄兩段 90 秒（`out/bisect-*`，從 git archive 匯出到暫存資料夾再用 `--dir` 錄，不動工作樹）：
  - 第 2 區巡邏（34～42 秒）：四段＋整夜那段各頻段都在 ±0.3 dB（250 Hz～1 kHz 同版本也差 0.8 dB）。
  - 第 1 區巡邏只有 5～7 秒，同為 c1d4aa3 的兩段高頻就差 7～8 dB，大於跨版本差；取決於那幾秒有沒有喘氣、屏息、腳步。聲音角色那段 `horse2-off-cover` 第 1 區多一聲 gasp。
  - 工具：`tools/playtest-recorder/compare-bands.mjs <資料夾…>`，巡邏段（排除警戒、追殺、掩護窗前 0.3／後 0.8 秒）各頻段與分區，附各區音效次數。
- 木馬共鳴（C2）：`analyze.mjs` 加 `horseBoom` 檢查；設定檔加 `--horse-test`（配 `--page "index.html?lab=horse"`；前半段擺到木馬旁 (8.5, 17.5) 2.5 m、後半段擺到 (38.5, 26.5) 32 m），probe 多記 `hd`（聲音層 `horseInfo().dist`）。
  - ae48a4b、120 秒（`out/horse-c2-2`）：貼近那一擊後 0.5 秒 300～1200 Hz 比窗前 +26.8 dB、遠處 +9.1 dB，差 17.7 dB（≥ 3 過）；但貼近時共鳴峰值比重合擊峰值高 14.4 dB（喇叭模擬 13.4）→ 判不過（共鳴不能比重擊響）。聲音角色離線量的是差 3.7 dB，遊戲內貼近大很多，要聲音角色查 `HORSE_BOOM_GAIN`／`HORSE_BOOM_MIX`。
- 陷阱：
  - 2026-11-11 **錄音跑的時候不要改設定檔**：後面幾段會載入改到一半的檔（這輪 3 段因 `horse` 參數沒解構而失敗）。
  - 2026-11-11 `horseInfo` 在 `TroyDebug.audio.raw` 上（畫面層包了一層），不在 `TroyDebug.audio`。
  - 2026-11-11 HEAD 一直在動：要比版本就用 `git archive <提交> prototypes/troy-prologue | tar -x -C <暫存>`，以提交編號為準；`?lab=horse` 是 260a415／ed8a37f 才有。
  - 2026-11-11 試驗場是固定 10 秒一圈，60 秒每個位置只有 2 窗；共鳴量測至少錄 120 秒。

### 11/11 傍晚：全流程影片與試玩找問題（使用者直接要求）
- `profiles/troy-prologue.mjs` 加 `--play-through`：把 troy-bots.js 的 makeBot（完美踩拍）原樣送進頁面，輸出轉成按鍵；失敗重來時重建玩家。
- `out/fullrun-1111-b`：46.7 秒通關（第 1 區 5.4 秒、第 2 區 8.3 秒、第 3 區 9.6 秒、第 4 區 22.5 秒），警戒 0 次、出聲腳步 7 次沒有引起任何反應。
- `out/fullrun-1111`（舊錄音玩家）：第 1 區後在第 2 區不動 280 秒，什麼事都沒發生。
- 截圖：12 秒提示字幕壓到左下屏息標籤；32 秒城門處鏡頭穿進牆／門、全畫面雜訊顆粒；22 秒屏息貼在衛兵旁 alarm 0。
- 11/11 總控派：預告音檢查（preBlindMid）只判視覺輔助強度 > 0 的盲區。probe 加 `va`（`RissetRules.visualAidFor(zone, game.visualAidMode, T)`）；舊錄音沒有 va 時，殘響掩護版第 4 區當 0。強度 0 的另列不判。fullrun-1111-b 重判：4／4 過（中位 +21.2 dB），第 4 區 4 次另列（+3.9～+6.8）；fullrun-1111 仍 8 項過；CI 測試 314 項全過。
- 11/11 總控派：屏息聽（C1）錄音檢查。`--listen-test`（頁面 `index.html?lab=listen`）在聲音層建立前掛分接點：候選＝建立後馬上接往前第 2 個 GainNode 的 GainNode，候選裡第一個被衛兵 PannerNode 接上的＝guardListen，前一個建立的＝beatBus；量兩條線出口／入口功率（＝當下增益）和衛兵左右聲道。程式玩家站著不動，掩護窗前後依循環單雙號屏息／平常，其他時間每 2.5 秒切換。analyze 新增 `listenC1`。`out/listen-c1`（120 秒）：衛兵線 +6.0、鼓拍線 −6.0 dB；左右差成對比 48 次有 36 次變寬、中位只多 0.7 dB（衛兵多在正前後方）；最響一擊屏息 6 窗比平常 6 窗 −0.9 dB（容許 −1.5）→ 過。
- 陷阱：第一版用「PannerNode 第一個接到的 GainNode」或只看建立順序，都會誤認成 beatBus（它也符合順序規則）。
- 11/11 總控派：查看／追殺衛兵聲。`--lab-bot check|hunt`（頁面 `?lab=check`／`?lab=hunt`）：
  - 查看：每 14 秒按 N，單號那次躲進北邊影子，雙號那次站著被發現。
  - 追殺：往北跑進影子，衛兵 4 公尺內就屏息。
  - 分接點另量衛兵總線 guardOut、總輸出 master、慢低音候選（第 2 個候選＝bassGain，平常 0.22）。
  - 新工具 `guard-mix.mjs`；analyze 新增 `guardMix`，只列數字、不判。
- 結果（`out/lab-check` 120 秒、`out/lab-hunt` 90 秒；分接點在輸出限制之前，看「比鼓」的相對值）：
  - 喊人：比鼓 −6（追殺）／−12（查看）dB。疑問聲 −19、走到時吸氣 −22、沒找到時呼氣 −31（偏輕），搜索開始 −1 dB。
  - 腳步：追殺時 3 公尺 −8 dB、4～7 公尺 −19 dB；查看中走近 4～7 公尺 −31 dB。巡邏腳步沒量到，試驗場的衛兵站崗不走。
  - 慢低音增益：查看中衛兵 4 公尺 0.717、9 公尺 0.414，平常 0.23。和公式差不到 0.03，4→9 公尺差 4.8 dB。每秒峰值跟著低音拍起伏，不能拿來比距離。
  - 喘：兩段都沒觸發 pant 事件（追殺玩家每次都被抓），沒量到。
