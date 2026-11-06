# 雲端自動測試與網頁試玩版：設定步驟

流程寫在 `.github/workflows/ci.yml`（規格第 30 節）。

| 什麼時候 | 跑什麼 | 需要設定 |
|---|---|---|
| 每次 push、對 `main` 開的 PR | 規則測試（`dotnet test tools/CoreTests`，約 1 分鐘） | 不用 |
| 對 `main` 開的 PR、推到 `main`、手動執行 | Unity 測試：同一批測試在真的 Unity 6 裡跑（EditMode），並檢查整個專案能編譯，結果 `Unity-TestResults` 可下載 | 第 1 步 |
| 同上，且 Unity 測試通過 | 建網頁版（WebGL），成品 `BlindCave-WebGL` 可在該次執行頁面下載 | 第 1 步 |
| 同上，且網頁版建好 | 上傳到 itch.io 的 `web` 頻道 | 第 2 步 |

沒設定的步驟會自動略過，執行頁面會顯示提示，不會算失敗。

## 1. Unity 授權（必要，Unity 測試與建網頁版用）

1. 打開 Unity Hub → 右上頭像 → **Manage licenses**（或 Preferences → Licenses）→ **Add** → **Get a free personal license**，完成啟用。
2. 用記事本打開 `C:\ProgramData\Unity\Unity_lic.ulf`（`ProgramData` 是隱藏資料夾，可直接把路徑貼到檔案總管網址列），全選複製。
3. GitHub 打開 repo `andy970627/test1` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，新增三個：

| 名稱 | 內容 |
|---|---|
| `UNITY_LICENSE` | 第 2 步複製的整份 `.ulf` 內容 |
| `UNITY_EMAIL` | Unity 帳號的 email |
| `UNITY_PASSWORD` | Unity 帳號的密碼 |

密鑰只有 GitHub Actions 執行時讀得到，別人看不到內容。

## 2. itch.io（選用，不公開試玩連結）

1. 登入 itch.io → **Upload new project**：
   - **Kind of project** 選 **HTML**
   - **Visibility & access** 選 **Draft**（草稿；頁面會給一個「secret URL」，只有拿到連結的人能玩）
   - 先存檔。網址裡的專案名稱（例如 `https://andy970627.itch.io/blind-cave` 的 `blind-cave`）就是下面要填的遊戲名。
2. 到 https://itch.io/user/settings/api-keys → **Generate new API key**，複製。
3. GitHub 同一個頁面：
   - **Secrets** 分頁新增 `BUTLER_API_KEY` ＝ 第 2 步的金鑰
   - **Variables** 分頁新增 `ITCH_GAME` ＝ `itch帳號/遊戲名`，例如 `andy970627/blind-cave`（全部小寫）
4. 等第一次上傳成功後，回 itch.io 編輯專案：在 Uploads 裡把 `web` 那個檔案勾 **This file will be played in the browser**；Embed options 建議 960 × 600、勾 **Fullscreen button**；存檔。之後每次上傳都會自動換成最新版。

## 3. 怎麼看結果

- GitHub repo → **Actions** 分頁 → 點最新一次執行：綠勾＝通過；**Artifacts** 區可下載 `BlindCave-WebGL`（解壓後要用本機伺服器開，直接雙擊 `index.html` 不能玩，所以建議看 itch.io）。
- 想不推程式也重建：Actions → **CI** → **Run workflow**。
- 第一次跑 Unity 測試＋建網頁版合計約 30～60 分鐘（兩邊各要下載 Unity 並匯入整個專案），之後有快取會快很多。repo 是私人的，GitHub 每月有免費分鐘數上限。

## 4. 實測捷徑與自動畫面測試

- **手動（Unity 編輯器）**：選單 **Odyssey → Create Playtest Scene and Play** 一鍵建場景並開始；夜晚中按 F2～F10 直接跳到要測的情況（巨石前、偷襲、正面出手、禱告、天亮前 30 秒、天亮、巨石全開、岸邊、被摸到），F1 面板下方列出按鍵。
- **自動（CI）**：網頁版建好後，「自動畫面測試」用 Playwright 逐一打開 `index.html?playtest=名稱`，截圖、錄影、抓瀏覽器例外；結果在執行頁的摘要，截圖與影片在成品 **Playtest-Screens**。
  - 測試機用軟體繪圖，一秒只有一兩格，照真實秒數截圖會錯過過場。過場在關鍵瞬間呼叫 `PlaytestDriver.Mark("名稱")`：自動測試時寫一行 `[PLAYTEST] mark 名稱` 並停住 6 秒，腳本照這行截圖（例如 `ambush-mark-horse.png`）。平常玩不受影響。
- **本機跑自動測試**：下載 `BlindCave-WebGL` 解壓到 `build/`，在 `tools/playtest` 執行 `npm install --no-save playwright@1.49.1 && npx playwright install chromium`，再回專案根目錄跑 `node tools/playtest/playtest.js --build build --out playtest-out`。

## 5. 網頁版已知限制

- 第一次點畫面才會鎖定滑鼠；按 Esc 時瀏覽器會先放開滑鼠，再點一下畫面即可。
- 「離開」在網頁版沒有作用，直接關分頁。
- 實測 CSV 存在瀏覽器裡，拿不出來；要 CSV 請在 Unity 編輯器裡玩。
