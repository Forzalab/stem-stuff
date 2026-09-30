#!/usr/bin/env bash
# Vercel Build & Setup Script for stem-stuff
# ==============================================================================
# SUMMARY OF REMOVED / CHANGED FEATURES FOR VERCEL DEPLOYMENT:
#
# 1. REMOVED: Git operations (`git clone`, `git fetch`, `git checkout`, `git pull`).
#    WHY: Vercel automatically clones the target branch and checks out the precise 
#    commit when triggering a build. Managing Git inside the script creates race 
#    conditions and fails due to missing SSH keys or write permissions.
#
# 2. REMOVED: Interactive TTY prompts (`/dev/tty`, `ask()`, `key()`).
#    WHY: Vercel builds run non-interactively in headless CI container environments. 
#    Reading from `/dev/tty` throws an error or freezes the build pipeline indefinitely.
#
# 3. REMOVED: Process management (`stop_old()`, `lsof`, `fuser`, `nohup`, `.host.pid`).
#    WHY: Vercel uses serverless/ephemeral execution environments. You cannot run long-lived 
#    background TCP listeners (`nohup python3 serve.py 5567`) or manage local PIDs. 
#    Routing is managed by Vercel's edge network directly to serverless entry points or WSGI/ASGI handlers.
#
# 4. REMOVED: Self-re-execution logic (`STEM_REEXEC`).
#    WHY: Build steps on Vercel are immutable single runs per deployment.
# ==============================================================================

set -euo pipefail

echo "==> Starting stem-stuff Vercel deployment setup..."

# 1. Environment Configuration
# Define location of problems dataset. Defaults to 'problems.json' in the repo root.
# On Vercel, customize this via Project Settings -> Environment Variables.
PROBLEMS="${STEM_PROBLEMS:-problems.json}"

# 2. Dependency Checking & Installation
# Ensures python3 is present and installs 'sympy' (required for math grading).
if command -v python3 >/dev/null 2>&1; then
  echo "==> Verifying Python dependencies..."
  python3 -c "import sympy" 2>/dev/null || {
    echo "==> Installing sympy..."
    python3 -m pip install --quiet sympy || {
      echo "error: Failed to install sympy" >&2
      exit 1
    }
  }
else
  echo "error: python3 is missing in the Vercel build container" >&2
  exit 1
fi

# 3. Verification of Problem Data
if [ -f "$PROBLEMS" ]; then
  echo "==> Found problem bank file at: $PROBLEMS"
else
  echo "==> Warning: Problem bank '$PROBLEMS' not found in current directory."
fi

echo "==> Vercel setup complete."
