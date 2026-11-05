# pixelate：照片轉像素風

從 `ideas/unity-game-dev-101` 分支保留下來的小工具（該分支的入門教材已刪除，2026-11-05）。
把一張照片轉成像素畫風格：先縮小成大色塊、壓縮色盤，再用最近鄰放大回原尺寸，讓邊緣維持方塊感。

目前主線和原型都是低多邊形 3D，用不到；留著備用（例如 2D 宣傳圖、選單圖示）。

## 用法

```bash
pip install -r tools/pixelate/requirements.txt
python tools/pixelate/pixelate.py 輸入.jpg 輸出.png --pixel-size 8 --colors 32
```

| 參數 | 說明 |
|---|---|
| `--pixel-size` | 每個方塊對應原圖幾個像素；越大越粗糙（8 是不錯的起點） |
| `--colors` | 色盤數量；越小風格越強烈（16、32 常見） |

匯入 Unity 時，貼圖設定 Filter Mode＝Point (no filter)、Compression＝None，才能保持銳利的邊緣。
