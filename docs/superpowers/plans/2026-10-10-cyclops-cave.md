# 獨眼巨人的洞穴（羊肚底下的潛行）實作計畫

> **給代理執行者：** 必要的子技能：使用 superpowers:subagent-driven-development（建議）或 superpowers:executing-plans，逐項工作執行本計畫。步驟用核取方塊（`- [ ]`）語法追蹤進度。

**目標：** 拆掉舊的異常判斷迴廊，做出可一鍵建場景、按 Play 即可實測的「洞底選羊 → 洞口抱緊」第一人稱雛形。

**架構：** 規則邏輯（握力／呼吸／重心、聲量、出洞順序、摸羊流程、同伴人數、狀態機、CSV）放在不依賴 UnityEngine 的 `Odyssey.Core` 組件，用 NUnit 測試（Unity Test Runner 與 dotnet test 皆可跑）。Unity 層（程式產生的岩洞、羊、巨人、鏡頭與回饋）只負責把輸入餵給 Core、把 Core 的結果畫出來／播出來，靠 dotnet 編譯檢查＋實機實測驗證。

**技術組成：** Unity 6000.3 LTS、URP Forward+、Input System（`activeInputHandler: 1`，只能用 `Keyboard.current`／`Mouse.current`）、TextMeshPro（ugui 2.0）、NUnit 3、.NET SDK 10（本機已裝）。

**規格：** `docs/superpowers/specs/2026-10-10-cyclops-cave-design.md`

## 全域限制

- 所有場景、道具、音效、文字都必須出自《奧德賽》；不得出現任何現代或真實世界場景。
- 第一人稱；無美術資源：幾何用程式產生，音效用 `ProceduralAudio` 合成。
- 玩家可見文字一律繁體中文；中文字型一律經 `OdysseyFonts.Cjk`。
- 起始同伴 12 名；每次被抓吃掉 1 名；歸零即結局「洞裡只剩下你。」
- 開場文字格式：「第 N 夜」（年份欄）＋「剩下 X 名同伴」。
- 成功文字：標題「你逃出去了。」副標「但你對著巨人喊出了自己的名字。」
- 羊每輪 8～10 隻（預設 9），大公羊固定一隻、固定最後出洞；全部出洞約 60～90 秒。
- 抱緊段通過約 15～25 秒。
- 所有難度數值暴露在 Inspector（`[SerializeField]` 或 `[Serializable]` 參數類別）。
- Unity UI 型別一律寫完整命名空間（`UnityEngine.UI.Image`）。
- CSV 路徑：`Application.persistentDataPath/cyclops_playtest.csv`。
- 每次交付前執行 `tools/compile-check.ps1`，兩個組件 0 錯誤。

## 審查重點

1. **抓到羊的同時那隻羊剛好出洞／被摸**：期望玩家無縫進入抱緊段，且該羊的摸羊流程從頭開始而不是中途。→ 工作 7 測試 `Cyclops` 在 `PatSheep` 前已有流程時排隊而非覆蓋（`CycloPatQueueTests`）。
2. **兩手同時放開又同時按回**：期望下滑只在「零隻有效手」的那幾幀累積，按回後會慢慢拉回，不會瞬間歸零。→ 工作 2 `ClingModelTests.Slide_RecoversSlowly_WhenBothHandsReturn`。
3. **握力耗盡但玩家仍按著**：期望該手視為放開（不再算有效手），但不會負值或卡住；放開後才恢復。→ 工作 2 `ClingModelTests.EmptyGrip_CountsAsReleased_AndNeverNegative`。
4. **憋氣中剛好遇到摸背結束**：期望只在 Back 步驟期間的聲量才判「喘出聲」，步驟切換的那一幀不誤判。→ 工作 2 `PatJudgeTests.NoiseOutsideBackStep_DoesNotFail`。
5. **同伴歸零後再按 Play／重開**：期望重新開始時同伴回到 12、夜數回到 1。→ 工作 3 `CaveLoopStateTests.Restart_AfterWiped_ResetsRoster`。

---

## 檔案結構

```
Assets/Odyssey/
  Core/                              ← Odyssey.Core.asmdef（noEngineReferences）
    Odyssey.Core.asmdef
    Side.cs                          Side 列舉、FailReason 列舉
    ClingParams.cs / ClingModel.cs   抱緊段三條身體狀態
    PatStep.cs / PatSequence.cs      摸羊流程資料與產生
    PatJudge.cs                      依目前步驟判定失敗
    NoiseModel.cs                    選羊段聲量
    FlockSchedule.cs                 出洞順序與時間
    CrewRoster.cs                    同伴人數、夜數
    CaveLoopState.cs                 整輪狀態機
    PlaytestCsv.cs                   CSV 格式
  Tests/Editor/                      ← Odyssey.Core.Tests.asmdef（Editor、引用 Odyssey.Core）
    *Tests.cs
  Cave/                              ← Assembly-CSharp（Unity 層）
    CaveLayout.cs / CaveBuilder.cs
    Sheep.cs / SheepFlock.cs
    Cyclops.cs
    ClingController.cs
    CaveGameLoop.cs
  FirstPersonPlayer.cs               修改：蹲姿、慢速、回報聲量
  ProceduralAudio.cs                 修改：刪里拉琴／海浪，加羊叫／心跳／羊毛摩擦／巨人呼吸
  OdysseyFonts.cs / OdysseyMaterials.cs   不變
  Editor/OdysseyPlaytestSceneBuilder.cs   修改：建洞穴場景
Assets/UI/LoopFail/                  不變（LoopFailScreen 已支援 ShowMessage / QuickFade）
tools/
  compile-check.ps1                  dotnet 編譯兩個組件
  CoreTests/CoreTests.csproj         dotnet test 跑 Core 測試
```

