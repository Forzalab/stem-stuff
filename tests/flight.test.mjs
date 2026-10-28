// flight.js (flight recorder P1, brain sprint-render-v2/flight-recorder-DESIGN.md): ring caps, keyboard masking + 100 ms rounding,
// the snapshot's size cap, dedupe / rate limit, the stemT mirror, and a sentinel string typed everywhere that never reaches a snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../flight.js", import.meta.url), "utf8");
const SENTINEL = "Zq7xSENTINELwv";

/* a fake browser: handlers[type] = the listeners flight.js put on document / window; clock = performance.now() */
function run({ stemT = () => {}, store = {}, observers = null, idle = null } = {}) {
  const handlers = {}, clock = { t: 1234.4 }, timers = [];
  const add = tg => (type, f) => { (handlers[tg + ":" + type] ||= []).push(f); };
  const el = (tag, id, extra = {}) => ({ tagName: tag.toUpperCase(), id, className: "", getAttribute: () => null, textContent: "", value: "",
    getBoundingClientRect: () => ({ left: 1.4, top: 2.6, width: 300, height: 40, right: 301, bottom: 42 }), ...extra });
  const nodes = { "#qnext": el("button", "qnext"), "#scratch": el("textarea", "scratch", { value: SENTINEL }), "#entryMsg": el("p", "entryMsg", { textContent: "BEAR_" + SENTINEL }),
    "#toast": el("div", "toast", { textContent: "Copied E-7K3QX." }), "#cluck .wl": el("div", "", { className: "wl", textContent: "Couldn't load Cluck. " + SENTINEL }) };
  const document = {
    readyState: "complete", visibilityState: "visible", documentElement: { className: "fx-blur kb", scrollHeight: 2000 }, activeElement: nodes["#scratch"],
    querySelector: q => (q === 'meta[name="stem-build"]' ? { getAttribute: () => "#197", dataset: { sha: "abc1234" } } : nodes[q] || null),
    querySelectorAll: () => [], getElementById: id => nodes["#" + id] || null, addEventListener: add("doc"), fonts: { status: "loaded" }, getAnimations: () => [],
  };
  const win = {
    document, performance: { now: () => clock.t }, navigator: { onLine: true, userAgent: "UA", hardwareConcurrency: 4 }, location: { hash: "#CALC1_FL2", search: "" },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener: add("win"), setTimeout: f => { timers.push(f); return timers.length; },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, scrollY: 0, stemT, clearTimeout: id => { timers[id - 1] = null; },
    __drill: { page: { q: "CALC1_FL2", tries: 1, wish: { chars: 0, failed: 1 } } },
  };
  win.window = win;
  if (idle) win.requestIdleCallback = (f, o) => idle.push([f, o]);
  if (observers) {                                               // a PerformanceObserver that hands each observed type's callback to the test
    win.PerformanceObserver = function (cb) { this.observe = o => { observers[o.type] = cb; }; };
    win.PerformanceObserver.supportedEntryTypes = ["layout-shift", "longtask"];
  }
  vm.runInNewContext(SRC, win);
  const fire = (key, e) => (handlers[key] || []).forEach(f => f(e));
  return { win, FR: win.stemFR, fire, clock, timers, nodes, store };
}
const P = x => JSON.parse(JSON.stringify(x));   // a value from the vm realm, comparable here
const kd = (key, target, x = {}) => ({ key, target, code: "KeyZ", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, repeat: false, defaultPrevented: false, ...x });

test("ring: 256 entries at most, the oldest go; the kb sub-ring: 32, so typing never evicts net / cluck history", () => {
  const { FR, fire, nodes } = run();
  for (let i = 0; i < 300; i++) FR.log("net", "check", "s", i);
  assert.equal(FR.ring.length, 256);
  assert.equal(FR.ring.at(-1)[4], 299);
  for (let i = 0; i < 100; i++) fire("doc:keydown", kd("a", nodes["#scratch"]));
  assert.equal(FR.kb.length, 32);
  assert.equal(FR.ring.length, 256, "kb entries live in their own ring");
  assert.ok(FR.ring.every(e => e[1] === "net"));
});

