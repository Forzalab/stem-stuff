// views-demo.js: streams the demo programs (views-demo-src.js) into views.js, chunk by chunk, like a server forwarding a model's text.
import { stream } from "../views.js";
import { P10, P11, P2, DROPPED, chunk } from "./views-demo-src.js";
import { makePredict } from "./views-demo-server.js";

const $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search);
if (q.get("grey")) document.documentElement.classList.add("grey");
const fast = q.has("fast");
const wait = ms => new Promise(r => setTimeout(r, ms));
async function* drip(text, seed) { for (const c of chunk(text, seed)) { if (!fast) await wait(25); yield c; } }
const log = e => console.info("view dropped a statement:", e.code, e.statementId, e.message);

await Promise.all([
  stream(drip(P10, 1), $("#v1"), { onError: log }),
  stream(drip(P11, 2), $("#v2"), { predict: makePredict({ delay: fast ? 0 : 300 }), onError: log }),
  stream(drip(P2, 3), $("#v3"), { onError: log }),
  stream(drip(DROPPED, 4), $("#v4"), { doodle: "duck", onError: log }),
  stream(drip('root = View([d])\nd = Doodle("heart", "Nothing to draw for this one yet.")\n', 5), $("#v5"), { onError: log }),
]);

const n = +q.get("s1") || 1;
for (let i = 1; i < n; i++) $("#v1 .vw-foot .btn:nth-child(2)").click();
if (q.get("reveal")) {
  $('#v2 .vw-pill[data-v="5"]').click();
  $("#v2 .vw-go").click();
  for (let i = 0; i < 100 && !$("#v2 .vw-reveal.open"); i++) await wait(20);
}
document.documentElement.setAttribute("data-ready", "1");
