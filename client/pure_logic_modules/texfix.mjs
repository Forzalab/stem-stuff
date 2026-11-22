// texfix.mjs: TeX fixes applied to a string right before KaTeX (ES module, pure; also set as window.TexFix by app.js for the plain-script graph.js).
// qmark: TeX classes "?" as a CLOSING atom, and a relation followed by a closing atom gets no space, so "L = ?" printed as "L =?".
// A bare "?" right after a relation (= < > \le \ge \approx \neq \to ...; spaces and \, \; \: \! \  between) is braced, "{?}", an ordinary atom: the gap returns.
// Idempotent (a braced "?" has "{" before it). Only the string handed to KaTeX changes; the grader and the copied plain text (nav.js texPlain) never see it.
const REL = "=|<|>|\\\\(?:le|leq|ge|geq|approx|neq|ne|to|rightarrow|equiv|sim|propto)(?![a-zA-Z])";
const QM = new RegExp(`(${REL})((?:\\s|\\\\[,;:! ])*)\\?`, "g");
export const qmark = tex => typeof tex === "string" && tex.indexOf("?") >= 0 ? tex.replace(QM, "$1$2{?}") : tex;
export default qmark;
