// codes.mjs: the one place that knows code prefixes (T15) and the upload line (T14a).
// Unit tests for the module, the agreement with SCHEMA.md / serve.py / mode.mjs (read as text), the copy table, and the script order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schema } from "./schemas.mjs";
import * as C from "../codes.mjs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const ok = () => null;                                       // a shapeErr that finds nothing wrong
const prob = code => ({ code, type: "num", answer: "1", body: [{ type: "text", md: "x" }] });
const doc = (codes, bank) => ({ v: 1, ...(bank === undefined ? {} : { bank }), problems: codes.map(prob) });

test("constants: built-ins, reserved words, lengths", () => {
  assert.deepEqual(C.BUILTIN, ["CALC1", "CSCI26", "PHYS", "PSY"]);
  assert.deepEqual(C.RESERVED, ["BANK", "DIET", "SUGAR", "ADMIN", "UNADMIN"]);
  assert.deepEqual(C.LEN, { prefix: [3, 6], suffix: [3, 6] });
});

test("isCode: built-ins and custom prefixes, 3-6 suffix; reserved words, bad shapes no", () => {
  for (const c of ["CALC1_T6B", "CSCI26_BAA", "PHYS_P2XA", "PSY_ABC", "BEAR_QAA", "QZ9_ABC", "ABCDEF_ABCDEF", "BEAR_QAAAAA"]) assert.ok(C.isCode(c), c);
  for (const c of ["", "BEAR_QA", "BEAR_QAAAAAA", "AB_ABC", "ABCDEFG_ABC", "1BEAR_ABC", "bear_qaa", "BEAR-QAA", "BEARQAA", "BEAR_", "BANK_P2X", "DIET_ABC", "SUGAR_ABC", "ADMIN_ABC", "UNADMIN_ABC", "CALC1_T6B_X"])
    assert.ok(!C.isCode(c), c);
});
test("prefixes: custom = not built-in, not reserved", () => {
  assert.ok(C.isCustomPrefix("BEAR") && C.isCustomPrefix("QZ9") && C.isCustomPrefix("ABCDEF"));
  for (const p of ["PSY", "CALC1", "BANK", "DIET", "SUGAR", "ADMIN", "UNADMIN", "AB", "ABCDEFG", "9AB", ""]) assert.ok(!C.isCustomPrefix(p), p);
  assert.ok(C.isPrefix("PSY") && C.isPrefix("BEAR") && !C.isPrefix("DIET"));
  assert.equal(C.prefixOf("BEAR_QAA"), "BEAR");
  assert.equal(C.customBankFor("BEAR_QAA"), "BANK_BEAR");
  assert.equal(C.needsBank("BEAR_QAA"), "BEAR_QAA needs BANK_BEAR");
});
test("isBankId", () => {
  for (const b of ["BANK_BEAR", "BANK_PSY6", "BANK_ABC", "BANK_ABCDEF"]) assert.ok(C.isBankId(b), b);
  for (const b of ["bank_bear", "BANK_AB", "BANK_ABCDEFG", "BEAR", "BANK_", "BANK_BE-AR", null, 5, undefined]) assert.ok(!C.isBankId(b), String(b));
});

test("parse: separators, known sets, links", () => {
  assert.deepEqual(C.parse("bear qaa", C.ANY), { prefix: "BEAR", code: "BEAR_QAA" });
  assert.equal(C.parse("bearqaa", C.ANY), null);
  assert.equal(C.parse("BEAR_QAA"), null, "built-ins only by default");
  assert.equal(C.parse("BEAR_QAA", ["BEAR"]).code, "BEAR_QAA");
  assert.equal(C.parse("BEAR_QAA", ["COW"]), null);
  assert.equal(C.parse("#bear qaa", C.ANY, true), null);
  assert.equal(C.parse("#bear_qaa", C.ANY, true).code, "BEAR_QAA");
  assert.equal(C.parse("PHYSP2XA").code, "PHYS_P2XA");
  assert.equal(C.parse("ADMIN_ABC", C.ANY), null);
  assert.deepEqual(C.bareBank("p2x"), { prefix: "BANK", code: "BANK_P2X" });
  assert.equal(C.bareBank("toolong7"), null);
  assert.equal(C.bareBank("ab"), null);
});

