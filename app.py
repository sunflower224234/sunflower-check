"""签到系统 —— Web 服务入口。

零第三方依赖：基于 Python 标准库 ``http.server`` 实现。

运行::

    python app.py

然后浏览器打开 http://127.0.0.1:8000

可选环境变量：
    CHECKIN_HOST  监听地址，默认 127.0.0.1
    CHECKIN_PORT  监听端口，默认 8000
    CHECKIN_DB    数据库文件路径，默认项目目录下的 checkin.db
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 归一化后的项目根目录，供路径归属判断使用（Windows 下大小写不敏感）
BASE_DIR_REAL = os.path.normcase(os.path.realpath(BASE_DIR))
HOST = os.environ.get("CHECKIN_HOST", "127.0.0.1")
PORT = int(os.environ.get("CHECKIN_PORT", "8000"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


class CheckinHandler(BaseHTTPRequestHandler):
    """处理所有 HTTP 请求：页面、静态资源和 JSON 接口。"""

    server_version = "CheckinSystem/1.0"

    # ------------------------------------------------------------------ 工具
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _send_file(self, relative_path: str) -> None:
        """发送项目目录内的文件；拒绝目录穿越。"""
        target = os.path.normcase(os.path.realpath(os.path.join(BASE_DIR, relative_path)))

        # 用 commonpath 判断归属。不能用 str.startswith：
        # 那会把「checkin-system-backup」这类同前缀的兄弟目录误判为项目内文件。
        try:
            inside = os.path.commonpath([BASE_DIR_REAL, target]) == BASE_DIR_REAL
        except ValueError:  # 不同盘符，commonpath 会抛异常
            inside = False

        if not inside or not os.path.isfile(target):
            self._send_json(404, {"ok": False, "reason": "资源不存在"})
            return

        extension = os.path.splitext(target)[1].lower()
        with open(target, "rb") as handle:
            body = handle.read()
        self._send(200, body, CONTENT_TYPES.get(extension, "application/octet-stream"))

    def _read_json(self) -> dict:
        """读取并解析请求体中的 JSON，非法输入统一返回空字典。"""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if length <= 0:
            return {}

        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    # ------------------------------------------------------------------ 路由
    def do_GET(self) -> None:  # noqa: N802  (标准库要求的命名)
        path = urlparse(self.path).path

        if path in ("/", "/index.html"):
            self._send_file(os.path.join("templates", "index.html"))
        elif path.startswith("/static/"):
            self._send_file(path.lstrip("/"))
        elif path == "/api/records":
            self._send_json(200, {"ok": True, "records": db.list_records()})
        elif path == "/api/stats":
            self._send_json(200, {"ok": True, **db.stats()})
        else:
            self._send_json(404, {"ok": False, "reason": "接口不存在"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path == "/api/checkin":
            data = self._read_json()
            result = db.check_in(data.get("student_id", ""), data.get("name", ""))
            # 被拒绝时用 409 Conflict，前端据此区分「成功」与「今日已签到」
            self._send_json(200 if result["ok"] else 409, result)
        else:
            self._send_json(404, {"ok": False, "reason": "接口不存在"})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    db.init_db()
    server = ThreadingHTTPServer((HOST, PORT), CheckinHandler)
    print(f"签到系统已启动 -> http://{HOST}:{PORT}")
    print("按 Ctrl+C 停止服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
