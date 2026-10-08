// G2c-1: one Chromium walk of the student UX flows, phone 393x852 and desktop 1280x800, one screenshot per flow per width.
// Inventory: 56 phone UX flows (brain projects/calc/_files/genui-g2c-flows.md); rows 32, 40, 53, 56 are skipped or out of scope.
//   node tests/ux-flows.pw.mjs [port | base-url] [outDir]       FLOWS=20,43 runs only those rows.
// Always starts its own serve.py on a free port (the arg is only a port hint; tests/run-all.sh passes its base url, which is ignored)
// on a temp banks folder of fixtures (no real bank needed) with $OPENROUTER_API_KEY empty and a throwaway tries.json.
// /explain and /chat are stubbed with page.route (no key): the sheet UI is real, the text is fake. Log + shots go to outDir
// (default: a temp folder); the log line per flow per width is `<row> <flow> <width> ok|FAIL|SKIP <detail>`.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const ARG = process.argv[2] || "";
const PORT = /^[1-9]\d*$/.test(ARG) ? Number(ARG) : await freePort(), BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "uxf-"));
const OUT = process.argv[3] || join(tmp, "out");
const ONLY = process.env.FLOWS ? new Set(process.env.FLOWS.split(",").map(Number)) : null;
const LOG = join(OUT, "ux-flows-chromium.log");
mkdirSync(OUT, { recursive: true });

/* ---------- fixture banks (no real bank needed) ---------- */
const banks = join(tmp, "banks");
mkdirSync(banks);
const row = (id, md) => ({ id, md });
const abcd = () => ["one", "two", "three", "four"].map((md, i) => row("abcd"[i], md));
const q5 = n => ({ code: `CALC1_W0${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Five ${n}: pick a.` }], correct: "a",
  choices: ["one", "two", "three"].map((md, i) => row("abc"[i], md)) });
writeFileSync(join(banks, "BANK_QW5.json"), JSON.stringify({ v: 1, problems: [1, 2, 3, 4, 5].map(q5) }));
/* a sugar question with a layer: Cluck, rewards, a title. correct a; b and c have hints. */
const real = (code, n, x = {}) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: abcd(), correct: "a",
  wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: $F = ma$\nAnswer: a", slip: { b: "b slip", c: "c slip" }, ...(x.sg || {}) } });
const UXS = Array.from({ length: 12 }, (_, i) => real(`CALC1_UX${String(i + 1).padStart(2, "0")}`, i + 1, i === 2 ? { sg: { part: ["WE_THM"] } } : {}));
writeFileSync(join(banks, "BANK_UXS.json"), JSON.stringify({ v: 1, problems: UXS }));
writeFileSync(join(banks, "formula-sheet.json"), JSON.stringify({ v: 1, groups: [{ name: "Work and Energy", rows: [{ id: "WE_THM", tex: "W_{net} = \\Delta K" }] }] }));
/* a snack with an original and its worked solution (rewards.pw.mjs shape): the "See reference solution" fold */
const SOL = ["Use: $F = kx$", "$F = 2 \\cdot 3 = 6$ N", "Answer: 6 N"];
const snack = (code, before, q) => ({ ...real(code, 9), sugar_only: true, body: [{ type: "text", md: "Snack: $k = 4\\ \\text{N/m}$, pick a." }],
  saccharine: { title: `Practice Exam 2, Question ${q}: k changed`, key: "Use: a", snack: true, before,
    original: { q, body: [{ type: "text", md: "Snack: $k = 2\\ \\text{N/m}$, pick a." }], solution: SOL } } });
writeFileSync(join(banks, "BANK_UXK.json"), JSON.stringify({ v: 1, problems: [real("CALC1_UK1", 1), snack("CALC1_UKS", "CALC1_UK1", 7)] }));
/* F (#97): split_alone parent with its own row titles + a plain split parent (True/False rows), easy.pw.mjs P.split shape */
const SPLIT = {
  alone: { code: "CALC1_SA1", title: "Parent title", type: "mc", pick: "all", shuffle: false,
    body: [{ type: "text", md: "A cart rolls down a ramp.\nChoose all that apply." }, { type: "text", md: "Tap a row to tick it." }],
    choices: [row("a", "first"), row("b", "second")], correct: ["a"], miss: "QUACK. Missing one.",
    saccharine: { title: "Practice Exam 2, Question 9", key: "Tick: a", split_alone: true, split: [
      { sub: "CALC1_SA1A", title: "Row one: the cart speeds up", stem: "True or false: the cart speeds up.", answer: "true", slip: "It speeds up." },
      { sub: "CALC1_SA1B", title: "Row two: energy is lost", stem: "True or false: energy is lost.", answer: "false", slip: "No friction." }] } },
  plain: { code: "CALC1_SP1", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: "Two rows." }, { type: "text", md: "Tap a row to tick it." }],
    choices: [row("a", "first"), row("b", "second")], correct: ["a"], miss: "QUACK. Missing one.",
    saccharine: { title: "Practice Exam 2, Question 4", key: "Tick: a", split: [
      { sub: "CALC1_SP1A", stem: "True or false: first.", answer: "true", slip: "First is true." },
      { sub: "CALC1_SP1B", stem: "True or false: second.", answer: "false", slip: "Second is false." }] } },
};
writeFileSync(join(banks, "BANK_SPL.json"), JSON.stringify({ v: 1, problems: [SPLIT.alone, SPLIT.plain] }));
const CA1 = { code: "CALC1_CA1", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: "Which are even?" }],
  choices: [row("a", "two"), row("b", "three"), row("c", "four")], correct: ["a", "c"],
  wrong: [{ choice: "b", hint: "QUACK. 3 is odd." }], miss: "QUACK. Missing one.", saccharine: { title: "Fixture choose-all", key: "Tick: a, c", slip: { b: "3 is odd." } } };
/* multi-part (done.pw.mjs CALC1_D08), choose-all, a free-form number */
writeFileSync(join(banks, "BANK_MLT.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_D08", type: "multi", body: [{ type: "text", md: "Multi" }],
  parts: [{ type: "num", answer: "1", prompt: "one" }, { type: "num", answer: "2", prompt: "two", wrong: [{ match: "3", hint: "HINT-D08b" }] }] },
  CA1, { code: "CALC1_N01", type: "num", answer: "13", body: [{ type: "text", md: "A free-form number: type 13." }] }] }));
/* an upload (a student's problems.json) */
const UPLOAD = join(tmp, "problems.json");
writeFileSync(UPLOAD, JSON.stringify({ v: 1, problems: [1, 2, 3].map(n => ({ ...q5(n), code: `CALC1_U0${n}`, body: [{ type: "text", md: `Upload ${n}: pick a.` }] })) }));

/* serve.py on a free port (tests/queue-walk.pw.mjs bootstrap; stdio ignored = non-TTY, so the Q4 guard never prompts). Killed by its own handle only. */
const serve = (root, port, tag) => spawn("python3", [join(root, "serve.py"), String(port)], { cwd: root,
  env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, `tries-${tag}.json`), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
const up = async base => { for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) return; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("serve.py did not start on " + base); };
const srv = serve(ROOT, PORT, "main");
await up(BASE).catch(e => { srv.kill(); throw e; });

