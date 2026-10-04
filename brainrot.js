/* brainrot.js: the brainrot corner (design/FORMULA-CARD.md round 2, Tony's pick 1 "iOS PiP corner"). Sugar mode only, on questions
   with a saccharine layer, while a question is open. Two bare looping videos, muted (Subway on top, parkour under): no frame, no
   labels. – and ✕ are see-through overlays that show on hover, keyboard focus, or for 3 s after a tap. Drag it anywhere; it snaps
   to the nearest corner (kept per device). – stashes it into a 44x96 tab on its edge; ✕ hides it for the session. It starts
   stashed on short screens (< 700px tall) and with reduced motion (players paused). Until the first drag it never sits on an answer
   control: a corner that would cover one is skipped, and if all would, it stashes. A drop is the user's choice (the Scratchpad FAB
   rule): the dropped corner stays, covered or not (Tony, Oct 3: "i cannot drag the thing down"). At rest it is anchored with CSS
   left/right + top/bottom, so a bottom corner rides Firefox Android's sliding toolbar; transform is only for the drag and the snap. Hidden while the pad page, the keyboard or the code bar is up.
   app.js calls window.stemBrainrot.sync() after every question opens and on layout changes. Nothing loads until it first shows. */
(() => {
  const VIDS = [["vTfD20dbxho", "Subway Surfers gameplay, muted", 0], ["z84bmLDzIIk", "Parkour gameplay, muted", 0]];   // Tony's links [id, title, start s]
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const G = 16, root = document.documentElement;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const sess = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const ico = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  /* no controls, no keyboard, no fullscreen, no annotations, no end screen of other channels; the title strip YouTube still draws is
     cropped off by the box (app.css .rot .vid iframe). The video itself can't be cached (cross-origin stream, YouTube's terms): the
     player is warmed instead, built off screen once the page settles, so it is already buffering when a question opens. */
  const src = (id, start) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=${RM.matches ? 0 : 1}&mute=1&loop=1&playlist=${id}`
    + `&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1&modestbranding=1${start ? "&start=" + start : ""}`;

  let el = null, duo = null, tab = null, stashed = innerHeight < 700 || RM.matches, corner = store("stem-rot") || "bl", picked = store("stem-rot-pick") === "1", on = false, showT = 0, drag = null;
  const desk = () => innerWidth >= 720;
  const width = () => (desk() ? 320 : 176);
  function build() {
    el = document.createElement("div");
    el.id = "rot"; el.className = "rot"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Video corner"); el.hidden = true;
    duo = document.createElement("div"); duo.className = "duo";
    duo.innerHTML = VIDS.map(([id, t, start], i) => `<div class="vid">${i ? "" : `<div class="ctl"><button type="button" data-act="min" aria-label="Make video small">${ico("i-min")}</button><button type="button" data-act="x" aria-label="Hide video for now">${ico("i-x")}</button></div>`}<iframe src="${src(id, start)}" title="${t}" allow="autoplay; encrypted-media; picture-in-picture; compute-pressure" referrerpolicy="strict-origin-when-cross-origin" tabindex="-1"></iframe></div>`).join("");
    tab = document.createElement("button");
    Object.assign(tab, { type: "button", className: "rtab" }); tab.dataset.act = "open"; tab.setAttribute("aria-label", "Show video");
    el.append(duo, tab);                                     // both stay put: moving an iframe reloads it, so stashing only hides the duo
    document.body.append(el);
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (!b) { el.classList.add("show"); clearTimeout(showT); showT = setTimeout(() => el.classList.remove("show"), 3000); return; }
      if (b.dataset.act === "min") { stashed = true; place(); }
      else if (b.dataset.act === "open") { stashed = false; picked = true; place(true); }   // asked for: shown even if every corner is busy
      else if (b.dataset.act === "x") { sess("stem-rot-off", "1"); sync(); }
    });
    el.addEventListener("pointerdown", e => {
      if (e.button > 0 || stashed || e.target.closest("button")) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    el.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true; el.classList.add("drag"); el.classList.remove("snap");
      el.style.transform = `translate(${e.clientX - drag.x0}px, ${e.clientY - drag.y0}px)`;
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag; drag = null; el.classList.remove("drag");
      if (!d.moved) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r");
      picked = true; store("stem-rot", corner); store("stem-rot-pick", "1"); place(true);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  /* the band it may use: under the top of the page, above the bottom bar. lift = the gap kept under it (from the window's bottom) */
  function band(h) {
    const dock = document.getElementById("dock"), top = G + 8;
    const lift = (dock && root.classList.contains("dock-bottom") ? innerHeight - dock.getBoundingClientRect().top : 0) + G;
    return { top, floor: Math.max(top, innerHeight - lift - h), lift };
  }
  const live = () => [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo, #padFab, #wish .wchip, #rwHud, #orig .orig-sol, #orig .orig-peek")].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
  const covers = (x, y, w, h) => live().some(c => x < c.right + 4 && x + w > c.left - 4 && y < c.bottom + 4 && y + h > c.top - 4);
  function spot(c, w, h) {
    const b = band(h), right = c[1] === "r";
    return { c, x: right ? innerWidth - w - G : G, y: c[0] === "t" ? b.top : b.floor };
  }
  /* anchor it to corner c (inset ex from the side, top or lift from the bottom); slide in from where it was (FLIP) when animate */
  function pin(c, ex, top, lift, animate) {
    const was = el.getBoundingClientRect(), right = c[1] === "r", bottom = c[0] === "b";
    Object.assign(el.style, { left: right ? "auto" : ex + "px", right: right ? ex + "px" : "auto",
      top: bottom ? "auto" : top + "px", bottom: bottom ? lift + "px" : "auto", transform: "" });
    el.classList.remove("snap");
    if (!animate || RM.matches) return;
    const now = el.getBoundingClientRect();
    el.style.transform = `translate(${was.left - now.left}px, ${was.top - now.top}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add("snap"); el.style.transform = ""; }));
  }
  function place(animate) {
    if (!el) return;
    el.classList.toggle("stashed", stashed);
    const b = band(96);
    if (stashed) {
      const right = corner[1] === "r";
      tab.classList.toggle("r", right); tab.innerHTML = ico(right ? "i-prev" : "i-next");
      pin("b" + corner[1], 0, b.top, b.lift, animate);
      return;
    }
    duo.style.setProperty("--w", width() + "px");
    const w = width(), h = duo.getBoundingClientRect().height || (w * 9 / 16) * 2 + 8;
    const order = picked ? [corner] : [corner, ...["bl", "br", "tl", "tr"].filter(c => c !== corner)];
    const ok = order.map(c => spot(c, w, h)).find(p => picked || !covers(p.x, p.y, w, h));
    if (!ok) { stashed = true; place(animate); return; }
    pin(ok.c, G, b.top, band(h).lift, animate);
  }
  /* show it only where it belongs: a sugar question with its layer, no pad page / keyboard / open code bar, not hidden this session */
  function sync() {
    const want = !!(window.stemBrainrotWanted && window.stemBrainrotWanted()) && !sess("stem-rot-off")
      && !root.classList.contains("mt") && !root.classList.contains("swap") && !root.classList.contains("bar-open")
      && !root.classList.contains("dock-away") && !document.querySelector("#q input:focus");
    if (want && !el) build();
    if (!el) return;
    const warm = !want && !!(window.stemBrainrotWarm && window.stemBrainrotWarm()) && !sess("stem-rot-off");
    on = want;
    el.hidden = !want && !warm;                              // diet / hidden for the session: gone
    el.classList.toggle("parked", warm);                     // sugar, just not now (pad page, keyboard...): off screen, still buffering
    el.inert = warm; el.setAttribute("aria-hidden", String(warm));
    if (want) requestAnimationFrame(() => place(false));
  }
  /* sugar: build the players off screen as soon as the page is idle, so the first question doesn't wait for YouTube */
  function warmUp() {
    if (el || !(window.stemBrainrotWarm && window.stemBrainrotWarm()) || sess("stem-rot-off")) return;
    build(); sync();
  }
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
  addEventListener("load", () => idle(warmUp, { timeout: 3000 }));
  window.stemBrainrot = { sync, warmUp };
  addEventListener("resize", () => { if (on) place(false); });
  document.addEventListener("focusin", () => setTimeout(sync, 0));
  document.addEventListener("focusout", () => setTimeout(sync, 0));
})();
