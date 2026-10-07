/* try/nav-mobile.js: the interactive mock for design/plans/NAV-MOBILE.md (agent NM, Oct 7 2026; round 2 variants in §7).
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
        <p class="q-ask"><b>How hard does the seat push up on the rider at the highest point?</b></p>`,
      ch: ["584 N", "494 N", "539 N", "45.2 N", "366 N"], right: 1,
      l1: "Tricky one. At the top, the seat and gravity point opposite ways, and the net force points down. So which one has to be bigger? You can get it.",
      ok: "Right. Weight minus the seat's push is what turns her toward the center." },
    { code: "PHYS_KE2", title: "Kinetic energy of a cart",
      body: `<p>A 2.0 kg cart rolls along a flat track at 3.0 m/s.</p><p class="q-ask"><b>What is its kinetic energy?</b></p>`,
      ch: ["3.0 J", "6.0 J", "9.0 J", "18 J"], right: 2,
      l1: "This one trips most people: the ½ in ½mv² is easy to drop, and so is the square. Square the speed first. You can get it.",
      ok: "Right. You squared the speed before you halved. That's the move on the exam.", joke: "QUACK. The ½ is tiny, but it bites." },
    { code: "PHYS_OR3", title: "Two satellites, two speeds",
      body: `<p>Satellite A circles Earth at an altitude of one Earth radius, R<sub>E</sub>. Satellite B circles at an altitude of 3R<sub>E</sub>.</p>
        <p class="q-ask"><b>What is the ratio of their orbital speeds, v<sub>B</sub> / v<sub>A</sub>?</b></p>`,
      ch: ["0.500", "0.707", "0.577", "1.41"], right: 1,
      l1: "Tricky one, and it trips most people: an orbit's radius is measured from Earth's center, not from the ground. You can get it.",
      ok: "Right. You measured both radii from Earth's center." }
  ];
  const MAX = 2;
  const st = Q.map(() => ({ sel: -1, tries: 0, mine: [], done: "" }));   // done: "" | "right" | "out"
  let cur = 0;

  /* ---------- variants (round 2: design/plans/NAV-MOBILE.md §7) ----------
     check: where she confirms a pick (bar = the one thumb button, card = a full-width button under the choices, row = a labeled
     "Check" in the picked row); next: phone / desktop place of the one Next; bottom: the bar sits at the bottom on desktop too;
     panel: the result slides up above the bar (v6) or replaces it (v5) */
  const VAR = {
    1: { name: "1 · Thumb button, card on desktop", cfg: { check: ["bar", "card"], next: ["bar", "card"], bottom: false },
      lead: "Phone: v4's one button in the bar (Skip, Check, Next). Desktop keeps its top bar; Check and Next sit under the choices and stick to the bottom of the window, so they never fall below the fold.",
      why: "Each screen gets its native place: the thumb spot on a phone, the end of the content on a desktop. One button, same words, same blue.",
      risk: "The two screens use two different places, so unity rests on the words alone. On desktop the sticky Check floats over the last choices while you scroll up to them.",
      desk: "Top bar: Questions, Notes, Back, Skip. Check / Next: under the choices, full column width, stuck to the window bottom." },
    2: { name: "2 · Next shelf", cfg: { check: ["row", "row"], next: ["shelf", "card"], bottom: false },
      lead: "A full-width Next question slides onto a shelf above the bar. The picked row says Check in words. The bar's Skip hides while a pick or the shelf is up.",
      why: "The biggest target on the screen, right where the thumb rests. One forward button at a time.",
      risk: "Two layers at the bottom take ~140 px of a 659 px Safari view while the shelf shows. Check is in the row, Next at the bottom: two places.",
      desk: "The same full-width Next under the feedback, stuck to the window bottom; top bar keeps Questions, Notes, Back." },
    3: { name: "3 · Check and Next in the card", cfg: { check: ["card", "card"], next: ["card", "card"], bottom: false },
      lead: "After a pick, a full-width Check appears under the choices, and the same button turns into Next. It sticks to the bottom of the screen when the question is long.",
      why: "Eyes and thumb stay on the answer; Check and Next are one button in one place, on both screens. No row arrow, no second forward.",
      risk: "On a phone, the card button stacks over the bar (two layers); while picking it can sit over the lower choices until you scroll.",
      desk: "Identical: the full-width card button, stuck to the window bottom; the top bar has no forward button while it shows." },
    4: { name: "4 · One thumb button", cfg: { check: ["bar", "bar"], next: ["bar", "bar"], bottom: true },
      lead: "One bar at the bottom, on the phone AND on desktop. Its right button says what it does: Skip (quiet), Check (after a pick), Next (after right or out of tries).",
      why: "Round 1 winner (median 85), now the same on desktop: the bar and its button are pinned to the bottom of the window, so nothing is ever below the fold.",
      risk: "On a wide desktop the button is far right of the choices (the bar spans the content column, so it lines up with the choices' right edge). A word changing under the thumb invites a double tap (400 ms guard).",
      desk: "The same bar, the same buttons, pinned to the bottom of the content column." },
    5: { name: "5 · Result footer", cfg: { check: ["row", "row"], next: ["foot", "foot"], bottom: true, foot: true },
      lead: "The picked row says Check in words. After a check, the bar turns into a footer with the one line about her answer and the way on: Next question, or Ask Cluck + Skip for now.",
      why: "Verdict and action in one place, at the thumb (Duolingo's habit). Now the same footer on desktop, pinned to the bottom of the column.",
      risk: "Check is in the row, the result at the bottom: the eye jumps once. The footer is tall; Prev and the list hide until the next question.",
      desk: "The same footer, the same words, pinned to the bottom of the content column." },
    6: { name: "6 · Thumb button + result panel", cfg: { check: ["bar", "bar"], next: ["bar", "bar"], bottom: true, panel: true },
      lead: "v4's one button, plus v5's result: after Check, a panel slides up above the bar with the line about her answer, and the same button (same spot) turns into Next.",
      why: "The verdict lands right above the thumb, and the action never moves: Skip → Check → Next in one spot. The same on desktop.",
      risk: "The panel takes ~120 px over the page bottom while it shows (the choices are scrolled above it). Two things to read at the bottom on a short phone.",
      desk: "The same bar and panel, pinned to the bottom of the content column." },
    7: { name: "7 · Floating Next", cfg: { check: ["row", "row"], next: ["fab", "fab"], bottom: false },
      lead: "The picked row says Check in words. Once she is done, Next floats in the thumb zone. The bar hides on scroll down only while nothing is waiting; it never hides after a wrong pick.",
      why: "The most room for a long stem; Next depends on the answer, not on a gesture.",
      risk: "A float near content (we reserve room under the page). The bar still hides while reading, so Back / Questions need a scroll up.",
      desk: "No hiding: a sticky top bar; the floating Next sits at the bottom right of the column." }
  };
  const C = VAR[V].cfg;
  const phoneMQ = matchMedia("(max-width: 700px), (pointer: coarse)");
  const phone = () => phoneMQ.matches;
  const pick2 = a => a[phone() ? 0 : 1];
  const bottomBar = () => phone() || C.bottom;

  /* the one action button: Skip / Check (bar and card variants) / Next */
  const nx = document.createElement("button");
  nx.type = "button"; nx.className = "btn btn-go btn-label nx"; nx.id = "nx";
  nx.innerHTML = `<span class="nx-tx">Next</span>${icon("i-next")}`;
  let nxReadyAt = 0;
  const SLOTS = { bar: "#slotBar", card: "#slotCard", shelf: "#shelf", foot: "#foot", fab: "#slotFab" };

  /* ---------- render ---------- */
  function render(jump) {
    const q = Q[cur];
    $("#pcode").textContent = `Question ${cur + 1}: ${q.title}`;
    $("#blocks").innerHTML = q.body;
    const row = pick2(C.check) === "row";
    $("#q").innerHTML = `<div class="choices" role="radiogroup" aria-label="Choices">${q.ch.map((c, i) => `
      <div class="ch"><button type="button" class="opt" role="radio" aria-checked="false" data-i="${i}" aria-label="${LET[i]}: ${c}"><span class="badge" aria-hidden="true">${LET[i]}</span><span class="txt">${c}</span></button>
      ${row ? `<button type="button" class="btn btn-go btn-label send" data-i="${i}" aria-label="Check ${LET[i]}" hidden>${icon("i-ok")}<span>Check</span></button>` : ""}</div>`).join("")}</div>`;
    root.classList.toggle("rowchk", row);
    $("#q").querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => pick(+b.dataset.i)));
    $("#q").querySelectorAll(".send").forEach(b => b.addEventListener("click", () => check(+b.dataset.i)));
    paint();
    listRows();
    if (jump) scrollTo({ top: 0, behavior: "auto" });
  }

  const pips = s => `<span class="pips" aria-hidden="true">${Array.from({ length: MAX }, (_, k) => `<i class="${k < s.tries ? "used" : ""}"></i>`).join("")}</span>`;
  const triesTx = n => `Pick again. ${n === 1 ? "1 more try." : n + " more tries."}`;

  function paint() {
    const q = Q[cur], s = st[cur], done = !!s.done, q0 = $("#q"), left = MAX - s.tries;
    q0.classList.toggle("closed", done);
    q0.querySelectorAll(".opt").forEach((o, i) => {
      const mine = s.mine.includes(i), right = done && i === q.right;
      o.classList.toggle("mine", mine && !right);
      o.classList.toggle("right", right);
      o.setAttribute("aria-checked", String(!done && s.sel === i));
      o.disabled = done || mine;
      o.querySelector(".badge").innerHTML = right ? icon("i-ok") : LET[i];
      const send = o.parentElement.querySelector(".send"); if (send) send.hidden = done || s.sel !== i;
    });
    /* the result: in the card, or (v5, v6) at the bottom */
    const atBottom = !!(C.foot || C.panel) && (done || s.mine.length > 0);
    let fb = "";
    if (s.done === "right") fb = `<p class="verdict ok">${icon("i-ok")}<span>Right.</span></p><p class="nm-line">${q.ok.replace(/^Right\. /, "")}</p>${q.joke ? `<p class="nm-joke">${q.joke}</p>` : ""}`;
    else if (s.done === "out") fb = `<p class="nm-out">Out of tries for now. This one comes back around.</p><p class="nm-line">The right one is ${LET[q.right]}, ${q.ch[q.right]}.</p>`;
    else if (s.mine.length) fb = `<div class="cluck nm-cluck">${icon("i-duck")}<div><p class="nm-line">${q.l1}</p>
        <p class="nm-tries">${pips(s)}${triesTx(left)}</p>
        <button type="button" class="btn btn-label nm-ask" data-ask>${icon("i-chat")}<span>Ask Cluck</span></button></div></div>`;
    $("#fb").innerHTML = atBottom ? "" : fb;
    const foot = $("#foot");
    foot.hidden = !atBottom;
    root.classList.toggle("foot-on", atBottom && !!C.foot);
    root.classList.toggle("panel-on", atBottom && !!C.panel);
    if (atBottom) {
      const wrongRow = `<div class="foot-row"><span class="nm-tries">${pips(s)}${triesTx(left)}</span><span class="foot-acts"><button type="button" class="btn btn-label foot-ask" data-ask>${icon("i-chat")}<span>Ask Cluck</span></button>${C.foot ? `<button type="button" class="btn btn-label foot-skip" id="footSkip">Skip for now</button>` : ""}</span></div>`;
      foot.innerHTML = s.done === "right" ? `<p class="verdict ok">${icon("i-ok")}<span>${q.ok}</span></p>`
        : s.done === "out" ? `<p class="nm-out">Out of tries for now. This one comes back around.</p><p class="nm-line nm-sm">The right one is ${LET[q.right]}, ${q.ch[q.right]}.</p>`
        : `<p class="nm-line nm-sm">${q.l1}</p>${wrongRow}`;
      const fs = $("#footSkip"); if (fs) fs.addEventListener("click", () => go(1));
    }
    document.querySelectorAll("[data-ask]").forEach(b => b.addEventListener("click", () => sheet(true)));
    /* the action button */
    const was = nx.parentElement, chk = pick2(C.check), picked = s.sel >= 0 && !s.mine.includes(s.sel);
    let mode = "", where = pick2(C.next);
    if (done) mode = "next";
    else if (chk === "bar") { mode = picked ? "check" : "skip"; where = "bar"; }
    else if (chk === "card" && picked) { mode = "check"; where = "card"; }
    nx.dataset.mode = mode;
    nx.classList.toggle("btn-go", mode === "next" || mode === "check");
    nx.classList.toggle("quiet", mode === "skip");
    nx.querySelector(".nx-tx").textContent = mode === "check" ? "Check" : mode === "skip" ? "Skip" : (where === "shelf" || where === "foot" || where === "card") ? "Next question" : "Next";
    nx.querySelector("use").setAttribute("href", mode === "check" ? "#i-ok" : "#i-next");
    nx.classList.toggle("ico-first", mode === "check");
    nx.setAttribute("aria-label", mode === "check" ? `Check ${LET[s.sel]}` : mode === "skip" ? "Skip this one" : "Next question");
    if (mode) {
      const slot = $(SLOTS[where]);
      if (was !== slot) { slot.append(nx); if (mode !== "skip") arrive(mode); }
      else if (nx.dataset.last !== mode && mode !== "skip") arrive(mode);
    } else nx.remove();
    nx.dataset.last = mode;
    root.classList.toggle("is-done", done);
    root.classList.toggle("nx-bar", !!mode && nx.parentElement === $("#slotBar"));
    /* one forward at a time: the bar's Skip hides while a pick waits, and while any Next shows */
    $("#skipBtn").hidden = done || picked || nx.parentElement === $("#slotBar");
    $("#slotCard").classList.toggle("stick", nx.parentElement === $("#slotCard"));
    $("#fab").hidden = !(where === "fab" && done);
    /* the Cluck sheet carries its own Next when the card button is under it */
    const sn = $("#slotSheet"); sn.innerHTML = "";
    if (done && !$("#sheet").hidden && nx.parentElement === $("#slotCard")) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-go btn-label nx"; b.innerHTML = `<span>Next question</span>${icon("i-next")}`;
      b.addEventListener("click", () => { sheet(false); go(1); }); sn.append(b);
    }
    $("#sheetRetry").hidden = done;
    $("#prevBtn").disabled = cur === 0;
    $("#sheetLine").textContent = done ? (s.done === "right" ? q.ok : "Out of tries for now. This one comes back around.") : q.l1;
    if (V === 7 && (done || s.mine.length)) root.classList.remove("nb-away");
    measure();
  }

  function arrive() {
    nxReadyAt = performance.now() + 400;          // a word that changes under the thumb never takes the same tap twice
    nx.classList.remove("in"); void nx.offsetWidth; if (!RM) nx.classList.add("in");
  }

  /* after a check: show the result, scrolling as little as needed and never past the question's own ask line,
     so the question stays on screen (round 1: "the page scrolls and cuts off the question") */
  function reveal() {
    const ask = $("#blocks .q-ask"), fbEl = $("#foot").hidden ? ($("#slotCard").firstChild || $("#fb")) : $("#q");
    if (!fbEl || !fbEl.getBoundingClientRect) return;
    const h = parseFloat(getComputedStyle(root).getPropertyValue("--nb-h")) || 0;
    const room = innerHeight - h - 12, b = fbEl.getBoundingClientRect().bottom;
    if (b <= room) return;
    let dy = b - room;
    if (ask) dy = Math.min(dy, ask.getBoundingClientRect().top - 12);
    if (dy > 0) scrollBy({ top: dy, behavior: RM ? "auto" : "smooth" });
  }

  /* ---------- actions ---------- */
  function pick(i) {
    const s = st[cur]; if (s.done || s.mine.includes(i)) return;
    s.sel = s.sel === i ? -1 : i;
    paint();
    /* a card Check that sticks to the window bottom must never sit on the row she just picked: lift the page by the overlap */
    requestAnimationFrame(() => {
      const sc = $("#slotCard"); if (!sc.classList.contains("stick") || s.sel < 0) return;
      const o = $("#q").querySelectorAll(".opt")[s.sel].getBoundingClientRect(), t = sc.getBoundingClientRect().top;
      if (o.bottom > t - 8) scrollBy({ top: o.bottom - t + 8, behavior: RM ? "auto" : "smooth" });
    });
  }
  function check(i) {
    const q = Q[cur], s = st[cur]; if (s.done || i < 0) return;
    s.tries++;
    if (i === q.right) { s.done = "right"; s.sel = -1; }
    else { s.mine.push(i); s.sel = -1; if (s.tries >= MAX) s.done = "out"; }
    paint();
    requestAnimationFrame(reveal);
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
    if (performance.now() < nxReadyAt) return;
    if (m === "check") return check(st[cur].sel);
    go(1);
  });
  $("#prevBtn").addEventListener("click", () => { if (cur > 0) { sheet(false); list(false); cur--; render(true); } });
  $("#skipBtn").addEventListener("click", () => go(1));
  $("#notesBtn").addEventListener("click", () => { $("#mtag").textContent = "Notes would open here (the pad page). Not part of this mock."; });

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

  /* ---------- v7: the bar hides on scroll down only while nothing waits on it (never after a wrong pick or once done) ---------- */
  let lastY = scrollY;
  addEventListener("scroll", () => {
    if (V !== 7 || !phone()) return;
    const y = scrollY, dy = y - lastY, s = st[cur]; lastY = y;
    if (Math.abs(dy) < 6) return;
    const calm = !s.done && !s.mine.length && s.sel < 0;
    root.classList.toggle("nb-away", calm && dy > 0 && y > 40 && $("#qlist").hidden);
  }, { passive: true });

  /* ---------- the bar's height: room under the page; the sheet, the card button and the FAB sit above it ---------- */
  function measure() {
    root.classList.toggle("bb", bottomBar());
    const w = $("#nbwrap"), h = bottomBar() && !root.classList.contains("kbup") ? w.offsetHeight : 0;
    root.style.setProperty("--nb-h", h + "px");
    root.style.setProperty("--kb-h", root.classList.contains("kbup") ? $("#kb").offsetHeight + "px" : "0px");
  }
  new ResizeObserver(measure).observe($("#nbwrap"));
  const onMQ = () => { root.classList.toggle("ph", phone()); render(false); };
  if (phoneMQ.addEventListener) phoneMQ.addEventListener("change", onMQ);
  root.classList.toggle("ph", phone());
  root.classList.toggle("bb", bottomBar());

  /* ---------- mockup chrome ---------- */
  const vv = VAR[V];
  $("#mtag").textContent = `Mock · ${vv.name}`;
  $("#vname").textContent = vv.name;
  $("#vlead").textContent = vv.lead;
  $("#vwhy").innerHTML = `<dt>Why</dt><dd>${vv.why}</dd><dt>Risk</dt><dd>${vv.risk}</dd><dt>Desktop</dt><dd>${vv.desk}</dd>`;
  $("#segV").innerHTML = Object.keys(VAR).map(k => `<button type="button" data-v="${k}" aria-pressed="${+k === V}" aria-label="Variant ${VAR[k].name}">${k}</button>`).join("");
  $("#segV").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const q = new URLSearchParams(location.search); q.set("v", b.dataset.v); q.delete("state"); location.search = q.toString(); });
  const STATES = [["q", "Start"], ["picked", "Picked"], ["wrong", "Wrong"], ["right", "Right"], ["out", "Out of tries"]];
  $("#segS").innerHTML = STATES.map(([k, l]) => `<button type="button" data-s="${k}">${l}</button>`).join("");
  $("#segS").addEventListener("click", e => { const b = e.target.closest("button"); if (b) jumpTo(b.dataset.s, true); });

  function jumpTo(state, scroll) {
    const q = Q[cur]; st[cur] = { sel: -1, tries: 0, mine: [], done: "" };
    const wrong = q.ch.findIndex((_, i) => i !== q.right);
    if (state === "picked") st[cur].sel = q.right;
    if (state === "wrong" || state === "out") check(wrong);
    if (state === "out") { const w2 = q.ch.findIndex((_, i) => i !== q.right && i !== wrong); check(w2); }
    if (state === "right") check(q.right);
    paint();
    if (scroll) $("#q").scrollIntoView({ block: "center", behavior: "auto" });
  }

  /* feedback box + Copy all: NAVM;v=..;vp=..;q=..;state=..;note=.. */
  const ta = $("#note");
  const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
  ta.addEventListener("input", grow);
  $("#copyAll").addEventListener("click", async () => {
    const s = st[cur], state = s.done || (s.mine.length ? "wrong" : s.sel >= 0 ? "picked" : "q");
    const line = `NAVM;r=2;v=${V};vp=${phone() ? "phone" : "desk"};q=${cur + 1};state=${state}${RM ? ";rm=1" : ""};note=${ta.value.replace(/\s+/g, " ").trim()}`;
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
