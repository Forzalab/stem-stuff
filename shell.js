/* split-app.mjs (W152): part 3 of 3 of the drill page; index.html runs app.js, cluck.js, shell.js in that order. A name from an earlier part: import it. A name from a later part, or a write to another part's let: bridge.<name>, defined by its own part at its top; never declare a local named bridge. tests/split-gate.test.mjs lints it. */
import { markNums } from "./chg.mjs";
import { build, stringify } from "./copy/payload.mjs";
import { modeOf } from "./mode.mjs";
import { $, S, bank, bridge, check, dock, drawFigures, esc, fitChoices, fromHash, hashCode, hideToast, icon, inflight, isProof, mainEl, maxTries, md, noteAt, obToast, off, oneBox, openBank, opts, partEls, proofTyping, retryLoad, root, say, select, snackChg, src, toast } from "./app.js";
import { clBackSync, clEl, clGoneSet, clPerm, clPlace } from "./cluck.js";
Object.defineProperties(bridge, {   // read (or set) from another part as bridge.<name> (split-app.mjs)
  FXL: { get: () => FXL, enumerable: true },
  applyMT: { get: () => applyMT, enumerable: true },
  barOpen: { get: () => barOpen, enumerable: true },
  closeMT: { get: () => closeMT, enumerable: true },
  copyText: { get: () => copyText, enumerable: true },
  dockMQ: { get: () => dockMQ, enumerable: true },
  dockRoom: { get: () => dockRoom, enumerable: true },
  editing: { get: () => editing, enumerable: true },
  fabPlace: { get: () => fabPlace, enumerable: true },
  layoutDock: { get: () => layoutDock, enumerable: true },
  layoutFreeze: { get: () => layoutFreeze, enumerable: true },
  mathCopyBtn: { get: () => mathCopyBtn, enumerable: true },
  mountBox: { get: () => mountBox, enumerable: true },
  origEl: { get: () => origEl, enumerable: true },   // let
  origPeeked: { get: () => origPeeked, enumerable: true },
  origRender: { get: () => origRender, enumerable: true },
  padPeekText: { get: () => padPeekText, enumerable: true },
  padRule: { get: () => padRule, enumerable: true },
  reduceMQ: { get: () => reduceMQ, enumerable: true },
  rewardMulti: { get: () => rewardMulti, enumerable: true },
  rewardTry: { get: () => rewardTry, enumerable: true },
  rwRedoTip: { get: () => rwRedoTip, enumerable: true },
  rwSync: { get: () => rwSync, enumerable: true },
  setSwap: { get: () => setSwap, enumerable: true },
  setTile: { get: () => setTile, enumerable: true },
  sideMQ: { get: () => sideMQ, enumerable: true },
});
/* ---------- sugar rewards (docs/design/REWARDS-WIRING.md; rewards/engine.js + rewards/fx.js) ----------
   Sugar only, and only on questions with a saccharine layer (the brainrot corner's gate): diet and plain questions never get a HUD node,
   an FX node or a stem-rw key. rewardGo() is the one funnel: every correct pays with the bells (XP, maybe a drop); a wrong try pays a
   quiet +1 (a small "+1" by the coin, no sound, no words: Cluck and the "one more try" toast own a wrong answer). State per bank. */
const RW = () => window.Rewards || null, FXL = () => window.FX || {};
const rewardOn = () => modeOf() === "sugar" && !!S && !!(S.prob.wish || S.prob.snack || S.prob.dead) && !!RW();
const rwKey = () => bank ? bank.code : off() && window.stemOffline.fileName ? "file:" + (window.stemOffline.fileName(S.code) || "") : "solo";
const rwTF = p => p.type === "mc" && maxTries(p) === 1 && (p.choices || []).length === 2;   // a True/False row: a coin flip pays less
window.stemSkipSnack = () => modeOf() === "sugar" && !!RW() && RW().on() && RW().skipSnack();   // nav.js: Next steps over a snack while cruising
let rwHud = null;
function rwSync() {
  const on = rewardOn();
  if (on) {
    RW().gap(bank ? bank.burstGap : undefined);        // T22: the bank's burst_gap_s (absent = the engine's 15 s)
    RW().use(rwKey());
    if (!rwHud) { rwHud = document.createElement("div"); rwHud.id = "rwHud"; $("#qlist").before(rwHud);
      RW().config({ toastAt: () => ($("#fb")?.textContent.trim() ? $("#fb") : $("#q")), toastClear: "#fb" });   // REVEAL-TRAY (Nov 3): never on the hint card (desktop's foot spot lay on it after a miss); Tony #38: the stage toast sits under the question (or its verdict line); desktop: bottom-left of its column (toast.js, img3)
      RW().mountHUD(rwHud); }
    else RW().render(0);
  }
  if (rwHud) rwHud.hidden = !on;
}
function rewardTry(a, r) {
  if (!rewardOn() || (r.verdict !== "correct" && r.verdict !== "wrong")) return;
  if (r.verdict === "wrong" && window.stemRedo.has(S.code)) return;              // a redo round: no +1 farming on old misses
  const p = S.prob, multi = p.type === "multi";
  if (multi && r.verdict === "correct") return;                                 // a multi pays once every part is shut (rewardMulti)
  const firstTry = !S.tries.slice(0, -1).some(t => t.v === "wrong" && (!multi || t.part === a.part));
  rewardGo(S, { correct: r.verdict === "correct", firstTry, open: r.verdict === "wrong" && r.triesLeft > 0,
    reveal: r.verdict !== "correct" && r.correct != null });                    // T19: the answer was shown = 0 XP, still a miss
}
function rewardMulti(mine) {
  if (!rewardOn() || S !== mine || !S.solved) return;
  rewardGo(S, { correct: true, firstTry: !S.tries.some(t => t.v === "wrong") });
}
function rewardGo(mine, o) {
  const p = mine.prob;
  const res = RW().answer({ code: mine.code, correct: o.correct, firstTry: o.firstTry, reveal: !!o.reveal, snack: !!p.snack, dead: !!p.dead, tf: rwTF(p), peeked: !!mine.rwPeek,
    dwellMs: Date.now() - mine.start });
  if (o.correct && o.firstTry && p.snack && p.original) RW().origSolved(p.original.q);
  if (!o.correct && !o.open && !p.dead) setTimeout(() => rwTip("miss", $("#rwHud .rw-streak")), 1050);   // T37: a closed miss (often a T19 reveal, 0 XP); the count waits. Dead-easy has no count
  const back = o.correct && window.stemRedo.has(mine.code) && window.stemRedo.get().redeem !== false;   // a past miss (a Redeem), now right
  if (!res.xp) { RW().render(0); if (back) comeback(); return; }                 // a done code: the numbers change, nothing moves
  if (back) mine.rwBack = true;
  if (res.tick) { if (o.open) mine.rwHeld = (mine.rwHeld || 0) + res.xp; else rewardTick(res, mine); return; }   // a wrong try: +1 for trying, tiny;
  // with a try left it waits, unshown (Tony, Oct 5 clutter pass C12: nothing moves up there while the eye belongs on the hint)
  requestAnimationFrame(() => rewardShow(mine, res));                           // after finish() / feedback(): the right mark is on the page
}
/* ---------- the original beside a snack (spec 1b; docs/design/REWARDS-WIRING.md §4) ----------
   A snack (one constant swapped) shows its Practice Exam 2 original with the worked solution. Desktop (side by side): in the pad column,
   in the scratchpad's place while it is open. Phone: a card on top of the problem, folded until tapped. Fading per original question:
   level 1 (its first snack) the whole solution; 2 (a later snack) the last line behind "Peek"; 3 (after a first-try correct on one
   of its snacks) folded. Peeking (the hidden line, or opening a level 3 original) before answering pays 2 XP and rolls no drop. */
