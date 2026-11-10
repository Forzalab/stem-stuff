// usage: node surfaces.mjs PORT OUT.json : every live coin on the app + try pages: size, effective opacity, filter, the background right beside it
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [PORT, OUT] = process.argv.slice(2), B = `http://127.0.0.1:${PORT}`;
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await br.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch {} });
const pg = await ctx.newPage(); await pg.route(/youtube|ytimg|googlevideo/, r => r.abort());
const rows = [];
async function grab(page, sel, label) {
  const els = await pg.evaluate(sel => [...document.querySelectorAll(sel)].map((e, i) => { const r = e.getBoundingClientRect(); let o = 1, f = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); o *= +cs.opacity; if (cs.filter !== "none") f.push(cs.filter); }
    let bg = null; for (let n = e.parentElement; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; } }
    return { bg: bg || getComputedStyle(document.documentElement).backgroundColor, i, x: r.left, y: r.top, w: r.width, h: r.height, o: +o.toFixed(3), filter: f.join(" | ") }; }).filter(r => r.w > 0), sel);
  const buf = await pg.screenshot();
  fs.writeFileSync("/tmp/claude-0/-home-user-stem-stuff/74a2e03c-ebe3-58df-8a78-63290498a15e/scratchpad/_s.png", buf);
  for (const e of els) rows.push({ page, label, sel, ...e });
}
// app: HUD after a correct answer on the review bank
await pg.goto(`${B}/#BANK_RVW`); await pg.waitForTimeout(2000);
await pg.click('#q .opt[data-id="a"]'); await pg.click('#q .ch[data-id="a"] .send'); await pg.waitForTimeout(4500); await pg.keyboard.press("Escape"); await pg.waitForTimeout(2500);
await grab("app", "#rwCoin img", "app HUD balance coin");
// try pages
for (const [q, label] of [["genui-ui.html?v=1", "genui-ui v1 HUD"], ["genui-ui.html?v=2", "genui-ui v2 HUD + bet pile"], ["genui-ui.html?v=3", "genui-ui v3 HUD"],
  ["genui-redeem.html?v=1", "redeem v1 HUD"], ["genui-redeem.html?v=2", "redeem v2 HUD"], ["genui-redeem.html?v=3", "redeem v3 HUD + coin by Check"], ["genui-redeem.html?v=3&state=wrong", "redeem v3 wrong (dimmed)"], ["tries.html", "tries HUD"]]) {
  await pg.goto(`${B}/try/${q}`); await pg.waitForTimeout(900);
  await grab(q, ".coin, #rwCoin img, .rw-coin-ic img", label);
}
await br.close(); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); console.log(rows.map(r => `${r.label} | ${r.sel.slice(0, 20)} #${r.i} ${r.w}x${r.h} @${Math.round(r.x)},${Math.round(r.y)} o=${r.o} bg=${r.bg} ${r.filter}`).join("\n"));
