/* pops.js: when Cluck may crack a humor pop (brain design-round-66 DESIGN-v3 §6; Tony #25.3: 1 per 5 correct; #8: none right after a
   miss). Pure: sets window.stemPops, no DOM, no storage, no timers; the caller (app.js, F2) shows the line via stemDuck.say once the
   correct banner settles or on Next. Lines: copy/pops.js (window.__stemPopLines).
   create({lines, every}) → {answer(ev)}; ev = {correct, tags, ctx}. Every `every`th (5, TUNABLE) clean correct is a pop slot. A correct
   right after a wrong try is not clean and does not count. Answers in a `repair` / `mini` / `welcome` ctx never pop and do not count.
   A slot with no line whose tag is in ev.tags is spent with no pop. Matching lines rotate in copy order (no roll). */
(function (g) {
  'use strict';
  var QUIET = { repair: 1, mini: 1, welcome: 1 };
  function create(o) {
    var lines = (o && o.lines) || g.__stemPopLines || [], every = (o && o.every) || 5, n = 0, missed = false, used = {};
    function answer(ev) {
      if (!ev || QUIET[ev.ctx]) return null;
      if (!ev.correct) { missed = true; return null; }
      if (missed) { missed = false; return null; }
      if (++n % every) return null;
      var tags = ev.tags || [], hit = lines.filter(function (l) { return tags.indexOf(l.tag) >= 0; });
      if (!hit.length) return null;
      var k = hit.map(function (l) { return l.tag; }).join(' '), i = used[k] || 0;
      used[k] = i + 1;
      return hit[i % hit.length].text;
    }
    return { answer: answer };
  }
  g.stemPops = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
