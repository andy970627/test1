# 字體選擇分析：《奧德賽：獨眼巨人洞穴》

日期：2026-11-04
範圍：遊戲內所有文字（選單、HUD、提示、紀事、死亡卡）、設計系統、宣傳圖

---

## 1. 現況（從程式碼查到的）

| 項目 | 實際情況 |
|---|---|
| 畫面怎麼畫字 | 全部用 IMGUI：`GUIStyle(GUI.skin.label)`，**沒有設定 `font`** |
| 實際用的字 | Unity 預設字型，中文靠作業系統字型補字。每台電腦長得不一樣，Windows 通常是微軟正黑體 |
| `OdysseyFonts.cs` | 寫好了用 TextMesh Pro 建立系統中文字型，但**整個專案沒有任何地方用到** |
| 專案裡的字型檔 | 只有 TMP 附的 `LiberationSans.ttf`，沒有中文字 |

**結論：目前遊戲其實沒有選過字體。** 玩家看到的是「系統剛好有什麼就用什麼」，而美術手冊要的「古希臘神廟石碑銘文風格」完全沒有落實到字上。

---

## 2. 設計面向：一套字要同時滿足的條件

| 面向 | 對這款遊戲的具體要求 |
|---|---|
| **主題語氣** | 邁錫尼青銅時代 × 實體暗黑質樸。要有「刻在石頭上」的重量，不能是現代科技感、可愛手寫或中國書法味 |
| **字的角色分工** | 至少分兩種聲音：**說書人／史詩**（標題、開場、死因、紀事）與**操作**（按鍵提示、HUD）。手冊與 `docs/game-text.md` 已經把這兩種語氣分開，字體也該分開 |
| **黑底可讀性** | 淺字在純黑上會「暈開」看起來比較粗（irradiation），細筆畫反而容易斷。明體的細橫在小字會消失，**只適合大字**；提示、HUD 要筆畫均勻的黑體 |
| **疊在 3D 畫面上** | 提示浮在會動的洞穴上，只靠 2px 陰影撐住，需要中等以上字重、開口大的字形 |
| **字級範圍** | 18px（除錯）到 120px（死亡標題）。大字要有個性，小字要清楚 |
| **字元涵蓋** | 繁體中文為主；中文常用字＋全形標點「〔〕・／：」與 ▸；英文標誌用的拉丁字母（可加希臘字母） |
| **授權** | 要能**打包進遊戲發售**：優先 SIL OFL 1.1（可免費商用、可內嵌，不可單獨販售字型檔） |
| **引擎與檔案大小** | 中文字型檔動輒 10–20MB。遊戲文字是固定的，可以**只保留用到的字（子集化）**，壓到幾百 KB |

---

## 3. 候選字體

### 中文：史詩／銘文角色

| 字體 | 授權 | 風格 | 適合度 |
|---|---|---|---|
| **源流明體 GenRyuMin TC** | OFL 1.1 | 以思源宋體為基礎，字面稍窄、字距寬、**楔形襯線更多**，有刀刻感 | ★★★ 最像鑿在石頭上的字，適合標題與「葬 身 洞 中」 |
| **源樣明體 GenYoMin TC** | OFL 1.1 | 同一作者，活字印刷風、保留古雅舊字形 | ★★★ 適合紀事內文與說書人的長句，書卷感較重 |
| 思源宋體／Noto Serif TC | OFL 1.1 | 標準現代明體，字重齊全 | ★★ 穩定但個性不足，可當備案 |
| 霞鶩文楷 TC | OFL 1.1 | 楷書、手寫溫度 | ★ 書法感是中國文人味，和希臘青銅時代的質樸衝突，**不建議** |

### 中文：操作／HUD 角色

| 字體 | 授權 | 說明 |
|---|---|---|
| **思源黑體／Noto Sans TC** | OFL 1.1 | 筆畫均勻、字重齊全，黑底小字最穩。和目前微軟正黑體的觀感接近，換掉後玩家幾乎無感，但**每台電腦都一致** |
| 微軟正黑體（現況） | 系統內建，**不能打包散布** | 只有 Windows 有，換平台就跑掉 |

### 拉丁／希臘字母：標誌與宣傳

| 字體 | 授權 | 說明 |
|---|---|---|
| **Cinzel** | OFL 1.1 | 以一世紀羅馬碑文大寫為本，適合「ODYSSEY」標誌、商店頁。注意：它是**羅馬**碑文，不是希臘 |
| **GFS Neohellenic** | OFL 1.1 | 希臘字型協會出品，有真正的希臘字母，適合 ΟΔΥΣΣΕΙΑ、ΟΥΤΙΣ（「無人」）這類點綴 |

