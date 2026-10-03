// "New version ready. Tap to update." (offline.js + sw.js): the shell is served from the SW cache, so after a deploy the page
// is one version behind. Serves a copy of the client from its own static server (Cache-Control: no-cache, like Vercel),
// changes app.css, reloads: the bar shows; tap it: the page reloads with the new file and the bar is gone.
//   node tests/update.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8823), BASE = `http://localhost:${PORT}/`;
const SITE = mkdtempSync(join(tmpdir(), "update-"));
cpSync(ROOT, SITE, { recursive: true, filter: s => !/[\\/](\.git|tests|node_modules|public)$/.test(s) });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, BASE).pathname)).replace(/^[\\/]+/, "") || "index.html";
  const f = join(SITE, p);
  try {
    if (!f.startsWith(SITE) || !statSync(f).isFile()) throw 0;
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(readFileSync(f));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const browser = await pw.chromium.launch();
const bar = page => page.locator("#updateBar");
let fails = 0;
const step = async (name, fn) => {
  try { await fn(); console.log("ok   " + name); } catch (e) { fails++; console.log("FAIL " + name + ": " + e.message); }
};
try {
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await step("first visit: no bar", async () => {
    await page.waitForTimeout(1500);
    assert.equal(await bar(page).count(), 0);
  });
  await step("same files on reload: no bar", async () => {
    await page.reload();
    await page.waitForTimeout(1500);
    assert.equal(await bar(page).count(), 0);
  });
  appendFileSync(join(SITE, "app.css"), "\n/* v2 */\n");
  await step("changed file: the bar shows", async () => {
    await page.reload();
    await bar(page).waitFor({ state: "visible", timeout: 5000 });
    assert.equal((await bar(page).textContent()).trim(), "New version ready. Tap to update.");
  });
  await step("tap: reload onto the new version, bar gone", async () => {
    await Promise.all([page.waitForEvent("load"), bar(page).click()]);
    await page.waitForTimeout(1500);
    assert.equal(await bar(page).count(), 0);
    const css = await page.evaluate(async () => (await caches.match(new URL("app.css", location.href).href)) ?.text());
    assert.ok(css && css.includes("/* v2 */"), "the cache holds the new app.css");
  });
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `${fails} FAIL` : "all ok");
process.exit(fails ? 1 : 0);
