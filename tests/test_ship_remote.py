"""Ship from Termux (docs/design/DEPLOY.md, "Power button"): bank pins (SHIP_PINS / --pin) in tools/build_and_ship/brain_banks.py, and tools/build_and_ship/ship.sh
routing to tools/build_and_ship/press.sh (a queued GitHub run) on Termux or with --remote. No Vercel, no gh, no network: urllib and press.sh are stubbed.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import io
import json
import os
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "build_and_ship"))
import brain_banks  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_ship  # noqa: E402
put = test_ship.put

PATH_P3X = "projects/calc/_files/phys2a-exam3-bank/BANK_P3X.json"
PATH_ZZ1 = "projects/calc/_files/x-bank/BANK_ZZ1.json"


class Resp(io.BytesIO):
    headers = {"X-Next-Page": ""}


class Pins(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(brain_banks.parse_pins("BANK_P3X@cd581738,BANK_Y22@0123abc"), {"BANK_P3X": "cd581738", "BANK_Y22": "0123abc"})
        self.assertEqual(brain_banks.parse_pins("BANK_P3X.json@cd581738"), {"BANK_P3X": "cd581738"})
        self.assertEqual(brain_banks.parse_pins(""), {})
        self.assertEqual(brain_banks.parse_pins(" BANK_P3X@cd581738 , "), {"BANK_P3X": "cd581738"})

    def test_malformed(self):
        for bad in ("BANK_P3X", "BANK_P3X@", "@cd581738", "BANK_P3X@zz", "BANK_P3X@cd5", "bank_p3x@cd581738", "NOPE@cd581738", "../x@cd581738"):
            with self.assertRaises(brain_banks.Fail, msg=bad):
                brain_banks.parse_pins(bad)

    def test_duplicate(self):
        with self.assertRaises(brain_banks.Fail):
            brain_banks.parse_pins("BANK_P3X@cd581738,BANK_P3X@0123abc")

    def test_cli_check(self):
        for spec, rc in (("BANK_P3X@cd581738", 0), ("BANK_P3X@cd581738,BANK_P3X@cd581738", 1), ("junk", 1)):
            r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_and_ship", "brain_banks.py"), "--check-pins", spec], capture_output=True, text=True)
            self.assertEqual(r.returncode, rc, r.stderr)


class PinnedFetch(unittest.TestCase):
    def fake(self, pin_has_file=True):
        urls = []

        def urlopen(req, timeout=None):
            u = urllib.parse.urlparse(req.full_url)
            q = dict(urllib.parse.parse_qsl(u.query))
            urls.append((u.path, q))
            if u.path.endswith("/repository/tree"):
                if q["ref"] == "main":
                    return Resp(json.dumps([{"type": "blob", "path": PATH_P3X}, {"type": "blob", "path": PATH_ZZ1}]).encode())
                return Resp(json.dumps([{"type": "blob", "path": PATH_P3X}] if pin_has_file else []).encode())
            if u.path.endswith("/raw"):
                return Resp(json.dumps({"problems": [], "ref": q["ref"]}).encode())
            raise AssertionError(u.path)
        return urls, urlopen

    def setUp(self):
        self.out = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.out, True)

    def test_pinned_uses_sha_unpinned_uses_main(self):
        urls, fake = self.fake()
        with mock.patch.dict(os.environ, {"BRAIN_TOKEN": "t", "SHIP_PINS": "BANK_P3X@cd581738"}), mock.patch("urllib.request.urlopen", fake), \
                mock.patch("sys.stdout", new_callable=io.StringIO) as so:
            self.assertEqual(brain_banks.main(self.out), 0)
        raws = {p.split("/files/")[1]: q["ref"] for p, q in urls if p.endswith("/raw")}
        self.assertEqual(raws[urllib.parse.quote(PATH_P3X, safe="") + "/raw"], "cd581738")
        self.assertEqual(raws[urllib.parse.quote(PATH_ZZ1, safe="") + "/raw"], "main")
        with open(os.path.join(self.out, "BANK_P3X.json")) as f:
            self.assertEqual(json.load(f)["ref"], "cd581738")
        src = {os.path.basename(l.split("\t")[1]): l.split("\t")[2] for l in so.getvalue().splitlines()}
        self.assertEqual(src["BANK_P3X.json"], "brain@cd581738")
        self.assertEqual(src["BANK_ZZ1.json"], "brain")

    def test_missing_pinned_file_fails(self):
        urls, fake = self.fake(pin_has_file=False)
        with mock.patch.dict(os.environ, {"BRAIN_TOKEN": "t", "SHIP_PINS": "BANK_P3X@cd581738"}), mock.patch("urllib.request.urlopen", fake), \
                mock.patch("sys.stdout", new_callable=io.StringIO):
            with self.assertRaises(brain_banks.Fail) as c:
                brain_banks.main(self.out)
        self.assertIn("BANK_P3X", str(c.exception))
        self.assertEqual(os.listdir(self.out), [])   # nothing written: nothing deploys

    def test_missing_pinned_file_exit_code(self):
        urls, fake = self.fake(pin_has_file=False)
        with mock.patch.dict(os.environ, {"BRAIN_TOKEN": "t", "SHIP_PINS": "BANK_P3X@cd581738"}), mock.patch("urllib.request.urlopen", fake), \
                mock.patch("sys.argv", ["brain_banks.py", self.out]), mock.patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as c:
                runpy.run_path(os.path.join(ROOT, "tools", "build_and_ship", "brain_banks.py"), run_name="__main__")
        self.assertEqual(c.exception.code, 1)


class Routing(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="stem-remote-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        os.makedirs(os.path.join(self.tmp, "tools", "build_and_ship"))
        shutil.copy(os.path.join(ROOT, "tools", "build_and_ship", "ship.sh"), os.path.join(self.tmp, "tools", "build_and_ship", "ship.sh"))
        self.press = os.path.join(self.tmp, "press-stub.sh")
        self.log = os.path.join(self.tmp, "press.log")
        with open(self.press, "w") as f:
            f.write('#!/usr/bin/env bash\nprintf "%s|" "$@" >> "$PRESS_LOG"; echo "pins=${SHIP_PINS:-}" >> "$PRESS_LOG"\n')
        os.chmod(self.press, 0o755)

    def ship(self, *args, **env):
        e = {k: v for k, v in os.environ.items() if not k.startswith(("BRAIN_", "SHIP_", "GIT_", "TERMUX", "PREFIX"))}
        e.update(HOME=self.tmp, SHIP_PRESS=self.press, PRESS_LOG=self.log, SHIP_BRAIN_SEARCH="", SHIP_NO_BRAIN="1")
        e.update(env)
        return subprocess.run(["bash", os.path.join(self.tmp, "tools", "build_and_ship", "ship.sh"), *args], capture_output=True, text=True, env=e, timeout=60)

    def pressed(self):
        if not os.path.exists(self.log):
            return None
        with open(self.log) as f:
            return f.read().strip()

    def test_termux_version_routes_to_press(self):
        r = self.ship("live", TERMUX_VERSION="1")
        self.assertEqual(self.pressed(), "live|pins=", r.stderr)

    def test_termux_prefix_routes_to_press(self):
        self.ship("demo", PREFIX="/data/data/com.termux/files/usr")
        self.assertEqual(self.pressed(), "demo|pins=")

    def test_pins_forwarded(self):
        self.ship("live", "--pin", "BANK_P3X@cd581738", TERMUX_VERSION="1", SHIP_PINS="BANK_Y22@abc1234")
        got = self.pressed()
        self.assertIn("BANK_P3X@cd581738", got)
        self.assertIn("BANK_Y22@abc1234", got)
        self.assertIn("live", got)

    def test_wait_forwarded(self):
        self.ship("--wait", "live", TERMUX_VERSION="1")
        self.assertTrue(self.pressed().startswith("--wait|live|"), self.pressed())

    def test_remote_flag_off_termux(self):
        self.ship("--remote", "live")
        self.assertEqual(self.pressed(), "live|pins=")

    def test_local_flag_does_not_route(self):
        self.ship("--local", "live", "/no/such/banks", TERMUX_VERSION="1")
        self.assertIsNone(self.pressed())

    def test_default_off_termux_is_local(self):
        self.ship("live", "/no/such/banks")
        self.assertIsNone(self.pressed())

    def test_remote_rejects_banks_dir(self):
        r = self.ship("live", self.tmp, TERMUX_VERSION="1")
        self.assertEqual(r.returncode, 2)
        self.assertIsNone(self.pressed())


class ClonePins(test_ship.PrintBanks):
    """ship.sh with a brain clone: a pinned bank comes from `git show <sha>:<path>`, not the clone's checkout."""
    def sha(self, msg):
        r = subprocess.run(["git", "-C", self.brain, "log", "--format=%h %s"], capture_output=True, text=True)
        return [l.split()[0] for l in r.stdout.splitlines() if l.endswith(msg)][0]

    def test_pin_shows_old_commit(self):
        old = self.sha("old")
        r = self.ship("--pin", "BANK_ZZ1@" + old)
        src, path = self.chosen(r)["BANK_ZZ1.json"]
        self.assertEqual(src, "brain@" + old)
        self.assertIn("(brain@%s)" % old, r.stdout)
        self.assertTrue(path.endswith("/BANK_ZZ1.json"))   # the temp copy is gone by now; its content came from `git show`

    def test_unpinned_stay_on_checkout(self):
        self.assertEqual(self.chosen(self.ship())["BANK_ZZ1.json"][0], "brain")

    def test_pin_missing_at_sha_stops(self):
        first = self.sha("old")
        r = self.ship(expect=1, SHIP_PINS="BANK_NOPE@" + first)
        self.assertIn("nothing deployed", r.stderr)
        r = self.ship("--pin", "junk", expect=2)


