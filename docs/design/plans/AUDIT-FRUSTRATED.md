# AUDIT-FRUSTRATED — the §1 student walks live prod (agent F, D51/D65)

Live https://stem-stuff.vercel.app/ , code BANK_P2X, Oct 7 2026 ~13:15–13:35 UTC. No fixes, observation only.
Lens: Playwright Chromium iPhone 15 393×852 (hasTouch, isMobile, DPR 2) = main; WebKitGTK 390×844 (load, pick, Cluck); desktop 1280×800 (3 steps).
Scripts (not in repo): scratch `F/walk.js`, `F/wk.py`, `F/desk.js`. Raw log: scratch `F/walk-log.txt`.
Shots: `design/shots/genui/audit-NN-<step>-iph[-full].png`, `audit-wk-*.png` (WebKit, full-document), `audit-dN-*-desk.png`.
Cluck calls spent: 10 total (main walk 5 auto `explain`, 3 aborted earlier walk runs 1 each, WebKit 1, desktop 1). Under the 15 cap. No `chat` calls.

Note on the walk: every run lands on a DIFFERENT first question (sugar-mode shuffle), so Q numbers below are walk positions, not bank IDs. The walk script picks A, then B; a 5-choice MC gives 2 tries, so most questions ended "No tries left" — that is the realistic midnight path for her, not a script bug.

Severity: 3 = she closes the tab / feels judged; 2 = real friction, she grumbles and continues; 1 = polish.
§1 technique numbers per BRIEF-HEADER §1 (1 wise feedback … 11 validating empathy). "Banned" = §1 banned list.

---

## Steps

### Q1 — load, read, pick, retry, last try, Cluck

**S01 load (splash)** — shot `audit-01-load-splash-iph.png`
(a) "Ok it's loading... blank dark screen with a squiggle. Is this the right link?"
(b) Splash `#splash` has no text by design (SPLASH.md). Code input visible at 0.92–1.44 s (3 runs: 1247 / 922 / 1440 ms). Fine on lab wifi; on a capped bus connection it will be longer.
(c) 1 (d) 10 fast+light — PASS at measured speed.

**S02 entry screen** — `audit-02-load-entry-iph.png`
(a) "It wants a code? What code. Did the professor give me a code? I just clicked a link."
(b) `#entry`: a bare text field `#code` placeholder "e.g. CALC1_E01" (a calc example on a physics link). `#entry` innerText read empty to a script (text lives in placeholder/aria only). A student arriving from a shared link must type an uppercase code with underscore on a phone keyboard.
(c) 2 (d) 10 (no login wall, but a code wall), 7 agency (nothing to grab).

**S03 typing the code** — `audit-03-type-code-iph.png`
(a) "Shift, B, A, N, K, underscore — where's the underscore on this keyboard — P, 2, X. Ugh."
(b) `#code` accepted lowercase `bank_p2x` (good, case-insensitive). Underscore needs the 123 → #+= layer on iOS = ~3 extra taps. 9 chars ≈ 13 taps.
(c) 2 (d) 10.

**S04 first question appears** — `audit-04-q1-read-iph.png`, `-full.png`
(a) "Ok. Practice Exam 2, Question 12... wait, I haven't done 1 through 11. Did I skip something?"
(b) Go → first `.opt` in DOM 545–710 ms; first question at 3.0–4.5 s after navigation (incl. typing). `.ptitle` shows the exam-internal number ("Question 12/19/11") on what is her question 1 → feels like she's behind. Progress bar row `.rw-tap` (y=74, 365×52) is an empty black bar with a "1" star — means nothing yet.
(c) 2 (d) 2 normalize (signals "you're behind"), 10.

