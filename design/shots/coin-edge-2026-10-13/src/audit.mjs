// usage: node audit.mjs ICONDIR OLDDIR OUTDIR : every real coin surface rebuilt 1:1 (size, background, opacity, filter), at DPR 1 and 2, plus the
// coin alone on transparent (for the disc mask). audit.py turns the PNGs into the 3:1 table.
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [I, OLD, OUT] = process.argv.slice(2);
const C = "rgb(60 20 0)", RAIN = `drop-shadow(1px 0 0 ${C}) drop-shadow(-1px 0 0 ${C}) drop-shadow(0 1px 0 ${C}) drop-shadow(0 -1px 0 ${C}) drop-shadow(0 3px 3px rgb(60 20 0 / .7))`, FLY = "drop-shadow(0 2px 2px rgb(0 0 0 / .45))";
const S = JSON.parse(process.env.AUDIT_ROWS || "null") || [
  ["app HUD balance (and try/tries.html HUD)", "coin24", 28, "#0d0903", 1, ""],
  ["app coinFly over the page", "coin24", 22, "#08111f", 1, FLY],
  ["app slot reel tile, common tier", "coin", 60, "#ffffff", 1, ""],
  ["app coin shower 18px, legend burst: cream centre", "coin24", 18, "#fff3a6", 1, RAIN],
  ["app coin shower 34px, legend burst: cream centre", "coin24", 34, "#fff3a6", 1, RAIN],
  ["app coin shower 18px, legend burst: tangerine", "coin24", 18, "#ff9a3c", 1, RAIN],
  ["app coin shower 34px, legend burst: tangerine", "coin24", 34, "#ff9a3c", 1, RAIN],
  ["app coin shower 18px, legend burst: dark tangerine rim", "coin24", 18, "#c25e0f", 1, RAIN],
  ["app coin shower 34px, legend burst: dark tangerine rim", "coin24", 34, "#c25e0f", 1, RAIN],
  ["toast banner (n/a: the banner shows the glowing star)", "coin24", 32, "#ffe14d", 1, ""],
  ["light sky (n/a: the app has no light theme)", "coin24", 24, "#aedffe", 1, ""],
  ["light sky 48 (n/a)", "coin", 48, "#aedffe", 1, ""],
  ["try genui-ui / genui-redeem HUD", "coin24", 20, "#08111f", 1, ""],
  ["try redeem v3 coin by Check", "coin24", 32, "#0f1d30", 1, ""],
  ["try redeem v3 wrong, dimmed", "coin24", 32, "#0f1d30", .5, ""],
  ["try genui-ui v2 bet pile, on", "coin24", 20, "#16243a", 1, ""],
  ["try genui-ui v2 bet pile, lost", "coin24", 20, "#16243a", .6, ""],
  ["try genui-ui v2 bet pile, not bet (dimmed)", "coin24", 20, "#16243a", .5, ""],
];
const file = { coin: `${I}/coin_color.svg`, coin24: `${I}/coin24_color.svg`, old: `${OLD}/duck_noedge.svg`, old24: `${OLD}/duck24_noedge.svg` };
const u = k => "data:image/svg+xml;base64," + fs.readFileSync(file[k]).toString("base64");
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const meta = [];
for (const dpr of [1, 2]) {
  const pg = await br.newPage({ deviceScaleFactor: dpr, viewport: { width: 200, height: 200 } });
  for (const [k, [label, ic, sz, bg, op, flt]] of S.entries()) for (const ver of ["new", "old"]) {
    const icon = ver === "new" ? ic : (ic === "coin" ? "old" : "old24");
    const pad = 12;
    await pg.setContent(`<body style="margin:0;background:${bg}"><div id=b style="display:inline-block;padding:${pad}px;background:${bg}"><img id=i src="${u(icon)}" width=${sz} height=${sz} style="display:block;opacity:${op};${flt ? `filter:${flt}` : ""}"></div>`);
    await pg.waitForTimeout(40);
    await pg.locator("#b").screenshot({ path: `${OUT}/s${k}-${ver}-${dpr}x.png` });
    await pg.setContent(`<body style="margin:0;background:transparent"><div id=b style="display:inline-block;padding:${pad}px"><img src="${u(icon)}" width=${sz} height=${sz} style="display:block"></div>`);
    await pg.waitForTimeout(40);
    await pg.locator("#b").screenshot({ path: `${OUT}/m${k}-${ver}-${dpr}x.png`, omitBackground: true });
    if (dpr === 1) meta.push({ k, ver, label, icon, sz, bg, op, flt, pad });
  }
  await pg.close();
}
await br.close(); fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1)); console.log("ok", meta.length);
