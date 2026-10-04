# Top-down UX audit + Feed mode (sugar)

Tony, Oct 4: "think of [the student] as a top-down assumption-based creature: they won't click if they don't understand ... physics is too
dry, reward external motivation is sorely essential ... conclude with a certain UI design that will CATER to that, think: tiktok."
On the original bar: "ENCOURAGE THEM TO CLICK ON IT ... it looks like a topic bar and not sth u can click on."

**The student this is for.** A top-down reader guesses what a thing is from its shape and its place on the page, then acts on the guess
(or doesn't). They don't read labels, they don't try a control to see what it does, and anything they can't name in about a second they
treat as decoration. Every control has to say what it does by how it looks, or it might as well not be there (Krug; Norman).

**Conclusion.** Sugar mode should be **Feed mode**: one question per screen. You answer with your thumb, the reward lands on the answer
you tapped, and you swipe up for the next. A story bar on top shows the round of 10. A right rail holds every helper as an icon with one
word. Cluck speaks in captions, and the brainrot clip is the bottom half of the screen. TikTok taught this layout to the students we're
designing for, so there's nothing new to learn (Jakob's law). Mock: `design/mockups/feed.html` (spec in §4). The "Original" bar becomes
a free hint card or a teaser (`design/mockups/orig-bar.html`, §5).

Evidence: the real app with the real P2X bank, sugar mode, at 390×844 and 1440×900. These shots are **not in git** because exam content
never goes to GitHub. They live in the session scratchpad (`agentA/shots/topdown-{snack,real,cluck,hud}-{390,1440}.png`) and can be
re-made with the commands in §7. Mock shots (made-up questions) are in `design/shots/`. Element facts were checked against `index.html`,
`app.js`, `app.css`, `brainrot.js`, `rewards/*`.

---

## 1. Element audit

"Assumes" = what a student who won't tap what they don't understand most likely thinks it is. Phone first, then desktop.

