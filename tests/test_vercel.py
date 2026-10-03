"""Vercel path: tools/build_public.py keeps answers out of public/, api/index.py (WSGI) serves the API through
serve.dispatch, and tries go to KV (faked here) when KV_REST_API_URL/TOKEN are set.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import io
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.argv = [sys.argv[0]]
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import serve  # noqa: E402
import build_public  # noqa: E402
sys.path.insert(0, os.path.join(ROOT, "api"))
import index  # noqa: E402  api/index.py


def call(method, path, body=b"", cookie=""):
    out = {}
    env = {"REQUEST_METHOD": method, "PATH_INFO": "/api/index", "QUERY_STRING": "path=" + path, "HTTP_COOKIE": cookie,
           "CONTENT_LENGTH": str(len(body)), "wsgi.input": io.BytesIO(body)}
    data = b"".join(index.app(env, lambda s, h: out.update(status=int(s.split()[0]), headers=dict(h))))
    return out["status"], out["headers"], json.loads(data)


class BuildPublic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build_public.build(os.path.join(tempfile.mkdtemp(prefix="stem-public-"), "public"))

    def test_no_server_side_files(self):
        for f in serve.BLOCK:
            self.assertFalse(os.path.exists(os.path.join(self.out, f.lstrip("/"))), f)
        for d in serve.BLOCK_PREFIX:
            self.assertFalse(os.path.exists(os.path.join(self.out, d.strip("/"))), d)
        self.assertFalse(os.path.exists(os.path.join(self.out, "api")))

    def test_client_is_there(self):
        for f in ("index.html", "app.js", "app.css", "sw.js", "offline.js", "vendor/katex/katex.min.js"):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)


class Wsgi(unittest.TestCase):
    def test_problem_has_no_answer_and_sets_cookie(self):
        status, head, p = call("GET", "/p/PHYS_F3N.json")
        self.assertEqual(status, 200)
        self.assertNotIn("answer", p)
        self.assertIn("sid=", head["Set-Cookie"])
        self.assertEqual(head["Cache-Control"], "no-store")

    def test_check_wrong_then_right(self):
        cookie = "sid=" + "a" * 32
        body = lambda a: json.dumps({"code": "PHYS_F3N", "answer": a}).encode()
        s1, h1, r1 = call("POST", "/check", body("1"), cookie)
        s2, _, r2 = call("POST", "/check", body("3.2"), cookie)
        self.assertEqual((s1, s2), (200, 200))
        self.assertNotIn("Set-Cookie", h1)
        self.assertNotEqual(r1["verdict"], "correct")
        self.assertEqual(r2["verdict"], "correct")

    def test_bad_paths(self):
        self.assertEqual(call("GET", "/p/NOPE_XX.json")[0], 404)
        self.assertEqual(call("GET", "/problems.json")[0], 404)
        self.assertEqual(call("POST", "/check", b"not json")[0], 400)
        self.assertEqual(call("GET", "/b/last.json", cookie="sid=" + "b" * 32)[2], None)


class Kv(unittest.TestCase):
    def setUp(self):
        self.db, self.old = {}, (serve.KV, serve._kv, serve._gen["loaded"])

        def fake(*cmd):
            if cmd[0] == "GET":
                return self.db.get(cmd[1])
            self.db[cmd[1]] = cmd[2]
            return "OK"
        serve.KV, serve._kv = ("https://kv.test", "t"), fake

    def tearDown(self):
        serve.KV, serve._kv, serve._gen["loaded"] = self.old
        serve._gen["loaded"] = None

    def test_tries_live_in_kv_and_survive_a_cold_start(self):
        cookie = "sid=" + "c" * 32
        call("POST", "/check", json.dumps({"code": "PHYS_F3N", "answer": "1"}).encode(), cookie)
        self.assertIn(serve.KV_KEY, self.db)
        serve._tries.clear()                      # a new instance: nothing in memory
        status, _, st = call("GET", "/state/PHYS_F3N", cookie=cookie)
        self.assertEqual((status, st["wrong"]), (200, 1))


if __name__ == "__main__":
    unittest.main()
