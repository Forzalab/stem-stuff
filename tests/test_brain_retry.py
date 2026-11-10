"""The bank hatch (tools/build_and_ship/brain_banks.py) survives GitLab 429/5xx: retries with Retry-After or backoff, then fails with the same message.
Runs the script against a local fake GitLab; SHIP_BACKOFF_SCALE=0 skips all waits (Retry-After included)."""
import http.server
import json
import os
import subprocess
import sys
import tempfile
import time
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = "projects/calc/_files/x-bank/BANK_ZZ1.json"


def serve(fail_first, slow_first=0):
    """fail_first = number of 429s before answering 200 (None = always 429)."""
    state = {"tree": 0}

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if "/repository/tree" in self.path:
                state["tree"] += 1
                if state["tree"] <= slow_first:
                    time.sleep(2)   # longer than SHIP_HTTP_TIMEOUT=1: the client read times out
                if fail_first is None or state["tree"] <= fail_first:
                    self.send_response(429)
                    self.send_header("Retry-After", "1")
                    self.end_headers()
                    return
                body = json.dumps([{"type": "blob", "path": PATH}]).encode()
            else:
                body = json.dumps({"problems": []}).encode()
            self.send_response(200)
            self.send_header("X-Next-Page", "")
            self.end_headers()
            self.wfile.write(body)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, state


class Retry(unittest.TestCase):
    def run_hatch(self, fail_first, slow_first=0):
        srv, state = serve(fail_first, slow_first)
        self.addCleanup(srv.shutdown)
        with tempfile.TemporaryDirectory() as out:
            env = dict(os.environ, BRAIN_TOKEN="t", BRAIN_API=f"http://127.0.0.1:{srv.server_port}", SHIP_BACKOFF_SCALE="0", SHIP_PINS="", SHIP_HTTP_TIMEOUT="1")
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_and_ship", "brain_banks.py"), out], env=env, capture_output=True, text=True, timeout=60)
            return r, state, os.path.exists(os.path.join(out, "BANK_ZZ1.json"))

    def test_429_once_then_ok(self):
        r, state, wrote = self.run_hatch(1)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(wrote)
        self.assertEqual(state["tree"], 2)

    def test_timeout_once_then_ok(self):   # ship runs 103/104: "GitLab unreachable: The read operation timed out"
        r, state, wrote = self.run_hatch(0, slow_first=1)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(wrote)
        self.assertEqual(state["tree"], 2)

    def test_429_forever_fails_after_4_tries(self):
        r, state, wrote = self.run_hatch(None)
        self.assertEqual(r.returncode, 1)
        self.assertIn("brain: GitLab answered 429 for repository/tree", r.stderr)
        self.assertEqual(state["tree"], 4)   # 1 try + 3 retries
        self.assertFalse(wrote)


if __name__ == "__main__":
    unittest.main()
