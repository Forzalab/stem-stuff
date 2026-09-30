/* stem-stuff service worker. See OFFLINE.md.
 * shell (index.html, its css/js, KaTeX): cache-first, updated in the background.
 * p/<CODE>.json: network-first, cached copy when offline.
 * k/, log/, /check and anything non-GET: never touched, never cached. */
const VERSION = "stem-v3";
const SHELL = VERSION + "-shell";
const PROBS = VERSION + "-p";
const CDN = ["https://cdnjs.cloudflare.com/ajax/libs/KaTeX/"];
const KATEX_FONTS = ["AMS-Regular", "Caligraphic-Bold", "Caligraphic-Regular", "Fraktur-Bold", "Fraktur-Regular", "Main-Bold",
  "Main-BoldItalic", "Main-Italic", "Main-Regular", "Math-BoldItalic", "Math-Italic", "SansSerif-Bold", "SansSerif-Italic",
  "SansSerif-Regular", "Script-Regular", "Size1-Regular", "Size2-Regular", "Size3-Regular", "Size4-Regular", "Typewriter-Regular"];
const BASE = ["./", "index.html", "app.js", "app.css", "nav.js", "nav.css", "offline.js", "graph.js", "copy/payload.mjs", "shuffle.mjs", "design/explain-box.css", "design/explain-box.js",
  "vendor/katex/katex.min.css", "vendor/katex/katex.min.js", "vendor/math.min.js", "vendor/marked.min.js",
  "vendor/fonts/atkinson.css", "vendor/fonts/atkinson-hyperlegible-latin-400-normal.woff2", "vendor/fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "vendor/fonts/atkinson-hyperlegible-mono-latin-400-normal.woff2", "vendor/fonts/atkinson-hyperlegible-mono-latin-700-normal.woff2", ...KATEX_FONTS.map(f => "vendor/katex/fonts/KaTeX_" + f + ".woff2")];

// Pure routing decision; also used by tests/offline.test.mjs. scope = registration scope URL.
function route(url, method, scope) {
  if (method !== "GET") return "pass";
  const u = new URL(url), s = new URL(scope);
  const same = u.origin === s.origin;
  if (same) {
    const rel = u.pathname.startsWith(s.pathname) ? u.pathname.slice(s.pathname.length) : null;
    if (rel === null) return "pass";
    if (/(^|\/)(k|log)\//.test(rel) || /(^|\/)check(\/|$)/.test(rel) || /^\.|\/\./.test(rel)) return "pass";
    if (/^p\/[A-Za-z0-9_-]+\.json$/.test(rel)) return "problem";
    if (rel === "" || rel === "index.html" || rel === "stem-stuff.html") return "shell";
    if (/^(tests|tools|schema)\//.test(rel) || rel === "sw.js") return "pass";
    if (/^[\w./-]+\.(js|mjs|css|woff2|svg|png|ico)$/.test(rel) && !rel.includes("..")) return "shell";
    return "pass";
  }
  return CDN.some(c => u.href.startsWith(c)) ? "shell" : "pass";
}

async function precache() {
  const c = await caches.open(SHELL);
  const urls = new Set(BASE);
  // Pick up whatever index.html actually loads (CDN KaTeX version, extra assets).
  try {
    const html = await (await fetch("index.html", { cache: "no-store" })).text();
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const abs = new URL(m[1], self.registration.scope).href;
      if (route(abs, "GET", self.registration.scope) === "shell") urls.add(m[1]);
      const k = abs.match(/^(.*\/)katex(\.min)?\.css$/);
      if (k) for (const f of KATEX_FONTS) urls.add(k[1] + "fonts/KaTeX_" + f + ".woff2");
    }
  } catch (e) { /* offline during install: base list only */ }
  await Promise.all([...urls].map(async u => {
    try {
      const abs = new URL(u, self.registration.scope);
      const r = await fetch(abs, abs.origin === location.origin ? { cache: "no-store" } : { mode: "cors" });
      if (r.ok) await c.put(abs, r);
    } catch (e) { /* missing asset: skip */ }
  }));
}

self.addEventListener("install", e => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION + "-")).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const keyOf = req => {
  const u = new URL(req.url);
  if (u.origin === location.origin) u.search = "";
  if (u.href === self.registration.scope) return self.registration.scope + "index.html";
  return u.href;
};
const good = r => r && (r.ok || r.type === "opaque");

self.addEventListener("fetch", e => {
  const req = e.request;
  const kind = route(req.url, req.method, self.registration.scope);
  if (kind === "pass") return;
  const key = keyOf(req);
  if (kind === "problem") {
    e.respondWith((async () => {
      const c = await caches.open(PROBS);
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);   // never hang (design/RELOAD.md)
        const r = await fetch(req, { signal: ctl.signal }).finally(() => clearTimeout(t));
        if (r.ok) await c.put(key, r.clone());
        return r;
      } catch (err) {
        return (await c.match(key)) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(key);
    const fresh = fetch(req).then(async r => { if (good(r)) await c.put(key, r.clone()); return r; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh.catch(() => Response.error());
  })());
});

if (typeof module !== "undefined") module.exports = { route };