let origEl = null;
function origRender() {
  if (origEl) { origEl.remove(); origEl = null; }
  if (bridge.cl) { if (bridge.cl.open && bridge.cl.tab === "steps") bridge.clClose(); bridge.cl.el.querySelector("#clTabSP").innerHTML = ""; }
  const p = S && S.prob, o = p && p.original;
  if (modeOf() !== "sugar" || !p.snack || !o || !Array.isArray(o.body)) return;
  const R = RW(), live = !!R && R.on() && rewardOn(), lvl = live ? R.origLevel(o.q, S.code) : 1;
  if (live) R.origSeen(o.q, S.code);
  S.orig = { lvl, open: false, peeked: false };
  const el = origEl = document.createElement("section");
  el.id = "orig"; el.className = "orig"; el.setAttribute("aria-labelledby", "origHd");
  const sol = Array.isArray(o.solution) ? o.solution : [], C = snackChg();
  /* T1 (Tony, Oct 4, picked variant A "Free hint card"; Oct 5: two words, no tagline, "it looks and feels ai-ish/extraneous"): it read as a
     topic bar, so it is a filled casino button. FREE floats over its chevron corner, after the button in the DOM so it paints on top, only
     while opening it costs nothing (level 3 = folded after a solve: looking again before answering is a peek) */
  el.innerHTML = `<button type="button" class="orig-hd rw-skin rw-hint" id="origHd" aria-expanded="false" aria-controls="cluck">${HINT_BULB}<span class="rw-hint-tx"><span class="rw-hint-t">Compare with a similar solution</span><span class="sr-only">Practice Exam 2, question ${esc(o.q ?? "")}.</span></span><span class="rw-hint-chev" aria-hidden="true">${icon("i-down")}</span></button>${lvl < 3 ? '<span class="rw-skin rw-free" aria-hidden="true">FREE</span>' : ""}
    <div class="orig-body" id="origBody">${sol.length ? `<ol class="orig-sol">${sol.map((l, i) =>
      `<li${lvl === 2 && i === sol.length - 1 ? " hidden" : ""}><span>${md(markNums(l, C.olds), true)}</span></li>`).join("")}</ol>` : ""}${lvl === 2 && sol.length ? '<button type="button" class="btn btn-label orig-peek">Peek the last step (costs ~15XP)</button>' : ""}
    <p class="orig-h">The exam question</p><div class="orig-q"></div></div>`;   // steps first: the fun part in one look (Oct 5 review)
  const q = el.querySelector(".orig-q");
  for (const [i, b] of o.body.entries()) {
    if (b.type === "text") { const d = document.createElement("div"); d.className = "md"; d.innerHTML = md(C.orig[i]); q.append(d); }
    else if (b.type === "graph") { const f = document.createElement("div"); f.className = "fig"; f.setAttribute("role", "img"); f.setAttribute("aria-label", b.alt || "figure"); f._block = b; q.append(f); }
  }
  el.querySelector(".orig-hd").addEventListener("click", () => {
    if (!S.orig.open && S.orig.lvl === 3) origPeeked();                        // folded away: looking again is a peek
    origOpen(!S.orig.open);
  });
  el.querySelector(".rw-free")?.addEventListener("click", () => el.querySelector(".orig-hd").click());   // the sticker sits on the card's corner
  const body = el.querySelector(".orig-body");
  body.querySelector(".orig-peek")?.addEventListener("click", e => {
    body.querySelector(".orig-sol li[hidden]")?.removeAttribute("hidden"); e.currentTarget.remove(); origPeeked();
  });
  clEl().querySelector("#clTabSP").append(body);   // the solution reads in Cluck's sheet, "Similar steps" tab (so look it up via body, not el)
  origPlace();
  hintNudge(el.querySelector(".rw-hint"));
  if (sideMQ.matches && lvl < 3) bridge.clOpen("steps", "#origHd", true);           // desktop: the free steps open by default (Tony, Oct 5); folded (lvl 3) stays a peek
}
/* the card's one nudge: a 600 ms lift + one shine, once per browser session, a beat after it is fully on screen; never with reduced motion */
const HINT_BULB = `<span class="rw-hint-coin" aria-hidden="true"><svg viewBox="0 0 32 32"><defs><linearGradient id="hbA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#f5a623"/></linearGradient><linearGradient id="hbB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c3d6"/><stop offset="1" stop-color="#6f7c94"/></linearGradient></defs><path d="M16 3C10.5 3 6.5 7.2 6.5 12.3c0 3.3 1.7 5.6 3.4 7.4 1.1 1.2 1.6 2.4 1.6 3.6h9c0-1.2.5-2.4 1.6-3.6 1.7-1.8 3.4-4.1 3.4-7.4C25.5 7.2 21.5 3 16 3z" fill="url(#hbA)"/><path d="M12 9.5c.9-1.6 2.4-2.6 4.2-2.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/><path d="M13.3 23.3v-4.6l2.7 2.2 2.7-2.2v4.6" fill="none" stroke="#c77800" stroke-width="1.4" stroke-linejoin="round"/><rect x="11" y="23" width="10" height="3.2" rx="1.2" fill="url(#hbB)"/><rect x="11.8" y="26" width="8.4" height="2.6" rx="1.2" fill="#5b6780"/><rect x="13.8" y="28.3" width="4.4" height="1.7" rx=".8" fill="#3e4859"/></svg></span>`;
function hintNudge(btn) {
  let seen = false; try { seen = sessionStorage.getItem("stem-hint-nudged") === "1"; } catch { /* blocked: nudge once anyway */ }
  if (!btn || seen || reduceMQ.matches || !("IntersectionObserver" in window)) return;
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting) return; io.disconnect();
    setTimeout(() => { btn.classList.add("rw-nudge"); try { sessionStorage.setItem("stem-hint-nudged", "1"); } catch { /* */ } }, 1350);
  }, { threshold: 0.9 }).observe(btn);
}
function origPeeked() {
  if (S.finished || S.tries.length || S.orig.peeked) return;                    // a look after answering is free
  S.orig.peeked = S.rwPeek = true;
}
function origOpen(open) {
  if (!origEl) return;
  if (open) bridge.clOpen("steps", "#origHd"); else bridge.clClose();
}
function origPlace() {
  if (!origEl) return;
  const rot = $("#rot.docked");                                                    // desktop: the docked videos stay first in the notes column
  if (sideMQ.matches) { if (rot && rot.parentElement === $("#work")) rot.after(origEl); else $("#work").prepend(origEl); }
  else $("#freezeIn").prepend(origEl);
}
/* a wrong try's +1 (Tony, Oct 4: participation trophy): a small quiet "+1" by the HUD coin, the count ticks; no sparks, no sound, no words,
   so a right answer still feels much bigger (docs/design/REWARDS.md: a loss dressed up as a win) */
function rewardTick(res, mine) {
  const coin = $("#rwCoin"), fx = FXL(), n = res.xp + (mine.rwHeld || 0); mine.rwHeld = 0;
  if (fx.float && coin && rwHud && !rwHud.hidden) fx.float(coin, `+${n}`, "fx-float-sm");
  RW().render(n);
}
const rwSeen = el => { const r = el && rwHud && !rwHud.hidden ? el.getBoundingClientRect() : null; return !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
async function rewardShow(mine, res) {
  const fx = FXL();
  const at = $("#q .opt.right") || $("#ff.ok") || [...document.querySelectorAll("#q .part .ff.ok")].pop() || $("#q");
  fx.pop && fx.pop(at);                                                          // the bells on every correct: pop, sparks + confetti,
  fx.sparks && fx.sparks(at, mine.prob.snack || mine.prob.dead ? "small" : "medium");             // "+N XP" rising, coins to the HUD, a shine on the coin pill
  fx.float && fx.float(at, `+${res.xp} XP`);
  const coin = $("#rwCoin");
  rwHud?.classList.remove("rw-z-xp");                                            // C1: the 0 balance was hidden; the first reward brings it in, coins fly to it
  if (rwSeen(coin)) { fx.coinFly && fx.coinFly(at, coin, Math.min(8, Math.max(2, Math.round(res.xp / 2)))); fx.shine && fx.shine(coin); }
  const held = mine.rwHeld || 0; mine.rwHeld = 0;
  fx.hud ? fx.hud(() => RW().render(res.xp + held)) : setTimeout(() => RW().render(res.xp + held), 675);   // the +1s held back count up with it; fx.js: in the HUD step (one blink)
  say(`Correct! +${res.xp} XP.${res.levelUp ? ` Level ${res.level}.` : ""}${res.line ? " " + res.line : ""}${res.sub && res.sub !== "+50 XP" ? " " + res.sub : ""}`);
  if (!res.drop && res.burst !== "levelup" && !res.streakNote) { if (mine.rwBack) comeback(); else if (!mine.prob.dead) setTimeout(() => rwTip("right", $("#rwCoin")), 1050); return; }
  /* flow C (Tony, Oct 21): one beat per answer, at most one overlay. A level up is the only overlay, with the slot reels spinning inside
     it when the same answer dropped; any other drop (WIN / BONUS / LEGEND) or a streak note is the banner (LEGEND: gold + small confetti) */
  if (res.burst === "levelup" && fx.burst) {                                 // engine.js: a level up from a +1 or a dead-easy one stays quiet
    await fx.burst("levelup", { title: "LEVEL UP", sub: `LEVEL ${res.level}`, drop: res.drop || null });
    if (mine.rwBack) comeback();
    return;
  }
  const line = res.drop ? res.line : res.streakNote;
  if (mine.rwBack) comeback();                                                   // a right Redeem owns the one toast slot (G2c row 28); the streak still counts, say() read it
  else if (line === res.streakNote && res.streak === 3 && rwTip("three", $("#rwHud .rw-star"))) { /* T37: the onboarding line says "3 cracked" itself */ }
  else if (line && fx.toast) { hideToast(); fx.toast(line, res.drop ? res.sub || res.streakNote : null, res.drop || null); }
  else if (!mine.prob.dead) rwTip("right", $("#rwCoin"));
}
/* T37 sugar onboarding (Tony, Oct 15; brain chat-redesign-2026-10-13/sugar-onboard, V1 toast trail): the HUD explains itself the first
   time each piece matters, in the plain toast (STYLE.md §3) with its caret on that piece. Per device (stem-ob-rw-<beat> = times shown).
   The miss beat speaks 3 times: the plain line, then two humor lines (Tony: "as we got used to ui already"), then never again.
   It never stacks: a toast already up wins and the beat waits for the next time. A piece not on screen (C1: the count is hidden at 0)
   waits too, uncounted. */
const RW_OB = { right: ["Points always go up and never let you down."], three: ["THREE STREAK! See your progress here."],
  miss: ["Did an oopsie or two? Your progress is safe!", "Double whammy! That's OK, happens to the best of us.", "They say third time's the charm, QUACKK—"],   // copy: Tony, Oct 15 22:5x PT (his emoji left out: STYLE §4); lines 1 + 3 Tony #36, line 2 Tony, Oct 26
  redo: ["Gravity pulled you back for review."] };                                // Tony, Oct 19: say it the first time a miss comes back
/* the redo beat: a Redeem showing (a past miss back, the "Pity roll" tag) opens unanswered; caret on the tag. Before the first
   answer only, so it never meets the one-more-try note or the Comeback toast */
function rwRedoTip() {
  const r = window.stemRedo.get();
  if (S && !S.finished && !S.tries.length && r && r.redeem !== false && r.codes.includes(S.code)) rwTip("redo", $("#rtag"));
}
function rwTip(beat, at) {
  if (!rewardOn() || noteAt() || !rwSeen(at)) return false;
  const k = "stem-ob-rw-" + beat, lines = RW_OB[beat];
  try { const n = +localStorage.getItem(k) || 0; if (n >= lines.length) return false;
    if (!toast(lines[n], at, { x: true, allow: ".rot-link" })) return false;                         // HUD B (Tony, Oct 28): caret + an X. It may lie on the brainrot link for its 2 s (the Next note's exception: at 1280 the link sits right under the count). No place: next time, uncounted
    localStorage.setItem(k, n + 1);
    window.stemT?.("_ob", { beat, n: n + 1 }); return true; }                     // intent.js log only ("ob <beat> <n>"): Jev sees which note it just met
  catch { return false; }                                                        // blocked storage: no way to keep it once, so never
}

/* a redo round's right answer on a past miss: a toast, no XP (the code paid once already; nothing to farm) */
function comeback() {
  const fx = FXL();
  if (fx.toast) { hideToast(); fx.toast("HONK HONK. Spacetime just applauded.", "Energy bounced BACK, quack!"); }
  say("Comeback. Missed it before, got it now.");
}

/* ---------- scratchpad + Copy ---------- */
let mounted = null;      // the box mounted for the open problem; S is replaced on every load, so the old one is kept here
function mountBox() {
  if (mounted) { mounted.box.destroy(); mounted.corner.destroy(); }
  const field = $("#xbField"); field.querySelector("textarea")?.remove();
  const ta = document.createElement("textarea");
  Object.assign(ta, { rows: 4, spellcheck: true, placeholder: "Paste GPT answer here, but me be sad..." });
  ta.setAttribute("autocapitalize", "sentences"); ta.setAttribute("autocomplete", "off");
  ta.id = "scratch"; ta.setAttribute("aria-labelledby", "xbName");
  field.prepend(ta);
  /* C10 (Tony, Oct 5): Copy shows only when the box has text. Listened before reserveCorner's, so the corner sees the button as it is */
  const copyBtn = $("#copy"), syncCopy = () => { copyBtn.hidden = !ta.value; };
  ta.addEventListener("input", syncCopy); ta.addEventListener("xb-cap", syncCopy); syncCopy();
  /* the box stops growing at the bottom of the visible viewport (minus the bottom dock) and scrolls inside itself */
  S.box = ExplainBox.mount(ta, { bottomInset: dockRoom,
    cap: () => bridge.swapOn ? swapPadMax : mtCap });                                  // Swap: the room the peek leaves
  S.corner = ExplainBox.reserveCorner(ta, copyBtn);
  mounted = { box: S.box, corner: S.corner };
  /* typing at the end: keep the whole bottom band in view (browsers only scroll the caret itself in), so the caret stays clear of Copy
     and of where the revealed code bar lies */
  ta.addEventListener("input", () => { if (ta.selectionEnd === ta.value.length && ta.scrollHeight > ta.clientHeight) ta.scrollTop = ta.scrollHeight; });
  autosave(ta);
}
/* ---------- scratchpad autosave (archive/design/shots/autosave-*.png): draft per bank + code in localStorage.
   3 s after the last edit: "saving" (a light band sweeps through it), then "saved", gone after 2 s. Reduced motion: no sweep. */
const SAVE_IDLE = 3000, SAVE_SHOW = 700, SAVED_SHOW = 2000;
const padKey = code => "stem-pad:" + ((window.stemOffline && window.stemOffline.fileName && window.stemOffline.fileName(code)) || "server") + ":" + code;
function padGet(code) { try { return localStorage.getItem(padKey(code)) || ""; } catch { return ""; } }
function padPut(code, v) { try { if (v) localStorage.setItem(padKey(code), v); else localStorage.removeItem(padKey(code)); return true; } catch { return false; } }
let saveTimers = [], savePending = null;
function autosave(ta) {
  const st = $("#xbSave"), code = S.code;
  for (const t of saveTimers) clearTimeout(t);
  saveTimers = []; st.className = "xb-save"; st.textContent = "";
  const draft = padGet(code);
  if (draft) { ta.value = draft; ta.dispatchEvent(new Event("xb-refit")); ta.dispatchEvent(new Event("xb-cap")); }
  const flush = () => { if (savePending) { padPut(savePending.code, savePending.ta.value); savePending = null; } };
  flush();
  ta.addEventListener("input", () => {
    for (const t of saveTimers) clearTimeout(t);
    st.className = "xb-save"; st.textContent = "";
    savePending = { code, ta };
    saveTimers = [setTimeout(() => {
      flush();
      st.className = "xb-save saving"; st.textContent = "saving";
      saveTimers = [setTimeout(() => {
        st.className = "xb-save"; st.textContent = "saved";
        saveTimers = [setTimeout(() => { st.textContent = ""; }, SAVED_SHOW)];
      }, SAVE_SHOW)];
    }, SAVE_IDLE)];
  });
  autosave.flush = flush;
}
addEventListener("pagehide", () => autosave.flush && autosave.flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && autosave.flush) autosave.flush(); });
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  /* plain-http LAN (serve.py): no async clipboard, use a hidden textarea */
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.append(t); t.select(); t.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
  t.remove();
  return ok;
}
/* Copy: the notes, tries, hints and edit history as one payload; the notes stay (C10: Cut all is gone) */
async function copyPad() {
  if (!S) return;
  const b = $("#copy"), box = S.box;
  box.snapshot();
  /* a choice try's a is the choice's markdown: its $math$ goes out as texPlain, the same plain text a drag copies (todo 108). The notes stay as typed */
  const mdm = md => typeof md === "string" ? mdMathPlain(md) : md;
  const tries = S.tries.map(t => t.c == null ? t : { ...t, a: Array.isArray(t.a) ? t.a.map(mdm) : t.a?.tick ? { ...t.a, tick: t.a.tick.map(mdm) } : mdm(t.a) });
  const payload = stringify(build({ code: S.code, start: S.start, tries, hints: S.hints, explain: box.el.value, history: box.getHistory() }));
  const ok = await copyText(payload);
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed. Try again.");
  setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 1600);
}
$("#copy").addEventListener("click", copyPad);
/* a codeblock's Copy: the raw code (the line numbers are CSS, never text), then i-ok for 2 s. Capture: the tap does nothing else */
document.addEventListener("click", async e => {
  const b = e.target.closest?.(".cb-copy"); if (!b) return;
  e.stopPropagation();
  const ok = await copyText([...b.closest(".cb").querySelectorAll(".l")].map(l => l.textContent).join("\n"));
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed. Try again.");
  clearTimeout(b.doneT); b.doneT = setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 2000);
}, true);

