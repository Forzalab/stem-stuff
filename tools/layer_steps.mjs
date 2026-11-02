// Emphasis-layer shade steps for figures (W157, Tony's amendment): node tools/layer_steps.mjs prints the --fig-<hue>-2|3 lines for app.css.
// Method: per theme (figure bg --body) and hue, step 1 = the hue's own token (unchanged, so a figure with no layer draws as before); steps 2 and 3
// are the LEAST dim blends of step 1 toward the bg that pass the rules: step 3 >= 4.5:1 (WCAG 1.4.3, labels; so also 1.4.11's 3:1 for strokes),
// adjacent steps dL* >= 12 (CIELAB). Where the 4.5:1 floor leaves less than 2 x 12 dL* of room, step 3 sits on the floor and step 2 splits the
// room equally (the test then asks for the best split, not 12). Real hex colours, never opacity.
import { fileURLToPath } from "node:url";
export const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const toHex = r => "#" + r.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Y = r => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
export const contrast = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const Lstar = r => { const y = Y(r); return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : y * 24389 / 27; };
export const mix = (f, b, p) => f.map((v, i) => v * p / 100 + b[i] * (1 - p / 100));
export const FLOOR = 4.5, STEP = 12;
export const HUES = ["ink", "muted", "c1", "c2", "c3", "ok", "bad", "mark"];
// the real token values (app.css :root and the .ai-box remap); c3 in Cluck = color-mix(help 55%, help-on)
const common = { ok: "#4ee6af", bad: "#eb596e", mark: "#ffcd94" };
export const THEMES = {
  page: { bg: "#101c2c", ink: "#e8edf5", muted: "#a7b7cd", c1: "#92c0ff", c2: "#ffb86b", c3: "#ff8fc8", ...common },
  cluck: { bg: "#17130f", ink: "#ece6df", muted: "#a99c8e", c1: "#ff9a3e", c2: "#ffdcc0", c3: toHex(mix(hex("#ff9a3e"), hex("#ffdcc0"), 55)), ...common },
};
export function steps(f, bg) {
  const L = p => Lstar(mix(f, bg, p)), C = p => contrast(mix(f, bg, p), bg), L1 = Lstar(f);
  let floorP = 100; while (floorP > 0 && C(floorP) >= FLOOR) floorP--; floorP++;
  let p2 = 99; while (p2 > 0 && L1 - L(p2) < STEP) p2--;
  let p3 = p2 - 1; while (p3 > 0 && L(p2) - L(p3) < STEP) p3--;
  if (p3 < floorP) { p3 = floorP; let bd = -1; for (let p = p3 + 1; p < 100; p++) { const d = Math.min(L1 - L(p), L(p) - L(p3)); if (d > bd) { bd = d; p2 = p; } } }
  return [f, mix(f, bg, p2), mix(f, bg, p3)];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, t] of Object.entries(THEMES)) {
    console.log("/* " + name + " */");
    console.log(HUES.map(h => { const s = steps(hex(t[h]), hex(t.bg)); return `--fig-${h}-2: ${toHex(s[1])}; --fig-${h}-3: ${toHex(s[2])};`; }).join(" "));
  }
}
