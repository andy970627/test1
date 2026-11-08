# 專家視角：五種專家會怎麼做這個專案

日期：2026-11-08　狀態：**分析文件，供使用者審閱**；只新增本檔，不改其他文件與程式。
依據：`CLAUDE.md`、`README.md`、`2026-11-08-music-core-concept.md`（總綱）、`2026-11-06-risset-troy-prologue.md` 第 2、6、7、8 節、`2026-11-08-vengeance-v2-spec.md` 第 1～5、15、19 節、`2026-11-07-troy-council-review.md` 第 1 節、`2026-11-07-troy-audio-audit.md` 第 1 節、`docs/process/playtest-notes.md`、`retrospective.md`、`ai-collaboration.md` 第 7～8 節、`2026-11-07-audio-tools-comparison.md` 第 1 節；程式只讀不改（`prototypes/troy-prologue/index.html` 第 1522 行、`audio.js` 開頭註解、`tools/playtest-recorder/analyze.mjs` 的 `TH`）。

回答使用者的四個問題：(1) 專家會做哪些我們沒想到的事；(2) 他們看哪些第一手資料；(3) 用哪些方法和工具；(4) 怎麼證明結果有用。每個主張都對照我們現況（有做／沒做／差在哪）。來源用 WebSearch 查過存在；查不到或只查到二手引述的標「待確認」。

**「我們現況」的縮寫**：【木】木馬之夜、【箭】比箭 Risset 版、【廳】大廳復仇；錄音 8 項＝`analyze.mjs` 的 blind／onset／alertLow／clip／silence／preBlindMid／bassMid／stepBand；N1～N11＝總綱 7.2 節的待補驗收；程式玩家＝`vengeance.test.js` 最後一項與 v2 規格第 15 節的甲乙丙丁。

---

## 0. 一頁總覽

| 專家 | 最重要的一件「我們沒想到的事」 | 對照現況 |
|---|---|---|
| 節奏遊戲設計師 | **判定窗要「量」出來，不是「定」出來**：先用延遲校準頁量每位玩家的輸出延遲與個人偏移，再決定 0.6 秒夠不夠；而且人會提早按（負平均非同步 20～80 ms），窗要不對稱 | 窗是設計時定的 0.6／0.5 秒；只在【木】扣 `outputLatency`，沒有校準頁、沒有可調偏移、沒有不對稱窗 |
| 遊戲音訊設計師 | **用響度（LUFS）而不是 dB RMS 驗收，而且喇叭與耳機各一套混音**（真的切換匯流排，不只是「請戴耳機」） | 錄音工具量 dB 差值與頻帶能量；喇叭只用 200 Hz 高通模擬；沒有 LUFS、沒有兩套混音 |
| 玩家研究員 | **第一次試玩就用 RITE：一人一輪、測完立刻改、下一人測改過的**；同時把「聽不聽得出」做成可重複的聽辨任務（二選一強迫選擇），不只問感想 | 11/07 一人、喇叭、問卷式回饋；N10 計畫 3～5 人，但沒有任務腳本、沒有量表、沒有編碼方式 |
| 潛行關卡設計師 | **先畫節拍表（beat chart）再排區域，並給衛兵「最後已知位置／搜索」狀態**；用遙測熱圖看玩家在哪裡動、在哪裡等 | 【廳】v2 第 1.1 節已是節拍表；【木】沒有；衛兵只有巡邏／起疑／追殺／倒下，沒有搜索；N1～N3 定義了但沒跑 |
| 古典學／敘事顧問 | **木馬與西農根本不在《奧德賽》正文裡（只在第 4、8 卷被提起），完整版在《埃涅阿斯紀》第 2 卷**；另外「D 多利安」是中世紀命名，古希臘的多利安是 E–E，報告裡別說成「古希臘調式」 | `CLAUDE.md` 把木馬列為【經典】是對的，但出處標記該補「【原典：Od. 4、8 卷提及；完整敘事見 Aeneid 2】」；總綱 10 節說「古希臘調式只當音階選擇」已留退路，但 7 節「用古希臘調式（例如多利安或弗里吉安）」會被問 |

---

## 1. 節奏／音樂遊戲設計師

### 1.1 他們會做哪些我們沒想到的事

| 主張 | 我們有沒有做、差在哪 |
|---|---|
| **延遲校準是第一個畫面，不是選項**。節奏遊戲慣例是分兩段校準：先調「聲音對畫面」的偏移，再用「跟著拍按 10 下」量輸入延遲（Rhythm Doctor 的做法，見 Rhythm Quest 開發日誌）；Rock Band 連負值都能調。藍牙 SBC 編碼實測 170～250 ms（RTINGS：Sony WH-1000XM5 241 ms、BackBeat Pro 2 173 ms），比我們 0.6 秒窗的三分之一還多 | 【木】只在 `index.html` 第 1522 行把 `actx.outputLatency || baseLatency` 從按鍵時間扣掉，這只修「瀏覽器報得出來的那段」，藍牙裝置常報 0；沒有校準頁、沒有玩家可調的偏移；N5（模擬 0.25 秒延遲的窗口餘量）還沒跑。審議 E 席「0.6 秒實際只剩 0.1～0.3 秒」至今沒量 |
| **判定窗要不對稱**。跟拍時人會提早按，平均提早 20～80 ms（負平均非同步，Aschersleben 2002），所以早側要比晚側寬 | 【木】有 0.15 秒前沿寬限（早側寬），【廳】低音拍 −0.15／+0.20（晚側寬，理由是補延遲）。兩個原型方向相反，沒有統一的理由；應該是「早側補 NMA、晚側補延遲」兩個都要 |
| **窗長用毫秒分級，對照業界數字**。osu! 的 GREAT 窗是 80 − 6×OD ms（OD 0 → 80 ms，OD 10 → 20 ms；半寬還是全寬兩頁 wiki 說法不一，待確認）；我們的 600 ms 是普通節奏遊戲「Miss 以外全部」的等級，等於「不要求精準，只要求在對的時段」 | 這其實是設計選擇（Crypt of the NecroDancer 的 Ryan Clark 在 Game Design Deep Dive 說他刻意讓節拍幾乎不要求精準，因為緊張時玩家會錯過短窗而受傷），和我們「規則 2：窗以秒計不隨 T 縮」一致，但文件沒把這件事講成有意識的定位。報告時該說：「我們不是節奏遊戲的精準窗，是 NecroDancer 那種寬窗；精準留給壓力曲線」 |
| **「可讀性」用三層：預告（anticipation）→ 事件 → 回饋，每層都要有獨立的視覺與聽覺**。Thumper 的 Flury（GDC 2017）講的是「每個障礙在到達前要先被看見、被聽見」 | 我們規則 1「沒有呈現的拍不拿來判定」與規則 9「空檔前一定有預告」就是這個。差在 N6（呈現覆蓋率 100%）沒跑；以及預告只有聲音（木魚）加月亮鐘，第 3、4 區 `visualAid` 歸 0 時只剩聲音 |
| **動態節奏要有「拍網格不中斷」的保證**。Hi-Fi Rush（Johanas，GDC 2024）全遊戲一切動作吸附到拍，變速時拍網格仍連續 | 【廳】做到了（只在交接換拍數、低音網格不中斷）；【木】是平滑變速（每秒最多 20%），相位累加連續但拍密度在變，玩家在變速中跟不到固定網格。這是設計差異不是錯，但要知道【木】的腳步合拍在變速中會比【廳】難 |
| **難度曲線用「新機制間隔」與「失敗後重試成本」兩條線畫**，不是只看勝率 | N7（每區新機制 ≤ 1）定義了沒跑；【木】第 3 區三件事疊一起已被審議點名。重試成本沒量：失敗回區頭，第 4 區城門若失敗要重走多久沒人算 |
| **無障礙選項是標配**：遊戲速度可調（Game Accessibility Guidelines 列為基本項）、多段難度附說明（Xbox Accessibility Guideline 108）、聲音訊號都有視覺對應（XAG 105）、Celeste 的 Assist Mode 是「選項，不是預設」 | 【廳】有三段難度附拍數說明（符合 XAG 108 的精神）；【木】有難度滑桿（循環秒數）與 `visualAid` 開關；但沒有「遊戲速度」（整體時間縮放）、沒有「判定窗加寬」這種直接的無障礙項，且 `visualAid` 第 3 區起強制歸零，等於把視覺對應拿掉。專家會把「視覺輔助全開」留成無障礙選項，不只是實驗開關 |

