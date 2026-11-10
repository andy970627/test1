# 整夜自動驗證：木馬之夜殘響掩護（2026-11-11）

- 產生：2026-11-10T16:06:09.029Z；規則與聲音版本：提交 37db718
- 門檻：`docs/design/2026-11-10-core-direction-illusion.md` 第 7 節（7.5 錄音、7.8 程式玩家；7.1 的「σ 0.12 通關 50～85%」已被 7.8 作廢，通關率只列不判）。
- 重產這份報告：`node tools/telemetry/overnight-report.mjs --sim tools/playtest-recorder/out/overnight-sim-1111.json --cover tools/playtest-recorder/out/overnight-cover-1111 --gap tools/playtest-recorder/out/overnight-gap-1111 --steps tools/playtest-recorder/out/overnight-steps-1111 --out docs/process/overnight-validation-2026-11-11.md`
- 錄音原始輸出在 `tools/playtest-recorder/out/`，不進 git；程式玩家 JSON 在 `tools/playtest-recorder/out/overnight-sim-1111.json`（同樣不進 git）。

## 結論

- 判定 13 項：過 6、不過 5、無資料 2（另 3 項只列不判）。
- 不過：完美踩拍：通關率（不停） 99.6%（500 局）；σ 0.12 錯了要付代價：通關時間中位 ÷ 完美玩家，且每局平均進高度警覺（不停） 44.3 秒 ÷ 44.1 秒 ＝ 1.01 倍；高度警覺 0.55 次／局；警戒輕版重擊突出中位（不停，原始） 7.3 dB（3 個警戒窗）；餘韻中位（不停，喇叭模擬） 0.49 秒（平均背景 0.12 秒，參考）；11 個一般窗；警戒輕版重擊突出中位（不停，喇叭模擬） 7.6 dB（3 個警戒窗）。
- 無資料：不合拍與合拍腳步 1～4 kHz 差（不停）；不合拍與合拍腳步 1～4 kHz 差（留空檔）。

## 門檻對照

| 項目 | 數字 | 門檻 | 結果 | 來源指令 |
|---|---|---|---|---|
| 只按前進：通關率（不停） | 0.0%（500 局） | ≤ 30% | ✅ 過 | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| 完美踩拍：通關率（不停） | 99.6%（500 局） | 100% | ❌ 不過 | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| σ 0.12 錯了要付代價：通關時間中位 ÷ 完美玩家，且每局平均進高度警覺（不停） | 44.3 秒 ÷ 44.1 秒 ＝ 1.01 倍；高度警覺 0.55 次／局 | ≥ 1.2 倍，且 ≥ 1 次／局 | ❌ 不過 | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| σ 0.25 越不準越吃虧：通關率比 σ 0.12 低，或通關時間中位再多（不停） | 通關率 80.4% vs 93.2%（低 12.8 個百分點）；時間中位 44.6 秒 vs 44.3 秒（1.00 倍） | 低 ≥ 10 個百分點，或 ≥ 1.2 倍 | ✅ 過 | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| σ 0.12 通關率（不停；只列，7.8 不當門檻） | 93.2%（500 局） | — | （只列） | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| σ 0.25 通關率（不停；只列，7.8 不當門檻） | 80.4%（500 局） | — | （只列） | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |
| 餘韻中位（不停，原始） | 0.65 秒（平均背景 0.31 秒，參考）；11 個一般窗 | 0.5～0.8 秒 | ✅ 過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 重合擊突出中位（不停，原始） | +22.5 dB（最小 20.4） | ≥ 12 dB | ✅ 過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 警戒輕版重擊突出中位（不停，原始） | 7.3 dB（3 個警戒窗） | ≥ 8 dB | ❌ 不過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 餘韻中位（不停，喇叭模擬） | 0.49 秒（平均背景 0.12 秒，參考）；11 個一般窗 | 0.5～0.8 秒 | ❌ 不過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 重合擊突出中位（不停，喇叭模擬） | +22.4 dB（最小 20.4） | ≥ 12 dB | ✅ 過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 警戒輕版重擊突出中位（不停，喇叭模擬） | 7.6 dB（3 個警戒窗） | ≥ 8 dB | ❌ 不過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 不合拍與合拍腳步 1～4 kHz 差（不停） | 9.3 dB（不合拍 1 步、合拍 1 步） | ≥ 12 dB（兩種各 ≥ 3 步才判） | — 無資料 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111` |
| 不合拍與合拍腳步 1～4 kHz 差（留空檔） | 樣本不夠（不合拍 0 步、合拍 3 步） | ≥ 12 dB（兩種各 ≥ 3 步才判） | — 無資料 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover gap --out tools/playtest-recorder/out/overnight-gap-1111` |
| 不合拍與合拍腳步 1～4 kHz 差（不停・腳步測試段） | 25.8 dB（不合拍 19 步、合拍 30 步） | ≥ 12 dB（兩種各 ≥ 3 步才判） | ✅ 過 | `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 45 --cover cover --step-test --no-video --out tools/playtest-recorder/out/overnight-steps-1111` |
| 通關時間中位：完美玩家，舊版 vs 新版（只列） | 舊版 87.9 秒、新版 44.1 秒（程式玩家） | — | （只列） | `node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json` |

