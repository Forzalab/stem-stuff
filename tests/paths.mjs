// The repo's top-level layout, in one place. Tests and the hand map read these;
// The server lives in server/, its data in server/data/.

export const ROOT = ".";
export const SERVER = ["server/*/*.py", "api/"];
export const DATA = ["server/data/banks/", "server/data/prompts/", "server/data/problems.json", "server/data/skills.json"];
export const CLIENT = ["client/", "index.html", "calc.html", "privacy.html", "sw.js"];
export const SHARED = ["shared/openui/"];
export const TOOLS = ["tools/"];
export const LABS = ["client/labs/*-lab.html", "client/labs/views_demo/views-demo.*"];

export const PATHS = Object.freeze({
  ROOT, SERVER, DATA, CLIENT, SHARED, TOOLS, LABS,
});

export default PATHS;
