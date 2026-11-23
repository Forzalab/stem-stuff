"""KV-FRUGAL slice 1: the harness. Today's routes run through serve.dispatch() against a FAKE in-memory Upstash (no network), their
replies are pinned (status + key fields), and every request's KV traffic is metered: round trips, commands, bytes up / down.
The counts are PRINTED, not asserted: slice 2 adds the budget (today a bank open reads the whole tries blob N+2 times).

The seam is urllib.request.urlopen, the HTTP layer under serve._kv (and acct._kv): the server code is untouched, and a later
_kv that pipelines its commands is still metered (POST <url>/pipeline = one round trip, many commands). The same fake answers
the one tutor turn's LLM calls with canned replies; any other URL is a stray call and fails the test.

Run: python3 -m unittest tests.test_kv_frugal -v      (joins CI through `unittest discover -p 'test_*.py'`)"""
import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.parse
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402

KV_URL = "https://kv.test"
SIZES = (1, 64)                               # bank sizes opened: the smallest and a full exam-sized bank
OTHERS, OTHER_TRIES = 200, 12                 # the seeded blob: this many other browsers x this many tried problems each
NOTE = {"on_topic": True, "field": "arithmetic", "concept": "addition", "asked": "a sum", "need": "add the two numbers", "assumed": "subtracted",
        "real": "the numbers are added", "reproduces": True, "gap": serve.GAPS[0], "evidence": "typed 5", "confidence": "low"}
REPLY = "You are close.\nAdd the two numbers one step at a time, then check your sum.\n"