/* ================= copy math as plain text (todo 108, Tony's answers: plan and-a-todo-list-dapper-yeti) =================
   KaTeX renders htmlAndMathml (screen readers; the MathML's annotation is the TeX source), so a drag over math copied both the hidden
   MathML text and the visible glyphs ("x2x^2"). One capture copy listener: a formula the selection touches is copied whole, as texPlain
   (nav.js) of its TeX, grader-exact; the words around it pass through as plain text, one line per block. A phone's long-press Copy fires
   the same event. A selection with no math is left to the browser. intent.js / flight.js keep logging the copy (they only read it). */
let texPlain = null;
import("./nav.js").then(m => { texPlain = m.texPlain; });             // nav.js is its own module script after this one: no import, so the order stays
const katexOf = n => (n && (n.nodeType === 1 ? n : n.parentElement))?.closest(".katex") || null;
const mathPlain = k => {
  const tex = k.querySelector('annotation[encoding="application/x-tex"]');
  return tex && texPlain ? texPlain(tex.textContent) : (k.querySelector(".katex-html") || k).textContent;
};
/* markdown's $..$ / $$..$$ to texPlain, the rest as written ("\$" is a literal dollar, the same cut as md()) */
const mdMathPlain = md => !texPlain ? md : md.replace(/\\\$/g, "\u0001").replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, a, b) => texPlain(a ?? b)).replace(/\u0001/g, "$");
function selPlain(r) {
  r = r.cloneRange();
  const ks = katexOf(r.startContainer), ke = katexOf(r.endContainer);
  if (ks && ks === ke) return mathPlain(ks);                          // inside one formula: the whole formula
  if (ks) r.setStartBefore(ks);                                       // half a formula: snap to all of it
  if (ke) r.setEndAfter(ke);
  let out = "";
  const visit = node => {
    if (!r.intersectsNode(node)) return;
    if (node.nodeType === 3) {
      const a = node === r.startContainer ? r.startOffset : 0, b = node === r.endContainer ? r.endOffset : node.data.length;
      const t = node.data.slice(a, b);
      out += /^pre/.test(getComputedStyle(node.parentElement).whiteSpace) ? t : t.replace(/\s+/g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.classList.contains("katex")) { out += mathPlain(node); return; }
    if (node.tagName === "BR") { out += "\n"; return; }
    const d = getComputedStyle(node).display;
    if (d === "none") return;
    const block = !/^inline/.test(d) && d !== "contents";
    if (block) out += "\n";
    node.childNodes.forEach(visit);
    if (block) out += "\n";
  };
  const top = r.commonAncestorContainer;
  if (top.nodeType === 3) visit(top); else top.childNodes.forEach(visit);
  return out.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n+/g, "\n").replace(/ {2,}/g, " ").trim();
}
function touchesMath(r) {
  if (katexOf(r.startContainer) || katexOf(r.endContainer)) return true;
  const top = r.commonAncestorContainer;
  return top.nodeType === 1 && [...top.querySelectorAll(".katex")].some(k => r.intersectsNode(k));
}
document.addEventListener("copy", e => {
  try {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) return;
    const rs = Array.from({ length: sel.rangeCount }, (_, n) => sel.getRangeAt(n));
    if (!rs.some(touchesMath)) return;                                // no math: the browser's own copy
    const text = rs.map(selPlain).join("\n");
    e.clipboardData.setData("text/plain", text);
    e.clipboardData.setData("text/html", esc(text).replace(/\n/g, "<br>"));   // a rich paste gets the same plain text, never the MathML again
    e.preventDefault();
  } catch (x) { console.error(x); }                                   // never break a copy: the browser's own then
}, true);
/* the tap-to-copy button on a formula card row and on a revealed answer: the same plain text a drag copies, then i-ok and a toast */
function mathCopyBtn(label, plainText) {
  return `<button type="button" class="mcopy" aria-label="${label}" title="${label}"${plainText != null ? ` data-copy="${esc(plainText)}"` : ""}>${icon("i-copy")}</button>`;   // COPY-PENDING: "Copy formula", "Copy answer"
}
document.addEventListener("click", async e => {
  const b = e.target.closest?.(".mcopy"); if (!b) return;
  e.stopPropagation();
  const k = b.parentElement.querySelector(".katex");
  const ok = await copyText(k ? mathPlain(k) : b.dataset.copy || "");
  b.classList.toggle("done", ok);
  b.querySelector("use").setAttribute("href", ok ? "#i-ok" : "#i-x");
  say(ok ? "Copied." : "Copy failed. Try again.");
  if (ok) toast("Copied", b, { loose: true });   // COPY-PENDING: "Copied". loose: the one note that may lie on a control (prod as before, orc v27 default): under a card row or the answer there always is one, so a strict note would never show
  clearTimeout(b.doneT); b.doneT = setTimeout(() => { b.classList.remove("done"); b.querySelector("use").setAttribute("href", "#i-copy"); }, 2000);
}, true);