刪除：`Assets/Odyssey/CorridorSegment.cs`、`Anomaly.cs`、`Pursuer.cs`、`OdysseyPlaytest.cs`（含 .meta）、`Assets/Scenes/OdysseyPlaytest.unity`（含 .meta）。

---

### 工作 1：測試與編譯基礎設施＋拆除舊迴廊

**檔案：**
- 新增：`Assets/Odyssey/Core/Odyssey.Core.asmdef`、`Assets/Odyssey/Core/Side.cs`
- 新增：`Assets/Odyssey/Tests/Editor/Odyssey.Core.Tests.asmdef`、`Assets/Odyssey/Tests/Editor/SmokeTests.cs`
- 新增：`tools/compile-check.ps1`、`tools/CoreTests/CoreTests.csproj`
- 刪除：上列舊檔與舊場景
- 修改：`Assets/Odyssey/Editor/OdysseyPlaytestSceneBuilder.cs`（暫時只建空場景＋`LoopFailScreen`，不再引用 `OdysseyPlaytest`）

**介面：**
- 產出：`namespace Odyssey.Core { public enum Side { Left, Right } public enum FailReason { None, Touched, Fell, Gasped, FlockGone, Swept } }`
- 產出：`tools/compile-check.ps1`（無參數；輸出含「建置成功」或 `Build succeeded` 即通過）、`dotnet test tools/CoreTests`。

- [ ] **步驟 1：** 建 `Odyssey.Core.asmdef`：`"name": "Odyssey.Core"`、`"noEngineReferences": true`、`"autoReferenced": true`。建 `Odyssey.Core.Tests.asmdef`：`"references": ["UnityEngine.TestRunner", "UnityEditor.TestRunner", "Odyssey.Core"]`、`"includePlatforms": ["Editor"]`、`"overrideReferences": true`、`"precompiledReferences": ["nunit.framework.dll"]`、`"defineConstraints": ["UNITY_INCLUDE_TESTS"]`、`"autoReferenced": false`。
- [ ] **步驟 2：** 寫 `SmokeTests.FailReason_HasNoneAsDefault`：`Assert.AreEqual(FailReason.None, default(FailReason));`
- [ ] **步驟 3：** 建 `tools/CoreTests/CoreTests.csproj`：`net10.0`，`<Compile Include="../../Assets/Odyssey/Core/**/*.cs" />` 與 `../../Assets/Odyssey/Tests/Editor/**/*.cs`，套件 `NUnit 3.14.0`、`NUnit3TestAdapter 4.6.0`、`Microsoft.NET.Test.Sdk 17.11.1`。
- [ ] **步驟 4：** 跑 `dotnet test tools/CoreTests`，此時 `Side.cs` 尚未建 → 預期編譯失敗（`FailReason` 不存在）。
- [ ] **步驟 5：** 建 `Side.cs`（上列兩個列舉）。再跑 `dotnet test tools/CoreTests` → 預期 1 個測試通過。
- [ ] **步驟 6：** 建 `tools/compile-check.ps1`：由 scratchpad 的 `make_check.ps1` 改寫，輸出目錄改為 `$env:TEMP\odyssey-compilecheck`，來源資料夾改為整個 `Assets`（排除 `Assets/TextMesh Pro`、`Tests`），並對 `Assembly-CSharp` 額外加入 `Odyssey.Core` 的 `.cs`（模擬 asmdef 引用）。
- [ ] **步驟 7：** 刪除舊檔、修改場景建置器；跑 `powershell -File tools/compile-check.ps1` → 預期「建置成功」。
- [ ] **步驟 8：** 提交：`git add -A Assets/Odyssey tools Assets/Scenes` → `chore: remove corridor prototype, add core test + compile tooling`。

### 工作 2：抱緊段核心規則（ClingModel、PatSequence、PatJudge）

**檔案：**
- 新增：`Assets/Odyssey/Core/ClingParams.cs`、`ClingModel.cs`、`PatStep.cs`、`PatSequence.cs`、`PatJudge.cs`
- 測試：`Assets/Odyssey/Tests/Editor/ClingModelTests.cs`、`PatSequenceTests.cs`、`PatJudgeTests.cs`

