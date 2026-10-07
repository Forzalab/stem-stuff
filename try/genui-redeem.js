/* try/genui-redeem.js: the "Redeem +3" chip on a re-queued missed question + the FIXED +3 burst on a right answer (agent U, Oct 7 2026).
   v=1 chip in the label row, burst rises from the chip · v=2 a quiet line above the stem, burst on the right row · v=3 a coin waiting
   beside Check, burst at the coin. Wrong = no penalty, "comes back later". The bonus is always +3 (D60), never random; a Redeem is never lost.
   ?state=idle|right|wrong · ?rm=1 = stills (final frame, no motion). */
(function () {
  "use strict";
  const { $, P, rm, icon, kx, md, sprite, feedback, seg } = GK;
  const V = ["1", "2", "3"].includes(P.get("v")) ? P.get("v") : "1";
  const STATE = P.get("state") || "";
  const NAMES = {
    "1": ["Chip in the label row", "A small chip beside \"Question\" says this one came back and is worth +3. Right: \"+3\" rises from the chip and the coin count ticks up by 3. Not right: the chip says it comes back later. Nothing is taken."],
    "2": ["A quiet line above the stem", "One plain line above the question: back from earlier, +3. Right: the +3 lands on the row she tapped, where her eye already is. Not right: the line changes to \"No coins lost. It comes back later.\""],
    "3": ["A coin waiting beside Check", "The +3 sits as a coin next to the Check button, the thing she will tap. Right: the coin lights and the count ticks up. Not right: the coin stays, still hers: \"Still yours. Comes back later.\""]
  };
  const CHOICES = [["a", "40.0"], ["b", "20.0"], ["c", "60.0"], ["d", "80.0"], ["e", "24.0"]], RIGHT = "c";
  const S = { sel: null, coins: 12, done: "" };
  const app = $("#app");

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
        <span class="hud rw-skin" aria-label="Coins"><span class="coin" aria-hidden="true"></span><span id="coins">${S.coins}</span></span></div>
      <article class="card">
        ${V === "2" ? `<p class="rd-line" id="rline">${line()}</p>` : ""}
        <div class="md"><p>${md("A force acts on a particle: flat at $4.0\\ \\text{N}$ from A to B, then falling straight to zero at C. Each square is $2.5\\ \\text{m}$ by $1.0\\ \\text{N}$.")}</p>
        <p>${md("How much work does the force do from A to C, in joules?")}</p></div>
        <div class="q"><div class="choices" role="radiogroup" aria-label="Choices">${CHOICES.map(([id, t], i) => `
          <div class="ch"><button type="button" class="opt" role="radio" aria-checked="${S.sel === id}" data-id="${id}"${S.done ? " disabled" : ""}><span class="badge" aria-hidden="true">${S.done === "right" && id === RIGHT ? icon("i-ok") : "ABCDE"[i]}</span><span class="txt">${kx(t)}</span></button>${V === "2" && S.done === "right" && id === RIGHT ? `<span class="rd-burst on-row" aria-hidden="true">+3</span>` : ""}</div>`).join("")}
        </div>
        <div class="go"><button type="button" class="btn-go" id="check"${!S.sel || S.done ? " disabled" : ""}>${icon("i-go")}Check</button>
          ${V === "3" ? `<span class="rd-coin ${S.done}" id="rcoin"><span class="coin" aria-hidden="true"></span><span>${S.done === "right" ? "+3 is yours" : S.done === "wrong" ? "Still yours. Comes back later." : "+3 waiting"}</span>${S.done === "right" ? `<span class="rd-burst" aria-hidden="true">+3</span>` : ""}</span>` : ""}</div>
        </div>
      </article>
      <div class="fb" id="fb" aria-live="polite">${S.done === "right" ? `<p class="rd-say">Got it this time. Splitting the shape was the move.</p>` : S.done === "wrong" ? `<p class="rd-say">Not this time. Nothing lost: it comes back later, still worth +3.</p>` : `<p class="rd-say quiet">This one came back. You've seen the half-box idea before.</p>`}</div>
      <div class="nextrow"><button type="button" class="${S.done ? "next" : "btn-out"}" id="next">Next${icon("i-next")}</button></div>`;
    if (V === "1" && S.done === "right") $("#rslot").insertAdjacentHTML("beforeend", `<span class="rd-burst" aria-hidden="true">+3</span>`);
    if (S.done === "right") $(".hud").classList.add("bump");
  }
  app.addEventListener("click", e => {
    const o = e.target.closest(".opt");
    if (o && !o.disabled) { S.sel = S.sel === o.dataset.id ? null : o.dataset.id; return render(); }
    if (e.target.closest("#check") && S.sel && !S.done) { S.done = S.sel === RIGHT ? "right" : "wrong"; if (S.done === "right") S.coins += 3; return render(); }
    if (e.target.closest("#next")) location.search = new URLSearchParams({ v: V, ...(P.get("rm") ? { rm: "1" } : {}) }).toString();
  });

  $("#vname").textContent = `v${V}: ${NAMES[V][0]}`; $("#vlead").textContent = NAMES[V][1];
  seg($("#segV"), "v", [["1", "v1"], ["2", "v2"], ["3", "v3"]], V);
  seg($("#segS"), "state", [["", "Idle"], ["right", "Right"], ["wrong", "Wrong"]], STATE);
  feedback("RDM", () => `v=${V};state=${STATE || "idle"};rm=${rm ? 1 : 0}`);
  sprite();
  if (STATE === "right") { S.sel = RIGHT; S.done = "right"; S.coins += 3; }
  if (STATE === "wrong") { S.sel = "d"; S.done = "wrong"; }
  render();
})();
