# 計畫：彈弓、宙斯法則、雅典娜與燃燒的木馬、恐懼半徑、吟遊詩句（規格第 31 節）

日期：2026-11-02　分支：`ccr-af2426a7-4ie22x`　依據：規格第 31 節 A～J（第十八、十九輪回饋），使用者兩題都選第一案。

## 0. 做法

- 照以前的流程：Claude 依序做完，每個任務先寫測試、看到失敗再實作（規則都放 `Assets/Odyssey/Core`，用 `dotnet test tools/CoreTests` 跑）；最後派一個審查子代理看整段，一次修完重大與重要問題。
- 每個任務一個 commit；只 `git add` 明確路徑（交接檔第 4 節第 7 條）。
- 這個環境沒有 Unity，也還沒裝 .NET：開工前先裝 .NET 10 SDK 跑規則測試；Unity 端的程式只能靠 CI 的 EditMode 測試和編譯檢查，**實際手感要使用者在 Unity 按 Play 測**。
- 報告時間有限，分三批，**每批做完都能玩、都能推上去**。第 1 批就足以在報告裡展示。

### 我替你做的決定

| 項目 | 決定 | 理由 |
|---|---|---|
| `SoundKind.Clap` | 程式裡的名字不改，只換聲音和玩家看到的文字 | 有 54 處引用，CSV 舊資料也用這個名字；改名只會多風險 |
| 彈弓射出的石子 | 新寫 `SlingStone`（參考 `Arrow` 的飛行與碰撞），落地後變回可撿的石子 | 石子要能再撿起來塞楔子 |
| 雅典娜、木馬、雙手 | 全部用方塊、膠囊、圓柱組成，暗色自發光 | 後期美術才換模型 |
| 第 26 節 D 的雙手 | 只做本計畫用到的「拿彈弓、拉彈弓、發抖、低頭」；拿弓、推巨石、木樁的姿勢留到之後 | 控制範圍，先做報告看得到的 |

## 1. 第 1 批：彈弓與宙斯法則（報告可展示的核心）

### 任務 1：`SlingshotDraw`（規則）
- 新檔 `Assets/Odyssey/Core/SlingshotDraw.cs`、測試 `Tests/Editor/SlingshotTests.cs`。
- 規則：`Begin()`、`Tick(dt)`、`Release(bool hasStone)` 回傳 `SlingshotShot`（`SnapOnly` 或 `Stone(speed)`）；點一下（< 0.3 秒）＝只彈；0.8 秒拉滿；速度 10 + 14 × 比例；拉的時候 `WalkMultiplier` 0.5。
- 測試：點一下只彈、拉 0.3 秒以上有石子才射、沒石子只彈、拉滿速度 24、半拉速度 17、走速倍率。

### 任務 2：`SoundRules` 加入彈弓的聲音
- `Clap` 註解改成「彈弓空彈」，聲量 0.5 不變；新增 `SnapShot`（射石子時的「啪」，0.4，照亮）、`Stretch`（拉皮筋，0.1，不照亮）。
- 更新 `SoundRulesTests`：聲量、`Lights` 兩欄。

### 任務 3：`ZeusLaw`（規則）
- 新檔 `Core/ZeusLaw.cs`：`Judge(CyclopsState state, float secondsSinceHeardPlayer, bool targetIsPlayerSound, bool lawOn)` 回傳 `Fair` 或 `Ambush`。
- 規則（規格第 31 節 B 的表）：3 秒內聽過你、而且正朝你的聲音摸索（`Investigate`）、搜尋（`Search`）或要丟岩石（`Throw`）＝`Fair`；禱告、吃人、守石、或沒聽過你＝`Ambush`；`lawOn` 為 false 一律 `Fair`。
- 測試：每種狀態各一個、2.9 秒與 3.1 秒的邊界、開關關掉。

