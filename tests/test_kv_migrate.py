"""tools/operations/kv_migrate.py: dry run writes nothing; --apply writes the t:/turns: keys with their expiries and the
_gen floor; a per-command pipeline {"error"} stops the run with exit 1. Fake Upstash in memory (no network), the same seam
as tests/test_kv_frugal.py. Smoke/sanity only: one seeded blob, no prod KV."""
import contextlib
import hashlib
import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.tool("operations"))
import kv_migrate as m  # noqa: E402

KV_KEY = "stem:tries"
KVURL = "https://kv.test"
ENV = {"KV_REST_API_URL": KVURL, "KV_REST_API_TOKEN": "kv-token-not-printed"}
DAY = 24 * 60 * 60


def fake_sid(i):
    """a made-up browser id (32 hex), derived at run time: no id is ever written in this file"""
    return hashlib.sha256(f"kv-migrate-{i}".encode()).hexdigest()[:32]


A, B = fake_sid("a"), fake_sid("b")


def seeded():
    """a blob with both browsers in tries and last, a redo round on A, and Cluck rows on both"""
    return {
        "gen": 7,
        "tries": {
            f"{A} P1": {"wrong": [["num", "5"]], "done": False, "gen": 5},
            f"{A}:r2 P1": {"wrong": [], "done": False, "gen": 6},
            f"{A} P2 0": {"wrong": [], "done": True, "gen": 6},
            f"{B} P1": {"wrong": [], "done": False, "gen": 2},
        },
        "last": {
            A: {"bank": "BANK_X", "at": {"BANK_X": "P1", "BANK_Y": "P2"}},
            B: {"bank": "BANK_X", "at": {"BANK_X": "P1"}},
        },
        "cluck": {
            f"{A} P1": [[1, 0, "", None], [2, 1, "<XYZ>hint</XYZ>", None]],
            f"{B} P1": [[1, 1, "", "A"]],
        },
    }


class FakeKV:
    """Upstash REST in memory: a single command, or a /pipeline list. `error_cmd` makes that exact command's reply
    {"error": ...}; `done` keeps the commands that ran, `pipelines` counts round trips."""
    def __init__(self, blob=None, error_cmd=None):
        self.db = {} if blob is None else {KV_KEY: json.dumps(blob)}
        self.expires, self.calls, self.done = {}, [], []
        self.error_cmd, self.pipelines = error_cmd, 0

    def run(self, cmd):
        op, a = str(cmd[0]).upper(), list(cmd[1:])
        if op == "GET":
            return self.db.get(a[0])
        if op == "SET":
            self.db[a[0]] = a[1]
            if len(a) >= 4 and str(a[2]).upper() == "EX":
                self.expires[a[0]] = int(a[3])
            return "OK"
        if op == "HSET":
            h = self.db.setdefault(a[0], {})
            h.update(zip(a[1::2], a[2::2]))
            return len(a[1::2])
        if op == "EXPIRE":
            self.expires[a[0]] = int(a[1])
            return int(a[0] in self.db)
        raise ValueError("FakeKV: no such command " + op)

    def http(self, url, token, body, timeout=None):
        self.calls.append((url, body))
        if body and isinstance(body[0], str):
            return 200, {"result": self.run(body)}
        self.pipelines += 1
        out = []
        for cmd in body:
            if cmd == self.error_cmd:
                out.append({"error": "ERR quota"})
                continue
            self.done.append(cmd)
            out.append({"result": self.run(cmd)})
        return 200, out


class Base(unittest.TestCase):
    def setUp(self):
        self._real = m._http

    def tearDown(self):
        m._http = self._real

    def run_main(self, stub, argv=()):
        m._http = stub.http
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = m.main(list(argv), env=dict(ENV))
        return code, out.getvalue(), err.getvalue()


class DryRun(Base):
    def test_reads_once_and_writes_nothing(self):
        blob = seeded()
        stub = FakeKV(blob)
        code, out, err = self.run_main(stub)
        self.assertEqual(code, 0, err)
        self.assertEqual(stub.calls, [(KVURL, ["GET", KV_KEY])], "exactly one read, no write")
        self.assertEqual(stub.pipelines, 0)
        self.assertEqual(stub.db, {KV_KEY: json.dumps(blob)})
        for count in ("browsers=2", "fields=4", "turns=2", "blob_bytes=", "plan_bytes=", "bad=0"):
            self.assertIn(count, out)
        self.assertIn("DRY RUN", out)


