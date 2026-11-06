/* calc-pick.js: "Which calculator do you have?" (Tony, Nov 6). The calculator model picker, drawn in the lock-help look (lockhelp.js + app.css
   LOCK-HELP: a dimmed screen, ON it Cluck's say-line, the Cluck art, stacked buttons; no box). App chrome, never a reply format.
   Step 1: two big brand buttons (Texas Instruments, Casio) + Skip. Step 2: 3 quick-pick chips (the ladder's .rp-chip look; the most-owned models
   first), then a search field whose dropdown lists the brand's other models as you type, "Other / not sure", Back and Skip.
   SAVE: the server keeps it per sid, like quiz progress (GET / POST /calc, acct.get_calc / put_calc: it follows an account login). localStorage
   "stem-calc-model" (the model id; "skip" = Skip) is only the fast cache: on load the server's answer wins, and a cached pick the server lacks is sent up.
   A pick fires the window CustomEvent "stem-calc-model" { detail: { id, brand, name } } and onChange(fn) listeners (Skip fires nothing). Esc closes it:
   on the auto-show it counts as Skip for this session only (sessionStorage "stem-calc-model-later"), so it comes back on the next visit.
   Auto-show (index.html calls auto() once): nothing saved (cache or server), after the splash, never over the lock-help modal. Automated browsers
   (navigator.webdriver: every tests/*.pw.mjs) skip the auto-show and the /calc read unless the URL has ?calcpick=1 or window.__calcPickAuto is true.
   window.stemCalcPick = { open(), close(), get(), onChange(fn), auto(), models, up }. get() = the saved model id ("other" included) or null. */
