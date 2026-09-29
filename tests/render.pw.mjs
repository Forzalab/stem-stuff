// Dogfood test for the drill page (index.html). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/render.pw.mjs http://localhost:8812 [shotDir]
// Fails if any problem shows raw TeX, if no .katex renders, or if the MC / freeform / sticky / copy flows break.
// Not part of `npm test` (that one needs no server or browser).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const CODES = ["CALC1-T6B", "CALC1-A9R", "PHYS-F3N", "PHYS-S2K", "CALC1-X2P"];   // X2P = the MC example (schema/examples)
const RAW = [/\\vec\b/, /\^\\circ/, /\\frac/, /\\text\b/, /\\dfrac/, /\$/, /\\lim/, /\\mu/];
const VIEWS = { phone: { width: 390, height: 844 }, ipad: { width: 1024, height: 1366 }, desktop: { width: 1920, height: 1080 } };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 400)); }
}

async function run(browserType, label, opts = {}) {
  let browser;
  try { browser = await browserType.launch(opts); }
  catch (e) { console.log(`skip ${label}: ${e.message.split("\n")[0]}`); return; }
  for (const [vname, viewport] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: vname !== "desktop", isMobile: vname === "phone" && label === "chromium" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    // expected 404s: schema/examples/<CODE>.key.json (dev grading stub probes for a key) and p/CALC1-X2P.json
    // (the MC example lives only in schema/examples until the k/ split)
    page.on("response", r => { if (r.status() >= 400 && !/schema\/examples\/|p\/CALC1-X2P\.json|offline\.js/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
    page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
    // fresh document per problem, so dev grading state and hash navigation never leak between steps
    const open = async code => {
      await page.goto("about:blank");
      await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code, { timeout: 8000 });
    };

    for (const code of CODES) {
      await step(`${label} ${vname} ${code}: renders TeX, no raw TeX visible`, async () => {
        await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
        await page.waitForSelector("#blocks > *", { timeout: 8000 });
        await page.waitForTimeout(300);
        const n = await page.locator("#freeze .katex").count();
        assert.ok(n > 0, `no .katex in ${code}`);
        // visible text only: KaTeX's MathML copy (.katex-mathml) is screen-reader-only and holds the TeX source on purpose
        const text = await page.evaluate(() => {
          const c = document.querySelector("#freeze").cloneNode(true);
          c.querySelectorAll(".katex-mathml, .sr-only").forEach(e => e.remove());
          return c.textContent;
        });
        for (const re of RAW) assert.ok(!re.test(text), `raw TeX ${re} visible in ${code}: …${(text.match(new RegExp(".{0,30}" + re.source + ".{0,30}")) || [""])[0]}…`);
        if (SHOTS && vname !== "ipad") await page.screenshot({ path: `${SHOTS}/app-${code}-${vname === "phone" ? 390 : 1920}.png`, fullPage: true });
      });
    }

    await step(`${label} ${vname} MC: select shows arrow, reselect hides it, wrong strikes`, async () => {
      await open(`CALC1-X2P`);
      await page.waitForSelector(".opt");
      const a = page.locator('.opt[data-id="a"]'), sendA = page.locator('.ch[data-id="a"] .send');
      assert.equal(await page.locator(".ch .send:visible").count(), 0);
      await a.click();
      assert.equal(await a.getAttribute("aria-checked"), "true");
      assert.ok(await sendA.isVisible(), "arrow not visible on selected choice");
      const box = await sendA.boundingBox(), obox = await a.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, "arrow under 44px");
      assert.ok(box.x + box.width <= obox.x + obox.width + 0.5 && box.x > obox.x + obox.width / 2, "arrow not flush inside the choice");
      await a.click();
      assert.equal(await a.getAttribute("aria-checked"), "false");
      assert.equal(await sendA.isVisible(), false);
      await a.click(); await sendA.click();
      await page.waitForSelector(".opt.wrong");
      assert.ok(await page.locator(".cluck").isVisible(), "no Cluck hint");
      // keyboard: arrow keys move + select, Enter submits
      await page.locator('.opt[data-id="b"]').focus();
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
      assert.equal(await page.locator('.opt[data-id="b"]').getAttribute("aria-checked"), "true");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".opt.right");
      if (SHOTS && vname === "phone") await page.screenshot({ path: `${SHOTS}/app-mc-graded-390.png`, fullPage: true });
    });

    await step(`${label} ${vname} freeform: arrow inside input, wrong then right`, async () => {
      await open(`CALC1-T6B`);
      const inp = page.locator("#ans"), go = page.locator("#ansGo");
      assert.equal(await go.isVisible(), false);
      await inp.fill("4");
      assert.ok(await go.isVisible());
      const g = await go.boundingBox(), f = await page.locator("#ff").boundingBox();
      assert.ok(g.x + g.width <= f.x + f.width && g.y >= f.y && g.y + g.height <= f.y + f.height + 0.5, "arrow not inside the field");
      await go.click();
      await page.waitForSelector(".cluck");
      await inp.fill("12"); await inp.press("Enter");
      await page.waitForSelector(".verdict.ok");
    });

    await step(`${label} ${vname} freeze: problem + question stay on top while scratchpad scrolls`, async () => {
      await open(`PHYS-S2K`);
      await page.waitForSelector(".fig svg");
      const ta = page.locator("#xb textarea");
      await ta.click();
      await ta.fill(Array.from({ length: 60 }, (_, i) => `line ${i + 1}: resolve mg along the slope, then balance with kx.`).join("\n"));
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const f = document.querySelector("#freeze").getBoundingClientRect();
        const q = document.querySelector("#q").getBoundingClientRect();
        return { top: f.top, bottom: f.bottom, stuck: document.querySelector("#freeze").classList.contains("stuck"), qTop: q.top, vh: innerHeight };
      });
      assert.ok(Math.abs(r.top) < 1.5, `freeze top ${r.top}`);
      assert.ok(r.stuck, "not marked stuck");
      assert.ok(r.bottom < r.vh * 0.75, `frozen layer too tall: ${r.bottom}/${r.vh}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-freeze-${viewport.width}.png` });
    });

    await step(`${label} ${vname} line length: scratchpad <= ~70ch`, async () => {
      const w = await page.evaluate(() => { const t = document.querySelector("#xb textarea"); const cs = getComputedStyle(t); const c = document.createElement("span"); c.style.font = cs.font; c.textContent = "0".repeat(70); document.body.append(c); const r = c.offsetWidth; c.remove(); return { box: t.clientWidth, ch70: r }; });
      assert.ok(w.box <= w.ch70 + 40, `textarea ${w.box}px vs 70ch ${w.ch70}px`);
    });

    if (label === "chromium" && vname === "desktop") {
      await step(`${label} copy payload`, async () => {
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
        await open(`CALC1-A9R`);
        await page.locator("#ans").fill("9/2"); await page.locator("#ans").press("Enter");
        await page.locator("#xb textarea").fill("area between: integrate (4x-x^2) - x from 0 to 3");
        await page.locator("#copy").click();
        const txt = await page.evaluate(() => navigator.clipboard.readText());
        const p = JSON.parse(txt);
        assert.equal(p.v, 1); assert.equal(p.code, "CALC1-A9R"); assert.equal(p.tries.length, 1);
        assert.equal(p.tries[0].v, "pending"); assert.ok(p.explain.startsWith("area between"));
      });
    }
    await step(`${label} ${vname} no page errors`, async () => { assert.deepEqual(errors, [], errors.join(" | ")); });
    await ctx.close();
  }
  await browser.close();
}

await run(pw.chromium, "chromium", { args: ["--no-sandbox"] });
await run(pw.webkit, "webkit");
await run(pw.firefox, "firefox");
console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
