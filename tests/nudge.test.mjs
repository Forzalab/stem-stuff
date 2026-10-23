// J5 Cluck nudge, Tier 0 (intent.js + copy/nudge-lines.js; brain cluck-nudge.md 🔒): the shared budget, the caps, the dismiss back-off,
// no nudge in F flow / while typing / hidden, the seam to peek.js (stemDuck.say), and the authored lines (≤ 8 words, no emotion named,
// 0 findings from the vendored aiw detector, tests/vendor/aiw, MIT, run as data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const SRC = read("../intent.js");
const LINES = (() => { const w = {}; w.window = w; vm.runInNewContext(read("../copy/nudge-lines.js"), w); return JSON.parse(JSON.stringify(w.__stemNudgeLines)); })();
const AIW = (() => { const m = { exports: {} }; vm.runInNewContext(read("vendor/aiw/patterns.js"), { module: m, console }); return m.exports; })();

/* a fake browser with a clock the test moves (clock.t ms) */
function load({ search = "", store = {}, tele, duck, rand, doc } = {}) {
  const listeners = {}, timers = [], clock = { t: 0 };
  const on = (k, f) => { listeners[k] = f; };
  const win = {
    location: { search }, navigator: {}, URLSearchParams, performance: { now: () => clock.t },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, addEventListener: on, ...doc }, addEventListener: on,
    setInterval: f => timers.push(f), stemT: () => {}, __stemNudgeLines: LINES,
  };
  if (tele) win.__stemTelemetry = tele;
  if (duck) win.stemDuck = duck;
  if (rand) win.__stemJevRand = rand;
  if (doc && doc.MO) win.MutationObserver = doc.MO;
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, store, listeners, timers, clock };
}
const API = load().win.__stemJev;

/* one session on a fake clock; o = create()'s options (say defaults to "the peek showed it") */
function session(o = {}, hist) {
  let t = 0;
  const said = [];
  const j = API.create(() => t, hist, { lines: LINES, say: (line, st) => { said.push([st, line]); return true; }, ...o });
  j.at = x => { t = x * 1000; return j; };
  j.said = said;
  j.n = () => j.state().nudge.n;
  return j;
}
/* a seeded roll so the budget runs are the same every time */
const lcg = (s = 1) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

test("budget: the per-state roll keeps P(any nudge | all 3 live) = 0.85 × P(nudge | one)", () => {
  const { NUDGE, share, chance } = API;
  assert.deepEqual([...NUDGE.STATES], ["S2", "S6", "Q"]);
  assert.equal(share(1), 1); assert.equal(share(3), NUDGE.SHARE_ALL); assert.ok(share(2) < 1 && share(2) > NUDGE.SHARE_ALL);
  assert.equal(chance(1), NUDGE.P_ONE);
  for (const k of [2, 3]) assert.ok(Math.abs(1 - (1 - chance(k)) ** k - NUDGE.P_ONE * share(k)) < 1e-12, "k=" + k);
  assert.equal(session().state().nudge.p, chance(3));
  assert.equal(session({ on: ["S2"] }).state().nudge.p, NUDGE.P_ONE);

  /* the same rolls, run: all 3 live on one item (S6 at the 2nd wrong pick, then S2 depth 2 + Q "left before") vs S2 alone */
  const N = 20000, rand = lcg(7);
  let all = 0, one = 0;
  for (let i = 0; i < N; i++) {
    const a = session({ rand, quits: { A: 1 } });
    a.at(0).ev("q_open", { code: "A" }); a.at(10).ev("pick", { choice: "A", verdict: "wrong" }); a.at(20).ev("pick", { choice: "B", verdict: "wrong" });
    a.at(181).tick();
    assert.equal(a.state().counts.S6 + a.state().counts.Q + (a.state().counts.S2 >= 1), 3, "all three live");
    all += a.n();
    const b = session({ rand, on: ["S2"] });
    b.at(0).ev("q_open", { code: "A" }); b.at(161).tick();
    one += b.n();
  }
  const pAll = all / N, pOne = one / N;
  assert.ok(Math.abs(pOne - NUDGE.P_ONE) < 0.015, "one: " + pOne);
  assert.ok(Math.abs(pAll - NUDGE.P_ONE * NUDGE.SHARE_ALL) < 0.015, "all: " + pAll);
  assert.ok(Math.abs(pAll / pOne - NUDGE.SHARE_ALL) < 0.03, "ratio: " + pAll / pOne);
});