class Apply(Base):
    def test_layout_expiries_and_gen(self):
        blob = seeded()
        stub = FakeKV(blob)
        code, out, err = self.run_main(stub, ["--apply"])
        self.assertEqual(code, 0, err)
        self.assertEqual(stub.db[KV_KEY], json.dumps(blob), "the old blob is never written")

        h = stub.db["t:" + A]
        self.assertEqual(h["P1"], '{"wrong":[["num","5"]],"done":false,"gen":5}')
        self.assertEqual(h["P2 0"], '{"wrong":[],"done":true,"gen":6}')
        self.assertEqual(h["r2 P1"], '{"wrong":[],"done":false,"gen":6}', "a redo round keeps its field tag")
        self.assertEqual((h["_bank"], h["at:BANK_X"], h["at:BANK_Y"]), ("BANK_X", "P1", "P2"))
        self.assertEqual(h["_gen"], "7")
        self.assertFalse([f for f in h if f.startswith("c:")], "no c: field in the hash")
        self.assertEqual(stub.db["t:" + B]["_gen"], "7")

        rows = json.loads(stub.db["turns:" + A + ":P1"])
        self.assertEqual(rows, blob["cluck"][f"{A} P1"])
        self.assertEqual(json.loads(stub.db["turns:" + B + ":P1"]), blob["cluck"][f"{B} P1"])

        self.assertEqual(stub.expires["t:" + A], 120 * DAY)
        self.assertEqual(stub.expires["t:" + B], 120 * DAY)
        self.assertEqual(stub.expires["turns:" + A + ":P1"], 14 * DAY)
        self.assertEqual(stub.expires["turns:" + B + ":P1"], 14 * DAY)
        for key in ("t:" + A, "t:" + B, "turns:" + A + ":P1", "turns:" + B + ":P1"):
            self.assertIn(key, stub.expires, "every written key gets its expiry")

        for base in (A, B):                                  # HSET + EXPIRE stay in the same pipeline
            i = next(i for i, c in enumerate(stub.done) if c[0] == "HSET" and c[1] == "t:" + base)
            self.assertEqual(stub.done[i + 1], ["EXPIRE", "t:" + base, 120 * DAY])
        sets = [c for c in stub.done if c[0] == "SET"]
        self.assertTrue(sets)
        for c in sets:
            self.assertEqual(c[3:], ["EX", m.TURNS_LIFETIME], "turns expire with SET ... EX, not a second command")

        for sid in (A, B):
            self.assertNotIn(sid, out + err, "never print a whole sid")

    def test_apply_twice_is_idempotent(self):
        blob = seeded()
        stub = FakeKV(blob)
        self.assertEqual(self.run_main(stub, ["--apply"])[0], 0)
        first = dict(stub.db)
        self.assertEqual(self.run_main(stub, ["--apply"])[0], 0)
        self.assertEqual(stub.db, first)
        self.assertEqual(stub.db[KV_KEY], json.dumps(blob))

    def test_gen_floor_is_never_below_a_cached_entry(self):
        blob = seeded()
        blob["gen"] = 3
        blob["tries"][f"{B} P1"]["gen"] = 9
        stub = FakeKV(blob)
        self.assertEqual(self.run_main(stub, ["--apply"])[0], 0)
        self.assertEqual(stub.db["t:" + A]["_gen"], "6", "the browser's highest entry gen beats a lower blob gen")
        self.assertEqual(stub.db["t:" + B]["_gen"], "9")

    def test_last_only_browser_gets_a_hash(self):
        blob = {"gen": 5, "tries": {}, "cluck": {},
                "last": {A: {"bank": "BANK_X", "at": {"BANK_X": "P9"}}}}
        stub = FakeKV(blob)
        code, out, err = self.run_main(stub, ["--apply"])
        self.assertEqual(code, 0, err)
        self.assertEqual(stub.db["t:" + A], {"_bank": "BANK_X", "at:BANK_X": "P9", "_gen": "5"})
        self.assertEqual(stub.expires["t:" + A], 120 * DAY)
        self.assertIn("browsers=1 fields=0", out)


class BadRows(Base):
    def test_bad_rows_skipped_and_counted(self):
        blob = {
            "gen": 4,
            "tries": {
                f"{A} P1": {"wrong": [], "done": False, "gen": 1},
                f"{B} P2 x": {"wrong": [], "done": False, "gen": 1},      # part is not an int
                f"{A} P3 P4 P5": {"wrong": [], "done": False, "gen": 1},   # not 'sid CODE [part]'
                f"{B} P3": "junk",                                        # not an entry object
            },
            "last": {B: {"bank": "BANK_X", "at": []}},                    # at is not an object
            "cluck": {
                f"{A} P1": [[1, 0, "", None], [2, 0, 3, None]],           # the 2nd row has no xyz string
                f"{A}": [[1, 0, "", None]],                               # not 'sid CODE'
            },
        }
        stub = FakeKV(blob)
        code, out, err = self.run_main(stub, ["--apply"])
        self.assertEqual(code, 0, err)
        self.assertIn("bad=6", out)                    # 3 tries + 1 last + 1 turn row + 1 turn key
        self.assertEqual(stub.db["t:" + A]["P1"], '{"wrong":[],"done":false,"gen":1}')
        self.assertNotIn("P3 P4 P5", stub.db["t:" + A])
        self.assertNotIn("t:" + B, stub.db)
        self.assertEqual(json.loads(stub.db["turns:" + A + ":P1"]), [[1, 0, "", None]])
        self.assertEqual(stub.db["t:" + A]["_gen"], "4")


class PipelineError(Base):
    def setUp(self):
        super().setUp()
        self._batch, m.BATCH = m.BATCH, 2          # one hash per batch: an error in batch 2 must stop before the turns

    def tearDown(self):
        m.BATCH = self._batch
        super().tearDown()

    def test_error_reply_stops_and_exits_1(self):
        blob = seeded()
        stub = FakeKV(blob, error_cmd=["EXPIRE", "t:" + B, m.TRIES_LIFETIME])
        code, out, err = self.run_main(stub, ["--apply"])
        self.assertEqual(code, 1)
        self.assertIn("ERR quota", err)
        self.assertEqual(stub.pipelines, 2, "the run stops at the failed batch")
        self.assertIn("t:" + A, stub.db)                   # batch 1 was already written
        self.assertNotIn("turns:" + A + ":P1", stub.db)    # batch 3 never ran
        self.assertNotIn("turns:" + B + ":P1", stub.db)
        self.assertEqual(stub.db[KV_KEY], json.dumps(blob), "the old blob is untouched")
        for sid in (A, B):
            self.assertNotIn(sid, out + err, "never print a whole sid")
        self.assertIn(B[:6] + "..", err, "the failed key is masked")


if __name__ == "__main__":
    unittest.main()
