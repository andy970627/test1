# 雙盲洞穴 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在雙盲洞穴加入同伴（找、帶、被吃）、巨人丟岩石、橄欖木樁槓桿、洞內雜物（奶桶、乳酪架、柳條羊圈）。

**Architecture:** 新規則全部放進 `Odyssey.Core`，先寫 NUnit 測試：聲音種類、`CrewRoster.Lose`、`BoulderModel.Push(int)`、`FollowTrail`、`CyclopsBrain` 的丟岩石與吃同伴。Unity 層在 `Assets/Odyssey/Echo/` 新增同伴、木樁、雜物、岩石元件，`BlindGameLoop` 負責串接。

**Tech Stack:** Unity 6000.3.14f1、URP 17.3、Input System、C#、NUnit（`dotnet test tools/CoreTests`）。

**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md`（未提到的規則沿用 `2026-10-10-blind-cave-design.md`）

## Global Constraints

- 內容只能出自《奧德賽》；玩家可見文字一律繁體中文。
- 只 `git add` 明確路徑。不要 stage：
  - `Assets/Editor*`、`Assets/Settings/PC_RPAsset.asset`、`ProjectSettings/*`
  - `Assets/Scenes/*`、`Assets/UI/LoopFail/LoopFailScreen.prefab`
  - `docs/design/`、`handoff-odyssey-cyclops-cave.md`
- `Odyssey.Core` 不引用 UnityEngine；平面座標用 `System.Numerics.Vector2`（X＝x，Y＝z）。
- 每個任務結束：`dotnet test tools/CoreTests` 全過，`powershell -ExecutionPolicy Bypass -File tools/compile-check.ps1` 0 錯誤。
- 新增的 `.cs` 若 Unity 沒有自動產生 `.meta`，自行產生（`fileFormatVersion: 2` 加上新 GUID）並一起提交。
- 提交訊息結尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **同一次摸索同時碰到玩家和同伴**：算玩家被抓，同伴不額外扣。測試見 Task 3。
2. **巨人在吃同伴或蓄力丟岩石時，聽到推巨石**：要立刻轉為守石，不能卡在吃或丟的狀態。測試見 Task 3。
3. **木樁撬開時只剩 1 格**：只前進 1 格，不溢位。測試見 Task 1。
4. **跟隨隊伍在玩家原地不動時**：不能疊在玩家身上，也不能產生 NaN。測試見 Task 2。
5. **全部同伴都被吃光後才逃出**：結局顯示「帶出 0 名同伴」，不丟例外；這一夜之後再被抓就是全滅。由 Task 7 的 `BlindGameLoop.Escape` 處理，`CaveLoopState` 測試確認 `Remaining == 0` 時 `Fail` 會進入 Wiped（Task 1）。

---

### Task 0: 實測回饋：巨石外觀、體力

**Files:**
- Create: `Assets/Odyssey/Core/Stamina.cs`、`Assets/Odyssey/Tests/Editor/StaminaTests.cs`
- Modify:
  - `SoundEvent.cs`：`SoundKind` 新增 `Pant`
  - `SoundRules.cs`：`Pant` 聲量 0.2，來源 Player
  - `Boulder.cs`：顏色與刻痕
  - `EchoPlayer.cs`：跑步受體力限制，低體力時喘氣
  - `BlindGameLoop.cs`：左下角體力條

**Interfaces:**
- Produces: `sealed class Stamina`
  - 常數：`DrainPerSec = 0.25f`、`RegenPerSec = 0.15f`、`ResumeAt = 0.3f`、`PantBelow = 0.25f`、`PantSeconds = 1.2f`
  - 屬性：`float Value`（初始 1）、`bool CanRun`、`bool Panting`
  - `bool Tick(float dt, bool wantRun)`：回傳這一幀是否真的在跑
  - `bool PantDue(float dt)`：低於 0.25 時每 1.2 秒回傳一次 true
  - `void Reset()`
- `EchoPlayer.Stamina`：公開，給體力條讀取。

- [ ] **Step 1: 寫失敗測試**
  - `Run_DrainsInFourSeconds`：`Tick(4f, true)` → Value ≈ 0，`CanRun == false`。
  - `Exhausted_ResumesAtPointThree`：耗盡後 `Tick(1.9f, false)` → CanRun false；再 `Tick(0.2f, false)` → true。
  - `Tick_ReturnsFalseWhenCannotRun`：耗盡時 `Tick(0.1f, true)` 回傳 false，而且照常回復。
  - `PantDue_EveryOnePointTwoSecondsWhenLow`：Value 低於 0.25 時，累計 1.2 秒才回傳一次 true；Value ≥ 0.25 時永遠 false。
  - `Loudness_Pant`：0.2。
- [ ] **Step 2: 執行測試確認失敗**
- [ ] **Step 3: 實作**
  - `Stamina` 類別。
  - `EchoPlayer`：`running = Shift && Stamina.Tick(dt, Shift)`；`PantDue` 為 true 時在頭部位置發出 `Pant`；`ResetForNight` 時 `Stamina.Reset()`。
  - `Boulder`：顏色改用規格第 11 節的值；推的那面加三條寬 `Width*0.8`、高 0.08、深 0.05 的亮色橫條（沒有碰撞），掛在 body 底下跟著滑動。
  - `BlindGameLoop.OnGUI`：體力 < 1 時，在左下角畫長條（寬為螢幕的 18%）；不能跑時顯示紅色。
- [ ] **Step 4: 驗證**
  - `dotnet test tools/CoreTests` → 全過
  - `compile-check` → 0 錯誤
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): stamina for running, distinct boulder look`

### Task 1: 聲音、人數、巨石、死因、CSV

**Files:**
- Modify:
  - `Assets/Odyssey/Core/SoundEvent.cs`：`SoundKind` 新增 `Whimper, RockImpact, Drag, Lever, Clatter, Cheese, Wicker`；`SoundSource` 新增 `Crew`
  - `Assets/Odyssey/Core/SoundRules.cs`
  - `Assets/Odyssey/Core/CrewRoster.cs`
  - `Assets/Odyssey/Core/BoulderModel.cs`
  - `Assets/Odyssey/Core/FailReason.cs`、`FailReasonText.cs`
  - `Assets/Odyssey/Core/PlaytestCsv.cs`
- Test:
  - `SoundRulesTests.cs`、`BoulderDawnDecoyTests.cs`、`CaveLoopStateTests.cs`、`PlaytestCsvTests.cs`、`FailReasonTextTests.cs`（既有測試會自動涵蓋新的 `Crushed`）
  - 新增 `CrewRosterTests` 的案例

**Interfaces:**
- Produces:
  - `SoundRules.Loudness`：Whimper 0.2、RockImpact 0.8、Drag 0.25、Lever 0.5、Clatter 0.7、Cheese 0.4、Wicker 0.25
  - `SoundRules.Source`：Whimper → Crew、RockImpact → Cyclops，其餘新聲音 → Player
  - `SoundRules.CanHear`：`Cyclops` 和 `RockImpact` 都永遠回傳 false
  - `SoundRules.Create(SoundKind, Vector2, float time, IReadOnlyList<SoundEvent> recentBleats, float scale = 1f)`：聲量先乘 `scale`，再套用羊叫遮蔽
  - `CrewRoster.Lose()`：`Remaining` −1（最低到 0），`Night` 不變
  - `BoulderModel.Push(int steps)`：回傳實際前進格數，最多到 8；原本的 `Push()` 改呼叫 `Push(1) > 0`
  - `FailReason.Crushed` →「巨人朝聲音扔來的岩石砸中了你」
  - `PlaytestCsv`：
    - `Header = "time,night,crew,boulder,rescued,lost,phase,outcome,seconds"`
    - `Line(DateTime, int night, int crew, int boulder, int rescued, int lost, LoopPhase, string outcome, float seconds)`

- [ ] **Step 1: 寫失敗測試**
  - `Loudness_V2Kinds`：七個新數值。
  - `Source_WhimperIsCrew_RockIsCyclops`
  - `CanHear_RockImpactNeverHeard`
  - `Create_ScaleHalvesStep`：`Create(Step, 0, 0, null, 0.5f).Loudness == 0.075f`。
  - `Roster_Lose_KeepsNight`：Lose 兩次 → Remaining 10、Night 1；Lose 到 0 以下仍是 0。
  - `Loop_FailWithNoCrewLeft_Wipes`：Lose 12 次 → IntroDone → Fail → Wiped。
  - `Boulder_PushTwoAtSeven_AdvancesOne`：推 7 格後 `Push(2)` 回傳 1，Progress 為 8。
  - `Line_UsesInvariantFormat`：改成新欄位，`Line(..., 3, 10, 5, 2, 1, LoopPhase.Night, "Dawn", 12.34f)` 預期 `"2026-10-10 12:00:00,3,10,5,2,1,Night,Dawn,12.3"`。
- [ ] **Step 2: 執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗。
- [ ] **Step 3: 實作**
  也要更新 `BlindGameLoop.Log` 的呼叫：`rescued` 與 `lost` 先傳 0，Task 7 再接上。
- [ ] **Step 4: 驗證**
  - `dotnet test tools/CoreTests` → 全過
  - `compile-check` → 0 錯誤
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): new sound kinds, crew loss, multi-step push, crushed reason, csv columns`

### Task 2: 隊伍路線

**Files:**
- Create: `Assets/Odyssey/Core/FollowTrail.cs`
- Test: `Assets/Odyssey/Tests/Editor/FollowTrailTests.cs`

**Interfaces:**
- Produces: `sealed class FollowTrail`
  - 常數 `Spacing = 1f`
  - `FollowTrail(Vector2 start)`
  - `void Record(Vector2 leader)`：與上一筆相距 ≥ 0.1 m 才記錄
  - `Vector2 PositionAt(int index)`：第 index 位跟隨者（0 起算）的位置，在路線上距離玩家 `(index + 1) * Spacing` 處；路線長度不夠時停在路線起點
  - `void Reset(Vector2 start)`

- [ ] **Step 1: 寫失敗測試**
  - `StraightLine_SpacedOneMeter`：start (0,0)，依序記錄 (0,1)…(0,5) → `PositionAt(0) ≈ (0,4)`、`PositionAt(2) ≈ (0,2)`。
  - `ShortTrail_ClampsToStart`：只記錄到 (0,1) → `PositionAt(3) == (0,0)`。
  - `LeaderStandingStill_NoNaN`：同一點記錄 10 次 → `PositionAt(0) == start`，不是 NaN。
  - `Corner_FollowsPath`：(0,0)→(0,2)→(2,2) → `PositionAt(0) ≈ (1,2)`、`PositionAt(1) ≈ (0,2)`。
- [ ] **Step 2: 執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗。
- [ ] **Step 3: 實作**
  路線存成 List（最新的點在尾端），從尾端往回累積距離，在線段上內插。超過 `(人數上限 12 + 2) * Spacing` 的舊點可以刪掉。
- [ ] **Step 4: 驗證**
  `dotnet test tools/CoreTests` → 全過
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): follow trail for the crew line`

### Task 3: 巨人丟岩石與吃同伴

**Files:**
- Modify: `Assets/Odyssey/Core/CyclopsBrain.cs`
- Modify: `Assets/Odyssey/Echo/BlindCyclops.cs`：讓它能編譯就好（傳入 `rng.NextDouble` 與空的同伴清單），Task 7 再完整接上
- Test: `Assets/Odyssey/Tests/Editor/CyclopsBrainTests.cs`

**Interfaces:**
- Consumes: Task 1 的新聲音種類。
- Produces:
  - `enum CyclopsState { Listen, Investigate, Search, Guard, Throw, Eat }`
  - 新常數：`ThrowMinDistance = 8f`、`ThrowChance = 0.35f`、`ThrowCooldown = 10f`、`WindupSeconds = 1.2f`、`FlightSeconds = 1f`、`ImpactRadius = 1.5f`、`Scatter = 1f`、`EatSeconds = 5f`
  - 建構子：`CyclopsBrain(Vector2 start, DecoyMemory memory, Func<double> roll)`
  - `readonly struct CyclopsTick { FailReason Player; int EatenCrew; bool RockReleased; Vector2 RockTarget; }`
    - `EatenCrew`：沒吃人時為 −1
    - `RockReleased`：蓄力結束、岩石出手的那一幀為 true
  - `CyclopsTick Tick(float dt, Vector2 player, IReadOnlyList<Vector2> crew)`
  - `static bool RockHits(Vector2 landing, Vector2 p)`：距離 ≤ 1.5
  - `float ThrowCooldownLeft`

**規則**
- **Hear 擲骰**：聲音不是 Boulder、距離 > 8 m、冷卻為 0，且 `roll() < 0.35`：
  - 進入 Throw，記下目標＝聲音位置 + (`roll()*2-1`, `roll()*2-1`) × `Scatter`
  - 冷卻設為 10 秒
  - **每次 Hear 都要消耗擲骰**；守石時，原本因為超出 4 m 被忽略的聲音也要擲骰
  - 石子與羊叫若沒有觸發丟擲，照舊引開他
- **Throw**：原地不動，忽略 Boulder 以外的聲音；滿 1.2 秒時，回傳 `RockReleased = true` 與目標，然後回到 Listen（守石狀態保留）。
- **Eat**：原地不動 5 秒，忽略 Boulder 以外的聲音，結束回到 Listen（守石狀態保留）。
- **Boulder 聲音**：在 Throw 或 Eat 時也會立刻轉為 Guard。
- **Tick 判斷順序**：
  1. 玩家在 1 m 內 → Bumped
  2. 移動
  3. Search 時玩家在 2 m 內 → Touched
  4. 否則，任一同伴在 1 m 內（任何狀態）或在 2 m 內（Search 時）→ 回傳 `EatenCrew = index`，進入 Eat
- **冷卻**：每次 Tick 遞減，最低 0。
- **實測回饋**（規格第 11 節）：
  - `SearchSeconds = 2f`、`GuardSearchSeconds = 4f`
  - `HoldSeconds = 15f`：守著巨石超過 15 秒，`HoldingBoulder` 變成 false
  - `WanderAfter = 5f`、`WanderRadius = 6f`：Listen（未守石）超過 5 秒 → 以 `roll()` 選 6 m 內一點，用走路速度過去；到了直接 Listen，不摸索
  - 遊走中聽到聲音，照一般規則處理

（以上也要補測試：`Search_EndsAfterTwoSeconds`、`GuardSearch_FourSeconds`、`Holding_ReleasesAfterFifteenSeconds`、`Listen_WandersAfterFiveSeconds_NoSearchOnArrival`；並調整既有測試的秒數。）

- [ ] **Step 1: 寫失敗測試**
  - 先把既有測試改成 `new CyclopsBrain(Vector2.Zero, memory, () => 0.99)`（永遠不丟），`Tick` 加上空的同伴清單，斷言改讀 `.Player`。
  - 新增測試：

    | 測試 | 情境 | 預期 |
    |---|---|---|
    | `FarSound_LowRoll_Throws` | roll 依序 0.0, 0.5, 0.5；拍手在 (9,0) | State=Throw；`Tick(1.2f)` 回傳 RockReleased、RockTarget ≈ (9,0)；之後 State=Listen、Position 不變 |
    | `FarSound_HighRoll_Walks` | roll 0.99 | Investigate |
    | `NearSound_NeverThrows` | roll 0.0；拍手在 (7,0) | Investigate |
    | `Throw_Cooldown` | 丟完立刻再聽到遠處聲音（roll 0.0） | Investigate，不是 Throw |
    | `Holding_FarClap_CanThrow` | 守石後（roll 0.99），改成 roll 0.0；拍手在距離巨石 9 m 處 | Throw |
    | `Search_TouchesPlayerBeforeCrew` | 同伴和玩家都在 2 m 內 | Player=Touched、EatenCrew=−1 |
    | `Search_EatsCrewInRange` | 同伴在 (1,1.5)，玩家在遠處 | EatenCrew=0、State=Eat；5.1 秒後 State=Listen |
    | `BumpCrew_AnyState` | Listen，同伴在 (0.5,0) | EatenCrew=0 |
    | `Eat_BoulderInterruptsToGuard` | 吃的時候聽到 Boulder | Guard |
    | `Throw_BoulderInterruptsToGuard` | 蓄力時聽到 Boulder | Guard |
    | `RockHits_Radius` | (1.5,0) / (1.6,0) | true / false |
- [ ] **Step 2: 執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗或斷言失敗。
- [ ] **Step 3: 實作，並修改 `BlindCyclops` 讓它可編譯**
- [ ] **Step 4: 驗證**
  - `dotnet test tools/CoreTests` → 全過
  - `compile-check` → 0 錯誤
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): cyclops throws rocks at far sounds and eats crew he finds`

### Task 4: 同伴

**Files:**
- Modify:
  - `Assets/Odyssey/Echo/SoundBus.cs`：`Emit(SoundKind kind, Vector3 worldPos, float scale = 1f)`
  - `Assets/Odyssey/Echo/EchoField.cs`：`ColorFor(Crew)` = (0.55, 0.9, 0.6)
- Create: `Assets/Odyssey/Echo/CrewMember.cs`、`CrewLine.cs`

**Interfaces:**
- Consumes: Task 2 的 `FollowTrail`；Task 1 的 `Whimper`、`Step`、`Run`。
- Produces:
  - `class CrewMember : MonoBehaviour`
    - `enum Mode { Hiding, Following, Crouching }`
    - `Mode Current`
    - `void Init(Vector3 hidePos, int seed)`：基本形狀組成蹲著的人形，回聲材質 (0.5, 0.45, 0.4)
    - `void Follow()`、`void Crouch()`、`void Kill()`（播放短暫倒地後 Destroy）
    - Hiding 時每 15～30 秒 `SoundBus.Emit(Whimper)`
  - `class CrewLine : MonoBehaviour`
    - `void Init(Transform player, Func<Vector3, float> stepScale)`：`stepScale` 回傳該位置的腳步倍率（羊圈為 0.5）
    - `IReadOnlyList<CrewMember> Members`
    - `IReadOnlyList<CrewMember> Followers`
    - `void Spawn(int count, IReadOnlyList<Vector3> spots, int seed)`：清掉舊的再產生
    - `CrewMember NearestHiding(Vector3 p, float reach)`
    - `void Recruit(CrewMember m)`
    - `void ToggleCrouch()`
    - `void Remove(CrewMember m)`
    - `bool Running`：玩家是否在跑，由 `EchoPlayer` 設定
    - `List<Vector2> Positions()`：給巨人大腦用的平面位置清單，順序與 `Members` 相同
  - **CrewLine.Update**：
    - 玩家位置寫入 `FollowTrail`。
    - 未蹲下的跟隨者移到 `PositionAt(i)`（貼地）。
    - 有移動的跟隨者，依跑或走的步頻發出 `Step`／`Run`，帶上 `stepScale`。

- [ ] **Step 1: 實作四個檔案的修改與新增**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): hiding, whimpering, following crew`

### Task 5: 橄欖木樁與玩家操作

**Files:**
- Create: `Assets/Odyssey/Echo/OliveStake.cs`
- Modify: `Assets/Odyssey/Echo/EchoPlayer.cs`

**Interfaces:**
- Consumes: `CrewLine`（Task 4）、`BoulderModel.Push(int)`（Task 1）。
- Produces:
  - `class OliveStake : MonoBehaviour`
    - `void Init()`：細長圓柱，長 2 m，回聲材質 (0.35, 0.26, 0.15)
    - `void PlaceAt(Vector3 groundPos)`、`void AttachTo(Transform hand)`
    - `bool Carried`
  - `EchoPlayer`：
    - `Init(FirstPersonPlayer body, Boulder boulder, IReadOnlyList<StonePickup> pickups, Func<bool> boulderOpen, OliveStake stake, CrewLine crew, Func<Vector3, float> stepScale)`
    - `event Action<int> PushCompleted`（參數＝要推的格數：徒手 1、撬 2）
    - 常數 `LeverHoldSeconds = 1.5f`、`StakeReach = 1.2f`、`CrewReach = 1.2f`
  - **E 的優先順序**（照規格第 6 節）：
    1. 縫已開且在縫前 → 鑽出去
    2. 沒拿木樁且在木樁 1.2 m 內（按下）→ 撿起
    3. 在躲藏同伴 1.2 m 內（按下）→ 帶他走
    4. 在巨石前按住 → 推（拿木樁時按 1.5 秒＝撬，觸發 `PushCompleted(2)`，並在玩家位置發出 `Lever`）
  - **其他按鍵**：F → `crew.ToggleCrouch()`；G → 放下木樁（`PlaceAt` 腳下）。
  - **拿著木樁時**：腳步改發 `Drag`；Shift 無效；左鍵不丟石子。
  - 所有腳步都乘上 `stepScale(transform.position)`。
  - 每幀設定 `crew.Running`。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): olive stake lever, crew controls, step scale`

### Task 6: 雜物

**Files:**
- Create: `Assets/Odyssey/Echo/MilkPail.cs`、`CheeseRack.cs`、`WickerPen.cs`
- Modify: `Assets/Odyssey/Echo/BlindCaveBuilder.cs`、`ThrownStone.cs`

**Interfaces:**
- Produces:
  - `BlindCaveLayout` 新增 `MilkPail[] Pails; CheeseRack Rack; WickerPen[] Pens; Vector3[] CrewSpots; Vector3 StakeSpot`
    - 位置用 `seed` 產生，條件照規格：同伴點至少 12 個、彼此 ≥ 3 m、離巨石 ≥ 5 m；木樁離巨石 ≥ 6 m；羊圈 2 塊不重疊、離巨石 ≥ 5 m
    - 原有的 `MilkPail` 圓柱改成掛 `MilkPail` 元件；另外新增 2 個
    - 原有的乳酪架改成掛 `CheeseRack` 元件
  - `class MilkPail : MonoBehaviour`
    - `void Init(Vector3 pos)`
    - `bool Fallen`
    - `void Knock()`：未倒時才倒下，發出 `Clatter`
    - `void Stand()`
    - 有 `CapsuleCollider`，讓石子打得到
  - `class CheeseRack : MonoBehaviour`
    - `void Init(Vector3 pos)`
    - `void Brush()`：3 秒冷卻，發出 `Cheese`
  - `class WickerPen : MonoBehaviour`
    - `void Init(Vector3 center, Vector2 size)`：四邊低矮柳條框，高 0.5 m、沒有碰撞，回聲材質 (0.5, 0.4, 0.25)；地面一片稍亮的乾草
    - `bool Contains(Vector3 p)`
  - `static float BlindCaveBuilder.StepScale(BlindCaveLayout layout, Vector3 p)`：任一羊圈包含 p 時回傳 0.5，否則 1
  - **觸發由 `BlindGameLoop` 每幀檢查**（Task 7）：
    - 玩家或跟隨者移動中且在奶桶 0.6 m 內 → `Knock`
    - 玩家在乳酪架 0.8 m 內 → `Brush`
    - 玩家跨越羊圈邊界 → `Wicker`
  - `ThrownStone.OnCollisionEnter`：碰到的物件上有 `MilkPail` 時也呼叫 `Knock()`

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  `compile-check` → 0 錯誤
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): milk pails, cheese rack, wicker pens`

### Task 7: 接上一夜的流程

**Files:**
- Create: `Assets/Odyssey/Echo/ThrownRock.cs`
- Modify: `Assets/Odyssey/Echo/BlindCyclops.cs`、`BlindGameLoop.cs`

**Interfaces:**
- Consumes: Task 1～6 的全部介面。
- Produces:
  - `class ThrownRock : MonoBehaviour`
    - `void Launch(Vector3 from, Vector3 to, float seconds, Action<Vector3> landed)`：沿拋物線飛行 1 秒，落地時回呼
  - `BlindCyclops`：
    - `Init(BlindCaveLayout, DecoyMemory, Transform player, Func<IReadOnlyList<Vector2>> crewPositions)`
    - `event Action<int> AteCrew`
    - `event Action<Vector3> RockLanded`
    - Throw 開始時 `Roar()` 並發出巨人聲音
    - `RockReleased` 時生成 `ThrownRock`（從頭頂丟到目標）；落地發出 `RockImpact`，並觸發 `RockLanded`
    - Eat 時每 0.5 秒發出巨人聲音
  - `BlindGameLoop`：
    - 公開 `CrewLine Crew`、`OliveStake Stake`、`int RescuedLastEscape`、`int LostTonight`
    - `ResetNight`：
      - `Crew.Spawn(Roster.Remaining, Layout.CrewSpots, seed)`
      - 木樁放回 `StakeSpot`
      - 奶桶扶正
    - `AteCrew(i)`：
      - `Crew.Remove(Crew.Members[i])`（`Kill`）
      - `Roster.Lose()`、`LostTonight++`
      - 死亡紀錄加一行「第 N 夜・一名同伴被巨人吃掉了」
    - `RockLanded(p)`：
      - 玩家在 1.5 m 內 → `Fail(Crushed)`
      - 範圍內的同伴 → 移除，並 `Roster.Lose()`、`LostTonight++`，死亡紀錄加一行「第 N 夜・一名同伴被岩石砸死了」
    - 每幀觸發雜物（規則見 Task 6）
    - `PushCompleted(steps)`：`BoulderProgress.Push(steps)`，大於 0 時才 `SetProgress` 並發出 `Boulder`
    - `Escape`：
      - `RescuedLastEscape` = 縫 3 m 內的跟隨者人數
      - 文字：「你逃出去了。」／「帶出 {X} 名同伴。但你對著巨人喊出了自己的名字。」
    - CSV 傳入 `rescued` 與 `lost`
    - 操作提示改成規格第 6 節的文字

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): wire crew, rocks, stake and clutter into the night loop`

### Task 8: 除錯面板

**Files:**
- Modify: `Assets/Odyssey/Echo/DebugPanel.cs`

**內容**（規格第 8 節）
- 小地圖：
  - 同伴：淡綠點；跟隨中加白框；蹲下變暗
  - 木樁：棕色細條
  - 奶桶：倒了變暗
  - 羊圈：框
  - 飛行中的岩石落點：紅叉。`BlindCyclops` 公開 `Vector3? IncomingRock`
- 文字：「同伴：跟隨 X／躲著 Y」
- 長條：「岩石」＝ 1 − `ThrowCooldownLeft / ThrowCooldown`

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  `compile-check` → 0 錯誤
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): debug panel shows crew, stake, clutter and rocks`

### Task 9: 收尾

- [ ] **Step 1: 對照規格**
  規格 v2 第 2～9 節逐條對照實作，數值完全一致。
- [ ] **Step 2: 審查**
  找一個新的審查者審查 `00b4e11..HEAD`，一次修完 Critical 與 Important 的問題（每個修正都先寫失敗測試）。
- [ ] **Step 3: 回報使用者**
  列出還沒實測的項目。