### 任務 4：`CyclopsBrain` 加踉蹌、記住最後聽到玩家的時間、雷鳴後衝刺
- 新狀態 `CyclopsState.Stagger`：2.5 秒不動、`Hear` 全部忽略；結束後 `Investigate` 到出手位置。
- 記錄 `SecondsSinceHeardPlayer` 與 `TargetIsPlayerSound`（給 `ZeusLaw` 用）。
- `Charge(Vector2 player)`：直接朝你去，速度 ×1.3，到點搜完就結束。
- 測試加在 `CyclopsBrainTests`：踉蹌中聽不到、2.5 秒後走向出手點、衝刺速度、衝刺結束條件。

### 任務 5：`ZeusThunder` 與 `AthenaFavor`（規則）
- 新檔 `Core/ZeusThunder.cs`：每夜第一次偷襲 `LightsCave` 為 true，之後 false；`Penalty(followers)` 回傳「死一名跟隨者」或「巨石回滑」；`Reset()` 每夜。
- 新檔 `Core/AthenaFavor.cs`：整場保留；`OnAmbush()` 失去、`OnFair()` 失去時重新得到（回傳是否剛重新得到，給畫面播貓頭鷹）、`Tremble` 偷襲後這一夜為真、`NewNight()` 只重置 `Tremble`；`EverAmbushed`、`Redeemed` 給結局用。
- 測試：上面每一條。

### 任務 6：Unity 端：彈弓、石子、打中巨人
- `EchoPlayer`：空白鍵改走 `SlingshotDraw`；放開時依結果發 `Clap`／`SnapShot`，有石子就射 `SlingStone` 並扣一顆石子；拉的時候走速 ×0.5；`Tremble` 為真時準頭加 ±1.5° 晃動（弓也一樣）。
- 新檔 `Echo/SlingStone.cs`：飛行、落地發 `Stone`、觸發奶桶／乳酪／羊圈（同 `Arrow`）、落地後變成 `StonePickup`。
- `Arrow` 與 `SlingStone` 打中 `BlindCyclops`：呼叫新的 `BlindGameLoop.OnCyclopsHit(point)` → `ZeusLaw.Judge` → `Fair` 時 `Stagger`＋`AthenaFavor.OnFair()`；`Ambush` 時走任務 7。
- 必要引導第一步的按鍵行改成「空白鍵 彈・按住 拉弓射石」（詩句在第 2 批）。

### 任務 7：Unity 端：偷襲的呈現（雷光、雅典娜、燃燒的木馬、奧德修斯的神情）
- 新檔 `Echo/ZeusThunderScene.cs`，照規格第 31 節 B2 的時間表：
  - 0～1 秒：`EchoField` 加一個「全洞照亮」脈衝（`ZeusThunder.LightsCave` 為 true 時）；雷鳴音效。
  - 雅典娜剪影：放在離玩家最遠的岩壁前，頭盔＋羽冠、長矛、圓盾、兩點灰色微光的眼睛；0.4～1 秒轉身 180°；貓頭鷹（兩個小方塊翅膀）往洞頂飛走＋叫聲＋拍翅聲。
  - 1～2.2 秒：岩壁上燃燒的木馬影子（方塊拼的馬，橘紅自發光閃爍，縮小淡出）＋劈啪聲。
  - 1～1.8 秒：鏡頭低頭 15° 再回正、雙手發抖（第一人稱雙手只做彈弓兩個姿勢＋發抖）。
- 代價：`CyclopsBrain.Charge`；`ZeusThunder.Penalty` → 吃掉一名跟隨者（沿用被吃的流程，死因文字「雷殛」）或巨石回滑到最外面的楔子（沿用禱告震動的回滑）。
- `AthenaFavor.OnAmbush()`：縫光熄滅（`Boulder` 加 `SetFavor(bool)`，2 秒淡出／淡入）。
- 正面出手而重新得到眷顧：巨石方向一聲貓頭鷹叫、縫光 2 秒亮回來。