### 1.2 他們看哪些第一手資料

- Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review*, 12(6), 969–992. 跟拍的上限約 1.8 秒拍距、下限約 150～200 ms；審議 B 席「超過 1.8 秒人會從跟拍變估時間」的出處就是這裡（本次只查到引用它的論文與 Repp 的 rate-limits 續篇確認 1.8 秒，原文頁碼待確認）。https://link.springer.com/article/10.3758/s13423-012-0371-2 （Repp & Su 2013 續篇）
- Aschersleben, G. (2002). Temporal control of movements in sensorimotor synchronization. *Brain and Cognition*, 48(1), 66–79. 負平均非同步 20～80 ms。https://doi.org/10.1006/brcg.2001.1304
- Clark, R. Game Design Deep Dive: Finding the beat in *Crypt of the NecroDancer*（Gamasutra／Game Developer）。寬窗、不懲罰精準的理由。https://gamedeveloper.com/audio/game-design-deep-dive-finding-the-beat-in-i-crypt-of-the-necrodancer-i-
- Flury, M. (GDC 2017). Seven Years in Alpha: *Thumper* Postmortem. https://gdcvault.com/play/1024291/Seven-Years-in-Alpha-Thumper
- Johanas, J. (GDC 2024). Developing *Hi-Fi RUSH* Backwards and Finding Our Positive Gameplay Loop. https://gdcvault.com/play/1034256/Developing-Hi-Fi-RUSH-Backwards
- Meier, S. (GDC 2012). Interesting Decisions（他特別停下來講節奏遊戲與益智遊戲「乍看沒有有趣的決定」）。https://gdcvault.com/play/1015756/Interesting
- Rhythm Quest 開發日誌第 10 篇（2021-08-06）：兩段式校準、音訊延遲通常是三種延遲裡最大的。https://ddrkirby.com/rhythm-quest/devlog/10.html
- osu! wiki「Overall difficulty」：窗長公式表。https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- Game Accessibility Guidelines（motor／basic：可調遊戲速度）。https://gameaccessibilityguidelines.com/ ；Xbox Accessibility Guidelines 108（難度選項）、105（聲音無障礙）。https://learn.microsoft.com/en-us/gaming/accessibility/guidelines
- RTINGS 藍牙延遲測試頁。https://www.rtings.com/headphones/learn/latency
- Rhythm Heaven 各關的判定窗數字：網路上只有不可靠的粉絲頁，**待確認**，不要引。

### 1.3 用哪些方法和工具

1. **校準頁**（半天）：頁面放一個固定 120 BPM 的節拍器與閃光，玩家跟著按 12 下；取中位數當 `userOffset`，存 `localStorage`；判定全部用 `actAt − userOffset`。同一頁順便顯示 `actx.outputLatency`、`baseLatency` 與量到的偏移三個數字，報告可以直接截圖。
2. **判定分布圖**：每次 dash／takedown／calm／shoot 記 `off`（相對窗中心的毫秒），畫直方圖；看峰值是不是在負側（NMA）、σ 多少。這是 N10 的實作，工具就是現有的 `game.out` 事件加一個 CSV 匯出。
3. **窗長掃描**：規則層已有常數，用程式玩家把 `BLIND_LEN` 從 0.3 掃到 1.0、σ 從 0.05 掃到 0.2，畫成功率等高線；報告一張圖就講清楚「為什麼 0.6」。
4. **預告－事件－回饋三欄表**：每個判定拍一列，三欄各填畫面與聲音；空格就是 N6 會抓到的洞。總綱 6 節的呈現表已經接近，差「預告」欄獨立出來。

### 1.4 怎麼證明有用

| 指標 | 門檻 | 對照我們已有的 |
|---|---|---|
| 真人按鍵偏移中位與 σ（每個判定拍） | 耳機：σ ≤ 80 ms；喇叭：σ ≤ 120 ms；中位在 −80～+40 ms 內 | 就是 N10，只是從「低音拍」擴到全部判定拍 |
| 校準前後成功率差 | 藍牙裝置校準後空檔動作成功率 ≥ 70% | 就是 N5 的真人版 |
| 窗長掃描曲線 | σ=0.12 時成功率 ≥ 80% 的最短窗 ≤ 現行窗 | N4 的延伸，程式玩家可直接跑 |
| 新機制間隔 | 每區 ≤ 1 | N7 |
| 無障礙：視覺輔助全開時，不戴耳機的通關率 | ≥ 戴耳機的 70% | 新；證明「喇叭也成立」不只靠錄音 |

---

## 2. 遊戲音訊設計師／技術音訊

### 2.1 他們會做哪些我們沒想到的事

| 主張 | 我們有沒有做、差在哪 |
|---|---|
| **用響度單位驗收**。業界量的是 LUFS／LKFS（ITU-R BS.1770-4 的 K 加權＋閘控），不是 RMS dB；主機平台有整體響度目標（Sony ASWG-R001：PS3／PS4 −23 LUFS ±2 LU、真峰值 −1 dBTP、響度範圍 ≤ 20 LU，2013 年資料；Audiokinetic 2024 年文章說 PlayStation 已改 −24，待確認）。短期響度（3 秒）與瞬時響度（0.4 秒）比 RMS 更接近聽感 | 錄音 8 項全是 dB 差值與頻帶能量；`audio-tools-comparison.md` 第 86 行已經提到「用 BS.1770 短期響度量盲區會更接近聽感」，但沒做。整體響度目標沒有（網頁遊戲沒有平台規定，但報告若說「盲區安靜 36.5 dB」，音訊人會問那是 RMS 還是 LUFS） |
| **喇叭與耳機是兩套混音，不是一套混音加一句提醒**。做法是兩條匯流排快照（snapshot）：喇叭版把 200 Hz 以下的能量折到 300～600 Hz 的諧波層、拉高 1～4 kHz 的預告音、關掉 HRTF 改成音量差定位；耳機版保留低鼓與 HRTF。切換在開始選單或自動偵測（`navigator.mediaDevices` 拿不到喇叭／耳機，所以是手動） | 「請戴耳機」只放開始選單；11/08 的修正是把關鍵訊號全部搬到 200～4000 Hz，也就是**用喇叭版當唯一版本**，耳機玩家失去了低鼓層原本的層次。專家會分兩版，讓耳機版更好聽、喇叭版更清楚 |
| **頻段配置表（frequency slotting）寫成文件，每個聲音一個主頻段，互不重疊** | 規則 13「音樂層避開功能層頻段」與 v2 第 4.4 節（木魚 1.3～2.8 kHz、盾沿 2.8～4 kHz、低音敲擊 300～550 Hz）已經是這件事，做得比一般學生好。差在沒有一張全表（衛兵腳步、呼吸、碎石、哼唱、門閂、主題動機都還沒排進去），也沒有工具驗證「同一時刻兩個關鍵訊號不在同一頻段」 |
| **側鏈與閃避（ducking）是標準做法，但要有恢復時間常數**。盲區各層壓低 −30／−40／−22／−46 dB 是「門」（gate），專家會問 attack／release 多少，太快會有「抽吸」感 | `audio.js` 有 musicDuck／musicGate（工具比較文件提到）；數字在程式裡，文件沒寫 attack／release，試玩也沒人問過「斷掉那一下會不會太硬」。錄音工具可以加一項「盲區邊緣 50 ms 內的包絡斜率」 |
| **聽覺錯覺的實作有已知門檻**。Risset 節奏要成立，層間音量交叉的鐘形要夠寬、最快層淡出前不能被聽成獨立節拍；Signals Music Studio 拆解 Göransson〈Troy〉時列出四個訣竅，其中一個是**層與層可以換拍號（3/4 ↔ 6/8）**，用來藏接縫 | 我們的四層 2:1、σ 0.22、音量和起伏 0.2% 是算對的（稽核確認）。沒做的是「換拍號藏接縫」；而且我們的核心設計是刻意留 0.6 秒接縫，所以只有假驟降需要無縫，那裡才值得用這招 |
| **中介軟體不是為了功能，是為了讓非程式人員調參**。FMOD／Wwise 的價值在於音訊設計師不用改程式就能調 duck 深度、層音量、頻段 | 工具比較文件結論「現階段不換、搬 Unity 用 FMOD、拍點排程留 C# dspTime」是對的。差在我們現在調參也要改程式；`audio-test.html` 的滑桿頁是對的方向，v2 第 19 節試驗場把它制度化了，但【木】的 audio-test 只覆蓋 Risset 層，duck、預告音、低音敲擊的參數沒滑桿 |
| **用等響度曲線解釋「喇叭聽不到低音」**，而不只說「筆電喇叭 200 Hz 以下沒聲音」。小喇叭滾降（各來源 150～250 Hz 不等，待一個嚴謹量測）之外，人耳在低音量時對低頻的敏感度本來就低（ISO 226:2003 等響度曲線，本次未查到可引頁面，待確認），兩件事疊加 | 我們的「200 Hz 高通喇叭模擬」只模了第一件事。音量小聲玩（宿舍）時低音會更不見，這是第二件事，沒模 |

