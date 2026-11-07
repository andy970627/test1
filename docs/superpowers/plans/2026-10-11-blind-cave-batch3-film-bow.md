# 第 3 批：電影情節與弓箭 Implementation Plan

> 執行：原生＋最後 Opus 審查。**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 20、21、23 節。

**Global Constraints:** 同第 1 批（繁中、只 `git add` 明確路徑、新 `.cs` 補 `.meta`、不呼叫 python3、所有內容出自《奧德賽》）。

**Review Focus:**
1. 禱告中巨人什麼都聽不到（含巨石聲），結束後回到聆聽；被抓、天亮、逃出時禱告效果（震動、聲音）要停。
2. 岸邊階段不能再被巨人抓、天亮不能結束這一夜；按 R 在結局字幕後才有效。
3. 箭撞到玩家自己、木樁、巨石縫邊時不能卡住或炸飛；箭每夜清空、補回 3 支。
4. 拉弓中切到木樁、關掉輸入（被抓、逃出）時要取消拉弓，不能鎖住慢走。
5. 誘餌學習從石子移到箭後，F1 的吸引力長條與聽覺邊（`HearingMultiplierFor`）一致。

### Task 1：Core（TDD）
- `PrayerClock`（`NewNight(Func<double> roll)`、`Ready(float elapsed)`、`Done()`；第一次 60～120 秒；roll < 0.5 時第二次 150～200 秒）。
- `CyclopsState.Pray`、`CyclopsBrain.TryPray()`（Guard／Throw／Eat／守石中回傳 false）、`PraySeconds = 8`；禱告中 `Hear` 直接忽略；8 秒後回 Listen。
- `ShoreChoice`：`ShoreAction { Shoot, Name, Leave }`、`TimeLimit = 8`、`LossChance = 1/3`、`Resolve(action, rescued, roll)`、`Title(action)`、`Subtitle(action, rescued, lost)`。
- `BowDraw`：`MinDraw 0.3`、`FullDraw 1`、`Speed(fraction) = 12 + 18 × fraction`、`Begin()`、`Tick(dt)`、`Release() -> float?`（未滿 0.3 秒回傳 null）、`Cancel()`、`Drawing`、`WalkMultiplier 0.5`。
- `SoundKind.Arrow`（0.5、照亮）、`SoundKind.Twang`（0.1、不照亮）；誘餌與學習改套 Arrow（`DecoyMemory.ArrowRadiusMultiplier`）。
- 更新既有測試中以 Stone 為誘餌的部分。

### Task 2：箭與弓（Echo）
- `Arrow`：剛體、朝速度方向、撞到就停；依撞到的東西觸發奶桶 `Knock`、乳酪架 `Brush`、羊叫、掉落；停下時發 Arrow；`All`、`ClearAll()`、`Take()`、可撿（水平 0.8 m、高度 < 2 m）。
- `EchoPlayer`：左鍵改成拉弓射箭（箭 3／3、拿木樁不能拉、拉弓走速 ×0.5 不能跑、放開發 Twang、`Used(Shoot)`）；撿箭；`PromptKind.Throw` 改名 `Shoot`。
- HUD：右下角石子左邊一列 3 根細條表示箭；角落說明照規格 21 D；`HintText.Decoy` 改文字；F1 吸引力長條改「箭」。

### Task 3：開場、禱告、岸邊（Echo）
- 開場第一夜文字。
- 禱告：`PrayerClock` 每夜重置；到時間 `TryPray` 成功就播迴盪低沉人聲＋低頻、鏡頭抖 0.02 m、第 3、6 秒 `Slide.Jolt(0.05)`；情境提示 Prayer；F1 狀態「禱告」。
- 岸邊：`Escape` 後黑畫面轉場到縫外、巨人睡在縫內側（月光輪廓材質）、8 秒三選一（左鍵射箭、空白鍵喊名字、不動離開）；結果字幕、NightLog、CSV（`Escaped_Shoot`／`Escaped_Name`／`Escaped_Leave`）。

### Task 4：驗證、Opus 審查、提交。
