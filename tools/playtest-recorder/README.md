# playtest-recorder：聽得到聲音的自動試玩錄製

雲端機器沒有喇叭。這套工具用無頭 Chromium 跑網頁原型，**直接錄下遊戲送進 Web Audio `destination` 的樣本**，
同時錄畫面、記錄每幀遊戲狀態，最後合成有聲 mp4，並自動分析聲音（頻譜圖、音量包絡、盲區／警戒／起音／爆音／無聲檢查）。
AI 看 `report.md` 與圖；人直接聽 mp4／wav。

## 一行指令：錄木馬之夜一整輪（程式玩家，約 90 秒）

```bash
node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 90
```

輸出在 `tools/playtest-recorder/out/troy-prologue-<時間>/`（`out/` 已列入 `.gitignore`）：

| 檔案 | 內容 |
|---|---|
| `playtest.mp4` | 畫面＋遊戲實際聲音（以右下角同步方塊對齊，誤差約一個影片幀 40 ms） |
| `audio.wav` | 遊戲實際輸出，44.1 kHz 立體聲 16-bit |
| `spectrogram.png` | 頻譜圖（含座標軸；時間軸從 WAV 開頭算） |
| `spectrogram-marked.png` | 頻譜圖疊上盲區（藍）、警戒（橘）、追殺（紅）、低音拍（底部黃刻度） |
| `envelope.png`／`.svg` | 50 ms RMS 音量包絡＋區段＋規則拍點＋偵測到的起音＋提示音（cue）名稱 |
| `report.md` | 自動檢查（通過／不通過＋數字）、每次盲區明細、事件摘要、檔案路徑 |
| `timeline.json` | 每幀狀態（音訊時間 t、相位 p、盲區、警戒、追殺、位置、低音拍…）、事件、排程起音 |
| `analysis.json`、`meta.json` | 全部數字、錄製設定（幀率、音訊斷塊、對齊位移、外部資源） |
| `shots/` | 每 10 秒一張截圖 |

只重跑分析：`node tools/playtest-recorder/analyze.mjs <輸出資料夾>`

## 常用選項（`record.mjs`）

- `--duration <秒>`：錄多久（預設取設定檔，木馬之夜 80）
- `--cover cover|gap`（木馬之夜）：鼓聲模式。`cover`＝不中斷（殘響掩護，規則 `T.COVER_MODE = true`，預設）；`gap`＝留空檔（舊盲區版）。第 1 項檢查依模式換量法
- `--audible`：讓瀏覽器真的從喇叭出聲（預設 `--mute-audio` 靜音輸出裝置，錄音不受影響）；網址一律加 `nolock=1`，不鎖滑鼠
- `--cycle <秒>`：放慢遊戲循環（木馬之夜會同時交給規則與聲音；報告會註明「放慢」）
- `--human-cam`（木馬之夜，11/12）：畫面改用模擬人類的視角（轉頭有延遲與緩衝、走路偶爾瞄旁邊或衛兵、停下或躲著時看向最近的衛兵、手持晃動）。只換畫出來的鏡頭，移動與判定照舊讀程式玩家的方向，所以路線與數字和沒開時一樣；`--seed` 決定瞄的時機。報告影片用
- `--no-bot`：不掛程式玩家；`--scenario <劇本.json>`：照劇本按鍵（可和程式玩家並用）
- `--width/--height`、`--render-scale 0.5`：畫面大小與 WebGL 內部解析度
- `--antialias`：保留遊戲的反鋸齒（預設關掉，提高無頭幀率）
- `--shots <秒>`、`--no-video`、`--no-analyze`、`--no-phase-bar`、`--no-sync-marker`
- 沒有設定檔也能錄：`--dir prototypes/xxx --page index.html`（只錄聲音與畫面；沒有時間軸就只做頻譜、包絡、爆音、無聲檢查）

### 劇本格式（JSON 陣列，或 `{ "steps": [...] }`）

```json
[
  { "wait": 1000 },
  { "down": "KeyW" }, { "wait": 800 }, { "up": "KeyW" },
  { "press": "KeyQ" },
  { "waitFor": "window.TroyDebug.game.panic.active", "timeout": 30 },
  { "eval": "window.TroyDebug.game.cycle.p", "log": "相位" },
  { "mark": "這裡應該要聽到警鐘" },
  { "bot": false }
]
```

劇本用 Playwright 的真鍵盤（`isTrusted = true`）；程式玩家在頁面裡派送 `KeyboardEvent`（`isTrusted = false`）。

## 給其他原型：寫一個設定檔

`profiles/<名稱>.mjs` 匯出：`dir`、`page`、`prepare(page, opts)`（按開始、調參）、`probe()`（每幀回傳 `{ t: 音訊時間, blind, alert, hunted, events }`）、
可選的 `bot(api, sample, state)`、`intervals()`、`expectedBeats()`。`probe`／`bot` 會被轉成字串送進頁面，只能用頁面全域變數。
照 `profiles/troy-prologue.mjs` 抄即可。不寫 `expectedBeats` 時，分析仍會拿偵測到的起音對照遊戲實際呼叫 `start(when)` 的排程時間。

## 原理

1. `lib/inject.js` 在頁面載入前改寫 `AudioNode.prototype.connect`：任何接到 `ctx.destination` 的節點改接到一個分接點，
   分接點照常送到喇叭，同時送進 AudioWorklet 逐塊回傳 PCM（帶 `currentFrame`，和 `ctx.currentTime` 逐樣本對齊）。
2. 同時記錄 `AudioScheduledSourceNode.start(when)`（預定起音）與每幀 `probe()` 結果。
3. 右下角 14×14 黑方塊每 5 秒（音訊時間）閃白；從影片找出閃白的幀，算出聲音要延後多少才和畫面對齊。
4. 外部資源（three.js CDN、Google Fonts）由 `curl` 走環境代理下載，快取在 `out/.cache/`。

## 限制

- **幀率低**：無 GPU，WebGL 走 SwiftShader（CPU）。木馬之夜在 4 核機器上約 15 fps、偶爾卡 0.2 秒；規則每幀才推進一次，
  按鍵效果有幀級誤差。聲音是音訊時鐘預先排程，不受幀率影響。需要時用 `--cycle` 放慢或延長 `--duration`。
- **音訊斷塊**：CPU 滿載時音訊執行緒偶爾來不及算（每次約 3～60 ms，90 秒內合計約 0.8 秒），WAV 中補 0，分析時排除，報告會列出。
- 錄到的是喇叭前的數位訊號，不含作業系統混音、喇叭與房間。
- 起音偵測是能量法；殘響、多層同時響時會漏偵或合併。數字適合比較前後版本。
- 程式玩家派送的鍵盤事件 `isTrusted = false`；遊戲若檢查這點要改用劇本。
- 程式玩家自己的動作也會發聲（屏息、衝刺）；`report.md` 的「每次盲區」表會列出盲區內還在響的提示音（cue），判讀時要看。
