/* C2 Repair ladder (brain design-round-66 DESIGN-v3 §3, v2 §B): the fixed lines repair.js shows around an authored ladder. Data only;
   repair.js reads window.__stemRepairLines, nothing else does. An authored step's own `miss` line wins over `miss` here.
   Rules: Cluck asks, never tells; no answer, no number, no digit; no guilt; one line at 360 px.
   Tony's own words win over these rules (TONY-DECISIONS #32 + #36 Copy Swipe 2): intro.repair, miss, later, done, hint.
   #36 shape (additive: every key an older repair.js reads keeps its string type):
   doneBy = { L1, L2, L3, tail }: repair.js shows doneBy[level] + doneBy.tail (L1 no wrong try, L2 a wrong try but the answer
   never revealed, L3 the answer revealed / full card); `done` = L1 + tail for a repair.js without doneBy.
   hintBy = { far: [..], two, three: [..] }: welcome wrong tap n per item, n=1 far[random], n=2 two, n>=3 three[random];
   `hint` = far[0] for a repair.js without hintBy.
   Cut: intro.repairMany (intro.repair covers both); intro.full and auto are "" (no line; an auto-filled step changes its
   number badge instead). */
window.__stemRepairLines = {
  /* the card's opening line, by variant (repair = a slip family was found or not; alt = after a twin miss; full = the bottom-out) */
  intro: {
    /* *waddles over* = an italic aside (app chrome: <em>) */
    repair: "*waddles over* Let's fix this together—QUACKK!",
    fallback: "QUACK. Let's walk it through, one step at a time.",
    alt: "QUACK. Let's waddle a different path!",
    welcome: "Ready to waddle through some forces?",
    full: ""                                       // cut (#36): no intro line on the full card
  },
  miss: "Whoops! Let's try again.",               // a wrong step try (repair / alt): the default miss line
  hint: "Good attempt, but keep trying!",          // a wrong tap in welcome (= hintBy.far[0]): a hint, never a red state
  hintBy: {                                        // the same, by try number
    far: [
      "Good attempt, but keep trying!",
      "That's not it (╥﹏╥) Keep calm and carry on!",   // kaomoji: Tony OK'd, Oct 26
      "First time?"
    ],
    two: "Two tries is normal. Two tries, never too much. (ง •̀_•́)ง",   // kaomoji: Tony OK'd, Oct 26
    three: ["Third time's the charm.", "Who says three failures are bad?"]
  },
  auto: "",                                        // cut (#36): 2 wrong tries fill the step in, no line
  why: "Why is that?",                                     // a why without its own question
  done: "You did perfectly! Now, try a similar one, QUAAACK—",   // = doneBy.L1 + doneBy.tail
  doneBy: {                                        // by level, then the tail
    L1: "You did perfectly!",
    L2: "Way to hang in!",
    L3: "You'll master it soon!",
    tail: " Now, try a similar one, QUAAACK—"
  },
  later: "This can wait!",                         // full: under the worked solution
  check: "Check",
  next: "Next",
  skip: "Skip for now"
};
