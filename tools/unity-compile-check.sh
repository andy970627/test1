#!/usr/bin/env bash
# Linux 上的 Unity 執行期程式編譯檢查（不需要 Unity）：bash tools/unity-compile-check.sh
# 把 Assets 裡的執行期 .cs（不含 Editor、Tests、TextMesh Pro）複製到 tools/UnityCompileCheck/gen，
# 把 Unity 6 才有的 API 換成 2021 的寫法後，對 NuGet 的 Unity 參考組件編譯。通過時最後一行是 Build succeeded。
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
gen="$root/tools/UnityCompileCheck/gen"
rm -rf "$gen" && mkdir -p "$gen"
cd "$root/Assets"
find . -name '*.cs' -not -path '*/Editor/*' -not -path '*/Tests/*' -not -path './TextMesh Pro/*' -not -path './TutorialInfo/*' -print0 |
while IFS= read -r -d '' f; do
  out="$gen/${f#./}"
  mkdir -p "$(dirname "$out")"
  sed -e 's/\.linearVelocity/.velocity/g' -e 's/\.linearDamping/.drag/g' -e 's/\.angularDamping/.angularDrag/g' "$f" > "$out"
done
dotnet build "$root/tools/UnityCompileCheck/UnityCompileCheck.csproj" -nologo -v q -clp:NoSummary
echo "Build succeeded"
