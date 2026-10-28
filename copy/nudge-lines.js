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
    "This one's a bit tricky.",
    "Want a smaller first step?",
    "This step's a doozy.",
    "How about a first peek?",
    "Take your time. I'm here. Quack.",
    "Let's quack this one together.",
    "Patience pays. Quack."
  ],
  /* S6 help avoidance: a miss (W96: 1 wrong pick, was 2), Cluck never asked. One quiet offer, asking made cheap, no count of misses */
  S6: [
    "If you need a hint, I'm here.",
    "Need an extra pair of eyes?",
    "I can show where to look.",
    "Ask the bread. It knows all.",
    "Ask anytime. Quack.",
    "Need one little clue?",
    "Two neurons beat one. One quacks."
  ],
  /* Q about to quit: a comeback cue. Progress is safe, no clock, a lower way in; never a streak threat */
  Q: [
    "Still here. No rush.",
    "Your work's all saved.",
    "Have a break. Have a... quack.",
    "Time waits for no one. We do.",
    "May I wing you a hint?",
    "Gravity is so duck-tractive.",
    "Time to honk at the quantum void."
  ],
  /* hold_mid: a new piece just popped inside the Key formulas box. Point at the box, not the student */
  hold_mid: [
    "New breadcrumb incoming. QUAACK.",
    "Formula box just changed, QUACKK-",
    "One more piece just showed up.",
    "New line in formula box.",
    "Gravity dropped a formula for you.",
    "Check the new formula line."
  ],
  /* hold_arrow: an arrow now links two formulas in the box. Point at the chain */
  hold_arrow: [
    "Two formulas just got linked.",
    "Quack-a-lacka. Linked formula.",
    "Two formulas chained. Take a look.",
    "Arrow shows the way.",
    "Trace the arrow, top to bottom.",
    "Formulas of a feather flock."
  ],
  /* hold_end: no piece left (or no ladder). The vague one, "why this one?": the same for any pick */
  hold_end: [
    "Why pick this one?",
    "What makes this choice fit?",
    "Say why, in one short line.",
    "What backs this pick up?",
    "Why that answer? Quack.",
    "Quack up your calculations."
  ]
};
