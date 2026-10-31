/* repair.js: the Repair ladder (brain design-round-66 DESIGN-v3 §3, v2 §B). App chrome, not a reply format: the steps are author-time
   data (item.repair, SCHEMA.md), drawn by our code; nothing Cluck says goes through here. Graded on the device: the item is already a miss.

   Repair.mount(host, item, opts)   draws the ladder into host (replacing what is there); returns { el, destroy() }
       opts: { variant: "repair" | "alt" | "welcome" | "full", error, sheet, grade(value, n), answer, on(name, data) }
       answer = the full card's display string for an answer step with no key on the device (else its worked value)
       error = the slip family (slipMatch / a `wrong` entry: "sign", "drop+sign"), "SLIP_TIE" or null; sheet = { id: tex } for `sheet` steps
       grade(value, n) -> Promise<{ ok, answer? }>: grades a step that has no `ok` (the answer step: its key never ships, TONY-DECISIONS #29.7;
       the host wires it to POST /repair/<code>/check). Such a step takes the item's own type (a twin shares its template's ladder): mc = a
       pick of the item's choices, num = a number box; another type keeps the ladder's kind. Steps with `ok` grade here
       n = the 1-based try on that step; an `answer` (display string, 2nd miss, #33 A) = the worked solution: stem + answer, try struck, no hue
       on: repair_done { why_ok, variant, ladder, auto } · repair_skip { variant } · repair_next { } (full, after the study pause)
   Repair.blankStep(item, error)    the step id the slip lives in, or null (= the fallback ladder). stemJev.repairBlank's signature

   Which steps are blank (v2 §B):
     repair   family matched → that `fam` step blank + its why; the steps before and after worked; `answer` blank
              no family / SLIP_TIE → fallback: all worked, `answer` blank, why on step 1. Never only a red box
     alt      the item's `alt` ladder by the same rule (no authored alt → the main ladder, fallback only: never the same blank twice)
     welcome  every step blank, why on the fam step (else step 1); unfailable: a wrong tap is a hint, no red, no auto-fill
     full     the worked solution, every step ✓; Next dim for STUDY_MS, then "come back later" is the student's call
   A step: reveal one at a time (done = one ✓ line, active = open, future = a dim label). Welcome keeps the form instead (W129, PLAN L6 "no
   jank"): every step's input is drawn from the start and never leaves its place: future = an inert preview, active = live, done = locked
   with the pick marked (the ✓ in the head); a row never shrinks, so a tap changes its own row and the next one and moves nothing else. A wrong try: ✗ on it + the miss line; TRIES
   wrong → it fills itself in with its why shown and moves on. ✓ / ✗ are glyphs, never hue alone. All text lands as textContent;
   `$..$` math goes through Graph.tex (escapes the text around it).
   Lines (copy/repair-lines.js, contract v2): doneBy{L1,L2,L3,tail} else done; hintBy{far[],two,three[]} by the welcome wrong-tap count else
   hint; auto / intro.<variant> "" or missing = no line (an auto-filled step's number badge gets data-auto instead).
*/
(function (root) {
  "use strict";
  const TRIES = 2;            // TUNABLE (v2 §B): wrong tries on one step before it fills itself in
  const STUDY_MS = 10000;     // TUNABLE (DESIGN-v3 §3): the full solution's study pause before Next is live
  const TOL = 0.02;           // a `num` step's relative tolerance when it names none
  const L = () => root.__stemRepairLines || {};

  const any = a => Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a;   // one of a rotation (Math.random: stubbed in tests)
  const ladderOf = item => (item && item.repair && item.repair.steps) || [];
  function blankOf(steps, error) {
    if (!error || error === "SLIP_TIE") return null;
    const fams = String(error).split("+");
    const s = steps.find(s => s.fam && s.id !== "answer" && fams.includes(s.fam));
    return s ? s.id : null;
  }
  const blankStep = (item, error) => blankOf(ladderOf(item), error);

  /* ---- small DOM helpers: text only, math through Graph.tex ---- */
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) put(el, text);
    return el;
  }
  function put(el, s) {
    s = String(s);
    if (s.includes("$") && root.Graph && root.Graph.tex) el.innerHTML = root.Graph.tex(s);   // Graph.tex escapes everything outside $..$
    else el.textContent = s;
  }
  const TEXOP = { "−": "-", "×": "\\times", "÷": "\\div", "·": "\\cdot" };
  const fillTex = (st, v) => "$" + String(st.tex).replace("▢", v == null ? "\\square" : (TEXOP[v] || v)) + "$";
  const num = s => parseFloat(String(s).replace(/−/g, "-").replace(/,/g, "").trim());

  function mount(host, item, o = {}) {
    const variant = o.variant || "repair";
    if (root.stemMock && root.stemMock.on() && variant !== "welcome") return { el: null, destroy() {} };   // the night-before mock (W103b): no ladder until it ends
    const alt = variant === "alt" && item.repair && item.repair.alt;
    const steps = alt ? alt.steps : ladderOf(item);
    const welcome = variant === "welcome", full = variant === "full";
    const blank = variant === "repair" || alt ? blankOf(steps, o.error) : null;
    const fam = steps.findIndex(s => s.why && s.fam);
    const whyAt = full ? -1 : blank ? steps.findIndex(s => s.id === blank) : welcome && fam >= 0 ? fam : 0;
    const keyless = st => st.id !== "answer" || st.ok != null ? st             // a twin shares its template's ladder (todo 117): the answer step
      : item.type === "mc" ? { ...st, kind: "pick", opts: item.choices }        // with no key takes the SHOWN item's type, not the ladder's kind
      : item.type === "num" ? { ...st, kind: "num", opts: undefined, tol: item.tol } : st;
    const S = steps.map(keyless).map((st, i) => ({
      st, i, worked: full || (!welcome && st.id !== "answer" && st.id !== blank),
      ask: i === whyAt && !!st.why, state: full ? "done" : "future", ok: false, why: null, tried: new Set(), whyTried: new Set(), miss: "", auto: false
    }));
    let whyOk = true, autos = 0, finished = full, timer = 0, gone = false, solved = null;   // solved = { wrong, answer } once the server sends it
    let missed = false, taps = 0;                                               // any wrong try (done level); welcome wrong taps on this item (hint tier)
    const optsOf = st => st.opts || (st.kind === "pick" && item.choices) || [];
    const emit = (name, data) => { if (o.on) o.on(name, data); };
    function hint() {                                                            // welcome: tap 1 far, 2 two, 3+ three; old shape: the one hint
      const H = L().hintBy;
      if (!H) return L().hint || "";
      taps++;
      return any(taps === 1 ? H.far : taps === 2 ? H.two : H.three) || "";
    }
    function doneLine() {                                                        // L1 no wrong try, L2 some, L3 the answer was revealed
      const D = L().doneBy;
      return D ? (D[solved || full ? "L3" : missed ? "L2" : "L1"] || "") + (D.tail || "") : L().done || "";
    }

    const el = h("section", "rp");
    el.dataset.variant = variant; el.dataset.ladder = alt ? "alt" : "main";
    el.setAttribute("aria-label", "Repair");
    host.replaceChildren(el);

    /* ---- the state machine: finish the active step, open the next one that needs the student ---- */
    function advance() {
      for (const s of S) {
        if (s.state === "done") continue;
        if (s.worked) s.ok = true;
        if (s.ok && (!s.ask || s.why != null)) { s.state = "done"; continue; }
        s.state = "active"; return;
      }
      if (!finished) { finished = true; emit("repair_done", { why_ok: whyOk, variant, ladder: el.dataset.ladder, auto: autos }); }
    }
    function fillIn(s) {                                                         // out of tries: the step fills itself in, its why shown
      s.ok = true; s.auto = true; autos++;
      if (s.ask && s.why == null) { s.why = s.st.why.ok; whyOk = false; }
      s.miss = L().auto || "";
    }
    function tryValue(s, v) {
      const st = s.st;
      if (st.ok == null && o.grade) {                                            // the key is on the server: one grade in flight at a time
        if (s.busy) return;
        s.busy = true; s.n = (s.n || 0) + 1;
        Promise.resolve(o.grade(v, s.n)).then(r => {
          s.busy = false;
          if (gone) return;
          if (!r || r.ok === true || r.answer == null) return judge(s, v, !!r && r.ok === true, r && typeof r.hint === "string" ? r.hint : "");   // todo 130: the server's slip / wrong line
          const p = st.kind === "pick" && optsOf(st).find(p => p.id === v);         // the step fills in with it; no miss / auto line under it
          solved = { wrong: p ? p.md : String(v), answer: String(r.answer) };
          missed = true; fillIn(s); s.miss = ""; s.shown = solved.answer; settle();
        }, () => { s.busy = false; });
        return;
      }
      judge(s, v, st.kind === "num" ? Math.abs(num(v) - Number(st.ok)) <= (st.tol != null ? st.tol : TOL) * (Math.abs(Number(st.ok)) || 1)
        : String(v) === String(st.ok));
    }
    function judge(s, v, right, said) {                                         // said: the server's {error, hint} line for this miss (a slip family), else ""
      const st = s.st;
      if (right) { s.ok = true; s.val = v; if (welcome) s.missGone = true; else s.miss = ""; }   // welcome: the hint line keeps its room, emptied (a row never shrinks)
      else {
        s.tried.add(String(v)); missed = true; s.missGone = false;
        const h = welcome ? hint() : L().miss || "";
        s.miss = (st.miss && st.miss[v]) || said || h;
        if (!welcome && s.tried.size >= TRIES) fillIn(s);
      }
      settle();
    }
    function tryWhy(s, i) {
      const w = s.st.why;
      if (i === w.ok) { s.why = i; if (welcome) s.missGone = true; else s.miss = ""; }
      else {
        whyOk = false; s.whyTried.add(i); missed = true; s.missGone = false;
        s.miss = welcome ? hint() : L().miss || "";
        if (!welcome && s.whyTried.size >= TRIES) fillIn(s);
      }
      settle();
    }
    function settle() {
      const focusIn = el.contains(document.activeElement);
      advance(); draw();
      if (focusIn) {
        let f = el.querySelector('.rp-step[data-state="active"] :is(button:not(:disabled), input:not(:disabled))') || el.querySelector(".rp-next");
        if (f && welcome && f.matches("input")) {                               // WebKit reveals a focused text box even with preventScroll: one off screen
          const r = f.getBoundingClientRect();                                  // takes the focus on its row instead (Tab goes on into it)
          if (r.top < 0 || r.bottom > innerHeight) { f = f.closest(".rp-step"); f.tabIndex = -1; }
        }
        if (f) f.focus(welcome ? { preventScroll: true } : undefined);         // welcome: focus never scrolls the page under the student (W129 L6); the page is the one scroller, theirs
      }
    }

    /* ---- drawing ---- */
    function shown(s) {                                                          // a step's worked value, as text / $math$
      if (s.shown != null) return s.shown;                                     // the server's display string, as is
      const st = s.st, ok = st.ok != null ? st.ok : s.val;                     // no key here: the value the server took (none if it filled in)
      if (ok == null) return "";
      if (st.kind === "pick") { const p = optsOf(st).find(p => p.id === ok); return p ? p.md : ""; }
      if (st.kind === "sheet") return o.sheet && o.sheet[ok] ? "$" + o.sheet[ok] + "$" : String(ok);
      if (st.kind === "fill") return fillTex(st, ok);
      return String(ok) + (st.unit ? " " + st.unit : "");
    }
    function chip(text, data, onTap, s, key, tried) {
      const b = h("button", "rp-chip", text);
      b.type = "button"; Object.assign(b.dataset, data);
      if (tried.has(key) && !welcome) { b.disabled = true; b.append(h("span", "rp-x", "✗")); }
      b.addEventListener("click", () => onTap(s, data.why != null ? Number(data.why) : data.v));
      return b;
    }
    function valueUi(s) {
      const st = s.st, box = h("div", "rp-val-ui");
      if (st.kind === "num") {
        const f = h("form", "rp-num"), inp = h("input", "rp-in"), go = h("button", "rp-check", L().check || "Check");
        inp.type = "text"; inp.inputMode = "decimal"; inp.autocomplete = "off"; inp.setAttribute("aria-label", st.label);
        go.type = "submit";
        f.addEventListener("submit", e => { e.preventDefault(); if (inp.value.trim()) tryValue(s, inp.value); });   // Enter submits natively: no key handler
        f.append(inp, go); box.append(f);
        if (st.unit) f.append(h("span", "rp-unit", st.unit));
        return box;
      }
      if (st.kind === "fill") box.append(h("div", "rp-tex", fillTex(st, null).replace("$", "$\\displaystyle ")));
      const opts = h("div", "rp-opts rp-val-opts");
      const list = st.kind === "pick" ? optsOf(st).map(p => [p.id, p.md]) : st.kind === "sheet" ? st.pool.map(id => [id, o.sheet && o.sheet[id] ? "$" + o.sheet[id] + "$" : id])
        : st.opts.map(v => [v, v]);
      for (const [v, text] of list) opts.append(chip(text, { v }, tryValue, s, String(v), s.tried));
      box.append(opts);
      return box;
    }
    function whyUi(s) {
      const w = s.st.why, box = h("div", "rp-why");
      box.append(h("p", "rp-q", w.q || L().why || "Why is that?"));
      const opts = h("div", "rp-opts");
      w.opts.forEach((t, i) => opts.append(chip(t, { why: String(i) }, tryWhy, s, i, s.whyTried)));
      box.append(opts);
      return box;
    }
    /* welcome (W129): a box that is not answerable now is still drawn, in place: its controls disabled (never `inert`: toast.js would take the
       inert rows for empty page and slide its card onto the ladder), hidden from a screen reader; `picked` marks the answer */
    function lock(box, how, picked) {
      box.classList.add(how);
      box.setAttribute("aria-hidden", "true");
      box.querySelectorAll("button, input").forEach(c => { c.disabled = true; c.tabIndex = -1; });
      if (picked != null) box.querySelectorAll(".rp-chip").forEach(c => c.classList.toggle("rp-picked", (c.dataset.why != null ? c.dataset.why : c.dataset.v) === String(picked)));
      const inp = box.querySelector(".rp-in"); if (inp && picked != null) inp.value = String(picked);
    }
    function keptEl(s) {
      const st = s.st, li = h("li", "rp-step"), live = s.state === "active";
      li.dataset.id = st.id; li.dataset.state = s.state;
      if (live) li.setAttribute("aria-current", "step");
      const head = h("div", "rp-head"), n = h("span", "rp-n", String(s.i + 1));
      if (s.auto && !L().auto) n.dataset.auto = "";
      head.append(n, h("span", "rp-label", st.label));
      if (s.ok) head.append(h("span", "sr-only", shown(s)));                     // the value for a screen reader: the locked chips are aria-hidden
      head.append(h("span", "rp-ok", "✓"));                                      // always there (welcome.css hides it until done): its room never moves the label
      li.append(head);
      const body = h("div", "rp-body"), val = valueUi(s);
      const pick = s.ok ? (s.val != null ? s.val : st.ok) : null;
      if (s.state === "future") lock(val, "rp-ghost", null); else if (!live || s.ok) lock(val, "rp-locked", pick);
      body.append(val);
      if (s.ask) {
        const w = whyUi(s);
        if (s.state === "future" || (live && !s.ok)) { lock(w, "rp-ghost", null); w.style.visibility = "hidden"; w.dataset.room = ""; }   // its room stays, unseen until its step's pick:
        else if (s.why != null) lock(w, "rp-locked", s.why);                    // "Why half?" before d/2 gives the answer away (W129 shot QA)
        body.append(w);
      }
      li.append(body);
      if (s.miss && s.state !== "future") {
        const m = h("p", "rp-miss", s.miss);
        if (s.missGone) { m.style.visibility = "hidden"; m.setAttribute("aria-hidden", "true"); } else m.setAttribute("aria-live", "polite");
        li.append(m);
      }
      return li;
    }
    function stepEl(s) {
      if (welcome) return keptEl(s);
      const st = s.st, li = h("li", "rp-step");
      li.dataset.id = st.id; li.dataset.state = s.state;
      if (s.state === "active") li.setAttribute("aria-current", "step");
      const head = h("div", "rp-head");
      const n = h("span", "rp-n", String(s.i + 1));
      if (s.auto && !L().auto) n.dataset.auto = "";                              // no auto line: the badge says it filled itself in
      head.append(n, h("span", "rp-label", st.label));
      if (s.state === "done" || (s.state === "active" && s.ok)) head.append(h("span", "rp-val", shown(s)));
      if (s.state === "done") head.append(h("span", "rp-ok", "✓"));
      li.append(head);
      if (s.state === "done" && s.ask && s.why != null) li.append(h("p", "rp-because", s.st.why.opts[s.st.why.ok]));
      if (s.state === "active") {
        const body = h("div", s.seen ? "rp-body" : "rp-body rp-open");   // fades in once, when it opens; a redraw after a try does not
        s.seen = true;
        if (!s.ok) body.append(valueUi(s));
        if (s.ask && s.why == null) body.append(whyUi(s));
        li.append(body);
      }
      if (s.miss && s.state !== "future") { const m = h("p", "rp-miss", s.miss); m.setAttribute("aria-live", "polite"); li.append(m); }
      return li;
    }
    function introEl() {                                                         // Cluck's line; a leading *action* is italic, the rest text
      const I = L().intro || {}, many = String(o.error).split("+").length > 1;
      const key = variant !== "repair" ? variant : !blank ? "fallback" : many && I.repairMany != null ? "repairMany" : "repair";
      const t = String(I[key] || "");
      const m = /^\*([^*]+)\*([\s\S]*)$/.exec(t), p = h("p", "rp-line");
      if (m) p.append(h("em", null, m[1]), m[2]); else put(p, t);
      return p;
    }
    function solvedEl() {                                                        // the problem, the answer filled in, the wrong try struck
      const box = h("div", "rp-solved"), a = h("p", "rp-a");
      if (item.stem) box.append(h("p", "rp-stem", item.stem));
      if (solved.wrong != null) a.append(h("del", "rp-wrong", solved.wrong), " ");
      a.append(h("span", "rp-ans", solved.answer));
      box.append(a);
      return box;
    }
    function draw() {
      if (solved && !full) el.dataset.solved = "";                              // the server revealed it (#33 A): the ladder goes neutral
      const kids = [], intro = solved && !full ? null : introEl();
      if (intro && intro.textContent) kids.push(intro);
      if (solved) kids.push(solvedEl());
      const ol = h("ol", "rp-steps");
      for (const s of S) ol.append(stepEl(s));
      kids.push(ol);
      const foot = h("div", "rp-foot");
      if (finished && !full) foot.append(h("p", "rp-done", doneLine()));
      if (full) {
        const nx = h("button", "rp-next", L().next || "Next");
        nx.type = "button"; nx.disabled = !!timer;
        nx.addEventListener("click", () => emit("repair_next", {}));
        foot.append(h("p", "rp-later", L().later || ""), nx);
      } else if (!finished && !welcome) {
        const sk = h("button", "rp-skip", L().skip || "Skip for now");
        sk.type = "button"; sk.addEventListener("click", () => emit("repair_skip", { variant }));
        foot.append(sk);
      }
      kids.push(foot);
      el.replaceChildren(...kids);
    }

    if (full) {                                                                 // #36: the full card fills in the answer
      const a = S.find(s => s.st.id === "answer") || S[S.length - 1];
      if (a && o.answer != null) a.shown = String(o.answer);
      const ans = a ? shown(a) : "";
      if (ans) solved = { wrong: null, answer: ans };
    }
    if (full) timer = setTimeout(() => { timer = 0; const nx = el.querySelector(".rp-next"); if (nx) nx.disabled = false; }, STUDY_MS);
    advance(); draw();
    return { el, destroy() { gone = true; clearTimeout(timer); el.remove(); } };
  }

  root.Repair = { mount, blankStep, TRIES, STUDY_MS };
})(window);