test("caps: S2 waits for depth 2; 1 per item; ≥ 3 min between; a dismiss doubles the gap, a tap does not", () => {
  const j = session({ rand: () => 0, on: ["S2"] });
  j.at(0).ev("q_open", { code: "A" });
  j.at(81).tick(); assert.equal(j.n(), 0, "depth 1: no nudge");
  j.at(161).tick(); assert.equal(j.n(), 1);
  assert.equal(j.state().last.action, "cluck_say"); assert.equal(j.state().nudge.last.state, "S2");
  assert.ok(LINES.S2.includes(j.said[0][1]));
  j.at(165).tick(); assert.equal(j.n(), 1, "1 per item");

  j.at(170).ev("q_open", { code: "B" }); j.at(331).tick();
  assert.equal(j.n(), 1, "only 170 s since the last one");
  j.at(342).tick(); assert.equal(j.n(), 2, "the roll was held, not spent");
  assert.notEqual(j.said[1][1], j.said[0][1], "never the same line twice in a row");

  j.nudgeEnd(false);
  assert.equal(j.state().nudge.gap, 360); assert.equal(j.state().nudge.dismissed, 1);
  j.nudgeEnd(false); assert.equal(j.state().nudge.gap, 360, "one end per nudge");
  j.at(350).ev("q_open", { code: "C" }); j.at(511).tick(); j.at(701).tick();
  assert.equal(j.n(), 2, "359 s: still inside the doubled gap");
  j.at(703).tick(); assert.equal(j.n(), 3);
  j.nudgeEnd(true);
  assert.equal(j.state().nudge.gap, 360, "a tap keeps the gap"); assert.equal(j.state().nudge.taps, 1);
});

test("never in F flow, while typing, or hidden; a busy peek spends that roll", () => {
  const f = session({ rand: () => 0 });
  f.at(0).ev("q_open", { code: "A" }); f.at(10).ev("pick", { choice: "A", verdict: "correct" });
  f.at(20).ev("q_open", { code: "B" }); assert.equal(f.state().flowRun, 1);
  f.at(181).tick(); assert.equal(f.state().counts.S2, 1); assert.equal(f.n(), 0, "flow run alive");
  f.at(190).ev("pick", { choice: "B", verdict: "wrong" }); f.at(351).tick();
  assert.equal(f.n(), 1, "a wrong pick ends the flow guard");

  const k = session({ rand: () => 0 });
  k.at(0).ev("q_open", { code: "A" }); k.at(30).ev("pick", { choice: "A", verdict: "wrong" });
  k.at(59).input("keydown"); k.at(60).ev("pick", { choice: "B", verdict: "wrong" });
  assert.equal(k.state().counts.S6, 1); assert.equal(k.n(), 0, "a key 1 s ago");
  k.at(61.9).tick(); assert.equal(k.n(), 0);
  k.at(63).tick(); assert.equal(k.n(), 1); assert.equal(k.said[0][0], "S6");

  const h = session({ rand: () => 0 });
  h.at(0).ev("q_open", { code: "A" }); h.at(1).vis(true); h.at(900).tick();
  assert.equal(h.n(), 0, "hidden");

  const b = session({ rand: () => 0, on: ["S2"], say: () => false });
  b.at(0).ev("q_open", { code: "A" }); b.at(161).tick(); b.at(400).tick();
  assert.equal(b.n(), 0);
  assert.ok(b.state().lines.some(l => l.endsWith("nudge S2 busy")));
});

test("S6: 2 wrong picks alone; not when Cluck was asked, the item is solved, or skill is high", () => {
  const j = session({ on: [] });
  const item = (code, t0, ...v) => { j.at(t0).ev("q_open", { code }); v.forEach((x, i) => j.at(t0 + 10 * (i + 1)).ev("pick", { choice: "ABCD"[i], verdict: x })); };
  item("A", 0, "wrong", "wrong"); assert.equal(j.state().counts.S6, 1);
  item("B", 100, "wrong", "correct", "wrong"); assert.equal(j.state().counts.S6, 1, "solved");
  j.at(200).ev("q_open", { code: "C" }); j.at(203).ev("cluck_open", { tab: "ask" });
  j.at(210).ev("pick", { verdict: "wrong" }); j.at(220).ev("pick", { verdict: "wrong" });
  assert.equal(j.state().counts.S6, 1, "asked");
  for (let i = 0; i < 8; i++) item("H" + i, 300 + 100 * i, "correct");
  item("Z", 1200, "wrong", "wrong"); assert.equal(j.state().counts.S6, 1, "skill high: retrying alone is fine");
});

