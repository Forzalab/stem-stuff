/* Jev J1 + J2 (brain SPRINT §Render track P5; PATH.md §4): the event-line log + the homebrew rule counters, client only.
   🔒 Tony Oct 18: states F flow / S2 impasse / S5 guess-spam / S7 help abuse only; the rest are parked. J5 (🔒 Tony 18:5x) adds S6 + Q.
   🔒 ON FOR ALL (Tony Oct 19, constitution art. 11: log + J5 nudges + J6 seen, no visible flag). Off only with stem-t-off / DNT / GPC
   (exactly as telemetry.js) or ?jev=0 (this device: localStorage stem-jev=0; ?jev=1 clears it). Counters + the memory ring stay on device;
   each item's lines go to PostHog as one "jev_item" { sid, i, code, lines } through window.stemT (telemetry.js: same gates, err= / fam=
   stripped) when the next item opens, or on tab hide / pagehide (the lines so far; the rest go with the next q_open). Never typed text.
   Off = this file defines window.__stemJev (pure, for tests/intent.test.mjs) and does nothing else.
   On  = wraps window.stemT (app.js hook lines, telemetry.js keeps working) + 4 passive input listeners; window.stemJev reads the state.
   Line = "+SS.s  kind  args", seconds since q_open, no typed text. Rules (SPRINT §Jev rules; "ours" = J3 bench start values):
     F   item right, no wrong pick, < 80 s, no Cluck opened by hand → flow run +1; anything else on the item ends the run
     S2  no input for longer than p75 of this item's past steps (q_open or pick → next pick) (< 4 samples: 80 s, ours); depth = gap / p75
     S5  a fast pick (< 5 s after q_open or < 8 s after a wrong pick) that repeats a choice, or 2 fast picks in a row
     S7  Cluck opened by hand < 5 s after q_open (answer views come with the P3 view events)
     S6  ≥ 2 wrong picks on the item, Cluck not opened by hand on it nor on the last 3 items, skill not high (first-try right rate over the
         last 8 items ≤ 0.75, or < 4 items yet; ours). High skill retrying alone = fine (Aleven 2006) → none
     Q   (first item of this visit, no pick, no help, depth ≥ 1: the "refusal" shape, Botelho 2019) OR (left this item unsolved before on
         this device AND depth ≥ 2; Karumbaiah 2018). Past leaves live in localStorage stem-jev-q (code → count), nothing else
   J6 streak signals (log lines only, never sent): "away <s>s via=hide|blur" (back after >= 5 s), "copy stem" (a copy inside the question stem),
   "xmark <choice>" (the student's own X in prove mode), "kept n=<n>" / "kepttap <choice>" (sugar kept rows), q_open's " w=<stem words> ch=<choices>". telemetry.js drops the "_"-names they ride on.
   An open away episode (window blur or tab hide) pauses S2; back after >= 5 s = a fresh step (a shorter blur only paused).
   J5 Cluck nudge, Tier 0 (brain cluck-nudge.md): S2 at depth ≥ 2, S6 and Q may each pick `cluck_say` = Cluck's peek (peek.js
   stemDuck.say, the one seam) carrying one line from copy/nudge-lines.js. On-device only, no LLM, no student turn used.
     budget  one shared budget: P_ONE = the fire chance when one trigger is on; with k of the 3 on, each live state rolls p_k once per
             item so that P(any | all k fire) = P_ONE × share(k); share(3) = SHARE_ALL = 0.85 (ours, J3 tunes), share(1) = 1, linear between
     caps    max 1 per item · ≥ GAP_S (3 min) since the last one · never in F flow (a run alive, no wrong pick on this item) · never while
             typing (a key < TYPING_S ago) · never while hidden · the peek must be free (one duck). A dismiss (the peek put away
             without a tap) doubles the gap (art. 7: a wrong nag costs more than a missed cue). S8 freeze has no detector (SPRINT): none
   J6 "seen", moments earned / trap_beaten (copy/seen-lines.js): on a correct pick, tree(state) → candidates {moment, fam, why}
   (the decision tree below; its wrong-pick and item-end branches are log only; trap_beaten reads the `families` the server sends with a right pick); the fire path below only consumes them: same caps as J5 (1 per item, shared 3 min gap, not in flow / typing /
   hidden) + MAX per session, a QUIET roll (silence is a valid pick), a kind (nod = the duck rises, no words · short · full), a line by the
   error family of the last wrong pick. ev("pick") returns { kind, line, delay } for the page to show; peek.js stemDuck.say carries it.
   Off: stem-seen-off = "1" (permanent) or sessionStorage stem-seen-s = "1" (this session). A "felt hollow" tap sets the session off; 2 of
   those in the first HOLLOW_OF fires set the permanent one. Lines go to a memory ring (stemJev.dump() → JSONL for tools/bench_seen.mjs) only. */
