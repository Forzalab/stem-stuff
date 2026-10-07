// cluck-author rubric: the machine checks of rubric.md. No deps.
// API: rubric(gen, ctx) -> { fails: [..], warns: [..], metrics: {...}, pass }
//   gen = an envelope {kind, lesson, l1, visual:{scene|chip}, hints, l2, l3, affirm}  (scene-gen / pregen)
//      or {text: "<plain Cluck reply>", level: 1|3}                                     (live /explain stream)
//   ctx = {code, key, choices:[{id,md}], pick, correct, verdict:"wrong"|"correct", question?}
// CLI: node rubric.mjs <file.json>   (file = {gen, ctx} or [{gen, ctx}, ...]); exit 1 on any FAIL.
import { readFileSync, readdirSync } from "node:fs";

const HERE = new URL("./", import.meta.url);
export const FK_MAX = 7, AVG_MAX = 14, SENT_MAX = 20, L1_CHARS = 160, STEP_WORDS = 12;

export const BANNED = ["delve", "crucial", "it's important to note", "it is important to note", "let's break it down", "let's dive", "dive into",
  "in essence", "key takeaway", "basically", "essentially", "clearly", "obviously", "of course", "simply", "easy", "great question",
  "wrong!", "you thought", "you're so smart", "physics person", "skill issue", "as an ai", "i cannot", "poof", "rubbed the lamp",
  "you should", "remember,", "note that", "it's worth noting", "a wish is a wish"];
