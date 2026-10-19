"""tools/anthropic_spend.py: cost-report summing, pagination, failure path, no secrets in output (HTTP stubbed, no network)."""
import contextlib
import datetime as dt
import io
import json
import os
import sys
import unittest
import urllib.error
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import anthropic_spend as s  # noqa: E402

ADMIN = "sk-ant-admin01-SECRETSECRETSECRET"
KVTOK = "kv-token-SECRETSECRET"
KVURL = "https://kv.example.upstash.io"
ENV = {"ANTHROPIC_ADMIN_KEY": ADMIN, "KV_REST_API_URL": KVURL, "KV_REST_API_TOKEN": KVTOK, "SPEND_SINCE": "2026-09-20"}
NOW = dt.datetime(2026, 10, 19, 18, 45, 0, tzinfo=dt.timezone.utc)


def bucket(day, *amounts):
    end = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat()
    return {"starting_at": day + "T00:00:00Z", "ending_at": end + "T00:00:00Z",
            "results": [{"amount": a, "currency": "USD"} for a in amounts]}


class Stub:
    """Stands in for s._http: cost pages in order, a fake KV store, and a log of every call."""
    def __init__(self, pages=(), api_error=None, kv=None):
        self.pages, self.api_error, self.calls = list(pages), api_error, []
        self.kv = dict(kv or {})

    def __call__(self, method, url, headers, body=None, timeout=None):
        self.calls.append((method, url, headers, body))
        if url.startswith(s.API):
            if self.api_error:
                raise self.api_error
            return 200, self.pages.pop(0)
        cmd = json.loads(body)
        if cmd[0] == "SET":
            self.kv[cmd[1]] = cmd[2]
        elif cmd[0] == "DEL":
            self.kv.pop(cmd[1], None)
        return 200, {"result": "OK"}

    def api_params(self):
        return [urllib.parse.parse_qs(urllib.parse.urlsplit(u).query) for m, u, h, b in self.calls if u.startswith(s.API)]


def http_error(code, etype):
    body = io.BytesIO(json.dumps({"type": "error", "error": {"type": etype, "message": "key " + ADMIN}}).encode())
    return urllib.error.HTTPError(s.API, code, "err", {}, body)


class Base(unittest.TestCase):
    def setUp(self):
        self._real = s._http

    def tearDown(self):
        s._http = self._real

    def run_main(self, stub, argv=(), env=ENV):
        s._http = stub
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = s.main(list(argv), env=dict(env), now=NOW)
        return code, out.getvalue(), err.getvalue()


class Summing(Base):
    def test_month_and_since(self):
        buckets = [bucket("2026-09-19", "999"),                    # before since: not counted anywhere
                   bucket("2026-09-20", "100.4", "0.2"),          # since only
                   bucket("2026-09-30"),                          # empty bucket
                   bucket("2026-10-01", "250.25"),                # since + month
                   bucket("2026-10-19", "49.5", "0.1")]
        cm, cs = s.sum_cents(buckets, dt.date(2026, 10, 1), dt.date(2026, 9, 20))
        self.assertEqual(cm, 300)                                  # 250.25 + 49.6 = 299.85 -> 300
        self.assertEqual(cs, 400)                                  # 100.6 + 299.85 = 400.45 -> 400

    def test_non_usd_is_an_error(self):
        b = bucket("2026-10-01", "1")
        b["results"][0]["currency"] = "EUR"
        with self.assertRaises(s.SpendError):
            s.sum_cents([b], dt.date(2026, 10, 1), dt.date(2026, 10, 1))

    def test_request_shape(self):
        stub = Stub([{"data": [bucket("2026-10-19", "12")], "has_more": False, "next_page": None}])
        code, out, _ = self.run_main(stub, ["--dry-run"])
        self.assertEqual(code, 0)
        m, url, h, _ = stub.calls[0]
        self.assertEqual((m, h["x-api-key"], h["anthropic-version"]), ("GET", ADMIN, "2023-06-01"))
        p = stub.api_params()[0]
        self.assertEqual(p["starting_at"], ["2026-09-20T00:00:00Z"])   # min(since, month start)
        self.assertEqual(p["ending_at"], ["2026-10-20T00:00:00Z"])     # includes today's bucket
        self.assertEqual((p["bucket_width"], p["limit"]), (["1d"], ["31"]))
        self.assertEqual(json.loads(out), {"cents_month": 12, "cents_since": 12, "since": "2026-09-20",
                                           "at": "2026-10-19T18:45:00Z", "ok": True})

    def test_since_defaults_to_month_start(self):
        stub = Stub([{"data": [], "has_more": False, "next_page": None}])
        env = dict(ENV)
        del env["SPEND_SINCE"]
        code, out, _ = self.run_main(stub, ["--dry-run"], env)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["since"], "2026-10-01")
        self.assertEqual(stub.api_params()[0]["starting_at"], ["2026-10-01T00:00:00Z"])


