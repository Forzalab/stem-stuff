// intent.js (Jev J1 + J2): the event-line log, the F / S2 / S5 / S7 rule counters, and "flag off = nothing happens".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../intent.js", import.meta.url), "utf8");

/* a fake browser: search = location.search, store = localStorage, tele = window.__stemTelemetry (or none) */
function load({ search = "", store = {}, tele } = {}) {
  const listeners = [], handlers = [], timers = [], calls = [], args = [];
  const win = {
    location: { search }, navigator: {}, URLSearchParams, performance: { now: () => 0 },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, addEventListener: (t, f) => { listeners.push(t); handlers.push(f); } },
    setInterval: f => timers.push(f),
    stemT: (n, p) => { calls.push(n); args.push(p); },
  };
  if (tele) win.__stemTelemetry = tele;
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, store, listeners, handlers, timers, calls, args };
}
/* one session on a fake clock: s(x) moves the clock to x seconds */
function session(hist, o) {
  let t = 0;
  const j = load().win.__stemJev.create(() => t, hist, o);
  j.at = x => { t = x * 1000; return j; };
  const st = j.state; j.state = () => JSON.parse(JSON.stringify(st()));   // out of the vm realm, so deepEqual compares plain values
  return j;
}
/* the why of the newest hit of one state (J5 added S6 / Q, which can land on the same tick or pick and take state().last) */
const why = (j, st) => j.state().lines.filter(l => l.includes("  jev  " + st + " ")).at(-1)?.split("  jev  " + st + " ")[1];

test("on by default (art. 11, no flag): stemT wrapped, listeners + timer set, stemJev live; ?jev=0 = off on this device", () => {
  const on = load();
  assert.equal(typeof on.win.stemJev, "function");
  assert.deepEqual(on.listeners.sort(), ["copy", "input", "keydown", "pointerdown", "visibilitychange", "wheel"]);
  assert.equal(on.timers.length, 1);
  on.win.stemT("q_open", { code: "A1" });
  assert.deepEqual(on.calls, ["q_open"], "the old stemT still runs");
  const off = load({ search: "?jev=0" });
  assert.equal(off.store["stem-jev"], "0", "remembered");
  assert.equal(off.win.stemJev, undefined); assert.equal(off.listeners.length, 0); assert.equal(off.timers.length, 0);
  assert.ok(off.win.__stemJev.create);
  assert.equal(load({ store: off.store }).win.stemJev, undefined, "still off on the next visit");
  const back = load({ search: "?jev=1", store: off.store });
  assert.equal(back.store["stem-jev"], undefined, "?jev=1 clears the opt-out");
  assert.equal(typeof back.win.stemJev, "function");
});

test("stem-t-off / DNT / GPC keep it off (telemetry.js's own gates), even with ?jev=1", () => {
  const tele = (nav, ls) => ({ optedOut: () => !!(nav.doNotTrack === "1" || nav.globalPrivacyControl), userOff: () => ls["stem-t-off"] === "1" });
  for (const [nav, store] of [[{ doNotTrack: "1" }, {}], [{ globalPrivacyControl: true }, {}], [{}, { "stem-t-off": "1" }]]) {
    assert.equal(load({ search: "?jev=1", store, tele: tele(nav, store) }).win.stemJev, undefined, JSON.stringify([nav, store]));
  }
  assert.equal(typeof load({ tele: tele({}, {}) }).win.stemJev, "function", "no opt-out: on");
});