## 程式玩家（Node 直接跑規則層）

指令：`node tools/telemetry/overnight-sim.mjs --n 500 --out tools/playtest-recorder/out/overnight-sim-1111.json`；500 局 × 8 組，共 0.7 分鐘。每局一條命、最多 420 秒；seed 1～500（t0 與幀率抖動由 seed 決定）。

| 模式 | 玩家 | 局數 | 通關率 | 通關時間中位（秒） | 每局進高度警覺 | N1（自己規則／同一把尺） | 走到窄巷／城門 | 各區平均停留秒數（1／2／3／4） | 死因分布 |
|---|---|---|---|---|---|---|---|---|---|
| 不停 | 只按前進 | 500 | 0.0% | — | 1.63 次 | 80.4%／80.4% | 63.4%／9.6% | 1.8／9.8／8.0／10.7 | caught_move_high 436（87%）、caught_seen 60（12%）、caught_loud 4（1%） |
| 不停 | 完美踩拍 | 500 | 99.6% | 44.1 | 0.08 次 | 95.1%／95.1% | 100.0%／99.6% | 3.6／8.4／12.3／22.5 | caught_seen 2（0%） |
| 不停 | σ 0.12 起步誤差 | 500 | 93.2% | 44.3 | 0.55 次 | 93.9%／93.9% | 96.0%／93.4% | 3.8／8.6／15.9／22.2 | belly_seen 16（3%）、caught_calm_slow 8（2%）、belly_move_high 4（1%）、caught_seen 3（1%）、逾時（420 秒沒過） 3（1%） |
| 不停 | σ 0.25 起步誤差 | 500 | 80.4% | 44.6 | 0.66 次 | 93.7%／93.7% | 86.6%／80.4% | 4.2／8.7／15.4／21.6 | belly_seen 43（9%）、caught_calm_slow 26（5%）、belly_move_high 24（5%）、caught_seen 3（1%）、caught_move_high 1（0%）、逾時（420 秒沒過） 1（0%） |
| 留空檔 | 只按前進 | 500 | 0.0% | — | 0.91 次 | 9.1%／89.5% | 0.0%／0.0% | 0.8／9.4／—／— | belly_move_high 341（68%）、caught_move_high 159（32%） |
| 留空檔 | 完美時機（舊版沒有踩拍走） | 500 | 100.0% | 87.9 | 0.00 次 | 38.7%／77.6% | 100.0%／100.0% | 4.0／13.5／49.9／23.8 | 無 |
| 留空檔 | σ 0.12 起步誤差 | 500 | 70.0% | 93.2 | 1.31 次 | 38.7%／80.7% | 95.8%／72.6% | 4.1／13.5／44.0／23.9 | caught_seen 140（28%）、caught_move_high 9（2%）、belly_seen 1（0%） |
| 留空檔 | σ 0.25 起步誤差 | 500 | 15.0% | 99.2 | 2.61 次 | 37.6%／89.2% | 60.0%／17.8% | 4.5／13.8／32.3／23.0 | caught_seen 277（55%）、caught_move_high 112（22%）、belly_move_high 29（6%）、belly_seen 7（1%） |

規則常數：`COVER_MODE` true、`COVER_EAR_P` 0、`HIGH_P` 0.6、`R_BASE` 3、`R_GAIN` 10、`BLIND_LEN` 0.6、`STEP_WIN` 0.08、`MASK_GAIN` 0.3、`SUSP_MOVE` 0.9、`SUSP_STEP` 0.2、`ALERTED_DURATION` 10。

