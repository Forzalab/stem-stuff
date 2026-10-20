"""Cluck's Claude pipe (serve._cluck_stream): Claude first when CLAUDE_API is set and the budget allows, else / on any
trouble before the first word the OpenRouter chain; a wish (edit=True) goes out as EDITOR's rewrite of the draft. urllib is mocked: no network."""
import calendar
import io
import json
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402

MSGS = [{"role": "system", "content": "BASE PROMPT"}, {"role": "user", "content": "QUESTION"}]
CACHED = {"type": "ephemeral"}
DRAFT = ["Well, the ring is odd.\n", "$$\\chi \\ge 3$$\n", "$$\\boxed{3}$$\n", "Pick b."]
REWRITE = ["The ring is odd.\n", "$$\\chi \\ge 3$$\n", "$$\\boxed{3}$$\n", "Pick b."]


def sse_claude(pieces, usage_in=100, usage_out=50, write=0, read=0):
    ev = [{"type": "message_start", "message": {"usage": {"input_tokens": usage_in, "output_tokens": 1, "cache_creation_input_tokens": write,
                                                          "cache_read_input_tokens": read}}},
          {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}]
    ev += [{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": p}} for p in pieces]
    ev += [{"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": usage_out}}, {"type": "message_stop"}]
    return b"".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n".encode() for e in ev)


def sse_or(pieces):
    return b"".join(f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}\n\n".encode() for p in pieces) + b"data: [DONE]\n\n"


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def http_error(code, etype):
    return urllib.error.HTTPError("u", code, etype, {}, io.BytesIO(json.dumps({"type": "error", "error": {"type": etype}}).encode()))


class ClaudePipe(unittest.TestCase):
    def setUp(self):
        self.calls, self.claude = [], lambda: Resp(sse_claude(["Hi there.\n", "**Push** is shared."]))
        self.env = mock.patch.dict(os.environ, {"CLAUDE_API": "sk-ant-test"})
        self.env.start()
        for k in ("CLAUDE_BUDGET_USD", "CLAUDE_RESERVE_USD", "CLAUDE_PRICE_IN", "CLAUDE_PRICE_OUT", "CLAUDE_CYCLE_DAY"):
            os.environ.pop(k, None)
        self.kv = mock.patch.object(serve, "KV", (None, None))
        self.kv.start()
        serve._claude_spent.clear()
        serve._last_err.clear()                 # a billing error in an earlier test would start the Claude cooldown
        self.url = mock.patch("urllib.request.urlopen", side_effect=self.fake)
        self.url.start()

    def tearDown(self):
        self.url.stop()
        self.kv.stop()
        self.env.stop()

    def fake(self, req, timeout=None):
        body = json.loads(req.data)
        self.calls.append((req.full_url, dict(req.header_items()), body))
        if "anthropic.com" in req.full_url:
            r = self.claude()
            if isinstance(r, Exception):
                raise r
            return r
        return Resp(sse_or(["OR words."]))

    def run_it(self):
        return "".join(serve._cluck_stream(MSGS, "sk-or", 450))

    def run_wish(self):
        return "".join(serve._cluck_stream(MSGS, "sk-or", 450, edit=True))

    def seq(self, *rs):                                                    # one Claude response per call, in order
        rs = list(rs)
        return lambda: rs.pop(0)

    def hosts(self):
        return ["claude" if "anthropic.com" in u else "or" for u, _, _ in self.calls]

    def test_happy_stream(self):
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")
        self.assertEqual(self.hosts(), ["claude"])
        url, head, body = self.calls[0]
        self.assertTrue(url.endswith("/v1/messages"))
        self.assertEqual(head.get("X-api-key"), "sk-ant-test")
        self.assertEqual(head.get("Anthropic-version"), "2023-06-01")
        want = serve.claude_params(serve.CLAUDE_MODEL, 450)
        self.assertEqual((body["model"], body["max_tokens"], body["stream"]), (serve.CLAUDE_MODEL, want["max_tokens"], True))
        self.assertEqual(body.get("thinking"), want.get("thinking"))
        self.assertEqual(body["system"], [{"type": "text", "text": "BASE PROMPT" + serve.CLAUDE_DELTA, "cache_control": CACHED}])
        self.assertEqual(body["messages"], MSGS[1:])
        pi, po = serve.claude_price(serve.CLAUDE_MODEL)
        self.assertAlmostEqual(serve.claude_spent(), (100 * pi + 50 * po) / 1e6)

    def test_billing_and_overload_errors_fall_back(self):
        for code, etype in ((402, "billing_error"), (400, "invalid_request_error"), (401, "authentication_error"),
                            (429, "rate_limit_error"), (529, "overloaded_error"), (500, "api_error")):
            self.calls.clear()
            serve._last_err.clear()                    # each error on its own: a billing / key error starts the cooldown (Cooldown below)
            self.claude = lambda c=code, e=etype: http_error(c, e)
            self.assertEqual(self.run_it(), "OR words.", etype)
            self.assertEqual(self.hosts(), ["claude", "or"])
            self.assertEqual(self.calls[1][2]["model"], serve.OPENROUTER_MODELS[0])       # same per-model params as today
            self.assertEqual(self.calls[1][2]["provider"], {"zdr": True, "data_collection": "deny"})

    def test_stream_error_event_before_words_falls_back(self):
        self.claude = lambda: Resp(b'event: error\ndata: {"type":"error","error":{"type":"overloaded_error"}}\n\n')
        self.assertEqual(self.run_it(), "OR words.")

    def test_empty_before_first_word_falls_back(self):
        self.claude = lambda: Resp(sse_claude([]))
        self.assertEqual(self.run_it(), "OR words.")
        self.assertEqual(self.hosts(), ["claude", "or"])

    def test_once_words_flow_it_stays_on_claude(self):
        data = sse_claude(["Hi.\n", "more"]).split(b"event: message_delta")[0] + b'event: error\ndata: {"type":"error","error":{"type":"api_error"}}\n\n'
        self.claude = lambda: Resp(data)
        with self.assertRaises(OSError):
            self.run_it()
        self.assertEqual(self.hosts(), ["claude"])

    def test_budget_hit_skips_claude(self):
        serve._claude_spent[serve.claude_cycle()] = 95.0                     # 100 - 5 reserve
        self.assertEqual(self.run_it(), "OR words.")
        self.assertEqual(self.hosts(), ["or"])
        os.environ["CLAUDE_BUDGET_USD"] = "200"
        self.calls.clear()
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")

    def test_budget_reads_upstash(self):
        with mock.patch.object(serve, "KV", ("https://kv", "t")), mock.patch.object(serve, "_kv", return_value="99.5") as kv:
            self.assertEqual(self.run_it(), "OR words.")
            kv.assert_called_with("GET", serve.claude_cycle())
        self.assertEqual(self.hosts(), ["or"])

    def test_spend_written_to_upstash(self):
        with mock.patch.object(serve, "KV", ("https://kv", "t")), mock.patch.object(serve, "_kv", return_value="0") as kv:
            self.run_it()
            k = serve.claude_cycle()
            self.assertEqual([c[0][:2] for c in kv.call_args_list[-2:]], [("INCRBYFLOAT", k), ("EXPIRE", k)])
            self.assertEqual(kv.call_args_list[-1][0][2], 40 * 86400)                # old cycles clean themselves up

    def test_cycle_key(self):
        day = lambda y, m, d: calendar.timegm((y, m, d, 12, 0, 0))                       # noon UTC
        self.assertEqual(serve.claude_cycle(day(2026, 10, 1)), "stem:claude_usd:2026-10")
        os.environ["CLAUDE_CYCLE_DAY"] = "15"                                  # billed on the 15th
        self.assertEqual(serve.claude_cycle(day(2026, 10, 14)), "stem:claude_usd:2026-09")
        self.assertEqual(serve.claude_cycle(day(2026, 10, 15)), "stem:claude_usd:2026-10")
        self.assertEqual(serve.claude_cycle(day(2026, 1, 3)), "stem:claude_usd:2025-12")
        os.environ["CLAUDE_CYCLE_DAY"] = "31"                                  # capped at 28: every month has one
        self.assertEqual(serve.claude_cycle(day(2026, 2, 28)), "stem:claude_usd:2026-02")

    def test_last_cycle_spend_does_not_block_this_cycle(self):
        serve._claude_spent["stem:claude_usd:1999-12"] = 1000.0                # last cycle blew the budget
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")
        self.assertEqual(self.hosts(), ["claude"])
        store = {"stem:claude_usd:1999-12": "1000"}                            # same with Upstash: only this cycle's key is read
        with mock.patch.object(serve, "KV", ("https://kv", "t")), mock.patch.object(serve, "_kv", side_effect=lambda *c: store.get(c[1])):
            self.calls.clear()
            self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")
        self.assertEqual(self.hosts(), ["claude"])

    def test_no_key_is_openrouter_only(self):
        os.environ.pop("CLAUDE_API")
        self.assertEqual(self.run_it(), "OR words.")
        self.assertEqual(self.hosts(), ["or"])
        self.assertEqual(self.calls[0][2]["messages"], MSGS)                  # base prompt, no delta

    def test_note_line_cut(self):
        self.claude = lambda: Resp(sse_claude(["NOTE: assumed=x | ", "real=y\nPOOF! ", "A wish.\n", "Done."]))
        self.assertEqual(self.run_it(), "POOF! A wish.\nDone.")
        self.claude = lambda: Resp(sse_claude(["NOTE: only a note"]))         # nothing but a NOTE = empty = OpenRouter
        self.calls.clear()
        self.assertEqual(self.run_it(), "OR words.")

    def test_thinking_per_model(self):
        self.assertEqual(serve.claude_params("claude-haiku-5-5", 250)["thinking"], {"type": "disabled"})
        self.assertEqual(serve.claude_params("claude-sonnet-5-5", 250)["thinking"], {"type": "between_tools"})
        o = serve.claude_params("claude-opus-5-5", 250)                      # can't be disabled: effort low, more room
        self.assertNotIn("thinking", o)
        self.assertEqual((o["max_tokens"], o["output_config"]), (1000, {"effort": "low"}))

    def test_price_env_override(self):
        os.environ.update(CLAUDE_PRICE_IN="1", CLAUDE_PRICE_OUT="2")
        self.run_it()
        self.assertAlmostEqual(serve.claude_spent(), (100 * 1 + 50 * 2) / 1e6)

    def test_wish_sends_only_the_rewrite(self):
        os.environ.pop("CLUCK_REWRITE", None)
        self.claude = self.seq(Resp(sse_claude(DRAFT)), Resp(sse_claude(REWRITE, 300, 80)))
        self.assertEqual(self.run_wish(), "".join(REWRITE))
        self.assertEqual(self.hosts(), ["claude", "claude"])
        draft, edit = self.calls[0][2], self.calls[1][2]
        self.assertEqual(draft["system"], [{"type": "text", "text": "BASE PROMPT" + serve.CLAUDE_DELTA, "cache_control": CACHED}])
        self.assertEqual(edit["system"], [{"type": "text", "text": serve.EDITOR, "cache_control": CACHED}])   # its own prompt, no CLAUDE_DELTA
        self.assertEqual(edit["messages"], [{"role": "user", "content": "".join(DRAFT)}])
        self.assertEqual(edit["max_tokens"], draft["max_tokens"])                 # the draft's budget
        pi, po = serve.claude_price(serve.CLAUDE_MODEL)
        self.assertAlmostEqual(serve.claude_spent(), (400 * pi + 130 * po) / 1e6)   # both calls counted

    def test_chat_is_one_call(self):
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")
        self.assertEqual(self.hosts(), ["claude"])

    def test_rewrite_that_drops_math_sends_the_draft(self):
        for lost in (REWRITE[:1] + REWRITE[2:], REWRITE[:2] + REWRITE[3:], REWRITE[:3], ["The ring is odd.\n", "$$\\chi > 2$$\n"] + REWRITE[2:]):
            self.calls.clear()
            self.claude = self.seq(Resp(sse_claude(DRAFT)), Resp(sse_claude(lost)))
            self.assertEqual(self.run_wish(), "".join(DRAFT), lost)

    def test_rewrite_error_or_empty_sends_the_draft(self):
        for bad in (http_error(529, "overloaded_error"), Resp(sse_claude([]))):
            self.calls.clear()
            self.claude = self.seq(Resp(sse_claude(DRAFT)), bad)
            self.assertEqual(self.run_wish(), "".join(DRAFT))
            self.assertEqual(self.hosts(), ["claude", "claude"])

    def test_rewrite_kill_switch(self):
        os.environ["CLUCK_REWRITE"] = "0"
        try:
            self.claude = lambda: Resp(sse_claude(DRAFT))
            self.assertEqual(self.run_wish(), "".join(DRAFT))
            self.assertEqual(self.hosts(), ["claude"])
        finally:
            os.environ.pop("CLUCK_REWRITE")

    def test_wish_draft_broken_midway_falls_back(self):                     # nothing reached the student yet: OpenRouter answers
        data = sse_claude(DRAFT).split(b"event: message_delta")[0] + b'event: error\ndata: {"type":"error","error":{"type":"api_error"}}\n\n'
        self.claude = lambda: Resp(data)
        self.assertEqual(self.run_wish(), "OR words.")
        self.assertEqual(self.hosts(), ["claude", "or"])

    def test_cache_blocks_per_bank(self):                                  # static | the bank's audience | the per-question rule
        sent = []
        for aud in ("CS majors.", "Fresno physics students."):
            self.calls.clear()
            msgs = [dict(MSGS[0], content=serve.CLUCK_GENIE + "\nAudience: " + aud)] + MSGS[1:]
            "".join(serve._cluck_stream(msgs, "sk-or", 450))
            sent.append(self.calls[0][2]["system"])
        (a1, b1), (a2, b2) = sent
        self.assertEqual(a1, a2)                                            # byte-identical across banks: one cache entry for all
        self.assertEqual(a1, {"type": "text", "text": serve.CLUCK_GENIE + serve.CLAUDE_DELTA, "cache_control": CACHED})
        self.assertEqual((b1["text"], b2["text"]), ("Audience: CS majors.", "Audience: Fresno physics students."))
        self.assertEqual(b1["cache_control"], CACHED)
        blocks = serve.claude_system(serve.CLUCK_GENIE + "\nAudience: CS majors.", "FIGURE rule for this question")
        self.assertEqual([b.get("cache_control") for b in blocks], [CACHED, CACHED, None])   # the rule varies per question: no breakpoint
        self.assertEqual(blocks[2]["text"], "FIGURE rule for this question")

    def test_chat_caches_the_question_turn(self):                          # follow-ups read system + question from the cache
        hist = MSGS + [{"role": "assistant", "content": "The wish."}, {"role": "user", "content": "why?"}]
        "".join(serve._cluck_stream(hist, "sk-or", 250))
        self.assertEqual(self.calls[0][2]["messages"], [{"role": "user", "content": [{"type": "text", "text": "QUESTION", "cache_control": CACHED}]}] + hist[2:])
        self.calls.clear()
        self.run_it()                                                       # a wish: one turn with the NOTE in it, no breakpoint
        self.assertEqual(self.calls[0][2]["messages"], MSGS[1:])

    def test_cache_spend(self):                                             # writes 1.25x, reads 0.1x the input price
        self.claude = lambda: Resp(sse_claude(["Hi.\n", "x"], usage_in=10, usage_out=50, write=2000, read=0))
        self.run_it()
        pi, po = serve.claude_price(serve.CLAUDE_MODEL)
        self.assertAlmostEqual(serve.claude_spent(), (10 * pi + 2000 * pi * 1.25 + 50 * po) / 1e6)
        serve._claude_spent.clear()
        serve._last_err.clear()                 # a billing error in an earlier test would start the Claude cooldown
        self.claude = lambda: Resp(sse_claude(["Hi.\n", "x"], usage_in=10, usage_out=50, write=0, read=2000))
        self.run_it()
        self.assertAlmostEqual(serve.claude_spent(), (10 * pi + 2000 * pi * 0.1 + 50 * po) / 1e6)

    def test_no_genie_line(self):                                          # Tony's CEQ screenshot: "POOF!" opened the wish
        for p in (serve.CLUCK_GENIE, serve.CLAUDE_DELTA, serve.EDITOR):
            self.assertNotIn("POOF", p)
        self.assertNotIn("make no claim", serve.NOTE_RULE)


if __name__ == "__main__":
    unittest.main()
