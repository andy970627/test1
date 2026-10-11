# 第 2 批：每個動作的音效、巨石進度回饋 Implementation Plan

> 執行：原生＋最後 Opus 審查。**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 22 節。

**Global Constraints:** 同第 1 批計畫（繁中、只 `git add` 明確路徑、新 `.cs` 補 `.meta`、不呼叫 python3）。

**Review Focus:**
1. 同一幀多個聲音（例如猛推每 0.5 秒＋碎石）不能把巨人專用聲道或重要聲音搶掉。
2. 2D 小回饋不可經過 `SoundBus`（巨人不能聽到、不能照亮）。
3. 每夜重置 `BoulderMilestones`；失敗、逃出、按 R 都要歸零。
4. 音高隨開口變化不影響其他共用聲道（每次播放都重設 pitch）。
5. 撞擊類聲音（Stone、Clatter）短時間大量觸發時不爆音。

### Task 1：`BoulderMilestones`、`PromptTracker.Used` 回傳值（TDD，Core）
- `BoulderMilestones.Update(float opening) -> int`、`Reset()`；格 = floor(opening ÷ (1.44 × 0.25))，上限 4。
- `PromptTracker.Used(...) -> bool`。
- 測試照規格 22 D。

### Task 2：程式音效
- `ProceduralAudio` 新增：`Clap`、`StoneKnock`、`Grind`、`BoulderHeavy`、`Slip`、`WedgeClick`、`PailClatter`、`SoftThud`、`HayRustle`（沿用 `WoolRustle`）、`WoodScrape`、`PebbleClick`、`CrewReply`、`WoodTap`、`LearnChime`、`BoulderSettle`。

### Task 3：`SoundPlayer` 擴充
- `Init(BlindCyclops cyclops, Func<float> openingFraction)`；`OnSound` 加規格 22 A 各 kind；`PlayAt(clip, at, volume, pitch, min, max)` 給遊戲迴圈用（巨人拔楔子、被拔回滑）。
- 2D 聲道 `PlayLocal(clip, volume)`（`spatialBlend` 0）。
- 共用聲道 16 個，挑最舊的。

### Task 4：接進遊戲
- `EchoPlayer` 新增 `event Action PickedUpStone`。
- `BlindGameLoop`：`player.Used` → `Prompts.Used` 回傳 true 時 `LearnChime`；Used(TakeStake)→`WoodTap`、Used(Recruit)→`CrewReply`；`PickedUpStone`→`PebbleClick`；`UpdateBoulder` 呼叫 `Milestones.Update`，>0 時 `BoulderSettle`＋進度條閃白 0.3 秒；`ResetNight` 重置；巨人拔楔子與滑回時 `PlayAt`。
- `Boulder`：縫光亮度依開口。

### Task 5：驗證、審查、提交（同第 1 批）
