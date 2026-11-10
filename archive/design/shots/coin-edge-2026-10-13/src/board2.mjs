// usage: node board2.mjs OUT.png SP : HUD coin board, Fluent (pre-#124) vs duck coin on main (no edge) vs duck coin + thin #A85E10 edge,
// live HUD crops, 24/48 px on dark / white / light (+ greyscale), a x6 pixel zoom at 1x, the shower + reel cases, and the 3:1 table
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [OUT, SP] = process.argv.slice(2);
const svg = p => "data:image/svg+xml;base64," + fs.readFileSync(p).toString("base64");
const png = p => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const I = `${SP}/wt-edge/rewards/icons`, T = JSON.parse(fs.readFileSync(`${SP}/audit/table.json`)), A = `${SP}/audit`;
const coins = [["Fluent (before #124)", svg(`${SP}/old/coin_fluent.svg`), svg(`${SP}/old/coin_fluent.svg`), "fluent"],
  ["duck coin, main now (no edge)", svg(`${SP}/old/duck24_noedge.svg`), svg(`${SP}/old/duck_noedge.svg`), "noedge"],
  ["duck coin + thin edge (new)", svg(`${I}/coin24_color.svg`), svg(`${I}/coin_color.svg`), "duck"]];
const bgs = [["dark #0a1322", "#0a1322", ""], ["HUD well #0d0903", "#0d0903", ""], ["white #fff (reel)", "#ffffff", ""], ["light #aedffe", "#aedffe", ""], ["grey, dark", "#0a1322", "filter:grayscale(1)"], ["grey, white", "#ffffff", "filter:grayscale(1)"]];
const idx = l => T.find(r => r.label.startsWith(l)).k;
const pair = (l, ver) => T.find(r => r.label.startsWith(l) && r.ver === ver);
let h = `<style>body{margin:0;padding:18px;width:1260px;font:13px/1.4 system-ui;background:#1c2433;color:#dfe6f0}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px;color:#ffd36b}
.row{display:flex;gap:12px}.col{flex:1}table{border-collapse:collapse;width:100%}td,th{padding:5px 8px;text-align:center}th{font-weight:600;color:#9fb0c8}td.l{text-align:left;color:#9fb0c8;width:130px}
.cell{display:flex;gap:14px;align-items:center;justify-content:center;border-radius:8px;padding:8px}.n{font-size:11px;color:#9fb0c8}.new{outline:2px solid #ffd36b;outline-offset:-2px;border-radius:8px}
.z img{image-rendering:pixelated;width:144px;height:144px;border-radius:6px}.t td{text-align:left;border-bottom:1px solid #2c3a55;font-size:12px}.t td.v{text-align:right;font-variant-numeric:tabular-nums}.ok{color:#5fd38d;font-weight:700}.na{color:#9fb0c8}</style>
<h1>HUD coin: one coin everywhere, with a thin edge (#124 follow-up)</h1><div class=n>Tony, Oct 12: "thin coin edge, HUD coin replace with ours, and 3:1". The edge is the coin's own dark amber #A85E10: a 2 px non-scaling stroke clipped to the disc = 1 CSS px inside the rim at every size. Nothing else in the art changed. Chromium; icon rows at 1x (24 px = 24 real pixels).</div>
<h2>In the live HUD (only the coin image differs)</h2><div class=row>${coins.map(([l, , , f], i) => `<div class="col${i == 2 ? " new" : ""}" style="padding:4px"><img src="${png(`${SP}/live2/hud-${f}.png`)}" style="width:100%;display:block;border-radius:6px"><div class=n style="text-align:center">${l}</div></div>`).join("")}</div>
<h2>24 / 48 px</h2><table><tr><th></th>${coins.map(c => `<th>${c[0]}</th>`).join("")}</tr>`;
for (const [l, bg, f] of bgs) h += `<tr><td class=l>${l}</td>${coins.map(([n, s24, s48], i) => `<td class="${i == 2 ? "new" : ""}"><div class=cell style="background:${bg};${f}"><img src="${s24}" width=24 height=24><img src="${s48}" width=48 height=48></div></td>`).join("")}</tr>`;
h += `</table><h2>The edge up close (24 px at 1x, x6) and the two light surfaces the coin really sits on (2x)</h2><div class=row style="align-items:flex-start">
<div class="col z" style="text-align:center"><img src="${png(`${A}/s${idx("light sky (n/a")}-old-1x.png`)}"> <img src="${png(`${A}/s${idx("light sky (n/a")}-new-1x.png`)}"><div class=n>light sky, no edge | edge</div></div>
<div class="col" style="text-align:center"><img src="${png(`${A}/s${idx("app slot reel")}-old-2x.png`)}" style="width:150px"> <img src="${png(`${A}/s${idx("app slot reel")}-new-2x.png`)}" style="width:150px"><div class=n>slot reel tile, 60 px: no edge ${pair("app slot reel", "old").best1}:1 | edge ${pair("app slot reel", "new").best1}:1</div></div>
<div class="col" style="text-align:center"><img src="${png(`${A}/s${idx("app coin shower 34px, legend burst: tangerine")}-new-2x.png`)}" style="width:120px"> <img src="${png(`${A}/s${idx("app coin shower 34px, legend burst: dark")}-new-2x.png`)}" style="width:120px"><div class=n>legend-burst coin shower (+1 px rgb(60 20 0) outline in .fx-rain): tangerine | dark tangerine</div></div></div>
<h2>3:1 table (best of disc mean or edge vs the background; worst of DPR 1 and 2)</h2><table class=t><tr><th style="text-align:left">surface</th><th>coin</th><th>bg</th><th>opacity</th><th>before</th><th>now</th></tr>`;
for (const r of T.filter(r => r.ver === "new")) { const o = T.find(x => x.k === r.k && x.ver === "old"), v = Math.min(r.best1, r.best2), vo = Math.min(o.best1, o.best2), na = r.label.includes("n/a");
  h += `<tr><td>${r.label}</td><td>${r.icon} ${r.sz}px</td><td>${r.bg}</td><td class=v>${r.op}</td><td class=v>${vo.toFixed(2)}</td><td class="v ${na ? "na" : "ok"}">${v.toFixed(2)}</td></tr>`; }
h += `</table><div class=n style="margin-top:6px">"before" = the art on main (no edge) with this commit's CSS; the dimmed try states were .45 / .25 before (2.97 / 1.75). n/a rows: surfaces the coin does not sit on today, measured anyway.</div>`;
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await br.newPage({ viewport: { width: 1296, height: 600 }, deviceScaleFactor: 1 });
await pg.setContent(h); await pg.waitForTimeout(500); await pg.screenshot({ path: OUT, fullPage: true }); await br.close(); console.log(OUT);