test("kb: content-free (key CLASS, inputType enum, lengths), 100 ms times, a held key = one entry with a count", () => {
  const { FR, fire, clock, nodes } = run();
  const ta = nodes["#scratch"];
  ta.selectionStart = ta.selectionEnd = 3;
  clock.t = 5049;
  fire("doc:keydown", kd("q", ta, { shiftKey: true }));
  fire("doc:keydown", kd("Enter", ta));
  fire("doc:keydown", kd(" ", ta));
  fire("doc:keydown", kd("é", ta));
  fire("doc:keydown", kd("F5", ta));
  fire("doc:keydown", kd("Backspace", ta)); fire("doc:keydown", kd("Backspace", ta, { repeat: true })); fire("doc:keydown", kd("Backspace", ta, { repeat: true }));
  fire("doc:input", { target: ta, inputType: "insertText", data: SENTINEL });
  ta.value += "x";
  fire("doc:input", { target: ta, inputType: "insertText", data: SENTINEL });
  fire("doc:compositionstart", { target: ta, data: SENTINEL }); fire("doc:focusout", { target: ta });
  const k = FR.kb;
  assert.deepEqual(P(k.map(e => e[4])), ["char", "Enter", "Space", "char", "other", "Backspace", "insertText", "insertText", null, null]);
  assert.deepEqual(P(k.map(e => e[2])), ["kd", "kd", "kd", "kd", "kd", "kd", "in", "in", "cs", "fo"]);
  assert.equal(k[0][3], "textarea#scratch");
  assert.equal(k[0][5], 8 | 128, "shift + a collapsed selection");
  assert.equal(k[5][8], 2, "two repeats folded into one entry");
  assert.ok(k.every(e => e[0] % 100 === 0), "times rounded to 100 ms");
  assert.deepEqual(P([k[7][6], k[7][7]]), [SENTINEL.length, SENTINEL.length + 1], "lengths before / after, never the value");
  const s = JSON.stringify(k);
  assert.ok(!s.includes(SENTINEL) && !s.includes("KeyZ") && !/"(q|é)"/.test(s), s);
});

test("kb P2: keyup as a class (never folded), paste / cut / copy / submit as the event only: no clipboard, no value", () => {
  const { FR, fire, clock, nodes } = run();
  const ta = nodes["#scratch"], clip = { getData: () => SENTINEL, types: ["text/plain"] };
  clock.t = 7349;
  fire("doc:keydown", kd("z", ta)); fire("doc:keyup", kd("z", ta)); fire("doc:keyup", kd("z", ta)); fire("doc:keyup", kd("Enter", ta, { ctrlKey: true }));
  for (const t of ["paste", "cut", "copy"]) fire("doc:" + t, { target: ta, clipboardData: clip, data: SENTINEL });
  const form = { tagName: "FORM", id: "", className: "ask", getAttribute: () => null };
  fire("doc:submit", { target: form, submitter: ta });
  const k = FR.kb;
  assert.deepEqual(P(k.map(e => [e[2], e[3], e[4]])), [["kd", "textarea#scratch", "char"], ["ku", "textarea#scratch", "char"], ["ku", "textarea#scratch", "char"],
    ["ku", "textarea#scratch", "Enter"], ["paste", "textarea#scratch", null], ["cut", "textarea#scratch", null], ["copy", "textarea#scratch", null], ["submit", "form.ask", null]]);
  assert.equal(k[3][5] & 1, 1, "ctrl");
  assert.deepEqual(P([k[4][6], k[7][6]]), [SENTINEL.length, null], "a field's length; a form has none");
  assert.ok(k.every(e => e[0] === 7300), "100 ms times");
  const s = JSON.stringify(k);
  assert.ok(!s.includes(SENTINEL) && !/"z"|KeyZ/.test(s), s);
});

test("keyClass / inputType / blank: the masking rules", () => {
  const { keyClass, inputType, blank, label } = run().FR._t;
  for (const c of ["a", "Z", "7", "$", "é", "😀"]) assert.equal(keyClass(c), "char", c);
  for (const n of ["Enter", "Tab", "Escape", "ArrowUp", "Process", "Unidentified"]) assert.equal(keyClass(n), n);
  for (const o of ["F5", "Shift", "Dead", "", null, "abc"]) assert.equal(keyClass(o), "other", String(o));
  assert.equal(inputType("deleteContentBackward"), "deleteContentBackward");
  assert.equal(inputType("x y"), "other");
  assert.equal(blank("mail a.b@c.com 5551234567 " + "x".repeat(300)).length, 120);
  assert.ok(!blank("a.b@c.com 5551234567").match(/@c|555/));
  assert.equal(label({ tagName: "INPUT", id: "", className: "ans big extra", getAttribute: k => (k === "role" ? "textbox" : null) }), "input.ans.big[textbox]");
});

