/* mycluck.mjs: the "My Cluck" login image (Tony #22, #22b, #25.8). Pure ESM, no DOM.
   drawCluck(link, seed) -> { width, height, data, qr }: RGBA pixels (ImageData's shape) of a card with the link as a large
   level-H QR and a Cluck badge over its centre; colour + hat come from the seed (the token), so each kid's Cluck looks like theirs.
   decode(rgba) -> the QR's text (the link) or null. Both run on the device: the server only ever sends the token.
   Needs the vendored classic scripts as globals: qrcode (vendor/qrcode-generator) and jsQR (vendor/jsqr). */

const COLORS = [   // body, dark (outline + frame accents)
  { body: [255, 210, 74], dark: [224, 165, 0] },     // sunny
  { body: [255, 157, 184], dark: [224, 104, 141] },  // pink
  { body: [143, 211, 255], dark: [74, 163, 221] },   // sky
  { body: [140, 224, 170], dark: [60, 168, 104] },   // mint
  { body: [196, 166, 255], dark: [130, 96, 214] },   // lilac
  { body: [255, 178, 122], dark: [222, 120, 50] },   // peach
  { body: [200, 232, 90], dark: [138, 170, 30] },    // lime
  { body: [255, 128, 112], dark: [210, 72, 60] },    // coral
];
const HATS = ["cap", "party", "bow", "crown"];
const W = 600, FRAME = 16, QUIET = 4, BADGE = 0.17;   // badge radius / QR side: ~9% of the QR's area; centre art may grow to 20% (tests/mycluck.test.mjs)
const INK = [26, 20, 16], WHITE = [255, 255, 255], CARD = [255, 250, 240];

/* FNV-1a over the seed string: same token -> same Cluck, on every device */
const hash = s => { let h = 0x811c9dc5; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0; return h; };
export const variant = seed => { const h = hash(seed), c = COLORS[h % COLORS.length]; return { body: c.body, dark: c.dark, hat: HATS[(h >>> 8) % HATS.length] }; };

/* --- a tiny rasteriser: every shape tests pixel centres, so the output is exact and the same everywhere --- */
const canvas = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
function fill(img, x0, y0, x1, y1, inside, rgb) {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(img.width, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(img.height, Math.ceil(y1));
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++)
    if (inside(x + 0.5, y + 0.5)) { const i = (y * img.width + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255; }
}
const rect = (img, x, y, w, h, rgb) => fill(img, x, y, x + w, y + h, () => true, rgb);
const ellipse = (img, cx, cy, rx, ry, rgb) =>
  fill(img, cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, rgb);
const disc = (img, cx, cy, r, rgb) => ellipse(img, cx, cy, r, r, rgb);
function poly(img, pts, rgb) {   // convex polygon, any winding
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const side = (x, y) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]); });
  fill(img, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => { const s = side(x, y); return s.every(v => v >= 0) || s.every(v => v <= 0); }, rgb);
}
function roundRect(img, x, y, w, h, r, rgb) {
  fill(img, x, y, x + w, y + h, (px, py) => {
    const dx = Math.max(x + r - px, 0, px - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r));
    return dx * dx + dy * dy <= r * r;
  }, rgb);
}

/* the Cluck badge (shapes from the v18 spike, spike/qrlogin/qrlogin.js), centred at cx,cy with radius s */
function badge(img, cx, cy, s, v) {
  const u = s / 100, P = (x, y) => [cx + x * u, cy + y * u];
  disc(img, cx, cy, s, v.dark); disc(img, cx, cy, s * 0.94, WHITE);
  ellipse(img, cx, cy + 8 * u, 65 * u, 59 * u, v.dark); ellipse(img, cx, cy + 8 * u, 62 * u, 56 * u, v.body);   // body + outline
  ellipse(img, cx - 4 * u, cy - 50 * u, 7 * u, 12 * u, v.body);                                                 // tuft
  for (const k of [-1, 1]) {
    disc(img, cx + 40 * k * u, cy + 22 * u, 10 * u, [255, 160, 160]);                                          // cheeks
    disc(img, cx + 24 * k * u, cy, 7 * u, [43, 33, 24]); disc(img, cx + (24 * k + 2) * u, cy - 3 * u, 2.5 * u, WHITE);   // eyes
  }
  ellipse(img, cx, cy + 24 * u, 24.5 * u, 15.5 * u, [217, 115, 26]); ellipse(img, cx, cy + 24 * u, 22 * u, 13 * u, [255, 154, 46]);   // beak
  rect(img, cx - 14 * u, cy + 23 * u, 28 * u, 2.5 * u, [217, 115, 26]);
  if (v.hat === "cap") {
    fill(img, cx - 40 * u, cy - 60 * u, cx + 40 * u, cy - 36 * u, (x, y) => ((x - cx) / (40 * u)) ** 2 + ((y - cy + 36 * u) / (24 * u)) ** 2 <= 1, [58, 111, 224]);
    rect(img, cx - 4 * u, cy - 40 * u, 62 * u, 8 * u, [58, 111, 224]);
  } else if (v.hat === "party") {
    poly(img, [P(-26, -38), P(26, -38), P(0, -92)], [224, 74, 138]); disc(img, ...P(0, -92), 6 * u, [255, 225, 74]);
  } else if (v.hat === "bow") {
    poly(img, [P(0, -48), P(-30, -64), P(-30, -32)], [214, 58, 58]); poly(img, [P(0, -48), P(30, -64), P(30, -32)], [214, 58, 58]);
    disc(img, ...P(0, -48), 7 * u, [214, 58, 58]);
  } else {
    poly(img, [P(-28, -40), P(28, -40), P(28, -62), P(-28, -62)], [240, 190, 40]);
    for (const k of [-28, 0, 28]) poly(img, [P(k - 12, -61), P(k + 12, -61), P(k, -82)], [240, 190, 40]);
  }
}

export function drawCluck(link, seed) {
  const qr = globalThis.qrcode(0, "H"); qr.addData(String(link)); qr.make();
  const n = qr.getModuleCount(), cell = Math.floor((W - 2 * FRAME) / (n + 2 * QUIET)), size = n * cell;
  const box = (n + 2 * QUIET) * cell, H = W, ox = Math.floor((W - box) / 2), oy = Math.floor((H - box) / 2);
  const v = variant(seed), img = canvas(W, H);
  rect(img, 0, 0, W, H, v.body);                                // the frame is the Cluck's colour: "MY Cluck" at a glance
  roundRect(img, FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, 24, CARD);
  roundRect(img, ox, oy, box, box, 18, WHITE);                  // quiet zone stays plain white
  const qx = ox + QUIET * cell, qy = oy + QUIET * cell;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rect(img, qx + c * cell, qy + r * cell, cell, cell, INK);
  badge(img, qx + size / 2, qy + size / 2, size * BADGE, v);
  return { ...img, qr: { x: qx, y: qy, size } };
}

export function decode(rgba) {
  const d = rgba.data instanceof Uint8ClampedArray ? rgba.data : new Uint8ClampedArray(rgba.data);
  const r = globalThis.jsQR(d, rgba.width, rgba.height, { inversionAttempts: "attemptBoth" });
  return r ? r.data : null;
}
