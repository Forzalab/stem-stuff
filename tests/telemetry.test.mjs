// telemetry.js (design/plans/TELEMETRY.md): gates, config parsing, guess-spam + rage rules, and "no key = nothing happens".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../telemetry.js", import.meta.url), "utf8");

/* a fake browser: meta = the <meta name="stem-t"> attributes (or null), nav = navigator fields */
function run({ meta = null, nav = {} } = {}) {
  const added = [], listeners = [];
  const el = attrs => ({ getAttribute: k => (k in attrs ? attrs[k] : null) });
  const document = {
    readyState: "complete", visibilityState: "visible", head: { appendChild: s => added.push(s.src) },
    querySelector: q => (q === 'meta[name="stem-t"]' && meta ? el(meta) : null),
    getElementById: () => null, createElement: () => ({}),
    addEventListener: (t) => listeners.push(t),
  };
  const store = {};
  const win = {
    document, navigator: nav, performance: { now: () => 1, getEntriesByType: () => [] }, location: { href: "x", search: "" },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    addEventListener: () => {}, setTimeout: () => 0, requestIdleCallback: () => 0, matchMedia: () => ({ matches: false }), URLSearchParams,
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, added, listeners };
}

test("no meta / empty meta: stemT is a no-op, nothing is loaded, no listeners", () => {
  for (const meta of [null, { content: "" }]) {
    const { win, added, listeners } = run({ meta });
    assert.equal(typeof win.stemT, "function");
    assert.doesNotThrow(() => { win.stemT("pick", { code: "A" }); win.stemT(); win.stemT(null, 5); });
    assert.deepEqual(added, []); assert.deepEqual(listeners, []);
  }
});

test("DNT / GPC with a key: stays a no-op, no listeners", () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }, { msDoNotTrack: "1" }]) {
    const { win, listeners } = run({ meta: { content: "phc_abc", "data-clarity": "x1" }, nav });
    assert.equal(win.stemT.length, 0, "the noop stub");
    assert.deepEqual(listeners, []);
  }
});

test("a key, no DNT: stemT is live and listeners are set", () => {
  const { win, listeners } = run({ meta: { content: "phc_abc", "data-clarity": "x1" } });
  assert.equal(win.stemT.length, 2);
  assert.ok(listeners.includes("pointerdown") && listeners.includes("visibilitychange"));
  assert.doesNotThrow(() => win.stemT("pick", { verdict: "wrong", right: false }));
});

test("readConfig: pattern-checks every value", () => {
  const T = run().win.__stemTelemetry;
  const doc = attrs => ({ querySelector: () => ({ getAttribute: k => (k in attrs ? attrs[k] : null) }) });
  assert.deepEqual({ ...T.readConfig(doc({ content: "phc_ab12", "data-clarity": "zz9", "data-host": "https://eu.i.posthog.com" })) },
    { ph: "phc_ab12", cl: "zz9", host: "https://eu.i.posthog.com" });
  assert.equal(T.readConfig(doc({ content: "phx_secret" })), null, "a personal key is never used");
  assert.equal(T.readConfig(doc({ content: "", "data-clarity": "a\"b" })), null);
  assert.equal(T.readConfig(doc({ content: "phc_a", "data-host": "javascript:alert(1)" })).host, "https://us.i.posthog.com");
});

test("optedOut", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.optedOut({ doNotTrack: "1" }), true);
  assert.equal(T.optedOut({ globalPrivacyControl: true }), true);
  assert.equal(T.optedOut({}, { doNotTrack: "1" }), true);
  assert.equal(T.optedOut({ doNotTrack: "0" }), false);
  assert.equal(T.optedOut({ doNotTrack: null, globalPrivacyControl: false }), false);
});

test("guess-spam: <2 s after open, or the 3rd pick inside 10 s", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.spamCheck([], 0, 1500), "fast");
  const p = [];
  assert.equal(T.spamCheck(p, 0, 5000), ""); assert.equal(T.spamCheck(p, 4000, 9000), "");
  assert.equal(T.spamCheck(p, 9000, 14000), "burst");
  const q = [];
  T.spamCheck(q, 0, 5000); T.spamCheck(q, 6000, 5000);
  assert.equal(T.spamCheck(q, 11000, 5000), "", "the first pick fell out of the window");
});

test("rage tap: 3 taps in 700 ms within 30 px; spread or slow taps are not", () => {
  const T = run().win.__stemTelemetry;
  const a = [];
  assert.equal(T.rageCheck(a, 0, 100, 100), false); assert.equal(T.rageCheck(a, 200, 110, 105), false);
  assert.equal(T.rageCheck(a, 400, 95, 98), true);
  const b = [];
  T.rageCheck(b, 0, 0, 0); T.rageCheck(b, 200, 200, 0);
  assert.equal(T.rageCheck(b, 400, 400, 0), false, "spread out");
  const c = [];
  T.rageCheck(c, 0, 0, 0); T.rageCheck(c, 500, 0, 0);
  assert.equal(T.rageCheck(c, 1000, 0, 0), false, "slow");
});
