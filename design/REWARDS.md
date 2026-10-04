# Sugar rewards: research + mock (alt, Oct 3 PT)

Mock: `design/rewards/index.html` (open it in a browser; no server). Spec: brain `projects/calc/topics/sugar-rewards.md` (main).
Files: `engine.js` + `hud.css` (XP, levels, drop roll, streak, pity, snack runs, HUD), `fx.js` + `fx.css` (pop, sparks, coin fly,
toast, 3-reel slots, LEVEL UP / BONUS / legend bursts). State: localStorage `stem-rw`. Sugar only when it reaches the app.

## Dead easy (Tony, Oct 4; newest, beats the numbers below and in REWARDS-WIRING.md)
[stated] "make the points and animation and bells VERY EASY TO OBTAIN. like dead easy. participation trophy." "bells, as in whistles and bells".
- XP: real first try 12–16, True/False row 8–10, snack 6, peeked 2; second-try correct 6 (snack 3); a wrong try +1 "for trying".
- Levels cost 20, 30, 40 … XP. Drop roll on every correct held 1 s+ (no roll after a peek): p 0.6 real / 0.5 T/F / 0.45 snack,
  pity after 2 dry, rarity 70 / 25 / 5. Burst cap 15 s. The streak never halves: a wrong try pauses it, any correct adds one.
- Bells (visual, no sound, sugar only, none under reduced motion): every correct = pop + sparks + confetti + "+N XP" float + coins
  to the HUD + one shine across the coin pill. A common drop = slots, then the WIN burst with 3 stars (red-gold rays); rare / legend /
  level up as before. Inside the 15 s cap a drop becomes the banner.
- Hard lines kept: no money, no fake near miss. A wrong try's +1 is a small cream "+1" by the coin, no sparks, no words, and a level
  reached by it bursts nothing, so a right answer still feels much bigger (a loss dressed up as a win stays off the table).

## Research (TinyFish, Oct 3) → rule
| Finding | Source | Rule in the mock |
|---|---|---|
| Learning rate peaks near 85% success | Wilson et al. 2019 ("85% rule"), via r/gamedesign | Snacks are the dial. Snack-run length 0–3 after each real, weights shift with the last 10 answers (< 85% → more snacks, > 90% → fewer). |
| Dopamine tracks reward minus expected (RPE); flat rewards go flat | Mah et al. 2024, Cell Reports | Variable drops + rarity; XP jitters (real 9–12, snack 3–5). |
| Event frequency is the strongest structural driver of slot engagement and harm | simplypsychology.com, slot design | Fast loop (answer → reveal → next ≤ 1.2 s), one burst per 60 s. |
| Losses disguised as wins: win lights on a loss inflate felt winning | Barton et al. 2017, PMC5663799 | Zero celebration on a wrong answer. Snack wins look smaller than real wins. |
| Near misses motivate, and slots fake them | Barton 2017; simplypsychology | Reels never fake 2-of-3. The honest "almost" is the XP bar: "8 XP to LEVEL 4". |
| Gamification helps (g = 0.50 over 19 studies; g = 0.82 over 41) but shallow points/badges/leaderboards fail; overjustification | studypulse.education summary of the meta-analyses | Rewards name the act ("3 in a row"). No leaderboard (relative only, if ever). |
| Hook loop: trigger → action → variable reward → investment; investment is the next trigger. Loss/FOMO = black hat | yukaichou.com (Octalysis on Hooked) | "X XP to next level" + streak pull the next card. Streak halves on a wrong, never resets. No timers. |
| Juice: overshoot pop, ease-out settle, small/medium/large tiers | itch.io juice blog; wayline game feel | common / rare / legend = toast / BONUS burst / golden duck. |

## Guardrails
No money, no buying, no paid spins, no fake near misses, earned XP never taken away. Every spin needs a first-try correct
answer held for 1 s+ (spec: 3 s in the app).
Refs (Tony, Oct 3): nothing from Envato or Shutterstock refs (no trace, no copy, no look-alike). Every other ref he sent is OK to use.

## Next
Wire into app.js `record()` (one funnel for every graded try), sugar only (`modeOf()`), snacks = `saccharine.snack` from main's bank.

## Impeccable pass (Oct 3, `npx impeccable detect design/rewards/`: 14 → 0, exit 0)
Fixed: bounce/overshoot easing → ease-out-expo (reels, card slide, pop); XP bar animates `transform: scaleX` (was `width`);
contrast (violet chips #6a2fd8→#4b1aa8, CHECK #167f40→#0f5f2f); nested card flattened (one `.board`, solid gold border, dark base);
every zero-offset colored glow → offset elevation shadow; page halo + grid lines → one vertical gradient; marquee bulbs blink only while reels spin.
Waived inline (with reason): gradient text on the LEVEL UP title (Tony's ref + spec) and radial halos inside the burst overlay (1.2–2 s only).
Advisory kept: burst speed lines (spec).