test("screenBank: built-ins always kept, flagged or not", () => {
  const s = C.screenBank(doc(["PSY_ABC", "PHYS_P2X", "CALC1_T6B", "CSCI26_BAA"]), ok);
  assert.equal(s.kept.length, 4);
  assert.equal(s.flag, null);
  assert.deepEqual(s.skipped, { shape: 0, noflag: 0, badflag: 0, mismatch: 0, reserved: 0 });
  assert.equal(C.screenBank(doc(["PSY_ABC"], "BANK_PSY6"), ok).flag, "BANK_PSY6");
});
test("screenBank: a custom prefix needs a valid flag equal to the prefix", () => {
  const good = C.screenBank(doc(["BEAR_QAA", "BEAR_QAB"], "BANK_BEAR"), ok);
  assert.equal(good.kept.length, 2);
  assert.equal(good.flag, "BANK_BEAR");
  assert.equal(C.screenBank(doc(["BEAR_QAA"]), ok).skipped.noflag, 1);
  assert.equal(C.screenBank(doc(["BEAR_QAA"], "bear"), ok).skipped.badflag, 1);
  assert.equal(C.screenBank(doc(["BEAR_QAA"], "BANK_AB"), ok).skipped.badflag, 1);
  assert.equal(C.screenBank(doc(["BEAR_QAA"], 7), ok).skipped.badflag, 1);
  assert.equal(C.screenBank(doc(["BEAR_QAA"], "BANK_XYZ"), ok).skipped.mismatch, 1);
  assert.equal(C.screenBank(doc(["DIET_ABC"], "BANK_DIET"), ok).skipped.reserved, 1);
  assert.equal(C.screenBank(doc(["BANK_ABC"], "BANK_BANK"), ok).skipped.reserved, 1);
  assert.equal(C.screenBank(doc(["ADMIN_ABC"]), ok).skipped.reserved, 1, "reserved wins over a missing flag");
});
test("screenBank: a mixed file keeps what it may and counts the rest by reason", () => {
  const s = C.screenBank(doc(["PSY_ABC", "BEAR_QAA", "COW_QAA", "DIET_ABC", "BEAR_QAB"], "BANK_BEAR"), ok);
  assert.deepEqual(s.kept.map(p => p.code), ["PSY_ABC", "BEAR_QAA", "BEAR_QAB"]);
  assert.equal(s.skipped.mismatch, 1);
  assert.equal(s.skipped.reserved, 1);
  const n = C.screenBank(doc(["PSY_ABC", "BEAR_QAA"]), ok);
  assert.deepEqual(n.kept.map(p => p.code), ["PSY_ABC"]);
  assert.equal(n.skipped.noflag, 1);
});
test("screenBank: shapes and fatal", () => {
  const bad = { ...prob("BEAR_QAA"), body: [] };
  const s = C.screenBank({ bank: "BANK_BEAR", problems: [bad, null, 5, { type: "num" }, prob("BEAR_QA"), prob("BEAR_QAB")] }, p => (p.body.length ? null : "no body"));
  assert.deepEqual(s.kept.map(p => p.code), ["BEAR_QAB"]);
  assert.equal(s.skipped.shape, 5);
  for (const d of [null, 5, "x", [], {}, { problems: "no" }, { problems: {} }]) assert.equal(C.screenBank(d, ok).fatal, "notbank", JSON.stringify(d));
  assert.equal(C.screenBank({ problems: [] }, ok).fatal, null, "an empty list is not a wrong file: it just has nothing (No problems found)");
});
test("screenBank: the file name is not an input", () => {
  assert.equal(C.screenBank.length, 2);                      // (doc, shapeErr): no name anywhere
});

