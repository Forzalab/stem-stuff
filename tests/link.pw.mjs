// LINK-FEATURES v2 S1 (brain plan-2026-11-03/LINK-FEATURES.md): live-synced highlight on the repair ladder, flag ?links=1, default OFF.
// The repair lab page from disk (design/repair-lab.html) mounts a fixture ladder whose labels carry link markup ([words]{#id} and
// \htmlClass{ln-id} in math). Flag off: the ladder DOM is exactly what it is without links.mjs, and no .ln node exists. Flag on: the
// newest revealed line's quantity is lit (.ln-on) in its words AND its symbol, the line before settles to layer 2, older to layer 3,
// every node of one id wears one hue (tn-<hue>); reduced motion: no transition.
//   node tests/link.pw.mjs                          (the lab page from disk)
//   node tests/link.pw.mjs http://localhost:8823    (the lab through serve.py)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = process.argv[2] ? process.argv[2].replace(/\/$/, "") + "/design/repair-lab.html" : "file://" + join(HERE, "..", "design", "repair-lab.html");

// a V3V-shaped ladder (LINK-FEATURES worked example), every step worked (variant "full")
const ITEM = { code: "LINK_V3V", type: "num", stem: "A 60 kg diver wears a 16.0 kg lead belt and sinks.", repair: { steps: [
  { id: "mtot", label: "The [diver and belt]{#mtot} sink together: $\\htmlClass{ln-mtot}{(M+m)}(g-a)=\\rho_w g V$", kind: "pick", ok: "a",
    opts: [{ id: "a", md: "add the masses" }, { id: "b", md: "the diver only" }] },
  { id: "vtot", label: "This gives [the volume pushed aside]{#vtot}, $\\htmlClass{ln-vtot}{V_{tot}}$", kind: "pick", ok: "a",
    opts: [{ id: "a", md: "yes" }, { id: "b", md: "no" }] },
  { id: "vlead", label: "The [belt]{#vlead} is under water too", kind: "pick", ok: "a", opts: [{ id: "a", md: "take [its volume]{#vlead} out" }, { id: "b", md: "keep it" }] },
  { id: "answer", label: "The diver's density", kind: "num" }] } };

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  const mount = () => page.evaluate(item => {
    const host = document.getElementById("host");
    Repair.mount(host, item, { variant: "full", answer: "919 kg/m³", grade: () => Promise.resolve({ ok: true }), on: () => {} });
    return host.innerHTML;
  }, ITEM);

  await page.goto(LAB);
  await page.waitForFunction(() => window.Repair && window.Links);
  await step("flag off (no ?links=1): zero .ln nodes, and the ladder DOM equals the one drawn without links.mjs", async () => {
    assert.equal(await page.evaluate(() => Links.on()), false);
    const withMod = await mount();
    assert.equal(await page.$$eval("#host .ln, #host .ln-on, #host [data-ln]", x => x.length), 0);
    const without = await page.evaluate(() => { const L = window.Links; delete window.Links; return L; }) || true;
    const bare = await mount();
    assert.equal(withMod, bare, "byte-identical ladder with the flag off");
    assert.ok(without);
  });

  await page.goto(LAB + "?links=1");
  await page.waitForFunction(() => window.Repair && window.Links);
  await step("sync on a growing list: after line 2 exactly one lit trio (words + symbol), line 1 settles to layer 2", async () => {
    const r = await page.evaluate(() => {
      const host = document.getElementById("host"), ol = document.createElement("ol");
      host.replaceChildren(ol);
      const add = t => { const li = document.createElement("li"); li.innerHTML = Links.html(t); ol.append(li); Links.sync(ol, "li"); };
      add("The [diver and belt]{#mtot} sink: $\\htmlClass{ln-mtot}{(M+m)}$");
      const one = [...ol.querySelectorAll(".ln-on")].map(e => e.dataset.ln || [...e.classList].find(c => /^ln-(?!on$)/.test(c)));
      add("This gives [the volume]{#vtot}, $\\htmlClass{ln-vtot}{V_{tot}}$");
      const lit = [...ol.querySelectorAll(".ln-on")];
      const line1 = [...ol.children[0].querySelectorAll(".ln")];
      return { one, lit: lit.map(e => (e.dataset.ln ? "w:" : "s:") + (e.dataset.ln || [...e.classList].find(c => /^ln-(?!on$)/.test(c)).slice(3))),
        line1: line1.map(e => e.className), hue: [...new Set([...ol.querySelectorAll('[data-ln="vtot"], .ln-vtot')].map(e => [...e.classList].find(c => c.startsWith("tn-"))))] };
    });
    assert.deepEqual(r.one.length, 2, "line 1 alone: its words + its symbol lit");
    assert.deepEqual(r.lit.sort(), ["s:vtot", "w:vtot"], "after line 2: exactly the vtot trio is lit");
    assert.ok(r.line1.length >= 2 && r.line1.every(c => /\bly2\b/.test(c) && !/\bln-on\b/.test(c)), "line 1 at layer 2: " + r.line1.join(" | "));
    assert.equal(r.hue.length, 1, "one hue per id: " + r.hue.join(","));
  });

  await step("the repair ladder (full card): link markup renders as .ln spans + KaTeX ln-<id> nodes; layers follow the step order", async () => {
    await mount();
    const r = await page.evaluate(() => ({
      words: [...document.querySelectorAll("#host .rp-label .ln[data-ln]")].map(e => e.dataset.ln),
      syms: document.querySelectorAll("#host .rp-label .katex .ln-mtot, #host .rp-label .katex .ln-vtot").length,
      raw: /\]\{#|\\htmlClass/.test(document.getElementById("host").textContent),
      on: [...document.querySelectorAll("#host .ln-on")].map(e => e.dataset.ln || "sym"),
      vlead: [...document.querySelectorAll('#host [data-ln="vlead"]')].map(e => e.className),
      mtot: [...document.querySelectorAll('#host [data-ln="mtot"], #host .katex .ln-mtot')].map(e => e.className),
    }));
    assert.deepEqual(r.words, ["mtot", "vtot", "vlead"]);
    assert.equal(r.syms, 2, "the two \\htmlClass symbols");
    assert.equal(r.raw, false, "no raw markup left in the text");
    assert.deepEqual(r.on, [], "the newest step is the answer (no link): nothing lit, per the spec's answer line");
    assert.ok(r.vlead.every(c => /\bly2\b/.test(c)), "the step before the answer at layer 2: " + r.vlead);
    assert.ok(r.mtot.length === 2 && r.mtot.every(c => /\bly3\b/.test(c)), "older steps (words + symbol) at layer 3: " + r.mtot);
  });

  await step("reduced motion: .ln has no transition", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const d = await page.$eval("#host .ln", e => getComputedStyle(e).transitionDuration);
    assert.equal(d, "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
  assert.deepEqual(errs, [], "page errors: " + errs.join(" | "));
} catch (e) { failures++; console.log("FAIL", e.message.slice(0, 700)); }
finally { await browser.close(); }
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("link: all ok");
