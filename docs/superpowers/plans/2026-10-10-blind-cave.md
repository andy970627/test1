# 雙盲洞穴實作計畫

> **給代理執行者：** 必要的子技能：使用 superpowers:subagent-driven-development（建議）或 superpowers:executing-plans，逐項工作執行本計畫。步驟用核取方塊（`- [ ]`）語法追蹤進度。

**目標：** 把獨眼巨人洞穴改成「雙盲＋推巨石」：全黑洞穴裡用聲音看見，躲開循聲而來的瞎眼巨人，在天亮前把巨石推出縫逃走。

**架構：** 規則（聲音、巨人狀態機、巨石、天亮、迴圈狀態）放在無 Unity 依賴的 `Odyssey.Core`，用 NUnit 先寫測試。Unity 層放在 `Assets/Odyssey/Echo/`，用靜態 `SoundBus` 廣播每個聲音，回聲著色器（`EchoField`）和巨人（`BlindCyclops`）都訂閱它。`BlindGameLoop` 取代 `CaveGameLoop`。

**技術組成：** Unity 6000.3.14f1、URP 17.3.0 Forward+、Input System（只用 `Keyboard.current`／`Mouse.current`）、C#、NUnit 3.14（`dotnet test tools/CoreTests`）、HLSL。

**規格：** `docs/superpowers/specs/2026-10-10-blind-cave-design.md`

## 全域限制

- 所有場景、物件、文字都必須出自《奧德賽》；玩家看得到的文字一律繁體中文。
- 不把使用者未提交的修改加入暫存區（stage）：`Assets/Editor.meta`、`Assets/Editor/HubForceResolve.cs(.meta)`、`Assets/Settings/PC_RPAsset.asset`、`ProjectSettings/*`、`ProjectSettings/SceneTemplateSettings.json`、`Assets/Scenes/*.unity(.meta)`、`docs/design/`、`handoff-odyssey-cyclops-cave.md`。一律 `git add <明確路徑>`。
- `Odyssey.Core` 不能引用 UnityEngine（asmdef `noEngineReferences: true`）；平面位置用 `System.Numerics.Vector2`（X＝世界 x，Y＝世界 z）。
- 每個任務結束都要 `powershell -File tools/compile-check.ps1` 輸出「建置成功」，`dotnet test tools/CoreTests` 全過。
- 半徑 = 聲量 × 20 m；聲量：蹲走 0.15、跑 0.4、拍手 0.5、石子 0.6、巨石 1.0、羊叫 0.5、巨人 0.15。
- 提交訊息結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- F1 除錯面板預設開啟、大字、圖像化、不顯示檔案路徑。

## 審查重點

1. **聲音剛好在半徑邊界、或就在巨人腳下（距離 0）**：邊界算聽得到，距離 0 不能產生 NaN。測試見 工作 1、工作 3。
2. **同一幀既被抓又天亮**：只算第一個失敗，不丟例外、不重複吃同伴。`BlindGameLoop.Fail` 先檢查 `Phase == Night`（工作 7），`CaveLoopState` 測試確認第二次 `Fail` 會丟例外（工作 7）。
3. **巨石推滿 8 格後還按住 E**：進度停在 8，不溢位，也不會再發出巨響。測試見 工作 2。
4. **巨人守石時玩家繼續推**：守石重新計時，不會卡在原地。測試見 工作 3。
5. **超過 16 個聲音同時存在**（跑步＋巨人腳步＋多隻羊叫）：最舊的聲波被取代，不閃爍也不出錯。由 工作 4 的 `EchoField` 環狀緩衝處理，實測時注意。

---

### 工作 1：聲音規則

**檔案：**
- 新增：`Assets/Odyssey/Core/SoundEvent.cs`（`SoundKind`、`SoundSource`、`SoundEvent`）
- 新增：`Assets/Odyssey/Core/SoundRules.cs`
- 測試：`Assets/Odyssey/Tests/Editor/SoundRulesTests.cs`

