/* minicluck.js: the tiny Cluck on a sub-step (DESIGN-v3 §4; Tony #13: it pops onto the step and asks right away, a type-in box, Socratic,
   friendly, dead concise, X dismisses; #25.4: the page dims, but the question stem and the student's own work stay clear).
   App chrome on popover.js (variant "mini", mounted in an .ai-box for Cluck's warm tokens; design/POPOVER.md). What Cluck SAYS is never
   built here: POST /mini answers with an OpenUI Lang program, drawn by views.js (the Cluck-reply renderer). Our own strings go in by textContent.

   Mini.open(step, o)   step = the sub-step element: the popup sits on it, focus goes back to it on Esc / X.
                        o: { ask: Cluck's first line (authored), chips: 2-3 starter replies, ctx: {code, step, ...} posted with every message,
                             keep: elements the dim leaves clear (the stem, the student's work), url: default "/mini" }
   Mini.close()         X does this; Esc, a tap outside, Tab out or another popover close it through popover.js. Every close logs mini_dismiss {how}.
*/
(function (root) {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg", PAD = 4;                         // a kept element's clear area reaches 4px past its box
  const DUCK = "M9 4.5a4 4 0 0 1 4 4c0 1-.3 1.8-.8 2.5H17c1.5 0 2.7-.8 3.3-2 .8 1 1.2 2.3 1.2 3.7 0 4-3.4 6.8-8 6.8H9c-3.3 0-5.5-2.2-5.5-5 0-1.8 1-3.3 2.4-4.2A4 4 0 0 1 9 4.5z";
  const ICON = { duck: DUCK, x: "M18 6 6 18M6 6l12 12", send: "M5 12l7-7 7 7M12 19V5" };   // index.html's i-duck / i-x / i-send paths
  const LOST = "Quantum ducks just made a mess.";                          // the authored line when /mini fails
  let cur = null;                                                               // { el, host, dim, keep, how, done }

  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function icon(name) {
    const s = document.createElementNS(SVGNS, "svg"), p = document.createElementNS(SVGNS, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ico"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", ICON[name]);
    if (name !== "duck") { p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round"); }
    else p.setAttribute("fill", "currentColor");
    s.append(p); return s;
  }
  const button = (cls, label, kid) => { const b = node("button", cls); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (kid) b.append(kid); return b; };

  function open(step, o = {}) {
    close("away");
    const host = node("div", "ai-skin ai-box mini-host"), dim = node("div", "dim mini-dim");
    dim.setAttribute("aria-hidden", "true");
    document.body.append(dim, host);
    const me = { host, dim, keep: o.keep || [], how: "away", done: false };
    me.el = Pop.open(step, { variant: "mini", label: "Cluck", host, build: el => build(el, o) });
    me.el.classList.add("mini");
    cur = me;
    new MutationObserver((_, mo) => { if (!me.el.isConnected) { mo.disconnect(); setTimeout(() => done(me)); } }).observe(host, { childList: true });   // closed by popover.js: let the Esc listener name it first
    holes();
    return me.el;
  }
  function close(how) {
    if (!cur) return;
    const me = cur; me.how = how || "x";
    if (me.el.isConnected) Pop.close(true);                                    // not already closed by popover.js (then another popover may be the open one)
    done(me);
  }
  function done(me) {
    if (me.done) return;
    me.done = true; if (cur === me) cur = null;
    me.dim.remove(); me.host.remove();
    root.stemT?.("mini_dismiss", { how: me.how });
  }

  function build(el, o) {
    const head = node("div", "mini-h"), log = node("div", "mini-log"), chips = node("div", "mini-chips"), f = node("form", "mini-f");
    const x = button("mini-x", "Close", icon("x"));
    x.addEventListener("click", () => close("x"));
    head.append(icon("duck"), node("p", "mini-ask", o.ask || "What's on your mind?"), x);
    log.setAttribute("aria-live", "polite");
    const inp = node("input", "mini-in");
    inp.type = "text"; inp.maxLength = 300; inp.autocomplete = "off"; inp.placeholder = "Cluck up your thoughts here..."; inp.setAttribute("aria-label", "Tell Cluck");
    const go = button("mini-go", "Send", icon("send")); go.type = "submit";
    f.append(inp, go);
    let seq = 0;
    function send(text) {
      text = String(text || "").trim();
      if (!text) return;
      const n = ++seq, r = node("div", "mini-r mini-wait", "…");
      if (chips.contains(document.activeElement)) el.focus({ preventScroll: true });   // off the chip before it hides: a hidden focused control would blur the popover shut
      chips.hidden = true; inp.value = "";
      log.replaceChildren(node("p", "mini-me", text), r);
      replace();
      fetch(o.url || "/mini", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...o.ctx, text }) })
        .then(res => { if (!res.ok) throw new Error("/mini " + res.status); return res.text(); })
        .then(src => import("./views.js").then(V => { if (n !== seq) return; r.replaceChildren(); r.classList.remove("mini-wait"); V.render(src, r, {}); }))
        .catch(e => { console.error(e); if (n === seq) { r.classList.remove("mini-wait"); r.textContent = LOST; } })
        .finally(() => n === seq && replace());
    }
    for (const c of (o.chips || []).slice(0, 3)) { const b = button("mini-chip", null); b.textContent = c; b.addEventListener("click", () => send(c)); chips.append(b); }
    f.addEventListener("submit", e => { e.preventDefault(); send(inp.value); });
    el.append(head, log, chips, f);
  }
  const replace = () => cur && cur.el.dispatchEvent(new Event("scroll"));       // it grew: popover.js re-places on any scroll (window capture)

  /* the dim: one fixed layer under the popup, with a clear hole (clip-path, even-odd) over each kept element. A hole is not painted and
     not hit, so the stem and the student's work read and take taps as usual; no z-index games on the page's own elements */
  function holes() {
    if (!cur) return;
    const bs = cur.keep.filter(k => k.isConnected).map(k => k.getBoundingClientRect()).filter(b => b.width && b.height)
      .map(b => [b.left - PAD, b.top - PAD, b.right + PAD, b.bottom + PAD].map(Math.round));
    const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
    const keep = bs.filter((a, i) => !bs.some((b, j) => j !== i && inside(a, b) && !(inside(b, a) && j > i)));   // a hole inside another would re-dim (even-odd)
    const pt = (x, y) => `${x}px ${y}px`;
    const ring = keep.map(([l, t, r, b]) => [pt(l, t), pt(r, t), pt(r, b), pt(l, b), pt(l, t), "0 0"].join(", ")).join(", ");
    cur.dim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0${ring ? ", " + ring : ""})`;
  }

  addEventListener("keydown", e => { if (e.key === "Escape" && cur) cur.how = "esc"; }, true);   // popover.js closes it; this names how
  addEventListener("scroll", holes, { capture: true, passive: true });
  addEventListener("resize", holes);

  root.Mini = { open, close: () => close("x") };
})(window);
