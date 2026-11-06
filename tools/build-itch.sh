#!/usr/bin/env bash
# 打包 itch.io HTML5 版：bash tools/build-itch.sh
# 輸出 dist/odyssey-series/（站台）與 dist/odyssey-series.zip（index.html 在 zip 根目錄）
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

# 1. 系列外殼 → 站台根目錄（不含測試檔）
copy_tree() {  # copy_tree <來源資料夾> <目的資料夾>
  local from="$1" to="$2"
  mkdir -p "$to"
  ( cd "$from" && find . -type f ! -name '*.test.js' ! -name '*.test.mjs' ! -name '.DS_Store' -print0 ) |
    while IFS= read -r -d '' f; do
      mkdir -p "$to/$(dirname "$f")"
      cp "$from/$f" "$to/$f"
    done
}
copy_tree "$SRC/odyssey-series" "$OUT"   # 含 shore/ ogygia/ ending/ 與 cave/（若存在）等所有子資料夾

# 2. 乞丐與比箭
mkdir -p "$OUT/beggar" "$OUT/bow"
cp "$SRC/beggar-hall/index.html" "$SRC/beggar-hall/sim.js" "$OUT/beggar/"
cp "$SRC/bow-contest/index.html" "$SRC/bow-contest/rules.js" "$OUT/bow/"

# 3. three.js r128 本地一份（快取後可離線重跑）
if [ ! -s "$THREE_CACHED" ]; then
  echo "下載 three@$THREE_VER …"
  TMP="$(mktemp -d)"
  ( cd "$TMP" && npm pack "three@$THREE_VER" --silent >/dev/null && tar -xzf three-*.tgz package/build/three.min.js )
  cp "$TMP/package/build/three.min.js" "$THREE_CACHED"
  rm -rf "$TMP"
fi
cp "$THREE_CACHED" "$OUT/lib/three.min.js"

# 4. 片段包成完整 HTML、換成本地 three.js
node "$REPO/tools/build-itch.mjs" "$OUT"

# 5. 壓縮（index.html 在 zip 根目錄）
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

# 6. 摘要
echo "—— 打包完成 ——"
( cd "$OUT" && find . -type f | sed 's|^\./||' | sort | while read -r f; do printf '  %-28s %8s bytes\n' "$f" "$(wc -c < "$f")"; done )
echo "檔案數：$(find "$OUT" -type f | wc -l)"
echo "zip：${ZIP#$REPO/}（$(du -h "$ZIP" | cut -f1)）"
[ -d "$OUT/cave" ] || echo "提醒：沒有 cave/（Unity WebGL 建置放進 prototypes/odyssey-series/cave/ 後重跑即可）"
