/* Flight recorder (brain sprint-render-v2/flight-recorder-DESIGN.md, P1; Tony Oct 19: "capture the site's stages and API status at the
   point of error, like a log of everything"). A ring of the last 256 things the page did, in memory only, for everyone: nothing leaves
   the device from here. incident.mjs asks snap() for the last 64 entries + the last 20 keyboard/focus entries + the page state (page.at)
   and sends them ONLY inside an incident report, ONLY to troubleshoot that code, and never under DNT / GPC / "Don't record me".
   Every entry is a flat array [t, kind, a, b, c, d]: t = ms since the page started (rounded), then numbers, codes, our own tags.
   Never recorded, even here: typed / tapped text, answers, notes, chat, Cluck's reply, any field's value (only its length), printable
   key values, e.code, InputEvent.data, clipboard, pointer positions, key timing finer than 100 ms.
   Kinds: boot nav stage pick net rid cluck sw conn vis err flag ev budget kb (§1a) + layout (Tony 11:2x: "log everything non-sensitive"):
   vp (resize) scroll cls (layout shift) box (key controls on a stage change) mq (theme / media queries) load (a font / image / script
   that failed) ro (key nodes resized). Listeners are passive and capture; scroll / resize / ResizeObserver / visualViewport reach the
   ring at most 4 times a second, read in one timer, so no per-frame work. window.stemFR = { log, req, snap, page, kb }. Never throws. */
