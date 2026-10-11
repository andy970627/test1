# 輕推會卡、巨石份量感、遊戲內提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓輕推也有被發現的風險（巨石會卡一下），讓推巨石有份量感（晃動、鏡頭、拖痕、碎石），並把操作教學改成靠近物體才出現的遊戲內提示。

**Architecture:** 卡住規則加進 `BoulderSlide`，提示「用過幾次」寫成 `PromptTracker`，都在 `Odyssey.Core` 並先寫測試。畫面效果放在 Unity 層的新元件 `BoulderFeel`；提示由新元件 `WorldPrompts` 用 IMGUI 畫在物體的螢幕位置。

**Tech Stack:** Unity 6000.3.14f1、URP 17.3、Input System、C#、NUnit（`dotnet test tools/CoreTests`）。

**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 15 節。

## Global Constraints

- 與 `2026-10-10-blind-cave-v2.md` 相同：只出自《奧德賽》、繁體中文、只 `git add` 明確路徑、Core 不引用 UnityEngine、每個任務結束測試全過且 `compile-check` 0 錯誤、補 `.meta`、CRLF 檔案用 Edit 改、提交訊息結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 畫面效果不改變任何規則或聲音。

## Review Focus

1. **卡住時剛好被巨人拔楔子**：拔回期間不擲骰、不累積連續輕推秒數。測試見 Task 1。
2. **輕推↔猛推來回切換**：切到猛推時連續輕推秒數歸零（猛推不是輕推）。測試見 Task 1。
3. **一夜重置**：碎石、拖痕、巨石晃動、鏡頭偏移全部歸零；`PromptTracker` 跨夜保留次數，只重設每夜的 `Move`／`Clap`。由 Task 3、4 處理，`NewNight` 測試見 Task 2。
4. **巨石 0.3 秒頓住期間**：推的聲音計時照常（不會因為頓住而多發或少發磨擦聲）。測試見 Task 1。

---

### Task 1: 輕推會卡一下

**Files:**
- Modify: `Assets/Odyssey/Core/BoulderSlide.cs`、`Assets/Odyssey/Tests/Editor/BoulderSlideTests.cs`、`Assets/Odyssey/Echo/BlindGameLoop.cs`

**Interfaces:**
- Produces:
  - 建構子 `BoulderSlide(Func<double> roll = null)`：null 時永遠不卡
  - 常數 `CatchPerSecond = 0.02f`、`CatchMax = 0.4f`、`CatchStallSeconds = 0.3f`、`CatchResetSeconds = 2f`
  - `BoulderNoise` 新增 `bool Catch`
  - `float LightPushSeconds`（給除錯用）、`bool Stalled`
- 規則：
  - 每次回傳 `Grind` 時擲一次：`roll() < min(0.4, 0.02 × LightPushSeconds)` → `Catch = true`，`LightPushSeconds = 0`，接下來 0.3 秒推力無效（`Stalled`）。
  - `LightPushSeconds` 只在 Light 且未 `PullingBack` 時累加；Heavy 時歸零；None 累計滿 2 秒才歸零。
  - `Stalled` 期間 `pushSeconds` 也歸零（重新起步）。
- `BlindGameLoop.UpdateBoulder`：`noise.Catch` → 在 `PushPoint` 發 `Boulder`；`Slide` 改為 `new BoulderSlide(rng.NextDouble)`。

