// The repo's top-level layout, in one place. Tests and the hand map read these;
// The server lives in server/, its data in server/data/.

export const ROOT = ".";
export const SERVER = ["server/*.py", "server/engine/", "api/"];
export const DATA = ["server/data/banks/", "server/data/prompts/", "server/data/problems.json", "server/data/skills.json"];
export const CLIENT = [
  "*.js", "*.css", "*.mjs", "index.html", "calc.html", "privacy.html",
  "blind/", "calc/", "copy/", "design/explain-box.js", "design/explain-box.css",
  "rewards/", "vendor/",
];
export const SHARED = ["views/"];
export const TOOLS = ["tools/"];
export const LABS = ["design/*-lab.html", "try/views-demo.*"];

export const PATHS = Object.freeze({
  ROOT, SERVER, DATA, CLIENT, SHARED, TOOLS, LABS,
});

export default PATHS;
