// Smoke: a tap outside a toast closes it (stoast card -> 'dismissed', note #toast -> noteHide); the tap that opened it does not.
// Own serve.py on a temp bank:   node tests/toast-outside.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8897", BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "toast-out-")), BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = n => ({ code: `CALC1_R0${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
writeFileSync(join(BANKS, "BANK_TG01.json"), JSON.stringify({ v: 20261022, problems: [1, 2, 3, 4].map(real) }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); } }
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off"); } catch (e) { /* blocked */ } });
const p = await ctx.newPage();
await p.goto(BASE + "/");
for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await p.isVisible("#code")) break; if (await p.isVisible(s)) await p.click(s); }
await p.fill("#code", "BANK_TG01"); await p.press("#code", "Enter");
await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
const cardOn = () => p.evaluate(() => !!document.querySelector(".stoast.on:not(.out)"));
const noteOn = () => p.evaluate(() => !!document.querySelector("#toast.on"));
const openCard = () => p.evaluate(() => { window.stemToast.clear(); window.stemToast.show({ text: "Outside tap card", at: () => document.querySelector("#q"), ms: 60000 }); });
const openNote = () => p.evaluate(() => { window.stemToast.noteHide(); return window.stemToast.note({ text: "Outside tap note", at: document.querySelector("#q"), ms: 60000, loose: true }); });
// past(ms): the page clock passes ms. Needed only where the 300 ms opening-gesture guard or a "stays open" window is the thing under test.
const past = ms => p.waitForFunction(t => Date.now() >= t, Date.now() + ms);
const closed = sel => p.waitForFunction(q => !document.querySelector(q), sel, { timeout: 3000 }).then(() => true, () => false);
const tapOut = () => p.touchscreen.tap(2, 2);   // a bare corner, far from either toast
await step("a card closes on a tap outside it", async () => {
  await openCard(); await p.waitForSelector(".stoast.on"); await past(400);
  await tapOut();
  assert.ok(await closed(".stoast.on"), "card still open");
});
await step("a note closes on a tap outside it", async () => {
  assert.ok(await openNote(), "note did not place"); await past(400);
  await tapOut();
  assert.ok(await closed("#toast.on"), "note still open");
});
await step("a tap inside the card does not close it", async () => {
  await openCard(); await p.waitForSelector(".stoast.on"); await past(400);
  const b = await p.evaluate(() => { const r = document.querySelector(".stoast-t").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.touchscreen.tap(b[0], b[1]); await past(300);
  assert.equal(await cardOn(), true, "card closed by an inside tap");
});
await step("the pointerdown of the opening gesture does not close a card / note", async () => {
  await p.evaluate(() => { window.stemToast.clear(); window.stemToast.noteHide(); });
  await closed(".stoast.on"); await closed("#toast.on");
  await p.evaluate(() => {
    document.addEventListener("pointerdown", () => { window.stemToast.show({ text: "Opened by tap", at: () => document.querySelector("#q"), ms: 60000 }); window.stemToast.note({ text: "Note by tap", at: document.querySelector("#q"), ms: 60000, loose: true }); }, { once: true });
  });
  await tapOut(); await p.waitForSelector(".stoast.on");
  await p.evaluate(() => document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));   // a trailing pointerdown of the same gesture
  await past(250);
  assert.equal(await cardOn(), true, "card closed by its opening gesture");
  assert.equal(await noteOn(), true, "note closed by its opening gesture");
});
await browser.close(); srv.kill();
console.log(failures ? `\n${failures} failed` : "\nall toast-outside checks passed");
process.exit(failures ? 1 : 0);
