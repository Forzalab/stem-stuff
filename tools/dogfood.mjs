// Dogfood run: use the page like a student and screenshot every state (at 390x844 and 1920x1080).
//   python3 serve.py 8812 &   node tools/dogfood.mjs http://localhost:8812 design/shots
import { createRequire } from "node:module";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const [BASE = "http://localhost:8812", OUT = "design/shots"] = process.argv.slice(2);

// a problem file on "disk" for the upload flow (a real problem under a code the server doesn't have)
const dir = mkdtempSync(join(tmpdir(), "dog-"));
const prob = JSON.parse(readFileSync(new URL("../p/PHYS_F3N.json", import.meta.url)));
prob.code = "PHYS_Q7W";
const file = join(dir, "PHYS_Q7W.json");
writeFileSync(file, JSON.stringify(prob));

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [w, h] of [[390, 844], [1920, 1080]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  const shot = async (name, full = true) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/dog-${name}-${w}.png`, fullPage: full }); };
  const open = async code => {
    await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.fill("#code", code.toLowerCase()); await page.click("#codeGo");
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code);
  };

  await page.goto(`${BASE}/`, { waitUntil: "load" }); await shot("empty", false);
  await page.fill("#code", "nope"); await page.press("#code", "Enter"); await shot("bad-code", false);

  await open("CALC1_X2P"); await shot("mc-loaded");
  await page.click('.opt[data-id="a"]'); await page.click('.ch[data-id="a"] .send');
  await page.waitForSelector(".cluck"); await shot("mc-wrong");
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForSelector(".opt.right"); await shot("mc-right");

  await open("CALC1_T6B");
  await page.fill("#ans", "4"); await page.press("#ans", "Enter"); await page.waitForSelector(".cluck");
  await page.fill("#ans", "12"); await page.press("#ans", "Enter"); await page.waitForSelector(".verdict.ok");
  await page.click("#scratch");
  await page.keyboard.type(["plug in 2: 0/0, so simplify first", "x^3 - 8 = (x - 2)(x^2 + 2x + 4)", "cancel x - 2",
    "limit = 4 + 4 + 4 = 12", "matches the table: 11.94 and 12.06 close in on 12", "first try 4: dropped the 2x term"].join("\n"));
  await page.click("#copy"); await shot("freeform-done");
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  console.log(w, "copy payload tries:", JSON.parse(clip).tries.map(t => t.a + ":" + t.v).join(" "));

  await open("PHYS_S2K"); await shot("scene-loaded");
  await page.evaluate(() => scrollTo(0, 1e5)); await shot("scene-scrolled", false);

  await page.goto("about:blank"); await page.goto(`${BASE}/`, { waitUntil: "load" });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await chooser.setFiles(file);
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_Q7W");
  await shot("file-loaded");

  if (w < 700) {   // keyboard-ish: layout viewport shrinks while typing in the scratchpad (Chromium resizes-content)
    await open("PHYS_S2K");
    await page.click("#scratch"); await page.keyboard.type("resolve mg along the slope");
    await page.setViewportSize({ width: w, height: 470 }); await page.waitForTimeout(300);
    await shot("keyboard-scratch", false);
    await page.setViewportSize({ width: w, height: h });
    await page.click("#code");
    await page.setViewportSize({ width: w, height: 470 }); await page.waitForTimeout(300);
    await shot("keyboard-code", false);
    await page.setViewportSize({ width: w, height: h });
  }
  if (errs.length) console.log("page errors", errs);
  await ctx.close();
}
await b.close();
