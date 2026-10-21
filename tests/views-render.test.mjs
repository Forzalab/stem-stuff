// views.js (P1.1): render / stream / error boundary per statement / append-only slots (F8) / patch-merge (F4) /
// Predict never holds the answer (F5) / Doodle fallback (VISUAL-FIRST). DOM = tests/views-dom.mjs (no jsdom here).
import test from "node:test";
import assert from "node:assert/strict";
import { render, stream, mountView, register, registered, splitStatements } from "../views.js";
import { readFileSync } from "node:fs";
import { LIB, MARKS, DOODLES } from "../views-lib.js";
import { P10, P11, P2, DROPPED, chunk } from "../try/views-demo-src.js";
import { makePredict } from "../try/views-demo-server.js";
import { mount, html, byClass, one, all } from "./views-dom.mjs";

const slots = m => byClass(m, "vw-slot");
const tick = () => new Promise(r => setTimeout(r, 0));
const ANSWER = ["χ(P) = 3", "Three classes cover"];

test("registry: every library component has a drawing, and nothing is drawn that the library does not list", () => {
  assert.deepEqual(registered().sort(), Object.keys(LIB.components).filter(n => n !== "Step").sort());
});

test("library: views-lib.js loads views/library.json, the one source (no hand-kept list beside it)", () => {
  const spec = JSON.parse(readFileSync(new URL("../views/library.json", import.meta.url), "utf8"));
  assert.deepEqual([LIB.id, LIB.version, LIB.root], [spec.id, spec.version, spec.root]);
  assert.deepEqual(Object.keys(LIB.components), Object.keys(spec.components));
  for (const [n, c] of Object.entries(spec.components)) {
    assert.deepEqual(LIB.components[n], { layer: c.layer, desc: c.description, props: c.props.properties, required: c.props.required }, n);
    assert.deepEqual(Object.keys(LIB.components[n].props), Object.keys(c.props.properties), `${n}: positional order`);
  }
  assert.deepEqual(MARKS, spec.marks);
  assert.deepEqual(DOODLES, spec.components.Doodle.props.properties.kind.enum);
  const src = readFileSync(new URL("../views-lib.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bLOCAL\b|type: "(string|array|integer)"/, "views-lib.js holds no component data of its own");
});

test("render: the demo programs draw with no errors, slots in the root's order", () => {
  for (const [name, src, ids] of [["P10", P10, ["head", "legend", "walk"]], ["P11", P11, ["hints", "pick", "rv"]], ["P2", P2, ["head", "order", "why"]]]) {
    const m = mount();
    const v = render(src, m, { predict: async () => ({ ok: false, tries_left: 0 }) });
    assert.deepEqual(v.errors, [], name);
    assert.deepEqual(slots(m).map(s => s.getAttribute("data-slot")), ids, name);
    assert.ok(slots(m).every(s => s.classList.contains("on")), name);
    assert.ok(m.hasAttribute("data-vw-done"));
  }
});

test("Steps: step 1 of 4, Back off at 1, Next off at n, the table follows the step", () => {
  const m = mount();
  render(P10, m);
  const [back, next] = byClass(one(m, "vw-foot"), "btn");
  assert.equal(one(m, "vw-n").textContent, "Step 1 of 4");
  assert.ok(back.hasAttribute("disabled") && !next.hasAttribute("disabled"));
  assert.equal(one(m, "vw-cap").getAttribute("aria-live"), "polite");
  next.click(); next.click(); next.click(); next.click();
  assert.equal(one(m, "vw-n").textContent, "Step 4 of 4");
  assert.ok(next.hasAttribute("disabled"));
  assert.match(one(m, "vw-cap").textContent, /not fetched/);
  assert.equal(one(m, "vw-front").textContent, "empty", "an empty queue keeps its row");
  one(m, "vw-foot").dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(one(m, "vw-n").textContent, "Step 3 of 4", "←/→ while the footer has focus");
});

test("stream: chunks cut mid-statement paint only completed statements, and end equal to a batch render", async () => {
  const m = mount(), v = mountView(m);
  v.push('root = View([a, b])\na = Text("hel');
  assert.deepEqual(slots(m).map(s => s.classList.contains("on")), [false, false], "the root reserved both slots; the half statement is not drawn");
  v.push('lo")\nb = Te');
  assert.equal(slots(m)[0].textContent, "hello");
  assert.equal(slots(m)[1].textContent, "", "b = Te is not a statement yet");
  v.push('xt("world")');
  v.end();
  assert.equal(m.textContent, "helloworld");
  const s = mount(), b = mount();
  await stream(chunk(P10, 11), s);
  render(P10, b);
  assert.equal(html(s), html(b));
});

test("append-only (F8): a painted statement keeps its node while later statements stream in; slots are fixed at root time", () => {
  const m = mount(), v = mountView(m);
  const parts = chunk(P10, 3);
  let head = null, count = null;
  for (const c of parts) {
    v.push(c);
    const s = slots(m);
    if (count == null && s.length) count = s.length;
    if (count != null) assert.equal(s.length, count);
    const node = s[0]?.firstChild;
    if (!head && node) head = node;
    if (head) assert.equal(s[0].firstChild, head, "the head was repainted");
  }
  v.end();
  assert.equal(count, 3);
  assert.equal(slots(m)[0].firstChild, head);
});

test("error boundary: an unknown component and a throwing component drop; siblings render", () => {
  register("Callout", (p, c) => { if (p.tag === "boom") throw new Error("kaboom"); return c.h("div", { class: "vw-callout" }, p.text); });
  try {
    const m = mount();
    const v = render('root = View([a, b, c, d])\na = Text("one")\nb = Nope("x")\nc = Callout("boom", "never")\nd = Text("four")\n', m);
    assert.deepEqual(slots(m).map(s => s.textContent), ["one", "", "", "four"]);
    assert.deepEqual(v.errors.map(e => [e.code, e.statementId]).sort(), [["render-error", "c"], ["unknown-component", "b"]]);
  } finally {
    register("Callout", (p, c) => c.h("div", { class: "vw-callout" }, c.h("div", { class: "vw-tag" }, p.tag), c.h("p", null, c.rich(p.text))));
  }
});

test("error boundary: a statement whose drawing fails on a later version keeps its last good node", () => {
  register("Answer", (p, c) => { if (p.value === "boom") throw new Error("kaboom"); return c.h("p", null, p.value); });
  try {
    const m = mount();
    const v = render('root = View([a, b])\na = Answer("ok")\nb = Text("fine")\n', m);
    const good = slots(m)[0].firstChild;
    v.patch('a = Answer("boom")');
    assert.equal(slots(m)[0].firstChild, good);
    assert.deepEqual(v.errors.map(e => [e.code, e.statementId]), [["render-error", "a"]]);
    assert.equal(slots(m)[1].textContent, "fine");
    v.patch(`a = Answer("${"x".repeat(50)}")`);          // over the 40-char cap: dropped, not the old node (F7)
    assert.equal(slots(m)[0].textContent, "");
    assert.equal(v.errors[0].code, "too-long");
  } finally {
    register("Answer", (p, c) => c.h("p", { class: "vw-p" }, c.h("span", { class: "vw-ans" }, p.value), p.text ? " " : null, p.text ? c.rich(p.text) : null));
  }
});

test("caps (F7): over a cap the statement drops with too-long", () => {
  const m = mount();
  const steps = Array.from({ length: 9 }, (_, i) => `s${i}`);
  const src = `root = View([w, t])\nw = Steps(null, [${steps}])\n${steps.map(s => `${s} = Step("x")`).join("\n")}\nt = Text("still here")\n`;
  const v = render(src, m);
  assert.equal(slots(m)[0].textContent, "");
  assert.equal(slots(m)[1].textContent, "still here");
  assert.ok(v.errors.some(e => e.code === "too-long" && e.statementId === "w"));
});

test("Predict (F5): no answer in the DOM before the pick is posted; the pick goes to predict(); the Reveal patch merges in place (F4)", async () => {
  const m = mount(), posted = [];
  const server = makePredict({ delay: 0 });
  const v = render(P11, m, { predict: async (pick, info) => { posted.push([pick, info.view, info.key]); return server(pick); } });
  for (const w of ANSWER) assert.ok(!html(m).includes(w), w);
  for (const w of ANSWER) assert.ok(!v.src.includes(w), "nor in the program the page holds");
  assert.ok(one(m, "vw-lock"), "a visible locked row");
  const pills = byClass(m, "vw-pill"), go = one(m, "vw-go"), pred = slots(m)[1].firstChild;
  assert.ok(pills[2].classList.contains("wrong") && pills[2].hasAttribute("disabled"), "4 is pre-struck");
  assert.ok(go.hasAttribute("disabled"), "Check waits for a pick");
  pills[2].click();
  assert.equal(all(m, e => e.getAttribute("aria-checked") === "true").length, 0, "a struck pill cannot be picked");
  pills[3].click();
  go.click();
  await tick(); await tick();
  assert.deepEqual(posted, [["5", "pick", "key.chi"]]);
  assert.ok(!html(m).includes("key.chi"), "the key ref is posted, never drawn");
  assert.equal(slots(m)[1].firstChild, pred, "Predict kept its node (and its state) through the patch");
  assert.equal(one(m, "vw-verdict").textContent, "Not 5.");
  assert.equal(byClass(m, "vw-pill").filter(p => p.classList.contains("wrong")).length, 2);
  assert.ok(one(m, "vw-reveal").classList.contains("open"));
  assert.match(html(m), /χ\(P\) = 3/);
  assert.equal(byClass(one(m, "vw-fig"), "cm").map(g => g.childNodes[1].textContent).join(""), "1212321332", "classes carry a digit (F12)");
  assert.deepEqual(v.errors, []);
});

test("Predict (F5): a literal answer drops the statement (bad-value); only a key.<id> ref passes", () => {
  const m = mount();
  const v = render('root = View([p])\np = Predict("", "What is χ(P)?", ["2", "3"], [], 2, "3")', m);
  assert.ok(v.errors.some(e => e.code === "bad-value" && e.statementId === "p"));
  assert.ok(!html(m).includes("vw-predict"));
});

test("Predict: a right pick ends it; no predict function = Check stays off (offline)", async () => {
  const m = mount();
  render(P11, m, { predict: makePredict({ delay: 0 }) });
  byClass(m, "vw-pill")[1].click(); one(m, "vw-go").click();
  await tick(); await tick();
  assert.ok(byClass(m, "vw-pill")[1].classList.contains("right"));
  assert.equal(one(m, "vw-verdict").textContent, "Right.");
  assert.ok(one(m, "vw-reveal").classList.contains("open"));
  const off = mount();
  render(P11, off);
  byClass(off, "vw-pill")[0].click();
  assert.ok(one(off, "vw-go").hasAttribute("disabled"));
});

test("Doodle fallback (VISUAL-FIRST): empty program, every statement dropped, garbage stream -> a Doodle, never a blank", async () => {
  for (const src of ["", DROPPED, "this is not a program", 'root = View([x])\n']) {
    const m = mount();
    render(src, m);
    assert.ok(one(m, "vw-fallback") && one(m, "vw-doodle"), JSON.stringify(src));
  }
  const m = mount();
  await stream(chunk(DROPPED, 2), m, { doodle: "heart" });
  assert.ok(one(m, "vw-doodle").classList.contains("heart"));
  const mid = mount(), v = mountView(mid);
  v.push("root = View([a])\n");
  assert.equal(one(mid, "vw-doodle"), undefined, "no Doodle while the stream is still open");
  v.push('a = Doodle("star")\n'); v.end();
  assert.ok(one(mid, "vw-doodle").classList.contains("star"));
  assert.equal(one(mid, "vw-fallback"), undefined);
});

test("splitStatements: newlines inside strings and brackets do not end a statement", () => {
  assert.deepEqual(splitStatements('a = Text("x\ny")\nb = View([c,\n d])\nc = Te'), [['a = Text("x\ny")', "b = View([c,\n d])"], "c = Te"]);
});

// Slots (views plan Oct 20, registry "slot"): "$t.<id>" strings fill from o.t; a missing id paints an outlined box data-slot=<id>
const SLOTTED = 'root = View([hd, pk])\nhd = Head("$t.title", "$t.sub")\npk = Predict("$t.tag", "$t.q", ["1", "$t.c_two"], [], 2, "key.v1")';
test("slots: $t.<id> resolves from the t map, the text drawn as text (no box)", () => {
  const m = mount();
  const v = render(SLOTTED, m, { t: { title: "Count the colours", sub: "One line", tag: "Guess", q: "How many?", c_two: "2" } });
  assert.deepEqual(v.errors, []);
  assert.equal(one(m, "vw-t").textContent, "Count the colours");
  assert.equal(one(m, "vw-sub").textContent, "One line");
  assert.equal(one(m, "vw-q").textContent, "How many?");
  assert.deepEqual(byClass(m, "vw-pill").map(b => b.textContent), ["1", "2"]);
  assert.deepEqual(byClass(m, "vw-tslot"), []);
});

test("slots: a missing id paints an outlined empty box labelled by the id (data-slot), the rest fills", () => {
  const m = mount();
  const v = render(SLOTTED, m, { t: { title: "Count the colours", q: "How many?" } });
  assert.deepEqual(v.errors, []);
  assert.equal(one(m, "vw-t").textContent, "Count the colours");
  const boxes = byClass(m, "vw-tslot");
  assert.deepEqual(boxes.map(b => b.getAttribute("data-slot")), ["sub", "tag", "c_two"]);
  assert.ok(boxes.every(b => b.textContent === b.getAttribute("data-slot")));
  const none = mount();
  render(SLOTTED, none);                                     // no t at all: every slot is a box, nothing errors
  assert.deepEqual(byClass(none, "vw-tslot").map(b => b.getAttribute("data-slot")), ["title", "sub", "tag", "q", "c_two"]);
});

test("slots: caps apply to the filled text; only a whole-string ref with a valid id is a slot", () => {
  const m = mount();
  const v = render('root = View([hd])\nhd = Head("$t.title")', m, { t: { title: "x".repeat(61) } });
  assert.equal(v.errors[0]?.code, "too-long");
  const k = mount();
  render('root = View([hd])\nhd = Head("see $t.title", "$t.Bad")', k, { t: { title: "no" } });
  assert.equal(one(k, "vw-t").textContent, "see $t.title");
  assert.equal(one(k, "vw-sub").textContent, "$t.Bad");
  assert.deepEqual(byClass(k, "vw-tslot"), []);
});
