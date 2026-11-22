#!/usr/bin/env python3
"""作品集本機伺服器：一個網址同時提供 test1 原型與 repo 外的作品，各作品的檔案不搬動、不合併。

用法：py tools/showcase-serve.py [--port 8770] [--github-dir <放 music-garden、routine-sim 的資料夾>]
開啟：http://127.0.0.1:8770/showcase.html

只綁本機位址，同一個網路的其他裝置連不到。
找外部作品的順序：--github-dir、環境變數 SHOWCASE_GITHUB_DIR、家目錄 OneDrive*/文件/GitHub。
"""
import argparse
import functools
import http.server
import os
import posixpath
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "prototypes"
# 網址前綴 → GitHub 資料夾底下的相對路徑
EXTERNAL = {
    "/ext/music-garden/": Path("music-garden") / "prototype",
    "/ext/routine-sim/": Path("routine-sim"),
}


def find_github_dir(explicit):
    """回傳第一個同時含有全部外部作品的資料夾；找不到回傳 None。"""
    candidates = [explicit, os.environ.get("SHOWCASE_GITHUB_DIR")]
    candidates += [str(p) for p in Path.home().glob("OneDrive*/文件/GitHub")]
    for raw in candidates:
        if raw and all((Path(raw) / rel / "index.html").is_file() for rel in EXTERNAL.values()):
            return Path(raw)
    return None


def resolve_external(url_path, github_dir):
    """把 /ext/ 網址換成實際路徑；前綴不符或企圖跳出作品資料夾時回傳 None。"""
    if github_dir is None:
        return None
    clean = posixpath.normpath(urllib.parse.unquote(url_path.split("?", 1)[0].split("#", 1)[0]))
    if url_path.split("?", 1)[0].endswith("/"):
        clean += "/"
    for prefix, rel in EXTERNAL.items():
        if clean.startswith(prefix):
            base = (github_dir / rel).resolve()
            target = (base / (clean[len(prefix):] or "index.html")).resolve()
            return target if target == base or base in target.parents else None
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    github_dir = None
    # 部分作品的 HTML 沒寫 charset，由伺服器明講 UTF-8，中文才不會變亂碼
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }

    def translate_path(self, path):
        if urllib.parse.unquote(path).startswith("/ext/"):
            target = resolve_external(path, self.github_dir)
            # 回傳不存在的路徑，交給父類別回 404
            return str(target) if target else str(ROOT / "__not_found__")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="作品集本機伺服器")
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--github-dir")
    args = parser.parse_args()
    Handler.github_dir = find_github_dir(args.github_dir)
    if Handler.github_dir is None:
        print("找不到音樂花園或作息模擬，這兩項會顯示無法開啟；可用 --github-dir 指定資料夾。")
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"作品集：http://127.0.0.1:{args.port}/showcase.html（Ctrl+C 結束）")
        server.serve_forever()


if __name__ == "__main__":
    main()
