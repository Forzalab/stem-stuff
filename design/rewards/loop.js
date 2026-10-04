/* loop.js: the question loop every rewards page shares (v2 + the v3 variants). Plain script, after engine.js and fx.js.
   DOM contract (ids): #hud #dock (engine HUD), #board #qn #kind #tries #q #opts #go #hint, optional #prog (session bar),
   #bulb + #twin (worked twin: spec v2 1b; opening it before answering = peek = 2 XP, no roll).
   Choice buttons: .opt > .l (letter) .v (value) .b (✓/✗ badge). States: aria-checked, .right, .wrong, .reveal.
   The board and <body> carry data-kind="snack|real" for themes. */
(() => {
  const $ = s => document.querySelector(s), L = "abcde", SESSION = 10;
  const R = window.Rewards, FX = window.FX || {};
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = xs => { for (let i = xs.length - 1; i > 0; i--) { const j = ri(0, i); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>'
  };

  /* a question: snack = one-digit sum, real = two-digit + one-digit. Distractors = real slips: off by one, product, digits glued. */
  function make(kind, first) {
    let a, b;
    if (first) [a, b] = [1, 1];
    else if (kind === "snack") [a, b] = [ri(1, 9), ri(1, 9)];
    else [a, b] = [ri(12, 49), ri(3, 9)];
    const ans = a + b, set = new Set([ans]);
    for (const d of [ans + 1, ans - 1, a * b, +("" + a + b), ans + 10, ans - 10, ans + 2]) if (set.size < 5 && d >= 0) set.add(d);
    return { kind, a, b, text: `${a} + ${b} = ?`, ans, choices: shuffle([...set]), twin: twin(kind, a, b) };
  }
  /* worked twin: same shape, other numbers, every step shown (worked-example effect, spec v2 1c) */
  function twin(kind, a, b) {
    if (kind === "snack" || a < 10) {
      const x = a === 1 && b === 1 ? 2 : ri(1, 8), y = ri(1, 9 - Math.min(x, 8)) || 1;
      return [`${x} + ${y} = ?`, `Start at ${x}. Count up ${y}.`, `${x} + ${y} = ${x + y}`];
    }
    let x = ri(12, 49), y = ri(3, 9); if (x === a) x++;
    const o = (x % 10) + y, carry = o >= 10;
    return [`${x} + ${y} = ?`, `Ones: ${x % 10} + ${y} = ${o}${carry ? ` → write ${o - 10}, carry 1` : ""}`,
      `Tens: ${Math.floor(x / 10)}${carry ? " + 1" : ""} = ${Math.floor(x / 10) + (carry ? 1 : 0)}`, `${x} + ${y} = ${x + y}`];
  }

  let n = 0, cur = null, pick = null, tries = 0, shown = 0, busy = false, nextT = 0, peeked = false;
  const past = [];                                     // this session: "real" | "snack" | "miss"
  function open() {
    clearTimeout(nextT); nextT = 0;
    const kind = n === 0 ? "real" : R ? R.nextKind() : "real";
    cur = make(kind, n === 0); n++; pick = null; tries = 0; busy = false; peeked = false; shown = Date.now();
    $("#qn").textContent = `Q${n}`;
    const k = $("#kind"); k.textContent = kind === "snack" ? "SNACK" : "REAL"; k.className = `chip ${kind}`;
    document.body.dataset.kind = $("#board").dataset.kind = kind;
    $("#q").textContent = cur.text; $("#hint").textContent = "";
    $("#opts").innerHTML = cur.choices.map((c, i) =>
      `<button class="opt" type="button" role="radio" aria-checked="false" data-v="${c}"><span class="l">${L[i]}</span><span class="v">${c}</span><span class="b"></span></button>`).join("");
    paintTries(); paintProg(); paintTwin(false); $("#go").disabled = true;
    const b = $("#board"); b.classList.remove("in"); void b.offsetWidth; b.classList.add("in");
  }
  const paintTries = () => { const t = $("#tries"); if (t) t.innerHTML = [0, 1].map(i => `<i class="${i < tries ? "used" : ""}"></i>`).join(""); };
  function paintProg() {
    const p = $("#prog"); if (!p) return;
    const at = past.length % SESSION;                  // a new round starts every 10 answers
    p.innerHTML = Array.from({ length: SESSION }, (_, i) =>
      `<i class="${i < at ? past[past.length - at + i] : i === at ? "now" : ""}"></i>`).join("");
    p.setAttribute("aria-label", `Question ${at + 1} of ${SESSION} in this round`);
  }
  function paintTwin(openIt) {
    const w = $("#twin"), bulb = $("#bulb"); if (!w) return;
    w.hidden = !openIt;
    if (openIt) w.innerHTML = `<p class="twin-h">Worked twin</p>${cur.twin.map((l, i) => `<p class="twin-l${i === cur.twin.length - 1 ? " last" : ""}">${l}</p>`).join("")}<p class="twin-note">Peeked: this one pays 2 XP.</p>`;
    if (bulb) { bulb.setAttribute("aria-expanded", openIt); const c = bulb.querySelector(".n"); if (c) c.textContent = peeked ? "0" : "1"; }
  }

  $("#opts").addEventListener("click", e => {
    const o = e.target.closest(".opt"); if (!o || o.disabled || busy) return;
    for (const x of document.querySelectorAll(".opt")) x.setAttribute("aria-checked", x === o);
    pick = o; $("#go").disabled = false;
  });
  $("#bulb")?.addEventListener("click", () => {
    if (!cur) return;
    const w = $("#twin"), opening = w.hidden;
    if (opening && tries === 0 && !busy) peeked = true;   // a look after the answer is free
    paintTwin(opening);
  });

  async function check() {
    if (!pick || busy) return;
    busy = true; $("#go").disabled = true;
    const ok = +pick.dataset.v === cur.ans, firstTry = tries === 0, el = pick, snack = cur.kind === "snack";
    tries++; paintTries();
    if (!ok) {                                   // quiet: no sound, no shake, no shame text
      el.classList.add("wrong"); el.disabled = true; el.setAttribute("aria-checked", "false"); pick = null;
      el.querySelector(".b").innerHTML = ICON.x; el.setAttribute("aria-label", `${el.textContent.trim()}, wrong`);
      R && R.answer({ correct: false, firstTry, snack, peeked, dwellMs: Date.now() - shown });
      R && R.render(0);
      if (tries < 2) { $("#hint").textContent = "One more try."; busy = false; return; }
      past.push("miss");
      const r = [...document.querySelectorAll(".opt")].find(x => +x.dataset.v === cur.ans); r && r.classList.add("reveal");
      $("#hint").textContent = `It was ${cur.ans}. Next one.`;
      return later(1600);
    }
    el.classList.add("right"); el.querySelector(".b").innerHTML = ICON.ok;
    past.push(firstTry ? (snack ? "snack" : "real") : "miss");
    FX.pop && FX.pop(el);
    FX.sparks && FX.sparks(el, snack ? "small" : "medium");
    const r = R ? R.answer({ correct: true, firstTry, snack, peeked, dwellMs: Date.now() - shown }) : { xp: 0 };
    if (r.xp && FX.coinFly) FX.coinFly(el, $("#coinPill"), Math.min(8, Math.max(2, Math.round(r.xp / 2))));
    R && setTimeout(() => R.render(r.xp), 450);
    $("#hint").textContent = r.xp ? `+${r.xp} XP` : "Correct. No XP on try 2.";
    await reveal(r);
    later(r.drop || r.levelUp ? 500 : 1200);
  }
  async function reveal(r) {
    if (r.drop && FX.slots) await FX.slots(r.drop);
    if (r.burst && FX.burst) {
      const opt = r.burst === "levelup" ? { title: "LEVEL UP", sub: `LEVEL ${r.level}` }
        : r.burst === "legend" ? { title: r.line, sub: "+50 XP" } : { title: "BONUS LEVEL", sub: r.sub || r.line };
      await FX.burst(r.burst, opt);
    }
    if (r.toast && FX.toast) FX.toast(r.line, r.sub || r.streakNote);
    else if (!r.drop && r.streakNote && FX.toast) FX.toast(r.streakNote);
  }
  function later(ms) { $("#hint").textContent += "  (tap to skip)"; nextT = setTimeout(open, ms); }

  $("#go").addEventListener("click", check);
  $("#hint").addEventListener("click", () => { if (nextT && busy) open(); });
  $("#board").addEventListener("click", e => { if (busy && nextT && !e.target.closest("#bulb, #twin")) open(); });

  R && R.mountHUD($("#hud"), $("#dock"));
  R && R.render(0);
  open();
})();
