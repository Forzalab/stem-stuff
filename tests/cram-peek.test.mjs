// Cram day (TEMPORARY, Tony Nov 6): peek.js's idle peek comes sooner and one toast advertises Cluck, in BANK_P3X only, until
// 2026-11-09 23:59 PST (= 2026-11-10T07:59Z). peek.js runs in a vm with a tiny fake page and fake timers; nothing else is touched.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "client", "cluck", "jev_nudges", "peek.js"), "utf8");
const UNTIL = Date.parse("2026-11-10T07:59:00Z");

/* a page: clock `now` (Date.now), bank code, a storage object; returns the world after loading peek.js */
function world({ now, bank, store = {}, noStorage = false }) {
  const timers = [];
  let clock = now, perf = 0;
  const toasts = [], listeners = {};
  const cls = new Set(["sugar"]);
  const doc = {
    documentElement: { classList: { contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c) }, clientWidth: 390, style: { setProperty() {}, getPropertyValue: () => "", removeProperty() {} } },
    addEventListener() {}, getElementById: () => ({ textContent: "", hidden: false, getBoundingClientRect: () => ({ left: 0, width: 390, right: 390, top: 0, bottom: 0 }) }),
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, querySelector: () => ({ addEventListener() {}, setAttribute() {}, style: {} }), addEventListener() {}, setAttribute() {} }),
    body: { append() {} }, visibilityState: "visible",
  };
  const win = {
    stemBank: { code: bank }, stemToast: { show: o => toasts.push(o) }, stemMock: null, stemT: null,
    document: doc, addEventListener: (k, f) => { (listeners[k] ||= []).push(f); }, matchMedia: () => ({ matches: false }),
    setTimeout: (f, ms) => { timers.push({ f, at: perf + ms, id: timers.length + 1 }); return timers.length; }, clearTimeout: id => { const t = timers.find(x => x.id === id); if (t) t.f = null; },
    performance: { now: () => perf }, location: { hash: "" }, scrollBy() {}, Date: class extends Date { static now() { return clock; } },
    localStorage: noStorage ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } : { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
  };
  win.window = win; win.self = win;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  const advance = ms => { const end = perf + ms; for (;;) { const t = timers.filter(x => x.f && x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!t) break; perf = t.at; const f = t.f; t.f = null; clock += 0; f(); } clock += end - perf; perf = end; };
  return { win, toasts, advance, store, setNow: t => { clock = t; }, fire: ev => (listeners[ev] || []).forEach(f => f()), setBank: c => { win.stemBank.code = c; }, listeners, cls };
}

test("the window instant is 2026-11-09 23:59 PST, and the page reports it", () => {
  const w = world({ now: Date.parse("2026-11-06T15:00:00Z"), bank: "BANK_P3X" });
  assert.equal(w.win.stemCram.until, UNTIL);
  assert.equal(w.win.stemCram.on(), true);
  assert.equal(w.win.stemCram.on(UNTIL), true, "the last instant is still inside");
  assert.equal(w.win.stemCram.on(UNTIL + 1), false, "one ms later it is over");
});

test("scoped to BANK_P3X: another bank has no cram day", () => {
  const w = world({ now: Date.parse("2026-11-06T15:00:00Z"), bank: "BANK_P2X" });
  assert.equal(w.win.stemCram.on(), false);
  w.advance(10000);
  assert.equal(w.toasts.length, 0, "no toast outside the bank");
});

test("after the window the page is as before: no toast, no cram on", () => {
  const w = world({ now: UNTIL + 60000, bank: "BANK_P3X" });
  assert.equal(w.win.stemCram.on(), false);
  w.advance(10000);
  assert.equal(w.toasts.length, 0);
});

test("in the bank, in the window: one toast with the cram-day words, through the existing toast, once per device per day", () => {
  const store = {};
  const w = world({ now: Date.parse("2026-11-06T15:00:00Z"), bank: "BANK_P3X", store });
  w.advance(3000);
  assert.equal(w.toasts.length, 1);
  const t = w.toasts[0];
  assert.match(t.text, /^Cram day: tap Cluck\. It draws every intel question step by step\. QUACK\.$/);
  assert.equal(t.bar, false, "a line, not a count");
  assert.ok(t.until > 0, "a stale toast is dropped by toast.js");
  t.onshow();                                                    // shown: today is kept
  assert.ok(store["stem-cram-toast"], "the day is stored");
  const w2 = world({ now: Date.parse("2026-11-06T18:00:00Z"), bank: "BANK_P3X", store });
  w2.advance(10000);
  assert.equal(w2.toasts.length, 0, "the same day: not again");
  store["stem-cram-toast"] = "2000-1-1";                          // an older day
  const w3 = world({ now: Date.parse("2026-11-07T18:00:00Z"), bank: "BANK_P3X", store });
  w3.advance(3000);
  assert.equal(w3.toasts.length, 1, "a new day: once more");
});

test("blocked storage never throws and still shows the toast", () => {
  const w = world({ now: Date.parse("2026-11-06T15:00:00Z"), bank: "BANK_P3X", noStorage: true });
  w.advance(3000);
  assert.equal(w.toasts.length, 1);
  w.toasts[0].onshow();
});

test("the toast's anchor goes away when the window closes while it waits", () => {
  const w = world({ now: Date.parse("2026-11-09T23:58:50-08:00"), bank: "BANK_P3X" });
  w.advance(3000);
  const a = w.toasts[0].at;
  assert.equal(typeof a, "function");
  assert.ok(a(), "inside the window it anchors in the question area");
  w.setNow(UNTIL + 1);
  assert.equal(a(), null, "after the window it has no anchor, so toast.js never shows it");
});

test("the cram idle peek timings exist only inside the window; the normal ones are untouched", () => {
  assert.match(SRC, /var IDLE = \[180000, 600000\]/);
  assert.match(SRC, /CRAM_IDLE = \[45000, 120000, 300000\]/);
  assert.match(SRC, /return cramOn\(\) \? CRAM_IDLE : IDLE;/);
});