### 2.2 他們看哪些第一手資料

- ITU-R BS.1770-4 (2015). Algorithms to measure audio programme loudness and true-peak audio level. https://www.itu.int/rec/R-REC-BS.1770 ；EBU R 128（−23 LUFS、EBU Tech 3341 的 EBU Mode）。https://tech.ebu.ch/publications/r128
- Sony ASWG-R001（Garry Taylor 2012 訪談與 2013 簡報轉述；原文件非公開）。https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/
- Shepard, R. N. (1964). Circularity in judgments of relative pitch. *JASA*, 36(12), 2346–2353. https://doi.org/10.1121/1.1919362 ；Risset, J.-C. (1971). Paradoxes de hauteur. *Proc. 7th ICA*, Budapest（只在 Deutsch 實驗室頁面查到書目，待確認）。https://deutsch.ucsd.edu/psychology/pages.php?i=213
- Signals Music Studio (Jake Lizzio). Creating the Impossible Rhythm Illusion from "The Odyssey". https://signalsmusic.studio/lessons/odyssey-risset-rhythm （報告大綱已引的 YouTube 影片的文字版）
- Collins, K. (2008). *Game Sound: An Introduction to the History, Theory, and Practice of Video Game Music and Sound Design*. MIT Press.（第 8 章「Compositional Approaches to Dynamic Game Music」）
- Sweet, M. (2014). *Writing Interactive Music for Video Games: A Composer's Guide*. Addison-Wesley.
- Somberg, G. (ed.) *Game Audio Programming: Principles and Practices*, vols. 1–5（CRC Press, 2016–2025），互動音樂系統與中介軟體章節。
- Wilson, C. A Tale of Two Clocks: Scheduling Web Audio with Precision（原 HTML5 Rocks，現 web.dev；2013 年份待確認）。https://web.dev/articles/audio-scheduling — 我們的 Worker tick＋0.5 秒 lookahead 就是這篇的做法。
- Audiokinetic 部落格：Mastering a Game with Wwise, Part 1（平台響度目標整理）。https://audiokinetic.com/ko/blog/mastering-a-game-with-wwise-part1

### 2.3 用哪些方法和工具

1. **響度量測**：Python `pyloudnorm`（BS.1770 實作）或 ffmpeg `ebur128` 濾鏡，對錄音工具的 WAV 輸出算整體、短期、瞬時響度與 LRA；盲區安靜量改成「盲區內短期響度 − 前後短期響度」。半天可接進 `analyze.mjs`（呼叫 ffmpeg 即可）。
2. **兩條匯流排**：`audio.js` 加 `mixProfile: 'headphones' | 'speakers'`，差異只在三個增益與 HRTF 開關；錄音工具 `--profile` 各錄一次。
3. **頻段配置表**：一張 Markdown 表，列全部 sfx 的主頻段、持續時間、在哪個狀態出現；錄音工具加「同時發生的關鍵訊號頻段重疊」檢查（取每個 cue 的 ±50 ms 頻譜質心）。
4. **Duck 包絡檢查**：錄音工具量盲區起點前後 50 ms 的 RMS 斜率，門檻避免 > 40 dB／10 ms 的硬切（除非設計要硬切）。
5. **頻譜圖對照**：現有 `spectrogram.png` 加上頻段配置表的水平線，一張圖看每個訊號在不在自己的格子裡——報告用。

### 2.4 怎麼證明有用

| 指標 | 門檻 | 對照我們已有的 |
|---|---|---|
| 盲區短期響度落差（LUFS） | ≥ 10 LU（取代 RMS 10 dB） | 錄音項 blind 改單位 |
| 整體響度與真峰值 | −23 ± 2 LUFS（參考 R128／ASWG）、≤ −1 dBTP | 新；clip 項可改成真峰值 |
| 喇叭版 vs 耳機版各自 8 項通過 | 兩版都 8/8（alertLow 在喇叭版改判 300～600 Hz 帶最突出） | 現在是一版加高通模擬，7/8 |
| 關鍵訊號頻段重疊 | 同一 ±50 ms 內兩個關鍵 cue 的頻譜質心相差 ≥ 1 個八度 | 新；規則 13 的自動化 |
| 假驟降尾音喇叭可聽度 | 200 Hz 高通後 1～4 kHz ≥ 6 dB 殘留 | N11，照做 |

---

## 3. 玩家研究員（Games User Research）

### 3.1 他們會做哪些我們沒想到的事