/* the answers (test side only) */
const KEY = new Map([...UXS, CA1, real("CALC1_UK1", 1)].map(p => [p.code, p]));
const C = { single: "CALC1_UX01", single2: "CALC1_UX02", all: "CALC1_CA1", num: "CALC1_N01", snack: "CALC1_UKS", part: "CALC1_UX03", bank: "BANK_UXS" };

/* ---------- log ---------- */
writeFileSync(LOG, [
  `# G2c-1 ux-flows, chromium ${new Date().toISOString()}`,
  `# build: HEAD ${(() => { try { return execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "?"; } })()}`,
  `# command: node tests/ux-flows.pw.mjs ${PORT} ${OUT}   (serve.py on 127.0.0.1:${PORT}, OPENROUTER_API_KEY empty, own temp fixture banks)`,
  `# widths: 393x852 (isMobile, hasTouch) and 1280x800. Format: <row> <flow> <width> ok|FAIL|SKIP  detail`, ""].join("\n"));
const results = [];
const log = (n, slug, w, st, detail) => {
  const line = `${String(n).padStart(2, "0")} ${slug.padEnd(22)} ${w} ${st.padEnd(4)} ${detail || ""}`.trimEnd();
  results.push({ n, slug, w, st, detail }); appendFileSync(LOG, line + "\n"); console.log(line);
};
class Skip extends Error {}
const skip = why => { throw new Skip(why); };

/* ---------- helpers (from tests/*.pw.mjs) ---------- */
const opened = (page, code) => page.waitForFunction(c => (!c || document.querySelector("#pcode")?.textContent === c) && /_/.test(document.querySelector("#pcode")?.textContent || "")
  && !document.querySelector("#freeze").hidden && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 10000 });
async function showCode(page) {   // easy.pw.mjs
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
const quiet = page => page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 }).catch(() => {});
const nTries = page => page.evaluate(() => window.__drill.state.tries.length);
const lastV = page => page.evaluate(() => window.__drill.state.tries.at(-1)?.v);
const tap = (page, sel) => page.$eval(sel, b => b.click());       // a DOM click: a send bubble may sit over the row (queue-walk)
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"; }, sel);
const toastText = page => page.evaluate(() => { const t = document.querySelector("#toast"); return t.classList.contains("on") ? t.textContent.trim() : ""; });
const qstate = page => page.evaluate(() => window.stemQueue && JSON.parse(JSON.stringify({ st: window.stemQueue.state(), item: window.stemQueue.item() })));
const dwell = page => page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100, null, { timeout: 6000 });
/* one graded mc pick by ids; returns the verdict */
async function pick(page, ids, all) {
  const n = await nTries(page);
  for (const id of ids) await tap(page, `#q .opt[data-id="${id}"]`);
  await page.waitForTimeout(80);
  if (all) await tap(page, "#mcGo"); else await tap(page, `#q .ch[data-id="${ids[0]}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 8000 });
  await page.waitForTimeout(150); await quiet(page);
  return lastV(page);
}
async function answerKey(page, code, right) {   // queue-walk.pw.mjs answer(): right = the key, wrong = one choice the key doesn't have
  const p = KEY.get(code) || q5(1);
  const ids = await page.$$eval("#q .opt:not(:disabled)", os => os.map(o => o.dataset.id));
  const want = [p.correct].flat(), all = p.pick === "all";
  const ids2 = right ? want.filter(i => ids.includes(i)) : ids.filter(i => !want.includes(i)).slice(0, 1);
  if (!ids2.length) return null;
  return pick(page, ids2, all);
}
const go = async (page, hash) => { await page.goto(`${BASE}/#${hash}`); await opened(page, /_/.test(hash) && !/^BANK_/.test(hash) ? hash : ""); await page.evaluate(() => window.Rewards && window.Rewards.config({ minDwell: 1e12 })); };
const xp = page => page.evaluate(() => window.Rewards?.state()?.xp ?? 0);
/* /explain + /chat stubs (no API key): a short fake stream */
const STUB_EX = "Stub text (no API key).\nUse: $F = ma$\nTick: b. Egg-cellent.";
async function stubCluck(page, { explain = 200, chat = 200, chatBody } = {}) {
  await page.route("**/explain", r => explain === 200 ? r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: STUB_EX }) : r.fulfill({ status: explain, body: "" }));
  await page.route("**/chat", r => chat === 200 ? r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Stub reply. $v = 2$" })
    : r.fulfill({ status: chat, contentType: "application/json", body: chatBody || "{}" }));
}
/* a wrong answer on a question with a presolved key (Cluck), then the sheet opened (phone: the chip; desktop: auto) */
async function cluckOpen(page, w) {
  await go(page, C.single);
  assert.equal(await answerKey(page, C.single, false), "wrong");
  await page.waitForFunction(() => !!document.querySelector("#wish .wchip"), null, { timeout: 6000 });
  if (w === 393) {
    await page.waitForFunction(() => /Show Cluck's steps|Cluck is writing/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });
    await page.click("#wish .wchip");
  }
  await page.waitForFunction(() => { const c = document.querySelector("#cluck"); return c && !c.hidden; }, null, { timeout: 6000 });
  await page.click("#cluck .wtext").catch(() => {});             // a tap skips the typing
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 8000 });
}

/* ---------- the flows ---------- */
// { n, slug, run(page, w, ctx) -> detail string, opts: { sw, ob (onboarding fresh), perms, mobileOnly } }
const F = [];
const flow = (n, slug, run, opts = {}) => F.push({ n, slug, run, opts });

flow(43, "offline-sw", async (page, w, ctx) => {
  const failed = []; page.on("requestfailed", r => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin) failed.push(u.pathname); });
  await page.goto(`${BASE}/#${C.single}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
  await opened(page, C.single);
  /* sw.js precaches the shell: wait until everything the page itself loads, plus privacy.html and telemetry.js, is in the cache */
  const need = await page.evaluate(() => [...new Set([...document.querySelectorAll("script[src], link[href]")].map(e => e.src || e.href).concat(["privacy.html", "telemetry.js", "offline.js", "index.html"].map(p => new URL(p, location.href).href)))]
    .filter(u => new URL(u).origin === location.origin));
  const missing = () => page.evaluate(async urls => { const out = []; for (const u of urls) if (!(await caches.match(u))) out.push(new URL(u).pathname); return out; }, need);
  let miss = await missing();
  for (let i = 0; i < 20 && miss.length; i++) { await page.waitForTimeout(500); miss = await missing(); }
  assert.deepEqual(miss, [], `sw.js did not precache what the app needs offline (${need.length} urls checked)`);
  await ctx.setOffline(true);
  const real = await page.evaluate(() => fetch("log/nope-" + Math.random(), { cache: "no-store" }).then(() => false, () => true));
  if (!real) skip("setOffline did not take for the page's own fetch (cannot prove offline)");
  failed.length = 0;
  await page.reload();
  await opened(page, C.single);
  const q = await page.textContent("#blocks");
  assert.ok(q.length > 20, "the question renders offline");
  const assets = failed.filter(p => /\.(js|mjs|css|woff2|html|json)$/.test(p) && !/^\/(log|k|p|b)\//.test(p));
  assert.deepEqual(assets, [], "no shell asset fails offline");
  const dyn = [...new Set(failed.filter(p => /^\/b\//.test(p)))];   // bank lists are network-only (sw.js route "pass"): noted, not asserted
  await page.screenshot({ path: join(OUT, `43-offline-sw-${w}-chromium.png`) });
  let priv = "";
  try {
    await page.goto(`${BASE}/privacy.html`, { timeout: 8000 });
    priv = await page.evaluate(() => document.querySelector("#offBtn") ? "privacy page" : document.body.innerText.slice(0, 60));
  } catch (e) { priv = "nav error " + String(e.message).split("\n")[0].slice(0, 80); }
  assert.equal(priv, "privacy page", `privacy.html offline: ${priv}`);
  await page.goto(`${BASE}/#${C.single}`).catch(() => {});
  await opened(page, C.single).catch(() => {});
  return `${need.length} shell urls cached (incl. privacy.html, telemetry.js); offline reload renders the question, privacy.html opens offline, no shell asset fails${dyn.length ? `; network-only (not cached by design): ${dyn.join(",")}` : ""}`;
}, { sw: true, noFinalShot: true });

