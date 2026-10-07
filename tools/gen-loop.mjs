#!/usr/bin/env node
// Gen-quality loop for the cluck-author skill (design/plans/GEN-QUALITY.md).
//   node tools/gen-loop.mjs loop  --cases <cases.json> --iter <n> [--skill] [--models a,b] [--only phys_concept,phys_mechanical] --out <log.jsonl>
//   node tools/gen-loop.mjs regen --cases <cases.json> --prod <gens.json> [--model m] --out <log.jsonl>
//   node tools/gen-loop.mjs grade-scene <case.json>       (internal: runs the scene gate in a child, prints @@RESULT)
// cases.json = [{name, code, pick, correct, choices:[{id,md}], key, slip, prompt}] where prompt = serve.py explain_prompt(p, pick)
// (built by the "Reproduce" snippet in design/plans/GEN-QUALITY.md). Key: $OPENROUTER_API_KEY (env only, never printed).
import { readFileSync, appendFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), "utf8");
const args = process.argv.slice(2), cmd = args[0];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };
export const FLASH = ["deepseek/deepseek-v4.1-flash", "google/gemini-3.8-flash"];
export const SMART = ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol"];

// ---------- prompts ----------
const sceneGen = () => read("author/prompts/scene-gen.md").split("## SYSTEM PROMPT (everything below this line is sent)")[1].trim();
const skill = () => {
  const dir = "author/skills/cluck-author/";
  const ex = readdirSync(new URL(dir + "examples/", ROOT)).filter(f => f.endsWith(".md")).sort().map(f => read(dir + "examples/" + f));
  return "SKILL (follow it; it overrides anything above that conflicts):\n\n" + read(dir + "SKILL.md") + "\n\nEXAMPLES (other questions: copy the shape, never their words or numbers):\n\n" + ex.join("\n\n");
};
const genieV5 = () => read("author/prompts/cluck-genie-v5.md").match(/```text\n([\s\S]*?)\n```/)[1];
const KITS = "KITS: mechanics (body, arrow/force, incline, spring, pulley), energy-bars (bar), graph-search (node, edge, trace); plus axes, fn, shade, poly, seg, text for graphs.";

