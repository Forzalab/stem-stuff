// The proof box (W107, SCHEMA.md "Proof items"; Tony approved the textarea + 3 chips, Oct 27): the student writes a whole induction proof,
// Check sends it to Cluck's grader (POST /check -> serve.py proof_grade -> one OpenRouter JSON call, stubbed here), the page shows 3 rubric
// chips (base | assume | prove) and Cluck's hint; 3 Checks; sugar shows the reference proof after the last one.
// Starts its own serve.py with a throwaway banks/ folder and a stub grader:   node tests/proof.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8873), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "proof-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
copyFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), join(BANKS, "BANK_PRF.json"));
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), "utf8")).problems[0];

/* the stub grader: the proof's own words pick the rubric. NOBASE -> base missing, BADSTEP -> prove wrong, DOWN -> a 500 */
const seen = [];
const stub = createServer((req, res) => {
  let b = ""; req.on("data", c => { b += c; });
  req.on("end", () => {
    const pl = JSON.parse(b), user = pl.messages[1].content;
    seen.push(user);
    if (/DOWN/.test(user)) { res.writeHead(500); res.end("{}"); return; }
    const out = { base: /NOBASE/.test(user) ? "missing" : "ok", assume: "ok", prove: /BADSTEP/.test(user) ? "wrong" : "ok",
      hint: /NOBASE/.test(user) ? "QUACK. Where do you check n = 1?" : /BADSTEP/.test(user) ? "QUACK. Did you use what you assumed for k?" : "" };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
  });
});
await new Promise(ok => stub.listen(0, "127.0.0.1", ok));
const STUB = stub.address().port;
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${STUB}`, OPENROUTER_API_KEY: "stub-key", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const CODE = FIX.code;
const opened = page => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), CODE, { timeout: 8000 });
async function prove(page, text) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill("#ans", text); await page.click("#ansGo");
  await page.waitForFunction(n => window.__drill.state.tries.length > n || document.querySelector("#fb .verdict.wait"), n, { timeout: 6000 });
  await page.waitForTimeout(300);
}
const chips = page => page.$$eval("#rubric .rb", xs => xs.map(x => [x.dataset.id, x.dataset.v]));
const GOOD = "Base case: n = 1, both sides are 2.\nAssume it for k.\nAdd 3k+2 and factor: (k+1)(3k+4)/2.";

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(mode, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  if (mode === "diet") await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(BASE + "/#" + CODE);
  await opened(page);
  return { ctx, page, errs };
}
try {
  await step("the box: a textarea (Enter is a new line, not a Check), Check off while empty, the how line above it", async () => {
    const { ctx, page, errs } = await open("diet");
    assert.equal(await page.$eval("#ans", x => x.tagName), "TEXTAREA");
    assert.equal(await page.$eval("#ansGo", b => b.disabled), true, "Check is live on an empty box");
    assert.match(await page.textContent("#how"), /base case/i);
    await page.click("#ans"); await page.keyboard.type("Base case: n = 1."); await page.keyboard.press("Enter"); await page.keyboard.type("Assume");
    assert.equal(await page.$eval("#ans", x => x.value), "Base case: n = 1.\nAssume");
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), 0, "Enter checked the proof");
    assert.equal(await page.$eval("#ansGo", b => b.disabled), false);
    assert.deepEqual(errs, []);
    await ctx.close();
  });
  await step("a wrong proof: 3 chips (the missing row marked), Cluck's hint, the text stays to edit, 2 Checks left", async () => {
    const { ctx, page, errs } = await open("diet");
    await prove(page, "NOBASE " + GOOD);
    assert.deepEqual(await chips(page), [["base", "missing"], ["assume", "ok"], ["prove", "ok"]]);
    assert.match(await page.textContent("#fb .cluck"), /Where do you check n = 1\?/);
    assert.equal(await page.$eval("#ans", x => x.disabled), false, "the proof is locked after one miss");
    assert.equal(await page.evaluate(() => window.__drill.state.triesLeft), 2);
    assert.equal(seen.at(-1).includes("NOBASE"), true, "the grader got the proof");
    await prove(page, GOOD);
    assert.deepEqual(await chips(page), [["base", "ok"], ["assume", "ok"], ["prove", "ok"]]);
    assert.equal(await page.$eval("#ff", f => f.classList.contains("ok")), true, "a right proof turns the box green");
    assert.equal(await page.$eval("#ans", x => x.disabled), true, "a right proof stays editable");
    assert.deepEqual(errs, []);
    await ctx.close();
  });
  await step("the grader is down: a wait line with a code, no try used, the text stays", async () => {
    const { ctx, page } = await open("diet");
    await page.fill("#ans", "DOWN " + GOOD); await page.click("#ansGo");
    await page.waitForSelector("#fb .verdict.wait", { timeout: 6000 });
    assert.match(await page.textContent("#fb"), /S-[2-9A-HJ-NP-Z]{5}/);
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), 0);
    assert.match(await page.$eval("#ans", x => x.value), /^DOWN/);
    await ctx.close();
  });
  await step("sugar: 3 wrong Checks close it and show the reference proof; telemetry never carries the proof text", async () => {
    const { ctx, page, errs } = await open("sugar");
    await page.evaluate(() => { window.__picks = []; const t = window.stemT; window.stemT = (k, o) => { window.__picks.push([k, o]); return t?.(k, o); }; });
    for (const i of [1, 2, 3]) await prove(page, "BADSTEP " + i + " " + GOOD);
    assert.equal(await page.$eval("#q", q => q.classList.contains("closed")), true);
    assert.match(await page.textContent("#preview"), /The next term in the sum is/, "the reference proof is not shown");
    assert.equal(await page.$eval("#preview .refmd .katex", () => true).catch(() => false), true, "the reference renders its math");
    const typed = await page.evaluate(() => window.__picks.filter(([k]) => k === "pick").map(([, o]) => o.typed));
    assert.deepEqual(typed, [null, null, null]);
    assert.deepEqual(errs, []);
    await ctx.close();
  });
  await step("375px phone: the box fits, no side scroll, Check on screen", async () => {
    const { ctx, page } = await open("diet", { width: 375, height: 740 });
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, ta: document.querySelector("#ans").getBoundingClientRect(), go: document.querySelector("#ansGo").getBoundingClientRect() }));
    assert.ok(r.sw <= r.w, `side scroll: ${r.sw} > ${r.w}`);
    assert.ok(r.ta.right <= r.w && r.ta.left >= 0 && r.ta.height >= 120, JSON.stringify(r.ta));
    assert.ok(r.go.right <= r.w && r.go.width >= 44, JSON.stringify(r.go));
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
  stub.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
