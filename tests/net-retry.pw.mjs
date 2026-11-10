// app.js net(): a GET killed by a non-abort TypeError (Safari "Load failed" as the service worker takes control mid-fetch, iPhone E-FFXLW, Nov 5)
// is tried ONCE more; a POST never is. Own serve.py with a throwaway banks/ folder.
//   node tests/net-retry.pw.mjs [port]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8879", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "netretry-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_NR12.json"), JSON.stringify({ v: 20261022, problems: [
  { code: "CALC1_NR1", title: "NR 1", type: "num", answer: "2", body: [{ type: "text", md: "Retry one: 1 + 1" }] }] }));
const srv = spawn("python3", [join(ROOT, "server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
/* typed into the code box, not the URL hash: the boot path may ask for the bank more than once, which would hide a missing retry */
async function typeCode(page, code) {
  await page.goto(BASE + "/"); await page.waitForTimeout(600);
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) break; if (await page.isVisible(s)) await page.click(s); }
  await page.fill("#code", code); await page.press("#code", "Enter");
}
const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage();
  const seen = { bank: 0, check: 0 };
  await page.route("**/b/BANK_NR12.json", r => (++seen.bank === 1 ? r.abort("failed") : r.continue()));   // 1st dies like Safari's "Load failed"
  await page.route("**/check", r => { seen.check++; return r.abort("failed"); });
  return { ctx, page, seen };
};
try {
  await step("GET bank: first request aborted (TypeError), second served -> the question loads, 2 requests", async () => {
    const { ctx, page, seen } = await open();
    await typeCode(page, "BANK_NR12");
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_NR1" && !document.querySelector("#freeze").hidden, null, { timeout: 10000 });
    assert.equal(seen.bank, 2, "bank requested twice");
    assert.match(await page.textContent("#freeze"), /Retry one/);
    await ctx.close();
  });
  await step("POST /check that fails is NOT retried", async () => {
    const { ctx, page, seen } = await open();
    await typeCode(page, "BANK_NR12");
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_NR1" && !document.querySelector("#freeze").hidden, null, { timeout: 10000 });
    await page.fill("#ans", "2"); await page.press("#ans", "Enter");
    await page.waitForTimeout(1500);
    assert.equal(seen.check, 1, "one POST, no retry");
    await ctx.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
process.exit(failures ? 1 : 0);
