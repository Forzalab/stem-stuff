// J6 "seen", moment C (intent.js proposeSeen + the fire path, peek.js seam, copy/seen-lines.js): the trigger (PROVISIONAL: Tony is
// redesigning it), then everything that is NOT the trigger: caps (1 per item, MAX per session, flow, typing, shared gap), the quiet and
// kind rolls, no template twice, the off switches, the hollow tap, flag off = inert, and the line rules (Tony 19:3x: speak about the
// math, never echo the trigger). The real short-copy gate is aiw.py (tests/test_seen_lines.py); the vendored JS aiw is vacuous < 10 words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const SRC = read("../intent.js");
const run = (f, k) => { const w = {}; w.window = w; vm.runInNewContext(read(f), w); return JSON.parse(JSON.stringify(w[k])); };
const LINES = run("../copy/seen-lines.js", "__stemSeenLines"), NUDGE = run("../copy/nudge-lines.js", "__stemNudgeLines");
const AIW = (() => { const m = { exports: {} }; vm.runInNewContext(read("vendor/aiw/patterns.js"), { module: m, console }); return m.exports; })();

/* a fake browser with a clock the test moves (clock.t ms); sessionStorage is per load, localStorage is the shared `store` */
function load({ search = "", store = {}, tele, duck, rand, bank } = {}) {
  const listeners = {}, timers = [], later = [], clock = { t: 0 }, sess = {};
  const on = (k, f) => { listeners[k] = f; };
  const win = {
    location: { search }, navigator: {}, URLSearchParams, performance: { now: () => clock.t },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    sessionStorage: { getItem: k => sess[k] ?? null, setItem: (k, v) => { sess[k] = String(v); } },
    document: { hidden: false, addEventListener: on }, addEventListener: on,
    setInterval: f => timers.push(f), setTimeout: (f, ms) => later.push([f, ms]), stemT: () => {},
    __stemNudgeLines: NUDGE, __stemSeenLines: LINES,
  };
  if (tele) win.__stemTelemetry = tele;
  if (duck) win.stemDuck = duck;
  if (rand) win.__stemJevRand = rand;
  if (bank) win.stemBank = bank;
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, store, sess, listeners, timers, later, clock };
}
const API = load().win.__stemJev, SEEN = API.SEEN;

/* a scripted roll: the values in order, then 0.99 */
const script = (...xs) => () => xs.length ? xs.shift() : 0.99;
const lcg = (s = 1) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
/* a session with the J5 nudges off (so only moment C rolls); rolls per earned item: quiet, kind, template, delay */
function session(o = {}) {
  let t = 0;
  const j = API.create(() => t, o.hist, { on: [], seenLines: LINES, ...o });
  j.at = x => { t = x * 1000; return j; };
  return j;
}
/* an item that is earned: wrong (family e1) at +10, wrong (e2) at +20, right at +30; returns the right pick's result */
const earned = (j, t0, code, e1 = "negation", e2 = "sign") => {
  j.at(t0).ev("q_open", { code });
  j.at(t0 + 10).ev("pick", { choice: "A", verdict: "wrong", error: e1 });
  j.at(t0 + 20).ev("pick", { choice: "B", verdict: "wrong", error: e2 });
  return j.at(t0 + 30).ev("pick", { choice: "C", verdict: "correct" });
};
const R = (quiet = 0.9, kind = 0.5, tpl = 0, delay = 0) => script(quiet, kind, tpl, delay);
const plain = x => JSON.parse(JSON.stringify(x));   // out of the vm realm, so deepEqual compares plain values
const seenLog = j => j.state().lines.filter(l => /  seen  /.test(l));

/* ---- the trigger: PROVISIONAL, placeholder, Tony is redesigning it. These pin today's body only; they will be replaced ---- */
const S = (o = {}) => ({ solved: true, wrong: 2, deep: 0, help: false, s5: false, gaps: [12, 15, 10], errs: ["negation", "sign"], ...o });

