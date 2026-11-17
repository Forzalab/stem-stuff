/* CI-ARCH E EVENT TRACE: a flight recorder for a failed spec (brain projects/calc/topics/ci-arch-event-trace-2026-11-16.md).
   A red spec used to say "timeout 2000 ms" and nothing else. With this, the last things the page did (keys, clicks, popovers,
   focus, requests, errors) print under the FAIL line, as "ms before the fail", plus what was still open. A debugger for the agent.
     traceContext(ctx)   record every page of a Playwright context (read-only capture listeners + Node-side page events);
                         launchBrowser() in tests/pw-browser.mjs calls it for every context, so a spec does nothing
     report(n = 40)      the text: the last n events
     auto-dump           the first traceContext() wraps console.log: a line that starts with "FAIL" gets the report under it;
                         a spec that dies with no FAIL line (a throw outside a step) gets it at exit
     PW_TRACE=0          all of it off
   ONE clock: Node time since this module loaded, stamped when the event reaches Node, so pages and reloads need no stitching.
   No typed text, no query strings, no event payloads (a printing key is "char"; an app event is its name only).
   App seam: window.__trace(kind, detail) for state the DOM does not show. Pattern: Hotwire Turbo window.eventLogs.
   A key that never shows as `key` did not reach the top page: look for `blur window ... into iframe` and `key.in-frame`.
   Read with care: the browser fires `toggle` one task AFTER a popover opens or closes, so its line can sit below a key that came later. */
const T0 = performance.now(), OFF = process.env.PW_TRACE === "0";

/* the pure core: a ring of events + what is still open. push(page no., kind, element, detail) */
export function makeTrace({ cap = 400, now = () => performance.now() - T0 } = {}) {
  const ring = [], open = new Map(), noise = new Map(); let total = 0;
  function push(pg, k, el = "", d = "") {
    const e = { t: now(), pg, k, el: String(el), d: String(d ?? "").replace(/\s+/g, " ").slice(0, 80), n: 1 };
    total++;
    if (/^(console\.|pageerror|resp\.bad)/.test(k)) {   // a page that repeats one warning 40 times must not push the real events out: one line, counted
      const id = `${pg} ${k} ${e.el} ${e.d.replace(/[0-9A-Fa-f]{6,}/g, "#")}`, old = noise.get(id);   // the same warning with a new hex id each time is still the same warning
      if (old) { old.n++; return; }
      noise.set(id, e); e.id = id;
    }
    ring.push(e); if (ring.length > cap) { const x = ring.shift(); if (x.id) noise.delete(x.id); }
    const key = `p${pg} ${e.el}`;
    if (k === "toggle") e.d === "open" ? open.set(key, e) : open.delete(key);
    else if (k === "pop.open") { e.d ||= e.el; open.set(`p${pg} Pop`, e); }
    else if (k === "pop.close") open.delete(`p${pg} Pop`);
    else if (k === "nav") for (const o of [...open.keys()]) if (o.startsWith(`p${pg} `)) open.delete(o);   // a new document: nothing of the old one is open
  }
  function report(n = 40) {
    const at = now(), rows = ring.slice(-n), ms = e => String(Math.round(e.t - at)).padStart(7);
    const out = [`TRACE last ${rows.length} of ${total} events (ms before now · page · event · element · detail)`];
    for (const e of rows) out.push(`${ms(e)}  p${e.pg}  ${e.k.padEnd(13)} ${e.el}${e.d ? "  " + e.d : ""}${e.n > 1 ? `  (x${e.n}, first time shown)` : ""}`.trimEnd());
    out.push("  open now: " + (open.size ? [...open].map(([key, e]) => `${key} (${e.k}${e.k === "toggle" ? "" : " " + e.d}, ${Math.round(at - e.t)} ms ago)`.replace("  ", " ")).join(" · ") : "nothing"));
    return out.join("\n");
  }
  return { push, report, get size() { return ring.length; } };
}

