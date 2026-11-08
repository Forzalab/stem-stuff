"""The repo's top-level layout, in one place. Mirror of tests/paths.mjs.

Tests and the hand map read these; layout P flips the values once the tree moves.
Current tree values (06 gate G5).
"""

ROOT = "."
SERVER = ["*.py", "engine/", "api/"]
DATA = ["banks/", "prompts/", "problems.json", "skills.json"]
CLIENT = [
    "*.js", "*.css", "*.mjs", "index.html", "calc.html", "privacy.html",
    "blind/", "calc/", "copy/", "design/explain-box.js", "design/explain-box.css",
    "rewards/", "vendor/",
]
SHARED = ["views/"]
TOOLS = ["tools/"]
LABS = ["design/*-lab.html", "try/views-demo.*"]

PATHS = {
    "ROOT": ROOT,
    "SERVER": SERVER,
    "DATA": DATA,
    "CLIENT": CLIENT,
    "SHARED": SHARED,
    "TOOLS": TOOLS,
    "LABS": LABS,
}
