// Notes variants at 393x852 (Chromium, Playwright). Local serve.py only.
// usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node shoot.mjs http://localhost:8765 <outDir>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
export const SHOTS = [[1, "rest"], [1, "drag"], [1, "hidden"], [1, "open"], [2, "rest"], [2, "open"], [3, "rest"], [3, "open"], [4, "rest"], [5, "rest"], [5, "end"]];
/* the check every shot runs: the notes control and any open menu never overlap the question text, the figure or a choice */
export const CHECK = `(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).opacity!=='0'};
 const sc=document.getElementById('scroll').getBoundingClientRect();
 const content=[...document.querySelectorAll('.p .blocks p,.p .fig,.q .opt')].map(e=>e.getBoundingClientRect()).map(r=>({t:Math.max(r.top,sc.top),b:Math.min(r.bottom,sc.bottom),l:r.left,r:r.right})).filter(r=>r.b>r.t);
 const ctl=[...document.querySelectorAll('.lane1 .fab,.lane1 .xt,.grab,.menu1,.etab,.rail2,#nb3,.menu3,.bar4,.strip')].filter(vis).map(e=>[(e.id||String(e.className.baseVal??e.className)),e.getBoundingClientRect()]);
 const hits=[];for(const[n,a]of ctl)for(const c of content)if(a.left<c.r&&a.right>c.l&&a.top<c.b&&a.bottom>c.t)hits.push(n);
 return JSON.stringify({v:location.search,inner:[innerWidth,innerHeight],hits})})()`;
if (process.argv[1].endsWith("shoot.mjs") && process.argv[2] !== "--list") {
  const [BASE, OUT] = process.argv.slice(2);
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  try {
    for (const [v, s] of SHOTS) {
      const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/try/notes-variants.html?v=${v}&s=${s}&bare=1`);
      await p.waitForFunction(() => document.querySelector("#sprite symbol"), null, { timeout: 8000 });
      await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
      console.log(`v${v}-${s}`, await p.evaluate(CHECK));
      await p.screenshot({ path: `${OUT}/v${v}-${s}-chromium-393x852.png` });
      await ctx.close();
    }
  } finally { await b.close(); }
}
