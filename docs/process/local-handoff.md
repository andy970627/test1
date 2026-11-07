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
5. 試玩回饋記在 `docs/process/playtest-notes.md`（新建）：日期、原型、裝置（耳機或喇叭）、卡在哪、太難或太簡單、聲音聽不聽得出盲區、好不好玩。
6. 修改後照 `CLAUDE.md`：用中文提交、更新 `docs/process/production-log.md`、推到同一分支，雲端對話會接著做。

## 目前可在本地試玩的原型

| 原型 | 位置 | 要特別聽或看的 |
|---|---|---|
| 木馬之夜（特洛伊序章） | `prototypes/troy-prologue/` | 聽不聽得出驟降（盲區）、警戒時能不能跟著慢低音按 Q、腳步合拍掩護、3D 聽出衛兵方向、假驟降（第 3 區起） |
| 比箭 Risset 版 | `prototypes/bow-risset/` | 抓驟降放箭，和原本呼吸判定版（`prototypes/bow-contest/`）比較 |
| 大廳復仇 | `prototypes/vengeance/` | 最高速躲攻擊、驟降空檔射箭、照低音讓忒勒馬科斯舉盾 |
| 網頁連作《回家的路》 | `prototypes/odyssey-series/` 等 | 已決定報告後重做，只當參考 |