// ---------- OpenRouter ----------
async function call(model, system, user, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const t0 = Date.now();
  const body = { model, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  // thinking per model, as serve.py REASONING does in prod (deepseek with thinking on spent all 6000 tokens before writing, it3)
  body.reasoning = model.startsWith("deepseek/") ? { enabled: false } : { effort: "low" };
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(120000),
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-Title": "stem-stuff gen-loop" }, body: JSON.stringify(body) });
  const j = await r.json();
  const ms = Date.now() - t0;
  if (!r.ok || j.error) return { ms, err: String(j.error?.message || r.status).slice(0, 200), text: "", usage: {} };
  const c = j.choices?.[0];
  return { ms, text: c?.message?.content || "", finish: c?.finish_reason, usage: j.usage || {}, served: j.model };
}
function parseEnvelope(text) {
  const s = text.replace(/^```(?:json)?\s*|\s*```\s*$/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object");
  return JSON.parse(s.slice(a, b + 1));
}

// ---------- scene grading (child process: scene.test.mjs registers node:test tests on import) ----------
function gradeScene(scene, kind, extra) {
  const dir = mkdtempSync(join(tmpdir(), "genloop-")), f = join(dir, "case.json");
  writeFileSync(f, JSON.stringify({ scene, kind, extra }));
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "grade-scene", f], { encoding: "utf8", timeout: 60000 });
  const line = (r.stdout || "").split("\n").find(l => l.startsWith("@@RESULT "));
  return line ? JSON.parse(line.slice(9)) : { fails: ["scene_gate: grader crashed " + (r.stderr || "").slice(0, 200)] };
}
async function gradeSceneChild(file) {
  const { scene, kind, extra } = JSON.parse(readFileSync(file, "utf8"));
  const out = [];
  try {
    const T = await import(new URL("tests/scene.test.mjs", ROOT));
    const { validator } = await import(new URL("tests/schemas.mjs", ROOT));
    const v = validator("scene");
    if (!v(scene)) out.push("schema: " + JSON.stringify(v.errors).slice(0, 300));
    else {
      out.push(...T.check(scene).map(x => "check: " + x));
      out.push(...T.lint({ scene, slip_kind: kind }));
      for (const inv of extra || []) {
        if (inv.type === "truth_area") {                          // the truth polys together enclose the KEY value
          const A = scene.marks.filter(m => m.truth && !m.ghost && m.mark === "poly").reduce((a, m) => a + Math.abs(shoelace(m.pts)), 0) * inv.scale;
          if (Math.abs(A - inv.equals) > 1e-3 * inv.equals) out.push(`area: truth encloses ${A} ≠ ${inv.equals}`);
        } else if (inv.type === "ghost_area") {
          for (const g of scene.marks.filter(m => m.ghost && m.mark === "poly")) { const r = T.physics(scene, { type: "area", mark: g.id, equals: "label", scale: inv.scale }); if (r) out.push(r); }
        } else if (inv.type === "ratio_area") {                   // unit-free: truth (signed by side of the axis) : ghost = KEY : her pick
          const signed = m => { const a = Math.abs(shoelace(m.pts)), cy = m.pts.reduce((s, p) => s + p[1], 0) / m.pts.length; return cy < 0 ? -a : a; };
          const tr = scene.marks.filter(m => m.truth && !m.ghost && m.mark === "poly").reduce((a, m) => a + signed(m), 0);
          const gh = scene.marks.filter(m => m.ghost && m.mark === "poly").reduce((a, m) => a + Math.abs(shoelace(m.pts)), 0);
          if (!gh || Math.abs(tr / gh - inv.truth / inv.ghost) > 0.01) out.push(`area: truth : ghost = ${tr} : ${gh}, want ${inv.truth} : ${inv.ghost}`);
        } else { const r = T.physics(scene, inv); if (r) out.push(r); }
      }
    }
  } catch (e) { out.push("scene_gate: " + String(e.message || e).slice(0, 200)); }
  console.log("@@RESULT " + JSON.stringify({ fails: out }));
  process.exit(0);
}
const shoelace = p => { let A = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; A += x0 * y1 - x1 * y0; } return A / 2; };
const SCENE_INV = {                                           // per situation: what the scene must prove
  phys_concept: { kind: "concept", inv: [{ type: "truth_area", equals: 60, scale: 2.5 }, { type: "ghost_area", scale: 2.5 }] },
  phys_mechanical: { kind: "mechanical", inv: [] },
  phys_vector: { kind: "concept", inv: [] },
  held_concept: { kind: "concept", inv: [{ type: "ratio_area", truth: 36, ghost: 48 }] },   // PHYS_XX3 c: kept only the part above the axis
  held_mechanical: { kind: "mechanical", inv: [] },                                         // PHYS_6AA a: multiplied by t
};

const ctxOf = c => ({ code: c.code, key: c.key, choices: c.choices, pick: c.pick, correct: c.correct, verdict: "wrong", question: c.prompt.split("CHOICES")[0] });

// ---------- commands ----------
async function loop() {
  const { rubric } = await import(new URL("author/skills/cluck-author/rubric.mjs", ROOT));
  const cases = JSON.parse(readFileSync(opt("cases"), "utf8"));
  const only = String(opt("only", "phys_concept,phys_mechanical")).split(",");
  const models = opt("models") ? String(opt("models")).split(",") : [...FLASH, ...SMART];
  const iter = Number(opt("iter", 1)), withSkill = !!opt("skill"), out = opt("out");
  const system = sceneGen() + (withSkill ? "\n\n" + skill() : "");
  const jobs = [];
  for (const c of cases.filter(c => only.includes(c.name))) for (const model of models) jobs.push((async () => {
    const user = c.prompt + "\n\n" + KITS + "\n\nReturn the JSON object now.";
    const r = await call(model, system, user, 6000);
    const rec = { iter, skill: withSkill, model, served: r.served, case: c.name, ms: r.ms, tokens: r.usage, finish: r.finish, err: r.err };
    let gen = null;
    try { gen = parseEnvelope(r.text); } catch (e) { rec.parse = String(e.message).slice(0, 120); }
    if (gen) {
      const rb = rubric(gen, ctxOf(c));
      const want = SCENE_INV[c.name] || { kind: null, inv: [] };
      const kindOk = !want.kind || gen.kind === want.kind;
      const sc = gen.visual?.scene ? gradeScene(gen.visual.scene, gen.kind, want.inv) : { fails: want.kind === "concept" ? ["scene: none for a concept slip"] : [] };
      rec.rubric = { fails: rb.fails, warns: rb.warns, metrics: rb.metrics };
      rec.scene = sc.fails; rec.kind = gen.kind; rec.kindOk = kindOk;
      rec.pass = rb.pass && !sc.fails.length && kindOk;
      rec.gen = gen;
    } else { rec.pass = false; rec.raw = r.text.slice(0, 400); }
    appendFileSync(out, JSON.stringify(rec) + "\n");
    console.log([`it${iter}`, withSkill ? "skill" : "plain", model, c.name, rec.ms + "ms", (r.usage.completion_tokens || "?") + "tok", rec.pass ? "PASS" : "FAIL",
      `rubric ${rec.rubric ? rec.rubric.fails.length : "-"} scene ${rec.scene ? rec.scene.length : "-"} kind ${rec.kind || "-"}`].join(" | "));
  })());
  await Promise.all(jobs);
}