| # | Element (where) | What a top-down student assumes | Lens | Fix |
|---|---|---|---|---|
| 1 | **"BANK_P2X" pill**, top left (`#qlistBtn`, a "?" list icon + the bank code) | A file name or error code. It doesn't look like a menu of questions, so the whole question list goes undiscovered. | Krug (self-evident); info scent | Show "Questions 4/25" with a numbered-grid icon. Keep the bank code out of student UI (it's for Tony and the code box). |
| 2 | **Shuffle icon**, unlabelled (`#qshuf`, `aria-label` only) | Music shuffle, or "random". A careful student is afraid it will lose their place, so it's never tapped. | Norman signifiers; NN/g icon usability | Put a word under it ("Mix"), or drop it from the phone bar and put it in the list sheet (Hick). |
| 3 | **`<` `>` arrows** (`#qprev` / `#qnext`) | Read correctly as back/next. But they're two small grey squares away from the question, and nothing says "next question". | Fitts / thumb zone; gulf of execution | After an answer, a big "Next" pill in the thumb zone (Feed: swipe up plus a "Swipe up" chip). The arrows stay as backup. |
| 4 | **HUD coin with a bare "0"** (`.rw-coin`, Fluent `coin` art) | The Fluent coin has a **bank building** drawn on it. At 30px it reads as "bank / money / pay", and with "0" next to it, "you have no money". | Info scent; signifier mismatch | Draw a plain gold coin with a star stamp (see feed.html `#f-coin`) and put the word "coins" after the number. |
| 5 | **"30 XP to level 2"** + star + bar (`.rw-lvl`) | Understood: a filling bar means progress (games taught everyone this). | Goal-gradient (Hull; Kivetz 2006) | Keep. Optionally "18 to Lv 2" on phones. |
| 6 | **Flame with "0"**, no label (`.rw-streak`, greyed at 0) | A grey flame plus 0 reads as "off" or "burnt out". What feeds it (first-try correct answers in a row) isn't stated. | Gulf of evaluation | "3 in a row" after the number. At 0, show the flame outline with "in a row" so the goal is visible (Zeigarnik). |
| 7 | **"Original: Practice Exam 2, Q7" bar** (`.orig-hd`: doc icon, muted text, flat `--sheet`) | A **section heading** ("this one comes from Exam 2"). Nothing about it looks pressable. The chevron is small and grey, in the place a disclosure icon also sits on non-interactive headings. | Norman signifiers; info scent; curiosity gap | §5: variant A (filled, raised hint card: "See how the exam solved it · Free") or B (teaser: step 1 showing, rest fading under "Tap to see every step"). |
| 8 | **Bold tip above a long paragraph** (`.tip`, then a dense single-paragraph problem; the snack's runs about 10 lines at 390) | The bold line looks like the question, and the wall under it like small print. The student stops after the bold line, or bounces off the wall. | Cognitive load (Sweller); progressive disclosure | Tip as **one** line with a bulb icon in `--mark`. Problem text in short lines, one fact per line, with the ask last and bold. Figure first and big. (Content task for main: the tip stays one line.) |
| 9 | **Unlabelled `>` tab on the left edge** (brainrot stash `.rtab`, 44×96, chevron only) | "Next page" or a drawer of settings. It also overlaps the problem text at the left edge (shot: real-390). | Signifiers; Gestalt common region | A small play-icon thumbnail, or a strip of the clip itself, so it looks like "video". In Feed mode the clip becomes the bottom half, so there's no tab. |
| 10 | **Scratchpad button over the problem text** (`#padFab`, bottom right) | Fine as "write" (pencil and word), but it **sits on top of the last line of the problem**, the "Use g = ..." line, so that line reads as hidden or gone. | Craft rule "no floating control over content" (STYLE.md §6.14) | Reserve the room (bottom padding = FAB height plus a gap), or move it into the Feed rail ("Pad"). |
| 11 | **`^` chevron strip at the bottom** (`#barTab`, the code bar, `aria-label` only) | Pure decoration, or "scroll to top". Nobody guesses "type a code here". | Gulf of execution; icon needs label | Phones in a bank don't need it: move code entry into the Questions sheet. If it stays, use a keyboard icon with a "Code" label. |
| 12 | **"Ask Cluck" / "Cluck has your wish" chip** (`.wchip`, outline pill, duck) | "Cluck" means nothing to a new student. "Has your wish" is a state, not an action. The outline pill looks like a tag. | Krug (name things the way users do); Fogg prompt | T4: "Explain my mistake" casino chip (gold rim, candy coin, a short wiggle until tapped). Cluck's name lives in the captions, not the label. |
| 13 | **"Sound" next to the chip** (`.wvoice`, text only, no border) | Plain text, not a control. | Signifiers | Speaker icon in a round button (the rail's "Voice"). Muted = slashed speaker. |
| 14 | **Slot reels after a right answer** (`.fx-slots`, a full-screen card on a scrim) | Read instantly as "slot machine, I won something". But it hides the question, and with no close cue the student waits or taps around. | Variable reward (Eyal); gulf of evaluation | Keep the reels. Add "Tap to keep going" under them after 1 s. In Feed mode, the pop lands on the tapped answer and the reels play over the clip half only. |
| 15 | **Drop banner** ("QUACK! Brain +1.") at the top | Fun, but it covers the bank pill and arrows for a moment. | Gestalt (it lands on the nav group) | Fine as-is for a short banner. In Feed, the reward sits on the answer. |
| 16 | **Wrong answer**: red dashed box with an X; the Cluck hint line with a duck | Clear: red = wrong. The duck line reads as a hint. | Gulf of evaluation, closed | Keep. |
| D1 | **Desktop: brainrot corner** (two 320px players) | On first open it sat **top-left over the code box and the tip** (shot: snack-1440), later bottom-right over the scratchpad. The tip, the most useful line, is hidden. | STYLE.md §6.14; cognitive load | On desktop, give the clip its own column under the rail (Feed desktop), or default it to a corner that holds no text. |
| D2 | **Desktop: "real 0 · snacks 0"** (`.rw-counts`) | "Real what?" These are system words. | Krug | Drop it (the segment bar shows progress), or "4 of 25 done". |
| D3 | **Desktop: upload arrow + code box showing a system code** (`#upload`, `#code`) | The up-arrow could mean "share" or "scroll up". A code box isn't something a student needs inside a bank. | Hick; info scent | Hide the upload button in sugar (uploads are already left out of the sugar list). Move the code box into the Questions sheet. |
| D4 | **Desktop: the original opens in the scratchpad's place** (`#work.orig-on > #xb {display:none}`) | "My scratch work is gone." | Gulf of evaluation | Open the original as a layer over the pad with a visible "Back to my pad" (or split the column). |
| D5 | **Desktop: "Question" / "Scratchpad" labels** | Understood. | Gestalt (labels align the two boxes) | Keep. |

The 5 that cost the most taps: **#7** (free help nobody opens), **#4** (a money building with a 0), **#8** (wall of text under a bold
"question"), **#9/#11** (two meaningless chevrons), and **D1** (the clip covering the tip on desktop).

---

## 2. Lenses (short, and where each is used)

| Lens | One line | Used in |
|---|---|---|
| Krug, *Don't Make Me Think* (2000/2014) | Every page should be self-evident; anything that needs a thought is a question mark that slows or stops the user. | #1, #12, D2; the whole "won't tap" frame |
| Norman, signifiers (2008) + gulfs of execution / evaluation (DOET 2013) | Show what can be done (signifier), make the action obvious (execution) and the result readable (evaluation). | #2, #3, #6, #7, #11, #13, #14, D4 |
| Fogg, B = MAP (2009) | Behaviour happens when motivation, ability and a prompt meet at the same moment. | The Cluck chip shows **right after a wrong answer** (motivation peak) with a one-tap ability and a wiggle prompt; Feed's "Swipe up" chip |
| Hick's law (1952) | Decision time grows with the number of choices. | #2, D3; the rail's 4 items; 2×2 answer pills |
| Progressive disclosure (NN/g) | Show the essentials first; the rest one step away. | #8; variant B shows step 1 and folds the rest |
| Gestalt, proximity / common region (NN/g) | Close or enclosed things read as one group. | #9, #15, D5; the rail groups all help |
| Information scent (Pirolli & Card 1999) | People follow cues that promise the thing they want; weak scent means they don't go. | #1, #4, #7 ("See how the exam solved it" is strong scent; "Original: ..." is none) |
| Cognitive load (Sweller 1988) | Working memory is small; extraneous load crowds out learning. | #8, D1; chunked lines in Feed |
| Curiosity gap (Loewenstein 1994) | A visible gap in what we know creates an urge to close it. | Variant B (step 1 shown, the rest faded); "4 steps" count |
| Zeigarnik (1927) + goal-gradient (Hull 1932; Kivetz, Urminsky & Zheng 2006) | Unfinished tasks nag; effort rises as the goal gets closer (and "illusory" head starts help). | #5, #6; the 10-segment story bar starts with the done segments lit |
| Variable reward / Hooked (Eyal 2014; already in REWARDS.md) | Trigger, action, variable reward, investment; the next trigger is the investment. | #14; reward pop in place; streak + level pull the next swipe. Guardrails from REWARDS.md stay (no fake near misses, nothing ever taken away). |
| SDT, competence (Ryan & Deci 2000) | Intrinsic motivation grows when people feel capable. | Rewards name the act ("3 in a row"); the original/hint is *free* and framed as "same steps", which says "you can do this" |
| NN/g icon usability (2014) | Few icons are universal; icons need text labels. | #2, #9, #11, #13; the rail is icon + word |
| Jakob's law (Nielsen 2000) | Users spend most time on other sites and expect yours to work the same. | Feed mode copies TikTok's layout (vertical snap, right rail, captions, story bar) |
| First-click testing (Bailey & Wolfson) | When the first click is right, task success is about 87%; when it's wrong, about 46%. | Why the first screen must make the right first tap obvious; the acceptance test in §3 |

---

## 3. Language-free channel (Tony's blind-locale test)

**The test (Tony):** swap every UI word to a script the student can't read (say Georgian), keep the question in English. He must be
able to use the site without thinking. This is a first-click test run without words (Bailey & Wolfson): if the first tap only works
because of a label, the label is doing a job that shape, colour, position, icon or motion should do. **Rule:** meaning travels through
shape, colour, position, icon and motion; text is the backup (NN/g: labels still belong next to icons, for everyone else).

| # | Element | Survives without words today? | What carries it after the fix (text is backup) |
|---|---|---|---|
| 1 | Bank pill | **No.** The code is meaningless even in English. | Numbered-grid icon + "4/25" digits (digits survive most locales) |
| 2 | Shuffle | Partly (music-player shuffle icon, Jakob's law), but the risk is unclear | Move into the list sheet; the icon sits beside the list it shuffles (position) |
| 3 | `<` `>` | Yes (universal arrows) | Plus a big up-chevron "next" chip that moves (2 nudges) in the thumb zone |
| 4 | Coin + 0 | **No.** The art says "bank". | A gold coin with a star stamp; the number grows with a coin fly from the answer (motion links cause and result) |
| 5 | XP bar | **Yes.** The filling bar is the meaning. | Same |
| 6 | Flame 0 | Partly (Duolingo/Snap streak flame), but grey reads as "off" | Lit flame + digit; it grows one step per first-try win (motion) |
| 7 | Original bar | **No.** All the meaning is in the words. | A: orange raised card + bulb coin + FREE sticker shape + round chevron + one lift/shine. B: a visible numbered step 1 and fading lines (you can *see* there is more) + a solid blue bar with a down chevron |
| 8 | Tip + paragraph | Tip is content (English stays) | Bulb icon in `--mark` marks "help line"; short lines; the ask is bold and last (position) |
| 9 | Left `>` tab | **No** | A live strip of the clip (the video *is* the signifier); Feed: no tab |
| 10 | Scratchpad FAB | Yes (pencil) | Pencil in the rail; never over text |
| 11 | Bottom `^` | **No** | Gone from the bank flow; code entry in the list sheet behind a keyboard icon |
| 12 | Cluck chip | **No** (a duck and words) | Casino chip shape + candy coin + wiggle that appears **only after a red X** (timing and motion say "this is about your mistake") |
| 13 | "Sound" | **No** (text only) | Speaker icon; slashed when muted |
| 14 | Slot reels | **Yes** (universal) | Plus a tap-hand or a pulsing "continue" chevron after 1 s |
| 15 | Drop banner | Yes (sticker + icon) | Same |
| 16 | Right / wrong | **Yes** (green check, red dashed X) | Same |
| D1-D5 | Desktop | D1 n/a (layout), D2 **no**, D3 partly, D4 **no** (the pad vanishes silently), D5 yes (icons + position) | D2: segment bar; D3: hide; D4: the original slides over the pad with a visible pad-icon "back" tab |
| Feed | Feed mode | Built for it: snap-scroll, story bar, rail icons, the green/red pill, the pop on the answer, up-chevron motion | Words under rail icons are the backup |

---

## 4. Feed mode spec (sugar, phones first)

Mock: `design/mockups/feed.html` (shots `design/shots/feed-390.png`, `feed-1440.png`). The behaviour below is the target; the mock is static plus a tap.

- **One question per screen.** A vertical scroller with `scroll-snap-type: y mandatory`, one `.slide` per question, `scroll-snap-stop: always`.
  You can't swipe past an unanswered question: the next slide only joins the scroller once the current one is answered (or skipped from the list).
  A right answer scrolls to the next one after 1.1 s (instant under reduced motion). A wrong one stays, so Cluck can explain.
- **Top: story bar + HUD.** 10 segments per round (done = `--ok`, missed = `--muted`, current = `--ink`, rest = `--line`;
  `role=progressbar`, "Question 4 of 10"). Under it the casino HUD: coin + number + "coins", star + bar + "18 to Lv 2", flame + number + "in a row".
- **Question area (top ~55%).** Figure first, big (about 128-150px tall). The tip is **one line** with a bulb icon in `--mark`. The problem
  is chunked: one fact per line, ask last and bold. No paragraphs.
- **Answer pills (thumb zone).** A 2×2 grid of 52px pills at the seam above the clip. Graded in place: green border + check, or red dashed + X (STYLE.md verdicts).
- **Rewards pop in place.** The "+11 XP" sticker lands on the tapped pill (casino skin). Coin and level change in the HUD (coin fly from
  the pill). Slots and bursts play over the clip half, never over the question. Guardrails from REWARDS.md: nothing on a wrong answer,
  no fake near miss, XP never taken away, no timers.
- **Right rail.** Icon + one word each, 48px discs: **Hint** (the exam's worked original, same content as the orig card; see the "Free" caveat in §5), **Cluck** (the casino coin; it wiggles only after a wrong answer), **Pad** (the scratchpad page), **Voice** (aria-pressed).
- **Cluck as captions.** Cluck's text streams as a caption box over the clip (dark scrim 0.88, `--ink`, ≥ 4.5:1), read aloud at 0.35 when Voice is on.
- **Brainrot clip = split screen.** The bottom ~40% is the muted looping clip (today's two players become one, Subway format). With reduced
  motion it's paused on a frame. On short screens (< 700px) it shrinks to a 96px strip.
- **Desktop (≥ 720px).** A centred 420px phone column, the rail just outside its right edge, and a short "how this works" note on the left
  (≥ 1100px only). The scratchpad opens as a panel to the right of the rail (not in the column).
- **Accessibility.** Every control is a real `<button>`; the rail is a `nav` named "Help"; the answer group is a `radiogroup`; focus rings
  stay; motion is transform/opacity only; `prefers-reduced-motion`: no snap smoothing, no pops, no wiggle, no nudges.
- **Scope.** Feed mode is sugar only. Diet keeps today's page. The bank list, codes and the server API don't change: Feed is a different
  view of the same `S` state (one slide per question as you go).

---

## 5. The original bar (T1) and the Cluck button (T4)

`design/mockups/orig-bar.html` (`?v=a`, `?v=b`, none = both). Shots: `design/shots/orig-bar-{a,b}-{390,1440}.png`, `wchip-390.png`.

- **A: Free hint card.** One `<button aria-expanded>`: Quiz Pop tangerine fill, light top edge, dark base, a bulb in a sun coin, "See how
  the exam solved it" / "Free · same steps, other numbers", a FREE sticker, and a round chevron on the right. One 600 ms lift + shine,
  at most once per session (`sessionStorage`), none under reduced motion. Strongest "this is a button"; reads as a reward (Tony's casino direction).
- **B: Teaser.** The whole card is the button: "How the exam solved it · 4 steps · free", step 1 readable, steps 2-3 fading out, a solid
  `--c1` bar "Tap to see every step" with a chevron. Plain app tokens, calmer; works by curiosity gap (Loewenstein).
- **Caveat, "Free":** today a peek before answering (opening a level-3 original, or the hidden last line at level 2) pays 2 XP
  instead of 9-12 (`app.js origPeeked`). A "Free" label on a card that can cost XP breaks trust. Either the label says "Free" only at
  level 1 (full solution, no cost), or the peek rule goes. Tony to decide.
- **Recommendation:** **A on phones** (it survives the language-free test by shape and colour alone, and matches the reward skin).
  B's fade-and-count teaser could sit *inside* A's open state on desktop. Keep the fading rule (level 2 hides the last line behind "Peek").
- **T4 "Explain my mistake"** (`/* LIFT: wchip */` block): a glossy pill with a dark outline, thick gold rim, red-orange body, light top
  edge, gloss cap, dark base, and a white duck in a violet candy coin with a gold ring. 3 swings of ±6° over ~500 ms every 6 s; stops for
  good once tapped; off under reduced motion. White 20px bold text on the red body passes the large-text 3:1 rule, with a dark text-shadow.
  The look follows Tony's slot / panel kit refs, redrawn as our own CSS + SVG (Tony's Oct 4 note overrides REWARDS.md's "no trace"
  for these casino refs; no pixels copied).

Impeccable (`npx impeccable detect design/mockups/orig-bar.html design/mockups/feed.html`): 0 anti-patterns. Casino bevels waived
inline (`impeccable-disable side-tab`, "impeccable waiver: casino-themed (Tony, Oct 4)"). One advisory, "repeating-stripes-gradient",
comes from the linked stylesheets, not the mocks.

---

## 6. Sources

- Krug, S. (2014). *Don't Make Me Think, Revisited*. https://sensible.com/dont-make-me-think/
- Norman, D. (2008). Signifiers, not affordances. https://jnd.org/signifiers-not-affordances/
- NN/g (2018). The Two UX Gulfs: Evaluation and Execution. https://www.nngroup.com/articles/two-ux-gulfs-evaluation-execution/
- Fogg, B. J. Fogg Behavior Model (B = MAP). https://www.behaviormodel.org/
- Hick, W. E. (1952), via Laws of UX. https://lawsofux.com/hicks-law/
- NN/g (2006). Progressive Disclosure. https://www.nngroup.com/articles/progressive-disclosure/
- NN/g (2020). Proximity Principle in Visual Design. https://www.nngroup.com/articles/gestalt-proximity/
- Pirolli, P. & Card, S. (1999). Information foraging. *Psychological Review* 106(4). https://psycnet.apa.org/record/1999-11924-001
- Sweller, J. (1988). Cognitive load during problem solving. *Cognitive Science* 12. https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog1202_4
- Loewenstein, G. (1994). The psychology of curiosity. *Psychological Bulletin* 116(1). https://psycnet.apa.org/record/1994-41058-001
- Zeigarnik effect, via Laws of UX. https://lawsofux.com/zeigarnik-effect/
- Kivetz, R., Urminsky, O. & Zheng, Y. (2006). The goal-gradient hypothesis resurrected. *JMR* 43(1). https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf
- Eyal, N. (2014). *Hooked*. https://www.nirandfar.com/how-to-manufacture-desire/
- Ryan, R. & Deci, E. (2000). Self-determination theory. *American Psychologist* 55(1). https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf
- NN/g (2014). Icon Usability. https://www.nngroup.com/articles/icon-usability/
- Nielsen, J. (2000). Jakob's Law of the Internet User Experience. https://www.nngroup.com/videos/jakobs-law-internet-ux/
- Bailey, B. & Wolfson, C., first-click study (87% vs 46%), via Optimal Workshop. https://www.optimalworkshop.com/blog/correct-first-click-lead-to-3x-higher-task-success

---

## 7. Reproduce

```sh
S=/tmp/claude-0/-home-user-stem-stuff/4c0c2ead-60ae-5a25-950c-2b4333dd1f56/scratchpad/agentA
mkdir -p $S/banks $S/shots && cp <brain>/projects/calc/_files/phys2a-exam2-bank/{BANK_P2X,formula-sheet}.json $S/banks/
node $S/shoot.mjs 8871        # real app, stub Cluck model, sugar: topdown-*.png -> $S/shots (never the repo)
node $S/mock-shots.mjs all    # mocks -> design/shots/orig-bar-*.png, feed-*.png
node $S/wchip-shot.mjs        # design/shots/wchip-390.png
```
`shoot.mjs` starts `serve.py` with `STEM_BANKS=$S/banks`, `STEM_TRIES=$S/tries.json`, a local stub for `OPENROUTER_BASE`
(`OPENROUTER_API_KEY=sk-test`, `NO_PROXY=127.0.0.1`), and stops it when done.
