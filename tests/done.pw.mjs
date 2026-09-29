// Done questions (design/DONE.md): list marks, read-only reopen, state across reloads, server restarts and hand resets.
// Starts its own serve.py (it restarts it), with a throwaway tries.json:
//   node tests/done.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8817), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
const TRIES = join(mkdtempSync(join(tmpdir(), "done-")), "tries.json");

let srv = null;
async function start() {
  srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) return; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
  throw new Error("server did not start");
}
async function stop() { if (!srv) return; const s = srv; srv = null; s.kill(); await new Promise(r => s.once("exit", r)); }
const restart = async () => { await stop(); await start(); };

const num = (code, answer, md, wrong) => ({ code, type: "num", answer, body: [{ type: "text", md }], ...(wrong ? { wrong } : {}) });
const BANK = { v: 1, problems: [
  num("CALC1_D01", "2", "Fresh: 1 + 1"),
  num("CALC1_D02", "3", "One X: 1 + 2", [{ match: "4", hint: "HINT-D02 you added one too many", error: "arith" }]),
  num("CALC1_D03", "4", "XX: 2 + 2"),
  { code: "CALC1_D04", type: "mc", correct: "a", shuffle: false, body: [{ type: "text", md: "Tick: pick A" }],
    choices: [{ id: "a", md: "right" }, { id: "b", md: "nope" }, { id: "c", md: "nah" }, { id: "d", md: "no" }] },
  { code: "CALC1_D05", type: "mc", correct: "t", shuffle: false, body: [{ type: "text", md: "True or false: 1 = 1" }],
    choices: [{ id: "t", md: "True" }, { id: "f", md: "False" }], wrong: [{ choice: "f", hint: "HINT-D05" }] },
  num("CALC1_D06", "6", "X then tick: 3 + 3"),
  { code: "CALC1_D07", type: "mc", correct: "b", shuffle: false, body: [{ type: "text", md: "Out: pick B" }],
    choices: [{ id: "a", md: "one" }, { id: "b", md: "two" }, { id: "c", md: "three" }] },
  { code: "CALC1_D08", type: "multi", body: [{ type: "text", md: "Multi" }],
    parts: [{ type: "num", answer: "1", prompt: "one" }, { type: "num", answer: "2", prompt: "two", wrong: [{ match: "3", hint: "HINT-D08b" }] }] }] };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.goto("about:blank"); await page.goto(`${BASE}/#${code}`); await opened(page, code); };
const fb = page => page.waitForSelector("#fb .verdict", { timeout: 4000 }).then(() => page.textContent("#fb"));
async function typed(page, v) { await page.fill("#ans", v); await page.click("#ansGo"); await fb(page); await page.waitForTimeout(150); }
async function pick(page, id) {
  await page.click(`.opt[data-id="${id}"]`);
  await page.click(`.ch[data-id="${id}"] .send`);
  await fb(page); await page.waitForTimeout(150);
}
const rows = page => page.$$eval("#qlist a", as => as.map(a => ({
  x: a.querySelectorAll(".mk-x").length, ok: a.querySelectorAll(".mk-ok").length, gone: a.classList.contains("gone"),
  label: a.getAttribute("aria-label"), line: getComputedStyle(a.querySelector(".qt")).textDecorationLine,
  disabled: a.getAttribute("aria-disabled"), text: a.textContent.trim() })));
async function openList(page) { if (await page.isHidden("#qlist")) await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])"); }
const qstate = page => page.evaluate(() => ({
  finished: window.__drill.state.finished, closed: document.querySelector("#q").classList.contains("closed"),
  right: [...document.querySelectorAll("#q .opt.right")].map(o => o.dataset.id),
  wrong: [...document.querySelectorAll("#q .opt.wrong")].map(o => o.dataset.id),
  live: [...document.querySelectorAll("#q .opt:not(:disabled), #q .ans:not(:disabled)")].length,
  ans: document.querySelector("#ans")?.value ?? null, fb: document.querySelector("#fb").textContent,
  sendShown: [...document.querySelectorAll("#q .send")].some(b => !b.hidden && b.offsetParent) }));