test("PROVISIONAL proposeSeen: 2 wrong then right → one candidate {moment C, fam = the last wrong family, why}", () => {
  const c = API.proposeSeen(S());
  assert.equal(c.length, 1); assert.equal(c[0].moment, "C"); assert.equal(c[0].fam, "sign"); assert.equal(typeof c[0].why, "string");
});
test("PROVISIONAL proposeSeen: deep-only (S2 depth ≥ 1, no wrong pick) counts; no family → fam any", () => {
  const c = API.proposeSeen(S({ wrong: 0, deep: 1, errs: [], gaps: [95] }));
  assert.equal(c.length, 1); assert.equal(c[0].fam, "any");
});
test("PROVISIONAL proposeSeen: nothing for 1 wrong and no depth, unsolved, help, S5, or a fast median gap", () => {
  for (const o of [{ wrong: 1 }, { solved: false }, { help: true }, { s5: true }, { gaps: [3, 4, 20] }, { gaps: [] }])
    assert.deepEqual(plain(API.proposeSeen(S(o))), [], JSON.stringify(o));
  assert.deepEqual(plain(API.proposeSeen(null)), []);
  assert.equal(API.proposeSeen(S({ gaps: [8] })).length, 1, "median GAP_S exactly = earned");
});
test("PROVISIONAL the session feeds proposeSeen: help, S5 (fast repeat) and a quick run of picks are not earned", () => {
  const h = session({ rand: R() });
  h.at(0).ev("q_open", { code: "A" }); h.at(10).ev("pick", { choice: "A", verdict: "wrong" }); h.at(15).ev("cluck_open", { tab: "ask" });
  h.at(30).ev("pick", { choice: "B", verdict: "wrong" });
  assert.equal(h.at(50).ev("pick", { choice: "C", verdict: "correct" }), null, "help");
  const f = session({ rand: R() });
  f.at(0).ev("q_open", { code: "A" }); f.at(2).ev("pick", { choice: "A", verdict: "wrong" }); f.at(3).ev("pick", { choice: "B", verdict: "wrong" });
  assert.equal(f.at(4).ev("pick", { choice: "C", verdict: "correct" }), null, "S5 / fast gaps");
  assert.deepEqual(plain(seenLog(f)), []);
});