**S05 reading the stem** — `audit-04-q1-read-iph-full.png`
(a) "'Choose all changes that make gravity weaker.' Then: 'By what factor does it change?' Which one is the question?? And why do I need g = 9.80 for an orbit?"
(b) Sugar-mode stems keep the ORIGINAL multi-select lead ("Choose all…", "Choose all that have a component…") then ask a single-answer sub-question: PHYS_Z5BC/Z5BA/Z5BB/Z5BE, PHYS_2NEA. Plus a boilerplate "Use g = 9.80 m/s²" on gravitation/energy-unit questions that never use g (PHYS_Z5B*, PHYS_REFE). Paragraph lines measured [3,3,1], [5,2,1], [3,9] (PHYS_PUZ: 9 lines in one paragraph).
(c) 3 (d) 10 (>3 lines), 7, 11 (contradiction reads as a trick).

**S06 notes tooltip covers the question** — `audit-05-q1-select-iph.png`, earlier explore shot
(a) "A box popped up over the words I was reading. 'Tap here to write notes.' I don't want notes, I want to read."
(b) `obToast(1, "Tap here to write notes.", fab)` fires 700 ms after first FAB render (app.js:2078) and sits over option E / the final stem line ("Halfway between… what is the vertical part of the seat force?" was hidden in one run). `#padFab` "Open notes" 159×56 at y≈728–780 permanently overlaps the bottom-right of the content; the left "Show video" tab `.rtab` (44×96 at x=0,y=740) overlaps option E's letter badge.
(c) 3 (d) 10, 7 (guide without feeling guided).

**S07 tap a choice (select)** — `audit-05-q1-select-iph.png`, WebKit `audit-wk-selected-fold.png`
(a) "I tapped A. Nothing happened? Oh, there's a blue arrow now. So I have to tap twice?"
(b) Two-step commit: `.opt` tap only selects; a per-option `.btn.btn-go.send` ("Check A", 48×48) appears INSIDE the row. Selected bg rgb(22,36,58) → rgb(32,48,74); the other 4 rows' text dims (uneven darkening: selected brightens, rest fade toward the disabled look, so it reads like the others got locked out). No movement measured (y unchanged, 54 px rows) — no layout jump. Good.
(c) 2 (d) 7 (the MC pick IS the prediction — a second confirm tap is friction), 10.

**S08 wrong pick, try 1** — `audit-06-q1-try1-wrong-iph.png`, `-full.png`
(a) "Red X. Crossed out. My answer is literally crossed out in red."
(b) `.opt.wrong`: red dashed border + red circled X icon + `line-through` on her answer. Verdict 167–384 ms (fast). The feedback line `#fb` ("Counted only the radius. The doubled mass doubles it again.") lands BELOW the fold under 4 more options; on screen she sees only the red X. Wise-feedback line missing; it is a correct but blunt diagnosis.
(c) 3 (d) Banned "lone X icon"; 4 interpret-don't-grade; 1 wise feedback missing.

**S09 wrong-pick feedback copy** — `audit-06-q1-try1-wrong-iph-full.png`, `audit-14-q2-try1-wrong-iph-full.png`
(a) "QUACK. Okay duck, very funny, I'm failing here."
(b) `#fb` first line starts with "QUACK." on wrong picks (PHYS_ZAF, PHYS_VEA, PHYS_PUZ, PHYS_ZJ8). D68 allows QUACK as texture, but §1-8 says never a joke in the first line of a wrong-pick message and humor rule (e) no jokes after a wrong pick.
(c) 2 (d) 8 dose, humor (e), 1.

**S10 retry (try 2)** — `audit-07-q1-try2-wrong-iph.png`
(a) "Two red X's now. And it says 'No tries left. Ask Tony about PHYS_Z5BC.' Who is Tony?? I'm not asking anybody."
(b) After 2 wrong on a 5-choice MC, `p.verdict.lock` "No tries left. Ask Tony about <CODE>." (app.js:906, :1086 — still in main). Locks the question; the right answer is never shown or tapped, so the loop never closes. Bridge to a human framed as the failure exit.
(c) 3 (d) 5 error = a step (no retry to closure), 6 private first step, 9 forgiving loops.

