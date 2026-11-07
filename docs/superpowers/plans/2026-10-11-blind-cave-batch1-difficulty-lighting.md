# 第 1 批：難度、主動點亮、海風、提示全列 實作計畫

> **給代理執行者：** 必要的子技能：使用 superpowers:executing-plans（使用者已選：原生＋最後 Opus 審查）。步驟用核取方塊（`- [ ]`）語法追蹤進度。

**目標：** 拿掉教學關、加三段難度與聽覺邊、只讓主動的聲音照亮並補上巨人與腳步音效、加強海風與縫光、物體提示全列、跟隨的同伴全帶出。

**架構：** 規則放 `Assets/Odyssey/Core`（純 C#，`dotnet test tools/CoreTests` 測），Unity 端放 `Assets/Odyssey/Echo`。難度在簡報選定後套到 `CyclopsBrain` 與 `EchoField`；照亮與否由 `SoundRules.Lights` 決定；新增 `SoundPlayer` 播 3D 程式音效。

**技術組成：** Unity 6000.3.14f1、URP 17.3、C# 9、NUnit（CoreTests，net10.0）、新 Input System（只用 `Keyboard.current`／`Mouse.current`）。

**規格：** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 18、19 節（第 21 節的弓箭在第 3 批，這批不動丟石子）。

## 全域限制

- 玩家可見文字一律繁體中文；不顯示檔案路徑；所有內容出自《奧德賽》。
- 除錯面板不加背景、預設開啟；過場要快。
- 新 `.cs` 補 `.meta`（`fileFormatVersion: 2`＋新 GUID 的 MonoImporter）。
- 只 `git add` 明確路徑；不碰使用者未提交的 `Assets/Editor*`、`Assets/Settings`、`ProjectSettings/*`、`Assets/Scenes/*`、`Assets/UI/LoopFail/*`、`docs/design/`、交接（handoff）檔。
- Bash 不呼叫 `python3`。

## 審查重點

1. 按 R 重新開始時難度選單要記住上次選的、且套用到新的一局（巨人速度與聽覺、聽覺邊）——工作 5 驗。
2. 熟悉難度下巨人聽不到但玩家看得到的聲音，畫面上的邊要在回聲內側，不能畫在錯的半徑——工作 6 驗。
3. 不照亮的聲音（巨人腳步）一定要有音效，否則玩家完全不知道巨人在哪——工作 7 驗。
4. 物體提示全列後，巨石前最多 3 行仍不能被畫面上緣切掉（沿用 `DrawAt` 夾住）——工作 9 驗。
5. 第一夜沒有教學後，情境提示要在夜晚一開始就能觸發（`SituationHints.Paused` 不再看教學）——工作 4 驗。

---

### 工作 1：`Difficulty` 與巨人的難度倍率

**檔案：**
- 新增：`Assets/Odyssey/Core/Difficulty.cs`（＋.meta）
- 修改：`Assets/Odyssey/Core/CyclopsBrain.cs`（`Hear` 的半徑倍率、`Move` 的速度）
- 測試：`Assets/Odyssey/Tests/Editor/DifficultyTests.cs`（＋.meta）

**介面：**
- 產出：`enum DifficultyLevel { Familiar, Normal, Hard }`；`static class Difficulty { float SpeedMultiplier(DifficultyLevel); float HearingMultiplier(DifficultyLevel); string Name(DifficultyLevel); string Blurb(DifficultyLevel); }`；`CyclopsBrain.Level { get; set; }`（預設 Normal）。

- [ ] 寫測試：`Multipliers_MatchSpec`（0.7／1／1.2；0.6／1／1.3）、`NamesAndBlurbs_NotEmpty`；`CyclopsBrainTests` 加 `Familiar_MovesSlower`（Investigate 1 秒移動 2.45 m）、`Hard_GuardRunsFaster`（6 m/s）、`Familiar_DoesNotHearBeyondReducedRadius`（Clap 0.5 → 10 m × 0.6 = 6 m：6.1 m 聽不到、5.9 m 聽得到）、`Hard_HearsFarther`（12.9 m 聽得到）、`StoneLearning_StacksWithDifficulty`（騙 3 次後熟悉的 Stone 半徑 ×0.3）。
- [ ] 跑 `dotnet test tools/CoreTests`，預期編譯失敗（缺型別）。
- [ ] 實作：名稱「熟悉／普通／困難」，說明照規格 18 B；`Hear` 的倍率 ×`HearingMultiplier(Level)`；`Move` 的速度 ×`SpeedMultiplier(Level)`。
- [ ] 跑測試全過。

