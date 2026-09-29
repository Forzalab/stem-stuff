/* explain-box.js: plain auto-growing textarea + edit-history snapshots.
   See design/EXPLAIN-BOX.md. No rich text, no contenteditable.

   const box = ExplainBox.mount(textareaEl, { idleMs: 2000, onHistory: (entry, history) => {} });
   box.el            the <textarea>
   box.getHistory()  -> [{ t: 1790000000000, text: "..." }, ...]  t = epoch ms, oldest first (copy/COPY-PAYLOAD.md)
   box.onHistory(fn) adds a listener, returns an unsubscribe function  ("onchange-history" hook)
   box.snapshot()    force a snapshot now (e.g. right before building the copy payload)
   box.limit()       re-cap the height at the bottom of the visible viewport (opts.bottomInset() = px to keep clear, e.g. a dock)
   box.destroy()
*/
(function (root) {
  "use strict";
  const HAS_FIELD_SIZING = typeof CSS !== "undefined" && CSS.supports && CSS.supports("field-sizing", "content");

  function mount(el, opts = {}) {
    const idleMs = opts.idleMs ?? 2000;
    const history = [];
    const listeners = new Set(opts.onHistory ? [opts.onHistory] : []);
    let timer = 0;

    /* JS fallback for browsers without field-sizing: grow to scrollHeight */
    function fit() {
      if (HAS_FIELD_SIZING) return;
      el.style.height = "auto";
      const cs = getComputedStyle(el);
      const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      el.style.height = el.scrollHeight + border + "px";
    }

    /* Grow only until the bottom edge reaches the bottom of the VISIBLE viewport (minus opts.bottomInset()),
       then scroll inside the box. Never below the 4-row min-height. */
    function limit() {
      if (!el.offsetHeight) return;
      const vv = window.visualViewport, inset = opts.bottomInset ? opts.bottomInset() : 0;
      const bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - inset;
      const min = parseFloat(getComputedStyle(el).minHeight) || 0;
      const cap = Math.max(min, Math.floor(bottom - el.getBoundingClientRect().top)) + "px";
      if (cap === el.style.maxHeight) return;
      el.style.maxHeight = cap;
      fit();
      el.dispatchEvent(new Event("xb-cap"));          // reserveCorner re-checks
    }

    function snapshot() {
      clearTimeout(timer);
      const text = el.value;
      const last = history[history.length - 1];
      if (last ? last.text === text : text === "") return null;   // skip unchanged (and the empty start)
      const entry = { t: Date.now(), text };
      history.push(entry);
      for (const fn of listeners) { try { fn(entry, history.slice()); } catch (e) { console.error(e); } }
      return entry;
    }

    const onInput = () => { fit(); limit(); clearTimeout(timer); timer = setTimeout(snapshot, idleMs); };
    const onBlur = () => snapshot();
    el.addEventListener("input", onInput);
    el.addEventListener("blur", onBlur);
    el.addEventListener("xb-refit", fit);   // padding changed (reserveCorner): refit in the JS-growth path
    const vv = window.visualViewport;
    if (vv) { vv.addEventListener("resize", limit); vv.addEventListener("scroll", limit); }
    addEventListener("resize", limit);
    let ro = null;
    if (!HAS_FIELD_SIZING) {
      el.classList.add("xb-js");
      if (typeof ResizeObserver !== "undefined") { let w = 0; ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } }); ro.observe(el); }
      fit();
    }
    limit();

    return {
      el,
      getHistory: () => history.map(h => ({ ...h })),
      onHistory(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      snapshot,
      limit,
      destroy() { clearTimeout(timer); if (vv) { vv.removeEventListener("resize", limit); vv.removeEventListener("scroll", limit); } removeEventListener("resize", limit); el.removeEventListener("input", onInput); el.removeEventListener("blur", onBlur); el.removeEventListener("xb-refit", fit); if (ro) ro.disconnect(); listeners.clear(); }
    };
  }

  /* reserveCorner(textarea, button | [buttons], { gap: 4, hysteresis: 8 })
     Buttons sit inside the textarea's bottom-right corner (absolutely positioned in a relative wrapper whose
     box is the textarea's border box). Textareas can't flow text around a shape, but this one auto-grows and
     never scrolls, so only the lines near the bottom can reach the button. A hidden mirror div with the same
     font, width, padding and wrapping lays out the text (or the placeholder when empty) with normal padding;
     Range rects give each visual line's box. If any line box comes within `gap` px of the button, the textarea
     keeps its reserved bottom band (CSS default); otherwise it gets class "xb-free" (normal padding).
     Hysteresis: once reserved, it is freed only when every line is `hysteresis` px further away, so typing
     across the edge doesn't flicker. Returns { update(), destroy() }.
     Once the text is taller than the height cap (see limit()), the box scrolls and lines pass under the buttons
     anyway, so the band stays reserved (the last line rests above them) and the buttons move left of a classic scrollbar. */
  function reserveCorner(el, btn, opts = {}) {
    const btns = [].concat(btn);
    const gap = opts.gap ?? 4, hys = opts.hysteresis ?? 8;
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    const COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "wordSpacing", "lineHeight", "textTransform",
      "textIndent", "tabSize", "paddingTop", "paddingLeft", "paddingRight", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
      "borderLeftWidth", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "minHeight", "fontVariantLigatures", "fontKerning"];
    let free = false, raf = 0;

    function update() {
      if (!el.isConnected) return;
      const cs = getComputedStyle(el);
      const sb = Math.max(0, el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth));   // classic scrollbar
      btns[0].parentElement.style.setProperty("--xb-sb", sb + "px");
      if (!mirror.isConnected) document.body.appendChild(mirror);
      const ms = mirror.style;
      for (const k of COPY) ms[k] = cs[k];
      Object.assign(ms, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden", borderStyle: "solid",
        paddingBottom: opts.freePadding || "1.75rem", width: el.offsetWidth - sb + "px", height: "auto", overflow: "hidden" });
      const text = el.value || el.placeholder || "";
      mirror.textContent = text + "​";          // zero-width end marker: a trailing newline still makes a line
      const node = mirror.firstChild;
      const H = Math.max(mirror.offsetHeight, parseFloat(cs.minHeight) || 0);
      const m = mirror.getBoundingClientRect();
      const W = el.offsetWidth;
      const pad = free ? gap : gap + hys;                 // freeing needs more room than staying free
      const r = document.createRange(); r.selectNodeContents(node);
      const rects = [...r.getClientRects()].filter(q => q.width || q.height);
      let hit = H > (parseFloat(cs.maxHeight) || Infinity);   // capped: the box scrolls, keep the band
      for (const b of btns) {                             // each button's box in mirror coordinates (free layout)
        const bcs = getComputedStyle(b), bw = b.offsetWidth, bh = b.offsetHeight;
        const bx = W - (parseFloat(bcs.right) || 0) - bw,   // right already includes the scrollbar
           by = H - (parseFloat(bcs.bottom) || 0) - bh;
        for (const q of rects) if (q.right - m.left > bx - pad && q.bottom - m.top > by && q.top - m.top < by + bh) hit = true;
      }
      free = !hit;
      el.classList.toggle("xb-free", free);
      if (!HAS_FIELD_SIZING) el.dispatchEvent(new Event("xb-refit"));
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    el.addEventListener("xb-cap", update);
    el.addEventListener("input", update);                  // synchronous: no frame shows text under the button
    let ro = null, w = 0;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => { if (el.offsetWidth !== w) { w = el.offsetWidth; schedule(); } }); ro.observe(el); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    update();
    return { update, destroy() { cancelAnimationFrame(raf); el.removeEventListener("input", update); el.removeEventListener("xb-cap", update); if (ro) ro.disconnect(); mirror.remove(); }, get free() { return free; } };
  }

  const api = { mount, reserveCorner, HAS_FIELD_SIZING };
  root.ExplainBox = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
