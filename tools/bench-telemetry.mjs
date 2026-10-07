// D22 telemetry bench: what do PostHog and Clarity cost a phone?
// Playwright Chromium, iPhone 15 viewport 393x852 (touch, DPR 3), CPU 4x throttle + "Slow 4G" (CDP), fresh context per run.
// Configs: none / posthog / clarity / both, N runs each (default 5), interleaved so drift hits every config equally.
// Metrics per run: JS KB transferred (all + third-party), LCP, INP (synthetic taps), TBT (long tasks FCP..end of window).
//
// usage (from repo root):
//   python3 tools/build_public.py /tmp/x/public
//   node tools/bench-telemetry.mjs   (env: POSTHOG_KEY → project token looked up in memory, or PH_TOKEN; CLARITY_ID) /tmp/x/public [--runs 5] [--mode snippet|wired] [--json out.json]
//
// --mode snippet (default): the official PostHog + Clarity snippets are injected into index.html <head> (route rewrite).
// --mode wired: the build's own telemetry.js loads the libs (after the first question, on idle); the bench stamps
//   <meta name="stem-t"> per config in memory (PostHog token and/or Clarity id, or empty for none). Build WITHOUT keys.
// No fake traffic: every PostHog ingestion request (/e/ /s/ /i/v0/ /batch /capture /engage /track) and every Clarity
// upload (/collect) is aborted by route; the libs, remote config and recorder still download. Without PH_TOKEN a dummy
// token is used (then PostHog skips the session recorder: noted in the output). Never prints a key.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(args.find((a, i) => !a.startsWith("--") && !(i && args[i - 1].startsWith("--"))) || "public");
const RUNS = +opt("--runs", 5);
const MODE = opt("--mode", "snippet");
const JSON_OUT = opt("--json", "");
const CONFIGS = (opt("--configs", "none,posthog,clarity,both")).split(",");
const WINDOW_MS = +opt("--window", 12000);   // measurement window after navigation start (libs load late: Clarity tag is async)
// public project token (phc_): $PH_TOKEN, else looked up in memory with the personal key ($POSTHOG_KEY), else a dummy
const phLookup = () => {
  if (process.env.PH_TOKEN) return process.env.PH_TOKEN;
  if (!process.env.POSTHOG_KEY) return "";
  try {
    const out = execFileSync("curl", ["-sS", "--max-time", "20", "-H", "Authorization: Bearer " + process.env.POSTHOG_KEY,
      "https://us.posthog.com/api/projects/@current/"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return JSON.parse(out).api_token || "";
  } catch { return ""; }
};
const PH_FOUND = phLookup();
const PH_TOKEN = PH_FOUND || "phc_bench_dummy_token_not_real";
const PH_REAL = !!PH_FOUND;
const CLARITY_ID = process.env.CLARITY_ID || "benchdummy";
const EXE = fs.readdirSync("/opt/pw-browsers").filter(d => d.startsWith("chromium-")).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];

// ---- tiny gzip static server (Vercel compresses; python http.server does not, which would inflate the baseline) ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = TYPES[path.extname(f)] || "application/octet-stream";
  let body = fs.readFileSync(f);
  const h = { "content-type": type, "cache-control": "no-store" };
  if (/text|json|svg/.test(type) && /gzip/.test(req.headers["accept-encoding"] || "")) { body = zlib.gzipSync(body); h["content-encoding"] = "gzip"; }
  res.writeHead(200, h); res.end(body);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---- official snippets (posthog-js docs "HTML snippet", Clarity "Install manually") ----
const PH_SNIPPET = `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(PH_TOKEN)},{api_host:"https://us.i.posthog.com",person_profiles:"identified_only",respect_dnt:true,mask_all_text:false,mask_all_element_attributes:false,session_recording:{maskAllInputs:false}});</script>`;
const CL_SNIPPET = `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(CLARITY_ID)});</script>`;

const INGEST = /(\.i\.posthog\.com\/(e|s|i\/v0\/e|batch|capture|engage|track|flags|decide)\b)|(clarity\.ms\/(collect|c\.gif))|bat\.bing\.com|c\.bing\.com/;
const THIRD = /posthog\.com|clarity\.ms|bing\.com|c\.bing/;

// in-page collectors (installed before any page script)
const OBSERVERS = () => {
  window.__b = { lcp: 0, lt: [], ev: [], fcp: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__b.lcp = e.renderTime || e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__b.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__b.fcp = e.startTime; }).observe({ type: "paint", buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__b.ev.push([e.name, e.duration]); }).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch {}
};

