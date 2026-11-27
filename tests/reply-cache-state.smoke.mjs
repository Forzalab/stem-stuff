// REPLY-CACHE-STATE smoke (desync F3): the client reply cache (localStorage "stem-cluck") is keyed by every input that changed the reply,
// and a reply the server marked closed / REVEAL yes (response header X-Cluck-Reveal: 1) is never cached.
//   (a) a FIRST try of a pick whose reply was cached under another state (round / tries) makes one /explain request; an old-shape entry is never matched
//   (b) a reply marked reveal is not in localStorage "stem-cluck" afterwards, and the same pick asks again
//   (c) the same pick at the same state twice uses the cache: one request in all
// Own serve.py + a throwaway bank; /explain is stubbed in the page (no LLM).   node tests/reply-cache-state.smoke.mjs [port]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8893", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "rcs-")), BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const item = { code: "CALC1_RCS1", type: "mc", correct: "b", shuffle: false, body: [{ type: "text", md: "Pick B" }], choices: [{ id: "a", md: "one" }, { id: "b", md: "two" }, { id: "c", md: "three" }],
  saccharine: { key: "Answer: b) two", slip: { a: "You took the first." } } };
writeFileSync(join(BANKS, "BANK_RCS.json"), JSON.stringify({ v: 20261022, problems: [item] }));
const srv = spawn("python3", [join(ROOT, "server/http_server/serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "t.json"), STEM_FRONT: "BANK_RCS", OPENROUTER_API_KEY: "stub" }, stdio: "ignore" });
await serverUp(BASE);
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
const opened = p => p.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_RCS1" && !document.querySelector("#freeze").hidden, null, { timeout: 9000 });
const keys = p => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("stem-cluck") || "{}")));
let calls = 0, reveal = "0", fails = 0;
const check = (name, ok, info) => { console.log(ok ? "ok  " : "FAIL", name, ok ? "" : info ?? ""); if (!ok) fails++; };
async function freshPick(p) {                              // a new page load, the client's try record wiped, then the wrong pick a: a FIRST try
  await p.context().clearCookies();                       // a new sid: a fresh try budget on the server too (the PROOF's steps)
  await p.goto(`${BASE}/#CALC1_RCS1`);
  await p.evaluate(() => localStorage.removeItem("stem-wish"));   // the hourly auto-ask budget is not what this smoke tests
  await p.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase("stem-stuff"); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await p.goto("about:blank"); await p.goto(`${BASE}/#CALC1_RCS1`); await opened(p);
  await p.click('.opt[data-id="a"]'); await p.click('.ch[data-id="a"] .send');
  await p.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 5000 });
  await p.waitForTimeout(1200);
}
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.route("**/explain", r => { calls++; r.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Cluck-Reveal": reveal }, body: "Quack! You picked a.\n" }); });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { sessionStorage.setItem("stem-seen-q", JSON.stringify(["CALC1_RCS1"])); } catch {} });
  // (b) a reply marked reveal is not cached; the same pick at the same state asks again
  reveal = "1"; calls = 0;
  await freshPick(p);
  check("(b) reveal-marked reply: one request", calls === 1, `calls=${calls}`);
  check("(b) reveal-marked reply is not in stem-cluck", (await keys(p)).length === 0, JSON.stringify(await keys(p)));
  await freshPick(p);
  check("(b) the same pick asks again (nothing was cached)", calls === 2, `calls=${calls}`);
  // (c) an open reply (header 0) is cached; the same pick at the same state twice = one request
  reveal = "0"; calls = 0;
  await freshPick(p);
  const k = await keys(p);
  check("(c) open reply: one request, one v2 cache key", calls === 1 && k.length === 1 && k[0].startsWith("v2|CALC1_RCS1|-|1|"), `calls=${calls} keys=${JSON.stringify(k)}`);
  await freshPick(p);
  check("(c) same pick, same state again: still one request in all", calls === 1, `calls=${calls}`);
  // (a) the cached reply was written under another state (a redo round, another try count): the first try does not take it
  const orig = await p.evaluate(() => localStorage.getItem("stem-cluck"));
  for (const [i, v, what] of [[2, "2", "round"], [3, "3", "try count"]]) {
    await p.evaluate(([o, i, v]) => { const [k, val] = Object.entries(JSON.parse(o))[0], s = k.split("|"); s[i] = v; localStorage.setItem("stem-cluck", JSON.stringify({ [s.join("|")]: val })); }, [orig, i, v]);
    const before = calls; await freshPick(p);
    check(`(a) cached under another ${what}: the first try makes one /explain request`, calls - before === 1, `new calls=${calls - before}`);
  }
  // an entry in the OLD shape (code|pick|build) is never matched
  await p.evaluate(() => localStorage.setItem("stem-cluck", JSON.stringify({ "CALC1_RCS1|a|dev": { text: "OLD-SHAPE-REPLY\n", t: Date.now() } })));
  const before = calls; await freshPick(p);
  check("(a) an old-shape entry is not used", calls - before === 1, `new calls=${calls - before}`);
} finally { await browser.close(); srv.kill(); }
console.log(fails ? `FAILED (${fails})` : "all ok");
process.exit(fails ? 1 : 0);
