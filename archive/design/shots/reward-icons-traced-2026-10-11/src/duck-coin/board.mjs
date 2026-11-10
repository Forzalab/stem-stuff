// usage: node board.mjs OUT.png SP : HUD coin board, old (Fluent on main, traced on #124) vs new (duck coin), with the check numbers
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [OUT, SP] = process.argv.slice(2);
const svg = p => "data:image/svg+xml;base64," + fs.readFileSync(p).toString("base64");
const png = p => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const C = JSON.parse(fs.readFileSync(`${SP}/checks/checks.json`));
const I = `${SP}/wt124/rewards/icons`;
const coins = [["Fluent (main)", svg(`${SP}/old/coin_fluent.svg`), svg(`${SP}/old/coin_fluent.svg`), "fluent"], ["traced (#124 before)", svg(`${SP}/old/coin_color.svg`), svg(`${SP}/old/coin_color.svg`), "traced"],
  ["duck coin (new)", svg(`${I}/coin24_color.svg`), svg(`${I}/coin_color.svg`), "duck"]];
const bgs = [["dark #0a1322", "#0a1322", ""], ["light #aedffe", "#aedffe", ""], ["reel #fff", "#ffffff", ""], ["grey, dark", "#0a1322", "filter:grayscale(1)"], ["grey, light", "#aedffe", "filter:grayscale(1)"]];
const hud = f => `<div class=hud style="background-image:url(${png(f)})"></div>`;
let h = `<style>body{margin:0;padding:18px;width:1260px;font:13px/1.4 system-ui;background:#1c2433;color:#dfe6f0}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px;color:#ffd36b}
.row{display:flex;gap:12px}.col{flex:1}.hud{height:76px;background-size:786px auto;background-position:0 -144px;border-radius:8px}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;text-align:center}th{font-weight:600;color:#9fb0c8}td.l{text-align:left;color:#9fb0c8;width:110px}
.cell{display:flex;gap:14px;align-items:center;justify-content:center;border-radius:8px;padding:8px}.n{font-size:11px;color:#9fb0c8}.new{outline:2px solid #ffd36b;outline-offset:-2px;border-radius:8px}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.notes div{background:#243047;border-radius:8px;padding:10px}b.ok{color:#5fd38d}b.no{color:#ff8a7a}</style>
<h1>HUD / reward coin: old vs new (T24 duck coin on PR #124)</h1><div class=n>Live crops: Chromium 393x852 DPR 2. Icon rows: Chromium 1x, so 24 px = 24 real pixels. HUD uses coin24 (the 24 px cut) at 28 px; coinFly 22 px and the shower use coin24; the common slot tier (60 px) uses the full coin.</div>
<h2>In the HUD (balance window, live #rwHud, the same page; only the coin image differs)</h2><div class=row>${[["Fluent (main)", "fluent"], ["traced (#124 before)", "traced"], ["duck coin, coin24 (new)", "duck"]].map(([l, f], i) => `<div class="col${i == 2 ? " new" : ""}" style="padding:4px"><img src="${png(`${SP}/live/hud-${f}.png`)}" style="width:100%;display:block;border-radius:6px"><div class=n style="text-align:center">${l}</div></div>`).join("")}</div>
<h2>At 24 / 48 px</h2><table><tr><th></th>${coins.map(c => `<th>${c[0]}</th>`).join("")}</tr>`;
for (const [l, bg, f] of bgs) h += `<tr><td class=l>${l}</td>${coins.map(([n, s24, s48], i) => `<td class="${i == 2 ? "new" : ""}"><div class=cell style="background:${bg};${f}"><img src="${s24}" width=24 height=24><img src="${s48}" width=48 height=48></div></td>`).join("")}</tr>`;
h += `</table><h2>Slot reel (common tier, 60 px) and coin fly</h2><div class=row>${[`${SP}/old/traced-05-slots-common.png`, `${SP}/live/after-05-slots-common.png`, `${SP}/old/fluent-03-coinfly.png`, `${SP}/live/after-03-coinfly.png`].map((f, i) =>
  `<div class="col${i % 2 ? " new" : ""}"><div class=hud style="height:${i < 2 ? 130 : 200}px;background-image:url(${png(f)});background-size:560px auto;background-position:${i < 2 ? "-10px -470px" : "0 -40px"}"></div><div class=n style="text-align:center">${["reel: traced", "reel: duck", "fly: Fluent (main; the #124 before-shot had no HUD)", "fly: duck (coin24)"][i]}</div></div>`).join("")}</div>`;
const g = k => C[k].mean_luma, ct = (k, b) => C[k].contrast[b].best;
h += `<h2>Checks (Rec.601 luma over the disc; WCAG contrast = best of disc mean / darker outer edge vs the background)</h2><div class=notes>
<div><b>Readable at 24/48</b>: face feature ΔL (eyes/beak vs face) duck24@24 <b class=ok>${C["duck24@24"].feature_dL}</b>, duck@48 <b class=ok>${C["duck@48"].feature_dL}</b>; traced ${C["traced@24"].feature_dL}, Fluent ${C["fluent@24"].feature_dL}. Same on dark and light (the features sit inside the disc).<br>
<b>Greyscale brightest disc</b>: @48 duck ${g("duck@48")} &gt; traced ${g("traced@48")} &gt; Fluent ${g("fluent@48")}; @24 duck24 ${g("duck24@24")} vs traced ${g("traced@24")} (<b class=no>-1.5</b>), Fluent ${g("fluent@24")}. Other HUD icons: star ${g("star@24")} (not a disc), fire ${g("fire@24")}.</div>
<div><b>Contrast ≥3:1</b>: HUD well #0d0903 duck24 <b class=ok>${ct("duck24@24", "HUD well #0d0903")}</b>; dark #0a1322 <b class=ok>${ct("duck24@24", "dark #0a1322")}</b>; reel #fff duck@60 <b class=no>${ct("duck@60", "reel #ffffff")}</b> (traced was ${ct("traced@60", "reel #ffffff")}, Fluent ${ct("fluent@60", "reel #ffffff")}); light sky duck <b class=no>${ct("duck@48", "light #aedffe")}</b> (no app surface uses it).<br>
<b>Animation</b>: no new animation; 0 <code>infinite</code> added (diff).</div></div>`;
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await br.newPage({ viewport: { width: 1296, height: 600 }, deviceScaleFactor: 1 });
await pg.setContent(h); await pg.waitForTimeout(500);
await pg.screenshot({ path: OUT, fullPage: true }); await br.close(); console.log(OUT);