async function regen() {
  const { rubric } = await import(new URL("author/skills/cluck-author/rubric.mjs", ROOT));
  const cases = JSON.parse(readFileSync(opt("cases"), "utf8"));
  const prod = JSON.parse(readFileSync(opt("prod"), "utf8"));
  const model = opt("model", FLASH[0]), out = opt("out");
  // --no-examples: SKILL.md only. The examples hold gold lines for these same 9 situations, so a with-examples regen partly measures copying.
  const sk = opt("no-examples") ? "SKILL (follow it):\n\n" + read("author/skills/cluck-author/SKILL.md") : skill();
  const system = genieV5() + "\n\n" + sk + "\n\nOUTPUT for this call: plain text per the LEVEL rules at the top (not JSON).";
  await Promise.all(cases.map(async c => {
    const r = await call(model, system, c.prompt + "\n\nLEVEL: 1", 1500);
    const p = prod.find(p => p.name === c.name);
    const now = rubric({ text: r.text, level: 1 }, ctxOf(c)), was = rubric({ text: p.text, level: 1 }, ctxOf(c));
    const rec = { regen: true, examples: !opt("no-examples"), model, served: r.served, case: c.name, ms: r.ms, tokens: r.usage, finish: r.finish, err: r.err, text: r.text,
      v5: { pass: now.pass, fails: now.fails, metrics: now.metrics }, prod: { pass: was.pass, fails: was.fails, metrics: was.metrics } };
    appendFileSync(out, JSON.stringify(rec) + "\n");
    console.log(`regen | ${model} | ${c.name} | ${r.ms}ms | v5 ${now.pass ? "PASS" : "FAIL"} ${now.fails.length} | prod ${was.pass ? "PASS" : "FAIL"} ${was.fails.length}`);
  }));
}

async function regrade() {                                    // re-run the current rubric + scene gate on logged gens (no model calls)
  const { rubric } = await import(new URL("author/skills/cluck-author/rubric.mjs", ROOT));
  const cases = String(opt("cases")).split(",").flatMap(f => JSON.parse(readFileSync(f, "utf8")));
  const rows = readFileSync(opt("log"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  for (const r of rows) {
    const c = cases.find(c => c.name === r.case);
    if (r.regen) { const now = rubric({ text: r.text, level: 1 }, ctxOf(c)); r.v5 = { pass: now.pass, fails: now.fails, metrics: now.metrics }; continue; }
    if (!r.gen) continue;
    const want = SCENE_INV[r.case] || { kind: null, inv: [] };
    const rb = rubric(r.gen, ctxOf(c));
    const sc = r.gen.visual?.scene ? gradeScene(r.gen.visual.scene, r.gen.kind, want.inv) : { fails: want.kind === "concept" ? ["scene: none for a concept slip"] : [] };
    r.rubric_v1 = r.rubric_v1 || r.rubric; r.pass_v1 = r.pass_v1 ?? r.pass;
    r.rubric = { fails: rb.fails, warns: rb.warns, metrics: rb.metrics }; r.scene = sc.fails;
    r.pass = rb.pass && !sc.fails.length && (!want.kind || r.gen.kind === want.kind);
  }
  writeFileSync(opt("log"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  for (const r of rows) console.log([r.regen ? "regen" : `it${r.iter}`, r.model, r.case, r.regen ? (r.v5.pass ? "PASS" : "FAIL") : r.pass ? "PASS" : "FAIL"].join(" | "));
}

if (cmd === "grade-scene") await gradeSceneChild(args[1]);
else if (cmd === "regrade") await regrade();
else if (cmd === "loop") await loop();
else if (cmd === "regen") await regen();
else { console.log("usage: see the header of tools/gen-loop.mjs"); process.exit(2); }
