/* rewards/fx.js: the sugar reward FX (pops, sparks, coins, drop banner, slot reels, full-screen bursts). Port of design/rewards/fx.js
   for the app (design/REWARDS-WIRING.md §5): icons from window.RW_ICONS (rewards/icons.js, Fluent Emoji, MIT), canvas-confetti from
   vendor/ (ISC). Every node it adds is aria-hidden (app.js says the words once) and carries .rw-skin (rewards/rewards.css tokens).
   Nothing runs until app.js calls a function: diet never does. */
(function () {
  'use strict';
  const MQ = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => MQ.matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.random() * a.length | 0];
  const mk = (tag, cls, html) => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
  const host = cls => { const e = mk('div', cls + ' rw-skin'); e.setAttribute('aria-hidden', 'true'); return document.body.appendChild(e); };
  const src = n => (window.RW_ICONS || {})[n.replace(/_color$/, '')] || `rewards/icons/${n}.svg`;
  const txt = (tag, cls, s) => { const e = mk(tag, cls); e.textContent = s; return e; };
  const mid = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const img = (n, cls) => `<img src="${src(n)}" alt="" draggable="false"${cls ? ` class="${cls}"` : ''}>`;
  // animate a node, then remove it; resolves either way
  const run = (n, kf, o) => n.animate(kf, o).finished.catch(() => {}).then(() => n.remove());
  const EASE = { pop: 'cubic-bezier(.16,1,.3,1)', out: 'cubic-bezier(.2,.8,.3,1)' };
  const popKF = (s, o = 0) => [{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${s})`, opacity: 1, offset: .4 }, { transform: 'scale(1)', opacity: o || 1 }];
  const enterKF = (from) => [{ transform: `scale(${from})`, opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }];
  const COLORS = ['#ff8a1f', '#ffd36b', '#d63fa8', '#fff3b0', '#ffb347'];
  const COUNT = { small: 10, medium: 18, large: 30 }, DIST = { small: 70, medium: 105, large: 145 }, CONF = { small: 24, medium: 40, large: 70 };


  // shared fixed particle layer (never causes page overflow)
  let L;
  const layer = () => (L && L.isConnected) ? L : (L = host('fx-layer'));

  // canvas-confetti bound to a canvas inside `par` (so it stacks with our overlays)
  function confettiIn(par) {
    if (!window.confetti) return null;
    const c = par.appendChild(mk('canvas', 'fx-canvas'));
    const f = window.confetti.create(c, { resize: true, disableForReducedMotion: true });
    f.canvas = c;
    return f;
  }

  // CSS particle burst at (x,y) inside par
  function spray(par, x, y, n, dist) {
    const f = par.appendChild(mk('i', 'fx-flash'));
    f.style.cssText = `left:${x}px;top:${y}px`;
    run(f, [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${dist / 40})`, opacity: 0 }], { duration: 380, easing: 'ease-out' });
    for (let i = 0; i < n; i++) {
      const s = par.appendChild(mk('i', 'fx-sp fx-sp' + (i % 4)));
      s.style.cssText = `left:${x}px;top:${y}px;--c:${pick(COLORS)}`;
      const a = i / n * 360 + rnd(-12, 12), d = dist * rnd(.6, 1.2), r = `rotate(${a}deg) translateX`;
      run(s, [
        { transform: `${r}(0) scale(.3)`, opacity: 1 },
        { transform: `${r}(${d * .75}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `${r}(${d}px) scale(0)`, opacity: 0 }
      ], { duration: rnd(520, 820), delay: rnd(0, 40), easing: 'cubic-bezier(.1,.7,.3,1)' });
    }
  }

  function pop(el) {
    if (!el || still()) return;
    el.animate(popKF(1.12), { duration: 350, easing: EASE.pop });
    const r = el.getBoundingClientRect(), ring = layer().appendChild(mk('div', 'fx-ring'));
    Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: getComputedStyle(el).borderRadius });
    run(ring, [{ transform: 'scale(1)', opacity: .95 }, { transform: `scale(${(r.width + 48) / r.width},${(r.height + 48) / r.height})`, opacity: 0 }],
      { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }

  let layerConfetti;
  function sparks(el, tier) {
    if (!el || still()) return;
    tier = COUNT[tier] ? tier : 'small';
    const p = mid(el);
    spray(layer(), p.x, p.y, COUNT[tier], DIST[tier]);
    if (!layerConfetti || !layerConfetti.canvas.isConnected) layerConfetti = confettiIn(layer());   // confetti on every correct (Tony, Oct 4)
    if (layerConfetti) layerConfetti({ particleCount: CONF[tier], spread: 80, startVelocity: 32, ticks: 120, scalar: .9, colors: COLORS, shapes: ['star', 'circle'],
      origin: { x: p.x / innerWidth, y: p.y / innerHeight } });
  }

  function coinFly(fromEl, toEl, n) {
    toEl = toEl || document.getElementById('coinPill');
    n = n || 5;
    if (!fromEl || !toEl || still()) return Promise.resolve();
    const a = mid(fromEl), b = mid(toEl), Ly = layer();
    return Promise.all(Array.from({ length: n }, (_, i) => {
      const c = Ly.appendChild(mk('img', 'fx-fly'));
      c.src = src('coin_color'); c.alt = ''; c.draggable = false;
      const p0 = { x: a.x + rnd(-18, 18), y: a.y + rnd(-10, 10) };
      const p1 = { x: (a.x + b.x) / 2 + rnd(-50, 50), y: Math.min(a.y, b.y) - rnd(70, 140) };
      const kf = [];
      for (let k = 0; k <= 10; k++) { // quadratic bezier arc
        const t = k / 10, u = 1 - t;
        const x = u * u * p0.x + 2 * u * t * p1.x + t * t * b.x - 11, y = u * u * p0.y + 2 * u * t * p1.y + t * t * b.y - 11;
        kf.push({ transform: `translate(${x}px,${y}px) scale(${1 + .4 * Math.sin(Math.PI * t) - .35 * t}) rotate(${t * 300}deg)`, opacity: k ? 1 : 0 });
      }
      return c.animate(kf, { duration: 600, delay: i * 70, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'backwards' }).finished.catch(() => {}).then(() => {
        c.remove();
        toEl.animate(popKF(1.15), { duration: 220, easing: 'ease-out' });
        if (i === n - 1) spray(Ly, b.x, b.y, 8, 40);
      });
    })).then(() => {});
  }

  let tHost, cur, tTimer;
  function toast(text, sub) {                                     // the drop banner: never takes a tap (pointer-events: none in rewards.css)
    if (!tHost || !tHost.isConnected) tHost = host('fx-toast-host');
    clearTimeout(tTimer);
    if (cur) cur.remove();
    const t = cur = tHost.appendChild(mk('div', 'fx-toast', img('glowing_star_color', 'fx-toast-i')));
    const b = t.appendChild(mk('div', 'fx-toast-b'));
    b.append(txt('div', 'fx-toast-t', text));
    if (sub) b.append(txt('div', 'fx-toast-s', sub));
    t.animate(still() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-16px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, easing: 'ease-out' });
    const hide = () => {
      if (t !== cur) return;
      cur = null; clearTimeout(tTimer);
      run(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    };
    t.addEventListener('click', hide);
    tTimer = setTimeout(hide, 2200);
  }

  // full-screen overlay shell: tap / Escape -> skip(); close() fades 200ms and removes
  function overlay(cls, skip) {
    const el = host('fx-ov ' + cls);
    let closed = false, done;
    const p = new Promise(r => (done = r));
    const key = e => { if (e.key === 'Escape') skip(); };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key);
      el.style.pointerEvents = 'none';
      run(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).then(done);
    };
    el.addEventListener('click', skip);
    document.addEventListener('keydown', key);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    return { el, close, done: p };
  }

  const TIER = { common: ['coin_color', 'COIN DROP', 'small'], rare: ['gem_stone_color', 'RARE DROP', 'medium'], legend: ['duck_color', 'LEGENDARY', 'large'] };
  const FILLER = ['cherries_color', 'star_color', 'trophy_color', 'glowing_star_color']; // never a tier icon -> no fake near-miss
  const CELL = 84;

  function slots(tier) {
    const T = TIER[tier] ? tier : 'common', [win, label, size] = TIER[T], calm = still();
    let landed = false, reels = [];
    const ov = overlay('fx-slots-ov', () => (landed ? ov.close() : land(350)));
    const p = ov.el.appendChild(mk('div', 'fx-slots fx-t-' + T,
      `<div class="fx-slots-in"><div class="fx-bulbs">${'<i></i>'.repeat(11)}</div><div class="fx-reels"></div><div class="fx-slabel"></div></div>`));
    p.style.setProperty('--cell', CELL + 'px');
    if (!calm) p.classList.add('fx-spin');            // marquee bulbs blink only while the reels move
    const lab = p.querySelector('.fx-slabel'), box = p.querySelector('.fx-reels');
    lab.textContent = label;
    const winCls = T === 'legend' ? 'fx-gold' : '';
    reels = [0, 1, 2].map(i => {
      const n = 12 + i * 4, icons = []; // icons[1] is the payline result; strip scrolls downward onto it
      for (let k = 0; k < n; k++) { let x = win; if (k !== 1) do x = pick(FILLER); while (x === icons[k - 1]); icons.push(x); }
      const reel = box.appendChild(mk('div', 'fx-reel',
        `<div class="fx-strip">${icons.map((x, k) => `<div class="fx-cell">${img(x, k === 1 ? winCls : '')}</div>`).join('')}</div>`));
      const strip = reel.firstChild, dur = 500 + i * 200;
      strip.style.transform = `translateY(${-CELL}px)`;
      if (calm) return { strip };
      strip.classList.add('spin');
      setTimeout(() => strip.classList.remove('spin'), dur * .7);
      const a = strip.animate([
        { transform: `translateY(${-(n - 1) * CELL}px)`, easing: 'cubic-bezier(.16,1,.3,1)' },
        { transform: `translateY(${-CELL}px)` }
      ], { duration: dur });
      return { strip, a };
    });

    function land(hold) {
      if (landed) return;
      landed = true;
      p.classList.remove('fx-spin');
      reels.forEach(r => { r.a && r.a.finish(); r.strip.classList.remove('spin'); });
      p.classList.add('win');
      if (!calm) {
        reels.forEach((r, i) => r.strip.children[1].firstChild.animate(popKF(1.25), { duration: 420, delay: i * 70, easing: EASE.out }));
        lab.animate(enterKF(.4), { duration: 420, easing: EASE.out });
        const c = mid(box);
        spray(ov.el, c.x, c.y, COUNT[size], DIST[size]);
      }
      setTimeout(ov.close, hold);
    }

    if (calm) land(900);
    else {
      p.animate(enterKF(.8), { duration: 260, easing: EASE.out });
      Promise.all(reels.map(r => r.a.finished)).then(() => land(500), () => {});
    }
    return ov.done;
  }

  const KIND = {
    levelup: { t: 'LEVEL UP', d: 1200 },
    win: { t: 'WIN!', d: 1200 },
    bonus: { t: 'BONUS!', d: 1200 },
    legend: { t: 'THE GOLDEN DUCK HAS NOTICED YOU.', s: '+50 XP', d: 2000 }
  };

  // pixel title: outline layer + gradient fill + shine sweep, stacked in one grid cell
  function titleEl(text) {
    const t = mk('div', 'fx-title');
    t.style.setProperty('--n', Math.max(8, Math.min(text.length, 16)));
    ['fx-o', 'fx-f', 'fx-s'].forEach(k => { const s = t.appendChild(txt('span', k, text)); if (k !== 'fx-f') s.setAttribute('aria-hidden', 'true'); });
    return t;
  }

  function stars() {
    const w = mk('div', 'fx-stars');
    ['l', 'm', 'r'].forEach((k, i) => {
      const s = w.appendChild(mk('span', 'fx-star fx-star-' + k, img('star_color')));
      s.firstChild.animate([
        { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
        { transform: 'scale(1.3) rotate(8deg)', opacity: 1, offset: .6 },
        { transform: 'scale(1) rotate(0)', opacity: 1 }
      ], { duration: 380, delay: 140 + i * 100, easing: EASE.out, fill: 'backwards' });
    });
    return w;
  }

  // falling coin images (CSS), plus confetti glitter when available
  function shower(par, n) {
    const H = innerHeight + 80;
    for (let i = 0; i < n; i++) {
      const c = par.appendChild(mk('img', 'fx-rain'));
      c.src = src('coin_color'); c.alt = '';
      const s = rnd(18, 34), r = rnd(-540, 540);
      c.style.cssText = `left:${rnd(0, 100)}%;width:${s}px;height:${s}px`;
      run(c, [0, .25, .5, .75, 1].map((t, k) => ({
        transform: `translateY(${-40 + H * Math.pow(t, 1.4)}px) rotate(${r * t}deg) scaleX(${k % 2 ? .25 : 1})`, opacity: 1
      })), { duration: rnd(1100, 1600), delay: rnd(0, 700), fill: 'backwards' });
    }
    const f = confettiIn(par);
    if (f) f({ particleCount: 90, spread: 120, startVelocity: 38, ticks: 200, gravity: .9, scalar: 1.1, shapes: ['circle', 'star'],
      colors: ['#ffd36b', '#ffb347', '#fff3b0', '#ff8a1f'], origin: { x: .5, y: .45 } });
  }

  function burst(kind, o) {
    o = o || {};
    if (!KIND[kind]) kind = 'levelup';
    const K = KIND[kind], calm = still(), title = o.title || K.t, sub = o.sub != null ? o.sub : K.s;
    let timer;
    const ov = overlay('fx-burst fx-' + kind, () => { clearTimeout(timer); ov.close(); });
    ov.el.innerHTML = '<div class="fx-rays"></div><div class="fx-dots"></div>';
    const c = ov.el.appendChild(mk('div', 'fx-bc'));
    if (!calm && (kind === 'levelup' || kind === 'win')) c.append(stars());   // the 3-star WIN banner of the slot kit
    const duck = !calm && kind === 'legend' && c.appendChild(mk('div', 'fx-duck', img('duck_color', 'fx-gold')));
    const t = c.appendChild(titleEl(title));
    const s = sub ? c.appendChild(txt('div', kind === 'levelup' ? 'fx-plate' : 'fx-sub', sub)) : null;
    if (!calm) {
      t.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 450, easing: EASE.out });
      if (s) s.animate([{ transform: 'translateY(14px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 300, delay: 300, easing: EASE.pop, fill: 'backwards' });
      if (duck) {
        duck.animate([{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.15) rotate(6deg)', opacity: 1, offset: .65 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
          { duration: 520, easing: EASE.out });
        shower(ov.el, 26);
      }
      setTimeout(() => { const m = mid(t); spray(ov.el, m.x, m.y, kind === 'legend' ? 30 : 22, 150); }, 220);
    }
    timer = setTimeout(ov.close, K.d);
    return ov.done;
  }

  // "+10 XP" rising off the answer on every correct; cls "fx-float-sm" = a wrong try's quiet "+1"
  function float(el, text, cls) {
    if (!el || still()) return;
    const p = mid(el), f = layer().appendChild(txt('div', 'fx-float' + (cls ? ' ' + cls : ''), text));
    f.style.cssText = `left:${p.x}px;top:${p.y}px`;
    run(f, [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: .25 },
      { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  // one light sweep across the HUD coin pill (rewards.css .rw-shine)
  function shine(el) {
    if (!el || still()) return;
    el.classList.remove('rw-shine'); void el.offsetWidth; el.classList.add('rw-shine');
    el.addEventListener('animationend', () => el.classList.remove('rw-shine'), { once: true });
  }

  window.FX = { pop, sparks, coinFly, toast, slots, burst, float, shine };
})();
