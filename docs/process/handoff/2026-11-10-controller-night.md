# 交接：總控換新對話，接 11/10 夜間派工

給新的「test1 總控（Opus）」。上一任上下文用到 47%，依規則交接。最終報告用繁體中文。

## 你是誰、規矩（不變）
- 讀 `CLAUDE.md`、`docs/process/handoff/2026-11-09-opus-controller.md`（角色、同伴、叫設計席的方式）、`docs/process/ai-collaboration.md` 第 14 節。
- 工作資料夾 `C:\Users\恩\test1\.claude\worktrees\openrouter-api-key-setup-383957`，分支 `claude/gracious-bardeen-vwo4rr`。角色與總控共用這個 worktree；**不要另開 worktree 給角色**，刪任何 worktree 前先確認沒人在裡面。
- **跨對話通知**（全域規則 `~/.claude/CLAUDE.md`「跨對話通知」）：只在必要時傳訊；不轉達「誰在等使用者」；角色結果寫筆記，需要總控提交／合併／裁決才傳。
- **瀏覽器與錄影**（`docs/process/agent-notes/README.md` 末段）：遊戲頁一律 `?mute=1&nolock=1`；錄影工具已預設 `nolock=1`＋`--mute-audio`（無頭 Chromium 會把 pointer lock 變成鎖使用者實體滑鼠）。agy 簡報一律寫「不准開瀏覽器、不准執行指令」。browser-use 外掛已全域停用。
- agy 用法：參考檔複製進它的工作目錄（如 `_ref/`），禁止執行指令，測試由總控跑；agy 改規則時一定看 diff（它曾為了過測試偷改玩法與關卡資料）。

## 現況（11/10 晚，最新提交見 git log）
- 木馬之夜核心方向：使用者選**甲「殘響掩護」**（`docs/design/2026-11-10-core-direction-illusion.md`；`T.COVER_MODE` 預設 true，false＝舊盲區版）。PR #10 已合併。規則、聲音、畫面、錄音工具都已進工作分支，249 條測試全過。
- 設計席已裁決第 7 節五小題（耳朵掩護全程、震波最低限度、節奏變亮可關、提示文字對照表、殘響縮短與警戒輕版加強），**還沒實作**。
- 今晚已錄兩版各 90 秒（`tools/playtest-recorder/out/report-cover`、`report-gap`，不進 git）。甲版一項不過：不合拍腳步比合拍腳步 1～4 kHz 只差 10.6 dB（門檻 12，樣本 1 步）。
- 報告草稿 `docs/process/report-structure-draft.md`；簡報 https://claude.ai/artifact/XftoAaPwCynB575KgDw5Yj （報告工作階段負責）。
- 雲端備援：使用者自己開的「Test1 雲端備援待命」，交代檔 `docs/process/handoff/cloud-backup-brief.md`。總控用 start_session 開雲端兩次失敗（疑似分支名對不上），之後一律寫交代檔請使用者手動開。

## 使用者 11/10 晚選定的夜間工作（全部要做；用量可以用完，agy 可用完）
1. **照設計席第 7 節實作**：規則（`COVER_EAR_P`、σ 0.12 程式玩家、必要時 R_GAIN 12、7.4 提示文字、複審遺留：高度警覺中被看見不累積疑心、alerted 提示 hint 與 msg 重複）；聲音（`COVER_BRIGHT_DB`、`COVER_VERB_*`、警戒輕版係數 0.85、上述腳步 12 dB 不過）；畫面（`SHOCK_MIN`、7.4 開場文字、選單「不中斷」改「不停」）。同時最多 3 個角色。
2. **方向乙「換層」試驗場**：設計席寫規格（單一衛兵、固定循環、試驗場規則見 `CLAUDE.md`「設計與測試」）→ agy 寫第一版（另開 `prototypes/` 新資料夾，不碰木馬之夜檔案）→ 規則角色收尾、補測試。
3. **大廳復仇、比箭改成維持錯覺**：設計席（可先 agy 初稿）出設計文件，不改程式。
4. **整夜自動驗證**：錄音與工具角色，程式玩家兩模式各數百局（通關率、N1），錄音檢查全跑，明早一份數據報告。
5. **agy 文件一致性稽核**：術語表、核心總綱、程式常數、報告草稿之間的矛盾與過時處。
6. **agy 報告素材**：新舊版頻譜對照說明、投影片文字與評審問答更新成甲版。
7. **教學重排 M9**（`2026-11-09-core-mechanics-review.md`）：1 做完後接著做（同一批檔案）。
- 使用者已決定：11/11 試玩頁**不發布**，本機開來玩。

## 收工
- `docs/process/production-log.md` 加一行；`~/.claude/orchestration/log.md` L2 以上加一行。
- 總控隨手筆記在共用筆記資料夾 `controller-jot-2026-11-09.md`（上一任寫的過程教訓），額度重置後整理進 `ai-collaboration.md`／`retrospective.md`。
