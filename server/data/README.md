# server/data

Files the server reads at runtime: `problems.json` (the built-in bank), `skills.json` (plain-words skill ideas), `banks/` (BANK_XXX.json practice banks, figs/, cram/intel.json), `prompts/` (Cluck's system prompts).
Nothing here is served to the browser; serve.py blocks `/server/`.
