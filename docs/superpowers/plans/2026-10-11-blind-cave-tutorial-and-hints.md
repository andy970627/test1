# 計畫：循序教學與情境提示（規格第 17 節）

日期：2026-10-11　分支：`blind-cave`　執行：原生，最後 Opus 審查

## Task 1：物體提示一次一行（WorldPrompts.Add：同位置已有一行就不加）

## Task 2：`TutorialSteps`（TDD，Core）
- `TutorialStep { Move, Clap, Approach, Push, Wedge, Wake, Done }`。
- `Start()` 從 Move 開始；`Skip()` 直接 Done（第 2 夜之後）。
- `OnMoved(meters)`（Move 步 ≥ 3）、`OnUsed(kind)`（Clap／Push／Wedge 各自那一步）、`OnAtBoulder()`（Approach 步）。
- `Tick(dt, opening)`：Wedge 步 20 秒自動前進；任何睡眠步開口 ≥ 0.3 → Wake；Wake 5 秒 → Done。
- `Asleep`：Step < Wake；`Active`：Step < Done；`Text`；`Kind`（對應 `PromptKind?`）。
- 測試照規格 17 E。

## Task 3：`HintQueue` 與 `HintText`（TDD，Core）
- `HintKind` 15 種；`Trigger(kind, now)`、`Tick(dt, paused)`、`Current`（`HintKind?`）、`Remaining`。
- 每則 5 秒、整場一次（`said`）、排隊超過 8 秒丟掉且不算講過、`paused` 時 `Trigger` 忽略、`Tick` 不前進。
- 測試照規格 17 E。

## Task 4：接進遊戲
- `MissionHud` 簡報只剩一句。
- `BlindGameLoop`：`Tutorial`、`Hints` 屬性；`StartNight` 第一夜 `Tutorial.Start()`、否則 `Skip()`；巨人 `Active = !Tutorial.Asleep`，進入 Wake 時 `Roar()`；天亮只在醒著時計時；`player.Used` 同時餵 `Tutorial`；`Update` 餵 `OnMoved`、`OnAtBoulder`、`Tick`；教學中把當步的 `PromptKind` `MarkShown`。
- 觸發：巨人狀態（Investigate 目標 4 m 內且有石子、Guard、Throw）、`PulledWedge`、`AteCrew`、巨石 `noise.Catch`、連續輕推 5 秒、`SoundBus`（Whimper 8 m 內、Clatter、Wicker、Pant）、木樁 3 m、天亮 75%、`Rush.Active`、`Rush.Stuck`。
- 新元件 `SituationHints`（Echo）：畫上方中央；教學行畫在準星下方。
- `WorldPrompts`：教學中不畫。
- `DebugPanel` 加教學步與目前提示。

## Task 5：驗證與審查
- `dotnet test tools/CoreTests`、`tools/compile-check.ps1`。
- 派 Opus 子代理審查整段，修 Critical／Important。
- 提交（只 `git add` 明確路徑）、推到 `blind-cave`。
