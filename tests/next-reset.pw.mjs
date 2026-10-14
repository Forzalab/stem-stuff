// 20261013-T41 (Tony, Oct 13: "BIG BUG: pressing next... reset the question that it leads to"): a question the student already worked
// on must come back exactly as they left it, whatever brings it back: the Next in the Check slot (T17b-1 cueNext), the bar's Next / Prev
// arrows, a list row, a reload. Covered: sugar + diet, mc (one pick), a number box, pick all, and a re-showing (the queue's Redeem,
// graded in its own round): Prev back to it and Next forward to it again must not wipe it (stemRedo.set dropped its record).
// Real serve.py grading, its own banks folder. Never the student's real tries.json.
//   node tests/next-reset.pw.mjs <port>      (starts its own serve.py on that port)
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8873", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "t41-")), banks = join(tmp, "banks");
mkdirSync(banks);
const txt = md => [{ type: "text", md }];
const mc = n => ({ code: `CALC1_T4M${n}`, title: `T41 mc ${n}`, type: "mc", shuffle: false, body: txt(`Mc ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })) });
const num = n => ({ code: `CALC1_T4N${n}`, title: `T41 box ${n}`, type: "num", body: txt(`Box ${n}: type 4.`), answer: "4" });
const pa = n => ({ code: `CALC1_T4P${n}`, title: `T41 pick all ${n}`, type: "mc", pick: "all", shuffle: false, body: txt(`Pick all ${n}: the even ones.`),
  choices: ["2", "3", "4", "5"].map((md, i) => ({ id: "abcd"[i], md })), correct: ["a", "c"], miss: "One even one is missing." });
const PROBS = [mc(1), num(1), pa(1), mc(2), num(2), pa(2), mc(3), num(3)];
const KEY = new Map(PROBS.map(p => [p.code, p]));
writeFileSync(join(banks, "BANK_T41.json"), JSON.stringify({ v: 1, problems: PROBS }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const cur = page => page.evaluate(() => document.querySelector("#pcode")?.textContent || "");
/* what the student sees of their work: struck / right rows, ticks, the typed answer, closed or not, the try pips, Next in the Check slot */
const look = page => page.evaluate(() => {
  const ids = s => [...document.querySelectorAll(s)].map(o => o.dataset.id).sort().join("");
  return { code: document.querySelector("#pcode").textContent, closed: !!document.querySelector("#q.closed"), wrong: ids("#q .opt.wrong"),
    right: ids("#q .opt.right:not(.reveal)"), ticked: ids('#q .choices.all .opt[aria-checked="true"]'), typed: document.querySelector("#ans")?.value ?? null,
    pips: document.querySelectorAll("#q .pips:not(.spent) i.used").length, tries: window.__drill.state.tries.length, next: !!document.querySelector("#q .nx") };
});
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(700);                                     // the /state sync of a reopened question lands
}
async function moved(page, from) {
  await page.waitForFunction(c => { const t = document.querySelector("#pcode")?.textContent; return t && t !== c && !document.querySelector("#freeze").hidden; }, from, { timeout: 10000 });
  await settle(page);
}
/* one graded try; right or wrong by the key (test side only). A pick under 2 s is a guess the queue never weights: wait like a student */
async function answer(page, right) {
  const code = await cur(page), p = KEY.get(code);
  await page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100, null, { timeout: 6000 });
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  const tap = sel => page.$eval(sel, b => b.click());                 // a DOM click: an FX layer may sit over the row
  if (p.type === "num") { await page.fill("#ans", right ? "4" : String(5 + n)); await tap("#ansGo"); }
  else if (p.pick === "all") {
    const want = right ? ["a", "c"] : n ? ["a", "d"] : ["a", "b"];
    for (const id of ["a", "b", "c", "d"]) {
      const on = await page.$eval(`#q .opt[data-id="${id}"]`, o => o.getAttribute("aria-checked") === "true" || o.disabled);
      if (on !== want.includes(id) && !(await page.$eval(`#q .opt[data-id="${id}"]`, o => o.disabled))) await tap(`#q .opt[data-id="${id}"]`);
    }
    await page.waitForTimeout(80); await tap("#mcGo");
  } else {
    const id = right ? "a" : await page.$eval("#q .opt:not(:disabled):not([data-id=a])", o => o.dataset.id);
    await tap(`#q .opt[data-id="${id}"]`); await page.waitForTimeout(80); await tap(`#q .ch[data-id="${id}"] .send`);
  }
  await page.waitForFunction(k => { const t = window.__drill.state.tries; return t.length > k && t.at(-1).v !== "pending"; }, n, { timeout: 8000 });   // the verdict is in
  await settle(page);
}
const pressNext = async page => { const c = await cur(page); await page.$eval("#q .nx", b => b.click()); await moved(page, c); };   // T17b-1: Next in the Check slot
const arrow = async (page, sel) => { const c = await cur(page); await page.click(sel); await moved(page, c); };
const same = async (page, want, how) => assert.deepEqual(await look(page), want, `${want.code} after ${how}`);

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const mode of ["sugar", "diet"]) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* blocked */ } });
    await ctx.addCookies(mode === "diet" ? [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }] : [{ name: "stem-mode-v", value: "2", url: BASE }]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    await page.goto(`${BASE}/#BANK_T41`);
    await page.waitForFunction(() => /_T4/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#qnav").hidden, null, { timeout: 10000 });
    await page.evaluate(() => window.Rewards && window.Rewards.config({ minDwell: 1e12 }));   // no random drops over the rows
    await settle(page);
    const snap = {};
    await step(`${mode}: work three questions (closed after a miss, one miss with a try left, right first time)`, async () => {
      await answer(page, false); await answer(page, true); snap.A = await look(page);
      assert.ok(snap.A.closed && snap.A.next, "A closed, Next in the Check slot");
      await pressNext(page); await answer(page, false); snap.B = await look(page);
      assert.ok(!snap.B.closed && snap.B.tries === 1, "B: one miss, a try left");
      await arrow(page, "#qnext"); await answer(page, true); snap.C = await look(page);
      assert.ok(snap.C.closed);
    });
    await step(`${mode}: Prev, Prev, then the Check-slot Next and the bar Next forward: each question as it was left`, async () => {
      await arrow(page, "#qprev"); await same(page, snap.B, "Prev");
      await arrow(page, "#qprev"); await same(page, snap.A, "Prev");
      await pressNext(page); await same(page, snap.B, "the Check-slot Next");
      await arrow(page, "#qnext"); await same(page, snap.C, "the bar Next");
    });
    await step(`${mode}: a list row and a reload bring it back as it was`, async () => {
      const c = await cur(page);
      await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])");
      await page.$eval(`#qlist a[href="#${snap.A.code}"]`, a => a.click()); await moved(page, c);
      await same(page, snap.A, "a list jump");
      await page.reload(); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, snap.A.code); await settle(page);
      await same(page, snap.A, "a reload");
    });
    await step(`${mode}: a re-showing (its own round) answered, then Prev / Next back to it: not wiped`, async () => {
      let item = null;
      for (let i = 0; i < 14; i++) {                                    // Next until the queue brings one back (B owes its miss)
        if (await page.$("#q .nx")) await pressNext(page); else await arrow(page, "#qnext");
        item = await page.evaluate(() => window.stemQueue.item());
        if (item && item.r) break;
        if (!(await page.$("#q.closed"))) await answer(page, true);
      }
      assert.ok(item && item.r, "the queue brought a question back");
      await answer(page, false); snap.R1 = await look(page);
      assert.equal(snap.R1.tries, 1, "the re-showing is graded fresh (its own round)");
      await answer(page, true); snap.R = await look(page);
      assert.ok(snap.R.closed && snap.R.tries === 2);
      await pressNext(page);
      if (!(await page.$("#q.closed"))) await answer(page, true);
      snap.D = await look(page);
      await arrow(page, "#qprev"); await same(page, snap.R, "Prev back to the re-showing");
      await pressNext(page); await same(page, snap.D, "the Check-slot Next");
      await arrow(page, "#qprev"); await same(page, snap.R, "Prev again");
      await page.reload(); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, snap.R.code); await settle(page);
      await same(page, snap.R, "a reload");
      await arrow(page, "#qnext"); await same(page, snap.D, "the bar Next");
      const fresh = await page.evaluate(([c, r]) => { window.stemRedo.set(c, r + 1); const x = window.stemOffline.doneGet(c); window.stemRedo.clear(); return x; }, [snap.R.code, item.r]);
      assert.equal(fresh, null, "a NEW showing of it (another round) still starts blank");
    });
    await step(`${mode}: no page errors`, async () => assert.deepEqual(errors, []));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