- N1＝主動時間比例（玩家至少有一個會改變狀態的合法動作的時間 ÷ 遊玩時間），每局平均。表裡兩個數字：「自己規則」＝各版照自己的規則量（舊版沒有踩拍走）；「同一把尺」＝兩版都用新版量法（設計席 7.6、7.8：簡報要對比只能用這個，並註明是程式玩家）。
- 玩家定義：`tools/telemetry/troy-bots.js`，`makeBot` 與 `activeNow` 逐字照搬規則角色的 `risset.test.js`（提交 11b1944），數字和規則角色的測試同一套模型。「完美踩拍」＝固定策略＋踩拍走；舊版沒有踩拍走，同一個玩家就是完美時機的固定策略。
- 「σ 0.12／0.25 起步誤差」（規則角色的模型）：每次從停下到起步抽一個 e ~ N(0, σ)，用「t − e 那一刻」的狀態（在不在掩護窗、會不會踩在鼓點上、相位）決定要不要起步，e < 0 太早、e > 0 太晚；走著、停下、衝刺、暗殺、城門都用真實狀態；起步後重抽。
- 「每局進高度警覺」＝規則發出 `alerted` 音效的次數（衛兵從巡邏轉高度警覺），全部局平均（含沒過的局）。通關時間中位只算通關局。
- 死因代號是規則的 `failCode`（`belly_*`＝木馬腹中、`caught_*`＝其他區；`move_high`＝節奏快時腳步露聲、`seen`＝被看見、`loud`＝聲音太大）；`timeout`＝420 秒沒過。

## 錄音檢查：鼓聲不停（COVER_MODE = true）

資料夾 `tools/playtest-recorder/out/overnight-cover-1111`（報告 `report.md`、有聲影片 `playtest.mp4`）；指令：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover cover --out tools/playtest-recorder/out/overnight-cover-1111`

| 檢查 | 原始 | 喇叭模擬（200 Hz 高通） | 數字（原始） |
|---|---|---|---|
| 掩護窗：重合擊在 300～1200 Hz 突出、餘韻長度、警戒輕版（殘響掩護版） | ❌ 不過 | ❌ 不過 | 突出：中位 +22.5 dB、最小 +20.4 dB（過）；餘韻：中位 0.7 秒（0.5～0.8）（過），背景改用平均時 0.3 秒；整體比前後：中位 +10.5 dB（過）（11 次一般窗）；警戒輕版 3 次：突出中位 +7.3 dB（不過）；另 1 次窗內有玩家自己的動作音，照列不計 |
| 火光跟著實際速度（danger）走、不每循環掉回 | ✅ 過 | ✅ 過 | 4003 幀：和 FIRE_BASE + FIRE_P_GAIN × danger 差 > 0.02 的 0 幀；掉回 0 次；相關係數 fire×danger 1、fire×p -0.048；fire 0.55～0.93、danger 0.31～0.89 |
| 起音時間與規則拍點的誤差 | ✅ 過 | ✅ 過 | Risset：中位 ／誤差／ 2.7 ms、P90 16.5 ms、帶正負號中位 -2.4 ms、±30 ms 命中 95%（375 拍）；低音：中位 1.7 ms、命中 97%（29 拍）；期望拍另含追殺第 5 層 0 拍（顯著的 0）、假驟降尾音 0 拍（極輕，不比對） |
| 警戒時低頻最突出 | ✅ 過 | ❌ 不過 | 警戒：低頻 -24 dB、中頻 -27.3 dB、高頻 -33.9 dB（低−中 3.3 dB）；巡邏：低頻 -34.9 dB、中頻 -45 dB、高頻 -52.2 dB（低−中 10.1 dB） |
| 有無爆音（削峰） | ✅ 過 | — 無資料 | 削峰樣本 0（16-bit）／0（浮點 ≥ 0.999）；峰值 -0.9 dBFS |
| 有無長時間完全無聲或丟拍 | ✅ 過 | ✅ 過 | 無聲段 0 個；規則拍點 ±40 ms 內找不到起音：1／404（0.2%） |
| 盲區前 0.4 秒的預告音在 1～3 kHz 聽得出來 | ✅ 過 | ✅ 過 | 相對前 1 秒平均：中位 +25.4 dB、最小 +21 dB、≥ +6 dB 的 12／12 次（+24.8、+22.7、+25.5、+24.3、+26.9、+25.4、+25.4、+26.9、+26.3、+22.3、+26.1、+21） |
| 警戒時低音拍在 200～600 Hz 聽得出來 | ✅ 過 | ✅ 過 | 警戒 3 拍：相對前 1 秒背景 中位 +11.2 dB、最小 +11.2 dB、≥ +6 dB 的 3 拍（+21.4、+11.2、+11.2）；巡邏時（對照，不計）27 拍中位 +6.5 dB |
| 不合拍腳步比合拍腳步在 1～4 kHz 突出 ≥ 12 dB | — 無資料 | — 無資料 | 樣本不夠（每種要 ≥ 3 步；^step_?loud$ 1 步、^step_?masked$ 1 步，差 9.3 dB 只列） |

## 錄音檢查：留空檔（COVER_MODE = false）

資料夾 `tools/playtest-recorder/out/overnight-gap-1111`（報告 `report.md`、有聲影片 `playtest.mp4`）；指令：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90 --cover gap --out tools/playtest-recorder/out/overnight-gap-1111`