| 主張 | 我們有沒有做、差在哪 |
|---|---|
| **小樣本不是問題，沒有協定才是問題**。Nielsen & Landauer (1993) 的模型：單一受試者發現某問題的機率 L≈0.31 時，5 人找到約 85% 的可用性問題（Faulkner 2003 指出個別 5 人組合可能只到 55%）。所以 3～5 人**找問題**夠用，**估比例**（例如「80% 的人聽得出盲區」）不夠用 | 11/07 試玩 1 人、喇叭、問答式；N10 計畫 3～5 人。沒有：任務腳本、觀察表、受試者篩選條件（有沒有玩過節奏遊戲、聽力、裝置）、事前同意書。報告若說「試玩證明…」會被問樣本 |
| **用 RITE（Rapid Iterative Testing and Evaluation）**：一人測完立刻修明顯的問題，下一人測修過的版本；Medlock 等人 2002 在 *Age of Empires II* 用的方法。對我們這種雲端修、本機測的分工特別合，因為修一輪只要雲端半天 | 我們的流程是「本機一輪 → 雲端一輪 → 本機再一輪」，一輪半天到一天，本質接近 RITE，但沒有把「哪類問題當場修、哪類等累積」寫成規則（RITE 的核心是分類：明顯且好修的立刻修） |
| **把「聽不聽得出」做成聽辨任務，不是感想題**。二選一強迫選擇（2AFC）：播 20 段 3 秒片段，一半含預告音一半不含，受試者答「有／沒有」，正確率 ≥ 75% 才算聽得出；真假驟降同樣做。這是心理聲學的標準方法，脫離遊戲情境，10 分鐘做完 | 11/07 試玩是「驟降很難分辨」這種感想；11/08 修後只有錄音數字（+25 dB）。沒有人做過脫離遊戲的聽辨測試。`audio-test.html` 已能單獨播聲音層，改成 2AFC 頁面一兩小時 |
| **量表用現成的、有效度的**：PXI（Vanden Abeele 等 2020，10 構面，給 GUR 用、免費）、GEQ（IJsselsteijn 等 2013，含 Tension／Challenge／Flow 構面，正適合我們要的「緊張感」）、NASA-TLX（Hart & Staveland 1988，六向度負荷，適合「低音拍 2.4 秒是不是在估時間」這種認知負荷問題）、SUS 給選單與提示 | 沒有任何量表。`playtest-notes.md` 的七列表格是自製的，無法和別人比較。GEQ 的 Tension 分量表 3 題、Challenge 5 題，印一張紙就能用 |
| **行為指標勝過自陳**：Valve（Ambinder, GDC 2009）把設計當假設、試玩當實驗，蒐集統計、設計對照實驗、生理量測；Lemarchand（GDC 2012）用 Uncharted 的遙測看「注意力」而非「沉浸」 | 我們的程式玩家與錄音工具是行為指標的雛型，但量的是程式玩家不是真人。真人試玩沒有遙測：移動起點相位直方圖（審議 D 席要的）、每次失敗的相位與區域、提示階梯觸發次數，都是 `game.out` 已有的事件，只差寫檔 |
| **生理指標在學生專案可行的只有一種：心率**（手錶或胸帶），皮電（GSR）要設備。Mandryk & Atkins (2007) 用四種生理訊號推 arousal／valence；對我們來說，心率在「追殺 3 秒循環」與「巡邏 12 秒」是否有差，一支運動手錶就能看 | 沒做，也不該在 11/12 前做；但報告「下一步」可以列 |
| **訪談用回顧式放聲思考（retrospective think-aloud）配錄影**：玩的時候不打擾（節奏遊戲不能邊玩邊講），玩完看自己的錄影講「這裡我以為…」 | 沒做。本機要錄影本來就在計畫（報告影片），同一份錄影可以拿來訪談 |
| **資料編碼**：把每句回饋編成「可讀性／時機／難度／聽感／敘事」五碼，加「裝置」與「區域」兩個維度，三人以上就能看出模式 | `playtest-notes.md` 是自由文字。編碼表一張就夠 |

### 3.2 他們看哪些第一手資料

- Nielsen, J. & Landauer, T. K. (1993). A mathematical model of the finding of usability problems. *Proc. INTERCHI '93*, 206–213. https://course.ccs.neu.edu/is4800/ssl/nielsen93.pdf ；Nielsen 的通俗版 https://nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- Medlock, M. C., Wixon, D., Terrano, M., Romero, R., & Fulton, B. (2002). Using the RITE method to improve products: a definition and a case study. *Proc. UPA 2002*.（二手引述一致，原 PDF 待確認）
- Ambinder, M. (GDC 2009). Valve's Approach to Playtesting: The Application of Empiricism. 投影片 https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ValvesApproachToPlaytesting.pdf
- Lemarchand, R. (GDC 2012). Attention, Not Immersion: Making Your Games Better with Psychology and Playtesting, the Uncharted Way. https://gdcvault.com/play/1015745/Attention-Not-Immersion-Making-Your
- Vanden Abeele, V., Spiel, K., Nacke, L., Johnson, D., & Gerling, K. (2020). Development and validation of the Player Experience Inventory. *IJHCS*, 135, 102370. https://doi.org/10.1016/j.ijhcs.2019.102370 （量表免費：playerexperienceinventory.org）
- IJsselsteijn, W. A., de Kort, Y. A. W., & Poels, K. (2013). *The Game Experience Questionnaire*. TU Eindhoven. https://pure.tue.nl/ws/portalfiles/portal/21666907/Game_Experience_Questionnaire_English.pdf
- Hart, S. G. & Staveland, L. E. (1988). Development of NASA-TLX. *Advances in Psychology*, 52, 139–183.
- Mandryk, R. L. & Atkins, M. S. (2007). A fuzzy physiological approach for continuously modeling emotion during interaction with play technologies. *IJHCS*, 65(4), 329–347. https://www2.cs.sfu.ca/~stella/papers/2007/regan.pdf
- Drachen, A. & Canossa, A. (2009). Analyzing spatial user behavior in computer games using geographic information systems. *Proc. MindTrek 2009*, 182–189.（遙測熱圖）
- Drachen, A., Mirza-Babaei, P., & Nacke, L. E. (eds.) (2018). *Games User Research*. Oxford University Press.（含 think-aloud、survey、biometrics、analytics 各章）

### 3.3 用哪些方法和工具

1. **試玩協定一頁**（1 小時寫）：受試者條件（3 人耳機＋2 人喇叭；至少 1 人沒玩過節奏遊戲）、裝置登記（耳機型號、藍牙與否、`outputLatency` 讀數）、任務（① 2AFC 聽辨 10 分鐘 ② 木馬之夜第 1～2 區 ③ 大廳復仇標準一局）、觀察表（每區：卡住秒數、失敗次數、失敗相位、有沒有看提示）、量表（GEQ 核心模組 Tension＋Challenge＋Competence 共 13 題，玩完填）、回顧訪談 3 題（「你怎麼知道可以動？」「低音是哪個聲音？」「假驟降那次你怎麼發現的？」）。
2. **遙測寫檔**：畫面層把 `game.out` 的事件連同 `cycle.p`、`zone`、`guard.state` 寫成 JSONL，試玩結束下載；雲端用 Node 算 N1（主動時間比例）、移動起點相位直方圖、失敗相位直方圖。這一步讓 N1～N3 從「程式玩家」變成「真人」。
3. **RITE 分類規則**：寫進 `local-handoff.md`——「提示文字錯、按鍵衝突、數字不一致」當天修；「難度、窗長」累積 3 人再動。
4. **編碼表**：`playtest-notes.md` 加欄位：日期／人／裝置／區域／類別碼／原話／嚴重度（擋住／困擾／建議）。
5. **A/B 怎麼做**：3～5 人不能做組間比較，要做**受試者內**（within-subjects）對照：同一人玩兩個版本（例如 `BASS_PERIOD` 2.4 vs 1.8），順序輪替（ABBA）抵銷學習效應；量的是同一人兩版的 σ 與成功率差。這個規模的 A/B 回答的是「方向對不對」，不是「差多少」。

### 3.4 怎麼證明有用

| 指標 | 門檻 | 對照我們已有的 |
|---|---|---|
| 2AFC 聽辨正確率（預告音有無、真假驟降、低音拍辨認） | 耳機 ≥ 90%、喇叭 ≥ 75%（接近 d′≈1 的常用門檻） | 新；取代「錄音 +25 dB 所以聽得出」的推論 |
| 真人 σ（每個判定拍） | 同 1.4 節 | N10 |
| GEQ Tension 分量表 | 追殺段 > 巡邏段（配對比較，5 人裡至少 4 人方向一致） | 新；證明「壓力曲線」真的有壓力 |
| NASA-TLX 整體負荷 | 【廳】每 2.4 秒按 Q 版 vs 「每循環一次下令」版，後者較低 | 新；對應總綱 8.3 節的規則 5 問題 |
| 真人 N1 主動時間比例、移動起點相位直方圖峰值 | N1 ≥ 50%；峰值在 p ≈ 0（盲區） | N1 的真人版；審議 D 席的查證方式 |
| 每位受試者找到的「擋住」級問題數 | 到第 4、5 人時新問題 ≤ 1（飽和） | 新；這是「5 人夠不夠」的實證答案 |

