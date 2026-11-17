#!/bin/bash
# 嚴格檢查（提交閘門）：把 HEAD 解到暫存資料夾、蓋上要提交的檔，跑全套 Node 測試；任何失敗都回傳非 0。
# 用法：bash tools/cleancheck.sh <要提交的檔...> && git add ... && git commit ...（不要接管線）
R="$(git rev-parse --show-toplevel)" || exit 1
D="$(cygpath -m "$(mktemp -d)")" || exit 1
git -C "$R" archive HEAD | tar -x -C "$D" || { echo "解壓失敗"; exit 1; }
for f in "$@"; do mkdir -p "$D/$(dirname "$f")" && cp "$R/$f" "$D/$f" || { echo "複製 $f 失敗"; exit 1; }; done
cd "$D" || exit 1
node --test prototypes/*/*.test.js prototypes/odyssey-series/*.test.js tools/telemetry/*.test.js > "$D/test.log" 2>&1
rc=$?
[ -s "$D/test.log" ] || { echo "沒有測試紀錄"; exit 1; }
grep -E "^(# |ℹ )(tests|pass|fail) " "$D/test.log" || { echo "找不到測試摘要"; tail -20 "$D/test.log"; exit 1; }
grep -qE "^(# |ℹ )fail 0$" "$D/test.log" || { echo "有失敗"; exit 1; }
[ $rc -eq 0 ] || { echo "node 退出碼 $rc"; exit 1; }
echo "嚴格檢查通過"
