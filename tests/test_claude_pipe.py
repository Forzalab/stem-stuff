"""Cluck's Claude pipe (serve._cluck_stream): Claude first when CLAUDE_API is set and the budget allows, else / on any
trouble before the first word the OpenRouter chain. urllib is mocked: no network."""
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


def sse_claude(pieces, usage_in=100, usage_out=50):
    ev = [{"type": "message_start", "message": {"usage": {"input_tokens": usage_in, "output_tokens": 1}}},
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
        for k in ("CLAUDE_BUDGET_USD", "CLAUDE_RESERVE_USD", "CLAUDE_PRICE_IN", "CLAUDE_PRICE_OUT"):
            os.environ.pop(k, None)
        self.kv = mock.patch.object(serve, "KV", (None, None))
        self.kv.start()
        serve._claude_spent["usd"] = 0.0
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

    def hosts(self):
        return ["claude" if "anthropic.com" in u else "or" for u, _, _ in self.calls]

    def test_happy_stream(self):
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")
        self.assertEqual(self.hosts(), ["claude"])
        url, head, body = self.calls[0]
        self.assertTrue(url.endswith("/v1/messages"))
        self.assertEqual(head.get("X-api-key"), "sk-ant-test")
        self.assertEqual(head.get("Anthropic-version"), "2023-06-01")
        self.assertEqual((body["model"], body["max_tokens"], body["stream"]), (serve.CLAUDE_MODEL, 450, True))
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertEqual(body["system"], "BASE PROMPT" + serve.CLAUDE_DELTA)
        self.assertEqual(body["messages"], MSGS[1:])
        self.assertAlmostEqual(serve._claude_spent["usd"], (100 * 0.10 + 50 * 0.50) / 1e6)

    def test_billing_and_overload_errors_fall_back(self):
        for code, etype in ((402, "billing_error"), (400, "invalid_request_error"), (401, "authentication_error"),
                            (429, "rate_limit_error"), (529, "overloaded_error"), (500, "api_error")):
            self.calls.clear()
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
        serve._claude_spent["usd"] = 95.0                                     # 100 - 5 reserve
        self.assertEqual(self.run_it(), "OR words.")
        self.assertEqual(self.hosts(), ["or"])
        os.environ["CLAUDE_BUDGET_USD"] = "200"
        self.calls.clear()
        self.assertEqual(self.run_it(), "Hi there.\n**Push** is shared.")

    def test_budget_reads_upstash(self):
        with mock.patch.object(serve, "KV", ("https://kv", "t")), mock.patch.object(serve, "_kv", return_value="99.5") as kv:
            self.assertEqual(self.run_it(), "OR words.")
            kv.assert_called_with("GET", serve.CLAUDE_SPEND_KEY)
        self.assertEqual(self.hosts(), ["or"])

    def test_spend_written_to_upstash(self):
        with mock.patch.object(serve, "KV", ("https://kv", "t")), mock.patch.object(serve, "_kv", return_value="0") as kv:
            self.run_it()
            self.assertEqual(kv.call_args_list[-1][0][:2], ("INCRBYFLOAT", serve.CLAUDE_SPEND_KEY))

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
        self.assertAlmostEqual(serve._claude_spent["usd"], (100 * 1 + 50 * 2) / 1e6)


if __name__ == "__main__":
    unittest.main()