### 任務 8：程式合成的新音效
- `ProceduralAudio` 新增：`SlingSnap`、`SlingStretch`、`Thunder`、`OwlHoot`、`WingFlap`、`FireCrackle`、`DistantCries`。
- `SoundPlayer` 對應播放；雷鳴後背景低音暫停 3 秒（第 2 批有背景音後才生效）。

**第 1 批完成標準**：規則測試全過、CI 編譯過；在 Unity 可以：點空白鍵彈、按住射石子、正面打中巨人看到踉蹌、偷襲看到雷光＋雅典娜轉身＋木馬影子＋低頭、縫光熄滅再贖回。

## 2. 第 2 批：恐懼半徑與吟遊詩句

### 任務 9：`TerrorRadius` 與 `ChaseState`（規則）
- 新檔 `Core/TerrorRadius.cs`：輸入距離、是否追殺、是否在聆聽、是否禱告、難度 → 回傳層數（0～3 或追殺）與 bpm（50／80／120／160）；16／10／5 m 乘難度倍率（熟悉 1.25、普通 1、困難 0.75）；聆聽且 10 m 內回傳 0（安靜）；禱告時回傳「禱告聲」。
- 新檔 `Core/ChaseState.cs`：三種追殺條件（朝你 3 秒內的聲音走且 12 m 內、對你丟岩石、雷鳴後衝刺）；撲空 3 秒後結束。
- 取代 `Heartbeat`（`DeathCard.cs` 裡那個）；`GuidanceTests` 的心跳測試改寫到新規則。
- 測試：規格第 31 節 H8。

### 任務 10：分層配樂（Unity）
- 新檔 `Echo/TerrorMusic.cs`：五條循環（心跳、低音哼鳴、框鼓、男聲吟唱、追殺里拉琴），依 `TerrorRadius` 的層數 0.5 秒交叉淡入；安靜時 1 秒全部淡出；禱告時改播禱告低語（3D）。
- `ScreenFeedback` 的心跳改由這裡控制，四角變暗照舊在第 3 層。
- 混音優先順序（規格第 31 節 H6）：詩句出現時其他聲音降 6 dB。

### 任務 11：`BardVerse`（規則）與詩句顯示
- 新檔 `Core/BardVerse.cs`：兩行詩＋一行按鍵；每行 0.6 秒淡入、做到後 0.8 秒淡出；排隊沿用 `HintQueue`。
- 新檔 `Core/VerseBook.cs`：`docs/game-text.md` 第 10 節的詩句（以那份表格為準，使用者校正後同步）。
- `EssentialGuide.Text` 改回傳（詩句, 按鍵）；`AthenaFavor` 失去時只回傳按鍵。
- `MissionHud`：下方中央畫兩行詩＋小字按鍵；每行開頭撥一聲里拉琴（`ProceduralAudio.Lyre`，D 多利安）；`SituationHints` 加入宙斯法則相關的詩句（10.3.x）。
- 測試：淡入時間點、做到後淡出、失去眷顧時只剩按鍵。

### 任務 12：實驗開關
- `DesignFlags` 新增：宙斯法則（開／關）、引導風格（詩句／簡潔）、恐懼半徑（分層／舊版／關）；`GameMenus` 實驗頁加三列；CSV 記下開關。
- 測試加在 `DesignFlagsTests`。

**第 2 批完成標準**：靠近巨人聽得出三層差別、被追時換追殺配樂、他停下聆聽時突然安靜；必要引導和情境提示都是詩句；三個實驗開關能切換。

## 3. 第 3 批：其他參考遊戲的音效、岸邊與結局

### 任務 13：規格第 31 節 H5 的音效
- 巨石全開：海風灌進來＋上行琶音。
- 同伴被吃：全洞聽得到的慘叫（3D）＋低沉和弦。
- 天亮前 30 秒：縫外海鳥和浪聲漸大、低音升半音。
- 巨人腳步加重低頻＋越近鏡頭越震。
- 躲在羊群或羊圈裡：外界聲音低通濾波、自己呼吸變大。