/* ---- the fire path ---- */
test("fire: an earned item returns { kind, line, delay, fam }, logs it, and takes the item + the shared gap", () => {
  const j = session({ rand: R(0.9, 0.5, 0, 0.5) });
  const r = earned(j, 0, "A");
  assert.equal(r.kind, "short"); assert.equal(r.fam, "sign"); assert.equal(r.line, LINES.fam.sign[0].text); assert.equal(r.id, "sgn-1");
  assert.equal(r.delay, SEEN.JIT_MS[0] + Math.floor(0.5 * (SEEN.JIT_MS[1] - SEEN.JIT_MS[0] + 1)));
  assert.ok(r.delay >= SEEN.JIT_MS[0] && r.delay <= SEEN.JIT_MS[1]);
  assert.match(seenLog(j).at(-1), /seen {2}C short sgn-1$/);
  assert.equal(j.state().seen.n, 1); assert.deepEqual(plain(j.state().seen.used), ["sgn-1"]);
  assert.equal(j.at(31).ev("pick", { choice: "C", verdict: "correct" }), null, "1 per item (a second right pick, e.g. a multi's next part)");
});
test("fire: nod has no text; quiet logs `seen C quiet` and returns nothing, once per item", () => {
  const n = earned(session({ rand: R(0.9, 0.1) }), 0, "A");
  assert.equal(n.kind, "nod"); assert.equal(n.line, ""); assert.equal(n.id, "");
  const j = session({ rand: R(0.1) });
  assert.equal(earned(j, 0, "A"), null);
  assert.match(seenLog(j).at(-1), /seen {2}C quiet$/);
  assert.equal(j.state().seen.n, 0, "quiet is not a fire");
  assert.equal(j.at(31).ev("pick", { choice: "C", verdict: "correct" }), null);
  assert.equal(seenLog(j).length, 1, "no second roll on the item");
});
test("fire: the quiet and kind rolls follow QUIET and KIND (seeded, 20000 items)", () => {
  const rand = lcg(11), N = 20000, got = { quiet: 0, nod: 0, short: 0, full: 0 };
  for (let i = 0; i < N; i++) {
    const j = session({ rand }), r = earned(j, 0, "A", "misread", "misread");
    if (r) got[r.kind]++; else got.quiet++;
  }
  assert.ok(Math.abs(got.quiet / N - SEEN.QUIET) < 0.015, "quiet " + got.quiet / N);
  for (const k of ["nod", "short", "full"]) assert.ok(Math.abs(got[k] / N - (1 - SEEN.QUIET) * SEEN.KIND[k]) < 0.015, k + " " + got[k] / N);
});
test("fire: the family decides the line; no family or a family without a free line of the kind → the any pool", () => {
  assert.equal(earned(session({ rand: R(0.9, 0.5, 0) }), 0, "A", "x", "negation").line, LINES.fam.negation[0].text);
  const r = earned(session({ rand: R(0.9, 0.5, 0) }), 0, "A", "unheard", "unheard");
  assert.ok(LINES.any.some(l => l.id === r.id && l.kind === "short"), "unknown family → any");
  const full = earned(session({ rand: R(0.9, 0.9, 0) }), 0, "A", "negation", "negation");
  assert.equal(full.kind, "full"); assert.equal(full.id, "neg-3");
  const d = session({ rand: R(0.9, 0.5, 0) }).at(0); d.ev("q_open", { code: "A" }); d.at(100).tick();   // deep-only: no family at all
  d.at(105).ev("pick", { choice: "A", verdict: "correct" }); // tick needs a q; gaps [105] ≥ 8, deep 1
  assert.ok(seenLog(d).some(l => /C short any-/.test(l)));
});
test("fire: no template id twice in a session; {title} fills; a fill over 8 words is skipped", () => {
  const ids = []; let t = 0;
  const seq = script(0.9, 0.5, 0, 0, 0.9, 0.5, 0, 0, 0.9, 0.5, 0, 0);
  const k = session({ rand: seq });
  for (let i = 0; i < 3; i++) { const r = earned(k, t, "A" + i, "negation", "negation"); ids.push(r.id); t += 200; }
  assert.deepEqual(ids, ["neg-1", "neg-2", "any-1"], "negation has two short lines; the third comes from any");
  assert.equal(new Set(ids).size, 3);
  assert.equal(earned(k, t, "A9", "negation", "negation"), null, "MAX per session");

  const fits = earned(session({ rand: R(0.9, 0.9, 0), title: () => "Limit from a table" }), 0, "A", "misread", "misread");
  assert.equal(fits.id, "mis-3"); assert.equal(fits.line, "Limit from a table: read exactly as written."); assert.equal(fits.line.split(" ").length, 8);
  const long = earned(session({ rand: R(0.9, 0.9, 0), title: () => "A title of exactly six words" }), 0, "A", "misread", "misread");
  assert.ok(!/mis-3|any-5/.test(long.id), "mis-3 fills to 9 words: skipped → " + long.id); assert.ok(long.line.split(" ").length <= 8);
  const none = earned(session({ rand: R(0.9, 0.9, 0) }), 0, "A", "misread", "misread");
  assert.ok(!/\{title\}/.test(none.line) && none.id !== "mis-3" && none.id !== "any-5", "no title → no {title} line");
});
test("caps: shared gap (3 min) with J5 and between seen lines; MAX per session; a J5 nudge on the item", () => {
  const j = session({ rand: () => 0.9 });
  assert.ok(earned(j, 0, "A")); assert.equal(earned(j, 100, "B"), null, "100 s since the last");
  assert.ok(earned(j, 300, "C")); assert.ok(earned(j, 600, "D"));
  assert.equal(earned(j, 900, "E"), null, "MAX = " + SEEN.MAX); assert.equal(j.state().seen.n, SEEN.MAX);
  const n = session({ rand: () => 0, on: ["S6"], lines: NUDGE, say: () => true });   // S6 nudges at the 2nd wrong pick (roll 0 < p), so this item is taken
  assert.equal(earned(n, 0, "A"), null); assert.equal(n.state().nudge.n, 1);
});
test("caps: never in F flow (a run alive, no wrong pick), never while typing, never hidden", () => {
  const f = session({ rand: () => 0.9 });
  f.at(0).ev("q_open", { code: "A" }); f.at(10).ev("pick", { choice: "A", verdict: "correct" });
  f.at(20).ev("q_open", { code: "B" }); f.at(101).tick();
  assert.equal(f.state().flowRun, 1);
  assert.equal(f.at(105).ev("pick", { choice: "A", verdict: "correct" }), null, "deep-only item inside a flow run");
  const k = session({ rand: () => 0.9 });
  k.at(0).ev("q_open", { code: "A" }); k.at(10).ev("pick", { choice: "A", verdict: "wrong" }); k.at(20).ev("pick", { choice: "B", verdict: "wrong" });
  k.at(29).input("keydown");
  assert.equal(k.at(30).ev("pick", { choice: "C", verdict: "correct" }), null, "a key 1 s ago");
  const h = session({ rand: () => 0.9 });
  h.at(0).ev("q_open", { code: "A" }); h.at(10).ev("pick", { choice: "A", verdict: "wrong" }); h.at(20).ev("pick", { choice: "B", verdict: "wrong" });
  h.at(25).vis(true);
  assert.equal(h.at(30).ev("pick", { choice: "C", verdict: "correct" }), null, "hidden");
});
test("off: seenOff() → nothing; no seenLines → inert; the J5 nudge rules are untouched by moment C", () => {
  let off = true;
  const j = session({ rand: () => 0.9, seenOff: () => off });
  assert.equal(earned(j, 0, "A"), null); off = false;
  assert.ok(earned(j, 200, "B"));
  assert.equal(earned(session({ rand: () => 0.9, seenLines: undefined }), 0, "A"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(API.NUDGE)), { ACT: "cluck_say", STATES: ["S2", "S6", "Q"], P_ONE: 0.7, SHARE_ALL: 0.85, GAP_S: 180, TYPING_S: 3, S2_DEPTH: 2, Q_DEPTH: 2 });
});
test("dump: the ring is JSONL of every log line (sid, item, code, line), pick lines carry err=", () => {
  const j = session({ rand: R(), sid: "sX" });
  earned(j, 0, "A");
  const rows = j.dump().split("\n").map(l => JSON.parse(l));
  assert.ok(rows.every(r => r.s === "sX" && r.c === "A" && r.i === 1 && typeof r.l === "string"));
  assert.ok(rows.some(r => /pick {2}A wrong err=negation/.test(r.l))); assert.ok(rows.some(r => /seen {2}C /.test(r.l)));
  for (let i = 0; i < 2100; i++) { j.at(100 + i).ev("q_open", { code: "Z" + i }); }
  assert.ok(j.dump().split("\n").length <= 2000, "capped");
});

