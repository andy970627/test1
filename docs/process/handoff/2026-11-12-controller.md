# 交接：11/12 凌晨總控進度（給雲端備援與下一任總控）

最終報告用繁體中文。分支 `claude/gracious-bardeen-vwo4rr`，最新提交見 `git log`（寫這份時是 876138c）。

## 規矩（不變，只補新的）
- 先讀 `CLAUDE.md`、`docs/process/handoff/2026-11-10-controller-night.md` 的「規矩」段、`docs/process/agent-notes/README.md`。
- **提交前一律跑嚴格檢查**：以 HEAD 為底的乾淨副本（`git archive HEAD`），只換上要提交的檔，跑
  `node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js`，
  有任何失敗就不提交（用 `&&` 串，不要用 `;` 或 `grep`）。總控曾兩次在測試失敗時照樣提交，原因就是用 `;` 串。測試現在要跑兩分鐘以上。
- 提問一律用選擇題；誰問的題誰收；角色結果寫筆記，需要總控提交、合併、裁決時才傳訊（全域 `~/.claude/CLAUDE.md`）。
- 原本的總控對話不要再叫醒（使用者 11/11 要求）。

## 現況
- **報告**：今天（11/12）期中報告。主軸「錯覺是主題，進度照實講」；開頭依序播 現行→U1→V4。報告草稿 `docs/process/report-structure-draft.md`、決定 `report-decisions-2026-11-11.md`、修改清單 `report-revision-checklist-1111.md`。簡報 https://claude.ai/artifact/XftoAaPwCynB575KgDw5Yj 由報告工作階段維護。試玩影片等追殺與關卡修好後重錄，現在的是佔位。
- **開關**：`T.MOVES_MODE` 預設開（跑蹲版，Shift 跑、C 蹲），`?moves=0` 是報告版（數字以 c1d4aa3 為準、一律舊鼓聲）；`T.HORSE_MODE` 預設關（`?horse=1`）；`T.DRUMS` 跑蹲版預設 `new`（`?drums=old`）。每批改動都要證明開關關著時，整夜 500 局和 c1d4aa3 逐字相同（`--moves 0`）。
- **測試**：新版 347 條全過（876138c）；報告版 257 條。
- **整夜驗證（跑蹲版）**：完美 98.4%、σ0.12 92.6%、σ0.25 約 92%。
- **追殺**：被追殺的局因追殺輸掉：完美 57%、σ0.12 53%、σ0.25 39%（修前幾乎 100%）。剩下的輸局在第 3 區窄巷，留給報告後的關卡重排。
- **追殺聲音（設計席第 18 節）**：逃的時候加速脈衝，鎖定後把追殺循環等分 10 份；躲的時候鼓聲低通、拉遠，追兵腳步比鼓聲響。錄音檢查 18.5 四條全過（34efd75）；18.7 規定新鼓聲時逃的時候不給踩拍掩護（c267299、225f077）。
- **新鼓聲**：第一步（換音色）已進遊戲；第二步（三對二重音）等使用者試玩後再決定；第三步（最響一擊不固定在循環起點）報告後做。
- **最近修的**：停下時可以提前按住空白鍵直接屏息（876138c）；CI 只改網頁或文件時不跑 Unity（799c9df，還沒在 GitHub 上驗證）。
- **本機工具**：試玩切換台 `prototypes/switch.html`（要先開本機伺服器 `npx http-server@14.1.1 prototypes -p 8765`）；試聽頁 artifact https://claude.ai/artifact/7jdZF9GMpQ79WKuocyJ8Yz ；換層試驗場 https://claude.ai/artifact/KhAkA4Q6RDXt5zY16gYbpz 。
- **分工回顧**：`docs/process/collab-reflection-2026-11-11.md`（總控判讀）與 `collab-review-data-2026-11-11.md`（數據）。

## 卡住、要使用者處理
- **GitHub Actions 停了**：「付款失敗或支出上限需要提高」，CI 的任務根本沒開始跑。使用者要到 GitHub Settings → Billing & plans 處理。這種失敗通知不是程式問題，不用修、不用重跑。
- 設計席的 effort 要使用者自己調高（工具不讓總控改）。

## 等使用者真耳朵
新鼓聲在遊戲裡有沒有加速感；逃和躲的聲音分不分得出來；走法試驗場（16.3 三題）；視角還會不會自己轉；城門的鬼影與震動；木馬共鳴的塵土。答案記在 `docs/process/playtest-notes.md`。

## 未提交
- `docs/process/report-structure-draft.md` 有報告工作階段改到一半的內容（第 4 列新數字後面還留著舊句「聲音角色在做、未完成」，和前面「已進遊戲」矛盾）。等報告工作階段收尾再提交。

## 雲端備援接手時
照 `cloud-backup-brief.md`：只在使用者說本機總控斷線時接手；能做的是跑測試、改文件與規則、在工作分支提交推送；不合併 main、不決定核心玩法、不重跑被額度擋下的 CI。
