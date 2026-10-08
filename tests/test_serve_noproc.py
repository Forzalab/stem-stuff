"""serve._other_servers / _guard must shrug off a missing, unreadable or half-vanished /proc. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import builtins
import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
TMP = tempfile.mkdtemp(prefix="stem-tries-")
os.environ["STEM_TRIES"] = os.path.join(TMP, "tries.json")   # never write the real tries.json
import serve  # noqa: E402


class NoProc(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="fake-proc-", dir=TMP)

    def fake(self, pid, *argv):
        os.mkdir(os.path.join(self.root, str(pid)))
        if argv:
            with open(os.path.join(self.root, str(pid), "cmdline"), "wb") as f:
                f.write(b"\0".join(a.encode() for a in argv) + b"\0")

    def quiet_guard(self, root):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            serve._guard(proc_root=root, tty=False)
        self.assertEqual(out.getvalue(), "")

    def test_missing_proc_root(self):
        missing = os.path.join(self.root, "nope")
        self.assertEqual(serve._other_servers(missing), [])
        self.quiet_guard(missing)

    def test_proc_root_is_a_file(self):
        path = os.path.join(self.root, "file")
        open(path, "w").close()
        self.assertEqual(serve._other_servers(path), [])
        self.quiet_guard(path)

    def test_unreadable_proc_root(self):
        with unittest.mock.patch("os.listdir", side_effect=PermissionError(13, "Permission denied")):
            self.assertEqual(serve._other_servers(self.root), [])
            self.quiet_guard(self.root)

    def test_pid_dir_without_cmdline_is_skipped(self):
        self.fake(5001)                                              # no cmdline file
        self.fake(5002, "python3", "serve.py", "7002")
        self.assertEqual([(p, port) for p, port, _ in serve._other_servers(self.root)], [(5002, 7002)])

    def test_pid_vanishing_mid_scan_is_skipped(self):
        self.fake(5001, "python3", "serve.py", "7001")
        self.fake(5002, "python3", "serve.py", "7002")
        real_open = builtins.open

        def flaky_open(path, *a, **kw):
            if os.path.join(self.root, "5001") in str(path):         # gone between listdir and open
                raise FileNotFoundError(2, "No such file or directory", path)
            return real_open(path, *a, **kw)

        with unittest.mock.patch("builtins.open", flaky_open):
            self.assertEqual([(p, port) for p, port, _ in serve._other_servers(self.root)], [(5002, 7002)])

    def test_pid_vanishing_at_stat_is_skipped(self):
        self.fake(5001, "python3", "serve.py", "7001")
        self.fake(5002, "python3", "serve.py", "7002")
        real_stat = os.stat

        def flaky_stat(path, *a, **kw):
            if str(path) == os.path.join(self.root, "5001"):
                raise FileNotFoundError(2, "No such file or directory", path)
            return real_stat(path, *a, **kw)

        with unittest.mock.patch("os.stat", flaky_stat):
            self.assertEqual([(p, port) for p, port, _ in serve._other_servers(self.root)], [(5002, 7002)])

    def test_pid_dir_unreadable_cmdline_is_skipped(self):
        self.fake(5001, "python3", "serve.py", "7001")
        self.fake(5002, "python3", "serve.py", "7002")
        real_open = builtins.open

        def denied_open(path, *a, **kw):
            if os.path.join(self.root, "5001") in str(path):
                raise PermissionError(13, "Permission denied", path)
            return real_open(path, *a, **kw)

        with unittest.mock.patch("builtins.open", denied_open):
            self.assertEqual([(p, port) for p, port, _ in serve._other_servers(self.root)], [(5002, 7002)])

    def test_subprocess_guard_no_traceback(self):
        code = "import sys; sys.path.insert(0, %r); sys.argv = ['serve.py']; import serve; serve._guard(proc_root='/nonexistent-proc', tty=False)" % ROOT
        env = dict(os.environ, STEM_TRIES=os.path.join(TMP, "tries-sub.json"))
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, stdin=subprocess.DEVNULL, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("Traceback", r.stderr)
        self.assertEqual(r.stdout, "")


if __name__ == "__main__":
    unittest.main()