test("Q: the first item with no pick, or an item left unsolved before; pagehide counts a leave", () => {
  const j = session({ on: [] });
  j.at(0).ev("q_open", { code: "A" }); j.at(81).tick();
  assert.equal(j.state().counts.Q, 1);
  const quits = { B: 1 };
  const k = session({ on: [], quits });
  k.at(0).ev("q_open", { code: "A" }); k.at(5).ev("pick", { verdict: "correct" });
  k.at(10).ev("q_open", { code: "B" }); k.at(91).tick(); assert.equal(k.state().counts.Q, 0, "depth 1");
  k.at(171).tick(); assert.equal(k.state().counts.Q, 1);
  assert.equal(k.leave(), true); assert.equal(quits.B, 2);
  k.at(180).ev("pick", { verdict: "correct" }); assert.equal(k.leave(), false, "solved: no leave");
});

test("wiring: ?jev=1 → stemDuck.say gets a pool line; away → the gap doubles; pagehide stores stem-jev-q", () => {
  const calls = [];
  const duck = { say: (line, o) => { calls.push([line, o]); return true; } };
  const { win, timers, clock, listeners, store } = load({ search: "?jev=1", duck, rand: () => 0 });
  win.stemT("q_open", { code: "A" });
  clock.t = 161000; timers[0]();
  assert.equal(calls.length, 1); assert.ok(LINES.S2.includes(calls[0][0]));
  calls[0][1].onAway();
  assert.equal(win.stemJev().nudge.gap, 360);
  listeners.pagehide();
  assert.equal(JSON.parse(store["stem-jev-q"]).A, 1);
});

test("?jev=0 / DNT / GPC / stem-t-off: the peek is never asked", () => {
  const calls = [], duck = { say: () => { calls.push(1); return true; } };
  for (const o of [{ search: "?jev=0" }, { search: "?jev=1", tele: { optedOut: () => true, userOff: () => false } },
    { search: "?jev=1", tele: { optedOut: () => false, userOff: () => true } }]) {
    const { win, timers } = load({ ...o, duck, rand: () => 0 });
    win.stemT("q_open", { code: "A" });
    assert.equal(timers.length, 0); assert.equal(win.stemJev, undefined);
  }
  assert.equal(calls.length, 0);
});

/* the lines: sense the moment, never name it (cluck-nudge.md pick 3) */
const BAN = /\b(stuck|frustrat\w*|anxi\w*|worr\w*|stress\w*|upset|sad|angry|mad|confus\w*|overwhelm\w*|scar\w*|afraid|nervous|panic\w*|tired|bored|struggl\w*|annoy\w*|hard|difficult|lost|give up|quit\w*|fail\w*|feel\w*|seem\w*|look like you|great|good job|well done|streak)\b/i;

test("lines: ≥ 6 per state, ≤ 8 words, no emotion / state word, no guilt or praise, unique, 0 aiw findings", () => {
  assert.deepEqual(Object.keys(LINES).sort(), ["Q", "S2", "S6", "hold_arrow", "hold_end", "hold_mid"]);
  const seen = new Set();
  for (const [st, ls] of Object.entries(LINES)) {
    assert.ok(ls.length >= 6, st);
    for (const l of ls) {
      assert.ok(l.split(/\s+/).length <= 8, l);
      assert.ok(l.length <= 34, "one line at 390 px: " + l);
      assert.doesNotMatch(l, BAN);
      assert.doesNotMatch(l, /\b(S2|S6|impasse|avoid\w*)\b|—|!/, l);
      assert.ok(!seen.has(l), "dupe: " + l); seen.add(l);
      const r = AIW.analyzeText(l);
      assert.equal(r.issues.length, 0, l + ": " + r.issues.map(i => i.type));
    }
  }
});

test("the detector itself still bites (so 0 findings above means something)", () => {
  assert.ok(AIW.analyzeText("It is not just a tool, it is a game-changer. Delve into the rich tapestry.").issues.length >= 2);
});