/* ---------- T14a copy table (design D1 section 3): every row, <= 4 words, no problem text ---------- */
const words = t => t.trim().split(/\s+/).length;
const rep = o => ({ ...C.emptyReport(), ...o });
const ROWS = [
  [rep({ kept: 28 }), "", "ok"],
  [rep({ kept: 1 }), "", "ok"],
  [rep({ kept: 25, shape: 3 }), "Loaded 25, skipped 3", "warn"],
  [rep({ kept: 4, noflag: 2 }), "Bank flag missing", "warn"],
  [rep({ noflag: 2 }), "Bank flag missing", "bad"],
  [rep({ kept: 4, badflag: 2 }), "Bank flag invalid", "warn"],
  [rep({ badflag: 2 }), "Bank flag invalid", "bad"],
  [rep({ kept: 4, mismatch: 1 }), "Prefix must match flag", "warn"],
  [rep({ mismatch: 1 }), "Prefix must match flag", "bad"],
  [rep({ kept: 4, reserved: 1 }), "Prefix is reserved", "warn"],
  [rep({ reserved: 1 }), "Prefix is reserved", "bad"],
  [rep({ json: 1 }), "Broken JSON file", "bad"],
  [rep({ big: 1 }), "File too big", "bad"],
  [rep({ notbank: 1 }), "Not a bank file", "bad"],
  [rep({ notjson: 1 }), "Not a JSON file", "bad"],
  [rep({}), "No problems found", "bad"],
  [rep({ shape: 3 }), "No problems found", "bad"]
];
test("uploadMsg: every row of the copy table, tone, 4 words at most", () => {
  for (const [r, text, tone] of ROWS) {
    const m = C.uploadMsg(r);
    assert.deepEqual(m, { text, tone }, JSON.stringify(r));
    assert.ok(words(m.text) <= 4, m.text);
  }
});
test("uploadMsg: several files, one line, by priority", () => {
  assert.equal(C.uploadMsg(rep({ json: 1, big: 1, noflag: 1 })).text, "Broken JSON file");
  assert.equal(C.uploadMsg(rep({ big: 1, notbank: 1 })).text, "File too big");
  assert.equal(C.uploadMsg(rep({ notbank: 1, notjson: 1 })).text, "Not a bank file");
  assert.equal(C.uploadMsg(rep({ notjson: 1, badflag: 1 })).text, "Not a JSON file");
  assert.equal(C.uploadMsg(rep({ badflag: 1, noflag: 1, mismatch: 1, reserved: 1 })).text, "Bank flag invalid");
  assert.equal(C.uploadMsg(rep({ noflag: 1, mismatch: 1, reserved: 1 })).text, "Bank flag missing");
  assert.equal(C.uploadMsg(rep({ mismatch: 1, reserved: 1 })).text, "Prefix must match flag");
  assert.equal(C.uploadMsg(rep({ kept: 3, noflag: 1, shape: 2 })).text, "Bank flag missing", "a flag reason beats the plain skip count");
  assert.equal(C.uploadMsg(rep({ kept: 3, json: 1 })).text, "Loaded 3, skipped 1", "a failed file next to a loaded one");
});
test("messages carry ids and counts only: no file name, no problem text", () => {
  const secret = "Find the stretch of the spring";
  const d = { v: 1, problems: [{ ...prob("BEAR_QAA"), answer: "SECRET-ANSWER", body: [{ type: "text", md: secret }] }] };
  const s = C.screenBank(d, ok), r = rep({ kept: s.kept.length, ...s.skipped });
  const m = C.uploadMsg(r);
  assert.ok(!m.text.includes(secret) && !m.text.includes("SECRET"));
  assert.equal(m.text, "Bank flag missing");
  assert.equal(C.notInFile("BEAR_QAA"), "BEAR_QAA not in file");
  assert.ok(words(C.notInFile("BEAR_QAA")) <= 4 && words(C.needsBank("BEAR_QAA")) <= 4);
});