| 檢查 | 原始 | 喇叭模擬（200 Hz 高通） | 數字（原始） |
|---|---|---|---|
| 盲區時整體音量比前後低 | ✅ 過 | ✅ 過 | 中位 31.7 dB、最小 17.7 dB（14 次盲區）；另 1 次盲區內有玩家自己的動作音（13.863 秒：dash、trapdoor、checkpoint），照列不計 |
| 火光跟著實際速度（danger）走、不每循環掉回 | ✅ 過 | ✅ 過 | 4000 幀：和 FIRE_BASE + FIRE_P_GAIN × danger 差 > 0.02 的 0 幀；掉回 0 次；相關係數 fire×danger 1、fire×p -0.081；fire 0.15～0.93、danger 0.31～0.89 |
| 起音時間與規則拍點的誤差 | ✅ 過 | ✅ 過 | Risset：中位 ／誤差／ 2.3 ms、P90 14.2 ms、帶正負號中位 -1.8 ms、±30 ms 命中 96%（382 拍）；低音：中位 1.2 ms、命中 100%（28 拍）；期望拍另含追殺第 5 層 0 拍（顯著的 0）、假驟降尾音 0 拍（極輕，不比對） |
| 警戒時低頻最突出 | ✅ 過 | ❌ 不過 | 警戒：低頻 -25.3 dB、中頻 -28.3 dB、高頻 -35.2 dB（低−中 3 dB）；巡邏：低頻 -34.6 dB、中頻 -44 dB、高頻 -51.6 dB（低−中 9.4 dB） |
| 有無爆音（削峰） | ✅ 過 | — 無資料 | 削峰樣本 0（16-bit）／0（浮點 ≥ 0.999）；峰值 -0.9 dBFS |
| 有無長時間完全無聲或丟拍 | ✅ 過 | ✅ 過 | 無聲段 0 個；規則拍點 ±40 ms 內找不到起音：6／410（1.5%） |
| 盲區前 0.4 秒的預告音在 1～3 kHz 聽得出來 | ✅ 過 | ✅ 過 | 相對前 1 秒平均：中位 +26.3 dB、最小 +22.7 dB、≥ +6 dB 的 12／12 次（+25、+26.3、+25.3、+26.5、+26.3、+25.3、+26.7、+27、+24.9、+25.1、+22.7、+27） |
| 警戒時低音拍在 200～600 Hz 聽得出來 | ✅ 過 | ✅ 過 | 警戒 3 拍：相對前 1 秒背景 中位 +13.6 dB、最小 +12.1 dB、≥ +6 dB 的 3 拍（+19.1、+12.1、+13.6）；巡邏時（對照，不計）26 拍中位 +8 dB |
| 不合拍腳步比合拍腳步在 1～4 kHz 突出 ≥ 12 dB | — 無資料 | — 無資料 | 樣本不夠（每種要 ≥ 3 步；^step_?loud$ 0 步、^step_?masked$ 3 步） |

## 錄音檢查：鼓聲不停・腳步測試段（程式玩家在第 1 區離拍起步，專門累積腳步樣本）

資料夾 `tools/playtest-recorder/out/overnight-steps-1111`（報告 `report.md`、有聲影片 `playtest.mp4`）；指令：`node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 45 --cover cover --step-test --no-video --out tools/playtest-recorder/out/overnight-steps-1111`

