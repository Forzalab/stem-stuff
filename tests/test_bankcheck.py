"""tools/bank_tools/bankcheck.py: smoke and sanity tests (docs/design/BANKCHECK.md). One table of temp banks; no regression suite.
  python3 -m unittest tests.test_bankcheck            every code fires and points
  python3 -m unittest tests.test_bankcheck.Parity     the verdict matches the server (serve.banks, bank_notice, bank_payload)
"""
import datetime
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

# serve fixes its tries file at import: a temp file, never the repo's tries.json
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.tool("bank_tools"))
import bankcheck  # noqa: E402
import serve  # noqa: E402

BANKCHECK = os.path.join(paths.tool("bank_tools"), "bankcheck.py")
SUNSET = serve.SUNSET.isoformat()
BEFORE = (serve.SUNSET - datetime.timedelta(days=1)).isoformat()
# a problem the schema accepts: code shape PREFIX_XXXX, a num with an answer
GOOD = {"code": "PSY6_A001", "type": "num", "answer": "4", "body": [{"type": "text", "md": "2 + 2"}]}


def _p(**kw):
    return {**GOOD, **kw}


# name, file name, file text, --today, expected: ("fail", [codes]) | ("warn", [codes]) | ("ok", [])
ROWS = [
    ("bad name", "BANK_PSY6TOOLONG.json", {"v": 20261022, "problems": [GOOD]}, None, ("fail", ["B-NAME"])),
    ("broken json", "BANK_PSY6.json", "{ not json", None, ("fail", ["B-JSON"])),
    ("v1 at sunset", "BANK_PSY6.json", {"v": 1, "problems": [GOOD]}, SUNSET, ("fail", ["B-VER"])),
    ("v1 one day before", "BANK_PSY6.json", {"v": 1, "problems": [GOOD]}, BEFORE, ("warn", ["B-VER"])),
    ("empty", "BANK_PSY6.json", {"v": 20261022, "problems": []}, None, ("fail", ["B-EMPTY"])),
    ("all hidden", "BANK_PSY6.json", {"v": 20261022, "problems": [_p(saccharine={"hide": True})]}, None, ("fail", ["B-HIDDEN"])),
    ("num without answer", "BANK_PSY6.json", {"v": 20261022, "problems": [{k: v for k, v in GOOD.items() if k != "answer"}]}, None,
     ("fail", ["B-SCHEMA"])),
    ("wrong prefix", "BANK_PSY6.json", {"v": 20261022, "problems": [_p(code="CALC1_A001")]}, None, ("warn", ["B-PREFIX"])),
    ("two faults", "BANK_ab.json", {"v": 20261022, "problems": [{k: v for k, v in GOOD.items() if k != "answer"}]}, None,
     ("fail", ["B-NAME", "B-SCHEMA"])),
    # B-ASK (v >= 20261118): a clean situation + ask passes; no ask, a question in the setup, an ask that is setup all fail
    ("ask clean", "BANK_PSY6.json", {"v": 20261118, "problems": [_p(ask="Compute 2 + 2.", body=[{"type": "text", "md": ["A sum of two twos.", "", "It is small."]}])]}, None, ("ok", [])),
    ("ask missing", "BANK_PSY6.json", {"v": 20261118, "problems": [GOOD]}, None, ("fail", ["B-ASK"])),
    ("question in setup", "BANK_PSY6.json", {"v": 20261118, "problems": [_p(ask="Find the sum.", body=[{"type": "text", "md": ["Using the Master Theorem, compute the running time:", "", "It calls itself 3 times"]}])]}, None, ("fail", ["B-ASK"])),
    ("ask is setup", "BANK_PSY6.json", {"v": 20261118, "problems": [_p(ask="At each level it does O(N) work.")]}, None, ("fail", ["B-ASK"])),
    # B-TICK (v >= 20261118, Tony Nov 17): a tick instruction in ask/body fails; the noun "tick" passes
    ("tick in ask", "BANK_PSY6.json", {"v": 20261118, "problems": [_p(ask="Which parts are bad? Tick each one.")]}, None, ("fail", ["B-TICK"])),
    ("noun tick ok", "BANK_PSY6.json", {"v": 20261118, "problems": [_p(ask="Which filter drops a frame on every tick?")]}, None, ("ok", [])),
    ("old v not asked", "BANK_PSY6.json", {"v": 20261022, "problems": [GOOD]}, None, ("ok", [])),
]