test("a nudge put away by the tap that opens Cluck counts as taken (Tony's dump, Oct 19: away then cluck open 0.2 s later)", () => {
  const j = session({ rand: () => 0, on: ["S2"] });
  j.at(0).ev("q_open", { code: "A" }); j.at(161).tick(); assert.equal(j.n(), 1);
  j.at(162).nudgeEnd(false); assert.equal(j.state().nudge.gap, 360);
  j.at(162.2).ev("cluck_open", { tab: "explain" });
  assert.equal(j.state().nudge.gap, 180, "the doubled gap is undone"); assert.equal(j.state().nudge.taps, 1); assert.equal(j.state().nudge.dismissed, 0);
  j.at(170).ev("q_open", { code: "B" }); j.at(331).tick(); j.at(342).tick(); assert.equal(j.n(), 2, "the 180 s gap holds");
  j.at(343).nudgeEnd(false); j.at(346).ev("cluck_open", {});
  assert.equal(j.state().nudge.gap, 360, "3 s later: a real dismiss"); assert.equal(j.state().nudge.dismissed, 1);
  j.at(400).ev("q_open", { code: "C" }); j.at(561).tick(); j.at(703).tick(); assert.equal(j.n(), 3);
  j.at(704).ev("cluck_open", {}); assert.equal(j.state().nudge.taps, 2, "opened with the nudge still up: taken");
  j.nudgeEnd(false); assert.equal(j.state().nudge.dismissed, 1, "the peek's late away is ignored");
});

/* ---- ladder lane 4: the held pick (a choice selected, not checked) past 1×p75 → one ladder piece + one breadcrumb (brain feedback-specs B) ---- */
function holder(o = {}, hist) {
  const steps = o.steps || ["mid", "mid", "arrow"], did = [];
  const j = session({ step: () => { const k = steps.shift() || ""; did.push(k); return k; }, ...o }, hist);
  j.did = did;
  const tick = j.tick; j.tick = x => { j.at(x); tick(); return j; };
  j.h = () => ({ ...j.state().hold });                                  // a plain object of this realm (deepEqual)
  return j;
}

test("hold: 20 s fallback (< 4 samples), one ladder piece + a hold_mid line, then another p75 for the next", () => {
  const j = holder();
  j.at(0).ev("q_open", { code: "A" });
  j.at(2).input("pointerdown"); j.ev("_hold", { choice: "B" });
  j.tick(21);
  assert.equal(j.h().n, 0, "19 s held: not yet");
  j.tick(22.5);
  assert.equal(j.h().n, 1); assert.deepEqual(j.did, ["mid"]);
  assert.equal(j.said.at(-1)[0], "hold_mid"); assert.ok(LINES.hold_mid.includes(j.said.at(-1)[1]));
  j.at(30).input("wheel");
  j.tick(45); assert.equal(j.h().n, 1, "the clock restarts at the input");
  j.tick(50.5); assert.equal(j.h().n, 2);
});

test("hold: 1×p75 with ≥ 4 samples; S2's own nudge keeps 2×p75 / 80 s", () => {
  const j = holder({}, { A: [10, 10, 12, 12] });
  assert.equal(API.p75([10, 10, 12, 12], API.HOLD.FALLBACK_S), 12);
  assert.equal(API.p75([1], API.HOLD.FALLBACK_S), 20); assert.equal(API.p75([1]), 80);
  j.at(0).ev("q_open", { code: "A" }); j.ev("_hold", { choice: "B" });
  j.tick(11); assert.equal(j.h().n, 0);
  j.tick(12); assert.equal(j.h().n, 1);
  assert.equal(API.NUDGE.S2_DEPTH, 2);
});

test("hold: cap 3, a 4th never fires; an empty ladder still says the vague hold_end line", () => {
  const j = holder({ steps: ["mid"] });
  j.at(0).ev("q_open", { code: "A" }); j.ev("_hold", { choice: "C" });
  let t = 0;
  for (let i = 0; i < 6; i++) { t += 21; j.tick(t); j.at(t + 1).input("pointerdown"); t += 1; }
  assert.equal(j.h().n, 3);
  assert.deepEqual(j.said.map(x => x[0]), ["hold_mid", "hold_end", "hold_end"]);
  assert.ok(j.said.every(([k, l]) => LINES[k].includes(l)));
});