**介面：**
- 產出：
  - `[Serializable] public sealed class ClingParams`（public 欄位與預設）：`GripDrainPerSec = 0.12f`、`RamGripDrainMultiplier = 0.5f`、`GripRecoverPerSec = 0.35f`、`SlideNoHandsPerSec = 0.5f`、`SlideOneHandPerSec = 0.08f`、`SlideRecoverPerSec = 0.1f`、`BreathHoldSeconds = 8f`、`BreathRecoverPerSec = 0.35f`、`BreathingNoiseBase = 0.25f`、`BreathingNoiseDeprived = 0.5f`、`LeanSwitchNoise = 0.5f`
  - `public sealed class ClingModel`：`ClingModel(ClingParams p, bool isRam)`；唯讀屬性 `float GripLeft, GripRight, Slide, Oxygen, Noise`、`Side Lean`、`bool HoldingBreath`；`FailReason Tick(float dt, bool holdLeft, bool holdRight, bool holdBreath, Side lean)`。初值：握力 1、`Slide` 0、`Oxygen` 1、`Lean` Left。
  - `public enum PatKind { Back, Telegraph, Side }`；`public readonly struct PatStep { PatKind Kind; Side Side; float Duration; }`（建構子 `PatStep(PatKind, Side, float)`）
  - `public static class PatSequence { public static List<PatStep> Build(bool isRam, Random rng); }`
  - `public static class PatJudge { public const float BackHearingThreshold = 0.2f; public static FailReason Evaluate(PatStep step, ClingModel model); }`
- 規則（實作者照此寫）：
  - 有效手 = 按著且該手握力 > 0。按著的手每秒扣 `GripDrainPerSec`（大公羊乘 `RamGripDrainMultiplier`），沒按的手每秒回 `GripRecoverPerSec`；握力夾在 [0,1]。
  - 有效手 0 → `Slide += SlideNoHandsPerSec*dt`；1 → `+= SlideOneHandPerSec*dt`；2 → `-= SlideRecoverPerSec*dt`（下限 0）。`Slide >= 1` 回傳 `Fell`。
  - 憋氣中 `Oxygen -= dt / BreathHoldSeconds`；`Oxygen <= 0` 回傳 `Gasped`。沒憋氣 `Oxygen += BreathRecoverPerSec*dt`（上限 1）。
  - `Noise`：憋氣中為 0；沒憋氣為 `BreathingNoiseBase + BreathingNoiseDeprived*(1-Oxygen)`；`lean` 與上一幀不同時本幀 `Noise = max(Noise, LeanSwitchNoise)`。
  - 普通羊流程：`Back 1.5s → Telegraph(s) 1.0s → Side(s) 1.2s`，s 隨機。大公羊：同樣三步重複 `rng.Next(2, 4)` 輪，Back 改 2.5s。
  - `Evaluate`：Back 步驟且 `model.Noise > BackHearingThreshold` → `Gasped`；Side 步驟且 `model.Lean == step.Side` → `Touched`；其餘 `None`。

- [ ] **步驟 1：寫失敗測試**
  - `ClingModelTests.BothHandsHeld_DrainsGrip`：`Tick(1, true, true, false, Left)` 後 `GripLeft` 約 0.88（誤差 1e-4）。
  - `ClingModelTests.Ram_DrainsHalf`：大公羊同上後約 0.94。
  - `ClingModelTests.NoHands_FallsAfterTwoSeconds`：連續 `Tick(0.1, false,false,false,Left)` 20 次，最後一次回傳 `Fell`，第 19 次為 `None`。
  - `ClingModelTests.EmptyGrip_CountsAsReleased_AndNeverNegative`：雙手按住 Tick 10 秒（0.1 步），`GripLeft == 0`、`Slide > 0`。
  - `ClingModelTests.Slide_RecoversSlowly_WhenBothHandsReturn`：先無手 Tick 1 秒（Slide 0.5），再雙手 Tick 1 秒 → Slide 約 0.4。
  - `ClingModelTests.HoldBreath_GaspsAfterEightSeconds`：憋氣 Tick 0.5 共 16 次，第 16 次回傳 `Gasped`。
  - `ClingModelTests.Noise_ZeroWhileHolding_AndSpikesOnLeanSwitch`：憋氣時 `Noise == 0`；換貼靠方向（lean）的那次 Tick 後 `Noise >= 0.5`。
  - `PatSequenceTests.Normal_IsBackTelegraphSide_SameSide`：3 步，Kind 依序 Back/Telegraph/Side，後兩步 Side 相同，Duration 1.5/1.0/1.2。
  - `PatSequenceTests.Ram_RepeatsTwoOrThreeRounds`：對 seed 0..49，步數 ∈ {6, 9}，且每個 Back 為 2.5。
  - `PatJudgeTests.BackStep_NoisyBreathing_Gasps`、`PatJudgeTests.SideStep_SameLean_Touched`、`PatJudgeTests.SideStep_OppositeLean_None`、`PatJudgeTests.NoiseOutsideBackStep_DoesNotFail`（Telegraph 步驟＋高聲量 → None）。