test("snapshot: last 64 ring + last 20 kb + page.at (state, no text); cut to the cap, oldest ring entries first", () => {
  const { FR, fire, nodes } = run();
  for (let i = 0; i < 200; i++) FR.log("net", "b", "h", 200, i);
  for (let i = 0; i < 40; i++) fire("doc:keydown", kd("x", nodes["#scratch"]));
  const s = FR.snap({ code: "E-7K3QX", where: "explain", reason: "http", status: 504 });
  assert.equal(s.ring.length, 64);
  assert.equal(s.kb.length, 20);
  assert.equal(s.page.at.app.q, "CALC1_FL2");
  assert.equal(s.page.at.hash, "#CALC1_FL2");
  assert.deepEqual(P(s.page.at.said), { toast: "Copied", entry: ("BEAR_" + SENTINEL).length, wl: "Couldn't load Cluck" }, "our prefix, else a length");
  assert.equal(s.page.at.active, "textarea#scratch");
  assert.deepEqual(P(s.page.at.boxes[0]), ["#qnext", 1, 3, 300, 40, 1]);
  const size = JSON.stringify(s).length;
  assert.ok(size < 6144, "typical snapshot ≤ 6 KB: " + size);
  const fit = FR._t.fit;
  const big = fit({ ring: Array.from({ length: 64 }, (_, i) => [i, "box", "x".repeat(400)]), kb: Array.from({ length: 20 }, () => [0, "kb", "kd", "x".repeat(40)]), page: { at: { x: "y".repeat(3000) } } }, 16384);
  assert.ok(JSON.stringify(big).length <= 16384);
  assert.equal(big.cut, 1);
  assert.equal(big.ring.at(-1)[0], 63, "the newest ring entries stay");
  assert.ok(big.page, "the page survives while ring entries can go");
  const tiny = fit({ ring: [[1, "x"]], kb: [[1, "kb"]], page: { at: { x: "y".repeat(3000) } } }, 500);
  assert.equal(tiny.page, null);
  assert.ok(JSON.stringify(tiny).length <= 500);
  assert.ok(JSON.stringify(FR.snap({ code: "E-22222", where: "chat", reason: "http", status: 500 }, 2000)).length <= 2000, "the caller's cap wins");
});

test("dedupe (same where/reason/status in 60 s: the first code + a count) and rate limit (3 snapshots per 10 minutes, kept in localStorage)", () => {
  const { gate } = run().FR._t;
  let last = { key: "explain|http|504", t: 0, code: "E-AAAAA", n: 1 };
  assert.deepEqual(P(gate("explain|http|504", 30000, [], last)), { dup: "E-AAAAA", n: 2 });
  assert.equal(gate("explain|http|504", 61000, [], last).ok, 1, "after 60 s: a new snapshot");
  assert.equal(gate("chat|http|500", 1000, [0, 1, 2], null).rate, 1);
  assert.equal(gate("chat|http|500", 600005, [0, 1, 2], null).ok, 1, "older than 10 minutes: forgotten");
  const store = {};
  const { FR } = run({ store });
  const r = (where, status) => ({ code: "E-" + where.slice(0, 5).toUpperCase().replace(/[^A-Z]/g, "Z").padEnd(5, "Z"), where, reason: "http", status });
  assert.ok(FR.snap(r("explain", 504)).ring);
  assert.deepEqual(P(FR.snap(r("explain", 504))), { dup: "E-EXPLA", n: 2 });
  assert.ok(FR.snap(r("chat", 500)).ring);
  assert.ok(FR.snap(r("check", 502)).ring);
  assert.deepEqual(P(FR.snap(r("bank", 503))), { rate: 1 });
  assert.equal(JSON.parse(store["stem-inc"]).length, 3);
  const again = run({ store });
  assert.deepEqual(P(again.FR.snap(r("problem", 500))), { rate: 1 }, "the limit holds across a reload");
});