test("hold: stalling is normal idling: a zero-input 2nd and 3rd still fire, each after another p75; no freeze (Tony Oct 23)", () => {
  const j = holder();
  j.at(0).ev("q_open", { code: "A" }); j.ev("_hold", { choice: "B" });
  j.tick(21); assert.equal(j.h().n, 1);
  j.tick(40); assert.equal(j.h().n, 1, "not before another 20 s");
  j.tick(42); assert.equal(j.h().n, 2);
  j.tick(63); assert.equal(j.h().n, 3);
  j.tick(200); assert.equal(j.h().n, 3, "cap 3");
  assert.deepEqual(j.did, ["mid", "mid", "arrow"]);
  assert.deepEqual(j.h(), { code: "A", n: 3 });
  assert.ok(!j.state().lines.some(l => /farm/.test(l)));
  j.at(201).ev("q_open", { code: "B" });
  assert.deepEqual(j.h(), { code: "B", n: 0 });
});

test("hold: none without a held pick, after a check, while typing, hidden, or with Cluck's sheet open", () => {
  const a = holder(); a.at(0).ev("q_open", { code: "A" }); a.tick(30); assert.equal(a.h().n, 0, "no pick held");
  const b = holder(); b.at(0).ev("q_open", { code: "A" }); b.ev("_hold", { choice: "B" }); b.at(5).ev("pick", { choice: "B", verdict: "wrong" });
  b.tick(40); assert.equal(b.h().n, 0, "checked = not held");
  const c = holder(); c.at(0).ev("q_open", { code: "A" }); c.ev("_hold", { choice: "B" }); c.ev("_hold", { choice: "" }); c.tick(30); assert.equal(c.h().n, 0, "deselected");
  const d = holder(); d.at(0).ev("q_open", { code: "A" }); d.ev("_hold", { choice: "B" }); d.at(20).input("keydown"); d.tick(41); assert.equal(d.h().n, 1);
  d.at(61).input("keydown"); d.tick(63); assert.equal(d.h().n, 1, "typing");
  const e = holder(); e.at(0).ev("q_open", { code: "A" }); e.ev("_hold", { choice: "B" }); e.vis(true); e.tick(30); assert.equal(e.h().n, 0, "hidden");
  const f = holder(); f.at(0).ev("q_open", { code: "A" }); f.ev("_hold", { choice: "B" }); f.ev("cluck_open", { tab: "chat" }); f.tick(30); assert.equal(f.h().n, 0, "sheet open");
  f.at(31).ev("cluck_dwell"); f.tick(52); assert.equal(f.h().n, 1, "sheet closed: back on");
});

test("hold: the peek busy still pops the piece; no piece and no peek = nothing counted", () => {
  const a = holder({ say: () => false });
  a.at(0).ev("q_open", { code: "A" }); a.ev("_hold", { choice: "B" }); a.tick(21);
  assert.equal(a.h().n, 1); assert.deepEqual(a.did, ["mid"]);
  const b = holder({ say: () => false, steps: [] });
  b.at(0).ev("q_open", { code: "A" }); b.ev("_hold", { choice: "B" }); b.tick(21);
  assert.equal(b.h().n, 0);
});

test("hold: the page wrapper reads #q's aria-checked (MutationObserver) and steps window.stemLadder", () => {
  const calls = [], duck = { say: line => { calls.push(line); return true; } };
  let fire = null, sel = null, mids = 0;
  const MO = function (f) { this.observe = (el, o) => { assert.deepEqual([...o.attributeFilter], ["aria-checked"]); fire = f; }; };
  const doc = { MO, documentElement: {}, querySelector: q => q === "#q .opt[aria-checked=true]" ? sel : null,
    querySelectorAll: q => ({ length: q === "#fcard li.mid:not([hidden])" ? mids : 0 }) };
  const { win, timers, clock } = load({ search: "?jev=1", duck, rand: () => 0.99, doc });
  win.stemLadder = { step: () => { mids++; return true; } };
  win.stemT("q_open", { code: "A" });
  sel = { getAttribute: k => k === "data-id" ? "C" : null }; fire();
  clock.t = 21000; timers[0]();
  assert.equal(mids, 1); assert.equal(calls.length, 1); assert.ok(LINES.hold_mid.includes(calls[0]));
  assert.deepEqual({ ...win.stemJev().hold }, { code: "A", n: 1 });
});

