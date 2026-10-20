// Incidents (Tony, Oct 19; SCHEMA.md "Incidents"): a Cluck failure keeps its old words and adds "Send Tony this code: E-XXXXX" (or the
// server's S-XXXXX from X-Incident); the reason never shows, except in Tony's debug mode (?debug=1). Every failure sends one /log/incident
// beacon. Cases: /explain 502 + X-Incident, a plain 500, headers then a dropped connection (phase stream), and an OpenRouter out of
// credit end to end (serve.py fails fast: 503 budget_cap). Own serve.py + a stub OpenRouter.
//   node tests/incident.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8877", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "inc-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
writeFileSync(join(banks, "BANK_INC.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_INC1", title: "Inc 1", type: "mc", shuffle: false,
  body: txt("Pick one."), correct: "a", choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })),
  saccharine: { title: "Inc 1", key: "Tick: a", slip: { b: "Two is not one." } } }] }));
/* a stub OpenRouter: out of credit (402) when `broke`, else a short reply */
let broke = false, orCalls = 0, keyCalls = 0;
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (req.method === "GET" && req.url === "/auth/key") {                // /health asks for the key's status (cached a minute by serve.py)
    keyCalls++;
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: { label: "sk-or-v1-x", limit: 10, usage: 9.5, limit_remaining: 0.5, is_free_tier: false } }));
    return;
  }
  const j = JSON.parse(body);
  if (j.stream) orCalls++;
  if (broke) { res.writeHead(402, { "Content-Type": "application/json" }); res.end('{"error": {"code": 402, "message": "Insufficient credits"}}'); return; }
  if (!j.stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "POOF! Tick: a." } }] })}\n\ndata: [DONE]\n\n`);
});
/* /explain that sends its headers, then drops the connection before any byte (the prod probe: 200, then net::ERR_ABORTED) */
const drop = createServer((req, res) => {
  req.resume();
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" });
  res.flushHeaders();
  setTimeout(() => res.socket.destroy(), 300);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
await new Promise(r => drop.listen(0, "127.0.0.1", r));
const logs = [], traces = [], raw = [];
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: ["ignore", "ignore", "pipe"] });
let part = "";   // a pipe chunk can end mid-line: whole lines only
srv.stderr.on("data", d => {
  const ls = (part + d).split("\n"); part = ls.pop(); raw.push(...ls);
  logs.push(...ls.filter(l => l.startsWith('{"incident"')).map(l => JSON.parse(l)));
  traces.push(...ls.filter(l => l.startsWith('{"trace"')).map(l => JSON.parse(l)));
});
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const CODE = /[ES]-[2-9A-HJ-NP-Z]{5}/;
const REASONS = /upstream|http|network|budget|credit|stream|timeout|empty|cap|exception/i;

/* the bank's question, a wrong pick: Cluck's reply is asked for in the background (the first question this session) */
async function wrong({ explain, debug = false, off = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  if (explain) await ctx.route("**/explain", explain);
  if (off) await ctx.addInitScript(() => { try { localStorage.setItem("stem-t-off", "1"); } catch { /* */ } });
  const page = await ctx.newPage();
  page.beacons = [];
  page.on("request", r => { if (new URL(r.url()).pathname === "/log/incident") page.beacons.push(JSON.parse(r.postData() || "{}")); });
  await page.goto(BASE + (debug ? "/?debug=1" : "/") + "#BANK_INC");
  await page.waitForFunction(() => !document.getElementById("splash") && /^#CALC1_INC1/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(() => /Send Tony this code/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 10000 });
  return page;
}
const chip = page => page.evaluate(() => document.querySelector("#wish").innerText.replace(/\s+/g, " ").trim());
const beacon = async (page, n = 1) => { for (let i = 0; i < 30 && page.beacons.length < n; i++) await page.waitForTimeout(100); return page.beacons; };

await step("/explain 502 + X-Incident: the old words + the server's code; no reason for a student; one beacon with that code", async () => {
  const page = await wrong({ explain: r => r.fulfill({ status: 502, headers: { "X-Incident": "S-7K3QX upstream" }, body: "" }) });
  const t = await chip(page);
  assert.match(t, /^Didn't load\. Tap to try again Send Tony this code: S-7K3QX$/, t);
  assert.ok(!REASONS.test(t), "no reason words: " + t);
  const [b] = await beacon(page);
  assert.deepEqual([b.code, b.where, b.reason, b.status, b.phase, b.path, b.q], ["S-7K3QX", "explain", "upstream", 502, "headers", "/explain", "CALC1_INC1"]);
  assert.ok(!/two|one|three/i.test(JSON.stringify(b)), "no question / answer text in the beacon");
  await page.screenshot({ path: join(SHOTS, "incident-502.png") });
  await page.context().close();
});

await step("a plain 500 (no header): the page's own E- code; the sheet says \"Cluck didn't load.\" + the code", async () => {
  const page = await wrong({ explain: r => r.fulfill({ status: 500, body: "" }) });
  const t = await chip(page);
  assert.match(t, /^Didn't load\. Tap to try again Send Tony this code: E-[2-9A-HJ-NP-Z]{5}$/, t);
  const code = t.match(CODE)[0];
  await page.click("#wish .wchip");                                    // a tap = Try again (still 500): a new code
  await page.waitForFunction(c => { const x = document.querySelector("#cluck .wtext")?.innerText || ""; return /Cluck didn't load\./.test(x) && /Send Tony this code: E-/.test(x) && !x.includes(c); }, code, { timeout: 8000 });
  const sheet = await page.evaluate(() => document.querySelector("#cluck .wtext").innerText.replace(/\s+/g, " ").trim());
  assert.match(sheet, /^Cluck didn't load\. Try again Send Tony this code: E-[2-9A-HJ-NP-Z]{5}$/, sheet);
  const sel = await page.evaluate(() => getComputedStyle(document.querySelector("#cluck .wtext .inc")).userSelect);
  assert.notEqual(sel, "none", "the code is selectable");
  const bs = await beacon(page, 2);
  assert.deepEqual(bs.map(b => [b.reason, b.status]), [["http", 500], ["http", 500]]);
  /* P2: /health also asks OpenRouter's /auth/key, at most once a minute (two /health calls so far: steps 1 and 2); no number reaches the page */
  assert.deepEqual(bs[0].fr.health, { claude: null, or: "ok" }, "OpenRouter's key has 0.50 left: ok");
  assert.equal(keyCalls, 1, "auth/key asked once for both /health calls");
  const hl = raw.filter(l => l.startsWith("health {"));
  assert.ok(hl.length >= 2 && hl.every(l => l.includes('"limit_remaining":0.5')), "the dollars in the server's log line: " + hl.join(" | "));
  assert.ok(!/0\.5|9\.5/.test(JSON.stringify(bs)), "never in the report");
  await page.context().close();
});

await step("headers, then the connection drops: a code shows, the beacon says phase=stream", async () => {
  const page = await wrong({ explain: r => r.continue({ url: `http://127.0.0.1:${drop.address().port}/explain` }) });
  const t = await chip(page);
  assert.match(t, /^Didn't load\. Tap to try again Send Tony this code: E-[2-9A-HJ-NP-Z]{5}$/, t);
  const [b] = await beacon(page);
  assert.equal(b.code, t.match(CODE)[0]);
  assert.deepEqual([b.where, b.phase, b.status, b.bytes], ["explain", "stream", 200, 0]);
  assert.match(b.err || "", /Error/);
  await page.context().close();
});

