"""The repo's top-level layout, in one place. Mirror of tests/paths.mjs.

Tests and the hand map read these; layout P flips the values once the tree moves.
Current tree values (06 gate G5).
"""
import os as _os
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
SERVER_DIR = REPO              # P flips to REPO/server
API_DIR = _os.path.join(REPO, "api")
TESTS_DIR = _os.path.join(REPO, "tests")
def tool(group):
    """Absolute path of tools/<group>/ (build_and_ship, operations, bank_tools, client_generators, benchmarks, audits, author, repo_checks)."""
    return _os.path.join(REPO, "tools", group)


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