test("jev_item: one event per ended item at the next q_open, the open item's lines so far on a tab hide, the rest later; shape { sid, i, code, lines }", () => {
  let t = 0;
  const L = load(); L.win.performance.now = () => t;
  const items = () => L.calls.map((n, k) => [n, L.args[k]]).filter(([n]) => n === "jev_item").map(([, p]) => JSON.parse(JSON.stringify(p)));
  L.win.stemT("q_open", { code: "A", type: "mc" });
  t = 9000; L.win.stemT("pick", { code: "A", choice: "B", verdict: "wrong", tries_left: 2, error: "sign" });
  assert.equal(items().length, 0, "nothing while the item is open");
  t = 20000; L.win.stemT("q_open", { code: "B", type: "mc" });
  const [a] = items();
  assert.deepEqual(Object.keys(a).sort(), ["code", "i", "lines", "sid"]);
  assert.match(a.sid, /^s[a-z0-9]+$/); assert.equal(a.i, 1); assert.equal(a.code, "A");
  assert.deepEqual(a.lines, ["+0.0  q_open  A mc", "+9.0  pick  B wrong tries_left=2 err=sign", "+9.0  tree  wrong d=1 read=slip fam=sign"], "raw here: telemetry.js strips err= / fam= (telemetry.test.mjs)");
  const hide = L.listeners.indexOf("visibilitychange");
  assert.ok(hide >= 0);
  t = 25000; L.win.document.hidden = true; L.handlers[hide]();
  assert.deepEqual(items()[1], { sid: a.sid, i: 2, code: "B", lines: ["+0.0  q_open  B mc"] }, "hide: the open item so far");
  t = 40000; L.win.document.hidden = false; L.handlers[hide]();
  L.win.stemT("_copy"); L.win.stemT("q_open", { code: "C", type: "mc" });
  assert.deepEqual(items()[2].lines, ["+20.0  away  15s via=hide", "+20.0  copy  stem"], "only what was not sent yet; never the copied text");
  assert.equal(items().length, 3);
});

test("lines: +SS.s  kind  args, reset per item, capped at 40, no typed text", () => {
  const j = session();
  j.at(10).ev("q_open", { code: "P2X-14", type: "mc" });
  j.at(19.9).ev("pick", { choice: "B", verdict: "wrong", tries_left: 2 });
  assert.deepEqual(j.state().lines, ["+0.0  q_open  P2X-14 mc", "+9.9  pick  B wrong tries_left=2", "+9.9  tree  wrong d=1 read=slip fam=any"]);
  for (let i = 0; i < 50; i++) j.at(30 + i * 6).input();
  assert.equal(j.state().lines.length, 40);
  j.at(500).ev("q_open", { code: "P2X-15", type: "mc" });
  assert.deepEqual(j.state().lines, ["+0.0  q_open  P2X-15 mc"]);
});

test("F: right, no wrong, < 80 s, no Cluck → run grows; a slow, wrong or helped item ends it", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(20).ev("pick", { choice: "A", verdict: "correct" });
  j.at(30).ev("q_open", { code: "B" });
  assert.equal(j.state().flowRun, 1); assert.equal(j.state().last.state, "F");
  j.at(40).ev("pick", { choice: "C", verdict: "correct" });
  j.at(50).ev("q_open", { code: "C" });
  assert.equal(j.state().flowRun, 2); assert.equal(j.state().counts.F, 2);
  j.at(150).ev("pick", { choice: "D", verdict: "correct" });                     // 100 s: too slow
  j.at(160).ev("q_open", { code: "D" });
  assert.equal(j.state().flowRun, 0);
  j.at(165).ev("pick", { choice: "A", verdict: "wrong" }); j.at(200).ev("pick", { choice: "B", verdict: "correct" });
  j.at(210).ev("q_open", { code: "E" });
  assert.equal(j.state().flowRun, 0, "a wrong pick on the item");
  j.at(220).ev("cluck_open", { tab: "ask" }); j.at(230).ev("pick", { choice: "B", verdict: "correct" });
  j.at(240).ev("q_open", { code: "F" });
  assert.equal(j.state().flowRun, 0, "Cluck opened by hand");
  j.at(242).ev("cluck_open", { auto: true }); j.at(250).ev("pick", { choice: "B", verdict: "correct" });
  j.at(260).ev("q_open", { code: "G" });
  assert.equal(j.state().flowRun, 1, "the desktop auto-open is not help");
  j.at(270).ev("q_open", { code: "H" });
  assert.equal(j.state().flowRun, 0, "skipped with no pick");
});

test("F: the same item re-rendered is not a new item", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(5).ev("pick", { choice: "A", verdict: "correct" });
  j.at(6).ev("q_open", { code: "A" });
  assert.equal(j.state().flowRun, 0);
  assert.equal(j.state().lines.length, 2);
});