async function upload(page) {
  await page.goto(BASE + "/");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "done.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(BANK)) });
  await opened(page, "CALC1_D01");
}

await start();
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  /* ---------------- upload mode ---------------- */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await step("upload: play every row state", async () => {
    await upload(page);
    await go(page, "CALC1_D02"); await typed(page, "4");
    await go(page, "CALC1_D03"); await typed(page, "1"); await typed(page, "5");
    await go(page, "CALC1_D04"); await pick(page, "a");
    await go(page, "CALC1_D05"); await pick(page, "f");
    await go(page, "CALC1_D06"); await typed(page, "7"); await typed(page, "6");
    await go(page, "CALC1_D07"); await pick(page, "a"); await pick(page, "c");
  });

  const part = async (pg, i, v) => {
    await pg.fill(`#q .part[data-i="${i}"] .ans`, v); await pg.press(`#q .part[data-i="${i}"] .ans`, "Enter"); await pg.waitForTimeout(250);
  };
  const partState = pg => pg.$$eval("#q .part", ps => ps.map(p => ({ shut: p.querySelector(".ff").classList.contains("shut"),
    ok: p.querySelector(".ff").classList.contains("ok"), val: p.querySelector(".ans").value, dis: p.querySelector(".ans").disabled,
    hint: p.querySelector(".phint").textContent })));
  await step("upload multi: parts keep their own state across a reload", async () => {
    await go(page, "CALC1_D08"); await part(page, 0, "1"); await part(page, 1, "3");
    await page.reload(); await opened(page, "CALC1_D08");
    const ps = await partState(page);
    assert.ok(ps[0].shut && ps[0].ok && ps[0].dis, "part a right, closed");
    assert.ok(!ps[1].shut && !ps[1].dis, "part b still open"); assert.match(ps[1].hint, /HINT-D08b/);
    assert.equal((await qstate(page)).finished, false);
    await openList(page); const r = await rows(page);
    assert.equal(r[7].x, 1); assert.equal(r[7].gone, false);
    await part(page, 1, "5");
    await page.reload(); await opened(page, "CALC1_D08");
    const s2 = await qstate(page); assert.ok(s2.finished); assert.match(s2.fb, /1 of 2 right/);
    await openList(page); const r2 = await rows(page);
    assert.equal(r2[7].x, 2); assert.equal(r2[7].gone, true); assert.match(r2[7].label, /Out of tries\.$/);
    await page.click('#qlistBtn');
  });

  const expectRows = async () => {
    await openList(page);
    const r = await rows(page);
    const want = [[0, 0, false], [1, 0, false], [2, 0, true], [0, 1, true], [1, 0, true], [1, 1, true], [2, 0, true]];
    want.forEach(([x, ok, gone], i) => {
      assert.equal(r[i].x, x, `row ${i + 1} X count`); assert.equal(r[i].ok, ok, `row ${i + 1} tick`);
      assert.equal(r[i].gone, gone, `row ${i + 1} crossed`);
      assert.equal(r[i].line.includes("line-through"), gone, `row ${i + 1} line-through`);
      assert.equal(r[i].disabled, null, `row ${i + 1} not disabled`);
    });
    assert.match(r[1].label, /One wrong try, one left\.$/);
    assert.match(r[2].label, /Out of tries\.$/);
    assert.match(r[3].label, /Correct\.$/);
    assert.match(r[4].label, /Out of tries\.$/, "2-choice, 1 try: a single X is out");
  };
  await step("upload: list marks, before reload", expectRows);

  await step("upload: list marks survive a reload", async () => {
    await page.reload(); await opened(page, "CALC1_D08");
    await expectRows();
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/done-list-390.png` });
      await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/done-list-1920.png` });
      await page.setViewportSize({ width: 390, height: 844 });
    }
  });

  await step("upload: a crossed row stays tappable and opens read-only (XX, answer not shown)", async () => {
    await openList(page);
    await page.click('#qlist a[href="#CALC1_D03"]'); await opened(page, "CALC1_D03");
    const s = await qstate(page);
    assert.ok(s.finished && s.closed, "read-only"); assert.equal(s.live, 0); assert.equal(s.sendShown, false);
    assert.equal(s.ans, "5", "the student's last answer, not the right one");
    assert.match(s.fb, /Out of tries/); assert.doesNotMatch(s.fb, /Correct/);
  });

  await step("upload: reopened correct MC shows the student's pick, read-only", async () => {
    await go(page, "CALC1_D04");
    const s = await qstate(page);
    assert.deepEqual(s.right, ["a"]); assert.ok(s.finished); assert.equal(s.live, 0); assert.match(s.fb, /Correct/);
    if (SHOTS) { await page.screenshot({ path: `${SHOTS}/done-open-correct-390.png` }); }
  });

  await step("upload: reopened out-of-tries MC never marks the right choice", async () => {
    await go(page, "CALC1_D07");
    const s = await qstate(page);
    assert.deepEqual(s.right, [], "no right choice revealed"); assert.deepEqual(s.wrong.sort(), ["a", "c"]);
    assert.ok(s.finished); assert.equal(s.live, 0); assert.match(s.fb, /Out of tries/);
    const html = await page.innerHTML("#q");
    assert.doesNotMatch(html, /\bright\b/, "no .right anywhere");
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/done-open-out-390.png` });
      await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/done-open-out-1920.png` });
      await page.setViewportSize({ width: 390, height: 844 });
    }
  });

  await step("upload: 2-choice 1-try reopen is out, hint for the student's own wrong pick", async () => {
    await go(page, "CALC1_D05");
    const s = await qstate(page);
    assert.deepEqual(s.wrong, ["f"]); assert.deepEqual(s.right, []); assert.ok(s.finished);
    assert.match(s.fb, /HINT-D05/);
  });

  await step("upload: one try left reopens live, old hint shown, grading continues", async () => {
    await go(page, "CALC1_D02");
    const s = await qstate(page);
    assert.equal(s.finished, false); assert.ok(s.live > 0, "can still answer");
    assert.match(s.fb, /One more try/); assert.match(s.fb, /HINT-D02/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/done-open-tryleft-390.png` });
    await typed(page, "9");
    assert.match(await page.textContent("#fb"), /Out of tries/, "the try before the reload counted");
    await openList(page);
    const r = await rows(page);
    assert.equal(r[1].x, 2); assert.equal(r[1].gone, true);
  });

  await step("upload: the same file uploaded again keeps its state; an edited problem starts fresh", async () => {
    const edited = structuredClone(BANK); edited.problems[2].answer = "40";
    await page.goto(BASE + "/");
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await fc.setFiles({ name: "done.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(edited)) });
    await page.waitForTimeout(300);
    await go(page, "CALC1_D04"); assert.ok((await qstate(page)).finished, "unchanged problem keeps its tick");
    await go(page, "CALC1_D03"); assert.equal((await qstate(page)).finished, false, "edited problem is fresh");
  });
  await ctx.close();

  /* ---------------- server mode ---------------- */
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const sp = await sctx.newPage();
  const sstate = async (ctxx, code) => (await ctxx.request.get(`${BASE}/state/${code}`)).json();

  await step("server: one wrong MC try survives a reload (struck, hint, one try left)", async () => {
    await go(sp, "CALC1_X2P"); await pick(sp, "a");
    await sp.reload(); await opened(sp, "CALC1_X2P");
    const s = await qstate(sp);
    assert.deepEqual(s.wrong, ["a"]); assert.equal(s.finished, false); assert.match(s.fb, /One more try/);
  });

  await step("server: out of tries, then a server restart: still locked (tries.json)", async () => {
    await pick(sp, "c");
    assert.ok(existsSync(TRIES), "tries.json written");
    await restart();
    const st = await sstate(sctx, "CALC1_X2P");
    assert.equal(st.wrong, 2);
    await sp.reload(); await opened(sp, "CALC1_X2P");
    const s = await qstate(sp);
    assert.ok(s.finished); assert.deepEqual(s.right, []); assert.match(s.fb, /Out of tries/);
    await sp.waitForTimeout(500);
    assert.ok((await qstate(sp)).finished, "still locked after /state");
  });

  await step("server multi: a wrong part survives a restart; the other part stays open", async () => {
    await go(sp, "CSCI26_M5V");
    await sp.fill('#q .part[data-i="0"] .ans', "17"); await sp.press('#q .part[data-i="0"] .ans', "Enter"); await sp.waitForTimeout(300);
    const before = await sp.$eval('#q .part[data-i="0"] .phint', e => e.textContent);
    await restart();
    await sp.reload(); await opened(sp, "CSCI26_M5V"); await sp.waitForTimeout(400);
    const st = await sstate(sctx, "CSCI26_M5V");
    assert.ok(Array.isArray(st.parts)); assert.equal(st.parts[0].wrong, 1); assert.match(before, /overlap twice/);
    const hint = await sp.$eval('#q .part[data-i="0"] .phint', e => e.textContent);
    assert.equal(hint, before, "same feedback after reload");
    assert.equal(await sp.$eval('#q .part[data-i="1"] .ans', e => e.disabled), false);
  });

  await step("server: correct answer reopens read-only after a reload", async () => {
    await go(sp, "CALC1_T6B"); await typed(sp, "12");
    await sp.reload(); await opened(sp, "CALC1_T6B");
    const s = await qstate(sp);
    assert.ok(s.finished); assert.equal(s.ans, "12"); assert.match(s.fb, /Correct/);
  });

  await step("server further than the cache (same cookie, empty cache): server wins", async () => {
    const other = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await other.addCookies(await sctx.cookies());
    const op = await other.newPage();
    await go(op, "CALC1_X2P");
    await op.waitForFunction(() => window.__drill.state.finished, null, { timeout: 9000 });
    const s = await qstate(op);
    assert.match(s.fb, /Out of tries/); assert.deepEqual(s.right, []);
    await other.close();
  });

  await step("server: Tony deletes the entry in tries.json -> newer gen -> page drops its cache", async () => {
    await stop();
    const data = JSON.parse(readFileSync(TRIES, "utf8"));
    const key = Object.keys(data.tries).find(k => k.endsWith(" CALC1_X2P"));
    assert.ok(key); delete data.tries[key];
    writeFileSync(TRIES, JSON.stringify(data));
    await start();
    await go(sp, "CALC1_X2P");
    await sp.waitForFunction(() => !window.__drill.state.finished, null, { timeout: 9000 });
    const s = await qstate(sp);
    assert.deepEqual(s.wrong, []); assert.ok(s.live > 0); assert.equal(s.fb.trim(), "");
  });

  await step("server: tries.json lost -> the cache stays locked (not a reset)", async () => {
    await go(sp, "CALC1_A9R"); await typed(sp, "1"); await typed(sp, "2");
    await stop(); rmSync(TRIES); await start();
    await go(sp, "CALC1_A9R");
    await sp.waitForTimeout(800);
    const s = await qstate(sp);
    assert.ok(s.finished, "stays read-only"); assert.match(s.fb, /Out of tries/);
  });

  await step("server: unreachable -> cache still shows the done state", async () => {
    await sp.route("**/state/**", r => r.abort());
    await go(sp, "CALC1_T6B");
    const s = await qstate(sp);
    assert.ok(s.finished); assert.match(s.fb, /Correct/);
    await sp.unrouteAll({ behavior: "ignoreErrors" });
  });
  await sctx.close();
} finally {
  await browser.close();
  await stop();
}
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
