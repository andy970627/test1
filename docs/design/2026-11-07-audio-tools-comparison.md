# 木馬之夜：音效設計工具與聲音分析工具比較（2026-11-07）

> 技術文件，不受「不得有現代元素」限制。背景：`2026-11-06-risset-troy-prologue.md` 第 3、7、8 節；`prototypes/troy-prologue/audio.js` 開頭註解；`tools/playtest-recorder/README.md`。
> 查詢日期 2026-11-07；授權與價格以官網當日為準，查不到的標「查不到」。

## 1. 結論

**現階段不換工具**：原生 Web Audio（樣本級時鐘、`setValueAtTime`／ramp、HRTF PannerNode、Worker tick＋0.5 秒 lookahead）已經涵蓋木馬之夜的全部需求，換成 Tone.js 或 RNBO 只會多一層抽象和一個時鐘，沒有換到新的能力。**搬 Unity 時建議 FMOD Studio**：免費 Indie 授權門檻寬（開發預算 60 萬美元以下）、Unity 整合成熟、有拍點回呼與 snapshot 可對應目前的 musicDuck／musicGate；但 Risset 的「每層速度連續變、循環長度隨危險程度變」在 FMOD 與 Wwise 的時間軸型音樂系統裡都不好做，建議把拍點排程留在 C# 用 `AudioSettings.dspTime`／`PlayScheduled`（Unity 內建）或 FMOD 的程式化事件（programmer instrument）驅動，中介軟體只負責混音、壓音與 3D。Wwise 的 WebGL 支援仍是實驗性質，如果正式版還想保留網頁版，不選 Wwise。

## 2. A 表：音效設計／互動音樂工具

### 2.1 網頁端

