"""W132 (todo 132, Tony Oct 29: "every answer shall show the units"): serve.public() lets an answer's `unit` through to the page
(a num item, a num part of a multi), never `twist` (W133) and never the key. The 40 unit items are BANK_P3X's (brain phys2a-exam3-bank,
copied to tests/fixtures/units-p3x.json; twin links dropped). answer_of() stays the value only: the copy button copies it."""
import json
import os
import unittest

import serve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "tests", "fixtures", "units-p3x.json"), encoding="utf-8") as f:
    P3X = json.load(f)["problems"]
with open(os.path.join(ROOT, "problems.json"), encoding="utf-8") as f:
    REPO = json.load(f)["problems"]
with open(os.path.join(ROOT, "tests", "fixtures", "unit-twist.json"), encoding="utf-8") as f:
    UT = json.load(f)["problems"]                                   # W132a's fixture: the num parts with units (BANK_P3X has no multi)


class PublicUnit(unittest.TestCase):
    def test_fixture_has_40_unit_items(self):
        self.assertEqual(len(P3X), 40)

    def test_num_item_unit_reaches_the_page(self):
        n = 0
        for p in P3X:
            if p["type"] == "num" and "unit" in p:
                n += 1
                self.assertEqual(serve.public(p, "s1").get("unit"), p["unit"], p["code"])
        self.assertGreater(n, 20)

    def test_num_part_unit_reaches_the_page(self):
        n = 0
        for p in P3X + UT:
            if p["type"] != "multi":
                continue
            pub = serve.public(p, "s1")["parts"]
            for q, pq in zip(p["parts"], pub):
                if q["type"] == "num" and "unit" in q:
                    n += 1
                    self.assertEqual(pq.get("unit"), q["unit"], p["code"])
        self.assertEqual(n, 2)

    def test_no_twist_no_key(self):
        self.assertTrue(any("twist" in p for p in P3X))
        for p in P3X + UT:
            pub = json.dumps(serve.public(p, "s1"))
            for k in ("twist", "answer", "accept", "tol", "wrong", "nudge", "form"):
                self.assertNotIn(f'"{k}"', pub, p["code"])

    def test_unitless_and_absent(self):
        p = {"code": "X_U1", "type": "num", "body": [], "answer": "3", "unit": ""}
        self.assertEqual(serve.public(p)["unit"], "")
        self.assertNotIn("unit", serve.public({k: v for k, v in p.items() if k != "unit"}))

    def test_unit_only_on_num(self):                     # an mc / expr item never carries one (the schema refuses it; public too)
        mc = {"code": "X_U2", "type": "mc", "body": [], "choices": [{"id": "a", "md": "1"}], "correct": "a", "unit": "m"}
        self.assertNotIn("unit", serve.public(mc))

    def test_answer_of_is_the_value_only(self):           # the reveal's `correct` (and so the copy) never carries the unit
        p = next(p for p in P3X if p["type"] == "num" and p.get("unit"))
        self.assertNotIn(p["unit"], serve.answer_of(p))


class RepoBackfill(unittest.TestCase):
    """the repo bank (problems.json): every num item and num part says its unit; "" = a pure number, hand-checked.
    CALC1_A9R (an area with no length unit given) stays blank on purpose: the lint warns on it."""
    def test_backfill(self):
        units = {p["code"]: p.get("unit") for p in REPO if p["type"] == "num"}
        units.update({f'{p["code"]}.{i}': q.get("unit") for p in REPO if p["type"] == "multi" for i, q in enumerate(p["parts"]) if q["type"] == "num"})
        self.assertEqual(units["PHYS_F3N"], "m/s^2")
        self.assertEqual(units["PHYS_S2K"], "m")
        self.assertEqual(units["CSCI26_H2J.0"], "")
        self.assertEqual([k for k, v in units.items() if v is None], ["CALC1_A9R"])


if __name__ == "__main__":
    unittest.main()