def fake_sid(i):
    """a made-up browser id (32 hex), derived at run time: no id is ever written in this file"""
    return hashlib.sha256(f"kv-frugal-{i}".encode()).hexdigest()[:32]


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeKV:
    """Upstash Redis REST in memory, behind urlopen: POST <url> [cmd, ...] = one command, POST <url>/pipeline (or /multi-exec)
    [[cmd, ...], ...] = many commands in one round trip. Meters every call; window() gives one request's share."""
    def __init__(self):
        self.db, self.lock = {}, threading.Lock()
        self.calls = []                       # one row per round trip: {cmds: [names], up: request bytes, down: reply bytes}
        self.llm, self.stray = [], []         # the tutor turn's stubbed model calls; URLs nobody should have called

    # ---- redis ----
    def run(self, cmd):
        op, a = str(cmd[0]).upper(), [x if isinstance(x, str) else json.dumps(x) for x in cmd[1:]]
        db = self.db
        if op == "GET":
            return db.get(a[0])
        if op == "SET":
            db[a[0]] = a[1]                   # EX / PX: no clock here, a key lives for the test
            return "OK"
        if op == "MGET":
            return [db.get(k) for k in a]
        if op == "DEL":
            return sum(db.pop(k, None) is not None for k in a)
        if op == "EXISTS":
            return sum(k in db for k in a)
        if op in ("EXPIRE", "PEXPIRE"):
            return int(a[0] in db)
        if op == "INCR":
            db[a[0]] = str(int(db.get(a[0], 0)) + 1)
            return int(db[a[0]])
        if op == "INCRBYFLOAT":
            db[a[0]] = repr(float(db.get(a[0], 0)) + float(a[1]))
            return db[a[0]]
        if op == "LPUSH":
            db[a[0]] = a[:0:-1] + db.get(a[0], [])
            return len(db[a[0]])
        if op == "LTRIM":
            lo, hi = int(a[1]), int(a[2])
            db[a[0]] = db.get(a[0], [])[lo:(hi + 1) or None]
            return "OK"
        if op == "HSET":
            h = db.setdefault(a[0], {})
            new = sum(f not in h for f in a[1::2])
            h.update(zip(a[1::2], a[2::2]))
            return new
        if op == "HGET":
            return db.get(a[0], {}).get(a[1])
        if op == "HMGET":
            return [db.get(a[0], {}).get(f) for f in a[1:]]
        if op == "HGETALL":
            return [x for kv in db.get(a[0], {}).items() for x in kv]
        if op == "HDEL":
            return sum(db.get(a[0], {}).pop(f, None) is not None for f in a[1:])
        raise ValueError(f"FakeKV: no such command {op}")

    # ---- http ----
    def urlopen(self, req, timeout=None):
        url, data = req.full_url, req.data or b""
        if url.startswith(KV_URL):
            body, tail = json.loads(data), urllib.parse.urlparse(url).path.rstrip("/")
            with self.lock:
                if tail in ("/pipeline", "/multi-exec"):
                    cmds, out = body, json.dumps([{"result": self.run(c)} for c in body]).encode()
                else:
                    cmds, out = [body], json.dumps({"result": self.run(body)}).encode()
                self.calls.append({"cmds": [str(c[0]).upper() for c in cmds], "up": len(data), "down": len(out)})
            return Resp(out)
        if "anthropic.com" in url or "openrouter.ai" in url:
            return Resp(self.model(url, json.loads(data)))
        self.stray.append(url)
        raise OSError("no network in this test: " + url)

    def model(self, url, req):
        """the LLM, canned: a NOTE for a structured call, REPLY for anything else (streamed when asked)"""
        stream, claude = bool(req.get("stream")), "anthropic.com" in url
        note = "response_format" in req or "format" in (req.get("output_config") or {})   # every Claude call carries output_config.effort
        self.llm.append(("claude" if claude else "openrouter", "note" if note else "stream" if stream else "text"))
        text = json.dumps(NOTE) if note else REPLY
        if not stream:
            return json.dumps({"content": [{"type": "text", "text": text}], "usage": {"input_tokens": 100, "output_tokens": 40}, "stop_reason": "end_turn"}
                              if claude else {"choices": [{"message": {"content": text}}]}).encode()
        if claude:
            evs = [{"type": "message_start", "message": {"usage": {"input_tokens": 100}}}]
            evs += [{"type": "content_block_delta", "delta": {"type": "text_delta", "text": t}} for t in text.splitlines(True)]
            evs += [{"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 40}}, {"type": "message_stop"}]
            return "".join(f"data: {json.dumps(e)}\n\n" for e in evs).encode()
        return ("".join(f"data: {json.dumps({'choices': [{'delta': {'content': t}}]})}\n\n" for t in text.splitlines(True)) + "data: [DONE]\n\n").encode()

    # ---- the meter ----
    @contextlib.contextmanager
    def window(self):
        """the KV traffic of the block: {trips, cmds, up, down, by: {command: count}} (filled when the block ends)"""
        w, at = {}, len(self.calls)
        try:
            yield w
        finally:
            rows = self.calls[at:]
            by = {}
            for r in rows:
                for c in r["cmds"]:
                    by[c] = by.get(c, 0) + 1
            w.update(trips=len(rows), cmds=sum(len(r["cmds"]) for r in rows), up=sum(r["up"] for r in rows), down=sum(r["down"] for r in rows), by=by)


def seed(kv, codes):
    """the tries blob as serve keeps it (KV_KEY: one JSON), holding OTHERS other browsers' tries: a bank open must not get
    slower or heavier because other students exist. Returns its size in bytes."""
    tries, gen = {}, 0
    for i in range(OTHERS):
        for j in range(OTHER_TRIES):
            gen += 1
            tries[f"{fake_sid(i)} {codes[(i + j) % len(codes)]}"] = {"wrong": [["num", str(j)]] * (j % 3), "done": j % 2 == 0, "gen": gen}
    last = {fake_sid(i): {"bank": "BANK_KV64", "at": {"BANK_KV64": codes[i % len(codes)]}} for i in range(OTHERS)}
    kv.db[serve.KV_KEY] = json.dumps({"gen": gen, "tries": tries, "last": last})
    return len(kv.db[serve.KV_KEY])


def problem(i):
    """KVF_Q01..: a num item, answer i + 1; the first carries a key, so Cluck may talk about it (/explain)"""
    p = {"code": f"KVF_Q{i:02d}", "type": "num", "title": f"Sum {i}", "answer": str(i + 1), "body": [{"type": "text", "md": f"What is {i} + 1?"}]}
    return dict(p, saccharine={"key": "Use: add the two numbers\nAnswer: 2"}) if i == 1 else p


class KvFrugal(unittest.TestCase):
    """bank open -> /p -> /state -> /check (wrong, right) -> /state -> one tutor turn -> bank reopen, for a 1-problem and a 64-problem bank"""
    COUNTS = {}                               # bank size -> [(route label, window)]: what slice 2 will assert on

    def setUp(self):
        self.kv = FakeKV()
        banks = tempfile.mkdtemp(prefix="stem-kvf-")
        for n in SIZES:
            with open(os.path.join(banks, f"BANK_KV{n}.json"), "w") as f:
                json.dump({"v": serve.CUTOFF, "problems": [problem(i) for i in range(1, n + 1)]}, f)
        self.blob = seed(self.kv, [problem(i)["code"] for i in range(1, max(SIZES) + 1)])
        env = {"CLAUDE_API": "sk-ant-test", "OPENROUTER_API_KEY": "sk-or-test", "CLUCK_SUBJECT": "0", "CLUCK_ARM": "claude", "STEM_FRONT": ""}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "BANKS", banks), mock.patch.object(serve, "KV", (KV_URL, "t")),
                   mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()
        serve._asked.clear()
        serve._chats.clear()

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._gen["loaded"] = None           # the next test reloads its own tries file, not this fake's blob
        serve._asked.clear()
        serve._chats.clear()

    def call(self, label, method, path, body=None, cookie=""):
        """one request through dispatch(), metered: (status, json)"""
        with self.kv.window() as w:
            res = serve.dispatch(method, path, cookie, json.dumps(body).encode() if body is not None else b"")
        self.assertIsNotNone(res, path)
        self.rows.append((label, w))
        self.assertNotIn("Set-Cookie", res[1], "the test's cookie id was not taken")
        return res[0], json.loads(res[2])

    def flow(self, n):
        self.rows = KvFrugal.COUNTS[n] = []
        cookie, bank, first = "sid=" + fake_sid(f"me-{n}"), f"BANK_KV{n}", "KVF_Q01"
        codes = [f"KVF_Q{i:02d}" for i in range(1, n + 1)]

        st, b = self.call(f"GET /b ({n} problems, fresh)", "GET", f"/b/{bank}.json", cookie=cookie)
        self.assertEqual((st, b["code"], [p["code"] for p in b["problems"]], b["marks"], b["at"]), (200, bank, codes, {}, None))
        self.assertNotIn("answer", b["problems"][0])
        self.assertNotIn("saccharine", b["problems"][0])

        st, p = self.call("GET /p", "GET", f"/p/{first}.json", cookie=cookie)
        self.assertEqual((st, p["code"], p["type"]), (200, first, "num"))
        self.assertNotIn("answer", p)

        st, s = self.call("GET /state (untried)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 0, False))

        st, v = self.call("POST /check (wrong)", "POST", "/check", {"code": first, "answer": "5"}, cookie)
        self.assertEqual((st, v["verdict"]), (200, "wrong"))
        st, s = self.call("GET /state (1 wrong)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 1, False))

        with self.kv.window() as w:           # the tutor turn: a stream, as Handler / api/index.py run it (serve.STREAMS), read to its end
            st, head, chunks = serve.STREAMS["/explain"](cookie, json.dumps({"code": first, "answer": "5"}).encode())
            text = b"".join(chunks).decode()
        self.rows.append(("POST /explain (1 turn)", w))
        self.assertEqual(st, 200)
        self.assertTrue(text.strip())
        self.assertNotIn("Cluck stopped early", text)
        self.assertIn(("claude", "stream"), self.kv.llm)

        st, v = self.call("POST /check (right)", "POST", "/check", {"code": first, "answer": "2"}, cookie)
        self.assertEqual((st, v["verdict"]), (200, "correct"))
        st, s = self.call("GET /state (done)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 1, True))

        st, b = self.call(f"GET /b ({n} problems, again)", "GET", f"/b/{bank}.json", cookie=cookie)
        self.assertEqual((st, b["marks"], b["at"]), (200, {first: {"x": 1, "done": "correct"}}, first))
        st, b = self.call("GET /b/last", "GET", "/b/last.json", cookie=cookie)
        self.assertEqual((st, b["code"], len(b["problems"])), (200, bank, n))

        self.assertEqual(self.kv.stray, [], "a request left for the network")
        mine = [k for k in json.loads(self.kv.db[serve.KV_KEY])["tries"] if k.startswith(cookie[4:])]
        self.assertEqual(len(mine), 1, "the try was saved to the fake KV")
        self.report(n)

    def report(self, n):
        out = [f"\nKV-FRUGAL counts: BANK_KV{n} ({n} problems); seeded tries blob {self.blob} bytes ({OTHERS} other browsers). No budget asserted yet.",
               f"  {'request':<34}{'trips':>6}{'cmds':>6}{'up B':>10}{'down B':>11}  commands"]
        for label, w in self.rows:
            by = " ".join(f"{k}x{v}" for k, v in sorted(w["by"].items()))
            out.append(f"  {label:<34}{w['trips']:>6}{w['cmds']:>6}{w['up']:>10}{w['down']:>11}  {by}")
        print("\n".join(out), flush=True)

    def test_bank_of_1(self):
        self.flow(1)

    def test_bank_of_64(self):
        self.flow(64)

    def test_pipeline_is_one_round_trip(self):
        """the meter itself: a pipelined POST counts 1 round trip and its commands (what slice 2 will move to)"""
        req = lambda path, body: serve.urllib.request.Request(KV_URL + path, data=json.dumps(body).encode(), method="POST")   # noqa: E731
        with self.kv.window() as w:
            with serve.urllib.request.urlopen(req("/pipeline", [["SET", "a", "1"], ["GET", "a"], ["HSET", "h", "f", "v"], ["HGET", "h", "f"]])) as r:
                self.assertEqual([x["result"] for x in json.load(r)], ["OK", "1", 1, "v"])
            self.assertEqual(serve._kv("GET", "a"), "1")
        self.assertEqual((w["trips"], w["cmds"], w["by"]), (2, 5, {"SET": 1, "GET": 2, "HSET": 1, "HGET": 1}))
        self.assertGreater(w["up"], 0)
        self.assertGreater(w["down"], 0)


if __name__ == "__main__":
    unittest.main()
