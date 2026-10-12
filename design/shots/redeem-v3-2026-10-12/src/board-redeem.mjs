// usage: node board-redeem.mjs RDDIR OUTBOARD OUTSTRIP : T25 redeem v3 board (idle / right mid-flight / right landed / wrong) + the timed frame strip
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node-tools/node_modules/playwright-core");
const [D, OUT, STRIP] = process.argv.slice(2);
const png = p => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const R = JSON.parse(fs.readFileSync(`${D}/results.json`)), F = JSON.parse(fs.readFileSync(`${D}/strip.json`));
const css = `<style>body{margin:0;padding:18px;font:13px/1.4 system-ui;background:#1c2433;color:#dfe6f0}h1{font-size:18px;margin:0 0 4px}.n{color:#9fb0c8;font-size:12px}
.row{display:flex;gap:12px;margin-top:10px}.p{flex:1;text-align:center}.p div{height:440px;border-radius:8px;background-size:100% auto;background-position:0 -70px}
.p b{display:block;margin:6px 0 2px;color:#ffd36b}.k{margin-top:12px;background:#243047;border-radius:8px;padding:10px}.ok{color:#5fd38d;font-weight:700}</style>`;
const panel = (f, t, s, h = 640, y = -60) => `<div class=p><div style="height:${h}px;background-image:url(${png(f)});background-position:0 ${y}px"></div><b>${t}</b><span class=n>${s}</span></div>`;
const mid = F[3];
let h = css + `<h1>Redeem v3 (T25): the duck coin flies into the HUD, no words</h1><div class=n>try/genui-redeem.html?v=3 · Chromium 393x852 DPR 2 · the coin art is rewards/icons/coin24_color.svg, the same as the HUD coin</div>
<div class=row>${panel(`${D}/v3-idle.png`, "idle", "duck coin + \"+3\" beside Check; nothing in #fb")}${panel(mid.p, `right, mid-flight (${mid.ct} ms of 320)`, "one group: coin + 3 light discs on one arc, shrinking 32 -> 20 px; count still 12")}
${panel(`${D}/v3-right-landed.png`, "right, landed", "count 15 (ticked 12 -> 15 only on arrival); #rcoin empty")}${panel(`${D}/v3-wrong.png`, "wrong", "coin stays beside Check, dimmed (.45), no text")}</div>
<div class=k>Landing offset (getBoundingClientRect, flier vs HUD .coin): <span class=ok>dx ${R.land.dx}, dy ${R.land.dy}, dw ${R.land.dw}, dh ${R.land.dh} px</span> · count at arrival <span class=ok>${R.land.countAtArrival}</span>, count before arrival only ${JSON.stringify(R.countBeforeArrival)}, first tick at ${R.firstTickAt} ms (arrival seen at ${R.arrivalSampleAt} ms) ·
one-blink: ${R.samples} samples every 20 ms, <span class=ok>peak ${R.peakGroups} group</span> (${R.groupNames.join(", ")}) · infinite animations: <span class=ok>${R.infinite ? "YES" : "none"}</span> · reduced motion (media / ?rm=1): <span class=ok>${R["rm-media"].flyers} / ${R["rm-param"].flyers} fliers</span>, one fade, count ${R["rm-media"].final} / ${R["rm-param"].final} ·
visible narration: idle ${R["text-idle"].fbVisible}, right ${R["text-right-landed"].fbVisible}, wrong ${R["text-wrong"].fbVisible} lines (screen reader hears "${R["text-right-landed"].fbSr}" / "${R["text-wrong"].fbSr}") · .hud.bump ${R["text-right-landed"].bump} · .rd-burst ${R["text-right-landed"].burst}</div>`;
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await br.newPage({ viewport: { width: 1500, height: 600 }, deviceScaleFactor: 1 });
await pg.setContent(h); await pg.waitForTimeout(500); await pg.screenshot({ path: OUT, fullPage: true });
const fr = F.slice(0, 10);
let s = css + `<h1>Redeem v3: the flight, timed frames (played at 1/10 speed via CDP, labelled with the flight's own currentTime; L = landed)</h1><div class=row>` +
  fr.map(f => panel(f.p, `${f.ct} ms${f.landed ? " L" : ""}`, `count ${f.n}`, 340, -20)).join("") + "</div>";
await pg.setViewportSize({ width: 2400, height: 600 }); await pg.setContent(s); await pg.waitForTimeout(500); await pg.screenshot({ path: STRIP, fullPage: true });
await br.close(); console.log(OUT, STRIP);
