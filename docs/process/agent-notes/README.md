# 角色筆記

每個長期角色一份，300 行內。新的工作階段或子代理接手時先讀這份，不用從頭讀規格；每輪結束由該角色更新「上次做到哪、陷阱、未完成」。主對話審。

| 角色 | 檔案 | 負責的檔案 |
|---|---|---|
| 規則 | `rules.md` | `prototypes/*/risset.js`、`rules.js`、`vengeance.js` 與各自 `*.test.js` |
| 聲音 | `audio.md` | `prototypes/*/audio.js` |
| 畫面 | `view.md` | `prototypes/*/index.html`、`prototypes/nav.js`、`prototypes/telemetry.js` |
| 錄音與工具 | `tools.md` | `tools/playtest-recorder/`、`tools/telemetry/`、`tools/build-itch.*`、`.github/workflows/` |

每份筆記的固定段落：
1. 檔案結構與入口（哪個函式是主迴圈、常數表在哪）。
2. 介面約定（和其他角色對接的欄位、事件名稱）。
3. 陷阱（踩過的坑，一行一個，附日期）。
4. 驗證方式（跑哪個指令、看哪個數字）。
5. 上次做到哪、未完成。

## 瀏覽器測試規矩（使用者 11/10）
- 角色在瀏覽器開遊戲頁一律加 `?mute=1&nolock=1`（不出聲、不鎖滑鼠；畫面角色 11/10 實作），只開內建瀏覽器或無頭瀏覽器，**不要用 browser-use 開使用者的 Chrome**。
- 測完立刻關分頁（最後一個也關）、停掉自己起的伺服器。
- 起因：11/10 測試時遊戲鎖住使用者滑鼠、聲音一直播（使用者判斷是 agy 用自己的瀏覽器工具開了遊戲頁）。
- **派 agy 的簡報一律寫「不准開瀏覽器、不准開網頁遊戲」**；agy 只讀檔改檔。
