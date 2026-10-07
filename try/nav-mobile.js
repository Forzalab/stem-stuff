/* try/nav-mobile.js: the interactive mock for design/plans/NAV-MOBILE.md (agent NM, Oct 7 2026).
   One question screen, 3 MC questions (Q1 long: its choices start below the fold on a phone), 2 tries each.
   pick -> (row arrow, or the bar's Check in v4) -> wrong: "your pick" + the wise-feedback line, Skip stays quiet
   -> right / out of tries: the one Next appears, where the variant puts it. Prev / Next walk the 3 questions (Next past the last
   starts over: the queue has no end). No keyboard shortcuts: every control is a tap. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const P = new URLSearchParams(location.search);
  const root = document.documentElement;
  const V = Math.min(7, Math.max(1, parseInt(P.get("v") || "1", 10) || 1));
  const RM = P.get("rm") === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("v" + V);
  if (P.get("rm") === "1") root.classList.add("rm");
  const icon = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const LET = "ABCDE";

  /* ---------- the three questions ---------- */
  const fig = `<figure class="fig nm-fig" aria-label="Ferris wheel: the rider at the top; weight points down, the seat pushes up">
    <svg viewBox="0 0 220 180" width="220" height="180" role="img" aria-hidden="true">
      <circle cx="110" cy="100" r="70" fill="none" stroke="var(--edge)" stroke-width="2"/>
      <circle cx="110" cy="100" r="3" fill="var(--muted)"/>
      <line x1="110" y1="100" x2="110" y2="30" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <rect x="98" y="22" width="24" height="12" rx="3" fill="var(--sheet)" stroke="var(--muted)" stroke-width="1.5"/>
      <path d="M110 34 V68" stroke="var(--c1)" stroke-width="2.5"/><path d="M104 61 L110 70 L116 61" fill="none" stroke="var(--c1)" stroke-width="2.5"/>
      <path d="M150 34 V6" stroke="var(--c1)" stroke-width="2.5"/><path d="M144 13 L150 4 L156 13" fill="none" stroke="var(--c1)" stroke-width="2.5"/>
      <text x="118" y="60" fill="var(--ink)" font-size="15">mg</text><text x="158" y="22" fill="var(--ink)" font-size="15">N</text>
      <text x="104" y="92" fill="var(--muted)" font-size="13" text-anchor="end">R = 12 m</text>
    </svg></figure>`;
  const Q = [
    { code: "PHYS_FW1", title: "Ferris wheel: the seat at the top",
      body: `<p>A Ferris wheel of radius 12 m turns at a steady rate, one full turn every 24 s. A 55 kg rider sits in a seat that stays upright the whole way around.</p>
        ${fig}
        <p>At the highest point, gravity pulls the rider down and the seat pushes up. The rider moves in a circle, so the net force on her points toward the center of the wheel, which is straight down at the top.</p>
        <p>Use g = 9.80 m/s².</p>
        <p><b>How hard does the seat push up on the rider at the highest point?</b></p>`,
      ch: ["584 N", "494 N", "539 N", "45.2 N", "366 N"], right: 1,
      l1: "Tricky one. At the top, the seat and gravity point opposite ways, and the net force points down. So which one has to be bigger? You can get it.",
      ok: "Right. Weight minus the seat's push is what turns her toward the center." },
    { code: "PHYS_KE2", title: "Kinetic energy of a cart",
      body: `<p>A 2.0 kg cart rolls along a flat track at 3.0 m/s.</p><p><b>What is its kinetic energy?</b></p>`,
      ch: ["3.0 J", "6.0 J", "9.0 J", "18 J"], right: 2,
      l1: "This one trips most people: the ½ in ½mv² is easy to drop, and so is the square. Square the speed first. You can get it.",
      ok: "Right. You squared the speed before you halved. That's the move on the exam.", joke: "QUACK. The ½ is tiny, but it bites." },
    { code: "PHYS_OR3", title: "Two satellites, two speeds",
      body: `<p>Satellite A circles Earth at an altitude of one Earth radius, R<sub>E</sub>. Satellite B circles at an altitude of 3R<sub>E</sub>.</p>
        <p><b>What is the ratio of their orbital speeds, v<sub>B</sub> / v<sub>A</sub>?</b></p>`,
      ch: ["0.500", "0.707", "0.577", "1.41"], right: 1,
      l1: "Tricky one, and it trips most people: an orbit's radius is measured from Earth's center, not from the ground. You can get it.",
      ok: "Right. You measured both radii from Earth's center." }
  ];
  const MAX = 2;
  const st = Q.map(() => ({ sel: -1, tries: 0, mine: [], done: "" }));   // done: "" | "right" | "out"
  let cur = 0;

  /* ---------- variants ---------- */
  const VAR = {
    1: { name: "1 · Dock swap", lead: "The bar moves to the bottom. When she is right, its › turns into a filled Next in the same spot.",
      why: "The smallest change from prod: the same four buttons, just at the bottom. The thumb learns one spot for “forward” and it is always there.",
      risk: "The change is small (an icon grows into a word), so a tired eye may still miss it. On 390 px the bar is full: the bank name hides.",
      desk: "The bar stays on top but sticks (it never scrolls away); the same › turns into the same filled Next." },
    2: { name: "2 · Next shelf", lead: "A full-width Next slides onto a shelf above the bar. The bar itself never changes.",
      why: "The biggest target on the screen, right where the thumb rests. Nothing in the bar moves, so the bar stays a calm map.",
      risk: "Two fixed layers take about 130 px of a 659 px Safari screen while it shows. It can feel like an ad banner.",
      desk: "The shelf becomes a full-width Next under the answer card." },
    3: { name: "3 · Next in the card", lead: "Next appears right under the answer she just tapped. The bar at the bottom stays quiet.",
      why: "Her eyes and thumb are already on the row she picked; Next lands there, with the line that says why she was right.",
      risk: "Two ways forward (quiet › in the bar, filled Next in the card). Under the Cluck sheet the card is covered, so the sheet carries its own Next.",
      desk: "The same: Next sits under the answer, at the right edge of the column." },
    4: { name: "4 · One thumb button", lead: "One button in the bottom-right corner does the next step, and its word says which: Skip, Check, then Next.",
      why: "Fixes two judge complaints at once: the unlabeled arrow (now “Check”) and no Next. The thumb never moves between pick, check and go.",
      risk: "The biggest change: no arrow in the row. A long stem puts Check far from the choice. A word that changes under the thumb can be tapped twice by accident (we wait 400 ms before Next takes taps).",
      desk: "The same button sits under the choices (right edge), not in the top bar, so it stays next to the answer." },
    5: { name: "5 · Result footer", lead: "After a check, the bar turns into a footer: the one line about her answer, and the way on.",
      why: "Like Duolingo's footer: the verdict and the action in one place, at the thumb. A wrong pick shows the wise-feedback line and a quiet Skip, no Next.",
      risk: "The footer covers the bottom of the page while it shows (we add room under the choices). Prev and the list hide until the next question.",
      desk: "The footer is a strip under the card, the same words and the same Next." },
    6: { name: "6 · Segmented bar", lead: "The bar is one segmented control: Back, the list, notes, and a wide Next segment that fills when she is right.",
      why: "The bar reads as one object with a clear forward end. Next is always in the same half of the bar, even before it is the action (as a quiet Skip).",
      risk: "Segments look like tabs; a quiet Skip in the forward slot may tempt skipping a retry. No progress count on purpose (no counters, STYLE §1.10).",
      desk: "The same segmented bar at the top of the column, sticky." },
    7: { name: "7 · Floating Next, peek bar", lead: "The bar hides while she scrolls down to read and comes back on scroll up. Next floats over the thumb once she is right.",
      why: "The most room for a long question on a small phone. Next does not depend on the scroll: it shows on the answer, not on a gesture.",
      risk: "The judges saw a bar that would not come back on scroll up. Here only Back, list and Skip depend on the scroll, but that is still a hidden control (STYLE §1.11).",
      desk: "No hiding on desktop: a sticky top bar, and the floating Next sits at the bottom-right of the column." }
  };
  /* where the one Next goes: phone / desktop */
  const SLOT = { 1: ["bar", "bar"], 2: ["shelf", "card"], 3: ["card", "card"], 4: ["bar", "card"], 5: ["foot", "card"], 6: ["bar", "bar"], 7: ["fab", "fab"] };
  const phoneMQ = matchMedia("(max-width: 700px), (pointer: coarse)");
  const phone = () => phoneMQ.matches;

  /* the one Next (and v4's Check / Skip in the same button) */
  const nx = document.createElement("button");
  nx.type = "button"; nx.className = "btn btn-go btn-label nx"; nx.id = "nx";
  nx.innerHTML = `<span class="nx-tx">Next</span>${icon("i-next")}`;
  let nxReadyAt = 0;

  function slotFor() { const s = SLOT[V][phone() ? 0 : 1]; return s === "card" ? $("#slotCard") : s === "shelf" ? $("#shelf") : s === "foot" ? $("#foot") : s === "fab" ? $("#slotFab") : $("#slotBar"); }

  /* ---------- render ---------- */
  function render(jump) {
    const q = Q[cur], s = st[cur];
    $("#pcode").textContent = `Question ${cur + 1}: ${q.title}`;
    $("#blocks").innerHTML = q.body;
    const arrow = V !== 4;
    $("#q").innerHTML = `<div class="choices" role="radiogroup" aria-label="Choices">${q.ch.map((c, i) => `
      <div class="ch"><button type="button" class="opt" role="radio" aria-checked="false" data-i="${i}" aria-label="${LET[i]}: ${c}"><span class="badge" aria-hidden="true">${LET[i]}</span><span class="txt">${c}</span></button>
      ${arrow ? `<button type="button" class="btn btn-go send" data-i="${i}" aria-label="Check ${LET[i]}" hidden>${icon("i-go")}</button>` : ""}</div>`).join("")}</div>`;
    $("#q").querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => pick(+b.dataset.i)));
    $("#q").querySelectorAll(".send").forEach(b => b.addEventListener("click", () => check(+b.dataset.i)));
    paint();
    listRows();
    if (jump) scrollTo({ top: 0, behavior: "auto" });
  }

  function paint() {
    const q = Q[cur], s = st[cur], done = !!s.done, q0 = $("#q");
    q0.classList.toggle("closed", done);
    q0.querySelectorAll(".opt").forEach((o, i) => {
      const mine = s.mine.includes(i), right = done && i === q.right && (s.done === "right" || s.done === "out");
      o.classList.toggle("mine", mine && !right);
      o.classList.toggle("right", right);
      o.setAttribute("aria-checked", String(!done && s.sel === i));
      o.disabled = done || mine;
      o.querySelector(".badge").innerHTML = right ? icon("i-ok") : LET[i];
      const send = o.parentElement.querySelector(".send"); if (send) send.hidden = done || s.sel !== i;
    });
    /* feedback under the choices */
    const left = MAX - s.tries;
    let fb = "";
    if (s.done === "right") fb = `<p class="verdict ok">${icon("i-ok")}<span>Right.</span></p><p class="nm-line">${q.ok.replace(/^Right\. /, "")}</p>${q.joke ? `<p class="nm-joke">${q.joke}</p>` : ""}`;
    else if (s.done === "out") fb = `<p class="nm-out">Out of tries for now. This one comes back around.</p><p class="nm-line">The right one is ${LET[q.right]}, ${q.ch[q.right]}.</p>`;
    else if (s.mine.length) fb = `<div class="cluck nm-cluck">${icon("i-duck")}<div><p class="nm-line">${q.l1}</p>
        <p class="nm-tries"><span class="pips" aria-hidden="true">${Array.from({ length: MAX }, (_, k) => `<i class="${k < s.tries ? "used" : ""}"></i>`).join("")}</span>Pick again. ${left === 1 ? "1 more try." : left + " more tries."}</p>
        <button type="button" class="btn btn-label nm-ask" id="askBtn">${icon("i-chat")}<span>Ask Cluck</span></button></div></div>`;
    $("#fb").innerHTML = V === 5 && phone() && (s.mine.length || done) ? "" : fb;
    const ask = $("#askBtn"); if (ask) ask.addEventListener("click", () => sheet(true));
    /* v5 footer (phones) */
    const foot = $("#foot");
    const showFoot = V === 5 && phone() && (done || s.mine.length);
    foot.hidden = !showFoot;
    root.classList.toggle("foot-on", showFoot);
    if (showFoot) {
      foot.innerHTML = s.done === "right" ? `<p class="verdict ok">${icon("i-ok")}<span>${q.ok}</span></p>`
        : s.done === "out" ? `<p class="nm-out">Out of tries for now. This one comes back around.</p><p class="nm-line nm-sm">The right one is ${LET[q.right]}, ${q.ch[q.right]}.</p>`
        : `<p class="nm-line nm-sm">${q.l1}</p><div class="foot-row"><span class="nm-tries"><span class="pips" aria-hidden="true">${Array.from({ length: MAX }, (_, k) => `<i class="${k < s.tries ? "used" : ""}"></i>`).join("")}</span>Pick again. ${left} more ${left === 1 ? "try" : "tries"}.</span><button type="button" class="btn btn-label foot-skip" id="footSkip">Skip for now</button></div>`;
      const fs = $("#footSkip"); if (fs) fs.addEventListener("click", () => go(1));
    }
    /* the action button */
    const was = nx.parentElement;
    let mode = done ? "next" : "";
    if (V === 4 && !done) mode = s.sel >= 0 && !s.mine.includes(s.sel) ? "check" : "skip";
    nx.dataset.mode = mode;
    nx.classList.toggle("btn-go", mode === "next" || mode === "check");
    nx.classList.toggle("quiet", mode === "skip");
    nx.querySelector(".nx-tx").textContent = mode === "check" ? "Check" : mode === "skip" ? "Skip" : V === 2 || V === 5 ? "Next question" : "Next";
    nx.setAttribute("aria-label", mode === "check" ? `Check ${LET[s.sel]}` : mode === "skip" ? "Skip this one" : "Next question");
    if (mode) {
      const slot = slotFor();
      if (was !== slot) { slot.append(nx); if (mode === "next") arrive(); }
      else if (nx.dataset.last !== mode && mode === "next") arrive();
    } else nx.remove();
    nx.dataset.last = mode;
    root.classList.toggle("is-done", done);
    root.classList.toggle("is-wrong", !done && s.mine.length > 0);
    root.classList.toggle("nx-bar", !!mode && nx.parentElement === $("#slotBar"));
    $("#fab").hidden = !(V === 7 && done);
    /* v3: the sheet carries its own Next when the card is under it */
    const sn = $("#slotSheet"); sn.innerHTML = "";
    if (done && !$("#sheet").hidden && nx.parentElement === $("#slotCard")) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-go btn-label nx"; b.innerHTML = `<span>Next</span>${icon("i-next")}`;
      b.addEventListener("click", () => { sheet(false); go(1); }); sn.append(b);
    }
    $("#sheetRetry").hidden = done;
    $("#prevBtn").disabled = cur === 0;
    $("#skipBtn").classList.toggle("worded", !done && s.mine.length > 0);
    /* the sheet's line follows the question */
    $("#sheetLine").textContent = done ? (s.done === "right" ? q.ok : "Out of tries for now. This one comes back around.") : q.l1;
    measure();
  }

  function arrive() {
    nxReadyAt = performance.now() + (V === 4 ? 400 : 0);
    nx.classList.remove("in"); void nx.offsetWidth; if (!RM) nx.classList.add("in");
    const card = nx.parentElement === $("#slotCard");
    if (card) nx.scrollIntoView({ block: "nearest", behavior: RM ? "auto" : "smooth" });
    if (V === 7) { root.classList.remove("nb-away"); }
  }

  /* ---------- actions ---------- */
  function pick(i) {
    const s = st[cur]; if (s.done || s.mine.includes(i)) return;
    s.sel = s.sel === i ? -1 : i;
    paint();
  }
  function check(i) {
    const q = Q[cur], s = st[cur]; if (s.done || i < 0) return;
    s.tries++;
    if (i === q.right) { s.done = "right"; s.sel = -1; }
    else { s.mine.push(i); s.sel = -1; if (s.tries >= MAX) s.done = "out"; }
    paint();
    /* show what the check said: the feedback (or the Next under it) scrolls up just above the bar, never to the top */
    (V === 5 && phone() ? $("#q") : $("#slotCard").firstChild || $("#fb")).scrollIntoView({ block: "nearest", behavior: RM ? "auto" : "smooth" });
    const o = $("#q").querySelectorAll(".opt")[i];
    if (s.done === "right" && !RM) { o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop"); }
    if (root.classList.contains("kbup") && s.done) setTimeout(() => kb(false), 900);   // prod doneExit: the keyboard steps away, Next is back
  }
  function go(d) {
    sheet(false); list(false);
    cur = (cur + d + Q.length) % Q.length;
    if (d > 0 && st[cur].done) st[cur] = { sel: -1, tries: 0, mine: [], done: "" };   // a fresh showing (the queue)
    render(true);
  }
  nx.addEventListener("click", () => {
    const m = nx.dataset.mode;
    if (m === "check") return check(st[cur].sel);
    if (m === "skip") return go(1);
    if (performance.now() < nxReadyAt) return;
    go(1);
  });
  $("#prevBtn").addEventListener("click", () => { if (cur > 0) { sheet(false); list(false); cur--; render(true); } });
  $("#skipBtn").addEventListener("click", () => go(1));
  $("#notesBtn").addEventListener("click", () => { const t = $("#mtag"); t.textContent = "Notes would open here (the pad page). Not part of this mock."; });

  /* ---------- the list ---------- */
  function listRows() {
    $("#qlistOl").innerHTML = Q.map((q, i) => `<li><a href="#" data-i="${i}"${i === cur ? ' aria-current="true"' : ""}><span class="qn">${i + 1}</span><span class="qt">${q.title}</span></a></li>`).join("");
    $("#qlistOl").querySelectorAll("a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); list(false); cur = +a.dataset.i; render(true); }));
  }
  function list(open) {
    $("#qlist").hidden = !open; $("#listBtn").setAttribute("aria-expanded", String(open));
    root.classList.toggle("ql-open", open); measure();
  }
  $("#listBtn").addEventListener("click", () => list($("#qlist").hidden));

  /* ---------- Cluck sheet ---------- */
  function sheet(open) {
    $("#sheet").hidden = !open; root.classList.toggle("sheet-on", open);
    $("#tCluck").setAttribute("aria-pressed", String(open));
    if (open) list(false);
    paint();
  }
  $("#sheetX").addEventListener("click", () => sheet(false));
  $("#sheetRetry").addEventListener("click", () => { sheet(false); $("#q").scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" }); });
  $("#tCluck").addEventListener("click", () => sheet($("#sheet").hidden));

  /* ---------- keyboard stand-in ---------- */
  $("#kbIn").innerHTML = ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map(r => `<div>${[...r].map(() => "<i></i>").join("")}</div>`).join("") + "<div><b></b></div>";
  function kb(on) { $("#kb").hidden = !on; root.classList.toggle("kbup", on); $("#tKb").setAttribute("aria-pressed", String(on)); measure(); }
  $("#tKb").addEventListener("click", () => kb($("#kb").hidden));
  $("#kbDone").addEventListener("click", () => kb(false));

  /* ---------- reduced motion (reload with ?rm=1) ---------- */
  $("#tRm").setAttribute("aria-pressed", String(P.get("rm") === "1"));
  $("#tRm").addEventListener("click", () => { const q = new URLSearchParams(location.search); if (q.get("rm") === "1") q.delete("rm"); else q.set("rm", "1"); location.search = q.toString(); });

  /* ---------- v7: the bar hides on scroll down, back on scroll up (or when Next shows) ---------- */
  let lastY = scrollY;
  addEventListener("scroll", () => {
    if (V !== 7 || !phone()) return;
    const y = scrollY, dy = y - lastY; lastY = y;
    if (Math.abs(dy) < 6) return;
    root.classList.toggle("nb-away", dy > 0 && y > 40 && $("#qlist").hidden);
  }, { passive: true });

  /* ---------- the bar's height: room under the page, and the sheet / FAB sit above it ---------- */
  function measure() {
    const w = $("#nbwrap"), h = phone() && !root.classList.contains("kbup") ? w.offsetHeight : 0;
    root.style.setProperty("--nb-h", h + "px");
    root.style.setProperty("--kb-h", root.classList.contains("kbup") ? $("#kb").offsetHeight + "px" : "0px");
  }
  new ResizeObserver(measure).observe($("#nbwrap"));
  const onMQ = () => { root.classList.toggle("ph", phone()); paint(); };
  if (phoneMQ.addEventListener) phoneMQ.addEventListener("change", onMQ);
  root.classList.toggle("ph", phone());

  /* ---------- mockup chrome ---------- */
  const vv = VAR[V];
  $("#mtag").textContent = `Mock · ${vv.name}`;
  $("#vname").textContent = vv.name;
  $("#vlead").textContent = vv.lead;
  $("#vwhy").innerHTML = `<dt>Why</dt><dd>${vv.why}</dd><dt>Risk</dt><dd>${vv.risk}</dd><dt>Desktop</dt><dd>${vv.desk}</dd>`;
  $("#segV").innerHTML = Object.keys(VAR).map(k => `<button type="button" data-v="${k}" aria-pressed="${+k === V}" aria-label="Variant ${VAR[k].name}">${k}</button>`).join("");
  $("#segV").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const q = new URLSearchParams(location.search); q.set("v", b.dataset.v); q.delete("state"); location.search = q.toString(); });
  const STATES = [["q", "Start"], ["wrong", "Wrong"], ["right", "Right"], ["out", "Out of tries"]];
  $("#segS").innerHTML = STATES.map(([k, l]) => `<button type="button" data-s="${k}">${l}</button>`).join("");
  $("#segS").addEventListener("click", e => { const b = e.target.closest("button"); if (b) jumpTo(b.dataset.s, true); });

  function jumpTo(state, scroll) {
    const q = Q[cur]; st[cur] = { sel: -1, tries: 0, mine: [], done: "" };
    const wrong = q.ch.findIndex((_, i) => i !== q.right);
    if (state === "picked") st[cur].sel = wrong;
    if (state === "wrong" || state === "out") { check(wrong); }
    if (state === "out") { const w2 = q.ch.findIndex((_, i) => i !== q.right && i !== wrong); check(w2); }
    if (state === "right") check(q.right);
    paint();
    if (scroll) $("#q").scrollIntoView({ block: "center", behavior: "auto" });
  }

  /* feedback box + Copy all: NAVM;v=..;state=..;note=.. */
  const ta = $("#note");
  const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
  ta.addEventListener("input", grow);
  $("#copyAll").addEventListener("click", async () => {
    const s = st[cur], state = s.done || (s.mine.length ? "wrong" : s.sel >= 0 ? "picked" : "q");
    const line = `NAVM;v=${V};vp=${phone() ? "phone" : "desk"};q=${cur + 1};state=${state}${RM ? ";rm=1" : ""};note=${ta.value.replace(/\s+/g, " ").trim()}`;
    try { await navigator.clipboard.writeText(line); $("#copied").textContent = "Copied."; }
    catch { ta.value = line; grow(); ta.select(); $("#copied").textContent = "Selected: copy it by hand."; }
  });

  /* start */
  const q0 = P.get("q"); if (q0) cur = Math.min(Q.length - 1, Math.max(0, (parseInt(q0, 10) || 1) - 1));
  render(false);
  const s0 = P.get("state"); if (s0 && s0 !== "q") jumpTo(s0, false);
  if (P.get("cluck") === "1") sheet(true);
  if (P.get("kb") === "1") kb(true);
  grow();
})();
