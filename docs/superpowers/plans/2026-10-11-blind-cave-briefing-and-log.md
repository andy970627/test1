# 紀錄整合、任務簡報與清單、更紮實的教學 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** F1 死亡紀錄改成每夜一行；開場有任務簡報、夜裡有任務清單；提示要真的看到並做到才算學會；拍手與丟石子講清楚意義。

**Architecture:** `NightLog` 與 `PromptTracker` 的新規則在 `Odyssey.Core`，先寫測試。Unity 層：`DebugPanel` 讀 `NightLog`；新元件 `MissionHud` 畫簡報與任務清單；`WorldPrompts` 回報提示出現的時間；`EchoPlayer` 只在有意義的結果時發 `Used`。

**Tech Stack:** Unity 6000.3.14f1、C#、NUnit（`dotnet test tools/CoreTests`）。

**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 16 節。

## Global Constraints

- 同 `2026-10-10-blind-cave-v2.md`：只出自《奧德賽》、繁體中文、只 `git add` 明確路徑、Core 不引用 UnityEngine、每個任務結束測試全過且 `compile-check` 0 錯誤、補 `.meta`、CRLF 檔案用 Edit 改、提交訊息結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 玩家可見文字照規格第 16 節逐字使用。

## Review Focus

1. **簡報期間**：玩家輸入關閉、巨人不動、天亮不計時；按 R 重新開始後簡報會再出現。由 Task 3 處理。
2. **同一夜先有同伴被吃、再被抓**：只有一行，損失合計。測試見 Task 1。
3. **逃出時已無同伴**：「逃出去・帶出 0」不顯示損失或顯示實際損失，不丟例外。測試見 Task 1。
4. **提示在相機後方或被夾在螢幕邊時**：只要有畫出來就算出現過。由 Task 2 處理（在 `DrawLines` 時 `MarkShown`）。

---

### Task 1: 每夜一行的死亡紀錄（`NightLog`）

**Files:**
- Create: `Assets/Odyssey/Core/NightLog.cs`、`Assets/Odyssey/Tests/Editor/NightLogTests.cs`
- Modify: `Assets/Odyssey/Echo/BlindGameLoop.cs`（取代 `deaths` 字串清單）、`Assets/Odyssey/Echo/DebugPanel.cs`

**Interfaces:**
- Produces:
  - `enum NightOutcome { Touched, Bumped, Crushed, Dawn, Escaped }`
  - `readonly struct NightLine { int Night; NightOutcome Outcome; int Lost; int Rescued; string Text; }`
    - `Text` 例：「第 2 夜  被摸到  −3 名同伴」、「第 3 夜  逃出去・帶出 4」（Lost 為 0 時不寫損失）
  - `sealed class NightLog`
    - 常數 `MaxLines = 6`
    - `void Lose()`：這一夜損失 +1
    - `void End(int night, NightOutcome outcome, int rescued = 0)`：被抓類（Touched／Bumped／Crushed／Dawn）損失再 +1；寫入一行並清空這一夜的計數
    - `IReadOnlyList<NightLine> Lines`：最近 6 行
    - `void Clear()`
  - `static NightOutcome NightLog.From(FailReason)`
- `BlindGameLoop`：`public NightLog Log`；`LoseCrew` 改呼叫 `Log.Lose()`；`Fail` 呼叫 `Log.End(night, NightLog.From(reason))`；`Escape` 呼叫 `Log.End(night, Escaped, rescued)`；按 R 時 `Log.Clear()`；移除 `Deaths`。
- `DebugPanel`：每行前畫顏色方塊（被抓／砸中紅 (0.9, 0.25, 0.2)、天亮藍 (0.55, 0.65, 0.95)、逃出綠 (0.55, 0.9, 0.6)），後接 `Text`。

- [ ] **Step 1: 寫失敗測試**
  - `LossesAndCaptureMergeIntoOneLine`：`Lose()` 兩次，`End(2, Touched)` → 一行，`Lost == 3`，`Text == "第 2 夜  被摸到  −3 名同伴"`。
  - `Dawn_CountsTheEatenOne`：`End(1, Dawn)` → `Text == "第 1 夜  天亮了  −1 名同伴"`。
  - `Escape_NoLoss_ShowsRescuedOnly`：`End(3, Escaped, 4)` → `Text == "第 3 夜  逃出去・帶出 4"`。
  - `Escape_WithLoss`：`Lose()`、`End(3, Escaped, 0)` → `"第 3 夜  逃出去・帶出 0  −1 名同伴"`。
  - `KeepsLastSixNights`：結束 8 夜 → `Lines.Count == 6`，第一行是第 3 夜。
  - `End_ResetsTonightsCount`：`Lose()`、`End(1, Dawn)`、`End(2, Dawn)` → 第 2 夜 `Lost == 1`。
  - `From_MapsFailReasons`：Touched/Bumped/Crushed/Dawn 對應。