| 檢查 | 原始 | 喇叭模擬（200 Hz 高通） | 數字（原始） |
|---|---|---|---|
| 掩護窗：重合擊在 300～1200 Hz 突出、餘韻長度、警戒輕版（殘響掩護版） | ✅ 過 | ❌ 不過 | 突出：中位 +22.7 dB、最小 +19.8 dB（過）；餘韻：中位 0.6 秒（0.4～0.9）（過），背景改用平均時 0.2 秒；整體比前後：中位 +8.5 dB（過）（7 次一般窗）；這次沒有警戒窗（輕版不判） |
| 火光跟著實際速度（danger）走、不每循環掉回 | ✅ 過 | ✅ 過 | 2145 幀：和 FIRE_BASE + FIRE_P_GAIN × danger 差 > 0.02 的 0 幀；掉回 0 次；相關係數 fire×danger 1、fire×p 0.361；fire 0.72～0.78、danger 0.57～0.67 |
| 起音時間與規則拍點的誤差 | ✅ 過 | ✅ 過 | Risset：中位 ／誤差／ 1.4 ms、P90 11.1 ms、帶正負號中位 -1 ms、±30 ms 命中 98%（191 拍）；低音：中位 1.6 ms、命中 100%（14 拍）；期望拍另含追殺第 5 層 0 拍（顯著的 0）、假驟降尾音 0 拍（極輕，不比對） |
| 警戒時低頻最突出 | — 無資料 | — 無資料 | 這次錄製沒有警戒區段 |
| 有無爆音（削峰） | ✅ 過 | — 無資料 | 削峰樣本 0（16-bit）／0（浮點 ≥ 0.999）；峰值 -0.9 dBFS |
| 有無長時間完全無聲或丟拍 | ✅ 過 | ✅ 過 | 無聲段 0 個；規則拍點 ±40 ms 內找不到起音：0／205（0.0%） |
| 盲區前 0.4 秒的預告音在 1～3 kHz 聽得出來 | ✅ 過 | ✅ 過 | 相對前 1 秒平均：中位 +19.7 dB、最小 +13 dB、≥ +6 dB 的 7／7 次（+19.7、+22.4、+13、+24.9、+17.3、+25.1、+17.6） |
| 警戒時低音拍在 200～600 Hz 聽得出來 | — 無資料 | — 無資料 | 這次錄製沒有警戒時的低音拍；巡邏時（對照，不計）15 拍中位 +7 dB |
| 不合拍腳步比合拍腳步在 1～4 kHz 突出 ≥ 12 dB | ✅ 過 | ✅ 過 | 相對前 0.3 秒的上升中位：^step_?loud$ 26 dB（19 步）、^step_?masked$ 0.2 dB（30 步），差 25.8 dB；絕對峰值 -25.6 對 -44.7 dB（差 19.1 dB）；合拍腳步中附近沒有顯著鼓點的 13 步峰值中位 -53.5 dB |

## 注意

- 餘韻的主判定用「窗前 1.0～0.15 秒包絡的**中位數** + 3 dB」當背景（總控 11/10 夜決定）：和當初量出 1.3 秒、訂 0.5～0.8 秒門檻是同一個量法。設計 7.5 文字寫的「窗前 1 秒平均」並列在門檻表當參考：平均會被窗前的鼓點拉高（鼓聲不停，窗前 1 秒裡有好幾下鼓），背景變高、包絡更早回到「背景 + 3 dB」以內，所以同一窗量出的餘韻比較短（11/10 夜試錄：中位數背景 1.0 秒、平均背景 0.4 秒）。設定在 `analyze.mjs` 的 `TH.coverTailBase`。
- 錄音用無頭 Chromium：預設 `--mute-audio`（不從喇叭出聲，分接點在 destination 前，錄音不受影響）、網址加 `nolock=1`（不鎖實體滑鼠）。**不加 `mute=1`**：它把遊戲總閘音量設 0，會錄到靜音。
- 程式玩家照抄規則測試的策略，數字代表「這套策略」的表現，不是真人；真人的手感以 11/11 試玩為準。
- 警戒輕版只量到 3 個警戒窗（錄音程式玩家在第 1 區故意喘氣引起一次起疑，安撫 4 拍後就結束），樣本少；差 1 dB 上下的結果要多錄幾段才能下定論。
- 完美踩拍玩家 500 局有 2 局沒過（caught_seen 2（0%））：規則測試的 50 局全過，500 局才出現；屬於程式玩家策略（看得到精確感知半徑仍偶爾被看見）或規則的邊界情況，要規則角色用對應 seed 查。