| 工具 | 排程精度與時鐘 | 動態節奏（Risset、T 隨危險變） | 瞬間壓音（duck／gate） | 延遲補償 | 3D 音 | 授權與費用 | 搬 Unity 的對應 | 學習成本 | 來源 |
|---|---|---|---|---|---|---|---|---|---|
| **原生 Web Audio API**（現況） | `AudioContext.currentTime` 樣本級；排程要自己用 lookahead 計時器（我們用 Worker 25 ms tick＋0.5 秒預排） | 完全自由：每拍一個 `start(when)`，拍點表由規則算，anchor 改了就取消重排 | `GainNode` 的 `setValueAtTime`／`linearRampToValueAtTime`，樣本級精準 | `baseLatency`（Chrome 58、Firefox 70、Safari 14.1 起）與 `outputLatency`（Chrome 102、Firefox 70、Safari 18.4 起）可讀；Safari 舊版沒有 `outputLatency` 要退回估計值 | `PannerNode` HRTF，內建 | W3C 標準，免費 | 規則層翻 C#；聲音層重寫，概念對應 `dspTime`＋`PlayScheduled` | 低（已在用） | [MDN baseLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency)、[web.dev outputLatency](https://web.dev/articles/audio-output-latency) |
| **Tone.js**（npm 15.1.22，2026-10-31 更新） | 包在 Web Audio 上，加自己的 `Transport` 與 `lookAhead`（預設 0.1 秒）；`updateInterval + lookAhead` 是排程到出聲的總延遲 | `Transport` 是 BPM／小節制，Risset 的「每層速度指數變化」要繞過 Transport 自己排，等於回到原生 | 同原生（底層是 GainNode） | 同原生 | `Panner3D`（包 PannerNode） | MIT，免費 | 無對應；Transport 概念不同於 FMOD／Wwise | 中（API 多，但文件完整） | [Tone.js Performance wiki](https://github.com/Tonejs/Tone.js/wiki/Performance)、[Context 文件](https://tonejs.github.io/docs/14.7.77/Context)、`npm view tone` |
| **Elementary Audio**（@elemaudio/core 4.0.1） | 函數式宣告音訊圖，引擎在 AudioWorklet 內；時間用節點表達，不是 `start(when)` 式排程 | 可以用 `el.train`／`el.phasor` 做連續變速節奏，但「規則每幀給 anchor、1 ms 內重排」這種外部驅動不順手 | 可以（增益節點＋平滑） | 查不到專門機制 | 查不到內建 HRTF | 雙授權：PolyForm Strict 1.0.0（需標示「Made with Elementary Audio」）或商業授權（要寫信問）；官網 /pricing 頁 2026-11-07 回 404，**目前價格查不到** | 引擎有 C++ 版，理論上可同一套 DSP 搬到原生，但 Unity 整合要自己做 | 中高（函數式思維） | [npm README](https://www.npmjs.org/package/@nick-thompson/elementary)、[v0.11 定價公告](https://buttondown.com/elemaudio/archive/elementary-v0110-new-pricing-model)、[core-lite](https://www.npmjs.org/package/@elemaudio/core-lite) |
| **RNBO**（Max 匯出 Web） | 匯出 WASM＋JS API，在 AudioWorklet 內跑；可從 JS 送參數與事件 | 可以在 Max 裡 patch 出 Risset；外部 anchor 驅動要靠參數／訊息 | 可以（patch 內 gain） | 查不到 | 查不到內建 HRTF（Max 有外部物件，匯出不一定支援） | 需 Max 授權；RNBO 永久授權 299 美元、訂閱 10 美元／月、學生 179 美元；匯出程式碼用 Cycling '74 匯出碼授權 | **對應最好**：同一個 patch 可匯出 C++ 給 Unity 原生外掛，也可匯出 Web | 高（要會 Max） | [RNBO 1.0 公告](https://cycling74.com/forums/rnbo-1-0-now-available-bundled-with-max-8-5)、[Synthtopia](https://synthtopia.com/?p=132547)、[Sweetwater 學生價](https://www.sweetwater.com/store/detail/RNBOST/contact) |
| **Faust**（faustwasm） | 編譯成 WASM AudioWorklet 節點；時間精度與原生相同 | DSP 層適合做音色（鼓、謝帕德），排程仍要在 JS 做 | 可以（在 JS 或 DSP） | 無 | 無內建 HRTF（有 HOA 函式庫） | GPL／LGPL 工具鏈免費；產出的 DSP 程式碼授權由作者決定 | 可匯出 C++ 與 Unity 外掛目標（Faust 有 `unity` 匯出架構）；**音色可共用，排程不行** | 中高（函數式 DSP 語言） | [faustwasm GitHub](https://github.com/Fr0stbyteR/faustwasm)、[Faust Deploying 手冊](https://faustdoc.grame.fr/manual/deploying) |
| **Csound WASM**（@csound/browser） | AudioWorklet 內跑；Csound 自己的 score／即時事件，精度到 k-rate（預設 ksmps） | 可以寫 instrument 做 Risset，但外部 anchor 驅動要走 `inputMessage` | 可以 | 無 | 有 HRTF opcode（`hrtfmove`） | API Apache 2.0；WASM 二進位 LGPL 2.1 | Csound 有 Unity 整合（CsoundUnity，社群維護），同一份 .csd 可共用 | 高（Csound 語法） | [csound.com/wasm 教學](https://csound.com/wasm/tutorial1-getting-started)、[WAAW Csound 論文](https://mural.maynoothuniversity.ie/16018) |
| **SuperCollider**（SuperSonic 0.15.0，scsynth WASM） | scsynth 在 AudioWorklet 內，OSC 時間戳排程（樣本級） | 可以（scsynth 的 bundle 時間戳正適合） | 可以 | 無 | 有 HRTF 相關 UGen（需 SC3-plugins，WASM 是否包含查不到） | GPL v3；必須自架（SharedArrayBuffer 安全需求） | 無 Unity 整合 | 高；沒有 sclang，只有 scsynth | [SuperSonic demo](https://sonic-pi.net/supersonic/demo.html)、[CDM 報導](https://cdm.link/supersonic-supercollider-for-web/)、[SC WASM PR #5571](https://github.com/supercollider/supercollider/pull/5571/files) |
| **Pure Data**（Pd4Web 3.0.1，2026-02；WebPd） | Pd4Web 把 Pd 0.56 核心編成 WASM；WebPd 把 patch 編成 JS／WASM。精度到 block（64 樣本） | 可以用 `[vline~]`／`[metro]` 做，外部驅動走訊息 | 可以 | 無 | `[earplug~]` 類 HRTF 外部物件，WASM 版是否可用查不到 | BSD（Pd）；Pd4Web、WebPd 開源 | 有社群的 libpd Unity 整合，同一 patch 可共用 | 中（視覺化 patch） | [Pd4Web 3.0.1](https://zenodo.org/records/8412118/latest)、[WebPd 1.0 公告](https://frontend.opencollective.com/webpd/updates/announcing-webpd-complete-refactor) |

### 2.2 Unity 端

| 工具 | 排程精度與時鐘 | 動態節奏（Risset） | 瞬間壓音 | 延遲補償 | 3D 音 | 授權與費用 | WebGL（保留網頁版） | 學習成本 | 來源 |
|---|---|---|---|---|---|---|---|---|---|
| **Unity 內建 Audio** | `AudioSettings.dspTime`＋`AudioSource.PlayScheduled(time)`，樣本級；官方建議提前 100～200 ms 排程 | **可以**：每拍一個 `PlayScheduled`，做法和現在的 Web Audio 一模一樣；拍點表由規則層 C# 算 | AudioMixer snapshot 轉場（有 fade 時間）、`Duck Volume` 側鏈；沒有樣本級的 `setValueAtTime`，要瞬間壓音得在 `OnAudioFilterRead` 自己乘增益或用 DSP 時間排一個預錄的靜音 | `AudioSettings.GetDSPBufferSize` 可估輸出延遲；沒有像 `outputLatency` 的硬體估計 | 內建 3D 與 Spatializer 外掛介面（Oculus／Steam Audio 等） | 隨 Unity 免費 | 支援但功能受限（底層改用 Web Audio，不支援部分 DSP） | 低 | [PlayScheduled 6.2](https://docs.unity3d.com/6000.2/Documentation/ScriptReference/AudioSource.PlayScheduled.html)、[6.7 Alpha](https://docs.unity3d.com/6000.7/Documentation/ScriptReference/AudioSource.PlayScheduled.html)、[WebGL audio](https://docs.unity3d.com/6/Documentation/Manual/webgl-audio.html)、[AudioMixer](https://docs.unity3d.com/ja/2023.2/Manual/AudioMixer.html) |
| **FMOD Studio** | 事件時間軸；`TIMELINE_BEAT`／`TIMELINE_MARKER` 回呼（預設延遲到下一次 `update` 才送到） | 時間軸是固定 tempo 段，**連續變速要用 pitch／參數驅動**；Risset 四層指數加速建議改成「程式化事件」：C# 用 `dspTime` 算拍點，`EventInstance.start()` 或 Core API `ChannelGroup.setDelay` 排樣本級時間 | **Snapshot**（可改 bus 音量與效果，有 intensity 參數與 fade）、側鏈壓縮器；瞬間（<10 ms）靠把 snapshot fade 設 0 或 Core API 的 `setVolumeRamp(false)` | Core API `getDSPClock`／`setDelay` 可做樣本級對齊 | 內建 3D、Resonance／Steam Audio 外掛 | **Indie 免費：開發預算 < 60 萬美元**；Basic 60 萬～180 萬；Premium 以上（官網 2026-11 列表；早年「年營收 < 20 萬」說法已過時） | 支援但單執行緒、部分 DSP 不支援、bank 載入慢（有實務工作法） | 中 | [FMOD licensing](https://fmod.com/licensing)、[FMOD mixing 文件](https://www.fmod.com/docs/2.00/studio/mixing.html)、[Defold 討論：beat 回呼時機](https://forum.defold.com/t/fmod-using-callbacks-on-timeline-beat/75108)、[Pley FMOD WebGL 說明](https://docs.pley.com/docs/using-fmod) |
| **Wwise** | Interactive Music 階層，`MusicSyncBeat`／`MusicSyncGrid`／Music Cue 回呼；tempo 在 bank 內固定 | **最不適合**：社群問答指出 tempo 打包後不能用 RTPC／State 改，變速只能用播放速度（time stretch）RTPC；Risset 要繞到 SoundSFX 層自己排 `PostEvent` | State／RTPC 驅動 bus 音量，Auto-Ducking；RTPC 插值可設 0 ms | 無公開的樣本級排程 API（`PostEvent` 走下一個 audio frame） | 內建 3D、Spatial Audio | **Indie 免費：製作預算 < 25 萬美元**，每平台一張授權；Pro／Premium 付費 | **實驗性**，官方未正式支援（社群報告 Wwise 2024.4＋Unity 6 可跑，需 Addressables） | 高 | [Audiokinetic pricing](https://audiokinetic.com/pricing/for-games)、[Free Indie License](https://www.audiokinetic.com/en/blog/free-wwise-indie-license)、[Q&A：改 tempo](https://www.audiokinetic.com/qa/4851/changing-tempo-in-game-without-using-playback-speed)、[Q&A：WebGL](https://www.audiokinetic.com/qa/13919/wwise-webgl-unity-integration)、[Music cue 用法](https://audiokinetic.com/ja/blog/music-driven-animation) |

**Risset 式多層動態節奏在三者的做法摘要**
- Unity 內建：規則層算拍點 → 每拍 `PlayScheduled`，增益用每個 AudioSource 的 volume（幀級）或預先烘好鐘形音量的樣本；交接要靠拍點表接上。最接近現況。
- FMOD：音樂轉場（transition timeline）適合「區域換編曲」（第 7 節分區編曲）；Risset 打擊層不用時間軸，改用程式化事件＋Core API 的 `setDelay`，snapshot 做盲區與警戒。
- Wwise：Music Switch Container 做分區編曲，Risset 層同樣要自己排 `PostEvent`；tempo 改不了是硬限制。

## 3. B 表：聲音分析工具

| 工具 | 自動化（CI） | 拍點偵測（對合成鼓） | 頻譜圖品質 | 量盲區安靜 dB | 量低音層能量比 | 爆音 | 延遲 | 安裝難度 | 授權 | 來源 |
|---|---|---|---|---|---|---|---|---|---|---|
| **librosa**（PyPI 1.0.0，2026-08；0.11.0 2025-03） | 純 Python，CI 最容易 | `onset.onset_strength`＋`onset_detect` 對合成鼓很準（起音銳利）；`beat_track` 假設近似固定 tempo，對 Risset 加速會抓錯，只用 onset 不用 beat | `display.specshow` 夠用（matplotlib） | `feature.rms` 任意視窗 → dB | STFT 頻帶能量（如 40～120 Hz／全頻） | 峰值 ≥ 0 dBFS 計數要自己寫 | 用 onset 對照排程時間差 | `pip install`，純 Python＋numba | ISC | [PyPI/Snyk](https://dev.snyk.io/advisor/python/librosa)、`pip index versions librosa` |
| **Essentia** | 有 Python，但 Linux／macOS 輪子為主；本機 `pip index` 2026-11-07 查不到相容輪子，CI 要自建或用 Docker | `RhythmExtractor2013`、TempoCNN（深度模型）以音樂為對象，對加速節奏不適合；`OnsetDetection` 可用 | 有 | `RMS`、`Loudness`（含 EBU R128） | 頻帶能量演算法齊 | `ClickDetector`、`SaturationDetector`、`TruePeakDetector` **現成** | 無專門 | 中高 | **AGPL v3**（商業用要注意） | [Essentia 節奏教學](https://essentia.upf.edu/tutorial_rhythm_beatdetection.html)、[Essentia 2.0 論文](https://repositori.upf.edu/handle/10230/35168?show=full)、[ML 模型](https://essentia.upf.edu/machine_learning.html) |
| **aubio**（0.4.9，上游無新版，發行版 2025 仍在打包） | C 函式庫＋CLI（`aubioonset`），CI 容易 | onset 方法多（hfc、complex、specflux），對合成鼓準；`aubiotrack` 同樣假設穩定 tempo | 無 | 無（只給 onset／pitch） | 無 | 無 | 可拿 onset 時刻比對 | apt／pip 可裝，但 Python 綁定舊、對新 NumPy 可能不相容 | GPL v3 | [Alpine 套件](https://pkgs.alpinelinux.org/package/v3.23/community/x86_64/aubio-dev)、`pip index versions aubio` |
| **madmom**（PyPI 0.16.1，久未更新） | 可，但依賴舊 NumPy（≤1.19）與 Cython，要從原始碼裝 | DBN／RNN 拍點追蹤是**少數能跟連續變速**的（狀態空間含 tempo 變化），對 Risset 有參考價值，但模型用真實音樂訓練，合成鼓要驗證 | 無 | 無 | 無 | 無 | 無 | **高**（相依性過時，Python 3.12 支援查不到） | BSD（部分模型另有條款） | [madmom issues](https://www.github.com/CPJKU/madmom/issues)、[NumPy 問題](https://github.com/mzehren/automix/issues/3) |
| **Sonic Visualiser**（5.2.1，2025-03）＋Sonic Annotator | GUI 不適合 CI；**Sonic Annotator** 是 CLI 可跑 Vamp 外掛（本次搜尋沒找到 2025 更新資訊） | 靠 Vamp 外掛（QM Onset Detector、BeatRoot） | **最好**（可互動、多層標註） | 可看波形 dB，不便自動量 | 可疊頻帶濾波後看 | 無專門 | 無 | 桌面安裝（Qt6） | GPL v2 | [SV 新聞](https://sonicvisualiser.org/news)、[Wikipedia](https://en.wikipedia.org/wiki/Sonic_Visualiser) |
| **Audacity**（mod-script-pipe） | 可用 pipe 腳本自動化，但要開 GUI，CI 不實際；**查不到**匯出頻譜圖的腳本命令 | 無 | 好（互動） | 可（Contrast／Plot Spectrum 手動） | 手動 | 「Find Clipping」手動 | 無 | 桌面安裝 | GPL v2+ | [Audacity Scripting 手冊](https://Manual.Audacityteam.org/man/scripting.html) |
| **Meyda**（npm 5.6.3） | 跑在瀏覽器／Node，可塞進 Playwright 錄製流程 | 只給 spectralFlux／energy 等特徵，拍點要自己閾值 | 無（只給特徵） | `rms`、`loudness`（Bark 帶） | `spectralCentroid`、Bark 帶能量 | 無 | 即時取得特徵時刻，可比對排程 | `npm install` | MIT | [npm meyda](https://npmjs.com/package/meyda)、[Best of JS](https://bestofjs.org/projects/meyda) |
| **Web Audio AnalyserNode** | 可在頁內即時跑；精度受主執行緒 `requestAnimationFrame` 影響（我們無頭錄製只有 15 fps，**不適合**量毫秒級） | 無 | 粗 | 粗略 dB | FFT 頻帶可算 | 無 | 無 | 內建 | 免費 | [MDN baseLatency 頁所屬 API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency) |
| **自製 `tools/playtest-recorder/`** | **已在 CI**：無頭 Chromium＋AudioWorklet 分接 PCM，和 `ctx.currentTime` 逐樣本對齊 | 能量法起音偵測，對照遊戲自己記錄的 `start(when)`；殘響、多層同時響會漏或合併 | 有（含盲區／警戒／拍點疊圖） | **有**（盲區安靜檢查） | **有**（警戒低音檢查） | **有** | 用同步方塊對齊畫面（約 40 ms 一幀）；音訊時間本身無延遲誤差 | 已裝好 | 專案自有 | `tools/playtest-recorder/README.md` |

### Risset 節奏的現成實作與分析範例

| 名稱 | 平台 | 內容 | 授權 | 來源 |
|---|---|---|---|---|
| Stowell 2011〈Scheduling and composing with Risset eternal accelerando rhythms〉 | 論文（ICMC 2011） | 排程公式與參數（包含「刷新」方法）；我們的 `p = log2(1 + n ÷ (M·2^k))` 和它同一路線，可拿來對照 | 論文 | [researchr](https://researchr.org/publication/Stowell11)、PDF 可能在 c4dm.eecs.qmul.ac.uk/papers/2011/Stowell2011icmc.pdf（未確認可開） |
| Madison 2009〈An auditory illusion of infinite tempo change based on multiple temporal levels〉 | 論文（PLoS ONE 4(12) e8151） | 聽感實驗：幾層、音量曲線怎麼設最像「一直加速」 | 開放存取 | 見 [QMUL 新聞](https://www.qmul.ac.uk/news/latest-news/2012/se/can-you-keep-up-with-the-dance-music-that-accelerates-forever.html) 引文 |
| PD-risset（Martin Heinze） | Pure Data | 依 Stowell 論文做的 5 層變速取樣播放，附參數說明與未解問題 | CC BY-SA 4.0 | [GitHub 鏡像](https://gh.r-mj.com/devstermarts/PD-risset)、[Codeberg](https://codeberg.org/martstilde/PD-risset) |
| risset-rhythm-effect（tmhglnd） | JavaScript／Tone.js | 5 聲部同一鼓循環，餘弦增益交接；和我們鐘形增益可對照 | 開源（授權見 repo） | [GitHub](https://github.com/tmhglnd/risset-rhythm-effect) |
| Risset Rhythm Generator（Canton Becker） | 瀏覽器工具 | 拖入 WAV／MP3 產生 Risset 版本；**原始碼查不到** | 查不到 | [cantonbecker.com/risset](https://cantonbecker.com/risset/) |
| Stowell 2006 SuperCollider 程式 | SuperCollider | 作者在郵件列表提到放在漢堡大學 wiki；**連結是否仍在查不到** | 查不到 | [auditory list](https://auditory.org/mhonarc/2010/msg00030.html) |
| Rudd-Jones（KCL 2024-25）實務研究 | 論文進行中 | 指出 Madison 2009、Stowell 2011、Ghisi 2021 多只用一種刷新法，暗示交接（refresh）設計還有空間 | — | [LAHP](https://www.lahp.ac.uk/student/samuel-robert-rudd-jones/) |

**分析範例**：查不到專門「分析 Risset 節奏錄音」的開源程式；上述實作都只有生成端。要驗證「聽起來一直加速」目前只能靠我們自己的 onset 間距曲線（見第 5 節）。

## 4. 對木馬之夜的建議

1. **毫秒級 Risset 排程**：維持原生 Web Audio 的 `start(when)`＋規則 anchor 外推；搬 Unity 用 `AudioSettings.dspTime`＋`PlayScheduled`（提前 100～200 ms），不要交給 FMOD／Wwise 的時間軸（tempo 固定）。
2. **循環長度隨危險變**：規則層算拍點表、聲音層只排程，這個分工在三個平台都成立；FMOD 只拿參數（danger 0～1）驅動混音與分區編曲，不拿它算拍。
3. **盲區瞬間壓音**：Web Audio 的 `GainNode.setValueAtTime`／短 ramp 夠用；FMOD 用 snapshot（fade 設 0 或極短）加 Core API `setVolumeRamp(false)`；Wwise 用 State 切 bus 音量、RTPC 插值 0 ms；Unity 內建的 snapshot 轉場有最短 fade，瞬間壓音要在 `OnAudioFilterRead` 乘增益。
4. **安撫判定延遲補償**：Web Audio 讀 `outputLatency`（Safari 18.4 以上才有，舊版退回 `baseLatency`＋固定估計）；Unity 用 `GetDSPBufferSize` 估，FMOD Core 用 `getDSPClock` 對齊。
5. **3D 衛兵腳步**：Web Audio HRTF PannerNode 現況夠用；Unity 內建 3D＋Spatializer 外掛或 FMOD 內建 3D 都能對應，不必為此選 Wwise。
6. **如果要同一份音色跨平台**：只有 RNBO（要買 Max＋RNBO）或 Faust（免費）能把 DSP 同時匯出 Web 與 Unity 原生；但只值得用在鼓與謝帕德音色，排程仍各自寫。現階段不建議投入。

## 5. 自製分析工具缺什麼

對照 B 表，`tools/playtest-recorder/` 可以補的檢查（都可用 librosa 或純 Node 實作，不必換工具）：

| 缺口 | 建議做法 | 對應需求 |
|---|---|---|
| **交接是否突兀**（層間音色、音量交接） | 用 librosa `onset_strength` 曲線（或 Node 端 spectral flux），看每次交接前後 0.5 秒的起音強度包絡是否連續；跳變超過閾值就標紅 | 第 8.1 節、audio.js 鐘形增益 |
| **「一直加速」有沒有成立** | 把偵測到的 onset 取相鄰間距（IOI），畫 log2(IOI) 對時間；應呈鋸齒狀單調下降且每循環回到同一範圍；用 madmom 的 DBN beat tracker 當第二意見（如果裝得起來） | Risset 核心體驗 |
| **分層能量比** | 目前只量「警戒低音」；補每層音色頻帶（低鼓／框鼓／手拍／金屬）的能量隨 x 的曲線，驗證鐘形增益真的落在聽得到的範圍 | 第 7 節避開頻段 |
| **Shepard 音階連續性** | 用 librosa `chroma_stft` 或頻譜質心看每循環是否平滑上升、盲區是否從底部重來 | 第 7 節 |
| **true peak／削波** | 目前爆音檢查是樣本峰值；補 Essentia 式 true peak（4 倍過採樣）或簡化版，避免重取樣後才爆 | 爆音 |
| **響度（LUFS）** | 以 ITU-R BS.1770 短期響度量整體與盲區，比 RMS 更接近聽感；可用 librosa＋簡單 K 加權或 `pyloudnorm` | 盲區安靜幾 dB |
| **假驟降辨識度** | 假驟降交接的金屬尾音（FAKE_TAIL）要能量到：高頻帶在交接 ±0.3 秒的能量是否高於真盲區 | 第 8.5 節 |
| **3D 定位** | 錄立體聲後算左右聲道能量比與 ITD（互相關），對照衛兵座標驗證方向 | 第 8.3 節 |
| **起音偵測精度** | 現在是能量法；改成 spectral flux＋多頻帶（aubio 的 `specflux`／`hfc` 思路）減少殘響、多層同響時的漏偵 | 拍點對齊檢查 |
| **互動式檢視** | 把 `timeline.json` 匯成 Sonic Visualiser 的 layer 檔（CSV 時間標註），需要人看時可拖進去對照頻譜 | 人工判讀 |

## 6. 查不到的項目

- Elementary Audio 目前價格（官網 /pricing 回 404）。
- Tone.js 2025～2026 的 release note 內容（只能確認 npm 15.1.22、2026-10-31 更新）。
- FMOD 目前 Indie 授權的「營收」定義（官網只列開發預算門檻）。
- Wwise WebGL 的官方支援聲明（只有 2018 否定回覆與社群成功報告）。
- Risset 節奏「分析端」的開源程式；Canton Becker 工具原始碼；Stowell 2006 SuperCollider 程式連結是否仍在。
- madmom 對 Python 3.12 的支援；Essentia 目前 PyPI 輪子涵蓋範圍；aubio 上游是否仍維護。
- Audacity 用 mod-script-pipe 匯出頻譜圖的命令。
- Sonic Annotator 2025 以後的更新。

## 7. 來源清單

**Web Audio／網頁工具**
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
- https://web.dev/articles/audio-output-latency
- https://github.com/Tonejs/Tone.js/wiki/Performance
- https://tonejs.github.io/docs/14.7.77/Context
- https://www.npmjs.com/package/tone
- https://www.npmjs.org/package/@nick-thompson/elementary
- https://buttondown.com/elemaudio/archive/elementary-v0110-new-pricing-model
- https://www.npmjs.org/package/@elemaudio/core-lite
- https://cycling74.com/forums/rnbo-1-0-now-available-bundled-with-max-8-5
- https://synthtopia.com/?p=132547
- https://www.sweetwater.com/store/detail/RNBOST/contact
- https://support.cycling74.com/hc/en-us/articles/33849204630419-RNBO-for-Institutions
- https://github.com/Fr0stbyteR/faustwasm
- https://faustdoc.grame.fr/manual/deploying
- https://csound.com/wasm/tutorial1-getting-started
- https://mural.maynoothuniversity.ie/16018
- https://sonic-pi.net/supersonic/demo.html
- https://cdm.link/supersonic-supercollider-for-web/
- https://github.com/supercollider/supercollider/pull/5571/files
- https://zenodo.org/records/8412118/latest
- https://frontend.opencollective.com/webpd/updates/announcing-webpd-complete-refactor

**Unity／中介軟體**
- https://docs.unity3d.com/6000.2/Documentation/ScriptReference/AudioSource.PlayScheduled.html
- https://docs.unity3d.com/6000.7/Documentation/ScriptReference/AudioSource.PlayScheduled.html
- https://docs.unity3d.com/6/Documentation/Manual/webgl-audio.html
- https://docs.unity3d.com/ja/2023.2/Manual/AudioMixer.html
- https://discussions.unity.com/t/any-news-about-dspgraph-audio-framework/927157
- https://fmod.com/licensing
- https://www.fmod.com/docs/2.00/studio/mixing.html
- https://forum.defold.com/t/fmod-using-callbacks-on-timeline-beat/75108
- https://github.com/mrsolo5k/FMODBeatSyncExamples
- https://docs.pley.com/docs/using-fmod
- https://gamedevelliot.itch.io/pixel-land-rpg/devlog/806738/new-settings-menu-and-sfx-fully-migrated-to-fmod
- https://audiokinetic.com/pricing/for-games
- https://www.audiokinetic.com/en/blog/free-wwise-indie-license
- https://www.audiokinetic.com/qa/4851/changing-tempo-in-game-without-using-playback-speed
- https://audiokinetic.com/qa/11686/is-it-possible-to-schedule-rtpc-changes
- https://audiokinetic.com/ja/blog/music-driven-animation
- https://www.audiokinetic.com/qa/13919/wwise-webgl-unity-integration
- https://blog.audiokinetic.com/qa/3074/webgl-html5-using-unity-wwise
- https://docs.pley.com/docs/wwise

**分析工具**
- https://dev.snyk.io/advisor/python/librosa
- https://essentia.upf.edu/tutorial_rhythm_beatdetection.html
- https://essentia.upf.edu/machine_learning.html
- https://repositori.upf.edu/handle/10230/35168?show=full
- https://pkgs.alpinelinux.org/package/v3.23/community/x86_64/aubio-dev
- https://www.github.com/CPJKU/madmom/issues
- https://github.com/mzehren/automix/issues/3
- https://sonicvisualiser.org/news
- https://en.wikipedia.org/wiki/Sonic_Visualiser
- https://Manual.Audacityteam.org/man/scripting.html
- https://npmjs.com/package/meyda
- https://bestofjs.org/projects/meyda

**Risset 節奏**
- https://researchr.org/publication/Stowell11
- https://www.qmul.ac.uk/news/latest-news/2012/se/can-you-keep-up-with-the-dance-music-that-accelerates-forever.html
- https://gh.r-mj.com/devstermarts/PD-risset
- https://codeberg.org/martstilde/PD-risset
- https://github.com/tmhglnd/risset-rhythm-effect
- https://cantonbecker.com/risset/
- https://auditory.org/mhonarc/2010/msg00030.html
- https://www.lahp.ac.uk/student/samuel-robert-rudd-jones/
- https://theses.ubn.ru.nl/handle/123456789/41