/* runs in the page, before its scripts: capture listeners on window, so the app cannot stop them and they change nothing */
const PAGE = `(() => {
  if (window.__traceOn || !window.__traceEv) return; window.__traceOn = 1;
  if (window !== top) {   // an embed (a YouTube player) would flood the ring: from a frame, only the keys it takes. A key pressed while a frame holds focus never reaches the top page
    addEventListener("keydown", e => { try { const p = window.__traceEv("key.in-frame", location.host || "frame", e.key && e.key.length === 1 ? "char" : e.key); p && p.catch && p.catch(() => {}); } catch { /* */ } }, true);
    return;
  }
  const send = (k, el, d) => { try { const p = window.__traceEv(k, el || "", d == null ? "" : String(d)); p && p.catch && p.catch(() => {}); } catch { /* page is closing */ } };
  const name = e => { if (!e || e.nodeType !== 1) return e === document ? "document" : "window"; if (e.id) return "#" + e.id;
    const c = typeof e.className === "string" && e.className.trim().split(/\\s+/)[0]; return e.tagName.toLowerCase() + (c ? "." + c : ""); };
  const on = (t, f) => addEventListener(t, f, true);
  on("keydown", e => { const key = e.key && e.key.length === 1 ? "char" : e.key; send("key", name(e.target), key);
    setTimeout(() => { if (e.defaultPrevented) send("key.cancelled", name(e.target), key + " (the app called preventDefault)"); }, 0); });
  on("click", e => send("click", name(e.target)));
  on("focusin", e => send("focus", name(e.target)));
  addEventListener("blur", e => { if (e.target === window) setTimeout(() => send("blur", "window", "focus left the page" + (document.activeElement && document.activeElement.tagName === "IFRAME" ? " into " + name(document.activeElement) : "")), 0); });
  on("toggle", e => send("toggle", name(e.target), e.newState));
  on("animationstart", e => send("anim.start", name(e.target), e.animationName));
  on("animationend", e => send("anim.end", name(e.target), e.animationName));
  on("hashchange", () => send("hash", "", location.hash.slice(0, 40)));
  for (const n of ["drill:problem", "drill:answer", "drill:bank", "drill:pb", "drill:qlist", "drill:marks", "drill:note", "stem:layers", "stem:login", "stem:incident"])
    on(n, () => send("app", n));
  let pop = false;   /* the app's own popover (client/shell/popover.js) holds its state in a closure; it fires stem:layers on open and close */
  on("stem:layers", () => { const a = window.Pop && window.Pop.anchor && window.Pop.anchor(); if (!!a === pop) return; pop = !!a; send(pop ? "pop.open" : "pop.close", pop ? name(a) : ""); });
  window.__trace = (k, d) => send(String(k), "", d);
})();`;

const TR = makeTrace(), seen = new WeakMap(), traced = new WeakSet(); let pages = 0, hooked = false;
const path = u => { try { return new URL(u).pathname; } catch { return String(u).slice(0, 60); } };

export const report = n => TR.report(n);

export async function traceContext(ctx) {
  if (OFF || traced.has(ctx)) return ctx;   // browser.newPage() makes its context through newContext(): once is enough
  traced.add(ctx);
  const no = page => { if (!page) return 0; if (!seen.has(page)) seen.set(page, ++pages); return seen.get(page); };
  await ctx.exposeBinding("__traceEv", ({ page }, k, el, d) => { TR.push(no(page), k, el, d); });
  await ctx.addInitScript(PAGE);
  const net = (k, tail) => r => { let f; try { f = r.frame(); } catch { return; }   // a service worker request has no frame
    if (f === f.page().mainFrame() && /^(document|fetch|xhr)$/.test(r.resourceType())) TR.push(no(f.page()), k, `${r.method()} ${path(r.url())}`, tail(r)); };
  ctx.on("request", net("req", () => ""));
  ctx.on("requestfailed", net("req.failed", r => r.failure()?.errorText || ""));
  ctx.on("response", r => { const q = r.request(), main = /^(document|fetch|xhr)$/.test(q.resourceType());
    if (main || r.status() < 400) return net("resp", () => r.status())(q);
    let pg = 0; try { pg = no(q.frame().page()); } catch { /* no frame */ }          // a script, style, font or embed that failed: any frame, with its host
    let u = q.url(); try { const x = new URL(u); u = x.host + x.pathname; } catch { /* keep */ }
    TR.push(pg, "resp.bad", `${q.method()} ${u.slice(0, 90)}`, `${r.status()} ${q.resourceType()}`); });
  const watch = page => { no(page);
    page.on("framenavigated", f => { if (f === page.mainFrame()) TR.push(no(page), "nav", path(f.url())); });
    page.on("pageerror", e => TR.push(no(page), "pageerror", "", e.message));
    page.on("console", m => { const t = m.type(); if (t === "error" || t === "warning") TR.push(no(page), "console." + t.slice(0, 4), "", m.text()); }); };   // the app's own incident line is a warning
  ctx.pages().forEach(watch); ctx.on("page", watch);
  if (!hooked) { hooked = true; const log = console.log; let dumped = false;
    console.log = (...a) => { log(...a); if (typeof a[0] === "string" && /^FAIL\b/.test(a[0]) && TR.size) { dumped = true; log(TR.report()); } };
    process.on("exit", code => { if (code && !dumped && TR.size) log(TR.report()); }); }   // a throw outside a step prints no FAIL line
  return ctx;
}
