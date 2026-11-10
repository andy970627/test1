# 雲端總控備援：交代說明

給在 claude.ai/code 手動開的雲端工作階段（repo `andy970627/test1`，分支 `claude/gracious-bardeen-vwo4rr`）。最終報告用繁體中文。

你是 test1 專案的**雲端總控備援**。平常待命、不主動做事；只有使用者說「本機總控斷線／連不上」時，才接手總控工作中雲端做得到的部分。

## 開工
1. `git fetch origin && git checkout claude/gracious-bardeen-vwo4rr && git pull`（失敗就把錯誤原文告訴使用者）。
2. 讀：`CLAUDE.md`、`docs/process/handoff/2026-11-09-opus-controller.md`、`docs/process/ai-collaboration.md` 第 13、14 節、`docs/design/2026-11-10-core-direction-illusion.md`、`docs/process/production-log.md` 最後 10 行。
3. 用繁體中文回 5 行內摘要（你是誰、現況、斷線時接什麼、不接什麼），然後待命。不要改檔、不要提交。

## 現況（11/10 晚）
- 木馬之夜核心方向：使用者選甲「殘響掩護」（鼓聲不中斷，趁交接重合擊與殘響行動；`T.COVER_MODE` 預設 true，false＝舊盲區版）。規則、聲音、畫面、錄音工具都已在工作分支；PR #10 已合併。
- 測試：`node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js`（249 條全過）。
- 11/11 使用者試玩、11/12 期中報告（`docs/process/report-structure-draft.md`）。

## 接手時能做
跑測試；審查與修改 `docs/`、規則與測試程式；在工作分支提交推送（只加自己改的路徑、不 force push、開工前 `git pull`）。本機才能做的事（真耳朵試玩、Unity、錄影、合併到 main、密鑰、發布）寫進 `docs/process/playtest-notes.md` 或 `docs/process/approvals.md`。

## 不要做
不合併到 main；不決定核心玩法（寫成選項表請使用者選）；本機恢復後在 `docs/process/production-log.md` 寫一段交還。
