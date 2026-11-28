# vendor/ 第三方檔案的來源與授權

木馬之夜遊戲頁（`../index.html`）要能離線跑，所以 3D 引擎和字體都放進專案。2026-11-27 下載，使用者同意下載。

## Three.js r128

| 檔案 | 來源 | 版本 | 授權 |
|---|---|---|---|
| `three.min.js`（603,445 位元組，SHA-256 `9274bbce…1ce2`） | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js | r128（檔內 `REVISION="128"`） | MIT，Copyright 2010-2021 Three.js Authors（檔頭有授權註記）。全文：https://github.com/mrdoob/three.js/blob/r128/LICENSE |

不要升版：遊戲是照 r128 的寫法寫的，升版前要先整頁重測。

## 字體（`fonts/`）

用 Google Fonts 的 `text=` 子集服務切出，只含木馬之夜頁面用到的字：掃描 `index.html`、`risset.js`、`audio.js`、`calibration.js`、三個關卡檔、`../nav.js`、`../beatstrip.js`、`../telemetry.js`、`../ui-tokens.css` 裡的所有字，再加上 ASCII 可列印字元，共 1,395 字。每個字重切成 4 個檔（每檔約 450 字），`@font-face` 用 `unicode-range` 標出每個檔有哪些字。

- `fonts.css`：一律載入。內含 Noto Serif TC 600、900，以及 Noto Sans TC 400、500。
- `fonts-ui2.css`：網址加 `?ui=2` 才載入。內含 Noto Sans TC 700，以及 LXGW WenKai TC 400、700。

| 字體 | 字重 | 檔案 | 來源 | 版本 | 授權 |
|---|---|---|---|---|---|
| Noto Serif TC | 600、900 | `notoseriftc-{600,900}-{0..3}.woff2` | https://fonts.google.com/noto/specimen/Noto+Serif+TC（css2 API） | Google Fonts v37 | SIL Open Font License 1.1 |
| Noto Sans TC | 400、500、700 | `notosanstc-{400,500,700}-{0..3}.woff2` | https://fonts.google.com/noto/specimen/Noto+Sans+TC（css2 API） | Google Fonts v40 | SIL Open Font License 1.1 |
| LXGW WenKai TC（霞鶩文楷 TC） | 400、700 | `lxgwwenkaitc-{400,700}-{0..3}.woff2` | https://fonts.google.com/specimen/LXGW+WenKai+TC（css2 API） | Google Fonts v11 | SIL Open Font License 1.1 |

OFL 全文：https://openfontlicense.org/open-font-license-official-text/ 。依 OFL，子集檔可以和程式一起散布，但不能單獨販售；保留原字體名稱，因為 Google Fonts 的子集本身就是原名發布。

**加了新字要重切**：遊戲裡新增的中文字如果不在子集裡，會改用退回字體顯示，例如微軟正黑體或標楷體，同一行字的字形會不一致。新增文字後，重跑切字腳本：在 repo 根目錄執行 `python -I prototypes/troy-prologue/vendor/make-fonts.py`（要網路）。

字體檔合計 2,165,540 位元組（約 2.1 MB，28 個檔），加上 Three.js，vendor/ 合計約 2.8 MB。
