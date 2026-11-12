// The repair ladder after a wrong try (DESIGN-v3 s3, T8): a graded miss on an item with `repair` fetches GET /repair/<code> (only after the
// /check that recorded the miss) and draws it (repair.js, variant "repair") under the verdict. Every miss, 393 + 1280. An item with no ladder
// (404) is unchanged; the same slip family on miss 2 keeps the same element (a step is not reset); the 2-try lock, Next and the pips still work.
// Own serve.py + fixture bank:   node tests/ladderwire.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8881), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "ladderwire-")), BANKS = join(TMP, "banks");
const num = (code, extra = {}) => ({ code, type: "num", answer: "4", tol: 0.01, body: [{ type: "text", md: `Item ${code}: find $2+2$.` }], ...extra });
const LAD = num("PHYS_LW1", { repair: { steps: [
  { id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
  { id: "answer", label: "Final answer", kind: "num", ok: "4", tol: 0.01 }] } });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P2X.json"), JSON.stringify({ v: 1, problems: [LAD, num("PHYS_LW2"), num("PHYS_LW3", { repair: LAD.repair })] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P2X", STEM_FRONT_TITLE: "Exam 2",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(code, viewport) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-noob-P2X", "1"); } catch { /* blocked */ } });
  const page = await ctx.newPage(), log = [], errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("response", r => { const u = new URL(r.url()); if (/^\/(check|repair\/)/.test(u.pathname)) log.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  await page.goto(BASE + "/#" + code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
  await page.waitForSelector("#q #ans", { timeout: 4000 });
  return { ctx, page, log, errs };
}
async function miss(page, v) {
  await skipRetryWait(page);
  await page.fill("#q #ans", v); await page.press("#q #ans", "Enter");
  await page.waitForSelector("#q .pips, #fb .verdict, #q .ff.bad, #q .ff .i-lock, #q [data-verdict], #q .ff", { timeout: 4000 });
  await page.waitForTimeout(600);
}
try {
  for (const [w, h] of [[393, 800], [1280, 860]]) {
    const { ctx, page, log, errs } = await open("PHYS_LW1", { width: w, height: h });
    await step(`${w}: before any try nothing asks for the ladder`, async () => {
      assert.deepEqual(log.filter(l => /repair/.test(l)), [], "a /repair request before a try");
      assert.equal(await page.$(".rp"), null);
    });
    await step(`${w}: miss 1 -> /check, then GET /repair; the ladder is drawn under the verdict`, async () => {
      await miss(page, "3");
      await page.waitForSelector("section.rp", { timeout: 4000 });
      const i = log.findIndex(l => /POST .*\/check/.test(l)), j = log.findIndex(l => /GET .*\/repair\/PHYS_LW1 200/.test(l));
      assert.ok(i >= 0 && j > i, "GET /repair must follow the /check that recorded the miss: " + log.join(" | "));
      assert.ok(await page.isVisible("section.rp"), "ladder not visible");
      if (w === 393 && process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, "miss1-393.png"), fullPage: true });
      assert.equal(await page.locator("#q #ans").count(), 1, "the answer box went away");
    });
    /* Tony, Nov 3 19:11 (demo, phone): the in-app ladder ("clue box") and its choices wear the welcome (onboarding) box's look, and Cluck's
       leading *action* ("*waddles over*") is italic */
    await step(`${w}: the ladder box + its choices look like the welcome box; the *action* intro is italic`, async () => {
      const m = await page.evaluate(() => {
        const ref = document.createElement("section"); ref.className = "wl ai-skin"; ref.innerHTML = '<div class="rp"><div class="rp-opts"><button class="rp-chip">x</button></div></div>';
        document.body.append(ref);
        const cs = e => { const c = getComputedStyle(e); return [c.backgroundColor, c.borderTopColor, c.borderTopWidth, c.borderTopStyle, c.borderRadius]; };
        const box = document.querySelector("section.rp");
        /* this fixture's step is typed and its intro has no action: a choice row and the repair intro as repair.js draws them (introEl: <em>action</em>) */
        const probe = document.createElement("div"); probe.innerHTML = '<p class="rp-line"><em>waddles over</em> Let\'s fix this together.</p><div class="rp-opts"><button class="rp-chip" type="button">the sideways slant</button></div>';
        box.querySelector(".rp-steps").before(probe);
        const chip = probe.querySelector(".rp-chip"), em = probe.querySelector(".rp-line em");
        const out = { box: cs(box), want: cs(ref), chip: chip && cs(chip).concat(getComputedStyle(chip).color), wantChip: cs(ref.querySelector(".rp-chip")).concat(getComputedStyle(ref.querySelector(".rp-chip")).color),
          em: em && getComputedStyle(em).fontStyle, emText: em && em.textContent };
        ref.remove(); probe.remove(); return out;
      });
      assert.deepEqual(m.box, m.want, "the ladder box is not the welcome box's surface / rim");
      assert.ok(m.chip, "no live choice in the ladder");
      assert.deepEqual(m.chip, m.wantChip, "the ladder's choices are not the welcome box's");
      assert.equal(m.em, "italic", "the *action* intro is not italic: " + JSON.stringify([m.emText, m.em]));
    });
    await step(`${w}: miss 2 keeps the same element (not reset), the 2-try lock closes, Next is reachable`, async () => {
      await page.evaluate(() => { document.querySelector("section.rp").dataset.same = "1"; });
      await miss(page, "5");
      assert.equal(await page.locator("section.rp[data-same]").count(), 1, "the ladder was re-mounted on the same family");
      assert.equal(await page.locator("section.rp").count(), 1, "more than one ladder");
      if (w === 393 && process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, "miss2-393.png"), fullPage: true });
      await page.waitForSelector("#q .nx", { timeout: 4000 });
      const r = await page.locator("#q .nx").boundingBox();
      assert.ok(r && r.y + r.height > 0, "Next not reachable");
      assert.equal(errs.length, 0, errs.join("; "));
    });
    await ctx.close();
    const n = await open("PHYS_LW2", { width: w, height: h });
    await step(`${w}: an item with no ladder (404) is unchanged`, async () => {
      await miss(n.page, "3");
      assert.deepEqual(n.log.filter(l => /repair/.test(l)), [], "a no-ladder miss sent a /repair request (a console 404): " + n.log.join(" | "));
      assert.equal(await n.page.$("section.rp"), null, "a ladder on an item without one");
      assert.equal(n.errs.length, 0, n.errs.join("; "));
    });
    await n.ctx.close();
  }
  {                                                                              // a slow ladder for miss A must not land over miss B's (other family)
    const { ctx, page, errs } = await open("PHYS_LW3", { width: 393, height: 800 });
    await step("race: a slow GET /repair for family A never lands over family B's ladder; the old mount is destroyed", async () => {
      let nCheck = 0, nRep = 0;
      const ladder = label => ({ code: "PHYS_LW3", steps: [{ id: "who", label, kind: "pick", opts: [{ id: "a", md: "x" }, { id: "b", md: "y" }], ok: "a" }, { id: "answer", label: "Final answer", kind: "num" }] });
      await page.route("**/check", r => r.request().method() === "POST" && !/repair/.test(r.request().url())
        ? r.fulfill({ json: { verdict: "wrong", triesLeft: 2 - ++nCheck, error: nCheck === 1 ? "famA" : "famB" } }) : r.fallback());
      await page.route("**/repair/PHYS_LW3", async r => { const mine = ++nRep; if (mine === 1) await new Promise(x => setTimeout(x, 1500)); await r.fulfill({ json: ladder(mine === 1 ? "Ladder A" : "Ladder B") }); });
      await page.fill("#q #ans", "3"); await page.press("#q #ans", "Enter"); await page.waitForTimeout(300);
      await skipRetryWait(page);
      await page.fill("#q #ans", "5"); await page.press("#q #ans", "Enter");
      await page.waitForSelector("section.rp", { timeout: 4000 }); await page.waitForTimeout(2200);
      assert.equal(nRep, 2, "two families = two fetches");
      assert.equal(await page.locator("section.rp").count(), 1, "more than one ladder");
      assert.match(await page.textContent("section.rp"), /Ladder B/, "the stale ladder A landed over B");
      assert.doesNotMatch(await page.textContent("section.rp"), /Ladder A/);
      assert.equal(errs.length, 0, errs.join("; "));
    });
    await ctx.close();
  }
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("all ok");
