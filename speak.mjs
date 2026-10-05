/* speak.mjs: Cluck's solution text (plain text + $LaTeX$) as words for the voiceover (design/EASY.md Phase 4).
   Pure, so tests/speak.test.mjs can import it. Good enough to be understood; the voice is meant to sound cheap. */
const GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "pi", "rho", "sigma", "tau", "phi", "omega"];
const UNITS = [[/\bm\/s\^?2\b/g, "meters per second squared"], [/\bm\/s\b/g, "meters per second"], [/\bkg\b/g, "kilograms"],
  [/\bN\b/g, "newtons"], [/\bJ\b/g, "joules"], [/\bW\b(?= *$)/gm, "watts"], [/\brad\/s\b/g, "radians per second"]];

function math(t) {
  let s = t.replace(/\\[dt]frac/g, "\\frac").replace(/\\frac(\d)(\d)/g, "\\frac{$1}{$2}");
  for (let i = 0; i < 4; i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1) over ($2)").replace(/\\sqrt\{([^{}]*)\}/g, "root of ($1)");
  s = s.replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\^\{?2\}?/g, " squared").replace(/\^\{?3\}?/g, " cubed").replace(/\^\{([^{}]*)\}|\^(\S)/g, " to the $1$2")
    .replace(/_\{([^{}]*)\}|_(\w)/g, " $1$2")
    .replace(/\\(cdot|times)/g, " times ").replace(/\\pm/g, " plus or minus ").replace(/\\approx/g, " about ")
    .replace(/\\(Delta)/g, " change in ").replace(/\\(sin|cos|tan)\b/g, " $1 ")
    .replace(new RegExp(`\\\\(${GREEK.join("|")})\\b`, "g"), " $1 ")
    .replace(/\\[,;!: ]/g, " ").replace(/\\[a-zA-Z]+/g, " ")
    .replace(/=/g, " equals ").replace(/\+/g, " plus ").replace(/(\s)-(\s)/g, "$1minus$2").replace(/^-|(?<=[\s(])-(?=\d)/g, "minus ")
    .replace(/\//g, " over ").replace(/[{}]/g, "").replace(/\(([^()\s]+)\)/g, " $1 ");
  return s;
}

export function speakable(text) {
  let s = String(text || "").replace(/\*\*/g, "").replace(/^\s*- /gm, "").replace(/^\s*---+\s*$/gm, "").replace(/\$\$?([^$]+)\$\$?/g, (_, m) => " " + math(m) + " ");   // **bold** is for the eye only
  for (const [re, w] of UNITS) s = s.replace(re, w);
  return s.replace(/[ \t]{2,}/g, " ").replace(/([.!?:])? *\n */g, (_, p) => (p || ".") + " ").trim();
}
