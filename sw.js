/* stem-stuff service worker. See OFFLINE.md.
 * shell (index.html, its css/js, KaTeX): cache-first. Each deploy stamps VERSION (tools/build_public.py), so a deploy = a new
 * sw.js: it precaches the whole new shell, takes over and drops the old shell cache in one go; offline.js reloads the page
 * (design/DEPLOY.md, Oct 6: the page used to climb one deploy per reload). Unstamped (serve.py, dev): updated in the
 * background, a changed file tells the page (update bar); stamped, a changed file is left to the next sw.js.
 * p/<CODE>.json: network-first, cached copy when offline.
 * k/, log/, /check and anything non-GET: never touched, never cached. */
const VERSION = "stem-v4";                                     // tools/build_public.py: "stem-<PR>-<sha>" per deploy
const STAMPED = VERSION !== "stem-v4";                         // a deploy (stamped) vs serve.py / dev (unstamped)
const SHELL = VERSION + "-shell";
const PROBS = "stem-v4-p";                                      // fixed (v4's name): problems saved for offline survive every deploy
const CDN = ["https://cdnjs.cloudflare.com/ajax/libs/KaTeX/"];
const KATEX_FONTS = ["AMS-Regular", "Caligraphic-Bold", "Caligraphic-Regular", "Fraktur-Bold", "Fraktur-Regular", "Main-Bold",
  "Main-BoldItalic", "Main-Italic", "Main-Regular", "Math-BoldItalic", "Math-Italic", "SansSerif-Bold", "SansSerif-Italic",
  "SansSerif-Regular", "Script-Regular", "Size1-Regular", "Size2-Regular", "Size3-Regular", "Size4-Regular", "Typewriter-Regular"];
const BASE = ["./", "index.html", "app.js", "app.css", "nav.js", "nav.css", "offline.js", "brainrot.js", "graph.js", "copy/payload.mjs", "shuffle.mjs", "suggest.mjs", "mode.mjs", "speak.mjs", "chg.mjs", "design/explain-box.css", "design/explain-box.js",
  "vendor/katex/katex.min.css", "vendor/katex/katex.min.js", "vendor/math.min.js", "vendor/marked.min.js",
  "vendor/fonts/atkinson.css", "vendor/fonts/atkinson-hyperlegible-latin-400-normal.woff2", "vendor/fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "vendor/fonts/atkinson-hyperlegible-mono-latin-400-normal.woff2", "vendor/fonts/atkinson-hyperlegible-mono-latin-700-normal.woff2", "vendor/fonts/press-start-2p.css", "vendor/fonts/press-start-2p-latin-400-normal.woff2",
  "rewards/engine.js", "rewards/fx.js", "rewards/icons.js", "rewards/rewards.css", "vendor/confetti.browser.js", ...KATEX_FONTS.map(f => "vendor/katex/fonts/KaTeX_" + f + ".woff2")];

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
    if (rel === "" || rel === "index.html" || rel === "stem-stuff.html" || rel === "privacy.html") return "shell";   // privacy.html: the footer link works offline too
    if (/^(tests|tools|schema|_vercel)\//.test(rel) || rel === "sw.js") return "pass";   // _vercel/: analytics, never cached
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
    .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== PROBS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const keyOf = req => {
  const u = new URL(req.url);
  if (u.origin === location.origin) u.search = "";
  if (u.href === self.registration.scope) return self.registration.scope + "index.html";
  return u.href;
};
const good = r => r && (r.ok || r.type === "opaque");

// Same sw.js, different file (dev: serve.py edits): the background refresh stores it, then tells every open page, which
// shows "New version ready. Tap to update." (offline.js). Stored first, so the tap never reloads into the old copy.
// Stamped (a deploy): a different file means the NEXT deploy, whose new sw.js is on its way. Not stored, no bar: the old
// way, the bar came first, the tap reloaded under this old worker (a half-old shell) and the new one's takeover needed a 2nd tap.
async function differs(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return true;
  const u = new Uint8Array(x), v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return true;
  return false;
}
async function newVersion() {
  for (const cl of await self.clients.matchAll({ type: "window" })) cl.postMessage({ type: "stem-update" });
}

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
    const old = hit && new URL(key).origin === location.origin ? hit.clone() : null;   // CDN files are pinned by version
    const fresh = fetch(req).then(async r => {
      if (!good(r)) return r;
      const changed = !!old && await differs(old, r.clone());
      if (changed && STAMPED) return r;                     // a deploy: its own sw.js swaps the whole shell (offline.js); never mix it into ours
      await c.put(key, r.clone());
      if (changed) newVersion();
      return r;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh.catch(() => Response.error());
  })());
});

if (typeof module !== "undefined") module.exports = { route };
