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
function load({ search = "", store = {}, tele, duck, rand } = {}) {
  const listeners = {}, timers = [], clock = { t: 0 };
  const on = (k, f) => { listeners[k] = f; };
  const win = {
    location: { search }, navigator: {}, URLSearchParams, performance: { now: () => clock.t },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, addEventListener: on }, addEventListener: on,
    setInterval: f => timers.push(f), stemT: () => {}, __stemNudgeLines: LINES,
  };
  if (tele) win.__stemTelemetry = tele;
  if (duck) win.stemDuck = duck;
  if (rand) win.__stemJevRand = rand;
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

test("flag off / DNT / GPC / stem-t-off: the peek is never asked", () => {
  const calls = [], duck = { say: () => { calls.push(1); return true; } };
  for (const o of [{}, { store: { "stem-jev": "1" }, tele: { optedOut: () => true, userOff: () => false } },
    { store: { "stem-jev": "1" }, tele: { optedOut: () => false, userOff: () => true } }]) {
    const { win, timers } = load({ ...o, duck, rand: () => 0 });
    win.stemT("q_open", { code: "A" });
    assert.equal(timers.length, 0); assert.equal(win.stemJev, undefined);
  }
  assert.equal(calls.length, 0);
});

/* the lines: sense the moment, never name it (cluck-nudge.md pick 3) */
const BAN = /\b(stuck|frustrat\w*|anxi\w*|worr\w*|stress\w*|upset|sad|angry|mad|confus\w*|overwhelm\w*|scar\w*|afraid|nervous|panic\w*|tired|bored|struggl\w*|annoy\w*|hard|difficult|lost|give up|quit\w*|fail\w*|feel\w*|seem\w*|look like you|great|good job|well done|streak)\b/i;

test("lines: ≥ 6 per state, ≤ 8 words, no emotion / state word, no guilt or praise, unique, 0 aiw findings", () => {
  assert.deepEqual(Object.keys(LINES).sort(), ["Q", "S2", "S6"]);
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