test("stemT mirror: q_open / pick / cluck_* / next become nav / pick / stage / cluck entries (no choice id, no error family); the call goes through unchanged", () => {
  const calls = [];
  const { FR, win } = run({ stemT: (n, p) => calls.push([n, p]) });
  const props = { code: "CALC1_FL2", choice: "b", right: false, verdict: "wrong", tries_left: 1, ms_since_open: 4200, error: "sign", families: ["x"] };
  win.stemT("q_open", { code: "CALC1_FL2", bank: "BANK_FL", type: "mc", mode: "sugar" });
  win.stemT("pick", props);
  win.stemT("_ask"); win.stemT("_tok"); win.stemT("_tok");
  win.stemT("cluck_stream", { chars: 0, failed: 504, auto: true });
  win.stemT("next");
  assert.deepEqual(P(calls.map(c => c[0])), ["q_open", "pick", "_ask", "_tok", "_tok", "cluck_stream", "next"]);
  assert.equal(calls[1][1], props, "the same object, untouched");
  const kinds = FR.ring.map(e => e.slice(1, 4).join(" "));
  for (const k of ["nav CALC1_FL2 BANK_FL", "stage open", "pick wrong 1", "stage wrong 1", "cluck ask", "cluck tok", "cluck fail 0", "stage next"]) assert.ok(kinds.includes(k), k + " in " + kinds);
  assert.equal(kinds.filter(k => k === "cluck tok").length, 1, "the first chunk only");
  assert.ok(!JSON.stringify(FR.ring).includes('"sign"') && !JSON.stringify(FR.ring).includes('"b"'));
});

