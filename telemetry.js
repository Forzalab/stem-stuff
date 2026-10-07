/* Telemetry (design/plans/TELEMETRY.md): PostHog + Microsoft Clarity, loaded AFTER the first question is on screen.
   window.stemT(name, props) is the one entry point (app.js calls it as window.stemT?.(...)). It never throws, never blocks.
   Off (stemT stays a no-op, nothing loads, nothing is said) when:
     - Do Not Track or Global Privacy Control is on;
     - the build stamped no key (<meta name="stem-t">: local runs, preview deploys, the offline download).
   Before the libraries load, events wait in a small queue; a bail before then goes out as one raw beacon to PostHog.
   Recording is unmasked on purpose (D20/D24): no mask options here, Clarity masking is off in its dashboard. */
(function () {
  "use strict";
  var W = window, D = document, N = navigator;
  var noop = function () {};
  W.stemT = noop;
  var T0 = W.performance && performance.now ? performance.now() : 0;
  var now = function () { return W.performance && performance.now ? performance.now() : Date.now(); };

  /* ---- pure helpers (exported for tests/telemetry.test.mjs) ---- */
  function optedOut(nav, win) {
    try {
      return nav.doNotTrack === "1" || nav.doNotTrack === "yes" || (win && win.doNotTrack === "1") || nav.msDoNotTrack === "1" || !!nav.globalPrivacyControl;
    } catch (e) { return true; }   // can't tell: stay off
  }
  function readConfig(doc) {
    var m = doc.querySelector('meta[name="stem-t"]');
    if (!m) return null;
    var ph = m.getAttribute("content") || "", cl = m.getAttribute("data-clarity") || "", host = m.getAttribute("data-host") || "https://us.i.posthog.com";
    if (!/^phc_\w+$/.test(ph)) ph = "";
    if (!/^[a-z0-9]+$/i.test(cl)) cl = "";
    if (!/^https:\/\/[\w.-]+$/.test(host)) host = "https://us.i.posthog.com";
    return ph || cl ? { ph: ph, cl: cl, host: host } : null;
  }
  /* guess-spam: a pick < 2 s after the question opened, or the 3rd pick inside 10 s */
  function spamCheck(picks, t, msOpen) {
    while (picks.length && t - picks[0] > 10000) picks.shift();
    picks.push(t);
    if (msOpen != null && msOpen < 2000) return "fast";
    if (picks.length >= 3) return "burst";
    return "";
  }
  /* rage tap: 3+ taps inside 700 ms within 30 px of each other */
  function rageCheck(taps, t, x, y) {
    while (taps.length && t - taps[0].t > 700) taps.shift();
    taps.push({ t: t, x: x, y: y });
    var near = taps.filter(function (p) { return Math.abs(p.x - x) <= 30 && Math.abs(p.y - y) <= 30; });
    if (near.length >= 3) { taps.length = 0; return true; }
    return false;
  }
  W.__stemTelemetry = { optedOut: optedOut, readConfig: readConfig, spamCheck: spamCheck, rageCheck: rageCheck };

  var cfg;
  try { if (optedOut(N, W)) return; cfg = readConfig(D); } catch (e) { return; }
  if (!cfg) return;

  /* ---- state ---- */
  var queue = [], ph = null, loading = false, bailed = false;
  var st = { stage: "start", code: null, openAt: 0, picks: [], taps: [], askAt: 0, tokAt: 0, clAt: 0, clPct: 0 };
  var restored = false;
  try { restored = !!(localStorage.getItem("stem-src") || localStorage.getItem("stem-codes")); } catch (e) { /* storage blocked */ }
  var did;   // our anonymous id, shared with PostHog (bootstrap) so an early bail and later events are one person
  try { did = localStorage.getItem("stem-tid"); } catch (e) { /* blocked */ }
  if (!did) { did = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); try { localStorage.setItem("stem-tid", did); } catch (e) { /* blocked */ } }

  function send(name, props, beacon) {
    props = props || {};
    if (ph) {
      try { ph.capture(name, props, beacon ? { transport: "sendBeacon", send_instantly: true } : undefined); } catch (e) { /* never the app's problem */ }
      return;
    }
    if (queue.length < 200) queue.push({ event: name, properties: props, timestamp: new Date().toISOString() });
  }
  function rawFlush() {   // PostHog not loaded yet (a bail in the first seconds): one beacon with the queue
    if (!cfg.ph || !queue.length || !N.sendBeacon) return;
    try {
      var batch = queue.splice(0).map(function (e) {
        var p = {}; for (var k in e.properties) p[k] = e.properties[k];
        p.distinct_id = did; p.$current_url = location.href; p.$lib = "stem-beacon";
        return { event: e.event, properties: p, timestamp: e.timestamp };
      });
      N.sendBeacon(cfg.host + "/batch/", new Blob([JSON.stringify({ api_key: cfg.ph, batch: batch })], { type: "text/plain" }));
    } catch (e) { /* ignore */ }
  }

  /* ---- what the app tells us (app.js hook lines) ---- */
  function stemT(name, props) {
    try {
      var t = now(), p = {};
      if (props) for (var k in props) p[k] = props[k];
      switch (name) {
        case "_ask": st.askAt = t; st.tokAt = 0; return;                                     // Cluck's stream asked
        case "_tok": if (!st.tokAt) st.tokAt = t; return;                                    // a chunk arrived
        case "q_open":
          st.code = p.code || null; st.openAt = t; st.picks = []; st.stage = "open"; break;
        case "pick":
          if (p.ms_since_open == null && st.openAt) p.ms_since_open = Math.round(t - st.openAt);
          if (!("sure" in p)) p.sure = null;                                                // the bet (D52) fills it later
          if (p.verdict === "correct" || p.verdict === "wrong") {
            st.stage = p.right ? "right" : "wrong";
            var why = spamCheck(st.picks, t, p.ms_since_open);
            send(name, p);
            if (why) send("guess_spam", { code: p.code, why: why, ms_since_open: p.ms_since_open, picks_10s: st.picks.length });
            return;
          }
          break;
        case "cluck_open": st.stage = "cluck"; st.clAt = t; st.clPct = 0; break;
        case "cluck_stream":
          if (p.first_token_ms == null) p.first_token_ms = st.askAt && st.tokAt ? Math.round(st.tokAt - st.askAt) : null;
          st.askAt = 0; break;
        case "cluck_dwell":
          if (!st.clAt) return;
          p.ms = Math.round(t - st.clAt); p.scrolled_pct = Math.round(Math.max(st.clPct, clScroll()) * 100); st.clAt = 0; break;
        case "next": st.stage = "next"; break;
      }
      if (st.code && p.code == null && name !== "app_load") p.code = st.code;
      send(name, p);
    } catch (e) { /* never break the app */ }
  }
  W.stemT = stemT;

  /* ---- what we watch ourselves ---- */
  function clScroll() {
    var b = D.querySelector("#cluck .cl-bd") || D.getElementById("cluck");
    if (!b || !b.scrollHeight) return 0;
    return Math.min(1, (b.scrollTop + b.clientHeight) / b.scrollHeight);
  }
  function during() {
    if (D.querySelector("#cluck .wtext.wrun") || D.querySelector("#cluck.wbusy")) return "stream";
    return st.code ? "question" : "start";
  }
  function label(el) {
    if (!el || !el.tagName) return "";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return s.slice(0, 80);
  }
  var LIVE = "a,button,input,textarea,select,label,summary,[role=button],[role=radio],[role=checkbox],[role=separator],[tabindex],.opt,.pad-fab,.sash,.more";
  var DEAD = ".fig,.katex,.md,.pcode,.ptitle,.chg-chip";
  D.addEventListener("pointerdown", function (e) {
    try {
      if (rageCheck(st.taps, now(), e.clientX, e.clientY)) send("rage_tap", { el: label(e.target), stage: st.stage, code: st.code });
      var tg = e.target && e.target.closest ? e.target : null;
      if (tg && tg.closest(DEAD) && !tg.closest(LIVE)) send("dead_tap", { el: label(tg.closest(DEAD)), code: st.code });
    } catch (x) { /* ignore */ }
  }, { capture: true, passive: true });
  D.addEventListener("click", function (e) {
    try { if (e.target && e.target.closest && e.target.closest("#qnext")) stemT("next", {}); } catch (x) { /* ignore */ }
  }, { capture: true, passive: true });
  D.addEventListener("scroll", function (e) {
    try { if (st.clAt && e.target && e.target.closest && e.target.closest("#cluck")) st.clPct = Math.max(st.clPct, clScroll()); } catch (x) { /* ignore */ }
  }, { capture: true, passive: true });
  function away(kind) {
    try {
      if (bailed) return;
      bailed = true;
      if (st.clAt) stemT("cluck_dwell");
      send("tab_away", { during: during(), stage: st.stage, code: st.code }, true);
      send("bail", { stage: st.stage, code: st.code, via: kind, ms_on_page: Math.round(now() - T0) }, true);
      if (!ph) rawFlush();
    } catch (x) { /* ignore */ }
  }
  D.addEventListener("visibilitychange", function () { if (D.visibilityState === "hidden") away("hidden"); else bailed = false; });
  W.addEventListener("pagehide", function () { away("pagehide"); });

  /* ---- app_load: once the first question (or the start page) is up ---- */
  function appLoad() {
    try {
      var nav = W.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
      var mq = function (q) { try { return matchMedia(q).matches; } catch (e) { return false; } };
      var s = null; try { s = new URLSearchParams(location.search).get("s"); } catch (e) { /* old browser */ }
      stemT("app_load", {
        ms_to_first_q: Math.round(now()), nav_type: nav ? nav.type : null, restored_progress: restored, s: s,
        display_mode: N.standalone || mq("(display-mode: standalone)") ? "standalone" : "browser",
        prefers_color_scheme: mq("(prefers-color-scheme: light)") ? "light" : "dark", has_code: !!st.code
      });
    } catch (e) { /* ignore */ }
  }

  /* ---- loaders (after the first question is on screen, when the browser is idle) ---- */
  function loadPostHog() {
    if (!cfg.ph) return;
    var s = D.createElement("script");
    s.async = true; s.crossOrigin = "anonymous";
    s.src = cfg.host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js";
    s.onload = function () {
      try {
        var p = W.posthog;
        if (!p || !p.init) return;
        p.init(cfg.ph, {
          api_host: cfg.host, respect_dnt: true, person_profiles: "always", persistence: "localStorage+cookie",
          bootstrap: { distinctID: did }, capture_pageview: true, capture_pageleave: true, autocapture: true,
          mask_all_text: false, mask_all_element_attributes: false,
          session_recording: { maskAllInputs: false, maskTextSelector: null },
          loaded: function (inst) {
            ph = inst;
            var q = queue.splice(0);
            for (var i = 0; i < q.length; i++) { try { inst.capture(q[i].event, q[i].properties, { timestamp: new Date(q[i].timestamp) }); } catch (e) { /* skip */ } }
          }
        });
      } catch (e) { /* ignore */ }
    };
    s.onerror = noop;
    D.head.appendChild(s);
  }
  function loadClarity() {
    if (!cfg.cl) return;
    try {
      W.clarity = W.clarity || function () { (W.clarity.q = W.clarity.q || []).push(arguments); };
      var s = D.createElement("script");
      s.async = true; s.src = "https://www.clarity.ms/tag/" + cfg.cl; s.onerror = noop;
      D.head.appendChild(s);
    } catch (e) { /* ignore */ }
  }
  function boot() {
    if (loading) return;
    loading = true;
    try { loadPostHog(); } catch (e) { /* ignore */ }
    try { loadClarity(); } catch (e) { /* ignore */ }
  }
  function later() {
    if (W.requestIdleCallback) requestIdleCallback(boot, { timeout: 3000 }); else setTimeout(boot, 1200);
  }
  var started = false;
  function first() {   // after DOMContentLoaded: app.js (a module, it runs after this file) has set window.stemFirst by then
    if (started) return;
    started = true;
    var f = W.stemFirst;
    var done = function () { appLoad(); if (D.readyState === "complete") later(); else W.addEventListener("load", later, { once: true }); };
    if (f && f.then) f.then(done, done); else done();
  }
  setTimeout(boot, 15000);   // the app never signalled: load anyway
  if (D.readyState === "complete") first();
  else {
    D.addEventListener("DOMContentLoaded", function () { setTimeout(first, 0); }, { once: true });
    W.addEventListener("load", first, { once: true });
  }
})();
