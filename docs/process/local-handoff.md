# 交接給本地：試玩與測試指南

雲端負責「對不對」：規則、時間、拍點、回歸測試、自動錄音分析。本地負責「好不好」：真耳朵聽聲音、真實幀率與手感、難度與好玩程度、Unity、錄報告影片、上傳。

## 什麼時候交接給本地

1. 原型通過雲端檢查（自動測試＋錄音工具 5 項檢查），需要真耳朵判斷時。
2. 涉及 Unity（主線洞穴，`blind-cave` 分支）、錄報告影片、上傳 itch.io。
3. 雲端數字都過了，但使用者覺得哪裡不對。

## 本地對話開工步驟

1. `git fetch origin claude/gracious-bardeen-vwo4rr && git checkout claude/gracious-bardeen-vwo4rr && git pull`（本地有未提交修改先問使用者）。
2. 讀 `CLAUDE.md`、`docs/design/concepts-overview.md`、本文件、要測的原型的設計文件。
3. 用本地瀏覽器開原型。原型是 HTML 片段，用打包工具產出完整頁面：`bash tools/build-itch.sh`（連作），或用錄音工具的伺服器（`node tools/playtest-recorder/record.mjs` 會自動包外殼）。也可以直接開 claude.ai 的私人試玩網址。
4. **本地錄音（比雲端清楚）**：先安裝 Playwright 的瀏覽器（`npx playwright install chromium`），在 `tools/playtest-recorder/record.mjs` 加上有頭模式或真實顯示卡的選項後錄製；本地有顯示卡，幀率與畫質會接近真實遊玩。
5. **試玩數據**：開場選裝置（喇叭／有線耳機／藍牙）。用 claude.ai 試玩網址玩，一局結束會**自動**寫進頁面資料庫，雲端直接讀，不用匯出；用本機伺服器玩才需要在結果畫面按「匯出數據」，把 JSON 放進 `docs/process/playtest-data/`（新建）一起提交；雲端用 `node tools/telemetry/summarize.mjs docs/process/playtest-data/` 算 σ、成功率、主動時間比例。
6. 試玩回饋記在 `docs/process/playtest-notes.md`（新建）：日期、原型、裝置（耳機或喇叭）、卡在哪、太難或太簡單、聲音聽不聽得出盲區、好不好玩。
7. 修改後照 `CLAUDE.md`：用中文提交、更新 `docs/process/production-log.md`、推到同一分支，雲端對話會接著做。

## 目前可在本地試玩的原型

| 原型 | 位置 | 要特別聽或看的 |
|---|---|---|
| 木馬之夜（特洛伊序章） | `prototypes/troy-prologue/` | 聽不聽得出驟降（盲區）、警戒時能不能跟著慢低音按 Q、腳步合拍掩護、3D 聽出衛兵方向、假驟降（第 3 區起） |
| 比箭 Risset 版 | `prototypes/bow-risset/` | 抓驟降放箭，和原本呼吸判定版（`prototypes/bow-contest/`）比較 |
| 大廳復仇 | `prototypes/vengeance/` | 最高速躲攻擊、驟降空檔射箭、照低音讓忒勒馬科斯舉盾 |
| 網頁連作《回家的路》 | `prototypes/odyssey-series/` 等 | 已決定報告後重做，只當參考 |

## 試玩網址（claude.ai 私人頁面）

- 木馬之夜：https://claude.ai/artifact/DcxVU1LPbmcdPAfpvzEchb
- 比箭・Risset 版：https://claude.ai/artifact/9x7ZByRC7HyC1vFfvEyoxb
- 大廳復仇：https://claude.ai/artifact/EjRjJij1T1HJxKgcFBaWxr
- 原本的比箭（呼吸判定版）：https://claude.ai/artifact/XhXdsJ8H5GSxw1517Fhjbn

## 雲端與本地分工（原 `CLAUDE.md` 全文，2026-11-09 移到這裡）
兩邊只透過 git 分支交接。一句話：雲端負責「對不對」，本機負責「好不好」。

- **雲端工作階段**做不用開 Unity、不用真耳朵的事：
  - 寫規則和程式，跑規則測試、Linux 編譯檢查與模擬器。
  - 盯 CI（Unity 測試、網頁版建置、自動截圖試玩），紅了自己修好再推；看截圖和錄影抓畫面問題。
  - 網頁原型的自動錄音分析（`tools/playtest-recorder/`：拍點、盲區、爆音等）。
  - 寫規格、計畫與文件，開 PR、回 review，審視舊程式。
- **本機（Windows＋Unity＋Claude 桌面版）**做要開 Unity、要真耳朵或要帳號的事：
  - 在 Unity 按 Play 實測手感、音效、操作與緊張感；戴耳機試玩網頁原型，判斷好不好聽、難度、好不好玩。
  - 本機驗證技能 `verify-odyssey`（用虛擬鍵盤滑鼠操作 Unity 再截圖）。
  - 在編輯器裡改場景、材質、光影，Blender 美術，錄報告影片。
  - 處理授權檔、密鑰、itch.io 設定，以及合併 PR。
- **主動交接**：原型通過雲端檢查、需要真耳朵判斷，或涉及 Unity、錄影、上傳時，用「建議的任務」卡片交接給本機對話（卡片建不了時，請使用者自己開本機對話），步驟見 `docs/process/local-handoff.md`。
- **交接規則**：
  1. 同一時間一條分支只給一邊改：換手前先推，接手前先拉。
  2. 本機實測後，把 Console 錯誤或手感、聽感回饋寫進 `docs/process/playtest-notes.md` 或貼給雲端；雲端改好推上來，本機拉下來再玩。
  3. 在編輯器裡改的東西（場景、材質、預製物）要提交推上去，雲端才看得到。
  4. 合併 PR 由使用者按；雲端只負責把 CI 弄綠並提醒。
- **選用**：雲端可透過 Remote Control 接到本機的專案資料夾，在使用者電腦上下指令，使用者核准即可。前提是桌面版開著，而且不是每個帳號都有這項功能（目前 Windows 版的資料夾還連不上雲端）。
- **專案技能**：`verify-odyssey`（本機驗證主線）、`humanizer-zh`（打磨繁體中文、去 AI 腔，遊戲文字與報告可用）。

