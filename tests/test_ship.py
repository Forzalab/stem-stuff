"""tools/ship.sh --print-banks: which file each bank comes from ([banks-dir] > checkout banks/ > newest in the brain repo),
--no-brain, and BRAIN_TOKEN never reaching stdout/stderr (not even under bash -x). No worktree, no Vercel.
ship.sh runs from a copy in a temp root, so this checkout's banks/ and .env stay out; HOME is a temp dir and SHIP_BRAIN_SEARCH is empty, so ~/brain and /home/claude/brain do too.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import base64
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "glpat-FAKE-do-not-print-7f3a9c"
SECRETS = (TOKEN, base64.b64encode(("oauth2:" + TOKEN).encode()).decode())   # raw, and as the Basic auth header


def git(cwd, *args, when=None):
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    if when:
        env.update(GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE=when)
    subprocess.run(["git", "-C", cwd, *args], check=True, capture_output=True, env=env)


def put(base, rel, text):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        f.write(text)
    return p


class PrintBanks(unittest.TestCase):
    OLD = "projects/beta/_files/exam-bank/BANK_ZZ1.json"
    NEW = "projects/alpha/_files/quiz-bank/BANK_ZZ1.json"

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="stem-ship-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = os.path.join(self.tmp, "root")
        os.makedirs(os.path.join(self.root, "tools"))
        os.makedirs(os.path.join(self.root, "banks"))
        shutil.copy(os.path.join(ROOT, "tools", "ship.sh"), os.path.join(self.root, "tools", "ship.sh"))
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.home)
        self.brain = os.path.join(self.tmp, "brain")
        os.makedirs(self.brain)
        git(self.brain, "init", "-q")
        put(self.brain, self.OLD, '{"v": "old"}')
        put(self.brain, "projects/beta/_files/notes/BANK_NOPE.json", "{}")   # not in a *-bank dir: ignored
        git(self.brain, "add", "-A")
        git(self.brain, "commit", "-q", "-m", "old", when="2026-01-01T00:00:00Z")
        put(self.brain, self.NEW, '{"v": "new"}')
        git(self.brain, "add", "-A")
        git(self.brain, "commit", "-q", "-m", "new", when="2026-02-01T00:00:00Z")

    def ship(self, *args, bash_x=False, **env):
        e = {k: v for k, v in os.environ.items() if not k.startswith(("BRAIN_", "SHIP_", "GIT_"))}
        e.update(HOME=self.home, BRAIN_DIR=self.brain, SHIP_BRAIN_SEARCH="")
        e.update(env)
        cmd = ["bash"] + (["-x"] if bash_x else []) + [os.path.join(self.root, "tools", "ship.sh"), "--print-banks", *args]
        r = subprocess.run(cmd, capture_output=True, text=True, env=e, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def chosen(self, r):
        rows = [line.split("\t") for line in r.stdout.splitlines() if "\t" in line]
        return {name: (src, path) for name, src, path in rows}

    def test_newest_brain_path_wins(self):
        r = self.ship()
        self.assertEqual(self.chosen(r), {"BANK_ZZ1.json": ("brain", os.path.join(self.brain, self.NEW))})
        self.assertIn("banks: BANK_ZZ1(brain)", r.stdout)

    def test_newest_by_commit_not_by_path(self):
        put(self.brain, self.OLD, '{"v": "newest"}')
        git(self.brain, "commit", "-q", "-am", "touch beta", when="2026-03-01T00:00:00Z")
        self.assertEqual(self.chosen(self.ship())["BANK_ZZ1.json"], ("brain", os.path.join(self.brain, self.OLD)))

    def test_checkout_banks_beat_brain_and_banks_dir_beats_both(self):
        repo = put(self.root, "banks/BANK_ZZ1.json", "{}")
        self.assertEqual(self.chosen(self.ship())["BANK_ZZ1.json"], ("repo", repo))
        extra = os.path.join(self.tmp, "extra")
        mine = put(extra, "BANK_ZZ1.json", "{}")
        put(extra, "BANK_ZZ2.json", "{}")
        r = self.ship(extra)
        self.assertEqual(self.chosen(r), {"BANK_ZZ1.json": ("arg", mine), "BANK_ZZ2.json": ("arg", os.path.join(extra, "BANK_ZZ2.json"))})
        self.assertIn("banks: BANK_ZZ1(arg) BANK_ZZ2(arg)", r.stdout)

    def test_no_brain(self):
        self.assertEqual(self.chosen(self.ship("--no-brain")), {})
        self.assertEqual(self.chosen(self.ship(SHIP_NO_BRAIN="1")), {})

    def test_mode_arg_still_accepted(self):
        self.assertIn("BANK_ZZ1.json", self.chosen(self.ship("demo")))

    def test_token_not_printed_with_a_clone(self):
        for x in (False, True):
            r = self.ship(bash_x=x, BRAIN_TOKEN=TOKEN)
            for s in SECRETS:
                self.assertNotIn(s, r.stdout + r.stderr)

    def test_token_not_printed_when_the_clone_fails(self):
        for x in (False, True):
            r = self.ship(bash_x=x, BRAIN_DIR="", BRAIN_TOKEN=TOKEN, BRAIN_URL="file:///nonexistent/brain.git")
            for s in SECRETS:
                self.assertNotIn(s, r.stdout + r.stderr)
            self.assertIn("clone failed", r.stderr)
            self.assertEqual(self.chosen(r), {})

    def test_clone_with_token_and_env_file(self):
        put(self.root, ".env", "BRAIN_TOKEN=%s\nBRAIN_URL=file://%s\n" % (TOKEN, self.brain))
        for x in (False, True):
            r = self.ship(bash_x=x, BRAIN_DIR="")
            for s in SECRETS:
                self.assertNotIn(s, r.stdout + r.stderr)
            src, path = self.chosen(r)["BANK_ZZ1.json"]
            self.assertEqual(src, "brain")
            self.assertTrue(path.endswith("/brain/" + self.NEW), path)
            self.assertFalse(os.path.exists(path), "the temp clone outlived the script")

    def test_no_clone_no_token_skips_quietly(self):
        r = self.ship(BRAIN_DIR="")
        self.assertEqual(self.chosen(r), {})
        self.assertIn("no BRAIN_TOKEN", r.stderr)


if __name__ == "__main__":
    unittest.main()
