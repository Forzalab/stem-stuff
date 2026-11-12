// 160 PR-B tool call theater: stages.js, the pure parts (Stages.feed: the line splitter) and the tracker's rows/seconds/tick on a faked Date.
// The browser side (stage rows in the sheet and the proof box) is tests/stages.pw.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
function load(now = { t: 0 }) {
  const el = { innerHTML: "", dataset: {} };
  const w = { Date: { now: () => now.t }, setInterval: () => 1, clearInterval: () => {}, document: {} };
  w.window = w;
  vm.runInNewContext(read("../client/resources/texts/stage-lines.js"), w);
  vm.runInNewContext(read("../client/shell/stages/stages.js"), w);
  return { S: w.Stages, el, now };
}
const RS = "\x1e", ev = (stage, at) => RS + JSON.stringify({ stage, at }) + "\n";

test("feed: no event line = the text, byte for byte", () => {
  const { S } = load(), s = { buf: "" };
  for (const c of ["Hello ", "wor", "ld\n", "$x$ é"]) assert.deepEqual(JSON.parse(JSON.stringify(S.feed(s, c))), { text: c, events: [] });
});
test("feed: an event after text with no newline; a chunk cut mid-line waits for its newline", () => {
  const { S } = load(), s = { buf: "" }, e = ev("write", "start");
  assert.deepEqual(JSON.parse(JSON.stringify(S.feed(s, "abc" + e.slice(0, 9)))), { text: "abc", events: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(S.feed(s, e.slice(9) + "tail"))), { text: "tail", events: [{ stage: "write", at: "start" }] });
});
test("feed: a half event line at the very end is never text; a garbled line is dropped; an error line is an event", () => {
  const { S } = load(), s = { buf: "" };
  const r = JSON.parse(JSON.stringify(S.feed(s, "ok" + RS + "{nope}\n" + RS + '{"error":"S-ABCDE","why":"upstream"}\n' + RS + '{"sta')));
  assert.deepEqual(r, { text: "ok", events: [{ error: "S-ABCDE", why: "upstream" }] });
  assert.equal(s.buf.startsWith(RS), true);
});
test("feed: a Check body = events, then its JSON as the text", () => {
  const { S } = load(), s = { buf: "" }, body = ev("read", "start") + ev("read", "end") + '{"verdict":"wrong","triesLeft":2}\n';
  let text = "", n = 0;
  for (let i = 0; i < body.length; i += 7) { const r = S.feed(s, body.slice(i, i + 7)); text += r.text; n += r.events.length; }   // 7-char chunks
  assert.equal(n, 2);
  assert.deepEqual(JSON.parse(text), { verdict: "wrong", triesLeft: 2 });
});
test("tracker: nothing paints before the first event; rows, seconds, the 2nd grade pair; a tick only on finish(true)", () => {
  const { S, el, now } = load(), st = S.make({ host: () => el, cap: 25 });
  st.paint(); assert.equal(el.innerHTML, "", "no event, no paint");
  st.event({ stage: "read", at: "start" }); now.t = 1300; st.event({ stage: "read", at: "end" });
  st.event({ stage: "grade", at: "start" }); now.t = 2400; st.event({ stage: "grade", at: "end" });
  st.event({ stage: "grade", at: "start" }); now.t = 4500; st.paint();
  assert.match(el.innerHTML, /Read your proof/); assert.match(el.innerHTML, /Checked the steps/); assert.match(el.innerHTML, /Double-checking…/);
  assert.match(el.innerHTML, /4s \/ 25s/, "the chip counts from the start");
  assert.equal((el.innerHTML.match(/stg-ok/g) || []).length, 0, "no tick yet");
  now.t = 6400; st.finish(true);
  assert.match(el.innerHTML, /Thought for 6s/); assert.equal(el.innerHTML.includes("<ol"), false, "collapsed");
  el.onclick({ target: { closest: () => ({}) } });
  assert.match(el.innerHTML, /<ol/, "a tap opens the rows"); assert.match(el.innerHTML, /Double-checked/);
});
test("tracker: finish(false) = no tick, the open row says Cluck is slow; stop() clears; an event after finish is harmless", () => {
  const { S, el } = load(), st = S.make({ host: () => el });
  st.event({ stage: "write", at: "start" }); st.finish(false);
  assert.match(el.innerHTML, /Cluck is slow, try again/); assert.equal(el.innerHTML.includes("stg-ok"), false);
  const b = load(), s2 = b.S.make({ host: () => b.el }); s2.event({ stage: "note", at: "start" }); s2.stop();
  assert.equal(b.el.innerHTML, ""); s2.event({ stage: "note", at: "end" }); assert.equal(b.el.innerHTML, "");
});
