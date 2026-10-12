// usage: node redeem-v3.mjs OUTDIR PORT : T25 redeem v3 at 393x852: stills, a slowed frame strip, a webm, 20 ms sampling, reduced motion
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [OUT, PORT] = process.argv.slice(2), U = q => `http://127.0.0.1:${PORT}/try/genui-redeem.html?v=3${q}`;
fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const VP = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const R = {};
const ready = async pg => { await pg.waitForSelector("#rcoin", { state: "attached" }); await pg.waitForTimeout(400); };
const answer = async pg => { await pg.click('.opt[data-id="c"]'); };
// sampler: every 20 ms, the running animation groups, the HUD count, the flier
const SAMPLER = () => { window.__S = []; const t0 = performance.now(); window.__iv = setInterval(() => {
  const an = document.getAnimations().filter(a => a.playState === "running");
  window.__S.push({ t: Math.round(performance.now() - t0), groups: [...new Set(an.map(a => a.id || a.animationName || "?"))], inf: an.some(a => a.effect.getTiming().iterations === Infinity),
    n: document.querySelector("#coins").textContent, fly: !!document.querySelector(".rd-fly:not(.ghost)"), land: !!window.__rdLand }); }, 20); };
{ // 1. stills
  const ctx = await br.newContext(VP), pg = await ctx.newPage();
  for (const [n, q] of [["idle", ""], ["right-landed", "&state=right"], ["wrong", "&state=wrong"]]) {
    await pg.goto(U(q)); await ready(pg); await pg.screenshot({ path: `${OUT}/v3-${n}.png` });
    R["text-" + n] = await pg.evaluate(() => ({ rcoin: document.querySelector("#rcoin").innerText.trim(), fbVisible: [...document.querySelectorAll("#fb > *")].filter(e => !e.classList.contains("sr-only")).length,
      fbSr: document.querySelector("#fb").textContent.trim(), coins: document.querySelector("#coins").textContent, bump: !!document.querySelector(".hud.bump"), burst: !!document.querySelector(".rd-burst"), say: document.querySelectorAll(".rd-say").length }));
  }
  await ctx.close();
}
{ // 2. live, normal speed, 20 ms sampling (one-blink, arrival tick, landing offset)
  const ctx = await br.newContext(VP), pg = await ctx.newPage();
  await pg.goto(U("")); await ready(pg); await answer(pg); await pg.waitForTimeout(200);
  await pg.evaluate(SAMPLER); await pg.click("#check"); await pg.waitForTimeout(900);
  const S = await pg.evaluate(() => { clearInterval(window.__iv); return window.__S; });
  R.land = await pg.evaluate(() => window.__rdLand);
  const arrive = S.findIndex(s => s.land);
  R.samples = S.length; R.peakGroups = Math.max(...S.map(s => s.groups.length)); R.groupNames = [...new Set(S.flatMap(s => s.groups))];
  R.countBeforeArrival = [...new Set(S.slice(0, arrive).map(s => s.n))]; R.firstTickAt = S.find(s => s.n !== "12")?.t; R.arrivalSampleAt = S[arrive]?.t;
  R.final = await pg.evaluate(() => ({ coins: document.querySelector("#coins").textContent, fliers: document.querySelectorAll(".rd-fly").length, rcoinGone: document.querySelector("#rcoin").classList.contains("gone"), fb: document.querySelector("#fb").textContent }));
  R.infinite = S.some(s => s.inf); R.flySamples = S.filter(s => s.fly).length;
  fs.writeFileSync(`${OUT}/samples.json`, JSON.stringify(S));
  await ctx.close();
}
{ // 3. frame strip: the same flight at 1/10 speed (CDP Animation.setPlaybackRate), labelled with the flight's own currentTime
  const ctx = await br.newContext(VP), pg = await ctx.newPage(), cdp = await ctx.newCDPSession(pg);
  await pg.goto(U("")); await ready(pg); await answer(pg); await pg.waitForTimeout(200);
  await cdp.send("Animation.enable"); await cdp.send("Animation.setPlaybackRate", { playbackRate: .1 });
  await pg.click("#check"); const f = [];
  for (let i = 0; i < 12; i++) { const t = await pg.evaluate(() => { const a = document.getAnimations().find(a => a.id === "rd-fly" && a.effect.target.matches(".rd-fly:not(.ghost)"));
      return { ct: a ? Math.round(a.currentTime) : null, n: document.querySelector("#coins").textContent, landed: !!window.__rdLand }; });
    const p = `${OUT}/strip-${String(i).padStart(2, "0")}.png`; await pg.screenshot({ path: p }); f.push({ ...t, p }); await pg.waitForTimeout(380); }
  R.strip = f.map(x => `${x.ct}ms:${x.n}${x.landed ? "L" : ""}`); fs.writeFileSync(`${OUT}/strip.json`, JSON.stringify(f));
  await ctx.close();
}
{ // 4. webm at normal speed (idle 1 s, pick, Check, flight + tick, hold)
  const ctx = await br.newContext({ ...VP, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 393, height: 852 } } }), pg = await ctx.newPage();
  await pg.goto(U("")); await ready(pg); await pg.waitForTimeout(800); await answer(pg); await pg.waitForTimeout(500); await pg.click("#check"); await pg.waitForTimeout(1500);
  const v = pg.video(); await ctx.close(); fs.renameSync(await v.path(), `${OUT}/redeem-v3-fly.webm`);
}
for (const [k, how] of [["rm-media", "media"], ["rm-param", "param"]]) { // 5. reduced motion: no flight, one fade, the count updates
  const ctx = await br.newContext(VP), pg = await ctx.newPage();
  if (how === "media") await pg.emulateMedia({ reducedMotion: "reduce" });
  await pg.goto(U(how === "param" ? "&rm=1" : "")); await ready(pg); await answer(pg); await pg.waitForTimeout(200);
  await pg.evaluate(() => { window.__flyers = 0; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList?.contains("rd-fly")) window.__flyers++; }))).observe(document.body, { childList: true, subtree: true }); });
  await pg.evaluate(SAMPLER); await pg.click("#check"); await pg.waitForTimeout(600);
  const S = await pg.evaluate(() => { clearInterval(window.__iv); return window.__S; });
  R[k] = { flyers: await pg.evaluate(() => window.__flyers), peakGroups: Math.max(...S.map(s => s.groups.length)), groups: [...new Set(S.flatMap(s => s.groups))],
    final: await pg.evaluate(() => document.querySelector("#coins").textContent), fadeSamples: S.filter(s => s.groups.length).length };
  if (how === "param") await pg.screenshot({ path: `${OUT}/v3-rm-after.png` });
  await ctx.close();
}
await br.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 1)); console.log(JSON.stringify(R, null, 1));
