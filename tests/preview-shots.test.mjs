// preview-shots.mjs pure parts: the demo URL out of ship.log and the sha prefix compare (smoke).
import assert from "node:assert/strict";
import { demoUrl, shaOk } from "../tools/operations/preview-shots.mjs";

const log = "deploying origin/x @ abc1234 (#9) as demo\ndemo ready: https://stem-stuff-dr0ubat2w-forzalabs-projects.vercel.app\nsmoke green\n";
assert.equal(demoUrl(log), "https://stem-stuff-dr0ubat2w-forzalabs-projects.vercel.app");
assert.equal(demoUrl("demo building (log stream dropped, the build goes on): https://a-b.vercel.app\n"), "https://a-b.vercel.app");
assert.equal(demoUrl("live ready: https://x.vercel.app"), "", "live lines are not demo");
assert.equal(shaOk("abc1234", "abc1234def5678901234567890123456789012ab"), true);
assert.equal(shaOk("abc1234", "abd1234def"), false);
assert.equal(shaOk("", "abc1234"), false);
assert.equal(shaOk("abc", "abc1234"), false, "too short to prove anything");
console.log("ok preview-shots parse");