**介面：**
- 產出：
  - `enum SoundKind { Step, Run, Clap, Stone, Boulder, Bleat, Cyclops }`
  - `enum SoundSource { Player, Cyclops, Sheep }`
  - `readonly struct SoundEvent { SoundKind Kind; Vector2 Position; float Loudness; float Time; SoundEvent(SoundKind kind, Vector2 position, float loudness, float time) }`
  - `static class SoundRules`：
    - 常數 `RadiusPerLoudness = 20f`、`MaskFactor = 0.4f`、`MaskRadius = 3f`、`MaskSeconds = 1f`
    - `float Loudness(SoundKind kind)`
    - `SoundSource Source(SoundKind kind)`：Stone、Boulder 算 Player
    - `float Radius(float loudness)`
    - `SoundEvent Create(SoundKind kind, Vector2 position, float time, IReadOnlyList<SoundEvent> recentBleats)`：套用羊叫遮蔽
    - `bool CanHear(SoundEvent e, Vector2 listener, float radiusMultiplier = 1f)`

- [ ] **步驟 1：寫失敗測試** `SoundRulesTests`
  - `Loudness_MatchesSpec`：Step 0.15、Run 0.4、Clap 0.5、Stone 0.6、Boulder 1.0、Bleat 0.5、Cyclops 0.15。
  - `Radius_IsTwentyTimesLoudness`：`Radius(0.5f) == 10f`。
  - `Source_StoneAndBoulderArePlayer_BleatIsSheep_CyclopsIsCyclops`
  - `Create_WithinThreeMetersOfBleatInLastSecond_IsMasked`：
    - 羊叫在 (0,0)、t=10；在 (2,0)、t=10.5 拍手 → `Loudness == 0.5f*0.4f`。
    - 在 (3.5,0) → 0.5。
    - t=11.2 → 0.5。
  - `Create_BleatIsNeverMaskedByItself`：羊叫在同一點、同一時間，Loudness 仍是 0.5。
  - `CanHear_BoundaryInclusive`：拍手在 (10,0)、聽者在 (0,0) → true；(10.01,0) → false。
  - `CanHear_RadiusMultiplier`：石子在 (7,0)、`radiusMultiplier: 0.5f` → false；(6,0) → true。
  - `CanHear_CyclopsOwnSoundIsNeverHeard`：Kind=Cyclops、距離 0 → false。
- [ ] **步驟 2：執行測試確認失敗**
  執行：`dotnet test tools/CoreTests --filter SoundRulesTests`
  預期：編譯失敗，找不到 `SoundRules`。
- [ ] **步驟 3：實作** `SoundEvent.cs`、`SoundRules.cs`（命名空間 `Odyssey.Core`）
  `Create` 只在 `kind != Bleat` 時檢查遮蔽：任何羊叫符合「`0 ≤ time - bleat.Time ≤ MaskSeconds`」且「距離 ≤ `MaskRadius`」就乘上 `MaskFactor`。
- [ ] **步驟 4：執行測試確認通過**
  執行：`dotnet test tools/CoreTests`
  預期：全過。
- [ ] **步驟 5：提交**
  `git add Assets/Odyssey/Core/SoundEvent.cs Assets/Odyssey/Core/SoundRules.cs Assets/Odyssey/Tests/Editor/SoundRulesTests.cs`
  訊息：`feat(blind): sound rules — loudness, radius, bleat masking`

### 工作 2：巨石、天亮、石子記憶

**檔案：**
- 新增：`Assets/Odyssey/Core/BoulderModel.cs`、`DawnClock.cs`、`DecoyMemory.cs`
- 測試：`Assets/Odyssey/Tests/Editor/BoulderDawnDecoyTests.cs`

**介面：**
- 產出：
  - `sealed class BoulderModel { const int StepsToOpen = 8; int Progress; bool IsOpen; bool Push(); void Reset(); }`
    - `Push()` 有前進時回傳 true；已開時回傳 false，`Progress` 不變。
  - `sealed class DawnClock { const float DefaultNightSeconds = 240f; DawnClock(float nightSeconds = 240f); float Elapsed; float Fraction; bool IsDawn; void Tick(float dt); void Reset(); }`
    - `Fraction` 限制在 0～1。
  - `sealed class DecoyMemory { const int FooledLimit = 3; const float LearnedMultiplier = 0.5f; int Fooled; float StoneRadiusMultiplier; void RecordFooled(); void Reset(); }`

- [ ] **步驟 1：寫失敗測試**
  - `Boulder_EightPushesOpens`：推 7 次 `IsOpen == false`，第 8 次 true。
  - `Boulder_PushWhenOpen_ReturnsFalseAndStaysAtEight`：推第 9 次回傳 false，`Progress == 8`。
  - `Boulder_Reset_GoesToZero`
  - `Dawn_After240Seconds_IsDawn`：`Tick(239.9f)` → false；再 `Tick(0.2f)` → true，`Fraction == 1f`。
  - `Dawn_FractionHalfway`：`Tick(120f)` → `Fraction == 0.5f`。
  - `Decoy_ThirdFooledHalvesStoneRadius`：2 次後倍率 1，3 次後 0.5；`Reset` 後回 1。
