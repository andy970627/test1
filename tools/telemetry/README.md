# 試玩數據工具（遙測）

遙測（telemetry）就是遊戲自己記下「玩家怎麼玩」：每一次按鍵、每一個規則事件、每一區用了多久、失敗幾次。記錄的部分在原型頁面裡（`prototypes/telemetry.js`），這個資料夾放讀檔、算數字的工具。設計見 `docs/design/2026-11-08-telemetry.md`。

## 試玩時（本機）

1. 開原型（目前接了《木馬之夜》`prototypes/troy-prologue/` 和《大廳復仇》`prototypes/vengeance/`）。
2. 開場選**播放裝置**：喇叭／耳機（有線）／耳機（藍牙）。下次會預設上次選的。
3. 照常玩。一局結束（過關、失敗、回開場）會跳三題快問，可以略過。
4. 按開場、失敗或勝利畫面的「匯出數據」，會下載兩個檔：
   - `telemetry_<原型>_<日期-時間>_<局號>.json`：完整紀錄（給 `summarize.mjs`）
   - 同名 `.csv`：一列一筆，給試算表看
5. 數據只存在這台電腦的瀏覽器（最近 20 局），不會上傳。清掉瀏覽器資料就沒了，所以每輪試玩完記得匯出。

錄影或試驗場想看即時數字：木馬之夜的實驗開關勾「顯示試玩數據摘要」，或網址加 `?telemetry=1`，畫面右下角會顯示主動時間、盲區行動成功數、按鍵偏移的平均與 σ（標準差，按鍵誤差散得多開）。

## 讀數據

```bash
node tools/telemetry/summarize.mjs 下載的檔.json
node tools/telemetry/summarize.mjs 資料夾/            # 資料夾裡全部 .json，同一局號自動去重
node tools/telemetry/summarize.mjs 資料夾/ --bins 25  # 直方圖每格 25 毫秒
node tools/telemetry/summarize.mjs 資料夾/ --json     # 機器可讀
```

輸出分兩段：

- **每局**：每區用時與失敗次數（含失敗代碼）、盲區行動成功率與第一次成功的秒數、安撫（舉盾）對拍成功率、腳步合拍率、主動時間比例（N1）、提示出現次數與階數、按鍵相對拍點的時間差、主觀分數。
- **依原型＋裝置合併**：上面各項合併，再加按鍵時間差的直方圖文字版。喇叭和耳機分開算，因為兩者的延遲與聽感差很多（`docs/design/2026-11-08-expert-lens.md`：耳機 σ ≤ 80 ms、喇叭 σ ≤ 120 ms）。

數字怎麼算（一局的部分）寫在 `prototypes/telemetry.js` 的 `summarizeRun`，頁面上的即時摘要也是同一個函式。

## 測試

```bash
node --test tools/telemetry/*.test.js
```

用一份手算得出答案的假資料驗算：平均、σ、盲區成功判定、N1、每區用時、localStorage 上限（20 局、存滿丟最舊、沒有 storage 照樣能玩）、匯出檔名與 CSV 列數、多局依裝置合併、讀資料夾去重。
