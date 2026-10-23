// Telemetry gating + events (design/plans/TELEMETRY.md). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/telemetry.pw.mjs http://localhost:8812
// The real libraries are never fetched: a stamped key is faked by rewriting index.html's <meta name="stem-t">, and the PostHog /
// Clarity hosts answer with a stub that records calls. LIVE=1 + POSTHOG_TOKEN in the env stamps the real token and lets the
// requests through (a manual check that events reach PostHog; never in CI).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const LIVE = process.env.LIVE === "1" && /^phc_\w+$/.test(process.env.POSTHOG_TOKEN || "");
const CODE = process.env.STEM_T_CODE || "CALC1_X2P";   // an MC question in problems.json: works on a plain serve.py (no bank copy)
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 400)); }
}
const exe = (() => { try { return require("node:fs").readdirSync("/opt/pw-browsers").filter(d => d.startsWith("chromium-")).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0]; } catch { return undefined; } })();
const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
const HOSTS = /posthog\.com|clarity\.ms/;
const STUB = `window.posthog = { init(k, o) { window.__ph = { key: k, opts: o, ev: [] }; this.__loaded = true; o.loaded && o.loaded(this); },
  capture(n, p, x) { window.__ph.ev.push({ n, p, x }); }, register(o) { window.__ph.reg = o; } };`;

/* a context: env = { dnt, gpc } (navigator overrides), key = stamp a fake key into index.html */
async function open({ dnt = false, gpc = false, off = false, key = false, hash = "", cookies = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  if (cookies.length) await ctx.addCookies(cookies.map(c => ({ ...c, url: BASE })));
  await ctx.addInitScript(([dnt, gpc, off]) => {
    if (off) localStorage.setItem("stem-t-off", "1");
    if (dnt) Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1", configurable: true });
    if (gpc) Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });
    try { indexedDB.deleteDatabase("stem-stuff"); } catch { /* no idb */ }
    /* page time: the first choice / answer box in the DOM, and the first PostHog / Clarity script tag */
    new MutationObserver(() => {
      const t = performance.now();
      if (!window.__qAt && document.querySelector("#q .opt, #q input")) window.__qAt = t;
      if (!window.__libAt && document.querySelector('script[src*="posthog"], script[src*="clarity.ms"]')) window.__libAt = t;
    }).observe(document, { childList: true, subtree: true });
  }, [dnt, gpc, off]);
  const hits = [], errors = [];
  await ctx.route(HOSTS, async r => {
    hits.push({ url: r.request().url(), t: Date.now() });
    if (LIVE) return r.continue();
    const js = /posthog/.test(r.request().url()) ? STUB : "";
    return r.fulfill({ status: 200, contentType: "application/javascript", body: js });
  });
  if (key) {
    const tok = LIVE ? process.env.POSTHOG_TOKEN : "phc_testtoken123";
    await ctx.route(u => new URL(u).pathname === "/" || new URL(u).pathname === "/index.html", async r => {
      const res = await r.fetch(), html = await res.text();
      return r.fulfill({ response: res, body: html.replace('<meta name="stem-t" content="">', `<meta name="stem-t" content="${tok}" data-host="https://us.i.posthog.com" data-clarity="${LIVE ? "" : "abc123"}">`) });
    });
  }
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  return { ctx, page, hits, errors };
}
const firstQ = page => page.waitForSelector("#q .opt, #q input, #q textarea", { state: "attached", timeout: 30000 });