- [ ] **步驟 2：執行測試確認失敗**
  執行：`dotnet test tools/CoreTests --filter BoulderDawnDecoyTests`
  預期：編譯失敗。
- [ ] **步驟 3：實作三個類別**
- [ ] **步驟 4：執行測試確認通過**
  執行：`dotnet test tools/CoreTests`
  預期：全過。
- [ ] **步驟 5：提交**
  訊息：`feat(blind): boulder progress, dawn clock, decoy memory`

### 工作 3：巨人大腦

**檔案：**
- 新增：`Assets/Odyssey/Core/CyclopsBrain.cs`
- 修改：`Assets/Odyssey/Core/Side.cs`：`FailReason` 新增 `Bumped`、`Dawn`。舊值暫留，工作 7 刪除。
- 測試：`Assets/Odyssey/Tests/Editor/CyclopsBrainTests.cs`

**介面：**
- 使用：工作 1 的 `SoundEvent`、`SoundRules.CanHear`；工作 2 的 `DecoyMemory`。
- 產出：
  - `enum CyclopsState { Listen, Investigate, Search, Guard }`
  - `sealed class CyclopsBrain`
    - 常數：`WalkSpeed = 2.5f`、`RunSpeed = 4f`、`ArriveDistance = 0.5f`、`SearchSeconds = 3f`、`GuardSearchSeconds = 6f`、`SearchRadius = 1.5f`、`BumpDistance = 1f`
    - `CyclopsBrain(Vector2 start, Vector2 boulder, DecoyMemory memory)`
    - 屬性：`CyclopsState State`、`Vector2 Position`、`Vector2 Target`、`float StateElapsed`、`bool IsMoving`（Investigate 或 Guard）
    - `void Hear(SoundEvent e)`
    - `FailReason Tick(float dt, Vector2 player)`
    - `void Reset(Vector2 start)`

**規則（照這個寫）**
- `Hear`：
  - `Cyclops` 自己的聲音一律忽略。
  - 聽不到的聲音忽略：用 `SoundRules.CanHear`，`Stone` 要乘上 `memory.StoneRadiusMultiplier`。
  - `Boulder` → 進入 Guard，`Target = boulder`，`StateElapsed = 0`（在 Guard 或守石中的 Search 也一樣重新開始）。
  - 在 Guard，或在守石中的 Search 時，其他聲音一律忽略。
  - 在 Listen 或 Search 時 → 進入 Investigate，目標設成這個聲音。
  - 在 Investigate 時，只有新聲音的 `Loudness` 大於目前目標的聲量才換目標。
- `Tick`：
  1. 先判斷碰撞：`|player - Position| ≤ BumpDistance` → 回傳 `Bumped`。
  2. Investigate 用 `WalkSpeed`、Guard 用 `RunSpeed` 朝 `Target` 走，不能超過目標點。距離 ≤ `ArriveDistance` 就進入 Search：Investigate 來的搜 `SearchSeconds`，Guard 來的搜 `GuardSearchSeconds`。
  3. Search 中 `|player - Position| ≤ SearchRadius` → 回傳 `Touched`。時間到就回到 Listen；如果這次是在追石子，呼叫 `memory.RecordFooled()`。
- 距離為 0 時不能做正規化（避免 NaN）。

