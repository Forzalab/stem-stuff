// mycluck.mjs (E3, Tony #22/#25.8): the "My Cluck" login image, drawn on the device from the token the server sends.
// Pure: link + seed -> RGBA pixels, pixels -> link. The vendored encoder / decoder are the page's classic scripts, loaded here as globals.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
globalThis.qrcode = req("../vendor/qrcode-generator/qrcode.js");
globalThis.jsQR = req("../vendor/jsqr/jsQR.js");
const { drawCluck, decode, variant } = await import("../mycluck.mjs");

const TOK = "q3Xv9LkP0aZ_8-mN2bR4tw";                 // 128-bit base64url, the shape acct.py mints (E1)
const LINK = "https://stem-stuff.vercel.app/?k=" + TOK;
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test("draw -> decode gives the link back exactly", () => {
  const img = drawCluck(LINK, TOK);
  assert.equal(img.data.length, img.width * img.height * 4);
  assert.equal(decode(img), LINK);
  assert.equal(decode({ data: img.data, width: img.width, height: img.height }), LINK);   // plain ImageData shape is enough
});

test("the QR is large: its side is at least 70% of the image width", () => {
  const img = drawCluck(LINK, TOK);
  assert.ok(img.qr.size >= 0.7 * img.width, `${img.qr.size} / ${img.width}`);
});

test("same seed -> identical pixels", () => {
  const a = drawCluck(LINK, TOK), b = drawCluck(LINK, TOK);
  assert.equal(a.width, b.width);
  assert.ok(Buffer.from(a.data).equals(Buffer.from(b.data)));
});

test("different seeds -> different colour (and the colour is in the pixels)", () => {
  const seeds = ["AAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBB", "zz9-_x0aZqP3LkMn2bR4tw", "0000000000000000000001", TOK, "kitten_kitten_kitten_k"];
  const bodies = new Set(seeds.map(s => variant(s).body));
  assert.ok(bodies.size >= 3, `only ${bodies.size} colours over ${seeds.length} seeds`);
  const [s1, s2] = seeds.filter((s, i) => seeds.findIndex(t => variant(t).body === variant(s).body) === i);
  const a = drawCluck(LINK, s1), b = drawCluck(LINK, s2);
  assert.notDeepEqual(px(a, 4, 4), px(b, 4, 4));                 // the card frame is the Cluck's colour
  assert.notDeepEqual(px(a, 4, 4), [255, 255, 255, 255]);
  assert.ok(new Set(seeds.map(s => variant(s).hat)).size >= 2);
});

test("level H: 25% of the QR, at the centre, covered by art still decodes", () => {
  const img = drawCluck(LINK, TOK), { x, y, size } = img.qr;
  const side = Math.round(size / 2), x0 = x + (size - side) / 2 | 0, y0 = y + (size - side) / 2 | 0;   // side/2 squared = 25% of the area
  for (let j = y0; j < y0 + side; j++) for (let i = x0; i < x0 + side; i++) img.data.set([255, 210, 74, 255], (j * img.width + i) * 4);
  assert.equal(decode(img), LINK);
});

test("decode: no QR -> null", () => {
  const w = 64, data = new Uint8ClampedArray(w * w * 4).fill(255);
  assert.equal(decode({ data, width: w, height: w }), null);
});
