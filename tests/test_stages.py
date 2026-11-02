"""W160a: real stage events for the wait (opt-in `stages: true` in the body). Without it every byte is today's. With it: /explain's text stream
carries one RS-prefixed JSON line per real step start/end (before and after the text), and a proof Check streams the same lines and ends on
the grader's JSON line. Run: python3 -m unittest tests.test_stages"""
import io
import json
import os
import re
import sys
import tempfile
import unittest
import unittest.mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]
TMP = tempfile.mkdtemp(prefix="stem-tries-")
os.environ.setdefault("STEM_TRIES", os.path.join(TMP, "tries.json"))
os.environ.setdefault("STEM_TODAY", "2026-10-23")
import serve  # noqa: E402

FIX = json.load(open(os.path.join(ROOT, "tests", "fixtures", "proof-bank.json")))
P = next(p for p in FIX["problems"] if p["type"] == "proof")
GOOD = "Base case: n = 1. Same.\nAssume it for k.\nThen add 3k+2. Done."
RS = "\x1e"


def events(raw):
    """(stage events [(stage, at)], the text without any event line) of a staged stream. The contract: an event is RS + one JSON object + "\\n",
    anywhere in the stream (it may follow text that has no newline); a client cuts them out with this regex."""
    ev = [(j["stage"], j["at"]) for j in (json.loads(m) for m in re.findall(RS + r"(\{[^\n]*\})\n", raw)) if "stage" in j]
    return ev, re.sub(RS + r"\{[^\n]*\}\n", "", raw).rstrip("\n")


class ExplainStages(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        def note(*a, **k):
            calls.append("note")
            return None

        def cluck(*a, **k):
            calls.append("model")
            yield "POOF! "
            yield "Your pick: sign."
        p = dict(code="X_1", type="mc")
        for name, fn in (("_wish_problem", lambda c, b: p), ("wish_pick", lambda p, b: "a"), ("cluck_begin", lambda *a: None), ("explain_allowed", lambda *a: True),
                         ("note_within", note), ("_cluck_stream", cluck), ("explain_prompt", lambda p, a: "q"), ("system_for", lambda *a: "s"),
                         ("fig_ctx", lambda *a, **k: None)):
            m = unittest.mock.patch.object(serve, name, fn)
            m.start()
            self.addCleanup(m.stop)
        e = unittest.mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "k"})
        e.start()
        self.addCleanup(e.stop)

    def ask(self, **b):
        status, head, chunks = serve.explain("sid=" + "a" * 32, json.dumps({"code": "X_1", "answer": "a", **b}).encode())
        return status, head, b"".join(chunks).decode()

    def test_without_the_flag_the_bytes_are_today_s(self):
        status, head, raw = self.ask()
        self.assertEqual((status, raw), (200, "POOF! Your pick: sign."))
        self.assertEqual(head["Content-Type"], "text/plain; charset=utf-8")
        self.assertNotIn(RS, raw)

    def test_with_the_flag_the_stages_come_in_order_around_the_real_calls(self):
        status, head, raw = self.ask(stages=True)
        ev, text = events(raw)
        self.assertEqual(status, 200)
        self.assertEqual(text, "POOF! Your pick: sign.", "the text is untouched")
        self.assertEqual(ev, [("note", "start"), ("note", "end"), ("write", "start"), ("write", "end")])
        self.assertEqual(self.calls, ["note", "model"], "one event pair per real call, same order")
        self.assertTrue(raw.startswith(RS + '{"stage": "note"'))
        self.assertTrue(all(s in serve.STAGES for s, _ in ev))

    def test_a_stage_event_goes_out_before_the_slow_call_ends(self):
        """live, not batched: the 'note start' line is readable while the NOTE is still running"""
        import threading
        gate = threading.Event()
        serve.note_within = lambda *a, **k: (gate.wait(5), None)[1]   # setUp's patch restores it
        status, head, chunks = serve.explain("sid=" + "a" * 32, json.dumps({"code": "X_1", "answer": "a", "stages": True}).encode())
        first = next(chunks).decode()
        gate.set()
        list(chunks)
        self.assertEqual(json.loads(first[1:]), {"stage": "note", "at": "start"})

    def test_a_failure_with_the_flag_is_in_band_and_ends_in_stopped(self):
        def boom(*a, **k):
            raise OSError("down")
            yield
        with unittest.mock.patch.object(serve, "_cluck_stream", boom):
            status, head, raw = self.ask(stages=True)
        ev, text = events(raw)
        self.assertEqual(status, 200)
        self.assertIn(serve.STOPPED.decode().strip(), text)
        self.assertNotIn(("write", "end"), ev, "a step that failed never reports it ended")


