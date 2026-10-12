// usage: node sheet.mjs OUT.png title label=path[,path...] ...   -> grid: row per label, each path at 16/24/32/64 on dark + white
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const pw = require("/opt/node22/lib/node_modules/playwright");
const [OUT, TITLE, ...rows] = process.argv.slice(2);
const SZ = [16, 24, 32, 64];
const uri = p => (p.endsWith(".png") ? "data:image/png;base64," : "data:image/svg+xml;base64,") + fs.readFileSync(p).toString("base64");
const kb = p => (fs.statSync(p).size / 1024).toFixed(1) + " KB";
let h = `<style>body{margin:0;font:12px system-ui;background:#1c2433;color:#dfe6f0;padding:10px}table{border-collapse:collapse}
td{padding:4px 6px;vertical-align:middle}.d{background:#0a1322}.w{background:#fff;color:#333}img{display:inline-block;margin:0 5px;vertical-align:middle}
th{text-align:left;font-weight:600;padding:4px 6px}h1{font-size:15px;margin:0 0 8px}.n{font-size:11px;opacity:.8}</style><h1>${TITLE}</h1><table>
<tr><th>icon</th><th>file</th><th>on #0a1322 (16 / 24 / 32 / 64 px)</th><th>on white (16 / 24 / 32 / 64 px)</th></tr>`;
for (const r of rows) {
  const [label, list] = r.split("=");
  for (const [i, p] of list.split(",").entries()) {
    const u = uri(p), imgs = SZ.map(s => `<img src="${u}" width="${s}" height="${s}">`).join("");
    h += `<tr><td>${i ? "" : label}</td><td class="n">${p.split("/").slice(-2).join("/")}<br>${kb(p)}</td><td class="d">${imgs}</td><td class="w">${imgs}</td></tr>`;
  }
}
h += "</table>";
const br = await pw.chromium.launch();
const pg = await br.newPage({ viewport: { width: 900, height: 300 }, deviceScaleFactor: +(process.env.DPR || 2) });
await pg.setContent(h); await pg.waitForTimeout(200);
await pg.screenshot({ path: OUT, fullPage: true });
await br.close(); console.log(OUT);