- [ ] **Step 1: 寫失敗測試**

  | 測試 | 情境 | 預期 |
  |---|---|---|
  | `Catch_DefaultNeverCatches` | 預設建構子，輕推 30 秒（每 0.1） | 從未 `Catch` |
  | `Catch_ChanceGrowsWithPushTime` | roll 恆 0.05；輕推每 0.1 秒 | 第一次 `Catch` 出現在 `Grind` 擲骰時 0.02×t > 0.05，即 t = 3.0 秒那一次 |
  | `Catch_CapsAtPointFour` | roll 恆 0.39；輕推 | 會卡；roll 恆 0.41 時推 60 秒從未卡 |
  | `Catch_StallsThreeTenths` | 卡住那一刻記下開口，再輕推 0.3 秒 | 開口不變；之後繼續增加 |
  | `Catch_ResetsCounter` | 卡住後 | `LightPushSeconds == 0` |
  | `Release_TwoSecondsResetsCounter` | 輕推 4 秒，放手 1.9 秒再推 | `LightPushSeconds` 接續（> 4）；另一組放手 2 秒 → 從 0 起算 |
  | `Heavy_NeverCatches_AndResetsCounter` | roll 恆 0；猛推 5 秒 | 從未 `Catch`，`LightPushSeconds == 0` |
  | `PullingBack_NoCatchRoll` | roll 恆 0；巨人拔楔子期間輕推 | 從未 `Catch` |
  | `Stall_KeepsGrindCadence` | roll 依序 0.0 後恆 0.99；輕推 2 秒（每 0.1） | `Grind` 共 4 次 |
- [ ] **Step 2: 執行測試確認失敗**（`dotnet test tools/CoreTests` → 編譯失敗）
- [ ] **Step 3: 實作並接上 `BlindGameLoop`**
- [ ] **Step 4: 驗證**：測試全過、`compile-check` 0 錯誤
- [ ] **Step 5: 提交** `feat(blind2): light push can catch with a loud thud`

### Task 2: 提示次數（`PromptTracker`）

**Files:**
- Create: `Assets/Odyssey/Core/PromptTracker.cs`、`Assets/Odyssey/Tests/Editor/PromptTrackerTests.cs`

**Interfaces:**
- Produces:
  - `enum PromptKind { Push, Wedge, PlantStake, Escape, TakeStake, DropStake, Recruit, Crouch, Throw, Move, Clap }`
  - `sealed class PromptTracker`
    - 常數 `UsesToRetire = 3`
    - `bool ShouldShow(PromptKind kind)`
    - `void Used(PromptKind kind)`
    - `void NewNight()`：`Move`、`Clap` 重新顯示（若還沒用滿 3 夜）
  - 規則：`Escape` 永遠顯示；`Move`、`Clap` 每夜用過一次就這一夜不顯示、次數 +1（同一夜重複 `Used` 不重複計）；其他種類 `Used` 次數 ≥ 3 後不顯示。

- [ ] **Step 1: 寫失敗測試**
  - `Retires_AfterThreeUses`：`Used(Push)` 兩次仍顯示，第三次後不顯示。
  - `Escape_NeverRetires`：`Used(Escape)` 10 次仍顯示。
  - `Move_HidesForTheNight_ReturnsNextNight`：`Used(Move)` → 不顯示；`NewNight()` → 顯示。
  - `Move_SameNightCountsOnce`：同一夜 `Used(Move)` 5 次、`NewNight` → 仍顯示。
  - `Move_RetiresAfterThreeNights`：三夜各 `Used(Move)` 一次 → 第四夜 `NewNight` 後不顯示。
  - `Clap_BehavesLikeMove`。
- [ ] **Step 2: 執行測試確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試全過
- [ ] **Step 5: 提交** `feat(blind2): prompt tracker retires hints after use`

### Task 3: 巨石份量感

**Files:**
- Create: `Assets/Odyssey/Echo/BoulderFeel.cs`
- Modify: `Assets/Odyssey/Echo/Boulder.cs`（公開 body 給晃動用：`Transform Body`）、`Assets/Odyssey/FirstPersonPlayer.cs`（鏡頭偏移）、`Assets/Odyssey/Echo/BlindGameLoop.cs`

