// Flight recorder P1 (brain sprint-render-v2/flight-recorder-DESIGN.md): after some typing, scrolling and a resize, a stubbed /explain
// failure (504) sends ONE /log/incident report whose `fr` holds ring entries of each kind (incl. layout + net + cluck), keyboard entries
// as classes (no printable key), page.before (P2) + page.at, the diag line and /health's answer. A sentinel string typed into the answer field, the notes
// and Cluck's chat never reaches a report, a stemT (PostHog) call, a beacon or a server log line. The diag line shows in debug mode only.
// Own serve.py.
//   node tests/flight.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8878", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "flight-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const SENTINEL = "Zq7xSENTINELwv";
const txt = md => [{ type: "text", md }];
writeFileSync(join(banks, "BANK_FLY.json"), JSON.stringify({ v: 1, problems: [
  { code: "CALC1_FL1", title: "Fl 1", type: "text", answer: "derivative", body: txt("Which word? " + "Long line. ".repeat(80)) },
  { code: "CALC1_FL2", title: "Fl 2", type: "mc", shuffle: false, body: txt("Pick one."), correct: "a", choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })),
    saccharine: { title: "Fl 2", key: "Tick: a", slip: { b: "Two is not one." } } }] }));
const logs = [];
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: "http://127.0.0.1:9", OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: ["ignore", "ignore", "pipe"] });
let part = "";   // a pipe chunk can end mid-line: whole lines only
srv.stderr.on("data", d => { const ls = (part + d).split("\n"); part = ls.pop(); logs.push(...ls.filter(Boolean)); });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 1200)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });

/* a page that records every request body and every stemT call (what PostHog would get) */
async function open({ explain, chat, debug = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    window.__stemTcalls = [];
    let inner;                                                     // every function set as window.stemT is wrapped once, so each call is seen
    Object.defineProperty(window, "stemT", { configurable: true, get: () => inner,
      set: f => { inner = function (n, p) { try { window.__stemTcalls.push(JSON.stringify([n, p])); } catch { /* */ } return f.apply(this, arguments); }; } });
  });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  if (explain) await ctx.route("**/explain", explain);
  if (chat) await ctx.route("**/chat", chat);
  const page = await ctx.newPage();
  page.beacons = []; page.bodies = [];
  page.on("request", r => {
    const path = new URL(r.url()).pathname, body = r.postData() || "";
    page.bodies.push([path, r.url() + " " + body]);
    if (path === "/log/incident") page.beacons.push(JSON.parse(body || "{}"));
  });
  await page.goto(BASE + (debug ? "/?debug=1" : "/") + "#BANK_FLY");
  await page.waitForFunction(() => !document.getElementById("splash") && /^#CALC1_FL1/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  return page;
}
/* typing (answer field + notes, real key events), a scroll and a resize on question 1; then question 2, notes again, a wrong pick */
async function busyThenWrong(page) {
  await page.type("#ans", SENTINEL);
  await page.keyboard.press("Backspace"); await page.keyboard.press("ArrowLeft");
  await page.type("#scratch", SENTINEL + " x");
  await page.mouse.wheel(0, 600); await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1100, height: 820 }); await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = "#CALC1_FL2"; });
  await page.waitForFunction(() => /^#CALC1_FL2/.test(location.hash) && document.querySelector('.opt[data-id="b"]'), null, { timeout: 8000 });
  await page.type("#scratch", SENTINEL);
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
}
const waitFor = async (page, f, n = 1) => { for (let i = 0; i < 60 && page.beacons.filter(f).length < n; i++) await page.waitForTimeout(100); return page.beacons.filter(f); };
const LAYOUT = ["vp", "scroll", "box", "mq"];
const KEYS = /^(char|other|Space|Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Process|Unidentified|[a-zA-Z]+)$/;
/* the sentinel is nowhere: reports, stemT calls, server log lines, any request but the three that carry it by design (privacy.html: Cluck gets them; Check grades) */
async function noSentinel(page, what) {
  const calls = await page.evaluate(() => window.__stemTcalls);
  assert.ok(calls.length > 0, "stemT was called");
  for (const c of calls) assert.ok(!c.includes(SENTINEL), what + ": a stemT call carried it: " + c.slice(0, 300));
  for (const b of page.beacons) assert.ok(!JSON.stringify(b).includes(SENTINEL), what + ": the report carried it");
  for (const [path, body] of page.bodies) if (!["/explain", "/chat", "/check"].includes(path)) assert.ok(!body.includes(SENTINEL), what + ": " + path);
  for (const l of logs) assert.ok(!l.includes(SENTINEL), what + ": a server log line carried it: " + l.slice(0, 300));
}