/* ================= freeze layer (docs/design/FREEZE.md) =================
   .freeze is position: sticky. Its max height follows the *visual* viewport, so a tall problem becomes a strip
   with its own scroll instead of covering the scratchpad. On iOS Safari the keyboard does not shrink the layout
   viewport, and sticky/fixed stick to the layout viewport, so --kb-top moves the strip down by visualViewport.offsetTop. */
const freeze = $("#freeze"), freezeIn = $("#freezeIn"), more = $("#more"), sentinel = $("#sentinel");
let tallest = 0, lastW = 0;
const vv = window.visualViewport;
function editing() { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")); }
/* entry box: fixed bottom-centre on phones / touch (one thumb), top of the column on desktop (FREEZE.md) */
const dockMQ = matchMedia("(max-width: 700px), (pointer: coarse)");
const sideMQ = matchMedia("(min-width: 720px)");                       // multitask: problem | pad side by side from here up (docs/design/MULTITASK.md)
/* the room the bottom bar takes from the page: its full height, or the strip's while it rests as a strip (revealed, it lies over the page) */
const barTab = $("#barTab");
function dockRoom(evenAway) {
  if (!dock.getClientRects().length) return 0;                                  // hidden (a bank's list closed on a phone: app.css C8)
  if (!root.classList.contains("dock-bottom") || (!evenAway && root.classList.contains("dock-away"))) return 0;
  if (!root.classList.contains("bar-mini")) return dock.offsetHeight;
  if (!root.classList.contains("bar-open")) stripRoom = dock.offsetHeight || stripRoom;    // measured as a strip (incl. the safe-area inset); kept while revealed
  return stripRoom;
}
let stripRoom = 24;
function barOpen(open) {
  open = open && dockMQ.matches;                             // the phone / touch strip's state only: on desktop bar-open would park the docked corner (W101, LEAKS L1)
  root.classList.toggle("bar-open", open);
  if (open && root.classList.contains("bar-mini")) root.style.setProperty("--bar-over", Math.max(0, dock.offsetHeight - stripRoom) + "px");
  barTab.setAttribute("aria-expanded", open);
  barTab.setAttribute("aria-label", open ? "Hide code box" : "Show code box");
}
/* tap toggles; a swipe (20px+) up opens, down closes. The tab never takes focus: the scratchpad keeps its caret and keyboard */
function swipeTab(el, act) {
  let y0 = null, used = false;
  el.addEventListener("pointerdown", e => { e.preventDefault(); y0 = e.clientY; used = false; try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
  el.addEventListener("pointermove", e => { if (y0 === null || used) return; const dy = e.clientY - y0; if (Math.abs(dy) > 20) { used = true; act(dy < 0 ? "up" : "down"); } });
  el.addEventListener("pointerup", () => { y0 = null; });
  el.addEventListener("pointercancel", () => { y0 = null; });
  el.addEventListener("click", () => { if (!used) act("tap"); used = false; });
}
new MutationObserver(() => { if ($("#entryMsg").textContent || !retryLoad.hidden) barOpen(true); }).observe(dock, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });   // a message or Retry: shown
dock.addEventListener("focusin", e => { if (e.target !== barTab) barOpen(true); });   // keyboard / Tab into the code box: shown
swipeTab(barTab, d => barOpen(d === "tap" ? !root.classList.contains("bar-open") : d === "up"));
/* C7 (Tony, Oct 5 clutter pass): desktop, no bank: the label opens the code box; the box folds back once focus leaves it (a message keeps it) */
/* a press on the label must not move focus: the focusin it caused ran barOpen / layoutFreeze / fabSync between pointerdown and click, the layout shifted under the
   pointer and the click landed on <body> (G2c row 10: only the 2nd click worked). Same pattern as swapBtn: cancel the press, act on the click (keyboard focus is unchanged) */
for (const ev of ["pointerdown", "mousedown"]) $("#codeChip").addEventListener(ev, e => e.preventDefault());
$("#codeChip").addEventListener("click", () => { root.classList.add("entry-open"); const c = $("#code"); c.focus(); c.select(); });
$("#entry").addEventListener("focusout", e => {
  if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => { if (!$("#entry").contains(document.activeElement) && S) root.classList.remove("entry-open"); }, 0);
});
/* C8: phones, a bank open: the code bar shows only with the list (app.css), up and ready to type */
addEventListener("drill:qlist", e => { if (dockMQ.matches && root.classList.contains("bar-mini")) barOpen(e.detail.open); layoutDock(); });
function layoutDock() {
  const bottom = dockMQ.matches, h = vv ? vv.height : innerHeight;
  if (innerWidth !== lastW) { lastW = innerWidth; tallest = 0; }        // orientation / window change
  tallest = Math.max(tallest, innerHeight, h);
  root.classList.toggle("dock-bottom", bottom);
  const inDock = dock.contains(document.activeElement);
  const shrunk = bottom && !!tallest && h < tallest * 0.8;
  const kb = shrunk && editing();
  /* Swap (docs/design/SWAP.md): keyboard up + a field in <main> has focus. Once on, it stays on while focus is anywhere in <main>
     (its buttons too) and for a moment after focus is lost (the keyboard is still sliding away), until the viewport grows back. */
  const a = document.activeElement, inMain = !!a && a !== document.body && mainEl.contains(a);
  const grace = (!a || a === document.body) && performance.now() - bridge.lostAt < 500;
  const swapNext = !!S && !oneBox() && !freeze.hidden && shrunk && !bridge.mtOpen && !sideMQ.matches && ((inMain && (editing() || bridge.swapOn)) || (bridge.swapOn && grace));
  /* a short-answer item has no Swap (Tony, Nov 8): the keyboard leaves the page alone, so the field the student types in is scrolled into
     the area above the keyboard, like a plain page (the question stays above it, reachable by scroll) */
  if (oneBox() && shrunk && inMain && editing() && a) requestAnimationFrame(() => {
    if (document.activeElement !== a) return;
    const r = a.getBoundingClientRect(), top = vv ? vv.offsetTop : 0, bot = top + (vv ? vv.height : innerHeight);
    if (r.top < top || r.bottom > bot) scrollBy(0, r.bottom > bot ? Math.min(r.bottom - bot + 8, r.top - top - 8) : r.top - top - 8);
  });
  root.classList.toggle("kbup", !!kb || swapNext);                    // keyboard up: no expand icon, no pill, no toggle (docs/design/MULTITASK.md)
  /* keyboard up while typing elsewhere (scratchpad, answer): the box steps aside so it can't cover the caret */
  root.classList.toggle("dock-away", (!!kb && !inDock) || swapNext || (bridge.mtOpen && !!S));
  root.classList.toggle("bar-off", !!a && a.id === "scratch");        // from where focus IS, not from focus events: the keyboard can go and come without them
  if (swapNext !== bridge.swapOn) setSwap(swapNext);
  /* keyboard up while typing the code: ride on top of the keyboard (iOS keeps fixed elements on the layout viewport) */
  const lift = kb && inDock && vv ? Math.max(0, innerHeight - (vv.offsetTop + vv.height)) : 0;
  root.style.setProperty("--kb-bottom", lift + "px");
  root.classList.toggle("bar-mini", bottom && !!S && !freeze.hidden);
  /* start page: no problem open. The entry stands alone, centred under its title (app.css html.start); on phones in the area
     above the keyboard, so --kb-top follows the visual viewport here too (layoutFreeze owns it once a problem is open) */
  root.classList.toggle("start", !S);
  if (!S) root.style.setProperty("--kb-top", kb && inDock && vv ? Math.max(0, vv.offsetTop) + "px" : "0px");
  root.style.setProperty("--dock-h", bottom ? dockRoom(true) + "px" : "0px");
}
if (dockMQ.addEventListener) dockMQ.addEventListener("change", () => { barOpen(dock.contains(document.activeElement)); layoutDock(); layoutFreeze(); });   // W101: to the strip while typing the code: it opens with the box; to the desktop bar: no bar-open
new ResizeObserver(() => layoutDock()).observe(dock);

function layoutFreeze() {
  layoutDock();
  if (!S || freeze.hidden) return;
  if (bridge.swapOn) { layoutSwap(); return; }
  if (bridge.mtOpen || sideMQ.matches) { layoutMT(); return; }                           // multitask: the panes own the sizes
  if (root.classList.contains("pad-off")) {                                      // phones, pad off: nothing below needs room, so no strip
    freeze.classList.remove("clipped", "stuck", "open"); more.hidden = true;     // cap, no fade, no pull-tab (Tony: "big ass dark space")
    root.style.setProperty("--freeze-h", "0px");
    return;
  }                                         // one pane above the keyboard: none of the strip logic applies
  const dockH = dockRoom();
  const h = (vv ? vv.height : innerHeight) - dockH;
  const kb = editing() && h + dockH < tallest * 0.8;                            // software keyboard is up
  const inFreeze = freeze.contains(document.activeElement);
  const kbWas = root.classList.contains("kb");
  root.classList.toggle("kb", kb);
  root.style.setProperty("--kb-top", kb && vv ? Math.max(0, vv.offsetTop) + "px" : "0px");
  const frac = kb && !inFreeze ? 0.34 : h < 720 ? 0.5 : h < 960 ? 0.6 : 0.7;
  root.style.setProperty("--freeze-max", Math.round(Math.max(kb ? 96 : 180, h * frac)) + "px");
  requestAnimationFrame(() => {
    const clipped = !freeze.classList.contains("open") && freezeIn.scrollHeight > freezeIn.clientHeight + 2;
    const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2;
    freeze.classList.toggle("clipped", clipped && !atEnd);
    more.hidden = !clipped && !freeze.classList.contains("open");
    root.style.setProperty("--freeze-h", freeze.classList.contains("open") ? "0px" : freeze.offsetHeight + "px");
    stuck();
    if (S.box) S.box.limit();                                                     // scratchpad cap follows the visible viewport and dock
    if (kb && !kbWas && !inFreeze) showQuestion();
  });
}
function stuck() {
  if (!S || freeze.hidden || bridge.swapOn || bridge.mtOpen || sideMQ.matches || root.classList.contains("pad-off")) { freeze.classList.remove("stuck"); return; }
  const top = parseFloat(getComputedStyle(freeze).top) || 0;
  const now = !freeze.classList.contains("open") && sentinel.getBoundingClientRect().top < top - 0.5;
  const was = freeze.classList.contains("stuck");
  freeze.classList.toggle("stuck", now);
  if (now && !was) showQuestion();
}
/* When the layer freezes, scroll its own box so the question (and any hint) sits at the bottom of the strip:
   the question is what you answer while writing; the problem start is one small scroll up. */
function showQuestion() {
  if (bridge.swapOn || bridge.mtOpen || sideMQ.matches) return;
  const bottom = e => e.offsetHeight ? e.offsetTop + e.offsetHeight : 0;   // offsets are relative to .freeze-in
  const end = Math.max(bottom($("#q")), bottom($("#fb")));
  freezeIn.scrollTop = Math.max(0, end - freezeIn.clientHeight + 4);
}
let raf = 0;
const onView = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutFreeze); };
if (vv) { vv.addEventListener("resize", onView); vv.addEventListener("scroll", onView); }
addEventListener("resize", onView);
addEventListener("scroll", () => stuck(), { passive: true });
/* html.scrolled: content has moved up under the pinned phone top bar, so its scroll-edge fade shows (app.css "scroll edges").
   A class, not a scroll-driven animation: that one never ends, and rewards/fx.js waits for the page's animations to finish */
