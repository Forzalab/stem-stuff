// usage: node render.mjs OUTDIR ICONDIR OLDDIR : each icon at 24 and 48 CSS px (1x), transparent bg, one PNG each
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [OUT, NEW, OLD] = process.argv.slice(2);
const set = { duck: `${NEW}/coin_color.svg`, duck24: `${NEW}/coin24_color.svg`, traced: `${OLD}/coin_color.svg`, fluent: `${OLD}/coin_fluent.svg`,
  star: `${NEW}/star_color.svg`, gem: `${NEW}/gem_stone_color.svg`, fire: `${NEW}/fire_color.svg`, glow: `${NEW}/glowing_star_color.svg`, cherries: `${NEW}/cherries_color.svg` };
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await br.newPage({ deviceScaleFactor: 1 });
for (const [k, p] of Object.entries(set)) for (const s of [24, 48, 60]) {
  const u = "data:image/svg+xml;base64," + fs.readFileSync(p).toString("base64");
  await pg.setContent(`<body style="margin:0;background:transparent"><img id=i src="${u}" width=${s} height=${s} style="display:block">`);
  await pg.waitForTimeout(60);
  await pg.locator("#i").screenshot({ path: `${OUT}/${k}-${s}.png`, omitBackground: true });
}
await br.close(); console.log("ok");
