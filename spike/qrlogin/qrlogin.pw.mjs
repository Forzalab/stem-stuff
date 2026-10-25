// Run: node spike/qrlogin/qrlogin.pw.mjs   (uses preinstalled playwright)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = process.env.QR_OUT || '/tmp/claude-0/-home-user-stem-stuff/3d283f8c-a188-577a-b61c-a60e02e87f9e/scratchpad/qr';
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p));
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/spike/qrlogin/index.html`);
let fails = 0; const results = [];
const b64 = (u) => Buffer.from(u.split(',')[1], 'base64');
for (let i = 0; i < 6; i++) { // enough cards to hit all colour/hat variants
  await page.click('#new');
  const token = await page.evaluate(() => window.__token);
  if (token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('bad token');
  const variant = await page.evaluate(t => { const v = QRLogin.variantFor(t); return v.color.name + '/' + v.hat; }, token);
  const png = b64(await page.evaluate(() => document.getElementById('card').toDataURL('image/png')));
  const jpg = b64(await page.evaluate(() => document.getElementById('card').toDataURL('image/jpeg', 0.6)));
  const jpgHalf = b64(await page.evaluate(() => { // simulates iMessage/WhatsApp: 50% downscale + JPEG q0.6
    const c = document.getElementById('card'), d = document.createElement('canvas');
    d.width = c.width / 2; d.height = c.height / 2; d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
    return d.toDataURL('image/jpeg', 0.6);
  }));
  if (i < 3) { fs.writeFileSync(path.join(outDir, `card${i}.png`), png); fs.writeFileSync(path.join(outDir, `card${i}-q60-half.jpg`), jpgHalf); }
  for (const [name, buf, mime] of [['png', png, 'image/png'], ['jpeg0.6', jpg, 'image/jpeg'], ['jpeg0.6+50%', jpgHalf, 'image/jpeg']]) {
    await page.evaluate(() => { window.__decoded = undefined; document.getElementById('out').textContent = ''; });
    await page.setInputFiles('#file', { name: 'x', mimeType: mime, buffer: buf }); // real UI path
    await page.waitForFunction(() => window.__decoded !== undefined);
    const got = await page.evaluate(() => window.__decoded);
    const ui = await page.textContent('#out');
    const cleared = await page.evaluate(() => document.getElementById('file').files.length === 0);
    const ok = got === token && ui === 'token ok: ' + token.slice(0, 6) && cleared;
    if (!ok) fails++;
    results.push(`card${i} [${variant}] ${name.padEnd(12)} ${String(buf.length).padStart(6)}B -> ${ok ? 'PASS' : 'FAIL'}`);
  }
}
await page.click('#new');
await page.locator('#card').screenshot({ path: path.join(outDir, 'card-screenshot.png') });
console.log(results.join('\n')); console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
