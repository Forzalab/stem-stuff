"""tools/incident.py: finds a code in a pasted log (serve.py's real line format), in Vercel's log search and in PostHog (HTTP stubbed,
no network); the server lines of the same trace only; no key ever printed. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
os.environ["STEM_TODAY"] = "2026-10-23"   # pre-sunset (serve.today)
import incident as I  # noqa: E402
import serve  # noqa: E402

TR = "4bf92f3577b34da6a3ce929d0e0e4736"
OTHER = "0" * 31 + "1"
VKEY, PKEY = "vercel-SECRETSECRET", "phx_SECRETSECRET"
FR = {"ring": [[1234, "net", "explain", "h", 504, 20100], [1300, "perf", 2, 180, 120, 52]], "kb": [[5000, "kb", "kd", "textarea#scratch", "char", 0, 3]],
      "page": {"before": {"age_ms": 800, "hash": "#CALC1_XP1"}, "at": {"hash": "#CALC1_XP1"}}, "diag": "v#197 · explain 504 · 20.1 s · AI: cap"}


def client_line(code="E-7K3QX"):
    """the line serve.py really prints for the page's report (POST /log/incident)"""
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        serve.dispatch("POST", "/log/incident", "", json.dumps({"code": code, "where": "explain", "reason": "http", "status": 504, "trace_id": TR, "fr": FR}).encode(), "UA")
    return err.getvalue().strip()


LOG = "\n".join([
    'cluck v4: claude: HTTP Error 400: Bad Request rid=iad1::abc trace=' + TR,
    '{"incident":"S-22222","src":"server","trace_id":"' + TR + '","where":"cluck","reason":"budget_cap"}',
    'health {"claude":"ok"} rid=iad1::zzz trace=' + OTHER,
])


def run(argv, env=None, get=None, paste=None):
    out = []
    code = I.main(argv, env=env or {}, get=get or (lambda *a: (_ for _ in ()).throw(AssertionError("no HTTP expected"))),
                  read=(lambda p: paste) if paste is not None else None, w=out.append)
    return code, "\n".join(out)


class Paste(unittest.TestCase):
    def test_a_pasted_log_finds_the_page_report_and_its_server_lines(self):
        code, out = run(["e-7k3qx", "--paste", "-", "--no-vercel", "--no-posthog"], paste=client_line() + "\n" + LOG)
        self.assertEqual(code, 0, out)
        self.assertIn("== client line (Vercel log) ==", out)
        self.assertIn("diag: v#197 · explain 504 · 20.1 s · AI: cap", out)
        self.assertIn('page.before: {"age_ms":800', out)
        self.assertRegex(out, r"1\.2s  net  explain  h  504  20100")
        self.assertRegex(out, r"1\.3s  perf  2  180  120  52")
        self.assertIn("cluck v4: claude: HTTP Error 400", out, "the server lines of the same trace")
        self.assertIn('{"incident":"S-22222"', out, "the server's own code for the same request")
        self.assertEqual(out.count('"incident":"E-7K3QX"'), 1, "its own line once")
        self.assertNotIn('health {"claude":"ok"}', out, "another trace's line stays out")
        self.assertNotIn('"fr"', out, "the snapshot is shown as tables, not dumped twice")

    def test_export_formats(self):
        rows = [{"message": "a"}, {"logs": [{"message": "b"}, {"message": "c"}]}]
        self.assertEqual(I.messages(json.dumps(rows)), ["a", "b", "c"])
        self.assertEqual(I.messages(json.dumps({"rows": rows})), ["a", "b", "c"])
        self.assertEqual(I.messages('{"message":"a"}\nplain line\n{"incident":"E-7K3QX"}\n'), ["a", "plain line", '{"incident":"E-7K3QX"}'])
        self.assertEqual(I.incident_lines(["2026-10-19 12:00:01 stderr " + client_line()], "E-7K3QX")[0]["src"], "client", "a prefix before the JSON")

    def test_a_dup_or_rate_limited_report_says_so(self):
        out = []
        I.render_fr({"dup": "E-AAAAA", "n": 3}, out.append)
        I.render_fr({"rate": 1}, out.append)
        self.assertEqual(out, ["  fr: a repeat of E-AAAAA (x3); its snapshot is under that code", "  fr: rate-limited (no snapshot)"])

    def test_nothing_found_and_a_bad_code(self):
        code, out = run(["E-7K3QX", "--paste", "-"], paste=LOG)
        self.assertEqual(code, 1)
        self.assertIn("no VERCEL_KEY", out)
        self.assertIn("no POSTHOG_KEY", out)
        self.assertEqual(run(["E-7K3Q0'"])[0], 2, "not a code: never reaches a query")


class Remote(unittest.TestCase):
    def test_vercel_search_then_its_trace_and_posthog(self):
        calls = []
        line = client_line()

        def get(url, token, body=None):
            calls.append((url, token, body))
            if "vercel.com" in url:
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
                self.assertEqual((q["projectId"][0], q["ownerId"][0]), (I.VERCEL_PROJECT, I.VERCEL_TEAM))
                self.assertEqual(int(q["endDate"][0]) - int(q["startDate"][0]), 6 * 3600000)
                msgs = [line] if q["search"][0] == "E-7K3QX" else LOG.splitlines() if q["search"][0] == TR else []
                return {"rows": [{"logs": [{"message": m} for m in msgs]}], "hasMoreRows": False}
            self.assertIn("properties.code = 'E-7K3QX'", body["query"]["query"])
            return {"results": [["2026-10-19T17:02:11Z", json.dumps({"code": "E-7K3QX", "trace_id": TR, "$geoip_city_name": "X", "$browser": "Chrome", "fr": {"rate": 1}})]]}

        code, out = run(["E-7K3QX", "--hours", "6"], env={"VERCEL_KEY": VKEY, "POSTHOG_KEY": PKEY}, get=get)
        self.assertEqual(code, 0, out)
        self.assertEqual([c[1] for c in calls], [VKEY, PKEY, VKEY], "code search, PostHog, then the one trace")
        self.assertIn("== page report (PostHog, 2026-10-19T17:02:11Z) ==", out)
        self.assertIn('"$browser":"Chrome"', out)
        self.assertNotIn("geoip", out)
        self.assertIn("cluck v4: claude", out)
        self.assertNotIn("SECRET", out)

    def test_a_failing_source_is_a_note_not_a_crash(self):
        def get(url, token, body=None):
            raise RuntimeError("HTTP 403")
        code, out = run(["S-22222", "--paste", "-"], env={"VERCEL_TOKEN": VKEY, "POSTHOG_KEY": PKEY}, get=get, paste=LOG)
        self.assertEqual(code, 0, out)
        self.assertIn("note: Vercel: HTTP 403", out)
        self.assertIn("note: PostHog: HTTP 403", out)
        self.assertNotIn("SECRET", out)


if __name__ == "__main__":
    unittest.main()
