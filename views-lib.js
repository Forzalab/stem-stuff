// views-lib.js: THE component list of the "stem" view library (render plan v2, Part C), read from views/library.json
// (LibrarySpec, generated from views/registry.json by tools/gen_views.py: edit the registry, never this file or the JSON).
// views.js reads it (positional prop order, caps), the tests read it (no look props).
// Rules (refine F2/F3/F7/F19): no prop names a look (colour, size, icon, style...); look is CSS by cascade (views.css, page vs .ai-box).
// Every string prop has a maxLength and every list a maxItems: over a cap, the statement drops (`too-long`).
// Predict's `answer` is a key REFERENCE ("key.<id>"), never a literal: the page posts it with the pick to /predict and never
// resolves or draws it; the answer itself only ever arrives as a Reveal patch (F4, F5).
import spec from "./views/library.json" with { type: "json" };

/** LibrarySpec entry ({description, layer, props: {properties, required}}) -> this file's shape. */
const fromSpec = c => ({ layer: c.layer, desc: c.description, props: c.props?.properties || {}, required: c.props?.required || [] });

/** The library, views/library.json being its one source. */
export const LIB = { id: spec.id, version: spec.version, root: spec.root,
  components: Object.fromEntries(Object.entries(spec.components).map(([name, c]) => [name, fromSpec(c)])) };
/** Mark classes: the ONLY state vocabulary (engine NODE_STATE / EDGE_STATE + colour classes, refine F11/F19). */
export const MARKS = spec.marks;
export const DOODLES = LIB.components.Doodle.props.kind.enum;

/** The JSON Schema the vendored parser takes (createParser(schema, root)). Positional order = props key order. */
export function toSchema(lib = LIB) {
  const $defs = {};
  for (const [name, c] of Object.entries(lib.components))
    $defs[name] = { type: "object", description: c.desc, properties: c.props, required: c.required };
  return { $defs };
}
