/* toast.js: the one toast component (design/TOAST.md round 5; Tony #38 pick d1, shadcn / Sonner style). Sets window.stemToast.
   d1: no icon; the words and a progress bar share one left edge; a close button centred on the right; the bar ends in an 8px finish dot.
   Anchored in the question area (Tony: "I'm looking at the question first"), never in the top bar: under its anchor, held inside the
   viewport and under the pinned bar. In: a 200 ms slide, then the bar fills from `from` to `to` over 600 ms while the number counts.
   It waits for the reward FX to finish (html.fx-busy / an .fx-ov overlay) so it is the last thing that happens. One at a time: a queue.
   4 s on screen, paused while the pointer rests on it or the tab is hidden; the close button or Escape closes it.
   Sharp words (Tony, Windows laptop: blurry stickers): at rest the card has no transform and no running animation (`backwards`, never
   `both`), and it sits on whole px, so its text keeps subpixel AA.
   Today: the stage lines (rewards/engine.js). The miss #toast moves onto it in a later PR.
   show({ text, num: [from, to], from, to, at, ms }): text may hold "{#}", the number that counts from num[0] to num[1]; from / to are
   the bar's fill (0..1); at = the anchor element or a function returning it. */
(function (g) {
  'use strict';
  var d = g.document, el = null, q = [], cur = null, timer = 0, left = 0, since = 0, raf = 0, wait = 0;
  var X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var reduced = function () { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var busy = function () { return d.documentElement.classList.contains('fx-busy') || !!d.querySelector('.fx-ov'); };

  function mount() {
    if (el && el.isConnected) return el;
    el = d.createElement('div');
    el.className = 'stoast';
    el.innerHTML = '<div class="stoast-b"><p class="stoast-t" aria-hidden="true"></p><span class="stoast-bar" aria-hidden="true"><i></i></span>' +
      '<span class="sr-only" role="status"></span></div><button type="button" class="stoast-x" aria-label="Close">' + X + '</button>';
    d.body.appendChild(el);
    el.querySelector('.stoast-x').addEventListener('click', function () { hide(); });
    el.addEventListener('pointerenter', hold);
    el.addEventListener('pointerleave', go);
    el.addEventListener('animationend', function (e) { if (e.animationName === 'stoast-out' || e.animationName === 'stoast-fade-out') done(); });
    return el;
  }
  var anchor = function (o) { var a = typeof o.at === 'function' ? o.at() : o.at; return a && a.isConnected && a.getClientRects().length ? a : null; };
  function place() {
    if (!cur || !el) return;
    var a = anchor(cur);
    if (!a) return;
    var b = a.getBoundingClientRect(), cs = getComputedStyle(d.documentElement);
    var gut = parseFloat(cs.getPropertyValue('--gut')) || 16, vw = d.documentElement.clientWidth;
    var w = Math.min(400, b.width, vw - 2 * gut);
    el.style.width = Math.round(w) + 'px';
    var h = el.offsetHeight, bar = d.querySelector('.top'), barB = 0;
    if (bar && getComputedStyle(bar).position === 'sticky') barB = bar.getBoundingClientRect().bottom;
    var vv = g.visualViewport, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - 12;
    var y = Math.min(b.bottom + 12, bottom - h);                       // under its anchor; an anchor running past the fold: the column's foot
    y = Math.max(y, barB + 8);                                           // never under the pinned bar
    var x = Math.min(Math.max(gut, b.left), vw - gut - w);
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';   // whole px: the words stay on the pixel grid
  }
  function hold() { if (left) { clearTimeout(timer); left = Math.max(800, left - (Date.now() - since)); } }
  function go() { if (left && cur) arm(left); }
  function arm(ms) { clearTimeout(timer); left = ms; since = Date.now(); timer = setTimeout(hide, ms); }
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
    }, 200);
  }
  function next() {
    if (cur || !q.length) return;
    if (busy()) { clearTimeout(wait); wait = setTimeout(next, 250); return; }  // after the FX: the toast is the last word
    var o = q.shift();
    if (!anchor(o)) { next(); return; }
    cur = o; mount();
    el.classList.remove('out', 'on');
    el.querySelector('.sr-only').textContent = String(o.text).split('{#}').join(o.num ? o.num[1] : '');
    count(o);
    el.classList.toggle('stoast-fin', (o.to || 0) >= 1);
    place();
    void el.offsetWidth; el.classList.add('on');
    var follow = setInterval(function () { if (cur !== o) clearInterval(follow); else place(); }, 120);   // the question may still be laying out under it
    arm(o.ms || 4000);
  }
  function done() { if (!el) return; el.classList.remove('on', 'out'); cur = null; next(); }
  function hide() {
    clearTimeout(timer); left = 0;
    if (!cur || !el) { q.length = 0; return; }
    if (reduced() || !el.classList.contains('on')) { done(); return; }
    el.classList.add('out');
  }
  function show(o) { if (!o || !o.text) return; q.push(o); next(); }

  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && cur && el && el.classList.contains('on')) { hide(); e.stopImmediatePropagation(); }
  }, true);
  d.addEventListener('visibilitychange', function () { d.hidden ? hold() : go(); });
  g.addEventListener('scroll', place, { passive: true });
  g.addEventListener('resize', place);

  g.stemToast = { show: show, hide: function () { q.length = 0; hide(); if (el && cur) done(); }, place: place };
})(window);