/* ---- wiring: ?jev=1 → intent.js → stemDuck.say, the off switches, the hollow tap ---- */
const wired = (extra = {}) => {
  const calls = [], duck = { say: (line, o) => { calls.push([line, o]); return true; } };
  const L = load({ search: "?jev=1", duck, rand: script(0.99, 0.9, 0.5, 0, 0), bank: { get: () => ({ title: "T" }) }, ...extra });
  const pick = (t, ch, v, error) => { L.clock.t = t * 1000; L.win.stemT("pick", { code: "A", choice: ch, verdict: v, error }); };
  L.win.stemT("q_open", { code: "A" });
  pick(10, "A", "wrong", "negation"); pick(20, "B", "wrong", "sign"); pick(30, "C", "correct");
  return { ...L, calls };
};
test("wiring: an earned item → after the delay stemDuck.say gets the family line + onHollow, no onAway (neutral)", () => {
  const w = wired();
  assert.equal(w.calls.length, 0); assert.equal(w.later.length, 1);
  assert.ok(w.later[0][1] >= 600 && w.later[0][1] <= 1800);
  w.later[0][0]();
  assert.equal(w.calls.length, 1); assert.equal(w.calls[0][0], LINES.fam.sign[0].text);
  assert.equal(typeof w.calls[0][1].onHollow, "function"); assert.equal(w.calls[0][1].onAway, undefined); assert.equal(w.calls[0][1].nod, false);
  assert.equal(JSON.parse(w.store["stem-seen-h"]).f, 1, "fires counted");
  assert.match(w.win.stemJev.dump(), /seen {2}C short sgn-1/);
});
test("wiring: the page moved on before the delay → nothing shows", () => {
  const w = wired();
  w.win.stemT("q_open", { code: "B" });
  w.later[0][0]();
  assert.equal(w.calls.length, 0);
});
test("wiring: a hollow tap → this session off now; 2 hollows in the first 5 fires → off for good", () => {
  const store = {};
  const w1 = wired({ store }); w1.later[0][0](); w1.calls[0][1].onHollow();
  assert.equal(w1.sess["stem-seen-s"], "1"); assert.equal(store["stem-seen-off"], undefined);
  assert.equal(JSON.parse(store["stem-seen-h"]).h, 1);
  // the same session, a later earned item: nothing
  w1.later.length = 0; w1.clock.t = 400000; w1.win.stemT("q_open", { code: "Q" });
  [10, 20].forEach(s => { w1.clock.t = (400 + s) * 1000; w1.win.stemT("pick", { code: "Q", verdict: "wrong", choice: "A" + s }); });
  w1.clock.t = 430000; w1.win.stemT("pick", { code: "Q", verdict: "correct", choice: "Z" });
  w1.later.forEach(([f]) => f()); assert.equal(w1.calls.length, 1, "session off: no more");
  const w2 = wired({ store }); w2.later[0][0](); w2.calls[0][1].onHollow();   // a new session (own sessionStorage), same device
  assert.equal(store["stem-seen-off"], "1"); assert.equal(JSON.parse(store["stem-seen-h"]).h, 2);
  const w3 = wired({ store });
  assert.equal(w3.later.length, 0, "stem-seen-off: nothing is even scheduled");
});
test("wiring: 2 hollows spread past the first 5 fires do not switch it off for good", () => {
  const store = { "stem-seen-h": JSON.stringify({ f: 9, h: 1 }) };
  const w = wired({ store }); w.later[0][0](); w.calls[0][1].onHollow();
  assert.equal(store["stem-seen-off"], undefined);
});
test("wiring: a nod → say(\"\", { nod: true })", () => {
  const calls = [], duck = { say: (line, o) => { calls.push([line, o]); return true; } };
  const L = load({ search: "?jev=1", duck, rand: script(0.99, 0.9, 0.1, 0, 0) });
  L.win.stemT("q_open", { code: "A" });
  [[10, "A", "wrong"], [20, "B", "wrong"], [30, "C", "correct"]].forEach(([t, c, v]) => { L.clock.t = t * 1000; L.win.stemT("pick", { code: "A", choice: c, verdict: v }); });
  L.later[0][0]();
  assert.equal(calls[0][0], ""); assert.equal(calls[0][1].nod, true);
});
test("flag off / DNT / stem-t-off: moment C is inert (no stemJev, the peek is never asked)", () => {
  const calls = [], duck = { say: () => { calls.push(1); return true; } };
  for (const o of [{}, { store: { "stem-jev": "1" }, tele: { optedOut: () => true, userOff: () => false } },
    { store: { "stem-jev": "1" }, tele: { optedOut: () => false, userOff: () => true } }]) {
    const L = load({ ...o, duck, rand: () => 0.9 });
    L.win.stemT("q_open", { code: "A" }); L.win.stemT("pick", { code: "A", verdict: "correct" });
    assert.equal(L.win.stemJev, undefined); assert.equal(L.later.length, 0);
  }
  assert.equal(calls.length, 0);
});