flow(20, "cluck-explain", async (page, w) => {
  await stubCluck(page);
  await cluckOpen(page, w);
  const parent = await page.$eval("#cluck", e => e.parentElement.id || e.parentElement.tagName);
  assert.equal(parent, w === 393 ? "BODY" : "work", "phone: over the page; desktop: the notes column");
  assert.ok(await vis(page, "#cluck .cl-verify"), "verify line");
  return `stubbed /explain; sheet in ${parent}, text typed, verify line shown`;
});

flow(21, "cluck-sheet", async (page, w) => {
  const sheetHidden = () => page.evaluate(() => document.querySelector("#cluck").hidden);
  const closed = () => page.waitForFunction(() => document.querySelector("#cluck").hidden, null, { timeout: 3000 });
  const opened_ = () => page.waitForFunction(() => !document.querySelector("#cluck").hidden, null, { timeout: 3000 });
  await stubCluck(page);
  await cluckOpen(page, w);
  const r = await page.$eval("#cluck", e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), cls: document.documentElement.classList.contains("cl-open") }; });
  if (w === 393) assert.ok(r.l === 0 && r.w >= 390 && r.h >= 600 && r.cls, `phone: full-screen sheet, html.cl-open: ${JSON.stringify(r)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll with the sheet open");
  await page.screenshot({ path: join(OUT, `21-cluck-sheet-${w}-chromium.png`) });
  /* Esc closes (focus goes back to the chip), the chip reopens, the X closes */
  await page.keyboard.press("Escape"); await closed().catch(() => { throw new Error("Escape did not close the sheet"); });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("cl-open")), false, "html.cl-open cleared on close");
  await page.waitForFunction(() => /Show Cluck's steps/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 3000 });
  await page.click("#wish .wchip"); await opened_();
  await page.click("#cluck .wtext").catch(() => {}); await page.waitForTimeout(300);
  await page.click(w === 393 ? "#cluck .cl-bar .cl-x" : "#cluck .cl-x2"); await closed();
  /* fold: a snack carries the original's worked solution under Cluck's text ("See reference solution") */
  await go(page, C.snack);
  assert.equal(await answerKey(page, C.snack, false), "wrong");
  await page.waitForFunction(() => !!document.querySelector("#origHd"), null, { timeout: 6000 });
  await page.waitForTimeout(400);
  if (await sheetHidden()) await page.click("#origHd");   // phone: the card is the one way in; desktop: it opens by itself
  await opened_();
  await page.click("#cluck .wtext").catch(() => {});
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 8000 });
  const fold = () => page.getAttribute("#clFold", "aria-expanded");
  const sol = () => vis(page, "#cluck .orig-sol");
  assert.equal(await page.textContent("#clFold .cl-fold-t"), "See reference solution");
  /* phone: the card ("Similar solution steps") opened the sheet, so the steps are showing; desktop: the explanation opened by itself, the fold is shut after a miss */
  const start = w === 393 ? "true" : "false", other = start === "true" ? "false" : "true";
  assert.equal(await fold(), start, `the fold starts ${start === "true" ? "open (opened from the card)" : "shut after a miss"}`);
  assert.equal(await sol(), start === "true", "the steps follow the fold");
  await page.click("#clFold"); assert.equal(await fold(), other); assert.equal(await sol(), other === "true", "the fold toggles the steps");
  await page.screenshot({ path: join(OUT, `21-cluck-sheet-${w}-fold-${other === "true" ? "open" : "shut"}-chromium.png`) });
  await page.click("#clFold"); assert.equal(await fold(), start); assert.equal(await sol(), start === "true", "toggled back");
  await page.keyboard.press("Escape"); await closed();
  await page.click("#origHd"); await opened_();     // reopen for the final shot
  await page.waitForTimeout(300);
  return `${w === 393 ? `phone full-screen ${r.w}x${r.h}, html.cl-open; ` : "desktop: sheet in the notes column; "}Esc closes, chip reopens, X closes; snack: fold ${start === "true" ? "starts open from the card" : "starts shut"}, toggles both ways, Esc closes`;
});

flow(23, "cluck-errors", async (page, w) => {
  const out = [];
  const wishTxt = () => page.evaluate(() => (document.querySelector("#wish")?.textContent || "").trim());
  const sheetTxt = () => page.evaluate(() => (document.querySelector("#cluck .wtext")?.textContent || "").trim());
  const tappable = sel => page.evaluate(s => { const b = document.querySelector(s); if (!b || !b.getClientRects().length || b.closest("[hidden]")) return false;
    const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && b.contains(e); }, sel);
  // (a) the local hourly cap: 5 auto asks this hour -> no auto-open, no request, the chip says "Explain my mistake"
  await page.addInitScript(() => { try { if (!sessionStorage.getItem("ux23")) { sessionStorage.setItem("ux23", "1"); localStorage.setItem("stem-wish", JSON.stringify([1, 2, 3, 4, 5].map(() => Date.now()))); } } catch { /* */ } });
  let asks = 0;
  await page.route("**/explain", r => { asks++; r.fulfill({ status: 500, body: "" }); });
  await go(page, C.single);
  assert.equal(await answerKey(page, C.single, false), "wrong");
  await page.waitForFunction(() => /Explain my mistake/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });
  assert.ok(await vis(page, "#wish .wchip"), "'Explain my mistake' chip visible past the cap");
  assert.ok(!(await vis(page, "#cluck")), "no auto-open past the cap");
  assert.equal(asks, 0, "no auto /explain past the cap");
  out.push("local cap: chip 'Explain my mistake', no auto-open, no request");
  await page.screenshot({ path: join(OUT, `23-cluck-errors-${w}-cap-chromium.png`) });
  // (b) /explain fails (500): chip "Didn't load. Tap to try again"; the open sheet says "Cluck didn't load." + a Try again that re-sends
  await page.click("#wish .wchip");
  await page.waitForFunction(() => /Didn't load\. Tap to try again/.test(document.querySelector("#wish")?.textContent || ""), null, { timeout: 6000 });
  await page.waitForFunction(() => /Cluck didn't load\./.test(document.querySelector("#cluck:not([hidden]) .wtext")?.textContent || ""), null, { timeout: 6000 });
  await page.waitForTimeout(400);
  assert.ok(!/typing/i.test(await sheetTxt()), "no 'typing' text left on a failure");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#cluck .wtext .wcaret").length), 0, "no caret forever on a failure");
  assert.ok(await tappable("#cluck .wtext .wretry"), "the sheet's Try again is tappable");
  assert.equal((await page.textContent("#cluck .wtext .wretry")).trim(), "Try again");
  await page.screenshot({ path: join(OUT, `23-cluck-errors-${w}-explain500-chromium.png`) });
  const before = asks;
  await page.click("#cluck .wtext .wretry");
  await page.waitForFunction(() => /Cluck didn't load\./.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 6000 });
  assert.ok(asks > before, "Try again sent a new /explain");
  out.push(`/explain 500: chip "Didn't load. Tap to try again", sheet "Cluck didn't load." + Try again (re-sends, ${asks - before} new request)`);
  // (c) the server's hourly cap on /explain (429): "Cluck is out of wishes for this hour. Try again later."
  await page.unroute("**/explain");
  await page.route("**/explain", r => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "hourly" }) }));
  await page.click("#cluck .wtext .wretry");
  await page.waitForFunction(() => /out of wishes for this hour/.test(document.querySelector("#cluck .wtext")?.textContent || ""), null, { timeout: 6000 });
  assert.match(await sheetTxt(), /Cluck is out of wishes for this hour\. Try again later\./);
  await page.screenshot({ path: join(OUT, `23-cluck-errors-${w}-explain429-chromium.png`) });
  out.push("/explain 429: 'Cluck is out of wishes for this hour. Try again later.'");
  // (d) /chat 429 (hourly): the reply bubble says the same
  await page.unroute("**/explain");
  await stubCluck(page, { chat: 429, chatBody: "{}" });
  if (await vis(page, "#cluck")) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.click("#wish .wchip");                       // started=false after a 429: this asks again, now stubbed ok
  await page.waitForFunction(() => !document.querySelector("#cluck").hidden, null, { timeout: 4000 });
  await page.click("#cluck .wtext").catch(() => {});
  await page.waitForSelector("#cluck .ask input:not([disabled])", { timeout: 8000 });
  await page.fill("#cluck .ask input", "why?"); await page.click("#cluck .ask .send");
  await page.waitForFunction(() => /out of wishes for this hour/.test(document.querySelector("#cluck .cl-thread")?.textContent || ""), null, { timeout: 5000 });
  out.push("/chat 429: 'Cluck is out of wishes for this hour.'");
  return "stubbed; " + out.join("; ");
});

flow(24, "disclaimer-suffix", async (page, w) => {
  await stubCluck(page);
  await cluckOpen(page, w);
  const v = await page.$eval("#cluck .cl-verify", e => ({ t: e.textContent.trim(), after: getComputedStyle(e, "::after").content, shown: e.getClientRects().length > 0 }));
  assert.ok(v.shown, "the verify line shows");
  assert.equal(v.t, "verify b4 use lol");
  assert.match(v.after, /and pls no private shit in it xoxo/);
  return `stubbed; "${v.t}" + ::after ${v.after}`;
});

flow(22, "cluck-chat-5", async (page, w) => {
  await stubCluck(page);
  await cluckOpen(page, w);
  for (let n = 1; n <= 5; n++) {
    await page.waitForSelector("#cluck .ask .send:not([disabled])", { timeout: 6000 });
    await page.fill("#cluck .ask input", `why step ${n}?`); await page.click("#cluck .ask .send");
    await page.waitForFunction(k => document.querySelectorAll("#cluck .wreply").length === k && !document.querySelector("#cluck.wbusy"), n, { timeout: 6000 });
  }
  await page.waitForFunction(() => /That's 5 questions on this one/.test(document.querySelector("#cluck .done-row")?.textContent || ""), null, { timeout: 3000 });
  return "stubbed /chat; 5 replies, then the done row";
});

flow(27, "redeem-showing", async (page, w) => {
  await go(page, "BANK_QW5");
  const first = await page.textContent("#pcode");
  await dwell(page); assert.equal(await pick(page, ["b"]), "wrong");
  for (let i = 0; i < 6; i++) {
    await page.click("#qnext");
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, await page.textContent("#pcode"), { timeout: 8000 }).catch(() => {});
    await opened(page, "");
    const { item } = await qstate(page);
    if (item && item.redeem) {
      assert.equal(await page.textContent("#pcode"), first, "the missed one comes back");
      assert.ok(await page.$("#q .opt:not(:disabled)"), "answerable again (fresh round)");
      return `${first} back as a Redeem after ${i} others, answerable`;
    }
    await dwell(page); await pick(page, ["a"]);
  }
  throw new Error("no Redeem showing within 6 Nexts");
});

flow(28, "comeback-toast", async (page, w) => {
  /* rewards run only on sugar questions with a layer (BANK_QW5 has none: Rewards.state() is null there), so walk the BANK_UXS fixture.
     Two walks: streak 0, then a fresh state with the streak seeded to 4 so the right Redeem itself is "5 in a row" (a streak note wants
     the toast slot on that very answer; go() sets minDwell 1e12, so no drop competes). Comeback must still show. */
  const a = await walk28(page, 0);
  await page.evaluate(() => localStorage.clear()); await page.goto("about:blank");   // a real reload: same-hash goto would keep the old queue
  const b = await walk28(page, 4);
  return `${a} | streak sub-check: ${b}`;
});
async function walk28(page, seed) {
  await go(page, C.bank);
  await page.evaluate(() => { window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll(".fx-toast-t")) if (!t.__seen) { t.__seen = 1; window.__toasts.push(t.textContent); } }).observe(document.body, { childList: true, subtree: true }); });
  const first = await page.textContent("#pcode");
  await dwell(page);
  const v0 = await answerKey(page, first, false);
  if (v0 !== "wrong") skip(`first question ${first} could not be answered wrong (${v0})`);
  for (let i = 0; i < 12; i++) {
    const c = await page.textContent("#pcode");
    await page.click("#qnext");
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, c, { timeout: 8000 }).catch(() => {});
    await opened(page, "");
    const { item } = await qstate(page), code = await page.textContent("#pcode");
    if (item && item.redeem) {
      const x0 = await xp(page);
      await dwell(page);
      if (seed) await page.evaluate(n => { for (const k of Object.keys(localStorage)) if (k.startsWith("stem-rw:")) { const j = JSON.parse(localStorage.getItem(k)); if (j && "streak" in j) { j.streak = n; localStorage.setItem(k, JSON.stringify(j)); } } }, seed);   // answer() re-reads it
      while (await page.$("#q .opt:not(:disabled)")) { const v = await answerKey(page, code, true); if (v === "correct" || v === null) break; }
      await page.waitForFunction(() => window.__toasts.includes("Comeback!"), null, { timeout: 4000 })
        .catch(async () => { throw new Error(`no 'Comeback!' toast on a right Redeem of ${code} (streak ${seed} before it); fx toasts seen: ${JSON.stringify(await page.evaluate(() => window.__toasts))}; XP ${x0} -> ${await xp(page)}`); });
      const st = await page.evaluate(() => window.Rewards?.state()?.streak);
      if (seed) assert.equal(st, seed + 1, "the streak still counts the Redeem");
      await page.waitForTimeout(300);
      const x1 = await xp(page);
      /* XP: app.js:1446 pays a never-paid code's first right as usual (+ the toast); "no XP" is only for a code already paid (!res.xp) */
      if (seed) return `${code} Redeem after ${i} others, streak seeded ${seed} -> ${st} ("${seed + 1} in a row" on this answer); toasts ${JSON.stringify(await page.evaluate(() => window.__toasts))}`;
      return `${code} missed, back as a Redeem after ${i} others (streak kept at 0); right -> toast "Comeback!"; XP ${x0} -> ${x1} (code never paid before, so it pays: inventory's "no XP" holds only for an already-paid code)`;
    }
    await dwell(page); if (await page.$("#q .opt:not(:disabled)")) await answerKey(page, code, false);   // wrong: the streak stays 0
  }
  throw new Error("no Redeem showing within 9 Nexts");
}

