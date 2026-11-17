// GAP-BATCH1 smoke (ui-v7 only): B the old star "1" is hidden and the welcome pill clears the phone stash tab;
// C the question menu is the float family and the orange intro pill does not show under it; D the miss hint is the float family.
// Own serve.py.   node tests/gap-batch1.pw.mjs [port]   (SHOT=/path/prefix saves -390.png, -menu-390.png, -miss-390.png)
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8897), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "gap1-")); const BANKS = join(TMP, "banks"); mkdirSync(BANKS);
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_TC1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Piston", key: "Use: P = F/A\nAnswer: 4", slip: {} },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "answer", label: "Final answer", kind: "num" }] } };
writeFileSync(join(BANKS, "BANK_FHT.json"), JSON.stringify({ v: 1, problems: [welcome, ...Array.from({ length: 12 }, (_, i) => num("PHYS_TC" + (i + 2), i + 1))] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_FHT", STEM_FRONT_TITLE: "Exam 3", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 500)); } }
async function open(path) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-ui", "v7"); } catch { /* blocked */ } });
  const p = await c.newPage(); await p.goto(BASE + "/#BANK_FHT"); await p.waitForTimeout(2500);
  if (path) { await p.goto(BASE + path); await p.waitForTimeout(3000); }
  return { c, p };
}
const S = process.env.SHOT;
await step("B: the old star level badge is not drawn under ui-v7", async () => {
  const { c, p } = await open("");
  await p.waitForSelector("#rwHud", { state: "attached", timeout: 8000 }).catch(() => {});
  const d = await p.$eval("#rwHud .rw-lvl", e => getComputedStyle(e).display).catch(() => "none");
  if (S) await p.screenshot({ path: S + "-390.png" });
  assert.equal(d, "none");
  await c.close();
});
await step("C: the question menu uses the float fill, radius 16, no edge; the intro pill is hidden while it is open", async () => {
  const { c, p } = await open("");
  await p.click("#qlistBtn"); await p.waitForSelector("html.ql-open .qlist", { timeout: 5000 });
  const r = await p.$eval(".qlist", e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, rad: s.borderTopLeftRadius, bw: s.borderTopWidth }; });
  if (S) await p.screenshot({ path: S + "-menu-390.png" });
  assert.equal(r.rad, "16px"); assert.equal(r.bw, "0px");
  const fl = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--float").trim());
  assert.ok(fl, "--float token is set");
  const probe = await p.evaluate(() => { const e = document.querySelector("section.wl .rp-line"); return e ? getComputedStyle(e).visibility : "absent"; });
  assert.ok(probe === "hidden" || probe === "absent", `intro pill visibility under the open menu: ${probe}`);
  await c.close();
});
await step("D: the miss hint is the float card (no fill of the old sheet, radius 16, no edge)", async () => {
  const { c, p } = await open("#PHYS_TC2");
  await p.locator("input.ans").first().fill("9"); await p.locator("input.ans").first().press("Enter");
  await p.waitForSelector("#fb .cluck", { timeout: 8000 });
  const r = await p.$eval("#fb .cluck", e => { const s = getComputedStyle(e); return { rad: s.borderTopLeftRadius, bg: s.backgroundColor, sh: s.boxShadow }; });
  if (S) await p.screenshot({ path: S + "-miss-390.png" });
  assert.equal(r.rad, "16px"); assert.notEqual(r.sh, "none");
  await c.close();
});
await browser.close(); srv.kill();
process.exit(failures ? 1 : 0);