const edge = () => root.classList.toggle("scrolled", scrollY > 0);
addEventListener("scroll", edge, { passive: true }); edge();
/* --top-h: the pinned desktop bar's height; app.css sticks the side columns under it */
const topBar = $(".top");
if (topBar && window.ResizeObserver) new ResizeObserver(() => root.style.setProperty("--top-h", topBar.offsetHeight + "px")).observe(topBar);
document.addEventListener("focusin", onView);
document.addEventListener("focusout", e => { if (!e.relatedTarget) bridge.lostAt = performance.now(); setTimeout(onView, 60); setTimeout(onView, 520); });
freezeIn.addEventListener("scroll", () => { if (bridge.swapOn) { swapFade(); return; } const atEnd = freezeIn.scrollTop + freezeIn.clientHeight >= freezeIn.scrollHeight - 2; freeze.classList.toggle("clipped", !atEnd && !freeze.classList.contains("open")); }, { passive: true });
swipeTab(more, d => { const open = freeze.classList.contains("open"); if (d === "tap" || (d === "down") !== open) toggleMore(); });
function toggleMore() {
  const open = !freeze.classList.contains("open");
  freeze.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open);
  more.setAttribute("aria-label", open ? "Make question small" : "Show whole question");
  if (!open) freeze.scrollIntoView({ block: "nearest" });
  layoutFreeze();
}
/* ================= Swap (docs/design/SWAP.md) =================
   Keyboard up = ONE pane fills the visible area above the keyboard: the problem (card, answer pinned at its bottom) or the
   scratchpad (question peek on top, the box anchored to the bottom and growing upward). One icon toggle switches; focusing a field
   picks the pane too. layoutDock() decides when it is on; CSS (html.swap, .swap-problem, .swap-scratch) does the layout;
   this code sets the pane, the sizes CSS cannot know (--vv-h, --peek-max, the scratchpad's cap) and moves focus. */
const swapBtn = $("#swap"), stage = $("#stage"), problemEl = $("#problem"), work = $("#work");
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
let pane = "problem", shownPane = "problem", swapY = 0, swapPadMax = null;
const GAP = 8;                                                                   // between the peek and the scratchpad: small, the box has no outside ring
const paneOf = el => !el || !el.closest ? null : work.contains(el) ? "scratch" : el.closest("#q, #fb") ? "problem" : null;
function setSwap(on) {
  bridge.swapOn = on;
  if (on) {
    swapY = scrollY;
    root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");              // the page keeps its height, so its scroll position survives
    const p = paneOf(document.activeElement); if (p) pane = p;
    root.classList.add("swap");
    applyPane();
  } else {
    root.classList.remove("swap", "swap-problem", "swap-scratch");
    swapBtn.hidden = true; swapPadMax = null;
    freeze.classList.remove("clipped", "no-peek");
    if (scrollY !== swapY) scrollTo(0, swapY);
    requestAnimationFrame(() => { if (S && S.box) S.box.limit(); });
    backInView();
  }
}
/* the DOM change: classes, toggle, scroll positions, sizes */
function applyPane() {
  shownPane = pane;
  root.classList.toggle("swap-problem", pane === "problem");
  root.classList.toggle("swap-scratch", pane === "scratch");
  swapBtn.dataset.pane = pane;
  swapBtn.setAttribute("aria-label", pane === "problem" ? "Show notes" : "Show question");
  padPeekText();
  layoutSwap();                                                                   // scroll positions are left alone (a reset lost the field you typed in)
}
/* crossfade between panes (View Transitions where supported), instant with reduced motion or without support.
   Focus has already moved (it must, in the tap, for the keyboard to stay), so the fields are focusable in both states. */
function setPane(p) {
  if (p === pane) return;
  pane = p;
  if (!bridge.swapOn) return;
  if (document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyPane); else applyPane();
}
function layoutSwap() {
  if (!bridge.swapOn || !S) return;
  const h = vv ? vv.height : innerHeight;
  root.style.setProperty("--vv-h", Math.round(h) + "px");
  root.style.setProperty("--kb-top", (vv ? Math.max(0, vv.offsetTop) : 0) + "px");
  const cell = stage.clientHeight - 6;                                             // minus the stage's focus-ring room
  const cs = getComputedStyle(S.box.el), padMin = 3 * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + 28 + 4 || 130;   // 3 lines (not min-height: Swap sets it to the cap)
  const peekMax = Math.max(0, Math.min(Math.round(h * 0.6), cell - padMin - GAP));
  root.style.setProperty("--peek-max", peekMax + "px");
  const noPeek = peekMax < 40;
  freeze.classList.toggle("no-peek", noPeek);
  let peek = 0;
  if (!noPeek) {
    if (shownPane === "scratch") peek = freeze.offsetHeight;
    else { const how = $("#how"); peek = Math.min(peekMax, problemEl.scrollHeight + (how ? how.offsetHeight + 16 : 0) + 8); }   // what the peek will be
  }
  swapPadMax = Math.max(padMin, cell - (peek ? peek + GAP : 0));
  root.style.setProperty("--pad-max", swapPadMax + "px");
  S.box.limit();
  swapFade();
}
/* subtle bottom fade on whichever box is scrolling (the peek, or the question in the problem pane) while it has more below */
function swapFade() {
  if (!bridge.swapOn) return;
  const sc = shownPane === "scratch" ? freezeIn : problemEl;
  freeze.classList.toggle("clipped", sc.scrollHeight > sc.clientHeight + 2 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2);
}
problemEl.addEventListener("scroll", swapFade, { passive: true });
/* the main field of a pane: the scratchpad; or the first empty answer box, or the picked / current choice */
function focusField(p) {
  let el = null;
  if (p === "scratch") el = S.box && S.box.el;
  else {
    const ins = [...document.querySelectorAll("#q .ans")].filter(x => x.getClientRects().length && !x.disabled);   // a hidden fix box can't take focus
    const back = bridge.lastEdit && ins.includes(bridge.lastEdit) ? bridge.lastEdit : null;                                   // the field you were typing in
    el = back || (ins.length ? ins.find(x => !x.value.trim() && !x.readOnly) || ins[0]
      : opts().find(o => o.getAttribute("aria-checked") === "true") || opts().find(o => !o.disabled && o.tabIndex === 0) || opts().find(o => !o.disabled));
  }
  if (!el) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}
/* the toggle must not take focus from the field (that would drop the keyboard): pointerdown/mousedown are cancelled, and the click puts
   focus straight into the other pane's field, in the same tap */
for (const ev of ["pointerdown", "mousedown"]) swapBtn.addEventListener(ev, e => e.preventDefault());
swapBtn.addEventListener("click", () => { const next = pane === "problem" ? "scratch" : "problem"; focusField(next); setPane(next); });
/* focus picks the pane; focusing the scratchpad also sends the top bar away (nav row: slides up and fades, keeps its space) */
document.addEventListener("focusin", e => {
  root.classList.toggle("bar-off", e.target.id === "scratch");
  const p = paneOf(e.target); if (p) setPane(p);
});
document.addEventListener("focusout", () => setTimeout(() => root.classList.toggle("bar-off", document.activeElement && document.activeElement.id === "scratch"), 0));

/* keyboard up, PROBLEM pane: the pad peek (one line above the keyboard). Its text is the pad's last line; empty pad = "Scratchpad".
   A tap goes to the pad in the same tap: pointerdown / mousedown are cancelled (focus stays in the field, the keyboard stays up), then the
   click focuses the pad with the caret at the end, and focus picks the pane. The mirror of the question peek in the SCRATCHPAD pane. */
const padPeek = $("#padPeek"), padPeekTx = $("#padPeekTx");
function padPeekText() {
  const t = S && S.box ? S.box.el.value : "";
  const last = t.split("\n").map(x => x.trim()).filter(Boolean).pop();
  padPeekTx.textContent = last || "Notes";
  padPeek.classList.toggle("empty", !last);
}
padPeek.hidden = false;                                                         // CSS shows it only in the PROBLEM pane
for (const ev of ["pointerdown", "mousedown"]) padPeek.addEventListener(ev, e => e.preventDefault());
padPeek.addEventListener("click", () => {
  if (!S || !S.box || padGone()) return;
  if (root.classList.contains("pad-off")) openMT();                              // phones: the pad lives on the pad page
  const ta = S.box.el, n = ta.value.length;
  ta.focus({ preventScroll: true }); ta.setSelectionRange(n, n); ta.scrollTop = ta.scrollHeight;
  setPane("scratch");
});
document.addEventListener("input", e => {
  if (S && S.box && e.target === S.box.el) padPeekText();
  if (e.target.matches && e.target.matches("#main input, #main textarea")) bridge.lastEdit = e.target;
});
/* SCRATCHPAD pane: a tap on the question peek goes back to the answer, in the same tap */
for (const ev of ["pointerdown", "mousedown"]) freeze.addEventListener(ev, e => { if (bridge.swapOn && shownPane === "scratch") e.preventDefault(); });
freeze.addEventListener("click", () => { if (bridge.swapOn && shownPane === "scratch" && focusField("problem")) setPane("problem"); });
/* keyboard down (or Back with it up): the field last typed in comes back into view, without taking focus (it never gets scrollTop = 0) */
function backInView() {
  const el = bridge.lastEdit;
  if (!el || !el.isConnected || !mainEl.contains(el)) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (el.isConnected && el.offsetParent) el.scrollIntoView({ block: el.tagName === "TEXTAREA" ? "nearest" : "center", inline: "nearest" }); }));
}