- [ ] **步驟 1：寫失敗測試** `CyclopsBrainTests`
  共同設定：巨人在 (0,0)、巨石在 (0,9)、新的 `DecoyMemory`。

  | 測試 | 情境 | 預期 |
  |---|---|---|
  | `Listen_HearsClapInRange_Investigates` | 拍手在 (8,0) | State=Investigate、Target=(8,0) |
  | `Listen_IgnoresClapOutOfRange` | 拍手在 (10.5,0) | 仍是 Listen |
  | `IgnoresOwnSounds` | Cyclops 聲音在 (1,0) | 仍是 Listen |
  | `Investigate_MovesAtWalkSpeed` | 拍手在 (8,0)，`Tick(1f, 玩家 (−20,0))` | Position.X ≈ 2.5 |
  | `Investigate_SwitchesOnlyToLouderSound` | 先拍手 (8,0)，再蹲走 (−2,0) | Target 不變 |
  | | 再丟石子 (0,8) | Target=(0,8) |
  | `Arrive_StartsSearch_TouchesWithinRadius` | 拍手在 (1,0)，Tick 到抵達後再 Tick 0.1，玩家在 (1,1.4) | 回傳 Touched |
  | | 同上，玩家在 (1,1.6) | None，3 秒後 State=Listen |
  | `StoneSearchMiss_RecordsFooled_ThirdTimeHalvesRange` | 三次「石子在 (2,0) → 抵達 → 搜完」 | `memory.Fooled == 3` |
  | | 之後石子在 (7,0) | 仍是 Listen |
  | | 石子在 (5,0) | Investigate |
  | `BoulderSound_Guards_RunsThenSearchesSixSeconds` | Boulder 聲音在 (0,9)，`Tick(1f)` | Position.Y ≈ 4，State=Guard |
  | | 抵達後 | Search；5.9 秒時仍是 Search，6.1 秒時是 Listen |
  | `Guard_IgnoresOtherSounds_ButBoulderRestarts` | 守石搜索中聽到拍手 | 仍是 Search |
  | | 搜索 4 秒後聽到 Boulder | StateElapsed 歸 0 |
  | `Bump_AnyState` | Listen，玩家在 (0.9,0) | 回傳 Bumped |
  | `SoundAtOwnPosition_NoNaN` | 拍手在 (0,0)，Tick | 進入 Search，Position 不是 NaN |
- [ ] **步驟 2：執行測試確認失敗**
  執行：`dotnet test tools/CoreTests --filter CyclopsBrainTests`
  預期：編譯失敗。
- [ ] **步驟 3：依上面的規則實作 `CyclopsBrain`；在 `FailReason` 加上 `Bumped`、`Dawn`**
- [ ] **步驟 4：執行測試確認通過**
  執行：`dotnet test tools/CoreTests`
  預期：全過。另外跑 `powershell -File tools/compile-check.ps1`，預期「建置成功」。
- [ ] **步驟 5：提交**
  訊息：`feat(blind): cyclops brain — listen, investigate, search, guard`

### 工作 4：回聲著色器與聲音廣播

**檔案：**
- 新增：`Assets/Odyssey/Echo/Echo.shader`（`Shader "Odyssey/Echo"`）
- 新增：`Assets/Odyssey/Echo/SoundBus.cs`、`EchoField.cs`、`EchoMaterials.cs`

**介面：**
- 使用：工作 1 的 `SoundKind`、`SoundEvent`、`SoundRules`。
- 產出：
  - `static class SoundBus`
    - `event Action<SoundEvent, Vector3> Emitted`
    - `void Emit(SoundKind kind, Vector3 worldPos)`：用 `Time.time`，並以最近 1 秒內的羊叫做遮蔽
    - `void Clear()`：清掉事件訂閱與羊叫紀錄；`BlindGameLoop.Awake` 呼叫，避免關閉 Domain Reload（網域重新載入）時殘留
  - `class EchoField : MonoBehaviour`
    - 常數：`MaxPulses = 16`、`SpreadSeconds = 1f`、`FadeSeconds = 2.5f`
    - `static EchoField Instance`
    - `readonly struct Pulse { Vector3 Position; float Radius; float StartTime; Color Color; }`
    - `IReadOnlyList<Pulse> Active`
    - `static Color ColorFor(SoundSource s)`：Player (0.85, 0.92, 1)、Cyclops (0.8, 0.12, 0.08)、Sheep (1, 0.9, 0.55)
    - 在 `OnEnable` 訂閱 `SoundBus.Emitted`
  - `static class EchoMaterials { Material Create(Color baseColor); }`：用 `Shader.Find("Odyssey/Echo")`；每種顏色只建一份，重複使用

**著色器（URP Unlit HLSL，`Cull Off`，不吃燈光和霧）**
- 全域變數：
  - `float4 _EchoPulses[16]`：xyz＝位置，w＝開始時間
  - `float4 _EchoColors[16]`：rgb＝顏色，a＝半徑
  - `int _EchoCount`
