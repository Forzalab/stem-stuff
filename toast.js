/* toast.js: the one toast component (design/TOAST.md round 5; Tony #38 pick d1, shadcn / Sonner style). Sets window.stemToast.
   d1: no icon; the words and a progress bar share one left edge; a close button centred on the right; the bar ends in an 8px finish dot.
   Anchored in the question area (Tony: "I'm looking at the question first"), never in the top bar: 12px under its anchor, and it
   scrolls with it. It never covers a live control (W88 r4, cluck-rise): it shows only when it fits between the pinned bar and the
   viewport's foot under its anchor and covers no live control (no clamping to the foot, where the duck, the
   Scratchpad button and the dock live; never on Check / Next / a choice), else it waits
   until the student scrolls there; it steps aside while Cluck's duck is up or Cluck is open. A toast with `until` (a time stamp) that
   cannot show by then is dropped (the start line). In: a 200 ms slide, then the bar fills from `from` to `to` over 600 ms while the number counts.
   It waits for the reward FX to finish (html.fx-busy / an .fx-ov overlay) so it is the last thing that happens. One at a time: a queue.
   4 s on screen, paused while the pointer rests on it or the tab is hidden; the close button (or Escape while focus is on it) closes it.
   Sharp words (Tony, Windows laptop: blurry stickers): at rest the card has no transform and no running animation (`backwards`, never
   `both`), and it sits on whole px, so its text keeps subpixel AA.
   Today: the stage lines (rewards/engine.js). The miss #toast moves onto it in a later PR.
   show({ text, num: [from, to], from, to, at, ms, until }): text may hold "{#}", the number that counts from num[0] to num[1]; from / to are
   the bar's fill (0..1); at = the anchor element or a function returning it. */
