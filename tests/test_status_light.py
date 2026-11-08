"""Status light: boot serve.py once and send one canned request per route + GET /. Each row is a "pixel": the documented status,
top-level JSON keys, and (for streams/static) the content type. Any serve.py change runs this in tests/run-all.sh --quick.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class StatusLight(unittest.TestCase):
    # The shipped bank has no wish-keyed item and no repair ladder; the fixtures supply both so the no-key and 200 branches are reachable.
    # No OPENROUTER_API_KEY / CLAUDE_API: /explain and /chat must answer 503 before any live call, /mini must take its authored fallback.
    PIXELS = [
        # method, path, json body, status, kind, json keys
        ("GET", "/", None, 200, "html", None),
        ("GET", "/calc", None, 200, "json", {"model", "welcomed"}),
        ("POST", "/calc", {"model": "other"}, 200, "json", {"model"}),
        ("POST", "/log/incident", {"code": "E-7K3QX"}, 204, "empty", None),
        ("POST", "/mini", {"code": "PHYS_ZDA", "step": "answer"}, 200, "json", {"program"}),
        ("POST", "/check", {"code": "CALC1_T6B", "answer": "5"}, 200, "json", {"verdict", "triesLeft", "gen"}),
        ("POST", "/narrate", {"code": "PHYS_ZDA"}, 200, "json", {"text"}),
        ("POST", "/diagnose", {"code": "PHYS_RPA", "expr": "99"}, 404, "json", {"error"}),
        ("POST", "/diagnose/explain", {"code": "CSCI26_M5V", "pairs": {"5": "five"}}, 200, "json", {"ok"}),
        ("POST", "/repair/PHYS_WLC/check", {"value": "a"}, 200, "json", {"ok"}),
        ("POST", "/explain", {"code": "PHYS_ZDA", "answer": "a"}, 503, "empty", None),
        ("POST", "/chat", {"code": "PHYS_ZDA", "answer": "a",
                           "history": [{"role": "assistant", "content": "hi"}, {"role": "user", "content": "why?"}]}, 503, "empty", None),
        ("GET", "/health", None, 200, "json", {"claude", "or", "ts"}),
        ("GET", "/state/PHYS_ZDA", None, 200, "json", {"wrong", "done", "gen"}),
        ("GET", "/p/PHYS_ZDA.json", None, 200, "json", {"code", "title", "type", "body"}),
        ("GET", "/b/last.json", None, 200, "null", None),
        ("GET", "/repair/PHYS_WLC", None, 200, "json", {"code", "steps"}),
    ]

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="status-light-")
        problems = {}
        with open(os.path.join(ROOT, "problems.json")) as f:
            for p in json.load(f)["problems"]:
                problems[p["code"]] = p
        for name in ("dead-easy.json", "repair-p2x.json"):
            with open(os.path.join(ROOT, "tests", "fixtures", name)) as f:
                for p in json.load(f)["problems"]:
                    problems.setdefault(p["code"], p)
        cls.bank = os.path.join(cls.tmp, "problems.json")
        with open(cls.bank, "w") as f:
            json.dump({"v": 20261022, "problems": list(problems.values())}, f)
        banks = os.path.join(cls.tmp, "banks")
        os.makedirs(banks)

        env = {k: v for k, v in os.environ.items() if k not in (
            "OPENROUTER_API_KEY", "CLAUDE_API", "KV_REST_API_URL", "KV_REST_API_TOKEN",
            "STEM_REDIRECT", "EXPR_MODE", "EXPR_BANKS", "STEM_PROOF_LADDER", "STEM_FRONT")}
        env.update(STEM_TRIES=os.path.join(cls.tmp, "tries.json"), STEM_BANKS=banks,
                   STEM_TODAY="2026-10-23", CLUCK_SUBJECT="0")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        cls.base = f"http://127.0.0.1:{port}"
        cls.proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(port), cls.bank],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base + "/", timeout=1)
                return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError("serve.py did not boot")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"} if data else {}
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_pixels(self):
        for method, path, body, want_status, kind, want_keys in self.PIXELS:
            with self.subTest(route=f"{method} {path}"):
                status, headers, raw = self.request(method, path, body)
                self.assertEqual(status, want_status, raw[:200])
                if kind == "html":
                    self.assertIn("text/html", headers.get("Content-Type", ""))
                    self.assertIn(b"<html", raw.lower())
                elif kind == "null":
                    self.assertIsNone(json.loads(raw))
                elif kind == "json":
                    doc = json.loads(raw)
                    self.assertIsInstance(doc, dict)
                    self.assertEqual(set(want_keys) - set(doc), set(), f"missing {set(want_keys) - set(doc)}")
                    if path == "/mini":
                        self.assertTrue(doc["program"].strip())
                    if path == "/health":
                        self.assertIsNone(doc["or"])   # no key: no OpenRouter call
                else:
                    self.assertEqual(raw, b"")


if __name__ == "__main__":
    unittest.main()
