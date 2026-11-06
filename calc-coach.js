/* calc-coach.js: Calc Coach, an app-wide panel (app chrome, like popover.js / toast.js; design/CALC-COACH.md). NOT a Cluck reply format:
   the model never writes it; replies stay OpenUI Lang. It teaches 2 routines (SOLVE; STO + Ans) on the student's own calculator:
   an SVG keypad with the key(s) to press lit, a simulated screen, one you-first line, Back / Next, and a "Try it on yours" card.
   Data: calc/calc-layout.json (model -> key grid), calc/calc-steps.json (model -> routine -> example -> steps), calc/calc-keys.json.
   Only entries marked verified:true are shown; the rest say "check your manual".
   The calculator choice is owned by the picker (window.stemCalcPick = { open(), get(), onChange(fn) }, localStorage `stem-calc-model`,
   CustomEvent `stem-calc-model`). This file only reads it.
   Entry points: CalcCoach.open(opts) (overlay), CalcCoach.mount(host, opts) (inline, calc.html), welcomeCard(host), onItem(bankCode),
   chrome(clEl) (Cluck's app chrome, next to .cl-verify). Promo: promo(), EXAM_END; FLAGS.hailMary is the slot for a coming panel. */
(function (g) {
  'use strict';
  var d = g.document;
  var EXAM_END = Date.parse('2026-11-10T08:00:00Z');   // 2026-11-09T23:59 America/Los_Angeles is the last minute of the exam-day copy
  var FLAGS = { hailMary: true };                         // the cram panel (calc/cram.json, per bank): off = its slot and promo line are hidden. Temporary content, reusable skeleton
  var KEY_MODEL = 'stem-calc-model', KEY_STRIP = 'stem-calc-strip', KEY_TOAST = 'stem-calc-toast-';
  var COPY = {
    exam: { title: 'Exam day: 2 calculator moves that save you 5 minutes',
      body: 'Type the whole equation and hit SOLVE. Store a number once and reuse it. Pick your calculator and I will show you the keys. QUACK.' },
    plain: { title: 'Calculator moves', body: 'Two moves worth knowing: solve an equation in one go, and store a number instead of retyping it. Pick your calculator to see the keys.' }
  };
  var DATA = null, loading = null, ov = null, CRAM = null;

  function ls(k, v) { try { if (v === undefined) return g.localStorage.getItem(k); if (v === null) g.localStorage.removeItem(k); else g.localStorage.setItem(k, v); } catch (e) { /* blocked */ } return null; }
  var reduced = function () { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function h(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
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
    var get = function (f) { return g.fetch('calc/' + f).then(function (r) { return r.json(); }); };
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
        var c2 = h('div', 'cc-try'); c2.append(h('h3', 'cc-tt', 'Try it on yours'), h('p', 'cc-say', st.routine === 'R1' ?
          'Same keys, your numbers. Type your whole equation, check the answer, and if the solver asks for a guess, type one near the size and sign you expect. Want the other root? Try a different guess.' :
          'Pick a result from your own problem, store it in a letter, and use the letter in your next line.'));
        root.append(c2);
        var f2 = h('div', 'cc-ft'); f2.append(btn('Back', 'cc-btn', function () { st.i = n - 1; draw(); }), btn('Other routine', 'cc-btn cc-go', function () { st.view = 'routine'; draw(); }));
        root.append(f2); return;
      }
      var s = steps[st.i];
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
    return mount(ov, { onClose: close, routine: o.routine, theme: 'dark', bank: curBank }).then(function (p) { ov.tabIndex = -1; ov.focus({ preventScroll: true }); return p; });
  }
  function close() {
    if (!ov) return; var f = ov._from; ov.remove(); ov = null; d.documentElement.classList.remove('cc-open');
    try { if (f && f.isConnected) f.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }

  /* ---- cram panel (the Hail Mary card; data per bank in calc/cram.json) ---- */
  function cramFor(bank) { var e = CRAM && CRAM.banks && CRAM.banks[bank]; return e && FLAGS.hailMary && Date.now() < Date.parse(e.until) ? e : null; }
  function loadCram() { return CRAM ? Promise.resolve(CRAM) : g.fetch('calc/cram.json').then(function (r) { return r.json(); }).then(function (j) { CRAM = j; return j; }); }
  var ICON = { approx: ['M4 9c2-2 4-2 6 0s4 2 6 0 4-2 4 0', 'M4 15c2-2 4-2 6 0s4 2 6 0 4-2 4 0'], x: ['M6 6l12 12M18 6L6 18'], bars: ['M4 20v-5M8 20v-9M12 20v-4M16 20v-12M20 20v-7'], dot: [] };
  function icon(name) {
    var s = d.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'cc-ic');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    (ICON[name] || []).forEach(function (p) { var e = d.createElementNS(NS, 'path'); e.setAttribute('d', p); s.appendChild(e); });
    if (name === 'dot') { var c = d.createElementNS(NS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '6'); c.setAttribute('fill', 'currentColor'); s.appendChild(c); }
    return s;
  }
  function buildCram(host, e, onClose) {
    var root = h('section', 'cc'); root.setAttribute('data-theme', 'dark'); root.setAttribute('aria-label', e.title); host.appendChild(root);
    var hd = h('div', 'cc-hd'); hd.append(h('h2', 'cc-t', e.title));
    if (onClose) { var x = h('button', 'cc-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.onclick = onClose; hd.append(x); }
    root.append(hd, h('p', 'cc-sub', e.intro));
    e.cards.forEach(function (c, n) { var k = h('div', 'cc-card cc-static'), bd = h('span', 'cc-n'); if (c.icon) bd.append(icon(c.icon)); else bd.textContent = String(n + 1); k.append(bd, h('span', 'cc-ct', c.t), h('span', 'cc-cw', c.b)); root.append(k); });
    root.append(h('p', 'cc-tag', e.odds));
    return root;
  }
  function openCram(bank) {
    return loadCram().then(function () {
      var e = cramFor(bank); if (!e) return;
      if (ov) close();
      var from = d.activeElement;
      ov = h('div', 'cc-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', e.title); ov._from = from;
      d.body.appendChild(ov); d.documentElement.classList.add('cc-open');
      ov.addEventListener('keydown', function (k) { if (k.key === 'Escape') { k.stopPropagation(); close(); } });
      buildCram(ov, e, close); ov.tabIndex = -1; ov.focus({ preventScroll: true });
    });
  }
  var curBank = null;
  /* "Constants for this exam": per-bank rows in cram.json; the key path only where verified (Casio ES PLUS: SHIFT 7, two digits, =; TI-36X Pro: 2nd, (, g is item 2) */
  /* the path comes from calc-keys.json constants_map (research); unverified or missing = "scroll to the symbol" */
  var SYMKEY = { 'σ': 'sigma' };
  function constPath(m, r) {
    var map = DATA.keys[m] && DATA.keys[m].constants_map, e = map && map[SYMKEY[r.sym] || r.sym], tail = ' and scroll to the name.';
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
      sl.hidden = !on; if (on && !sl.firstChild) { var b = h('button', sl.parentNode.classList.contains('cc-cl') ? 'cc-link' : 'cc-chip', 'Hail Mary'); b.type = 'button'; b.onclick = function () { openCram(curBank); }; sl.append(b); }
    });
  }

  /* ---- promos ---- */
  function openBtn(text, cls, from) { var b = h('button', cls, text); b.type = 'button'; b.setAttribute('data-calc-from', from); b.onclick = function () { open(); }; return b; }
  function welcomeCard(host) {
    if (!host || host.querySelector('.cc-welcome')) return;
    var p = promo(), c = h('aside', 'cc-welcome'); c.setAttribute('aria-label', 'Calc Coach');
    c.append(h('h3', 'cc-wt', p.title), h('p', 'cc-wb', p.body), openBtn('Show me the keys', 'cc-btn cc-go', 'welcome'));
    host.appendChild(c);
  }
  /* each item: the persistent Calc chip + hail-mary slot; on BANK_P3X in exam time the cram strip (dismissable) and the once-a-day toast */
  function onItem(bank) {
    var pr = d.getElementById('problem'); if (!pr) return;
    curBank = bank;
    pr.querySelectorAll('.cc-row').forEach(function (e) { e.remove(); });
    var row = h('div', 'cc-row');
    var p = promo();
    if (bank === 'BANK_P3X' && p.exam && ls(KEY_STRIP) !== '1') {
      var s = h('div', 'cc-strip'); s.append(h('span', 'cc-st', p.title + '.'), openBtn('Show me', 'cc-btn', 'strip'));
      var hm = CRAM && CRAM.banks[bank]; if (hm && cramFor(bank)) { var li = h('button', 'cc-link cc-hm', hm.promo); li.type = 'button'; li.onclick = function () { openCram(bank); }; s.append(li); }
      var x = h('button', 'cc-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
      x.onclick = function () { ls(KEY_STRIP, '1'); s.remove(); }; s.append(x); row.append(s);
    }
    var chip = openBtn('Calc', 'cc-chip', 'chip'); chip.setAttribute('aria-label', 'Calc Coach: calculator help'); row.append(chip);
    var slot = h('span', 'cc-slot'); slot.setAttribute('data-slot', 'hailmary'); slot.hidden = true; row.append(slot);
    pr.appendChild(row);
    loadCram().then(slots, function () { /* no cram data */ });
    if (bank === 'BANK_P3X' && p.exam && ls(KEY_TOAST + day()) !== '1' && g.stemToast) {
      ls(KEY_TOAST + day(), '1');                                            // asked for once a day, whether or not it found room to show (toast.js waits for a free spot)
      g.stemToast.show({ text: p.title + '.', bar: false, at: function () { return row; }, action: { label: 'Show me', run: function () { open(); } } });
    }
  }
  /* Cluck's app chrome (not the reply): a link under his text, next to .cl-verify, and the second slot */
  function chrome(el) {
    var pane = el.querySelector('#clTabEP'); if (!pane || pane.querySelector('.cc-cl')) return;
    var r = h('div', 'cc-cl'); r.append(openBtn('Calc Coach: the keys for your calculator', 'cc-link', 'cluck'));
    var slot = h('span', 'cc-slot'); slot.setAttribute('data-slot', 'hailmary'); slot.hidden = true; r.append(slot);
    pane.appendChild(r); slots();
  }

  var api = { open: open, close: close, mount: mount, load: load, setData: setData, build: build, validate: validate, shownSteps: shownSteps, model: model,
    promo: promo, plain: plain, openCram: openCram, cramFor: cramFor, loadCram: loadCram, buildCram: buildCram, welcomeCard: welcomeCard, onItem: onItem, chrome: chrome, FLAGS: FLAGS, EXAM_END: EXAM_END, COPY: COPY, reduced: reduced };
  g.CalcCoach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