---

## 4. 建議：兩套字＋一套點綴

| 角色 | 字體 | 用在哪（設計系統 token） |
|---|---|---|
| **銘文**（display） | 源流明體 TC，Bold／Heavy | `menu-title`、`briefing-title`、`death-title`、結局標題 |
| **說書**（narration） | 源樣明體 TC，Regular／Medium | `briefing-body`、`death-cause`、紀事條目（`menu-body`、`menu-small`）、核心法則 `law` |
| **操作**（UI） | 思源黑體 TC，Medium | `menu-item`、`prompt`、`hud-base`、`objective`、除錯面板 |
| 點綴（只用於宣傳與封面） | Cinzel／GFS Neohellenic | 標誌、商店頁、設計系統封面 |

**為什麼這樣分：**

1. **語氣與字體一致**：說書人第三人稱的句子用明體，聽起來像史詩；按鍵提示用黑體，讀起來像指令。玩家不用看內容就知道這行是故事還是操作。
2. **大字有刀刻感、小字不斷筆**：明體只出現在 33px 以上（1080p），細筆畫不會被黑底吃掉；31px 以下全部是黑體。
3. **金色只配銘文**：`gold` 標題配源流明體，讓「紀事已解鎖」真的像浮雕金字，落實手冊第 6 節。
4. **全部 OFL**：可以合法打包，換平台也不會變。

**要注意的風險：**

- 明體在 `parchment-dim`（45% 透明）時更淡更細，紀事裡「尚未經歷」可能要改用黑體，或把透明度提高。
- 「葬 身 洞 中」換成明體 Heavy 後，3px 黑描邊在楔形襯線上可能糊在一起，要實際截圖比對。
- 三套字會增加打包大小，但子集化後每套只剩遊戲實際用到的幾百個字。

---

## 5. 實作方式（工具與流程）

1. **取得字型**：從各自的 GitHub release 下載 TTF／OTF（源流、源樣：ButTaiwan；思源黑體：Google Fonts 或 Adobe）。連同 `OFL.txt` 一起放進 `Assets/Fonts/`。
2. **子集化**：用 fonttools 的 `pyftsubset`，把 `docs/game-text.md` 和程式裡所有字串的字元收集起來，再加上數字、全形標點，只留下這些字。
3. **IMGUI 套用**：在 Unity 匯入成 `Font`，給 `GameMenus`、`MissionHud`、`DeathScreen`、`WorldPrompts`、`SituationHints` 的 `GUIStyle` 設定 `font`。比照 `OdysseyPalette.cs`，把字型集中到一個共用檔（可以直接改寫沒人用的 `OdysseyFonts.cs`），每個字級對應一種角色。
4. **若改用 TextMesh Pro**：用「靜態主字型（只含已知字）＋動態備援字型（開 Multi Atlas）」的做法，且一定要是 SDF 字型資產，放大才不會糊。
5. **驗證**：用 verify-odyssey 截圖比對主選單、簡報、紀事、死亡卡、提示五個畫面；檢查黑底對比和描邊。
6. **同步設計系統**：把字型檔加到設計系統的 `fonts/`，更新 `type.fonts` 與各字級的 `family`，預覽就會顯示真正的字。

---

## 6. 下一步選擇

- **A（建議）**：照第 4 節的三套字，先只換「銘文」角色（標題與死亡卡），截圖確認風格後再擴大。
- **B**：只把系統字型換成打包的思源黑體，先解決「每台電腦不同」，風格之後再談。
- **C**：全部換明體（包括提示）。風格最統一，但小字可讀性最差，不建議。

---

### 來源

- 源樣明體（OFL 1.1，可商用）：https://github.com/ButTaiwan/genyo-font
- 源流明體：https://github.com/ButTaiwan/genryu-font ；設計差異說明：https://en.wikipedia.org/wiki/Source_Han_Serif
- 霞鶩文楷 TC：https://github.com/lxgw/lxgwwenkaitc ；授權 OFL-1.1：https://fontsource.org/fonts/lxgw-wenkai-tc/about
- Cinzel（OFL 1.1，羅馬碑文大寫）：https://www.fontsquirrel.com/license/cinzel
- GFS Neohellenic（OFL）：https://rsync.rediris.es/mirror/tex-archive/fonts/greek/gfs/gfsneohellenic/README ；希臘字型協會：https://en.wikipedia.org/wiki/Greek_Font_Society
- TMP 中文字型做法（社群討論，非官方文件）：https://discussions.unity.com/t/correct-way-to-create-a-general-purpose-textmesh-pro-asset-for-non-english-languages/822769