flow(38, "split-alone-rows", async (page, w) => {
  await go(page, "CALC1_SA1A");
  const t = await page.textContent("#blocks");
  assert.ok(!/choose all|tap a row/i.test(t), "no parent choose-all lines on the row: " + t.slice(0, 120));
  assert.equal((await page.textContent("#blocks .ptitle")).trim(), "Row one: the cart speeds up", "the row's own title");
  assert.match(t, /A cart rolls down a ramp/); assert.match(t, /the cart speeds up\./);
  assert.deepEqual(await page.$$eval("#q .opt .txt", xs => xs.map(x => x.textContent.trim())), ["True", "False"]);
  return "fixture split_alone parent: row title, no choose-all line, True/False";
});

flow(6, "code-suggestions", async (page, w) => {
  await go(page, C.bank);
  await showCode(page);
  await page.fill("#code", ""); await page.type("#code", C.single.slice(0, 7));
  await page.waitForSelector("#codeSug:not([hidden]) li[data-code]", { timeout: 3000 });
  const opts = await page.$$eval("#codeSug li[data-code]", l => l.map(x => x.dataset.code));
  await page.screenshot({ path: join(OUT, `06-code-suggestions-${w}-dropdown-chromium.png`) });
  const target = opts.find(c => c === C.single) || opts[0];
  const hit = await page.$eval(`#codeSug li[data-code="${target}"]`, li => { const r = li.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return li.contains(e) ? "" : (e && (e.closest("[id]")?.id || e.tagName)) || "nothing"; });
  if (hit) {   // covered: try the keyboard path so the log says whether the suggestion is reachable at all
    await page.press("#code", "ArrowDown"); await page.press("#code", "Enter");
    const kb = await opened(page, target).then(() => "keyboard ArrowDown+Enter still opens it", () => "keyboard path fails too");
    throw new Error(`suggestion li under #${hit} (elementFromPoint at its centre): a tap cannot reach it; ${kb}`);
  }
  await page.click(`#codeSug li[data-code="${target}"]`);
  await opened(page, target);
  return `typed ${C.single.slice(0, 7)} -> ${opts.length} suggestions [${opts.slice(0, 4).join(",")}...]; tap opened ${target} (dropdown shot: 06-code-suggestions-${w}-dropdown-chromium.png)`;
});

