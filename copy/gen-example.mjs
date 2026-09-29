// node copy/gen-example.mjs > copy/example.json
import { build, stringify } from "./payload.mjs";
const t0 = Date.parse("2026-09-29T20:00:00Z"), s = x => t0 + x * 1000;
const drafts = ["plug in", "plug in 2 gives 0/0", "plug in 2 gives 0/0 so factor",
  "plugging in 2 gives 0/0 so factor x^3-8", "plugging in 2 gives 0/0 so factor x^3-8 = (x-2)(x^2+2x+4)",
  "plugging in 2 gives 0/0 so factor x^3-8 = (x-2)(x^2+2x+4), cancel, plug in: 4+4+4 = 12"];
console.log(stringify(build({
  code: "CALC1-T6B", start: t0,
  tries: [{ t: s(95), a: "4", v: "wrong" }, { t: s(140), a: "12", v: "correct" }],
  hints: [{ t: s(95), n: 1, kind: "algebra" }],
  explain: drafts.at(-1),
  history: drafts.map((text, k) => ({ t: s(20 + k * 30), text })),
}, s(400))));