### 工作 2：`SoundRules.Lights`

**檔案：** 修改 `Assets/Odyssey/Core/SoundRules.cs`；測試 `Assets/Odyssey/Tests/Editor/SoundRulesTests.cs`
**介面：** 產出 `static bool SoundRules.Lights(SoundKind kind)`。

- [ ] 測試 `Lights_OnlyActiveSounds`：Clap、Stone、Boulder、Grind、Wedge、Clatter 為 true；Step、Run、Pant、Drag、Cheese、Wicker、Bleat、Whimper、Slip、Cyclops、RockImpact 為 false。
- [ ] 跑測試失敗 → 實作 → 全過。

### 工作 3：CSV v3

**檔案：** 修改 `Assets/Odyssey/Core/PlaytestCsv.cs`；測試 `Assets/Odyssey/Tests/Editor/PlaytestCsvTests.cs`
**介面：** `FileName = "blind_cave_v3_playtest.csv"`；`Header` 結尾加 `,difficulty`；`Line(..., float seconds, DifficultyLevel difficulty)` 結尾加 `Familiar|Normal|Hard`。

- [ ] 更新既有測試的期望值＋新增 `Line_EndsWithDifficulty` → 失敗 → 實作 → 全過。

### 工作 4：拿掉教學關

**檔案：**
- 刪除：`Assets/Odyssey/Core/TutorialSteps.cs`（＋.meta）；`TutorialHintTests.cs` 裡的 `TutorialStepsTests` 類別
- 修改：`BlindGameLoop.cs`（刪 `Tutorial` 屬性、`UpdateTutorial`、`StartNight` 的分支→ `Cyclops.Active = true`、天亮的 `Asleep` 判斷）、`WorldPrompts.cs`（刪教學分支）、`DebugPanel.cs`（刪教學列）、`SituationHints.cs`（`Paused => loop.State.Phase != LoopPhase.Night`）

- [ ] 刪改後跑測試（174 − 7 + 工作 1～3 新增）與 `tools/compile-check.ps1` 0 錯誤。

### 工作 5：簡報選難度並套用

**檔案：** 修改 `MissionHud.cs`、`BlindGameLoop.cs`、`DebugPanel.cs`
**介面：**
- 使用：工作 1 的 `Difficulty`。
- 產出：`BlindGameLoop.Difficulty`（`DifficultyLevel`，跨 R 保留，預設 Normal）；`BlindGameLoop.ApplyDifficulty()` 設 `Cyclops.Brain.Level` 與 `EchoField.HearingMultiplier`。

- [ ] `MissionHud.ShowBriefing(DifficultyLevel current, Action<DifficultyLevel> onStart)`：目標一句；三個選項一列（選中 `Text` 色、其他 `Dim`）；選中項說明一行；← → 與 1／2／3 改選；3 秒後才顯示「按空白鍵開始」。
- [ ] `BeginIntro` 第一夜傳入 `Difficulty`，`onStart` 記下並 `ApplyDifficulty()` 後 `StartNight`。
- [ ] F1 巨人列加「・熟悉」等；`Log` 傳 `Difficulty`。
- [ ] 編譯檢查 0 錯誤。

### 工作 6：只照亮主動聲音＋聽覺邊

**檔案：** 修改 `EchoField.cs`、`Resources/Echo.shader`
**介面：** `EchoField.HearingMultiplier { get; set; }`（預設 1）；全域 `_EchoHear[16]`（float，0＝不畫）。

