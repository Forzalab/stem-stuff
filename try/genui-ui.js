/* try/genui-ui.js: the wrong-pick moment, 3 variants (agent U, Oct 7 2026). design/plans/UI-UNIFY.md maps every choice.
   Flow: question card + choices -> pick (+ optional "I'm sure") -> wrong -> Cluck box + visual -> retry -> right (affirm thumbnail) -> Next.
   v=1 Partial sheet + bet tick (+2 / -1, first pick only) · ghost on the question's own figure
   v=2 Ante: put 2 coins on the table before the first pick; lose = they stay on the table · figure copy in the sheet's visual slot
   v=3 Inline Cluck + confidence tick (+2 if right, nothing if not) · ghost on the figure · strip fixed in the thumb zone
   ?state= pick | wrong | retry | right | right1 | out · ?rm=1 reduced motion (stills). */
(function () {
  "use strict";
  const { $, P, rm, icon, kx, md, wait, sprite, feedback, seg } = GK;
  const V = ["1", "2", "3"].includes(P.get("v")) ? P.get("v") : "1";
  const STATE = P.get("state") || "";
  const NAMES = {
    "1": ["Partial sheet + bet tick", "Cluck rises as a 45% sheet; the question and its figure stay on top, and your pick appears as a dashed box on that figure. \"I'm sure\" is a small bet on the first pick: +2 if right, −1 if not."],
    "2": ["Ante: coins on the table", "Before the first pick you can put 2 coins on the table. Right: they come back with 2 more. Not right: they stay on the table. The retry carries no stake. Cluck's sheet shows a copy of the figure with your pick on it."],
    "3": ["Inline Cluck, thumb strip", "No sheet: Cluck's card opens right under the choices, your pick lands on the question's figure, and Try again / Just tell me sit fixed at the bottom where the thumb is. \"I'm sure\" only adds: +2 if right, nothing if not."]
  };

  /* PHYS_KWV (BANK_P2X), paraphrased stem; numbers from the bank key */
  const FIG = { kind: "cartesian", alt: "Force F_x versus x: flat from A to B, then a straight fall from B to C on the axis.", grid: true, axes: true,
    x: { min: -0.5, max: 8.8, step: 1, ticks: [{ at: 0, label: "0" }] }, y: { min: -1, max: 5, step: 1 },
    marks: [
      { mark: "seg", from: [0, 4], to: [4, 4], color: "c2" }, { mark: "seg", from: [4, 4], to: [8, 0], color: "c2" },
      { mark: "point", at: [0, 4], label: "A", anchor: "n" }, { mark: "point", at: [4, 4], label: "B", anchor: "n" }, { mark: "point", at: [8, 0], label: "C", anchor: "se" }] };
  const GHOST = {
    d: [{ mark: "poly", pts: [[0, 0], [0, 4], [8, 4], [8, 0]], dash: true, color: "muted" }, { mark: "text", at: [6.4, 4], text: "your 80 J", anchor: "n", color: "muted" }],
    a: [{ mark: "poly", pts: [[0, 0], [0, 4], [4, 4], [4, 0]], dash: true, color: "muted" }, { mark: "text", at: [2, 2], text: "your 40 J", anchor: "c", color: "muted" }],
    b: [{ mark: "poly", pts: [[4, 0], [4, 4], [8, 0]], dash: true, color: "muted" }, { mark: "text", at: [6.6, 2.2], text: "your 20 J", anchor: "c", color: "muted" }],
    e: [{ mark: "text", at: [4, 2], text: "your 24 = squares", anchor: "c", color: "muted" }]
  };
  const TRUTH = [{ mark: "poly", pts: [[0, 0], [0, 4], [4, 4], [8, 0]], fill: true, color: "c2" }];
  const CHOICES = [["a", "40.0"], ["b", "20.0"], ["c", "60.0"], ["d", "80.0"], ["e", "24.0"]];
  const RIGHT = "c";
  /* L1 lines (FABLE-1 C7 rules 1, 7, 10: wise feedback first, praise the right part, no joke, no value, end on a choice) */
  const L1 = {
    d: ["Tricky one: the slope is built to look like a full box.", "Your rectangle is right. The slanted part is a triangle, half its box."],
    a: ["That's the rectangle on its own.", "The trip runs to C, so the triangle counts too."],
    b: ["That's the triangle on its own.", "The rectangle from A to B counts too."],
    e: ["Your 24 squares are right.", "One square is 2.5 m by 1.0 N, so each one is worth 2.5 J."]
  };
  const STEPS = [
    ["Rectangle A to B", "4 \\times 4 = 16 \\text{ squares}"],
    ["Triangle B to C, half its box", "\\tfrac{1}{2}(4)(4) = 8 \\text{ squares}"],
    ["One square", "(2.5\\ \\text{m})(1.0\\ \\text{N}) = 2.5\\ \\text{J}"],
    ["Total", "W = 24(2.5) = \\boxed{60.0\\ \\text{J}}"]
  ];

  const S = { sel: null, tries: 2, misses: [], phase: "pick", sure: false, ante: false, coins: 12, delta: "", told: false };

  const app = $("#app");
  function figHTML() { return `<div class="fig" id="qfig" role="img" aria-label="${FIG.alt}"></div>`; }
  function draw(el, block) { el._g = null; Graph.render(el, block); el.querySelectorAll("polygon[stroke-dasharray]").forEach(p => { p.setAttribute("stroke-dasharray", "8 5"); p.classList.add("ghosted"); }); }
  const ghostMarks = () => S.misses.slice(-2).flatMap(m => GHOST[m] || []);
  function paintQ() {
    const f = $("#qfig"); if (!f) return;
    const onFig = V !== "2" && S.misses.length && S.phase !== "right";
    draw(f, { ...FIG, marks: [...(S.phase === "right" || S.phase === "out" ? TRUTH : []), ...FIG.marks, ...(onFig ? ghostMarks() : [])] });
  }

  function shell() {
    app.innerHTML = `
      <div class="qrow"><span class="lbl-q">${icon("i-doc")}Question</span>
        <span class="hud rw-skin" aria-label="Coins"><span class="coin" aria-hidden="true"></span><span id="coins">${S.coins}</span><span class="delta" id="delta"></span></span></div>
      <article class="card"><div class="md">
        <p>${md("A force acts on a particle as shown. Each square on the graph is $2.5\\ \\text{m}$ wide and $1.0\\ \\text{N}$ tall.")}</p>
        ${figHTML()}
        <p>${md("How much work does the force do from A to C, in joules?")}</p></div>
        <div class="q"><div class="choices" role="radiogroup" aria-label="Choices">${CHOICES.map(([id, t], i) => `
          <div class="ch"><button type="button" class="opt" role="radio" aria-checked="false" data-id="${id}"><span class="badge" aria-hidden="true">${"ABCDE"[i]}</span><span class="txt">${kx(t)}</span></button></div>`).join("")}
        </div>
        ${V === "2" ? `<div class="table" id="table"><span class="pile" aria-hidden="true"><span class="coin"></span><span class="coin"></span></span><span class="say" id="tsay">Bet 2 coins on your first pick?</span><button type="button" id="ante">Put 2 down</button></div>` : `
        <div class="sure"><button type="button" id="sure" aria-pressed="false"><span class="box">${icon("i-ok")}</span>I'm sure</button><span class="odds" id="odds">${V === "1" ? "+2 if right · −1 if not" : "+2 if right"}</span></div>`}
        ${V === "2" ? "" : `<div class="go"><button type="button" class="btn-go" id="check" disabled>${icon("i-go")}Check</button></div>`}
        </div>
      </article>
      <div class="fb" id="fb" aria-live="polite"></div>
      <div class="nextrow" id="nextrow"><button type="button" class="btn-out" id="next">Next${icon("i-next")}</button></div>`;
    paintQ();
    app.addEventListener("click", onClick);
  }

  function opts() { return [...app.querySelectorAll(".opt")]; }
  function paintOpts() {
    opts().forEach(o => {
      const id = o.dataset.id, mine = S.misses.includes(id), right = S.phase === "right" && id === RIGHT, outRight = S.phase === "out" && id === RIGHT;
      o.classList.toggle("mine", mine); o.classList.toggle("right", right || outRight);
      o.setAttribute("aria-checked", String(S.sel === id && S.phase === "pick"));
      o.disabled = mine || S.phase !== "pick";
      if (right || outRight) o.querySelector(".badge").innerHTML = icon("i-ok");
      o.setAttribute("aria-label", mine ? `${o.innerText.trim()}, your pick` : o.innerText.trim());
    });
    const c = $("#check"); if (c) c.disabled = !S.sel || S.phase !== "pick";
    const s = $("#sure"); if (s) { s.disabled = S.misses.length > 0 || S.phase !== "pick"; s.setAttribute("aria-pressed", String(S.sure)); }
    const odds = $("#odds"); if (odds && S.misses.length) odds.textContent = "The retry is free.";
    $("#coins").textContent = S.coins; $("#delta").textContent = S.delta;
    const n = $("#next"); n.className = S.phase === "right" || S.phase === "out" ? "next" : "btn-out";
  }

  function onClick(e) {
    const o = e.target.closest(".opt");
    if (o && !o.disabled) { if (V === "2") { S.sel = o.dataset.id; return commit(o.dataset.id); } S.sel = S.sel === o.dataset.id ? null : o.dataset.id; return paintOpts(); }
    if (e.target.closest("#check") && S.sel) return commit(S.sel);
    if (e.target.closest("#sure")) { S.sure = !S.sure; return paintOpts(); }
    if (e.target.closest("#ante")) return ante();
    if (e.target.closest("#next")) { location.search = new URLSearchParams({ v: V, ...(P.get("rm") ? { rm: "1" } : {}) }).toString(); }
    if (e.target.closest("#twin")) { $("#fb").insertAdjacentHTML("beforeend", `<p class="lockline">A twin would load here: same idea, new numbers.</p>`); }
  }

  function ante() {
    if (S.misses.length || S.phase !== "pick") return;
    const t = $("#table"); S.ante = !S.ante; S.coins += S.ante ? -2 : 2;
    t.classList.toggle("on", S.ante);
    $("#tsay").textContent = S.ante ? "2 on the table. Right gets 4 back." : "Bet 2 coins on your first pick?";
    $("#ante").textContent = S.ante ? "Take back" : "Put 2 down";
    paintOpts();
  }

  async function commit(id) {
    const first = S.misses.length === 0; S.tries--;
    if (id === RIGHT) {
      S.phase = "right";
      let gain = first ? 2 : 1;
      if (first && V === "2" && S.ante) gain += 4;
      if (first && V !== "2" && S.sure) gain += 2;
      S.coins += gain; S.delta = "+" + gain;
      if (V === "2") { const t = $("#table"); t.classList.remove("on"); $("#tsay").textContent = S.ante && first ? "Your 2 came back with 2 more." : "No bet this time."; $("#ante").hidden = true; }
      paintOpts(); paintQ(); closeCluck(); affirm(first); return;
    }
    S.misses.push(id);
    if (first && V === "1" && S.sure) { S.coins -= 1; S.delta = "−1"; }
    if (first && V === "2") { const t = $("#table"); if (S.ante) { t.classList.add("lost"); $("#tsay").textContent = "Those 2 stay on the table. The retry is free."; } else $("#tsay").textContent = "No bet. The retry is free."; $("#ante").hidden = true; }
    S.phase = S.tries > 0 ? "wrong" : "out"; S.sel = null;
    paintOpts(); paintQ();
    if (S.phase === "out") lockOut();
    await openCluck(id);
  }

  /* ---------- Cluck ---------- */
  function cluckHTML(id, level) {
    const lines = S.phase === "out" ? ["This one trips most people.", "Here is the whole path. It comes back around later."] : L1[id];
    const slot = V === "2" ? `<div class="slot" style="--slot:12rem"><div class="fig" id="cfig" role="img" aria-label="Your pick drawn on the graph"></div></div>`
      : `<div class="slot"><span class="chip">triangle ${kx("=")} <span class="miss">${kx("\\dfrac{1}{2}")}</span>${kx("\\,b\\,h")}</span></div>`;
    const steps = STEPS.slice(0, level >= 3 ? 4 : 3);
    return `
      <div class="hd">${icon("i-duck")}<span>Cluck</span>${V === "3" ? "" : `<button type="button" class="x" id="clx" aria-label="Close Cluck">${icon("i-x")}</button>`}</div>
      <p class="line" id="cline" aria-live="polite"></p>
      ${slot}
      ${S.phase === "out" || V === "3" ? "" : `<div class="strip"><button type="button" class="retry" id="retry">Try again</button><button type="button" class="tell" id="tell">Just tell me</button></div>`}
      <details id="steps"${level >= 3 ? " open" : ""}><summary>Show the steps</summary><ol>${level >= 3 ? steps.map(([h, m]) => `<li><b>${h}</b>${kx(m, true)}</li>`).join("") : ""}</ol></details>
      <p class="disc">verify b4 use lol, and pls no private shit in it xoxo</p>
      <div class="ask"><input type="text" aria-label="Ask Cluck about a step" placeholder="Ask about a step" maxlength="500"><button type="button" class="send" aria-label="Send">${icon("i-send")}</button></div>`;
  }

  async function openCluck(id) {
    const level = S.phase === "out" || S.told ? 3 : 1;
    let box = $("#cluck");
    if (!box) {
      box = document.createElement(V === "3" ? "section" : "aside");
      box.id = "cluck";
      box.className = "clk ai-skin " + (V === "3" ? "inline" : "sheet");
      box.setAttribute("aria-label", "Cluck");
      if (V === "3") $("#fb").before(box); else document.body.append(box);
    }
    box.classList.remove("peek");
    box.innerHTML = (V === "3" ? "" : `<button type="button" class="grab" id="grab" aria-label="Expand Cluck"><span></span></button><button type="button" class="peekbar" id="peekbar">${icon("i-duck")}Cluck: read it again</button>`) + `<div class="in">${cluckHTML(id, level)}</div>`;
    document.body.classList.toggle("has-sheet", V !== "3"); document.body.classList.remove("has-peek");
    if (V === "3" && S.phase !== "out") strip(true);
    if (V === "2") { const c = $("#cfig"); c.style.maxWidth = "16rem"; c.style.margin = "0 auto"; draw(c, { ...FIG, marks: [...FIG.marks, ...ghostMarks()] }); }
    box.addEventListener("click", cluckClick);
    /* the steps are built when the fold opens (closed = not in the layout at all) */
    $("#steps", box).addEventListener("toggle", e => { const d = e.target, ol = d.querySelector("ol"); ol.innerHTML = d.open ? STEPS.slice(0, S.told || S.phase === "out" ? 4 : 3).map(([h, m]) => `<li><b>${h}</b>${kx(m, true)}</li>`).join("") : ""; });
    /* first token renders at once; each sentence lands whole (no 35 cps typewriter, pain #4) */
    const line = $("#cline", box), lines = S.phase === "out" ? ["This one trips most people.", "Here is the whole path. It comes back around later."] : L1[id];
    line.textContent = "";
    for (const s of lines) { await wait(140); const sp = document.createElement("span"); sp.className = "chunk"; sp.textContent = (line.textContent ? " " : "") + s; line.append(sp); }
    if (V === "1" && $("#qfig")) $("#qfig").scrollIntoView({ block: "start", behavior: "auto" });
    if (V === "3") box.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  function strip(on) {
    let st = $("#tstrip");
    if (on && !st) {
      st = document.createElement("div"); st.id = "tstrip"; st.className = "thumb-strip clk ai-skin";
      st.innerHTML = `<div class="strip"><button type="button" class="retry" id="retry">Try again</button><button type="button" class="tell" id="tell">Just tell me</button></div>`;
      document.body.append(st); st.addEventListener("click", cluckClick);
    }
    if (!on && st) st.remove();
    document.body.classList.toggle("has-strip", !!on);
  }

  function cluckClick(e) {
    if (e.target.closest("#retry")) return retry();
    if (e.target.closest("#tell")) { S.told = true; const d = $("#steps"); d.querySelector("ol").innerHTML = STEPS.map(([h, m]) => `<li><b>${h}</b>${kx(m, true)}</li>`).join(""); d.open = true; d.scrollIntoView({ block: "nearest" }); return; }
    if (e.target.closest("#clx")) return peek();
    if (e.target.closest("#peekbar")) { const b = $("#cluck"); b.classList.remove("peek"); document.body.classList.add("has-sheet"); document.body.classList.remove("has-peek"); return; }
    if (e.target.closest("#grab")) { $("#cluck").classList.toggle("full"); }
  }
  function peek() { const b = $("#cluck"); if (!b) return; b.classList.add("peek"); b.classList.remove("full"); document.body.classList.remove("has-sheet"); document.body.classList.add("has-peek"); }
  function retry() {
    S.phase = "pick"; paintOpts();
    if (V === "3") { strip(false); } else peek();
    app.querySelector(".choices").scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  function closeCluck() { const b = $("#cluck"); if (b) b.remove(); strip(false); document.body.classList.remove("has-sheet", "has-peek"); }

  function lockOut() {
    $("#fb").innerHTML = `<p class="lockline">${icon("i-lock")}<span>Out of tries for now. This one comes back around.</span></p>`;
    $("#nextrow").innerHTML = `<button type="button" class="next" id="next">Next${icon("i-next")}</button><button type="button" class="btn-out" id="twin">${icon("i-retry")}Try a twin</button>`;
  }

  function affirm(first) {
    const line = first ? "You split it into a box and a triangle. That's the move on the exam." : "You halved the triangle. That's the move on the exam.";
    $("#fb").innerHTML = `<div class="affirm"><div class="fig thumb" id="tfig" role="img" aria-label="The 60 J area${first ? "" : " beside your 80 J box"}"></div>
      <div><p>${line}</p><p class="joke">QUACK. Triangles: the half-price boxes of physics.</p></div></div>`;
    const marks = [...TRUTH, { mark: "text", at: [2.6, 1.6], text: "60 J", color: "c2" },
      ...(first ? [] : [{ mark: "poly", pts: [[0, 0], [0, 4], [8, 4], [8, 0]], dash: true, color: "muted" }])];
    draw($("#tfig"), { kind: "scene", marks });
    paintOpts();
  }

  /* ---------- states as links (for shots and for Tony) ---------- */
  async function replay() {
    const tap = id => app.querySelector(`.opt[data-id="${id}"]`).click();
    const chk = () => $("#check")?.click();
    const bet = () => { if (V === "2") $("#ante").click(); else $("#sure").click(); };
    if (STATE === "pick") { bet(); if (V !== "2") tap("d"); }
    if (["wrong", "retry", "right", "out"].includes(STATE)) { bet(); tap("d"); chk(); await wait(400); }
    if (["retry", "right", "out"].includes(STATE)) { $("#retry").click(); }
    if (STATE === "right") { tap("c"); chk(); }
    if (STATE === "out") { tap("a"); chk(); await wait(400); }
    if (STATE === "right1") { bet(); tap("c"); chk(); }
  }

  /* page chrome */
  $("#vname").textContent = `v${V}: ${NAMES[V][0]}`; $("#vlead").textContent = NAMES[V][1];
  document.title = "Wrong-pick moment";
  seg($("#segV"), "v", [["1", "v1"], ["2", "v2"], ["3", "v3"]], V);
  seg($("#segS"), "state", [["", "Fresh"], ["pick", "Pick"], ["wrong", "Wrong"], ["right", "Right"], ["out", "Out"]], STATE);
  feedback("UI", () => `v=${V};state=${STATE || "fresh"};rm=${rm ? 1 : 0}`);
  sprite();
  shell(); paintOpts();
  const start = () => replay();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { paintQ(); const c = $("#cfig"); if (c) draw(c, { ...FIG, marks: [...FIG.marks, ...ghostMarks()] }); }, 150); });
})();
