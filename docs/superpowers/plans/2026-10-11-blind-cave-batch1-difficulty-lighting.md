# 第 1 批：難度、主動點亮、海風、提示全列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（使用者已選：原生＋最後 Opus 審查）. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拿掉教學關、加三段難度與聽覺邊、只讓主動的聲音照亮並補上巨人與腳步音效、加強海風與縫光、物體提示全列、跟隨的同伴全帶出。

**Architecture:** 規則放 `Assets/Odyssey/Core`（純 C#，`dotnet test tools/CoreTests` 測），Unity 端放 `Assets/Odyssey/Echo`。難度在簡報選定後套到 `CyclopsBrain` 與 `EchoField`；照亮與否由 `SoundRules.Lights` 決定；新增 `SoundPlayer` 播 3D 程式音效。

**Tech Stack:** Unity 6000.3.14f1、URP 17.3、C# 9、NUnit（CoreTests，net10.0）、新 Input System（只用 `Keyboard.current`／`Mouse.current`）。

**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 18、19 節（第 21 節的弓箭在第 3 批，這批不動丟石子）。

## Global Constraints

- 玩家可見文字一律繁體中文；不顯示檔案路徑；所有內容出自《奧德賽》。
- 除錯面板不加背景、預設開啟；過場要快。
- 新 `.cs` 補 `.meta`（`fileFormatVersion: 2`＋新 GUID 的 MonoImporter）。
- 只 `git add` 明確路徑；不碰使用者未提交的 `Assets/Editor*`、`Assets/Settings`、`ProjectSettings/*`、`Assets/Scenes/*`、`Assets/UI/LoopFail/*`、`docs/design/`、handoff 檔。
- Bash 不呼叫 `python3`。

## Review Focus

1. 按 R 重新開始時難度選單要記住上次選的、且套用到新的一局（巨人速度與聽覺、聽覺邊）——Task 5 驗。
2. 熟悉難度下巨人聽不到但玩家看得到的聲音，畫面上的邊要在回聲內側，不能畫在錯的半徑——Task 6 驗。
3. 不照亮的聲音（巨人腳步）一定要有音效，否則玩家完全不知道巨人在哪——Task 7 驗。
4. 物體提示全列後，巨石前最多 3 行仍不能被畫面上緣切掉（沿用 `DrawAt` 夾住）——Task 9 驗。
5. 第一夜沒有教學後，情境提示要在夜晚一開始就能觸發（`SituationHints.Paused` 不再看教學）——Task 4 驗。

---

### Task 1：`Difficulty` 與巨人的難度倍率

**Files:**
- Create: `Assets/Odyssey/Core/Difficulty.cs`（＋.meta）
- Modify: `Assets/Odyssey/Core/CyclopsBrain.cs`（`Hear` 的半徑倍率、`Move` 的速度）
- Test: `Assets/Odyssey/Tests/Editor/DifficultyTests.cs`（＋.meta）

**Interfaces:**
- Produces: `enum DifficultyLevel { Familiar, Normal, Hard }`；`static class Difficulty { float SpeedMultiplier(DifficultyLevel); float HearingMultiplier(DifficultyLevel); string Name(DifficultyLevel); string Blurb(DifficultyLevel); }`；`CyclopsBrain.Level { get; set; }`（預設 Normal）。

- [ ] 寫測試：`Multipliers_MatchSpec`（0.7／1／1.2；0.6／1／1.3）、`NamesAndBlurbs_NotEmpty`；`CyclopsBrainTests` 加 `Familiar_MovesSlower`（Investigate 1 秒移動 2.45 m）、`Hard_GuardRunsFaster`（6 m/s）、`Familiar_DoesNotHearBeyondReducedRadius`（Clap 0.5 → 10 m × 0.6 = 6 m：6.1 m 聽不到、5.9 m 聽得到）、`Hard_HearsFarther`（12.9 m 聽得到）、`StoneLearning_StacksWithDifficulty`（騙 3 次後熟悉的 Stone 半徑 ×0.3）。
- [ ] 跑 `dotnet test tools/CoreTests`，預期編譯失敗（缺型別）。
- [ ] 實作：名稱「熟悉／普通／困難」，說明照規格 18 B；`Hear` 的 multiplier ×`HearingMultiplier(Level)`；`Move` 的 speed ×`SpeedMultiplier(Level)`。
- [ ] 跑測試全過。

