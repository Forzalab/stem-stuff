// MOCKUPS ONLY (not built): (e) two ways to lose the #more chevron button, (f) the bottom code bar as a short strip.
//   python3 serve.py 8815 &   then   node design/bar-mock.mjs http://localhost:8815
// Writes design/shots/bar-*.png at 390 (and 1920 where it applies). Injects CSS into the real page; nothing in app.* changes.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8815";
const OUT = new URL("./shots/", import.meta.url).pathname;
const SNAP = process.env.SNAP || "";      // a directory served by serve.py: also save each state's HTML there, for an Impeccable URL scan
const snap = async (page, n) => { if (SNAP) require("fs").writeFileSync(`${SNAP}/snap-${n}.html`, (await page.content()).replace("<head>", `<head><base href="${BASE}/">`)); };

/* e-A: a grab handle ON the strip's bottom edge. A short pill (36x4) centred on the card's edge; its tap/drag area is 44px tall,
   invisible, straddling the edge. Drag down (or tap) opens the whole problem, drag up folds it. No button chrome, no extra row. */
const E_A = `
#more { display: none !important; }
.freeze:has(.more) + .work { margin-top: var(--s1) !important; }
.freeze .freeze-in::after { content: none; }
.mock-grip { position: absolute; left: 50%; bottom: -22px; width: 88px; height: 44px; margin-left: -44px; z-index: 3;
  display: grid; place-items: center; background: none; border: 0; padding: 0; }
.mock-grip::before { content: ""; width: 36px; height: 4px; border-radius: 2px; background: var(--edge); }`;
/* e-B: the question card itself is the control. While it is clipped, its fade band holds a small chevron (in the text colour,
   not a button shape); a tap anywhere on the fade opens it, a tap on the same band folds it back. */
const E_B = `
#more { display: none !important; }
.freeze:has(.more) + .work { margin-top: var(--s1) !important; }
.mock-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 2.5rem; z-index: 3; display: grid; place-items: end center;
  padding-bottom: 2px; color: var(--muted); pointer-events: auto; }
.mock-fade svg { width: 20px; height: 20px; box-sizing: content-box; padding: 4px 10px 0; border-radius: 10px 10px 0 0; background: var(--sheet); }   /* a small knockout so it never sits on a letter */`;
/* f: phones. Collapsed = a 20px strip at the very bottom with a small up-chevron; tap or swipe up shows the full bar (as today).
   No problem open = the full bar, always (the code box is the only thing to do). */
const F = `
.mock-strip .dock { padding: 0 var(--gut) max(0px, env(safe-area-inset-bottom)); height: 20px; overflow: hidden; }
.mock-strip .dock > * { visibility: hidden; }
.mock-strip .dock::after { content: ""; position: absolute; left: 50%; top: 6px; width: 10px; height: 10px; margin-left: -5px;
  border-left: 2px solid var(--muted); border-top: 2px solid var(--muted); transform: translateY(2px) rotate(45deg); border-radius: 1px; }
.mock-strip main { padding-bottom: calc(20px + var(--s5)) !important; }`;
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [w, h] of [[390, 844], [1920, 1080]]) {
  const phone = w < 1000;
  const newPage = async () => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: "block" });
    const page = await ctx.newPage();
    /* a problem long enough to freeze and clip: PHYS_F3N plus a few paragraphs of setup */
    await page.route("**/p/PHYS_F3N.json", async r => { const res = await r.fetch(), j = await res.json(), p = j.problem || j;
      p.body = [...p.body.slice(0, -1), ...[1, 2].map(i => ({ type: "text", md: `Part ${i} of the setup: the ramp is fixed, the block starts from rest, and air drag is small enough to ignore over the distance travelled.` })), p.body.at(-1)];
      r.fulfill({ response: res, json: j }); });
    return page;
  };
  const openLong = async page => {
    await page.goto(BASE + "/#PHYS_F3N");
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_F3N" && !document.querySelector("#freeze").hidden);
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(600);        // scroll past the start: the strip freezes and clips
  };
  for (const [name, css, dom] of [["e-A-handle", E_A, "grip"], ["e-B-fade", E_B, "fade"]]) {
    const page = await newPage();
    await openLong(page);
    await page.addStyleTag({ content: css });
    await page.evaluate(([d, chev]) => {
      const f = document.querySelector("#freeze");
      if (d === "grip") { const g = document.createElement("button"); g.type = "button"; g.className = "mock-grip"; g.setAttribute("aria-label", "Show the whole problem"); f.append(g); }
      else { const x = document.createElement("div"); x.className = "mock-fade"; x.innerHTML = chev; f.querySelector(".freeze-in").after(x); x.style.bottom = (f.offsetHeight - f.querySelector(".freeze-in").offsetTop - f.querySelector(".freeze-in").offsetHeight) + "px"; }
    }, [dom, CHEV]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}bar-${name}-${w}.png` }); await snap(page, `${name}-${w}`);
    await page.context().close();
  }
  if (!phone) continue;                              // f is the phone bottom bar; desktop keeps the entry box at the top
  {
    const page = await newPage();
    await openLong(page);
    await page.addStyleTag({ content: F });
    await page.evaluate(() => document.documentElement.classList.add("mock-strip"));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}bar-f-collapsed-${w}.png` }); await snap(page, `f-collapsed-${w}`);
    await page.evaluate(() => document.documentElement.classList.remove("mock-strip"));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}bar-f-revealed-${w}.png` });
    await page.goto(BASE + "/"); await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}bar-f-no-question-${w}.png` });
    await page.context().close();
  }
}
await b.close();