def _write(d, name, text):
    path = os.path.join(d, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text if isinstance(text, str) else json.dumps(text))
    return path


def run_cli(path, today):
    cmd = [sys.executable, BANKCHECK, path] + (["--today", today] if today else [])
    return subprocess.run(cmd, capture_output=True, text=True)


class Smoke(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="bankcheck-")

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_real_banks_pass(self):
        r = subprocess.run([sys.executable, BANKCHECK, os.path.join(paths.SERVER_DIR, "data", "banks")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(r.stdout.count("BANKCHECK OK "), len([f for f in os.listdir(os.path.join(paths.SERVER_DIR, "data", "banks"))
                                                              if f.startswith("BANK_") and f.endswith(".json")]))

    def test_table(self):
        for name, fname, text, today, (kind, codes) in ROWS:
            with self.subTest(name):
                path = _write(self.d, fname, text)
                r = run_cli(path, today)
                lines = r.stdout.splitlines()
                if kind == "fail":
                    self.assertEqual(r.returncode, 1, r.stdout)
                    for c in codes:
                        self.assertTrue(any(l.startswith(f"BANKCHECK FAIL {path} {c}:") for l in lines), r.stdout)
                    self.assertEqual(lines[-1], f"Agents: read docs/design/BANKCHECK.md#{min(codes, key=bankcheck.CODES.index)}")
                else:
                    self.assertEqual(r.returncode, 0, r.stdout)
                    for c in codes:
                        self.assertTrue(any(l.startswith(f"BANKCHECK WARN {path} {c}:") for l in lines), r.stdout)
                    self.assertFalse(any(l.startswith("Agents:") for l in lines))
                    self.assertTrue(any(l.startswith(f"BANKCHECK OK {path}") for l in lines), r.stdout)

    def test_codes_listed(self):
        r = subprocess.run([sys.executable, BANKCHECK, "--codes"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout.split(), bankcheck.CODES)


class Parity(unittest.TestCase):
    """For each row: "no LOAD failure" == the server lists the bank, bank_notice does not drop it, and bank_payload (sugar) has problems.
    banks() alone cannot see an all-hidden bank (serve.py:1043 hides them per request), so bank_payload stands in for that step."""

    def setUp(self):
        self.saved = (serve.BANKS, os.environ.get("STEM_TODAY"))

    def tearDown(self):
        serve.BANKS = self.saved[0]
        if self.saved[1] is None:
            os.environ.pop("STEM_TODAY", None)
        else:
            os.environ["STEM_TODAY"] = self.saved[1]

    def test_same_answer_as_server(self):
        for name, fname, text, today, _ in ROWS:
            with self.subTest(name):
                d = tempfile.mkdtemp(prefix="bankcheck-parity-")
                try:
                    path = _write(d, fname, text)
                    os.environ["STEM_TODAY"] = today or serve.today().isoformat()
                    serve.BANKS = d
                    serve._bank["sig"] = None   # the index cache keys on mtimes: a new row must rebuild
                    out = io.StringIO()
                    with redirect_stdout(out), redirect_stderr(io.StringIO()):   # serve logs each load to stderr
                        findings, _ = bankcheck.check_file(path, load_only=True)
                    bank_load_fail = any(level == "FAIL" and code in bankcheck.LOAD_CODES for level, code, _ in findings)
                    stem = fname[:-5]
                    with redirect_stderr(io.StringIO()):
                        listed = stem in serve.banks()
                        dropped = listed and serve.bank_notice(stem, serve._versions.get(path, 1))[1]
                        shown = listed and not dropped and bool(serve.bank_payload(stem, "parity", "sugar")["problems"])
                    self.assertEqual(not bank_load_fail, shown)
                finally:
                    shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