---

## 4. 潛行／動作遊戲關卡設計師

### 4.1 他們會做哪些我們沒想到的事

| 主張 | 我們有沒有做、差在哪 |
|---|---|
| **先畫節拍表（beat chart）**：每一區一列，欄位是時間、情緒、新機制、敵人數、壓力、獎勵、鏡頭（Rogers《Level Up!》把它列為 GDD 的一個步驟，用來找「空檔與擠成一團」） | 【廳】v2 第 1.1 節「一局體驗曲線」就是節拍表，欄位齊全（時間、循環、情緒、每輪決定數、學什麼、系統給／放手），做得好。【木】只有 6.1 節的「區／內容／教什麼」三欄，沒有時間、沒有壓力值、沒有「系統給／放手」欄；第 3 區三件事疊一起這種問題，節拍表一畫就看見 |
| **敵人感知模型要有「狀態機＋記憶」**：Thief（Leonard 2003）的感知系統是多級警覺、視覺錐加距離加光照、聽覺事件有半徑與音量、而且有「最後已知位置」與**搜索**狀態；Mark of the Ninja（Anderson 2013）把光照改成全黑全亮二值，讓玩家能完全預測 | 我們有：感知半徑 r(p)＝2＋8p²、視野 ±60°、聽覺事件（出聲腳步 2.5 公尺）、疑心累積、巡邏／起疑／追殺／倒下四態。沒有：搜索狀態（追殺失去目標後直接「躲 10 秒就擺脫」，衛兵不會去你最後出現的地方找）、陰影是二值（`hidden`）但沒有「半明半暗」中介。對潛行老手來說，沒有搜索狀態的追殺是「被看到就重來」，決策空間少了一半。這和規則 8「選擇多於反應」直接相關 |
| **感知要被「讀出來」**：Mark of the Ninja 的五條規則之一是把敵人的感知範圍畫在畫面上（聲音半徑圈、視錐）；Hitman 的做法是 NPC 動畫先於狀態改變（抬頭、側身） | 我們把感知範圍對應到「鼓速」（聽），衛兵側頭「嗯？」是動畫前兆（11/08 加）；但 r(p) 的範圍沒有任何視覺化，玩家不知道 4.9 公尺是到哪裡。視覺輔助期（第 0～1 區）在地上畫一圈火光半徑會讓「鼓快＝圈大」一眼看懂，第 3 區起淡出 |
| **注意力引導**：Shaver（GDC 2018）用 blockmesh 與光把玩家導向目標、用「否定空間」擋住不該去的路；Hitman（GDC Europe 2016）在非線性沙盒裡用導引系統而不是箭頭 | 【木】的路標是西農的貓頭鷹記號（文件說只當路標），其餘靠提示文字階梯。沒有光照導引（火把位置同時是威脅也是路標，這是潛行關卡的經典雙關，我們還沒用）。審議 D 席要的「只有盲區衝刺才過得去的狹窄點」就是一個 blockmesh 問題 |
| **壓力曲線要有「放手」段**：Booth（AIIDE 2009）的 L4D AI Director 用「強度估計」在高峰後強制放鬆（relax），再建構下一波；Chen (2007) 的心流通道是難度與能力的對角帶 | 【木】的「越危險越快」只有升壓（距離近→循環短），放鬆靠玩家自己走遠；沒有系統性的「追殺結束後給 1 個安全循環」。【廳】v2 的轉折循環（charge，一輪無攻擊）就是 Director 式的放手，做對了，但【木】沒有 |
| **「選擇多於反應」要量，不是宣稱**。Meier（GDC 2012）的「有趣的決定」要有取捨、長短期差異；量法是列出每個時刻的合法動作集合與各自後果 | N1（主動時間比例）、N2（每循環選擇數）、N3（主動 vs 被動勝率差）正是這件事，定義寫得很具體，但三個都沒跑。專家會先跑 N2，因為它最便宜（規則層列舉合法動作）、而且直接回答審議 D 席「盲區被稀釋」 |
| **「等待」要有事可做**。潛行遊戲在等的時候給觀察（看巡邏路線）、規劃（選路）、資源（撿東西） | 【木】等待時只能屏息或走；巡邏路線沒有可觀察的規律性提示（衛兵走到哪會轉身）；沒有可撿的東西。【廳】有撿箭與下令。總綱 9 節第 4 條「空檔 × 下令」會補到一部分 |
| **失敗要便宜而且有資訊**：Celeste、Hotline Miami 式的即時重來；失敗畫面顯示「你是在 p＝0.93 時動的」 | 失敗回區頭（第 4 區城門重走成本沒量）；失敗畫面沒有相位資訊，玩家不知道自己錯在哪。提示階梯第 2 階才給文字 |

### 4.2 他們看哪些第一手資料

- Leonard, T. (2003). Building an AI Sensory System: Examining the Design of *Thief: The Dark Project*. Gamasutra／GDC 2003. https://www.gamedeveloper.com/author/tom-leonard （文章索引；GDC Vault 頁面未查到）
- Anderson, N. (GDC 2013). Of Choice and Breaking New Ground: Designing *Mark of the Ninja*. https://gdcvault.com/play/1017791/Of-Choice-and-Breaking-New ；五條潛行規則的整理 https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules
- Booth, M. (AIIDE 2009). The AI Systems of *Left 4 Dead*. https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf
- Shaver, D. & Yang, R. (GDC 2018). Level Design Workshop: Invisible Intuition: Blockmesh and Lighting Tips to Guide Players and Set the Mood. https://gdcvault.com/play/1025179/Level-Design-Workshop-Invisible-Intuition
- Mikkelsen, J. & Poedenphant Andersen, M. (GDC Europe 2016). Level Design in *HITMAN*: Guiding Players in a Non-Linear Sandbox. https://gdcvault.com/play/1023849/Level-Design-in-HITMAN-Guiding
- Lemarchand, R. (GDC 2012). 同 3.2 節（注意力與遙測）。
- Meier, S. (GDC 2012). Interesting Decisions. 同 1.2 節。
- Chen, J. (2007). Flow in games (and everything else). *Communications of the ACM*, 50(4), 31–34. https://doi.org/10.1145/1232743.1232769
- Rogers, S. (2014). *Level Up! The Guide to Great Video Game Design*, 2nd ed., Wiley.（「Writing the GDD, Step 4: The Beat Chart」）
- Drachen & Canossa (2009) 同 3.2 節（空間熱圖）。

### 4.3 用哪些方法和工具

1. **【木】節拍表**（1 小時）：照 v2 第 1.1 節的欄位補一張，加兩欄「失敗重走秒數」與「衛兵感知狀態」；第 3 區那一列會自己紅起來。
2. **跑 N2**（半天，規則層）：每幀列舉合法動作集合 {walk, breath, dash, takedown, calm, latch, wait}，加上「會導向不同結果」的過濾（例如 p > 0.6 時 walk 必死就不算合法選擇），取循環內聯集大小；【木】四區與【廳】三段各出一個中位數。
3. **衛兵搜索狀態**（1～2 天，報告後）：`hunted` 失去視線 → `searching`：前往最後已知位置、在半徑 3 公尺內走 2 個低音拍、回巡邏；`ESCAPE_STILL` 10 秒改成「搜索結束」。這讓「躲」變成「躲在哪」。
4. **熱圖**：遙測 JSONL（3.3 節第 2 項）裡的玩家座標與事件，用 Node 畫成 PNG（每 0.5 公尺一格，顏色＝停留秒數；另一張＝失敗點）。疊在 `level` 的牆與路線上，一張圖看「大家都在哪裡等」。
5. **狹窄點 blockmesh**：第 2 區加一個火光圈相交、沒有 p ≤ 0.6 縫隙的 3 公尺通道（總綱 8.1 節已點名），用雙機器人模擬（審議 1.3 第 2 項）驗證乙（低頻亂走）過不了。