**S11 last try = locked** — `audit-07-q1-try2-wrong-iph.png`
(a) "So I just... lost that one. Great."
(b) Remaining `.opt` stay tappable-looking but disabled; no "see why" affordance near the options; the lock message is below the fold behind `#padFab`.
(c) 3 (d) 5, 4.

**S12 Cluck chip while writing** — `audit-08-q1-cluck-chip-iph.png`
(a) "'Cluck is writing the steps…' ok... still writing... still writing..."
(b) `#wish .wchip` reads "Cluck is writing the steps…" for 15.2 s after the auto `explain` POST (response headers in 75–181 ms, but the chip only flips to "Show Cluck's steps" when the whole text is done). The chip is under the fold, under `#padFab`.
(c) 3 (d) 10 (>3 s), 7.

**S13 open Cluck** — `audit-09-q1-cluck-open-iph.png`, `-full.png`
(a) "Finally. Oh it's a whole other screen."
(b) Tap → sheet `#cluck.cl` 1.9 s to settle; full-screen takeover on phone. Header in Chromium: close `.cl-x` at x=347 w=44 → right edge 391 of 393, orange header bar bleeds off the right edge (no 16 px gutter). WebKit header reads "Similar solution steps", Chromium reads "Cluck" — same component, different title.
(c) 2 (d) 10, 7.

**S14 read the stream** — `audit-10-q1-cluck-stream-5s-iph.png`, WebKit `audit-wk-cluck.png`
(a) "'POOF! You rubbed the lamp wrong'. Wow. Even the duck thinks I did it wrong. And this is so long."
(b) First line of a wrong-pick Cluck message is a joke ("POOF! You rubbed the lamp wrong, but a wish is a wish. (adjusts tiny glasses)") — both engines, two different questions. Then 3 paragraphs + numbered steps: >25 lines before any "show more". Monospace italic sub-label "perpendicular to road" low contrast on dark brown.
(c) 3 (d) 8 dose ("never in the first line of a wrong-pick message"), humor (e), 10 (≤3 lines), Cluck ≤2 lines viz rule.

**S15 "verify b4 use lol" under every Cluck turn** — `audit-wk-cluck.png`, `audit-d2-picked-desk.png`
(a) "'verify b4 use lol'?? So the tutor might be wrong too? How am I supposed to check it, that's why I'm here."
(b) Static disclaimer line in brainrot slang under the typing indicator, every Cluck message.
(c) 2 (d) humor (h) brainrot never carries meaning (here it carries a trust disclaimer), 6.

**S16 close Cluck** — `audit-11-q1-cluck-closed-iph.png`
(a) "Where's the X... it's right on the edge. I hit it and nothing. Again."
(b) Playwright `tap` on `#cluck .cl-x` failed (3 s timeout; intercepted / at the viewport edge); Escape closed it. While the sheet is open, `.cl-x` (in `aside#cluck`) intercepts taps on `#qnext` — Next is unreachable until Cluck is closed (first run: 30 s stuck).
(c) 3 (d) 7, 10.

**S17 Next** — `audit-12-q2-arrive-iph.png`
(a) "Next. Okay. Different question at least."
(b) `#qnext` → new question 760–1028 ms (9 samples). No "you finished that one" moment between Qs: after a lock she gets no closure, just the next stem.
(c) 1 (d) 5.

### Q2–Q10 — the grind

**S18 Q2 arrive** — `audit-12-q2-arrive-iph.png`
(a) "Banked curve again. Wall of text. Five lines then six."
(b) PHYS_VEA paragraphs [3,5] lines; first option at y=766 (fold 852) — choices start at the fold.
(c) 2 (d) 10.

**S19 Q2 select** — `audit-13-q2-select-iph.png`
(a) "Tap, then the arrow. Still annoying."
(b) Same two-step `.send`; the 48×48 arrow sits on top of the right side of a long option text.
(c) 1 (d) 7.

