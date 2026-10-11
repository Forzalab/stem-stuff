// Custom code prefixes (T15) and the one-line upload result (T14a): design D1 sections 2.5 and 3.
// A bank file may use any custom prefix (3-6 letters) if it carries "bank": "BANK_XXX" and the prefix equals the flag minus BANK_.
// Starts its own serve.py with a throwaway banks/ folder and tries.json (like next-dead.pw.mjs):
//   node tests/prefix.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const freePort = () => new Promise(r => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : await freePort(), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "prefix-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const P2X = Array.from({ length: 4 }, (_, i) => num(`PHYS_P0${i + 1}`, String(i + 2), `Hosted phys ${i + 1}`));
writeFileSync(join(BANKS, "BANK_P2X.json"), JSON.stringify({ v: 1, problems: P2X }));
const json = o => ({ name: "x.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(o)) });
const file = (name, o) => ({ ...json(o), name });
const BEAR = ["BEAR_QAA", "BEAR_QAB"].map((c, i) => num(c, "2", `Bear ${i + 1}: 1 + 1`));

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const splashGone = "(!document.querySelector('#splash') || getComputedStyle(document.querySelector('#splash')).opacity === '0')";
const opened = (page, code) => page.waitForFunction(([c, g]) => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden && eval(g), [code, splashGone], { timeout: 8000 });
const openedAny = (page, codes) => page.waitForFunction(([cs, g]) => cs.includes(document.querySelector("#pcode")?.textContent) && !document.querySelector("#freeze").hidden && eval(g), [codes, splashGone], { timeout: 8000 });
const msg = page => page.evaluate(() => document.querySelector("#entryMsg").textContent);
const waitMsg = (page, text) => page.waitForFunction(t => document.querySelector("#entryMsg").textContent === t, text, { timeout: 6000 })
  .catch(async () => { throw new Error(`entryMsg is ${JSON.stringify(await msg(page))}, wanted ${JSON.stringify(text)}`); });
/* the computed colour of #entryMsg against a token */
const toneIs = (page, token) => page.evaluate(t => {
  const probe = document.createElement("i"); probe.style.color = `var(${t})`; document.body.appendChild(probe);
  const want = getComputedStyle(probe).color; probe.remove();
  return getComputedStyle(document.querySelector("#entryMsg")).color === want;
}, token);
const showCode = async page => { for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); } };
const typeCode = async (page, code) => { await showCode(page); await page.fill("#code", code); await page.press("#code", "Enter"); };
const label = page => page.getAttribute("#qlistBtn", "title");
async function upload(page, f) {
  await showCode(page);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles(f);
}
async function fresh(browser, vp) {
  const phone = vp.width < 600;
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: "block", hasTouch: phone, isMobile: phone });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("stem-ob")) localStorage.setItem("stem-ob", "done"); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/"); await page.waitForTimeout(500);
  return { ctx, page };
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const vp of [{ width: 393, height: 852 }, { width: 1280, height: 800 }]) {
    const V = `${vp.width}`;

    await step(`${V}: a flagged bank loads, shows the bank id, survives a reload, opens by link, ignores the file name`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, file("x.json", { v: 1, bank: "BANK_BEAR", problems: BEAR }));
      await openedAny(page, ["BEAR_QAA", "BEAR_QAB"]);
      await waitMsg(page, "Loaded 2 problems");
      assert.ok(await toneIs(page, "--ok"), "ok is green");
      assert.equal(await label(page), "BANK_BEAR", "the label is the flag, not x.json");
      await page.goto("about:blank"); await page.goto(BASE + "/#BEAR_QAA"); await opened(page, "BEAR_QAA");
      assert.equal(await label(page), "BANK_BEAR", "after a reload (restore)");
      assert.equal(await msg(page), "", "restore() says nothing");
      await page.evaluate(() => { location.hash = "BEAR_QAB"; }); await opened(page, "BEAR_QAB");
      await typeCode(page, "bear qaa"); await opened(page, "BEAR_QAA");
      await upload(page, file("y (1).json", { v: 1, bank: "BANK_BEAR", problems: BEAR }));
      await openedAny(page, ["BEAR_QAA", "BEAR_QAB"]);
      await waitMsg(page, "Loaded 2 problems");
      assert.equal(await label(page), "BANK_BEAR", "same text, other file name, same result");
      await ctx.close();
    });

    await step(`${V}: custom codes with no flag: Bank flag missing, nothing opens (red)`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, file("bear.json", { v: 1, problems: BEAR }));
      await waitMsg(page, "Bank flag missing");
      assert.ok(await toneIs(page, "--bad"));
      assert.ok(await page.isHidden("#freeze"), "a problem opened");
      await ctx.close();
    });

    await step(`${V}: wrong, invalid and reserved flags`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, json({ v: 1, bank: "BANK_XYZ", problems: BEAR })); await waitMsg(page, "Prefix must match flag");
      await upload(page, json({ v: 1, bank: "bear", problems: BEAR })); await waitMsg(page, "Bank flag invalid");
      await upload(page, json({ v: 1, bank: "BANK_DIET", problems: [num("DIET_ABC", "1", "d"), num("DIET_ABD", "1", "d")] })); await waitMsg(page, "Prefix is reserved");
      assert.ok(await page.isHidden("#freeze"), "a problem opened");
      await ctx.close();
    });

    await step(`${V}: a mixed file (PSY_ + BEAR_, no flag): PSY_ loads, yellow-state line`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, json({ v: 1, problems: [num("PSY_ABC", "1", "Psy one"), ...BEAR] }));
      await opened(page, "PSY_ABC");
      await waitMsg(page, "Bank flag missing");
      assert.ok(await toneIs(page, "--ink"), "warn is not red and not green");
      assert.ok(!(await toneIs(page, "--bad")) && !(await toneIs(page, "--ok")));
      await ctx.close();
    });

    await step(`${V}: built-ins unchanged: an upload overrides the hosted copy (Q4), BANK_P2X and #CALC1_T6B still open`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, file("mine.json", { v: 1, problems: [num("PHYS_P01", "9", "UPLOADED OVERRIDE")] }));
      await opened(page, "PHYS_P01");
      assert.match(await page.textContent("#blocks"), /UPLOADED OVERRIDE/, "the upload won");
      await waitMsg(page, "Loaded 1 problem");
      assert.equal(await label(page), "mine.json", "no flag: the file name labels it");
      await page.goto("about:blank"); await page.goto(BASE + "/#BANK_P2X"); await page.waitForFunction(() => /^PHYS_P0/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
      await page.goto("about:blank"); await page.goto(BASE + "/#CALC1_T6B"); await opened(page, "CALC1_T6B");
      await ctx.close();
    });

    await step(`${V}: dead link: a custom code on a fresh device names its bank; a known prefix or a built-in says not found`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await page.goto("about:blank"); await page.goto(BASE + "/#BEAR_QAA");
      await waitMsg(page, "BEAR_QAA needs BANK_BEAR");
      assert.ok(await toneIs(page, "--bad"));
      await page.evaluate(() => { location.hash = "CALC1_ZZZ"; }); await waitMsg(page, "CALC1_ZZZ not found.");
      await upload(page, json({ v: 1, bank: "BANK_BEAR", problems: BEAR }));
      await openedAny(page, ["BEAR_QAA", "BEAR_QAB"]);
      await page.evaluate(() => { location.hash = "BEAR_ZZZ"; }); await waitMsg(page, "BEAR_ZZZ not found.");
      await ctx.close();
    });

    await step(`${V}: broken JSON, empty problems, not a bank, over 8 MB, not .json: each says so, red, never silent`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      const raw = (name, text) => ({ name, mimeType: "application/json", buffer: Buffer.from(text) });
      await upload(page, raw("a.json", "{ not json")); await waitMsg(page, "Broken JSON file");
      assert.ok(await toneIs(page, "--bad"));
      await upload(page, raw("b.json", '{"v":1,"problems":[]}')); await waitMsg(page, "No problems found");
      await upload(page, raw("c.json", '{"a":1}')); await waitMsg(page, "Not a bank file");
      await upload(page, raw("d.json", '{"v":1,"problems":[],"pad":"' + "x".repeat(8 * 1024 * 1024 + 10) + '"}')); await waitMsg(page, "File too big");
      await upload(page, { name: "e.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }); await waitMsg(page, "Not a JSON file");
      await upload(page, json({ v: 1, problems: [{ code: "PSY_ABC" }] })); await waitMsg(page, "No problems found");
      assert.ok(await page.isHidden("#freeze"));
      await ctx.close();
    });

    await step(`${V}: some problems malformed: Loaded 1, skipped 1 (warn), a stale colour never survives`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, json({ v: 1, problems: [num("PSY_ABC", "1", "Psy one"), { code: "PSY_ABD" }] }));
      await opened(page, "PSY_ABC"); await waitMsg(page, "Loaded 1, skipped 1");
      assert.ok(await toneIs(page, "--ink"));
      await typeCode(page, "NOPE_ZZZ");
      await waitMsg(page, "NOPE_ZZZ needs BANK_NOPE");
      assert.ok(await toneIs(page, "--bad"), "the red line is red after an ink one");
      await ctx.close();
    });

    await step(`${V}: paste: max_val stays in the scratchpad; a known custom code goes to the code box`, async () => {
      const { ctx, page } = await fresh(browser, vp);
      await upload(page, json({ v: 1, bank: "BANK_BEAR", problems: BEAR }));
      await openedAny(page, ["BEAR_QAA", "BEAR_QAB"]);
      const paste = text => page.evaluate(t => {
        const el = document.querySelector("#scratch"), dt = new DataTransfer(); dt.setData("text/plain", t);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return { taken: ev.defaultPrevented, box: document.querySelector("#code").value };
      }, text);
      const a = await paste("max_val");
      assert.equal(a.taken, false, "max_val was taken for a code"); assert.equal(a.box, "");
      const b = await paste("hello world");
      assert.equal(b.taken, false);
      const c = await paste("BEAR_QAB");
      assert.equal(c.taken, true, "a code of a known prefix"); assert.equal(c.box, "BEAR_QAB");
      await ctx.close();
    });
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
