// The OpenUI 1.0 conformance adapter (spec/language.md, Appendix B; rules in tests/fixtures/openui/1.0/README.md) over the
// vendored lang-core (vendor/openui-lang.mjs). A port of upstream's packages/lang-core/src/__tests__/conformance.test.ts with
// zod taken out: evaluation only needs each component's prop keys and the reactive mark on bindable props.
// canon(text) -> the canonical result of one program; runCase(id) -> the diffs of one fixture case (empty = pass).
// `node tests/openui-canon.mjs` prints { "<area>/<case>": { text, ...canonical } } for every program case, and with `--stdin` reads
// a JSON list of program texts and prints their canonical results in order (both for the Python gate's differential test, test_oui.py).
import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  createParser, createStore, createStreamingParser, evaluate, evaluateRoot, jsonToOpenUI, markReactive, mergeStatements,
  parseStructuredRules, validate,
} from "../vendor/openui-lang.mjs";

export const FIXTURES = new URL("fixtures/openui/1.0/", import.meta.url);
const read = (...p) => readFileSync(new URL(p.join("/"), FIXTURES), "utf8");
const dirs = (...p) => readdirSync(new URL(p.map(x => x + "/").join(""), FIXTURES), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort();

export const spec = JSON.parse(read("library.json"));
const schema = spec.schema;

// library.json's functions have no code; a client supplies it.
const FUNCTIONS = { Upper: ({ text }) => String(text ?? "").toUpperCase() };

// What evaluateRoot / jsonToOpenUI read of a library: components[name].props.shape[key] (reactive mark) and toJSONSchema().
export const library = {
  root: spec.root,
  components: Object.fromEntries(Object.entries(spec.components).map(([name, { signature }]) => {
    const bindable = new Set([...signature.matchAll(/(\w+)\??: \$binding</g)].map(m => m[1]));
    const shape = Object.fromEntries(Object.keys(schema.$defs[name].properties ?? {}).map(key => {
      const s = {};
      if (bindable.has(key)) markReactive(s);
      return [key, s];
    }));
    return [name, { name, props: { shape } }];
  })),
  toJSONSchema: () => schema,
};
const functions = Object.fromEntries(Object.entries(schema.functions ?? {}).map(([name, f]) => [name, { ...f, fn: FUNCTIONS[name] }]));
const actionParams = Object.fromEntries(Object.entries(schema.actions ?? {}).map(([name, a]) => [name, Object.keys(a.params.properties ?? {})]));
const json = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a, b) => isDeepStrictEqual(json(a), json(b));

// ─── Summary (README, "How the tree is summarized") ───
function summarizeAction(s, ev) {
  switch (s.type) {
    case "continue_conversation": return { action: "ToAssistant", args: s.context == null ? [s.message] : [s.message, s.context] };
    case "open_url": return { action: "OpenUrl", args: [s.url] };
    case "set": return { action: "Set", args: [s.target, ev(s.valueAST) ?? null] };
    case "reset": return { action: "Reset", args: s.targets };
    case "run": return { action: "Run", args: [s.statementId] };
    default: {
      const params = s.params ?? {};
      const keys = actionParams[s.name] ?? Object.keys(params);
      return { action: s.name, args: keys.map(k => summarize(params[k], ev)) };
    }
  }
}

function summarize(v, ev) {
  if (v == null || typeof v !== "object") return v ?? null;
  if (Array.isArray(v)) return v.map(x => summarize(x, ev));
  if (v.type === "element") {
    const props = Object.entries(v.props).map(([k, pv]) => [k, summarize(pv, ev)]).filter(([, s]) => s !== null);
    return { type: v.typeName, props: Object.fromEntries(props) };
  }
  if (Array.isArray(v.steps)) return { actions: v.steps.map(s => summarizeAction(s, ev)) };
  if (v.__reactive === "assign") return { $binding: v.target };
  return Object.fromEntries(Object.entries(v).map(([k, pv]) => [k, summarize(pv, ev)]));
}

/** The canonical result at stream end, plus the evaluated tree for the roundtrip check. */
function evaluateResult(result) {
  const store = createStore();
  store.initialize(result.stateDeclarations ?? {}, {});
  // At stream end no fetch has returned: a query reads its defaults, a mutation is idle.
  const ctx = {
    getState: name => store.get(name) ?? null,
    resolveRef: name => {
      const q = result.queryStatements.find(s => s.statementId === name);
      if (q) return q.defaultsAST ? evaluate(q.defaultsAST, ctx) : null;
      return result.mutationStatements.some(s => s.statementId === name) ? { status: "idle", data: null, error: null } : null;
    },
    functions,
    actions: schema.actions,
  };
  const runtimeErrors = [];
  const tree = evaluateRoot(result, { ctx, library, store, errors: runtimeErrors });
  const errorObjects = [...result.meta.errors.map(e => ({ source: "parser", ...e, path: e.path || undefined })), ...runtimeErrors];
  return {
    tree,
    root: summarize(tree, ast => evaluate(ast, ctx)),
    errors: errorObjects.map(({ code, statementId }) => ({ code, statementId })),
    errorObjects,
    unresolved: result.meta.unresolved,
    orphans: result.meta.orphaned,
    incomplete: result.meta.incomplete,
    state: json(result.stateDeclarations ?? {}),
  };
}

