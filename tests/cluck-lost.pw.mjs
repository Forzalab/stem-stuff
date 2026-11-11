// CLUCK-LOST (Tony 19:37 PST Nov 3, "Clean error line"; PHYS_LP5 ended "Use rotational Newton's 2n" under a blank figure gap): when /explain dies
// mid-reply (the in-band {"error"} line, then the server's "(Cluck stopped early. Sorry!)"), the box keeps the whole lines so far, drops the half
// line and the empty gap a dropped figure left, and ends on ONE line "Cluck lost signal. Tap to retry." whose tap asks /explain again.
// 1280 (the box is open from load) + 393 (the tray's Ask Cluck opens it). Own serve.py, /explain mocked by page.route (no model call).
//   node tests/cluck-lost.pw.mjs <port> [shots dir]
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8893", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "clost-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
writeFileSync(join(banks, "BANK_CLS.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_CLS1", title: "Lost 1", type: "mc", shuffle: false,
  body: txt("A rectangle spins about its left edge. Which torque speeds it up?"), correct: "a",
  choices: ["0.70 kN m", "1.4 kN m", "2.8 kN m", "6.7 kN m"].map((md, i) => ({ id: "abcd"[i], md })),
  wrong: [{ choice: "b", error: "misread", hint: "QUACK. Which masses sit on the axis?" }], saccharine: { title: "Lost 1", key: "Tick: a" } }] }));
const DIED = "Not quite. You used the old number.\n\nHere is the setup.\n\n\n\nThe two right masses are 2a from the axis.\n\nHere is the torque:\n\nUse rotational Newton's 2n"
  + "\x1e" + JSON.stringify({ error: "S-TEST1", why: "upstream" }) + "\n\n(Cluck stopped early. Sorry!)";
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const w of [1280, 393]) {
  await step(`@${w}: a reply that dies mid-way ends on one clean "Cluck lost signal. Tap to retry." line; the tap asks again`, async () => {
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
    let asks = 0;
    await ctx.route("**/explain", r => { asks++; return r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: DIED }); });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(BASE + "/#BANK_CLS");
    await page.waitForFunction(() => !document.getElementById("splash") && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
    await page.waitForFunction(() => asks => true, null, { timeout: 3000 });
    if (phone) { await page.waitForSelector(".vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 }); await page.click(".vdrawer .wchip"); }
    await page.click("#cluck .wtext").catch(() => {});                 // a tap skips the typing
    await page.waitForFunction(() => /lost signal|stopped early|2n/.test(document.querySelector("#cluck .wtext")?.innerText || ""), null, { timeout: 8000 });
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => document.querySelector("#cluck .wtext").innerText);
    await page.screenshot({ path: join(SHOTS, `cluck-lost-${w}.png`) });
    assert.match(t, /Cluck lost signal\. Tap to retry\./, "the clean line: " + t);
    assert.ok(t.includes("The two right masses are 2a from the axis."), "the whole lines stay: " + t);
    assert.ok(!/Newton's 2n/.test(t), "the half line goes: " + t);
    assert.ok(!/Here is the torque:/.test(t), "a trailing lead-in to a figure that never came goes: " + t);
    assert.ok(!/stopped early/.test(t), "the server's stopped-early line goes: " + t);
    assert.ok(!/\n\s*\n\s*\n/.test(t), "no empty gap: " + JSON.stringify(t));
    const before = asks;
    await page.click("#cluck .wlost .wretry");
    await page.waitForTimeout(800);
    assert.equal(asks, before + 1, "the tap asks /explain again");
    assert.deepEqual(errs, [], "no page errors");
    await ctx.close();
  });
}
await browser.close(); srv.kill();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
