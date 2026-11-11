"""Cram day (TEMPORARY, Tony Nov 6): banks/cram/intel.json -> a per-item Cluck system block for BANK_P3X, server side only, until CRAM_UNTIL."""
import datetime
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
os.environ.setdefault("STEM_TODAY", "2026-11-04")   # v:1 fixture banks load (the runners pin it too)
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402

PT = serve.PT
IN = datetime.datetime(2026, 11, 6, 8, 0, tzinfo=PT)
LAST_MIN = datetime.datetime(2026, 11, 9, 23, 58, tzinfo=PT)
AFTER = datetime.datetime(2026, 11, 10, 0, 1, tzinfo=PT)
INTEL = ["PHYS_MC4", "PHYS_AWJ", "PHYS_FL3", "PHYS_ERW", "PHYS_2EP", "PHYS_CHB", "PHYS_NU4", "PHYS_6J5", "PHYS_JZJ"]


def item(code):
    return {"code": code, "title": "t " + code, "type": "mc", "body": [{"type": "text", "md": "Find the thing."}], "correct": "a", "wrong": [],
            "choices": [{"id": "a", "md": "1"}, {"id": "b", "md": "2"}], "saccharine": {"key": "k"}}


class Cram(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        for name, codes in (("BANK_P3X", INTEL + ["PHYS_ZZ9", "CALC1_ZZ9"]), ("BANK_ZZZ", ["PHYS_MC4"])):
            with open(os.path.join(self.d, name + ".json"), "w") as f:
                json.dump({"v": 1, "problems": [item(c) for c in codes]}, f)
        self.ps = [mock.patch.object(serve, "BANKS", self.d)]
        for p in self.ps:
            p.start()
        os.environ.pop("CRAM_INTEL", None)
        with open(os.path.join(ROOT, "client", "calc", "cram.json")) as f:   # the cram window is over (flag off in the repo): test a forced-on copy, like cram-off.pw.mjs
            on = dict(json.load(f), enabled=True)
        self.cram = os.path.join(self.d, "cram.json")
        with open(self.cram, "w") as f:
            json.dump(on, f)
        self.env = mock.patch.dict(os.environ, {"STEM_CRAM": self.cram})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        for p in self.ps:
            p.stop()

    def test_expiry_instant(self):
        self.assertEqual(serve.CRAM_UNTIL, datetime.datetime(2026, 11, 9, 23, 59, tzinfo=PT))
        self.assertTrue(serve.cram_on(IN))
        self.assertTrue(serve.cram_on(LAST_MIN))
        self.assertFalse(serve.cram_on(AFTER))

    def test_every_intel_item_has_a_note_inside_the_window(self):
        for c in INTEL:
            n = serve.cram_note(c, IN)
            self.assertIn("CRAM DAY GUIDE", n, c)
            self.assertIn("OVERVIEW REPLY", n, c)
            self.assertIn("EXACTLY ONE stage", n, c)
            self.assertIn("SCENE:", n, c)
            self.assertIn("STAGES", n, c)
            self.assertIn("TRAPS:", n, c)

    def test_ignored_after_expiry_and_when_off(self):
        for c in INTEL:
            self.assertEqual(serve.cram_note(c, AFTER), "", c)
        with mock.patch.dict(os.environ, {"CRAM_INTEL": "0"}):
            self.assertEqual(serve.cram_note("PHYS_MC4", IN), "")

    def test_scoped_to_the_bank(self):
        self.assertEqual(serve.cram_note("PHYS_MC4", IN) != "", True)
        self.assertEqual(serve.bank_of("PHYS_MC4"), "BANK_P3X")   # first bank A-Z wins; the other bank's copy is the same problem
        self.assertEqual(serve.cram_note("CALC1_ZZ9", IN), "", "a non-PHYS item of the bank without an entry gets nothing")
        self.assertEqual(serve.cram_note("NOPE_1", IN), "")
        self.assertEqual(serve.cram_note(None, IN), "")

    def test_generic_addon_for_other_phys_items_of_the_bank(self):
        n = serve.cram_note("PHYS_ZZ9", IN)
        self.assertIn("OVERVIEW REPLY", n)
        self.assertIn("EXACTLY ONE stage", n)
        self.assertNotIn("SCENE:", n)

    def test_answer_guard_text_and_leak_guard_untouched(self):
        n = serve.cram_note("PHYS_AWJ", IN)
        self.assertIn("never give the final number or letter", n)
        self.assertIn("REVEAL: no", n)
        self.assertNotIn("the key says", n.lower())
        # the guard itself is the old one: a REVEAL-no reply that says an answer number is still cut
        facts = serve.leak_facts({"code": "X", "type": "mc", "correct": "a", "choices": [{"id": "a", "md": "42"}, {"id": "b", "md": "7"}], "body": [], "saccharine": {"key": "The answer is 42 J."}})
        self.assertTrue(facts)

    def test_no_numeric_keys_or_exam_stems_in_the_data(self):
        d = serve.cram_data()
        blob = json.dumps(d)
        for it in d["items"].values():
            for k in ("scene", "plan", "stages", "formulas", "traps"):
                self.assertIn(k, it)
        # generic constants only: no 4+ digit numbers; no decimals outside a Geometry's drawing coordinates
        self.assertFalse(re.search(r"\b\d{4,}\b", re.sub(r"2026", "", blob)), "a long number would be an exam key")
        prose = json.dumps({k: v for k, v in d["items"].items()}).replace(json.dumps(d["diagrams"]), "")   # decimals live only in the diagrams (drawing coordinates)
        self.assertFalse(re.search(r"\d\.\d", prose), re.search(r".{30}\d\.\d.{10}", prose))
        for lit in ("168", "98.6", "80.6", "620.6", "40 rpm", "20 rpm", "5.0 s", "2.55", "1800", "860", "0.850"):
            self.assertNotIn(lit, blob, "an exam given must not be in the repo: " + lit)

    def test_diagram_groups_are_wired_and_pass_the_production_gate(self):
        from cluck_reply_checks import views_gate
        from cluck_reply_checks import livefig
        d = serve.cram_data()
        used = {g for it in d["items"].values() for g in it.get("diagrams", [])}
        self.assertEqual(used, set(d["diagrams"]))
        ctx = livefig.Ctx("PHYS_X", set(range(0, 1001)), [])
        n = 0
        for g, text in d["diagrams"].items():
            fences = re.findall(r"```openui\n(.*?)```", text, re.S)
            self.assertGreaterEqual(len(fences), 3, g)
            self.assertIn("STAGE 0", text)
            for f in fences:
                prog, log = views_gate.gate(f.strip(), ctx)
                self.assertIsNotNone(prog, (g, log))
                n += 1
        self.assertGreater(n, 20)

    def test_reveal_turn_is_later_on_cram_items_only_and_never_sooner(self):
        p = serve.problems()["PHYS_MC4"]
        other = serve.problems()["CALC1_ZZ9"]
        with mock.patch.object(serve, "v4_on", return_value=True):
            got = {}
            for name, prob, now in (("cram", p, IN), ("plain", other, IN)):
                with mock.patch.object(serve, "cram_on", return_value=True):
                    sid = "sid-" + name
                    got[name] = [serve.cluck_begin(prob, sid, "b")[1] for _ in range(8)]
            with mock.patch.object(serve, "cram_on", return_value=False):
                got["expired"] = [serve.cluck_begin(p, "sid-expired", "b")[1] for _ in range(4)]
        self.assertEqual(got["cram"], [False] * 6 + [True] * 2, "a cram item opens at turn 7")
        self.assertEqual(got["plain"][:4], [False, False, True, True], "any other item still opens at turn 3")
        self.assertEqual(got["expired"][:4], [False, False, True, True], "after the window the old rule is back")

    def test_match_rule_gives_a_new_spring_and_ramp_item_the_roll_text(self):
        newp = item("PHYS_NEW1")
        newp["body"] = [{"type": "text", "md": "A ball is released on an incline above a spring that lies along the ramp. Find the compression."}]
        with open(os.path.join(self.d, "BANK_P3X.json")) as f:
            b = json.load(f)
        b["problems"].append(newp)
        with open(os.path.join(self.d, "BANK_P3X.json"), "w") as f:
            json.dump(b, f)
        n = serve.cram_note("PHYS_NEW1", IN)
        self.assertIn("SCENE A", n)
        self.assertIn("STAGE 0", n)

    def test_in_the_claude_system_blocks_and_not_the_old_ones(self):
        v4 = dict(code="PHYS_MC4", bank="B", fig=None, turns=[], arm="claude")
        with mock.patch.object(serve, "cram_on", return_value=True):
            sysb = serve._v4_claude_system(v4)
        self.assertIn("CRAM DAY GUIDE", sysb[-2]["text"])
        self.assertIn("One reply holds all the steps", sysb[-1]["text"], "the permanent style card (v7) is last")
        self.assertNotIn("cache_control", sysb[-2], "the guide is an uncached tail block")
        self.assertNotIn("CRAM DAY", sysb[0]["text"])
        with mock.patch.object(serve, "cram_on", return_value=False):
            off = serve._v4_claude_system(v4)
            self.assertEqual(len(off), 3, "letter, bank line, style card: no cram block")
            self.assertNotIn("CRAM DAY", "".join(b["text"] for b in off))
            self.assertIn("One reply holds all the steps", off[-1]["text"], "the style card is permanent, cram or not")

    def test_never_in_a_client_payload(self):
        self.assertTrue(serve.BLOCK_PREFIX and "/banks/" in serve.BLOCK_PREFIX)
        sys.path.insert(0, paths.tool("build_and_ship"))
        import build_public
        out = tempfile.mkdtemp()
        build_public.build(os.path.join(out, "public"))
        for d, _, fs in os.walk(os.path.join(out, "public")):
            for f in fs:
                if f.endswith((".json", ".js", ".html", ".css", ".txt", ".md")):
                    with open(os.path.join(d, f), encoding="utf-8", errors="ignore") as fh:
                        t = fh.read()
                    self.assertNotIn("CRAM DAY GUIDE", t, f)
                    self.assertNotIn("TRAPS:", t, f)
        self.assertFalse(os.path.exists(os.path.join(out, "public", "banks", "cram")))
        res = serve.dispatch("GET", "/b/BANK_P3X.json", "")
        self.assertNotIn("CRAM DAY", json.dumps(res, default=str))
        self.assertNotIn("sin(theta)", json.dumps(res, default=str))


class ClientWindow(unittest.TestCase):
    """peek.js carries the same instant and the same bank for the idle peek and the toast"""
    src = open(os.path.join(ROOT, "client", "cluck", "jev_nudges", "peek.js"), encoding="utf-8").read()

    def test_same_instant_and_bank(self):
        m = re.search(r'CRAM_UNTIL = Date\.parse\("([^"]+)"\)', self.src)
        self.assertTrue(m)
        t = datetime.datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
        self.assertEqual(t, serve.CRAM_UNTIL.astimezone(datetime.timezone.utc))
        self.assertIn('CRAM_BANK = "%s"' % serve.CRAM_BANK, self.src)

    def test_trigger_is_gated_by_the_window_and_the_bank(self):
        self.assertIn("window.stemBank.code === CRAM_BANK", self.src)
        self.assertIn("(now == null ? Date.now() : now) <= CRAM_UNTIL", self.src)
        self.assertIn("return cramOn() ? CRAM_IDLE : IDLE;", self.src)
        self.assertIn("var IDLE = [180000, 600000]", self.src, "the normal timings stay")

    def test_toast_once_a_day_dismissable_and_windowed(self):
        self.assertIn("stem-cram-toast", self.src)
        self.assertIn("cramSeen()", self.src)
        self.assertIn("window.stemToast.show", self.src)   # the existing toast primitive (has its own close button)
        self.assertIn("QUACK", self.src)


if __name__ == "__main__":
    unittest.main()