### 4.4 怎麼證明有用

| 指標 | 門檻 | 對照我們已有的 |
|---|---|---|
| N2 每循環選擇數中位 | ≥ 2（【廳】射箭段 ≥ 3、近戰段 ≥ 4） | N2，照跑 |
| N3 主動 − 被動勝率差 | ≥ 20 個百分點 | N3；雙機器人模擬就是審議 1.3 第 2 項 |
| 真人移動起點相位直方圖 | 峰值在 p ∈ [0, 0.1]，且 p > 0.6 的移動 ≤ 10% | 新（真人版 D 席查證） |
| 失敗重走秒數 | 每區 ≤ 30 秒（從檢查點到失敗點的最短路） | 新 |
| 壓力曲線形狀 | 每區至少一次「放手」（T 回到 ≥ 10 秒持續 1 循環以上） | 新；從遙測的 `cycle.T` 時間序列算 |
| 搜索狀態存活率 | 最佳策略在第 2 區每個起點、每個相位觸發追殺後存活 ≥ 50% | 審議 1.3 第 3 項 |

---

## 5. 古典學／敘事顧問

### 5.1 他們會做哪些我們沒想到的事

| 主張 | 我們有沒有做、差在哪 |
|---|---|
| **木馬之夜不在《奧德賽》正文裡**。《奧德賽》只在第 4 卷（海倫繞著木馬學妻子的聲音呼喚，4.271–289）與第 8 卷（德摩多科斯唱木馬之歌，奧德修斯落淚，8.492–520）**提及**；第 11 卷冥府裡也提到（對阿基里斯說他兒子在木馬裡）。完整敘事在維吉爾《埃涅阿斯紀》第 2 卷與史詩輪迴（《小伊利亞特》《伊利昂的陷落》，只剩 Proclus 摘要）。**西農（Sinon）完全不在《奧德賽》裡**，是《埃涅阿斯紀》的人物。義大利 Libreriamo 調查 76% 的人以為木馬故事在《伊利亞特》或《奧德賽》裡 | `CLAUDE.md` 把木馬列為【經典】、審議 1.4 節已指出西農記號該標【原典：埃涅阿斯紀】；這兩點方向都對。差在：(a) 總綱 10 節寫「木馬、特洛伊陷落之夜、從木馬裡出來打開城門【經典】」沒標出處卷數；(b) 報告若說「我們從《奧德賽》的開頭做起」，台下的古典學老師會糾正：《奧德賽》的「開頭」是奧德修斯被困在卡呂普索島、忒勒馬科斯出發找父親，木馬是**倒敘**。建議講法：「大眾熟知的奧德修斯故事從木馬開始；荷馬自己是倒敘，我們按大眾的順序講」 |
| **「D 多利安」是中世紀教會調式的命名，不是古希臘的**。古希臘的多利安八度種是 E–E（下行命名），中世紀理論家誤以為是上行命名，於是古希臘多利安（E–E）在教會調式裡變成弗里吉安，教會的多利安（D–D）對應的是古希臘的弗里吉安（Britannica；把錯歸於 Boethius 的說法是流行版本，學界沒定論） | 總綱 10 節「古希臘調式只當音階選擇，不做成理解劇情的前提」已留退路；但 7 節寫「用古希臘調式（例如多利安或弗里吉安）」、2.8 節寫「D 多利安」。兩者都沒錯，只是「D 多利安」是現代調式名稱；報告裡說「古希臘調式」就會被問。改法：寫「D 多利安（現代調式名；對應的古希臘八度種是弗里吉安）」一句話了事 |
| **荷馬裡的樂器是 phorminx（四弦的里拉），不是 kithara 也不是 aulos**。費彌俄斯（Od. 1.153）與德摩多科斯（Od. 8.255–257）彈的是 phorminx；aulos（雙管）在《伊利亞特》第 18 卷阿基里斯之盾上出現，在《奧德賽》裡不是歌手的樂器。打擊樂（tympanon、krotala、kymbala）是後來酒神祭儀的樂器，荷馬時代沒有鼓隊 | 我們的功能層是四層打擊（低鼓、框鼓、手拍、金屬）。這是【改編】，沒有違規（`CLAUDE.md` 只禁現代元素），但顧問會提醒：報告若說「希臘音樂」要說清楚鼓是設計需要（Risset 需要打擊），不是史實；主題動機用 phorminx 音色奏出會比「里拉琴」更準（`ogygia-gdd.md` 第 136 行寫的是里拉琴）。木魚預告音是東亞樂器（playtest-notes 已問「會不會太現代」），顧問會說問題不是現代而是**地域**，可換成 krotala（響板）或 kymbala（小鈸）這類希臘打擊樂的音色描述 |
| **希臘節奏理論是「長短」不是「強弱」**：Aristoxenus《節奏要素》（Pearson 編 1990）以音節長短（長＝2 短）建節奏腳；D'Angour 2017 年重建歐里庇得斯《俄瑞斯忒斯》殘篇時，節奏嚴格按音節長短 | 我們的 Risset 是等拍倍速加速，和長短節奏無關；這也不是問題，但如果想加一層「希臘味」，哼唱主題（2.8 節）的音符時值可以照一個六音步（dactylic hexameter，— ∪ ∪）排，報告可以說「主題動機的節奏是荷馬史詩的格律」。一句話的改法，報告加分 |
| **譯本選擇影響「大眾最熟」的判斷**。英文：Lattimore (1965)、Fitzgerald (1961)、Fagles (1996)、Wilson (2017，第一位女性英譯者，逐行五音步)、Green (2018)、Mendelsohn (2025)；中文：王煥生（人民文學 1997，從古希臘文譯，魯迅文學獎翻譯獎）、陳中梅（出版社與年份待確認）、楊憲益（散文體，上海人民，據 Loeb 希臘文）、傅東華（1929，據英譯轉譯）；台灣：書林出版有「正體中文首部由希臘文直譯」的版本（譯者待確認）。台灣讀者讀過的多半是改寫本與課本節選，不是全譯 | 專案沒有指定任何譯本。這對玩法無妨，但「頭目名字加特徵稱號」（傲慢的安提諾俄斯、油嘴的歐律馬科斯）的譯名要定一個標準，否則文件、提示、字幕會各寫各的（和規則 12「數字單一來源」同理）。建議以王煥生譯名為準（兩岸最常見），台灣慣用的另列對照 |
| **「大眾最熟」要有來源**。大眾改編（EPIC: The Musical，Rivera-Herrans 2022–2024，從 TikTok 起家、Spotify 單曲千萬級播放；Hades；電影《尤利西斯》1954；《霹靂高手》2000）的段落選擇就是實證：EPIC 九個 saga 的名稱（Troy、Cyclops、Ocean、Circe、Underworld、Thunder、Wisdom、Vengeance、Ithaca）和 `CLAUDE.md` 列的經典段落幾乎重合。哪一首最紅待確認（只查到卡拉 OK 平台排名） | `CLAUDE.md` 的經典段落清單是憑直覺列的，沒有來源。列上 EPIC 的 saga 清單當旁證，一行就夠；而且 EPIC 本身就是「用音樂講奧德賽」的大眾先例，報告的「相關作品」該有它 |
| **避免現代元素的查核清單要分「物件、技術、制度、語言」四類**，不只「手電筒」：物件（鐵器為主？荷馬是青銅時代背景、鐵零星出現；錢幣要到西元前 7 世紀才有；馬鐙、馬鞍沒有）、技術（滑輪、弩沒有；玻璃窗沒有）、制度（「士兵」「軍官」「警衛」這類詞暗示常備軍，荷馬時代是部落戰士）、語言（「秒」「分鐘」「公尺」不能進遊戲內文字；「OK」「拜拜」這類口語） | `CLAUDE.md` 只舉手電筒；審議 1.4 節查了「雜訊」「耳機」。遊戲內文字有「衝刺 3 公尺」「0.6 秒」這類單位嗎？提示由 `hintsFor(T)` 生成，數字會進提示——這是語言類的現代元素。改法：提示用「三步」「一口氣」代替公尺與秒，數字留在文件與試驗場 |
| **神話改編的慣例與地雷**：(a) 不要讓「真名」承擔理解（我們已做：稱號）；(b) 神的介入要麼全有要麼全無（雅典娜在原典無所不在，我們完全不用神，是一致的選擇，要在文件寫明）；(c) 暴力與奴隸制：第 22 卷殺求婚者後吊死女奴，是現代改編最常迴避或正面處理的地雷（Wilson 譯本的爭議之一）；我們【廳】只到「其餘投降」就停，是迴避法，要自覺 | 總綱與 v2 沒有一條「我們怎麼處理神與暴力」的設計決定。顧問會要求寫一段，三行就夠 |