test("S2: no input past 80 s (no history) → depth 1, then 2; input or a pick resets; hidden never counts", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(79).tick(); assert.equal(j.state().counts.S2, 0);
  j.at(81).tick(); assert.equal(why(j, "S2"), "depth=1 p75=80s");
  j.at(90).tick(); assert.equal(j.state().counts.S2, 1, "once per depth");
  j.at(161).tick(); assert.equal(why(j, "S2"), "depth=2 p75=80s");
  j.at(170).input();
  assert.ok(j.state().lines.includes("+170.0  pause  170s"));
  j.at(249).tick(); assert.equal(j.state().counts.S2, 2);
  j.at(251).tick(); assert.equal(j.state().counts.S2, 3);
  j.at(260).vis(true); j.at(900).tick(); assert.equal(j.state().counts.S2, 3, "hidden");
  j.at(901).vis(false); j.at(950).tick(); assert.equal(j.state().counts.S2, 3, "back = a fresh step");
  assert.equal(j.state().last.action, "hint_offer");
});

test("S2: p75 of this item's past steps once there are 4; picks feed the history (pick → pick, not input → pick)", () => {
  const { p75 } = load().win.__stemJev;
  assert.equal(p75([10, 20, 30]), 80);
  assert.equal(p75([10, 20, 30, 40]), 30);
  assert.equal(p75([40, 10, 30, 20, 50, 60, 70, 80]), 60);
  const hist = { A: [30, 10, 20, 20] };
  const j = session(hist);
  j.at(0).ev("q_open", { code: "A" });
  j.at(19).tick(); assert.equal(j.state().counts.S2, 0);
  j.at(21).tick(); assert.equal(why(j, "S2"), "depth=1 p75=20s");
  j.at(29).input(); j.at(30).ev("pick", { choice: "B", verdict: "wrong" });
  assert.equal(hist.A.at(-1), 30);
  for (let i = 0; i < 30; i++) j.at(40 + i).ev("pick", { verdict: "wrong" });
  assert.equal(hist.A.length, 20, "capped");
});

test("S5: fast pick that repeats a choice, or 2 fast picks in a row; one fast pick alone is fine", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(3).ev("pick", { choice: "A", verdict: "wrong" });
  assert.equal(j.state().counts.S5, 0);
  j.at(9).ev("pick", { choice: "B", verdict: "wrong" });                          // 6 s after an error: fast x2
  assert.equal(why(j, "S5"), "fast x2");
  j.at(30).ev("pick", { choice: "C", verdict: "wrong" });                         // slow: run resets
  j.at(35).ev("pick", { choice: "C", verdict: "wrong" });                         // fast + repeat
  assert.equal(why(j, "S5"), "repeat C");
  assert.equal(j.state().counts.S5, 2);
  assert.equal(j.state().last.action, "slow_cue");
  j.at(60).ev("q_open", { code: "B" }); j.at(70).ev("pick", { choice: "A", verdict: "correct" });
  assert.equal(j.state().counts.S5, 2, "10 s after load, no error: not fast");
});

test("S7: Cluck opened by hand < 5 s after the item opened; auto and later opens don't count", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(2).ev("cluck_open", { auto: true }); j.at(3).ev("cluck_open", { tab: "ask" });
  assert.equal(j.state().counts.S7, 1); assert.equal(j.state().last.action, "predict_first");
  j.at(10).ev("q_open", { code: "B" }); j.at(16).ev("cluck_open", { tab: "ask" });
  assert.equal(j.state().counts.S7, 1);
  assert.deepEqual(j.state().lines.slice(-1), ["+6.0  cluck  open ask"]);
});

test("pending verdicts and events before any q_open are ignored", () => {
  const j = session();
  j.at(1).ev("pick", { verdict: "correct" }); j.at(1).ev("cluck_open", {}); j.at(1).tick(); j.at(1).input();
  assert.deepEqual(j.state().counts, { F: 0, S2: 0, S5: 0, S6: 0, S7: 0, Q: 0 });
  j.at(2).ev("q_open", { code: "A" }); j.at(3).ev("pick", { verdict: "pending" });
  assert.equal(j.state().lines.length, 1);
});