class Workflow(unittest.TestCase):
    def test_pins_input_and_vars_fallback(self):
        with open(os.path.join(ROOT, ".github", "workflows", "ship.yml")) as f:
            y = f.read()
        self.assertIn("pins:", y)
        self.assertIn("inputs.pins || vars.SHIP_PINS", y)


class Press(unittest.TestCase):
    def run_press(self, *args, **env):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        gh = os.path.join(d, "gh")
        log = os.path.join(d, "gh.log")
        with open(gh, "w") as f:
            f.write('#!/usr/bin/env bash\necho "$*" >> "%s"\n' % log)
        os.chmod(gh, 0o755)
        open(log, "w").close()
        e = {k: v for k, v in os.environ.items() if not k.startswith("SHIP_")}
        e.update(PATH=d + os.pathsep + os.environ["PATH"], **env)
        r = subprocess.run(["bash", os.path.join(ROOT, "tools/build_and_ship/press.sh"), *args], env=e, capture_output=True, text=True, timeout=60)
        with open(log) as f:
            return r, f.read().splitlines()

    def test_pin_flag_and_env(self):
        r, calls = self.run_press("--pin", "BANK_P3X@cd581738", "live")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(calls, ["workflow run ship.yml -R Forzalab/stem-stuff -f mode=live -f pins=BANK_P3X@cd581738"])
        r, calls = self.run_press("live", SHIP_PINS="BANK_P3X@cd581738,BANK_Y22@abc1234")
        self.assertEqual(calls, ["workflow run ship.yml -R Forzalab/stem-stuff -f mode=live -f pins=BANK_P3X@cd581738,BANK_Y22@abc1234"])

    def test_bad_pin_queues_nothing(self):
        r, calls = self.run_press("--pin", "junk", "live")
        self.assertEqual(r.returncode, 2)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
