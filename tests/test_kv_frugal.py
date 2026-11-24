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
        self.expires = {}                     # key -> TTL seconds (the last EXPIRE / PEXPIRE seen)
        self.calls = []                       # one row per round trip: {cmds: [names], keys: [first arg], up: request bytes, down: reply bytes}
        self.llm, self.stray = [], []         # the tutor turn's stubbed model calls; URLs nobody should have called

    # ---- redis ----
    def run(self, cmd):
        op, a = str(cmd[0]).upper(), [x if isinstance(x, str) else json.dumps(x) for x in cmd[1:]]
        db = self.db
        if op == "GET":
            return db.get(a[0])
        if op == "SET":
            db[a[0]] = a[1]                   # EX / PX: record the TTL; a key lives for the test (no clock here)
            flags = [str(x).upper() for x in cmd[3:]]
            if "EX" in flags:
                self.expires[a[0]] = int(cmd[3 + flags.index("EX") + 1])
            elif "PX" in flags:
                self.expires[a[0]] = int(cmd[3 + flags.index("PX") + 1]) // 1000
            return "OK"
        if op == "MGET":
            return [db.get(k) for k in a]
        if op == "DEL":
            return sum(db.pop(k, None) is not None for k in a)
        if op == "EXISTS":
            return sum(k in db for k in a)
        if op in ("EXPIRE", "PEXPIRE"):
            self.expires[a[0]] = int(a[1])
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
                self.calls.append({"cmds": [str(c[0]).upper() for c in cmds], "keys": [str(c[1]) for c in cmds if len(c) > 1],
                                   "up": len(data), "down": len(out)})
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
        """the KV traffic of the block: {trips, cmds, up, down, by: {command: count}, keys, written, expired}
        written = keys an HSET/HDEL touched; expired = keys an EXPIRE/PEXPIRE touched (same window)"""
        w, at = {}, len(self.calls)
        try:
            yield w
        finally:
            rows = self.calls[at:]
            by, written, expired = {}, set(), set()
            for r in rows:
                for c, key in zip(r["cmds"], r["keys"]):
                    by[c] = by.get(c, 0) + 1
                    if c in ("HSET", "HDEL"):
                        written.add(key)
                    elif c in ("EXPIRE", "PEXPIRE"):
                        expired.add(key)
            w.update(trips=len(rows), cmds=sum(len(r["cmds"]) for r in rows), up=sum(r["up"] for r in rows), down=sum(r["down"] for r in rows),
                     by=by, keys=[k for r in rows for k in r["keys"]], written=written, expired=expired, rows=rows)


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
    """bank open -> /p -> /state -> /check (wrong, right) -> /state -> one tutor turn -> bank reopen, for a 1-problem and a 64-problem bank.
    The flag-off class pins today's blob traffic; KvFrugalHash runs the SAME flow with STEM_TRIES_HASH=1 and pins the hash traffic."""
    HASH = False
    COUNTS = {}                               # bank size -> [(route label, window)]: what slice 2 will assert on

    def setUp(self):
        self.kv = FakeKV()
        banks = tempfile.mkdtemp(prefix="stem-kvf-")
        for n in SIZES:
            with open(os.path.join(banks, f"BANK_KV{n}.json"), "w") as f:
                json.dump({"v": serve.CUTOFF, "problems": [problem(i) for i in range(1, n + 1)]}, f)
        self.blob = seed(self.kv, [problem(i)["code"] for i in range(1, max(SIZES) + 1)])
        env = {"CLAUDE_API": "sk-ant-test", "OPENROUTER_API_KEY": "sk-or-test", "CLUCK_SUBJECT": "0", "CLUCK_ARM": "claude", "STEM_FRONT": "",
               "VERCEL_ENV": "", "STEM_TRIES_HASH": "1" if self.HASH else ""}
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
        self.request_ok(w)
        self.assertNotIn("Set-Cookie", res[1], "the test's cookie id was not taken")
        return res[0], json.loads(res[2])

    def request_ok(self, w):
        """the flag's per-request budget: flag OFF = the old blob, untouched; flag ON = no whole-blob GET, at most one
        store load (HGETALL), and every key an HSET/HDEL writes carries an EXPIRE in the same request."""
        if self.HASH:
            self.assertNotIn(serve.KV_KEY, w["keys"], "the whole tries blob was read with the flag on")
            self.assertLessEqual(w["by"].get("HGETALL", 0), 1, "more than one store load in one request")
            self.assertLessEqual(w["written"], w["expired"], f"a written key has no expiry: {w['written'] - w['expired']}")
            for r in w["rows"]:
                if "HSET" in r["cmds"]:
                    self.assertIn("EXPIRE", r["cmds"], "HSET and EXPIRE left in separate round trips")
        else:
            self.assertEqual(w["by"].get("HGETALL", 0), 0, "flag off must not use the hash store")
            self.assertEqual(w["by"].get("HSET", 0), 0, "flag off must not use the hash store")

    def one_read(self, w, why):
        self.assertEqual(w["by"].get("HGETALL" if self.HASH else "GET", 0), 1, why)

    def flow(self, n):
        self.rows = KvFrugal.COUNTS[n] = []
        cookie, bank, first = "sid=" + fake_sid(f"me-{n}"), f"BANK_KV{n}", "KVF_Q01"
        codes = [f"KVF_Q{i:02d}" for i in range(1, n + 1)]

        st, b = self.call(f"GET /b ({n} problems, fresh)", "GET", f"/b/{bank}.json", cookie=cookie)
        self.one_read(self.rows[-1][1], "a bank open reads the student's tries once")
        self.assertEqual((st, b["code"], [p["code"] for p in b["problems"]], b["marks"], b["at"]), (200, bank, codes, {}, None))
        self.assertNotIn("answer", b["problems"][0])
        self.assertNotIn("saccharine", b["problems"][0])

        st, p = self.call("GET /p", "GET", f"/p/{first}.json", cookie=cookie)
        self.assertEqual((st, p["code"], p["type"]), (200, first, "num"))
        self.assertNotIn("answer", p)
        if self.HASH:
            h = self.kv.db[serve.tries_key(cookie[4:])]
            self.assertEqual((h.get("_bank"), h.get("at:" + bank)), (bank, first), "the place is _bank + at:<bank>")
            self.assertEqual((self.rows[-1][1]["by"].get("HSET"), self.rows[-1][1]["by"].get("EXPIRE")), (1, 1), "one HSET + one EXPIRE")

        st, s = self.call("GET /state (untried)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 0, False))

        st, v = self.call("POST /check (wrong)", "POST", "/check", {"code": first, "answer": "5"}, cookie)
        self.assertEqual((st, v["verdict"]), (200, "wrong"))
        if self.HASH:
            h = self.kv.db[serve.tries_key(cookie[4:])]
            self.assertIn(first, h, "one field per problem")
            self.assertIn("_gen", h)
            self.assertNotIn(serve.turns_key(cookie[4:], first), self.kv.db, "a check wrote a turn key")
        st, s = self.call("GET /state (1 wrong)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 1, False))

        with self.kv.window() as w:           # the tutor turn: a stream, as Handler / api/index.py run it (serve.STREAMS), read to its end
            st, head, chunks = serve.STREAMS["/explain"](cookie, json.dumps({"code": first, "answer": "5"}).encode())
            text = b"".join(chunks).decode()
        self.rows.append(("POST /explain (1 turn)", w))
        self.request_ok(w)
        self.assertEqual(st, 200)
        self.assertTrue(text.strip())
        self.assertNotIn("Cluck stopped early", text)
        self.assertIn(("claude", "stream"), self.kv.llm)
        if self.HASH:
            tk = serve.turns_key(cookie[4:], first)
            self.assertIn(tk, self.kv.db, "a Cluck turn got its own key")
            rows = json.loads(self.kv.db[tk])
            self.assertEqual((rows[0][0], rows[0][3], rows[0][2].endswith("</XYZ>")), (1, "5", True), "begin + note in one key")
            self.assertEqual(self.kv.expires.get(tk), serve.TURNS_TTL_S, "the prod turn key carries the 14-day life")
            cmds = [r["cmds"] for r in w["rows"] if tk in r["keys"]]
            self.assertEqual(cmds.count(["SET"]), 2, "a tutor turn = 2 small writes")
            self.assertEqual(cmds, [["GET"], ["SET"], ["GET"], ["SET"], ["GET"]], "the turn key is read only where turns are needed")
            h = self.kv.db.get(serve.tries_key(cookie[4:]), {})
            self.assertFalse([f for f in h if f.startswith("c:")], "the tries hash got a c: field")

        st, v = self.call("POST /check (right)", "POST", "/check", {"code": first, "answer": "2"}, cookie)
        self.assertEqual((st, v["verdict"]), (200, "correct"))
        st, s = self.call("GET /state (done)", "GET", f"/state/{first}", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 1, True))

        st, b = self.call(f"GET /b ({n} problems, again)", "GET", f"/b/{bank}.json", cookie=cookie)
        self.one_read(self.rows[-1][1], "a bank reopen reads the student's tries once")
        self.assertEqual((st, b["marks"], b["at"]), (200, {first: {"x": 1, "done": "correct"}}, first))
        st, b = self.call("GET /b/last", "GET", "/b/last.json", cookie=cookie)
        self.assertEqual((st, b["code"], len(b["problems"])), (200, bank, n))

        self.assertEqual(self.kv.stray, [], "a request left for the network")
        if self.HASH:
            h = self.kv.db.get(serve.tries_key(cookie[4:]), {})
            tries = {f for f in h if not f.startswith(("_", "at:", "c:"))}
            self.assertEqual(tries, {first}, "the try was saved to the student's hash")
            self.assertIn("_gen", h)
            self.assertEqual(self.kv.expires.get(serve.tries_key(cookie[4:])), serve.TRIES_LIFETIME, "the hash carries the 120-day life")
        else:
            mine = [k for k in json.loads(self.kv.db[serve.KV_KEY])["tries"] if k.startswith(cookie[4:])]
            self.assertEqual(len(mine), 1, "the try was saved to the fake KV")
        self.report(n)

    def report(self, n):
        flag = "flag ON (tries hash)" if self.HASH else "flag OFF (tries blob)"
        out = [f"\nKV-FRUGAL counts: BANK_KV{n} ({n} problems), {flag}; seeded tries blob {self.blob} bytes ({OTHERS} other browsers). No budget asserted yet.",
               f"  {'request':<34}{'trips':>6}{'cmds':>6}{'up B':>10}{'down B':>11}  commands"]
        for label, w in self.rows:
            by = " ".join(f"{k}x{v}" for k, v in sorted(w["by"].items()))
            out.append(f"  {label:<34}{w['trips']:>6}{w['cmds']:>6}{w['up']:>10}{w['down']:>11}  {by}")
        print("\n".join(out), flush=True)

    def test_bank_of_1(self):
        self.flow(1)

    def test_bank_of_64(self):
        self.flow(64)

    def test_view_only_leaves_no_record(self):
        """a brand-new id that only views (/b/last, /p, /state) writes nothing: no student hash is created"""
        if not self.HASH:
            self.skipTest("the blob path still records the last bank")
        self.rows = []
        sid = fake_sid("viewer")
        cookie = "sid=" + sid
        st, b = self.call("GET /b/last (fresh)", "GET", "/b/last.json", cookie=cookie)
        self.assertIsNone(b)
        st, _ = self.call("GET /p", "GET", "/p/KVF_Q01.json", cookie=cookie)
        self.assertEqual(st, 200)
        st, s = self.call("GET /state", "GET", "/state/KVF_Q01", cookie=cookie)
        self.assertEqual((st, s["wrong"], s["done"]), (200, 0, False))
        self.assertEqual([label for label, w in self.rows if w["written"]], [], "a view-only visit wrote a key")
        self.assertNotIn(serve.tries_key(sid), self.kv.db)

    def test_preview_namespace_and_short_life(self):
        """VERCEL_ENV=preview: its own key prefix and the 1-day constant, never the prod key"""
        if not self.HASH:
            self.skipTest("the blob path has no prefix")
        sid = fake_sid("preview")
        cookie, self.rows = "sid=" + sid, []
        with mock.patch.dict(os.environ, {"VERCEL_ENV": "preview"}):
            st, b = self.call("GET /b (preview)", "GET", "/b/BANK_KV1.json", cookie=cookie)
        self.assertEqual(st, 200)
        self.assertIn(serve.PREVIEW_PREFIX + serve.TRIES_KEY + sid, self.kv.db)
        self.assertNotIn(serve.TRIES_KEY + sid, self.kv.db, "a preview wrote the prod key")
        self.assertEqual(self.kv.expires[serve.PREVIEW_PREFIX + serve.TRIES_KEY + sid], serve.PREVIEW_LIFETIME)

    def test_flag_off_check_and_turn_keep_today_s_blob_traffic(self):
        """KV-FRUGAL slice 4: flag off, one check + one Cluck turn = today's tries traffic (GET/SET on the one blob, no turn key)"""
        if self.HASH:
            self.skipTest("the blob path only")
        cookie = "sid=" + fake_sid("blob-traffic")
        with self.kv.window() as w:
            st, head, raw = serve.dispatch("POST", "/check", cookie, json.dumps({"code": "KVF_Q01", "answer": "5"}).encode())
            turn, thead, chunks = serve.STREAMS["/explain"](cookie, json.dumps({"code": "KVF_Q01", "answer": "5"}).encode())
            text = b"".join(chunks).decode()
        self.assertEqual((st, json.loads(raw)["verdict"], turn), (200, "wrong", 200))
        self.assertTrue(text.strip())
        today = [(["GET"], [serve.KV_KEY]), (["SET"], [serve.KV_KEY]), (["GET"], [serve.KV_KEY]), (["GET"], [serve.KV_KEY]),
                 (["GET"], [serve.KV_KEY]), (["SET"], [serve.KV_KEY]), (["GET"], [serve.KV_KEY]), (["SET"], [serve.KV_KEY]),
                 (["GET"], [serve.KV_KEY])]
        self.assertEqual([(r["cmds"], r["keys"]) for r in w["rows"] if serve.KV_KEY in r["keys"]], today, "the blob path's traffic changed")
        self.assertEqual([k for k in w["keys"] if serve.TURNS_KEY in k], [], "the blob path touched a turn key")

    def test_preview_turn_key_and_short_life(self):
        """VERCEL_ENV=preview: the turn key takes the preview prefix and KVF-3's 1-day life, never the prod key"""
        if not self.HASH:
            self.skipTest("the turn key only exists with the flag on")
        sid = fake_sid("preview-turn")
        cookie = "sid=" + sid
        with mock.patch.dict(os.environ, {"VERCEL_ENV": "preview"}):
            st, head, chunks = serve.STREAMS["/explain"](cookie, json.dumps({"code": "KVF_Q01", "answer": "5"}).encode())
            text = b"".join(chunks).decode()
        self.assertEqual(st, 200)
        self.assertTrue(text.strip())
        key = serve.PREVIEW_PREFIX + serve.TURNS_KEY + sid + ":KVF_Q01"
        self.assertIn(key, self.kv.db)
        self.assertNotIn(serve.TURNS_KEY + sid + ":KVF_Q01", self.kv.db, "a preview wrote the prod turn key")
        self.assertEqual(self.kv.expires.get(key), serve.PREVIEW_LIFETIME)

    def test_store_load_ignores_old_turn_fields(self):
        """r1 finding 8: HGETALL no longer returns c: rows, even when an old hash still carries them"""
        if not self.HASH:
            self.skipTest("the store only exists with the flag on")
        sid = fake_sid("old-turns")
        self.kv.db[serve.tries_key(sid)] = {"c:KVF_Q01": json.dumps([[1, 0, "x", "5"]]),
                                            "KVF_Q02": json.dumps({"wrong": [], "done": False, "gen": 2})}
        st = serve.TriesStore()
        st.load(sid)
        self.assertNotIn("c:KVF_Q01", st.fields)
        self.assertEqual([k for k, _ in st.entries()], [(sid, "KVF_Q02")])

    def test_turn_rows_are_validated_and_logged(self):
        """a turn key is read like the blob loader: bad rows dropped with ONE log line, never a raise"""
        if not self.HASH:
            self.skipTest("the turn key only exists with the flag on")
        good, lock = [1, 0, "x", "5"], [2, 1, "y", "5", True]
        logs = []
        raw = json.dumps([good, [1], "no", ["s", 1, 2, 3], lock])
        with mock.patch.object(serve, "_kv", lambda *c: raw), mock.patch.object(serve, "log", lambda *a: logs.append(a)):
            rows = serve.turns_read(fake_sid("rows"), "KVF_Q01")
        self.assertEqual(rows, [good, lock])
        self.assertEqual(len(logs), 1, "bad rows are dropped with one log line")

    def test_turn_kv_errors_are_logged_not_raised(self):
        """a dead KV on the turn GET or SET logs and carries on, as the store load/save do"""
        if not self.HASH:
            self.skipTest("the turn key only exists with the flag on")
        logs = []
        with mock.patch.object(serve, "_kv", side_effect=OSError("down")), mock.patch.object(serve, "log", lambda *a: logs.append(a)):
            self.assertEqual(serve.turns_read(fake_sid("turn-down"), "KVF_Q01"), [])
            serve.turns_write(fake_sid("turn-down"), "KVF_Q01", [[1, 0, "", "5"]])
        self.assertEqual(len(logs), 2, "a failed turn GET and SET each log once")

    def test_hash_store_parts_gen_and_rounds(self):
        """the store itself: a multi gets one field per part, gen stays above every saved entry, and a new round drops older ones"""
        if not self.HASH:
            self.skipTest("the store only exists with the flag on")
        sid = fake_sid("store")
        st = serve.TriesStore()
        st.entry_new((sid, "KVF_M1", 0))["wrong"].append(("num", "5"))
        st.entry_new((sid, "KVF_M1", 1))
        st.put((sid, "KVF_M1", 0))
        st.save()
        st2 = serve.TriesStore()
        st2.load(sid)
        self.assertEqual(st2.get((sid, "KVF_M1", 0))["wrong"], [("num", "5")])
        self.assertFalse(st2.get((sid, "KVF_M1", 1))["done"])
        r1 = st2.round(sid, 1)
        st2.entry_new((r1, "KVF_M2"))["done"] = True
        st2.put((r1, "KVF_M2"))
        st2.save()
        st3 = serve.TriesStore()
        r2 = st3.round(sid, 2)
        st3.entry_new((r2, "KVF_M3"))
        st3.save()
        st4 = serve.TriesStore()
        st4.load(sid)
        self.assertIsNone(st4.get((r1, "KVF_M2")), "the older redo round stayed")
        self.assertGreater(st4.entry_new((sid, "KVF_M4"))["gen"], st4.get((r2, "KVF_M3"))["gen"])

    def test_state_flag_off_reads_under_the_lock(self):
        if self.HASH:
            self.skipTest("the blob path only")
        seen = []

        class Spy(dict):
            def get(self, k, d=None):
                seen.append(serve._tries_lock.locked())
                return dict.get(self, k, d)
        serve.state(problem(1), fake_sid("lock"), snap=(Spy(), 0))
        self.assertEqual(seen, [True], "state() read the blob without _tries_lock")

    def test_store_load_survives_bad_kv_and_bad_rows(self):
        if not self.HASH:
            self.skipTest("the store only exists with the flag on")
        sid = fake_sid("bad")
        good = [1, 2, "x", 4]
        self.kv.db[serve.tries_key(sid)] = {"_gen": "oops", "c:A": json.dumps([good, [1], "no", ["s", 1, 2, 3]]), "c:B": json.dumps([[1]]),
                                            "KVF_Q01": json.dumps({"wrong": [], "done": False, "gen": 7})}
        st = serve.TriesStore()
        st.load(sid)
        self.assertNotIn("c:A", st.fields, "slice 4: a c: row is old data, never loaded")
        self.assertNotIn("c:B", st.fields)
        self.assertEqual(st.gen, 7)
        with mock.patch.object(serve, "_kv", side_effect=OSError("down")):
            st2 = serve.TriesStore()
            st2.load(sid)                                    # never raises
        self.assertEqual((st2.fields, st2.gen), ({}, 0))

    def test_expr_seen_orders_by_gen(self):
        if not self.HASH:
            self.skipTest("the store only exists with the flag on")
        sid = fake_sid("seen")
        st = serve.TriesStore()
        st.load(sid)
        for c, g in (("KVF_Q05", 3), ("KVF_Q02", 1), ("KVF_Q09", 2)):
            st.fields[c] = {"wrong": [], "done": False, "gen": g}
        self.assertEqual([c for c, _ in serve.expr_seen(sid, "KVF_Q99", store=st)], ["KVF_Q02", "KVF_Q09", "KVF_Q05"])

    def test_save_logs_a_pipeline_item_error(self):
        if not self.HASH:
            self.skipTest("the store only exists with the flag on")
        st = serve.TriesStore()
        st.entry_new((fake_sid("err"), "KVF_Q01"))
        logs = []
        with mock.patch.object(serve, "_kv_pipeline", return_value=[{"error": "WRONGTYPE"}, {"result": 1}]), \
                mock.patch.object(serve, "log", lambda *a: logs.append(a)):
            st.save()
        self.assertTrue(any(a and a[0] == "tries not saved to KV:" for a in logs))

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


class KvFrugalHash(KvFrugal):
    """KV-FRUGAL slice 3: the same flow with STEM_TRIES_HASH=1, against the fake KV's HSET / HGETALL / EXPIRE / pipeline support"""
    HASH = True


if __name__ == "__main__":
    unittest.main()
