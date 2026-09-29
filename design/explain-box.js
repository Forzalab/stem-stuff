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
      destroy() { clearTimeout(timer); el.removeEventListener("input", onInput); el.removeEventListener("blur", onBlur); if (ro) ro.disconnect(); listeners.clear(); }
    };
  }

  const api = { mount, HAS_FIELD_SIZING };
  root.ExplainBox = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