- 每個聲波的算法：
  - `age = _Time.y - start`
  - `front = radius * saturate(age / 1.0)`
  - `d` = 這一點到聲源的距離
  - 被掃過（`d ≤ front`）的亮度：`1 - saturate((age - d / radius) / 2.5)`
  - 波前亮邊：`(1 - saturate(abs(d - front) / 0.4)) * (1 - saturate(age / 2.5))`
- 輸出：`_BaseColor.rgb * Σ(亮度 * 聲波顏色) + Σ(亮邊 * 聲波顏色 * 0.6)`
- `EchoField.LateUpdate`：
  - 移除超過 `SpreadSeconds + FadeSeconds` 的聲波。
  - 用 `Shader.SetGlobalVectorArray` 傳入；陣列固定長度 16，避免 Unity 鎖住第一次的陣列大小。
  - 聲波滿了就取代最舊的一個。

- [ ] **步驟 1：寫 `SoundBus`、`EchoField`、`EchoMaterials`、`Echo.shader`**
- [ ] **步驟 2：編譯檢查**
  執行：`powershell -File tools/compile-check.ps1`
  預期：「建置成功」。著色器的語法要等 Unity 匯入時才會被檢查，工作 7 實測時確認 Console 沒有著色器錯誤。
- [ ] **步驟 3：提交**
  訊息：`feat(blind): echo shader, echo field and sound bus`

### 工作 5：黑暗洞穴、巨石與石子

**檔案：**
- 新增：`Assets/Odyssey/Echo/BlindCaveBuilder.cs`、`Boulder.cs`、`StonePickup.cs`

**介面：**
- 使用：`CaveBuilder.Build(Transform, int)`、`CaveBuilder.GroundHeight(Vector3)`、`CaveLayout`、`EchoMaterials.Create`、`OdysseyMaterials.Create(color, emission)`。
- 產出：
  - `struct BlindCaveLayout { CaveLayout Cave; Boulder Boulder; Vector3[] StoneSpots; }`
  - `static class BlindCaveBuilder { BlindCaveLayout Build(Transform root, int seed); }`
    1. 呼叫 `CaveBuilder.Build`。
    2. 銷毀 `root` 底下名為 `Embers`、`Moonlight` 的物件。
    3. 設定 `RenderSettings.ambientLight = Color.black`、`fog = false`。
    4. 每個 `Renderer` 改用 `EchoMaterials.Create(原材質的 _BaseColor)`。
    5. 在 `layout.EntrancePoint + (0,0,0.8)` 放巨石。
    6. 用 seed 在 `Cave.Floor` 範圍內產生 6 個石子位置，彼此至少相距 2 m，且離巨石 3 m 以上。
  - `class Boulder : MonoBehaviour`
    - 常數：`Width = 6.8f`、`Height = 3.6f`、`Depth = 1.8f`、`SlidePerStep = 0.18f`
    - `void Init(Vector3 center)`：建立方塊碰撞體（回聲材質）；縫的光是一片 Lit 自發光的 Quad
    - `void SetProgress(int steps)`：巨石往 +X 滑 `steps * SlidePerStep`，縫的光寬度跟著變
    - `void SetDawn(float fraction)`：縫的光從 (0.05, 0.08, 0.25) 線性漸變到 (0.7, 0.7, 0.65)
    - `Vector3 PushPoint`：巨石朝洞內那一面的中心
    - `Vector3 GapPoint`：縫的中心
  - `class StonePickup : MonoBehaviour { void Init(Vector3 pos); bool Taken; void Respawn(); }`：半徑 0.15 m 的球，回聲材質

- [ ] **步驟 1：寫三個檔案**
- [ ] **步驟 2：編譯檢查**
  執行：`powershell -File tools/compile-check.ps1`
  預期：「建置成功」。
- [ ] **步驟 3：提交**
  訊息：`feat(blind): dark cave builder, boulder with dawn gap, stone pickups`

### 工作 6：玩家、巨人、羊

**檔案：**
- 新增：`Assets/Odyssey/Echo/EchoPlayer.cs`、`ThrownStone.cs`、`BlindCyclops.cs`、`WanderingSheep.cs`