- [ ] **Step 2: 確認失敗**（編譯失敗）
- [ ] **Step 3: 實作並接上 `BlindGameLoop`、`DebugPanel`**
- [ ] **Step 4: 驗證**：測試全過、`compile-check` 0 錯誤
- [ ] **Step 5: 提交** `feat(blind2): one-line-per-night death log`

### Task 2: 提示要看到並做到才算

**Files:**
- Modify: `Assets/Odyssey/Core/PromptTracker.cs`、`Assets/Odyssey/Tests/Editor/PromptTrackerTests.cs`、`Assets/Odyssey/Echo/WorldPrompts.cs`、`Assets/Odyssey/Echo/EchoPlayer.cs`、`Assets/Odyssey/Echo/BlindGameLoop.cs`

**Interfaces:**
- Produces:
  - `PromptTracker`：常數 `ShownGrace = 2f`；`void MarkShown(PromptKind kind, float time)`；`Used(PromptKind kind, float time)` 取代 `Used(PromptKind)`：`time − 最後出現時間 ≤ 2` 才計次（`Escape` 不需要）
  - `WorldPrompts`：每行畫出時 `tracker.MarkShown(kind, Time.time)`（行要帶上種類）；文字改為規格第 16 節 E；右下角石子圖示上方一行「石子：丟出去引開巨人，或塞進縫當楔子」，`Throw` 與 `Wedge` 都不再顯示時收起（畫在 `WorldPrompts` 裡，位置對齊 `BlindGameLoop.DrawStones`）
  - `EchoPlayer`：
    - `Push` 改為一次連續推（`PushMode` 從 None 變非 None 到變回 None）期間開口前進 ≥ 0.05 m 時發一次；開口由 `slide.Opening` 讀取
    - `Crouch` 只在 `crew.Followers.Count > 0` 時發
  - `BlindGameLoop`：`player.Used += k => Prompts.Used(k, Time.time)`；`Move` 同樣傳入 `Time.time`

- [ ] **Step 1: 寫失敗測試**（把既有測試改成傳入時間並先 `MarkShown`）
  - `Used_WithoutShown_DoesNotCount`：沒 `MarkShown` 就 `Used(Push, 5)` 三次 → 仍顯示。
  - `Used_TooLateAfterShown_DoesNotCount`：`MarkShown(Push, 0)`、`Used(Push, 2.5)` 三次 → 仍顯示。
  - `Used_WithinGrace_Counts`：`MarkShown(Push, 0)`、`Used(Push, 1.9)` 三次 → 不顯示。
  - `Escape_NeedsNoShown`：仍永遠顯示。
- [ ] **Step 2: 確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試全過、`compile-check` 0 錯誤
- [ ] **Step 5: 提交** `feat(blind2): prompts count only when seen and meaningfully used; stone legend`

### Task 3: 任務簡報與任務清單（`MissionHud`）

**Files:**
- Create: `Assets/Odyssey/Echo/MissionHud.cs`
- Modify: `Assets/Odyssey/Echo/BlindGameLoop.cs`

**Interfaces:**
- Produces:
  - `class MissionHud : MonoBehaviour`
    - `void Init(BlindGameLoop loop)`
    - `void ShowBriefing(Action onStart)`：顯示簡報；3 秒後才出現「按空白鍵開始」並接受空白鍵，按下後隱藏並呼叫 `onStart`
    - `bool BriefingOpen`
    - `OnGUI`：簡報時畫全螢幕半透明黑底與規格第 16 節 B 的文字；夜晚中在右上角畫任務清單（規格第 16 節 C）
  - `BlindGameLoop`：
    - 第一夜（`Roster.Night == 1`）的開場過場結束後，不直接 `StartNight`，改成 `hud.ShowBriefing(StartNight)`；其他夜照舊
    - 簡報期間 `State.Phase` 仍是 Intro（玩家輸入關閉、巨人 `Active == false`、天亮不計時）
- 簡報黑底：顏色 (0, 0, 0, 0.8)；標題字級 `Screen.height / 16`，內文 `Screen.height / 30`；任務清單字級 `max(18, Screen.height / 40)`，寬為螢幕的 22%，距右上角 20 px；進度條高為字級的 0.35 倍；天亮條從 (0.05, 0.08, 0.25) 漸變到 (0.7, 0.7, 0.65)。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**：`compile-check` 0 錯誤、測試全過
- [ ] **Step 3: 提交** `feat(blind2): mission briefing on the first night and an objectives list`

### Task 4: 收尾

- [ ] **Step 1: 對照規格第 16 節**
- [ ] **Step 2: 審查**：新的審查者（Opus）審查 `fa48720..HEAD`，一次修完 Critical 與 Important
- [ ] **Step 3: 回報使用者**
