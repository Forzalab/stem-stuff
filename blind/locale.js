/* blind/locale.js: Tony's blind-locale test (design/UX-TOPDOWN.md §3). "make the whole site in a different language with same physics
   question. I MUST BE ABLE TO ENGAGE WITH IT THOUGHTLESSLY". Loaded by app.js only on ?blind=<lang> (kept for the tab in
   sessionStorage; ?blind=off clears it). Every UI word, aria-label, title and placeholder goes into a script Tony can't read:
   blind/<lang>.json when it knows the string, else each Latin letter maps to a letter of that script (same length, digits kept),
   so no English leaks. The question, the answers, the figure, the math, the bank's hints and Cluck's text stay English and
   byte-identical. A MutationObserver catches toasts and re-renders. Nothing here ever runs without the flag. */
(function () {
  'use strict';
  var me = document.currentScript, lang = (me && me.dataset.lang) || 'ka';
  /* first letter + letter count of each script: Georgian (Mkhedruli), Amharic (Ethiopic syllables), Thai: one per round */
  var SCRIPT = { ka: [0x10D0, 33], am: [0x1200, 26 * 8, 8], th: [0x0E01, 46] };
  var S = SCRIPT[lang] || SCRIPT.ka;
  /* content: stays English (the question, its answers, figure, math, the bank's hints, Cluck's text, the original's body, typed text) */
  var KEEP = '#blocks, #q .opt .txt, #q .mparts .pr, .katex, .fig, #fb .cluck, #fb code, #cluck .wtext, .cl .bub.me, .orig-body, .fcard .f, .fcard .g,' +
    ' textarea, input, #padPeekTx, script, style, noscript, svg, .blind-keep';
  var ATTRS = ['aria-label', 'title', 'placeholder', 'aria-valuetext'];
  var dict = {}, tpl = [], done = new WeakMap(), misses = {};

  function letter(c) {
    var i = c.toLowerCase().charCodeAt(0) - 97;
    return String.fromCodePoint(S[0] + (S[2] ? i * S[2] : i % S[1]));
  }
  var scramble = function (s) { return s.replace(/[A-Za-z]/g, letter); };
  function tr(s) {
    var t = s.trim();
    if (!t || !/[A-Za-z]/.test(t)) return s;
    var out = dict[t];
    if (out == null) for (var i = 0; i < tpl.length && out == null; i++) {
      var m = t.match(tpl[i][0]);
      if (m) { var k = 1; out = tpl[i][1].replace(/\{[^}]+\}/g, function () { return m[k++]; }); }
    }
    if (out == null) { if (!misses[t]) { misses[t] = 1; console.warn('[blind] no ' + lang + ' for:', t); } out = t; }
    return s.replace(t, scramble(out));                                   // a dictionary hit has no Latin left; scramble is a no-op there
  }
  var kept = function (el) { return !!(el && el.closest && el.closest(KEEP)); };
  function textNode(n) {
    if (kept(n.parentElement) || done.get(n) === n.nodeValue) return;
    var v = tr(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
    done.set(n, v);
  }
  function attrs(el) {
    if (kept(el) && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;   // a field's own label / placeholder is UI
    for (var i = 0; i < ATTRS.length; i++) { var a = el.getAttribute(ATTRS[i]); if (a && /[A-Za-z]/.test(a)) el.setAttribute(ATTRS[i], tr(a)); }
  }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    attrs(root);
    if (kept(root) && root.tagName !== 'INPUT' && root.tagName !== 'TEXTAREA') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeType === 1 && n.matches(KEEP) && n.tagName !== 'INPUT' && n.tagName !== 'TEXTAREA' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    for (var n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'childList') for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        else if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') attrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.documentElement.setAttribute('data-blind', lang);
    window.stemBlind = { lang: lang, misses: function () { return Object.keys(misses); } };
  }
  fetch('blind/' + lang + '.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (d) {
    for (var k in d) {
      if (/\{[^}]+\}/.test(k)) tpl.push([new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, "(.+?)") + '$'), d[k]]);
      else dict[k] = d[k];
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  });
})();
