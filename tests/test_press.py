"""tools/press.sh with a fake `gh` on PATH: the default press queues ship.yml and exits (no secret list, no run lookup, no watch);
--wait still watches the run. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import os
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE_GH = """#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
case "$1 $2" in
  "secret list") printf 'VERCEL_TOKEN\\t\\nBRAIN_TOKEN\\t\\n' ;;
  "run list") n=$(grep -c '^workflow run' "$GH_LOG"); echo "$n https://example/run/$n" ;;
esac
exit 0
"""


class Press(unittest.TestCase):
    def run_press(self, *args):
        d = tempfile.mkdtemp()
        gh = os.path.join(d, "gh")
        with open(gh, "w") as f:
            f.write(FAKE_GH)
        os.chmod(gh, 0o755)
        log = os.path.join(d, "gh.log")
        open(log, "w").close()
        env = dict(os.environ, PATH=d + os.pathsep + os.environ["PATH"], GH_LOG=log)
        r = subprocess.run(["bash", os.path.join(ROOT, "tools/press.sh"), *args], env=env, capture_output=True, text=True, timeout=60)
        with open(log) as f:
            return r, f.read().splitlines()

    def test_default_queues_and_returns(self):
        r, calls = self.run_press("live")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(calls, ["workflow run ship.yml -R Forzalab/stem-stuff -f mode=live"])
        self.assertIn("queued live", r.stdout)

    def test_wait_watches(self):
        r, calls = self.run_press("--wait", "demo")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("workflow run ship.yml -R Forzalab/stem-stuff -f mode=demo", calls)
        self.assertTrue(any(c.startswith("run watch") for c in calls), calls)
        self.assertIn("OK: demo shipped", r.stdout)

    def test_bad_mode(self):
        r, calls = self.run_press("prod")
        self.assertEqual(r.returncode, 2)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
