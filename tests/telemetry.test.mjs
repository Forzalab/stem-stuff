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

test("replay PII blanker: e-mail + phone shapes go, physics stays", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.blankPII("call me 559-555-1234 ok"), "call me ***-***-**** ok");
  assert.equal(T.blankPII("(559) 555 1234"), "(***) *** ****");
  assert.equal(T.blankPII("maria.g@gmail.com"), "*****.*@*****.***");
  for (const t of ["v = 9.81 m/s, t=12.5", "F = 1234567 N", "1/2 m v^2 = 80 J", "x 2.0e8 m"]) assert.equal(T.blankPII(t), t);
  assert.equal(T.blankPII(""), ""); assert.equal(T.blankPII(null), null);
});

test("Don't record me (stem-t-off=1) with a key: stays a no-op", () => {
  const T = run().win.__stemTelemetry;
  assert.equal(T.userOff({ getItem: () => "1" }), true);
  assert.equal(T.userOff({ getItem: () => null }), false);
  assert.equal(T.userOff({ getItem: () => { throw new Error("blocked"); } }), false);
});

test("dead_tap context: x/y as viewport %, stage, tries_left, never the tapped text; missing -> null, never throws", () => {
  const T = run().win.__stemTelemetry;
  const d = T.deadProps({ textContent: "  Hello world, this is a long caption  " }, "div.fig", 150, 600, 300, 800, "wrong", "A1", 2);
  assert.deepEqual({ ...d }, { el: "div.fig", code: "A1", x: 50, y: 75, stage: "wrong", tries_left: 2 });
  assert.equal("txt" in d, false);                                                    // privacy default (Tony, Oct 18): no text key at all
  assert.ok(!JSON.stringify(d).includes("Hello"), "no tapped text anywhere in the payload");
  const m = T.deadProps(null, "div.fig", undefined, 5, 0, 800, undefined, null, null);
  assert.deepEqual({ ...m }, { el: "div.fig", code: null, x: null, y: 1, stage: null, tries_left: null });
  assert.doesNotThrow(() => T.deadProps({ get textContent() { throw new Error("x"); } }, "", 1, 1, 1, 1));
  assert.equal(T.deadProps({ textContent: "z" }, "e", 9999, -5, 100, 100).x, 100);
});

test("T40 ltSum: long tasks inside a window", () => {
  const T = run().win.__stemTelemetry;
  const l = [{ s: 100, d: 60 }, { s: 9000, d: 120.4 }, { s: 12000, d: 80 }];
  assert.deepEqual({ ...T.ltSum(l, 0, 10000) }, { n: 2, ms: 180 });
  assert.deepEqual({ ...T.ltSum(l, 10000, 20000) }, { n: 1, ms: 80 });
  assert.equal(T.gpu({ createElement: () => ({ getContext: () => null }) }), null, "no WebGL: null, no throw");
});
