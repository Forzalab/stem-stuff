"""tools/version.sh: the version is the newest merged PR on the first-parent history ("#N", "+k" for commits after it), --stamp
writes version.json, and the live check says "latest" or "behind" against a fake site (STEM_URL). No network, no Vercel.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import http.server
import json
import os
import subprocess
import tempfile
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH = os.path.join(ROOT, "tools", "version.sh")
ENV = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")


def git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, *args], check=True, capture_output=True, text=True, env=ENV).stdout.strip()


def run(*args, cwd=None, env=None):
    return subprocess.run(["bash", SH, *args], capture_output=True, text=True, env=dict(ENV, **(env or {})), cwd=cwd)


class Repo(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="stem-ver-")
        git(self.d, "init", "-q", "-b", "main")
        git(self.d, "commit", "-q", "--allow-empty", "-m", "start")

    def commit(self, msg):
        git(self.d, "commit", "-q", "--allow-empty", "-m", msg)

    def merge(self, n):
        git(self.d, "checkout", "-q", "-b", f"b{n}")
        self.commit(f"work for {n}")
        git(self.d, "checkout", "-q", "main")
        git(self.d, "merge", "-q", "--no-ff", f"b{n}", "-m", f"Merge pull request #{n} from Forzalab/b{n}")

    def pr(self):
        r = run("--stamp", self.d)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(os.path.join(self.d, "version.json")) as f:
            v = json.load(f)
        self.assertEqual(v["sha"], git(self.d, "rev-parse", "--short", "HEAD"))
        self.assertRegex(v["built"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        return v["pr"]

    def test_merge_commit(self):
        self.merge(81)
        self.merge(82)
        self.assertEqual(self.pr(), "#82")

    def test_branch_commits_do_not_count(self):   # "(#7)" inside a merged branch is not on the first-parent line
        git(self.d, "checkout", "-q", "-b", "x")
        self.commit("cherry (#7)")
        git(self.d, "checkout", "-q", "main")
        git(self.d, "merge", "-q", "--no-ff", "x", "-m", "Merge pull request #9 from Forzalab/x")
        self.assertEqual(self.pr(), "#9")

    def test_squash_and_commits_after(self):
        self.merge(5)
        self.commit("Fix the thing (#6)")
        self.commit("hotfix on main")
        self.commit("another")
        self.assertEqual(self.pr(), "#6+2")

    def test_no_pr_yet(self):
        self.assertEqual(self.pr(), "?")


class Live(unittest.TestCase):
    """the no-arg check against a fake site (STEM_URL)"""
    def serve(self, body):
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                self.send_response(200 if body else 404)
                self.end_headers()
                self.wfile.write(body.encode())
        s = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=s.serve_forever, daemon=True).start()
        self.addCleanup(s.shutdown)
        return f"http://127.0.0.1:{s.server_port}"

    def setUp(self):   # a clone of a bare origin with 2 commits on main; the script runs from the clone (CI has no origin/main)
        t = tempfile.mkdtemp(prefix="stem-ver-live-")
        src, bare, self.clone = (os.path.join(t, x) for x in ("src", "origin.git", "clone"))
        os.makedirs(src)
        git(src, "init", "-q", "-b", "main")
        for m in ("one (#1)", "two (#2)"):
            git(src, "commit", "-q", "--allow-empty", "-m", m)
        subprocess.run(["git", "clone", "-q", "--bare", src, bare], check=True)
        subprocess.run(["git", "clone", "-q", bare, self.clone], check=True)
        os.makedirs(os.path.join(self.clone, "tools"))
        with open(SH) as a, open(os.path.join(self.clone, "tools", "version.sh"), "w") as b:
            b.write(a.read())

    def live(self, body):
        return subprocess.run(["bash", os.path.join(self.clone, "tools", "version.sh")], capture_output=True, text=True,
                              env=dict(ENV, STEM_URL=self.serve(body)))

    def test_latest_behind_down(self):
        main = git(self.clone, "rev-parse", "--short", "origin/main")
        old = git(self.clone, "rev-parse", "--short", "origin/main~1")
        r = self.live(json.dumps({"pr": "#2", "sha": main, "built": "2026-10-06T17:00:00Z"}))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("live = latest", r.stdout)
        r = self.live(json.dumps({"pr": "#1", "sha": old, "built": "x"}))
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("live is behind main (#1 -> #2)", r.stdout)
        r = self.live("")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