### 任務 14：岸邊與結局
- `ShoreChoice`：射箭＝偷襲 → 岸邊版的雅典娜轉身＋木馬影子映在海面；字幕加「宙斯看見了」。
- 結局多一句（10.3.9／10.3.10），依 `AthenaFavor.EverAmbushed`、`Redeemed`。
- 測試：`ShoreChoice` 與結局文字的組合。

### 任務 15：紀事與文字
- `GuideBook` 新條目：彈弓、宙斯法則、雅典娜的眷顧、木馬的重量、恐懼半徑（每條上方兩行詩、下方做法）。
- `docs/game-text.md` 補上新的情境提示與紀事文字讓使用者校正。

## 4. 收尾

1. `dotnet test tools/CoreTests` 全過。
2. 推上分支，確認 CI（規則測試；設好 Unity 授權後還有 EditMode 測試與 WebGL）。
3. 派一個審查子代理看整段變更，一次修完重大與重要問題。
4. 交給使用者實測的清單：
   - 點空白鍵與按住射石子的手感、射程。
   - 正面出手與偷襲是否判得合理（3 秒會不會太短）。
   - 雷光＋雅典娜＋木馬那 2.5 秒會不會太長、會不會擋住逃命。
   - 縫光熄滅後找不找得到洞口。
   - 16 m 開始聽到心跳會不會太早知道巨人在哪。
   - 詩句會不會太長、讀不完。
5. 回報時列出「我替你做的決定」與「延後的小問題」。

## 5. 不在這次範圍

- 投石索（規格第 31 節 I）。
- 第 26 節 C 的畫面分區、第 26 節 D 其他動作的雙手。
- 後期美術（雅典娜、木馬、雙手的正式模型）。

## 6. 代理分工（第二十輪回饋：「利用代理分工規劃給我確認」，待確認）

### 6.1 原則

- **一個檔案同一時間只給一個代理改**：並行的代理各自在獨立的 git worktree 工作，檔案不重疊，合併時就不會衝突。
- **熱點檔案只由主代理（我）改**：`BlindGameLoop.cs`（983 行，幾乎每個功能都要接在這裡）、`EchoPlayer.cs`、`SoundEvent.cs`。其他代理需要接進去時，只寫自己的元件，並在回報裡附「要在 `BlindGameLoop` 哪裡呼叫什麼」，由我統一接。
- **規則先、畫面後**：規則代理先做完並合併，Unity 端代理才開工，大家用同一套已測試的規則。
- 每個代理的提示都附上：規格第 31 節、本計畫對應任務、交接檔第 3～4 節（繁體中文、只 `git add` 明確路徑、TDD、不碰使用者未提交的檔案）。
- 每個代理完成時要回報：改了哪些檔、測試結果、替使用者做的決定、延後的小問題。

### 6.2 分工表

