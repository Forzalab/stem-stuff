// Mockup shots for the scratchpad autosave status (not built yet). Needs a running server and Playwright:
//   python3 serve.py 8814 &   then   node design/autosave-mock.mjs http://localhost:8814
// Injects the proposed status next to the Scratchpad label and freezes each state: idle, saving (mid-sweep), saved.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8814";
const OUT = new URL("./shots/", import.meta.url).pathname;

/* proposed CSS: small, muted; "saving" gets a soft light band sweeping through the letters (a moving alpha mask on solid text, not gradient text) (1.4 s loop);
   reduced motion: no sweep, static muted text */
const CSS = `
.xb-save { margin-left: var(--s1); font-size: 0.875rem; font-weight: 400; color: var(--hint); }
.xb-save.saving {
  color: var(--ink);
  -webkit-mask: linear-gradient(90deg, rgb(0 0 0 / 0.55) 40%, #000 50%, rgb(0 0 0 / 0.55) 60%) 0 0 / 300% 100%;
  mask: linear-gradient(90deg, rgb(0 0 0 / 0.55) 40%, #000 50%, rgb(0 0 0 / 0.55) 60%) 0 0 / 300% 100%;
  animation: xb-sweep 1.4s linear infinite;
}
@keyframes xb-sweep { from { -webkit-mask-position: 100% 0; mask-position: 100% 0; } to { -webkit-mask-position: 0 0; mask-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .xb-save.saving { animation: none; -webkit-mask: none; mask: none; color: var(--hint); } }
.xb-save.mid { animation-play-state: paused; animation-delay: -0.6s; }`;

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [w, h] of [[390, 844], [1920, 1080]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.goto(BASE + "/#CALC1_X2P");
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_X2P");
  await page.addStyleTag({ content: CSS });
  await page.fill("#scratch", "x + 2 = 11\nx = 11 - 2\nx = 9");
  await page.evaluate(() => { const l = document.querySelector(".xb-label"); const s = document.createElement("span"); s.className = "xb-save"; s.setAttribute("role", "status"); l.append(s); });
  await page.$eval("#scratch", e => e.blur());
  await page.evaluate(() => { const x = document.querySelector("#xb"); window.scrollTo(0, x.getBoundingClientRect().top + scrollY - innerHeight / 2); });
  const clip = await page.evaluate(() => { const r = document.querySelector("#xb").getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 24), width: innerWidth, height: Math.min(innerHeight - Math.max(0, r.top - 24), r.height + 48) }; });
  for (const [state, cls, text] of [["idle", "", ""], ["saving", "saving mid", "saving"], ["saved", "", "saved"]]) {
    await page.$eval(".xb-save", (s, a) => { s.className = "xb-save " + a[0]; s.textContent = a[1]; }, [cls, text]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}autosave-${state}-${w}.png`, clip });
  }
  await page.close();
}
await b.close();
