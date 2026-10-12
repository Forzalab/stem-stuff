/* try/genui-redeem.js: the "Redeem +3" chip on a re-queued missed question + the FIXED +3 burst on a right answer (agent U, Oct 7 2026).
   v=1 chip in the label row, burst rises from the chip · v=2 a quiet line above the stem, burst on the right row · v=3 a coin waiting
   beside Check (T25, Oct 12: Tony's pick, no words at all: the duck coin + "+3"; right = the coin flies into the HUD coin, the count ticks
   on arrival; wrong = the coin stays, dimmed). Wrong = no penalty, "comes back later". The bonus is always +3 (D60), never random; a Redeem is never lost.
   ?state=idle|right|wrong · ?rm=1 = stills (final frame, no motion). */
(function () {
  "use strict";
  const { $, P, rm, icon, kx, md, sprite, feedback, seg } = GK;
  const V = ["1", "2", "3"].includes(P.get("v")) ? P.get("v") : "1";
  const STATE = P.get("state") || "";
  const NAMES = {
    "1": ["Chip in the label row", "A small chip beside \"Question\" says this one came back and is worth +3. Right: \"+3\" rises from the chip and the coin count ticks up by 3. Not right: the chip says it comes back later. Nothing is taken."],
    "2": ["A quiet line above the stem", "One plain line above the question: back from earlier, +3. Right: the +3 lands on the row she tapped, where her eye already is. Not right: the line changes to \"No coins lost. It comes back later.\""],
    "3": ["A coin waiting beside Check", "A duck coin worth +3 waits beside Check: right, it flies into your coins; wrong, it stays."]
  };
  const CHOICES = [["a", "40.0"], ["b", "20.0"], ["c", "60.0"], ["d", "80.0"], ["e", "24.0"]], RIGHT = "c";
  const S = { sel: null, coins: 12, shown: 12, done: "", landed: false };   // v3: shown = the HUD count, which ticks only when the coin lands
  const V3 = V === "3";
  const app = $("#app");
  app.classList.toggle("rd-v3", V3);

  function chip() {
    if (S.done === "right") return `<span class="rd-chip ok">${icon("i-ok")}Redeemed +3</span>`;
    if (S.done === "wrong") return `<span class="rd-chip later">${icon("i-redo")}Comes back later</span>`;
    return `<span class="rd-chip">${icon("i-redo")}Redeem +3</span>`;
  }
  function line() {
    if (S.done === "right") return `${icon("i-ok")}<span>Redeemed. +3 coins.</span>`;
    if (S.done === "wrong") return `${icon("i-redo")}<span>No coins lost. It comes back later.</span>`;
    return `${icon("i-redo")}<span>Back from earlier. Get it now for +3.</span>`;
  }
  function render() {
    app.innerHTML = `
      <div class="qrow"><span class="lbl-q">${icon("i-doc")}Question</span>${V === "1" ? `<span class="rd-slot" id="rslot">${chip()}</span>` : ""}
        <span class="hud rw-skin" aria-label="Coins"><span class="coin" aria-hidden="true"></span><span id="coins">${V3 ? S.shown : S.coins}</span></span></div>
      <article class="card">
        ${V === "2" ? `<p class="rd-line" id="rline">${line()}</p>` : ""}
        <div class="md"><p>${md("A force acts on a particle: flat at $4.0\\ \\text{N}$ from A to B, then falling straight to zero at C. Each square is $2.5\\ \\text{m}$ by $1.0\\ \\text{N}$.")}</p>
        <p>${md("How much work does the force do from A to C, in joules?")}</p></div>
        <div class="q"><div class="choices" role="radiogroup" aria-label="Choices">${CHOICES.map(([id, t], i) => `
          <div class="ch"><button type="button" class="opt${S.done === "right" && id === RIGHT ? " right" : ""}${S.done === "wrong" && id === S.sel ? " mine" : ""}" role="radio" aria-checked="${!S.done && S.sel === id}" data-id="${id}"${S.done ? " disabled" : ""}><span class="badge" aria-hidden="true">${S.done === "right" && id === RIGHT ? icon("i-ok") : "ABCDE"[i]}</span><span class="txt">${kx(t)}</span>${V === "2" && S.done === "right" && id === RIGHT ? `<span class="rd-burst on-row" aria-hidden="true">+3</span>` : ""}</button></div>`).join("")}
        </div>
        <div class="go"><button type="button" class="btn-go" id="check"${!S.sel || S.done ? " disabled" : ""}>${icon("i-go")}Check</button>
          ${V3 ? `<span class="rd-coin${S.done === "wrong" ? " wrong" : S.landed ? " gone" : ""}" id="rcoin" aria-hidden="true"><span class="coin"></span>${S.done === "wrong" ? "" : `<span class="rd-plus">+3</span>`}</span>` : ""}</div>
        </div>
      </article>
      <div class="fb" id="fb" aria-live="polite">${V3 ? `<p class="sr-only">${S.landed ? "+3 coins" : S.done === "wrong" ? "Comes back later" : ""}</p>` : S.done === "right" ? `<p class="rd-say">Got it this time. Splitting the shape was the move.</p>` : S.done === "wrong" ? `<p class="rd-say">Not this time. Nothing lost: it comes back later, still worth +3.</p>` : `<p class="rd-say quiet">This one came back. You've seen the half-box idea before.</p>`}</div>
      <div class="nextrow"><button type="button" class="${S.done ? "next" : "btn-out"}" id="next">Next${icon("i-next")}</button></div>`;
    if (V === "1" && S.done === "right") $("#rslot").insertAdjacentHTML("beforeend", `<span class="rd-burst" aria-hidden="true">+3</span>`);
    if (S.done === "right" && !V3) $(".hud").classList.add("bump");
  }
  /* v3, right: THE duck coin flies from #rcoin into the HUD coin. One group ("rd-fly"): the coin + a 3-disc light trail on one quadratic
     arc (320 ms), scaled from its own size down to the HUD coin's, landing exactly on it (transform-origin 0 0, last keyframe = the HUD
     coin's rect); then the arrival tick (220 ms): the coin melts into the HUD coin, which pops once, and the count goes 12 -> 15 on the
     same curve. Port of the T24 flyDuck (brain r5/FX/d2v2/d2v2.html) and rewards/fx.js coinFly; no new engine.
     Reduced motion: no flight, one 200 ms fade of the waiting coin, then the count updates. */
  const FLY = 320, TICK = 220, EASE_ARC = "cubic-bezier(.45,0,.75,1)", EASE_OUT = "cubic-bezier(.16,1,.3,1)";
  function fly() {
    const rc = $("#rcoin"), from = $(".coin", rc), to = $(".hud .coin"), num = $("#coins"), fb = $("#fb");
    const x0n = S.shown, add = S.coins - S.shown;
    const land = () => { S.shown = S.coins; S.landed = true; num.textContent = S.shown; rc.classList.add("gone"); $("p", fb).textContent = "+3 coins"; };
    const G = { id: "rd-fly" };
    if (rm) { rc.animate([{ opacity: 1 }, { opacity: 0 }], { ...G, duration: 200, easing: "linear", fill: "forwards" }).finished.then(land); return; }
    const r0 = from.getBoundingClientRect(), r1 = to.getBoundingClientRect(), w = r0.width, k1 = r1.width / w;
    const at = u => { const v = 1 - u, mx = (r0.left + r1.left) / 2 + 70, my = Math.min(r0.top, r1.top) + 90;
      return [v * v * r0.left + 2 * v * u * mx + u * u * r1.left, v * v * r0.top + 2 * v * u * my + u * u * r1.top, 1 + (k1 - 1) * u]; };
    const tf = ([x, y, k]) => `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${k.toFixed(4)})`;
    const mk = cls => { const e = document.createElement("div"); e.className = "rd-fly" + (cls ? " " + cls : ""); e.setAttribute("aria-hidden", "true");
      e.style.width = e.style.height = w + "px"; if (cls) e.innerHTML = "<i></i>"; e.style.transform = tf(at(0)); return document.body.appendChild(e); };
    const c = mk(""), ghosts = [[.08, .8], [.16, .55], [.24, .32]].map(([lag, op]) => [mk("ghost"), lag, op]);
    from.style.visibility = "hidden";                                    // the coin leaves #rcoin: the flier sits on it, pixel for pixel
    const kf = []; for (let k = 0; k < 10; k++) kf.push({ transform: tf(at(k / 10)) });
    kf.push({ transform: `translate(${r1.left}px,${r1.top}px) scale(${k1})` });   // the last frame IS the HUD coin's rect, unrounded
    const a = c.animate(kf, { ...G, duration: FLY, easing: EASE_ARC, fill: "forwards" });
    ghosts.forEach(([g, lag, op]) => { const gk = []; for (let k = 0; k <= 10; k++) { const u = k / 10; gk.push({ transform: tf(at(Math.max(0, u - lag))), opacity: k === 0 || u >= .86 ? 0 : op * (1 - u * .6) }); }
      g.animate(gk, { ...G, duration: FLY, easing: EASE_ARC, fill: "forwards" }); });
    $(".rd-plus", rc).animate([{ opacity: 1 }, { opacity: 0 }], { ...G, duration: 120, fill: "forwards" });
    a.finished.then(() => {
      const r = c.getBoundingClientRect(), t = to.getBoundingClientRect();
      window.__rdLand = { dx: r.left - t.left, dy: r.top - t.top, dw: r.width - t.width, dh: r.height - t.height, countAtArrival: num.textContent };
      ghosts.forEach(([g]) => g.remove());
      c.animate([{ opacity: 1 }, { opacity: 0 }], { ...G, duration: TICK, easing: "ease-in", fill: "forwards" });
      const pop = to.animate([{ transform: "scale(1)" }, { transform: "scale(1.28)", offset: .35 }, { transform: "scale(1)" }], { ...G, duration: TICK, easing: EASE_OUT });
      const step = () => { const p = Math.min(1, (pop.currentTime || 0) / TICK); num.textContent = x0n + Math.round(add * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && pop.playState === "running") requestAnimationFrame(step); };
      requestAnimationFrame(step);
      pop.finished.then(() => { c.remove(); land(); });
    });
  }
  app.addEventListener("click", e => {
    const o = e.target.closest(".opt");
    if (o && !o.disabled) { S.sel = S.sel === o.dataset.id ? null : o.dataset.id; return render(); }
    if (e.target.closest("#check") && S.sel && !S.done) { S.done = S.sel === RIGHT ? "right" : "wrong"; if (S.done === "right") S.coins += 3; if (!V3) S.shown = S.coins;
      render(); if (V3 && S.done === "right") fly(); return; }
    if (e.target.closest("#next")) location.search = new URLSearchParams({ v: V, ...(P.get("rm") ? { rm: "1" } : {}) }).toString();
  });

  $("#vname").textContent = `v${V}: ${NAMES[V][0]}`; $("#vlead").textContent = NAMES[V][1];
  seg($("#segV"), "v", [["1", "v1"], ["2", "v2"], ["3", "v3"]], V);
  seg($("#segS"), "state", [["", "Idle"], ["right", "Right"], ["wrong", "Wrong"]], STATE);
  feedback("RDM", () => `v=${V};state=${STATE || "idle"};rm=${rm ? 1 : 0}`);
  sprite();
  if (STATE === "right") { S.sel = RIGHT; S.done = "right"; S.coins += 3; S.shown = S.coins; S.landed = true; }   // the landed still
  if (STATE === "wrong") { S.sel = "d"; S.done = "wrong"; }
  render();
})();
