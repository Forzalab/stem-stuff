// usage: node hudcrops.mjs SP PORT : the live HUD (#rwHud) with each coin in the balance window: fluent, traced, duck (coin24)
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [SP, PORT] = process.argv.slice(2), B = `http://127.0.0.1:${PORT}`;
const svg = p => "data:image/svg+xml;base64," + fs.readFileSync(p).toString("base64");
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await br.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch {} });
const pg = await ctx.newPage(); await pg.route(/youtube|ytimg|googlevideo/, r => r.abort());
await pg.goto(`${B}/#BANK_RVW`); await pg.waitForSelector("#rwHud:not([hidden]) #rwCoin", { state: "attached" });
await pg.waitForTimeout(1500);
const hidden = await pg.evaluate(() => document.querySelector("#rwHud").classList.contains("rw-z-xp"));
if (hidden) { await pg.click('#q .opt[data-id="b"]').catch(() => {}); }
await pg.evaluate(() => document.querySelector("#rwHud").classList.remove("rw-z-xp"));
for (const [n, s] of [["fluent", svg(`${SP}/old/coin_fluent.svg`)], ["noedge", svg(`${SP}/old/duck24_noedge.svg`)], ["duck", null]]) {
  await pg.evaluate(s => { const i = document.querySelector("#rwCoin img"); if (s) { i.dataset.o = i.dataset.o || i.src; i.src = s; } else if (i.dataset.o) i.src = i.dataset.o; }, s);
  await pg.waitForTimeout(150);
  await pg.locator("#rwHud").screenshot({ path: `${SP}/live2/hud-${n}.png` });
}
await br.close(); console.log("ok");
