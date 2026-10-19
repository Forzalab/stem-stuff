// tools/bench_seen.mjs (J6): the dump parser, the rule replay (the same tree the page runs), the label sheet, precision / recall,
// and jevShadow, which only ever calls a client it is handed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseDump, itemState, rows, labelSheet, score, jevShadow, jevBench, JEV_PROVIDER, JEV_MODEL, JEV_MODELS, tree } from "../tools/bench_seen.mjs";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const win = () => { const w = { URLSearchParams, setInterval() {}, performance: { now: () => 0 } }; w.window = w; vm.runInNewContext(read("../intent.js"), w); return w; };

/* one real session through create(): item A earned (2 wrong, right), item B quick, item C one wrong then right */
function dumped() {
  const w = win();
  let t = 0;
  const j = w.__stemJev.create(() => t, {}, { on: [], sid: "sB", seenLines: { fam: {}, any: [{ id: "x", text: "Fine.", kind: "short" }] }, rand: () => 0.5 });
  const at = (x, n, p) => { t = x * 1000; return j.ev(n, p); };
  at(0, "q_open", { code: "A" }); at(10, "pick", { choice: "A", verdict: "wrong", error: "negation" }); at(20, "pick", { choice: "B", verdict: "wrong", error: "sign" });
  const fired = at(30, "pick", { choice: "C", verdict: "correct" });
  at(40, "q_open", { code: "B" }); at(43, "pick", { choice: "A", verdict: "correct" });
  at(50, "q_open", { code: "C" }); at(60, "pick", { choice: "A", verdict: "wrong", error: "sign" }); at(70, "pick", { choice: "B", verdict: "correct" });
  return { text: j.dump(), fired };
}

test("replay: the bench's per-item rule = the page's own decision (it is the same tree)", () => {
  const { text, fired } = dumped();
  assert.ok(fired && fired.kind, "A fired live");
  const items = parseDump(text), rs = rows(items);
  assert.deepEqual(items.map(i => i.code), ["A", "B", "C"]);
  assert.deepEqual(rs.map(r => r.rule), ["C", "", "C"], "A: 2 wrong; B: first try (silence); C: one wrong, 10 s before the right pick = earned");
  assert.equal(rs[0].fam, "sign"); assert.equal(rs[0].fired, "short");
  assert.equal(rs[0].sid, "sB"); assert.deepEqual(rs.map(r => r.window), [1, 2, 3]);
  const st = itemState(items[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(st)), { solved: true, wrong: 2, deep: 0, help: false, s5: false, gaps: [10, 10, 10], errs: ["negation", "sign"], fams: [], since: 10 });
  assert.equal(tree(st).length, 1); assert.equal(rs[0].moment, "earned");
});
test("replay: help, S5, S2 depth and an item with no right pick", () => {
  const L = (i, ...ls) => ls.map(l => JSON.stringify({ s: "s", i, c: "K" + i, l })).join("\n");
  const text = [
    L(1, "+0.0  q_open  K1 mc", "+5.0  pick  A wrong err=sign", "+9.0  cluck  open ask", "+20.0  pick  B wrong", "+40.0  pick  C correct"),
    L(2, "+0.0  q_open  K2 mc", "+95.0  jev  S2 depth=1 p75=80s", "+175.0  jev  S2 depth=2 p75=80s", "+180.0  pick  A correct"),
    L(3, "+0.0  q_open  K3 mc", "+3.0  pick  A wrong", "+4.0  jev  S5 fast x2", "+5.0  pick  B wrong", "+30.0  pick  C correct"),
    L(4, "+0.0  q_open  K4 mc", "+10.0  pick  A wrong"), "not json",
    L(5, "+0.0  q_open  K5 mc", "+10.0  pick  A wrong err=sign", "+17.0  pick  B correct"), ""].join("\n");   // K5: a fix 7 s after the wrong = lucky
  assert.deepEqual(rows(parseDump(text)).map(r => r.rule), ["", "C", "", "", ""], "K1 help, K2 depth 2, K3 S5, K4 unsolved, K5 lucky");
  assert.equal(itemState(parseDump(text)[3]), null);
});
test("label sheet: sid,code,window,rule,label (blank); precision / recall against filled labels", () => {
  const { text } = dumped(), rs = rows(parseDump(text)), sheet = labelSheet(rs);
  assert.equal(sheet, "sid,code,window,rule,label\nsB,A,1,C,\nsB,B,2,,\nsB,C,3,C,\n");
  const filled = sheet.replace("sB,A,1,C,", "sB,A,1,C,y").replace("sB,B,2,,", "sB,B,2,,n").replace("sB,C,3,C,", "sB,C,3,C,y");
  assert.deepEqual(score(rs, filled), { labelled: 3, tp: 2, fp: 0, fn: 0, tn: 1, precision: 1, recall: 1 });
  assert.equal(score(rs, sheet).labelled, 0);
  assert.equal(score(rs, sheet).precision, null);
});
test("jevShadow: builds { model, state, questions: { earned } } and calls only the client it is given; no client → throws, no network", async () => {
  const seen = [], fetched = [];
  const realFetch = globalThis.fetch; globalThis.fetch = (...a) => { fetched.push(a); throw new Error("no network"); };
  try {
    const out = await jevShadow(["+0.0  q_open  A mc", "+10.0  pick  A wrong"], b => { seen.push(b); return { earned: true }; });
    assert.deepEqual(out, { earned: true });
    assert.equal(seen[0].model, JEV_MODEL); assert.equal(JEV_MODEL, "microsoft/microsoft-decision-1", "MSD-1 is the default");
    assert.equal(seen[0].state, "+0.0  q_open  A mc\n+10.0  pick  A wrong"); assert.deepEqual(Object.keys(seen[0].questions), ["earned"]);
    assert.throws(() => jevShadow([], undefined), /injected client/);
    assert.deepEqual([...JEV_MODELS], ["microsoft/microsoft-decision-1", "typesafe/jev-1.14"], "jev-1.14 stays as the 2nd arm");
    seen.length = 0;
    await jevShadow(["+0.0  q_open  A mc"], b => { seen.push(b); return {}; }, "typesafe/jev-1.14");
    assert.deepEqual(seen.map(b => b.model), ["typesafe/jev-1.14"], "the model arg picks one arm");
    seen.length = 0;
    const both = await jevBench(["+0.0  q_open  A mc"], b => { seen.push(b); return { earned: b.model.length }; });
    assert.deepEqual(seen.map(b => b.model), [...JEV_MODELS], "bench both, in order");
    assert.deepEqual(Object.keys(both), [...JEV_MODELS]);
    seen.length = 0;
    await jevShadow(["x"], b => { seen.push(b); return {}; }); await jevShadow(["x"], b => { seen.push(b); return {}; }, "typesafe/jev-1.14"); await jevBench(["x"], b => { seen.push(b); return {}; });
    assert.equal(seen.length, 4);
    for (const b of seen) assert.deepEqual({ ...b.provider }, { zdr: true, data_collection: "deny" }, "ZDR in every body: " + b.model);
    assert.deepEqual({ ...JEV_PROVIDER }, { zdr: true, data_collection: "deny" });
    seen.length = 0; await jevBench([], b => { seen.push(b); return {}; }, ["typesafe/jev-1.14"]);
    assert.deepEqual(seen.map(b => b.model), ["typesafe/jev-1.14"], "bench just the models given");
    assert.equal(fetched.length, 0);
  } finally { globalThis.fetch = realFetch; }
});
