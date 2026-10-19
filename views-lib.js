// views-lib.js: THE component list of the "stem" view library (render plan v2, Part C). One place, data only.
// views.js reads it (positional prop order, caps), the tests read it (no look props), and P0.2's registry will generate this
// file (plus the LibrarySpec JSON, the prompt and the checker list) instead of it being hand-kept.
// Rules (refine F2/F3/F7/F19): no prop names a look (colour, size, icon, style...); look is CSS by cascade (views.css, page vs .ai-box).
// Every string prop has a maxLength and every list a maxItems: over a cap, the statement drops (`too-long`).
// Predict has NO answer prop: the pick goes to the server (/predict) and the answer only ever arrives as a patch (F4, F5).

const str = (maxLength, extra = {}) => ({ type: "string", maxLength, ...extra });
const list = (items, maxItems, extra = {}) => ({ type: "array", items, maxItems, ...extra });
const ref = name => ({ $ref: `#/$defs/${name}` });
const ANY = { anyOf: [] };   // filled below with every component: a slot that takes any component

/** Mark classes: the ONLY state vocabulary (engine NODE_STATE / EDGE_STATE + colour classes, refine F11/F19). */
export const MARKS = ["cur", "done", "front", "rec", "idle", "tree", "seen", "skip", "k1", "k2", "k3"];
export const DOODLES = ["duck", "heart", "star", "spark"];

export const LIB = {
  id: "stem",
  version: "0.1.0",
  root: "View",
  components: {
    // ── L0 primitives ──
    View: { layer: "L0", desc: "The root: its children are painted in order, each into a slot reserved when the root arrives",
      props: { children: list(ANY, 6) }, required: ["children"] },
    Head: { layer: "L0", desc: "Title and one-line subtitle of a view",
      props: { title: str(60), sub: str(140) }, required: ["title"] },
    Text: { layer: "L0", desc: "A paragraph; **bold** is the only emphasis",
      props: { text: str(400) }, required: ["text"] },
    Legend: { layer: "L0", desc: 'Legend chips, each "mark label"; the sample is drawn with the figure\'s own class',
      props: { items: list(str(32), 8) }, required: ["items"] },
    Table: { layer: "L0", desc: "A small table: header cells, then rows of cells",
      props: { head: list(str(24), 5), rows: list(list(str(40), 5), 12) }, required: ["head", "rows"] },
    // ── L1 learning components ──
    Callout: { layer: "L1", desc: 'A section with a rule and a short tag ("Where it breaks"), never a box',
      props: { tag: str(24), text: str(400) }, required: ["tag", "text"] },
    Steps: { layer: "L1", desc: "A stepper: one figure, the steps, an optional frontier row and status table; Back/Next below",
      props: { fig: ref("Graph"), steps: list(ref("Step"), 8, { minItems: 1 }), front: str(32), head: list(str(24), 5) }, required: ["steps"] },
    Step: { layer: "L1", desc: 'One step: caption, node marks "A:cur B:front", edge marks "A-B:tree", tags "A:0", edge labels ["A-B:new"], frontier, table rows',
      props: { cap: str(140), nodes: str(200), edges: str(300), tags: str(200), labels: list(str(40), 12), front: list(str(8), 8), rows: list(list(str(40), 5), 12) },
      required: ["cap"] },
    Hints: { layer: "L1", desc: "A hint ladder: one hint at a time",
      props: { hints: list(str(200), 3, { minItems: 1 }) }, required: ["hints"] },
    Predict: { layer: "L1", desc: "Pick an answer; the pick is checked by the server, the page never holds the answer",
      props: { tag: str(24), q: str(140), choices: list(str(24), 5, { minItems: 2 }), struck: list(str(24), 4), tries: { type: "integer", minimum: 1, maximum: 3 } },
      required: ["q", "choices"] },
    Reveal: { layer: "L1", desc: "A visible locked row; its body arrives as a second program when the stage changes",
      props: { lock: str(80), body: list(ANY, 4) }, required: ["lock"] },
    Answer: { layer: "L1", desc: "The boxed answer and one sentence",
      props: { value: str(40), text: str(140) }, required: ["value"] },
    Doodle: { layer: "L1", desc: "A small drawing when nothing else fits (visual first)",
      props: { kind: { type: "string", enum: DOODLES }, text: str(80) }, required: ["kind"] },
    // ── L2 (minimal until P1.2 moves it onto graph.js) ──
    Graph: { layer: "L2", desc: 'A graph: nodes "A 48 100, B 160 48", edges "A>B, A-C" (> directed), column labels "48 depth 0", marks "A:done u0:k1"',
      props: { nodes: str(600), edges: str(600), cols: str(200), marks: str(400) }, required: ["nodes", "edges"] },
  },
};
ANY.anyOf = Object.keys(LIB.components).map(ref);

/** The JSON Schema the vendored parser takes (createParser(schema, root)). Positional order = props key order. */
export function toSchema(lib = LIB) {
  const $defs = {};
  for (const [name, c] of Object.entries(lib.components))
    $defs[name] = { type: "object", description: c.desc, properties: c.props, required: c.required };
  return { $defs };
}
