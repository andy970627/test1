#!/usr/bin/env bash
# 打包 itch.io HTML5 版：bash tools/build-itch.sh
# 輸出 dist/odyssey-series/（站台，結構同 prototypes/）與 dist/odyssey-series.zip（總首頁 index.html 在 zip 根目錄）
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/prototypes"
DIST="$REPO/dist"
OUT="$DIST/odyssey-series"
ZIP="$DIST/odyssey-series.zip"
CACHE="$DIST/.cache"
THREE_VER="0.128.0"
THREE_CACHED="$CACHE/three-$THREE_VER.min.js"

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT/lib" "$CACHE"

# 1. 站台結構和 repo 的 prototypes/ 一模一樣（不含測試檔），相對連結在本機和打包版都通
#    根目錄：總首頁 index.html、nav.js（以及其他直接放在 prototypes/ 的頁面或腳本）
#    子資料夾：各原型同名資料夾（odyssey-series/cave/ 若存在也照抄，Unity WebGL 原樣保留）
copy_tree() {  # copy_tree <來源資料夾> <目的資料夾>
  local from="$1" to="$2"
  mkdir -p "$to"
  ( cd "$from" && find . -type f ! -name '*.test.js' ! -name '*.test.mjs' ! -name '.DS_Store' -print0 ) |
    while IFS= read -r -d '' f; do
      mkdir -p "$to/$(dirname "$f")"
      cp "$from/$f" "$to/$f"
    done
}
PROTOS=(troy-prologue bow-risset vengeance bow-contest beggar-hall odyssey-series)
for f in index.html nav.js; do
  [ -f "$SRC/$f" ] || { echo "錯誤：缺少 prototypes/$f" >&2; exit 1; }
done
( cd "$SRC" && find . -maxdepth 1 -type f ! -name '*.test.js' ! -name '*.test.mjs' ! -name '.DS_Store' -exec cp {} "$OUT/" \; )
for p in "${PROTOS[@]}"; do
  [ -d "$SRC/$p" ] || { echo "錯誤：缺少 prototypes/$p/" >&2; exit 1; }
  copy_tree "$SRC/$p" "$OUT/$p"
done
# 清單外的新資料夾也一起帶，免得漏掉；只提醒，記得加進總首頁
for d in "$SRC"/*/; do
  p="$(basename "$d")"
  [ -d "$OUT/$p" ] && continue
  echo "提醒：prototypes/$p/ 不在原型清單裡，照樣打包；記得加進總首頁"
  copy_tree "$SRC/$p" "$OUT/$p"
done

# 2. three.js r128 本地一份（快取後可離線重跑）
if [ ! -s "$THREE_CACHED" ]; then
  echo "下載 three@$THREE_VER …"
  TMP="$(mktemp -d)"
  ( cd "$TMP" && npm pack "three@$THREE_VER" --silent >/dev/null && tar -xzf three-*.tgz package/build/three.min.js )
  cp "$TMP/package/build/three.min.js" "$THREE_CACHED"
  rm -rf "$TMP"
fi
cp "$THREE_CACHED" "$OUT/lib/three.min.js"

# 3. 片段包成完整 HTML、換成本地 three.js
node "$REPO/tools/build-itch.mjs" "$OUT"

# 4. 壓縮（index.html 在 zip 根目錄）
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT" && zip -qr -X "$ZIP" . )
else
  python3 -I - "$OUT" "$ZIP" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(src):
        for f in files:
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, src))
PY
fi

# 5. 摘要
echo "—— 打包完成 ——"
( cd "$OUT" && find . -type f | sed 's|^\./||' | sort | while read -r f; do printf '  %-40s %8s bytes\n' "$f" "$(wc -c < "$f")"; done )
echo "檔案數：$(find "$OUT" -type f | wc -l)"
echo "zip：${ZIP#$REPO/}（$(du -h "$ZIP" | cut -f1)）"
[ -d "$OUT/odyssey-series/cave" ] || echo "提醒：沒有 odyssey-series/cave/（Unity WebGL 建置放進 prototypes/odyssey-series/cave/ 後重跑即可）"
