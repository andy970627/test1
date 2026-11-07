# 音效設計分析：對齊電影原聲帶的古希臘音色（2026-11-07 草稿，待確認）

使用者要求：遊戲裡的動作音效（例如彈弓）要像 Nolan《奧德賽》原聲帶〈Ithaca〉那種特殊的古希臘風格音色。
限制不變（規格第 31 節）：原聲帶的旋律與錄音有版權，**不放進遊戲**；只學它的樂器、奏法與音色，全部用 `ProceduralAudio` 合成。

## 1. 原聲帶用了什麼（依據）

| 元素 | 報導內容 | 來源 |
|---|---|---|
| 不用管弦樂團 | Nolan 要求避開「史詩片的西方浪漫管弦樂」，改「召喚青銅時代的材質感」 | [Classic FM](https://www.classicfm.com/discover-music/periods-genres/film-tv/ludwig-goransson-score-odyssey/)、[Empire](https://www.empireonline.com/movies/news/the-odyssey-score-ancient-greek-instruments/) |
| aulos（雙管簧樂器） | 西元前五、六世紀的樂器，原始簧片一片都沒留下，演奏者 Callum Armstrong 靠文獻與試錯重建 | [Variety](https://variety.com/2026/artisans/news/the-odyssey-ludwig-goransson-film-score-1236813153/)、[Rolling Stone](https://www.rollingstone.com/tv-movies/tv-movie-news/the-odyssey-ludwig-goransson-score-1235575534/) |
| 里拉琴 | 撥（pluck）與刷（strum）兩種奏法；**Nolan 提議用里拉琴的撥弦代表奧德修斯拉弓** | Classic FM |
| 青銅鑼 | 租了 35 面大小不同的青銅鑼做實驗；開場曲〈Zeus's Law〉就是鑼＋輕撥的里拉琴 | Variety、[Music Times](https://www.musictimes.com/articles/112292/20260713/inside-ludwig-goranssons-odyssey-score-ancient-instruments-james-blake-no-traditional.htm) |
| 敲擊現成物 | 敲牆壁、欄杆、廢金屬、空調機 | Variety |
| 人聲 | James Blake 的聲音負責情緒的節奏 | Variety、Music Times |
| 合成器 | 古樂器錄下來再用合成器疊加、變形 | Music Times |
| 〈Ithaca〉主題 | aulos 在 **D 持續低音**上吹**五聲音階**的短句，古樂器配現代和聲與不和諧音 | [Behind the Score](https://www.behindthescore.org/articles/odyssey-ithaca-theme-ludwig-goransson) |

沒查到的：報導裡**沒有**提到彈弓或投石索的專屬音效，也沒有逐軌的音效設計說明。所以下面「彈弓像〈Ithaca〉」是我依「里拉琴撥弦＝拉弓」這條線索推的設計，要你確認。

## 2. 遊戲現在有的（`ProceduralAudio`）

| 已有 | 做法 | 對齊程度 |
|---|---|---|
| 里拉琴 `Lyre(degree)` | Karplus–Strong 撥弦，D 多利安（D3 起 8 音） | 對：D 為中心、撥弦。缺「刷弦」 |
| 持續低音 `Drone` | D2 哼鳴，4 秒循環 | 對：〈Ithaca〉的 D 持續低音 |
| 框鼓 `FrameDrum` | 悶擊 85 Hz | 可：原聲帶主要是鑼不是鼓；心跳層保留鼓，鑼另加 |
| 吟唱 `Chant`、追殺 `ChaseLyre`、`LowChord` | 合成人聲、小二度反覆、D 小調和弦 | 對 |
| 彈弓 `SlingSnap`／`SlingStretch` | 皮筋打木柄的「啪」、細吱聲 | **只有物理聲，沒有樂器身分** |
| 弓 `Twang` | 純弦振 | 同上 |
| 巨石 `BoulderSettle`、`BoulderHeavy`、`Grind` | 低頻「咚」、滾動 | 物理聲 |
| 雷 `Thunder`、貓頭鷹、海風、海鳥 | 環境 | 不動 |

## 3. 提案：每個動作音效的「樂器身分」

原則：**物理聲保留（玩家要聽得出那是什麼），再疊一層古樂器的「身分音」**，身分音只有玩家聽得到（2D、不經 SoundBus、不照亮），和現有「只有玩家聽得到的小回饋」（規格第 22 節 B）同一層。

| 動作 | 物理聲（已有） | 疊上的身分音（新） | 為什麼 |
|---|---|---|---|
| **彈弓空彈**（空白鍵點一下） | 皮筋「啪」 | 一聲**短促的里拉琴撥弦**（D，0.3 秒就止音，像用手掌壓住弦） | Nolan「撥弦＝奧德修斯的弓」；彈弓是他的代表動作，給它最清楚的身分 |
| **拉彈弓**（按住） | 細吱聲 | 吱聲改成**皮筋拉緊的音高上滑**（0.8 秒從 D 滑到 A），拉滿時停在 A | 讓「拉多滿」聽得出來，和〈Ithaca〉的滑音感一致 |
| **射出石子** | 「啪」＋石子落地 | 撥弦（A，比空彈高五度）；落地仍是石頭聲 | 空彈／射出聽得出差別 |
| **拉弓、射箭** | `Twang` | 改成 Karplus–Strong 弦音＋木弓身共鳴（低頻短衰減） | 同一把「弦」的家族，但比彈弓厚 |
| **巨石每推開 25%** | `BoulderSettle` 咚 | 一聲**低青銅鑼**（約 D2，4 秒衰減，帶金屬泛音） | 原聲帶的鑼；進度是這場最重要的里程碑 |
| **巨石全開** | 海風＋上行琶音 | 琶音改成**里拉琴刷弦**（五個音 0.15 秒內刷過）＋一聲中鑼 | 「刷」是原聲帶另一種奏法，留給最大的時刻 |
| **巨人拍巨石**（第 1 批新加） | 兩下悶拍 | 不加身分音 | 這是巨人的聲音，不該有英雄的樂器 |
| **學會一個動作** | `LearnChime`（880 Hz 鈴） | 改成**里拉琴上行三音**（D–F–A） | 原本的鈴聲是現代音色，不出自《奧德賽》 |
| **同伴被吃** | `LowChord` | 加一聲**悶鑼**（低、短、壓住） | 鑼當喪鐘 |
| **天亮前 30 秒** | 海鳥、浪 | 持續低音 D 升半音到 D♯（規格 31 H5，未做） | 〈Ithaca〉的 D 持續低音被扭曲＝時間不對了 |
| **禱告** | 低沉人聲 | 加 aulos 式的**雙簧持續音**（兩個相差 3 Hz 的鋸齒波，產生拍頻） | aulos 是雙管，拍頻是它的特徵；巨人向父親禱告的「異族感」 |
| **恐懼配樂** | 框鼓＋心跳 | 第 3 層加**刮鑼**（鑼邊持續摩擦的高頻） | 原聲帶的金屬質感；保留框鼓 |

**不做的**：aulos 旋律當背景音樂。〈Ithaca〉的五聲音階短句太有辨識度，做了像抄；而且洞裡不該有音樂，只有聲音。

## 4. 合成做法（全部現有工具能做）

| 音色 | 做法 |
|---|---|
| 里拉琴撥弦（短止音） | 現有 Karplus–Strong，衰減係數從 0.497 改 0.48、長度 0.3 秒 |
| 刷弦 | 五個撥弦相隔 30 ms 疊加 |
| 皮筋上滑 | 鋸齒波頻率隨拉的比例從 147 Hz 線性到 220 Hz，加 2% 雜訊 |
| 青銅鑼 | 不諧和泛音疊加（基頻 × 1、1.5、2.1、2.7、3.9），各自不同衰減（基頻最慢 4 秒），起音 20 ms 加一撮雜訊；大小鑼只差基頻 |
| 刮鑼 | 高頻（3～6 kHz）帶通雜訊，音量隨 2 Hz 起伏 |
| aulos 雙簧 | 兩個鋸齒波相差 3 Hz，低通 1.5 kHz，加 5 Hz 微顫 |

## 5. 待你決定

1. 彈弓的身分音：**里拉琴撥弦**（建議，Nolan 的「撥弦＝弓」）／只改皮筋上滑不加琴／不動。
2. 鑼要不要進來：**巨石 25%、全開、同伴被吃三處**（建議）／只有巨石／不要。
3. 禱告加 aulos 雙簧：加（建議）／不加。
4. 順序：和「少用文字」第 2 批一起做（手勢出現時配身分音）／另開一批。
