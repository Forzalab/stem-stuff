"""STEM_REDIRECT: the old server (csci4x.com:5567) sends every request to the new site. Run with the other test_*.py."""
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEW = "https://stem-stuff.vercel.app"


class NoFollow(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a):
        return None


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Redirect(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        env = {**os.environ, "STEM_REDIRECT": NEW + "/", "STEM_TRIES": os.devnull}
        cls.srv = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(cls.port)], env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", cls.port), 0.1).close()
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.srv.terminate()
        cls.srv.wait()

    def get(self, path, data=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data)
        try:
            urllib.request.build_opener(NoFollow).open(req)
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Location")
        self.fail("no redirect")

    def test_every_path_goes_to_the_new_site(self):
        for path in ("/", "/index.html?x=1", "/p/PHYS_F3N.json", "/problems.json"):
            self.assertEqual(self.get(path), (302, NEW + path))

    def test_post_keeps_its_method(self):
        self.assertEqual(self.get("/check", b"{}"), (307, NEW + "/check"))


if __name__ == "__main__":
    unittest.main()