- [ ] **步驟 2：** `dotnet test tools/CoreTests` → 預期編譯失敗（型別不存在）。
- [ ] **步驟 3：** 實作上列五個檔案。
- [ ] **步驟 4：** `dotnet test tools/CoreTests` → 全部通過。
- [ ] **步驟 5：** 提交：`feat(core): cling model, pat sequence and judge`。

### 工作 3：選羊段與整輪核心規則（NoiseModel、FlockSchedule、CrewRoster、CaveLoopState、PlaytestCsv）

**檔案：**
- 新增：`Assets/Odyssey/Core/NoiseModel.cs`、`FlockSchedule.cs`、`CrewRoster.cs`、`CaveLoopState.cs`、`PlaytestCsv.cs`
- 測試：對應的 `*Tests.cs`

**介面：**
- 產出：
  - `public sealed class NoiseModel { public float Decay = 0.5f; public float MaskFactor = 0.4f; public float Threshold = 0.6f; public float Level { get; } public bool Tick(float dt, float emitted, bool masked); }` — `Level = max(Level - Decay*dt, emitted*(masked ? MaskFactor : 1))`，夾在 [0,1]；回傳本幀是否「由未超過變成超過」`Threshold`（邊緣觸發，避免每幀都掃）。
  - `public sealed class FlockSchedule { public FlockSchedule(int sheepCount, int ramIndex, float firstExitDelay, float exitInterval, Random rng); public IReadOnlyList<int> Order { get; } public float ExitTime(int position); }` — `Order` 為所有羊索引的隨機排列且最後一個必為 `ramIndex`；`ExitTime(p) = firstExitDelay + p*exitInterval`。預設由呼叫端帶 `9, 0, 10f, 8f`（最後一隻 74 秒）。
  - `public sealed class CrewRoster { public const int StartingCrew = 12; public int Remaining { get; } public int Night { get; } public bool Wiped { get; } public void Eat(); public void Reset(); }` — 初始 Remaining 12、Night 1；`Eat` 使 Remaining−1、Night+1。
  - `public enum LoopPhase { Intro, Sneak, Cling, Caught, Escaped, Wiped }`；`public sealed class CaveLoopState { public CaveLoopState(CrewRoster roster); public LoopPhase Phase { get; } public FailReason LastFail { get; } public void IntroDone(); public void Grabbed(); public void Fail(FailReason reason); public void Escape(); public void CaughtDone(); public void Restart(); }` — 合法轉換：Intro→Sneak→Cling→(Caught|Escaped)；Sneak→Caught（`Swept`、`FlockGone`）；`Fail` 呼叫 `roster.Eat()`，若 `Wiped` 則 Phase=Wiped；`CaughtDone`：Caught→Intro；`Restart`：任何階段→Intro 並 `roster.Reset()`。非法轉換丟 `InvalidOperationException`。
  - `public static class PlaytestCsv { public const string Header = "time,night,crew,ram,phase,outcome,seconds"; public static string Line(DateTime time, int night, int crew, bool ram, LoopPhase phase, string outcome, float seconds); }` — 時間格式 `yyyy-MM-dd HH:mm:ss`、秒數一位小數、全用 `CultureInfo.InvariantCulture`、ram 寫 1/0。

- [ ] **步驟 1：寫失敗測試**
  - `NoiseModelTests.Masked_ReducesEmission`（emit 1、masked → Level 0.4）、`NoiseModelTests.Crossing_IsEdgeTriggered`（連兩幀 emit 1 → 第一幀 true、第二幀 false）、`NoiseModelTests.Decays`（emit 1 後 emit 0 Tick 1 秒 → 0.5）。
  - `FlockScheduleTests.RamAlwaysLast`（seed 0..49）、`FlockScheduleTests.OrderIsPermutation`、`FlockScheduleTests.LastExitWithin60To90Seconds`（9 隻、10、8 → `ExitTime(8) == 74`）。
  - `CrewRosterTests.StartsAt12Night1`、`CrewRosterTests.EatTwelveTimes_Wiped`。
  - `CaveLoopStateTests.HappyPath_ReachesEscaped`、`CaveLoopStateTests.FailInCling_EatsOneAndGoesCaught`、`CaveLoopStateTests.TwelfthFail_GoesWiped`、`CaveLoopStateTests.IllegalTransition_Throws`（Intro 直接 `Grabbed()`）、`CaveLoopStateTests.Restart_AfterWiped_ResetsRoster`（Remaining 12、Night 1、Phase Intro）。
  - `PlaytestCsvTests.Line_UsesInvariantFormat`：`Line(new DateTime(2026,10,10,12,0,0), 3, 10, true, LoopPhase.Cling, "Touched", 12.34f)` == `"2026-10-10 12:00:00,3,10,1,Cling,Touched,12.3"`。
- [ ] **步驟 2：** `dotnet test tools/CoreTests` → 編譯失敗。
- [ ] **步驟 3：** 實作五個檔案。
- [ ] **步驟 4：** `dotnet test tools/CoreTests` → 全部通過。
- [ ] **步驟 5：** 提交：`feat(core): noise, flock schedule, crew roster, loop state, csv`。

