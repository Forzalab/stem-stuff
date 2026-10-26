// login.js (E4, Tony #22/#22b/#23): the My Cluck save + login dialogs, driven through design/login-lab.html.
// The picked image never leaves the device: the only request is POST acct/login with JSON {token}; the object URL is revoked and the
// input cleared. ?k= logs in and is stripped from the URL. Save = navigator.share({files}) inside the click; "Saved ✓" only on resolve.
// /acct/new and /acct/login (S2) are faked here with page.route. The "fixture" Cluck PNG is drawn by mycluck.mjs in the page itself.
//   python3 serve.py 8833 & P=$!; sleep 1; node tests/login.pw.mjs http://localhost:8833; kill $P
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8833", LAB = BASE + "/design/login-lab.html";
const NEW = "q3Xv9LkP0aZ_8-mN2bR4tw", OLD = "Zt7wQ1mN_4kLp-9aBcD3eF";   // 128-bit base64url: the minted one, the one on the other phone's Cluck

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
/* a fresh context: S2 faked, every http request recorded, object URLs counted, navigator.share stubbed by `share` */
async function fresh(browser, share = "none") {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  await ctx.addInitScript(mode => {
    const made = window.__urls = { made: [], revoked: [] };
    const mk = URL.createObjectURL.bind(URL), rv = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = o => { const u = mk(o); made.made.push(u); return u; };
    URL.revokeObjectURL = u => { made.revoked.push(u); rv(u); };
    window.__share = [];
    if (mode !== "none") {
      navigator.canShare = () => true;
      navigator.share = d => { window.__share.push({ active: navigator.userActivation.isActive, files: (d.files || []).map(f => [f.name, f.type, f.size]) });
        return mode === "abort" ? Promise.reject(new DOMException("Share canceled", "AbortError")) : Promise.resolve(); };
    }
  }, share);
  const page = await ctx.newPage();
  const reqs = [], errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("request", r => { if (/^https?:/.test(r.url())) reqs.push({ url: r.url(), method: r.method(), type: r.headers()["content-type"] || "", body: r.postData() }); });
  await page.route("**/acct/new", r => r.fulfill({ json: { token: NEW } }));
  await page.route("**/acct/login", r => r.fulfill({ json: { ok: true } }));
  return { ctx, page, reqs, errs };
}
const status = page => page.textContent("#lgStatus");

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("open: mints, draws MY Cluck with the caption, fits 360px, labelled dialog", async () => {
    const { ctx, page, reqs, errs } = await fresh(browser);
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("dialog.lg[open] canvas.lg-cluck");
    assert.equal((await page.textContent("dialog.lg .lg-cap")).replace(/\s+/g, " ").trim(), "This is your key 🔑 Don't post it.");
    const mint = reqs.filter(r => r.url.includes("/acct/"));
    assert.deepEqual(mint.map(r => [r.method, new URL(r.url).pathname]), [["POST", "/acct/new"]]);
    const back = await page.evaluate(async () => { const { decode } = await import("../mycluck.mjs"); const c = document.querySelector("canvas.lg-cluck");
      return decode(c.getContext("2d").getImageData(0, 0, c.width, c.height)); });
    assert.equal(new URL(back).searchParams.get("k"), NEW, "the drawn QR is the login link");
    const fit = await page.$eval("dialog.lg", d => { const b = d.getBoundingClientRect();
      return [b.left >= 0, b.right <= innerWidth, document.documentElement.scrollWidth <= innerWidth, d.scrollWidth <= d.clientWidth]; });
    assert.deepEqual(fit, [true, true, true, true], "360px: no sideways scroll");
    const a11y = await page.$eval("dialog.lg", d => [!!d.getAttribute("aria-labelledby") && !!document.getElementById(d.getAttribute("aria-labelledby")),
      [...d.querySelectorAll("button")].every(b => (b.getAttribute("aria-label") || b.textContent).trim().length > 0),
      [...d.querySelectorAll("input")].every(i => i.labels.length > 0 || i.getAttribute("aria-label")),
      d.querySelector("canvas").getAttribute("role") === "img" && !!d.querySelector("canvas").getAttribute("aria-label"),
      d.contains(document.activeElement)]);
    assert.deepEqual(a11y, [true, true, true, true, true], "named dialog, named buttons + inputs, the image has a name, focus inside");
    await page.keyboard.press("Escape");
    assert.equal(await page.$("dialog.lg[open]"), null, "Esc closes");
    assert.equal(await page.evaluate(() => document.activeElement.id), "openLogin", "focus goes back");
    assert.deepEqual(errs, []);
    await ctx.close();
  });

  await step("I have my Cluck: the only request is POST acct/login {token} (JSON, < 200 B); object URL revoked, input cleared", async () => {
    const { ctx, page, reqs, errs } = await fresh(browser);
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("dialog.lg[open] canvas.lg-cluck");
    await page.waitForFunction(() => typeof window.jsQR === "function", null, { timeout: 5000 });   // the login screen loads jsQR, lazily
    const png = await page.evaluate(async tok => {                                  // the other phone's Cluck, as a PNG
      const { drawCluck } = await import("../mycluck.mjs");
      const img = drawCluck(location.origin + "/?k=" + tok, tok), c = document.createElement("canvas");
      c.width = img.width; c.height = img.height; c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      const b = await new Promise(r => c.toBlob(r, "image/png"));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, OLD);
    const before = reqs.length;
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#lgHave")]);
    await chooser.setFiles({ name: "IMG_0042.png", mimeType: "image/png", buffer: Buffer.from(png) });
    await page.waitForFunction(() => /signed in/i.test(document.querySelector("#lgStatus").textContent), null, { timeout: 5000 });
    const sent = reqs.slice(before);
    assert.deepEqual(sent.map(r => [r.method, new URL(r.url).pathname]), [["POST", "/acct/login"]], "one request, no upload");
    assert.match(sent[0].type, /^application\/json/);
    assert.ok(Buffer.byteLength(sent[0].body) < 200, sent[0].body.length + " B");
    assert.deepEqual(JSON.parse(sent[0].body), { token: OLD });
    const u = await page.evaluate(() => window.__urls);
    const picked = u.made.filter(x => !u.revoked.includes(x));
    assert.deepEqual(picked, [], "every object URL is revoked");
    assert.ok(u.made.length >= 1, "the pick went through an object URL");
    assert.equal(await page.$eval("#lgFile", i => i.value + "|" + i.files.length), "|0", "input cleared");
    assert.equal(await page.evaluate(() => window.stemLogin.signedIn()), true);
    assert.deepEqual(errs, []);
    await ctx.close();
  });

  await step("a picture with no Cluck: says so, sends nothing", async () => {
    const { ctx, page, reqs } = await fresh(browser);
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("dialog.lg[open] canvas.lg-cluck");
    await page.waitForFunction(() => typeof window.jsQR === "function");
    const png = await page.evaluate(async () => { const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 64, 64);
      return [...new Uint8Array(await (await new Promise(r => c.toBlob(r, "image/png"))).arrayBuffer())]; });
    const before = reqs.length;
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#lgHave")]);
    await chooser.setFiles({ name: "cat.png", mimeType: "image/png", buffer: Buffer.from(png) });
    await page.waitForFunction(() => /couldn.t find/i.test(document.querySelector("#lgStatus").textContent), null, { timeout: 5000 });
    assert.deepEqual(reqs.slice(before), []);
    const u = await page.evaluate(() => window.__urls);
    assert.deepEqual(u.made.filter(x => !u.revoked.includes(x)), []);
    await ctx.close();
  });

  await step("?k= on load: logs in, and location.search has no k", async () => {
    const { ctx, page, reqs, errs } = await fresh(browser);
    await page.goto(LAB + "?k=" + OLD);
    await page.waitForFunction(() => window.stemLogin && window.stemLogin.signedIn(), null, { timeout: 5000 });
    assert.equal(new URLSearchParams(await page.evaluate(() => location.search)).has("k"), false);
    assert.doesNotMatch(await page.evaluate(() => location.href), new RegExp(OLD));
    const login = reqs.filter(r => r.url.includes("/acct/"));
    assert.deepEqual(login.map(r => [r.method, new URL(r.url).pathname, r.body]), [["POST", "/acct/login", JSON.stringify({ token: OLD })]]);
    assert.match(await page.textContent("#labState"), /signed in/i);
    await page.click("#openLogin");                                                // Show my Cluck: the same key, no new mint
    await page.waitForSelector("dialog.lg[open] canvas.lg-cluck");
    assert.equal(reqs.filter(r => r.url.includes("/acct/new")).length, 0);
    assert.deepEqual(errs, []);
    await ctx.close();
  });

  await step("Save: share({files: [png]}) inside the click; rejected with AbortError -> no \"Saved ✓\"", async () => {
    const { ctx, page } = await fresh(browser, "abort");
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("dialog.lg[open] canvas.lg-cluck");
    await page.waitForSelector("#lgSave:not([disabled])");
    await page.click("#lgSave");
    await page.waitForFunction(() => window.__share.length === 1);
    await page.waitForTimeout(300);
    const [s] = await page.evaluate(() => window.__share);
    assert.equal(s.active, true, "called while the tap's user activation is live");
    assert.deepEqual([s.files.length, s.files[0][1]], [1, "image/png"]);
    assert.ok(s.files[0][2] > 1000, "a real PNG");
    assert.doesNotMatch(await status(page), /Saved/);
    await ctx.close();
  });

  await step("Save: share resolves -> \"Saved ✓\"", async () => {
    const { ctx, page } = await fresh(browser, "ok");
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("#lgSave:not([disabled])");
    await page.click("#lgSave");
    await page.waitForFunction(() => /Saved ✓/.test(document.querySelector("#lgStatus").textContent), null, { timeout: 3000 });
    await ctx.close();
  });

  await step("Save without navigator.share: falls back to a download of the PNG", async () => {
    const { ctx, page } = await fresh(browser, "none");
    await page.goto(LAB);
    await page.click("#openLogin");
    await page.waitForSelector("#lgSave:not([disabled])");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#lgSave")]);
    assert.match(dl.suggestedFilename(), /\.png$/);
    assert.doesNotMatch(await status(page), /Saved ✓/);
    await ctx.close();
  });
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} failed` : "\nall ok");
process.exit(failures ? 1 : 0);
