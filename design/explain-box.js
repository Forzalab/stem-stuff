/* explain-box.js: plain auto-growing textarea + edit-history snapshots.
   See design/EXPLAIN-BOX.md. No rich text, no contenteditable.

   const box = ExplainBox.mount(textareaEl, { idleMs: 2000, onHistory: (entry, history) => {} });
   box.el            the <textarea>
   box.getHistory()  -> [{ t: 1790000000000, text: "..." }, ...]  t = epoch ms, oldest first (copy/COPY-PAYLOAD.md)
   box.onHistory(fn) adds a listener, returns an unsubscribe function  ("onchange-history" hook)
   box.snapshot()    force a snapshot now (e.g. right before building the copy payload)
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

    const onInput = () => { fit(); clearTimeout(timer); timer = setTimeout(snapshot, idleMs); };
    const onBlur = () => snapshot();
    el.addEventListener("input", onInput);
    el.addEventListener("blur", onBlur);
    el.addEventListener("xb-refit", fit);   // padding changed (reserveCorner): refit in the JS-growth path
    let ro = null;
    if (!HAS_FIELD_SIZING) {
      el.classList.add("xb-js");
      if (typeof ResizeObserver !== "undefined") { let w = 0; ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } }); ro.observe(el); }
      fit();
    }

    return {
      el,
      getHistory: () => history.map(h => ({ ...h })),
      onHistory(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      snapshot,
      destroy() { clearTimeout(timer); el.removeEventListener("input", onInput); el.removeEventListener("blur", onBlur); el.removeEventListener("xb-refit", fit); if (ro) ro.disconnect(); listeners.clear(); }
    };
  }

  /* reserveCorner(textarea, button, { gap: 4, hysteresis: 8 })
     A button sits inside the textarea's bottom-right corner (absolutely positioned in a relative wrapper whose
     box is the textarea's border box). Textareas can't flow text around a shape, but this one auto-grows and
     never scrolls, so only the lines near the bottom can reach the button. A hidden mirror div with the same
     font, width, padding and wrapping lays out the text (or the placeholder when empty) with normal padding;
     Range rects give each visual line's box. If any line box comes within `gap` px of the button, the textarea
     keeps its reserved bottom band (CSS default); otherwise it gets class "xb-free" (normal padding).
     Hysteresis: once reserved, it is freed only when every line is `hysteresis` px further away, so typing
     across the edge doesn't flicker. Returns { update(), destroy() }. */
  function reserveCorner(el, btn, opts = {}) {
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
      if (!mirror.isConnected) document.body.appendChild(mirror);
      const ms = mirror.style;
      for (const k of COPY) ms[k] = cs[k];
      Object.assign(ms, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden", borderStyle: "solid",
        paddingBottom: opts.freePadding || "1.75rem", width: el.offsetWidth + "px", height: "auto", overflow: "hidden" });
      const text = el.value || el.placeholder || "";
      mirror.textContent = text + "​";          // zero-width end marker: a trailing newline still makes a line
      const node = mirror.firstChild;
      const H = Math.max(mirror.offsetHeight, parseFloat(cs.minHeight) || 0);
      const m = mirror.getBoundingClientRect();
      const W = el.offsetWidth, bw = btn.offsetWidth, bh = btn.offsetHeight;
      const right = parseFloat(getComputedStyle(btn).right) || 0, bottom = parseFloat(getComputedStyle(btn).bottom) || 0;
      const bx = W - right - bw, by = H - bottom - bh;   // button box in mirror coordinates (free layout)
      const r = document.createRange(); r.selectNodeContents(node);
      const pad = free ? gap : gap + hys;                 // freeing needs more room than staying free
      let hit = false;
      for (const q of r.getClientRects()) {
        const x1 = q.right - m.left, y0 = q.top - m.top, y1 = q.bottom - m.top;
        if (q.width === 0 && q.height === 0) continue;
        if (x1 > bx - pad && y1 > by && y0 < by + bh) { hit = true; break; }
      }
      free = !hit;
      el.classList.toggle("xb-free", free);
      if (!HAS_FIELD_SIZING) el.dispatchEvent(new Event("xb-refit"));
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    el.addEventListener("input", update);                  // synchronous: no frame shows text under the button
    let ro = null, w = 0;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => { if (el.offsetWidth !== w) { w = el.offsetWidth; schedule(); } }); ro.observe(el); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    update();
    return { update, destroy() { cancelAnimationFrame(raf); el.removeEventListener("input", update); if (ro) ro.disconnect(); mirror.remove(); }, get free() { return free; } };
  }

  const api = { mount, reserveCorner, HAS_FIELD_SIZING };
  root.ExplainBox = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