(function (g) {
  'use strict';
  var d = g.document, el = null, q = [], cur = null, timer = 0, left = 0, since = 0, raf = 0, wait = 0;
  var X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var reduced = function () { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var busy = function () { return d.documentElement.classList.contains('fx-busy') || !!d.querySelector('.fx-ov'); };
  /* Cluck's duck (peek.js window.stemDuck) or Cluck himself (app.js window.stemCluckOpen) owns the moment: the toast yields */
  var yields = function () { try { return !!(g.stemDuck && g.stemDuck.up) || !!(g.stemCluckOpen && g.stemCluckOpen()); } catch (e) { return false; } };

  function mount() {
    if (el && el.isConnected) return el;
    el = d.createElement('div');
    el.className = 'stoast';
    el.innerHTML = '<div class="stoast-b"><p class="stoast-t" aria-hidden="true"></p><span class="stoast-bar" aria-hidden="true"><i></i></span>' +
      '<span class="sr-only" role="status"></span></div><button type="button" class="stoast-x" aria-label="Close">' + X + '</button>';
    d.body.appendChild(el);
    el.querySelector('.stoast-x').addEventListener('click', function () { hide(); });   // (hide's arg would be the event otherwise)
    el.addEventListener('pointerenter', hold);
    el.addEventListener('pointerleave', go);
    el.addEventListener('animationend', function (e) { if (e.animationName === 'stoast-out' || e.animationName === 'stoast-fade-out') done(); });
    return el;
  }
  var anchor = function (o) { var a = typeof o.at === 'function' ? o.at() : o.at; return a && a.isConnected && a.getClientRects().length ? a : null; };
  /* the controls it must never cover (the cluck-rise overlap rule): anything that takes a tap, and the duck's line */
  var LIVE = 'button, a[href], input, textarea, select, [role=button], .opt, .ck-say';
  function covers(x, y, w, h) {
    var ls = d.querySelectorAll(LIVE);
    for (var i = 0; i < ls.length; i++) {
      var e = ls[i];
      if (el.contains(e) || e.closest('[hidden], [inert]')) continue;
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= x || r.left >= x + w || r.bottom <= y || r.top >= y + h) continue;
      if (e.checkVisibility ? !e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !e.getClientRects().length) continue;
      return true;
    }
    return false;
  }
  /* -> true when it has a place: 12px under its anchor, on screen, under the pinned bar, over no live control; it scrolls with its
     anchor. Never over the anchor: that is the problem the student reads first (a short landscape phone, 844x390, put it on the
     question's own words), so with no room under it, it waits for a scroll (W88 r4). */
  function place() {
    if (!cur || !el) return false;
    var a = anchor(cur);
    if (!a) return false;
    var b = a.getBoundingClientRect(), cs = getComputedStyle(d.documentElement);
    var gut = parseFloat(cs.getPropertyValue('--gut')) || 16, vw = d.documentElement.clientWidth;
    var w = Math.round(Math.min(400, b.width, vw - 2 * gut));
    el.style.width = w + 'px';
    var h = el.offsetHeight, bar = d.querySelector('.top'), barB = 0;
    if (bar && getComputedStyle(bar).position === 'sticky') barB = bar.getBoundingClientRect().bottom;
    var vv = g.visualViewport, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - 12;
    var x = Math.round(Math.min(Math.max(gut, b.left), vw - gut - w));
    var sides = ['under'];
    for (var i = 0; i < sides.length; i++) {
      var y = Math.round(sides[i] === 'under' ? b.bottom + 12 : b.top - 12 - h);
      if (y < barB + 8 || y + h > bottom || covers(x, y, w, h)) continue;
      el.style.left = x + 'px'; el.style.top = y + 'px';               // whole px: the words stay on the pixel grid
      return true;
    }
    return false;
  }
  function hold() { if (left) { clearTimeout(timer); left = Math.max(800, left - (Date.now() - since)); } }
  function go() { if (left && cur) arm(left); }
  /* its own exit waits for the reward FX too (one blink: never two things moving at once, tests/blink-fx.pw.mjs) */
  var late = 0;
  function expire() { if (busy() && late++ < 32) { timer = setTimeout(expire, 250); return; } late = 0; hide(); }   // at most 8 s more: a stuck fx-busy never pins it
  function arm(ms) { clearTimeout(timer); left = ms; since = Date.now(); timer = setTimeout(expire, ms); }
  function count(o) {
    var t = el.querySelector('.stoast-t'), i = el.querySelector('.stoast-bar i'), n = o.num || [0, 0];
    var put = function (v) {
      var parts = String(o.text).split('{#}');
      t.textContent = '';
      parts.forEach(function (s, k) {
        if (k) { var b = d.createElement('span'); b.className = 'stoast-n'; b.textContent = v; t.appendChild(b); }
        t.appendChild(d.createTextNode(s));
      });
    };
    i.style.transition = 'none'; i.style.setProperty('--p', o.from || 0); void i.offsetWidth; i.style.transition = '';
    el.dataset.done = '0';
    var fin = function () { put(n[1]); i.style.setProperty('--p', o.to || 0); el.dataset.done = '1'; };
    if (reduced()) { fin(); return; }
    put(n[0]);
    cancelAnimationFrame(raf);
    setTimeout(function () {                                             // after the 200 ms slide: fill + count, 600 ms
      if (!cur || cur !== o) return;
      i.style.setProperty('--p', o.to || 0);
      var t0 = performance.now();
      (function step(tm) {
        if (cur !== o) return;
        var k = Math.min(1, Math.max(0, (tm - t0) / 600)), e = 1 - Math.pow(1 - k, 3);
        put(Math.round(n[0] + (n[1] - n[0]) * e));
        if (k < 1) raf = requestAnimationFrame(step); else fin();
      })(t0);
      setTimeout(function () { if (cur === o && el.dataset.done !== '1') { cancelAnimationFrame(raf); fin(); } }, 700);   // no frames (a background tab): land anyway
    }, 200);
  }
  function next() {
    if (cur || !q.length) return;
    if (busy()) { clearTimeout(wait); wait = setTimeout(next, 250); return; }  // after the FX: the toast is the last word
    var o = q[0];
    if (o.until && Date.now() > o.until) { q.shift(); next(); return; }   // stale (the start line after the student moved on)
    if (yields() || !anchor(o)) { clearTimeout(wait); wait = setTimeout(next, 250); return; }
    cur = o; mount();
    el.classList.remove('out', 'on');
    el.style.width = '';
    el.querySelector('.stoast-t').textContent = String(o.text).split('{#}').join(o.num ? o.num[1] : '');
    if (!place()) { cur = null; clearTimeout(wait); wait = setTimeout(next, 250); return; }   // no room under its anchor yet: wait for a scroll
    q.shift();
    el.querySelector('.sr-only').textContent = String(o.text).split('{#}').join(o.num ? o.num[1] : '');
    count(o);
    el.classList.toggle('stoast-fin', (o.to || 0) >= 1);
    place();
    void el.offsetWidth; el.classList.add('on');
    var follow = setInterval(function () {                               // the question may still be laying out under it
      if (cur !== o) { clearInterval(follow); return; }
      if (!place() || yields()) hide(true);                              // scrolled out of its room, a control came under it, the duck rose or Cluck opened: gone at once (no exit motion beside the answer's: one blink)
    }, 120);
    arm(o.ms || 4000);
  }
  function done() { if (!el) return; el.classList.remove('on', 'out'); cur = null; next(); }
  function hide(quiet) {
    clearTimeout(timer); left = 0;
    if (!cur || !el) return;
    if (quiet || busy() || reduced() || !el.classList.contains('on')) { done(); return; }
    el.classList.add('out');
  }
  function show(o) { if (!o || !o.text) return; q.push(o); next(); }

  d.addEventListener('keydown', function (e) {
    // only from inside the toast (its close button): a passive status line never eats the Escape that closes Cluck's sheet or an overlay
    if (e.key === 'Escape' && cur && el && el.classList.contains('on') && el.contains(d.activeElement)) { hide(); e.stopImmediatePropagation(); }
  }, true);
  d.addEventListener('visibilitychange', function () { d.hidden ? hold() : go(); });
  g.addEventListener('scroll', place, { passive: true });
  g.addEventListener('resize', place);

  /* hide(): the one on screen goes now (the next queued one follows); clear(): it and the queue */
  g.stemToast = { show: show, hide: function () { clearTimeout(timer); left = 0; if (el && cur) done(); }, clear: function () { q.length = 0; clearTimeout(timer); left = 0; if (el && cur) done(); }, place: place };
})(window);