/* ---- the lines (Tony 19:3x) ---- */
const BAN_STATE = /\b(stuck|frustrat\w*|anxi\w*|worr\w*|stress\w*|upset|sad|angry|mad|confus\w*|overwhelm\w*|scar\w*|afraid|nervous|panic\w*|tired|bored|struggl\w*|annoy\w*|hard|difficult|lost|give up|quit\w*|fail\w*|feel\w*|seem\w*|look like you|great|good job|well done|streak)\b/i;
const BAN_TRIGGER = /\b(two|swings?|tries|attempts?|no help|without help|hints?|again|finally|minutes?|seconds?)\b/i;
const ROOT = new URL("../", import.meta.url);
const items = [];
(function walk(o) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === "object") { items.push(o); Object.values(o).forEach(walk); }
})([JSON.parse(readFileSync(new URL("problems.json", ROOT), "utf8")), ...readdirSync(new URL("banks/", ROOT)).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL("banks/" + f, ROOT), "utf8")))]);
const errors = [...new Set(items.map(o => o.error).filter(e => typeof e === "string"))].sort();
const titles = [...new Set(items.map(o => o.title).filter(t => typeof t === "string"))];
const secrets = (() => {   // answers, choice text, nudges and hints: no line may carry or equal one
  const s = new Set();
  for (const o of items) {
    for (const k of ["answer", "nudge", "hint"]) if (typeof o[k] === "string") s.add(o[k]);
    if (Array.isArray(o.accept)) o.accept.forEach(a => typeof a === "string" && s.add(a));
    if (Array.isArray(o.choices)) o.choices.forEach(c => c && typeof c.md === "string" && s.add(c.md));
  }
  return [...s].map(x => x.trim()).filter(x => x.length > 1);
})();
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const allLines = [...Object.values(LINES.fam).flat(), ...LINES.any];

