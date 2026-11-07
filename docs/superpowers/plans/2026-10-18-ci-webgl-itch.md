# 計畫：雲端自動測試＋WebGL 試玩版（規格第 30 節）

1. 字型：`Assets/Odyssey/Resources/Fonts/NotoSansTC-Regular.otf`＋授權檔＋`.meta`（TrueTypeFontImporter、動態、含字型資料）；`OdysseyFonts` 先載入它（TMP 用 `Cjk`、OnGUI 用 `Gui`），失敗才退回系統字型；8 個 `OnGUI` 開頭呼叫 `OdysseyFonts.UseForGui()`。
2. 場景：`OdysseyPlaytestSceneBuilder` 抽出 `BuildScene()`，選單與建置腳本共用。
3. 建置腳本 `OdysseyCiBuild.BuildWebGL`（`Assets/Odyssey/Editor`）：產生場景 → Gzip＋解壓縮備援 → 輸出到 `-customBuildPath`；失敗丟例外讓 Unity 回傳錯誤碼。
4. 補 `tools/CoreTests/CoreTests.csproj` 進版控（之前沒提交，CI 要用）。
5. `.github/workflows/ci.yml`：`core-tests`（dotnet 10）＋`webgl`（檢查密鑰 → 快取 → unity-builder@v4 → 上傳成品 → butler 推 itch）。
6. `docs/ci-setup.md`：使用者設定密鑰與 itch.io 的步驟。
7. 驗證：`dotnet test tools/CoreTests`、`compile-check.ps1`、workflow YAML 語法檢查；之後推分支開 PR 到 `main` 看 `core-tests` 是否綠燈。
