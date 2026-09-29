// Offline e2e (Chromium via playwright-core). Run: cd tests && npm run e2e
// Browser: $CHROMIUM, else /opt/pw-browsers/chromium-*/chrome-linux/chrome. Skips if none.
// Uses the repo's index.html/app.js/app.css when present, else tests/e2e/fixture/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("fixture/", import.meta.url));

function chromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = join(base, d, "chrome-linux", "chrome");
    if (existsSync(p)) return p;
  }
  return null;
}
const exe = chromium();
let pw = null;
try { pw = (await import("playwright-core")).chromium; } catch { /* not installed */ }
const skip = !exe || !pw ? "no chromium / playwright-core" : false;

const CODE = "CALC1-T6B";
let site, browser;

const freePort = () => new Promise(res => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
async function serve() {
  const port = await freePort();
  const proc = spawn("python3", [join(site, "serve.py"), String(port)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${port}/index.html`); return { port, proc, url: `http://localhost:${port}/` }; }
    catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error("server did not start");
}
const stop = s => new Promise(r => { s.proc.once("exit", r); s.proc.kill(); });

before(async () => {
  if (skip) return;
  site = mkdtempSync(join(tmpdir(), "stem-offline-"));
  for (const f of readdirSync(repo)) if (!/^(\.|tests$|stem-stuff\.html)/.test(f)) cpSync(join(repo, f), join(site, f), { recursive: true });
  const real = existsSync(join(repo, "index.html")) && existsSync(join(repo, "app.js")) && !process.env.E2E_FIXTURE;
  if (!real) for (const f of readdirSync(fixture)) cpSync(join(fixture, f), join(site, f));
  console.log("# app under test:", real ? "repo index.html" : "tests/e2e/fixture");
  symlinkSync(join(repo, "tests"), join(site, "tests"));
  browser = await pw.launch({ executablePath: exe, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); if (site) rmSync(site, { recursive: true, force: true }); });

// Render through the page's own entry point, then check math came out as KaTeX, not raw TeX.
async function rendersMath(page, code) {
  await page.evaluate(async c => {
    if (window.stemApp) return window.stemApp.render(await (await fetch("p/" + c + ".json")).json());
    location.hash = "";
    location.hash = c;                                  // real app.js loads #CODE
  }, code);
  if (!(await page.evaluate(() => !!window.stemApp))) await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code);
  await page.locator(".katex").first().waitFor({ timeout: 5000 });
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(!/\\(vec|text|frac|circ)|\$[^$\n]+\$/.test(text), "raw TeX visible: " + text.slice(0, 300));
}
const getProblem = (page, code) => page.evaluate(c => fetch("p/" + c + ".json").then(r => r.json()).then(p => p.code), code);

test("localhost: service worker caches shell + opened problem, works with server down", { skip, timeout: 30000 }, async () => {
  const s = await serve();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(s.url);
    assert.equal(await page.evaluate(() => stemOffline.mode), "sw");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                       // now controlled
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    assert.equal(await getProblem(page, CODE), CODE);          // opened once online
    await rendersMath(page, CODE);
    await page.evaluate(() => fetch("k/" + "CALC1-T6B.json").catch(() => 0));
    await page.evaluate(() => fetch("check", { method: "POST", body: "{}" }).catch(() => 0));
    await page.evaluate(() => fetch("check?x=1").catch(() => 0));
    await stop(s);                                             // server offline
    await page.reload();
    assert.ok(await page.evaluate(() => !!window.stemOffline), "shell loads from cache");
    assert.equal(await getProblem(page, CODE), CODE, "opened problem loads from cache");
    await rendersMath(page, CODE);                             // KaTeX js/css/fonts from cache
    const keys = await page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
      return out;
    });
    assert.ok(keys.some(u => u.endsWith("/app.js")), "app.js precached");
    assert.ok(keys.some(u => u.endsWith("/p/" + CODE + ".json")), "problem cached");
    assert.ok(!keys.some(u => /\/k\/|\/check|\/log\//.test(u)), "no k/ or /check in cache: " + keys);
    // Not opened before -> picker, then a file from disk answers the fetch.
    const pending = getProblem(page, "PHYS-S2K");
    await page.locator(".so:not([hidden])").waitFor();
    await page.locator(".so input[type=file]").first().setInputFiles(join(repo, "p", "PHYS-S2K.json"));
    assert.equal(await pending, "PHYS-S2K");
  } finally { await ctx.close(); if (s.proc.exitCode === null && !s.proc.signalCode) await stop(s); }
});

test("plain http (no SW): server down -> file picker loads p/*.json, rejects junk", { skip, timeout: 30000 }, async () => {
  const s = await serve();
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  try {
    await page.goto(s.url);
    await stop(s);
    const pending = getProblem(page, CODE);
    await page.locator(".so:not([hidden])").waitFor();
    const input = page.locator(".so input[type=file]").first();
    await input.setInputFiles({ name: "junk.json", mimeType: "application/json", buffer: Buffer.from('{"a":1}') });
    await page.locator(".so-msg.bad").waitFor();
    await input.setInputFiles([join(repo, "p", "PHYS-F3N.json"), join(repo, "p", CODE + ".json")]);
    assert.equal(await pending, CODE);
    assert.equal(await getProblem(page, "PHYS-F3N"), "PHYS-F3N", "second picked file kept in memory");
    // Cancel -> fetch rejects (app shows its own error).
    const cancelled = page.evaluate(() => fetch("p/CALC1-A9R.json").then(() => "ok", () => "rejected"));
    await page.locator(".so:not([hidden])").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await cancelled, "rejected");
  } finally { await ctx.close(); if (s.proc.exitCode === null && !s.proc.signalCode) await stop(s); }
});

test("download: served bundle opens from file:// and loads a problem via picker", { skip, timeout: 30000 }, async () => {
  const s = await serve();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    await page.goto(s.url);
    const btn = page.locator(".so-dl");
    if (await btn.count()) {                              // page mounted the download icon
      await btn.first().waitFor({ state: "visible" });
      assert.equal(await btn.first().textContent(), "", "icon only");
    }
    const out = join(site, "dl.html");
    execFileSync("curl", ["-sf", "-o", out, s.url + "stem-stuff.html"]);
    const page2 = await ctx.newPage();
    const ext = [];
    page2.on("request", r => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) ext.push(r.url()); });
    await page2.goto("file://" + out);
    assert.equal(await page2.evaluate(() => stemOffline.mode), "file");
    assert.ok(await page2.evaluate(() => typeof katex === "object"), "KaTeX inlined");
    assert.ok(!ext.some(u => /katex|app\.js|offline\.js/i.test(u)), "no external app/KaTeX loads: " + ext);
    const pending = getProblem(page2, CODE);
    await page2.locator(".so:not([hidden])").waitFor();
    await page2.locator(".so input[type=file]").first().setInputFiles(join(repo, "p", CODE + ".json"));
    assert.equal(await pending, CODE);
    await rendersMath(page2, CODE);
  } finally { await ctx.close(); await stop(s); }
});

test("serve.py: HEAD and GET on k/ are 404", { skip, timeout: 30000 }, async () => {
  const s = await serve();
  try {
    for (const method of ["GET", "HEAD"]) assert.equal((await fetch(s.url + "k/x.json", { method })).status, 404, method);
    assert.equal((await fetch(s.url + "serve.py", { method: "HEAD" })).status, 404);
  } finally { await stop(s); }
});