const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function run(browser, cfg) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.addInitScript(OBSERVERS);
  const blocked = { n: 0 };
  await page.route("**/*", async route => {
    const u = route.request().url();
    if (process.env.BENCH_DEBUG && THIRD.test(u)) console.error(`  [${cfg}] route ${route.request().method()} ${u.split("?")[0].replace(/phc_\w+/, "phc_…")}${INGEST.test(u) ? "  (BLOCKED)" : ""}`);
    if (INGEST.test(u)) { blocked.n++; return route.abort(); }
    if (u.startsWith(ORIGIN) && route.request().resourceType() === "document") {
      const r = await route.fetch();
      let html = await r.text();
      const ph = cfg === "posthog" || cfg === "both", cl = cfg === "clarity" || cfg === "both";
      if (MODE === "snippet") html = html.replace("</head>", (ph ? PH_SNIPPET : "") + (cl ? CL_SNIPPET : "") + "</head>");
      else {   // wired: telemetry.js reads <meta name="stem-t">; the token is stamped in memory here, never into the build on disk
        const meta = `<meta name="stem-t" content="${ph ? PH_TOKEN : ""}" data-host="https://us.i.posthog.com" data-clarity="${cl ? CLARITY_ID : ""}">`;
        const n = html.length; html = html.replace(/<meta name="stem-t"[^>]*>/, meta);
        if (html.length === n && !html.includes(meta)) throw new Error("wired mode: no <meta name=stem-t> slot in index.html (telemetry.js not merged?)");
      }
      return route.fulfill({ response: r, body: html, headers: Object.fromEntries(Object.entries(r.headers()).filter(([k]) => !/^(content-encoding|content-length)$/i.test(k))) });
    }
    return route.continue();
  });
  // safety net: every 3rd-party request the page makes, seen by the browser (catches beacons the route might miss)
  const leaks = [];
  page.on("request", q => { const u = q.url(); if (INGEST.test(u)) leaks.push(u); if (process.env.BENCH_DEBUG && THIRD.test(u)) console.error(`  [${cfg}] req ${q.method()} ${u.split("?")[0].replace(/phc_\w+/, "phc_…")}`); });
  page.on("requestfailed", q => { if (INGEST.test(q.url())) blocked.ok = (blocked.ok || 0) + 1; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // Chrome DevTools "Slow 4G" preset (was "Fast 3G"): 562.5 ms RTT, 1.44 Mbps down, 675 kbps up
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: 1.44e6 / 8 * 0.9, uploadThroughput: 675e3 / 8 * 0.9 });
  const types = new Map(), bytes = { js: 0, js3p: 0, all: 0, all3p: 0 };
  const urls = new Map();
  cdp.on("Network.responseReceived", e => { types.set(e.requestId, e.type); urls.set(e.requestId, e.response.url); });
  cdp.on("Network.loadingFinished", e => {
    const u = urls.get(e.requestId) || "", t = types.get(e.requestId), b = e.encodedDataLength, tp = THIRD.test(u);
    bytes.all += b; if (tp) bytes.all3p += b;
    if (t === "Script") { bytes.js += b; if (tp) bytes.js3p += b; }
  });
  const url = `${ORIGIN}/`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(Math.max(0, WINDOW_MS - (Date.now() - t0)));
  const lcp = await page.evaluate(() => window.__b.lcp);
  // synthetic taps on the first visible interactive element (same element every config)
  const target = page.locator("button:visible, input:visible, a[href]:visible").first();
  const tapped = await target.evaluate(e => e.outerHTML.slice(0, 80)).catch(() => "none");
  for (let i = 0; i < 3; i++) { try { await target.tap({ timeout: 3000, force: true }); } catch {} await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  const b = await page.evaluate(() => window.__b);
  const lib = await page.evaluate(() => ({ phRec: window.posthog?.sessionRecordingStarted?.() ?? null, phBot: window.posthog?._is_bot?.() ?? null,
    phQueued: window.posthog?._requestQueue?._queue?.length ?? null, webdriver: navigator.webdriver, brands: (navigator.userAgentData?.brands || []).map(x => x.brand).join(","),
    clarity: typeof window.clarity === "function" }));
  const tbt = b.lt.filter(([s]) => s >= b.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  const inp = b.ev.reduce((m, [, d]) => Math.max(m, d), 0);
  await ctx.close();
  return { cfg, jsKB: bytes.js / 1024, js3pKB: bytes.js3p / 1024, allKB: bytes.all / 1024, all3pKB: bytes.all3p / 1024,
    lcp, inp, tbt, longTasks: b.lt.length, blocked: blocked.n, ingestSeen: leaks.length, ingestFailed: blocked.ok || 0, lib, tapped };
}

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--proxy-bypass-list=127.0.0.1;localhost"],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined });
const results = [];
for (let r = 0; r < RUNS; r++) for (const cfg of CONFIGS) {
  const x = await run(browser, cfg);
  results.push(x);
  console.error(`run ${r + 1}/${RUNS} ${cfg.padEnd(7)} js=${x.jsKB.toFixed(1)}KB 3p=${x.js3pKB.toFixed(1)}KB lcp=${x.lcp.toFixed(0)} inp=${x.inp.toFixed(0)} tbt=${x.tbt.toFixed(0)} blocked=${x.blocked} ingestSeen=${x.ingestSeen} ingestFailed=${x.ingestFailed} ${process.env.BENCH_DEBUG ? JSON.stringify(x.lib) : ""}`);
}
await browser.close(); server.close();

const f = (n, d = 0) => n.toFixed(d);
const keys = [["jsKB", "JS KB (all)", 1], ["js3pKB", "3rd-party JS KB", 1], ["all3pKB", "3rd-party total KB", 1], ["lcp", "LCP ms", 0], ["inp", "INP ms", 0], ["tbt", "TBT ms", 0]];
const lines = [`tap target: ${results[0]?.tapped}`, `ingestion requests seen=${results.reduce((a, r) => a + r.ingestSeen, 0)} aborted=${results.reduce((a, r) => a + r.ingestFailed, 0)}`, `mode=${MODE} runs=${RUNS} posthog_token=${PH_REAL ? "real project token (ingestion blocked)" : "dummy"} window=${WINDOW_MS}ms`,
  "| config | " + keys.map(k => k[1] + " median (min–max)").join(" | ") + " |", "|---|" + keys.map(() => "---").join("|") + "|"];
const summary = {};
for (const cfg of CONFIGS) {
  const rs = results.filter(r => r.cfg === cfg);
  summary[cfg] = Object.fromEntries(keys.map(([k]) => [k, median(rs.map(r => r[k]))]));
  lines.push(`| ${cfg} | ` + keys.map(([k, , d]) => { const v = rs.map(r => r[k]); return `${f(median(v), d)} (${f(Math.min(...v), d)}–${f(Math.max(...v), d)})`; }).join(" | ") + " |");
}
if (summary.none) lines.push("", "delta vs none (medians): " + CONFIGS.filter(c => c !== "none").map(c => `${c}: JS +${f(summary[c].jsKB - summary.none.jsKB, 1)} KB, TBT ${summary[c].tbt - summary.none.tbt >= 0 ? "+" : ""}${f(summary[c].tbt - summary.none.tbt)} ms, LCP ${f(summary[c].lcp - summary.none.lcp)} ms, INP ${f(summary[c].inp - summary.none.inp)} ms`).join("; "));
console.log(lines.join("\n"));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ mode: MODE, runs: RUNS, phReal: PH_REAL, results, summary }, null, 1));
