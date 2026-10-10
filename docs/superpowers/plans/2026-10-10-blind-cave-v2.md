# 雙盲洞穴 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在雙盲洞穴加入同伴（找、帶、被吃）、巨人丟岩石、會滑回的巨石與楔子、橄欖木樁、剛體雜物（石子、奶桶、乳酪）、柳條羊圈，並讓守石的巨人接著追巨石附近的聲音。

**Architecture:** 新規則全部放進 `Odyssey.Core`，先寫 NUnit 測試：聲音種類、`CrewRoster.Lose`、`BoulderSlide`（連續開口、楔子、回滑）、`ImpactSound`（撞擊聲量）、`FollowTrail`、`CyclopsBrain`（丟岩石、吃同伴、守石追聲、拔楔子）。Unity 層在 `Assets/Odyssey/Echo/` 新增同伴、木樁、剛體雜物、岩石元件，`BlindGameLoop` 負責串接。

**Tech Stack:** Unity 6000.3.14f1、URP 17.3、Input System、C#、NUnit（`dotnet test tools/CoreTests`）。

**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md`（第 13 節優先於第 4、5 節被取代的部分；未提到的規則沿用 `2026-10-10-blind-cave-design.md`）

## Global Constraints

- 內容只能出自《奧德賽》；玩家可見文字一律繁體中文。
- 只 `git add` 明確路徑。不要 stage：
  - `Assets/Editor*`、`Assets/Settings/PC_RPAsset.asset`、`ProjectSettings/*`
  - `Assets/Scenes/*`、`Assets/UI/LoopFail/LoopFailScreen.prefab`
  - `docs/design/`、`handoff-odyssey-cyclops-cave.md`
- `Odyssey.Core` 不引用 UnityEngine；平面座標用 `System.Numerics.Vector2`（X＝x，Y＝z）。
- 每個任務結束：`dotnet test tools/CoreTests` 全過，`powershell -ExecutionPolicy Bypass -File tools/compile-check.ps1` 0 錯誤。
- 新增的 `.cs` 若 Unity 沒有自動產生 `.meta`，自行產生（`fileFormatVersion: 2` 加上新 GUID）並一起提交。
- 檔案是 CRLF：用 Edit 工具改，不要用 perl／sed 跨行取代。
- 提交訊息結尾：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **同一次摸索同時碰到玩家和同伴**：算玩家被抓，同伴不額外扣。測試見 Task 5。
2. **巨人在吃同伴或蓄力丟岩石時，聽到巨石的聲音**：要立刻轉為守石，不能卡在吃或丟的狀態。測試見 Task 5。
3. **巨石開口的邊界**：開口永遠在「最外面的楔子」與 1.44 之間；全開時塞楔子、沒有石子楔子時拔、只有木樁時巨人拔，都不能讓開口跳動或丟例外。測試見 Task 2。
4. **巨人拔楔子時玩家正在推**：拔完巨石照樣往回滑到下一個楔子，玩家的推力在滑回期間無效，滑完才恢復。測試見 Task 2。
5. **全部同伴都被吃光後才逃出**：結局顯示「帶出 0 名同伴」，不丟例外；這一夜之後再被抓就是全滅。由 Task 9 的 `BlindGameLoop.Escape` 處理，`CaveLoopState` 測試確認 `Remaining == 0` 時 `Fail` 會進入 Wiped（Task 1）。

---

### Task 0: 實測回饋：巨石外觀、體力 ✅ 完成（`4102bb8`）

`Stamina`（`DrainPerSec 0.25`、`RegenPerSec 0.15`、`ResumeAt 0.3`、`PantBelow 0.25`、`PantSeconds 1.2`；`bool Tick(float dt, bool wantRun)`、`bool PantDue(float dt)`、`CanRun`、`Value`、`Reset()`）、`SoundKind.Pant` 0.2、`EchoPlayer.Stamina`、左下角體力條、赭黃巨石與刻痕。

### Task 1: 聲音、人數、死因、CSV

**Files:**
- Modify:
  - `Assets/Odyssey/Core/SoundEvent.cs`：`SoundKind` 新增 `Whimper, RockImpact, Drag, Clatter, Cheese, Wicker, Grind, Slip, Wedge`；`SoundSource` 新增 `Crew`
  - `Assets/Odyssey/Core/SoundRules.cs`
  - `Assets/Odyssey/Core/CrewRoster.cs`
  - `Assets/Odyssey/Core/FailReason.cs`、`FailReasonText.cs`
  - `Assets/Odyssey/Core/PlaytestCsv.cs`
  - `Assets/Odyssey/Echo/SoundBus.cs`
- Test:
  - `SoundRulesTests.cs`、`CaveLoopStateTests.cs`、`PlaytestCsvTests.cs`、`FailReasonTextTests.cs`（既有測試會自動涵蓋新的 `Crushed`）
  - 新增 `CrewRosterTests` 的案例

**Interfaces:**
- Produces:
  - `SoundRules.Loudness`：Whimper 0.2、RockImpact 0.8、Drag 0.25、Clatter 0.7、Cheese 0.4、Wicker 0.25、Grind 0.3、Slip 0.15、Wedge 0.25
  - `SoundRules.Source`：Whimper → Crew、RockImpact → Cyclops，其餘新聲音 → Player
  - `SoundRules.CanHear`：`Cyclops` 和 `RockImpact` 都永遠回傳 false
  - `SoundRules.IsBoulder(SoundKind)`：Boulder、Grind、Slip 為 true
  - `SoundRules.Create(SoundKind, Vector2, float time, IReadOnlyList<SoundEvent> recentBleats, float scale = 1f)`：聲量先乘 `scale`，再套用羊叫遮蔽
  - `SoundBus.Emit(SoundKind kind, Vector3 worldPos, float scale = 1f)`
  - `CrewRoster.Lose()`：`Remaining` −1（最低到 0），`Night` 不變
  - `FailReason.Crushed` →「巨人朝聲音扔來的岩石砸中了你」
  - `PlaytestCsv`：
    - `Header = "time,night,crew,boulder,rescued,lost,phase,outcome,seconds"`
    - `Line(DateTime, int night, int crew, int boulderCm, int rescued, int lost, LoopPhase, string outcome, float seconds)`

- [ ] **Step 1: 寫失敗測試**
  - `Loudness_V2Kinds`：九個新數值。
  - `Source_WhimperIsCrew_RockIsCyclops`
  - `CanHear_RockImpactNeverHeard`
  - `IsBoulder_BoulderGrindSlipOnly`：Boulder／Grind／Slip true；Wedge／Stone／Clap false。
  - `Create_ScaleHalvesStep`：`Create(Step, 0, 0, null, 0.5f).Loudness == 0.075f`。
  - `Roster_Lose_KeepsNight`：Lose 兩次 → Remaining 10、Night 1；Lose 到 0 以下仍是 0。
  - `Loop_FailWithNoCrewLeft_Wipes`：Lose 12 次 → IntroDone → Fail → Wiped。
  - `Line_UsesInvariantFormat`：改成新欄位，`Line(..., 3, 10, 72, 2, 1, LoopPhase.Night, "Dawn", 12.34f)` 預期 `"2026-10-10 12:00:00,3,10,72,2,1,Night,Dawn,12.3"`。
- [ ] **Step 2: 執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗。
- [ ] **Step 3: 實作**
  `BlindGameLoop.Log` 的呼叫：`boulderCm` 暫用 `Progress * 18`，`rescued` 與 `lost` 先傳 0，Task 9 再接上。
- [ ] **Step 4: 驗證**
  - `dotnet test tools/CoreTests` → 全過
  - `compile-check` → 0 錯誤
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): new sound kinds, crew loss, crushed reason, csv columns`

### Task 2: 會滑回的巨石（`BoulderSlide`）

**Files:**
- Create: `Assets/Odyssey/Core/BoulderSlide.cs`
- Test: `Assets/Odyssey/Tests/Editor/BoulderSlideTests.cs`
- `BoulderModel.cs` 與它的測試在 Task 8 換掉 Unity 端引用後刪除。

**Interfaces:**
- Produces:
  - `enum PushMode { None, Light, Heavy }`
  - `readonly struct BoulderNoise { bool Grind; bool Heavy; bool Slip; }`：這一幀該發的聲音
  - `sealed class BoulderSlide`
    - 常數：`FullOpen = 1.44f`、`LightSpeed = 0.06f`、`HeavySpeed = 0.18f`、`RampSeconds = 0.5f`、`SlipDelay = 1f`、`SlipSpeed = 0.03f`、`PullBackSpeed = 0.3f`、`StakeMultiplier = 1.5f`、`PushNoiseSeconds = 0.5f`、`SlipNoiseSeconds = 1f`
    - 屬性：`float Opening`、`float MaxOpening`（這一夜最大值，給 CSV）、`bool IsOpen`（≥ FullOpen）、`IReadOnlyList<float> StoneWedges`（由小到大）、`float? StakeWedge`、`float Floor`（所有楔子的最大值，沒有為 0）、`bool PullingBack`
    - `BoulderNoise Tick(float dt, PushMode mode, bool withStake)`
    - `void AddStoneWedge()`：在目前開口加一顆
    - `bool RemoveOutermostStoneWedge()`：玩家拔回；沒有石子楔子回傳 false
    - `bool GiantPull()`：拔掉位置最大的石子楔子（木樁不算），開始以 `PullBackSpeed` 滑回新的 `Floor`；沒有石子楔子回傳 false
    - `void PlantStake()`、`bool RemoveStake()`
    - `void Reset()`：開口、最大值、楔子、計時全部歸零

**規則**
- 推：`mode != None` 且不在 `PullingBack` 時，速度 = 基本速度（Light 0.06／Heavy 0.18）×（木樁 1.5）× min(1, 連續推的秒數 ÷ 0.5)；開口不超過 1.44。`mode` 變成 None 時連續推的秒數歸零。起步加速要在 `Tick` 內精確積分（一次 `Tick(0.5f)` 與五次 `Tick(0.1f)` 結果相同）；計時器（推的聲音、放手、回滑聲）也都用累計，不依賴幀長。
- 推的聲音：推的期間每累計 0.5 秒回傳一次 `Grind`（Light）或 `Heavy`（Heavy）。已全開時不發。
- 回滑：`mode == None` 累計滿 1 秒、且 `Opening > Floor` 時，以 0.03 m/s 滑向 `Floor`，每累計 1 秒回傳一次 `Slip`。
- 巨人拔楔子：`PullingBack` 期間無視推力，以 0.3 m/s 滑到 `Floor` 後結束，**不回傳 `Slip`**（Unity 端改發巨人聲音）。
- 移除楔子（玩家拔、拔木樁）之後，照一般回滑規則慢慢滑回。

- [ ] **Step 1: 寫失敗測試**

  | 測試 | 情境 | 預期 |
  |---|---|---|
  | `Light_RampsThenSixCmPerSecond` | `Tick(0.5f, Light)` 再 `Tick(1f, Light)` | Opening ≈ 0.015 + 0.06 = 0.075 |
  | `Heavy_FullSpeedAfterRamp` | Heavy 推 0.5 秒後再推 1 秒 | 增加量 ≈ 0.18 |
  | `Stake_MultipliesSpeed` | 輕推 0.5 秒後帶木樁再推 1 秒 | 增加量 ≈ 0.09 |
  | `Opening_CapsAtFullOpen` | Heavy 推 20 秒 | Opening == 1.44、IsOpen |
  | `PushNoise_EveryHalfSecond` | Light 每次 `Tick(0.1f)` 共 10 次 | `Grind` 為 true 剛好 2 次 |
  | `Ramp_SameForOneOrManyTicks` | A：`Tick(0.5f, Light)`；B：五次 `Tick(0.1f, Light)` | 兩者 Opening 相差 < 1e-5 |
  | `Release_SlipsAfterOneSecond` | 推到 0.5，放手 `Tick(0.9f, None)` | Opening 不變；再 `Tick(1.1f, None)`（回滑剛好 1 秒）→ 減少 ≈ 0.03，且有一次 `Slip` |
  | `Slip_StopsAtWedge` | 推到 0.5，`AddStoneWedge()`，再推到 0.8，放手 30 秒 | Opening == 0.5 |
  | `PlayerPull_RemovesOutermost` | 在 0.3、0.6 各塞一顆 | `RemoveOutermostStoneWedge()` true，StoneWedges == [0.3] |
  | `PlayerPull_NoWedge_ReturnsFalse` | 沒有楔子 | false，Opening 不變 |
  | `GiantPull_SlidesBackFastAndSilently` | 0.3、0.6 各一顆，開口 0.6 | `GiantPull()` true；`Tick(0.5f, Heavy)` 後 Opening ≈ 0.45、`PullingBack`、沒有任何聲音旗標；再 `Tick(1f, None)` 後 Opening == 0.3、`!PullingBack` |
  | `GiantPull_IgnoresStake` | 只有木樁在 0.5 | false，`StakeWedge == 0.5` |
  | `GiantPull_StakeBelowStone_StopsAtStake` | 木樁 0.4、石子 0.7 | `GiantPull()` 後滑到 0.4 |
  | `Wedge_AtFullOpen_NoJump` | 推到全開後塞楔子 | Opening == 1.44、Floor == 1.44 |
  | `MaxOpening_RemembersPeak` | 推到 0.6 後滑回 | MaxOpening == 0.6 |
  | `Reset_ClearsEverything` | 有楔子與木樁 | Opening 0、MaxOpening 0、沒有楔子、StakeWedge null |
- [ ] **Step 2: 執行測試確認失敗**
  執行：`dotnet test tools/CoreTests`
  預期：編譯失敗。
- [ ] **Step 3: 實作 `BoulderSlide`**
- [ ] **Step 4: 驗證**
  `dotnet test tools/CoreTests` → 全過
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): sliding boulder with wedges and slip-back`

### Task 3: 撞擊聲（`ImpactSound`）

**Files:**
- Create: `Assets/Odyssey/Core/ImpactSound.cs`
- Test: `Assets/Odyssey/Tests/Editor/ImpactSoundTests.cs`

**Interfaces:**
- Produces:
  - `static class ImpactSound`
    - 常數：`MinSpeed = 1.5f`、`ReferenceSpeed = 9f`、`MinLoudness = 0.1f`、`Cooldown = 0.3f`
    - `static float Loudness(float maxLoudness, float speed)`：速度 < 1.5 回傳 0；否則 clamp(max × speed ÷ 9, 0.1, max)
  - `sealed class ImpactGate`：`bool TryFire(float time)`，距上次成功 < 0.3 秒回傳 false

- [ ] **Step 1: 寫失敗測試**
  - `BelowThreshold_Silent`：(0.6, 1.4) → 0
  - `Proportional`：(0.6, 4.5) → 0.3
  - `ClampsToMax`：(0.6, 20) → 0.6
  - `ClampsToMin`：(0.25, 1.5) → 0.1
  - `Gate_CooldownThreeTenths`：TryFire(0) true、(0.2) false、(0.31) true
- [ ] **Step 2: 執行測試確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：`dotnet test tools/CoreTests` → 全過
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): impact loudness rule for physics props`

### Task 4: 隊伍路線

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
- [ ] **Step 3: 實作**
  路線存成 List（最新的點在尾端），從尾端往回累積距離，在線段上內插。超過 `(人數上限 12 + 2) * Spacing` 的舊點可以刪掉。
- [ ] **Step 4: 驗證**：`dotnet test tools/CoreTests` → 全過
- [ ] **Step 5: 提交**
  訊息：`feat(blind2): follow trail for the crew line`

### Task 5: 巨人：守石追聲、拔楔子、丟岩石、吃同伴

**Files:**
- Modify: `Assets/Odyssey/Core/CyclopsBrain.cs`
- Modify: `Assets/Odyssey/Echo/BlindCyclops.cs`：讓它能編譯就好（傳入 `rng.NextDouble` 與空的同伴清單），Task 9 再完整接上
- Test: `Assets/Odyssey/Tests/Editor/CyclopsBrainTests.cs`

**Interfaces:**
- Consumes: Task 1 的新聲音種類與 `SoundRules.IsBoulder`。
- Produces:
  - `enum CyclopsState { Listen, Investigate, Search, Guard, Throw, Eat }`
  - 常數：
    - 丟岩石：`ThrowMinDistance = 8f`、`ThrowChance = 0.35f`、`ThrowCooldown = 10f`、`WindupSeconds = 1.2f`、`FlightSeconds = 1f`、`ImpactRadius = 1.5f`、`Scatter = 1f`
    - `EatSeconds = 5f`
    - 實測回饋：`SearchSeconds = 2f`、`GuardSearchSeconds = 4f`、`HoldSeconds = 15f`、`WanderAfter = 5f`、`WanderRadius = 6f`
  - 建構子：`CyclopsBrain(Vector2 start, DecoyMemory memory, Func<double> roll)`
  - `readonly struct CyclopsTick { FailReason Player; int EatenCrew; bool RockReleased; Vector2 RockTarget; bool PullWedge; }`
    - `EatenCrew`：沒吃人時為 −1
    - `RockReleased`：蓄力結束、岩石出手的那一幀為 true
    - `PullWedge`：守石摸索完整結束的那一幀為 true
  - `CyclopsTick Tick(float dt, Vector2 player, IReadOnlyList<Vector2> crew)`
  - `static bool RockHits(Vector2 landing, Vector2 p)`：距離 ≤ 1.5
  - `float ThrowCooldownLeft`

**規則**
- **守石（規格第 13 節 C）**：
  - `IsBoulder` 的聲音 → Guard，跑向聲音位置；記下 `holdPoint`。
  - 處於守石（Guard 跑動中、守石摸索中、或 `HoldingBoulder`）時：
    - 石子或羊叫（任何距離）→ 不再守石，照一般規則追過去。
    - 其他聲音在 `holdPoint` 4 m 內 → 改追那個聲音（走 3.5 m/s），摸索 2 秒後走回 `holdPoint`，到了 Listen 並維持守石；**這次守石摸索不算完成，不拔楔子**。
    - 其他聲音在 4 m 外 → 擲骰丟岩石（見下），沒丟就不理。
  - 守石摸索 4 秒完整結束 → 回傳 `PullWedge = true`（只一次），`HoldingBoulder = true`。
  - `HoldingBoulder` 從守石摸索結束起計時，滿 15 秒（追附近聲音的時間也算）→ 不再守石。
- **Hear 擲骰**：聲音不是巨石的聲音、距離 > 8 m、冷卻為 0，且 `roll() < 0.35`：
  - 進入 Throw，目標＝聲音位置 + (`roll()*2-1`, `roll()*2-1`) × `Scatter`
  - 冷卻設為 10 秒
  - **每次符合距離與冷卻條件的 Hear 都要消耗一次擲骰**
  - 石子與羊叫若沒有觸發丟擲，照舊引開他
- **Throw**：原地不動，忽略巨石以外的聲音；滿 1.2 秒時回傳 `RockReleased = true` 與目標，然後回到 Listen（守石狀態保留）。
- **Eat**：原地不動 5 秒，忽略巨石以外的聲音，結束回到 Listen（守石狀態保留）。
- **巨石的聲音**：在 Throw 或 Eat 時也會立刻轉為 Guard。
- **Tick 判斷順序**：
  1. 玩家在 1 m 內 → Bumped
  2. 移動
  3. Search 時玩家在 2 m 內 → Touched
  4. 否則，任一同伴在 1 m 內（任何狀態）或在 2 m 內（Search 時）→ 回傳 `EatenCrew = index`，進入 Eat
- **冷卻**：每次 Tick 遞減，最低 0。
- **遊走**：Listen（未守石）超過 5 秒 → 以 `roll()` 選 6 m 內一點，用走路速度過去；到了直接 Listen，不摸索。遊走中聽到聲音照一般規則處理。

- [ ] **Step 1: 寫失敗測試**
  - 先把既有測試改成 `new CyclopsBrain(Vector2.Zero, memory, () => 0.99)`（永遠不丟），`Tick` 加上空的同伴清單，斷言改讀 `.Player`，秒數改成 2／4。
  - 新增測試（巨石聲音一律放在 (10,0)，巨人從原點出發）：

    | 測試 | 情境 | 預期 |
    |---|---|---|
    | `GuardRun_NearSound_Chases` | 聽到 Boulder，跑 0.5 秒後聽到拍手在 (12,0) | State=Investigate、Target=(12,0) |
    | `GuardRun_NearSound_ReturnsToBoulderAfterSearch` | 承上，跑到 (12,0)、摸索 2 秒 | 走回 (10,0)，到了 State=Listen、`HoldingBoulder`；過程中 `PullWedge` 從未為 true |
    | `GuardSearch_NearSound_ChasesWithoutPull` | 到巨石摸索 1 秒時聽到 (11,0) 的腳步 | Investigate；之後整段 `PullWedge` 從未為 true |
    | `GuardRun_FarSound_Ignored` | 跑向巨石途中聽到 (20,0) 的拍手（roll 0.99） | 仍是 Guard、Target=(10,0) |
    | `GuardRun_Stone_Lures` | 跑向巨石途中聽到 (20,0) 的石子 | Investigate、Target=(20,0)、不再守石 |
    | `GuardSearch_Complete_PullsWedgeOnce` | 到巨石摸索 4 秒 | 剛好一幀 `PullWedge` 為 true；`HoldingBoulder` |
    | `Holding_ReleasesAfterFifteenSeconds` | 守石摸索結束後 Listen 15.1 秒 | `HoldingBoulder` false |
    | `Search_EndsAfterTwoSeconds` | 一般摸索 | 2 秒後 Listen |
    | `Listen_WandersAfterFiveSeconds_NoSearchOnArrival` | 未守石，Listen 5.1 秒 | Investigate 到 6 m 內一點；到了 State=Listen，不是 Search |
    | `FarSound_LowRoll_Throws` | roll 依序 0.0, 0.5, 0.5；拍手在 (9,0) | State=Throw；`Tick(1.2f)` 回傳 RockReleased、RockTarget ≈ (9,0)；之後 State=Listen、Position 不變 |
    | `FarSound_HighRoll_Walks` | roll 0.99 | Investigate |
    | `NearSound_NeverThrows` | roll 0.0；拍手在 (7,0) | Investigate |
    | `Throw_Cooldown` | 丟完立刻再聽到遠處聲音（roll 0.0） | Investigate，不是 Throw |
    | `Holding_FarClap_CanThrow` | 守石後改成 roll 0.0；拍手在距離巨石 9 m 處 | Throw |
    | `Search_TouchesPlayerBeforeCrew` | 同伴和玩家都在 2 m 內 | Player=Touched、EatenCrew=−1 |
    | `Search_EatsCrewInRange` | 同伴在 (1,1.5)，玩家在遠處 | EatenCrew=0、State=Eat；5.1 秒後 State=Listen |
    | `BumpCrew_AnyState` | Listen，同伴在 (0.5,0) | EatenCrew=0 |
    | `Eat_BoulderInterruptsToGuard` | 吃的時候聽到 Grind | Guard |
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
  訊息：`feat(blind2): cyclops chases sounds near the boulder, pulls wedges, throws rocks, eats crew`

### Task 6: 同伴

**Files:**
- Modify: `Assets/Odyssey/Echo/EchoField.cs`：`ColorFor(Crew)` = (0.55, 0.9, 0.6)
- Create: `Assets/Odyssey/Echo/CrewMember.cs`、`CrewLine.cs`

**Interfaces:**
- Consumes: Task 4 的 `FollowTrail`；Task 1 的 `Whimper`、`Step`、`Run`、`SoundBus.Emit(..., scale)`。
- Produces:
  - `class CrewMember : MonoBehaviour`
    - `enum Mode { Hiding, Following, Crouching }`
    - `Mode Current`
    - `void Init(Vector3 hidePos, int seed)`：基本形狀組成蹲著的人形，回聲材質 (0.5, 0.45, 0.4)
    - `void Follow()`、`void Crouch()`、`void Kill()`（播放短暫倒地後 Destroy）
    - Hiding 時每 15～30 秒 `SoundBus.Emit(Whimper)`
  - `class CrewLine : MonoBehaviour`
    - `void Init(Transform player, Func<Vector3, float> stepScale)`：`stepScale` 回傳該位置的腳步倍率（羊圈為 0.5）
    - `IReadOnlyList<CrewMember> Members`、`IReadOnlyList<CrewMember> Followers`
    - `void Spawn(int count, IReadOnlyList<Vector3> spots, int seed)`：清掉舊的再產生
    - `CrewMember NearestHiding(Vector3 p, float reach)`
    - `void Recruit(CrewMember m)`、`void ToggleCrouch()`、`void Remove(CrewMember m)`
    - `bool Running`：玩家是否在跑，由 `EchoPlayer` 設定
    - `List<Vector2> Positions()`：給巨人大腦用的平面位置清單，順序與 `Members` 相同
  - **CrewLine.Update**：
    - 玩家位置寫入 `FollowTrail`。
    - 未蹲下的跟隨者移到 `PositionAt(i)`（貼地）。
    - 有移動的跟隨者，依跑或走的步頻發出 `Step`／`Run`，帶上 `stepScale`。

- [ ] **Step 1: 實作三個檔案的修改與新增**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): hiding, whimpering, following crew`

### Task 7: 剛體雜物與羊圈

**Files:**
- Create：
  - `Assets/Odyssey/Echo/ImpactEmitter.cs`
  - `Assets/Odyssey/Echo/LooseStone.cs`（取代 `ThrownStone.cs`，刪除舊檔與 `.meta`）
  - `Assets/Odyssey/Echo/MilkPail.cs`、`CheeseRack.cs`、`WickerPen.cs`
- Modify: `Assets/Odyssey/Echo/BlindCaveBuilder.cs`、`EchoPlayer.cs`（丟石子改用 `LooseStone`，撿起也包含 `LooseStone`）

**Interfaces:**
- Consumes: Task 3 的 `ImpactSound`、`ImpactGate`；Task 1 的 `SoundBus.Emit(..., scale)`。
- Produces:
  - `class ImpactEmitter : MonoBehaviour`
    - `void Init(SoundKind kind, float maxLoudness)`
    - `OnCollisionEnter`：`ImpactSound.Loudness(max, collision.relativeVelocity.magnitude)` > 0 且 `ImpactGate.TryFire(Time.time)` → `SoundBus.Emit(kind, 接觸點, loudness / SoundRules.Loudness(kind))`
    - `event Action<Collision> Hit`（給奶桶判斷被石子打中）
  - `class LooseStone : MonoBehaviour`
    - `static IReadOnlyList<LooseStone> All`、`static void ClearAll()`
    - `static LooseStone Spawn(Vector3 pos, Vector3 velocity, Collider ignore)`：半徑 0.06 球、剛體（ContinuousDynamic）、`ImpactEmitter(Stone, 0.6)`
    - `bool Settled`：速度 < 0.2 m/s 時為 true
    - `void Take()`：Destroy 並從 `All` 移除
    - 不再 8 秒後消失
  - `EchoPlayer`：0.8 m 內 `Settled` 的 `LooseStone` 和原本的 `StonePickup` 一樣自動撿起
  - `class MilkPail : MonoBehaviour`
    - `void Init(Vector3 pos)`：圓柱剛體（質量 2）、`ImpactEmitter(Clatter, 0.7)`；被 `LooseStone` 打到就 `Knock`
    - `void Knock(Vector3 from)`：在桶頂施加從 `from` 指向桶、水平 2 m/s 的速度變化（`ForceMode.VelocityChange`）
    - `void Stand()`：回到原位、直立、速度歸零
  - `class CheeseRack : MonoBehaviour`
    - `void Init(Vector3 pos)`
    - `void Brush()`：3 秒冷卻；從架上掉下 1～2 塊圓乳酪（剛體、`ImpactEmitter(Cheese, 0.4)`）
    - `void ClearWheels()`
  - `class WickerPen : MonoBehaviour`
    - `void Init(Vector3 center, Vector2 size)`：四邊低矮柳條框，高 0.5 m、沒有碰撞，回聲材質 (0.5, 0.4, 0.25)；地面一片稍亮的乾草
    - `bool Contains(Vector3 p)`
  - `BlindCaveLayout` 新增 `MilkPail[] Pails; CheeseRack Rack; WickerPen[] Pens; Vector3[] CrewSpots; Vector3 StakeSpot`
    - 位置用 `seed` 產生：同伴點至少 12 個、彼此 ≥ 3 m、離巨石 ≥ 5 m；木樁離巨石 ≥ 6 m；羊圈 2 塊 4×3 m、不重疊、離巨石 ≥ 5 m
    - 原有的奶桶圓柱改成 `MilkPail`，另外新增 2 個；原有的乳酪架改成 `CheeseRack`
  - `static float BlindCaveBuilder.StepScale(BlindCaveLayout layout, Vector3 p)`：任一羊圈包含 p 時回傳 0.5，否則 1
  - **觸發由 `BlindGameLoop` 每幀檢查**（Task 9）：
    - 玩家或跟隨者移動中且在奶桶 0.6 m 內 → `Knock(人的位置)`
    - 玩家在乳酪架 0.8 m 內移動 → `Brush`
    - 玩家跨越羊圈邊界 → `Wicker`

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): rigidbody stones, pails and cheese with impact sounds; wicker pens`

### Task 8: 推巨石、楔子、木樁與玩家操作

**Files:**
- Create: `Assets/Odyssey/Echo/OliveStake.cs`
- Modify: `Assets/Odyssey/Echo/EchoPlayer.cs`、`Boulder.cs`
- Delete: `Assets/Odyssey/Core/BoulderModel.cs`（含 `.meta`），以及 `BoulderDawnDecoyTests.cs` 裡的 `BoulderModel` 測試

**Interfaces:**
- Consumes: Task 2 的 `BoulderSlide`、`PushMode`；Task 6 的 `CrewLine`；Task 7 的 `LooseStone`；Task 0 的 `Stamina`。
- Produces:
  - `Boulder`：
    - `void SetOpening(float meters)`：取代 `SetProgress(int)`，body 往 +X 滑 `meters`，縫光寬度同步
    - `void ShowWedges(IReadOnlyList<float> stones, float? stake)`：在縫裡、各楔子位置顯示小石塊（灰）與木樁（棕）
  - `class OliveStake : MonoBehaviour`
    - `void Init()`：細長圓柱，長 2 m，回聲材質 (0.35, 0.26, 0.15)；放下時是剛體，帶 `ImpactEmitter(Drag, 0.25)`
    - `void PlaceAt(Vector3 groundPos)`、`void AttachTo(Transform hand)`、`void PlantAt(Vector3 gapPos)`（插在縫裡，kinematic）
    - `bool Carried`、`bool Planted`
  - `EchoPlayer`：
    - `Init(FirstPersonPlayer body, Boulder boulder, BoulderSlide slide, IReadOnlyList<StonePickup> pickups, OliveStake stake, CrewLine crew, Func<Vector3, float> stepScale)`
    - `PushMode PushMode`：這一幀的推法，給 `BlindGameLoop` 傳進 `slide.Tick`
    - `bool CarryingStake`
    - 常數 `StakeReach = 1.2f`、`CrewReach = 1.2f`、`WedgeSeconds = 0.6f`、`PullWedgeSeconds = 1f`
    - 移除 `PushCompleted`、`PushHold01`、`PushHoldSeconds`
  - **E 的優先順序**（規格第 6 節）：
    1. 開口全開且在縫前 → 鑽出去
    2. 沒拿木樁且在木樁 1.2 m 內（地上或插在縫裡；按下）→ 撿起；插著的要 `slide.RemoveStake()`
    3. 在躲藏同伴 1.2 m 內（按下）→ 帶他走
    4. 在巨石前按住 → `PushMode.Light`；同時按 Shift 且 `Stamina.Tick(dt, true)` 為 true → `PushMode.Heavy`
  - **右鍵（在巨石前）**：按下時有石子 → 0.6 秒後 `slide.AddStoneWedge()`、石子 −1、發 `Wedge`（這 0.6 秒 `PushMode` 為 None）；按住滿 1 秒 → `slide.RemoveOutermostStoneWedge()`，成功時石子 +1（已滿 3 顆就在腳邊 `LooseStone.Spawn`）。不在巨石前時右鍵無作用。
  - **G**：拿著木樁且在巨石前 → `stake.PlantAt(縫)`、`slide.PlantStake()`；其他地方 → `stake.PlaceAt(腳下)`。
  - **F** → `crew.ToggleCrouch()`。
  - **拿著木樁時**：腳步改發 `Drag`；不能跑；左鍵不丟石子。
  - 所有腳步都乘上 `stepScale(transform.position)`。
  - 每幀設定 `crew.Running`。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): light/heavy push, stone wedges, olive stake, crew controls`

### Task 9: 接上一夜的流程

**Files:**
- Create: `Assets/Odyssey/Echo/ThrownRock.cs`
- Modify: `Assets/Odyssey/Echo/BlindCyclops.cs`、`BlindGameLoop.cs`

**Interfaces:**
- Consumes: Task 1～8 的全部介面。
- Produces:
  - `class ThrownRock : MonoBehaviour`
    - `void Launch(Vector3 from, Vector3 to, float seconds, Action<Vector3> landed)`：沿拋物線飛行 1 秒，落地時回呼
  - `BlindCyclops`：
    - `Init(BlindCaveLayout, DecoyMemory, Transform player, Func<IReadOnlyList<Vector2>> crewPositions)`
    - `event Action<int> AteCrew`、`event Action<Vector3> RockLanded`、`event Action PulledWedge`
    - Throw 開始時 `Roar()` 並發出巨人聲音
    - `RockReleased` 時生成 `ThrownRock`（從頭頂丟到目標）；落地發出 `RockImpact`，並觸發 `RockLanded`
    - Eat 時每 0.5 秒發出巨人聲音
    - `PullWedge` 時觸發 `PulledWedge`
  - `BlindGameLoop`：
    - 公開 `BoulderSlide Slide`（取代 `BoulderProgress`）、`CrewLine Crew`、`OliveStake Stake`、`int RescuedLastEscape`、`int LostTonight`
    - **每幀（Night）**：
      - `var noise = Slide.Tick(dt, player.PushMode, player.CarryingStake)`
      - `Layout.Boulder.SetOpening(Slide.Opening)`、`ShowWedges(...)`
      - `noise.Grind` → 在 `PushPoint` 發 `Grind`；`noise.Heavy` → 發 `Boulder`；`noise.Slip` → 發 `Slip`
      - `Slide.PullingBack` 期間每 0.5 秒在 `PushPoint` 發一次巨人聲音
      - 觸發雜物（規則見 Task 7）
    - `PulledWedge`：`Slide.GiantPull()` 為 true 時，在 `GapPoint` 以朝洞內（−Z）3 m/s＋向上 2 m/s `LooseStone.Spawn`，並發一次巨人聲音
    - `ResetNight`：
      - `Slide.Reset()`、`LooseStone.ClearAll()`、`Rack.ClearWheels()`、奶桶 `Stand()`
      - `Crew.Spawn(Roster.Remaining, Layout.CrewSpots, seed)`
      - 木樁回到 `StakeSpot`（不是 Planted、不是 Carried）
    - `AteCrew(i)`：
      - `Crew.Remove(Crew.Members[i])`（`Kill`）
      - `Roster.Lose()`、`LostTonight++`
      - 死亡紀錄加一行「第 N 夜・一名同伴被巨人吃掉了」
    - `RockLanded(p)`：
      - 玩家在 1.5 m 內 → `Fail(Crushed)`
      - 範圍內的同伴 → 移除，並 `Roster.Lose()`、`LostTonight++`，死亡紀錄加一行「第 N 夜・一名同伴被岩石砸死了」
    - `Escape`：
      - 條件改為 `Slide.IsOpen`
      - `RescuedLastEscape` = 縫 3 m 內的跟隨者人數
      - 文字：「你逃出去了。」／「帶出 {X} 名同伴。但你對著巨人喊出了自己的名字。」
    - CSV：`boulderCm = Mathf.RoundToInt(Slide.MaxOpening * 100)`，傳入 `rescued` 與 `lost`
    - 推巨石的中央長條改顯示 `Slide.Opening / FullOpen`（在巨石前才顯示）
    - 操作提示改成規格第 6 節的文字

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**
  - `compile-check` → 0 錯誤
  - `dotnet test tools/CoreTests` → 全過
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): wire boulder slide, crew, rocks, stake and clutter into the night loop`

### Task 10: 除錯面板

**Files:**
- Modify: `Assets/Odyssey/Echo/DebugPanel.cs`

**內容**（規格第 8 節、第 13 節 D）
- 巨石長條：`Opening / FullOpen`，上面標出楔子（石子灰點、木樁棕條），旁邊文字「輕推／猛推／回滑／被拔回」
- 小地圖：
  - 同伴：淡綠點；跟隨中加白框；蹲下變暗
  - 木樁：棕色細條
  - 奶桶：倒了（傾斜 > 45°）變暗
  - 羊圈：框
  - 地上的石子：灰點
  - 飛行中的岩石落點：紅叉。`BlindCyclops` 公開 `Vector3? IncomingRock`
- 文字：「同伴：跟隨 X／躲著 Y」
- 長條：「岩石」＝ 1 − `ThrowCooldownLeft / ThrowCooldown`
- 不加背景（使用者規則）。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**：`compile-check` → 0 錯誤
- [ ] **Step 3: 提交**
  訊息：`feat(blind2): debug panel shows boulder wedges, crew, stake, clutter and rocks`

### Task 11: 收尾

- [ ] **Step 1: 對照規格**
  規格 v2 第 2～13 節逐條對照實作，數值完全一致。
- [ ] **Step 2: 審查**
  找一個新的審查者（Opus）審查 `00b4e11..HEAD`，一次修完 Critical 與 Important 的問題（每個修正都先寫失敗測試）。
- [ ] **Step 3: 回報使用者**
  列出還沒實測的項目（規格第 10 節與第 13 節 E）。
