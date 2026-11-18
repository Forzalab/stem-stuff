// JEV-DET 3: scripted Jev decisions with no browser. intent.js runs in a vm with a fake window + a fake clock, exactly like
// tests/nudge.test.mjs; every roll is a fixed die (o.rand), so each case is a fixed (question, UI history) -> exact speak / silent.
// The nudge line pool has one line per state, so the line string is the decision id (J5 nudge lines have no ids of their own).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const SRC = read("../client/cluck/jev_nudges/intent.js");

const POOL = { S2: ["s2-line"], S6: ["s6-line"], Q: ["q-line"] };

/* a fake browser with a clock the test moves (clock.t ms); ?jev=0 = intent.js's pure path (no listeners, no timers, no Math.random) */
function load({ search = "?jev=0", store = {} } = {}) {
  const listeners = {}, timers = [], clock = { t: 0 };
  const on = (k, f) => { listeners[k] = f; };
  const win = {
    location: { search }, navigator: {}, URLSearchParams,
    performance: { now: () => clock.t },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, addEventListener: on },
    addEventListener: on, setInterval: f => timers.push(f), stemT: () => {},
    __stemNudgeLines: POOL,
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, store, listeners, timers, clock };
}
const API = load().win.__stemJev;

/* one session on a fake clock; o = create()'s options (say defaults to "the peek showed it") */
function session(o = {}, hist) {
  let t = 0;
  const said = [];
  const j = API.create(() => t, hist, {
    lines: POOL,
    say: (line, st) => { said.push([st, line]); return true; },
    quits: {},
    ...o,
  });
  j.at = x => { t = x * 1000; return j; };
  j.said = said;
  return j;
}
const plain = x => JSON.parse(JSON.stringify(x));   // out of the vm realm, so deepEqual compares plain values
const noDie = () => { throw new Error("the state half read the die"); };

/* rule 4-PRE: first the history alone (on: [], no die read) must put every named state on; then the same history + one fixed die.
   Every assert says "state:" or "roll:" so a red names the broken half. */
function twoPhase(states, history, die, makeExtra = () => ({})) {
  const probe = session({ ...makeExtra(), on: [], rand: noDie });
  history(probe);
  const c = probe.state().counts;
  for (const s of states) assert.ok(c[s] >= 1, `state: ${s} fired from the history alone (counts ${JSON.stringify(c)})`);
  return rollOnly(states, history, die, makeExtra);
}

/* the roll half alone, for the OFF twin of a minimal pair (its "state:" assert is the caller's counts/depth check) */
function rollOnly(states, history, die, makeExtra = () => ({})) {
  const game = session({ ...makeExtra(), on: states, rand: () => die });
  assert.deepEqual([...game.state().nudge.on], states, `state: nudge.on is ${states.join("+")}`);
  history(game);
  return game;
}

const q = (code = "A", extra = {}) => ({ code, ...extra });
const hS2 = j => { j.at(0).ev("q_open", q()); j.at(91).tick(); };
const hS6 = j => { j.at(0).ev("q_open", q()); j.at(10).ev("pick", { choice: "A", verdict: "wrong" }); j.at(16).tick(); };
const hQ = j => { j.at(0).ev("q_open", q()); j.at(81).tick(); };
const hS2S6 = j => { j.at(0).ev("q_open", q()); j.at(10).ev("pick", { choice: "A", verdict: "wrong" }); j.at(100).tick(); };
const extraAll = () => ({ quits: { A: 1 } });       // a past leave on A: S2 + S6 + Q all live
const depth = j => {                                // the S2 depth in the log (counts.S2 also counts depth 1, which is not a nudge state)
  const xs = j.state().lines.filter(l => /  jev  S2 depth=/.test(l));
  return xs.length ? Number(/depth=(\d+)/.exec(xs[xs.length - 1])[1]) : 0;
};

