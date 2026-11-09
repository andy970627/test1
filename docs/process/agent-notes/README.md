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