/* ---- J6 streak signals: log lines only (memory ring, ?jev=1), nothing new to PostHog ---- */
test("away: back after >= 5 s logs `away <s>s via=hide|blur`; shorter logs nothing; hide/show keep a fresh step", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).vis(true); j.at(14.9).vis(false);
  assert.deepEqual(j.state().lines, ["+0.0  q_open  A ?"], "4.9 s: no line");
  j.at(20).vis(true); j.at(32.4).vis(false);
  assert.equal(j.state().lines.at(-1), "+32.4  away  12s via=hide");
  j.at(40).away("blur", true); j.at(44.9).away("blur", false);
  assert.equal(j.state().lines.length, 2, "blur < 5 s: nothing");
  j.at(50).away("blur", true); j.at(75).away("blur", false);
  assert.equal(j.state().lines.at(-1), "+75.0  away  25s via=blur");
  j.at(80).away("blur", false); assert.equal(j.state().lines.length, 3, "a focus with no episode: nothing");
  j.at(90).tick(); assert.equal(j.state().counts.S2, 0, "back from away: a fresh step");
});

test("away: blur then hide is ONE episode from the blur (via=hide); a focus while hidden is not the return", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).away("blur", true); j.at(13).vis(true); j.at(14).away("blur", false); j.at(30).vis(false);
  const aw = j.state().lines.filter(l => l.includes("  away  "));
  assert.deepEqual(aw, ["+30.0  away  20s via=hide"]);
  j.at(40).vis(true); j.at(41).away("blur", true); j.at(50).vis(false);   // hide first, a late blur inside it
  assert.deepEqual(j.state().lines.filter(l => l.includes("  away  ")).at(-1), "+50.0  away  10s via=hide");
  assert.equal(j.state().lines.filter(l => l.includes("  away  ")).length, 2);
});

test("away: before any q_open nothing is logged and nothing throws", () => {
  const j = session();
  j.at(0).away("blur", true); j.at(20).away("blur", false); j.vis(true); j.at(30).vis(false);
  assert.equal(j.state().lines.length, 0);
});

test("q_open w= ch= from o.size; a missing size (or a half one) leaves the field out; a throwing size is ignored", () => {
  const sizes = { A: { w: 31, ch: 4 }, B: { w: 12 }, C: { ch: 5 }, D: null };
  const j = session({}, { size: c => { if (c === "E") throw new Error("x"); return sizes[c]; } });
  const open = c => { j.at(0).ev("q_open", { code: c, type: "mc" }); return j.state().lines[0]; };
  assert.equal(open("A"), "+0.0  q_open  A mc w=31 ch=4");
  assert.equal(open("B"), "+0.0  q_open  B mc w=12");
  assert.equal(open("C"), "+0.0  q_open  C mc ch=5");
  assert.equal(open("D"), "+0.0  q_open  D mc");
  assert.equal(open("E"), "+0.0  q_open  E mc");
  const k = session();   // no o.size at all
  k.at(0).ev("q_open", { code: "A", type: "mc" });
  assert.equal(k.state().lines[0], "+0.0  q_open  A mc");
});

test("_xmark logs `xmark <choice>`; _copy logs `copy stem`; neither is a pick / input / help", () => {
  const j = session();
  j.at(0).ev("_xmark", { choice: "b" });
  assert.equal(j.state().lines.length, 0, "before q_open: ignored");
  j.at(0).ev("q_open", { code: "A", type: "mc" });
  j.at(7).ev("_xmark", { choice: "b" }); j.at(8).ev("_xmark", {}); j.at(9).ev("_copy");
  assert.deepEqual(j.state().lines.slice(1), ["+7.0  xmark  b", "+8.0  xmark  -", "+9.0  copy  stem"]);
  assert.equal(j.state().counts.S5, 0); assert.equal(j.state().last, null);
});

