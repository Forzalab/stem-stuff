"""Audit A4 (fail-open): a tries read that fails (KV timeout, 5xx, a bad blob) was treated as "nothing tried yet". A student who was locked
out got a fresh two tries for as long as the read failed, /check could grade a right answer "correct" on an empty record (and, with the
tries hash, write that empty record's one field over the stored history), and GET /state answered {wrong: 0, done: false, gen: <clock>}:
a gen above the page's cached one reads as "Tony reset it by hand", so the page dropped its locked state.
The server now fails closed: an unreadable record is 503 on /check (a non-proof) and /state, busy on a proof, and nothing is written over it.

Run: python3 -m unittest tests.test_audit_store_down -v"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402
from test_kv_frugal import KV_URL, FakeKV, fake_sid, problem  # noqa: E402

CODE = "KVF_Q01"                                  # a num item, answer 2, two tries


class ReadsDown(FakeKV):
    """the fake KV whose READS fail while `down` is set (writes still land: a timeout on the read, a partial outage)"""
    down = False

    def urlopen(self, req, timeout=None):
        if self.down and req.full_url.startswith(KV_URL):
            body = json.loads(req.data or b"[]")
            ops = [str(c[0]).upper() for c in (body if req.full_url.rstrip("/").endswith("/pipeline") else [body])]
            if any(o in ("GET", "HGETALL", "MGET") for o in ops):
                raise OSError("kv read timed out")
        return super().urlopen(req, timeout)


class StoreDown(unittest.TestCase):
    HASH = "1"

    def setUp(self):
        self.kv = ReadsDown()
        banks = tempfile.mkdtemp(prefix="stem-down-")
        with open(os.path.join(banks, "BANK_KVD.json"), "w") as f:
            json.dump({"v": serve.CUTOFF, "problems": [problem(1)]}, f)
        env = {"STEM_FRONT": "", "VERCEL_ENV": "", "STEM_TRIES_HASH": self.HASH}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "BANKS", banks), mock.patch.object(serve, "KV", (KV_URL, "t")),
                   mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()
        self.cookie = "sid=" + fake_sid("down" + self.HASH)

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._gen["loaded"] = None

    def check(self, answer):
        st, _, data = serve.dispatch("POST", "/check", self.cookie, json.dumps({"code": CODE, "answer": answer}).encode())
        return st, json.loads(data)

    def state(self):
        st, _, data = serve.dispatch("GET", "/state/" + CODE, self.cookie)
        return st, json.loads(data)

    def lock_out(self):
        self.assertEqual([self.check("5")[1]["verdict"], self.check("6")[1]["verdict"]], ["wrong", "wrong"])

    def test_a_locked_student_is_not_unlocked_by_a_failed_read(self):
        self.lock_out()
        self.kv.down = True
        st, out = self.check("2")                          # the RIGHT answer, while the record cannot be read
        self.assertEqual(st, 503, f"a locked student was graded on an empty record: {out}")
        self.kv.down = False
        self.assertEqual(self.check("2")[1]["verdict"], "locked", "the stored record was written over")
        self.assertEqual(self.state()[1]["wrong"], 2)

    def test_state_is_not_a_reset_signal_when_the_read_failed(self):
        self.lock_out()
        gen = self.state()[1]["gen"]
        self.kv.down = True
        st, out = self.state()
        self.assertEqual(st, 503, f"/state answered an empty record with a newer gen: {out}")
        self.kv.down = False
        self.assertEqual(self.state()[1]["gen"], gen)

    def test_a_working_store_is_unchanged(self):
        self.assertEqual(self.check("5")[1]["verdict"], "wrong")
        self.assertEqual(self.check("2")[1]["verdict"], "correct")
        self.assertEqual(self.state()[0], 200)


class StoreDownBlob(StoreDown):
    """the same, flag off (the tries blob)"""
    HASH = ""


if __name__ == "__main__":
    unittest.main()
