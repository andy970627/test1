#!/usr/bin/env bash
# 整夜自動驗證一鍵跑：程式玩家批次 → 兩版錄音（不停版會故意喘氣引起警戒）＋腳步測試段 → 確認沒有殘留瀏覽器 → 報告
#   bash tools/telemetry/overnight-run.sh                 # 各 500 局、錄音各 90 秒
#   N=50 DUR=30 TAG=trial bash tools/telemetry/overnight-run.sh   # 小樣本試跑
# 本機要先有 playwright（NODE_PATH 指到 %LOCALAPPDATA%\test1-node-tools\node_modules）與 ffmpeg；見 docs/process/agent-notes/tools.md。
# 原始輸出都在 tools/playtest-recorder/out/（不進 git）；報告寫到 REPORT（預設 docs/process/overnight-validation-2026-11-11.md）。
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
N="${N:-500}"; DUR="${DUR:-90}"; TAG="${TAG:-1111}"
OUT="tools/playtest-recorder/out"
REPORT="${REPORT:-docs/process/overnight-validation-2026-11-11.md}"
: "${NODE_PATH:=${LOCALAPPDATA:-}/test1-node-tools/node_modules}"; export NODE_PATH
export FFMPEG="${FFMPEG:-$(command -v ffmpeg)}" FFPROBE="${FFPROBE:-$(command -v ffprobe)}"
mkdir -p "$OUT"
log() { echo "[overnight $(date +%H:%M:%S)] $*"; }

log "程式玩家：各 $N 局"
node tools/telemetry/overnight-sim.mjs --n "$N" --out "$OUT/overnight-sim-$TAG.json" > "$OUT/overnight-sim-$TAG.md" || log "程式玩家批次失敗（exit $?）"

for m in cover gap; do
  log "錄音：$m $DUR 秒"
  node tools/playtest-recorder/record.mjs --profile troy-prologue --duration "$DUR" --cover "$m" --out "$OUT/overnight-$m-$TAG" > "$OUT/overnight-$m-$TAG.log" 2>&1
  rc=$?
  if [ $rc -ne 0 ] && grep -q "Page crashed" "$OUT/overnight-$m-$TAG.log"; then   # 偶發，重錄一次
    log "頁面當掉，重錄 $m"
    rm -rf "$OUT/overnight-$m-$TAG"
    node tools/playtest-recorder/record.mjs --profile troy-prologue --duration "$DUR" --cover "$m" --out "$OUT/overnight-$m-$TAG" > "$OUT/overnight-$m-$TAG.log" 2>&1 || log "$m 重錄仍失敗"
  fi
done

log "錄音：腳步測試段 45 秒（不停，離拍起步累積腳步樣本）"
node tools/playtest-recorder/record.mjs --profile troy-prologue --duration 45 --cover cover --step-test --no-video --out "$OUT/overnight-steps-$TAG" > "$OUT/overnight-steps-$TAG.log" 2>&1 || log "腳步測試段失敗（exit $?）"

sleep 5   # 瀏覽器關閉要幾秒，太早數會數到正在結束的程式
left=$( (tasklist 2>/dev/null || ps -e) | grep -ci "headless" || true)
log "殘留的無頭瀏覽器：$left 個"

node tools/telemetry/overnight-report.mjs --sim "$OUT/overnight-sim-$TAG.json" --cover "$OUT/overnight-cover-$TAG" --gap "$OUT/overnight-gap-$TAG" --steps "$OUT/overnight-steps-$TAG" --out "$REPORT"
log "完成：$REPORT"