test("wrapper: every stemT name is forwarded untouched (_ask / _tok / _xmark too), props never grow", () => {
  const { win, calls, args } = load({ search: "?jev=1" });
  const qo = { code: "A", type: "mc" };
  win.stemT("q_open", qo); win.stemT("_ask"); win.stemT("_tok"); win.stemT("_xmark", { choice: "b" });
  assert.deepEqual(calls, ["q_open", "_ask", "_tok", "_xmark"]);
  assert.deepEqual([...Object.keys(args[0])], ["code", "type"], "q_open props reach telemetry as the app sent them: no w / ch");
  assert.deepEqual({ ...args[3] }, { choice: "b" });
  assert.deepEqual([...win.stemJev().lines], ["+0.0  q_open  A mc", "+0.0  xmark  b"]);
});

test("a window blur pauses S2; a blur >= 5 s gives a fresh step on focus, a shorter one only pauses", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(70).away("blur", true); j.at(200).tick();
  assert.equal(j.state().counts.S2, 0, "no impasse while blurred (80 s p75 passed)");
  j.at(240).away("blur", false);
  assert.ok(j.state().lines.includes("+240.0  away  170s via=blur"));
  j.at(300).tick(); assert.equal(j.state().counts.S2, 0, "focus = a fresh step (60 s in)");
  j.at(321).tick(); assert.equal(why(j, "S2"), "depth=1 p75=80s", "and it counts from the focus");
  const k = session();
  k.at(0).ev("q_open", { code: "A" });
  k.at(76).away("blur", true); k.at(79).away("blur", false); k.at(79.5).tick();
  assert.equal(k.state().counts.S2, 0, "a 3 s blur: nothing logged, no reset");
  k.at(81).tick(); assert.equal(why(k, "S2"), "depth=1 p75=80s", "the step was not reset: 81 s since the last input");
  const m = session();
  m.at(0).ev("q_open", { code: "A" });
  m.at(70).away("blur", true); m.at(75).vis(true); m.at(200).tick(); assert.equal(m.state().counts.S2, 0, "blur then hide: paused");
  m.at(260).vis(false); m.at(300).tick(); assert.equal(m.state().counts.S2, 0, "hide's return is still a fresh step");
  m.at(341).tick(); assert.equal(m.state().counts.S2, 1);
});

test("any input ends a blur (a missed focus can't pause S2 for good); input during a hide changes nothing", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).away("blur", true); j.at(100).input("pointerdown");
  assert.ok(j.state().lines.includes("+100.0  away  90s via=blur"), "a long blur still logs its away line");
  assert.ok(!j.state().lines.some(l => l.includes("  pause  ")), "fresh step first: no pause line");
  j.at(170).tick(); assert.equal(j.state().counts.S2, 0, "fresh step from the input");
  j.at(181).tick(); assert.equal(why(j, "S2"), "depth=1 p75=80s", "S2 counts again");
  const k = session();
  k.at(0).ev("q_open", { code: "A" });
  k.at(10).away("blur", true); k.at(12).input("wheel"); k.at(13).away("blur", false);
  assert.ok(!k.state().lines.some(l => l.includes("  away  ")), "a short blur ended by input: no away line");
  const h = session();
  h.at(0).ev("q_open", { code: "A" });
  h.at(10).away("blur", true); h.at(20).vis(true); h.at(30).input("pointerdown"); h.at(200).tick();
  assert.equal(h.state().counts.S2, 0, "still hidden");
  h.at(210).vis(false);
  assert.ok(h.state().lines.includes("+210.0  away  200s via=hide"), "the hide ends only with the show");
  const g = session();
  g.at(0).ev("q_open", { code: "A" }); g.at(5).vis(true); g.at(15).input("keydown"); g.at(20).vis(false);
  assert.ok(g.state().lines.includes("+20.0  away  15s via=hide"));
});

/* ---- the spot gate (SLIP_TIE): spotOk = (a) improving AND (b) nearly there; every edge of SPOT ---- */
const SP = load().win.__stemJev, spotOk = st => ({ ...SP.spotOk(st) });
const its = s => [...s].map(c => ({ ok: c === "1", gap: 10 }));            // "0111" = first try wrong, right, right, right
const good = (o = {}) => ({ items: its("0111"), wrong: 1, left: 1, s5: false, help: false, since: 10, ...o });