### Task 2：`SoundRules.Lights`

**Files:** Modify `Assets/Odyssey/Core/SoundRules.cs`；Test `Assets/Odyssey/Tests/Editor/SoundRulesTests.cs`
**Interfaces:** Produces `static bool SoundRules.Lights(SoundKind kind)`。

- [ ] 測試 `Lights_OnlyActiveSounds`：Clap、Stone、Boulder、Grind、Wedge、Clatter 為 true；Step、Run、Pant、Drag、Cheese、Wicker、Bleat、Whimper、Slip、Cyclops、RockImpact 為 false。
- [ ] 跑測試失敗 → 實作 → 全過。

### Task 3：CSV v3

**Files:** Modify `Assets/Odyssey/Core/PlaytestCsv.cs`；Test `Assets/Odyssey/Tests/Editor/PlaytestCsvTests.cs`
**Interfaces:** `FileName = "blind_cave_v3_playtest.csv"`；`Header` 結尾加 `,difficulty`；`Line(..., float seconds, DifficultyLevel difficulty)` 結尾加 `Familiar|Normal|Hard`。

- [ ] 更新既有測試的期望值＋新增 `Line_EndsWithDifficulty` → 失敗 → 實作 → 全過。

### Task 4：拿掉教學關

**Files:**
- Delete: `Assets/Odyssey/Core/TutorialSteps.cs`（＋.meta）；`TutorialHintTests.cs` 裡的 `TutorialStepsTests` 類別
- Modify: `BlindGameLoop.cs`（刪 `Tutorial` 屬性、`UpdateTutorial`、`StartNight` 的分支→ `Cyclops.Active = true`、天亮的 `Asleep` 判斷）、`WorldPrompts.cs`（刪教學分支）、`DebugPanel.cs`（刪教學列）、`SituationHints.cs`（`Paused => loop.State.Phase != LoopPhase.Night`）

- [ ] 刪改後跑測試（174 − 7 + Task 1～3 新增）與 `tools/compile-check.ps1` 0 錯誤。

### Task 5：簡報選難度並套用

**Files:** Modify `MissionHud.cs`、`BlindGameLoop.cs`、`DebugPanel.cs`
**Interfaces:**
- Consumes: Task 1 的 `Difficulty`。
- Produces: `BlindGameLoop.Difficulty`（`DifficultyLevel`，跨 R 保留，預設 Normal）；`BlindGameLoop.ApplyDifficulty()` 設 `Cyclops.Brain.Level` 與 `EchoField.HearingMultiplier`。

- [ ] `MissionHud.ShowBriefing(DifficultyLevel current, Action<DifficultyLevel> onStart)`：目標一句；三個選項一列（選中 `Text` 色、其他 `Dim`）；選中項說明一行；← → 與 1／2／3 改選；3 秒後才顯示「按空白鍵開始」。
- [ ] `BeginIntro` 第一夜傳入 `Difficulty`，`onStart` 記下並 `ApplyDifficulty()` 後 `StartNight`。
- [ ] F1 巨人列加「・熟悉」等；`Log` 傳 `Difficulty`。
- [ ] 編譯檢查 0 錯誤。

### Task 6：只照亮主動聲音＋聽覺邊

**Files:** Modify `EchoField.cs`、`Resources/Echo.shader`
**Interfaces:** `EchoField.HearingMultiplier { get; set; }`（預設 1）；全域 `_EchoHear[16]`（float，0＝不畫）。

