// One-blink shots at 393x852 (Chromium). Local serve.py only; /explain and /chat are stubbed in-page (no API key, no model).
// usage: node shot-one-blink.mjs <baseUrl> <before|after> <outDir>      |    node shot-one-blink.mjs --steps <mode>   (prints the JS steps for ios-sim.py --js)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const LONG = "Momentum is conserved in the sticking collision. Before: 2.0 kg times 3.0 m/s. After: 3.0 kg times v. So v is 2.0 m/s, which is choice b.\n\nCheck: the heavier cart slows the pair to the same speed the light one had before.";
const SHORT = "Momentum is conserved, so v is 2.0 m/s.";
const CHAT = "Good question. The carts stick, so they move together after the hit: that is why we use the total mass, 3.0 kg, on the right-hand side of the equation and then solve for v.";
// modes: wait = /explain never answers; stream = /explain sends all text then hangs; chat = /explain finishes, /chat sends text then hangs; fail = /explain 500
const stub = mode => `(()=>{const enc=new TextEncoder(),orig=window.fetch,mk=(t,hang)=>new Response(new ReadableStream({start(c){c.enqueue(enc.encode(t));if(!hang)c.close();}}));
 window.fetch=(u,i)=>{const s=String(u);
  if(/explain$/.test(s)){ if(${JSON.stringify(mode)}==='fail')return Promise.resolve(new Response('{"error":"boom"}',{status:500})); if(${JSON.stringify(mode)}==='wait')return new Promise(()=>{});
    return Promise.resolve(mk(${JSON.stringify(mode)}==='stream'?${JSON.stringify(LONG)}:${JSON.stringify(SHORT)},${JSON.stringify(mode)}==='stream')); }
  if(/chat$/.test(s))return Promise.resolve(mk(${JSON.stringify(CHAT)},true));
  return orig(u,i);}; return 'stubbed ${mode}'})()`;
const pick = `(()=>{document.querySelector('#q .opt[data-id="a"]').click();document.querySelector('#q .ch[data-id="a"] .send').click();return 'sent'})()`;
const chip = `(()=>{const t=setInterval(()=>{const c=document.querySelector('#wish .wchip:not([hidden])');if(c){clearInterval(t);c.click();}},100);return 'chip armed'})()`;
const chat = `(()=>{const t=setInterval(()=>{const x=document.querySelector('#cluck .wtext');if(x&&x.textContent.includes('v is 2.0')&&!x.classList.contains('wrun')){clearInterval(t);const i=document.querySelector('#cluck .ask input');i.value='why use the total mass?';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#cluck .ask').requestSubmit();}},100);return 'chat armed'})()`;
const diag = `(()=>{const c=document.querySelector('#cluck');return JSON.stringify({carets:document.querySelectorAll('#cluck .wcaret').length,clLive:!!document.querySelector('.cl-live'),isTyping:/is typing/i.test(c.textContent),dots:document.querySelectorAll('#cluck .dots').length,wbusy:c.classList.contains('wbusy'),wrun:!!c.querySelector('.wrun'),text:c.querySelector('.wtext').textContent.slice(0,60),retry:!!c.querySelector('.wretry'),
  anims:document.getAnimations().filter(a=>a.playState==='running').map(a=>(a.animationName||a.constructor.name)+' on '+((a.effect&&a.effect.target&&(a.effect.target.id?'#'+a.effect.target.id:a.effect.target.className||a.effect.target.tagName))||'?')+(a.effect&&a.effect.pseudoElement||''))})})()`;
const steps = mode => [stub(mode), pick, chip, ...(mode === 'chat' ? [chat] : []), '0', '0', '0', diag];
if (process.argv[2] === '--steps') { console.log(JSON.stringify(steps(process.argv[3]))); process.exit(0); }
const [BASE, TAG, OUTDIR] = process.argv.slice(2);
mkdirSync(OUTDIR, { recursive: true });
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const states = [["a-wait", "wait", 450], ["b-stream", "stream", 2200], ["c-chat", "chat", 1800], ["d-fail", "fail", 900]];
  for (const [name, mode, ms] of states) {
    if (mode === "fail" && TAG === "before") continue;                       // d is AFTER only
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/#CALC1_B01");
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent.length > 0 && location.hash === "#CALC1_B01", null, { timeout: 8000 });
    await page.evaluate(stub(mode));
    await page.click('#q .opt[data-id="a"]'); await page.click('#q .ch[data-id="a"] .send');
    await page.waitForSelector("#wish .wchip:not([hidden])", { timeout: 6000 });
    await page.click("#wish .wchip");
    if (mode === "chat") {
      await page.waitForFunction(() => { const x = document.querySelector("#cluck .wtext"); return x && x.textContent.includes("v is 2.0") && !x.classList.contains("wrun"); }, null, { timeout: 10000 });
      await page.fill("#cluck .ask input", "why use the total mass?"); await page.click("#cluck .ask .send");
    }
    await page.waitForTimeout(ms);
    console.log(name, TAG, "chromium", await page.evaluate(diag));
    await page.screenshot({ path: `${OUTDIR}/${name}-${TAG}-chromium-393x852.png` });
    await ctx.close();
  }
} finally { await browser.close(); }
