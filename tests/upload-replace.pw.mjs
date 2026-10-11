// B1: an upload REPLACES the previous upload in memory, as it already does in IndexedDB (design/RELOAD.md).
// Memory = codes() = the question list = Next's pool = what a reload restores. Rows: A then B, A then A' (a code removed),
// a bad file after A, several files in one pick (the dialog), the dialog that waits for a code, a hosted code reused by an upload.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/upload-replace.pw.mjs [port] [shotDir]
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
const SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "upreplace-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const file = (name, problems) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ v: 1, problems })) });
/* hosted: two questions the server has (a bank file is the only place serve.py reads them from here) */
writeFileSync(join(BANKS, "BANK_HOST.json"), JSON.stringify({ v: 1, problems: [num("PHYS_H01", "2", "HOSTED-ONE: 1 + 1"), num("PHYS_H02", "3", "HOSTED-TWO: 1 + 2")] }));

const A = ["CALC1_ZA1", "CALC1_ZA2", "CALC1_ZA3"].map((c, i) => num(c, "2", `Alpha ${i + 1} old: 1 + 1`));
const B = ["CALC1_ZB1", "CALC1_ZB2", "CALC1_ZB3"].map((c, i) => num(c, "2", `Beta ${i + 1}: 1 + 1`));
const A2 = [num("CALC1_ZA1", "2", "Alpha 1 old: 1 + 1"), num("CALC1_ZA3", "2", "Alpha 3 EDITED: 1 + 1"), num("CALC1_ZA4", "2", "Alpha 4 new: 1 + 1")];
const C = ["CALC1_ZC1", "CALC1_ZC2"].map((c, i) => num(c, "2", `Gamma ${i + 1}: 1 + 1`));
const H = [num("PHYS_H01", "5", "UPLOADED-OVERRIDE: 2 + 3"), num("PHYS_H09", "2", "Hosted override side: 1 + 1")];
const fA = file("A.json", A), fB = file("B.json", B), fA2 = file("A.json", A2), fC = file("C.json", C), fH = file("H.json", H);
const codes = ps => ps.map(p => p.code);
/* no valid problem in them: not JSON; JSON with no problems; JSON whose only problem is broken */
const junk = [
  { name: "junk.json", mimeType: "application/json", buffer: Buffer.from("this is not json {{{") },
  file("empty.json", []),
  file("shape.json", [num("calc1_zx1", "2", "bad code shape")]),
  file("noflag.json", [num("BEAR_ZX1", "2", "custom prefix, no bank flag")]),
  { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
];

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
const ONLY = process.env.UR_ONLY ? new RegExp(process.env.UR_ONLY) : null;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const pcode = page => page.evaluate(() => document.querySelector("#pcode")?.textContent || "");
const opened = (page, code, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
const settled = page => page.waitForFunction(() => /\S/.test(document.querySelector("#pcode")?.textContent || "")
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });

async function ctxFor(browser, vp) {
  const phone = vp.width < 600;
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: "block", hasTouch: phone, isMobile: phone });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("stem-ob")) localStorage.setItem("stem-ob", "done"); } catch { /* blocked */ } });
  return ctx;
}
/* the upload button: the OS file dialog, one file. The button hides once a question is open on a phone, so the click is made in the page. */
async function upload(page, f) {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.evaluate(() => document.querySelector("#upload").click())]);
  await fc.setFiles(f);
  await page.waitForTimeout(900);
}
/* the dialog (offline.js read()): several files in one pick */
async function pickMany(page, files, code) {
  const p = page.evaluate(c => { const r = window.stemOffline.openPicker(c || null); window.__wait = r; return null; }, code || null);
  await p;
  await page.waitForSelector(".so:not([hidden])");
  await page.setInputFiles('.so input[type=file][multiple]:not([webkitdirectory])', files);
  await page.waitForTimeout(900);
}
const idbCodes = page => page.evaluate(() => new Promise(res => { const o = indexedDB.open("stem-stuff", 2); o.onsuccess = () => { const r = o.result.transaction("bank").objectStore("bank").get("files"); r.onsuccess = () => { o.result.close(); res((r.result || []).flatMap(f => JSON.parse(f.text).problems.map(p => p.code))); }; }; }));
const memCodes = page => page.evaluate(() => window.stemOffline.codes());
const listRows = async page => {
  if (await page.isHidden("#qlist")) await page.click("#qlistBtn");
  const rows = await page.$$eval("#qlist a", as => as.map(a => (a.getAttribute("href") || "").replace(/^#/, "")));
  await page.click("#qlistBtn").catch(() => {});
  return rows;
};
/* n Next presses: the codes shown, in order. Every press must move (the pool always has 2 or more here). */
async function nextSeq(page, n = 20) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    const from = await pcode(page);
    await page.click("#qnext", { timeout: 3000 });
    await page.waitForFunction(f => (document.querySelector("#pcode")?.textContent || "") !== f, from, { timeout: 3000 }).catch(() => {});
    seq.push(await pcode(page));
  }
  return seq;
}
const sorted = a => [...a].sort();
async function snap(page) {
  return { mem: await memCodes(page), idb: await idbCodes(page), rows: await listRows(page), next: sorted([...new Set(await nextSeq(page, 20))]) };
}
async function reload(page, hash) {
  await page.goto("about:blank"); await page.goto(BASE + "/" + hash);
  await page.waitForFunction(() => window.stemOffline); await page.evaluate(() => window.stemOffline.ready);
  await settled(page); await page.waitForTimeout(400);
}
/* the whole contract for one expected set: memory, IndexedDB, list rows and 20 Next presses are exactly `want`; gone codes do not open */
async function expectOnly(page, want, gone, tag) {
  const s = await snap(page);
  assert.deepEqual(sorted(s.mem), sorted(want), `${tag}: codes()`);
  assert.deepEqual(sorted(s.idb), sorted(want), `${tag}: IndexedDB`);
  assert.deepEqual(sorted(s.rows), sorted(want), `${tag}: list rows`);
  assert.deepEqual(s.next, sorted(want), `${tag}: Next pool over 20 presses`);
  for (const g of gone) {
    await page.goto(BASE + "/#" + g); await page.waitForTimeout(900);
    assert.notEqual(await pcode(page), g, `${tag}: ${g} still opens by #code`);
    assert.ok(!(await page.evaluate(c => window.stemOffline.has(c), g)), `${tag}: ${g} still in memory`);
  }
  return s;
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const vp of [{ width: 393, height: 852 }, { width: 1280, height: 800 }]) {
    const V = `${vp.width}`;

    await step(`${V}: A then B: only B is left in codes, list, Next; a reload gives the same`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      assert.deepEqual(sorted(await memCodes(page)), sorted(codes(A)), "A in memory");
      await upload(page, fB); await settled(page);
      if (SHOTS && vp.width === 393) { await page.click("#qlistBtn"); await page.screenshot({ path: join(SHOTS, "chromium-393x852-A-then-B.png") }); await page.click("#qlistBtn").catch(() => {}); }
      const before = await expectOnly(page, codes(B), codes(A), "after B");
      await reload(page, "#" + B[0].code);
      const after = await expectOnly(page, codes(B), codes(A), "after reload");
      assert.deepEqual(after, before, "before vs after reload");
      await ctx.close();
    });

    await step(`${V}: A then A' (a code removed, one edited, one added): the removed code is gone at once; a reload gives the same`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      await upload(page, fA2); await settled(page);
      const before = await expectOnly(page, codes(A2), ["CALC1_ZA2"], "after A'");
      const edited = await page.evaluate(() => window.stemOffline.get("CALC1_ZA3").body[0].md);
      assert.match(edited, /EDITED/, "the edited problem keeps the new text");
      await reload(page, "#CALC1_ZA3");
      const after = await expectOnly(page, codes(A2), ["CALC1_ZA2"], "A' after reload");
      assert.deepEqual(after, before, "before vs after reload");
      await ctx.close();
    });

    await step(`${V}: a file with no valid problem wipes nothing (not JSON, no problems, a bad code, a custom prefix without a flag, not .json)`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      for (const j of junk) {
        await upload(page, j);
        const said = await page.evaluate(() => (document.querySelector("#toast.on")?.textContent || "") + "|" + (document.querySelector("#entryMsg")?.textContent || ""));
        assert.ok(said.length > 1, `${j.name}: said nothing`);
        assert.deepEqual(await memCodes(page), codes(A), `${j.name}: memory changed`);
        assert.deepEqual(await idbCodes(page), codes(A), `${j.name}: IndexedDB changed`);
      }
      const before = await expectOnly(page, codes(A), [], "after junk");
      await reload(page, "#" + A[0].code);
      const after = await expectOnly(page, codes(A), [], "junk after reload");
      assert.deepEqual(after, before, "before vs after reload");
      await ctx.close();
    });

    await step(`${V}: several files in one pick add up to each other; the next pick replaces them all; a reload gives the same`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      await pickMany(page, [fB, fC]);                                     // A is gone; B and C stay together
      await settled(page);
      const both = [...codes(B), ...codes(C)];
      const before = await expectOnly(page, both, codes(A), "after B+C");
      await reload(page, "#" + B[0].code);
      const after = await expectOnly(page, both, codes(A), "B+C after reload");
      assert.deepEqual(after, before, "before vs after reload");
      await pickMany(page, [fA2, ...junk.slice(0, 4)]);                   // one good file and four bad ones: the good one replaces, the bad ones add nothing
      await settled(page);
      const second = await expectOnly(page, codes(A2), [...codes(B), ...codes(C)], "after A'+junk");
      await reload(page, "#CALC1_ZA3");
      assert.deepEqual(await expectOnly(page, codes(A2), [...codes(B), ...codes(C)], "A'+junk after reload"), second, "before vs after reload");
      await pickMany(page, junk.slice(0, 4));                             // all bad: nothing changes
      assert.deepEqual(await memCodes(page), codes(A2), "all-bad pick changed memory");
      assert.deepEqual(await idbCodes(page), codes(A2), "all-bad pick changed IndexedDB");
      await page.click(".so .so-x").catch(() => {});
      await ctx.close();
    });

    await step(`${V}: the dialog that waits for a code: a file without it says so and keeps asking; the right file answers`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      const got = page.evaluate(() => { window.__w = null; window.stemOffline.openPicker("CALC1_ZB2").then(p => { window.__w = p; }, e => { window.__w = "rejected: " + e.message; }); return null; });
      await got;
      await page.waitForSelector(".so:not([hidden])");
      await page.setInputFiles('.so input[type=file][multiple]:not([webkitdirectory])', [fC]);   // has other codes, not CALC1_ZB2
      await page.waitForTimeout(700);
      assert.match(await page.textContent(".so-msg"), /CALC1_ZB2/, "the dialog should say the code is not in that file");
      assert.equal(await page.evaluate(() => window.__w), null, "the wait must stay open");
      assert.ok(await page.isVisible(".so"), "the dialog should stay open");
      await page.setInputFiles('.so input[type=file][multiple]:not([webkitdirectory])', [fB]);
      await page.waitForFunction(() => window.__w && window.__w.code, null, { timeout: 4000 });
      assert.equal(await page.evaluate(() => window.__w.code), "CALC1_ZB2", "the wait gets the problem from the fresh file");
      assert.ok(await page.isHidden(".so"), "the dialog closes after the hit");
      assert.deepEqual(sorted(await memCodes(page)), sorted(codes(B)), "memory = the last pick (B)");
      assert.deepEqual(sorted(await idbCodes(page)), sorted(codes(B)), "IndexedDB = the last pick (B)");
      await ctx.close();
    });

    await step(`${V}: an upload that reuses a hosted code still overrides it, before and after a reload; a later upload without it gives the hosted copy back`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      const text = () => page.evaluate(() => document.querySelector("#freeze")?.textContent || "");
      await page.goto(BASE + "/#PHYS_H01"); await opened(page, "PHYS_H01");
      assert.match(await text(), /HOSTED-ONE/, "hosted copy before the upload");
      await upload(page, fA); await settled(page);                        // an unrelated upload first, so the override comes from a replace
      await upload(page, fH); await settled(page);
      await page.goto(BASE + "/#PHYS_H01"); await opened(page, "PHYS_H01");
      assert.match(await text(), /UPLOADED-OVERRIDE/, "override after the upload");
      assert.deepEqual(sorted(await memCodes(page)), sorted(codes(H)), "memory = the override file only");
      await page.goto(BASE + "/#PHYS_H02"); await opened(page, "PHYS_H02");
      assert.match(await text(), /HOSTED-TWO/, "a hosted code the upload does not have stays hosted");
      await reload(page, "#PHYS_H01");
      assert.match(await text(), /UPLOADED-OVERRIDE/, "override after a reload");
      assert.deepEqual(sorted(await memCodes(page)), sorted(codes(H)), "memory after reload");
      await upload(page, fB); await settled(page);                        // B has no H01: the override of this device ends with the replace
      await page.goto(BASE + "/#PHYS_H01"); await opened(page, "PHYS_H01");
      assert.match(await text(), /HOSTED-ONE/, "hosted copy back after a replace");
      await reload(page, "#PHYS_H01");
      assert.match(await text(), /HOSTED-ONE/, "hosted copy back after a reload");
      await ctx.close();
    });

    await step(`${V}: done marks are untouched by a replace: they come back when the same problem is uploaded again`, async () => {
      const ctx = await ctxFor(browser, vp), page = await ctx.newPage();
      await page.goto(BASE + "/"); await page.waitForTimeout(500);
      await upload(page, fA); await settled(page);
      await page.evaluate(() => window.stemOffline.donePut("CALC1_ZA1", { n: 1 }));
      const key = await page.evaluate(() => window.stemOffline.doneKey("CALC1_ZA1"));
      await upload(page, fB); await settled(page);
      await upload(page, fA); await settled(page);
      assert.equal(await page.evaluate(() => window.stemOffline.doneKey("CALC1_ZA1")), key, "done key changed");
      assert.deepEqual(await page.evaluate(() => window.stemOffline.doneGet("CALC1_ZA1")), { n: 1 }, "done mark lost");
      assert.deepEqual(sorted(await memCodes(page)), sorted(codes(A)));
      await ctx.close();
    });
  }
} finally {
  await browser.close(); srv.kill();
}
console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