| 階段 | 代理 | 任務 | 只改這些檔案 | 並行 |
|---|---|---|---|---|
| 0 | 主代理 | 裝 .NET 10、跑一次 `dotnet test` 確認基準；先在 `SoundEvent.cs` 加 `SnapShot`、`Stretch` 兩個聲音種類 | `SoundEvent.cs` | — |
| A | 規則 1「彈弓」 | 任務 1、2 | `Core/SlingshotDraw.cs`、`Core/SoundRules.cs`、`Tests/SlingshotTests.cs`、`Tests/SoundRulesTests.cs` | A 的四個同時跑 |
| A | 規則 2「巨人」 | 任務 3、4 | `Core/ZeusLaw.cs`、`Core/CyclopsBrain.cs`、`Tests/ZeusLawTests.cs`、`Tests/CyclopsBrainTests.cs` | 同上 |
| A | 規則 3「神祇」 | 任務 5＋任務 11 的規則 | `Core/ZeusThunder.cs`、`Core/AthenaFavor.cs`、`Core/BardVerse.cs`、`Core/VerseBook.cs`、`Core/EssentialGuide.cs`、對應測試 | 同上 |
| A | 規則 4「恐懼半徑」 | 任務 9＋任務 12 的規則 | `Core/TerrorRadius.cs`、`Core/ChaseState.cs`、`Core/DeathCard.cs`（拿掉舊 `Heartbeat`）、`Core/DesignFlags.cs`、`Tests/GuidanceTests.cs`、`Tests/DesignFlagsTests.cs`、新測試 | 同上 |
| A 合併 | 主代理 | 依序合併四條分支、跑全部規則測試、推上去 | — | — |
| B | 音效 | 任務 8＋第 2、3 批所有新音效（`SlingSnap`、`Thunder`、`OwlHoot`、`FireCrackle`、`Lyre`、五條配樂循環、慘叫、海鳥等） | `ProceduralAudio.cs`、`Echo/SoundPlayer.cs` | B 的三個同時跑 |
| B | 畫面「雅典娜與木馬」 | 任務 7 的畫面部分 | `Echo/ZeusThunderScene.cs`（新）、`Echo/FirstPersonHands.cs`（新：彈弓、拉弓、發抖、低頻）、`Echo/Boulder.cs`（縫光 `SetFavor`）、`Echo/EchoField.cs`（全洞照亮） | 同上 |
| B | 介面與配樂 | 任務 10、11 的畫面、12 的選單 | `Echo/TerrorMusic.cs`（新）、`Echo/ScreenFeedback.cs`、`Echo/MissionHud.cs`、`Echo/SituationHints.cs`、`Echo/GameMenus.cs` | 同上 |
| B 同時 | 主代理 | 任務 6：彈弓操作、`SlingStone`、打中巨人的判定流程 | `EchoPlayer.cs`、`Echo/SlingStone.cs`（新）、`Echo/Arrow.cs` | 和 B 同時 |
| B 合併 | 主代理 | 合併三條分支；把雷鳴、眷顧、配樂、詩句全部接進 `BlindGameLoop.cs` | `BlindGameLoop.cs` | — |
| 審查 1 | 審查代理 | 看第 1、2 批整段：規則和規格是否一致、Unity 端有沒有空引用或每幀配置、文字是否符合 `docs/game-text.md` | 只讀，不改檔 | — |
| 修正 | 主代理 | 一次修完重大與重要問題，推上去 | — | — |
| C | 第 3 批代理 | 任務 13～15：其他參考遊戲的音效、岸邊與結局、紀事 | `Core/ShoreChoice.cs`、`Core/GuideBook.cs`、對應測試、`docs/game-text.md`；接 `BlindGameLoop` 的地方照樣交給主代理 | — |
| 審查 2 | 審查代理 | 看第 3 批 | 只讀 | — |

一共 10 個子代理：規則 4、Unity 端 3、第 3 批 1、審查 2。

### 6.3 依賴關係

```
階段 0 ──► A（4 個並行）──► A 合併 ──► B（3 個代理＋主代理並行）──► B 合併 ──► 審查 1 ──► 修正
                                                                                          │
                                                                    第 1、2 批可交使用者實測 ◄┘
                                                                                          │
                                                                          C ──► 審查 2 ──► 修正
```

報告時間緊的話，做完「B 合併」就可以先推給你測，審查和第 3 批之後補。

### 6.4 風險

| 風險 | 處理 |
|---|---|
| Unity 端的程式在這裡沒辦法編譯 | 每次合併都推上去讓 CI 編譯（需要你先照 `docs/ci-setup.md` 設好 Unity 授權）；沒設的話只能等你在 Unity 開專案時看 Console 錯誤 |
| 代理之間理解不一致 | 規則階段先合併，B 階段的代理拿到的是同一份已測試的規則與介面 |
| 子代理比主代理自己做更花用量 | 規則代理的任務都寫得很具體，可以用較快的模型；審查用最強的模型 |
| 合併衝突 | 6.1 的檔案歸屬；若仍衝突由主代理手動解，不讓代理互相覆寫 |

