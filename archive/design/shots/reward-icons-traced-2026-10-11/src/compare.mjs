// usage: node compare.mjs OUT.png OLDDIR NEWDIR SHOTDIR
// before (old Fluent) vs after (traced, recoloured) at 60 px on the reel tile (light), dark UI and the yellow drop banner, then the live before/after shots.
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const pw = require("/opt/node22/lib/node_modules/playwright");
const [OUT, OLD, NEW, SHOTS] = process.argv.slice(2);
const names = ["coin", "gem_stone", "star", "glowing_star", "cherries"];
const u = p => "data:image/svg+xml;base64," + fs.readFileSync(p).toString("base64");
const png = p => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const bgs = [["#f4f2ff", "reel tile"], ["#0a1322", "dark UI"], ["#FFE14A", "yellow drop banner"]];
let h = `<style>body{margin:0;padding:14px;font:13px system-ui;background:#1c2433;color:#dfe6f0;width:1240px}h1{font-size:16px;margin:0 0 8px}
table{border-collapse:collapse}td,th{padding:3px 6px;text-align:left}.b{padding:6px 14px;text-align:center}.s{display:flex;gap:10px;margin-top:6px}.s div{flex:1;text-align:center}
.s img{width:100%;border-radius:6px}</style><h1>Reward icons: before (old Fluent) vs after (traced, recoloured gift blue/gold), 60 px</h1><table><tr><th>icon</th>`;
for (const [, l] of bgs) h += `<th colspan="2">${l} (before | after)</th>`;
h += "</tr>";
for (const n of names) {
  h += `<tr><td>${n}</td>`;
  for (const [c] of bgs) h += [OLD, NEW].map(d => `<td class="b" style="background:${c}"><img src="${u(`${d}/${n}_color.svg`)}" width="60" height="60"></td>`).join("");
  h += "</tr>";
}
h += "</table><h1 style='margin-top:14px'>In the app (393 px phone, 2x): drop banner and rare reel, before | after</h1><div class='s'>";
for (const s of ["02-toast", "05-slots-rare", "05-slots-common", "01-hud"]) h += `<div>before<img src="${png(`${SHOTS}/before-${s}.png`)}"></div><div>after<img src="${png(`${SHOTS}/after-${s}.png`)}"></div>`;
h += "</div>";
const br = await pw.chromium.launch();
const pg = await br.newPage({ viewport: { width: 1268, height: 400 }, deviceScaleFactor: 1.5 });
await pg.setContent(h); await pg.waitForTimeout(400);
await pg.screenshot({ path: OUT, fullPage: true });
await br.close(); console.log(OUT);
