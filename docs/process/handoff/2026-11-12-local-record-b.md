# 交接：本機用錄影工具重錄高畫質試玩影片（方案 B，2026-11-12）

最終報告用繁體中文。給本機總控（或使用者自己照做）。分支 `claude/gracious-bardeen-vwo4rr`，先 `git pull`。

## 為什麼要本機錄
雲端錄的報告影片（fef840c）畫質差：畫面 960×540、三維半解析度、關反鋸齒，因為雲端沒有顯示卡。本機有顯示卡，可以用 1920×1080、全解析度、開反鋸齒。
**上限要先知道**：錄影工具靠 Playwright 的錄畫面功能，存出來的位元率偏低，就算本機錄也不會很銳利。要最清楚的畫面，改用「使用者自己玩＋Win＋Alt＋R」（方案 A）。

## 要錄的內容（和雲端那支相同，只換畫質）
- 版本：目前分支最新；跑蹲版（`?moves` 預設開）、新鼓聲、視覺輔助全開。
- 程式玩家從開場玩到城門，第 3 區由劇本 `tools/playtest-recorder/scenarios/troy-hunt-zone3.json` 故意跑一秒引來追殺，之後程式玩家自己逃、躲。
- 鏡頭用 `--human-cam`（模擬人類視角，只換畫面，路線不變）。
- **不燒解說字幕**（使用者 11/12：解說由使用者現場口說）。左下角版本列可加可不加。

## 步驟（在 test1 資料夾）
1. 安裝（第一次才需要；交接檔 11/09 寫本機 Playwright 待裝）：
   ```bash
   npm i -D playwright
   ```
   ```bash
   npx playwright install chromium
   ```
   確認 ffmpeg 在 PATH：`ffmpeg -version` 要有回應；沒有就裝 ffmpeg，或設環境變數 `FFMPEG` 指到 ffmpeg.exe。
2. 錄影（約 2 分鐘）：
   ```bash
   node tools/playtest-recorder/record.mjs --profile troy-prologue --play-through --human-cam --aid on --width 1920 --height 1080 --render-scale 1 --antialias --scenario tools/playtest-recorder/scenarios/troy-hunt-zone3.json --duration 90
   ```
   輸出在 `tools/playtest-recorder/out/troy-prologue-<時間>/playtest.mp4`（`out/` 不入庫）。
3. 檢查 `report.md` 的事件：要有 `hunted` 開始與結束、`phase: play→win`。雲端那次是 15 秒追殺、24 秒甩掉、60 秒通關。沒觸發追殺或被抓到重來，就再錄一次（程式玩家每次略有不同）。
4. 剪掉通關後的結算畫面（約 80 秒處；先看片確認城門開完的時間）：
   ```bash
   ffmpeg -i playtest.mp4 -t 80 -vf "fade=t=out:st=78:d=2" -af "afade=t=out:st=78:d=2" -c:v libx264 -crf 18 -c:a aac -b:a 192k 木馬之夜-提示全開版-高畫質.mp4
   ```
5. 卡頓檢查：錄影工具結尾會印「中位幀率」。低於 30 fps 畫面會卡，改 `--render-scale 0.75` 或拿掉 `--antialias` 再錄。

## 交付
- 影片放桌面給使用者，報告時另外播放（簡報不能嵌影片）。
- 簡報第 3 張的「完整有聲影片」一行與講稿目前寫「提示全開解說版、有字幕」，換片後改成新檔名、拿掉字幕那兩行（簡報頁面裡的 Claude 或報告工作階段改，改前先重讀）。
- 製作紀錄 `production-log.md` 補一行：版本、幀率、追殺時間點。

## 失敗時
- `找不到 playwright`：第 1 步沒裝成功；或在 test1 資料夾外執行。
- `ffmpeg 合成失敗`：ffmpeg 不在 PATH。畫面 `video.webm` 與聲音 `audio.wav` 還在輸出資料夾，可以手動合成。
- 時間不夠：改用方案 A（使用者自己玩、Win＋Alt＋R），最快也最清楚。
