/* brainrot.js: the brainrot corner (design/FORMULA-CARD.md round 2, Tony's pick 1 "iOS PiP corner"). Sugar mode only, on questions
   with a saccharine layer, while a question is open. Two bare looping videos, muted (Subway on top, parkour under): no frame, no
   labels. – and ✕ are see-through overlays that show on hover, keyboard focus, or for 3 s after a tap. Drag it anywhere; it snaps
   to the nearest corner (kept per device). – stashes it into a 44x96 tab on its edge; ✕ hides it for the session. It starts
   stashed on short screens (< 700px tall) and with reduced motion (players paused). It never sits on an answer control: a corner
   that would cover one is skipped, and if all would, it stashes. Hidden while the pad page, the keyboard or the code bar is up.
   app.js calls window.stemBrainrot.sync() after every question opens and on layout changes. Nothing loads until it first shows. */
(() => {
  const VIDS = [["vTfD20dbxho", "Subway Surfers gameplay, muted"], ["z84bmLDzIIk", "Parkour gameplay, muted"]];   // Tony's links
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const G = 16, root = document.documentElement;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const sess = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const ico = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const src = id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=${RM.matches ? 0 : 1}&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1`;

  let el = null, duo = null, tab = null, stashed = innerHeight < 700 || RM.matches, corner = store("stem-rot") || "bl", on = false, showT = 0, drag = null;
  const desk = () => innerWidth >= 720;
  const width = () => (desk() ? 320 : 176);
  function build() {
    el = document.createElement("div");
    el.id = "rot"; el.className = "rot"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Brainrot corner"); el.hidden = true;
    duo = document.createElement("div"); duo.className = "duo";
    duo.innerHTML = VIDS.map(([id, t], i) => `<div class="vid">${i ? "" : `<div class="ctl"><button type="button" data-act="min" aria-label="Make it small">${ico("i-min")}</button><button type="button" data-act="x" aria-label="Hide it for this session">${ico("i-x")}</button></div>`}<iframe src="${src(id)}" title="${t}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" tabindex="-1"></iframe></div>`).join("");
    tab = document.createElement("button");
    Object.assign(tab, { type: "button", className: "rtab" }); tab.dataset.act = "open"; tab.setAttribute("aria-label", "Show the brainrot corner");
    el.append(duo, tab);                                     // both stay put: moving an iframe reloads it, so stashing only hides the duo
    document.body.append(el);
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (!b) { el.classList.add("show"); clearTimeout(showT); showT = setTimeout(() => el.classList.remove("show"), 3000); return; }
      if (b.dataset.act === "min") { stashed = true; place(); }
      else if (b.dataset.act === "open") { stashed = false; place(); }
      else if (b.dataset.act === "x") { sess("stem-rot-off", "1"); sync(); }
    });
    el.addEventListener("pointerdown", e => {
      if (e.button > 0 || stashed || e.target.closest("button")) return;
      const r = el.getBoundingClientRect();
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, l: r.left, t: r.top, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    el.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true; el.classList.add("drag"); el.classList.remove("snap");
      el.style.transform = `translate(${drag.l + e.clientX - drag.x0}px, ${drag.t + e.clientY - drag.y0}px)`;
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag; drag = null; el.classList.remove("drag");
      if (!d.moved) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r");
      store("stem-rot", corner); place(true);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  /* the band it may use: under the top of the page, above the bottom bar */
  function band(h) {
    const dock = document.getElementById("dock"), top = G + 8;
    const floor = (dock && root.classList.contains("dock-bottom") ? dock.getBoundingClientRect().top : innerHeight) - G - h;
    return { top, floor: Math.max(top, floor) };
  }
  const live = () => [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo, #padFab, #wish .wchip")].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
  const covers = (x, y, w, h) => live().some(c => x < c.right + 4 && x + w > c.left - 4 && y < c.bottom + 4 && y + h > c.top - 4);
  function spot(c, w, h) {
    const b = band(h), right = c[1] === "r";
    return { x: right ? innerWidth - w - G : G, y: c[0] === "t" ? b.top : b.floor };
  }
  function place(animate) {
    if (!el) return;
    el.classList.toggle("snap", !!animate && !RM.matches);
    el.classList.toggle("stashed", stashed);
    if (stashed) {
      const right = corner[1] === "r";
      tab.classList.toggle("r", right); tab.innerHTML = ico(right ? "i-prev" : "i-next");
      el.style.transform = `translate(${right ? innerWidth - 44 : 0}px, ${band(96).floor}px)`;
      return;
    }
    duo.style.setProperty("--w", width() + "px");
    const w = width(), h = el.getBoundingClientRect().height || (w * 9 / 16) * 2 + 8;
    const order = [corner, ...["bl", "br", "tl", "tr"].filter(c => c !== corner)];
    const ok = order.map(c => spot(c, w, h)).find(p => !covers(p.x, p.y, w, h));
    if (!ok) { stashed = true; place(animate); return; }
    el.style.transform = `translate(${ok.x}px, ${ok.y}px)`;
  }
  /* show it only where it belongs: a sugar question with its layer, no pad page / keyboard / open code bar, not hidden this session */
  function sync() {
    const want = !!(window.stemBrainrotWanted && window.stemBrainrotWanted()) && !sess("stem-rot-off")
      && !root.classList.contains("mt") && !root.classList.contains("swap") && !root.classList.contains("bar-open")
      && !root.classList.contains("dock-away") && !document.querySelector("#q input:focus");
    if (want && !el) build();
    if (!el) return;
    on = want; el.hidden = !want;
    if (want) requestAnimationFrame(() => place(false));
  }
  window.stemBrainrot = { sync };
  addEventListener("resize", () => { if (on) place(false); });
  document.addEventListener("focusin", () => setTimeout(sync, 0));
  document.addEventListener("focusout", () => setTimeout(sync, 0));
})();