(function () {
  "use strict";
  var W = window, D = document, P = W.performance;
  var RING = 256, KB = 32, SNAP_RING = 64, SNAP_KB = 20, CAP = 16384, THROTTLE = 250;
  var R = [], K = [];                          // the ring and the keyboard sub-ring (a typing burst cannot evict the net / cluck history)
  var now = function () { return P && P.now ? Math.round(P.now()) : 0; };

  /* ---- pure helpers (exported as stemFR._t for tests/flight.test.mjs) ---- */
  function push(ring, max, e) { ring.push(e); if (ring.length > max) ring.splice(0, ring.length - max); return e; }
  /* e-mails and runs of 5+ digits blanked, 120 chars (the design's err rule; incident.mjs errText sends the whole message itself) */
  function blank(s) {
    return String(s == null ? "" : s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "*@*").replace(/\d{5,}/g, function (m) { return "#".repeat(m.length); })
      .replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 120);
  }
  /* a node as tag#id, else tag.class1.class2, + [role]: our markup, never its text (telemetry.js label(), ≤ 40 chars) */
  function label(el) {
    if (!el || !el.tagName) return el === W ? "window" : el === D ? "document" : "";
    var s = String(el.tagName).toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    var r = el.getAttribute && el.getAttribute("role");
    if (r) s += "[" + r + "]";
    return s.slice(0, 40);
  }
  /* a key as its CLASS: printable = "char", a named key verbatim, anything else "other". Process / Unidentified: Android and IME (229) */
  var NAMED = /^(Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Process|Unidentified)$/;
  function keyClass(k) {
    if (typeof k !== "string" || !k) return "other";
    if (k === " ") return "Space";
    if (NAMED.test(k)) return k;
    return Array.from(k).length === 1 ? "char" : "other";
  }
  /* InputEvent.inputType: the enum name only (insertText, deleteContentBackward, ...), never .data */
  function inputType(t) { return typeof t === "string" && /^[a-zA-Z]{1,40}$/.test(t) ? t : "other"; }
  function len(el) { try { return el && typeof el.value === "string" ? el.value.length : null; } catch (x) { return null; } }
  /* flags: ctrl 1, alt 2, meta 4, shift 8, isComposing 16, repeat 32, defaultPrevented 64, selection collapsed 128 */
  function flags(e, el) {
    var f = (e.ctrlKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0) | (e.isComposing ? 16 : 0) | (e.repeat ? 32 : 0) | (e.defaultPrevented ? 64 : 0);
    try { if (el && typeof el.selectionStart === "number" && el.selectionStart === el.selectionEnd) f |= 128; } catch (x) { /* number inputs throw */ }
    return f;
  }
  var t100 = function () { return Math.round(now() / 100) * 100; };   // key rhythm is a fingerprint: 100 ms, even on the device
  /* one keyboard / focus event as [t100, "kb", ev, target, key, flags, len0, len1, rep] */
  var lastLen = typeof WeakMap === "function" ? new WeakMap() : null;
  function kbEntry(ev, e) {
    var el = e.target, n = len(el), was = lastLen && el && typeof el === "object" ? lastLen.get(el) : undefined;
    if (lastLen && n != null) lastLen.set(el, n);
    if (ev === "kd") {
      var prev = K[K.length - 1];
      if (e.repeat && prev && prev[2] === "kd" && prev[3] === label(el)) { prev[8] = (prev[8] || 0) + 1; return prev; }   // a held key: one entry, a count
      return push(K, KB, [t100(), "kb", "kd", label(el), keyClass(e.key), flags(e, el), n]);
    }
    if (ev === "in") return push(K, KB, [t100(), "kb", "in", label(el), inputType(e.inputType), flags(e, el), was == null ? null : was, n]);
    return push(K, KB, [t100(), "kb", ev, label(el), null, flags(e, el), n]);
  }
  /* the incident snapshot: the last SNAP_RING entries + SNAP_KB kb entries + page.at; over CAP bytes: the oldest ring entries go first,
     then the kb entries, then the page */
  function fit(o, cap) {
    var s = JSON.stringify(o);
    while (s.length > cap && o.ring.length) { o.ring.splice(0, Math.max(1, Math.ceil(o.ring.length / 8))); o.cut = 1; s = JSON.stringify(o); }
    while (s.length > cap && o.kb.length) { o.kb.shift(); o.cut = 1; s = JSON.stringify(o); }
    if (s.length > cap) { o.page = null; o.cut = 1; }
    return o;
  }
  /* a page that keeps failing sends a snapshot at most 3 times in 10 minutes (localStorage "stem-inc" = [time, ...]); the same failure
     (where, reason, status) inside 60 s sends none, only a count and the first code (the student taps Try again 3 times, Tony reads 1) */
  var RATE_N = 3, RATE_MS = 600000, DUP_MS = 60000;
  function gate(key, t, times, last) {
    if (last && last.key === key && t - last.t < DUP_MS) { last.n++; return { dup: last.code, n: last.n }; }
    times = times.filter(function (x) { return t - x < RATE_MS; });
    if (times.length >= RATE_N) return { rate: 1, times: times };
    times.push(t);
    return { ok: 1, times: times };
  }

  /* ---- the ring ---- */
  function log(k, a, b, c, d) {
    try { var e = [now(), k]; for (var i = 1; i < arguments.length; i++) e.push(arguments[i]); push(R, RING, e); } catch (x) { /* never the page's problem */ }
  }
  /* one request's lifecycle (OTel's shape: a span with phases): s(tart), h(eaders) status + ms + bytes (content-length), f(irst byte),
     e(nd) total bytes, x (error) its name. Plus `rid`: Vercel's x-vercel-id and the W3C trace id of the request (incident.mjs traceparent) */
  function req(ep, tp) {
    var t0 = now(), ms = function () { return now() - t0; }, first = true;
    ep = String(ep || "?").slice(0, 16);
    log("net", ep, "s");
    return {
      h: function (r) {
        try {
          var cl = r.headers.get("content-length");
          log("net", ep, "h", r.status, ms(), cl == null ? null : +cl);
          var id = (r.headers.get("x-vercel-id") || "").slice(0, 40), tr = (/^00-([0-9a-f]{32})-/.exec(tp || "") || [])[1];
          if (id || tr) log("rid", ep, id || null, tr || null);
        } catch (x) { /* ignore */ }
      },
      f: function () { if (first) { first = false; log("net", ep, "f", null, ms()); } },
      e: function (bytes) { log("net", ep, "e", null, ms(), bytes == null ? null : bytes); },
      x: function (err) { log("net", ep, "x", String(err && err.name || "Error").slice(0, 24), ms()); },
    };
  }

  /* ---- page.at: the page's STATE at the failure (§8 option 1). Our classes, ids, numbers and boxes; never a node's text or value.
     The only strings read from the page are our own status lines, sent only as the known prefix we wrote, else as a length ---- */
  var OURS = ["Cluck didn't load", "Cluck is out of wishes", "Cluck stopped early", "Didn't load", "Too slow", "Saved", "Copied", "Not found", "Offline"];
  function ours(el) {
    if (!el) return null;
    var t = String(el.textContent || "").trim();
    for (var i = 0; i < OURS.length; i++) if (t.indexOf(OURS[i]) === 0) return OURS[i];
    return t.length;
  }
  var BOXES = ["#qnext", "#mcGo", "#ansGo", "#wish", "#cluck", "#scratch", "#padFab", "#freeze", "#entry", "#updateBar", ".ck-peek", ".wretry"];
  function boxes() {
    var out = [], vw = W.innerWidth, vh = W.innerHeight;
    for (var i = 0; i < BOXES.length; i++) {
      var el = D.querySelector(BOXES[i]);
      if (!el || !el.getBoundingClientRect) continue;
      var b = el.getBoundingClientRect(), on = b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < vh && b.left < vw ? 1 : 0;
      out.push([BOXES[i], Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height), on]);
    }
    return out;
  }
  function hashCode() { var h = String(W.location && W.location.hash || ""); return /^#[A-Za-z0-9_]{0,40}$/.test(h) ? h : "#[" + h.length + "]"; }
  function page() {
    try {
      var H = D.documentElement, vv = W.visualViewport, bd = D.querySelector("#cluck .cl-bd"), sw = W.navigator.serviceWorker;
      var app = null; try { app = W.__drill && W.__drill.page || null; } catch (x) { /* app.js not up */ }
      return {
        app: app, html: String(H.className || "").split(/\s+/).filter(Boolean).slice(0, 16).join(" "), hash: hashCode(),
        vw: W.innerWidth, vh: W.innerHeight, vvh: vv ? Math.round(vv.height) : null, dpr: W.devicePixelRatio, sy: Math.round(W.scrollY || 0),
        clScroll: bd ? [Math.round(bd.scrollTop), bd.scrollHeight] : null, ready: D.readyState, vis: D.visibilityState, online: W.navigator.onLine,
        fonts: D.fonts ? D.fonts.status : null, katex: !!W.katex, figs: D.querySelectorAll("#blocks .fig").length, figOff: D.querySelectorAll("#blocks .fig-off").length,
        anim: D.getAnimations ? D.getAnimations().length : null, active: label(D.activeElement), sw: sw ? (sw.controller ? "ctl" : "noctl") : "nosw",
        said: { toast: ours(D.getElementById("toast")), entry: ours(D.getElementById("entryMsg")), wl: ours(D.querySelector("#cluck .wl")) },
        bar: !!D.getElementById("updateBar"), fx: !!D.querySelector(".fx-ov"), retry: !!D.querySelector("#retryLoad:not([hidden])"),
        duck: W.stemDuck ? !!W.stemDuck.up : null, boxes: boxes(),
      };
    } catch (x) { return { err: blank(x && x.message) }; }
  }
  /* incident.mjs: the snapshot for one incident (r = its record; cap = the bytes left in its report), or { dup, n } / { rate } when gated (see gate) */
  var lastInc = null;
  function snap(r, cap) {
    try {
      var t = Date.now(), key = [r.where, r.reason, r.status].join("|"), times = [];
      try { times = JSON.parse(W.localStorage.getItem("stem-inc") || "[]"); if (!Array.isArray(times)) times = []; } catch (x) { /* blocked */ }
      var g = gate(key, t, times, lastInc);
      if (g.dup) return { dup: g.dup, n: g.n };
      try { W.localStorage.setItem("stem-inc", JSON.stringify(g.times)); } catch (x) { /* blocked */ }
      if (g.rate) return { rate: 1 };
      lastInc = { key: key, t: t, code: r.code, n: 1 };
      log("inc", r.code, r.where, r.reason);
      return fit({ ring: R.slice(-SNAP_RING), kb: K.slice(-SNAP_KB), page: { at: page() },
        dev: { dpr: W.devicePixelRatio, vw: W.innerWidth, vh: W.innerHeight, mem: W.navigator.deviceMemory || null, cores: W.navigator.hardwareConcurrency || null,
          tier: W.stemFx ? W.stemFx.tier : null } }, Math.min(CAP, cap || CAP));
    } catch (x) { return null; }
  }
  W.stemFR = { log: log, req: req, snap: snap, page: page, kb: K, ring: R,
    _t: { push: push, blank: blank, label: label, keyClass: keyClass, inputType: inputType, kbEntry: kbEntry, fit: fit, gate: gate, CAP: CAP } };

  /* ---- what the recorder watches itself (one listener per type, passive, capture) ---- */
  var on = function (tg, type, f) { try { tg.addEventListener(type, function (e) { try { f(e); } catch (x) { /* never */ } }, { capture: true, passive: true }); } catch (x) { /* old browser */ } };
  var mm = function (q) { try { return W.matchMedia(q).matches ? 1 : 0; } catch (x) { return null; } };
  try {
    var bm = D.querySelector('meta[name="stem-build"]'), sw0 = W.navigator.serviceWorker;
    log("boot", bm ? bm.getAttribute("content") : null, bm && bm.dataset ? bm.dataset.sha || null : null, sw0 ? (sw0.controller ? "ctl" : "noctl") : "nosw", W.navigator.onLine ? "online" : "offline");
    var dbg = null, off = null; try { dbg = W.localStorage.getItem("stem-debug"); off = W.localStorage.getItem("stem-t-off"); } catch (x) { /* blocked */ }
    log("flag", "fx", W.stemFx ? W.stemFx.fx + "/" + W.stemFx.tier : null, "debug", dbg === "1" ? 1 : 0, "t_off", off === "1" ? 1 : 0, "pwa", mm("(display-mode: standalone)"));
  } catch (x) { /* ignore */ }
  /* media queries / theme: the state at boot and every change */
  var MQ = { dark: "(prefers-color-scheme: dark)", rm: "(prefers-reduced-motion: reduce)", rt: "(prefers-reduced-transparency: reduce)", coarse: "(pointer: coarse)",
    portrait: "(orientation: portrait)", pwa: "(display-mode: standalone)" };
  var mqState = function () { var s = []; for (var k in MQ) s.push(k + ":" + mm(MQ[k])); return s.join(" "); };
  log("mq", mqState());
  for (var q in MQ) { try { var l = W.matchMedia(MQ[q]); if (l && l.addEventListener) l.addEventListener("change", function () { log("mq", mqState()); }); } catch (x) { /* old Safari */ } }

  /* throttled kinds: the event only marks "dirty"; one timer reads the numbers at most every THROTTLE ms */
  var dirty = {}, timer = 0, roSizes = {}, watch = function () {};
  function flush() {
    timer = 0;
    var d = dirty; dirty = {};
    if (d.vp) log("vp", W.innerWidth, W.innerHeight, W.devicePixelRatio);
    if (d.vv && W.visualViewport) push(K, KB, [t100(), "kb", "vv", null, null, 0, Math.round(W.visualViewport.height)]);   // the on-screen keyboard opened / closed
    for (var k in d) if (k.indexOf("sc:") === 0) { var el = d[k]; log("scroll", k.slice(3), Math.round(el === D ? W.scrollY : el.scrollTop || 0), el === D ? D.documentElement.scrollHeight : el.scrollHeight); }
    for (var id in roSizes) { var s = roSizes[id]; log("ro", id, s[0], s[1]); }
    roSizes = {};
  }
  function mark(k, v) { dirty[k] = v || 1; if (!timer) timer = setTimeout(flush, THROTTLE); }
  on(W, "resize", function () { mark("vp"); });
  if (W.visualViewport) on(W.visualViewport, "resize", function () { mark("vv"); });
  on(D, "scroll", function (e) { var tg = e.target; mark("sc:" + (tg === D ? "page" : label(tg)), tg); });
  if (typeof W.ResizeObserver === "function") {
    var ro = new W.ResizeObserver(function (es) {
      for (var i = 0; i < es.length; i++) { var r = es[i].contentRect; roSizes[label(es[i].target)] = [Math.round(r.width), Math.round(r.height)]; }
      mark("ro");
    });
    var watched = typeof WeakSet === "function" ? new WeakSet() : null;
    watch = function () { ["#main", "#freeze", "#blocks", "#cluck", "#wish", "#dock"].forEach(function (s) { var el = D.querySelector(s); if (el && watched && !watched.has(el)) { watched.add(el); ro.observe(el); } }); };
    on(D, "DOMContentLoaded", watch);
  }
  /* layout shifts (CLS): each one with its value x1000, after-input flag, and the first node that moved */
  try {
    if (W.PerformanceObserver && (PerformanceObserver.supportedEntryTypes || []).indexOf("layout-shift") >= 0) {
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) { if (e.value >= 0.001) log("cls", Math.round(e.value * 1000), e.hadRecentInput ? 1 : 0, label(e.sources && e.sources[0] && e.sources[0].node)); });
      }).observe({ type: "layout-shift", buffered: true });
    }
  } catch (x) { /* no layout-shift timing (Safari, Firefox) */ }
  /* a font / image / script / stylesheet that failed to load (resource errors reach a capture listener only): its path, no query */
  on(W, "error", function (e) {
    var tg = e.target;
    if (tg && tg !== W && tg.tagName) { var u = String(tg.currentSrc || tg.src || tg.href || ""); log("load", label(tg), u.indexOf("data:") === 0 ? "data:" : u.split(/[?#]/)[0].slice(-60)); }
    else log("err", "onerror", blank(e.message), blank((String(e.filename || "").split(/[?#]/)[0].split("/").pop()) + ":" + (e.lineno || 0)));
  });
  try { if (D.fonts && D.fonts.addEventListener) D.fonts.addEventListener("loadingerror", function (e) { log("load", "font", (e.fontfaces || []).map(function (f) { return String(f.family).slice(0, 30); }).join(",")); }); } catch (x) { /* ignore */ }
  on(W, "unhandledrejection", function (e) { var r = e.reason; log("err", "unhandled", blank(r && r.name ? r.name + ": " + r.message : r)); });
  on(W, "online", function () { var c = W.navigator.connection; log("conn", "online", c ? c.effectiveType : null, c ? c.downlink : null, c ? c.rtt : null); });
  on(W, "offline", function () { log("conn", "offline"); });
  var hidAt = 0;
  on(D, "visibilitychange", function () { if (D.visibilityState === "hidden") { hidAt = now(); log("vis", "hidden"); } else log("vis", "visible", hidAt ? now() - hidAt : null); });
  on(W, "pagehide", function (e) { log("vis", "pagehide", e.persisted ? 1 : 0); });
  on(W, "pageshow", function (e) { log("vis", "pageshow", e.persisted ? 1 : 0); });
  on(W, "hashchange", function () { log("nav", hashCode(), null, "hash"); });
  try { var swc = W.navigator.serviceWorker; if (swc) swc.addEventListener("controllerchange", function () { log("sw", "ctlchange"); }); } catch (x) { /* ignore */ }
  /* keyboard & focus, content-free (§1a; Tony 10:4x). P1 events: keydown, input, composition start / end, focus in / out */
  on(D, "keydown", function (e) { kbEntry("kd", e); });
  on(D, "input", function (e) { kbEntry("in", e); });
  on(D, "compositionstart", function (e) { kbEntry("cs", e); });
  on(D, "compositionend", function (e) { kbEntry("ce", e); });
  on(D, "focusin", function (e) { kbEntry("fi", e); });
  on(D, "focusout", function (e) { kbEntry("fo", e); });

  /* the app's own milestones: telemetry's stemT calls, mirrored here (codes, verdicts, counts only). Wrapped once every script has run
     (telemetry.js and intent.js set window.stemT while loading); the call goes on unchanged, so telemetry stays exactly as it was */
  var stageBoxes = function (st) { setTimeout(function () { try { log("box", st, boxes()); watch(); } catch (x) { /* ignore */ } }, 300); };
  function mirror(name, p) {
    p = p || {};
    switch (name) {
      case "q_open": log("nav", p.code || null, p.bank || null, "open", p.type || null, p.mode || null); log("stage", "open"); stageBoxes("open"); return;
      case "pick": log("pick", p.verdict || null, p.tries_left == null ? null : p.tries_left, p.ms_since_open == null ? null : p.ms_since_open);
        if (p.verdict === "correct" || p.verdict === "wrong") { log("stage", p.right ? "right" : "wrong", p.tries_left == null ? null : p.tries_left); stageBoxes(p.right ? "right" : "wrong"); }
        return;
      case "_ask": log("cluck", "ask"); return;
      case "_tok": var last = null; for (var i = R.length - 1; i >= 0; i--) if (R[i][1] === "cluck") { last = R[i]; break; } if (!last || last[2] !== "tok") log("cluck", "tok"); return;
      case "cluck_open": log("cluck", "open", p.tab || null, null, p.auto ? 1 : 0); log("stage", "cluck"); stageBoxes("cluck"); return;
      case "cluck_dwell": log("cluck", "close"); return;
      case "cluck_stream": log("cluck", p.failed ? "fail" : "end", p.chars == null ? null : p.chars, p.failed || 0, p.auto ? 1 : 0); return;
      case "next": log("stage", "next"); return;
      case "incident": return;                                                // the ring has its own "inc" entry
      default: log("ev", String(name).slice(0, 24));
    }
  }
  function wrap() {
    var f = W.stemT;
    if (typeof f !== "function" || f.stemFR) return;
    var g = function (name, props) { try { mirror(name, props); } catch (x) { /* never */ } return f.apply(this, arguments); };
    g.stemFR = 1;
    W.stemT = g;
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", wrap); else wrap();
})();