**介面：**
- 使用：`FirstPersonPlayer`（`walkSpeed`、`InputEnabled`、`CameraTransform`）、`SoundBus.Emit`、`Boulder`、`StonePickup`、`CyclopsBrain`、`ProceduralAudio.Bleat()`／`Roar()`／`GiantBreath()`。
- 產出：
  - `class EchoPlayer : MonoBehaviour`（和 `FirstPersonPlayer` 放在同一個物件上）
    - 常數：`CrouchSpeed = 1.5f`、`RunSpeed = 4f`、`CrouchStepSeconds = 0.6f`、`RunStepSeconds = 0.35f`、`MaxStones = 3`、`StartStones = 1`、`PushHoldSeconds = 1f`、`PushReach = 1.5f`、`PickupReach = 0.8f`
    - `void Init(FirstPersonPlayer body, Boulder boulder, IReadOnlyList<StonePickup> pickups, Func<bool> boulderOpen)`
    - `int Stones`、`float PushHold01`、`bool InputEnabled`
    - `event Action PushCompleted`、`event Action EscapeRequested`
    - `void ResetForNight()`：石子設回 1 顆、清掉推的計時
    - 每幀：
      - 依 Shift 設定 `walkSpeed`。
      - 有水平移動時，依步頻發出 `Step` 或 `Run`。
      - Q → `Clap`。
      - 滑鼠左鍵（游標鎖定中、`Stones > 0`）→ 往準星方向丟出 `ThrownStone`，初速 = 準星方向 × 9 + 上方 × 2。
      - 對著巨石（`PushPoint` 1.5 m 內，且視線方向與巨石方向的點積 > 0.7）按住 E：
        - 巨石未開：滿 1 秒觸發 `PushCompleted`，並重新計時。
        - 巨石已開，而且在 `GapPoint` 1.5 m 內：按下 E 觸發 `EscapeRequested`。
      - 走到 `PickupReach` 內、石子未滿 3 顆時自動撿起。
  - `class ThrownStone : MonoBehaviour`：第一次碰撞時發出 `SoundBus.Emit(Stone, 碰撞點)`，0.5 秒後銷毀自己。
  - `class BlindCyclops : MonoBehaviour`
    - `void Init(BlindCaveLayout layout, DecoyMemory memory)`
    - `CyclopsBrain Brain`、`bool Active`、`Vector3 HeadPosition`
    - `event Action<FailReason> CaughtPlayer`
    - `void ResetForNight()`、`void Roar()`
    - 用基本形狀組出約 4 m 高的身體、瞎眼（黑色）、雙臂；全部用回聲材質。
    - 訂閱 `SoundBus.Emitted` → `Brain.Hear`。
    - `Update`：`Active` 時以玩家的平面位置呼叫 `Brain.Tick`，結果不是 None 就觸發 `CaughtPlayer`。
    - 移動中每 0.7 秒（Guard 時 0.45 秒）、站著時每 4 秒，發出 `SoundBus.Emit(Cyclops, 腳下)`。
    - Search 時雙臂左右掃。
  - `class WanderingSheep : MonoBehaviour`
    - `void Init(Bounds floor, bool isRam, int seed)`
    - 在 `floor` 內隨機走動（0.6 m/s，每到一點停 1～3 秒）。
    - 每 9～20 秒 `SoundBus.Emit(Bleat, 位置)`，並以 3D 音效播放 `Bleat()`，音量 0.35。
    - 外觀：身體、頭、四腳的基本形狀，回聲材質；大公羊大 1.3 倍，有角。

- [ ] **步驟 1：寫四個檔案**
- [ ] **步驟 2：編譯檢查**
  執行：`powershell -File tools/compile-check.ps1`
  預期：「建置成功」。
- [ ] **步驟 3：提交**
  訊息：`feat(blind): echo player, thrown stones, blind cyclops, wandering sheep`

### 工作 7：夜晚迴圈接上、舊玩法移除

**檔案：**
- 修改：`Assets/Odyssey/Core/CaveLoopState.cs`
  - `LoopPhase { Intro, Night, Caught, Escaped, Wiped }`
  - 移除 `Grabbed()`；`IntroDone` 改成 Intro → Night，`Escape` 改成 Night → Escaped，`Fail` 只能在 Night 呼叫。
- 修改：`Assets/Odyssey/Core/Side.cs`
  - 改名為 `FailReason.cs`，只留 `enum FailReason { None, Touched, Bumped, Dawn }`；刪除 `Side`。
- 修改：`Assets/Odyssey/Core/FailReasonText.cs`：
  - `Touched` →「巨人循著聲音摸到了你」
  - `Bumped` →「你撞上了巨人」
  - `Dawn` →「天亮了，巨人把石頭推了回去」