- [ ] `OnSound`：`if (!SoundRules.Lights(e.Kind)) return;`；新的脈衝（pulse）記下 `HearRadius = 半徑 × HearingMultiplier`，倍率為 1 時記 0。
- [ ] `LateUpdate` 以 `Shader.SetGlobalFloatArray` 傳 `_EchoHear`。
- [ ] 著色器：每個脈衝 若 `hear > 0` 且 `front >= hear`（波前已掃過），在 `abs(d - hear) < 0.15` 加 `color * 0.5 * (1 - age/fade)`。
- [ ] 編譯檢查 0 錯誤。

### 工作 7：`SoundPlayer` 基本音效

**檔案：** 新增 `Assets/Odyssey/Echo/SoundPlayer.cs`（＋.meta）；修改 `ProceduralAudio.cs`（新增 `GiantStep()`、`FootStep()`、`HeavyStep()`）、`BlindGameLoop.cs`（在 Awake 掛上）
**介面：** `SoundPlayer.Init()` 訂閱 `SoundBus.Emitted`、`OnDestroy` 退訂。

- [ ] 依聲音種類（kind）播：Cyclops→`GiantStep`（巨人每 0.5 s 一次的聲音即腳步）、Step→`FootStep`、Run→`HeavyStep`；其他種類不播（Pant／Whimper／Bleat 已在物件上播）。
- [ ] 用 8 個池化 `AudioSource`（`spatialBlend` 1、Logarithmic、最小距離 1 m、最大距離 = 聲量 × 20 m + 4），音量 = 0.4 + 0.6 × 聲量。
- [ ] 確認巨人自己的腳步現在從哪裡發出（emit）（`BlindCyclops.EmitOwnSounds`），只有腳步那種走 `SoundPlayer`，呼吸聲維持原樣。
- [ ] 編譯檢查 0 錯誤。

### 工作 8：海風與月光邊

**檔案：** 修改 `BlindGameLoop.cs`（Awake 裡的 SeaWind 海風）、`Boulder.cs`
- [ ] SeaWind：音量 0.8、`Logarithmic`、最小距離 3、最大距離 60、spread 0。
- [ ] 新 `GapWhistle`：放在 `Boulder.GapPoint`，同一段 `SeaWind()`、音高 1.8、音量 0.4、Linear、最小距離 1、最大距離 8。
- [ ] `Boulder` 加左右與上緣三條寬 0.06 m 的月光邊（`OdysseyMaterials.Create(Color.black, MoonGlow)`，`MoonGlow = (0.10, 0.12, 0.18)`）；`SetDawn` 同步漸變到 `DawnGlow`。
- [ ] 編譯檢查 0 錯誤。

### 工作 9：物體提示全列＋角落按鍵說明；同伴全帶出

**檔案：** 修改 `WorldPrompts.cs`、`BlindGameLoop.cs`
- [ ] `Add` 拿掉 `lines.Count == 0`；巨石的順序恢復為 Push、Wedge、PlantStake（全部可同時出現）；刪 `WedgeFirstOpening` 的分支。
- [ ] 準星下方不畫；`DrawStoneLegend` 改成 `DrawCornerLegend`：從石子圖示上方往上堆，字級 ×0.75，依序（符合條件且 `ShouldShow` 才畫）「WASD 走・Shift 跑」（夜晚開頭 20 秒內）、「Q 拍手：照亮四周（巨人也聽得到）」、「左鍵 丟石子：落地聲會把巨人引過去」（有石子且沒拿木樁）、「G 放下木樁」（拿著木樁且不在巨石前）、石子說明；畫出的種類 `MarkShown`。
- [ ] `Escape`：`RescuedLastEscape = Crew.Followers.Count`；刪 `RescueReach`。
- [ ] 編譯檢查 0 錯誤。

### 工作 10：驗證、審查、提交

- [ ] `dotnet test tools/CoreTests` 全過；`powershell -ExecutionPolicy Bypass -File tools/compile-check.ps1` 0 錯誤。
- [ ] 派 Opus 子代理審查整批（對照規格 18、19 與本計畫的審查重點），修掉嚴重（Critical）與重要（Important）等級的問題。
- [ ] 只 `git add` 本批檔案（含刪除的 `TutorialSteps.cs(.meta)`）、提交、推到 `blind-cave`。
- [ ] 規格第 17 節 A、B 標註「已由第 18、19 節取代」。