- [ ] `OnSound`：`if (!SoundRules.Lights(e.Kind)) return;`；新 pulse 記下 `HearRadius = 半徑 × HearingMultiplier`，倍率為 1 時記 0。
- [ ] `LateUpdate` 以 `Shader.SetGlobalFloatArray` 傳 `_EchoHear`。
- [ ] shader：每個 pulse 若 `hear > 0` 且 `front >= hear`（波前已掃過），在 `abs(d - hear) < 0.15` 加 `color * 0.5 * (1 - age/fade)`。
- [ ] 編譯檢查 0 錯誤。

### Task 7：`SoundPlayer` 基本音效

**Files:** Create `Assets/Odyssey/Echo/SoundPlayer.cs`（＋.meta）；Modify `ProceduralAudio.cs`（新增 `GiantStep()`、`FootStep()`、`HeavyStep()`）、`BlindGameLoop.cs`（Awake 掛上）
**Interfaces:** `SoundPlayer.Init()` 訂閱 `SoundBus.Emitted`、`OnDestroy` 退訂。

- [ ] 依 kind 播：Cyclops→`GiantStep`（巨人每 0.5 s 一次的聲音即腳步）、Step→`FootStep`、Run→`HeavyStep`；其他 kind 不播（Pant／Whimper／Bleat 已在物件上播）。
- [ ] 用 8 個池化 `AudioSource`（`spatialBlend` 1、Logarithmic、min 1 m、max = 聲量 × 20 m + 4），音量 = 0.4 + 0.6 × 聲量。
- [ ] 確認巨人自己的腳步現在從哪裡 emit（`BlindCyclops.EmitOwnSounds`），只有腳步那種走 `SoundPlayer`，呼吸聲維持原樣。
- [ ] 編譯檢查 0 錯誤。

### Task 8：海風與月光邊

**Files:** Modify `BlindGameLoop.cs`（Awake 的 SeaWind）、`Boulder.cs`
- [ ] SeaWind：volume 0.8、`Logarithmic`、min 3、max 60、spread 0。
- [ ] 新 `GapWhistle`：放在 `Boulder.GapPoint`，同一段 `SeaWind()`、pitch 1.8、volume 0.4、Linear、min 1、max 8。
- [ ] `Boulder` 加左右與上緣三條寬 0.06 m 的月光邊（`OdysseyMaterials.Create(Color.black, MoonGlow)`，`MoonGlow = (0.10, 0.12, 0.18)`）；`SetDawn` 同步漸變到 `DawnGlow`。
- [ ] 編譯檢查 0 錯誤。

### Task 9：物體提示全列＋角落按鍵說明；同伴全帶出

**Files:** Modify `WorldPrompts.cs`、`BlindGameLoop.cs`
- [ ] `Add` 拿掉 `lines.Count == 0`；巨石的順序恢復為 Push、Wedge、PlantStake（全部可同時出現）；刪 `WedgeFirstOpening` 的分支。
- [ ] 準星下方不畫；`DrawStoneLegend` 改成 `DrawCornerLegend`：從石子圖示上方往上堆，字級 ×0.75，依序（符合條件且 `ShouldShow` 才畫）「WASD 走・Shift 跑」（夜晚開頭 20 秒內）、「Q 拍手：照亮四周（巨人也聽得到）」、「左鍵 丟石子：落地聲會把巨人引過去」（有石子且沒拿木樁）、「G 放下木樁」（拿著木樁且不在巨石前）、石子說明；畫出的種類 `MarkShown`。
- [ ] `Escape`：`RescuedLastEscape = Crew.Followers.Count`；刪 `RescueReach`。
- [ ] 編譯檢查 0 錯誤。

### Task 10：驗證、審查、提交

- [ ] `dotnet test tools/CoreTests` 全過；`powershell -ExecutionPolicy Bypass -File tools/compile-check.ps1` 0 錯誤。
- [ ] 派 Opus 子代理審查整批（對照規格 18、19 與本計畫 Review Focus），修 Critical／Important。
- [ ] 只 `git add` 本批檔案（含刪除的 `TutorialSteps.cs(.meta)`）、提交、推到 `blind-cave`。
- [ ] 規格第 17 節 A、B 標註「已由第 18、19 節取代」。
