// CLUCK-RAISE smoke (Tony Nov 27): the Ask Cluck squircle on the v7 question card has a slight resting shadow (--shadow-raise), none when locked or pressed,
// and the shadow is not clipped by the card. 390 + 1280. Own serve.py.   node tests/cluck-raise.smoke.mjs [port]
// (the harness below is cut from ghost-glass.smoke.mjs) GHOST-HYBRID-FROST smoke (Tony Nov 23): ONE frost look on the v7 question card — variant 3, the glass lens (a static displacement lens + frost).
// Loads it at 390 and 1280, hides the text, screenshots the card, and takes the WORST WCAG ratio of the text colour against every background pixel inside
// the text-line boxes that cross the numeral (>= 4.5 required). Also checks the sheet covers the WHOLE card (inset 0, the card's radius: no inner rect edge),
// that it is ONE backdrop-filtered layer (phone-safe) using the static lens #qg-lens, that the numeral can still read as a number through it (lens blur in px,
// numeral paint alpha), that ?gv= is ignored (the variants are gone), and that flag off leaves no glass.
// Own serve.py, uploaded bank.   node tests/ghost-glass.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8853), BASE = `http://127.0.0.1:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "cluckraise-")), "tries.json");
const Q = "A 0.45 kg stone is thrown horizontally at 12 m/s from the edge of a 38 m cliff above a calm lake. Treat the air as still for the first part, then switch on a linear drag force of magnitude b v with b = 0.08 kg/s, and keep the lake surface as the zero of height. The stone leaves the hand 1.6 m above the cliff edge. How far from the base of the cliff does the stone land, and by how much does the drag shorten that range compared with the drag-free flight?";
const FILE = { v: 1, problems: [{ code: "PSY_G12", type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md: Q }] }] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
const browser = await launchBrowser(pw);
let fails = 0;
async function fresh(ui, vp, q, ua) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", deviceScaleFactor: +(process.env.DSF || 1), ...(ua ? { userAgent: ua } : {}) });
  if (ua) await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined, configurable: true }); } catch (e) {} });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" + (q || "") : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "gg.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_G12" && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
  await settled(page); await page.waitForTimeout(400);
  return { ctx, page };
}
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 400)); } }
const SHOTS = process.env.SHOTS_DIR;
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  await step("cluck raise @" + vp.width, async () => {
    const { ctx, page } = await fresh(true, vp);
    const i = await page.evaluate(() => {
      const b = document.querySelector("#problem.qc7 > button.cluckbtn"), c = document.getElementById("problem"), r = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
      return { shadow: getComputedStyle(b).boxShadow, disabled: b.getAttribute("aria-disabled"), r: [r.left, r.top, r.right, r.bottom], c: [cr.left, cr.top, cr.right, cr.bottom] };
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cluck-raise-${vp.width}${process.env.SHOT_TAG || ""}.png`, clip: { x: 0, y: 0, width: vp.width, height: 400 } });
    // 2px blur + 1px y offset: the shadow reaches 3px past the button box; it must stay inside the card (which clips with overflow hidden)
    assert.ok(i.r[0] - 3 >= i.c[0] && i.r[1] - 3 >= i.c[1] && i.r[2] + 3 <= i.c[2] && i.r[3] + 3 <= i.c[3], "button + shadow inside the card " + JSON.stringify(i));
    const sh = await page.evaluate(() => { const b = document.querySelector("#problem.qc7 > button.cluckbtn"); const was = b.getAttribute("aria-disabled");
      b.setAttribute("aria-disabled", "false"); const up = getComputedStyle(b).boxShadow; b.setAttribute("aria-disabled", "true"); const off = getComputedStyle(b).boxShadow;
      if (was === null) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", was); return { up, off }; });
    assert.notEqual(sh.up, "none", "ready: raised"); assert.equal(sh.off, "none", "locked: flat");
    await ctx.close();
  });
}
await step("flag off: no squircle", async () => {
  const { ctx, page } = await fresh(false, { width: 390, height: 844 });
  assert.equal(await page.evaluate(() => !document.querySelector("#problem.qc7 > button.cluckbtn")), true); await ctx.close();
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "cluck-raise smoke: all ok"); process.exit(fails ? 1 : 0);
