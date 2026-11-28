#!/usr/bin/env python3
# Stop hook：這一回合最後一則給使用者的回覆若主要是英文，就擋下並要求用繁體中文重寫（不重做工作）。
import json, re, sys
d = json.load(sys.stdin)
if d.get("stop_hook_active"):          # 已經因 hook 續跑過一次，不再擋，避免無限循環
    sys.exit(0)
last = ""
try:
    for line in open(d["transcript_path"], encoding="utf-8"):
        e = json.loads(line)
        if e.get("type") == "user" and isinstance(e["message"].get("content"), str):
            last = ""                   # 新的使用者訊息：重新計算這一回合
        if e.get("type") == "assistant":
            for b in e["message"].get("content", []):
                if b.get("type") == "text":
                    last = b["text"]
except Exception:
    sys.exit(0)
s = re.sub(r"```.*?```|`[^`]*`|https?://\S+", "", last, flags=re.S)
cjk = len(re.findall(r"[一-鿿]", s))
lat = len(re.findall(r"[A-Za-z]", s))
if lat < 80 or cjk / (cjk + lat / 4.5) >= 0.6:
    sys.exit(0)
print(json.dumps({"decision": "block", "reason":
    "上一則給使用者的回覆主要是英文，違反 CLAUDE.md。請不要重做工作，"
    "直接用繁體中文把同一則回覆完整重寫一次（程式識別名稱、路徑可保留英文）。"}, ensure_ascii=False))
