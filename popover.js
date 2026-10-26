/* popover.js: the site's one rich-context popup (design/POPOVER.md; Tony, Oct 23, after shadcn/ui Popover). App chrome, not a reply format:
   Cluck's replies stay OpenUI Lang. Click/tap only, never hover. Lazy: the DOM is built on open and removed on close; one open at a time.

   Pop.toggle(anchor, opts)   opens, or closes when this anchor's popover is the open one (what a click handler wants)
   Pop.open(anchor, opts)     opts: { variant: "doc" | "note" | "term" | "action" | "media", label, build(el), align, host }
                              build(el) fills the popover from author-time data (never untrusted markup); align = the element to centre
                              under (default the anchor); host = where it mounts (default body; a Cluck popover mounts in .ai-box for its tokens)
   Pop.close(focusBack)       removes it; focusBack: focus returns to its anchor (Esc does this)
   Pop.make(opts)             the bare element, unanchored (the lab's specimen grid)
   Pop.anchor()               the open popover's anchor, or null
*/
(function (root) {
  "use strict";
  const GAP = 6, EDGE = 16;                                                     // 6px off the anchor; 16px from the viewport edge (360: max-width 100vw - 32px)
  let cur = null, seq = 0;                                                      // { el, anchor, align }

  function make(o) {
    const el = document.createElement("div");
    el.className = "pop"; el.dataset.variant = o.variant || "note"; el.id = "pop-" + ++seq; el.tabIndex = -1;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", o.label || "More about this");
    return el;
  }
  function open(anchor, o = {}) {
    close();
    const el = make(o);
    (o.host || document.body).append(el);                                     // in the page first: a media figure measures its width
    if (o.build) o.build(el);
    el.addEventListener("focusout", e => { if (cur && cur.el === el && !el.contains(e.relatedTarget) && e.relatedTarget !== anchor) close(); });   // Tab out closes
    anchor.setAttribute("aria-haspopup", "dialog"); anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-controls", el.id);
    cur = { el, anchor, align: o.align || anchor };
    place();
    el.focus({ preventScroll: true });                                          // a screen reader reads it; Esc brings focus back
    return el;
  }
  function close(focusBack) {
    if (!cur) return;
    const { el, anchor } = cur; cur = null;
    el.remove(); anchor.setAttribute("aria-expanded", "false"); anchor.removeAttribute("aria-controls");
    if (focusBack && anchor.isConnected) anchor.focus();
  }
  const toggle = (anchor, o) => cur && cur.anchor === anchor ? (close(), null) : open(anchor, o);

  /* fixed (STYLE.md §5: overlays are fixed), centred under its align element; clamped inside the viewport (alignment gives way, never overflow);
     flipped above when there is no room below; closed when its anchor leaves the page or the screen */
  function place() {
    if (!cur) return;
    const { el, anchor, align } = cur;
    if (!anchor.isConnected) { close(); return; }
    const a = align.getBoundingClientRect(), w = el.offsetWidth;
    if (a.bottom < 0 || a.top > innerHeight) { close(); return; }
    const x = Math.max(EDGE, Math.min(a.left + a.width / 2 - w / 2, innerWidth - EDGE - w));
    /* taller than the room on both sides (a doc popover with a figure, a short window): the roomier side, capped there, scrolling inside.
       full = its whole height even while capped (scrollHeight + borders), so a re-place on scroll keeps the inside scroll position */
    const full = el.scrollHeight + el.offsetHeight - el.clientHeight, below = innerHeight - 8 - a.bottom - GAP, above = a.top - GAP - 8;
    const up = full > below && (full <= above || above > below), h = Math.min(full, Math.max(0, up ? above : below)), cap = h < full;
    el.style.maxHeight = cap ? h + "px" : ""; el.style.overflowY = cap ? "auto" : "";
    el.style.left = Math.round(x) + "px"; el.style.top = Math.round(up ? a.top - GAP - h : a.bottom + GAP) + "px";
    el.dataset.side = up ? "top" : "bottom";
  }

  addEventListener("pointerdown", e => {                                        // a tap outside (not on its own anchor: that is the second tap) closes it
    if (cur && !cur.el.contains(e.target) && !cur.anchor.contains(e.target)) close();
  }, true);
  addEventListener("keydown", e => {                                            // Esc closes the popover first, and only it
    if (e.key !== "Escape" || !cur) return;
    e.stopPropagation(); e.preventDefault(); close(true);
  }, true);
  addEventListener("scroll", place, { capture: true, passive: true });
  addEventListener("resize", place);

  root.Pop = { open, close, toggle, make, anchor: () => cur && cur.anchor };
})(window);