/* ---------- agreement with the files that cannot import codes.mjs ---------- */
function* patterns(node) {
  if (!node || typeof node !== "object") return;
  if (node.properties && typeof node.properties === "object") for (const k of ["code", "sub", "before", "subject", "bank"]) {
    const p = node.properties[k];
    if (p && typeof p === "object" && typeof p.pattern === "string") yield [k, p.pattern];
  }
  for (const v of Object.values(node)) yield* patterns(v);
}
test("SCHEMA.md: the code / sub / before / bank / payload code + subject patterns are the ones codes.mjs generates", () => {
  const found = [...patterns(schema("problems")), ...patterns(schema("copy"))];
  const seen = new Set(found.map(([k]) => k));
  for (const k of ["code", "sub", "before", "subject", "bank"]) assert.ok(seen.has(k), `no ${k} pattern found in SCHEMA.md`);
  for (const [k, p] of found) {
    assert.equal(p, C.PATTERNS[k], k);   // problems.json "code" and the payload "code" are the same pattern; "sub" / "before" take one more suffix character
  }
  assert.ok(found.filter(([k]) => k === "code").length >= 2, "problem code and payload code");
});
test("SCHEMA.md patterns accept / refuse the same codes as isCode", () => {
  const re = new RegExp(C.PATTERNS.code);
  for (const c of ["CALC1_T6B", "BEAR_QAA", "PSY_ABC", "BANK_ABC", "DIET_ABC", "UNADMIN_ABC", "AB_ABC", "BEAR_QA", "bear_qaa", "ABCDEFG_ABC"])
    assert.equal(re.test(c), C.isCode(c), c);
});
test("serve.py: the bank id lengths are LEN.prefix; mode.mjs: its eaten words are RESERVED", () => {
  const py = read("serve.py"), [lo, hi] = C.LEN.prefix;
  for (const name of ["BANK_CODE", "BANK_PATH"]) {
    const line = py.split("\n").find(l => l.startsWith(name + " ="));
    assert.ok(line, name);
    assert.ok(line.includes(`{${lo},${hi}}`), `${name} uses {${lo},${hi}}: ${line}`);
  }
  assert.equal(C.PATTERNS.bank, `^BANK_[A-Z0-9]{${lo},${hi}}$`);
  const m = read("mode.mjs").match(/match\(\/\^#\?\(([A-Z|]+)\)\[/);
  assert.ok(m, "mode.mjs modePrefix regex not found");
  const eaten = m[1].split("|");
  assert.deepEqual(eaten.filter(w => !C.RESERVED.includes(w)), [], "mode.mjs eats a word that is not reserved");
  assert.deepEqual(C.RESERVED.filter(w => w !== "BANK" && !eaten.includes(w)), [], "a reserved word the code box does not eat");
  // the module's own verdict on "<W>_abc" matches what the code box would do with it: it is eaten, so it is never a custom prefix
  const re = new RegExp("^#?(" + m[1] + ")[\\s_-]+(.+)$", "i");
  for (const w of eaten) { assert.ok(re.test(w + "_abc"), w); assert.ok(!C.isCustomPrefix(w), w); }
});

test("index.html: app.js (it sets window.stemCodes) is listed before offline.js (it reads it)", () => {
  const html = read("index.html"), a = html.indexOf('src="app.js"'), o = html.indexOf('src="offline.js"');
  assert.ok(a > 0 && o > 0 && a < o);
  assert.match(read("app.js"), /window\.stemCodes = codes;/);
});
test("sw.js and the bundle know codes.mjs", () => {
  assert.ok(read("sw.js").includes('"codes.mjs"'));
});
test("only codes.mjs writes a length: no {3,6} / {2,5} in app.js, suggest.mjs, offline.js", () => {
  for (const f of ["app.js", "suggest.mjs", "offline.js"]) assert.doesNotMatch(read(f), /\{3,6\}|\{2,5\}|\{3,7\}/, f);
});
test("the file name never decides: offline.js ingest reads f.name only to label and to skip non-.json", () => {
  const off = read("offline.js"), a = off.indexOf("async function ingest"), b = off.indexOf("async function read(", a);
  const uses = off.slice(a, b).split("\n").filter(l => /\.name\b/.test(l));
  assert.ok(uses.length >= 3);
  // allowed: the .json filter, the label fallback, and bookkeeping of which files failed / were kept. Anything else is a decision on the name.
  for (const l of uses) assert.ok(/\.json\$|names\.set\(p\.code, s\.flag \|\| f\.name\)|bad\.push\(f\.name\)|keep\.push\(\{ name: f\.name/.test(l), "a decision on the file name? " + l.trim());
});