(function () {
  "use strict";
  var W = window;
  var FLOW_S = 80, S2_FALLBACK_S = 80, S2_MIN_N = 4, FAST_OPEN_S = 5, FAST_ERR_S = 8, HELP_S = 5, PAUSE_S = 5, AWAY_S = 5, CAP = 40, HIST_CAP = 20;
  var ACT = { F: "none", S2: "hint_offer", S5: "slow_cue", S6: "cluck_say", S7: "predict_first", Q: "cluck_say" };   // J5 draws cluck_say (S2 from depth 2 too); the rest wait for J4
  var S6_WRONG = 2, S6_HELP_N = 3, SKILL_N = 8, SKILL_MIN_N = 4, SKILL_HIGH = 0.75;
  /* J5 nudge constants, all "ours" (J3 bench start values) */
  /* J6 seen constants, all "ours" (J3 bench start values) */
  var SEEN = { QUIET: 0.3, KIND: { nod: 0.3, short: 0.55, full: 0.15 }, JIT_MS: [600, 1800], MAX: 3, HOLLOW_N: 2, HOLLOW_OF: 5 };
  var RING_CAP = 2000, TITLE_WORDS = 8;
  var NUDGE = { ACT: "cluck_say", STATES: ["S2", "S6", "Q"], P_ONE: 0.7, SHARE_ALL: 0.85, GAP_S: 180, TAKE_S: 2, TYPING_S: 3, S2_DEPTH: 2, Q_DEPTH: 2 };

  /* the share of P_ONE left when k of the n nudge states are on: 1 for one, SHARE_ALL for all, linear between */
  function share(k, n) { n = n || NUDGE.STATES.length; return k <= 1 ? 1 : 1 - (1 - NUDGE.SHARE_ALL) * (k - 1) / (n - 1); }
  /* each live state's roll, once per item, so that 1 − (1 − p)^k = P_ONE × share(k) */
  function chance(k, pOne) {
    pOne = pOne == null ? NUDGE.P_ONE : pOne;
    return k <= 1 ? pOne : 1 - Math.pow(1 - pOne * share(k), 1 / k);
  }

  function median(xs) {
    if (!xs || !xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  /* The J6 decision tree, homebrew: answers the `credit` (earned | lucky) and `error` (slip | misconception) seats; Jev answers the same
     seats with the same shape later, via the one seam (art. 8). Pure. st.node "pick" (default) | "end".
     pick, correct (st.solved): veto → [] on help, s5, or lucky (this pick < FAST_ERR_S after a wrong). Else trap_beaten = solved first try
       and the item has a distractor family (st.traps: /check's `families` on a right pick) the student fell for on an earlier item (st.fams); else earned = wrong >= 1 or deep >= 2.
       Surface candidates { moment: "trap_beaten" | "earned", fam, why }; fam = the beaten family, or the last wrong pick's ("any" when none).
     pick, wrong (st.verdict): log only { moment: "wrong", why: "wrong d=<n> read=slip|misconception fam=<f>" } (misconception = that family
       was wrong on an earlier item). end (st.items [{ ok: first-try right, gap }]): log only { moment: "fatigue" | "harder", why: "end <moment>" }. */
  function tree(st) {
    if (!st) return [];
    if (st.node === "end") {
      var xs = st.items || [], a = xs.slice(0, 3), b = xs.slice(-3), mf = median(a.map(gap));
      if (xs.length >= 6 && mf > 0 && median(b.map(gap)) >= 3 * mf && rate(b) < rate(a)) return [{ moment: "fatigue", fam: "any", why: "end fatigue" }];
      return xs.length >= 4 && xs.slice(-4).every(function (x) { return x.ok && x.gap < FAST_OPEN_S * 2; }) ? [{ moment: "harder", fam: "any", why: "end harder" }] : [];
    }
    var fams = st.fams || [], errs = st.errs || [];
    if (st.verdict === "wrong") {
      var f = st.fam || "any";
      return [{ moment: "wrong", fam: f, why: "wrong d=" + st.wrong + " read=" + (fams.indexOf(f) >= 0 ? "misconception" : "slip") + " fam=" + f }];
    }
    if (!st.solved || st.help || st.s5 || (st.since != null && st.since < FAST_ERR_S)) return [];
    var gp = st.gaps && st.gaps.length ? st.gaps[st.gaps.length - 1].toFixed(1) : "-", hit = "";
    if (!st.wrong) (st.traps || []).forEach(function (t) { if (!hit && fams.indexOf(t) >= 0) hit = t; });
    if (hit) return [{ moment: "trap_beaten", fam: hit, why: "credit=trap_beaten fam=" + hit }];
    if (st.wrong >= 1 || st.deep >= 2) return [{ moment: "earned", fam: errs.length ? errs[errs.length - 1] : "any", why: "credit=earned wrong=" + st.wrong + " deep=" + st.deep + " gap=" + gp }];
    return [];
    function gap(x) { return x.gap; }
    function rate(l) { return l.filter(function (x) { return x.ok; }).length / l.length; }
  }

  function p75(xs) {
    if (!xs || xs.length < S2_MIN_N) return S2_FALLBACK_S;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.ceil(s.length * 0.75) - 1];
  }

  /* one learner session. now() = ms; hist = { code: [step seconds] } (the caller stores it).
     o (J5, all optional): say(line, state) → true when the peek showed it · lines = { S2: [...], S6, Q } · on = the nudge states turned on
     (default all 3) · rand() in [0, 1) · quits = { code: times left unsolved } (the caller stores it)
     o (J6 streak signals, optional): size(code) → { w: stem words, ch: choices } for the q_open line (missing → no field)
     o (J6, optional; without seenLines the seen moments are inert): seenLines = { fam: { <family>: [{ id, text, kind }] }, any: [...] } · seenOff() → true
     when the student turned it off · title(code) → the item's title for {title} · sid = this session's id in the dump */
  function create(now, hist, o) {
    hist = hist || {}; o = o || {};
    var q = null, lines = [], last = null, flowRun = 0, hidden = false, items = 0, keyAt = -Infinity, firsts = [], helps = [];
    var counts = { F: 0, S2: 0, S5: 0, S6: 0, S7: 0, Q: 0 };
    var on = (o.on || NUDGE.STATES).filter(function (s) { return NUDGE.STATES.indexOf(s) >= 0; });
    var pk = chance(on.length), rand = o.rand || Math.random, pool = o.lines || {}, quits = o.quits || {};
    var nz = { n: 0, at: -Infinity, gap: NUDGE.GAP_S, dismissed: 0, taps: 0, last: null, prev: {}, up: false, awayAt: -Infinity };
    var sz = { n: 0, used: {}, last: null }, ring = [], sid = o.sid || "s", itemNo = 0, aw = null;   // aw: the away episode { at, via }
    var fams = {}, recs = [], out = [];                                 // J6 tree, this session: families wrong on earlier items · [{ ok: first-try right, gap }] per item · out: lines not shipped yet, [{ i, c, l }] per item (take)
    function sec(t) { return (t - q.open) / 1000; }
    function log(kind, args) {
      if (!q) return;
      var l = "+" + sec(now()).toFixed(1) + "  " + kind + (args ? "  " + args : "");
      lines.push(l);
      if (lines.length > CAP) lines.shift();
      ring.push({ s: sid, i: itemNo, c: q.code, l: l });                  // J6: the session ring, memory only
      if (ring.length > RING_CAP) ring.shift();
      var g = out[out.length - 1];
      if (!g || g.i !== itemNo) { out.push(g = { i: itemNo, c: q.code, l: [] }); if (out.length > 20) out.shift(); }
      if (g.l.length < 200) g.l.push(l);                                // one event stays small
    }
    /* the lines to ship: the ended items' (all = the open one's so far too, for a tab hide / pagehide); each taken once */
    function take(all) {
      var n = all ? out.length : out.filter(function (g) { return g.i < itemNo; }).length;
      return out.splice(0, n);
    }
    function hit(st, why) {
      counts[st]++; if (st === "S5") q.s5 = true; last = { state: st, action: ACT[st], src: "home", why: why };
      log("jev", st + " " + why);
    }
    function input(kind) {
      var t = now();
      if (kind === "keydown" || kind === "input") keyAt = t;
      if (aw && aw.via === "blur") away("blur", false);                 // fail-safe: input on the page = it has focus again, even if the focus event was missed (never ends a hide)
      if (!q || hidden) return;
      if (t - q.step >= PAUSE_S * 1000) log("pause", Math.round((t - q.step) / 1000) + "s");
      q.step = t; q.depth = 0;
    }
    function ev(name, p) {
      p = p || {};
      var t = now();
      if (name === "q_open") {
        if (q && q.code === p.code) return;                              // a re-render of the same item
        if (q) { flowRun = q.ok && !q.bad ? flowRun + 1 : 0; done(); }  // the item before it ends here
        items++;
        q = { code: p.code, open: t, from: t, step: t, depth: 0, ok: false, bad: false, help: false, picks: [], fast: 0, errAt: 0,
          wrong: 0, first: null, solved: false, firstItem: items === 1, nudged: false, rolled: {}, s6: false, q: false,
          errs: [], gaps: [], deep: 0, s5: false };
        itemNo++;
        lines = []; log("q_open", (p.code || "?") + " " + (p.type || "?") + dims(p.code));
        if (flowRun) hit("F", "run=" + flowRun);
        return;
      }
      if (!q) return;
      if (name === "pick") {
        if (p.verdict !== "correct" && p.verdict !== "wrong") return;
        if (p.verdict === "correct" && Array.isArray(p.families)) q.traps = p.families.filter(function (f) { return typeof f === "string"; });   // the server sends the item's distractor families with a right answer only
        var ds = (t - q.from) / 1000, ch = p.choice == null ? "" : String(p.choice);
        (hist[q.code] = hist[q.code] || []).push(Math.round(ds));
        if (hist[q.code].length > HIST_CAP) hist[q.code].shift();
        log("pick", (ch || "-") + " " + p.verdict + (p.tries_left != null ? " tries_left=" + p.tries_left : "") + (p.error ? " err=" + p.error : ""));
        q.gaps.push(Math.round(ds * 10) / 10);
        var fast = sec(t) < FAST_OPEN_S || (q.errAt && (t - q.errAt) / 1000 < FAST_ERR_S);
        var again = ch && q.picks.indexOf(ch) >= 0;
        q.fast = fast ? q.fast + 1 : 0;
        if (fast && (again || q.fast >= 2)) hit("S5", again ? "repeat " + ch : "fast x" + q.fast);
        if (ch) q.picks.push(ch);
        if (q.first == null) q.first = p.verdict === "correct";
        if (p.verdict === "wrong") {
          q.bad = true; q.errAt = t; q.wrong++; if (p.error) q.errs.push(String(p.error));
          tlog(tree({ verdict: "wrong", wrong: q.wrong, fam: p.error ? String(p.error) : "", fams: Object.keys(fams) }));
        }
        else { q.solved = true; if (!q.bad && !q.help && sec(t) < FLOW_S) q.ok = true; }
        q.from = q.step = t; q.depth = 0;
        if (!q.s6 && s6()) { q.s6 = true; hit("S6", "wrong=" + q.wrong); }
        nudges();
        return p.verdict === "correct" ? seen() : undefined;
      }
      if (name === "cluck_open") {
        if (p.auto) return;                                              // the desktop opens it by itself: not a help request
        q.help = true; q.ok = false;
        if (nz.up) nudgeEnd(true);                                       // Cluck opened with the nudge still up: it worked
        else if ((t - nz.awayAt) / 1000 < NUDGE.TAKE_S) {                // the tap that opened Cluck put the nudge away first (Tony's dump, Oct 19): taken, not a dismiss
          nz.awayAt = -Infinity; nz.gap /= 2; nz.dismissed--; nz.taps++; log("jev", "nudge took cluck gap=" + nz.gap + "s");
        }
        log("cluck", "open " + (p.tab || ""));
        if (sec(t) < HELP_S) hit("S7", "cluck at " + sec(t).toFixed(1) + "s");
        return;
      }
      if (name === "cluck_dwell") log("cluck", "close");
      if (name === "cluck_more") log("cluck", "more " + (p.act || "?"));    // the sheet's scroll-down hint: shown / tap / bottom (app.js clMore), log only
      if (name === "_xmark") log("xmark", p.choice == null ? "-" : String(p.choice));   // the student's own X (prove mode); never the auto strike
      if (name === "_kept") log("kept", "n=" + (p.n | 0));              // sugar kept rows after a miss (app.js keep()); a count only, log only
      if (name === "_kepttap") log("kepttap", p.choice == null ? "-" : String(p.choice));   // a tap on a kept row (only the first toasts)
      if (name === "_ob") log("ob", String(p.beat || "-") + " " + (p.n || 1));   // an onboarding note shown (app.js rwTip: right, three, miss, redo); log only
      if (name === "_copy") log("copy", "stem");                          // a copy inside the question stem (the wrapper checks where); never the text
    }
    /* J6 streak signals, log only: q_open's " w=<stem words> ch=<choices>" (a field with no value is left out; d=<difficulty> appends here when a bank carries one) */
    function dims(code) {
      var z = null; try { z = o.size && o.size(code); } catch (e) { /* ignore */ }
      return z ? (z.w != null ? " w=" + z.w : "") + (z.ch != null ? " ch=" + z.ch : "") : "";
    }
    /* away from the item: "hide" (tab hidden) or "blur" (window lost focus, still visible); on = leaving. One episode from the first leave to
       the return; a blur followed by a hide is one (via=hide wins). Back after >= AWAY_S: "away <s>s via=..". Shorter: no line */
    function away(kind, on) {
      var t = now();
      if (on) { if (!aw) aw = { at: t, via: kind }; else if (kind === "hide") aw.via = "hide"; return; }
      if (!aw || (kind === "blur" && aw.via === "hide")) return;          // a focus while still hidden is not the return: the show is
      var s = (t - aw.at) / 1000, via = aw.via; aw = null;
      if (s >= AWAY_S) { log("away", Math.round(s) + "s via=" + via); if (q) { q.step = t; q.depth = 0; } }   // back from a real away: a fresh step (a short blur only paused S2)
    }
    /* called on a timer: S2 fires once per depth step; Q once per item; then a nudge may go */
    function tick() {
      if (!q || hidden) return;
      var lim = p75(hist[q.code]), d = Math.floor((now() - q.step) / 1000 / lim);
      if (d > q.depth && !aw) {                                          // an open away episode (blur or hide) pauses S2
        q.depth = d; if (d > q.deep) q.deep = d; hit("S2", "depth=" + d + " p75=" + lim + "s");
      }
      if (!q.q && qRule()) { q.q = true; hit("Q", q.firstItem && !q.picks.length ? "first item, no pick" : "left before x" + quits[q.code]); }
      nudges();
    }
    function vis(isHidden) {
      if (!q || hidden === isHidden) return;
      hidden = isHidden; away("hide", isHidden);
      if (!isHidden) { q.step = now(); q.depth = 0; }                   // back from away: a fresh step, never an impasse
    }
    function tlog(cs) { cs.forEach(function (c) { if (c.moment !== "earned" && c.moment !== "trap_beaten") log("tree", c.why); }); }   // the log-only branches
    /* the item ends (next item): skill + help history for S6 */
    function done() {
      q.errs.forEach(function (f) { fams[f] = 1; });
      if (q.gaps.length && recs.length < 1000) recs.push({ ok: q.first === true, gap: median(q.gaps) });
      tlog(tree({ node: "end", items: recs }));
      if (q.first != null) { firsts.push(q.first); if (firsts.length > SKILL_N) firsts.shift(); }
      helps.push(q.help); if (helps.length > S6_HELP_N) helps.shift();
    }
    function s6() {
      if (q.wrong < S6_WRONG || q.help || q.solved || helps.indexOf(true) >= 0) return false;
      if (firsts.length < SKILL_MIN_N) return true;
      return firsts.filter(Boolean).length / firsts.length <= SKILL_HIGH;
    }
    function qRule() {
      if (q.help || q.solved) return false;
      return (q.firstItem && !q.picks.length && q.depth >= 1) || ((quits[q.code] || 0) >= 1 && q.depth >= NUDGE.Q_DEPTH);
    }

    /* ---- J5: the nudge gate. The live states in table order; each rolls once per item; the caps hold a roll for later ---- */
    function live() {
      if (q.help || q.solved) return [];
      return on.filter(function (st) { return st === "S2" ? q.depth >= NUDGE.S2_DEPTH : st === "S6" ? q.s6 : q.q; });
    }
    function block(t) {
      if (q.nudged) return "item";
      if (hidden) return "hidden";
      if (flowRun > 0 && !q.bad) return "flow";
      if ((t - keyAt) / 1000 < NUDGE.TYPING_S) return "typing";
      if ((t - nz.at) / 1000 < nz.gap) return "gap";
      return "";
    }
    function nudges() {
      var sts = live(), t = now();
      if (!sts.length || block(t)) return;
      for (var i = 0; i < sts.length; i++) {
        var st = sts[i];
        if (q.rolled[st]) continue;
        q.rolled[st] = 1;
        if (rand() >= pk) { log("jev", "nudge " + st + " pass"); continue; }
        var line = pick(st);
        if (!line || !o.say || !o.say(line, st)) { log("jev", "nudge " + st + " busy"); continue; }
        q.nudged = true; nz.n++; nz.at = t; nz.up = true; nz.prev[st] = line;
        nz.last = { state: st, line: line, code: q.code };
        last = { state: st, action: NUDGE.ACT, src: "home", why: "nudge", line: line };
        log("jev", "nudge " + st + " say");
        return;
      }
    }
    function pick(st) {
      var all = pool[st] || [], xs = all.filter(function (l) { return l !== nz.prev[st]; });   // never the same line twice in a row
      if (!xs.length) xs = all;
      return xs[Math.floor(rand() * xs.length)] || "";
    }
    /* the peek went: a tap = taken; put away without a tap = a dismiss → the gap doubles */
    function nudgeEnd(tapped) {
      if (!nz.up) return;
      nz.up = false;
      if (tapped) { nz.taps++; log("jev", "nudge tap"); }
      else { nz.dismissed++; nz.gap *= 2; nz.awayAt = now(); log("jev", "nudge away gap=" + nz.gap + "s"); }   // undone if Cluck opens within TAKE_S (cluck_open)
    }
    /* ---- J6: the seen fire path. Consumes tree's candidates; never looks at the rule's internals ---- */
    function words(x) { return x.split(/\s+/).filter(Boolean).length; }
    function fill(text, title) {                                        // "" = unusable: no title, or the filled line runs past 8 words
      if (text.indexOf("{title}") < 0) return text;
      if (!title) return "";
      var f = text.replace(/\{title\}/g, title);
      return words(f) > TITLE_WORDS ? "" : f;
    }
    function tpls(fam, kind, title) {                                   // unused templates of this kind, usable now: the family's, else the any pool
      var P = o.seenLines;
      return [(P.fam || {})[fam] || [], P.any || []].map(function (xs) {
        return xs.filter(function (t) { return t.kind === kind && !sz.used[t.id] && fill(t.text, title); });
      });
    }
    function seen() {
      var cs = tree({ solved: q.solved, wrong: q.wrong, deep: q.deep, help: q.help, s5: q.s5, gaps: q.gaps, errs: q.errs, traps: q.traps || [], fams: Object.keys(fams),
        since: q.errAt ? (now() - q.errAt) / 1000 : null }), t = now();
      if (!cs.length || !o.seenLines || (o.seenOff && o.seenOff()) || q.rolled.seen || sz.n >= SEEN.MAX || block(t)) return null;
      q.rolled.seen = 1;                                                 // one roll per item: a quiet pick is the item's pick
      if (rand() < SEEN.QUIET) { log("seen", cs[0].moment + " quiet"); return null; }
      var K = SEEN.KIND, r = rand(), kind = r < K.nod ? "nod" : r < K.nod + K.short ? "short" : "full", line = "", id = "";
      if (kind !== "nod") {
        var title = o.title ? String(o.title(q.code) || "").trim().replace(/\s+/g, " ") : "", c = tpls(cs[0].fam, kind, title);
        var xs = c[0].length ? c[0] : c[1], tp = xs[Math.floor(rand() * xs.length)];
        if (!tp) { log("seen", cs[0].moment + " none"); return null; }
        line = fill(tp.text, title); id = tp.id; sz.used[id] = 1;
      }
      sz.n++; nz.at = t; q.nudged = true;                               // the shared gap + 1 per item
      sz.last = { kind: kind, line: line, id: id, fam: cs[0].fam, code: q.code, why: cs[0].why };
      log("seen", cs[0].moment + " " + kind + (id ? " " + id : ""));
      return { kind: kind, line: line, delay: SEEN.JIT_MS[0] + Math.floor(rand() * (SEEN.JIT_MS[1] - SEEN.JIT_MS[0] + 1)), fam: cs[0].fam, id: id };
    }
    /* the page goes with this item open and unsolved: one "left before" for Q next time */
    function leave() {
      if (!q || q.solved) return false;
      quits[q.code] = (quits[q.code] || 0) + 1;
      return true;
    }
    return {
      ev: ev, input: input, tick: tick, vis: vis, away: away, nudgeEnd: nudgeEnd, leave: leave, take: take,
      dump: function () { return ring.map(function (e) { return JSON.stringify(e); }).join("\n"); },     // JSONL, for tools/bench_seen.mjs
      state: function () {
        return { last: last, counts: Object.assign({}, counts), flowRun: flowRun, lines: lines.slice(), code: q && q.code,
          nudge: { n: nz.n, gap: nz.gap, dismissed: nz.dismissed, taps: nz.taps, last: nz.last, p: pk, on: on.slice() },
          seen: { n: sz.n, used: Object.keys(sz.used), last: sz.last } };
      }
    };
  }
  W.__stemJev = { create: create, p75: p75, ACT: ACT, NUDGE: NUDGE, share: share, chance: chance, tree: tree, SEEN: SEEN };

  /* ---- on for all (art. 11); ?jev=0 = off on this device, ?jev=1 = back on ---- */
  var on = false;
  try {
    var f = new URLSearchParams(location.search).get("jev");
    if (f === "0") localStorage.setItem("stem-jev", "0");
    if (f === "1") localStorage.removeItem("stem-jev");
    var tm = W.__stemTelemetry;
    on = localStorage.getItem("stem-jev") !== "0" && !(tm && (tm.optedOut(navigator, W) || tm.userOff(localStorage)));
  } catch (e) { on = false; }
  if (!on) return;

  var HK = "stem-jev-h", QK = "stem-jev-q";
  function get(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } }
  var hist = get(HK), quits = get(QK);
  /* J6 off switches: stem-seen-off (permanent, localStorage) and stem-seen-s (this session, sessionStorage; memory when blocked) */
  var SOFF = "stem-seen-off", SSES = "stem-seen-s", SH = "stem-seen-h", sessOff = false;
  function seenOff() {
    try { return sessOff || localStorage.getItem(SOFF) === "1" || sessionStorage.getItem(SSES) === "1"; } catch (e) { return sessOff; }
  }
  /* a "felt hollow" tap: this session off now; HOLLOW_N of them within the first HOLLOW_OF fires: off for good. { f: fires, h: hollows } */
  function hollow() {
    sessOff = true;
    try { sessionStorage.setItem(SSES, "1"); } catch (e) { /* memory flag holds */ }
    var h = get(SH); h.h = (h.h || 0) + 1; put(SH, h);
    if (h.h >= SEEN.HOLLOW_N && (h.f || 0) <= SEEN.HOLLOW_OF) { try { localStorage.setItem(SOFF, "1"); } catch (e) { /* blocked */ } }
  }
  var save = function () { put(HK, hist); }, sid = "s" + Math.random().toString(36).slice(2, 8);
  /* J5, the one seam to the peek (peek.js stemDuck.say): Jev decides, the peek only shows the line and tells back how it went */
  var jev = create(function () { return performance.now(); }, hist, {
    lines: W.__stemNudgeLines, quits: quits, seenLines: W.__stemSeenLines, seenOff: seenOff, sid: sid,
    title: function (code) { var b = W.stemBank, p = b && b.get && b.get(code); return p && typeof p.title === "string" ? p.title : ""; },
    size: function (code) {                                          // J6: the item's stem words + choice count (bank items; an upload has no bank entry → none)
      var b = W.stemBank, p = b && b.get && b.get(code), w = 0;
      if (!p) return null;
      (p.body || []).forEach(function (x) { if (x && x.type === "text" && typeof x.md === "string") w += x.md.split(/\s+/).filter(Boolean).length; });
      return { w: w, ch: Array.isArray(p.choices) ? p.choices.length : null };
    },
    rand: typeof W.__stemJevRand === "function" ? W.__stemJevRand : Math.random,   // tests pin the roll; the app never sets it
    say: function (line) {
      var d = W.stemDuck;
      return !!(d && d.say && d.say(line, { onTap: function () { jev.nudgeEnd(true); }, onAway: function () { jev.nudgeEnd(false); } }));
    }
  });
  /* J6: the green row has settled; show it after r.delay, unless the page moved on (another item, or switched off meanwhile) */
  function seenShow(r, code) {
    setTimeout(function () {
      try {
        var d = W.stemDuck;
        if (jev.state().code !== code || seenOff() || !(d && d.say)) return;
        if (d.say(r.line, { nod: r.kind === "nod", onHollow: hollow })) { var h = get(SH); h.f = (h.f || 0) + 1; put(SH, h); }
      } catch (e) { /* never break the app */ }
    }, r.delay);
  }
  var old = W.stemT;
  /* the lines to PostHog: one "jev_item" per taken item, through telemetry.js's stemT (its gates + strip rules; a no-op without a key) */
  function ship(all) {
    try { jev.take(all).forEach(function (g) { if (old) old("jev_item", { sid: sid, i: g.i, code: g.c, lines: g.l }); }); } catch (e) { /* never break the app */ }
  }
  W.stemT = function (name, props) {
    try {
      var r = jev.ev(name, props);
      if (name === "q_open") ship(false);                                // the item before it ended
      if (name === "pick") save();
      if (r && r.kind) seenShow(r, jev.state().code);
    } catch (e) { /* never break the app */ }
    return old && old(name, props);
  };
  ["pointerdown", "keydown", "input", "wheel"].forEach(function (k) {
    document.addEventListener(k, function () { try { jev.input(k); } catch (e) { /* ignore */ } }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () { jev.vis(document.hidden); if (document.hidden) ship(true); });   // after telemetry.js's tab_away / bail
  /* J6: a copy inside the question stem (#blocks: not the choices, not Cluck). Where only, never the copied text */
  document.addEventListener("copy", function (e) {
    try {
      var s = W.getSelection && W.getSelection(), b = document.getElementById("blocks"), t = e && e.target;
      if (s && s.rangeCount && b && b.contains(s.getRangeAt(0).commonAncestorContainer) && !(t && /^(INPUT|TEXTAREA)$/.test(t.tagName))) jev.ev("_copy");
    } catch (x) { /* ignore */ }
  }, { capture: true, passive: true });
  if (W.addEventListener) {                                           // blur / focus: a desktop window switch keeps the tab visible, so only they see it (jev.away times it)
    W.addEventListener("pagehide", function () { if (jev.leave()) put(QK, quits); ship(true); });
    W.addEventListener("blur", function () { jev.away("blur", true); });
    W.addEventListener("focus", function () { jev.away("blur", false); });
  }
  setInterval(jev.tick, 5000);
  W.stemJev = jev.state; W.stemJev.dump = jev.dump;
})();
