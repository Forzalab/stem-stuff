/* welcome.js: Q1, the welcome item (brain design-round-66 DESIGN-v3 §2, TONY-DECISIONS #5: welcome feeling first). App chrome, not a reply
   format: the bank's one `welcome: true` item, drawn by repair.js in its welcome variant (no new widget kinds), on a warm surface.

   Welcome.mount(host, item, opts)   draws Q1 (its stem + the ladder) into host (replacing what is there); returns { el, destroy() }
       opts: { sheet, grade, on(name, data) }   sheet = { id: tex } for `sheet` steps, grade(value, n) for a keyless answer step (as Repair.mount)
       on: welcome_done { why_ok }   (once, after the last step; welcome is unfailable, so there is no other ending)
   In the app (todo 119): app.js welcomeQ mounts it in the answer box's place for a fresh device's first item (the question text stays
   above it, so no item.stem); the ladder comes from GET /repair/<code> (served for the welcome item before any try, with `sheet`).

   No fading on a tap (W129, brain projects/calc/_files/w129/PLAN.md L6, Tony 15:5x PT: "there shall be no jank at all"): repair.js's welcome
   variant draws every step's input from the start (a future one as an inert preview) and keeps it in place once done, so a tap changes
   its own row and the next one, and nothing else moves. This file only adds the duck to the intro tab on every redraw.
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
  function mount(host, item, o = {}) {
    const el = h("section", "wl ai-skin");                                      // Cluck's token scope (app.css .ai-skin): the rim's --ai-line
    if (item.stem) el.append(h("p", "wl-stem", item.stem));
    const box = h("div", "wl-ladder");
    el.append(box);
    host.replaceChildren(el);

    function dress() {                                                           // the tab (welcome.css): the duck in front, on every redraw
      const line = box.querySelector(".rp .rp-line");
      if (line && !line.querySelector(".wl-duck")) line.insertAdjacentHTML("afterbegin", '<svg class="icon wl-duck" aria-hidden="true"><use href="#i-duck"></use></svg>');
    }
    const watch = new MutationObserver(dress);                                   // repair.js swaps the card's children on every draw
    const rp = root.Repair.mount(box, item, { variant: "welcome", sheet: o.sheet, grade: o.grade, on: (name, data) => {
      if (name === "repair_done" && o.on) o.on("welcome_done", { why_ok: data.why_ok });
    } });
    dress();
    watch.observe(rp.el, { childList: true });
    return { el, destroy() { watch.disconnect(); rp.destroy(); el.remove(); } };
  }

  root.Welcome = { mount };
})(window);