test("1 scripted: fixed question + UI history -> the exact Jev decision (speak line id / silent)", () => {
  const s2 = twoPhase(["S2"], hS2, 0);
  assert.deepEqual(plain(s2.said), [["S2", "s2-line"]], "roll: S2 history speaks s2-line");
  const s6 = twoPhase(["S6"], hS6, 0);
  assert.deepEqual(plain(s6.said), [["S6", "s6-line"]], "roll: S6 history speaks s6-line");
  const qq = twoPhase(["Q"], hQ, 0);
  assert.deepEqual(plain(qq.said), [["Q", "q-line"]], "roll: Q history speaks q-line");
  const flow = twoPhase(["S2"], j => {               // F flow alive, no wrong pick on this item: S2 is live but held
    j.at(0).ev("q_open", q());
    j.at(10).ev("pick", { choice: "A", verdict: "correct" });
    j.at(20).ev("q_open", q("B"));
    j.at(111).tick();
  }, 0);
  assert.equal(flow.state().flowRun, 1, "state: an F run is alive");
  assert.deepEqual(plain(flow.said), [], "roll: a flow run stays silent");
});

test("3 (4a) boundary: die just under p fires, just over p is silent; p read from the module", () => {
  const N = API.NUDGE, EPS = 1e-9;
  const cases = [
    ["S2", ["S2"], hS2, N.P_ONE, () => ({})],
    ["S6", ["S6"], hS6, N.P_ONE, () => ({})],
    ["Q", ["Q"], hQ, N.P_ONE, () => ({})],
    ["S2+S6", ["S2", "S6"], hS2S6, API.chance(2), () => ({})],
    ["S2+S6+Q", ["S2", "S6", "Q"], hS2S6, API.chance(3), extraAll],
  ];
  for (const [name, states, h, p, extra] of cases) {
    const under = twoPhase(states, h, p - EPS, extra);
    assert.equal(under.said.length, 1, `roll: ${name} fires at die p-1e-9 (p=${p})`);
    assert.equal(under.said[0][0], states[0], `roll: ${name} speaks the first live state`);
    const over = twoPhase(states, h, p + EPS, extra);
    assert.deepEqual(plain(over.said), [], `roll: ${name} is silent at die p+1e-9 (p=${p})`);
  }
});

test("4 (4b) share formula: 1-(1-p_k)^k == P_ONE x share(k) for every k the module uses", () => {
  const { NUDGE, share, chance } = API;
  const kMax = NUDGE.STATES.length;
  assert.equal(kMax, 3, "the three nudge states S2, S6, Q");
  for (let k = 1; k <= kMax; k++) {
    const p = chance(k), lhs = 1 - (1 - p) ** k, rhs = NUDGE.P_ONE * share(k);
    assert.ok(Math.abs(lhs - rhs) < 1e-12, `k=${k}: 1-(1-p)^k=${lhs} vs P_ONE*share(k)=${rhs}`);
    const j = session({ on: NUDGE.STATES.slice(0, k), rand: noDie });
    assert.equal(j.state().nudge.p, p, `k=${k}: create() rolls chance(${k})`);
  }
});

test("5 (4c) evenly spaced die: u_i=(i+0.5)/n fires exactly round(n*p) times", () => {
  const probe = session({ on: [], rand: noDie });
  hS2(probe);
  assert.ok(probe.state().counts.S2 >= 1, "state: S2 fired from the history alone");
  const cfg = session({ on: ["S2"], rand: noDie });
  assert.deepEqual([...cfg.state().nudge.on], ["S2"], "state: only S2 is on");
  const p = cfg.state().nudge.p;
  assert.equal(p, API.NUDGE.P_ONE, "state: one live state rolls P_ONE");
  for (const n of [20, 50, 100]) {
    let fires = 0;
    for (let i = 0; i < n; i++) {
      const j = session({ on: ["S2"], rand: () => (i + 0.5) / n });
      hS2(j);
      if (j.said.length) fires++;
    }
    assert.equal(fires, Math.round(n * p), `roll: n=${n} fires=${fires} round(n*p)=${Math.round(n * p)}`);
  }
});

