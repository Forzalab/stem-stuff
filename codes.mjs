/* codes.mjs: the ONE place that knows problem-code prefixes (SCHEMA.md "Codes", design/BANK.md).
   Pure ESM, no DOM. app.js and suggest.mjs import it; offline.js is a classic script and reads it from window.stemCodes (app.js sets it).
   Built-in prefixes work everywhere, flagged or not. A custom prefix (3-6 of A-Z0-9, not built-in, not reserved) is accepted from an
   uploaded file only when the file carries a valid "bank": "BANK_XXX" flag and the prefix equals the flag minus "BANK_".
   The file name is never read by anything here. */

/* far-future extension: change the lengths here; tests/codes.test.mjs checks SCHEMA.md and serve.py agree */
export const LEN = { prefix: [3, 6], suffix: [3, 6] };
export const BUILTIN = ["CALC1", "CSCI26", "PHYS", "PSY"];
export const RESERVED = ["BANK", "DIET", "SUGAR", "ADMIN", "UNADMIN"];   // mode.mjs eats the last four from the code box; BANK is the bank-id prefix

const [P0, P1] = LEN.prefix, [S0, S1] = LEN.suffix;
const PREFIX_RE = `[A-Z][A-Z0-9]{${P0 - 1},${P1 - 1}}`;
const NOT_RESERVED = `(?!(?:${RESERVED.join("|")})_)`;
/* strings, so tests/codes.test.mjs can compare them with the patterns pinned in SCHEMA.md (static JSON, cannot import) */
export const PATTERNS = {
  code: `^${NOT_RESERVED}${PREFIX_RE}_[A-Z0-9]{${S0},${S1}}$`,
  sub: `^${NOT_RESERVED}${PREFIX_RE}_[A-Z0-9]{${S0},${S1 + 1}}$`,        // a split part may carry one more character
  before: `^${NOT_RESERVED}${PREFIX_RE}_[A-Z0-9]{${S0},${S1 + 1}}$`,
  bank: `^BANK_[A-Z0-9]{${P0},${P1}}$`,
  subject: `^(?!(?:${RESERVED.join("|")})$)${PREFIX_RE}$`
};
const SHAPE = new RegExp(`^(${PREFIX_RE})_[A-Z0-9]{${S0},${S1}}$`);       // a code's shape, reserved words included (screenBank tells them apart)
const BANK_ID = new RegExp(PATTERNS.bank);
const PREFIX = new RegExp(`^${PREFIX_RE}$`);

export const prefixOf = code => { const m = String(code || "").match(SHAPE); return m ? m[1] : String(code || "").split("_")[0]; };
export const isBuiltin = p => BUILTIN.includes(p);
export const isReserved = p => RESERVED.includes(p);
/* a prefix any bank may use: right shape, not a built-in and not a reserved word */
export const isCustomPrefix = p => PREFIX.test(String(p)) && !isBuiltin(p) && !isReserved(p);
/* a prefix the page can open: built-in or custom (never BANK / DIET / ...) */
export const isPrefix = p => PREFIX.test(String(p)) && !isReserved(p);
export const isCode = code => { const m = SHAPE.exec(String(code)); return !!m && !isReserved(m[1]); };
export const isBankId = s => typeof s === "string" && BANK_ID.test(s);
export const customBankFor = code => "BANK_" + prefixOf(code);
export const needsBank = code => `${code} needs ${customBankFor(code)}`;
export const notInFile = code => `${code} not in file`;

/* ---------- parsing what a person types, pastes or links ----------
   Built-ins and BANK keep their optional separator ("calc1 t6b", "CALC1-T6B", "PHYSP2XA"). A custom prefix needs a separator
   ("_", "-" or a space; a link: "_" only), else "bearqaa" or "toolong7" would be taken for a code.
   custom: false = built-ins only | "any" | a Set / array of prefixes the device knows | link: the "#" form (custom needs "_") */
