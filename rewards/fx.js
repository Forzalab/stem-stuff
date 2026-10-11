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
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const D = 200;                                                    // one slot = STYLE.md --d-move

  /* ONE BLINK (20261010-B2; STYLE.md §1.6 / §2.8, palette §10): one group moves at a time. Every effect is a job on one lane and runs
     only after the job before it has finished, so a right answer plays in slots of 200 ms, in the order app.js calls them:
     answer pop 0 → stars (confetti) 200 → ribbon ("+N XP") 400 → button (coins into the HUD strip, the one tap target) 600 → the HUD
     itself (bar, level, coin pill shine) → the ribbon fades out. A drop / burst / banner waits for the lane. While the lane is busy,
     html.fx-busy pauses the Cluck chip's wiggle (rewards.css). Triggers, odds, XP and when app.js pays are unchanged: choreography only. */
  let lane = Promise.resolve(), jobs = 0, tails = [];
  const root = document.documentElement;
  function queue(job) {
    jobs++; root.classList.add('fx-busy');
    const p = lane.then(job).catch(() => {}).then(() => {
      if (--jobs) return;
      if (tails.length) { const t = tails; tails = []; t.forEach(queue); }
      else root.classList.remove('fx-busy');
    });
    return (lane = p);
  }
  // a scene (slots, burst, banner) first lets the beat before it settle: the HUD catches up, the "+N XP" fades out
  function scene(job) { if (tails.length) { const t = tails; tails = []; t.forEach(queue); } return queue(job); }

  /* the HUD strip holds its old bar / flame / level while the beat plays (engine.js renders at app.js's 450 ms; nothing moves then)
     and catches up in its own slot near the end. Reduced motion: nothing to hold (the HUD changes at once). */
  let held = null, hudShine = null, hudPop = null;
  function hold() {
    const h = document.querySelector('.rw-hud');
    if (held || !h || still()) return;
    const bar = h.querySelector('.rw-bar i'), fl = h.querySelector('.rw-flame');
    h.style.setProperty('--rw-p0', (bar && bar.style.getPropertyValue('--p')) || '0');
    h.style.setProperty('--rw-fs0', (fl && fl.style.getPropertyValue('--fs')) || '1');
    h.classList.add('rw-hold');
    held = h;
    tails.unshift(release);
    if (!jobs) queue(() => {});                                     // the lane always drains, so the strip always lets go
  }
  async function release() {
    const h = held, sh = hudShine, pp = hudPop; held = hudShine = hudPop = null;
    if (!h) return;
    h.classList.remove('rw-hold');                                  // bar + flame ease to the new value, a level-up pulses (rewards.css)
    if (pp && pp.isConnected) pp.animate(popKF(1.15), { duration: D, easing: 'ease-out' });
    if (sh && sh.isConnected) {
      sh.classList.remove('rw-shine'); void sh.offsetWidth; sh.classList.add('rw-shine');
      sh.addEventListener('animationend', () => sh.classList.remove('rw-shine'), { once: true });
    }
    await wait(D + 20);
  }
  // the "+N XP" ribbons leave together, after the HUD has caught up
  let floats = [];
  async function floatsOut() {
    const f = floats; floats = [];
    if (still()) { f.forEach(n => n.remove()); return; }           // reduced motion: one fade in, then gone at once
    await Promise.all(f.map(n => run(n, [{ opacity: 1 }, { opacity: 0 }], { duration: D, easing: 'ease-out' })));
  }


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
  function spray(par, x, y, n, dist) {                            // one slot: every spark is gone after D ms
    const all = [];
    for (let i = 0; i < n; i++) {
      const s = par.appendChild(mk('i', 'fx-sp fx-sp' + (i % 4)));
      s.style.cssText = `left:${x}px;top:${y}px;--c:${pick(COLORS)}`;
      const a = i / n * 360 + rnd(-12, 12), d = dist * rnd(.6, 1.2), r = `rotate(${a}deg) translateX`;
      all.push(run(s, [
        { transform: `${r}(0) scale(.3)`, opacity: 1 },
        { transform: `${r}(${d * .75}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `${r}(${d}px) scale(0)`, opacity: 0 }
      ], { duration: D, easing: 'cubic-bezier(.1,.7,.3,1)' }));
    }
    return Promise.all(all);
  }

  // slot 0, the answer: one 200 ms pop. It takes over app.css's two-beat .opt.pop pulse on this answer, so the answer is done by 200 ms
  function pop(el) {
    if (!el || still()) return;
    hold();
    for (const a of el.getAnimations()) if (a.animationName === 'opt-pop') a.finish();
    queue(() => el.isConnected && el.animate(popKF(1.06), { duration: D, easing: 'ease-out' }).finished.catch(() => {}));
  }

  // slot 1, the stars: one short confetti burst from the answer (Tony, Oct 4: confetti on every correct); its canvas goes with it.
  // No confetti library: the CSS sparks instead (never both: two bursts from one point were two groups)
  function sparks(el, tier) {
    if (!el || still()) return;
    hold();
    tier = COUNT[tier] ? tier : 'small';
    queue(async () => {
      if (!el.isConnected) return;
      const p = mid(el), f = confettiIn(layer());
      if (!f) return spray(layer(), p.x, p.y, COUNT[tier], DIST[tier]);
      f({ particleCount: CONF[tier] + COUNT[tier], spread: 80, startVelocity: 32, decay: .86, ticks: 12, scalar: .9, colors: COLORS,
        shapes: ['star', 'circle'], origin: { x: p.x / innerWidth, y: p.y / innerHeight } });
      await wait(D);
      f.reset(); f.canvas.remove();
    });
  }

  // slot 3, the button: the coins fly into the HUD strip together; the strip answers in its own slot (release)
  function coinFly(fromEl, toEl, n) {
    toEl = toEl || document.getElementById('coinPill');
    n = n || 5;
    if (!fromEl || !toEl || still()) return Promise.resolve();
    hold();
    return queue(() => {
      if (!fromEl.isConnected || !toEl.isConnected) return;
      const a = mid(fromEl), b = mid(toEl), Ly = layer();
      hudPop = toEl;
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
        return run(c, kf, { duration: 300, delay: i * 20, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'backwards' });
      }));
    });
  }

  let tHost, cur, tTimer;
  function toast(text, sub) {                                     // the drop banner: never takes a tap (pointer-events: none in rewards.css)
    return scene(async () => {
      if (!tHost || !tHost.isConnected) tHost = host('fx-toast-host');
      clearTimeout(tTimer);
      if (cur) cur.remove();
      const t = cur = tHost.appendChild(mk('div', 'fx-toast', img('glowing_star_color', 'fx-toast-i')));
      const b = t.appendChild(mk('div', 'fx-toast-b'));
      b.append(txt('div', 'fx-toast-t', text));
      if (sub) b.append(txt('div', 'fx-toast-s', sub));
      const hide = () => {
        if (t !== cur) return;
        cur = null; clearTimeout(tTimer);
        queue(() => run(t, [{ opacity: 1 }, { opacity: 0 }], { duration: D, fill: 'forwards' }));
      };
      t.addEventListener('click', hide);
      tTimer = setTimeout(hide, 2200);
      await t.animate(still() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }],
        { duration: D, easing: 'ease-out' }).finished.catch(() => {});
    });
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
    const shown = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D, easing: 'ease-out' }).finished.catch(() => {});
    return { el, close, done: p, shown, get closed() { return closed; } };
  }
  // the next slot of a scene: wait for it, unless the scene was closed meanwhile (then nothing more moves)
  const step = (ov, a) => (a && a.finished ? a.finished.catch(() => {}) : Promise.resolve(a)).then(() => !ov.closed);
  // show a part of a scene that waited, hidden, for its slot: one animation on its wrapper
  const enter = (ov, el, kf) => { if (!el || ov.closed) return Promise.resolve(false); const a = el.animate(kf, { duration: D, easing: 'ease-out' }); el.style.opacity = ''; return step(ov, a); };
  const wait4 = (el) => { if (el) el.style.opacity = '0'; return el; };

  const TIER = { common: ['coin_color', 'COIN DROP', 'small'], rare: ['gem_stone_color', 'RARE DROP', 'medium'], legend: ['duck_color', 'LEGENDARY', 'large'] };
  const FILLER = ['cherries_color', 'star_color', 'trophy_color', 'glowing_star_color']; // never a tier icon -> no fake near-miss
  const CELL = 84;

  // the slot machine, one group at a time: the card fades in with the scrim, the reels spin (blurred until the last one lands), the
  // paylines pop, the label comes in, the sparks fly, then it holds and fades out. Reduced motion: fade in, the result, fade out
  function slots(tier) {
    const T = TIER[tier] ? tier : 'common', [win, label, size] = TIER[T], calm = still();
    return scene(async () => {
      let landed = false, reels = [], hold = 500;
      const ov = overlay('fx-slots-ov', () => (landed ? ov.close() : land(350)));
      const p = ov.el.appendChild(mk('div', 'fx-slots fx-t-' + T,
        `<div class="fx-slots-in"><div class="fx-bulbs">${'<i></i>'.repeat(11)}</div><div class="fx-reels"></div><div class="fx-slabel"></div></div>`));
      p.style.setProperty('--cell', CELL + 'px');
      const lab = p.querySelector('.fx-slabel'), box = p.querySelector('.fx-reels');
      lab.textContent = label;
      const winCls = T === 'legend' ? 'fx-gold' : '';
      reels = [0, 1, 2].map(i => {
        const n = 12 + i * 4, icons = []; // icons[1] is the payline result; strip scrolls downward onto it
        for (let k = 0; k < n; k++) { let x = win; if (k !== 1) do x = pick(FILLER); while (x === icons[k - 1]); icons.push(x); }
        const reel = box.appendChild(mk('div', 'fx-reel',
          `<div class="fx-strip">${icons.map((x, k) => `<div class="fx-cell">${img(x, k === 1 ? winCls : '')}</div>`).join('')}</div>`));
        const strip = reel.firstChild;
        strip.style.transform = `translateY(${-(calm ? 1 : n - 1) * CELL}px)`;
        return { strip, n, dur: 500 + i * 200 };
      });
      let early = null;
      function land(h) { if (!landed) { landed = true; hold = h; early && early(); } }
      const skipped = new Promise(r => (early = r));
      if (calm) { await ov.shown; land(900); }
      else if (await step(ov, ov.shown) && !landed) {
        reels.forEach(r => {                                           // one group: the three strips (they stop one after the other)
          r.strip.classList.add('spin');
          r.a = r.strip.animate([
            { transform: `translateY(${-(r.n - 1) * CELL}px)`, easing: 'cubic-bezier(.16,1,.3,1)' },
            { transform: `translateY(${-CELL}px)` }
          ], { duration: r.dur });
        });
        await Promise.race([Promise.all(reels.map(r => r.a.finished.catch(() => {}))), skipped]);
        land(hold);
      }
      reels.forEach(r => { r.a && r.a.finish(); r.strip.classList.remove('spin'); r.strip.style.transform = `translateY(${-CELL}px)`; });
      p.classList.add('win');
      if (!calm && !ov.closed) {
        const pays = reels.map((r, i) => r.strip.children[1].firstChild.animate(popKF(1.25), { duration: D, delay: i * 40, easing: EASE.out }));
        if (await step(ov, Promise.all(pays.map(a => a.finished.catch(() => {})))) && await enter(ov, lab, enterKF(.4))) {
          const c = mid(box);
          await spray(ov.el, c.x, c.y, COUNT[size], DIST[size]);
        }
      }
      if (!ov.closed) await Promise.race([wait(hold), ov.done]);
      ov.close();
      await ov.done;
    });
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

  function stars() {                                               // the 3-star crown: one wrapper, it enters as one group
    const w = mk('div', 'fx-stars');
    ['l', 'm', 'r'].forEach(k => w.appendChild(mk('span', 'fx-star fx-star-' + k, img('star_color'))));
    return w;
  }

  // falling coin images (one group), then a short confetti glitter (the next slot)
  async function shower(ov, n) {
    const par = ov.el, H = innerHeight + 80, all = [];
    for (let i = 0; i < n; i++) {
      const c = par.appendChild(mk('img', 'fx-rain'));
      c.src = src('coin_color'); c.alt = '';
      const s = rnd(18, 34), r = rnd(-540, 540);
      c.style.cssText = `left:${rnd(0, 100)}%;width:${s}px;height:${s}px`;
      all.push(run(c, [0, .25, .5, .75, 1].map((t, k) => ({
        transform: `translateY(${-40 + H * Math.pow(t, 1.4)}px) rotate(${r * t}deg) scaleX(${k % 2 ? .25 : 1})`, opacity: 1
      })), { duration: rnd(500, 700), delay: rnd(0, 200), fill: 'backwards' }));
    }
    if (!await step(ov, Promise.all(all))) return;
    const f = confettiIn(par);
    if (!f) return;
    f({ particleCount: 90, spread: 120, startVelocity: 38, decay: .86, ticks: 12, gravity: .9, scalar: 1.1, shapes: ['circle', 'star'],
      colors: ['#ffd36b', '#ffb347', '#fff3b0', '#ff8a1f'], origin: { x: .5, y: .45 } });
    await wait(D);
    f.reset(); f.canvas.remove();
  }

  // palette §10 order, one slot each: scrim + card 0 → stars 200 → title (the ribbon) 400 → the plate / line (the button, g-next-in:
  // opacity + 8 px forward) 600 → sparks; the legend's coin rain + glitter after. Rays, dots and the gold duck stay still. It holds
  // until K.d from the start, then fades. Reduced motion: one fade in with everything already in place, then the fade out.
  function burst(kind, o) {
    o = o || {};
    if (!KIND[kind]) kind = 'levelup';
    return scene(async () => {
      const K = KIND[kind], calm = still(), title = o.title || K.t, sub = o.sub != null ? o.sub : K.s, t0 = performance.now();
      const ov = overlay('fx-burst fx-' + kind, () => ov.close());
      ov.el.innerHTML = '<div class="fx-rays"></div><div class="fx-dots"></div>';
      const c = ov.el.appendChild(mk('div', 'fx-bc'));
      const st = !calm && (kind === 'levelup' || kind === 'win') ? c.appendChild(wait4(stars())) : null;   // the 3-star WIN banner of the slot kit
      if (!calm && kind === 'legend') c.appendChild(mk('div', 'fx-duck', img('duck_color', 'fx-gold')));
      const t = c.appendChild(titleEl(title));
      const s = sub ? c.appendChild(txt('div', kind === 'levelup' ? 'fx-plate' : 'fx-sub', sub)) : null;
      if (!calm) { wait4(t); wait4(s); }
      if (await step(ov, ov.shown) && !calm
        && await enter(ov, st, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }])
        && await enter(ov, t, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }])
        && await enter(ov, s, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }])) {
        const m = mid(t);
        await spray(ov.el, m.x, m.y, kind === 'legend' ? 30 : 22, 150);
        if (kind === 'legend' && !ov.closed) await shower(ov, 26);
      }
      if (!ov.closed) await Promise.race([wait(K.d - (performance.now() - t0)), ov.done]);
      ov.close();
      await ov.done;
    });
  }

  // slot 2, the ribbon: "+10 XP" rises off the answer on every correct and stays still until the HUD has caught up, then fades out.
  // cls "fx-float-sm" = a wrong try's quiet "+1". Reduced motion: one opacity fade, no movement
  function float(el, text, cls) {
    if (!el) return;
    hold();
    queue(() => {
      if (!el.isConnected) return;
      const p = mid(el), f = layer().appendChild(txt('div', 'fx-float' + (cls ? ' ' + cls : ''), text));
      f.style.cssText = `left:${p.x}px;top:${p.y}px;transform:translate(-50%,-110%)`;
      floats.push(f);
      if (!tails.includes(floatsOut)) tails.push(floatsOut);
      return f.animate(still() ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'translate(-50%,-50%)', opacity: 0 }, { transform: 'translate(-50%,-110%)', opacity: 1 }],
      { duration: D, easing: 'ease-out' }).finished.catch(() => {});
    });
  }

  // one light sweep across the HUD coin pill (rewards.css .rw-shine), in the HUD's own slot
  function shine(el) {
    if (!el || still()) return;
    hold();
    hudShine = el;
  }

  window.FX = { pop, sparks, coinFly, toast, slots, burst, float, shine };
})();
