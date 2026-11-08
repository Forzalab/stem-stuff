/* srwords.js: the words the screen reader hears after a verdict (the page shows only the icon). Loaded by app.js. */
export const verdictWords = r => r.verdict === "correct" ? "Correct." : r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0) ? "Out of tries, fight it later."
  : r.verdict === "wrong" ? "Not quite. One more try, I swear." : "";
