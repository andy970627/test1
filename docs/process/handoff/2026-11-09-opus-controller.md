# 交接：本機總控改由 Opus 接手（2026-11-09 晚）

給「test1 總控（Opus）」工作階段。架構依據 `docs/process/ai-collaboration.md` 第 13、14 節（14.3 是你和 Fable 設計席的分工表，14.3 末尾是叫 Fable 的三個門檻）。

## 你是誰、在哪
- 你是本機總控：拆工作、派角色、收訊、審產出、提交推送、記錄、向使用者報告。L3 設計抉擇不自己拍板，叫 Fable 設計席。
- 工作資料夾：`C:\Users\恩\test1\.claude\worktrees\openrouter-api-key-setup-383957`，分支 `claude/gracious-bardeen-vwo4rr`（最新 dc26dae 之後）。**主資料夾 `C:\Users\恩\test1` 是分離 HEAD、有使用者未提交的 docs 修改，不要碰。**
- 開工前 `git pull`；每完成一項就 `git add <路徑>` 提交推送（長期授權）。只提交自己或角色改的檔。
- 一律繁體中文（`CLAUDE.md`）；使用者要選的事用選擇題，**選項一句話即可，比較細節先用表格寫在訊息裡**（使用者 11/09 要求）。

## 同伴（用 `ListAgents` 認名字，`SendMessage` 傳訊）
| 名稱 | 角色 | 狀態 |
|---|---|---|
| test1 規則 | `risset.js`／`rules.js`／`vengeance.js` 與測試 | 待命；11/10 晚重置後審 PR #10 |
| test1 聲音 | `prototypes/*/audio.js` | 待命 |
| test1 畫面 | `index.html`／`nav.js`／`telemetry.js` | 待命 |
| test1 錄音與工具 | `tools/`、`.github/workflows/` | 待命；本機 playwright 套件待裝、`record.mjs` 第 40 行 `NODE_PATH` 要改 `path.delimiter` |
| test1 夜班｜盯 CI、長任務、接本機訊息 | 雲端，盯 CI 與 PR #10 事件，不改不合併 | 已通知；訊息雙向可通 |
| test1 設計席（Fable） | 原總控對話，只回 L3 題，寫 `docs/` 不提交 | 待叫 |
角色規矩：不提交、不推送；改完回訊你；人工核准事項寫 `docs/process/approvals.md` 再回訊；每輪更新 `docs/process/agent-notes/<角色>.md`；同時最多 2～3 個角色在跑。角色的筆記已填好（11/09），派工前先叫它們讀自己的筆記，不要重讀規格。

## 現況
- 第二輪試玩（喇叭）：聲音訊號過關，問題在「等、追殺無解、沒回饋、聲音沒綁世界」（`docs/process/playtest-notes.md` 2026-11-09 節）。
- 核心機制重審：`docs/design/2026-11-09-core-mechanics-review.md`。使用者選 **4A**（M2 追殺生路、M3 行動回饋、M4 火光綁速度、M7 感知放遠、M8 漸進後果）；`HUNT_STEP_ESCAPE` 3、`ALERTED_DURATION` 10；M9 教學重排接著做、M10 木馬腹中練習報告後。
- 規則層已派 **Copilot 雲端代理：PR andy970627/test1#10**（base 是工作分支；只改 `risset.js`、`risset.test.js`）。簡報與驗收標準在 PR 說明裡（常數名、事件名 `alerted`／`alert_over`／`hunt_step {index}`／`hunt_slip`／`dash {hunt}`、匯出 `fireBrightness`、`blindWindows`、12 條測試）。
- 報告：`docs/process/report-outline.md` 第 0 節，主軸 **11/11 試玩後選**；沒有可玩改版就用備選一（洞穴）。Gamma 還沒生成，素材清單在第 4 節。
- 用量：11/09 晚週額度 86%、Fable 88%，**11/10 22:00（台北）重置**。重置前不要派 Claude 角色做事；Copilot、agy 不吃 Claude 額度。

## 接下來（依序）
1. **Copilot 交卷（PR #10）**：`gh agent-task view 10 --log` 或看 PR。先自己對照 PR 說明的「七、驗收標準」逐項看；CI 綠且驗收過 → 重置後叫規則角色再審一次、補洞；都過 → 合併進工作分支、推送、關 PR、刪分支（專案規則）。審查發現要設計判斷的事（改到範圍外、和 13 條規則衝突）→ 叫 Fable。
2. **11/10 22:00 重置後**：規則角色審 PR #10；同時派聲音角色接 4A 事件（`alerted` 嗡鳴 200～400 Hz、`alert_over`、`hunt_step` 確認音、`hunt_slip`「鏗」2～4 kHz、追殺 `dash {hunt}` 風切、`dash`／`takedown` 回饋音）、畫面角色接（速度線、暗殺白閃、`game.fire` 火光亮度、衛兵火把顏色隨 `q.susp`、`alerted` 畫面邊緣橘暈、追殺殘影）、錄音與工具角色修本機 playwright 與 `NODE_PATH`、加 `fireSync` 檢查。三個角色同時跑就到上限。
3. **11/11**：整合、跑全部測試（`node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js`）、打包（`bash tools/build-itch.sh`）或重新發布試玩頁（發布屬人工核准：寫 approvals 再問使用者；`capabilities` 省略才沿用資料庫），請使用者喇叭與耳機各玩一輪，回饋填 `playtest-notes.md`，然後用選擇題請使用者選報告主軸。
4. **11/12 報告**：照 `report-outline.md`；Gamma 用連接器生成；錄影與剪輯在本機；YouTube 片段時間點要使用者挑。
5. **每天收工**：`docs/process/production-log.md` 加一行；協作紀錄 `~/.claude/orchestration/log.md` L2 以上加一行（格式見全域規則）。
6. **一週結束（11/16）**：`retrospective.md` 寫「卡住的地方、用量、要不要全搬、Opus 總控審了幾件／退回幾件／叫了 Fable 幾次」。

## 叫 Fable 設計席的方式
`SendMessage` 給「test1 設計席（Fable）」，格式：題目一句；要讀的檔與節；要回的形式（選項表或約定表）；期限。Fable 會寫一份 `docs/` 檔並回你路徑，由你提交。門檻（任一成立才叫）：會改核心玩法或規則層介面；兩份以上矛盾來源要裁決；做錯要重做兩個以上角色的工作。

## 待使用者決定（已登記）
- 報告主軸（11/11）。
- 合成版規格 18.3 節的小確認（`2026-11-08-vengeance-v2-spec.md`）。
- 試玩頁重新發布、分享（approvals）。

## 去哪找
`CLAUDE.md`、`docs/process/handoff/2026-11-08.md`（更早的現況與試玩網址）、`docs/process/agent-notes/README.md`、`docs/process/approvals.md`、`docs/design/concepts-overview.md`。
（本文件不含金鑰或個資。）