flow(8, "bad-code", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  await showCode(page);
  await page.fill("#code", "CALC1_ZZZ"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /CALC1_ZZZ not found\./.test(document.querySelector("#entryMsg")?.textContent || ""), null, { timeout: 8000 });
  await page.fill("#code", "%%%"); await page.press("#code", "Enter");
  await page.waitForFunction(() => /Not a code\. Try CALC1_T6B\./.test(document.querySelector("#entryMsg")?.textContent || ""), null, { timeout: 3000 });
  assert.ok(await vis(page, "#entryMsg"));
  return "'CALC1_ZZZ not found.' then 'Not a code. Try CALC1_T6B.'";
});

flow(39, "update-bar", async (page, w) => {
  /* never touch the worktree: a copy of the app (no tests, no .git, no node_modules) gets its own serve.py, and the copy's app.css is edited */
  const copy = join(tmp, `app-copy-${w}`), port = await freePort(), base = `http://127.0.0.1:${port}`;
  cpSync(ROOT, copy, { recursive: true, filter: src => !/(^|\/)(\.git|node_modules|tests|banks|tmp)(\/|$)/.test(src.slice(ROOT.length)) });
  const s2 = serve(copy, port, `upd${w}`);
  try {
    await up(base);
    const css = join(copy, "app.css"), orig = readFileSync(css, "utf8");
    await page.goto(base + "/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    writeFileSync(css, orig + `\n/* g2c ${Date.now()} */\n`);
    await page.reload();
    await page.locator("#updateBar").waitFor({ state: "visible", timeout: 8000 });
    assert.equal((await page.textContent("#updateBar")).trim(), "New version ready. Tap to update.");
    const r = await page.$eval("#updateBar", b => { const x = b.getBoundingClientRect(); return { l: x.left, r: x.right, vw: innerWidth, h: x.height }; });
    assert.ok(r.l >= 0 && r.r <= r.vw + 0.5, `bar inside the viewport: ${JSON.stringify(r)}`);
    await page.screenshot({ path: join(OUT, `39-update-bar-${w}-chromium.png`) });
    await Promise.all([page.waitForEvent("load", { timeout: 15000 }), page.click("#updateBar")]);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator("#updateBar").count(), 0, "bar gone after one tap");
    return `bar ${Math.round(r.r - r.l)}x${Math.round(r.h)} inside ${r.vw}px; one tap reloads, bar gone (shot taken with the bar up; edited a temp copy of the app, not the worktree)`;
  } finally { s2.kill(); }
}, { sw: true, noFinalShot: true });

flow(46, "copy-my-work", async (page, w) => {
  await page.addInitScript(() => {
    window.__copied = [];
    try { const wt = navigator.clipboard && navigator.clipboard.writeText.bind(navigator.clipboard); if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__copied.push(t); return wt ? wt(t).catch(() => {}) : Promise.resolve(); }; } catch { /* */ }
    const ex = document.execCommand.bind(document);
    document.execCommand = (c, ...a) => { if (c === "copy") { const s = document.activeElement; window.__copied.push(s && "value" in s ? s.value : String(getSelection())); return true; } return ex(c, ...a); };
  });
  await go(page, C.single);
  if (w === 393) { await page.click("#padFab"); await page.waitForTimeout(500); }
  await page.waitForSelector("#scratch", { state: "visible", timeout: 4000 });
  await page.fill("#scratch", "my work: F = ma, so a = 2");
  await page.waitForSelector("#copy:not([hidden])", { timeout: 3000 });
  await page.click("#copy");
  /* wait for the tick itself (it shows for 1.6 s, app.js copy handler): the old "tick OR payload" wait raced the class change */
  const done = await page.waitForFunction(() => document.querySelector("#copy").classList.contains("done"), null, { timeout: 3000 }).then(() => true, () => false);
  await page.waitForFunction(() => window.__copied.length, null, { timeout: 3000 }).catch(() => {});
  const got = await page.evaluate(() => window.__copied.at(-1) || "");
  assert.ok(done, "the button shows the copied tick");
  assert.ok(got.includes(C.single) && got.includes("F = ma, so a = 2"), "payload has the code and the notes: " + got.slice(0, 160));
  return `payload ${got.length} chars, has code + notes; button ticked`;
});

flow(50, "record-again", async (page, w) => {
  await page.goto(`${BASE}/privacy.html`);
  await page.click("#offBtn");
  await page.waitForFunction(() => /Recording is off on this device\./.test(document.body.textContent) && document.querySelector("#offBtn").textContent === "Record again", null, { timeout: 3000 });
  await page.screenshot({ path: join(OUT, `50-record-again-${w}-off-chromium.png`) });
  await page.click("#offBtn");
  await page.waitForFunction(() => document.querySelector("#offBtn").textContent === "Don't record me", null, { timeout: 3000 });
  return "'Recording is off on this device.' + 'Record again' (shot 50-record-again-*-off), tap again -> 'Don't record me'";
});