**S20 Q2 wrong** — `audit-14-q2-try1-wrong-iph.png`, `-full.png`
(a) "'QUACK. That's the no-friction answer. Where does friction enter?' Okay that's actually a good hint. But QUACK first, really?"
(b) Hint is a Socratic question (good, §1-7), QUACK-first line again; 2nd `explain` auto-fired (Cluck call #2).
(c) 2 (d) 8, 1.

**S21 Q2 locked** — `audit-15-q2-try2-wrong-iph.png`
(a) "Ask Tony again. Stop telling me to ask Tony."
(b) Same lock line; feedback "Is v²/(rg) already the whole answer?" is a question after she has NO tries left — she cannot act on it.
(c) 3 (d) 5, 6.

**S22 Q3 arrive** — `audit-16-q3-arrive-iph.png`
(a) "Kilowatt-hour. With g = 9.80. Why is g here."
(b) PHYS_REFE: energy-unit question with "Use g = 9.80 m/s²".
(c) 1 (d) 10 (cut everything that doesn't serve).

**S23 Q3 select** — `audit-17-q3-select-iph.png`
(a) "Fine."
(b) Option rows fully on screen (first at y=392); selection dims others (see S07).
(c) 1 (d) 7.

**S24 Q3 wrong** — `audit-18-q3-try1-wrong-iph.png`, `-full.png`
(a) "'Forgot the kilo.' Yeah okay, that's fair, I did."
(b) Good concrete diagnosis (§1-4 interpret) — but still rendered under a red line-through X on her pick.
(c) 2 (d) banned lone X; 4 partially met.

**S25 Q3 locked** — `audit-19-q3-try2-wrong-iph.png`
(a) "'Used the energy in joules as hours.' What does that even mean."
(b) Feedback line is a fragment with no subject; 3 wrongs in a row now, no stress reappraisal line anywhere in the session (§1-3 once per session).
(c) 2 (d) 3, 2.

**S26 Q4 arrive + read** — `audit-20-q4-select-iph.png`
(a) "Nine lines. I'm not reading nine lines at midnight."
(b) PHYS_PUZ paragraph 2 = 9 lines; first option at y=971 (fully below the 852 fold).
(c) 3 (d) 10.

**S27 Q4 wrong** — `audit-21-q4-try1-wrong-iph.png`, `-full.png`
(a) "QUACK. Altitude vs radius. Oh."
(b) Good hint, QUACK-first again. Cluck call #4 auto.
(c) 2 (d) 8.

**S28 Q4 right on try 2** — `audit-22-q4-try2-right-iph.png`
(a) "I got it! ...did I? Where's the yay?"
(b) `.opt.right` pulse (TK1) but `#fb` empty and the red-dashed wrong row stays directly above the green one; the coin counter "2" next to a star "1" means nothing to her. Win moment = small.
(c) 2 (d) 5 (the win is closing the loop — barely celebrated), 8 (joke belongs here, none).

**S29 Q5 = same question again** — `audit-23-q5-select-iph.png`
(a) "Wait, didn't I just do this? 'Which changes weaken gravity'... again?"
(b) In 10 questions, "Question 19: which changes weaken gravity" appeared 4× (PHYS_Z5BC, Z5BB, Z5BA, Z5BE) with the identical title and identical first paragraph; only the second sentence differs. Looks like a repeat bug.
(c) 2 (d) 7, 10.

**S30 Q5 wrong ×2** — `audit-24-q5-try1-wrong-iph.png`, `audit-25-q5-try2-wrong-iph.png`
(a) "'Thought gravity does not depend on distance.' I did NOT think that. I just tapped the first one."
(b) Misconception tag stated as fact about her thinking ("Thought…") — feels like being told what she believes.
(c) 2 (d) 11 (praise the right part), 4.

**S31 Q6 wrong then right; chip changes name** — `audit-27-q6-try1-wrong-iph.png`, `audit-28-q6-try2-right-iph.png`
(a) "Now it says 'Explain my mistake'. Before it was 'Show Cluck's steps'. Is that a different thing?"
(b) After 5 auto explains (WISH_AUTO cap) `#wish .wchip` renames to "Explain my mistake" and stops auto-starting. Label "my mistake" = the shame word on a button.
(c) 2 (d) 1, 6.

**S32 Q7 right first try** — `audit-29-q7-select-iph.png`, `audit-30-q7-try1-right-iph.png`, `-full.png`
(a) "Yes! First try! ...that's it? No sound, no words?"
(b) `#fb` empty, `#wish` empty on a first-try right. Only the TK1 pulse + coin bump. No "nice reasoning" line (praise the strategy).
(c) 2 (d) 8 (affirm moment = where jokes live), humor (g).

**S33 Q8 wrong ×2** — `audit-31-q8-select-iph.png`, `audit-32-…`, `audit-33-…`
(a) "Same gravity question, 4th time, still wrong. I'm not a physics person."
(b) Verdicts 176–360 ms; 2nd feedback "Mixed up force with acceleration" after lock; no normalize line ("this one trips most people") anywhere in 10 Qs.
(c) 3 (d) 2, 3.

**S34 Q9 text wall** — `audit-34-q9-select-iph.png`
(a) "NINE lines again. And the title is just 'Question 1'."
(b) PHYS_ZJ8 paragraph = 9 lines; `.ptitle` "Practice Exam 2, Question 1" (no short name, unlike its siblings).
(c) 2 (d) 10.

**S35 Q9 wrong** — `audit-35-q9-try1-wrong-iph.png`, `audit-36-…`
(a) "'Check units.' Ok but how."
(b) QUACK-first; Socratic hints only (no worked contrast), then lock.
(c) 2 (d) 8, 4.

**S36 Q10 wrong ×2** — `audit-37-q10-select-iph.png`, `audit-38-…`, `audit-39-q10-try2-wrong-iph.png`
(a) "Kilowatt-hour AGAIN. I got this one wrong before too."
(b) PHYS_REFD ≈ PHYS_REFE (Q3) same title "what equals one kilowatt-hour". 2 of 10 positions are the same skill; 4 of 10 are Q19 variants → 6/10 repeats.
(c) 2 (d) 7.

**S37 update bar** — n/a
(a) "—"
(b) No update/refresh bar appeared during the session (`[class*=update]` none). Nothing to log; not observed.
(c) – (d) –.

**S38 question list** — `audit-40-qlist-open-iph.png`, `-full.png`
(a) "Oh god. A list of everything I failed, crossed out, with two red X's each."
(b) `#qlist`: every finished row is `line-through` (wrong AND right), 7 of 10 rows show "✕ ✕" in red. Titles wrap to 3 lines. The top bar now holds 5 buttons (`#qlistBtn`, `#qshuf`, `#qredo`, `#qprev`, `#qnext`) — right gutter 11 px instead of 16. The panel overlays the lock line "No tries left. Ask Tony about PHYS_REFD." still visible below.
(c) 3 (d) banned red wall / lone X; 9 forgiving loops; 2.

**S39 shuffle button** — `audit-41-qlist-shuffle-iph.png`
(a) "What does this squiggly arrow do? ...it just reordered the list. Ok?"
(b) `#qshuf` is icon-only (no label), reorders silently; no toast. After shuffle the list starts at a different item but the current Q stays — unclear what changed.
(c) 1 (d) 7.

**S40 Redo my misses** — `audit-42-redo-misses-iph.png`, `-full.png`
(a) "Redo misses. Ok, second chance. But it's the gravity one again, and the top says 'Exit redo' like I'm in jail."
(b) `#qredo` (icon-only in the list header, label "Redo misses" in title attr) → redo round: header becomes "Redo" + "Exit redo" + prev/next; first redo item PHYS_Z5BA which she got RIGHT on try 2 (counts as a miss). Good: fresh tries, no X marks carried over. Streak flame "3" appears (unclear why: she missed 7/10).
(c) 2 (d) 9 (good: forgiving), 5 (good), 7 (label).

**S41 data cost** — (no shot; log)
(a) "Why is my data going down so fast."
(b) Sum of response content-length in one 10-question walk ≈ 2.27 MB, dominated by youtube-nocookie embeds (4 players load behind `.rtab` "Show video" even when hidden; desktop shows "Video unavailable" tiles, `audit-d2-picked-desk.png`).
(c) 2 (d) 10 (capped plan).

**S42 desktop read** — `audit-d1-q1-read-desk.png`, `-full.png`
(a) (on a library PC) "Nice, it's side by side."
(b) 1280×800 two-column; "20 XP to level 2" header OK; right panel shows 3 YouTube tiles, 1 = "Video unavailable / Skip video" on first load.
(c) 2 (d) 10.

**S43 desktop pick → Cluck** — `audit-d2-picked-desk.png`
(a) "It opened by itself. 'verify b4 use lol'."
(b) Desktop auto-opens Cluck on a wrong pick (by design, sideMQ); the caret block + "Cluck is typing…" for seconds; brainrot disclaimer again.
(c) 2 (d) 10, humor (h).

**S44 desktop question list** — `audit-d3-qlist-desk.png`
(a) "Same red X list, just bigger."
(b) Same strikethrough + ✕✕ ledger.
(c) 2 (d) banned red wall.

---

## Measured timings (Chromium iPhone lens, live prod)

| What | Value |
|---|---|
| Nav → code field visible | 1247 / 922 / 1440 ms (3 runs) |
| Tap Go → first `.opt` in DOM | 710 / 628 / 545 / 642 ms |
| Nav → first question (incl. typing 9 chars @40 ms) | 3.0–4.5 s |
| Taps to first question (iOS keyboard) | ~13 (code incl. 123/#+= layers) + 1 Go |
| Check → verdict | 166–384 ms (n=20) |
| Next → new question | 760–1028 ms (n=9) |
| Wrong pick → `explain` POST | ~0 ms (auto-fired at Check, first 5 wrongs) |
| `explain` response headers | 75–181 ms |
| `explain` → chip "Show Cluck's steps" (full text ready) | **15.2 s** |
| Taps from wrong pick to reading Cluck (phone) | 2 (scroll + chip) after ~15 s wait; + close X that is hard to hit |
| Chip tap → sheet settled | 1.9 s |
| Stream first visible token in sheet | not separable: text was already complete when opened; WebKit sheet at +26 s still streaming (caret visible, `audit-wk-cluck.png`) |
| Bytes per 10-Q session | ≈2.27 MB (mostly YouTube embeds) |

## WebKit vs Chromium

- Cluck sheet title: WebKit "Similar solution steps", Chromium "Cluck" (`#cluck` header) — different state text for the same flow.
- Chromium: `.cl-x` right edge at 391/393 px, header bar bleeds off-screen; WebKit: X fully inside with ~8 px gutter.
- WebKit (full-document snapshot) renders KaTeX baselines, options and the `.send` arrow the same as Chromium; no wrap/overflow difference found on Q stems.
- WebKit landed on a different random question (PHYS work/KE graph), so text-wall numbers come from Chromium.

## Needs real iOS (no BrowserStack creds)

1. iOS keyboard for `#code` (underscore layer, autocapitalize, autocorrect mangling "BANK_P2X").
2. `#padFab` + `.rtab` vs Safari bottom toolbar / home indicator (safe-area = 0 here).
3. Cluck full-screen sheet with the iOS keyboard open on "Ask Cluck about a step" (FREEZE.md path).
4. `.cl-x` hit area at the right edge under real touch.
5. YouTube embeds data cost + autoplay policy in Safari / in-app webviews (Discord, Instagram).
6. Streaming `explain` text in Safari (ReadableStream reader under iOS 17/18, low-power mode throttling).
7. Two-step `.opt` → `.send` under real touch (accidental double-tap zoom?).

## Already fixed in main?

Grepped `origin/main` @90da31b: "No tries left. Ask Tony about" (app.js:906, :1086), "Tap here to write notes." (app.js:2078), "POOF"/lamp copy (serve.py) are all STILL in main. Nothing above looks already fixed by PRs #83–#89.

## TOP-10 pains (ranked)

1. **"No tries left. Ask Tony about <CODE>." lock after 2 wrongs, answer never closed** — app.js:906/:1086 `p.verdict.lock`; serve.py max_tries. (S10, S11, S21) sev 3.
2. **Cluck's first line on a wrong pick is a joke ("POOF! You rubbed the lamp wrong")** — serve.py explain prompt / opener. (S14) sev 3.
3. **Red X + line-through on her pick; list = ledger of ✕✕** — `.opt.wrong` CSS in app.css; `#qlist` row rendering in nav.js. (S08, S38) sev 3.
4. **15 s until Cluck's steps are readable; chip says "writing…"** — app.js `wishStart` / `#wish .wchip` (chip only flips when the stream ends; no partial reveal). (S12) sev 3.
5. **Stem contradictions: "Choose all…" lead + single-answer question; irrelevant "Use g = 9.80"** — sugar-mode view of banks (mode.mjs / bank `sugar` text), PHYS_Z5B*, PHYS_2NEA, PHYS_REFE. (S05) sev 3.
6. **Cluck sheet blocks Next; close X at the screen edge** — `aside#cluck .cl-x` (app.css `.cl` header). (S13, S16) sev 3.
7. **Notes tooltip + `#padFab` + `.rtab` cover the question/option E** — app.js:2078 `obToast`, `#padFab`, `.rtab`. (S06) sev 3.
8. **Text walls (9-line paragraphs), choices below the fold** — `#blocks .md p`, PHYS_PUZ / PHYS_ZJ8; no "show more". (S26, S34) sev 3.
9. **6/10 questions are near-repeats with identical titles** — shuffle/queue (shuffle.mjs) + `.ptitle` naming. (S29, S36) sev 2.
10. **QUACK-first wrong-pick hints + "verify b4 use lol" + "Explain my mistake" label** — serve.py hint copy, Cluck disclaimer line, `#wish .wchip` text. (S09, S15, S31) sev 2.

Honourable mentions: two-step select→`.send` (S07), silent first-try win (S32), ~2.3 MB/session of YouTube (S41), exam-internal "Question 12" titles on her Q1 (S04).

---

## SHAME CHECK

1. **Wrong pick, her voice:** "My answer got crossed out in red, the duck joked about it, and then it told me to go ask some guy named Tony."
2. **Banned items present:** lone X icon (`.opt.wrong`, `#qlist` ✕✕); red wall-ish ledger in the question list; joke in the first line of a wrong-pick Cluck message; QUACK-first wrong hints. No "Wrong!", no "Easy", no timers, no score drop seen.
3. **Techniques (where the product meets / misses them):** 4 met partly (concrete misconception lines "Forgot the kilo", S24); 7 met partly (Socratic hints S20/S27); 9 met (Redo misses, fresh tries S40); 5 missed (lock without closure S10); 1, 2, 3, 11 missing all session; 8 dosed wrong (S09, S14); 10 missed on Cluck (15 s, S12) and text walls (S26).
4. **Would she reopen tomorrow?** Probably not tonight's version: 7 of 10 rows in her list are red ✕✕ and the last thing on screen is "Ask Tony". The Redo round is the one thing that could bring her back.
5. **Seconds + taps to the aha (iPhone, Chromium lens):** ≈3–4.5 s + ~14 taps to Q1; wrong pick → readable Cluck explanation ≈ 17 s + 3 taps (Check, scroll, chip), then ~25 lines to read. Mid Android: not measured (needs a throttled run).
