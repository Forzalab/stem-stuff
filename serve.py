import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5567
ROOT = os.path.dirname(os.path.abspath(__file__))
# Server-only or private paths: never served.
BLOCK_PREFIX = ("/k/", "/log/", "/.git", "/tests/node_modules/")
BLOCK = {"/serve.py", "/deploy.sh", "/host.log", "/.host.pid"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in BLOCK or path.startswith(BLOCK_PREFIX):
            self.send_error(404)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as s:
    print(f"http://0.0.0.0:{PORT}")
    s.serve_forever()