flow(49, "footer-privacy", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  assert.ok(await vis(page, "#privacy"), "start page: the privacy link shows");
  assert.equal(await page.$eval("#privacy", e => getComputedStyle(e, "::after").content), '"privacy"');
  await go(page, C.single);
  const over = await vis(page, "#privacy");
  if (w === 393) assert.equal(over, false, "phone over a question: no footer link");
  await page.goto(BASE + "/"); await page.waitForTimeout(600);
  await Promise.all([page.waitForURL(/privacy\.html/), page.click("#privacy")]);
  assert.ok(await page.$("#offBtn"));
  await page.goBack(); await page.waitForTimeout(500);
  return `start page link shown; over a question ${over ? "shown" : "hidden"}; tap opens privacy.html`;
});

flow(1, "splash", async (page, w) => {
  await page.goto(BASE + "/");
  await page.waitForFunction(() => { const s = document.querySelector("#splash"); return (!s || getComputedStyle(s).opacity === "0" || s.hidden) && !document.querySelector('[aria-busy="true"]'); }, null, { timeout: 6000 });
  return "splash faded, aria-busy cleared";
}, { ob: true });

flow(2, "start-page", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(900);
  assert.equal((await page.textContent("#startTitle")).trim(), "Type a code to start.");
  assert.ok(await vis(page, "#startTitle"));
  return "'Type a code to start.'";
}, { ob: true });

flow(3, "pick-bank-typed", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  await showCode(page);
  await page.fill("#code", "uxs"); await page.press("#code", "Enter");
  await opened(page, "");
  assert.match(await page.textContent("#pcode"), /^CALC1_UX/);
  assert.ok(await vis(page, "#qlistBtn"), "the bank's list button");
  return `'uxs' -> ${await page.textContent("#pcode")}`;
});

flow(4, "pick-bank-url", async (page, w) => {
  await go(page, C.bank);
  assert.match(await page.textContent("#pcode"), /^CALC1_UX/);
  assert.ok(await vis(page, "#qnext"));
  return `/#${C.bank} -> ${await page.textContent("#pcode")}`;
});

flow(5, "open-by-code", async (page, w) => {
  await go(page, C.single);
  assert.ok((await page.textContent("#blocks")).length > 20);
  return `/#${C.single} renders`;
});

flow(7, "paste-code", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  await page.evaluate(c => navigator.clipboard.writeText(c), C.single2);
  await showCode(page);
  await page.click("#codePaste");
  await page.waitForFunction(c => document.querySelector("#code").value === c, C.single2, { timeout: 3000 });
  return `paste button put ${C.single2} in the box`;
}, { perms: ["clipboard-read", "clipboard-write"] });

flow(9, "slow-load-retry", async (page, w) => {
  let stall = true;
  await page.route(new RegExp(`/p/${C.single}\\.json`), r => { if (stall) return; r.continue(); });
  await page.goto(`${BASE}/#${C.single}`);
  await page.waitForFunction(() => /Too slow\. Tap Try again\./.test(document.querySelector("#entryMsg")?.textContent || ""), null, { timeout: 12000 });
  assert.ok(await vis(page, "#retryLoad"), "Try again button");
  await page.screenshot({ path: join(OUT, `09-slow-load-retry-${w}-chromium.png`) });
  stall = false; await page.click("#retryLoad"); await opened(page, C.single);
  return "'Too slow. Tap Try again.' + retry button (shot), retry opens the question";
}, { noFinalShot: true });

flow(10, "change-code", async (page, w) => {
  await go(page, C.single);
  if (w === 393 && !(await vis(page, "#codeChip")) && await vis(page, "#barTab")) { await page.click("#barTab"); await page.waitForTimeout(450); }
  if (await vis(page, "#codeChip")) await page.click("#codeChip"); else await showCode(page);
  await page.waitForSelector("#code", { state: "visible", timeout: 3000 });
  if (w === 393 && !(await page.evaluate(() => document.activeElement?.id === "code"))) await page.tap("#code");   // phone: the strip brings the box; a tap focuses it
  const sel = await page.$eval("#code", i => [i.value, i.placeholder, document.activeElement === i]);
  assert.ok(sel[2], "the box is focused");
  assert.equal(sel[1], C.single, "the open code shows as the placeholder (app.js:451: the box itself is empty)");
  return `box out + focused, empty with ${C.single} as placeholder (inventory says "code selected"; by design the value is "" since app.js:451)`;
});

flow(11, "code-bar-strip", async (page, w) => {
  await go(page, C.single);
  if (w === 1280) { assert.ok(!(await vis(page, "#barTab")), "desktop: no strip handle"); assert.ok(await vis(page, "#codeChip") || await vis(page, "#code"), "desktop: whole bar"); return "desktop: whole bar, no strip"; }
  const fz0 = await page.$eval("#freeze", e => e.getBoundingClientRect().top);
  assert.ok(await vis(page, "#barTab"), "the strip handle");
  await page.click("#barTab"); await page.waitForTimeout(450);
  assert.ok(await vis(page, "#code"), "bar slid out with the code box");
  const fz1 = await page.$eval("#freeze", e => e.getBoundingClientRect().top);
  assert.ok(Math.abs(fz1 - fz0) <= 1, `no reflow: ${fz0} -> ${fz1}`);
  return "strip tap slides the bar over the page, no reflow";
});

flow(12, "mc-right-first", async (page, w) => {
  await go(page, C.single);
  assert.equal(await answerKey(page, C.single, true), "correct");
  await page.waitForSelector("#q.closed", { timeout: 3000 });
  return "correct, closed";
});

flow(13, "mc-wrong-try-left", async (page, w) => {
  await go(page, C.single);
  assert.equal(await answerKey(page, C.single, false), "wrong");
  assert.ok(await page.$("#q .opt:not(:disabled)"), "a try left");
  assert.ok(await page.$("#q .opt:disabled"), "the wrong row struck");
  const hint = await page.evaluate(() => [...document.querySelectorAll("#q .cluck, #fb")].map(e => e.textContent.trim()).join(" ").trim());
  assert.ok(hint.length > 3, "a hint shows");
  return `wrong, row struck, try left; hint "${hint.slice(0, 60)}"`;
});

flow(14, "mc-lockout", async (page, w) => {
  await go(page, C.single);
  for (let i = 0; i < 6 && (await page.$("#q .opt:not(:disabled)")); i++) await answerKey(page, C.single, false);
  await page.waitForFunction(() => /Out of tries for now\. This one comes back around\./.test(document.querySelector("#q")?.textContent + document.querySelector("#fb")?.textContent), null, { timeout: 4000 });
  return "'Out of tries for now. This one comes back around.'";
});

flow(15, "choose-all", async (page, w) => {
  await go(page, C.all);
  const p = { correct: ["a", "c"] }, ids = await page.$$eval("#q .opt:not(:disabled)", os => os.map(o => o.dataset.id));
  const bad = ids.find(i => !p.correct.includes(i));
  assert.equal(await pick(page, [...p.correct.filter(i => ids.includes(i)), bad], true), "wrong");
  const struck = await page.$$eval("#q .opt", os => os.filter(o => o.disabled || /struck|x\b/.test(o.className)).length);
  assert.ok(struck >= 1, "a struck distractor");
  return `ticked key + ${bad}: wrong, ${struck} struck`;
});

