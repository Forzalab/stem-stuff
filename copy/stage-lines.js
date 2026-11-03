/* 160 PR-B "tool call theater": the stage rows' words (data only), read by stages.js. One entry per server stage (serve.py STAGES);
   each is a list of [now, past] pairs, the n-th time the stage runs takes the n-th pair (the last one repeats): a proof's second grader call
   is "Double-checking". Tony (Nov 2): whimsy past tense is OK in the stage row (overrides STYLE.md:378 for this row only).
   COPY-PENDING: every line here is a placeholder until Tony signs the wording. */
window.STAGE_LINES = {
  note: [["Fluffing feathers…", "Fluffed feathers"]],               // /explain: the NOTE call reads the move
  write: [["Drafting the wish…", "Drafted the wish"]],              // /explain: Cluck's reply
  read: [["Reading your proof…", "Read your proof"]],               // /check: the pre-checks
  grade: [["Checking the steps…", "Checked the steps"], ["Double-checking…", "Double-checked"]],   // /check: one grader call per pair
  record: [["Writing it in the duck diary…", "Wrote it in the duck diary"]],
  done: "Thought for",                                              // the summary: "Thought for 6s"
  fail: "Cluck is slow, try again"                                  // Tony Nov 2 22:53: a failed or timed-out row, no tick
};
