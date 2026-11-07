# 奧德賽遊戲專案

一系列改編自《奧德賽》的遊戲。以大眾熟知的經典段落為主、自由改編；Nolan《奧德賽》（2026）電影只用來參考氛圍與配樂。沒看過電影、沒讀過原典也要玩得懂。

工作規則見 [`CLAUDE.md`](CLAUDE.md)（一律繁體中文、不確定先用選擇題問、代理分工、內容規則）。

## 從哪裡看起

| 想知道 | 看這裡 |
|---|---|
| 目前在做什麼、各概念的狀態、待決定 | [`docs/design/concepts-overview.md`](docs/design/concepts-overview.md) |
| 怎麼做出來的、AI 怎麼分工、檢討 | [`docs/process/`](docs/process/)（`production-log.md`、`ai-collaboration.md`、`retrospective.md`） |
| 在自己電腦上試玩、交接給本地 | [`docs/process/local-handoff.md`](docs/process/local-handoff.md) |
| 期中報告的準備 | [`docs/process/report-candidates.md`](docs/process/report-candidates.md) |

## 資料夾

| 位置 | 內容 |
|---|---|
| `Assets/`、`Packages/`、`ProjectSettings/` | Unity 專案（主線《雙盲洞穴》的完整版在 `blind-cave` 分支） |
| `prototypes/` | 網頁原型。每個原型的規則是純邏輯檔（之後可翻成 C# 搬 Unity），畫面是 `index.html`，另有 Node 測試 |
| `docs/design/` | 遊戲設計文件 |
| `docs/process/` | 製作紀錄（和遊戲內容無關） |
| `docs/superpowers/` | 主線《雙盲洞穴》早期的規格與實作計畫 |
| `tools/` | 工具：`playtest-recorder/`（聽得到聲音的自動試玩錄製與分析）、`build-itch.sh`（打包 itch.io）、`pixelate/`（照片轉像素風） |

## 原型

| 原型 | 內容 | 狀態 |
|---|---|---|
| `prototypes/troy-prologue/` | 《木馬之夜》：跟著無限加速的鼓聲潛行，鼓點一斷才能動 | 主力，可玩 |
| `prototypes/bow-risset/` | 比箭・Risset 版：驟降瞬間放箭最穩 | 可玩 |
| `prototypes/vengeance/` | 大廳復仇：節奏動作戰鬥 | 可玩 |
| `prototypes/bow-contest/` | 比箭（呼吸判定版），當作比較對照 | 可玩 |
| `prototypes/beggar-hall/`、`prototypes/odyssey-series/` | 門檻上的乞丐、網頁連作《回家的路》 | 已決定報告後重做 |

## 常用指令

```bash
node --test prototypes/troy-prologue/risset.test.js
```

```bash
node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90
```

```bash
bash tools/build-itch.sh
```

第一條跑規則測試（每個原型都有自己的 `*.test.js`）；第二條用程式玩家錄一輪有聲試玩並自動分析，輸出在 `tools/playtest-recorder/out/`；第三條打包網頁連作給 itch.io。

## 分支

| 分支 | 內容 |
|---|---|
| `main` | 穩定版 |
| `blind-cave` | 主線《雙盲洞穴》（Unity） |
| `claude/gracious-bardeen-vwo4rr` | 主線以外的發想、網頁原型、工具、製作紀錄（目前的開發分支） |
| `ci-webgl-itch` | 雲端自動測試與 WebGL 建置 |
| `odyssey-horror` | 《奧吉吉亞》的早期版本（待合併） |