/* ================= Multitask (docs/design/MULTITASK.md) =================
   Phone (< 720px): the pad is hidden; the floating Scratchpad button (#padFab) opens the pad page: the tile on top, one drag handle in
   the gap, the pad below. The tile's q | a switch: q = the problem only, a = the answer control only (round 3b). It opens on q with a big
   pad (1/3). Anchors 1/2, 1/3 and the smallest tile; drag snaps, tap = next. Exits: Back (a pushed history entry), tapping the problem
   (caret into the answer), the collapse icon in the pad's top-right. The keyboard going down never closes it.
   Desktop (>= 720px): side by side, always: problem + answer left, pad right. Anchors strip (52px), 1/3, 1/2, 2/3.
   Memory: per device (localStorage, every access in try/catch). */
const sash = $("#sash"), mtMode = $("#mtMode"), mtExp = $("#mtExp"), pstrip = $("#pstrip");
const ANCH = { phone: [0, 1 / 3, 1 / 2], desk: [0, 1 / 3, 1 / 2, 2 / 3] };
const ANAME = r => r < 0.4 ? "one third" : r < 0.6 ? "half" : "two thirds";
let mtMem = {};
try { mtMem = JSON.parse(localStorage.getItem("stem-mt") || "{}") || {}; } catch { mtMem = {}; }
const mtKind = () => sideMQ.matches ? "desk" : "phone";
const near = (k, r) => ANCH[k].reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a);
const mtDef = k => k === "phone" ? 1 / 3 : 1 / 2;                                 // phone: a big pad
function mtRatio(k = mtKind()) { const r = mtMem[k]; return typeof r === "number" ? near(k, r) : mtDef(k); }
const nextDown = (k, r) => { const a = ANCH[k], i = a.indexOf(near(k, r)); return i > 0 ? a[i - 1] : a[a.length - 1]; };   // 1/2 -> 1/3 -> sliver/strip -> top -> 1/2
const anchorName = (k, r) => r === 0 ? (k === "desk" ? "question folded" : "answer only") : "question " + ANAME(r);
let dragR = null, mtFit = true, mtNeed = 0;                                                  // mtFit: the tile hugs its content until the handle is used
/* desktop sugar: the notes pad steps aside while Cluck has something to show (the hint card, or the sheet open); else the pad is the default
   (Tony, Oct 5: "otherwise default to the scratchpad"; Oct 4's "NO SCRATCHPAD" held for questions with a layer). Diet keeps the pad.
   Phone sugar: no pad at all, so no Scratchpad button, no pad page, no pad peek (Tony, Oct 14: "HIDE THE SCRATCHPAD ON MOBILE SUGAR MODE"). */
function padRule() {
  root.classList.toggle("no-pad", !!S && modeOf() === "sugar" && (!sideMQ.matches || !!origEl || !!(bridge.cl && bridge.cl.open)));
}
const padGone = () => !sideMQ.matches && root.classList.contains("no-pad");   // phone sugar: the pad has no way in
function applyMT() {
  const side = sideMQ.matches && !!S, k = mtKind(), gone = side && bridge.clGone;
  if (sideMQ.matches || !S) bridge.mtOpen = false;
  const pf = isProof();
  if (pf && !sideMQ.matches && proofTyping()) { bridge.mtOpen = true; bridge.mtForced = true; }   // a proof item while typing: the split (question tile on top, the proof pane below)
  else if (bridge.mtForced) { bridge.mtOpen = false; bridge.mtForced = false; }
  const r = dragR != null ? dragR : mtRatio(k), on = side || bridge.mtOpen;
  root.classList.toggle("side", side);
  root.classList.toggle("cl-gone", gone);                                      // Cluck's column dismissed: one centred column (DISMISS.md)
  padRule();
  root.classList.toggle("sugar", modeOf() === "sugar");                  // Cluck's world: sugar-only bits wear the AI skin (app.css)
  root.classList.toggle("mt", bridge.mtOpen);
  dispatchEvent(new CustomEvent("stem:layers"));                              // nav.js: the iOS Back button
  const fit = bridge.mtOpen && mtFit && dragR == null;
  root.classList.toggle("mt-fit", fit);
  root.classList.toggle("mt-r0", on && !gone && !fit && dragR == null && r === 0);
  root.classList.toggle("mt-drag", dragR != null);
  root.style.setProperty("--r", r);
  root.classList.toggle("mt-q", bridge.mtOpen && !pf && bridge.mtTile === "q");
  root.classList.toggle("mt-a", bridge.mtOpen && !pf && bridge.mtTile === "a");
  root.classList.toggle("pad-off", !!S && !sideMQ.matches && !bridge.mtOpen);         // phones: no pad on the page, the button opens it
  sash.hidden = !on || gone; mtMode.hidden = !bridge.mtOpen || pf; pstrip.hidden = !(side && !gone && r === 0 && dragR == null);
  mtMode.dataset.pane = bridge.mtTile === "q" ? "problem" : "scratch";
  mtMode.setAttribute("aria-label", bridge.mtTile === "q" ? "Show answer" : "Show question");
  mtExp.hidden = side || !bridge.mtOpen || pf;                                               // the collapse corner of the pad page only
  mtExp.querySelector("use").setAttribute("href", bridge.mtOpen ? "#i-collapse" : "#i-expand");
  mtExp.setAttribute("aria-label", bridge.mtOpen ? "Close notes" : "Open notes");
  mtExp.title = mtExp.getAttribute("aria-label");
  /* a11y only (WAI-ARIA window splitter), never shown */
  sash.setAttribute("aria-orientation", side ? "vertical" : "horizontal");
  sash.setAttribute("aria-valuemin", "0"); sash.setAttribute("aria-valuemax", String(Math.round(Math.max(...ANCH[k]) * 100)));
  sash.setAttribute("aria-valuenow", String(Math.round(r * 100)));
  sash.setAttribute("aria-valuetext", anchorName(k, r));
  sash.setAttribute("aria-label", `Question size: ${anchorName(k, r)}. Tap for ${anchorName(k, nextDown(k, r))}`);
  if (on) layoutMT(); else mtCap = null;
  clBackSync();
  if (clPerm()) { if (!(bridge.cl && bridge.cl.open)) bridge.clOpen("explain", null, true); } else if (bridge.cl && bridge.cl.open && bridge.cl.perm) bridge.clClose();   // the box opens by itself; it leaves when the window or mode no longer has the column
  if (noteAt() && !noteAt().getClientRects().length) hideToast();               // its anchor just went away (q | a when the page closes)
  fabSync();
}
/* the sizes CSS cannot know: the visible height (phone), and the pad's height (it fills its tile / column) */
let mtCap = null;
function layoutMT() {
  if (!S || !S.box) return;
  const ta = S.box.el;
  if (bridge.mtOpen) {
    const h = vv ? vv.height : innerHeight;
    root.style.setProperty("--vv-h", Math.round(h) + "px");
    root.style.setProperty("--kb-top", (vv ? Math.max(0, vv.offsetTop) : 0) + "px");
    if (mtFit) {                                                                 // hug: what the tile shows, at most 1/3 of a short screen, 45% of a tall one
      const parts = bridge.mtTile === "q" || isProof() ? [problemEl] : [$("#fb"), $("#q")];
      root.style.setProperty("--tile-h", "56px"); void problemEl.offsetHeight;  // measure from a small tile: scrollHeight never reports less than the box
      const need = parts.reduce((s, e) => s + (e && e.getClientRects().length ? e.scrollHeight : 0), 0);
      mtNeed = need;                                                           // bug 5: setRatio asks it (a pick taller than the content stays a hug)
      let cap = (innerHeight < 700 ? 1 / 3 : 0.45) * h;
      /* proof, keyboard up (Tony, Nov 8: question cut mid-line, "it stuck there"): 1/3 of the short screen left the question clipped over an
         empty proof box. The question hugs up to all the room but the box's floor (#q min-height 8rem + the sash row + main's padding) */
      if (isProof() && root.classList.contains("kbup")) cap = Math.max(cap, h - 11 * 16);
      root.style.setProperty("--tile-h", Math.round(Math.max(56, Math.min(need, cap))) + "px");
    }
  } else root.style.setProperty("--kb-top", "0px");
  const fill = () => {
    if (!S || !S.box || (!bridge.mtOpen && !sideMQ.matches)) return;
    if (sideMQ.matches) { padFoot(); pageTop(); root.style.setProperty("--cl-top", Math.max(0, Math.round(sentinel.getBoundingClientRect().top + scrollY)) + "px"); }   // where the notes column starts in the page: Cluck's sheet is capped to the window below it (its body scrolls), so the ask field is on screen when it opens
    if (bridge.mtOpen) mtCap = Math.max(80, Math.floor(work.getBoundingClientRect().bottom - ta.getBoundingClientRect().top));
    else if (sideMQ.matches) mtCap = Math.max(96, Math.floor(innerHeight - dockRoom() - (ta.getBoundingClientRect().top - work.getBoundingClientRect().top + workRest()) - padFoot()));   // side: where the box sits with the page at its top, not where the sticky column happens to be now (a tap on a scrolled page re-sized it: W129 L6); down to 96px, so the column fits a short window (1366x768 at 150%, L3)
    else mtCap = Math.max(200, Math.floor((vv ? vv.height : innerHeight) - dockRoom() - ta.getBoundingClientRect().top - 24));   // a touch tablet's bottom bar must not cover Cut / Copy
    root.style.setProperty("--pad-max", mtCap + "px");
    S.box.limit();
  };
  fill(); requestAnimationFrame(fill);
}
/* the room under the notes box and Cluck's sheet (app.css --foot): main's own bottom padding (--s7), so the page is exactly the window for
   them (W129 L1: no page scroll on a short question, which read as the Explain column scrolling itself), and at least 8px over the fixed
   footer's box (#privacy's 44px tap target in Firefox; L3 / L5: no tap on the notes lands on the link) */
