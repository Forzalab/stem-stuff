"""The repo's top-level layout, in one place. Mirror of tests/paths.mjs.

Tests and the hand map read these. Layout P: the server lives in server/, its data in server/data/.
"""
import os as _os
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
SERVER_DIR = _os.path.join(REPO, "server")
API_DIR = _os.path.join(REPO, "api")
TESTS_DIR = _os.path.join(REPO, "tests")
def tool(group):
    """Absolute path of tools/<group>/ (build_and_ship, operations, bank_tools, client_generators, benchmarks, audits, author, repo_checks)."""
    return _os.path.join(REPO, "tools", group)


ROOT = "."
SERVER = ["server/*.py", "server/engine/", "api/"]
DATA = ["server/data/banks/", "server/data/prompts/", "server/data/problems.json", "server/data/skills.json"]
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
