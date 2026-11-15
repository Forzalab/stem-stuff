/* toast.js: the one toast component (docs/design/TOAST.md round 5; Tony #38 pick d1, shadcn / Sonner style). Sets window.stemToast.
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
   Today: the stage lines (rewards/engine.js), and the notes (note() below, todo 112): the old #toast's kinds, its look and element.
   show({ text, num: [from, to], from, to, at, ms, until }): text may hold "{#}", the number that counts from num[0] to num[1]; from / to are
   the bar's fill (0..1); at = the anchor element or a function returning it.
   The short toast (W133, todo 133: the twist toast): bar: false = no progress bar (a line, not a count); action: { label, run } = one
   outlined .btn under the words (never .btn-go), a tap runs it and closes the toast; clear = a selector of boxes it must never lie on
   although they take no tap (the twist toast: the answer area #q, the ladder in it, Next); onshow() = called once it is on screen. */
(function (g) {
  'use strict';
  var d = g.document, el = null, q = [], cur = null, timer = 0, left = 0, since = 0, raf = 0, wait = 0, nEl = null;
  var X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var reduced = function () { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var busy = function () { return d.documentElement.classList.contains('fx-busy') || !!d.querySelector('.fx-ov'); };
  /* Cluck's duck (peek.js window.stemDuck) or Cluck himself (app.js window.stemCluckModal) owns the moment: the toast yields */
  var yields = function () { try { return !!(g.stemDuck && g.stemDuck.up) || !!(g.stemLockHelp && g.stemLockHelp.up) || !!(g.stemCluckModal && g.stemCluckModal()); } catch (e) { return false; } };

  function mount() {
    if (el && el.isConnected) return el;
    el = d.createElement('div');
    el.className = 'stoast';
    el.innerHTML = '<div class="stoast-b"><p class="stoast-t" aria-hidden="true"></p><span class="stoast-bar" aria-hidden="true"><i></i></span>' +
      '<span class="sr-only" role="status"></span></div><button type="button" class="stoast-x" aria-label="Close">' + X + '</button>';
    d.body.appendChild(el);
    el.querySelector('.stoast-x').addEventListener('click', function () { hide(false, 'dismissed'); });   // (hide's arg would be the event otherwise)
    el.addEventListener('pointerenter', hold);
    el.addEventListener('pointerleave', go);
    el.addEventListener('animationend', function (e) { if (e.animationName === 'stoast-out' || e.animationName === 'stoast-fade-out') done(); });
    return el;
  }
  var anchor = function (o) { var a = typeof o.at === 'function' ? o.at() : o.at; return a && a.isConnected && a.getClientRects().length ? a : null; };
  /* the controls it must never cover (the cluck-rise overlap rule): anything that takes a tap, and the duck's line.
     skip(e) -> true for the ones this toast may lie on (a note's own anchor, a dead kept row, the Next note's brainrot link) */
  var LIVE = 'button, a[href], input, textarea, select, [role=button], .opt, .ck-say';
  /* -> the rects of the live controls under the box. A note (nEl, 2 s) is never in the stage toast's way; a note does count the
     stage toast's close button (stacked, never on top of each other) */
  function hits(x, y, w, h, skip, note) {
    var ls = d.querySelectorAll(LIVE), out = [];
    for (var i = 0; i < ls.length; i++) {
      var e = ls[i];
      if ((nEl && nEl.contains(e)) || (!note && el && el.contains(e)) || e.closest('[hidden], [inert]') || (skip && skip(e))) continue;
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= x || r.left >= x + w || r.bottom <= y || r.top >= y + h) continue;
      /* [data-room]: unseen now, shown in place later (repair.js: a welcome step's "why" before its pick). A toast laid on it would have to move off it then */
      if (!e.closest('[data-room]') && (e.checkVisibility ? !e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !e.getClientRects().length)) continue;
      out.push(r);
    }
    return out;
  }
  var covers = function (x, y, w, h) {
    if (hits(x, y, w, h).length) return true;
    var cs = cur && cur.clear && !(cur.dock && desk()) ? d.querySelectorAll(cur.clear) : [];   // a docked toast on the desktop foot lies below the column: no clear needed
    for (var i = 0; i < cs.length; i++) {                                // `clear`: never on these boxes, tap or no tap (W133)
      var r = cs[i].getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right <= x || r.left >= x + w || r.bottom <= y || r.top >= y + h) continue;
      return true;
    }
    return false;
  };
  /* desktop = the side layout (question column left, Explain + Notes right) on a screen tall enough for a foot; a landscape phone
     (844x390) is side too but has no foot to spare, so it stays a phone here */
  var desk = function () { var vv = g.visualViewport; return d.documentElement.classList.contains('side') && (vv ? vv.height : innerHeight) >= 500; };
  /* -> true when it has a place, on screen, under the pinned bar, over no live control.
     Phone: 12px under its anchor; it scrolls with its anchor. Never over the anchor: that is the problem the student reads first (a
     short landscape phone, 844x390, put it on the question's own words), so with no room under it, it waits for a scroll (W88 r4).
     Desktop (img3, Tony Oct 28: "in prod the toast appears at NOT bottom-left"): bottom-left of the question column, on the viewport's
     foot, where it stays while the page scrolls. Under the answer box it lay mid-column on the Key formulas card (1440, 1366) or found
     no room at all (1280x720). A control at the foot (a long question, the brainrot corner): under its anchor, as on a phone. */
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
    var vv = g.visualViewport, foot = vv ? vv.offsetTop + vv.height : innerHeight, bottom = foot - 12;
    var x = Math.round(Math.min(Math.max(gut, b.left), vw - gut - w));
    var sides = cur.dock ? ['foot', 'lift'] : desk() ? ['foot', 'under'] : ['under'];   // dock (calc toast, ui-v7): the viewport's foot on a phone too, never under the anchor (it would lie on the question); no room there = it waits and `until` drops it
    for (var i = 0; i < sides.length; i++) {
      var y = Math.round(sides[i] === 'foot' ? foot - gut - h : sides[i] === 'lift' ? foot - gut - 48 - h : b.bottom + 12);   // lift: above the corner links (privacy, 44px) at the foot
      if (y < barB + 8 || y + h > bottom || covers(x, y, w, h)) continue;
      el.style.left = x + 'px'; el.style.top = y + 'px';               // whole px: the words stay on the pixel grid
      el.dataset.side = sides[i];
      return true;
    }
    return false;
  }
  function hold() { if (el) el.classList.add('stoast-hold'); if (left) { clearTimeout(timer); left = Math.max(800, left - (Date.now() - since)); } }
  function go() { if (el) el.classList.remove('stoast-hold'); if (left && cur) arm(left, true); }
  /* its own exit waits for the reward FX too (one blink: never two things moving at once, tests/blink-fx.pw.mjs) */
  var late = 0;
  function expire() { if (busy() && late++ < 32) { timer = setTimeout(expire, 250); return; } late = 0; hide(false, 'expired'); }   // at most 8 s more: a stuck fx-busy never pins it
  /* TOAST-DYN r2: the row's capsules fill in (count) then drain away over the toast's real life = this timer (CSS --life, .stoast-drain; hover/focus holds it) */
  function arm(ms, keep) { if (el && !keep) { el.style.setProperty('--life', ms + 'ms'); el.classList.remove('stoast-drain'); void el.offsetWidth; el.classList.add('stoast-drain'); }   // keep = resume after a hold: the paused drain just continues from where it stopped
    clearTimeout(timer); left = ms; since = Date.now(); timer = setTimeout(expire, ms); }
  /* the words into `t` with the number v: "Bold line\nsecond line" = a bold head, a break, the rest (BUG-COACHBOLD: count()'s put() used to rewrite it flat) */
  function render(t, o, v) {
    t.textContent = '';
    var text = String(o.text), parts = text.split('{#}'), head;
    var at = text.indexOf('\n'), hd = at > 0 ? text.slice(0, at) : '';
    if (hd && hd.indexOf('{#}') < 0) { head = d.createElement('b'); head.className = 'stoast-h'; head.textContent = hd; t.append(head, d.createElement('br')); parts = text.slice(at + 1).split('{#}'); }
    parts.forEach(function (s, k) {
      if (k) { var b = d.createElement('span'); b.className = 'stoast-n'; b.textContent = v; t.appendChild(b); }
      t.appendChild(d.createTextNode(s));
    });
  }
  function count(o) {
    var t = el.querySelector('.stoast-t'), bar = el.querySelector('.stoast-bar'), i = bar.querySelector('i'), n = o.num || [0, 0];
    var setP = function (v) { bar.style.setProperty('--p', v); i.style.setProperty('--p', v); };   // the row's segments read --p from the bar
    var put = function (v) { render(t, o, v); };   // the same renderer as next(): a stale tween never flattens the bold head
    i.style.transition = 'none'; setP(o.from || 0); void i.offsetWidth; i.style.transition = '';
    el.dataset.done = '0';
    var fin = function () { put(n[1]); fit(); setP(o.to || 0); el.dataset.done = '1'; };
    if (reduced()) { fin(); return; }
    put(n[0]);
    cancelAnimationFrame(raf);
    setTimeout(function () {                                             // after the 200 ms slide: fill + count, 600 ms
      if (!cur || cur !== o) return;
      setP(o.to || 0);
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
    rowPut(o);
    actionPut(o);
    render(el.querySelector('.stoast-t'), o, o.num ? o.num[1] : '');
    fit();
    if (!place()) { cur = null; actionPut({}); clearTimeout(wait); wait = setTimeout(next, 250); return; }   // no room under its anchor yet: wait for a scroll
    q.shift();
    el.querySelector('.sr-only').textContent = String(o.text).split('{#}').join(o.num ? o.num[1] : '');
    count(o);
    el.classList.toggle('stoast-fin', (o.to || 0) >= 1);
    place();
    void el.offsetWidth; el.classList.add('on');
    var follow = setInterval(function () {                               // the question may still be laying out under it
      if (cur !== o) { clearInterval(follow); if (mo) mo.disconnect(); return; }
      if (!place() || yields()) hide(true);                              // scrolled out of its room, a control came under it, the duck rose or Cluck opened: gone at once (no exit motion beside the answer's: one blink)
    }, 120);
    /* a `clear` box that fills while it shows (the hint card landing after a miss, REVEAL-TRAY Nov 3): re-placed before that frame paints, not at
       the next tick, so it is never drawn on it */
    if (o.clear && g.MutationObserver) {
      var mo = new MutationObserver(function () { if (cur !== o) { mo.disconnect(); return; } if (!place() || yields()) hide(true); });
      d.querySelectorAll(o.clear).forEach(function (c) { mo.observe(c, { childList: true, subtree: true, characterData: true }); });
    }
    arm(o.ms || 4000);
    if (o.onshow) try { o.onshow(); } catch (e) { /* the caller's */ }
  }
  /* the row toast (html.ui-v7 only, DUCK-V8-TOAST / TOAST-GAP): o.row + o.duck (a mood: start, landmark, twist, cram, miss, late) = the duck
     in an 80 px box on the left, the words start at box right + 32, the title (1 line), an optional dim subtitle (o.sub), 5 capsules, a bare close.
     Flag off, or no o.row: the plain markup, untouched. */
  var PLAIN_B = '<p class="stoast-t" aria-hidden="true"></p><span class="stoast-bar" aria-hidden="true"><i></i></span><span class="sr-only" role="status"></span>';
  var ROW_B = '<p class="stoast-t" aria-hidden="true"></p><p class="stoast-s"></p><span class="stoast-bar" aria-hidden="true">' +
    [0, 1, 2, 3, 4].map(function (k) { return '<i style="--k:' + k + '"></i>'; }).join('') + '</span><span class="sr-only" role="status"></span>';
  function rowPut(o) {
    var row = !!o.row && d.documentElement.classList.contains('ui-v7');
    el.classList.toggle('stoast-v7', row);
    var duck = el.querySelector('.stoast-duck'), b = el.querySelector('.stoast-b');
    if (!row) {
      if (el.dataset.kind === 'row') { if (duck) duck.remove(); b.innerHTML = PLAIN_B; el.dataset.kind = 'plain'; }
      return;
    }
    if (!duck) { duck = d.createElement('span'); duck.className = 'stoast-duck'; duck.setAttribute('aria-hidden', 'true'); duck.innerHTML = '<img alt="" width="64" height="64">'; el.insertBefore(duck, el.firstChild); }
    duck.querySelector('img').src = 'client/rewards/icons/duck8-' + (o.duck || 'start') + '.webp';
    if (el.dataset.kind !== 'row') { b.innerHTML = ROW_B; el.dataset.kind = 'row'; }
    var sub = el.querySelector('.stoast-s'); sub.textContent = o.sub || ''; sub.hidden = !o.sub;
  }
  /* TOAST-DYN: one line of words (title + sub together <= 28 px tall) = the small duck row; else the roomy one. Measured once per show / landing, no loop. */
  function fit() {
    if (!el || !el.classList.contains('stoast-v7')) { if (el) el.classList.remove('stoast-1l'); return; }
    var t = el.querySelector('.stoast-t'), s = el.querySelector('.stoast-s');
    el.classList.toggle('stoast-1l', t.offsetHeight + (s.hidden ? 0 : s.offsetHeight) <= 28);
  }
  /* the short toast's parts (W133): no bar, and at most one action button under the words */
  function actionPut(o) {
    el.classList.toggle('stoast-short', o.bar === false);
    clsPut(o);
    var old = el.querySelector('.stoast-a'); if (old) old.remove();
    if (!o.action || !o.action.label) return;
    var b = d.createElement('button'); b.type = 'button'; b.className = 'btn stoast-a'; b.textContent = o.action.label;
    b.addEventListener('click', function () { var run = o.action.run; hide(true); if (run) run(); });
    el.querySelector('.stoast-b').appendChild(b);
  }
  /* o.cls (calc toast, ui-v7): adds a scoped class stoast-c-<cls> (reset each toast) so a feature can style its own toast without editing toast.css. */
  function clsPut(o) { el.className = el.className.replace(/\s*stoast-c-\S+/g, '') + (o.cls ? ' stoast-c-' + o.cls : ''); }
  function done() { if (!el) return; el.classList.remove('on', 'out'); cur = null; actionPut({}); next(); }
  function hide(quiet, why) {
    clearTimeout(timer); left = 0;
    if (!cur || !el) return;
    if (cur.onend && why) { var oe = cur.onend; cur.onend = null; try { oe(why); } catch (e) { /* the caller's */ } }   // onend('dismissed' | 'expired'), once
    if (quiet || busy() || reduced() || !el.classList.contains('on')) { done(); return; }
    el.classList.add('out');
  }
  function show(o) { if (!o || !o.text) return; q.push(o); next(); }

  d.addEventListener('keydown', function (e) {
    // only from inside the toast (its close button): a passive status line never eats the Escape that closes Cluck's sheet or an overlay
    if (e.key === 'Escape' && cur && el && el.classList.contains('on') && el.contains(d.activeElement)) { hide(); e.stopImmediatePropagation(); }
  }, true);
  /* ---------- notes (todo 112, Tony's picks Oct 28; W102 PLAN option A): the old #toast's kinds on this component ----------
     A note is a short line about one thing on screen, with a caret on it: the Scratchpad tip (A: above the button, caret down), the
     Next note ("the stacked one": under Next, beside a stage toast, not queued behind it), the kept choice (A: on the kept row's own
     words, caret left at its badge), the HUD tips and the pad-mode note (B: caret + a 44px X). It keeps the old #toast's look and its
     element (index.html #toast, app.css), 2 s (Tony, Oct 3), paused while the pointer rests on it or the tab is hidden; a tap anywhere
     on it (or the X, or Esc: app.js) closes it. One at a time: a new note replaces the old one at once.
     Cover rule strict (Tony, Oct 28): it never lies on a live control. Under its anchor, else above it; a control beside the caret
     narrows it (the words wrap) instead; no place = no note (note() -> false: the caller falls back or tries next time). It may lie on
     its own anchor, a dead (aria-disabled) control, and `allow` (the Next note: the brainrot link, Tony OK'd for its 2 s, and the level
     row: "COVER"). `clear`: what it must not lie on although it takes no tap (the Next note: the question card, the answer area).
     The caret always touches its anchor.
     `loose` (the "Copied" note, unchanged from prod): the old placement, which may cover a control.
     note({ text, at, x, ms, prefer: 'under' | 'above', allow, clear, loose }) -> true when it is on screen */
  var nCur = null, nT = 0, nLeft = 0, nSince = 0, footRoom = function () { return 0; };
  function nMount() {
    if (nEl && nEl.isConnected) return nEl;
    nEl = d.getElementById('toast');
    if (!nEl) { nEl = d.createElement('div'); nEl.id = 'toast'; nEl.setAttribute('role', 'status'); nEl.setAttribute('aria-live', 'polite'); d.body.appendChild(nEl); }
    nEl.addEventListener('click', function () { noteHide(); });          // a tap anywhere on it, the X too
    nEl.addEventListener('pointerenter', nHold);
    nEl.addEventListener('pointerleave', nGo);
    return nEl;
  }
  function nHold() { if (nLeft) { clearTimeout(nT); nLeft = Math.max(600, nLeft - (Date.now() - nSince)); } }
  function nGo() { if (nLeft && nCur) nArm(nLeft); }
  function nArm(ms) { clearTimeout(nT); nLeft = ms; nSince = Date.now(); nT = setTimeout(noteHide, ms); }
  function noteHide() { clearTimeout(nT); nLeft = 0; nCur = null; if (nEl) nEl.classList.remove('on'); }
  function noteAt() { return nCur && nEl && nEl.classList.contains('on') ? nCur.at : null; }
  /* -> true when the note has a place now (whole px: sharp words, TOAST.md round 5) */
  function notePlace() {
    var o = nCur, t = nEl;
    if (!o || !t) return false;
    var a = o.at;
    if (!a || !a.isConnected || !a.getClientRects().length) return false;  // its anchor went away (the button while the pad is open)
    var bar = d.querySelector('.top'), inBar = !!bar && bar.contains(a);
    var barB = bar && !inBar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : -Infinity;
    var b = a.getBoundingClientRect();
    if (b.bottom < barB) return false;                                     // scrolled under the pinned bar: no note pointing at the bar
    var mk = a.querySelector('.vk, .badge'), mr = mk && mk.getBoundingClientRect();
    var m = mr && mr.width ? mr : b, mx = m.left + m.width / 2;            // the caret: at the badge, else the anchor's centre
    var row = a.classList.contains('opt') && !!(mr && mr.width);          // on the kept row's words only beside a badge
    var gut = parseFloat(getComputedStyle(d.documentElement).getPropertyValue('--gut')) || 20, vw = d.documentElement.clientWidth;
    var skip = function (e) { return a.contains(e) || e.contains(a) || e.getAttribute('aria-disabled') === 'true' || (!!o.allow && e.matches(o.allow)); };
    /* the live controls under the box, plus `clear`: what it must not lie on although no tap goes there (the Next note: the question
       card and the answer area's words, the HUD's own pieces beside its empty tap layer) */
    var free = function (x, y, w, h) {
      if (o.loose) return [];
      var out = hits(x, y, w, h, skip, true), cs = o.clear ? d.querySelectorAll(o.clear) : [];
      for (var i = 0; i < cs.length; i++) {
        var r = cs[i].getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.right <= x || r.left >= x + w || r.bottom <= y || r.top >= y + h) continue;
        if (cs[i].checkVisibility && !cs[i].checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        out.push(r);
      }
      return out;
    };
    t.classList.toggle('row', row);
    if (row) {
      t.classList.remove('up');
      t.style.maxWidth = Math.max(120, b.right - m.right - 18) + 'px';
      var rx = Math.round(m.right + 12), ry = Math.round(b.top + b.height / 2 - t.offsetHeight / 2);
      if (free(rx, ry, t.offsetWidth, t.offsetHeight).length) return false;
      t.style.left = rx + 'px'; t.style.top = ry + 'px';
      return true;
    }
    var vv = g.visualViewport, top = (vv ? vv.offsetTop : 0) + 4, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - footRoom();
    if (barB > top) top = barB + 8;
    var right = mx > b.left + b.width / 2;                                 // which edge it lines up with: the anchor's side of the caret
    var sides = o.prefer === 'above' ? ['above', 'under'] : ['under', 'above'];
    if (o.loose) sides = [o.prefer === 'above' || b.bottom + 12 + t.offsetHeight > bottom ? 'above' : 'under'];   // the old rule
    for (var i = 0; i < sides.length; i++) {
      var lo = gut, hi = vw - gut, up = sides[i] === 'above';
      t.style.maxWidth = '';
      for (var k = 0; k < 4; k++) {
        var w = t.offsetWidth, h = t.offsetHeight;
        var x = Math.round(Math.min(Math.max(lo, right ? b.right - w : b.left), hi - w)), y = Math.round(up ? b.top - 12 - h : b.bottom + 12);
        if (!o.loose && (y < top || y + h > bottom)) break;
        var hit = free(x, y, w, h);
        if (!hit.length) {
          t.classList.toggle('up', up);
          t.style.left = x + 'px'; t.style.top = y + 'px';
          t.style.setProperty('--px', Math.max(18, Math.min(w - 18, mx - x)) + 'px');
          return true;
        }
        /* something beside the caret: keep clear of it and let the words wrap. Something right where the caret points: this side is
           out (the caret always touches its anchor: Tony, Oct 29, a note stepped 70px down from Next "looks buggy") */
        for (var j = 0; j < hit.length; j++) {
          if (hit[j].right <= mx - 18) lo = Math.max(lo, Math.ceil(hit[j].right) + 8);
          else if (hit[j].left >= mx + 18) hi = Math.min(hi, Math.floor(hit[j].left) - 8);
          else lo = Infinity;
        }
        if (hi - lo < 160 || mx < lo + 18 || mx > hi - 18) break;
        t.style.maxWidth = 'min(26rem, ' + (hi - lo) + 'px)';
      }
    }
    t.style.maxWidth = '';
    return false;
  }
  function note(o) {
    if (!o || !o.text || !o.at) return false;
    nMount();
    clearTimeout(nT); nLeft = 0;
    nEl.classList.remove('on', 'up', 'row');
    nEl.textContent = '';
    var s = d.createElement('span'); s.className = 'toast-t'; s.textContent = o.text; nEl.appendChild(s);
    nEl.classList.toggle('has-x', !!o.x);
    if (o.x) { var b = d.createElement('button'); b.type = 'button'; b.className = 'toast-x'; b.setAttribute('aria-label', 'Close'); b.innerHTML = X; nEl.appendChild(b); }
    nCur = o;
    if (!notePlace()) { nCur = null; nEl.textContent = ''; nEl.classList.remove('has-x'); return false; }   // no place: nothing left behind to read
    void nEl.offsetWidth; nEl.classList.add('on');
    nArm(o.ms || 2000);
    return true;
  }
  function noteFollow() { if (nCur && nEl && nEl.classList.contains('on') && !notePlace()) noteHide(); }   // scrolled out of its room: gone

  d.addEventListener('visibilitychange', function () { d.hidden ? (hold(), nHold()) : (go(), nGo()); });
  g.addEventListener('scroll', function () { place(); noteFollow(); }, { passive: true });
  g.addEventListener('resize', function () { place(); noteFollow(); });

  /* hide(): the one on screen goes now (the next queued one follows); clear(): it and the queue.
     note / noteAt / noteHide / notePlace: the notes (above); config({ foot }): the px the page's foot keeps (app.js: the dock) */
  g.stemToast = { show: show, hide: function () { clearTimeout(timer); left = 0; if (el && cur) done(); }, clear: function () { q.length = 0; clearTimeout(timer); left = 0; if (el && cur) done(); }, place: place,
    note: note, noteAt: noteAt, noteHide: noteHide, notePlace: noteFollow, config: function (c) { if (c && typeof c.foot === 'function') footRoom = c.foot; } };
})(window);