### 工作 4：玩家蹲姿與聲量＋新音效

**檔案：**
- 修改：`Assets/Odyssey/FirstPersonPlayer.cs`
- 修改：`Assets/Odyssey/ProceduralAudio.cs`

**介面：**
- 產出（`FirstPersonPlayer`）：移除 `sprintSpeed`；`walkSpeed` 預設 1.2；`CharacterController.height = 1.0`、`center = (0, 0.5, 0)`；鏡頭高度 0.85；新增 `public float CurrentNoise { get; }`（本幀有水平位移時為 `moveNoise = 0.3f`，否則 0）；新增 `public Camera Camera { get; }`；新增 `public void SetBodyActive(bool active)`（停用／啟用 `CharacterController` 與本身更新，不動鏡頭）。保留 `InputEnabled`、`Teleport`、`FaceTowards`、`CameraTransform`。
- 產出（`ProceduralAudio`）：刪除 `Lyre()`、`SeaWaves()`；保留 `Roar()`；新增 `Bleat()`（約 0.8 秒、基頻 300→250Hz 帶顫音 6Hz）、`Heartbeat()`（1 秒一拍、兩下低頻脈衝 50Hz，可無縫循環）、`WoolRustle()`（0.4 秒濾波噪音）、`GiantBreath()`（3 秒低頻濾波噪音、吸吐起伏，可循環）。

- [ ] **步驟 1：** 修改兩個檔案。
- [ ] **步驟 2：** `powershell -File tools/compile-check.ps1` → 「建置成功」。
- [ ] **步驟 3：** 提交：`feat: crouched player with noise output, cave sounds`。

### 工作 5：程式產生的岩洞（CaveBuilder）

**檔案：**
- 新增：`Assets/Odyssey/Cave/CaveLayout.cs`、`Assets/Odyssey/Cave/CaveBuilder.cs`

**介面：**
- 產出：
  - `public struct CaveLayout { public Vector3 PlayerSpawn, CyclopsSeat, EntrancePoint, OutsidePoint, CrewCorner, BucketPosition; public Vector3[] QueuePath; public Bounds Floor; }` — `QueuePath` 為洞內排隊路線（3～4 點，最後一點 = `EntrancePoint`），`OutsidePoint` 在洞口外約 8 公尺。
  - `public static class CaveBuilder { public static CaveLayout Build(Transform root, int seed); }`
- 做法（實作者照此寫）：
  - 洞穴是以原點為中心的半橢球（半徑 X 15、Z 10、Y 7），用經緯格（經 48 × 緯 16）產生網格、法線朝內，每個頂點半徑乘上 `1 + 0.18 * (PerlinNoise − 0.5)*2`；洞口在 +Z 方向：方位角 ±18° 且仰角 < 22° 的格子不產生三角形。`MeshCollider` 用同一網格。
  - 地面：40×30 公尺格（每格 1 公尺）高度 `0.6 * Perlin`，`MeshCollider`；洞口外延伸 12 公尺平地。
  - 洞口隧道：+Z 方向長 6 公尺，兩側與頂部以 10～14 個隨機縮放旋轉的岩塊（Cube）堆成，有碰撞。
  - 道具（全部 `OdysseyMaterials`、程式產生）：中央炭火（低矮岩石圈＋發光小方塊＋紅橙 Point Light，強度 3、範圍 14，附 `Flicker` 式隨機強度擺動 ±20%）、火邊斜放的橄欖木樁（細長 Cylinder，尖端深黑）、+X 牆邊乳酪架（三層木板）與奶桶（Cylinder，有碰撞，位置寫入 `BucketPosition`）、−X 角落為 `CrewCorner`。
  - 月光：洞口外一盞 Spot Light 朝洞內，藍白色 (0.55, 0.65, 1.0)、強度 4、範圍 30、角度 50°。`RenderSettings`：環境光 Flat (0.03, 0.03, 0.04)、霧 Exponential 0.04 黑色、skybox null。
  - 地面高度查詢供其他元件用：`public static float GroundHeight(Vector3 p)`（以 `Physics.Raycast` 自上而下）。

- [ ] **步驟 1：** 實作兩個檔案。
- [ ] **步驟 2：** 編譯檢查 → 「建置成功」。
- [ ] **步驟 3：** 暫時讓場景建置器在空場景放一個呼叫 `CaveBuilder.Build` 的測試物件與 `FirstPersonPlayer`，請使用者 Play 確認：看得到不規則洞壁、炭火光、洞口藍光；走不出洞壁；能蹲著走到洞口外。（此確認點只看空間，不含羊與巨人。）
- [ ] **步驟 4：** 提交：`feat(cave): procedural cyclops cave`。

### 工作 6：羊與羊群（Sheep、SheepFlock）

**檔案：**
- 新增：`Assets/Odyssey/Cave/Sheep.cs`、`Assets/Odyssey/Cave/SheepFlock.cs`