### 5.2 他們看哪些第一手資料

**原典與校勘本**
- Allen, T. W. (ed.) *Homeri Opera* III–IV (Odyssea), Oxford Classical Texts, 1917–1919（傳統標準本；West 認為其抄本分類已過時）。
- West, M. L. (ed.) *Homerus: Odyssea*. De Gruyter／Teubner, 2017（West 身後由 Stephanie West 完成；最新校勘本）。https://classicsforall.org.uk/reading-room/book-reviews/homerus-odyssea-recensuit-et-testimonia-concessit
- Heubeck, A., West, S., Hainsworth, J. B. et al. *A Commentary on Homer's Odyssey*, 3 vols., Oxford: Clarendon, 1988（I–VIII）、1989（IX–XVI）、1992（XVII–XXIV）。比箭（第 21 卷）與殺求婚者（第 22 卷）在第三卷。
- Perseus Digital Library（希臘文與 Murray 英譯逐行對照，免費）：https://www.perseus.tufts.edu/
- Virgil, *Aeneid* II（木馬、西農、拉奧孔的完整敘事）。

**譯本**
- Wilson, E. (2017). *The Odyssey*. W. W. Norton.（12,110 行逐行；譯者導論談暴力與奴隸的處理）
- Green, P. (2018). *The Odyssey: A New Translation*. University of California Press.
- Fagles, R. (1996). Viking；Lattimore, R. (1965). Harper & Row；Fitzgerald, R. (1961). Doubleday.
- Mendelsohn, D. (2025). *The Odyssey*.（只查到書評提及，出版社待確認）
- 王煥生譯《奧德賽》，人民文學出版社，1997（VIAF 書目年份 1997；2001 年第二屆魯迅文學獎翻譯獎）。https://en.wikipedia.org/wiki/Wang_Huansheng
- 陳中梅譯、楊憲益譯、傅東華譯（1929）、書林版希臘文直譯本：出版社與年份**待確認**，本次搜尋只查到片段。

**希臘音樂史**
- West, M. L. (1992). *Ancient Greek Music*. Oxford: Clarendon.（樂器、節奏、調式、記譜全覆蓋）
- Hagel, S. (2009). *Ancient Greek Music: A New Technical History*. Cambridge UP.（里拉與奧洛斯管的演奏實務如何形塑音高理論）
- Pearson, L. (ed.) (1990). *Aristoxenus: Elementa Rhythmica*. Oxford: Clarendon.
- D'Angour, A. (2017). 歐里庇得斯《俄瑞斯忒斯》合唱殘篇的重建與演出（Oxford, 2017-07）。https://www.torch.ox.ac.uk/node/1245581
- Seikilos 墓誌銘（現存最早完整的有詞旋律，西元 1～2 世紀）：可當「古希臘旋律長什麼樣」的唯一完整範例。
- 荷馬文本中的樂器：Od. 1.153（費彌俄斯的 phorminx）、Od. 8.255–257（德摩多科斯）、Il. 18.495–496（盾上的 aulos 與 phorminx）。

**大眾接受度的旁證**
- Libreriamo 調查（義大利，約 1,500 則網路對話，非代表性樣本）：76% 把木馬放進《伊利亞特》或《奧德賽》；91% 把海妖想成人魚。https://www.9colonne.it/623931/from-sirens-to-trojan-horses-the-blunders-shaping-italy-s-classical-memory
- Rivera-Herrans, J. *EPIC: The Musical* (2022–2024)，九個 saga。https://neoskosmos.com/en/2025/07/08/life/arts/from-thesis-to-tiktok-sensation-jorge-rivera-herrans-epic-brings-homers-odyssey-to-a-new-generation/
- Nolan, C. *The Odyssey* (2026-07-17, Universal)；Göransson 配樂，〈Troy〉一軌約 6 分鐘、「越來越緊、不斷上升的節奏」（影評描述；原聲帶本身沒有用「Risset」一詞，這是分析者的稱呼）。https://zanobardreviews.com/2026/07/17/the-odyssey-soundtrack-review/

### 5.3 用哪些方法和工具

1. **出處表加卷行**：總綱 10 節每個【經典】【原典】後面加「Od. 卷.行」或「Aen. 2」；用 Perseus 查，30 分鐘。
2. **譯名對照表**：一張表，欄位：希臘文轉寫／王煥生譯名／台灣常見譯名／我們的稱號；放 `docs/design/`，提示與字幕都讀它。
3. **現代元素查核清單**：物件／技術／制度／語言四類，各列 5～10 個常見地雷；每次新增遊戲內文字或物件時對一次。放進 `CLAUDE.md` 或獨立檔。
4. **「神與暴力」設計決定**：三行寫進總綱或 `concepts-overview.md`：不出現神的直接介入；殺戮不寫血腥（v2 第 2 節已有「不寫血腥」）；第 22 卷後段（女奴）不演。
5. **主題動機節奏改六音步**：哼唱主題 7 音的時值照「— ∪ ∪ — ∪ ∪ —」排（長 2 短 1），`themeUnit` 不變；一行常數。

### 5.4 怎麼證明有用

| 指標 | 門檻 | 對照我們已有的 |
|---|---|---|
| 出處表完整度 | 每個【經典】【原典】都有卷行；【電影】待確認項 ≤ 3 | 總綱 10 節現有約 15 條，卷行 0 條 |
| 「沒看過也懂」測試 | 試玩受試者裡沒讀過原典的人，玩完能用一句話說出「你是誰、要做什麼」（5 人中 ≥ 4） | 新；配合 3.3 節的回顧訪談加一題 |
| 譯名一致性 | 文件、提示、字幕的人名 0 處不一致 | N9 的人名版 |
| 現代元素 | 遊戲內文字與物件 0 處違反四類清單（含單位詞） | 審議 1.4 節查了 3 處，沒有清單 |
| 音樂史實標記 | 報告與文件裡提到「古希臘」的地方都有【史實】或【改編】標記 | 新 |

---

## 6. 我們現在就能做的前 10 件（依優先順序）

排序依據：對 11/12 報告有沒有直接幫助、要花多久、能不能用現有工具做。「專家」欄是哪一節的做法。

