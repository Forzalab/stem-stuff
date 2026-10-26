/* J5 Cluck nudge, Tier 0 (brain _files/sprint-render-v2/cluck-nudge.md, 🔒 Tony 18:5x): the authored lines Cluck's peek carries when Jev
   (intent.js) picks `cluck_say`. Data only; intent.js reads window.__stemNudgeLines, nothing else does.
   Rules for every line (tests/nudge.test.mjs checks them): it senses the moment WITHOUT NAMING IT (no emotion or state word, never
   "you seem…"), mirrors it sideways in ≤ 8 words, no guilt (art. 5), no praise, short enough for one line at 390 px, and 0 findings from
   the aiw detector (tests/vendor/aiw). ≥ 6 per state. Add lines here only; the same line never shows twice in a row for a state.
   Ladder lane 4, held pick (a choice selected, not checked, past p75): a breadcrumb that says what the Key formulas box just did. The page
   can't tell a right pick from a wrong one, so no line ever does; never the answer, the letter or a number (IDLE-PEEK.md AMA 4 amendment). */
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
  /* S6 help avoidance: a miss (W96: 1 wrong pick, was 2), Cluck never asked. One quiet offer, asking made cheap, no count of misses */
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
  ],
  /* hold_mid: a new piece just popped inside the Key formulas box. Point at the box, not the student */
  hold_mid: [
    "A new step is in the box.",
    "Check the key formulas again.",
    "One more piece just showed up.",
    "The formula box has a new line.",
    "A smaller step is up there now.",
    "Peek at the new formula line."
  ],
  /* hold_arrow: an arrow now links two formulas in the box. Point at the chain */
  hold_arrow: [
    "Two formulas just got linked.",
    "Follow the new arrow in the box.",
    "One formula feeds the next one.",
    "The arrow shows what goes where.",
    "Trace the arrow, top to bottom.",
    "See what the arrow connects?"
  ],
  /* hold_end: no piece left (or no ladder). The vague one, "why this one?": the same for any pick */
  hold_end: [
    "Why this one?",
    "What makes this choice fit?",
    "Say why, in one short line.",
    "What would prove this pick?",
    "Which words point to this one?",
    "Check it against the question."
  ]
};