**介面：**
- 使用：`CaveLayout`、`FlockSchedule`、`CaveBuilder.GroundHeight`、`ProceduralAudio.Bleat()`。
- 產出：
  - `public enum SheepState { Wandering, Queued, AtEntrance, Exiting, Gone }`
  - `public class Sheep : MonoBehaviour { public bool IsRam { get; } public SheepState State { get; } public Transform BellyAnchor { get; } public bool IsBleating { get; } public void Init(bool isRam, CaveLayout layout); public void SendToQueue(); public void ContinueOutside(); public event Action<Sheep> ReachedEntrance; public event Action<Sheep> ReachedOutside; }`
  - `public class SheepFlock : MonoBehaviour { public int sheepCount = 9; public float firstExitDelay = 10f; public float exitInterval = 8f; public float bleatMaskRadius = 3f; public IReadOnlyList<Sheep> All { get; } public bool AllGone { get; } public void Spawn(CaveLayout layout, int seed); public bool IsMasked(Vector3 position); public event Action<Sheep> SheepReachedEntrance; }`
- 規則：
  - 外形：普通羊 = 身體方塊 (0.6, 0.55, 1.0)＋頭＋四腳，米白；大公羊 1.4 倍、較暗、加兩個彎角（Cylinder）。`BellyAnchor` 在身體正下方 0.15 公尺。
  - 遊走：每 3～6 秒在 `layout.Floor` 內隨機挑目標，速度 0.6；沿 `GroundHeight` 貼地。
  - 每隻羊每 4～10 秒隨機叫一次（`IsBleating` 為 true 0.8 秒）。
  - `SheepFlock` 依 `FlockSchedule.ExitTime(p)` 對第 p 隻呼叫 `SendToQueue()`；排隊沿 `QueuePath` 前進、速度 0.8，與前一隻保持 1.6 公尺；抵達 `EntrancePoint` 進 `AtEntrance` 並觸發 `ReachedEntrance`，在呼叫 `ContinueOutside()` 前不動；之後走向 `OutsidePoint`，抵達觸發 `ReachedOutside`、進 `Gone` 並隱藏。
  - 一次只允許一隻 `AtEntrance`；後面的羊排隊等。

- [ ] **步驟 1：** 實作兩個檔案。
- [ ] **步驟 2：** 編譯檢查 → 「建置成功」。
- [ ] **步驟 3：** 暫時在 工作 5 的測試物件加上 `SheepFlock` 並讓 `SheepReachedEntrance` 直接呼叫 `ContinueOutside()`；請使用者 Play 確認：羊群遊走、會叫；約 10 秒後開始一隻隻排隊出洞；大公羊最後；約 74 秒後全部消失。
- [ ] **步驟 4：** 提交：`feat(cave): sheep and flock exit schedule`。

### 工作 7：洞口的巨人（Cyclops）

**檔案：**
- 新增：`Assets/Odyssey/Cave/Cyclops.cs`
- 測試：`Assets/Odyssey/Tests/Editor/` 不適用（MonoBehaviour）；排隊邏輯抽成 Core：新增 `Assets/Odyssey/Core/PatQueue.cs`，測試 `Assets/Odyssey/Tests/Editor/CycloPatQueueTests.cs`

**介面：**
- 使用：`PatSequence.Build`、`Sheep`、`CaveLayout`、`ProceduralAudio.Roar()`／`GiantBreath()`、`OdysseyFonts.Cjk`。
- 產出：
  - Core：`public sealed class PatQueue<T> { public void Enqueue(T item, IReadOnlyList<PatStep> steps); public bool Tick(float dt); public T Current { get; } public PatStep? CurrentStep { get; } public float StepElapsed { get; } public event Action<T, PatStep> StepStarted; public event Action<T> Finished; }` — 依序跑每個項目的每一步；`Tick` 回傳是否正在進行；目前項目跑完才換下一個（不覆蓋）。
  - Unity：`public class Cyclops : MonoBehaviour { public float sweepDuration = 1.5f; public float sweepHitRadius = 1.2f; public void Init(CaveLayout layout, int seed); public void PatSheep(Sheep sheep); public Sheep PattingSheep { get; } public PatStep? CurrentStep { get; } public float StepElapsed { get; } public event Action<Sheep, PatStep> StepStarted; public event Action<Sheep> PatFinished; public void SweepToward(Vector3 point); public bool IsSweeping { get; } public bool SweepHits(Vector3 playerPosition); public Vector3 HandPosition { get; } }`