flow(16, "free-form-num", async (page, w) => {
    await go(page, C.num);
  await page.fill("#ans", "abc"); await page.press("#ans", "Enter");
  await page.waitForFunction(() => /Can't read/.test(document.querySelector("#q")?.textContent + document.querySelector("#fb")?.textContent), null, { timeout: 4000 });
  await page.screenshot({ path: join(OUT, `16-free-form-num-${w}-cantread-chromium.png`) });
  await page.fill("#ans", "13"); await page.press("#ans", "Enter");
  await page.waitForFunction(() => window.__drill.state.tries.at(-1)?.v === "correct", null, { timeout: 4000 });
  return `fixture CALC1_N01: "Can't read" on abc (shot -cantread), then 13 correct`;
});

flow(17, "multi-part", async (page, w) => {
  await go(page, "CALC1_D08");
  await page.fill('#q .part[data-i="0"] .ans', "1"); await page.press('#q .part[data-i="0"] .ans', "Enter"); await page.waitForTimeout(400);
  await page.fill('#q .part[data-i="1"] .ans', "3"); await page.press('#q .part[data-i="1"] .ans', "Enter"); await page.waitForTimeout(400);
  assert.equal(await page.$eval('#q .part[data-i="0"] .ans', e => e.disabled), true, "part 1 right: done");
  assert.match(await page.$eval('#q .part[data-i="1"] .phint', e => e.textContent), /HINT-D08b/);
  return "fixture: part 1 right (locked), part 2 wrong with its hint";
});

flow(18, "cluck-hint-quack", async (page, w) => {
  await go(page, C.all);
  assert.equal(await pick(page, [], true), "wrong");
  const t = await page.evaluate(() => [...document.querySelectorAll(".cluck, #fb")].filter(e => e.getClientRects().length && e.textContent.trim()).map(e => e.textContent.trim()).join(" | "));
  assert.match(t, /QUACK/i, "QUACK prefix: " + t);
  return `hint "${t.slice(0, 70)}"`;
});

flow(19, "hint-in-check-row", async (page, w) => {
  await go(page, C.all);
  assert.equal(await pick(page, [], true), "wrong");
  const inRow = await page.evaluate(() => (document.querySelector("#q .chk .cluck")?.textContent || "").trim());
  if (w === 1280) assert.ok(inRow.length > 0, "desktop: the hint sits in the Check row");
  else assert.ok(!inRow && await page.evaluate(() => [...document.querySelectorAll(".cluck, #fb")].some(e => e.getClientRects().length && /QUACK/.test(e.textContent))), "phone: the hint under the question, not in the Check row");
  return inRow ? `in the Check row: "${inRow.slice(0, 50)}"` : "under the question";
});

flow(25, "next-prev-queue", async (page, w) => {
  await go(page, C.bank);
  const seen = [await page.textContent("#pcode")];
  for (let i = 0; i < 5; i++) {
    await page.click("#qnext");
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, seen.at(-1), { timeout: 8000 });
    await opened(page, ""); seen.push(await page.textContent("#pcode"));
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j <= i + 3 && j < seen.length; j++) assert.notEqual(seen[i], seen[j]);
  await page.click("#qprev"); await opened(page, seen.at(-2));
  return `Next x5 no repeat within 3; Prev back to ${seen.at(-2)}`;
});

flow(26, "question-list", async (page, w) => {
  await go(page, C.bank);
  await page.click("#qlistBtn");
  await page.waitForSelector("#qlist:not([hidden])", { timeout: 3000 });
  const n = await page.$$eval("#qlist a", a => a.length);
  assert.ok(n >= 10, `list rows: ${n}`);
  return `list open, ${n} rows`;
});

flow(29, "rewards-hud-xp", async (page, w) => {
  await go(page, C.single);
  const x0 = await xp(page);
  assert.equal(await answerKey(page, C.single, true), "correct");
  await page.waitForFunction(x => window.Rewards.state().xp > x, x0, { timeout: 4000 });
  assert.ok(await vis(page, "#rwHud"), "HUD visible");
  return `XP ${x0} -> ${await xp(page)}, HUD "${(await page.getAttribute("#rwHud", "aria-label")) || ""}"`;
});

flow(30, "wrong-try-quiet", async (page, w) => {
  await go(page, C.single);
  const shown = () => page.textContent("#rwHud .rw-num").catch(() => null);
  const x0 = await xp(page), s0 = await shown();
  assert.equal(await answerKey(page, C.single, false), "wrong");
  await page.waitForTimeout(600);
  const fx = await page.$$eval(".fx-ov, .fx-float", e => e.length);
  assert.equal(await shown(), s0, "the HUD number did not move");
  assert.equal(fx, 0, "no FX");
  return `HUD shows ${s0} before and after; state xp ${x0} -> ${await xp(page)} (the +1 is held, unshown, per rewards.pw C12)`;
});

flow(31, "snack-original", async (page, w) => {
  if (!C.snack) skip("no snack with an original served");
  await go(page, C.snack);
  const chip = await page.$eval("#blocks .chg-chip", e => e.textContent).catch(() => "");
  const orig = await page.$("#origHd");
  assert.ok(chip || orig, "a changed chip or the original card");
  return `${C.snack}: chip "${chip}", original card ${orig ? "present" : "absent"}`;
});

flow(32, "next-skips-snacks", async () => skip("needs 10 first tries above 90% (cruising); rewards.pw covers it with a fixture bank; not driven here"));

flow(33, "key-formulas", async (page, w) => {
  await go(page, C.part);
  await page.waitForSelector("#fcard", { state: "visible", timeout: 4000 });
  const n = await page.$$eval("#fcard li.f", l => l.length);
  assert.ok(n >= 1);
  return `${C.part}: formula card, ${n} rows`;
});

flow(34, "brainrot-corner", async (page, w) => {
  await go(page, C.single);
  await page.waitForSelector("#rot:not([hidden])", { timeout: 6000 });
  const n = await page.$$eval("#rot iframe", f => f.length);
  assert.ok(n >= 1, "players");
  return `corner shown, ${n} players (YouTube requests aborted in tests)`;
});

flow(35, "sugar-vs-diet", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(700);
  await showCode(page);
  await page.fill("#code", "DIET_" + C.single); await page.press("#code", "Enter");
  await opened(page, C.single); await page.waitForTimeout(500);
  const hud = await vis(page, "#rwHud");
  assert.equal(hud, false, "diet: no HUD");
  return "DIET_ code: no HUD";
});

flow(36, "old-diet-cookie", async (page, w, ctx) => {
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }]);
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  const sugar = await page.evaluate(async () => (await import("./mode.mjs")).modeOf() === "sugar");
  const ck = Object.fromEntries((await ctx.cookies()).map(c => [c.name, c.value]));
  assert.equal(sugar, true); assert.equal(ck["stem-mode"], undefined); assert.equal(ck["stem-mode-v"], "2");
  return "old stem-mode=diet -> sugar, stem-mode-v=2";
});