class ProofStages(unittest.TestCase):
    def setUp(self):
        net = unittest.mock.patch.object(serve.urllib.request, "urlopen", side_effect=AssertionError("network"))
        net.start()
        self.addCleanup(net.stop)
        e = unittest.mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "k"})
        e.start()
        self.addCleanup(e.stop)
        serve._asked.clear()
        self.cookie = "sid=" + os.urandom(16).hex()
        lk = unittest.mock.patch.object(serve, "lookup", lambda code, mode: P)
        lk.start()
        self.addCleanup(lk.stop)

    def post(self, body, reply=None):
        calls = []

        def post(payload, key, timeout):
            calls.append(payload)
            if isinstance(reply, Exception):
                raise reply
            out = {"base": "ok", "assume": "ok", "prove": "ok", "hint": ""}
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(out)}}]}).encode())
        with unittest.mock.patch.object(serve, "_or_post", post):
            raw = json.dumps(dict({"code": P["code"], "answer": GOOD}, **body)).encode()
            via = serve.check_stream(self.cookie, raw)
            if via is None:
                return serve.dispatch("POST", "/check", self.cookie, raw), calls
            status, head, chunks = via
            return (status, head, b"".join(chunks)), calls

    def test_without_the_flag_check_is_one_json_through_dispatch(self):
        (status, head, data), calls = self.post({})
        self.assertEqual((status, head["Content-Type"]), (200, "application/json"))
        self.assertEqual(json.loads(data)["verdict"], "correct")
        self.assertEqual(len(calls), 1)

    def test_with_the_flag_stages_in_order_then_the_same_json_last(self):
        (status, head, raw), calls = self.post({"stages": True})
        ev, rest = events(raw.decode())
        self.assertEqual(status, 200)
        self.assertEqual(ev, [("read", "start"), ("read", "end"), ("grade", "start"), ("grade", "end"), ("record", "start"), ("record", "end")])
        self.assertEqual(len(calls), 1, "one grade event pair per real model call")
        self.assertEqual(json.loads(rest)["verdict"], "correct", "the last line is the JSON today's app.js parses")

    def test_a_timeout_with_the_flag_ends_busy_and_records_no_try_and_no_record_stage(self):
        (status, head, raw), calls = self.post({"stages": True}, reply=TimeoutError("slow"))
        ev, rest = events(raw.decode())
        j = json.loads(rest)
        self.assertEqual((j["verdict"], j["triesLeft"]), ("busy", 3))
        self.assertIn(("grade", "start"), ev)
        self.assertNotIn(("record", "start"), ev)
        self.assertNotIn(("grade", "end"), ev)

    def test_a_second_model_is_a_second_real_grade_pair(self):
        n = []

        def flaky(payload, key, timeout):
            n.append(1)
            if len(n) == 1:
                raise TimeoutError("x")
            out = {"base": "ok", "assume": "ok", "prove": "ok", "hint": ""}
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(out)}}]}).encode())
        with unittest.mock.patch.object(serve, "_or_post", flaky), unittest.mock.patch.object(serve, "OPENROUTER_PROOF_MODELS", ["m/a", "m/b"]):
            status, head, chunks = serve.check_stream(self.cookie, json.dumps({"code": P["code"], "answer": GOOD, "stages": True}).encode())
            ev, _ = events(b"".join(chunks).decode())
        self.assertEqual(ev.count(("grade", "start")), 2)


if __name__ == "__main__":
    unittest.main()