- 規則：
  - 外形：坐在 `CyclopsSeat` 的巨大黑色剪影（身體 Capsule 高 5 公尺、頭、單眼位置是一道結痂的暗紅傷口——已被刺瞎，不發光），面向洞內；一隻手（大方塊 0.8×0.4×1.4）。
  - 持續播放 `GiantBreath()`（3D 音源、位於頭部）。
  - `PatSheep`：以 `PatSequence.Build(sheep.IsRam, rng)` 排入 `PatQueue`；手依步驟移動：Back＝手停在羊背上方 0.3 公尺；Telegraph(s)＝手移到羊的 s 側上方；Side(s)＝手沿 s 側下降到羊肚高度。大公羊每輪開始時在頭頂浮現 TMP 文字（從「我的好公羊，你今天怎麼最後才走？」「是那個『無人』害的嗎？」中依序取），3 秒後消失。流程結束觸發 `PatFinished`。
  - `SweepToward(point)`：若未在摸羊且未在掃，手在 `sweepDuration` 內從座位沿地面掃到 `point`，播 `Roar()`；`SweepHits(p)` 在掃動期間，手與 p 的水平距離 < `sweepHitRadius` 時為 true。

- [ ] **步驟 1：寫失敗測試** `CycloPatQueueTests`：`SecondItem_WaitsForFirst`（兩項各 1 步 1 秒，Tick 0.5 → Current 為第一項；再 Tick 0.6 → 第二項）、`StepStarted_FiresPerStep`（3 步 → 3 次）、`Finished_FiresOncePerItem`。
- [ ] **步驟 2：** `dotnet test tools/CoreTests` → 編譯失敗。
- [ ] **步驟 3：** 實作 `PatQueue.cs`，`dotnet test` → 通過。
- [ ] **步驟 4：** 實作 `Cyclops.cs`；編譯檢查 → 「建置成功」。
- [ ] **步驟 5：** 暫時把 工作 6 測試物件的 `SheepReachedEntrance` 改接 `Cyclops.PatSheep`、`PatFinished` 接 `ContinueOutside`；請使用者 Play 確認：每隻羊在洞口停下被摸背、手移到一側再下探；大公羊被摸 2～3 輪並出現台詞；在洞口附近跑動會被掃（暫以 `Debug.Log` 顯示命中）。
- [ ] **步驟 6：** 提交：`feat(cave): blinded cyclops pats sheep and sweeps toward noise`。

### 工作 8：羊肚底下（ClingController）

**檔案：**
- 新增：`Assets/Odyssey/Cave/ClingController.cs`

**介面：**
- 使用：`ClingModel`、`ClingParams`、`PatJudge`、`Cyclops.CurrentStep`／`PattingSheep`／`HandPosition`、`Sheep.BellyAnchor`、`ProceduralAudio.Heartbeat()`／`WoolRustle()`。
- 產出：`public class ClingController : MonoBehaviour { public ClingParams parameters = new(); public ClingModel Model { get; } public Sheep Sheep { get; } public void Begin(Sheep sheep, Camera camera, Cyclops cyclops); public void End(); public event Action<FailReason> Failed; }`
- 規則：
  - `Begin`：鏡頭改掛到 `sheep.BellyAnchor`，朝上仰 70°、朝羊頭方向；近裁面 0.02；在鏡頭前方加一片羊毛遮罩（米白半透明方塊，遮住上方約 60% 視野），留下方縫隙看地面。
  - 每幀：讀 `Mouse.current.leftButton/rightButton.isPressed`、`Keyboard.current.spaceKey.isPressed`、A/D 決定 `lean`（兩者皆未按則維持上一個）；呼叫 `Model.Tick`；若 `Cyclops.PattingSheep == Sheep` 且 `CurrentStep` 有值，再呼叫 `PatJudge.Evaluate`。任一回傳非 None 即觸發 `Failed` 並停止更新。
  - 回饋（不顯示數字）：
    - 鏡頭局部位置往下 `Model.Slide * 0.35` 公尺；任一手握力 < 0.3 時鏡頭抖動（幅度隨握力降低）。
    - 心跳音量 = `1 - Oxygen`、播放速率 1→1.8；畫面邊緣暗角（全螢幕 `UnityEngine.UI.Image` 放射漸層貼圖，程式產生）透明度 = `(1 - Oxygen) * 0.85`。
    - 鏡頭繞前進軸傾斜：Left −8°、Right +8°；換邊時播 `WoolRustle()`。
    - 羊每走一步（羊水平位移累積 0.5 公尺）鏡頭上下顛 0.03 公尺。
    - 巨人的手預兆：手在 Telegraph/Side 時，一個 0.4 公尺的深色「凹陷」方塊貼在羊毛遮罩上，位置對應手所在側；巨人呼吸音源移到手的位置（左右聲道自然分出）；Side 步驟期間該側畫面輕微震動。
  - `End`：移除遮罩與暗角，鏡頭交還呼叫端。

- [ ] **步驟 1：** 實作。
- [ ] **步驟 2：** 編譯檢查 → 「建置成功」。
- [ ] **步驟 3：** 暫時在測試物件按 G 直接對最近一隻羊 `Begin`；請使用者 Play 確認：視野被羊毛遮住只見地面；放開雙手會下沉直到 `Failed(Fell)`（Console）；憋氣太久心跳變大後 `Failed(Gasped)`；手預兆在左右聲道與凹陷上可分辨。
- [ ] **步驟 4：** 提交：`feat(cave): cling under sheep with grip, breath and lean`。

### 工作 9：整輪串接（CaveGameLoop）＋場景建置器＋除錯與紀錄