test("6 (6b) minimal pairs: one event flips S2 / S6 / Q on or off", () => {
  const fallback = API.p75([1]);                     // S2_FALLBACK_S (intent.js:46), < 4 samples
  const over = 2 * fallback + 0.1, under = 2 * fallback - 0.1;

  // S2: the tick just over the depth-2 threshold vs just under it.
  const s2h = at => j => { j.at(0).ev("q_open", q()); j.at(at).tick(); };
  const s2on = session({ on: [], rand: noDie }); s2h(over)(s2on);
  const s2off = session({ on: [], rand: noDie }); s2h(under)(s2off);
  assert.equal(depth(s2on), 2, "state: S2 depth 2 just over the 2xp75 threshold");
  assert.equal(depth(s2off), 1, "state: S2 depth 1 just under it (not live)");
  const s2fire = rollOnly(["S2"], s2h(over), 0);
  assert.deepEqual(plain(s2fire.said), [["S2", "s2-line"]], "roll: the S2 twin fires");
  const s2quiet = rollOnly(["S2"], s2h(under), 0);
  assert.deepEqual(plain(s2quiet.said), [], "roll: the S2 twin is silent");

  // S6: one wrong pick vs none.
  const s6h = wrong => j => { j.at(0).ev("q_open", q()); if (wrong) j.at(10).ev("pick", { choice: "A", verdict: "wrong" }); j.at(16).tick(); };
  const s6on = session({ on: [], rand: noDie }); s6h(true)(s6on);
  const s6off = session({ on: [], rand: noDie }); s6h(false)(s6off);
  assert.equal(s6on.state().counts.S6, 1, "state: one wrong pick puts S6 on");
  assert.equal(s6off.state().counts.S6, 0, "state: no wrong pick leaves S6 off");
  const s6fire = rollOnly(["S6"], s6h(true), 0);
  assert.deepEqual(plain(s6fire.said), [["S6", "s6-line"]], "roll: the S6 twin fires");
  const s6quiet = rollOnly(["S6"], s6h(false), 0);
  assert.deepEqual(plain(s6quiet.said), [], "roll: the S6 twin is silent");

  // Q: a pagehide leave on an unsolved item vs none (the rest of the history is identical).
  const qh = left => j => {
    j.at(0).ev("q_open", q("A"));
    j.at(10).ev("pick", { choice: "A", verdict: "correct" });
    j.at(20).ev("q_open", q("B"));
    j.at(30).ev("pick", { choice: "B", verdict: "wrong" });
    if (left) j.at(31).leave();
    j.at(140).tick();
  };
  const qon = session({ on: [], rand: noDie, quits: {} }); qh(true)(qon);
  const qoff = session({ on: [], rand: noDie, quits: {} }); qh(false)(qoff);
  assert.equal(qon.state().counts.Q, 1, "state: left-before puts Q on");
  assert.equal(qoff.state().counts.Q, 0, "state: no leave leaves Q off");
  const qfire = rollOnly(["Q"], qh(true), 0, () => ({ quits: {} }));
  assert.deepEqual(plain(qfire.said), [["Q", "q-line"]], "roll: the Q twin fires");
  const qquiet = rollOnly(["Q"], qh(false), 0, () => ({ quits: {} }));
  assert.deepEqual(plain(qquiet.said), [], "roll: the Q twin is silent");
});

test("7 (6c) placebo: a state off stays silent at die 0; a state on ignores the question code/text", () => {
  const off = session({ on: ["S2", "S6", "Q"], rand: () => 0 });   // no trigger at all: live() is empty
  off.at(0).ev("q_open", q());
  off.at(10).tick();
  assert.equal(off.state().counts.S2, 0, "state: no S2 depth");
  assert.equal(off.state().counts.S6, 0, "state: no wrong pick");
  assert.equal(off.state().counts.Q, 0, "state: no depth for Q");
  assert.deepEqual([...off.state().nudge.on], ["S2", "S6", "Q"], "state: all three are on");
  assert.deepEqual(plain(off.said), [], "roll: die 0.00 cannot nudge a state that is off");

  const a = twoPhase(["S2"], j => { j.at(0).ev("q_open", { code: "A", type: "mc", text: "2 + 2" }); j.at(91).tick(); }, 0);
  const b = twoPhase(["S2"], j => { j.at(0).ev("q_open", { code: "B", type: "proof", text: "x^2 + 1" }); j.at(91).tick(); }, 0);
  assert.deepEqual(plain(a.said), [["S2", "s2-line"]], "roll: question A fires");
  assert.deepEqual(plain(b.said), [["S2", "s2-line"]], "roll: question B makes the same decision (content is not read)");
});
