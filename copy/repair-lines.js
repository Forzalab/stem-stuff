/* C2 Repair ladder (brain design-round-66 DESIGN-v3 §3, v2 §B): the fixed lines repair.js shows around an authored ladder. Data only;
   repair.js reads window.__stemRepairLines, nothing else does. An authored step's own `miss` line wins over `miss` here.
   Rules: Cluck asks, never tells; no answer, no number, no digit; no praise, no guilt; one line at 360 px; no "!", no em dash. */
window.__stemRepairLines = {
  /* the card's opening line, by variant (repair = a slip family was found or not; alt = after a twin miss; full = the bottom-out) */
  intro: {
    repair: "QUACK. Wrong, but we know where. Let's conquer it step by step.",
    fallback: "QUACK. Let's walk it through, one step at a time.",
    alt: "QUACK. Same idea, a different way in.",
    welcome: "Hi. Let's warm up together.",
    full: "Here's the whole way through. Take a moment with it."
  },
  miss: "Not that one. Look again.",              // a wrong step try (repair / alt): the default miss line
  hint: "Close. Try another one.",                // a wrong tap in welcome: a hint, never a red state
  auto: "Here it is. Read why, then on we go.",   // 2 wrong tries: the step fills itself in
  why: "Why?",                                     // a why without its own question
  done: "Conquered.",
  later: "Come back to this one later.",           // full: under the worked solution
  check: "Check",
  next: "Next",
  skip: "Skip for now"
};
