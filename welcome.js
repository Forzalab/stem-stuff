/* welcome.js: Q1, the welcome item (brain design-round-66 DESIGN-v3 §2, TONY-DECISIONS #5: welcome feeling first). App chrome, not a reply
   format: the bank's one `welcome: true` item, drawn by repair.js in its welcome variant (no new widget kinds), on a warm surface.

   Welcome.mount(host, item, opts)   draws Q1 (its stem + the ladder) into host (replacing what is there); returns { el, destroy() }
       opts: { sheet, on(name, data) }   sheet = { id: tex } for `sheet` steps (as Repair.mount)
       on: welcome_done { why_ok }   (once, after the last step; welcome is unfailable, so there is no other ending)

   Fading (Renkl 2002, Atkinson 2003), per step on progress, never a timer:
     open    every step shown at full strength; each future one also shows its input as a picture (.wl-field, aria-hidden), a form to fill
     alone   once a step is done the shown inputs fade away for good: the done step is one ✓ line (repair.js), the rest a label only
   repair.js owns the steps and redraws its whole card on every tap; this file only watches those redraws and adds the pictures.
   Unfailable comes from repair.js's welcome variant (a wrong tap = the next hint, no ✗, no auto-fill). Text lands as textContent;
   `$..$` math goes through Graph.tex (escapes the text around it).
*/
(function (root) {
  "use strict";

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) {
      text = String(text);
      if (text.includes("$") && root.Graph && root.Graph.tex) el.innerHTML = root.Graph.tex(text);   // Graph.tex escapes everything outside $..$
      else el.textContent = text;
    }
    return el;
  }
  /* a future step's input, as a picture: the blank the student will fill (fill = its line with ▢, num = an empty box, pick / sheet = the chips' text) */
  function picture(st, sheet) {
    if (st.kind === "fill") return "$" + String(st.tex).replace("▢", "\\square") + "$";
    if (st.kind === "num") return "▢" + (st.unit ? " " + st.unit : "");
    if (st.kind === "pick") return (st.opts || []).map(p => p.md).join("  ·  ");
    if (st.kind === "sheet") return (st.pool || []).map(id => sheet && sheet[id] ? "$" + sheet[id] + "$" : id).join("  ·  ");
    return "";
  }

  function mount(host, item, o = {}) {
    const steps = (item && item.repair && item.repair.steps) || [];
    const el = h("section", "wl");
    el.dataset.fade = "open";
    if (item.stem) el.append(h("p", "wl-stem", item.stem));
    const box = h("div", "wl-ladder");
    el.append(box);
    host.replaceChildren(el);

    let fadedAt = 0;                                                             // the redraw count when the fade happened (0 = not yet)
    let draws = 0;
    function dress() {
      const rp = box.querySelector(".rp");
      if (!rp) return;
      draws++;
      const rows = [...rp.querySelectorAll(".rp-step")];
      if (!fadedAt && rows.some(r => r.dataset.state === "done")) { fadedAt = draws; el.dataset.fade = "alone"; }
      if (fadedAt && fadedAt !== draws) return;                                  // after the fading redraw: labels only, for good
      for (const r of rows) {
        if (r.dataset.state !== "future") continue;
        const st = steps.find(s => s.id === r.dataset.id);
        const f = h("div", fadedAt ? "wl-field wl-out" : "wl-field", st && picture(st, o.sheet));
        f.setAttribute("aria-hidden", "true");
        if (fadedAt) f.addEventListener("animationend", () => f.remove());
        r.append(f);
      }
    }
    const watch = new MutationObserver(dress);                                   // repair.js swaps the card's children on every draw
    const rp = root.Repair.mount(box, item, { variant: "welcome", sheet: o.sheet, on: (name, data) => {
      if (name === "repair_done" && o.on) o.on("welcome_done", { why_ok: data.why_ok });
    } });
    dress();
    watch.observe(rp.el, { childList: true });
    return { el, destroy() { watch.disconnect(); rp.destroy(); el.remove(); } };
  }

  root.Welcome = { mount };
})(window);
