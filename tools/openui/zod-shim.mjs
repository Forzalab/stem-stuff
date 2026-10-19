/* zod-shim.mjs: the zod-free build of OpenUI lang-core (tools/openui/build.sh). lang-core's parser, evaluator and prompt
   generator read zod schemas in exactly two places: the built-in functions and steps (parser/builtins.ts, functions.ts) are
   written as z.object(...), and the prompt reads their signatures back from `_zod.def` (signature.ts). Nothing validates with
   them; parsing uses the library's JSON Schema. So this file builds the same `_zod.def` shapes zod 4 builds, for the calls those
   two files make, and the bundle drops ~100 KB gzip of zod. tests/openui.test.mjs pins the prompt text to the one the
   official npm build (real zod) prints, so a drift here fails a test. Not a validator: no parse / safeParse. */

const make = def => {
  const s = { _zod: { def } };
  s.optional = () => make({ type: "optional", innerType: s });
  s.nullable = () => make({ type: "nullable", innerType: s });
  return s;
};

export const any = () => make({ type: "any" });
export const string = () => make({ type: "string" });
export const number = () => make({ type: "number" });
export const boolean = () => make({ type: "boolean" });
export const array = element => make({ type: "array", element });
export const literal = v => make({ type: "literal", values: [v] });
export const union = options => make({ type: "union", options });
export const record = (keyType, valueType) => make({ type: "record", keyType, valueType });
export const enum_ = values => make({ type: "enum", entries: Object.fromEntries(values.map(v => [v, v])) });
export const object = shape => Object.assign(make({ type: "object", shape }), { shape });

export const z = { any, string, number, boolean, array, literal, union, record, enum: enum_, object };
export { enum_ as enum };