**Interfaces:**
- Consumes: Task 1 的 `BoulderNoise.Catch`、`BoulderSlide.Stalled`、`PullingBack`；`EchoPlayer.PushMode`。
- Produces:
  - `FirstPersonPlayer`：`public float FeelPitch`、`public Vector3 FeelOffset`；在 `LateUpdate` 把它們加到鏡頭的本地角度與位置上（不改 `pitch` 本身）
  - `class BoulderFeel : MonoBehaviour`
    - `void Init(Boulder boulder, FirstPersonPlayer player)`
    - `void Tick(PushMode mode, bool catching, bool sliding, float maxOpening)`：每幀由 `BlindGameLoop` 呼叫
    - `void ResetForNight()`：晃動、鏡頭偏移、拖痕、碎石全部歸零
  - 數值（規格第 15 節 B）：
    - 晃動：輕推 0.4°／0.005 m、猛推 1.2°／0.015 m、3 Hz；卡住往 −Z 頓 0.04 m，0.3 秒回位；回滑／拔回 0.2°
    - 鏡頭：推時前傾 3°（0.2 秒平滑）；猛推位置抖 0.01 m；卡住往後 0.05 m，0.25 秒回位
    - 拖痕：顏色 (0.5, 0.42, 0.3)、寬 = maxOpening、深 = `Boulder.Depth`、貼地，沒有碰撞
    - 碎石：輕推每 0.4 秒、猛推每 0.15 秒，從巨石推的那一面底部隨機一點掉出，半徑 0.03～0.05 m 剛體、不掛 `ImpactEmitter`；同時最多 20 顆，6 秒後 Destroy
  - 晃動只動 `Boulder.Body` 的本地旋轉與一個額外位置偏移，`SetOpening` 設定的滑動位置不受影響（晃動在 `SetOpening` 之後套用）。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**：`compile-check` 0 錯誤、測試全過
- [ ] **Step 3: 提交** `feat(blind2): boulder sway, camera strain, drag mark and grit`

### Task 4: 遊戲內提示

**Files:**
- Create: `Assets/Odyssey/Echo/WorldPrompts.cs`
- Modify: `Assets/Odyssey/Echo/EchoPlayer.cs`（用過時通知）、`Assets/Odyssey/Echo/BlindGameLoop.cs`（移除底部長提示與羊的底部提示、建立 `WorldPrompts`、每夜 `NewNight`）

**Interfaces:**
- Consumes: Task 2 的 `PromptTracker`、`PromptKind`。
- Produces:
  - `EchoPlayer`：`event Action<PromptKind> Used`，在推（輕／猛推開始的那一幀）、塞或拔楔子、插木樁、拿起木樁、放下木樁、帶人、按 F、丟石子、拍手時觸發；`float MovedTonight`（這一夜走過的距離，`ResetForNight` 歸零）；公開 `bool AtGap`（開口全開時站在縫前）
  - `class WorldPrompts : MonoBehaviour`
    - `void Init(BlindGameLoop loop, PromptTracker tracker)`
    - `OnGUI`：只在 Night 階段畫；依規格第 15 節 C 的表決定文字與錨點：巨石用 `PushPoint + 上方 1.4 m`、縫用 `GapPoint + 上方 1 m`、木樁用它的位置 + 上方 0.6 m、同伴用頭頂 + 0.5 m、`Throw`／`Move`／`Clap` 用螢幕中央偏下（高度的 62%）
    - 在相機後方（`WorldToScreenPoint().z <= 0`）的錨點不畫
    - 字級 `max(20, Screen.height / 34)`，白字黑影（先畫偏移 2 px 的黑字再畫白字），不加背景；同一錨點多行時往上堆
  - `BlindGameLoop`：`PromptTracker Prompts`（跨夜保留，按 R 重新開始也保留）、`ResetNight` 呼叫 `Prompts.NewNight()`；`player.Used += Prompts.Used`；`MovedTonight >= 3` 時 `Prompts.Used(Move)`；底部只留「按 R 重新開始」。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**：`compile-check` 0 錯誤、測試全過
- [ ] **Step 3: 提交** `feat(blind2): in-world interaction prompts replace the bottom hint`

### Task 5: 收尾

- [ ] **Step 1: 對照規格第 15 節**，數值完全一致。
- [ ] **Step 2: 審查**：派新的審查者（Opus）審查 `59518ff..HEAD`，一次修完 Critical 與 Important（能寫測試的先寫失敗測試）。
- [ ] **Step 3: 回報使用者**，列出還沒實測的項目。
