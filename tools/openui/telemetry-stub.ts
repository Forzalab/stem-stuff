// telemetry-stub.ts: replaces lang-core's src/telemetry/runtime.ts in the vendored build (tools/openui/build.sh).
// Upstream samples createParser().parse() and generateSystemPrompt() calls to PostHog when a server-side runtime opts in
// (and the npm postinstall sends install telemetry). The vendored copy sends nothing: same exports, no bodies, no fetch.
export const prepareParserParseTelemetry = (): undefined => undefined;
export const captureParserParseResult = (_context?: unknown, _result?: unknown): void => {};
export const captureParserParseException = (_context?: unknown): void => {};
export const recordSystemPromptGeneration = (_spec?: unknown, _inputShape?: unknown): void => {};
