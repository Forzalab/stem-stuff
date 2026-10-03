"""tools/ship.sh --print-banks: which file each bank comes from ([banks-dir] > newest in the brain repo > checkout banks/),
--no-brain, and BRAIN_TOKEN never reaching stdout/stderr (not even under bash -x). No worktree, no Vercel.
ship.sh runs from a copy in a temp root, so this checkout's banks/ and .env stay out; HOME is a temp dir and SHIP_BRAIN_SEARCH is empty, so ~/brain and /home/claude/brain do too.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import base64
import http.server
import json
import threading
import urllib.parse
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


class Stub:
    """A fake GitLab API for the bank hatch (tools/brain_banks.py): tree in 2 pages, raw files, commits. bad = "token" | "json"."""
    OLD = "projects/beta/_files/exam-bank/BANK_ZZ1.json"
    NEW = "projects/alpha/_files/quiz-bank/BANK_ZZ1.json"
    ZZ2 = "projects/alpha/_files/quiz-bank/BANK_ZZ2.json"
    TREE = [[{"type": "blob", "path": OLD}, {"type": "blob", "path": "projects/beta/_files/notes/BANK_NOPE.json"}],
            [{"type": "blob", "path": NEW}, {"type": "blob", "path": ZZ2}, {"type": "tree", "path": "projects/alpha"}]]
    WHEN = {OLD: "2026-01-01T00:00:00.000Z", NEW: "2026-02-01T00:00:00.000Z", ZZ2: "2026-01-15T00:00:00.000Z"}

    def __init__(self, bad=None):
        self.bad, self.tokens, self.raw_paths = bad, set(), set()

    def __enter__(self):
        stub = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def send(self, code, body, headers=()):
                self.send_response(code)
                for k, v in headers:
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(body if isinstance(body, bytes) else json.dumps(body).encode())

            def do_GET(self):
                stub.tokens.add(self.headers.get("PRIVATE-TOKEN"))
                if stub.bad == "token":
                    return self.send(401, {"message": "401 Unauthorized"})
                u = urllib.parse.urlparse(self.path)
                q = dict(urllib.parse.parse_qsl(u.query))
                if u.path.endswith("/repository/tree"):
                    page = int(q.get("page", "1"))
                    return self.send(200, stub.TREE[page - 1], [("X-Next-Page", "2" if page == 1 else "")])
                if u.path.endswith("/repository/commits"):
                    return self.send(200, [{"committed_date": stub.WHEN[q["path"]]}])
                if u.path.endswith("/raw"):
                    p = urllib.parse.unquote(u.path.split("/repository/files/")[1][:-len("/raw")])
                    stub.raw_paths.add(p)
                    return self.send(200, b"not json" if stub.bad == "json" else json.dumps({"v": p, "problems": []}).encode())
                return self.send(404, {})

        self.srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d/api/v4" % self.srv.server_port
        return self

    def __exit__(self, *a):
        self.srv.shutdown()
        self.srv.server_close()


class PrintBanks(unittest.TestCase):
    OLD = "projects/beta/_files/exam-bank/BANK_ZZ1.json"
    NEW = "projects/alpha/_files/quiz-bank/BANK_ZZ1.json"

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="stem-ship-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = os.path.join(self.tmp, "root")
        os.makedirs(os.path.join(self.root, "tools"))
        os.makedirs(os.path.join(self.root, "banks"))
        for f in ("ship.sh", "brain_banks.py"):
            shutil.copy(os.path.join(ROOT, "tools", f), os.path.join(self.root, "tools", f))
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

    def ship(self, *args, bash_x=False, expect=0, **env):
        e = {k: v for k, v in os.environ.items() if not k.startswith(("BRAIN_", "SHIP_", "GIT_"))}
        e.update(HOME=self.home, BRAIN_DIR=self.brain, SHIP_BRAIN_SEARCH="")
        e.update(env)
        cmd = ["bash"] + (["-x"] if bash_x else []) + [os.path.join(self.root, "tools", "ship.sh"), "--print-banks", *args]
        r = subprocess.run(cmd, capture_output=True, text=True, env=e, timeout=60)
        self.assertEqual(r.returncode, expect, r.stderr)
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

    def test_brain_beats_checkout_banks_and_banks_dir_beats_both(self):
        put(self.root, "banks/BANK_ZZ1.json", "{}")                       # a stale local copy never wins over the brain
        self.assertEqual(self.chosen(self.ship())["BANK_ZZ1.json"][0], "brain")
        only = put(self.root, "banks/BANK_ZZ9.json", "{}")                # a bank the brain does not have still ships
        self.assertEqual(self.chosen(self.ship())["BANK_ZZ9.json"], ("repo", only))
        extra = os.path.join(self.tmp, "extra")
        mine = put(extra, "BANK_ZZ1.json", "{}")
        put(extra, "BANK_ZZ2.json", "{}")
        r = self.ship(extra)
        self.assertEqual(self.chosen(r), {"BANK_ZZ1.json": ("arg", mine), "BANK_ZZ2.json": ("arg", os.path.join(extra, "BANK_ZZ2.json")),
                                          "BANK_ZZ9.json": ("repo", only)})
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

    def test_hatch_without_a_clone(self):
        with Stub() as api:
            put(self.root, ".env", "BRAIN_TOKEN=%s\nBRAIN_API=%s\n" % (TOKEN, api.url))
            for x in (False, True):
                r = self.ship(bash_x=x, BRAIN_DIR="")
                for s in SECRETS:
                    self.assertNotIn(s, r.stdout + r.stderr)
                ch = self.chosen(r)
                self.assertEqual(sorted(ch), ["BANK_ZZ1.json", "BANK_ZZ2.json"])        # BANK_NOPE (not in a *-bank dir) skipped
                self.assertEqual(ch["BANK_ZZ1.json"][0], "brain")
                self.assertFalse(os.path.exists(ch["BANK_ZZ1.json"][1]), "the hatch's temp dir outlived the script")
            self.assertEqual(api.tokens, {TOKEN})                                     # every request carried the token
            self.assertEqual(api.raw_paths, {Stub.NEW, Stub.ZZ2})                     # only the winners were downloaded

    def test_hatch_failure_stops_the_deploy(self):
        for bad in ("token", "json"):
            with Stub(bad=bad) as api:
                r = self.ship(BRAIN_DIR="", BRAIN_TOKEN=TOKEN, BRAIN_API=api.url, expect=1)
                for s in SECRETS:
                    self.assertNotIn(s, r.stdout + r.stderr)
                self.assertIn("rejected" if bad == "token" else "not a bank", r.stderr)


    def test_no_clone_no_token_skips_quietly(self):
        r = self.ship(BRAIN_DIR="")
        self.assertEqual(self.chosen(r), {})
        self.assertIn("no BRAIN_TOKEN", r.stderr)

    def test_stale_ship_sh_stops_the_deploy(self):
        origin = os.path.join(self.tmp, "origin.git")
        subprocess.run(["git", "init", "-q", "--bare", origin], check=True)
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "add", "tools")
        git(self.root, "commit", "-q", "-m", "tools")
        git(self.root, "remote", "add", "origin", origin)
        git(self.root, "push", "-q", "origin", "main")
        with open(os.path.join(self.root, "tools", "ship.sh"), "a") as f:
            f.write("# an old copy\n")
        e = {k: v for k, v in os.environ.items() if not k.startswith(("BRAIN_", "SHIP_", "GIT_"))}
        e.update(HOME=self.home, BRAIN_DIR=self.brain, SHIP_BRAIN_SEARCH="")
        r = subprocess.run(["bash", os.path.join(self.root, "tools", "ship.sh"), "demo"], capture_output=True, text=True, env=e, timeout=60)
        self.assertEqual(r.returncode, 1, r.stderr)
        self.assertIn("pull --ff-only", r.stderr)
        self.assertNotIn("deploying", r.stdout)


if __name__ == "__main__":
    unittest.main()
