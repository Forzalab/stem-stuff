// entry.ts: what vendor/openui-lang.mjs exports (tools/openui/build.sh copies this beside lang-core's src/index.ts).
// The parser, the streaming parser and the prompt generator (render plan v2, Part A), plus what a renderer and the tests need
// around them: patch merge, serializer, evaluator, state store, reactive marks, validation rules. Left out: defineComponent /
// createLibrary / extend (zod), Query manager and MCP (Query runs server side only, V2 amended), message protocol, Cloud.
export { createParser, createStreamingParser, parse } from "./parser";
export { mergeStatements } from "./parser/merge";
export { jsonToOpenUI } from "./parser/serialize";
export { generatePrompt, generateSystemPrompt } from "./parser/prompt";
export { enrichErrors } from "./parser/enrich-errors";
export { autoClose, split } from "./parser/statements";
export { tokenize } from "./parser/lexer";
export { walkAST } from "./parser/ast";
export { BUILTINS } from "./parser/builtins";
export { evaluate, isReactiveAssign, stripReactiveAssign } from "./runtime/evaluator";
export { evaluateElementProps, evaluateRoot } from "./runtime/evaluate-tree";
export { createStore } from "./runtime/store";
export { isReactiveSchema, markReactive } from "./reactive";
export { builtInValidators, parseRules, parseStructuredRules, validate } from "./utils/validation";
