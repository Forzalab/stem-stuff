/* J5 Cluck nudge, Tier 0 (brain _files/sprint-render-v2/cluck-nudge.md, 🔒 Tony 18:5x): the authored lines Cluck's peek carries when Jev
   (intent.js) picks `cluck_say`. Data only; intent.js reads window.__stemNudgeLines, nothing else does.
   Rules for every line (tests/nudge.test.mjs checks them): it senses the moment WITHOUT NAMING IT (no emotion or state word, never
   "you seem…"), mirrors it sideways in ≤ 8 words, no guilt (art. 5), no praise, short enough for one line at 390 px, and 0 findings from
   the aiw detector (tests/vendor/aiw). ≥ 6 per state. Add lines here only; the same line never shows twice in a row for a state. */
window.__stemNudgeLines = {
  /* S2 impasse, depth ≥ 2: a long pause on one step. Name the step, not the student; offer a smaller piece */
  S2: [
    "This one's being stubborn.",
    "Want a smaller first step?",
    "This step has teeth.",
    "Peek at just the first move?",
    "Some steps take a while.",
    "One piece at a time works.",
    "Want me to shrink this one?"
  ],
  /* S6 help avoidance: tries on tries, Cluck never asked. One quiet offer, asking made cheap, no count of misses */
  S6: [
    "A hint costs nothing here.",
    "Want a second pair of eyes?",
    "I can show where to look.",
    "Fresh eyes help. Mine are free.",
    "Asking is free, by the way.",
    "Want one clue? Just one.",
    "Two heads beat one here."
  ],
  /* Q about to quit: a comeback cue. Progress is safe, no clock, a lower way in; never a streak threat */
  Q: [
    "Still here. No rush.",
    "Your progress is saved.",
    "Short break? It all stays here.",
    "No clock on this one.",
    "Start with any piece you like.",
    "Come back anytime. It keeps.",
    "Want a softer start?"
  ]
};