(function () {
  "use strict";
  var KEY = "stem-calc-model", LATER = "stem-calc-model-later", EV = "stem-calc-model", g = window, d = document;
  var ART = "rewards/icons/duck-calm-nod-128.webp";   // the lock-help art (lockhelp.js LOCKHELP_ART)
  var BRANDS = { ti: "Texas Instruments", casio: "Casio" };
  var MODELS = {   // [id, name, quick-pick chip]; chips in order of how many students own them (Amazon sales trackers, retailer best-seller tags; Nov 2026)
    ti: [["ti-30xs-multiview", "TI-30XS MultiView", 1], ["ti-36x-pro", "TI-36X Pro", 1], ["ti-84-plus-ce", "TI-84 Plus CE", 1],
      ["ti-30xiis", "TI-30XIIS"], ["ti-83-plus", "TI-83 Plus"], ["ti-nspire-cx", "TI-Nspire CX"]],
    casio: [["fx-300es-plus", "fx-300ES PLUS", 1], ["fx-991ex", "fx-991EX", 1], ["fx-115es-plus", "fx-115ES PLUS", 1], ["fx-991cw", "fx-991CW"]]
  };
  var mem = null, el = null, prevFocus = null, auto0 = false, subs = [];

  function load() { try { return localStorage.getItem(KEY); } catch (e) { return mem; } }
  function cache(v) { mem = v; try { localStorage.setItem(KEY, v); } catch (e) { /* session only */ } }
  function send(v) {   // the server copy (per sid); a failure leaves the cache, which is sent up on the next load
    try { fetch("calc", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: v }) }).catch(function () {}); } catch (e) { /* */ }
  }
  function save(v) { cache(v); send(v); }
  function sync() {   // -> a promise of the saved value (server first, then the cache); never rejects
    var c = load();
    var get = fetch("calc", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; });
    var cap = new Promise(function (r) { setTimeout(function () { r(null); }, 2500); });
    return Promise.race([get, cap]).catch(function () { return null; }).then(function (j) {
      var s = j && typeof j.model === "string" ? j.model : null;
      if (s && s !== c) cache(s);
      else if (!s && c && j) send(c);   // the server answered and has none: the cached pick goes up
      return s || c;
    });
  }
  function get() { var v = load(); return v && v !== "skip" ? v : null; }
  function find(id) {
    for (var b in MODELS) for (var i = 0; i < MODELS[b].length; i++) if (MODELS[b][i][0] === id) return { id: id, brand: b, name: MODELS[b][i][1] };
    return null;
  }
  function onChange(fn) { if (typeof fn === "function") subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  function pick(id, brand) {
    var m = find(id) || { id: id, brand: brand || null, name: "Other / not sure" };
    save(id); close();
    try { g.dispatchEvent(new CustomEvent(EV, { detail: m })); } catch (e) { /* old browser */ }
    subs.forEach(function (f) { try { f(id, m); } catch (e) { /* a listener's bug is its own */ } });
  }
  function skip() { save("skip"); close(); }
  function later() { try { sessionStorage.setItem(LATER, "1"); } catch (e) { /* */ } close(); }

  function focusables() { return el ? [].slice.call(el.querySelectorAll("button, input")).filter(function (x) { return !x.disabled && x.offsetParent !== null; }) : []; }
  function keys(e) {
    if (!el) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (auto0) later(); else close(); return; }
    if (e.key !== "Tab") return;
    var f = focusables(), first = f[0], last = f[f.length - 1];
    if (!f.length) return;
    if (!el.contains(d.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function btn(cls, text, fn) {
    var b = d.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }
  function node(tag, cls, text) { var x = d.createElement(tag); x.className = cls; if (text) x.textContent = text; return x; }

  function step1() {
    el.querySelector(".lh-say").textContent = "Which calculator do you have? I will show you the fastest keys.";
    el.querySelector(".lh-col").classList.remove("cp-s2");
    var row = node("div", "cp-brands");
    Object.keys(BRANDS).forEach(function (b) { row.appendChild(btn("btn btn-label cp-brand", BRANDS[b], function () { step2(b); })); });
    var foot = node("div", "lh-btns");
    foot.appendChild(btn("btn btn-label cp-skip", "Skip", skip));
    el.querySelector(".cp-body").replaceChildren(row, foot);
    row.firstChild.focus({ preventScroll: true });
  }
  function step2(b) {
    el.querySelector(".lh-say").textContent = "Nice! Which " + (b === "ti" ? "TI" : BRANDS[b]) + " do you have?";
    el.querySelector(".lh-col").classList.add("cp-s2");
    var chipLab = node("p", "cp-lab", "Most common"); chipLab.id = "cpChipLab";
    var chips = node("div", "cp-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-labelledby", "cpChipLab");
    MODELS[b].forEach(function (m) { if (m[2]) chips.appendChild(btn("rp-chip cp-chip", m[1], function () { pick(m[0], b); })); });

    var lab = node("label", "cp-lab", "Or search all " + (b === "ti" ? "TI" : BRANDS[b]) + " models"); lab.htmlFor = "cpQ";
    var q = d.createElement("input");
    q.id = "cpQ"; q.className = "cp-q"; q.type = "search"; q.autocomplete = "off"; q.spellcheck = false; q.placeholder = b === "ti" ? "Like 83 or Nspire" : "Like 991CW";
    q.setAttribute("aria-controls", "cpList");
    var list = node("div", "cp-list"); list.id = "cpList"; list.setAttribute("role", "group"); list.setAttribute("aria-label", BRANDS[b] + " models"); list.hidden = true;
    var items = MODELS[b].map(function (m) { var x = btn("btn btn-label cp-opt", m[1], function () { pick(m[0], b); }); x.dataset.id = m[0]; list.appendChild(x); return x; });
    var none = node("p", "cp-none", "No match. Try fewer letters, or pick Other."); none.hidden = true;
    var count = node("p", "cp-sr"); count.setAttribute("aria-live", "polite");
    list.appendChild(none);
    var norm = function (s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); };
    function filter(all) {   // the dropdown: open while there is text (or after Arrow Down on an empty field)
      var t = norm(q.value), n = 0;
      items.forEach(function (x) { var ok = norm(x.textContent).indexOf(t) >= 0; x.hidden = !ok; if (ok) n++; });
      list.hidden = !t && !all; none.hidden = n > 0 || list.hidden;
      q.setAttribute("aria-expanded", String(!list.hidden));
      count.textContent = list.hidden ? "" : n + (n === 1 ? " model" : " models") + " found";
    }
    q.setAttribute("aria-expanded", "false");
    q.addEventListener("input", function () { filter(false); });
    q.addEventListener("keydown", function (e) {
      var vis = items.filter(function (x) { return !x.hidden && !list.hidden; });
      if (e.key === "Enter" && vis.length) { e.preventDefault(); vis[0].click(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) filter(true); else if (vis[0]) vis[0].focus(); }
    });
    list.addEventListener("keydown", function (e) {   // arrows walk the visible options; up from the first goes back to the field
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var opts = items.filter(function (x) { return !x.hidden; }), i = opts.indexOf(d.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === "ArrowUp" && i === 0) q.focus(); else (opts[i + (e.key === "ArrowDown" ? 1 : -1)] || opts[i]).focus();
    });
    var other = btn("btn btn-label cp-other", "Other / not sure", function () { pick("other", b); });
    var foot = node("div", "cp-foot");
    foot.appendChild(btn("btn btn-label cp-back", "Back", step1));
    foot.appendChild(btn("btn btn-label cp-skip", "Skip", skip));
    el.querySelector(".cp-body").replaceChildren(chipLab, chips, lab, q, list, count, other, foot);
    chips.firstChild.focus({ preventScroll: true });
  }

  function open(o) {
    if (el) return false;
    auto0 = !!(o && o.auto);
    prevFocus = d.activeElement;
    el = d.createElement("div");
    el.className = "cpick"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "cpSay");
    el.innerHTML = '<div class="lh-col"><p class="lh-say" id="cpSay"></p><img class="lh-duck" src="' + ART + '" alt="" width="128" height="128">' +
      '<div class="cp-body"></div></div>';
    d.body.appendChild(el);
    d.documentElement.classList.add("cp-on");
    d.addEventListener("keydown", keys, true);
    try { g.stemDuck && g.stemDuck.down && g.stemDuck.down(); } catch (e) { /* */ }
    step1();
    return true;
  }
  function close() {
    if (!el) return;
    d.removeEventListener("keydown", keys, true);
    el.remove(); el = null;
    d.documentElement.classList.remove("cp-on");
    if (prevFocus && prevFocus.focus && d.contains(prevFocus)) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* */ }
    prevFocus = null;
  }
  function auto() {
    var force = /[?&]calcpick=1\b/.test(location.search) || g.__calcPickAuto === true;
    if (navigator.webdriver && !force) return;
    sync().then(function (v) {
      if (v) return;
      try { if (sessionStorage.getItem(LATER)) return; } catch (e) { /* */ }
      var tries = 0;
      (function wait() {   // after the splash and the first problem; never over the lock-help modal (10 s cap)
        if (load() || el) return;
        var busy = d.getElementById("splash") || (g.stemLockHelp && g.stemLockHelp.up);
        if (busy && tries++ < 50) { setTimeout(wait, 200); return; }
        if (!busy) open({ auto: true });
      })();
    });
  }
  g.stemCalcPick = { open: function () { return open(); }, close: close, get: get, onChange: onChange, auto: auto,
    models: MODELS, get up() { return !!el; } };
})();