test("lines: a family for every `error` used in problems.json + banks/*.json, 2–3 lines each, plus an `any` pool", () => {
  assert.ok(errors.length >= 10, errors.join());
  assert.deepEqual(Object.keys(LINES.fam).sort(), errors);
  for (const [f, ls] of Object.entries(LINES.fam)) {
    assert.ok(ls.length >= 2 && ls.length <= 3, f);
    assert.ok(ls.some(l => l.kind === "short"), f + ": a short line");
  }
  assert.ok(LINES.any.length >= 3 && LINES.any.some(l => l.kind === "short") && LINES.any.some(l => l.kind === "full"));
});
test("lines: unique ids, kind short|full, ≤ 8 words after fill for every real title, one line at 390 px", () => {
  const ids = allLines.map(l => l.id); assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(allLines.map(l => l.text)).size, allLines.length, "unique text");
  assert.ok(titles.length > 50);
  for (const l of allLines) {
    assert.ok(["short", "full"].includes(l.kind), l.id);
    assert.ok(l.text.length <= 40, "one line at 390 px: " + l.text);
    for (const t of l.text.includes("{title}") ? titles : [""]) {
      const f = l.text.replace("{title}", t), n = f.split(/\s+/).length;
      if (!l.text.includes("{title}")) assert.ok(n <= 8, f);   // a {title} line over 8 words is skipped at runtime (the fire path), not an error
    }
    assert.ok(!l.text.includes("{title}") || l.text.replace("{title}", "").split(/\s+/).filter(Boolean).length <= 6, l.id + ": leave room for a title");
  }
  assert.ok(titles.some(t => t.split(/\s+/).length <= 3), "short titles exist, so {title} lines do get used");
});
test("lines: Tony's rule: no trigger echo (counts, help, timers, again / finally), no digit, no state or emotion word, no ! or em dash", () => {
  for (const { text, id } of allLines) {
    assert.doesNotMatch(text, BAN_TRIGGER, id + ": " + text);
    assert.doesNotMatch(text, BAN_STATE, id + ": " + text);
    assert.doesNotMatch(text, /\d|!|—|–/, id + ": " + text);
    assert.doesNotMatch(text, /\b(S2|S5|S6|impasse|earned|hard way)\b/i, id);
  }
});
test("lines: none carries an item answer or choice text (len > 1), none equals a nudge or a hint, none is a J5 line", () => {
  const nudges = new Set(Object.values(NUDGE).flat());
  for (const { text, id } of allLines) {
    const fill = text.replace("{title}", "").trim().toLowerCase();
    assert.ok(!nudges.has(text), id);
    for (const s of secrets) assert.ok(fill !== s.toLowerCase() && !new RegExp("(^|[^\\w])" + esc(s.toLowerCase()) + "([^\\w]|$)").test(fill), id + " vs " + s);
  }
});
test("lines: the vendored aiw finds nothing (vacuous below 10 words: tests/test_seen_lines.py is the real gate)", () => {
  for (const { text } of allLines) assert.equal(AIW.analyzeText(text.replace("{title}", "Limit from a table")).issues.length, 0, text);
});