export const ANY = "any";
const BUILT_RE = new RegExp(`^(${[...BUILTIN, "BANK"].join("|")})[\\s_-]*([A-Z0-9]{${S0},${S1}})$`);
const CUSTOM_RE = new RegExp(`^(${PREFIX_RE})[\\s_-]+([A-Z0-9]{${S0},${S1}})$`);
const LINK_RE = new RegExp(`^(${PREFIX_RE})_([A-Z0-9]{${S0},${S1}})$`);
export function parse(raw, custom = false, link = false) {
  const s = String(raw || "").toUpperCase().trim().replace(/^#/, "");
  let m = s.match(BUILT_RE);
  if (m) return { prefix: m[1], code: `${m[1]}_${m[2]}` };
  if (!custom) return null;
  m = s.match(link ? LINK_RE : CUSTOM_RE);
  if (!m || !isCustomPrefix(m[1])) return null;
  if (custom !== ANY && !new Set(custom).has(m[1])) return null;
  return { prefix: m[1], code: `${m[1]}_${m[2]}` };
}

/* the code box only: a bare run of letters / digits the length of a bank suffix means a bank ("p2x" -> BANK_P2X) */
const BARE = new RegExp(`^[A-Z0-9]{${P0},${P1}}$`);
export const bareBank = raw => {
  const s = String(raw || "").toUpperCase().trim().replace(/^#/, "");
  return BARE.test(s) ? { prefix: "BANK", code: `BANK_${s}` } : null;
};

/* ---------- an uploaded bank file: what may it keep, and why not the rest ----------
   doc: the parsed JSON. shapeErr(p) -> a string when a problem is malformed (offline.js validate() without the code test).
   -> { flag, kept: [problem], skipped: { shape, noflag, badflag, mismatch, reserved }, fatal }
   flag: the valid "bank" value, else null. fatal: "notbank" (no problems array), else null. */
export function screenBank(doc, shapeErr) {
  const skipped = { shape: 0, noflag: 0, badflag: 0, mismatch: 0, reserved: 0 };
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.problems)) return { flag: null, kept: [], skipped, fatal: "notbank" };
  const has = doc.bank !== undefined, flag = isBankId(doc.bank) ? doc.bank : null, kept = [];
  for (const p of doc.problems) {
    if (!p || typeof p !== "object" || typeof p.code !== "string" || !SHAPE.test(p.code) || shapeErr(p)) { skipped.shape++; continue; }
    const pre = prefixOf(p.code);
    if (isBuiltin(pre)) kept.push(p);
    else if (isReserved(pre)) skipped.reserved++;
    else if (!has) skipped.noflag++;
    else if (!flag) skipped.badflag++;
    else if (pre !== flag.slice(5)) skipped.mismatch++;
    else kept.push(p);
  }
  return { flag, kept, skipped, fatal: null };
}

/* ---------- T14a: the one line an upload ends in (#entryMsg, and the offline dialog) ----------
   report: totals over every picked file: { kept, shape, noflag, badflag, mismatch, reserved, json, big, notbank, notjson }.
   Counts and ids only; never a file name or problem text. 4 words at most. tone: warn | bad; a clean upload is { text: "" } (nothing is shown) */
export const emptyReport = () => ({ kept: 0, shape: 0, noflag: 0, badflag: 0, mismatch: 0, reserved: 0, json: 0, big: 0, notbank: 0, notjson: 0 });
const FLAG_ROWS = [["badflag", "Bank flag invalid"], ["noflag", "Bank flag missing"], ["mismatch", "Prefix must match flag"], ["reserved", "Prefix is reserved"]];
const FILE_ROWS = [["json", "Broken JSON file"], ["big", "File too big"], ["notbank", "Not a bank file"], ["notjson", "Not a JSON file"]];
export function uploadMsg(r) {
  const some = r.kept > 0;
  if (!some) {
    for (const [k, t] of [...FILE_ROWS, ...FLAG_ROWS]) if (r[k] > 0) return { text: t, tone: "bad" };
    return { text: "No problems found", tone: "bad" };
  }
  for (const [k, t] of FLAG_ROWS) if (r[k] > 0) return { text: t, tone: "warn" };
  const lost = r.shape + r.json + r.big + r.notbank;
  if (lost > 0) return { text: `Loaded ${r.kept}, skipped ${lost}`, tone: "warn" };
  return { text: "", tone: "ok" };   // Q11 = b: a clean upload says nothing (the opened question and the bank label are the proof)
}