- 修改：`Assets/Odyssey/Core/PlaytestCsv.cs`
  - `Header = "time,night,crew,boulder,phase,outcome,seconds"`
  - `Line(DateTime time, int night, int crew, int boulder, LoopPhase phase, string outcome, float seconds)`
- 新增：`Assets/Odyssey/Echo/BlindGameLoop.cs`
- 修改：`Assets/Odyssey/Editor/OdysseyPlaytestSceneBuilder.cs`：改為建立 `BlindGameLoop`，場景存成 `Assets/Scenes/BlindCave.unity`。
- 刪除：
  - Core：`ClingModel.cs`、`ClingParams.cs`、`PatSequence.cs`、`PatStep.cs`、`PatQueue.cs`、`PatJudge.cs`、`FlockSchedule.cs`、`NoiseModel.cs`
  - Cave：`ClingController.cs`、`SheepFlock.cs`、`Sheep.cs`、`Cyclops.cs`、`CaveGameLoop.cs`
  - 對應的 `.meta` 檔
  - 測試：`ClingModelTests.cs`、`CycloPatQueueTests.cs`、`FlockScheduleTests.cs`、`NoiseModelTests.cs`、`PatJudgeTests.cs`、`PatSequenceTests.cs`（含 `.meta`）
- 測試：修改 `CaveLoopStateTests.cs`、`FailReasonTextTests.cs`、`PlaytestCsvTests.cs`

**介面：**
- 使用：工作 1～6 的全部介面；`LoopFailScreen.Instance.ShowMessage(year, title, subtitle, onBlackout, onComplete, speed)`。
- 產出（給 工作 8 的 `DebugPanel` 讀）：`BlindGameLoop` 的公開唯讀屬性
  - `CaveLoopState State`、`CrewRoster Roster`、`BoulderModel BoulderProgress`、`DawnClock Dawn`、`DecoyMemory Decoys`
  - `BlindCyclops Cyclops`、`Vector3 PlayerPosition`、`IReadOnlyList<WanderingSheep> Sheep`、`BlindCaveLayout Layout`、`IReadOnlyList<string> Deaths`
  - `float transitionSpeed = 2f`

**`BlindGameLoop` 流程**（過場與 CSV 寫法沿用標籤 `cave-cling-v1` 的 `CaveGameLoop.Fail`／`Show`／`Log`／`OnGUI`）
- **Awake**：
  - `SoundBus.Clear()`
  - `BlindCaveBuilder.Build`
  - 建立玩家（`FirstPersonPlayer`＋`EchoPlayer`）、`EchoField`、`BlindCyclops`
  - 9 隻 `WanderingSheep`（索引 0 是大公羊）、6 個 `StonePickup`
  - CSV 路徑 `Application.persistentDataPath/cyclops_playtest.csv`
- **StartNight**：
  - 玩家傳送到 `PlayerSpawn`；巨人、巨石、天亮、石子記憶、玩家石子、撿取物全部重置。
  - 播開場：「第 N 夜」／「巨人瞎了，洞口被巨石封住」／「剩下 X 名同伴」。
  - 播完 → `IntroDone`，開啟輸入，`Cyclops.Active = true`。
  - 操作提示顯示 12 秒。
- **Night 每幀**：
  - `Dawn.Tick`，`Boulder.SetDawn(Fraction)`；`IsDawn` → `Fail(Dawn)`。
- **PushCompleted**：`BoulderProgress.Push()` 回傳 true 才 `SetProgress`，並 `SoundBus.Emit(Boulder, PushPoint)`。
- **EscapeRequested**（巨石已開）：
  - `State.Escape()`，播「你逃出去了。」／「但你對著巨人喊出了自己的名字。」
  - CSV 記 `Escaped`；之後等玩家按 R 重新開始。
- **Fail(reason)**：
  - 先檢查 `Phase == Night`，否則直接返回。
  - 關閉輸入、`Cyclops.Roar()`、玩家轉頭面向巨人。
  - 死亡紀錄加一行「第 N 夜・原因」，CSV 記錄 `boulder = Progress`。
  - 被吃還有同伴：播「第 N 夜・<原因>」／「巨人吃掉了一名同伴」／「第 N+1 夜・剩下 X 名同伴」；黑幕時重置世界，播完 → `CaughtDone` + `StartNight`，不再另播開場。
  - 全滅：播「洞裡只剩下你。」，之後按 R 重新開始。
