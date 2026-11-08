// The repo's top-level layout, in one place. Tests and the hand map read these;
// layout P flips the values once the tree moves. Current tree values (06 gate G5).

export const ROOT = ".";
export const SERVER = ["*.py", "engine/", "api/"];
export const DATA = ["banks/", "prompts/", "problems.json", "skills.json"];
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
