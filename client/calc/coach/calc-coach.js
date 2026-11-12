/* calc-coach.js: Calc Coach, an app-wide panel (app chrome, like popover.js / toast.js; docs/design/CALC-COACH.md). NOT a Cluck reply format:
   the model never writes it; replies stay OpenUI Lang. It teaches 2 routines (SOLVE; STO + Ans) on the student's own calculator:
   an SVG keypad with the key(s) to press lit, a simulated screen, one you-first line, Back / Next, and a "Try it on yours" card.
   Data: calc/calc-layout.json (model -> key grid), calc/calc-steps.json (model -> routine -> example -> steps), calc/calc-keys.json.
   Only entries marked verified:true are shown; the rest say "check your manual".
   The calculator choice is owned by the picker (window.stemCalcPick = { open(), get(), onChange(fn) }, localStorage `stem-calc-model`,
   CustomEvent `stem-calc-model`). This file only reads it.
   Entry points: CalcCoach.open(opts) (overlay), CalcCoach.mount(host, opts) (inline, calc.html), welcomeCard(host), onItem(bankCode),
   chrome(clEl) (Cluck's app chrome, next to .cl-verify). Promo: promo(), EXAM_END; the cram flag (cram.json `enabled`) gates the Hail Mary panel. */
(function (g) {
  'use strict';
  var d = g.document;
  var EXAM_END = Date.parse('2026-11-10T08:00:00Z');   // 2026-11-09T23:59 America/Los_Angeles is the last minute of the exam-day copy
  var FLAGS = { get hailMary() { return !CRAM || CRAM.enabled !== false; } };   // read-only view of the ONE cram flag (calc/cram.json top-level `enabled`); it replaces the old hard-coded hailMary switch. Temporary content, reusable skeleton
  var KEY_MODEL = 'stem-calc-model', KEY_STRIP = 'stem-calc-strip', KEY_TOAST = 'stem-calc-toast-';
  var COPY = {
    exam: { title: 'Stuck? Click here for TI/Casio tricks.',
      body: 'Type the whole equation and hit SOLVE. Store a number once and reuse it. Pick your calculator and I will show you the keys. QUACK.' },
    plain: { title: 'Calculator moves', body: 'Two moves worth knowing: solve an equation in one go, and store a number instead of retyping it. Pick your calculator to see the keys.' }
  };
  var DATA = null, loading = null, ov = null, CRAM = null;

  function ls(k, v) { try { if (v === undefined) return g.localStorage.getItem(k); if (v === null) g.localStorage.removeItem(k); else g.localStorage.setItem(k, v); } catch (e) { /* blocked */ } return null; }
  var reduced = function () { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function h(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  /* telemetry (telemetry.js stemT; ids, counts and phases only: no free text, no PII) */
  function tel(name, o) { try { g.stemT && g.stemT(name, o); } catch (e) { /* never the page's problem */ } }
  var day = function () { var t = new Date(); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); };

  /* ---- promo ---- */
  function promo() { var ex = Date.now() < EXAM_END; return { exam: ex, title: (ex ? COPY.exam : COPY.plain).title, body: (ex ? COPY.exam : COPY.plain).body }; }

  /* ---- data ---- */
  /* steps.json: model -> { preflight_deg: [step], R1_*: [step], R2_*: [step] } or { note } (a model with no verified source: "check your manual").
     step = { press: [key], screen: [line], note, screen_verified, source_loc }. layout.json has labels and legend classes only (layout_verified=false:
     no key positions), so a step draws a row of key caps, never a keypad. keys.json: model names. */
  var UNV = /UNVERIFIED/;
  var routineOf = function (M, pre) { return Object.keys(M || {}).filter(function (k) { return k.indexOf(pre) === 0 && Array.isArray(M[k]); }); };
  function validate(data) {
    var errs = [], S = data && data.steps, K = data && data.keys;
    if (!S || !K) return ['steps/keys missing'];
    Object.keys(S).forEach(function (m) {
      if (!K[m] || !K[m].name) errs.push(m + ': no name in calc-keys.json');
      var M = S[m];
      if (!M.note && !routineOf(M, 'R1_').length) errs.push(m + ': no R1 routine and no note');
      Object.keys(M).forEach(function (r) {
        if (!Array.isArray(M[r])) return;
        M[r].forEach(function (st, i) {
          if (!Array.isArray(st.press) || !st.press.length || !Array.isArray(st.screen) || typeof st.note !== 'string') errs.push(m + '.' + r + '#' + i + ': press/screen/note');
          if (typeof st.screen_verified !== 'boolean') errs.push(m + '.' + r + '#' + i + ': screen_verified must be true or false');
        });
      });
    });
    return errs;
  }
  /* -> the steps to show: null = nothing verified for this model/routine ("check your manual"); a step sourced "UNVERIFIED" is a hidden stub */
  function shownSteps(data, model, kind) {
    var M = data && data.steps[model]; if (!M || M.note && !routineOf(M, 'R1_').length) return null;
    var key = routineOf(M, kind + '_')[0]; if (!key) return null;
    var pre = (M.preflight_deg || []).concat(M[key]);
    return pre.map(function (s) { return UNV.test(s.source_loc || '') ? { hidden: true } : s; });
  }
  var plain = function (t) { return String(t).replace(/^UNVERIFIED \(inferred\):\s*/, ''); };
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (loading) return loading;
    var get = function (f) { return g.fetch('client/calc/' + f).then(function (r) { return r.json(); }); };
    loading = Promise.all([get('calc-layout.json'), get('calc-steps.json'), get('calc-keys.json'), get('calc-pad.json')]).then(function (a) { DATA = { layout: a[0], steps: a[1], keys: a[2], pad: a[3] }; return DATA; });
    loading.catch(function () { loading = null; });
    return loading;
  }
  function setData(x) { DATA = x; }

  /* ---- the student's calculator ---- */
  var IDS = { 'ti-36x-pro': 'ti36xpro', 'ti-30xs-multiview': 'ti30xsmv', 'fx-115es-plus': 'fx115esplus', 'fx-300es-plus': 'fx300esplus', 'fx-991cw': 'fx991cw', 'fx-991ex': 'fx991ex' };   // the picker's ids (calc-pick.js) -> calc-steps.json's
  function model() {
    var v = null;
    try { var p = g.stemCalcPick; if (p && p.get) { v = p.get(); v = v && (v.id || v); } } catch (e) { /* picker */ }
    v = v || ls(KEY_MODEL); if (!v || v === 'skip') return null;
    return IDS[v] || v;
  }

  /* ---- the keypad: approximate, drawn from calc/calc-pad.json (TI-36X Pro from Tony's photo; the rest are typical layouts: enough to find the key).
     The keys to press come from calc-steps.json only. A press token becomes lit key(s): "165" lights 1, 6, 5; "x y z t ..." the letter key;
     "[words]" has no key, it shows as a note under the pad. ---- */
  var W = 64, H = 46, NS = 'http://www.w3.org/2000/svg';
  var norm = function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var SYM = { '-': 'sub', '+': 'add', '/': 'div', '.': 'dot', '(': 'lp', ')': 'rp', '(-)': 'neg', '=': 'eq', 'x': 'mul', 'x2': 'x2', 'down': 'down', 'up': 'up', 'sto->': 'sto', 'sqrt': 'sqrt' };
  function padRows(m) { var P = DATA.pad && DATA.pad.models[m]; return P ? P.rows : null; }
  function allKeys(m) { var out = []; (padRows(m) || []).forEach(function (row, r) { row.forEach(function (k, c) { if (k) out.push({ id: k[0], label: k[1], second: k[2], cls: k[3], row: r, col: c }); }); }); return out; }
  /* press token -> { keys: [pad ids], pill: text } */
  function resolve(m, p) {
    var ti = /^ti/.test(m), b = /^\[(.*)\]$/.exec(p);
    if (b) return { pill: b[1], keys: [] };
    if (/^x y z t/.test(p) || (ti && /^[a-d]$/.test(p))) return { keys: ['var'] };
    if (/^\d+(\.\d+)?$/.test(p) && p.length > 1) return { keys: p.split('').map(function (ch) { return ch === '.' ? 'dot' : ch; }) };
    var ks = allKeys(m), q = SYM[p] || SYM[p.toLowerCase()] || norm(p);
    var hit = ks.filter(function (k) { return norm(k.id) === q; })[0] || ks.filter(function (k) { return norm(k.second) === q || norm(k.label) === q; })[0];
    return hit ? { keys: [hit.id] } : { keys: [], pill: p };
  }
  function labelOf(m, id) { var k = allKeys(m).filter(function (x) { return x.id === id; })[0]; return k ? k.label : id; }
  function expandPress(m, press) { var keys = [], pills = []; press.forEach(function (p) { var r = resolve(m, p); r.keys.forEach(function (k) { keys.push(k); }); if (r.pill) pills.push(r.pill); }); return { keys: keys, pills: pills }; }
  function sv(tag, attrs, text) { var e = d.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function keypad(m, press) {
    var ks = allKeys(m), cols = Math.max.apply(null, ks.map(function (k) { return k.col; })) + 1, rows = Math.max.apply(null, ks.map(function (k) { return k.row; })) + 1, ex = expandPress(m, press), ids = ex.keys;
    var svg = sv('svg', { viewBox: '-4 -4 ' + (cols * W + 8) + ' ' + (rows * H + 8), class: 'cc-pad', role: 'img', 'aria-label': DATA.keys[m].name + ' keypad. Press ' + ids.map(function (i) { return labelOf(m, i); }).join(', then ') + '.' });
    ks.forEach(function (k) {
      var x = k.col * W + 3, y = k.row * H + 3, w = W - 6, on = ids.indexOf(k.id) >= 0;
      var gk = sv('g', { class: 'cc-key cc-k-' + (k.cls || 'num') + (on ? ' on' : '') });
      gk.appendChild(sv('rect', { x: x, y: y, width: w, height: H - 6, rx: 7, class: 'cc-kr' }));
      if (on) gk.appendChild(sv('rect', { x: x - 2, y: y - 2, width: w + 4, height: H - 2, rx: 9, class: 'cc-ring' }));
      if (k.second) gk.appendChild(sv('text', { x: x + w / 2, y: y + 11, 'text-anchor': 'middle', class: 'cc-2' }, k.second));
      gk.appendChild(sv('text', { x: x + w / 2, y: y + (k.second ? 28 : 24), 'text-anchor': 'middle', class: 'cc-kl' + (k.label.length > 5 ? ' cc-kls' : '') }, k.label));
      if (on && ids.length > 1 && ids.length <= 6) {
        var ns = []; ids.forEach(function (id, n) { if (id === k.id) ns.push(n + 1); });
        var t = ns.join(','), bw = 8 + t.length * 5.5;
        gk.appendChild(sv('rect', { x: x + w - bw - 1, y: y - 3, width: bw + 2, height: 16, rx: 8, class: 'cc-bd' }));
        gk.appendChild(sv('text', { x: x + w - bw / 2, y: y + 9, 'text-anchor': 'middle', class: 'cc-bn' }, t));
      }
      svg.appendChild(gk);
    });
    return svg;
  }
  function say(m, press) {
    var words = press.map(function (p) { var b = /^\[(.*)\]$/.exec(p); if (b) return b[1]; var r = resolve(m, p); return /^\d/.test(p) || !r.keys.length ? p.replace(/^x y z t.*/, 'the letter key') : labelOf(m, r.keys[0]); });
    if (words.length > 8) return 'You press these keys, left to right.';
    return 'You press ' + words.join(', then ') + '.';
  }
  var TITLE = { R1: 'One equation, SOLVE', R2: "Store, don't retype" };

  /* ---- the panel ---- */
  function build(host, o) {
    o = o || {};
    if (o.bank) curBank = o.bank;
    var st = { view: o.view || (o.routine ? 'steps' : 'routine'), routine: o.routine || null, i: o.step || 0, model: o.model || model() };
    var root = h('section', 'cc'); root.setAttribute('data-theme', o.theme || 'dark'); root.setAttribute('aria-label', 'Calc Coach');
    host.appendChild(root);
    function head() {
      var b = h('div', 'cc-hd'); b.append(h('h2', 'cc-t', 'Calc Coach'));
      if (o.onClose) { var x = h('button', 'cc-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.onclick = o.onClose; b.append(x); }
      return b;
    }
    function btn(text, cls, fn) { var b = h('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
    function msg(t, sub) { var c = h('div', 'cc-note'); c.append(h('p', 'cc-say', t)); if (sub) c.append(h('p', 'cc-sub', sub)); return c; }
    var rname = function (kind, m) { return kind === 'R1' && !/^(ti36xpro|fx115esplus|fx991cw|fx991ex)$/.test(m) ? 'One equation, no SOLVE key' : TITLE[kind]; };
    function draw() {
      root.replaceChildren(head());
      var m = st.model, name = m && DATA.keys[m] && DATA.keys[m].name;
      if (!m) {
        root.append(msg('Pick your calculator first.', 'Then I can show you the exact keys.'));
        root.append(btn('Pick my calculator', 'cc-btn cc-go', function () { try { g.stemCalcPick.open(); } catch (e) { /* no picker yet */ } }));
        return;
      }
      if (!name || !DATA.steps[m]) { root.append(msg('Your calculator is not in Calc Coach yet.', 'Check your manual for SOLVE and STO.')); return; }
      if (st.view === 'routine') {
        root.append(h('p', 'cc-model', name));
        ['R1', 'R2'].forEach(function (kind, n) {
          var c = h('button', 'cc-card'); c.type = 'button';
          c.append(h('span', 'cc-n', String(n + 1)), h('span', 'cc-ct', rname(kind, m)),
            h('span', 'cc-cw', kind === 'R1' ? 'Type the whole equation, check the answer. A degree-n polynomial has up to n roots, and the solver gives the one near your guess.' : 'Store a result in a letter once, then use the letter. The last answer is always there as Ans.'));
          c.onclick = function () { st.view = 'steps'; st.routine = kind; st.i = 0; draw(); };
          root.append(c);
        });
        var CN = constantsFor(curBank);
        if (CN) { var c3 = h('button', 'cc-card'); c3.type = 'button'; c3.append(h('span', 'cc-n', '3'), h('span', 'cc-ct', CN.title), h('span', 'cc-cw', 'Symbol, name and the keys to find it.')); c3.onclick = function () { st.view = 'constants'; draw(); }; root.append(c3); }
        return;
      }
      if (st.view === 'constants') {
        var CC_ = constantsFor(curBank);
        if (!CC_) { st.view = 'routine'; return draw(); }
        tel('calc_coach', { phase: 'consts', model: m });
        root.append(h('p', 'cc-model', name), h('h3', 'cc-tt', CC_.title), h('p', 'cc-sub', CC_.intro));
        CC_.rows.forEach(function (r) { var k = h('div', 'cc-card cc-static cc-const'); k.append(h('span', 'cc-n cc-sym', r.sym), h('span', 'cc-ct', r.name), h('span', 'cc-cw', constPath(m, r))); root.append(k); });
        ((CC_.tips && /^(fx|casio)/.test(m) && CC_.tips.casio) || []).forEach(function (t) { root.append(h('p', 'cc-tag', t)); });
        root.append(h('div', 'cc-ft')); root.lastChild.append(btn('Back', 'cc-btn', function () { st.view = 'routine'; draw(); }));
        return;
      }
      var steps = shownSteps(DATA, m, st.routine);
      if (!steps) { root.append(h('p', 'cc-model', name)); root.append(msg('Check your manual for this one.', 'I only show steps that are verified for your model.')); root.append(btn('Back', 'cc-btn', function () { st.view = 'routine'; draw(); })); return; }
      var n = steps.length;
      if (st.i >= n) {                                            // the final card
        tel('calc_coach', { phase: 'done', routine: st.routine, model: m });
        var c2 = h('div', 'cc-try'); c2.append(h('h3', 'cc-tt', 'Try it on yours'), h('p', 'cc-say', st.routine === 'R1' ?
          'Same keys, your numbers. Type your whole equation, check the answer, and if the solver asks for a guess, type one near the size and sign you expect. Want the other root? Try a different guess.' :
          'Pick a result from your own problem, store it in a letter, and use the letter in your next line.'));
        root.append(c2);
        var f2 = h('div', 'cc-ft'); f2.append(btn('Back', 'cc-btn', function () { st.i = n - 1; draw(); }), btn('Other routine', 'cc-btn cc-go', function () { st.view = 'routine'; draw(); }));
        root.append(f2); return;
      }
      var s = steps[st.i];
      tel('calc_coach', { phase: 'step', routine: st.routine, step: st.i + 1, of: n, model: m });
      root.append(h('p', 'cc-count', 'Step ' + (st.i + 1) + ' of ' + n + ' · ' + name));
      var bar = h('div', 'cc-bar'); var fill = h('i'); fill.style.width = ((st.i + 1) / n * 100) + '%'; bar.append(fill); root.append(bar);
      if (s.hidden) { root.append(msg('Check your manual for this step.', 'It is not verified for your model yet.')); }
      else {
        root.append(h('p', 'cc-say', say(m, s.press)));
        root.append(keypad(m, s.press));
        var pl = expandPress(m, s.press).pills; if (pl.length) root.append(h('p', 'cc-tag', 'Also: ' + pl.join(', ') + '.'));
        if (DATA.pad.models[m] && DATA.pad.models[m].approx) root.append(h('p', 'cc-tag', 'Approximate layout.'));
        var lcd = h('div', 'cc-lcd'); lcd.setAttribute('role', 'img'); lcd.setAttribute('aria-label', 'Screen: ' + s.screen.map(plain).join(', '));
        s.screen.forEach(function (l) { lcd.append(h('div', 'cc-ln', plain(l))); }); root.append(lcd);
        if (s.screen_verified === false) root.append(h('p', 'cc-tag', 'Your screen may look slightly different.'));
        if (/composed/.test(s.source_loc || '')) root.append(h('p', 'cc-tag', "Built from the guide's keys."));
        if (s.note) root.append(h('p', 'cc-sub', s.note));
      }
      var f = h('div', 'cc-ft');
      f.append(btn('Back', 'cc-btn', function () { if (st.i === 0) st.view = 'routine'; else st.i--; draw(); }), btn(st.i === n - 1 ? 'Finish' : 'Next', 'cc-btn cc-go', function () { st.i++; draw(); }));
      root.append(f);
    }
    var again = function () { st.model = model(); draw(); };
    g.addEventListener('stem-calc-model', again);
    draw();
    return { el: root, draw: draw, state: st, destroy: function () { g.removeEventListener('stem-calc-model', again); root.remove(); } };
  }
  function mount(host, o) { return Promise.all([load(), loadCram().catch(function () { return null; })]).then(function () { return build(host, o); }); }

  /* the overlay: dark, over the bars (60), under the splash (100) */
  function open(o) {
    o = o || {};
    if (!model() && g.stemCalcPick && g.stemCalcPick.open && !o.force) { g.stemCalcPick.open(); return; }   // no calculator yet: the picker first
    if (ov) close();
    var from = d.activeElement;
    ov = h('div', 'cc-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Calc Coach');
    d.body.appendChild(ov);
    ov._from = from;
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    d.documentElement.classList.add('cc-open');
    tel('calc_coach', { phase: o.routine ? 'steps' : 'open', from: o.from || 'chip', routine: o.routine || null, model: model() });
    var mine = ov;
    return load().then(function () {
      var e = !o.routine && routineDeck(model());                              // the 2-slide swipe deck; no verified routine for this model = the plain panel ("check your manual")
      if (e && ov === mine) {
        ov.classList.add('cc-ov-deck'); var dk = buildCram(ov, e, close); dk.firstChild.focus({ preventScroll: true }); return dk;
      }
      return mount(ov, { onClose: close, routine: o.routine, theme: 'dark', bank: curBank }).then(function (p) { ov.tabIndex = -1; ov.focus({ preventScroll: true }); return p; });
    });
  }
  function close() {
    if (!ov) return; var f = ov._from; ov.remove(); ov = null; d.documentElement.classList.remove('cc-open');
    try { if (f && f.isConnected) f.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }

  /* ---- cram panel (the Hail Mary card; data per bank in calc/cram.json) ---- */
  var diet = function () { var c = d.cookie || ''; return /(?:^|;\s*)stem-mode=(?:diet|hard)(?:;|$)/.test(c) && /(?:^|;\s*)stem-mode-v=2(?:;|$)/.test(c); };   // mode.mjs modeOf(): diet = the originals, no cram surface (Tony Nov 8)
  function cramFor(bank) { if (diet()) return null; var e = CRAM && CRAM.banks && CRAM.banks[bank]; return e && CRAM.enabled !== false && Date.now() < Date.parse(e.until) ? e : null; }
  function loadCram() { return CRAM ? Promise.resolve(CRAM) : g.fetch('client/calc/cram.json').then(function (r) { return r.json(); }).then(function (j) { CRAM = j; return j; }); }
  var ICON = { approx: ['M4 9c2-2 4-2 6 0s4 2 6 0 4-2 4 0', 'M4 15c2-2 4-2 6 0s4 2 6 0 4-2 4 0'], x: ['M6 6l12 12M18 6L6 18'], bars: ['M4 20v-5M8 20v-9M12 20v-4M16 20v-12M20 20v-7'], dot: [], chev: ['M6 9l6 6 6-6'] };
  function icon(name) {
    var s = d.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'cc-ic');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    (ICON[name] || []).forEach(function (p) { var e = d.createElementNS(NS, 'path'); e.setAttribute('d', p); s.appendChild(e); });
    if (name === 'dot') { var c = d.createElementNS(NS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '6'); c.setAttribute('fill', 'currentColor'); s.appendChild(c); }
    return s;
  }
  /* ---- the routine deck (Tony Nov 6): the same swipe deck as Hail Mary (buildCram), 2 slides, one animated SVG each (calc/rt/*.svg), each routine in its own hue
     (amber = SOLVE, cyan = STO / Ans: the figure palette, app.css --fig-*), a key strip with this model's verified keys, a button into the per-step walkthrough ---- */
  var SOLVE_RE = /^(ti36xpro|fx115esplus|fx991cw|fx991ex)$/, NUM = /^-?[\d.]+$/, VARK = /^x y ?z ?t/i, STORE = /^\[?(sto->|sto|rcl|store)\]?$/i;
  var keyLabel = function (p) { var b = /^\[(.*)\]$/.exec(p); p = b ? b[1] : p; return p.replace('->', '→').replace(/^x2$/i, 'x²').replace('(-)', '(−)'); };
  var usable = function (M, r) { return (M[r] || []).filter(function (x) { return !UNV.test(x.source_loc || ''); }); };
  /* the verified keys for the one move this slide teaches, read from calc-steps.json (never typed twice): [label] */
  function stripKeys(m, kind) {
    var M = DATA.steps[m], key = M && routineOf(M, kind + '_')[0]; if (!key) return [];
    var st = usable(M, key), out = [], plainKey = function (p) { return !NUM.test(p) && !VARK.test(p); }, i, ks;
    if (kind === 'R1' && SOLVE_RE.test(m)) {
      for (i = 0; i < st.length; i++) {
        ks = st[i].press; var has = ks.some(function (p) { return !plainKey(p); });
        if (has) { if (out.length) break; continue; }
        if (out.length + ks.length > 3) break; out = out.concat(ks);
      }
    } else if (kind === 'R1') out = st[0] ? st[0].press.filter(plainKey) : [];
    else for (i = 0; i < st.length; i++) { var pk = st[i].press; out = out.concat(pk.filter(plainKey)); if (pk.some(function (p) { return STORE.test(p); })) break; }
    if (out.length > 1 && /^(enter|exe)$/i.test(out[0])) out.shift();
    return out.slice(0, 5).map(keyLabel);
  }
  function degBadge(m) {
    var ks = []; ((DATA.steps[m] || {}).preflight_deg || []).forEach(function (x) { if (!UNV.test(x.source_loc || '')) ks = ks.concat(x.press); });
    return ks.length ? 'Check DEG: ' + ks.slice(0, 4).map(keyLabel).join(' → ') : '';
  }
  var MOD = /^(2nd|shift|alpha)$/i;
  function keyStrip(sl, keys, gloss) {
    if (!keys.length) return;
    var row = h('div', 'cc-keys'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Keys: ' + keys.join(', then '));
    keys.forEach(function (k, i) {
      if (i) { var a = h('span', 'cc-arr', '→'); a.setAttribute('aria-hidden', 'true'); row.append(a); }
      row.append(h('span', 'cc-kc' + (MOD.test(k) ? ' cc-kc-mod' : '') + (i === keys.length - 1 ? ' cc-kc-last' : ''), k));
    });
    if (gloss) row.append(h('span', 'cc-eq', '= ' + gloss));
    sl.append(row);
  }
  function routineDeck(m) {
    var M = m && DATA && DATA.steps[m], K = m && DATA && DATA.keys[m];
    if (!M || !K || !routineOf(M, 'R1_').length) return null;
    var solve = SOLVE_RE.test(m), kinds = routineOf(M, 'R2_').length ? ['R1', 'R2'] : ['R1'];
    var C = {
      R1: { cls: 'cc-rt cc-th-amber', anim: 'client/calc/rt/rt-1-solve.svg', icon: 'bars', t: solve ? 'One equation, SOLVE' : 'One equation, stored',
        b: solve ? 'Type it all. Guess. Hit SOLVE.' : 'Store each number. Type the formula once.', gloss: solve ? 'SOLVE' : 'STO' },
      R2: { cls: 'cc-rt cc-th-cyan', anim: 'client/calc/rt/rt-2-store.svg', icon: 'dot', t: TITLE.R2, b: 'Save a number once. Use it twice.', gloss: 'STO' }
    };
    var badge = degBadge(m);
    return { title: K.name, unit: 'Routine', cls: 'cc-routine', cards: kinds.map(function (kind, i) {
      var c = C[kind];
      return { cls: c.cls, kick: K.name, anim: c.anim, icon: c.icon, t: c.t, b: c.b,
        pre: i === 0 && badge ? function (sl) { sl.append(h('p', 'cc-deg', badge)); } : null,
        extra: function (sl) { keyStrip(sl, stripKeys(m, kind), c.gloss); },
        foot: function (sl) {
          if (i < kinds.length - 1) { var sw = h('p', 'cc-swipe'); sw.append(h('span', null, 'Swipe up')); var ch = icon('chev'); ch.setAttribute('class', 'cc-ic cc-bob'); sw.append(ch); sl.append(sw); }
          var bt = h('button', 'cc-btn cc-go cc-back', 'Show me step by step'); bt.type = 'button';
          bt.onclick = function () { open({ routine: kind, force: true, from: 'deck' }); }; sl.append(bt);
        } };
    }), onSlide: function (k) { tel('calc_coach', { phase: 'slide', slide: k + 1, routine: kinds[k], model: m }); } };
  }

  /* the Hail Mary deck: a vertical swipe deck, one full-height slide per tip (CSS scroll-snap, no library). Animated SVG per slide
     (calc/hm/*.svg via <img>, aria-hidden), the static icon until it loads. */
  function buildCram(host, e, onClose) {
    var root = h('section', 'cc cc-deckwrap' + (e.cls ? ' ' + e.cls : '')); root.setAttribute('data-theme', 'dark'); root.setAttribute('aria-label', e.title); host.appendChild(root);
    var sc = h('div', 'cc-deck'); sc.tabIndex = 0; sc.setAttribute('role', 'region'); sc.setAttribute('aria-label', e.title + ', ' + (e.unit ? e.unit.toLowerCase() + 's' : 'tips') + '. Swipe or use the arrow keys.');
    var n = e.cards.length, live = h('p', 'sr-only'); live.setAttribute('role', 'status');
    e.cards.forEach(function (c, i) {
      var sl = h('section', 'cc-slide' + (c.cls ? ' ' + c.cls : '')); sl.setAttribute('aria-label', (e.unit || 'Tip') + ' ' + (i + 1) + ' of ' + n);
      sl.append(h('p', 'cc-kick', c.kick || e.title)); if (c.pre) c.pre(sl);
      var md = h('div', 'cc-media'); md.setAttribute('aria-hidden', 'true');
      var fall = function () { md.replaceChildren(h('span', 'cc-n cc-big')); md.firstChild.append(icon(c.icon)); };
      if (c.anim) { var im = d.createElement('img'); im.src = c.anim; im.alt = ''; im.className = 'cc-anim'; im.onerror = fall; md.append(im); } else fall();
      sl.append(md, h('h3', 'cc-st-t', c.t), h('p', 'cc-st-b', c.b)); if (c.ex) sl.append(h('p', 'cc-ex', c.ex)); if (c.extra) c.extra(sl);
      if (c.foot) c.foot(sl);
      else if (i < n - 1) { var sw = h('p', 'cc-swipe'); sw.append(h('span', null, 'Swipe up to see more')); var ch = icon('chev'); ch.setAttribute('class', 'cc-ic cc-bob'); sw.append(ch); sl.append(sw); }
      else {
        sl.append(h('p', 'cc-tag cc-odds', e.odds));
        var bk = h('button', 'cc-btn cc-go cc-back', 'Back to the question'); bk.type = 'button'; bk.onclick = function () { if (e.onBack) e.onBack(); (onClose || function () { sc.scrollTo({ top: 0 }); })(); }; sl.append(bk);
      }
      sc.append(sl);
    });
    var rail = h('div', 'cc-rail'); rail.setAttribute('aria-hidden', 'true'); var dots = [];
    for (var i = 0; i < n; i++) { var dt = h('i'); dots.push(dt); rail.append(dt); }
    var cur = -1, sync = function () { var k = Math.max(0, Math.min(n - 1, Math.round(sc.scrollTop / Math.max(1, sc.clientHeight)))); if (k === cur) return; cur = k; root.setAttribute('data-k', k); dots.forEach(function (x, j) { x.className = j === k ? 'on' : ''; }); live.textContent = (e.unit || 'Tip') + ' ' + (k + 1) + ' of ' + n; if (e.onSlide) e.onSlide(k); };
    sc.addEventListener('scroll', sync); sync();
    sc.addEventListener('keydown', function (ev) {
      var dir = ev.key === 'ArrowDown' || ev.key === 'PageDown' ? 1 : ev.key === 'ArrowUp' || ev.key === 'PageUp' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault(); sc.scrollTo({ top: Math.max(0, Math.min(n - 1, cur + dir)) * sc.clientHeight, behavior: reduced() ? 'auto' : 'smooth' });
    });
    root.append(sc, rail, live);
    if (onClose) { var x = h('button', 'cc-x cc-deck-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.onclick = onClose; root.append(x); }
    return root;
  }
  function openCram(bank, from) {
    return loadCram().then(function () {
      var e = cramFor(bank); if (!e) return;
      tel('hail_mary', { phase: 'open', from: from || 'chip' });
      e = Object.assign({}, e, { unit: 'Tip', onSlide: function (k) { tel('hail_mary', { phase: 'slide', slide: k + 1 }); }, onBack: function () { tel('hail_mary', { phase: 'back' }); } });
      if (ov) close();
      var from = d.activeElement;
      ov = h('div', 'cc-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', e.title); ov._from = from;
      ov.classList.add('cc-ov-deck'); d.body.appendChild(ov); d.documentElement.classList.add('cc-open');
      ov.addEventListener('keydown', function (k) { if (k.key === 'Escape') { k.stopPropagation(); close(); } });
      var dk = buildCram(ov, e, close); dk.firstChild.focus({ preventScroll: true });
    });
  }
  var curBank = null;
  /* "Constants for this exam": per-bank rows in cram.json; the key path only where verified (Casio ES PLUS: SHIFT 7, two digits, =; TI-36X Pro: 2nd, (, g is item 2) */
  /* the path comes from calc-keys.json constants_map (research); unverified or missing = "scroll to the symbol" */
  var SYMKEY = { 'σ': 'sigma' };
  function constPath(m, r) {
    var map = DATA.keys[m] && DATA.keys[m].constants_map, e = map && map[SYMKEY[r.sym] || r.sym], tail = ' and scroll to the name.';
    if (m === 'ti36xpro' && r.sym === 'σ') return 'Store 5.67e-8 yourself (sto→), typed with EE.';
    if (e && e.available === false) return e.screen_notes.replace(/^No (physics )?constants? menu on this model[^.]*\.\s*/i, 'No constants menu on this model. ').replace(/ \(its "Constant" feature[^)]*\)/, '');
    if (m === 'ti36xpro') return r.sym === 'g' ? '2nd, (, then item 2' : r.sym === 'σ' ? 'Not in the list. Type 5.670374e-8 (use EE) and store it with sto→.' : 'Open 2nd, (' + tail;
    if (m === 'fx115esplus') return 'SHIFT, 7, ' + r.casio + ', =';
    if (e && e.verified && e.keys && e.keys.length) return e.keys.map(function (k) { return k.replace(/^\[(.*)\]$/, '$1'); }).join(', ');
    return 'Open the CONST menu (SHIFT 7) and scroll to the symbol.';
  }
  function constantsFor(bank) { var e = cramFor(bank); return e && e.constants || null; }
  function slots() {
    var on = !!cramFor(curBank);
    d.querySelectorAll('.cc-slot').forEach(function (sl) {
      sl.hidden = !on; if (on && !sl.firstChild) sl.append(linkEl('Hail Mary', 'cc-link', function () { openCram(curBank, 'cluck'); }));
    });
    d.querySelectorAll('.cc-row').forEach(function (row) {
      var hm = row.querySelector('.cc-cta-hm');
      if (on && !hm) { hm = ctaEl('Hail Mary guess', 'cc-cta cc-cta-hm', function () { openCram(curBank, 'chip'); }); hm.setAttribute('aria-label', 'Hail Mary: 4 moves for a smart guess'); row.append(hm); }
      else if (!on && hm) hm.remove();
    });
  }

  /* ---- promos ---- */
  /* a link-like entry (role=link, keyboard: Enter / Space) for the always-there entries (chip, Hail Mary slot, Cluck chrome): they are quiet chrome, not a button the
     toast / note cover rules must keep clear (toast.js LIVE) */
  function linkEl(text, cls, fn) {
    var e = h('span', cls, text); e.setAttribute('role', 'link'); e.tabIndex = 0; e.onclick = fn;
    e.onkeydown = function (k) { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); fn(); } };
    return e;
  }
  /* the item card's two call-to-action buttons (Tony Nov 6): role=link spans (toast cover rule), 44px+, amber (Calc) and pink (Hail Mary), calc-coach.css */
  function ctaEl(text, cls, fn) { var b = linkEl('', cls, fn); b.append(h('span', 'cc-cta-t', text)); return b; }   // role=link, not <button>: toast.js LIVE keeps toasts off buttons, and these sit where the HUD tip / start-line toast lands (toast-note HUD tip B)
  /* the shine: each button sweeps twice, one at a time, and only while no other animation runs (blink-fx: one motion group at a time); a first sweep waits 2 s idle so an
     early Check wins; an answer cancels it. Not under reduced motion, nor in automated browsers (pixel-compare specs; ?ccshine=1 / __ccShine opts in). */
  function shine(row) {
    if (reduced() || (navigator.webdriver && !(g.__ccShine || /[?&]ccshine=1\b/.test(location.search)))) return;
    var els = [].slice.call(row.querySelectorAll('.cc-cta')), seq = els.concat(els), tries = 0;
    (function next(first) {
      if (!seq.length || !row.isConnected || tries++ > 60 || row.__shineStop) return;
      var busy = d.getAnimations && d.getAnimations().some(function (a) { var t = a.effect && a.effect.target; return a.playState === 'running' && !(t && t.closest && t.closest('.cc-cta')); });
      if (busy || d.visibilityState === 'hidden') { setTimeout(next, 500); return; }
      var e = seq.shift(); e.classList.add('cc-shine');
      setTimeout(function () { e.classList.remove('cc-shine'); setTimeout(next, 700); }, 1500);
    })();
  }
  function openBtn(text, cls, from) { var b = h('button', cls, text); b.type = 'button'; b.setAttribute('data-calc-from', from); b.onclick = function () { open({ from: from }); }; return b; }
  function welcomeCard(host) {
    if (!host || host.querySelector('.cc-welcome')) return;
    var p = promo(), c = h('aside', 'cc-welcome'); c.setAttribute('aria-label', 'Calc Coach');
    var wt = h('h3', 'cc-wt', p.title); if (p.exam) { wt.style.cursor = 'pointer'; wt.onclick = function () { open({ from: 'welcome' }); }; }
    c.append(wt, h('p', 'cc-wb', p.body), openBtn('Show me the keys', 'cc-btn cc-go', 'welcome'));
    host.insertBefore(c, host.firstChild);                                  // above the ladder: a ladder row that grows or changes never moves it (desk-layout L4/L6)
  }
  /* each item: the persistent Calc chip + hail-mary slot; on BANK_P3X in exam time the cram strip (dismissable) and the once-a-day toast */
  /* the auto-offer (BANK_P3X, cram window, cram.json `enabled`): Hail Mary is offered on the 2nd wrong pick on an item (the existing `drill:answer` event, app.js record()),
     or after 3 minutes on an item with no correct answer (one timer per item, re-armed by onItem; there is no polling loop). Once per item, 3 per session, never
     while a modal (the deck, the picker, lock-help, Cluck, reward FX) is up. It rides the toast queue (toast.js: one at a time) and expires (`until`) rather than
     wait behind another toast. The toast's own close button is "Not now". */
  var OFFER = { text: 'Stuck? Guess smart.\nLearn 4 fast guess tricks. Go from 1 in 5 to up to 1 in 2.', act: 'Show me' };
  var itemT = 0, toastT = 0, offered = {}, offers = 0, wrongs = {}, finished = {}, curItem = null;
  var busyUI = function () { return !!(d.querySelector('.cc-ov') || (g.stemLockHelp && g.stemLockHelp.up) || (g.stemCluckOpen && g.stemCluckOpen()) || (g.stemCalcPick && g.stemCalcPick.up) || d.querySelector('.fx-ov')); };
  function offer(why) {
    why = why === 'miss2' || why === 'time3m' ? why : null;
    var code = curItem;
    if (!code || offered[code] || offers >= 3 || finished[code] || curBank !== 'BANK_P3X' || !cramFor(curBank) || !g.stemToast || busyUI() || d.visibilityState === 'hidden') return false;
    offered[code] = 1; offers++;
    g.stemToast.show({ text: OFFER.text, bar: false, until: Date.now() + 15000, at: function () { return d.querySelector('.cc-row') || d.getElementById('problem'); },
      onshow: function () { tel('hail_mary', { phase: 'offer_shown', trigger: why }); },
      onend: function (w) { tel('hail_mary', { phase: 'offer_' + w, trigger: why }); },
      action: { label: OFFER.act, run: function () { tel('hail_mary', { phase: 'offer_clicked', trigger: why }); openCram(curBank, 'offer'); } } });
    return true;
  }
  if (g.addEventListener) g.addEventListener('drill:answer', function (e) {
    d.querySelectorAll('.cc-row').forEach(function (r) { r.__shineStop = 1; });                   // an answer: the shine stops for this item
    var dt = e.detail || {}, code = dt.code; if (!code) return;
    if (dt.right) { finished[code] = 1; return; }
    wrongs[code] = (wrongs[code] || 0) + 1;
    if (wrongs[code] === 2) setTimeout(function () { offer('miss2'); }, 900);                          // after the feedback settles
  });
  /* each item: the persistent Calc chip + hail-mary slot (top of the question card, out of the way of the toast and the foot); on BANK_P3X in exam time the
     cram strip (dismissable) and, after 45 s on the item, the once-a-day toast */
  function onItem(bank) {
    var pr = d.getElementById('problem'); if (!pr) return;
    curBank = bank; clearTimeout(itemT); clearTimeout(toastT);
    var pc = d.getElementById('pcode'); curItem = pc ? pc.textContent : null;
    pr.querySelectorAll('.cc-row').forEach(function (e) { e.remove(); });
    if (diet()) return;                                                       // diet: no Calc chip / Hail Mary row, no promo toast
    var row = h('div', 'cc-row'), p = promo();
    var chip = ctaEl('TI/Casio tricks', 'cc-cta cc-cta-calc', function () { open({ from: 'chip' }); }); chip.setAttribute('aria-label', 'Calc Coach: TI and Casio calculator tricks'); row.append(chip);
    pr.insertBefore(row, d.getElementById('rtag') || d.getElementById('blocks') || null);                // before #rtag (the reveal tray's #rtag + .blocks adjacency)
    loadCram().then(function () { slots(); setTimeout(function () { shine(row); }, 2000); }, function () { setTimeout(function () { shine(row); }, 2000); });
    if (bank !== 'BANK_P3X') return;
    var me = curItem;
    itemT = setTimeout(function () { if (curItem === me) offer('time3m'); }, g.__ccOfferMs || 180000);
    if (p.exam && ls(KEY_TOAST + day()) !== '1' && g.stemToast && !(g.stemCram && g.stemCram.on && g.stemCram.on()))   // cram day: peek.js's own once-a-day toast is the one (never two promos back to back)
      toastT = setTimeout(function () {
        if (curItem !== me || busyUI() || ls(KEY_TOAST + day()) === '1') return;
        ls(KEY_TOAST + day(), '1');                                          // asked for once a day; `until` drops it rather than let it hold the queue
        g.stemToast.show({ text: p.title, bar: false, until: Date.now() + 8000, at: function () { return row; }, action: { label: 'Show me', run: function () { open({ from: 'toast' }); } } });
      }, g.__ccToastMs || 45000);
  }
  /* Cluck's app chrome (not the reply): a link under his text, next to .cl-verify, and the second slot */
  function chrome(el) {
    var pane = el.querySelector('#clTabEP'); if (!pane || pane.querySelector('.cc-cl')) return;
    var r = h('div', 'cc-cl'); r.append(linkEl('Calc Coach: the keys for your calculator', 'cc-link', function () { open({ from: 'cluck' }); }));
    var slot = h('span', 'cc-slot'); slot.setAttribute('data-slot', 'hailmary'); slot.hidden = true; r.append(slot);
    pane.appendChild(r); slots();
  }

  var api = { open: open, close: close, mount: mount, load: load, setData: setData, build: build, validate: validate, shownSteps: shownSteps, model: model,
    promo: promo, plain: plain, offer: offer, routineDeck: routineDeck, stripKeys: stripKeys, OFFER: OFFER, openCram: openCram, cramFor: cramFor, loadCram: loadCram, buildCram: buildCram, welcomeCard: welcomeCard, onItem: onItem, chrome: chrome, FLAGS: FLAGS, EXAM_END: EXAM_END, COPY: COPY, reduced: reduced };
  g.CalcCoach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