function padFoot() {
  const pv = $("#privacy"), r = pv && pv.getClientRects().length ? pv.getBoundingClientRect() : null;
  const room = Math.ceil(Math.max(24, parseFloat(getComputedStyle($("main")).paddingBottom) || 0, r ? innerHeight - r.top + 8 : 0));
  root.style.setProperty("--foot", room + "px");
  return room;
}
/* the spare room above the bar when the body centres the page up-down (app.css "snug in the center": auto margins), so the notes column's
   floor (app.css html.side #work min-height) leaves the same room under the page: centred stays centred (easy.pw zoomed out to heck), a
   column that shrinks still re-centres nothing (W129 L4). 0 when the page starts at the top (taller than the window, the start page, the bar docked at the bottom) */
function pageTop() {
  const bar = $("body > .top"), on = !root.classList.contains("start") && !root.classList.contains("dock-bottom") && bar && bar.getClientRects().length;
  const t = on ? Math.max(0, Math.round(bar.getBoundingClientRect().top + scrollY)) : 0;
  root.style.setProperty("--pg-top", t + "px");
  return t;
}
let workD = 0;                                                                     // the notes column's top below the sentinel, read while the page is at its top
function workRest() {                                                              // the notes column's top in the window with the page at its top (it is sticky)
  const s = sentinel.getBoundingClientRect().top;
  if (scrollY === 0) workD = work.getBoundingClientRect().top - s;
  return s + scrollY + workD;
}
function mtSave() { try { localStorage.setItem("stem-mt", JSON.stringify(mtMem)); } catch { /* private mode: defaults next time */ } }
function setRatio(r, animate = true) {
  const k = mtKind();
  mtFit = false;
  mtMem[k] = r; if (r > 0) mtMem[k + "Last"] = r;
  mtSave();
  const go = () => {
    /* bug 5 (Tony, Nov 6): a pick whose tile would be taller than its content stays a hug, no empty space under a short question or proof */
    if (bridge.mtOpen && !sideMQ.matches && r > 0) {
      mtFit = true; applyMT();                                                   // measures mtNeed from a small tile
      const cs = getComputedStyle(mainEl), len = mainEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 16;
      if (r * len <= mtNeed + 8) mtFit = false;                                  // the pick fits inside the content: the ratio rules
    }
    applyMT();
  };
  if (animate && document.startViewTransition && !reduceMQ.matches) document.startViewTransition(go); else go();
}
const lastPeek = () => { const k = mtKind(), r = mtMem[k + "Last"]; return typeof r === "number" && r > 0 ? near(k, r) : mtDef(k); };
function setTile(t, animate = true) {
  if (bridge.mtTile === t) return;
  bridge.mtTile = t;
  if (animate && document.startViewTransition && !reduceMQ.matches) document.startViewTransition(applyMT); else applyMT();
}
function openMT() {
  if (bridge.mtOpen || !S || sideMQ.matches || padGone()) return;
  swapY = scrollY;
  root.style.setProperty("--swap-doc-h", root.scrollHeight + "px");
  if (bridge.swapOn) setSwap(false);
  bridge.mtOpen = true; bridge.mtTile = "q"; mtFit = true;
  if (noteAt() === fab) hideToast();
  mtMem.opens = (mtMem.opens || 0) + 1; mtSave();
  try { history.pushState({ mt: 1, stemD: (history.state && history.state.stemD) || 0 }, "", location.href); } catch { /* sandboxed */ }   // stemD: nav.js iOS Back depth, same as the entry under it
  applyMT(); layoutDock();
  setTimeout(() => obToast(2, "Switch question/answer here.", mtMode, { x: true, allow: "#scratch" }), 400);   // pad-mode B (Tony, Oct 28): caret + an X. The pad page is all pad (#scratch, edge to edge): the note may lie on its 2 s of it, never on a button
}
let mtSkipPop = false;
function shutMT() {
  if (!bridge.mtOpen || isProof()) return;                                              // a proof item's split is its page: nothing closes it
  bridge.mtOpen = false;
  applyMT(); layoutDock();
  if (scrollY !== swapY) scrollTo(0, swapY);
  requestAnimationFrame(() => { if (S && S.box) S.box.limit(); layoutFreeze(); });
}
function closeMT(toAnswer) {
  if (!bridge.mtOpen) return;
  shutMT();
  if (toAnswer) focusField("problem");                                            // after the close (on q the answer was hidden), still in the tap: the keyboard can stay
  if (history.state && history.state.mt) { mtSkipPop = true; history.back(); }
}
/* proof: focus into / out of the proof pane opens / closes the split (out: on the next task, when the new focus is known) */
function proofSync() {
  if (!isProof() || sideMQ.matches || proofTyping() === bridge.mtOpen) return;
  if (!bridge.mtOpen) { swapY = scrollY; root.style.setProperty("--swap-doc-h", root.scrollHeight + "px"); }
  applyMT(); layoutDock();
  if (!bridge.mtOpen) { if (scrollY !== swapY) scrollTo(0, swapY); requestAnimationFrame(() => { if (S && S.box) S.box.limit(); layoutFreeze(); }); }
}
document.addEventListener("focusin", () => proofSync());
document.addEventListener("focusout", () => setTimeout(proofSync, 0));
document.addEventListener("pointerdown", e => { if (bridge.mtOpen && isProof() && $("#work").contains(e.target)) bridge.proofHold = true; }, true);
for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, () => { if (bridge.proofHold) setTimeout(() => { bridge.proofHold = false; proofSync(); }, 0); }, true);
window.stemNotes = { open: () => bridge.mtOpen && !isProof(), close: () => closeMT(false) };   // nav.js: the iOS Back button closes the split (a proof item's split is its page: not offered)
addEventListener("popstate", () => { if (mtSkipPop) { mtSkipPop = false; return; } if (bridge.mtOpen) shutMT(); });   // Back closes it, never leaves the page
for (const b of [mtExp, mtMode, pstrip]) for (const ev of ["pointerdown", "mousedown"]) b.addEventListener(ev, e => e.preventDefault());   // never takes focus (keyboard stays)
mtExp.addEventListener("click", () => closeMT(false));
mtMode.addEventListener("click", () => setTile(bridge.mtTile === "q" ? "a" : "q"));
pstrip.addEventListener("click", () => setRatio(lastPeek()));
/* tap the problem (not the answer) = close, caret in the answer */
for (const ev of ["pointerdown", "mousedown"]) problemEl.addEventListener(ev, e => { if (bridge.mtOpen) e.preventDefault(); });
problemEl.addEventListener("click", () => { if (bridge.mtOpen) closeMT(true); });
/* the handle: the pane follows the finger, release snaps to the nearest anchor; a tap (no move) goes to the next anchor */
let mtDrag = null;
sash.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  e.preventDefault();
  const m = mainEl.getBoundingClientRect(), cs = getComputedStyle(mainEl), side = sideMQ.matches;
  const a = side ? m.left + parseFloat(cs.paddingLeft) : m.top + parseFloat(cs.paddingTop);
  const len = (side ? m.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : m.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) - 16;
  mtDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a, len, side, moved: false };
  try { sash.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
});
sash.addEventListener("pointermove", e => {
  const d = mtDrag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  d.moved = true;
  const pos = (d.side ? e.clientX : e.clientY) - d.a - 8;
  d.raw = pos / d.len;                                                           // past 85% to the right (desktop): the column goes (DISMISS.md)
  dragR = Math.min(Math.max(...ANCH[mtKind()]), Math.max(0.06, pos / d.len));
  applyMT();
});
function sashEnd(e) {
  const d = mtDrag; if (!d || (e && e.pointerId !== d.id)) return;
  mtDrag = null;
  const k = mtKind();
  if (!d.moved) { dragR = null; setRatio(nextDown(k, mtRatio(k))); return; }
  if (d.side && d.raw > 0.85 && !clPerm()) { dragR = null; clGoneSet(true); return; }       // the mirror of the strip: dragged to the right edge = dismissed, the ratio is kept
  let r = dragR; dragR = null;
  r = r < (d.side ? 0.2 : 1 / 6) ? 0 : near(k, r);                              // past 20% to the left (desktop) / a sixth (phone): the strip / sliver
  setRatio(r);
}
sash.addEventListener("pointerup", sashEnd);
sash.addEventListener("pointercancel", sashEnd);
sash.addEventListener("dblclick", () => { if (sideMQ.matches) setRatio(1 / 2); });
/* assistive tech only (WAI-ARIA window splitter): arrows step one anchor, Home / End go to the ends. Never shown or documented. */
sash.addEventListener("keydown", e => {
  const k = mtKind(), a = ANCH[k], i = a.indexOf(mtRatio(k));
  const to = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: a.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  setRatio(a[Math.max(0, Math.min(a.length - 1, to))], false);
});
if (sideMQ.addEventListener) sideMQ.addEventListener("change", () => { applyMT(); origPlace(); clPlace(); layoutFreeze(); });

/* the Scratchpad button (phones, STYLE.md §3): shown while the pad is off and no answer field has focus. Tap = the pad page. Drag: it
   follows the finger; on release it snaps to the nearer side edge and stays between the top and the bottom bar, where it was dropped
   (a drop is the user's choice: no step-off, even over an answer control). Where it (re)appears it steps off answer controls. Its place is kept per device (stem-mt .fab = { side, y: 0 top .. 1 bottom }). */
const fab = $("#padFab");
let fabDrag = null, fabMoved = false, fabSeen = false;
function fabSync() {
  window.stemBrainrot?.sync();
  const a = document.activeElement, typing = !!a && editing() && $("#q").contains(a);
  const show = root.classList.contains("pad-off") && !typing && !padGone() && !isProof();   // a proof has no notes pad
  root.classList.toggle("fab-on", show);
  if (fab.hidden === !show) return;
  fab.hidden = !show; fab.setAttribute("aria-expanded", String(bridge.mtOpen));
  if (!show) return;
  fabPlace({ avoid: true }); requestAnimationFrame(() => requestAnimationFrame(() => fabPlace({ avoid: true })));        // again once the bottom bar is back in place
  if (!fabSeen) { fabSeen = true; setTimeout(() => obToast(1, "Quack up your thoughts here...", fab, { prefer: "above" }), 700); }   // Scratchpad tip A: above the button, caret down
  else if ((mtMem.opens || 0) >= 2 && !mtMem.fabMoved) setTimeout(() => obToast(3, "Drag to move me!", fab, { prefer: "above" }), 700);
}
function fabBounds() {
  const h = fab.offsetHeight || 56, s = parseFloat(getComputedStyle(root).getPropertyValue("--s4")) * 16 || 16;
  const floor = root.clientHeight - dockRoom();   // layout viewport and the bar's resting height: nothing that moves while scrolling or while the URL bar slides
  return { min: s + 8, max: Math.max(s + 8, floor - s - h), h };
}
/* avoid: step off answer controls under it. Only (re)appearing asks for it; a drag end never does (the drop is the user's choice), and a resize never does, or the
   button hops by a control's height with the scroll offset it happens to be at. */
