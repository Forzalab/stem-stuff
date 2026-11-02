// The Jev model slug has one source of truth: tools/jev-model.mjs, read from env JEV_MODEL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SLUG = "microsoft/microsoft-decision-1";
const ROOT = new URL("../", import.meta.url);
const ONLY_HOME = "tools/jev-model.mjs";

test("jevModel(): default when JEV_MODEL is unset, env value when set", async () => {
  const { jevModel } = await import(new URL("../tools/jev-model.mjs", import.meta.url));
  const before = process.env.JEV_MODEL;
  try {
    delete process.env.JEV_MODEL;
    assert.equal(jevModel(), SLUG);
    process.env.JEV_MODEL = "example/other-model";
    assert.equal(jevModel(), "example/other-model");
  } finally {
    if (before === undefined) delete process.env.JEV_MODEL; else process.env.JEV_MODEL = before;
  }
});

test("the MSD-1 slug is spelled out only in tools/jev-model.mjs (and test files)", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(f => /\.(mjs|js|py)$/.test(f));
  const hits = [];
  for (const f of files) {
    if (f === ONLY_HOME || f.startsWith("tests/")) continue;
    let text;
    try { text = readFileSync(new URL(f, ROOT), "utf8"); } catch { continue; }
    if (text.includes(SLUG)) hits.push(f);
  }
  assert.deepEqual(hits, [], `slug spelled outside ${ONLY_HOME}: ${hits.join(", ")}`);
});
