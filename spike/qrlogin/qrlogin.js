// Spike: "My Cluck" QR login card. Prototype, not production.
// Needs globals: qrcode (vendor/qrcode-generator), jsQR (vendor/jsqr).
(function (root) {
  var ORIGIN = 'https://stem-stuff.vercel.app/';
  var W = 640, H = 820, QR_PX = 480;
  var COLORS = [
    { body: '#ffd24a', dark: '#e0a500', name: 'sunny' },
    { body: '#ff9db8', dark: '#e0688d', name: 'pink' },
    { body: '#8fd3ff', dark: '#4aa3dd', name: 'sky' },
  ];
  var HATS = ['cap', 'party', 'bow'];

  function makeToken() {
    var b = new Uint8Array(24); // 192 bits
    crypto.getRandomValues(b);
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function linkFor(token) { return ORIGIN + '?k=' + token; }
  function variantFor(token) {
    var h = 0;
    for (var i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
    return { color: COLORS[h % COLORS.length], hat: HATS[(h >>> 8) % HATS.length] };
  }
  function extractToken(text) {
    try {
      var k = new URL(text).searchParams.get('k');
      return k && /^[A-Za-z0-9_-]{22,}$/.test(k) ? k : null;
    } catch (e) { return null; }
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawCluck(ctx, cx, cy, s, v) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill();
    ctx.lineWidth = s * 0.06; ctx.strokeStyle = v.color.dark; ctx.stroke();
    var u = s / 100;
    ctx.fillStyle = v.color.body; ctx.strokeStyle = v.color.dark; ctx.lineWidth = 3 * u;
    ctx.beginPath(); ctx.ellipse(0, 8 * u, 62 * u, 56 * u, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-4 * u, -50 * u, 7 * u, 12 * u, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,90,110,.35)';
    ctx.beginPath(); ctx.arc(-40 * u, 22 * u, 10 * u, 0, 7); ctx.arc(40 * u, 22 * u, 10 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(-24 * u, 0, 7 * u, 0, 7); ctx.arc(24 * u, 0, 7 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-22 * u, -3 * u, 2.5 * u, 0, 7); ctx.arc(26 * u, -3 * u, 2.5 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9a2e'; ctx.strokeStyle = '#d9731a'; ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.ellipse(0, 24 * u, 22 * u, 13 * u, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14 * u, 24 * u); ctx.lineTo(14 * u, 24 * u); ctx.stroke();
    if (v.hat === 'cap') {
      ctx.fillStyle = '#3a6fe0'; ctx.beginPath(); ctx.ellipse(0, -36 * u, 40 * u, 24 * u, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(-4 * u, -40 * u, 62 * u, 8 * u);
    } else if (v.hat === 'party') {
      ctx.fillStyle = '#e04a8a'; ctx.beginPath(); ctx.moveTo(-26 * u, -38 * u); ctx.lineTo(26 * u, -38 * u); ctx.lineTo(0, -92 * u); ctx.fill();
      ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(0, -92 * u, 6 * u, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#d63a3a';
      ctx.beginPath(); ctx.moveTo(0, -48 * u); ctx.lineTo(-30 * u, -64 * u); ctx.lineTo(-30 * u, -32 * u); ctx.closePath();
      ctx.moveTo(0, -48 * u); ctx.lineTo(30 * u, -64 * u); ctx.lineTo(30 * u, -32 * u); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -48 * u, 7 * u, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawCard(canvas, token) {
    var v = variantFor(token);
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = v.color.body; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fffaf0'; rr(ctx, 20, 20, W - 40, H - 40, 36); ctx.fill();
    ctx.fillStyle = '#2b2118'; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('My Cluck', W / 2, 78);
    var qr = qrcode(0, 'H'); qr.addData(linkFor(token)); qr.make();
    var n = qr.getModuleCount(), quiet = 4, cell = Math.floor(QR_PX / (n + quiet * 2));
    var size = cell * (n + quiet * 2), ox = Math.round((W - size) / 2), oy = 100;
    ctx.fillStyle = '#fff'; rr(ctx, ox - 6, oy - 6, size + 12, size + 12, 18); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = v.color.dark; ctx.stroke();
    ctx.fillStyle = '#1a1410';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
    // Cluck badge over the center: radius 0.17 of QR width (~9% of area; level H tolerates ~30%)
    drawCluck(ctx, W / 2, oy + size / 2, size * 0.17, v);
    ctx.fillStyle = '#2b2118'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('this is your key 🔑 don’t post it', W / 2, oy + size + 52);
    ctx.fillStyle = '#8a7a66'; ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('save it to your photos. scan or upload it to log in.', W / 2, oy + size + 84);
    return { modules: n, cell: cell };
  }

  function decodeImageData(id) {
    var r = jsQR(id.data, id.width, id.height, { inversionAttempts: 'attemptBoth' });
    return r ? extractToken(r.data) : null;
  }
  // File/Blob -> token, entirely local. Always revokes the object URL.
  function decodeBlob(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'), sc = Math.min(1, 1000 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
          var t = decodeImageData(x.getImageData(0, 0, c.width, c.height));
          if (!t && sc < 1) {
            c.width = img.width; c.height = img.height; x.drawImage(img, 0, 0);
            t = decodeImageData(x.getImageData(0, 0, c.width, c.height));
          }
          URL.revokeObjectURL(url); res(t);
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }
  function toBlob(canvas, type, q) { return new Promise(function (r) { canvas.toBlob(r, type, q); }); }

  root.QRLogin = { makeToken: makeToken, linkFor: linkFor, variantFor: variantFor, extractToken: extractToken,
    drawCard: drawCard, decodeBlob: decodeBlob, toBlob: toBlob };
})(window);
