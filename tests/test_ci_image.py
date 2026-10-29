"""CI runner image pin: a workflow job that installs Playwright browsers, or sets up python/node from the runner's toolcache,
must name its Ubuntu image (ubuntu-24.04), never ubuntu-latest. ubuntu-latest rolled to 26.04 mid-run (PR #337 run 40950644957,
block 2/4): Playwright 1.56.1 has no chromium-headless-shell for ubuntu26.04 and every block died at "install browsers".
Text-only parse of .github/workflows/*.yml (no PyYAML on the unit runner).
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import glob
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WF = os.path.join(ROOT, ".github", "workflows")
IMAGE_DEPENDENT = re.compile(r"playwright|setup-python|setup-node|apt-get|\bapt\b")
PINNED = re.compile(r"^ubuntu-\d+\.\d+$")


def jobs(path):
    """{job name: (runs-on value, job body text)} for the top-level jobs: block of one workflow file."""
    out, name, body, in_jobs = {}, None, [], False
    for line in open(path, encoding="utf-8").read().splitlines() + ["end:"]:
        if re.match(r"^\S", line):   # a top-level key ends the current job (and maybe the jobs: block)
            if name:
                out[name] = body
            name, body, in_jobs = None, [], line.startswith("jobs:")
            continue
        m = in_jobs and re.match(r"^  ([A-Za-z0-9_-]+):", line)
        if m:
            if name:
                out[name] = body
            name, body = m.group(1), []
        elif name:
            body.append(line)
    res = {}
    for n, b in out.items():
        text = "\n".join(b)
        ro = re.search(r"^    runs-on:\s*(\S+)", text, re.M)
        res[n] = (ro.group(1).strip("'\"") if ro else None, text)
    return res


class CiImage(unittest.TestCase):
    def test_parser_finds_jobs(self):
        found = jobs(os.path.join(WF, "tests.yml"))
        self.assertIn("block", found)
        self.assertIn("playwright install", found["block"][1])

    def test_image_dependent_jobs_pin_ubuntu_version(self):
        bad = []
        for path in sorted(glob.glob(os.path.join(WF, "*.yml"))):
            for name, (runs_on, text) in jobs(path).items():
                # strip comments so a note mentioning "playwright" doesn't count, and the check can't be silenced by one
                code = "\n".join(l.split(" #", 1)[0] for l in text.splitlines())
                if IMAGE_DEPENDENT.search(code) and not (runs_on and PINNED.match(runs_on)):
                    bad.append(f"{os.path.basename(path)}:{name} runs-on {runs_on}")
        self.assertEqual(bad, [], "pin these jobs to an explicit image (runs-on: ubuntu-24.04); ubuntu-latest moves under you")

    def test_playwright_jobs_on_supported_image(self):
        # Playwright 1.56.x ships browsers for ubuntu 20.04/22.04/24.04 only; 26.04 needs a Playwright bump (todo 80)
        for path in sorted(glob.glob(os.path.join(WF, "*.yml"))):
            for name, (runs_on, text) in jobs(path).items():
                if "playwright install" in text:
                    self.assertIn(runs_on, ("ubuntu-22.04", "ubuntu-24.04"), f"{os.path.basename(path)}:{name}")


if __name__ == "__main__":
    unittest.main()
