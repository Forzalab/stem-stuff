// incident.mjs (SCHEMA.md "Incidents"): the code format, the one record's fields, and never any student text in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, CODE_RE, KEYS, ERR_MAX, newCode, errText, reason, incident, traceparent, traceOf, diagLine, aiState } from "../incident.mjs";

test("diag line (flight recorder P1, debug mode only): build, endpoint + status, seconds, the AI's state from the server's reason or /health", () => {
  const r = { code: "E-7K3QX", where: "explain", reason: "http", status: 504, ms: 20100 };
  assert.equal(diagLine(r, "#197"), "v#197 · explain 504 · 20.1 s · AI: ?");
  assert.equal(diagLine({ ...r, code: "S-7K3QX", reason: "budget_cap", status: 503 }, "#197"), "v#197 · explain 503 · 20.1 s · AI: cap");
  assert.equal(diagLine({ ...r, code: "S-7K3QX", reason: "upstream", status: 502 }, null), "v? · explain 502 · 20.1 s · AI: err");
  assert.equal(diagLine({ where: "bank", reason: "network", phase: "timeout", ms: 8000 }, "#197"), "v#197 · bank timeout · 8.0 s", "no AI part off Cluck");
  assert.equal(aiState(r, { claude: "ok", or: "err" }), "ok");
  assert.equal(aiState(r, { claude: "over", or: null }), "cap");
  assert.equal(aiState(r, { claude: "err", or: "err" }), "err");
  assert.equal(aiState(r, null), "?");
});

test("traceparent: W3C 00-<32 hex>-<16 hex>-01; a trace id keeps its trace, a new span each time", () => {
  const a = traceparent(), t = traceOf(a);
  assert.match(a, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  const b = traceparent(t);
  assert.equal(traceOf(b), t);
  assert.notEqual(a, b);
  assert.equal(traceOf("junk"), null);
  assert.equal(reason("x", "y", { trace_id: t }).trace_id, t);
  assert.equal(reason("x", "y", { trace_id: "nope" }).trace_id, null);
});

test("code: E- + 5 chars of a 32-char alphabet with no 0/O/1/I", () => {
  assert.equal(ALPHA.length, 32);
  assert.equal(new Set(ALPHA).size, 32);
  for (const c of "01OI") assert.ok(!ALPHA.includes(c), c);
  for (let i = 0; i < 500; i++) assert.match(newCode(), /^E-[2-9A-HJ-NP-Z]{5}$/);
  assert.equal(newCode("S", () => 0), "S-22222");
  assert.equal(newCode("E", () => 0.99999), "E-ZZZZZ");
  assert.ok(CODE_RE.test("S-7K3QX") && CODE_RE.test("E-7K3QX"));
  for (const bad of ["E-7K3Q", "E-7K3QXX", "E-7K3Q0", "E-7K3QO", "X-7K3QX", "e-7k3qx", "E-7K3QI"]) assert.ok(!CODE_RE.test(bad), bad);
});

test("reason: only the allowlisted keys, each checked; numbers rounded, junk dropped", () => {
  const r = reason("explain", "http", { status: 502, phase: "stream", ms: 13001.6, bytes: 0, path: "/explain?x=1", err: new TypeError("network error"),
    q: "CALC1_XP1", v: "abc123", answer: "b", scratch: "my notes", text: "hello", chat: "hi cluck" });
  assert.deepEqual(r, { where: "explain", reason: "http", status: 502, phase: "stream", ms: 13002, bytes: 0, path: "/explain",
    err: "TypeError: network error", q: "CALC1_XP1", v: "abc123", trace_id: null, ua: null });
  assert.deepEqual(Object.keys({ code: 1, ...r }).sort(), [...KEYS].sort());
  const j = reason("Bad Where!", "Not a tag", { status: -1, phase: "nope", ms: NaN, bytes: "9", path: "../../etc passwd", q: "my answer", v: "x y" });
  assert.deepEqual(j, { where: "other", reason: "error", status: null, phase: null, ms: null, bytes: null, path: null, err: null, q: null, v: null, trace_id: null, ua: null });
});

test("the error's whole message (Tony, Oct 19), with a safety net: e-mails and 5+ digit runs blanked, control characters gone, ERR_MAX", () => {
  assert.equal(errText(new SyntaxError(`Unexpected token 'm', "{x" is not valid JSON`)), `SyntaxError: Unexpected token 'm', "{x" is not valid JSON`);
  assert.equal(errText({ name: "Error", message: "first\nsecond\u0007 line" }), "Error: first\nsecond line");
  assert.equal(errText(new Error("x".repeat(5000))).length, ERR_MAX);
  assert.equal(errText("TypeError: Failed to fetch"), "TypeError: Failed to fetch");
  assert.equal(errText(null), null);
  assert.equal(errText(new Error("HTTP 502 at 5551234567 or a.b@c.com")), "Error: HTTP 502 at ########## or *@*");
});

test("no student text: answers, notes, chat, typed or tapped text are never fields of the record", () => {
  const secret = "the student typed this";
  const r = reason("chat", "network", { err: new TypeError("Failed to fetch"), answer: secret, scratch: secret, text: secret, chat: secret, history: [secret], tapped: secret });
  assert.ok(!JSON.stringify(r).includes(secret), JSON.stringify(r));
  assert.deepEqual(Object.keys(r).sort(), KEYS.filter(k => k !== "code").sort());
  assert.equal(reason("x", "y", { ua: "Mozilla/5.0 " + "z".repeat(900) }).ua.length, 512, "the full User-Agent, cut at 512");
});

test("incident(): returns a fresh E- code, or the server's own S- code from X-Incident; never throws without a window", () => {
  assert.match(incident("check", "network", { phase: "headers" }), /^E-[2-9A-HJ-NP-Z]{5}$/);
  assert.equal(incident("explain", "http", { status: 502, server: "S-7K3QX" }), "S-7K3QX");
  assert.match(incident("explain", "http", { server: "S-bad" }), /^E-/);
  assert.notEqual(incident("x", "y"), incident("x", "y"));
});