- **OnGUI**：
  - 右下角畫 3 顆石子圖示，有的亮、沒有的暗。
  - 推巨石時畫一條小進度弧。
  - 開場後 12 秒內顯示操作提示：「WASD 蹲著走・Shift 跑・Q 拍手・左鍵 丟石子・對巨石按住 E 推・F1 除錯」。

- [ ] **步驟 1：改測試**
  - `CaveLoopStateTests`：
    - 把 `Grabbed()` 拿掉，`Cling` 改成 `Night`，`Swept`／`FlockGone` 換成 `Touched`／`Dawn`。
    - 新增 `FailTwice_SecondThrows`：在 Night `Fail` 一次之後再 `Fail` → `InvalidOperationException`。
  - `FailReasonTextTests`：`Touched_MentionsTheHand` 改成 `Touched_MentionsSound`（`StringAssert.Contains("聲音", ...)`）。
  - `PlaytestCsvTests.Line_UsesInvariantFormat`：
    - 呼叫 `Line(new DateTime(2026,10,10,12,0,0), 3, 10, 5, LoopPhase.Night, "Dawn", 12.34f)`
    - 預期 `"2026-10-10 12:00:00,3,10,5,Night,Dawn,12.3"`
- [ ] **步驟 2：執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗（`LoopPhase.Night` 不存在）。
- [ ] **步驟 3：修改 Core、刪除舊檔（`git rm`）、寫 `BlindGameLoop`、改場景建立選單**
- [ ] **步驟 4：驗證**
  - `dotnet test tools/CoreTests` → 全過
  - `powershell -File tools/compile-check.ps1` → 「建置成功」
  - `git grep -n "Cling\|PatQueue\|SheepFlock" -- Assets` → 沒有結果
- [ ] **步驟 5：提交**
  `git add` 明確路徑加上 `git rm` 的檔案，不用 `-A`。
  訊息：`feat(blind): night loop with boulder and dawn; remove sheep-cling gameplay`

### 工作 8：F1 除錯面板

**檔案：**
- 新增：`Assets/Odyssey/Echo/DebugPanel.cs`
- 修改：`Assets/Odyssey/Echo/BlindGameLoop.cs`：Awake 時 `AddComponent<DebugPanel>().Init(this)`

**介面：**
- 使用：工作 7 的 `BlindGameLoop` 唯讀屬性、`EchoField.Instance.Active`、`CyclopsBrain.State`。
- 產出：
  - `class DebugPanel : MonoBehaviour`
  - `public bool showDebug = true`
  - `void Init(BlindGameLoop loop)`
  - F1 切換顯示。

**面板內容（OnGUI，字級 `Mathf.Max(22, Screen.height / 28)`，不顯示檔案路徑）**
- **俯視小地圖**：
  - 左上角 30% 螢幕高的方框，映射 x −16～16、z −12～14。
  - 洞壁畫成橢圓（15×10）。
  - 玩家：白點；巨人：依狀態上色（聆聽 灰、追聲 黃、摸索 紅、守石 紫）；羊：淡黃點；巨石：棕色方塊。
  - 每個 `EchoField` 聲波畫成依目前擴散半徑的圓框，顏色同聲波。
- **巨人狀態**：狀態色塊＋中文（聆聽／追聲／摸索／守石）。
- **長條**：
  - 「巨石」：Progress/8，加 8 個格點。
  - 「天亮」：Dawn.Fraction。
  - 「石子吸引力」：滿格 = 1、學會後半格，旁邊用 3 個點表示被騙次數。
- **死亡紀錄**：最近 6 行。

- [ ] **步驟 1：寫 `DebugPanel` 並接上**
- [ ] **步驟 2：驗證**
  - `powershell -File tools/compile-check.ps1` → 「建置成功」
  - `dotnet test tools/CoreTests` → 全過
- [ ] **步驟 3：提交**
  訊息：`feat(blind): graphical F1 debug panel with top-down map`

### 工作 9：交付前檢查

- [ ] **步驟 1：對照規格逐節檢查**
  規格第 3～9 節逐條對照實作，數值完全一致（聲量、速度、秒數、格數、顏色、文字）。
- [ ] **步驟 2：回報使用者**
  說明要在 Unity 執行 `Odyssey → Create Playtest Scene` 再按 Play，並列出還沒實測的項目：
  - Console 是否有著色器錯誤
  - 聲波看不看得懂
  - 推石的窗口夠不夠
  - 240 秒是否合適