await step("OpenRouter out of credit (402), end to end: fast 503 + X-Incident budget_cap; the student sees the old words + the code only", async () => {
  broke = true; orCalls = 0; logs.length = 0;
  const page = await wrong();
  const t = await chip(page);
  assert.match(t, /^Didn't load\. Tap to try again Send Tony this code: S-[2-9A-HJ-NP-Z]{5}$/, t);
  assert.ok(!REASONS.test(t), "no 'credit' / budget words: " + t);
  const code = t.match(CODE)[0];
  assert.equal(orCalls, 0, "no Cluck model tried once the NOTE call said out of credit");
  const [b] = await beacon(page);
  assert.deepEqual([b.code, b.reason, b.status], [code, "budget_cap", 503]);
  for (let i = 0; i < 30 && !logs.some(l => l.src === "client"); i++) await page.waitForTimeout(100);
  assert.ok(logs.some(l => l.incident === code && l.src === "server" && l.reason === "budget_cap" && l.where === "explain"), "the server's line: " + JSON.stringify(logs));
  assert.ok(logs.some(l => l.reason === "budget_cap" && l["gen_ai.system"] === "openrouter" && l["http.response.status_code"] === 402), "the 402 line");
  const cl = logs.find(l => l.src === "client" && l.incident === code), sv = logs.find(l => l.src === "server" && l.incident === code);
  assert.ok(cl && cl.ua && cl.ua_raw && cl.t, "the beacon's line, with the UA family, the full UA and the time: " + JSON.stringify(cl));
  assert.match(b.trace_id || "", /^[0-9a-f]{32}$/);
  assert.equal(cl.trace_id, b.trace_id, "the beacon's trace id is the request's (traceparent)");
  assert.equal(sv.trace_id, b.trace_id, "the server's line shares it");
  /* P2: the request's ONE trace line: its status, the NOTE call's 402, its S- codes, the same trace id */
  for (let i = 0; i < 30 && !traces.some(x => x.path === "/explain"); i++) await page.waitForTimeout(100);
  const tl = traces.filter(x => x.path === "/explain");
  assert.equal(tl.length, 1, "one trace line: " + JSON.stringify(traces));
  assert.deepEqual([tl[0].status, tl[0].trace_id, tl[0].q, tl[0].done], [503, b.trace_id, "CALC1_INC1", true]);
  assert.ok(tl[0].inc.includes(code) && tl[0].phases.some(p => p.p === "note" && p.status === 402), JSON.stringify(tl[0]));
  await page.screenshot({ path: join(SHOTS, "incident-budget.png") });
  await page.context().close();
  broke = false;
});

await step("/check times out twice in a row (P2): the 2nd is its own incident, timeout_x2, with its own snapshot (not a dup of the 1st)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  await ctx.route("**/check", () => {});                               // never answers: net() aborts it after 8 s
  const page = await ctx.newPage();
  page.beacons = [];
  page.on("request", r => { if (new URL(r.url()).pathname === "/log/incident") page.beacons.push(JSON.parse(r.postData() || "{}")); });
  await page.goto(BASE + "/#BANK_INC");
  await page.waitForFunction(() => !document.getElementById("splash") && /^#CALC1_INC1/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(() => document.querySelector(".verdict.wait .inc") && /Too slow/.test(document.body.innerText), null, { timeout: 15000 });
  const first = await page.evaluate(() => document.querySelector(".verdict.wait .inc").dataset.inc);
  await page.click(".verdict.wait .retry");
  await page.waitForFunction(c => { const x = document.querySelector(".verdict.wait .inc"); return x && x.dataset.inc !== c; }, first, { timeout: 15000 });
  const bs = await beacon(page, 2);
  assert.deepEqual(bs.map(b => [b.where, b.reason, b.phase]), [["check", "timeout", "timeout"], ["check", "timeout_x2", "timeout"]]);
  assert.ok(bs.every(b => b.fr && b.fr.ring), "each with its own snapshot: " + JSON.stringify(bs.map(b => Object.keys(b.fr || {}))));
  assert.notEqual(bs[0].code, bs[1].code);
  await ctx.close();
});

await step("tracking off (privacy.html \"Don't record me\"): the code still shows, with a note; no report is sent", async () => {
  const page = await wrong({ explain: r => r.fulfill({ status: 500, body: "" }), off: true });
  assert.match(await chip(page), /^Didn't load\. Tap to try again Send Tony this code: E-[2-9A-HJ-NP-Z]{5} Tracking is off on this device, so Tony gets less to go on\.$/);
  await page.waitForTimeout(800);
  assert.deepEqual(page.beacons, [], "no /log/incident");
  await page.context().close();
});

await step("debug mode (?debug=1, Tony only): the code AND its reason; ?debug=0 turns it off", async () => {
  broke = true;
  let page = await wrong({ debug: true });
  assert.match(await chip(page), /Send Tony this code: S-[2-9A-HJ-NP-Z]{5} budget_cap$/);
  assert.equal(await page.evaluate(() => localStorage.getItem("stem-debug")), "1");
  await page.goto(BASE + "/?debug=0#CALC1_INC1");
  assert.equal(await page.evaluate(() => localStorage.getItem("stem-debug")), null);
  await page.context().close();
  broke = false;
});

await browser.close();
srv.kill(); stub.close(); drop.close();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