**檔案：**
- 新增：`Assets/Odyssey/Cave/CaveGameLoop.cs`
- 修改：`Assets/Odyssey/Editor/OdysseyPlaytestSceneBuilder.cs`（場景路徑改為 `Assets/Scenes/CyclopsCave.unity`，放一個 `CaveGameLoop` 與 `LoopFailScreen` prefab；移除 工作 5～8 的暫時測試物件）

**介面：**
- 使用：所有前述元件；`LoopFailScreen.ShowMessage/QuickFade`；`CrewRoster`、`CaveLoopState`、`NoiseModel`、`PlaytestCsv`。
- 產出：`public class CaveGameLoop : MonoBehaviour`（Inspector 欄位：`grabHoldSeconds = 1f`、`grabRange = 1.5f`、`escapeDistance = 6f`、`nearEntranceNoiseMultiplier = 1.5f`、`bucketBumpNoise = 1f`、`bucketBumpRadius = 0.8f`）。
- 規則：
  - `Awake`：`CaveBuilder.Build`、生成玩家（`PlayerSpawn`）、`Cyclops.Init`、`SheepFlock`；把 `SheepReachedEntrance` 接 `Cyclops.PatSheep`、`PatFinished` 接 `ContinueOutside`。開新 CSV（不存在時寫 `PlaytestCsv.Header`）。
  - Intro：`LoopFailScreen.ShowMessage($"第 {Night} 夜", "被困在獨眼巨人的洞穴", $"剩下 {Remaining} 名同伴", 黑場時重置, 結束時 IntroDone)`。黑場重置＝`SheepFlock.Spawn(layout, 新 seed)`、玩家回 `PlayerSpawn`、`CrewCorner` 顯示 `Remaining` 個小人形（深色 Capsule 縮 0.6，散開排列）。
  - Sneak：每幀算玩家聲量 `emitted = player.CurrentNoise × (距 EntrancePoint < 8 公尺 ? nearEntranceNoiseMultiplier : 1)`，玩家距 `BucketPosition` < `bucketBumpRadius` 且在移動 → `emitted = max(emitted, bucketBumpNoise)`；`NoiseModel.Tick(dt, emitted, flock.IsMasked(玩家位置))` 回傳 true → `Cyclops.SweepToward(玩家位置)`；`Cyclops.SweepHits` → `Fail(Swept)`。按住 E 對準前方 `grabRange` 內、狀態非 `Gone/Exiting` 的羊滿 `grabHoldSeconds` → `player.SetBodyActive(false)`、`ClingController.Begin`、`Grabbed()`。`SheepFlock.AllGone` 且仍在 Sneak → `Fail(FlockGone)`。
  - Cling：`ClingController.Failed` → `Fail(reason)`；所抱的羊 `ReachedOutside` 或距 `EntrancePoint` 超過 `escapeDistance` 且已在 `Exiting` → `Escape()`。
  - Caught：`ClingController.End()`、玩家面向巨人頭部、播 `Roar()`、寫 CSV；若 Phase 為 Wiped → `ShowMessage("第 N 夜", "洞裡只剩下你。", "", …)`，結束後等按 R 呼叫 `Restart()`；否則 `ShowMessage("第 N 夜", "巨人吃掉了一名同伴", "再試一次。", 黑場重置, CaughtDone 後回 Intro)`。
  - Escaped：寫 CSV、`ShowMessage("", "你逃出去了。", "但你對著巨人喊出了自己的名字。", …)`，結束後按 R `Restart()`。
  - 操作提示：Sneak 開始後 12 秒內在畫面下方顯示 OnGUI 文字：「WASD 蹲著移動・滑鼠看・對著羊按住 E 鑽到羊肚下」；Cling 開始後 12 秒內顯示「滑鼠左/右鍵＝左/右手抓緊・空白鍵憋氣・A/D 往左/右貼」。
  - F1 面板（OnGUI）：Phase、Night、Remaining、聲量 Level、握力 L/R、Slide、Oxygen、Lean、巨人目前步驟與一側、剩餘羊數、CSV 路徑。

- [ ] **步驟 1：** 實作 `CaveGameLoop.cs`、修改場景建置器、刪除暫時測試物件。
- [ ] **步驟 2：** 編譯檢查 → 「建置成功」；`dotnet test tools/CoreTests` → 全部通過。
- [ ] **步驟 3：** 用 `Grep` 掃 `Assets/Odyssey`、`Assets/UI` 的 `.cs`：不得出現 `地下街|北車|走廊|出口|Exit|Anomaly|Corridor|Pursuer` → 預期無結果。
- [ ] **步驟 4：** 請使用者實測完整流程並回報：開場文字正確；選羊時跑到洞口附近會被掃、被掃 → 吃掉一人；抓到羊 → 抱緊段；成功走到月光下 → 成功結局；CSV 有每輪一行。
- [ ] **步驟 5：** 提交：`feat(cave): full sneak-and-cling loop with crew roster, debug panel and csv`。