| 序 | 做什麼 | 哪位專家 | 要花多久 | 對 11/12 報告 |
|---|---|---|---|---|
| 1 | **跑 N2（每循環選擇數）與雙機器人 N3**：規則層列舉合法動作、甲乙各 100 局；【木】四區＋【廳】三段 | 關卡（4.3 第 2 項） | 半天 | **直接有**：一張「被動 → 主動」數字圖，回答審議 D 席，也是報告「下一步」的證據 |
| 2 | **試玩協定一頁＋GEQ 13 題＋編碼表**，本機 11/10 試玩照它做 | 玩家研究（3.3 第 1、4 項） | 1 小時寫、試玩時多 10 分鐘 | **有**：報告能說「3 人、兩種裝置、量表」，而不是「一個人覺得」 |
| 3 | **2AFC 聽辨頁**：改 `audio-test.html`，20 段隨機有／無預告音、10 段真／假驟降，顯示正確率 | 玩家研究＋音訊（3.3 第 1 項、2.3） | 2 小時 | **有**：「喇叭上預告音正確率 X%」比「+25 dB」好懂；試玩前 10 分鐘做完 |
| 4 | **遙測寫檔＋移動起點相位直方圖**：畫面層把 `game.out` 加 `p`／`zone` 寫 JSONL，Node 畫直方圖與失敗相位 | 玩家研究＋關卡（3.3 第 2 項、4.3 第 4 項） | 半天 | **有**：試玩後一張圖證明玩家真的在盲區動（或沒有） |
| 5 | **校準頁**：120 BPM 跟拍 12 下，存 `userOffset`，三個原型共用 | 節奏（1.3 第 1 項） | 半天 | 間接：試玩成功率會更真實；藍牙受試者不會被延遲冤枉 |
| 6 | **【木】節拍表**：照 v2 1.1 節欄位補，加「失敗重走秒數」 | 關卡（4.3 第 1 項） | 1 小時 | **有**：報告「製作過程」一張圖，順便讓第 3 區的問題可視 |
| 7 | **出處表加卷行＋三行「神與暴力」決定＋「D 多利安」註記** | 古典（5.3 第 1、4 項） | 1 小時 | **有**：報告 Q&A 的保險；「木馬不在《奧德賽》正文」這件事自己先講比被問好 |
| 8 | **錄音工具加 LUFS**（ffmpeg `ebur128`）：blind 項改 LU、clip 改真峰值 | 音訊（2.3 第 1 項） | 半天 | 間接：數字單位換成業界的；報告頻譜圖旁多一個 LUFS 讀數 |
| 9 | **頻段配置全表＋重疊檢查** | 音訊（2.3 第 3 項） | 半天 | 間接：規則 13 的自動化；報告可放一張「每個聲音一個格子」的圖 |
| 10 | **提示文字去單位**：「3 公尺」「0.6 秒」改「三步」「一口氣」，數字留文件 | 古典（5.3 第 3 項） | 1 小時（提示由 `hintsFor(T)` 生成，改模板即可） | 間接：影片字幕不會出現「秒」 |

報告後再做（本文件提出、但 11/12 前不碰）：兩套混音匯流排（2.1）、衛兵搜索狀態（4.3 第 3 項）、狹窄點 blockmesh 與 Director 式放手段（4.1）、心率量測（3.1）、譯名對照表（5.3 第 2 項）、主題動機六音步（5.3 第 5 項）。

---

## 7. 我們做得比一般學生專案好的地方

誠實地說，三點，各附證據：

1. **規則是節拍唯一來源，聲音、畫面、分析工具都讀它**。這是 Hi-Fi Rush 等商業節奏動作遊戲的架構原則（拍網格由一個權威時鐘決定），多數學生原型是畫面幀計時加音效。證據：`risset.js`、`vengeance.js`、`rules.js` 開頭註解與規則 7；稽核 A2、V1、P1 抓到三處抄常數並修掉；`input.actAt` 用音訊時鐘而非幀時間（規則 11）。這也是為什麼上面第 1、4 件半天就能做——事件與相位都已經在規則層。

2. **用程式玩家與錄音分析把「對不對」變成數字，而且已經抓到過設計錯誤**。一般學生專案的驗證是「自己玩過覺得可以」；我們有 125 項規則測試、8 項錄音檢查、程式玩家勝率，而且審議算出「腳步掩護方向反了」（T=12 時 p 0～0.1 只有 21% 被蓋住）、「城門要 7 個循環不是 3 個」這種測試全過但設計壞掉的問題（`retrospective.md` 第 14 項）。專家會指出的差距（上面 1～5 節）多半是「真人版」還沒做，不是沒有量測文化。

3. **喇叭可聽度被當成設計約束，不是事後補救**。11/07 一人試玩在喇叭上三項訊號聽不出，11/08 就改成「關鍵訊號 200～4000 Hz」原則（規則 6）、錄音工具加喇叭模擬、v2 規格把每個聲音的頻段寫進呈現表（第 4.4、5 節）。音訊設計師會說這離「兩套混音」還差一步（2.1 節），但「先讓最差的播放裝置成立」是正確的順序，多數學生專案只在自己的耳機上調。

附帶一個不算優點但值得講的：`CLAUDE.md` 的出處標記制度（【經典】【電影】【原典】【改編】）讓第 5 節的古典學審查有東西可審；一般改編作品沒有這層，顧問只能從頭問起。

---

## 8. 本次查不到或只有二手來源的（寫報告時注意）

| 項目 | 狀態 |
|---|---|
| Repp (2005) 原文裡 1.8 秒的確切頁碼與措辭 | 只從引用它的論文與 Repp 的 rate-limits 續篇確認；引用時寫 Repp 2005／Repp & Su 2013 |
| Risset (1971) "Paradoxes de hauteur" 書目 | 只在 Deutsch 實驗室頁面查到；另有 Risset 1969 JASA 摘要 |
| Sony ASWG-R001 原文件 | 非公開；−23 LUFS 來自 2012 訪談與 2013 簡報；2024 年是否改 −24 待確認 |
| ISO 226:2003 等響度曲線 | 標準存在是常識，本次未查到可引頁面 |
| 筆電喇叭滾降頻率的嚴謹量測 | 各來源 150～250 Hz，Notebookcheck 只說「約 100 Hz 以下靠被動輻射器」；我們的 200 Hz 是合理估計不是實測 |
| Game Accessibility Guidelines 是否明文列「延遲校準」 | 只查到「可調遊戲速度」條；校準條待確認 |
| Rhythm Heaven 各關判定窗毫秒數 | 只有不可靠粉絲頁，不要引 |
| osu! 窗長公式是半寬還是全寬 | 兩頁 wiki 說法不一 |
| Medlock et al. (2002) RITE 原 PDF | 二手引述一致（UPA 2002, Orlando） |
| Celeste Assist Mode 的 GDC 演講 | 沒有；引 Vice／Game Developer 的報導即可 |
| Ape Out 的 GDC 演講 | 沒有；程序鼓的說明引 MCV 報導 |
| EPIC: The Musical 哪一首最紅 | 只查到卡拉 OK 平台排名；只引 saga 清單與 TikTok 起家的報導 |
| 陳中梅、楊憲益、書林希臘文直譯本的出版社與年份 | 待確認；王煥生 1997 人民文學已確認 |
| Mendelsohn (2025) 譯本出版社 | 只查到書評提及 |
| 《奧德賽》各段落「大眾最熟」的代表性調查 | 沒有；只有 Libreriamo 非代表性調查與改編作品的旁證 |
| Nolan《奧德賽》配樂是否「用了 Risset 節奏」 | 影評只描述「不斷上升的節奏」；「Risset」是 Signals Music Studio 等分析者的稱呼，報告要這樣講 |