test("spotOk: the SPOT consts (one object), and ok at the improving + nearly-there default", () => {
  assert.deepEqual({ ...SP.SPOT }, { MIN_N: 4, WIN: 3, IMP: 0, WRONG: 1, FAST_S: 8 });
  assert.deepEqual(spotOk(good()), { ok: true, why: "spot=ok imp=0.33>0.00 n=4 d=1" });
  assert.deepEqual(spotOk(good({ items: its("000111") })), { ok: true, why: "spot=ok imp=1.00>0.00 n=6 d=1" });
});

test("spotOk (a) improving: MIN_N items, last WIN's first-try rate > first WIN's, no S5, no help", () => {
  assert.deepEqual(spotOk(good({ items: its("011") })), { ok: false, why: "spot=hold why=cold n=3" }, "3 < MIN_N");
  assert.deepEqual(spotOk(good({ items: its("1111") })), { ok: false, why: "spot=hold why=flat imp=0.00<=0.00 n=4" }, "equal = no improvement");
  assert.deepEqual(spotOk(good({ items: its("1110") })), { ok: false, why: "spot=hold why=flat imp=-0.33<=0.00 n=4" });
  assert.equal(spotOk(good({ s5: true })).why, "spot=hold why=s5 n=4");
  assert.equal(spotOk(good({ help: true })).why, "spot=hold why=help n=4");
});

test("spotOk (b) nearly there: the first wrong only, a try left, not a fast guess (since >= FAST_S)", () => {
  assert.equal(spotOk(good({ wrong: 2 })).why, "spot=hold why=try n=4 d=2");
  assert.equal(spotOk(good({ wrong: 0 })).why, "spot=hold why=try n=4 d=0");
  assert.equal(spotOk(good({ left: 0 })).why, "spot=hold why=last n=4 d=1");
  assert.equal(spotOk(good({ since: 7.9 })).why, "spot=hold why=fast n=4 since=7.9");
  assert.equal(spotOk(good({ since: 8 })).ok, true, "FAST_S itself is not fast");
  assert.equal(spotOk(good({ since: null })).ok, false);
});

test("spotOk: off / nothing → false", () => {
  assert.deepEqual(spotOk(good({ off: true })), { ok: false, why: "spot=hold why=off" });
  assert.equal(spotOk(null).ok, false);
});

/* a session: finished items by pattern ("1" = right first try, "0" = wrong at +10 s then right), then item X and a wrong pick at +wrongAt */
function spotRun(p, wrongAt = 20) {
  const j = session();
  let t = 0;
  [...p].forEach((c, i) => {
    j.at(t).ev("q_open", { code: "I" + i });
    if (c === "0") j.at(t + 10).ev("pick", { choice: "a", verdict: "wrong", tries_left: 1, error: "sign" });
    j.at(t + 20).ev("pick", { choice: "b", verdict: "correct" });
    t += 30;
  });
  j.at(t).ev("q_open", { code: "X" });
  j.at(t + wrongAt).ev("pick", { choice: "a", verdict: "wrong", tries_left: 1, error: "sign" });
  return j;
}
test("session spot(): asks about the current item after its pick; one 'jev  spot=' line, never err= / fam=", () => {
  const j = spotRun("00111");
  assert.deepEqual({ ...j.spot() }, { ok: true, why: "spot=ok imp=0.67>0.00 n=5 d=1" });
  const l = j.state().lines.filter(x => x.includes("  jev  spot="));
  assert.deepEqual(l, ["+20.0  jev  spot=ok imp=0.67>0.00 n=5 d=1"]);
  assert.ok(!/ (err|fam)=/.test(l[0]));
  assert.deepEqual({ ...spotRun("11").spot() }, { ok: false, why: "spot=hold why=cold n=2" }, "a cold session: the plain hint");
});
test("session spot(): a fast first wrong (< FAST_S after q_open) → hold; a second wrong → hold; Cluck by hand → hold", () => {
  assert.equal(spotRun("00111", 6).spot().why, "spot=hold why=fast n=5 since=6.0");
  const j = spotRun("00111");
  j.at(200).ev("pick", { choice: "c", verdict: "wrong", tries_left: 0 });
  assert.equal(j.spot().why, "spot=hold why=try n=5 d=2");
  const k = spotRun("00111"); k.at(171).ev("cluck_open", { tab: "chat" });
  assert.equal(k.spot().why, "spot=hold why=help n=5");
  const s = spotRun("00111", 2); s.at(153).ev("pick", { choice: "a", verdict: "wrong", tries_left: 0 });
  assert.match(s.spot().why, /^spot=hold why=s5 /, "a fast repeat pick = S5");
});
test("?jev=0 / DNT / stem-t-off: no stemJev.spot → the page shows the plain hint; on: stemJev.spot is the seam", () => {
  const on = load();
  assert.equal(typeof on.win.stemJev.spot, "function");
  on.win.stemT("q_open", { code: "A" }); on.win.stemT("pick", { code: "A", verdict: "wrong", tries_left: 1 });
  assert.equal(on.win.stemJev.spot().ok, false, "a cold session");
  const tele = (nav, ls) => ({ optedOut: () => nav.doNotTrack === "1", userOff: () => ls["stem-t-off"] === "1" });
  const offs = [load({ search: "?jev=0" }), load({ tele: tele({ doNotTrack: "1" }, {}) }), load({ store: { "stem-t-off": "1" }, tele: tele({}, { "stem-t-off": "1" }) })];
  for (const L of offs) { assert.equal(L.win.stemJev, undefined); assert.equal(L.win.stemJev?.spot?.()?.ok === true, false); }
});