function fabPlace({ avoid } = {}) {
  const m = mtMem.fab || {}, b = fabBounds();
  let top = b.min + (typeof m.y === "number" ? m.y : 1) * (b.max - b.min);
  fab.classList.toggle("left", m.side === "l");          // default bottom right (Tony, Oct 5 ~09:5x; was left since #69); a drag keeps its side
  fab.style.transform = "";
  const r = fab.getBoundingClientRect();
  /* step off answer controls under it (up first, then down), a few tries at most */
  const ctl = [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo, #q .nx, #wish:not([hidden]) .wchip, .rbox .wchip, .cl-cta")].map(e => e.getBoundingClientRect()).filter(q => q.width && q.right > r.left && q.left < r.right);
  /* the question text (the body above the choices): stepping up never takes the button above its bottom edge (it climbed over every choice onto the text) */
  const textBottom = document.querySelector("#blocks")?.getBoundingClientRect().bottom ?? 0;
  for (let n = 0; avoid && n < 6; n++) {
    const hit = ctl.find(q => q.bottom > top && q.top < top + b.h); if (!hit) break;
    const upY = hit.top - b.h - 8, downY = hit.bottom + 8;
    top = upY >= Math.max(b.min, textBottom + 8) ? upY : downY <= b.max ? downY : top;
    if (top !== upY && top !== downY) break;
  }
  /* no clear step (a long question leaves no gap between the text and the choices): the nearest place that covers neither the text nor a
     choice (a figure may be covered); failing that, the nearest place off the answer controls (the text may be covered) */
  const txt = [...document.querySelectorAll("#blocks .md")].map(e => e.getBoundingClientRect()).filter(q => q.width && q.right > r.left && q.left < r.right);
  const clear = (t, obs) => !obs.some(q => q.bottom > t && q.top < t + b.h);
  for (const obs of [[...ctl, ...txt], ctl]) {
    if (!avoid || clear(top, obs)) break;
    for (let d = 8; d <= b.max - b.min; d += 8) {
      const t = [top - d, top + d].find(t => t >= b.min && t <= b.max && clear(t, obs)); if (t !== undefined) { top = t; break; }
    }
  }
  /* anchored by its distance from the bottom, like the bar: when a phone's URL bar slides away, the bar and the button move down
     together (top-anchored, the button stayed put and left a dead band the height of the URL bar above the bar; Tony, Oct 3) */
  fab.style.bottom = Math.round(root.clientHeight - Math.min(b.max, Math.max(b.min, top)) - b.h) + "px";
}
fab.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  const r = fab.getBoundingClientRect();
  fabDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, r, moved: false };
  try { fab.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
});
fab.addEventListener("pointermove", e => {
  const d = fabDrag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  d.moved = true; fab.classList.add("dragging");
  fab.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;     // follows the finger (direct manipulation)
});
function fabEnd(e) {
  const d = fabDrag; if (!d || (e && e.pointerId !== d.id)) return;
  fabDrag = null; fab.classList.remove("dragging");
  if (!d.moved) return;
  fabMoved = true;
  const dx = e ? e.clientX - d.x0 : 0, dy = e ? e.clientY - d.y0 : 0, b = fabBounds();
  /* the drop, measured against the bar on screen (both rects are visual): no guess at how tall a slid-away URL bar is. Firefox for
     Android moves fixed-bottom things with its bottom toolbar (bug 1880375), Chrome by resizing; innerHeight means different things */
  const bar = dockRoom() ? dock.getBoundingClientRect().top : innerHeight, gap = bar - (d.r.bottom + dy);
  const cx = d.r.left + d.r.width / 2 + dx, top = Math.min(b.max, Math.max(b.min, root.clientHeight - dockRoom() - gap - b.h));
  mtMem.fab = { side: cx < innerWidth / 2 ? "l" : "r", y: b.max > b.min ? (top - b.min) / (b.max - b.min) : 1 };
  mtMem.fabMoved = 1; mtSave();
  fabPlace();                                                                     // keep the drop spot: no step-off
}
fab.addEventListener("pointerup", fabEnd);
fab.addEventListener("pointercancel", fabEnd);
fab.addEventListener("click", () => { if (fabMoved) { fabMoved = false; return; } openMT(); });   // a drag is not a tap
document.addEventListener("focusin", fabSync);
document.addEventListener("focusout", () => setTimeout(fabSync, 0));
addEventListener("resize", () => { if (!fab.hidden) fabPlace(); });                // the same spot of the (new) range: no step-off
new ResizeObserver(() => { if (!fab.hidden) fabPlace(); }).observe(dock);         // the bar changed height: stay above it

/* figures and wrapped text depend on width: redraw on width changes only (not on keyboard height changes) */
let figW = 0;
new ResizeObserver(() => { const w = $("#blocks").clientWidth; if (S && w && w !== figW) { figW = w; drawFigures(); layoutFreeze(); } }).observe($("#blocks"));
let qW = 0;
new ResizeObserver(() => { const w = $("#q").clientWidth; if (S && w > 120 && w !== qW) { qW = w; fitChoices(); } }).observe($("#q"));   // the one-row / stacked choice depends on the width

/* ================= resume (docs/design/RELOAD.md) =================
   Back from bfcache (pageshow persisted) or a long-hidden tab: requests older than the timeout are aborted (background timers are
   throttled, so theirs may not have fired), busy is cleared, the controls that should be live are live again, the layout reruns. */
function resume(fromCache) {
  const now = Date.now();
  for (const r of [...inflight]) if (fromCache || now - r.t0 >= r.ms) r.ctl.abort();
  if (fromCache) bridge.busy = false;
  if (!editing()) { bridge.lostAt = 0; if (bridge.swapOn) setSwap(false); root.classList.remove("dock-away", "bar-off"); }
  if (S && !S.finished) {
    const ins = [...document.querySelectorAll("#q .ans")], go = $("#ansGo");
    if (go && ins.length) { go.hidden = !!$("#ff .vk"); go.disabled = ins.some(x => !x.value.trim()); }   // a wrong mark holds the slot until typing
    (S.parts || []).forEach((st, i) => { if (!st.shut) { const e = partEls(i); e.go.hidden = !e.inp.value.trim() || !!e.box.querySelector(".vk"); } });
    for (const o of opts()) if (!o.classList.contains("wrong")) { o.disabled = false; o.removeAttribute("aria-disabled"); }
    if (S.selected) { const o = opts().find(x => x.dataset.id === S.selected); if (o) select(o); }
  }
  tallest = 0; lastW = 0; qW = 0;
  layoutDock(); layoutFreeze(); fitChoices();
}
addEventListener("pageshow", e => {
  if (!e.persisted) return;
  resume(true);
  const off = window.stemOffline;
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(false); });

/* ================= boot ================= */
addEventListener("hashchange", fromHash);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) { drawFigures(); fitChoices(); layoutFreeze(); } });
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => { if (S) fitChoices(); });   // KaTeX loads a size font on first use: re-fit the math
layoutDock();
/* offline.js (it runs after this module) restores an uploaded bank from IndexedDB first, so #CODE of an uploaded problem opens */
/* the splash (index.html) waits for this: the #CODE problem opened (or failed), so the page never flashes the empty entry state first */
let firstDone;
window.stemFirst = new Promise(r => { firstDone = r; });
addEventListener("DOMContentLoaded", async () => {
  const off = window.stemOffline;
  let restored = false;
  if (off && off.ready) { try { restored = await Promise.race([off.ready, new Promise(r => setTimeout(() => r(false), 1500))]); } catch { /* storage blocked */ } }
  /* the live list (docs/design/BANK.md): #BANK_XXX, else the last one used here, else the server's pointer (new browser,
     or storage wiped). A problem in the hash still opens; the bank then only fills the list. */
  try {
    if (location.hash.length > 1 && window.stemWelcomeFirst && await window.stemWelcomeFirst.check()) { bridge.forceWelcome = true; history.replaceState(null, "", location.pathname + location.search); }   // a first-time user on a deep link: the welcome start first, once (welcome-first.js)
    const n = hashCode(), last = src(), q = !!n && n.prefix !== "BANK";
    if (n && n.prefix === "BANK") await openBank(n.code);
    else if (last && last !== "file") await openBank(last, { go: !q, quiet: true });
    else if (!last && !restored) await openBank("last", { go: !q, quiet: true });
    await fromHash();
  } catch { /* load() / openBank() report their own errors */ } finally { firstDone(); }
});
/* page.at (flight.js page(), flight recorder P1 §8): the app's state at a failure, as codes, counts and flags. Never a typed answer,
   notes, chat or Cluck's text: only their lengths */
const pageState = () => {
  const w = bridge.wish;
  return {
    q: S?.code ?? null, bank: bank?.code ?? null, mode: modeOf(), tries: S ? S.tries.length : null, left: S?.triesLeft ?? null, fin: !!S?.finished, hints: S ? S.hints.length : null,
    wish: w && { code: w.code, started: !!w.started, end: !!w.done, open: !!w.open, failed: w.failed || 0, capped: !!w.capped, chars: (w.text || "").length,
      shown: w.shown | 0, chat: (w.chat || []).length, busy: !!w.busy, out: !!w.out, inc: w.inc || null },
    cl: bridge.cl && { open: !!bridge.cl.open, tab: bridge.cl.tab ?? null, auto: !!bridge.cl.auto }, inflight: [...inflight].map(r => [r.ep || null, Date.now() - r.t0]),
  };
};
window.__drill = { check, get state() { return S; }, get page() { return pageState(); } };   // for tests/e2e; page: flight.js
