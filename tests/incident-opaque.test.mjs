// incident.mjs window "error" listener: an opaque error (no e.error, no filename: "Script error.", line 0 - cross-origin or browser-injected)
// makes NO student-facing E- code (flight.js keeps it in the ring); a real error still does, with filename + lineno in the payload.
// Own file: incident.mjs reads `window` once at import, so a fake window is set first.
import { test } from "node:test";
import assert from "node:assert/strict";

const handlers = {};
globalThis.window = { addEventListener: (t, f) => { (handlers[t] ||= []).push(f); }, navigator: { userAgent: "t" }, location: { protocol: "file:" }, document: { querySelector: () => null } };
await import("../client/pure_logic_modules/incident.mjs");
const warn = console.warn;
const EE = globalThis.ErrorEvent || class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
const fire = o => {
  const out = [];
  console.warn = (...a) => { out.push(String(a[0])); };
  try { for (const f of handlers.error) f(new EE("error", o)); } finally { console.warn = warn; }
  return out.filter(w => w.startsWith("incident ")).map(w => JSON.parse(w.slice(9)));
};

test("opaque window error (no e.error, no filename): no incident, no E- code", () => {
  assert.ok(handlers.error?.length, "listener installed");
  assert.deepEqual(fire({ message: "Script error.", filename: "", lineno: 0 }), []);
});

test("a real window error still makes an incident, with filename + lineno", () => {
  const [r] = fire({ message: "boom", filename: "https://x.test/app.js", lineno: 42, error: new TypeError("boom") });
  assert.match(r.code, /^E-/);
  assert.equal(r.filename, "app.js", "the file name only");
  assert.equal(r.lineno, 42);
  const [r2] = fire({ message: "no stack", filename: "https://x.test/a.js", lineno: 7 });
  assert.match(r2.code, /^E-/);
});

test("ResizeObserver loop errors (both messages) make no incident; other errors with a filename still do", () => {
  for (const message of ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications."])
    assert.deepEqual(fire({ message, filename: "https://x.test/app.js", lineno: 1 }), []);
  assert.match(fire({ message: "boom", filename: "https://x.test/app.js", lineno: 1 })[0].code, /^E-/);
});
