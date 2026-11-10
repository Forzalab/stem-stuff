// usage: node live.mjs OUTDIR PREFIX   (before|after) -> live shots at 393x852 of HUD, slots per tier, toast, coinFly
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const pw = require("/opt/node22/lib/node_modules/playwright");
const [OUT, PRE] = process.argv.slice(2), B = "http://127.0.0.1:8891";
fs.mkdirSync(OUT, { recursive: true });
const br = await pw.chromium.launch();
const ctx = await br.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage(); await pg.route(/youtube|ytimg|googlevideo/, r => r.abort());
const W = ms => pg.waitForTimeout(ms);
const shot = n => pg.screenshot({ path: `${OUT}/${PRE}-${n}.png` });
await pg.goto(`${B}/#BANK_RVW`); await W(2000);
await pg.goto(`${B}/#PHYS_RVC`); await W(1800);
await pg.evaluate(() => document.querySelectorAll(".ob-tip, .ob, [class*='ob-']").forEach(e => e.remove())).catch(() => {});
await shot("00-question");
await pg.fill("#ans", "2.02"); await pg.click("#ansGo"); await W(1050); await shot("00b-natural-reward");
await W(3000); await pg.keyboard.press("Escape"); await W(2600);
const icons = await pg.evaluate(() => Object.keys(window.RW_ICONS || {}).map(k => k + ":" + window.RW_ICONS[k].length).join(" "));
console.log("RW_ICONS", icons);
await shot("01-hud");
// toast (drop banner)
await pg.evaluate(() => void FX.toast('RARE DROP', 'Gem stone · +12 XP')); await W(450); await shot("02-toast"); await W(3500);
// coinFly mid-air
await pg.evaluate(() => void FX.coinFly(document.querySelector('#ans') || document.body, document.getElementById('rwCoin'), 6)); await W(260); await shot("03-coinfly");
await W(1500);
// slots mid-spin (fillers visible)
await pg.evaluate(() => void FX.slots('rare')); await W(280); await shot("04-slots-spinning"); await pg.keyboard.press("Escape"); await W(2600);
// slots landed per tier (reduced motion lands at once)
await pg.emulateMedia({ reducedMotion: "reduce" });
for (const t of ["common", "rare", "legend"]) {
  await pg.evaluate(t => void FX.slots(t), t); await W(400); await shot("05-slots-" + t); await pg.keyboard.press("Escape"); await W(2600);
}
await br.close(); console.log("done", OUT, PRE);