/* ---- W96 (todo 96, TONY-DECISIONS #40: "make jev much more dynamic") ---- */
const W96 = load().win.__stemJev;
const SEENL = (() => { const w = {}; w.window = w; vm.runInNewContext(readFileSync(new URL("../copy/seen-lines.js", import.meta.url), "utf8"), w); return w.__stemSeenLines; })();
const lowRoll = () => 0;                                                // every roll at its lowest: the old QUIET roll always says quiet

test("W96 (a) comeback: a right pick after >= 1 miss on the item always shows (no QUIET roll), even when every roll is low", () => {
  const j = session({}, { on: [], seenLines: SEENL, rand: lowRoll });
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).ev("pick", { choice: "A", verdict: "wrong", error: "sign" });
  const r = j.at(30).ev("pick", { choice: "B", verdict: "correct" });
  assert.ok(r && r.kind, "a comeback is seen: " + JSON.stringify(j.state().lines));
  assert.ok(!j.state().lines.some(l => / seen .* quiet/.test(l)));
});

test("W96 (a) comeback: typing the answer (a key < TYPING_S before the pick) does not hide it; Cluck asked = a nod (no credit words); a lucky fix and S5 stay silent", () => {
  const j = session({}, { on: [], seenLines: SEENL, rand: lowRoll });
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).ev("pick", { choice: "A", verdict: "wrong" });
  j.at(29).input("keydown");
  assert.ok(j.at(30).ev("pick", { choice: "B", verdict: "correct" })?.kind, "a typed num answer still gets its comeback");
  j.at(200).ev("q_open", { code: "B" });
  j.at(210).ev("pick", { choice: "A", verdict: "wrong" });
  j.at(215).ev("cluck_open", { tab: "explain" });
  const h = j.at(240).ev("pick", { choice: "B", verdict: "correct" });
  assert.equal(h && h.kind, "nod", "help: a nod, never a credit line");
  j.at(400).ev("q_open", { code: "C" });
  j.at(410).ev("pick", { choice: "A", verdict: "wrong" });
  assert.equal(j.at(414).ev("pick", { choice: "B", verdict: "correct" }), null, "a fix 4 s after the miss = lucky: silent");
});

test("W96 (a) comeback keeps the caps: 1 seen per item, SEEN.MAX per session; a nudge on the item does not eat the comeback", () => {
  const j = session({}, { on: ["S6"], seenLines: SEENL, rand: lowRoll, lines: { S6: ["x"] }, say: () => true });
  const got = [];
  for (let k = 0; k < 5; k++) {
    const t0 = k * 300;
    j.at(t0).ev("q_open", { code: "I" + k });
    j.at(t0 + 10).ev("pick", { choice: "A", verdict: "wrong" });
    j.at(t0 + 15).nudgeEnd(true);
    got.push(!!j.at(t0 + 40).ev("pick", { choice: "B", verdict: "correct" }));
  }
  assert.deepEqual(got, [true, true, true, false, false], "MAX = " + W96.SEEN.MAX + " per session");
});

