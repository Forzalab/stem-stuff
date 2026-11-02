// Todo 114b (Tony Oct 28 img2: "is the inputbox correct or wrong? ... 2 rows cluck and the answer, could be merged into one row. a major box for
// answer and ask cluck"; vet Oct 30: ONE box, NO nested box, label "Correct!"; Oct 29: "ask cluck button should be right near (left of) the next button").
// The reveal row of a closed sugar question with Cluck's key (num type), right / wrong-then-out, at 390x844 and 1280x800:
//   - one major box (.rbox) holds the answer field AND Ask Cluck AND Next; no bordered box inside it (the chip and the Next face are controls)
//   - right: the label "Correct!"; out of tries: "Not quite" in the same box
//   - Ask Cluck (or See Cluck's steps) sits LEFT of Next, gap = --s2; at 390 stacked directly above Next (gap --s2) when there is no room
//   - both 44px+ tap areas, not overlapping
// usage: python3 serve.py 8812 &   then   node tests/reveal-row.pw.mjs http://localhost:8812 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const P = [{ code: "PHYS_RRN", title: "Practice, Question 1", type: "num", how: "Number, in s", wish: true, body: [{ type: "text", md: "A ball drops from 45 m, from rest. How long until it lands?" }] }];
const BANK = "BANK_RR114";
async function pageFor(browser, W, H) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  let tries = 0;
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "PHYS_RRN" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Fall time\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON();
    if (b.answer === "RIGHT") return r.fulfill({ json: { verdict: "correct" } });
    tries++;
    return r.fulfill({ json: { verdict: "wrong", triesLeft: Math.max(0, 2 - tries), ...(tries >= 2 ? { correct: "3.03" } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_RRN", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
async function drive(page, outcome) {
  const go = async v => { await page.fill("#ans", v); await page.evaluate(() => document.querySelector("#ansGo").click()); };
  if (outcome === "right") await go("RIGHT");
  else { await go("1"); await page.waitForSelector("#ff.bad"); await page.waitForTimeout(900); await go("2"); }
  await page.waitForSelector("#q .nx", { timeout: 5000 });
  await page.waitForSelector("#wish:not([hidden]) .cue-chip, .rbox .cue-chip", { timeout: 5000 });
  await page.waitForTimeout(1500);
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [W, H] of [[390, 844], [1280, 800]]) for (const outcome of ["right", "out"]) {
  const T = `${W}x${H} ${outcome}`;
  const page = await pageFor(browser, W, H);
  await drive(page, outcome);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${process.env.SHOT_TAG || "after"}-${outcome}-${W}.png` });
  await step(`${T}: one box (no nested bordered box), the state label, Ask Cluck left of Next, token gap, 44px taps`, async () => {
    const g = await page.evaluate(() => {
      const R = e => e && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(e.getBoundingClientRect());
      const nx = document.querySelector("#q .nx"), chip = document.querySelector(".cue-chip");
      const box = document.querySelector(".rbox");
      const bordered = box ? [...box.querySelectorAll("*")].filter(e => !e.matches(".cue-chip, .cue-chip *, .nx, .nx *, svg, svg *") && e.getClientRects().length
        && ["Top", "Left"].some(s => parseFloat(getComputedStyle(e)["border" + s + "Width"]) > 0 && getComputedStyle(e)["border" + s + "Style"] !== "none")).map(e => e.tagName + "." + e.className) : ["no .rbox"];
      const s2 = (() => { const d = document.createElement("i"); d.style.cssText = "display:block;width:var(--s2)"; document.body.append(d); const w = d.getBoundingClientRect().width; d.remove(); return w; })();
      return { has: !!box, chipIn: !!box && box.contains(chip) && box.contains(nx), nx: R(nx), chip: R(chip), bordered, s2, label: (box?.querySelector(".rlabel")?.textContent || "").trim() };
    });
    assert.ok(g.has, "no .rbox: the answer and Ask Cluck are not one box");
    assert.deepEqual(g.bordered, [], "a bordered box inside the answer box: " + g.bordered);
    assert.ok(g.chipIn, "Ask Cluck and Next are not both inside the one major box");
    assert.equal(g.label, outcome === "right" ? "Correct!" : "Not quite", "state label");
    assert.ok(g.chip.height >= 44 && g.nx.height >= 44, `taps ${g.chip.height} / ${g.nx.height}`);
    const sameRow = Math.abs((g.chip.top + g.chip.bottom) / 2 - (g.nx.top + g.nx.bottom) / 2) <= 4;
    if (sameRow) {
      assert.ok(Math.abs(g.chip.height - g.nx.height) <= 1, `heights ${g.chip.height} vs ${g.nx.height}`);
      assert.ok(g.chip.right <= g.nx.left + 0.5, "chip not left of Next");
      assert.ok(Math.abs(g.nx.left - g.chip.right - g.s2) <= 1.5, `gap ${g.nx.left - g.chip.right} vs --s2 ${g.s2}`);
    } else {
      assert.ok(W < 600, "stacked only at phone width");
      assert.ok(g.chip.bottom <= g.nx.top + 0.5 && g.nx.top - g.chip.bottom <= g.s2 + 1.5, `stack gap ${g.nx.top - g.chip.bottom} (s2 ${g.s2})`);
    }
  });
  await page.ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
