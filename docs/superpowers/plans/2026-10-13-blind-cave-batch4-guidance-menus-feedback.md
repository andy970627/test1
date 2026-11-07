# 第 4 批：核心法則、主選單與洞中紀事、魂系死亡畫面、事件回饋 Implementation Plan

> 執行：原生＋最後 Opus 審查。**Spec:** `docs/superpowers/specs/2026-10-10-blind-cave-v2-design.md` 第 25 節；文字以 `docs/game-text.md`「新風格建議」為準。

**Global Constraints:** 繁中；文字風格照 `docs/game-text.md` 第 0 節；只 `git add` 明確路徑；新 `.cs` 補 `.meta`；不呼叫 python3；除錯面板不加背景；每個新功能都要有對應引導。

**Review Focus:**
1. 暫停（`timeScale = 0`）時所有用 `Time.deltaTime` 的計時都停住；選單本身用 `unscaledDeltaTime`；暫停中不能拍手、射箭、推。
2. 回主選單（暫停中、結局後）要完整重置：狀態、夜數、同伴、巨人、聲音、`timeScale`、`AudioListener.pause`、游標。
3. 死亡卡片和 `LoopFailScreen` 的過場不能重疊或互相吃掉回呼；跳過鍵不能被同一幀的拍手（空白鍵）誤觸。
4. 心跳與耳鳴在暫停、死亡、主選單時要停；耳鳴壓低音量後一定要恢復。
5. 紀事解鎖與情境提示同一個觸發點，不能只解鎖其一。

### Task 1：Core（TDD）
- `GuideBook`：`GuidePage` 列舉（Controls, SoundLight, Boulder, Giant, Crew, Bow, Sheep, Escape）、`GuideEntry`（Id、Page、Title、Text）、`Entries`、`Unlock(string id) -> bool`、`IsUnlocked(id)`、`EntriesOn(page)`、`UnlockedCount`；Controls 頁一開始全開。條目內容照規格 25 與紀事範例寫。
- `DeathCard`：`Alpha(t)`、`BandAlpha(t)`、`TextScale(t)`、`TextAlpha(t)`、`CanSkip(t)`（t ≥ 1）、`Done(t)`（t ≥ 3）。
- `Heartbeat`：`Active(d)`（d ≤ 8）、`BeatsPerMinute(d)`（8 m 60 → 2 m 140，線性、夾住）、`Intensity(d)`（0～1）。
- `HintKind` 新增 Notch、Footstep、HearingRing、ArrowClutter、FindExit、Brace；所有 `HintText` 改成新風格；`HintGuide.EntryFor(HintKind)` 對應紀事條目 id。
- `FailReasonText` 改說書人版本並更新測試。

### Task 2：文字套用
- `MissionHud`、`WorldPrompts`、`BlindGameLoop`、`ShoreChoice` 改成 `docs/game-text.md` 新風格建議。

### Task 3：主選單、暫停選單、紀事介面（Echo，新 `GameMenus.cs`）
- 狀態：MainMenu／Playing／Paused／Chronicle（從主選單或暫停進入，返回原處）。
- 主選單取代 `Start() => BeginIntro()`；難度在主選單；簡報只留目標與「空白鍵 開始」。
- Tab 暫停；回主選單確認。
- 結局字幕播完 → 回主選單（`ReturnToMenu()` 完整重置）；刪掉「R 重新開始」。
- 紀事：左側分頁、右側條目；未解鎖「尚未經歷」；巨人頁兩條即時值（丟岩石冷卻、箭的引誘力）。
- 新解鎖通知「紀事多了一則（Tab）」3 秒。

### Task 4：核心法則與新提示觸發
- 開場文字（規格 25 A）。
- 第一個會照亮的回聲：波前到邊緣時在世界位置畫「他聽得到這麼遠」2 秒。
- 6 個新提示的觸發（規格 25 C），每個提示觸發時同時解鎖紀事條目。

### Task 5：魂系死亡畫面
- 新 `DeathScreen`（OnGUI）：照 `DeathCard` 時間軸畫暗幕、黑帶、回紋線、大字、死因；`ProceduralAudio.DeathBell()`；完成或跳過後再走原本的過場。

### Task 6：事件回饋
- 同伴被吃：`ProceduralAudio.Scream()` 3D、紅邊脈動、方向弧、任務清單人數閃紅。
- 巨人靠近：心跳（`Heartbeat`）＋暗角。
- 撞到東西：鏡頭輕震＋本地撞擊聲。
- 岩石落在 5 m 內沒砸中：大震＋耳鳴（`ProceduralAudio.Tinnitus()`，`AudioListener.volume` 壓到 0.4 後回復）。
- 新 `ScreenFeedback`（OnGUI 暗角／紅邊／方向弧）與 `BoulderFeel` 震動共用。

### Task 7：F1
- 拿掉岩石、箭兩條；小地圖下方圖例：你、巨人、同伴、木樁。

### Task 8：驗證、Opus 審查、提交。
