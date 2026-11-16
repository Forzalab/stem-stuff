// bento4 smoke helpers (no DOM): load the pure halves (bento_feat.js, bento_cost.js) in a vm sandbox + a text -> measurement model that mimics the probe
// (wrapped height + overflow per column span) so the layout can be tested on thousands of sets without a browser.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client/answer/answer_strip");
export function load() {
  const ctx = { performance }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["bento_feat.js", "bento_cost.js"]) vm.runInContext(readFileSync(join(DIR, f), "utf8"), ctx, { filename: f });
  return { Feat: ctx.stemBentoFeat, Cost: ctx.stemBentoCost };
}
export function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PADX = 16, SAFE = 2, GAP = 8;
/* text with $math$ -> measurement. char widths: short (<=14) 12px, text 9.2px, math 13px/char (display 24px) */
export function measure(text, R, C) {
  const maths = [...text.matchAll(/\$([^$]+)\$/g)].map(m => m[1]), rest = text.replace(/\$[^$]+\$/g, "").trim(), mathOnly = !rest && maths.length > 0;
  const kind = mathOnly ? "p" : text.replace(/\$/g, "").length <= 14 ? "s" : "t", cw = kind === "s" ? 12 : 9.2, LH = kind === "t" ? 24 : 28;
  const mathW = maths.reduce((a, m) => a + Math.max(14, m.replace(/\\[a-z]+/g, "x").length * 13), 0);
  const tokens = text.split(/\s+/).filter(Boolean).map(w => /^\$/.test(w) ? { w: Math.max(14, w.replace(/\\[a-z]+/g, "x").length * 13) } : { w: w.length * cw });
  const cellW = (R - (C - 1) * GAP) / C, by = [];
  for (let s = 1; s <= C; s++) {
    const inner = Math.max(20, cellW * s + (s - 1) * GAP - 2 * PADX - SAFE); let lines = 1, x = 0, over = false;
    for (const t of tokens) { if (t.w > inner) over = true; if (x && x + cw + t.w > inner) { lines++; x = t.w; } else x += (x ? cw : 0) + t.w; }
    const frac = /frac/.test(text); by.push({ h: (mathOnly && frac ? 2.2 : 1) * lines * LH + (kind === "p" && !frac ? 0 : 0), over });
  }
  return { kind, by, text, mathOnly, mathW: mathOnly ? mathW : mathW, chars: rest.length + Math.round(mathW / 9) };
}
const TOK = ["$5.20$", "$4.12$", "$1.42$", "$7$", "$9$", "$0.5$", "A", "Yes", "No", "None", "$x^2$", "$3\\pi$", "up", "down", "12 m", "$2.5$"];
const SHORT = ["increases", "decreases", "stays constant", "oscillates", "None of these", "Both A and B", "zero", "doubles", "is halved", "gets larger"];
const PHR = ["The net force is zero here", "Kinetic energy is conserved", "It speeds up then slows", "The charge doubles each time", "Only the second statement", "Both loops carry current"];
const SENT = ["The magnetic flux through the loop increases, so the induced current must oppose that change by flowing counterclockwise.", "Since the net external force on the system is zero, the total momentum before and after the collision stays the same.", "The capacitor keeps charging until the voltage across it equals the emf of the battery in the circuit.", "Energy is transferred to the gas as heat while its volume stays constant, so its temperature rises."];
const WMATH = ["$\\dfrac{3}{4}$", "$\\sqrt{x^2+y^2}$", "$\\dfrac{mv^2}{2r}$", "$\\dfrac{q}{4\\pi\\epsilon_0 r^2}$", "$\\dfrac{1}{2}mv^2 + mgh$"];
/* a random option set: N 2..8; each option drawn from the mix (token / short / phrase / sentence / wide formula); pick-all and mc look the same here */
export function randomSet(rng, N, mix) {
  const P = mix || [["tok", .28], ["short", .27], ["phr", .2], ["sent", .15], ["wm", .1]], pickOf = a => a[Math.floor(rng() * a.length)];
  const prof = rng(), out = [];
  for (let i = 0; i < N; i++) {
    let r = rng(), k = P[0][0]; for (const [n, p] of P) { if (r < p) { k = n; break; } r -= p; k = n; }
    if (prof < .15) k = "tok"; else if (prof < .27) k = "short";    // some sets are uniform (all tokens / all short words)
    out.push(k === "tok" ? pickOf(TOK) : k === "short" ? pickOf(SHORT) : k === "phr" ? pickOf(PHR) : k === "sent" ? pickOf(SENT) : pickOf(WMATH));
  }
  return out;
}
export function check(cells, C, n) {
  const bad = [], occ = {}; let H = 0, last = -1;
  if (cells.length !== n) bad.push("count");
  cells.forEach((c, i) => { H = Math.max(H, c.row + c.rs - 1); if (c.col < 1 || c.col + c.cs - 1 > C) bad.push("out"); const a = (c.row - 1) * C + c.col; if (a <= last) bad.push("order " + i); last = a;
    for (let y = c.row; y < c.row + c.rs; y++) for (let x = c.col; x < c.col + c.cs; x++) { const k = x + "," + y; if (occ[k]) bad.push("overlap"); occ[k] = 1; } });
  for (let y = 1; y <= H; y++) for (let x = 1; x <= C; x++) if (!occ[x + "," + y]) bad.push("hole");
  return bad;
}
