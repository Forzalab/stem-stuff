"""Tony 19:41 PST Nov 3 "route ALL to claude": the Cluck arm, the NOTE and /chat's on-topic gate (the same call) go to Anthropic by default;
OpenRouter only when Claude itself fails; env flips them back. urllib is mocked: no network."""
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402

NOTE = {"on_topic": True, "field": "mechanics", "concept": "c", "asked": "a", "need": "n", "assumed": "s", "real": "r", "reproduces": True,
        "gap": serve.GAPS[0], "evidence": "e", "confidence": "low"}


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Route(unittest.TestCase):
    def setUp(self):
        self.urls, self.bodies, self.timeouts = [], [], []
        self.claude_fails = False
        env = {"CLAUDE_API": "sk-ant-test", "OPENROUTER_API_KEY": "sk-or-test"}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "KV", (None, None)), mock.patch.object(serve.urllib.request, "urlopen", self.fake)]
        for k in ("CLUCK_ARM", "CLUCK_NOTE_PROVIDER"):
            self.ps.append(mock.patch.dict(os.environ, {}, clear=False))
            os.environ.pop(k, None)
        for p in self.ps:
            p.start()
        serve._notes.clear() if hasattr(serve, "_notes") else None
        self.p = {"code": "PHYS_RT1", "title": "t", "type": "mc", "body": [{"type": "text", "md": "A block slides. Find v."}], "correct": "b",
                  "choices": [{"id": "a", "md": "1"}, {"id": "b", "md": "2"}], "wrong": [], "saccharine": {"key": "Tick: b"}}

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()

    def fake(self, req, timeout=None):
        self.timeouts.append(timeout)
        self.urls.append(req.full_url)
        self.bodies.append(json.loads(req.data))
        if "anthropic.com" in req.full_url:
            if self.claude_fails:
                raise urllib.error.HTTPError(req.full_url, 529, "overloaded", {}, io.BytesIO(b'{"type":"error","error":{"type":"overloaded_error"}}'))
            return Resp(json.dumps({"content": [{"type": "text", "text": json.dumps(NOTE)}], "usage": {"input_tokens": 100, "output_tokens": 40},
                                    "stop_reason": "end_turn"}).encode())
        return Resp(json.dumps({"choices": [{"message": {"content": json.dumps(NOTE)}}]}).encode())

    def test_arm_defaults_to_claude(self):
        self.assertEqual({serve.cluck_arm(s) for s in ("a", "b", "c", "d", "e", "f")}, {"claude"})
        with mock.patch.dict(os.environ, {"CLUCK_ARM": "split"}):
            self.assertEqual({serve.cluck_arm(s) for s in map(str, range(40))}, {"claude", "deepseek"})   # env still flips it back

    def test_note_and_gate_go_to_anthropic_haiku(self):
        for text in (None, "why divide?"):                                     # None = the /explain NOTE; text = /chat's gate
            self.urls.clear(); self.bodies.clear()
            n = serve.note(self.p, "a", text, "sk-or-test")
            self.assertEqual(n["gap"], NOTE["gap"])
            self.assertEqual(len(self.urls), 1, self.urls)
            self.assertIn("anthropic.com", self.urls[0])
            self.assertEqual(self.bodies[0]["model"], "claude-haiku-5-5")
            self.assertEqual(self.bodies[0]["output_config"]["format"]["type"], "json_schema")

    def test_openrouter_only_when_claude_fails(self):
        self.claude_fails = True
        n = serve.note(self.p, "a", None, "sk-or-test")
        self.assertIsNotNone(n)
        self.assertIn("anthropic.com", self.urls[0])
        self.assertIn("openrouter", self.urls[1])

    def test_env_puts_the_note_back_on_openrouter(self):
        with mock.patch.dict(os.environ, {"CLUCK_NOTE_PROVIDER": "openrouter"}):
            serve.note(self.p, "a", None, "sk-or-test")
        self.assertTrue(all("openrouter" in u for u in self.urls), self.urls)

    def test_claude_note_windows_cover_haiku(self):                          # Haiku structured output: p50 2.49 s, max 2.92 s (n=5, Nov 3)
        self.assertGreaterEqual(serve.NOTE_EXPLAIN_S_CLAUDE, 3.5)
        self.assertGreater(serve.NOTE_TIMEOUT_CLAUDE, serve.NOTE_EXPLAIN_S_CLAUDE)
        self.note_timeout = None
        serve.note(self.p, "a", "why?", "sk-or-test")
        self.assertEqual(self.timeouts[0], serve.NOTE_TIMEOUT_CLAUDE)               # the gate's Claude call waits the long window

    def test_no_claude_key_no_claude_call(self):
        with mock.patch.dict(os.environ, {"CLAUDE_API": ""}):
            serve.note(self.p, "a", None, "sk-or-test")
        self.assertTrue(all("openrouter" in u for u in self.urls), self.urls)


if __name__ == "__main__":
    unittest.main()