// ─── Comparison (README, "Comparison") ───
/** Each expected entry claims its own actual entry that agrees on the keys it lists (more keys first). */
function claims(expected, actual) {
  const pool = [...actual];
  return [...expected].sort((a, b) => Object.keys(b).length - Object.keys(a).length).every(e => {
    const i = pool.findIndex(a => Object.entries(e).every(([k, v]) => same(v, a[k] ?? null)));
    return i !== -1 && pool.splice(i, 1).length === 1;
  });
}
const asSet = xs => (Array.isArray(xs) ? [...new Set(xs)].sort() : xs);
export const COMPARE = {
  root: same,
  errors: (w, g) => w.length === g.length && claims(w, g),
  unresolved: (w, g) => same(asSet(w), asSet(g)),
  orphans: (w, g) => same(asSet(w), asSet(g)),
  incomplete: same,
  state: same,
  statements: same,
  errorObjects: (w, g) => claims(w, g),
};
const OPTIONAL = ["state", "statements", "errorObjects"];

export const parse = text => createParser(schema, spec.root).parse(text);

/** The canonical form of one program (what a Level-1 client prints): no tree, no message text. */
export function canon(text, statements) {
  const { tree, errorObjects, ...out } = evaluateResult(parse(text));
  return { ...out, errorObjects: errorObjects.map(({ source, code, statementId, component, path }) =>
    json({ source, code, statementId, component, path })), ...(statements ? { statements } : {}) };
}

function check(id, expected, result, statements) {
  const actual = { ...evaluateResult(result), statements };
  const diffs = Object.entries(COMPARE)
    .filter(([k, ok]) => (k in expected || !OPTIONAL.includes(k)) && !ok(expected[k], actual[k]))
    .map(([k]) => `${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(actual[k])}`);
  if (id.includes("-roundtrip-") && actual.tree) {
    const text = jsonToOpenUI(actual.tree, library);
    const again = evaluateResult(parse(text)).root;
    if (!same(again, expected.root)) diffs.push(`roundtrip: ${JSON.stringify(text)} parses to ${JSON.stringify(again)}`);
  }
  return diffs;
}

/** The program text of a case: input.oui, the joined chunks, or input.oui with patch.oui merged in. */
export function programOf(files) {
  if (files["chunks.json"]) return { text: JSON.parse(files["chunks.json"]).join("") };
  if (files["patch.oui"] === undefined) return { text: files["input.oui"] };
  const text = mergeStatements(files["input.oui"], files["patch.oui"]);
  return { text, statements: text.split("\n").flatMap(l => /^(\$?\w+)\s*=(?!=)/.exec(l)?.[1] ?? []) };
}

function runProgram(id, files) {
  const expected = JSON.parse(files["expected.json"]);
  if (files["chunks.json"]) {
    const chunks = JSON.parse(files["chunks.json"]);
    const parser = createStreamingParser(schema, spec.root);
    chunks.forEach((chunk, i) => parser.push(chunk, i === chunks.length - 1));
    return [
      ...check(id, expected, parser.getResult(true)).map(d => `streamed ${d}`),
      ...check(id, expected, parse(chunks.join(""))).map(d => `batch ${d}`),
    ];
  }
  const { text, statements } = programOf(files);
  return check(id, expected, parse(text), statements);
}

function runValidation(files) {
  const { cases } = JSON.parse(files["validation.json"]);
  return cases.flatMap(({ rules, value, valid }, i) => {
    const error = validate(value, parseStructuredRules(rules));
    return (error === undefined) === valid ? [] : [`case ${i} ${JSON.stringify(rules)} ${JSON.stringify(value)}: got ${JSON.stringify(error)}`];
  });
}

export const caseIds = () => dirs().flatMap(area => dirs(area).map(name => `${area}/${name}`));
export const filesOf = id => Object.fromEntries(readdirSync(new URL(id + "/", FIXTURES)).map(f => [f, read(id, f)]));
export const runCase = id => { const files = filesOf(id); return files["validation.json"] ? runValidation(files) : runProgram(id, files); };

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--stdin") {
  const texts = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(JSON.stringify(texts.map(t => canon(t))) + "\n");
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {};
  for (const id of caseIds()) {
    const files = filesOf(id);
    if (files["validation.json"]) continue;
    const { text, statements } = programOf(files);
    out[id] = { text, ...canon(text, statements) };
  }
  process.stdout.write(JSON.stringify(out, null, 1) + "\n");
}