await step("an /explain 504 after typing, scrolling and a resize: one report with the ring (each kind), kb classes, page.at, diag, health; no sentinel", async () => {
  const page = await open({ explain: r => r.fulfill({ status: 504, body: "" }) });
  const early = await page.evaluate(() => window.stemFR.ring.map(e => e.slice(1, 4).join(" ")));   // flight.js is deferred: still in time for app.js's first requests
  assert.equal(early[0].split(" ")[0], "boot", early.slice(0, 5));
  assert.ok(early.includes("net b s") && early.includes("net b h"), "the bank's boot-time request: " + early.slice(0, 12));
  assert.ok(early.indexOf("net b s") < early.findIndex(e => e.startsWith("nav ")), "before the first question opened");
  /* the slow path, every run: a busy page (CI block 4 under load, Oct 31: ~16 ResizeObserver entries, not ~9) logs more than 64 entries
     between boot and the error, so the boot-time header must survive however many came since: 64 layout entries before the busy part */
  await page.evaluate(() => { for (let i = 0; i < 64; i++) window.stemFR.log("ro", "#pad", 100 + i, 40); });
  await busyThenWrong(page);
  const [b] = await waitFor(page, x => x.where === "explain" && x.fr && x.fr.ring);
  assert.ok(b, "a report with a snapshot: " + JSON.stringify(page.beacons).slice(0, 400));
  const kinds = new Set(b.fr.ring.map(e => e[1]));
  for (const k of ["boot", "nav", "stage", "pick", "net", "cluck", "inc", ...LAYOUT]) assert.ok(kinds.has(k), `ring kind ${k} in ${[...kinds]}`);
  assert.ok(b.fr.ring.length <= 64);
  const ex = b.fr.ring.filter(e => e[1] === "net" && e[2] === "explain").map(e => e[3]);
  assert.deepEqual(ex.slice(0, 2), ["s", "h"], "the explain request: start, headers");
  assert.equal(b.fr.ring.find(e => e[1] === "net" && e[2] === "explain" && e[3] === "h")[4], 504);
  assert.ok(b.fr.ring.some(e => e[1] === "nav" && e[2] === "CALC1_FL2"), "the question opened");
  assert.ok(b.fr.kb.length > 0 && b.fr.kb.length <= 20, "kb entries: " + b.fr.kb.length);
  const evs = new Set(b.fr.kb.map(e => e[2]));
  for (const ev of ["kd", "ku", "in"]) assert.ok(evs.has(ev), `kb ${ev} in ${[...evs]}`);   // ku: P2
  for (const e of b.fr.kb) {
    assert.equal(e[0] % 100, 0, "100 ms times");
    if (e[4] != null) { assert.match(String(e[4]), KEYS, "a key class / inputType, never a value: " + JSON.stringify(e)); assert.ok(String(e[4]).length > 1, "no printable key: " + JSON.stringify(e)); }
  }
  assert.ok(b.fr.kb.some(e => e[4] === "char"), "printable keys as `char`");
  assert.ok(b.fr.kb.some(e => /scratch/.test(e[3] || "")), "the notes field named by its id");
  const at = b.fr.page.at;
  assert.equal(at.app.q, "CALC1_FL2");
  assert.equal(at.hash, "#CALC1_FL2");
  assert.ok(at.app.wish && at.app.wish.failed, "Cluck's state: failed");
  assert.ok(Array.isArray(at.boxes) && at.boxes.length > 0, "control boxes");
  const bf = b.fr.page.before;                                             // P2: the state re-read after the last stage / nav / cluck entry
  assert.ok(bf && bf.app && bf.hash && Array.isArray(bf.boxes) && Number.isFinite(bf.age_ms) && bf.age_ms >= 0, "page.before with its age: " + JSON.stringify(bf).slice(0, 300));
  assert.match(b.fr.diag, /^v.+ · explain 504 · \d+\.\d s · AI: (ok|err|cap|\?)$/);
  assert.ok(b.fr.health && "claude" in b.fr.health, "/health's answer folded in: " + JSON.stringify(b.fr.health));
  const size = JSON.stringify(b).length;
  assert.ok(size <= 16384, "under the hard cap: " + size);
  console.log("     report bytes:", size, "fr bytes:", JSON.stringify(b.fr).length, "page.at bytes:", JSON.stringify(at).length, "page.before bytes:", JSON.stringify(bf).length, "ring:", b.fr.ring.length, "kb:", b.fr.kb.length);
  const cl = () => logs.find(l => l.startsWith('{"incident":"' + b.code) && l.includes('"src":"client"'));
  for (let i = 0; i < 30 && !cl(); i++) await page.waitForTimeout(100);   // serve.py's stderr arrives on its own time (CI shard 2 raced it, Oct 23)
  const line = cl();
  assert.ok(line && JSON.parse(line).fr && JSON.parse(line).fr.ring, "the server's line carries the snapshot");
  const hl = () => logs.some(l => /^health \{/.test(l) && / rid=\S+ trace=[0-9a-f]{32}$/.test(l));
  for (let i = 0; i < 30 && !hl(); i++) await page.waitForTimeout(100);   // serve.py's stderr arrives on its own time
  assert.ok(hl(), "the /health line, with rid + trace: " + logs.filter(l => l.startsWith("health")).join(" | "));
  const t = await page.evaluate(() => document.querySelector("#wish").innerText);
  assert.ok(!/·|AI:/.test(t), "no diag line for a student: " + t);
  await noSentinel(page, "explain");
  await page.context().close();
});

await step("debug mode (?debug=1): the error card shows the diag line; a retry inside 60 s is a dup (no second snapshot)", async () => {
  const page = await open({ explain: r => r.fulfill({ status: 504, body: "" }), debug: true });
  await busyThenWrong(page);
  await waitFor(page, x => x.where === "explain");
  await page.click("#wish .wchip");                                          // try again: the same failure, the sheet opens
  await page.waitForFunction(() => document.querySelector("#cluck .wl .inc-diag"), null, { timeout: 8000 });
  const d = await page.evaluate(() => document.querySelector("#cluck .wl .inc-diag").textContent);
  assert.match(d, /^v.+ · explain 504 · \d+\.\d s · AI: (ok|err|cap|\?)$/, d);
  const bs = await waitFor(page, x => x.where === "explain", 2);
  assert.ok(bs[1].fr && bs[1].fr.dup === bs[0].code && bs[1].fr.n === 2, "the dup names the first code: " + JSON.stringify(bs[1].fr));
  await page.screenshot({ path: join(SHOTS, "flight-debug.png") });
  await page.context().close();
});

await step("chat fails after a typed question: its report has the chat field's kb entries as classes, no sentinel anywhere; no diag for a student", async () => {
  const page = await open({ explain: r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! Tick: a." }), chat: r => r.fulfill({ status: 500, body: "" }) });
  await busyThenWrong(page);
  await page.waitForFunction(() => window.__drill.page.wish?.end, null, { timeout: 8000 });
  if (await page.isHidden("#cluck")) await page.click("#wish .wchip, .cl-peek .cl-cta, .cue-chip");
  await page.waitForFunction(() => document.querySelector("#cluck .ask textarea") && !document.querySelector("#cluck .wtext.wrun"), null, { timeout: 8000 });   // the reply is typed out: the field stays put
  await page.click("#cluck .ask textarea");
  await page.type("#cluck .ask textarea", SENTINEL + " why");
  await page.click("#cluck .ask .send");
  const [b] = await waitFor(page, x => x.where === "chat");
  assert.ok(b && b.fr && b.fr.ring, "a chat report with a snapshot: " + JSON.stringify(page.beacons).slice(0, 600) + await page.evaluate(() => document.querySelector("#cluck")?.innerText.slice(-300)));
  assert.ok(b.fr.kb.some(e => /^textarea/.test(e[3] || "") && e[4] === "char"), "the chat field's keys, as classes: " + JSON.stringify(b.fr.kb.slice(-5)));
  assert.ok(b.fr.ring.some(e => e[1] === "net" && e[2] === "chat" && e[3] === "h" && e[4] === 500));
  assert.equal(await page.evaluate(() => document.querySelectorAll(".inc-diag").length), 0, "no diag line outside debug mode");
  await noSentinel(page, "chat");
  await page.context().close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
