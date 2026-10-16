/* Blur gate + device tier (20261013-T40, brain analytics-2026-10-13/DEVICES.md). Runs in <head>, before the first paint.
   Sets html.fx-blur or html.fx-dim. A glass surface (app.css .glass) blurs only on fx-blur; fx-dim = a plain dim, no backdrop-filter.
   Tony (Oct 13): "if weak phone/computer, auto not blur and instead do the dim as a replacement. blur minimally."
   Dim when ANY of: reduced transparency, Save-Data, no backdrop-filter, iOS < 17, deviceMemory <= 4, cores <= 4 (tie-break: only
   when deviceMemory is unknown and it is not iOS; Safari's core count is unverified), or the frame probe failed (p95 > 24 ms or
   median > 20 ms). The probe result is latched in localStorage "stem-fx"; the rest is read fresh on every load.
   window.stemFx = { fx, tier, why, info, fps } for telemetry.js. Never throws. */
(function () {
  "use strict";
  var W = window, N = navigator, H = document.documentElement;

  /* ---- pure helpers (exported for tests/fx.test.mjs) ---- */
  function iosMajor(ua) { var m = /(?:iPhone|iPad|iPod)[^)]*? OS (\d+)_/.exec(ua || ""); return m ? +m[1] : null; }
  /* in-app browsers (Instagram, Facebook, TikTok, …) and bare iOS web views (no "Safari/" in the UA) */
  function webview(ua) {
    ua = ua || "";
    return /FBAN|FBAV|Instagram|Snapchat|TikTok|musical_ly|Line\/|Discord|GSA\/|; wv\)/.test(ua) || (/(iPhone|iPad|iPod)/.test(ua) && !/Safari\//.test(ua));
  }
  /* d = { rt, saveData, blurOk, ios, mem, cores, fpsBad } → { fx, tier, why[] }. tier = hardware only; prefs dim without making it weak */
  function gate(d) {
    var hw = [], pref = [];
    if (d.rt) pref.push("reduced_transparency");
    if (d.saveData) pref.push("save_data");
    if (!d.blurOk) hw.push("no_backdrop_filter");
    if (d.ios != null && d.ios < 17) hw.push("ios_lt_17");
    if (typeof d.mem === "number" && d.mem <= 4) hw.push("mem_le_4");
    if (typeof d.cores === "number" && d.cores <= 4 && typeof d.mem !== "number" && d.ios == null) hw.push("cores_le_4");
    if (d.fpsBad) hw.push("fps");
    var why = pref.concat(hw);
    return { fx: why.length ? "dim" : "blur", tier: hw.length ? "weak" : "strong", why: why };
  }
  /* frame deltas (ms) → { fps_med, frame_p95_ms, dropped_pct, bad } */
  function frameStats(dt) {
    if (!dt || !dt.length) return null;
    var s = dt.slice().sort(function (a, b) { return a - b; });
    var at = function (q) { return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    var med = at(0.5), p95 = at(0.95);
    var dropped = dt.filter(function (x) { return x > 25; }).length;   // > 1.5 frames at 60 Hz
    return { fps_med: Math.round(1000 / med), frame_p95_ms: Math.round(p95 * 10) / 10, dropped_pct: Math.round(dropped / dt.length * 100), bad: p95 > 24 || med > 20 };
  }

  var api = { gate: gate, iosMajor: iosMajor, webview: webview, frameStats: frameStats };
  W.__stemFx = api;

  var mq = function (q) { try { return matchMedia(q).matches; } catch (e) { return false; } };
  var sup = function (p) { try { return CSS.supports(p, "blur(1px)"); } catch (e) { return false; } };
  var latched = false; try { latched = localStorage.getItem("stem-fx") === "dim"; } catch (e) { /* blocked */ }
  var c = N.connection || {}, ua = N.userAgent || "";
  var info = {
    hw_cores: typeof N.hardwareConcurrency === "number" ? N.hardwareConcurrency : null,
    dev_mem: typeof N.deviceMemory === "number" ? N.deviceMemory : null,
    dpr: W.devicePixelRatio || null,
    save_data: c.saveData === true, eff_type: c.effectiveType || null,
    reduced_motion: mq("(prefers-reduced-motion: reduce)"), reduced_transparency: mq("(prefers-reduced-transparency: reduce)"),
    contrast: mq("(prefers-contrast: more)") ? "more" : mq("(prefers-contrast: less)") ? "less" : null,
    ios_ver: iosMajor(ua), webview: webview(ua), blur_supported: sup("backdrop-filter") || sup("-webkit-backdrop-filter")
  };
  function apply(fpsBad) {
    var g = gate({ rt: info.reduced_transparency, saveData: info.save_data, blurOk: info.blur_supported, ios: info.ios_ver, mem: info.dev_mem, cores: info.hw_cores, fpsBad: fpsBad });
    H.classList.toggle("fx-dim", g.fx === "dim");
    H.classList.toggle("fx-blur", g.fx === "blur");
    st.fx = g.fx; st.tier = g.tier; st.why = g.why;
  }
  var st = { info: info, fps: null };
  W.stemFx = st;
  try { apply(latched); } catch (e) { H.classList.add("fx-dim"); }

  /* ---- frame probe: once per session, 2 s of rAF after the first question is up and the page is idle ---- */
  function probe() {
    try {
      if (sessionStorage.getItem("stem-fx-probed")) return;
      sessionStorage.setItem("stem-fx-probed", "1");
    } catch (e) { return; }
    if (document.visibilityState !== "visible" || !W.requestAnimationFrame) return;
    var dt = [], last = 0, t0 = 0;
    function tick(t) {
      if (document.visibilityState !== "visible") return;   // hidden mid-run: throttled frames, no result
      if (last) dt.push(t - last); else t0 = t;
      last = t;
      if (t - t0 < 2000) { requestAnimationFrame(tick); return; }
      var r = frameStats(dt);
      if (!r) return;
      r.fx = st.fx;
      st.fps = r;
      if (r.bad) { try { localStorage.setItem("stem-fx", "dim"); } catch (e) { /* blocked */ } apply(true); }
      try { W.dispatchEvent(new CustomEvent("stem-fx-probe", { detail: r })); } catch (e) { /* old browser */ }
    }
    requestAnimationFrame(tick);
  }
  function later() { if (W.requestIdleCallback) requestIdleCallback(probe, { timeout: 4000 }); else setTimeout(probe, 1500); }
  W.addEventListener("load", function () {
    var f = W.stemFirst;
    if (f && f.then) f.then(later, later); else later();
  }, { once: true });
})();