class Pagination(Base):
    def test_follows_next_page(self):
        stub = Stub([{"data": [bucket("2026-09-20", "100")], "has_more": True, "next_page": "page_A"},
                     {"data": [bucket("2026-10-02", "50")], "has_more": True, "next_page": "page_B"},
                     {"data": [bucket("2026-10-03", "25")], "has_more": False, "next_page": None}])
        code, out, _ = self.run_main(stub, ["--dry-run"])
        self.assertEqual(code, 0)
        pages = [p.get("page") for p in stub.api_params()]
        self.assertEqual(pages, [None, ["page_A"], ["page_B"]])
        v = json.loads(out)
        self.assertEqual((v["cents_month"], v["cents_since"]), (75, 175))

    def test_has_more_without_cursor_fails(self):
        stub = Stub([{"data": [], "has_more": True, "next_page": None}])
        code, _, err = self.run_main(stub, ["--dry-run"])
        self.assertEqual(code, 1)
        self.assertIn("api_bad_page", err)


class WriteAndFailure(Base):
    def test_success_writes_key_and_clears_err(self):
        stub = Stub([{"data": [bucket("2026-10-05", "321")], "has_more": False}],
                    kv={s.ERR_KEY: '{"ok":false}'})
        code, _, _ = self.run_main(stub)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stub.kv[s.KEY])["cents_month"], 321)
        self.assertNotIn(s.ERR_KEY, stub.kv)
        kv_calls = [c for c in stub.calls if c[1] == KVURL]
        self.assertEqual(kv_calls[0][2]["Authorization"], "Bearer " + KVTOK)

    def test_failure_keeps_last_good_value(self):
        good = json.dumps({"cents_month": 5, "cents_since": 9, "since": "2026-09-20", "at": "x", "ok": True})
        stub = Stub(api_error=http_error(401, "authentication_error"), kv={s.KEY: good})
        code, _, _ = self.run_main(stub)
        self.assertEqual(code, 1)
        self.assertEqual(stub.kv[s.KEY], good)                       # untouched
        e = json.loads(stub.kv[s.ERR_KEY])
        self.assertEqual(e, {"ok": False, "err": "api_http_401:authentication_error", "at": "2026-10-19T18:45:00Z"})

    def test_network_error(self):
        stub = Stub(api_error=urllib.error.URLError("timed out"))
        code, _, _ = self.run_main(stub)
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(stub.kv[s.ERR_KEY])["err"], "api_net:URLError")
        self.assertNotIn(s.KEY, stub.kv)

    def test_bad_config(self):
        self.assertEqual(self.run_main(Stub(), ["--dry-run"], {**ENV, "SPEND_SINCE": "19/10/2026"})[0], 2)
        self.assertEqual(self.run_main(Stub(), [], {**ENV, "KV_REST_API_URL": ""})[0], 2)
        self.assertEqual(self.run_main(Stub(), ["--dry-run"], {**ENV, "ANTHROPIC_ADMIN_KEY": ""})[0], 2)


class NoSecrets(Base):
    def test_no_secret_in_output_or_kv(self):
        runs = [Stub([{"data": [bucket("2026-10-05", "1")], "has_more": False}]),
                Stub(api_error=http_error(403, "permission_error")),
                Stub(api_error=urllib.error.URLError("x"))]
        for stub in runs:
            for argv in ([], ["--dry-run"]):
                if stub.pages == [] and not stub.api_error:
                    stub.pages = [{"data": [bucket("2026-10-05", "1")], "has_more": False}]
                code, out, err = self.run_main(stub, argv)
                blob = out + err + json.dumps(stub.kv)
                for secret in (ADMIN, KVTOK, "SECRET"):
                    self.assertNotIn(secret, blob, (argv, code))


if __name__ == "__main__":
    unittest.main()
