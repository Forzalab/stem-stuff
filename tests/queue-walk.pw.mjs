// The hidden queue on a real bank (design/plans/QUEUE.md): a 20-answer walk with Next only, right and wrong first picks, a retry,
// a reload mid-walk. Asserts: never the same code within 3, a missed question comes back (after >= 3 others) as a Redeem showing that
// can be answered again, the reload lands on the same question with the queue intact, no console errors, no Shuffle / Redo UI.
//   node tests/queue-walk.pw.mjs <base-url | port> [shotDir]
//   base url: a running serve.py (its banks folder = $STEM_BANKS, else ./banks). port: starts its own serve.py on it.
//   QW_BANK picks the bank (default BANK_P2X when that file exists, else BANK_PSY6). PW_BROWSER=webkit for Safari's engine.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BANKS = process.env.STEM_BANKS || join(ROOT, "banks");
const BANK = process.env.QW_BANK || (existsSync(join(BANKS, "BANK_P2X.json")) ? "BANK_P2X" : "BANK_PSY6");
const ARG = process.argv[2] || "8851", SHOTS = process.argv[3] || "";
let BASE = ARG, srv = null;
if (!/^https?:/.test(ARG)) {
  BASE = `http://127.0.0.1:${ARG}`;
  const tmp = mkdtempSync(join(tmpdir(), "qwalk-"));
  srv = spawn("python3", [join(ROOT, "serve.py"), ARG], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const KEY = new Map(JSON.parse(readFileSync(join(BANKS, BANK + ".json"), "utf8")).problems.map(p => [p.code, p]));   // the answers: test side only

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const cur = page => page.evaluate(() => document.querySelector("#pcode")?.textContent || "");
const opened = (page, code) => page.waitForFunction(c => (!c || document.querySelector("#pcode")?.textContent === c) && /_/.test(document.querySelector("#pcode")?.textContent || "")
  && !document.querySelector("#freeze").hidden && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 10000 });
const quiet = page => page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 }).catch(() => {});
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
/* one graded pick: right = the key's choices, wrong = one choice the key doesn't have. Returns the verdict, or null (not mc, locked) */
async function answer(page, code, right) {
  const p = KEY.get(code); if (!p || p.type !== "mc") return null;
  const ids = await page.$$eval("#q .opt:not(:disabled)", os => os.map(o => o.dataset.id));
  const want = [p.correct].flat(), all = p.pick === "all";
  const pickIds = right ? want.filter(i => ids.includes(i)) : ids.filter(i => !want.includes(i)).slice(0, 1);
  if (!pickIds.length) return null;
  const n = await tries(page);
  const tap = sel => page.$eval(sel, b => b.click());                // a DOM click: a send bubble from the last pick may sit over the row
  for (const id of pickIds) await tap(`#q .opt[data-id="${id}"]`);
  await page.waitForTimeout(80);
  if (all) await tap("#mcGo"); else await tap(`#q .ch[data-id="${pickIds[0]}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 8000 });
  await page.waitForTimeout(150);
  await quiet(page);
  return page.evaluate(() => window.__drill.state.tries.at(-1).v);
}
const qstate = page => page.evaluate(() => window.stemQueue && JSON.parse(JSON.stringify({ st: window.stemQueue.state(), item: window.stemQueue.item() })));

const ENGINE = process.env.PW_BROWSER || "chromium";
const browser = await pw[ENGINE].launch(ENGINE === "chromium" ? { args: ["--no-sandbox"] } : {});
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: ENGINE === "chromium", serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const bad = []; let ext = 0;           // ext: third-party failures (the brainrot corner's YouTube), not ours
  page.on("response", r => { if (r.status() < 400) return; const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin) ext++; else bad.push(`${r.status()} ${u.pathname}`); });
  await page.goto(`${BASE}/#${BANK}`);
  await opened(page, "");
  await page.evaluate(() => window.Rewards && window.Rewards.config({ minDwell: 1e12 }));   // no random drops over the choices

  await step("no Shuffle button, no Redo my misses", async () => {
    assert.equal(await page.$("#qshuf"), null);
    assert.equal(await page.$("#qredo"), null);
    await page.click("#qlistBtn"); await page.waitForTimeout(200);
    assert.ok(!/redo|shuffle/i.test(await page.$eval("header.top", h => h.innerText)), "no Redo / Shuffle words in the bar");
    await page.click("#qlistBtn");
  });

  const walk = [];                       // { code, first, redeem, snack }
  let keyed = 0;                         // aim wrong on the 1st, 3rd and 6th answerable real; retry-right after the 1st and 6th
  const WRONG = new Set([1, 3, 6]), RETRY = new Set([1, 6]);
  let missedBack = null;
  await step(`20 answers on ${BANK}: Next each time, a reload at 10`, async () => {
    for (let i = 1; walk.filter(w => w.first).length < 20 && i <= 40; i++) {
      const code = await cur(page), { item } = await qstate(page), snack = !!KEY.get(code)?.saccharine?.snack;
      const locked = !(await page.$("#q .opt:not(:disabled)"));
      const real = !locked && !snack && KEY.get(code)?.type === "mc" && !item?.redeem, n = real ? ++keyed : 0;
      const first = locked ? null : await answer(page, code, !WRONG.has(n));
      if (first === "wrong" && RETRY.has(n) && (await page.$("#q .opt:not(:disabled)"))) await answer(page, code, true);   // retry-right: logged only
      walk.push({ code, first, redeem: !!(item && item.redeem), snack, locked });
      if (i === 10) {
        const before = await qstate(page);
        await page.reload(); await opened(page, code);
        await page.evaluate(() => window.Rewards && window.Rewards.config({ minDwell: 1e12 }));
        const after = await qstate(page);
        assert.equal(await cur(page), code, "the reload lands on the same question");
        assert.equal(after.st.pos, before.st.pos, "the queue survives the reload");
        assert.equal(after.st.at, before.st.at);
      }
      if (SHOTS && i <= 3) await page.screenshot({ path: join(SHOTS, `queue-walk-${i}-${ENGINE}.png`) });
      assert.equal(await page.$eval("#qnext", b => b.disabled), false, "Next always works");
      await page.click("#qnext");
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, code, { timeout: 8000 });
      await opened(page, "");
    }
    console.log("      walk:", walk.map((w, i) => `${i + 1}:${w.code.replace(/^\w+_/, "")}${w.first ? (w.first === "wrong" ? "x" : "+") : "."}${w.redeem ? "R" : ""}${w.snack ? "s" : ""}`).join(" "));
    assert.ok(walk.filter(w => w.first).length >= 20, "20 graded first picks");
  });
  await step("never the same code within 3", async () => {
    for (let i = 0; i < walk.length; i++) for (let j = i + 1; j <= i + 3 && j < walk.length; j++)
      assert.notEqual(walk[i].code, walk[j].code, `slots ${i + 1} and ${j + 1}`);
  });
  await step("a missed question comes back after >= 3 others, as a Redeem showing, answerable again", async () => {
    const i = walk.findIndex(w => w.first === "wrong" && !w.snack);
    assert.ok(i >= 0, "a miss in the walk");
    const j = walk.findIndex((w, k) => k > i && w.code === walk[i].code);
    assert.ok(j > i, `${walk[i].code} came back`);
    assert.ok(j - i - 1 >= 3 && j - i - 1 <= 5, `back after ${j - i - 1} others (3, +1 per snack in front of a real)`);
    assert.equal(walk[j].redeem, true, "the comeback carries redeem");
    assert.equal(walk[j].locked, false, "graded fresh (its own round), not locked");
    missedBack = walk[j];
  });
  await step("no question lost or duplicated in the first pass (every repeat is a Redeem)", async () => {
    const seen = new Set();
    for (const w of walk) { if (seen.has(w.code)) assert.ok(w.redeem, `${w.code} repeated without owing a miss`); seen.add(w.code); }
  });
  await step("Prev walks back through what was shown, then Next steps forward to the same place", async () => {
    const here = await cur(page), { st } = await qstate(page), prev = st.hist[st.at - 1].c;
    await page.click("#qprev"); await opened(page, prev);
    await page.click("#qnext"); await opened(page, here);
    const after = await qstate(page);
    assert.equal(after.st.pos, st.pos, "history steps are not new showings");
  });
  await step("no console errors", async () => {
    /* a local serve.py with no OPENROUTER_API_KEY answers Cluck's live lines with 503: a resource status line, not a page error */
    const key503 = bad.filter(b => /^503 \/(explain|cluck|genie|ask)/.test(b)).length, other = bad.filter(b => !/^503 \/(explain|cluck|genie|ask)/.test(b));
    assert.deepEqual(other, [], "failed requests");
    let left = key503 + ext;
    assert.deepEqual(errors.filter(e => !(/Failed to load resource/.test(e) && left-- > 0)), []);
  });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `queue-walk-end-${ENGINE}.png`), fullPage: true });
  void missedBack;
  await ctx.close();
} finally {
  await browser.close();
  if (srv) srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