for (const [name, env] of [["Do Not Track", { dnt: true }], ["Global Privacy Control", { gpc: true }], ["privacy.html \"Don't record me\" (stem-t-off)", { off: true }]]) {
  await step(`${name} on + a key stamped: zero requests to PostHog / Clarity, stemT a no-op, nothing said`, async () => {
    const { ctx, page, hits, errors } = await open({ ...env, key: true, hash: "#" + CODE });
    await firstQ(page);
    await page.waitForTimeout(4500);   // past the idle loader
    await page.evaluate(() => window.stemT("pick", { code: "X" }));
    assert.equal(hits.length, 0, "requests: " + hits.map(h => h.url).join(" "));
    assert.equal(await page.evaluate(() => !!window.posthog || !!window.clarity), false, "a library global exists");
    assert.equal(await page.evaluate(() => /track|privacy control/i.test(document.body.innerText)), false, "the page mentions it");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await step("no key (local / preview): zero requests, no console errors, the app works", async () => {
  const { ctx, page, hits, errors } = await open({ hash: "#" + CODE });
  await firstQ(page);
  await page.waitForTimeout(4500);
  assert.equal(hits.length, 0, "requests: " + hits.map(h => h.url).join(" "));
  assert.equal(typeof await page.evaluate(() => typeof window.stemT), "string");
  assert.equal(await page.evaluate(() => { try { window.stemT("pick", null); window.stemT(); return true; } catch { return false; } }), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await step("a key: libraries load only after the first question shows; app_load, q_open, pick, guess_spam, next, bail arrive", async () => {
  const { ctx, page, hits, errors } = await open({ key: true, hash: "#" + CODE });
  await firstQ(page);
  await page.waitForFunction(() => window.__ph && window.__ph.ev.some(e => e.n === "app_load"), null, { timeout: 8000 });
  const at = await page.evaluate(() => [window.__qAt, window.__libAt]);
  assert.ok(at[0] && at[1] && at[1] > at[0], `a library tag (${at[1]} ms) came before the first question (${at[0]} ms)`);
  assert.ok(hits.some(h => /posthog.*array\.js/.test(h.url)), "PostHog not requested");
  assert.ok(hits.some(h => /clarity\.ms\/tag\/abc123/.test(h.url)), "Clarity not requested (the fake meta stamps an id, as a CLARITY=1 build does)");
  const o = await page.evaluate(() => window.__ph.opts);
  assert.ok(!("respect_dnt" in o), "optedOut() is the one privacy gate (Tony Oct 20); posthog-js respect_dnt would add a second one"); assert.equal(o.mask_all_text, false); assert.equal(o.mask_all_element_attributes, false);
  const m = await page.evaluate(() => { const r = window.__ph.opts.session_recording; return [r.maskInputFn("call 559-555-1234 or a.b@c.edu"), r.maskTextFn("v = 9.81 m/s, KE = 80 J"), r.maskAllInputs, r.maskTextSelector]; });
  assert.equal(m[0], "call ***-***-**** or *.*@*.***", "PII not blanked in replay inputs");
  assert.equal(m[1], "v = 9.81 m/s, KE = 80 J", "physics text must stay recorded");
  assert.equal(m[2], true); assert.equal(m[3], "*");   // every node goes through the PII blanker; the blanker keeps the rest
  assert.equal(o.persistence, "localStorage", "no cookie on every /check");
  assert.equal(o.disable_surveys, true); assert.equal(o.capture_dead_clicks, false);   // D22 bench
  const live = await page.$$("#q .opt:not([disabled])");
  if (live.length) {   // a fast pick (< 2 s after open is not guaranteed here, so the burst rule: 3 picks in 10 s)
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.stemT("pick", { code: "T", choice: "a", right: false, verdict: "wrong", tries_left: 1, ms_since_open: 5000 }); });
    await live[0].click(); await page.click("#q .opt[aria-checked=true] ~ .send, #q .send:not([hidden])").catch(() => {});
    await page.waitForFunction(() => window.__ph.ev.filter(e => e.n === "pick").length >= 4, null, { timeout: 8000 });
  }
  await page.evaluate(() => { document.getElementById("qnext")?.click(); dispatchEvent(new PageTransitionEvent("pagehide")); });
  const ev = await page.evaluate(() => window.__ph.ev);
  const names = new Set(ev.map(e => e.n));
  for (const n of ["app_load", "q_open", "pick", "guess_spam", "next", "bail", "tab_away", "jev_item"]) assert.ok(names.has(n), `${n} missing (got ${[...names]})`);
  const al = ev.find(e => e.n === "app_load").p;
  for (const k of ["ms_to_first_q", "nav_type", "restored_progress", "s", "display_mode", "prefers_color_scheme"]) assert.ok(k in al, "app_load." + k);
  const pk = ev.filter(e => e.n === "pick").at(-1).p;
  for (const k of ["code", "choice", "right", "ms_since_open", "tries_left", "sure"]) assert.ok(k in pk, "pick." + k);
  const ji = ev.filter(e => e.n === "jev_item").at(-1);   // Jev on for all (art. 11): the item's lines on pagehide, by beacon
  assert.deepEqual(Object.keys(ji.p).sort(), ["code", "i", "lines", "sid"]); assert.equal(ji.x && ji.x.transport, "sendBeacon");
  assert.ok(ji.p.lines.length && ji.p.lines.every(l => /^\+\d+\.\d  [a-z_]+/.test(l) && !/err=|fam=/.test(l)), JSON.stringify(ji.p.lines));
  const bail = ev.find(e => e.n === "bail");
  assert.equal(bail.x && bail.x.transport, "sendBeacon", "bail without the beacon transport");
  assert.deepEqual(errors, []);
  console.log("     events:", [...names].join(", "));
  await ctx.close();
});

await step("T40: app_load carries the device fields + tier, fps_probe arrives once, the tier is registered on every event", async () => {
  const { ctx, page, errors } = await open({ key: true, hash: "#" + CODE });
  await firstQ(page);
  await page.waitForFunction(() => window.__ph && window.__ph.ev.some(e => e.n === "fps_probe"), null, { timeout: 15000 });
  const ev = await page.evaluate(() => window.__ph.ev), reg = await page.evaluate(() => window.__ph.reg);
  const al = ev.find(e => e.n === "app_load").p;
  for (const k of ["hw_cores", "dev_mem", "dpr", "save_data", "eff_type", "reduced_motion", "reduced_transparency", "contrast", "ios_ver", "webview", "blur_supported", "gpu", "device_tier", "fx", "fx_why"])
    assert.ok(k in al, "app_load." + k);
  assert.ok(["apple", "adreno", "mali", "powervr", "intel", "nvidia", "amd", "other", "none"].includes(al.gpu), "app_load.gpu is a family token, not a model string: " + al.gpu);
  assert.ok(["weak", "strong"].includes(al.device_tier)); assert.ok(["blur", "dim"].includes(al.fx));
  assert.deepEqual(al.$set, { device_tier: al.device_tier });
  assert.deepEqual(reg, { device_tier: al.device_tier, fx: al.fx });
  const fp = ev.filter(e => e.n === "fps_probe");
  assert.equal(fp.length, 1);
  for (const k of ["fps_med", "frame_p95_ms", "dropped_pct", "slow", "fx"]) assert.ok(k in fp[0].p, "fps_probe." + k);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("fx-" + window.stemFx.fx)), true);
  assert.deepEqual(errors, []);
  console.log("     device:", JSON.stringify({ tier: al.device_tier, fx: al.fx, why: al.fx_why, cores: al.hw_cores, gpu: al.gpu, fps: fp[0].p }));
  await ctx.close();
});

await step("T40: the blur gate works with telemetry off (DNT): html.fx-* set, nothing sent", async () => {
  const { ctx, page, hits, errors } = await open({ dnt: true, key: true, hash: "#" + CODE });
  await firstQ(page);
  assert.equal(await page.evaluate(() => /fx-(blur|dim)/.test(document.documentElement.className)), true);
  assert.equal(hits.length, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [mode, cookies] of [["sugar", []], ["diet", [{ name: "stem-mode", value: "diet" }, { name: "stem-mode-v", value: "2" }]]]) {
  await step(`q_open carries mode=${mode} (the stem-mode cookie)`, async () => {
    const { ctx, page, errors } = await open({ key: true, hash: "#" + CODE, cookies });
    await firstQ(page);
    await page.waitForFunction(() => window.__ph && window.__ph.ev.some(e => e.n === "q_open"), null, { timeout: 8000 });
    const q = await page.evaluate(() => window.__ph.ev.find(e => e.n === "q_open").p);
    assert.equal(q.mode, mode, "q_open.mode");
    assert.equal(q.code, CODE);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await step("footer: a real 'privacy' link to privacy.html; the page has 7 plain lines", async () => {
  const { ctx, page } = await open({});
  const a = await page.$("a#privacy");
  assert.ok(a, "no #privacy link");
  assert.equal(await a.getAttribute("href"), "privacy.html");
  assert.ok(await a.isVisible(), "link hidden on the start page");
  await a.click();
  await page.waitForURL(/privacy\.html$/);
  assert.equal((await page.$$("main > p")).length, 7);
  for (const [re, what] of [[/you see an error code/, "error codes"], [/short log of its last steps/, "on-device flight log"], [/our server still notes the error code/, "server error lines under DNT"], [/The duck:/, "the duck"]])
    assert.match(await page.textContent("main"), re, "privacy lists " + what);   // a merge once dropped these: the page must stay true
  assert.match(await page.textContent("main"), /duck may react to how you work/, "Jev (on for all) listed");
  assert.match(await page.textContent("main"), /last 1500 characters of your notes/, "Cluck flow listed");
  assert.match(await page.textContent("main"), /Cluck may start its reply before you open it/, "prefetch listed");
  assert.match(await page.textContent("main"), /Copy puts your answers, your notes and their edit history/, "Copy flow listed");
  assert.match(await page.textContent("main"), /When something breaks, you see an error code\. With it we record what failed and some technical detail about your browser, only to fix that error\. What you type, your answers and your notes are never in an error report\./, "error reports listed (incident.mjs)");
  assert.match(await page.textContent("main"), /On the site owner's own test devices only, we also record each answer typed or picked, how long each try took, and which common mistake it matched, to study common mistakes; no one else's typing is recorded\. There is no screen replay\./, "owner-only typed log listed (T36), screen replay still denied");
  assert.equal(/record what you type/.test(await page.textContent("main")), false, "T36: the old blanket 'we don't record what you type' is untrue on owner devices");
  assert.equal(/Clarity/.test(await page.textContent("main")), false, "Clarity is off: not named");
  await page.click("#offBtn");
  assert.equal(await page.evaluate(() => localStorage.getItem("stem-t-off")), "1");
  assert.match(await page.textContent("#offTx"), /off on this device/);
  await ctx.close();
});

await browser.close();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
