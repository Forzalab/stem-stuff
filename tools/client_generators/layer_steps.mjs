// Emphasis-layer shade steps for figures (W157, Tony's amendment): node tools/client_generators/layer_steps.mjs prints the --fig-<hue>-2|3 lines for app.css.
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
/* W163 figure palette: six Tailwind-style hue families for per-mark auto-hue, in AUTO ORDER (most distinct first). Picked by search (OKLCH grid, then
   hand-tuned): no green, no red (the app means green = correct, red = wrong: every hue dE00 >= 20 from ok and bad), every pair dE00 >= 20 at step 1 on both themes, and the first three stay
   dE00 >= 15 apart under deuteranopia + protanopia (sky / amber / orange differ in hue, then in lightness). Step 1 is the same hex in both themes (both
   figure bgs are dark, and every hex clears 4.5:1 on both); steps 2 / 3 are computed per theme below. */
export const PALETTE = { sky: "#5eb8ff", amber: "#ffd23f", orange: "#e0803a", violet: "#8f78f5", pink: "#f87fe0", cyan: "#2fd9e6" };
export const AUTO = Object.keys(PALETTE);
export const HUES = ["ink", "muted", "c1", "c2", "c3", "ok", "bad", "mark", ...AUTO];
// the real token values (app.css :root and the .ai-box remap); c3 in Cluck = color-mix(help 55%, help-on)
const common = { ok: "#4ee6af", bad: "#eb596e", mark: "#ffcd94" };
export const THEMES = {
  page: { bg: "#101c2c", ink: "#e8edf5", muted: "#a7b7cd", c1: "#92c0ff", c2: "#ffb86b", c3: "#ff8fc8", ...common, ...PALETTE },
  cluck: { bg: "#17130f", ink: "#ece6df", muted: "#a99c8e", c1: "#ff9a3e", c2: "#ffdcc0", c3: toHex(mix(hex("#ff9a3e"), hex("#ffdcc0"), 55)), ...common, ...PALETTE },
};
// CIEDE2000 (Sharma 2005) on CIELAB D65, and colour-vision-deficiency simulation (Machado, Oliveira, Fernandes 2009, severity 1.0, linear RGB)
const unlin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export const lab = r => {
  const l = r.map(lin), w = [0.95047, 1, 1.08883], f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [0.4124564 * l[0] + 0.3575761 * l[1] + 0.1804375 * l[2], 0.2126729 * l[0] + 0.7151522 * l[1] + 0.072175 * l[2], 0.0193339 * l[0] + 0.119192 * l[1] + 0.9503041 * l[2]].map((v, i) => f(v / w[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
export function de00(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))), ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360), h1 = hp(b1, ap1), h2 = hp(b2, ap2);
  let dh = 0, hb = h1 + h2; if (Cp1 * Cp2 !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; hb = Math.abs(h1 - h2) <= 180 ? hb / 2 : hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2; }
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const Sl = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
export const CVD = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
export const simulate = (r, m) => { const l = r.map(lin), c = v => Math.max(0, Math.min(255, unlin(Math.max(0, Math.min(1, v))))); return m.map(row => c(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); };
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
    console.log(AUTO.map(h => `--fig-${h}-1: ${t[h]};`).join(" ") + "  /* step 1, both themes: :root, .fig, .vw */");
    console.log(HUES.map(h => { const s = steps(hex(t[h]), hex(t.bg)); return `--fig-${h}-2: ${toHex(s[1])}; --fig-${h}-3: ${toHex(s[2])};`; }).join(" "));
  }
}