const JUST = /\bjust\b(?!\s+(tell me|right|as))/i;                                 // "Just tell me" is the button's name
const SHAPES = [
  ["em_dash", /—|–|\s--\s/],
  ["not_x_but_y", /\bnot\b[^.?!;]{0,40}\bbut\b|\bisn'?t just\b|\bnot (just|only|merely)\b[^.?!]{0,40}\b(it'?s|also)\b|n'?t \w+[;,] it\b/i],
  ["hypophora", /\b(why|how|what)\b[^?]{0,60}\?\s+(because|it'?s|that'?s|simple|the answer)\b/i],
  ["italics", /(^|[^*])\*[^*\s][^*]*\*(?!\*)/],
  ["heading", /^#{1,6}\s/m],
];
const JOKEY = /\b(quack-|egg-?cellent|egg-?cident|pun|orbit-trary|quack-celeration|log-a-rithmic|lol|lmao|bruh|no cap|skibidi|rizz)\b/i;
const TOKEN_COLOUR = { c1: ["blue"], c2: ["orange"], c3: ["pink"], muted: ["grey", "gray"], grey: ["grey", "gray"], mark: ["yellow"] };
const COLOUR_WORDS = ["blue", "orange", "pink", "grey", "gray", "yellow", "green", "red", "purple"];
const UNIT_OUT = /\d\s*(J|N|m\/s\^?2?|ft\/s|ft|kg|rad\/s|W|kWh|m)\b/;
const NOTATION = [["dot_for_dx", /\\dot\{?f\}?\s*\(x\)/], ["w_for_omega", /\bw\s*\^?\s*2\b|\bm\s*r\s*w\b/], ["tfrac_inline", null]];

// ---------- text helpers ----------
export const stripMath = t => String(t || "").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$]*\$/g, " X ");
export const sentences = t => stripMath(t).split(/\n+/).flatMap(l => l.replace(/\s+/g, " ").split(/(?<=[.?!])\s+(?=[A-Z0-9"(])/)).map(s => s.trim()).filter(s => /[a-z]/i.test(s));
const words = s => s.match(/[A-Za-z][A-Za-z'’-]*|\d+(\.\d+)?/g) || [];
function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
export function fk(t) {                                    // Flesch-Kincaid grade on text with the math removed
  const all = sentences(t), done = all.filter(s => /[.?!]["')]?$/.test(s)), ss = done.length ? done : all, ws = ss.flatMap(words);   // prose sentences; bare labels skipped
  if (!ws.length) return 0;
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return +(0.39 * (ws.length / ss.length) + 11.8 * (syl / ws.length) - 15.59).toFixed(1);
}
const lens = t => sentences(t).map(s => words(s).length);

// numbers: \tfrac{9}{2} -> 9/2 ; \tfrac12 -> 1/2 ; 2.50 -> 2.5
const texNums = t => String(t || "").replace(/\\[dt]?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, " $1 / $2 ").replace(/\\[dt]?frac\s*(\d)(\d)/g, " $1 / $2 ")
  .replace(/\^\{?(\d)\}?/g, " ").replace(/_\{[^}]*\}|_\w/g, " ").replace(/\\[a-zA-Z]+/g, " ");
export const numbers = t => (texNums(t).match(/-?\d+(?:\.\d+)?/g) || []).map(Number).map(Math.abs);
const close = (a, b) => Math.abs(a - b) <= 0.006 * Math.max(1, Math.abs(b));
function allowedNums(ctx) {
  const base = [...numbers(ctx.key), ...(ctx.choices || []).flatMap(c => numbers(c.md)), 0, 1, 2];
  const derived = [];
  for (const a of base) for (const b of base) derived.push(a + b, Math.abs(a - b), a * b, b ? a / b : 0);
  return { base, derived };
}
const valueOf = ctx => { const c = (ctx.choices || []).find(c => c.id === ctx.correct); return c ? c.md : null; };
const normTex = t => String(t || "").replace(/\$|\\[,;!: ]|\s|\\text\{[^}]*\}|\\left|\\right|\\displaystyle/g, "").replace(/\\[dt]frac/g, "\\frac");

function leaks() {                                          // "CODE=phrase" or a plain phrase owned by the example's code:
  const out = [];
  let files = [];
  try { files = readdirSync(new URL("examples/", HERE)).filter(f => f.endsWith(".md")); } catch { return out; }
  for (const f of files) {
    const s = readFileSync(new URL("examples/" + f, HERE), "utf8");
    const own = (s.match(/^code:\s*(\S+)/m) || [])[1] || null;
    const line = (s.match(/^leak:\s*(.+)$/m) || [])[1];
    if (line) for (const e of line.split("|").map(x => x.trim()).filter(Boolean)) {
      const m = e.match(/^([A-Z0-9_]+)=(.+)$/);
      out.push(m ? { code: m[1], phrase: m[2] } : { code: own, phrase: e });
    }
  }
  return out.concat([{ code: null, phrase: "only one cart moves" }, { code: null, phrase: "The push before" }], goldGrams());
}
function goldGrams() {                                      // every 7-word run of a gold "l1" from an example with a code = a leak on any other question
  const out = [];
  let files = [];
  try { files = readdirSync(new URL("examples/", HERE)).filter(f => f.endsWith(".md")); } catch { return out; }
  for (const f of files) {
    const s = readFileSync(new URL("examples/" + f, HERE), "utf8"), own = (s.match(/^code:\s*(\S+)/m) || [])[1];
    const l1 = (s.match(/"l1":"([^"]+)"/) || [])[1];
    if (!own || !l1) continue;
    const w = l1.split(/\s+/);
    for (let i = 0; i + 7 <= w.length; i++) out.push({ code: own, phrase: w.slice(i, i + 7).join(" ") });
  }
  return out;
}

// ---------- the rubric ----------
export function rubric(gen, ctx = {}) {
  const fails = [], warns = [], F = (r, m) => fails.push(`${r}: ${m}`), W = (r, m) => warns.push(`${r}: ${m}`);
  const env = gen && !("text" in gen);
  const wrong = (ctx.verdict || "wrong") === "wrong";
  // the shown pieces, by level
  const l1 = env ? String(gen.l1 || "") : String(gen.text || "").trim().split(/\n/)[0];        // a stream: line 1 is the first line
  const preL3 = env ? [gen.l1, ...(gen.hints || []), gen.l2?.text, gen.l2?.tex, gen.visual?.chip?.tex, gen.visual?.chip?.line].filter(Boolean).join("\n")
    : (gen.level === 3 ? "" : String(gen.text || ""));
  const prose = env ? [gen.l1, ...(gen.hints || []), gen.l2?.text, ...(gen.l3?.steps || []).map(s => s.text), gen.l3?.close, gen.affirm?.text].filter(Boolean).join(" ")
    : String(gen.text || "");
  const all = env ? JSON.stringify(gen) : String(gen.text || "");
  const shownText = env ? [prose, gen.affirm?.joke, gen.l2?.tex, ...(gen.l3?.steps || []).map(s => s.tex), gen.visual?.chip?.tex, gen.l3?.value].filter(Boolean).join("\n") : String(gen.text || "");
  const m = { fk_l1: fk(l1), fk_all: fk(prose), l1_chars: l1.length, chars: shownText.length };
  const L = lens(prose); m.avg_words = L.length ? +(L.reduce((a, b) => a + b, 0) / L.length).toFixed(1) : 0; m.max_words = Math.max(0, ...L);

  // 1 fluency
  if (m.fk_l1 > FK_MAX) F("fk_l1", `FK ${m.fk_l1} > ${FK_MAX}`);
  if (m.fk_all > FK_MAX) F("fk", `FK ${m.fk_all} > ${FK_MAX}`);
  if (m.avg_words > AVG_MAX) F("sentence_avg", `${m.avg_words} words avg > ${AVG_MAX}`);
  if (m.max_words > SENT_MAX) F("sentence_max", `${m.max_words} words > ${SENT_MAX}`);
  const low = stripMath(shownText).toLowerCase();
  for (const b of BANNED) if (low.includes(b)) F("banned", JSON.stringify(b));
  if (JUST.test(stripMath(shownText))) F("banned", '"just"');
  for (const [r, re] of SHAPES) if (re.test(stripMath(shownText))) F(r, (stripMath(shownText).match(re) || [""])[0].slice(0, 50));
  if (/,\s+not\s+\w+/i.test(stripMath(shownText))) W("comma_not", "', not …' contrast (allowed once, prefer two sentences)");

  // 2 first block
  if (wrong) {
    if (l1.length > L1_CHARS + 40) F("l1_long", `${l1.length} chars > ${L1_CHARS + 40} (2 lines + the choice)`);
    if (/\$\$/.test(l1)) F("l1_math", "display math in line 1");
    if (/quack/i.test(l1)) F("l1_quack", "QUACK in line 1");
    if (JOKEY.test(l1) || /\([a-z ]*(flaps|waddles|ruffles|adjusts|taps)[^)]*\)/i.test(l1)) F("l1_joke", "joke / action in line 1");
    if (sentences(l1).length > 4) F("l1_sentences", `${sentences(l1).length} sentences in line 1`);
    const last = sentences(env ? l1 : String(gen.text || "")).slice(-1)[0] || "";
    if (gen.level !== 3 && !(/\?\s*$/.test(last) && /\bor\b/i.test(last))) F("ends_choice", `wrong pick does not end with a choice: "${last.slice(-60)}"`);
  }
  // 3 value before L3
  const v = valueOf(ctx);
  if (wrong && v && preL3) {
    const vn = numbers(v), hasNum = vn.length && vn.some(x => x !== 0);
    const hit = hasNum ? numbers(stripMath(preL3) + " " + preL3).some(x => vn.some(y => y > 2 && close(x, y))) : normTex(preL3).includes(normTex(v)) && normTex(v).length > 3;
    if (hit) F("value_before_L3", `the right value ${v} shows before L3`);
    if (/\\boxed/.test(preL3)) F("value_before_L3", "\\boxed before L3");
  }
  // 4 numbers + units + notation
  if (ctx.key) {
    const { base, derived } = allowedNums(ctx);
    const seen = numbers(env ? [prose, gen.l2?.tex, ...(gen.l3?.steps || []).map(s => s.tex), gen.visual?.chip?.tex].join(" ") : gen.text);
    for (const n of seen) {
      if (base.some(b => close(n, b))) continue;
      if (derived.some(b => close(n, b))) { W("number_derived", String(n)); continue; }
      if (ctx.question && numbers(ctx.question).some(b => close(n, b))) continue;
      F("number_invented", String(n));
    }
  }
  const unitText = stripMath(shownText).replace(/\byour\s+\**-?[\d.]+\s*[A-Za-z/_^]+/gi, " ");          // a quoted ghost label ("your 80 J") is scene text
  if (UNIT_OUT.test(unitText)) F("unit_outside_math", (unitText.match(UNIT_OUT) || [""])[0]);
  for (const [r, re] of NOTATION) if (re && re.test(all)) F("notation", r);
  if (/\$[^$\n]*\\tfrac[^$\n]*\$/.test(stripMathDisplay(prose))) W("notation", "\\tfrac inline in a sentence");

  // 5 envelope structure + cohesion
  if (env) {
    if (!["concept", "mechanical"].includes(gen.kind)) F("kind", `kind = ${gen.kind}`);
    if (!gen.lesson?.contrast_noun || !gen.lesson?.exam_move) F("lesson", "lesson.contrast_noun + exam_move required");
    const sc = gen.visual?.scene, chip = gen.visual?.chip;
    if (gen.kind === "mechanical" && sc?.marks?.some(m => m.ghost)) F("ghost_kind", "ghost on a mechanical slip");
    if (gen.kind === "mechanical" && !chip) F("chip", "mechanical slip without a chip");
    if (chip && !(typeof chip.tex === "string" && typeof chip.missing === "string" && normTex(chip.tex).includes(normTex(chip.missing)))) F("chip", "chip.missing is not a piece of chip.tex");
    if (sc) {
      const ghosts = (sc.marks || []).filter(m => m.ghost);
      const said = [gen.l1, gen.l2?.text].join(" ");
      for (const g of ghosts) if (g.label && !said.toLowerCase().includes(g.label.toLowerCase())) F("label_match", `ghost label "${g.label}" not quoted in l1/l2`);
      for (const t of (sc.marks || []).filter(m => m.truth && !m.ghost)) if (t.label && numbers(t.label).some(x => v && numbers(v).some(y => close(x, y)))) F("value_before_L3", `truth ${t.id} carries the value label`);
      const tokens = new Set((sc.marks || []).map(m => m.color).filter(Boolean));
      for (const w of COLOUR_WORDS) if (new RegExp(`\\b${w}\\b`, "i").test(said) && ![...tokens].some(t => (TOKEN_COLOUR[t] || []).includes(w))) F("colour_words", `"${w}" names no mark token in the scene`);
    }
    if (wrong && gen.kind === "concept" && !sc && !chip) W("visual", "concept slip with no visual");
    const steps = gen.l3?.steps || [];
    if (steps.length > 4) F("steps", `${steps.length} steps > 4`);
    for (const s of steps) { if (words(stripMath(s.text || "")).length > STEP_WORDS) F("step_line", `"${s.text}" > ${STEP_WORDS} words`); if (!s.tex) F("step_line", "a step without its equation"); }
    if (!gen.l3?.value) F("l3_value", "l3.value missing");
    if ((gen.hints || []).length < 1) F("hints", "no hints");
    const q = (String(gen.l1) + (gen.hints || []).join(" ") + (gen.l2?.text || "")).match(/quack/gi) || [];
    if (q.length) F("quack_wrong", "QUACK in a wrong-pick block");
    if (JOKEY.test(stripMath(preL3))) F("joke_in_lesson", "pun / slang in the lesson");
    if (gen.affirm?.joke && /\n/.test(gen.affirm.text || "")) W("affirm", "affirm text spans lines");
    if (gen.affirm && (/\b(smart|genius|brilliant|natural)\b/i.test(gen.affirm.text || ""))) F("praise_trait", "intelligence praise in the affirm");
  } else {
    // a plain stream: the whole thing is turn 1
    const q = (String(gen.text).match(/quack/gi) || []).length;
    if (wrong && q > 1) F("quack_count", `${q} QUACKs`);
    if (wrong && JOKEY.test(String(gen.text))) F("joke_in_lesson", "pun after a wrong pick");
    if (/\(\s*(flaps|waddles|ruffles|adjusts|taps)[^)]*\)/i.test(gen.text)) W("action", "an (action) in a wrong-pick reply");
    const end = String(gen.text).trim().slice(-1);
    if (end && !/[.?!$)`]/.test(end)) F("truncated", `ends "${String(gen.text).trim().slice(-25)}"`);
    if (m.chars > 700 && gen.level !== 3) F("too_long", `${m.chars} chars for an L1 reply (≤ 700)`);
  }
  for (const { code, phrase } of leaks()) if (code !== ctx.code && all.toLowerCase().includes(phrase.toLowerCase())) F("template_leak", JSON.stringify(phrase));
  return { fails, warns, metrics: m, pass: fails.length === 0 };
}
const stripMathDisplay = t => String(t || "").replace(/\$\$[\s\S]*?\$\$/g, " ");

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
  let bad = 0;
  for (const { gen, ctx, name } of Array.isArray(data) ? data : [data]) {
    const r = rubric(gen, ctx);
    bad += !r.pass;
    console.log(`${r.pass ? "PASS" : "FAIL"} ${name || ctx.code || ""} ${JSON.stringify(r.metrics)}`);
    for (const f of r.fails) console.log("  FAIL " + f);
    for (const w of r.warns) console.log("  warn " + w);
  }
  process.exit(bad ? 1 : 0);
}
