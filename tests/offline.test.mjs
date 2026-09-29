// sw.js routing: what the service worker may cache. The e2e run (npm run e2e) checks the real browser path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const ctx = { self: { addEventListener() {} }, module: { exports: {} }, URL, location: new URL("https://csci4x.com/") };
vm.runInNewContext(src, ctx);
const { route } = ctx.module.exports;
const scope = "https://csci4x.com/";
const r = (path, method = "GET") => route(new URL(path, scope).href, method, scope);

test("never cached: k/, log/, /check, dotfiles, non-GET", () => {
  for (const p of ["k/CALC1_T6B.json", "k/", "log/incidents.jsonl", "check", "check?x=1", "check/", ".git/config", "p/../k/X.json"])
    assert.equal(r(p), "pass", p);
  for (const m of ["POST", "HEAD", "PUT"]) assert.equal(r("p/CALC1_T6B.json", m), "pass", m);
  assert.equal(route("https://evil.example/app.js", "GET", scope), "pass");
});
test("problems: network-first", () => {
  assert.equal(r("p/CALC1_T6B.json"), "problem");
  assert.equal(r("p/CALC1_T6B.json?v=2"), "problem");
});
test("shell: cache-first", () => {
  for (const p of ["", "index.html", "app.js", "app.css", "offline.js", "graph.js", "copy/payload.mjs",
    "vendor/katex/katex.min.js", "vendor/katex/fonts/KaTeX_Main-Regular.woff2", "design/explain-box.css"])
    assert.equal(r(p), "shell", p);
  for (const p of ["sw.js", "tests/x.js", "tools/bundle.py", "problems.json", "SCHEMA.md", "serve.py"]) assert.equal(r(p), "pass", p);
});
test("offline.js never stores or reads k/", () => {
  const off = readFileSync(new URL("../offline.js", import.meta.url), "utf8");
  assert.ok(!/["'`]k\//.test(off));
});