flow(37, "split-rows-tf", async (page, w) => {
  await go(page, "CALC1_SP1B");
  assert.deepEqual(await page.$$eval("#q .opt .txt", xs => xs.map(x => x.textContent.trim())), ["True", "False"]);
  assert.match(await page.textContent("#blocks"), /True or false: second\./);
  return "fixture split row: True/False (P2X's split rows carry their own choices, so the fixture is used)";
});

flow(40, "silent-reload-idle", async () => skip("needs a stamped deploy (a new sw.js, controllerchange); serve.py dev always shows the bar. update.pw covers it with its own static server"));

flow(41, "upload-bank", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  await showCode(page);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles(UPLOAD);
  await opened(page, "");
  assert.match(await page.textContent("#pcode"), /^CALC1_U0/);
  return `upload -> ${await page.textContent("#pcode")}`;
});

flow(42, "upload-survives-reload", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  await showCode(page);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles(UPLOAD); await opened(page, "");
  const c = await page.textContent("#pcode");
  await page.reload(); await opened(page, "");
  assert.match(await page.textContent("#pcode"), /^CALC1_U0/);
  return `${c} -> after reload ${await page.textContent("#pcode")}`;
});

flow(44, "notes-pad", async (page, w) => {
  await go(page, C.single);
  if (w === 393) { assert.ok(await vis(page, "#padFab"), "the notes button"); await page.click("#padFab"); await page.waitForTimeout(500); }
  await page.waitForSelector("#scratch", { state: "visible", timeout: 3000 });
  return w === 393 ? "button -> pad page" : "pad beside the question";
});

flow(45, "notes-autosave", async (page, w) => {
  await go(page, C.single);
  if (w === 393) { await page.click("#padFab"); await page.waitForTimeout(500); }
  await page.fill("#scratch", "draft 45");
  await page.waitForTimeout(3600);
  await page.reload(); await opened(page, C.single);
  if (w === 393) { await page.click("#padFab"); await page.waitForTimeout(500); }
  assert.equal(await page.inputValue("#scratch"), "draft 45");
  return "draft back after reload";
});

flow(47, "swap-keyboard", async (page, w) => {
  if (w === 1280) skip("phone-only (keyboard up); shot is the desktop free-form view");
  await go(page, C.num);
  await page.locator("#ans").focus();
  await page.setViewportSize({ width: 393, height: Math.round(852 * 0.55) }); await page.waitForTimeout(450);
  assert.ok(await vis(page, "#padPeek"), "the pad peek");
  assert.ok(await vis(page, "#ans"), "the answer box in view");
  await page.screenshot({ path: join(OUT, `47-swap-keyboard-393-chromium.png`) });
  await page.setViewportSize({ width: 393, height: 852 }); await page.waitForTimeout(450);
  return "keyboard up (viewport 55%): problem pane + pad peek (shot at keyboard-up size)";
}, { noFinalShot393: true });

flow(48, "onboarding-toasts", async (page, w) => {
  await page.goto(`${BASE}/#${C.single}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1300);
  const t1 = await toastText(page);
  if (w === 1280 && !t1) return skip("desktop: no notes button toast (padFab is phone-only); nothing to assert");
  assert.equal(t1, "Tap here to write notes.");
  await page.screenshot({ path: join(OUT, `48-onboarding-toasts-${w}-first-chromium.png`) });
  await page.locator("#padFab").tap(); await page.waitForTimeout(900);
  const t2 = await toastText(page);
  assert.equal(t2, "Tap to switch question / answer.");
  return `'${t1}' (shot -first) then '${t2}'`;
}, { ob: true });

flow(51, "telemetry-off", async (page, w, ctx) => {
  const ext = []; page.on("request", r => { if (/posthog|clarity\.ms/.test(r.url())) ext.push(r.url()); });
  await go(page, C.single);
  await answerKey(page, C.single, true);
  await page.waitForTimeout(800);
  assert.deepEqual(ext, []);
  return "no key + GPC: zero PostHog / Clarity requests";
}, { gpc: true });

flow(52, "ver-badge", async (page, w) => {
  await page.goto(BASE + "/"); await page.waitForTimeout(800);
  const v = await page.$eval("#ver", e => [e.dataset.v, getComputedStyle(e, "::after").content]);
  assert.ok(v[0], "build tag set");
  return `#ver data-v=${v[0]} ::after ${v[1]}`;
});

flow(54, "reopen-finished", async (page, w) => {
  await go(page, C.single);
  assert.equal(await answerKey(page, C.single, true), "correct");
  await page.waitForTimeout(400);
  await go(page, C.single2);
  await page.evaluate(c => { location.hash = c; }, C.single); await opened(page, C.single);
  await page.waitForSelector("#q.closed", { timeout: 4000 });
  assert.equal(await page.$("#q .opt:not(:disabled)"), null, "read-only");
  return "reopened read-only, closed";
});

flow(55, "bfcache-resume", async (page, w) => {
  await go(page, C.single);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => { const e = document.querySelector("#splash"); return !e || e.hidden || getComputedStyle(e).opacity === "0" || getComputedStyle(e).display === "none"; });
  assert.ok(s, "no splash on resume");
  await opened(page, C.single);
  return "pageshow persisted: no splash, question stays";
});

/* priority: the ranked UNCOVERED list, then the covered rows in order */
const PRIO = [43, 21, 20, 23, 28, 27, 38, 6, 8, 39, 24, 46, 50, 49, 52, 22];
const order = [...PRIO.map(n => F.find(f => f.n === n)), ...F.filter(f => !PRIO.includes(f.n)).sort((a, b) => a.n - b.n)].filter(f => f && (!ONLY || ONLY.has(f.n)));

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const f of order) for (const w of [393, 1280]) {
    const phone = w === 393;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone,
      serviceWorkers: f.opts.sw ? "allow" : "block", permissions: f.opts.perms || [], extraHTTPHeaders: f.opts.gpc ? { "Sec-GPC": "1", DNT: "1" } : undefined });
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    if (!f.opts.ob) await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    if (f.opts.gpc) await ctx.addInitScript(() => { try { Object.defineProperty(navigator, "globalPrivacyControl", { value: true }); } catch { /* */ } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 120)));
    const png = join(OUT, `${String(f.n).padStart(2, "0")}-${f.slug}-${w}-chromium.png`);
    let st = "ok", detail = "";
    try {
      detail = await Promise.race([f.run(page, w, ctx), new Promise((_, no) => setTimeout(() => no(new Error("flow timeout 60 s")), 60000))]);
    } catch (e) {
      if (e instanceof Skip) { st = "SKIP"; detail = e.message; } else { st = "FAIL"; detail = String(e.message).replace(/\s+/g, " ").slice(0, 400); }
    }
    const custom = f.opts.noFinalShot && existsSync(png) || (f.opts.noFinalShot393 && phone && existsSync(png));
    if (!(custom && st === "ok")) await page.screenshot({ path: png }).catch(() => {});
    if (errs.length) detail += `  [pageerror: ${errs.join(" | ")}]`;
    log(f.n, f.slug, w, st, detail);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
const fails = results.filter(r => r.st === "FAIL").length, skips = results.filter(r => r.st === "SKIP").length;
const tail = `# done: ${results.length} checks, ${results.length - fails - skips} ok, ${fails} FAIL, ${skips} SKIP`;
appendFileSync(LOG, tail + "\n"); console.log(tail);
process.exit(fails ? 1 : 0);