## 7. 試玩代理與模擬代理（第二十一輪：「加進計畫，先從模擬器開始做」）

### 7.1 模擬代理（已做第一版）

- 程式：`tools/NightSim`（`dotnet run -c Release --project tools/NightSim -- --runs 200`），測試：`tools/NightSimTests`（CI 的規則測試工作一起跑）。
- 直接用 `Assets/Odyssey/Core` 的真實規則：巨人大腦、巨石滑動與楔子、天亮、禱告、體力、聲音半徑；空間用平面近似。
- 五種機器人：不動、猛衝、謹慎、引開（射箭）、帶人（先找同伴）。機器人只知道看到、聽到的事。
- 報告：`docs/playtest/sim-report.md`（每次執行覆蓋）。
- 之後每做完一個新規則（彈弓、宙斯法則、恐懼半徑），模擬代理就把它加進模擬器、加一種會用它的機器人，重跑並和前一版比較。

### 7.2 試玩代理（等網頁版）

- 條件：CI 能建出網頁版（要先設 Unity 授權，見 `docs/ci-setup.md`）。
- 本環境的瀏覽器已確認可以跑 WebGL2（軟體繪圖）。
- 做法：用 Playwright 打開網頁版，網址參數開「測試模式」（固定種子、跳過主選單、記錄數值），照腳本按鍵，每個時間點截圖、錄影，抓瀏覽器錯誤。
- 檢查：介面重疊、字讀不讀得清楚、詩句與偷襲畫面的時間點、流程有沒有卡住。
- 能自己調的：時間點、字級、位置、數值；手感、緊張感、聲音好不好聽一律列給使用者決定。

### 7.3 一輪的流程

1. 實作代理寫好功能、推上去。
2. 模擬代理重跑模擬器，和上一版比較。
3. 試玩代理（有網頁版時）截圖錄影檢查。
4. 小調整直接改；大改列出來問使用者。
5. 整理成一頁（數據＋截圖＋影片）給使用者，使用者再進 Unity 確認手感。

### 7.4 第一次模擬的發現（2026-11-02，每種組合 200 場，機器人比真人笨也比真人準，只看趨勢）

| 發現 | 數據 | 可能的意思 |
|---|---|---|
| 熟悉和普通差太多 | 謹慎型整場逃出：熟悉 92%、普通 26%、困難 3%；第一夜逃出：40%／6%／2% | 普通可能偏難；可以考慮讓普通介於兩者之間（例如巨人速度 ×0.85） |
| 天亮幾乎不構成壓力 | 失敗原因裡天亮 0～7%；逃出平均只用 80～120 秒（一夜 240 秒） | 夜太長，時間壓力弱；可以考慮縮短，或讓天光越來越亮時巨人更敏感 |
| 死因主要是被摸到 | 失敗的夜 60～77% 是巨人摸索時摸到 | 「巨人朝聲音走過來摸」是主要威脅，符合設計 |
| 射箭引開沒有明顯幫助 | 普通難度：射箭型 18%、不射的謹慎型 26% | 可能是機器人用法不好，也可能箭的引開效果太弱；等真人實測再看 |
| 原地不動很安全 | 不動的機器人 92% 撐到天亮才失敗 | 躲著不會死，但也出不去，符合「薛西弗斯」的設計 |
| 恐懼半徑 16 m 讓遊戲簡單很多 | 普通難度整場逃出：謹慎 26%→43%、射箭型 18%→52% | 模擬器把「16 m 內知道巨人確切位置」算得太樂觀（心跳其實只告訴你距離），真實影響會小一些；仍建議實作後再跑一次，必要時改成 12 m |

這些是給使用者決定的建議，**還沒有改任何遊戲數值**。