test("W96 (b) away >= AWAY_STALL_S counts toward S2 depth on return (it used to give a fresh step); a short away still does", () => {
  const j = session({}, { on: [] });
  j.at(0).ev("q_open", { code: "A" });
  j.at(10).vis(true); j.at(10 + W96.AWAY_STALL_S + 80).vis(false);
  assert.ok(why(j, "S2"), "a long away = stall depth on return: " + JSON.stringify(j.state().lines));
  const k = session({}, { on: [] });
  k.at(0).ev("q_open", { code: "A" });
  k.at(30).vis(true); k.at(30 + W96.AWAY_STALL_S - 5).vis(false); k.tick();
  assert.equal(why(k, "S2"), undefined, "a shorter away = a fresh step");
  const b = session({}, { on: [] });                                     // a window blur the same way
  b.at(0).ev("q_open", { code: "A" });
  b.at(5).away("blur", true); b.at(5 + W96.AWAY_STALL_S + 90).away("blur", false);
  assert.ok(why(b, "S2"), "blur too");
});

test("W96 (b) the long-away S2 lands before the first input on return can reset it, and may draw the S2 nudge", () => {
  const said = [];
  const j = session({}, { on: ["S2"], rand: lowRoll, lines: { S2: ["s2"] }, say: (l, st) => { said.push(st); return true; } });
  j.at(0).ev("q_open", { code: "A" });
  j.at(20).vis(true); j.at(300).vis(false); j.at(301).input("pointerdown"); j.at(305).tick();
  assert.deepEqual(said, ["S2"]);
});

test("W96 (c) thresholds: S6 at 1 wrong pick (S6_WRONG 2→1); S2 fallback 80→45 s; GAP_S 180→90 s", () => {
  assert.equal(W96.S6_WRONG, 1); assert.equal(W96.p75([]), 45); assert.equal(W96.NUDGE.GAP_S, 90);
  const j = session({}, { on: [] });
  j.at(0).ev("q_open", { code: "A" }); j.at(10).ev("pick", { choice: "A", verdict: "wrong" });
  assert.equal(why(j, "S6"), "wrong=1");
  const k = session({}, { on: [] });
  k.at(0).ev("q_open", { code: "A" }); k.at(46).tick();
  assert.equal(why(k, "S2"), "depth=1 p75=45s");
});

test("W96 (d) stemWords: a P3X-shaped item (md = an array of lines, a graph block, no top-level string md) counts its real stem", () => {
  const p3x = { code: "PHYS_Y2V", type: "num", body: [
    { type: "text", md: ["A water molecule has two hydrogen atoms.", "", "Given:", "- $r = 0.094$ nm"] },
    { type: "graph", kind: "scene", alt: "O at the origin.", marks: [] }] };
  assert.equal(W96.stemWords(p3x), 7 + 1 + 4, "array md counted, graph alt not");
  assert.equal(W96.stemWords({ body: [{ type: "text", md: "one two three" }] }), 3, "a string md as before");
  assert.equal(W96.stemWords({ body: [{ type: "text", md: "Shared givens here" }], parts: [{ prompt: "Find x" }, { prompt: ["Then", "find y"] }] }), 3 + 2 + 3, "multi prompts are stem too");
  assert.equal(W96.stemWords({}), 0); assert.equal(W96.stemWords(null), 0);
});

test("W96 (d) the page's size(): a P3X bank item opens with its real w= (was w=0)", () => {
  const { win, args } = load();
  win.stemBank = { get: c => c === "PHYS_Y2V" ? { type: "num", body: [{ type: "text", md: ["Both H atoms are below O.", "The origin is at O."] }] } : null };
  win.stemT("q_open", { code: "PHYS_Y2V", type: "num" });
  assert.ok(win.stemJev().lines[0].endsWith("PHYS_Y2V num w=10"), win.stemJev().lines[0]);
  assert.ok(args.length >= 1);
});