test("net lifecycle: s / h (status, ms, content-length) + rid (x-vercel-id, trace id) / f once / e bytes / x error name", () => {
  const { FR, clock } = run();
  clock.t = 100;
  const q = FR.req("explain", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  clock.t = 20200;
  q.h({ status: 504, headers: { get: k => ({ "content-length": "0", "x-vercel-id": "iad1::abcde-1760000000000-1234" })[k] ?? null } });
  q.f(); q.f(); q.e(12); q.x(Object.assign(new Error("boom"), { name: "AbortError" }));
  const e = FR.ring.filter(x => x[1] === "net" || x[1] === "rid").map(x => x.slice(1));
  assert.deepEqual(P(e[0]), ["net", "explain", "s"]);
  assert.deepEqual(P(e[1]), ["net", "explain", "h", 504, 20100, 0]);
  assert.deepEqual(P(e[2]), ["rid", "explain", "iad1::abcde-1760000000000-1234", "4bf92f3577b34da6a3ce929d0e0e4736"]);
  assert.deepEqual(P(e.slice(3).map(x => x[2])), ["f", "e", "x"]);
  assert.equal(e[5][3], "AbortError");
});

test("layout kinds: resize / scroll / visualViewport go through one throttled timer (no per-event work); load errors name the file, no query", () => {
  const { FR, fire, timers, win } = run();
  for (let i = 0; i < 50; i++) { fire("win:resize", {}); fire("doc:scroll", { target: win.document }); }
  assert.equal(timers.length, 1, "one timer for the burst");
  win.innerWidth = 400; win.scrollY = 812.6;
  timers.shift()();
  const k = FR.ring.map(e => e[1]);
  assert.equal(k.filter(x => x === "vp").length, 1);
  assert.equal(k.filter(x => x === "scroll").length, 1);
  assert.deepEqual(P(FR.ring.find(e => e[1] === "scroll").slice(2)), ["page", 813, 2000]);
  fire("win:error", { target: { tagName: "IMG", id: "", className: "fig", getAttribute: () => null, src: "https://x/y/fig.png?token=" + SENTINEL } });
  assert.deepEqual(P(FR.ring.at(-1).slice(1)), ["load", "img.fig", "https://x/y/fig.png"]);
  assert.ok(["boot", "flag", "mq"].every(x => k.includes(x)), "boot, flags, media queries at load");
});

/* the pending timers (a cleared one is null), run in order */
const tick = timers => { while (timers.some(Boolean)) { const i = timers.findIndex(Boolean), f = timers[i]; timers[i] = null; f(); } };

test("page.before (P2): re-read 250 ms after stage / nav / cluck / sw / vis (one timer for a burst), in idle time; the report carries it with its age, no text", () => {
  const idle = [];
  const { FR, win, timers, clock } = run({ idle });
  FR.log("net", "b", "s");
  assert.equal(timers.filter(Boolean).length, 0, "a net entry re-reads nothing");
  win.__drill.page = { q: "CALC1_FL1", tries: 0 };
  win.stemT("q_open", { code: "CALC1_FL1" }); FR.log("cluck", "open"); FR.log("vis", "hidden");
  assert.equal(timers.filter(Boolean).length, 2, "debounced: one page timer for the three entries (+ the stage's box timer)");
  clock.t = 2000; tick(timers);
  assert.equal(idle.length, 1, "one idle read for the burst");
  assert.equal(idle[0][1].timeout, 1000);
  idle.shift()[0]();
  win.__drill.page = { q: "CALC1_FL2", tries: 1, wish: { failed: 1 } };   // the failure: the page has moved on
  clock.t = 3500;
  const s = FR.snap({ code: "E-7K3QB", where: "explain", reason: "http", status: 504 });
  assert.equal(s.page.before.app.q, "CALC1_FL1", "the state from before");
  assert.equal(s.page.before.age_ms, 1500);
  assert.equal(s.page.at.app.q, "CALC1_FL2");
  assert.deepEqual(P(s.page.before.said), P(s.page.at.said), "our own strings only, else a length");
  assert.ok(!JSON.stringify(s).includes(SENTINEL), "no typed text, no field value");
  assert.ok(JSON.stringify(s).length < 8192, "before + at stay small: " + JSON.stringify(s).length);
  const fit = FR._t.fit;
  const o = fit({ ring: [[1, "x"]], kb: [[1, "kb", "kd", "x".repeat(40)]], page: { before: { x: "y".repeat(3000) }, at: { x: "z".repeat(100) } } }, 1000);
  assert.equal(o.page.before, null, "page.before goes before the kb entries and page.at");
  assert.equal(o.kb.length, 1);
  assert.ok(o.page.at);
});

test("page.before: no rIC (Safari) = read in the debounce timer; none yet = null", () => {
  const { FR, win, timers } = run();
  assert.equal(FR.snap({ code: "E-7K3QC", where: "chat", reason: "http", status: 500 }).page.before, null);
  win.stemT("next");
  tick(timers);
  assert.ok(FR.snap({ code: "E-7K3QD", where: "check", reason: "http", status: 502 }).page.before.app, "read without requestIdleCallback");
});

test("perf (P2): long tasks become ONE entry per 30 s window (n, total ms, longest ms, heap MB), only when there were some; a report flushes it", () => {
  const observers = {};
  const { FR, timers, win } = run({ observers });
  assert.equal(typeof observers.longtask, "function", "a longtask observer");
  const lt = (...d) => observers.longtask({ getEntries: () => d.map(duration => ({ duration })) });
  lt(60.4, 120); lt(80);
  assert.equal(timers.filter(Boolean).length, 1, "one 30 s timer");
  assert.equal(FR.ring.filter(e => e[1] === "perf").length, 0, "nothing until the window ends");
  win.performance.memory = { usedJSHeapSize: 52 * 1048576 };
  tick(timers);
  assert.deepEqual(P(FR.ring.filter(e => e[1] === "perf").map(e => e.slice(2))), [[3, 260, 120, 52]]);
  tick(timers);
  assert.equal(FR.ring.filter(e => e[1] === "perf").length, 1, "an idle page logs nothing");
  delete win.performance.memory;
  lt(55);
  const s = FR.snap({ code: "E-7K3QE", where: "explain", reason: "http", status: 504 });
  const perf = s.ring.filter(e => e[1] === "perf");
  assert.deepEqual(P(perf.at(-1).slice(2)), [1, 55, 55, null], "the pending window, in the report; no heap off Chrome");
  assert.ok(s.ring.findIndex(e => e[1] === "inc") > s.ring.lastIndexOf(perf.at(-1)));
  tick(timers);
  assert.equal(FR.ring.filter(e => e[1] === "perf").length, 2, "not logged twice");
});
