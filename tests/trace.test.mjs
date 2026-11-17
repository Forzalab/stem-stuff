// CI-ARCH E EVENT TRACE: the pure core of tests/lib/trace.mjs (ring + report). No browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTrace } from "./lib/trace.mjs";

const clock = () => { let t = 0; const now = () => t; now.set = v => { t = v; }; return now; };

test("report: ms before now, in order, and what is still open", () => {
  const now = clock(), tr = makeTrace({ now });
  now.set(100); tr.push(1, "click", "#rwHud");
  now.set(140); tr.push(1, "toggle", "#rwPop", "open");
  now.set(900); tr.push(1, "pop.open", "", "gloss");
  now.set(1000); tr.push(1, "key", "body", "Escape");
  now.set(1001); tr.push(1, "key.cancelled", "body", "Escape (the app called preventDefault)");
  now.set(3000);
  const r = tr.report().split("\n");
  assert.equal(r[0], "TRACE last 5 of 5 events (ms before now · page · event · element · detail)");
  assert.match(r[1], /^ +-2900 {2}p1 {2}click +#rwHud$/);
  assert.match(r[4], /^ +-2000 {2}p1 {2}key +body {2}Escape$/);
  assert.match(r[5], /key\.cancelled/);
  assert.match(r[6], /^ {2}open now: p1 #rwPop \(toggle, 2860 ms ago\) · p1 Pop \(pop\.open gloss, 2100 ms ago\)$/);
});

test("a closed popover, a closed Pop and a navigation leave nothing open", () => {
  const tr = makeTrace({ now: clock() });
  tr.push(1, "toggle", "#a", "open"); tr.push(1, "toggle", "#a", "closed");
  tr.push(1, "pop.open", "", "x"); tr.push(1, "pop.close");
  tr.push(2, "toggle", "#b", "open"); tr.push(2, "nav", "/next");
  assert.match(tr.report(), /open now: nothing$/);
});

test("the ring keeps the newest `cap` events, the report the last n, a detail 80 chars on one line", () => {
  const tr = makeTrace({ cap: 3, now: clock() });
  for (let i = 0; i < 5; i++) tr.push(1, "click", "#b" + i);
  tr.push(1, "pageerror", "", "x\n".repeat(100));
  assert.equal(tr.size, 3);
  const r = tr.report(2).split("\n");
  assert.equal(r[0].slice(0, 28), "TRACE last 2 of 6 events (ms");
  assert.match(r[1], /#b4$/);
  assert.equal(r.length, 4);
  assert.ok(r[2].length < 120, r[2]);
});

test("a repeated console line or page error is one counted line, so it cannot push the real events out", () => {
  const tr = makeTrace({ now: clock() });
  tr.push(1, "click", "#go");
  for (let i = 0; i < 50; i++) tr.push(1, "console.warn", "", "same warning");
  tr.push(1, "console.warn", "", "another");
  const r = tr.report().split("\n");
  assert.equal(r[0].slice(0, 27), "TRACE last 3 of 52 events (");
  assert.match(r[2], /console\.warn +same warning {2}\(x50, first time shown\)$/);
  assert.match(r[3], /another$/);
});
