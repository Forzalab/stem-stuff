/* rewards/fx.js: the sugar reward FX (pops, sparks, coins, drop banner, the level-up overlay with its slot reels; flow C: one overlay max). Port of design/rewards/fx.js
   for the app (design/REWARDS-WIRING.md §5): icons from window.RW_ICONS (rewards/icons.js; per-file licence in rewards/icons/NOTICE-traced.txt), canvas-confetti from
   vendor/ (ISC). Every node it adds is aria-hidden (app.js says the words once) and carries .rw-skin (rewards/rewards.css tokens).
   Nothing runs until app.js calls a function (diet never does), except one passive pointerdown listener that only settles a wiggling
   sugar Cluck chip (.rw-chip; diet has none). */
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
  const COLORS = ['#ff9a3e', '#ffcd94', '#b05a00', '#ffdcc0', '#ff8204'];   // the warm ramp (PALETTE-v3 §5): help, reward, help-deep, help-on, glow
  const COUNT = { small: 10, medium: 18, large: 30 }, DIST = { small: 70, medium: 105, large: 145 }, CONF = { small: 24, medium: 40, large: 70 };

  /* ---------- one blink (STYLE.md §1.6, §2.8; design/shots/blink-fx-2026-10-12) ----------
     Every call app.js makes joins ONE queue; a step starts only when the one before has finished, so at most one group moves at a time:
     the answer's own pulse -> sparks, "+N XP" and coins (the FX layer) -> the HUD (shine, bar, level pulse) -> the level-up overlay
     (reels inside on a drop) OR the banner. Flow C (Tony, Oct 21): one beat per answer, at most one overlay, and only for LEVEL UP.
     Calls for the same group made before their step starts share it. While the queue runs the HUD bar and level pulse wait (.fx-hold)
     and a Cluck chip's ad wiggle stops (.fx-busy). Reduced motion: the whole sequence gets one fade (the first overlay or banner); the
     rest is instant. Triggers, odds, XP and payouts are rewards/engine.js's and app.js's; this only orders what is drawn. */
  const Q = [], ROOT = document.documentElement, CAP = 5000, GRACE = 400;
  let busy = false, lastEnd = -1e9, fadeLeft = true, pinned = null, snap = false;
  const fin = a => a.finished.then(() => {}, () => {});
  const finite = a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity;
  const moving = (root, skip) => (root ? (root === document ? document.getAnimations() : root.getAnimations({ subtree: true })) : [])
    .filter(a => finite(a) && !(skip && a.effect.target && a.effect.target.closest && a.effect.target.closest(skip)));
  // wait until nothing (finite) moves in root; skip = what is not this step's (chip, FX nodes, HUD)
  const settle = (root, skip, max) => Promise.race([Promise.all(moving(root, skip).map(fin)), new Promise(r => setTimeout(r, max || CAP))]);
  function hold(on) {
    if (on) {
      const b = document.querySelector('#rwHud .rw-bar i');
      if (b && !pinned) { const t = getComputedStyle(b).transform; b.style.transition = 'none'; b.style.transform = t; pinned = b; }   // the bar keeps its length until the HUD step
      ROOT.classList.add('fx-hold');
    } else if (snap) {                                                        // its HUD step was dropped (flush): catch up without motion
      snap = false;
      document.querySelectorAll('#rwHud .rw-lvl.rw-pulse').forEach(e => e.getAnimations().forEach(a => a.finish()));
      if (pinned) { pinned.style.transform = ''; void pinned.offsetWidth; pinned.style.transition = ''; pinned = null; }
      ROOT.classList.remove('fx-hold');
    } else {
      ROOT.classList.remove('fx-hold');
      if (pinned) { pinned.style.transition = pinned.style.transform = ''; pinned = null; }   // its .5 s fill now plays, alone
    }
  }
  const hush = () => document.querySelectorAll('.rw-chip.rw-wiggle').forEach(c => c.getAnimations().forEach(a => { try { a.finish(); } catch (e) { a.cancel(); } }));
  // a tap anywhere but the chip settles its wiggle at once (the student is answering: the ad never runs over Check). No chip = no work.
  document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('.rw-chip'))) hush(); }, { capture: true, passive: true });
  function begin() {
    busy = true;
    if (performance.now() - lastEnd > GRACE) fadeLeft = true;                 // a new reward: reduced motion gets its one fade again
    ROOT.classList.add('fx-busy');
    hold(true);
    hush();                                                                   // the answer is in: the ad stops
  }
  let now = null;                                                             // the step now playing
  function next() {
    const s = now = Q.shift() || null;
    if (!s) { busy = false; lastEnd = performance.now(); hold(false); ROOT.classList.remove('fx-busy'); return; }
    if (s.group === 'hud') hold(false);
    const ps = s.fns.map(([fn, res]) => { let p; try { p = Promise.resolve(fn()); } catch (e) { p = Promise.resolve(); } p.then(res, res); return p.then(() => {}, () => {}); });
    const tail = s.group === 'answer' ? settle(document, '.rw-chip, .fx-layer, .fx-ov, .fx-toast-host, #rwHud', 1200)
      : s.group === 'hud' ? Promise.all([settle(document.getElementById('rwHud'), null, 2250), new Promise(r => setTimeout(r, still() ? 0 : 975))])   // + engine.js's 900 ms count-up (text, not WAAPI)
      : null;
    Promise.race([Promise.all(ps.concat(tail || [])), new Promise(r => setTimeout(r, CAP))]).then(next);
  }
  // a new answer or a new question while the last answer still plays: its queued answer / FX-layer / HUD steps are dropped (their promises
  // resolve; the HUD's numbers catch up on the next render) and the FX layer still moving finishes. Its level-up overlay and banner stay queued
  // and play first: the engine already spent the burst cap on them (engine.js answer()), so they are never dropped or clicked away.
  const SKIP = { answer: 1, layer: 1, hud: 1, chip: 1 };
  function flush() {
    for (let i = Q.length - 1; i >= 0; i--) if (SKIP[Q[i].group]) { const s = Q.splice(i, 1)[0]; if (s.group === 'hud') snap = true; s.fns.forEach(([, res]) => res()); }
    if (L) L.querySelectorAll(':scope > :not(canvas)').forEach(n => n.getAnimations().forEach(a => a.finish()));
    if (layerConfetti && layerConfetti.reset) layerConfetti.reset();
  }
  addEventListener('hashchange', () => { if (busy) flush(); });             // the next question: a queued drop shows at once
  function seq(group, fn) {
    if (group === 'answer' && busy) flush();
    return new Promise(res => {
      const last = Q[Q.length - 1];
      if (last && last.group === group) last.fns.push([fn, res]);
      else Q.push({ group, fns: [[fn, res]] });
      if (!busy) { begin(); next(); }
    });
  }
  /* the calm nod on the duck chip (app.js T17b-1, BRIEF calm-nod rule): its own step, right after this tap's answer step (which waits for
     Next's g-next-in to land), before the FX layer; never with another group. One frame late, so the same tap's pop (rewardGo's rAF,
     queued before the chip's microtask) is in the queue first. No answer step (a paid-out code) = it runs at once, still after Next lands.
     get() returns the chip's img or null (a new question: nothing nods). Reduced motion: .g-nod is animation: none (app.css) */
  function nod(get) {
    return new Promise(res => requestAnimationFrame(() => {
      const step = { group: 'chip', fns: [[() => {
        const el = get();
        if (!el || !el.isConnected) return;
        return settle(document, '#wish, .rw-chip, .fx-layer, .fx-ov, .fx-toast-host, #rwHud', 1200).then(() => {   // Next has landed
          if (!el.isConnected) return;
          el.classList.add('g-nod');                                            // app.css's 320 ms delay waits for Next; here the queue did,
          const as = el.getAnimations();                                        // so it starts at its active phase (no still gap in the queue)
          as.forEach(a => { const d = a.effect && a.effect.getTiming().delay; if (d > 0 && (a.currentTime || 0) < d) a.currentTime = d; });
          return Promise.all(as.map(fin));
        });
      }, res]] };
      let i = -1;
      for (let k = Q.length - 1; k >= 0; k--) if (Q[k].group === 'answer') { i = k; break; }
      if (i >= 0) Q.splice(i + 1, 0, step);                                    // after the queued answer step
      else if (busy && now && now.group === 'answer') Q.unshift(step);         // the answer step is playing: next
      else { Q.push(step); if (!busy) { begin(); next(); } }
    }));
  }
  // the one fade under reduced motion; with motion every enter animates
  const fadeIn = (el, ms) => { if (still()) { if (!fadeLeft) return; fadeLeft = false; } el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }); };


  // shared fixed particle layer (never causes page overflow)
  let L, layerConfetti;
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
    const f = par.appendChild(mk('i', 'fx-flash')), all = [];
    f.style.cssText = `left:${x}px;top:${y}px`;
    all.push(run(f, [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${dist / 40})`, opacity: 0 }], { duration: 570, easing: 'ease-out' }));
    for (let i = 0; i < n; i++) {
      const s = par.appendChild(mk('i', 'fx-sp fx-sp' + (i % 4)));
      s.style.cssText = `left:${x}px;top:${y}px;--c:${pick(COLORS)}`;
      const a = i / n * 360 + rnd(-12, 12), d = dist * rnd(.6, 1.2), r = `rotate(${a}deg) translateX`;
      all.push(run(s, [
        { transform: `${r}(0) scale(.3)`, opacity: 1 },
        { transform: `${r}(${d * .75}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `${r}(${d}px) scale(0)`, opacity: 0 }
      ], { duration: rnd(780, 1230), delay: rnd(0, 60), easing: 'cubic-bezier(.1,.7,.3,1)' }));
    }
    return Promise.all(all);
  }

  // the answer's one pulse: app.css's .opt.pop when it runs (a right pick), else ours; the ring is gone (it was a second group)
  function pop(el) {
    if (!el || still() || el.getAnimations().some(finite)) return;
    return el.animate(popKF(1.12), { duration: 525, easing: EASE.pop }).finished.catch(() => {});
  }

  function sparks(el, tier) {
    if (!el || still()) return;
    tier = COUNT[tier] ? tier : 'small';
    const p = mid(el);
    const s = spray(layer(), p.x, p.y, COUNT[tier], DIST[tier]);
    if (!layerConfetti || !layerConfetti.canvas.isConnected) layerConfetti = confettiIn(layer());   // confetti on every correct (Tony, Oct 4)
    const c = layerConfetti && layerConfetti({ particleCount: CONF[tier], spread: 80, startVelocity: 32, ticks: 105, scalar: .9, colors: COLORS, shapes: ['star', 'circle'],
      origin: { x: p.x / innerWidth, y: p.y / innerHeight } });   // 70 ticks (~1.2 s, was 120): the FX layer's step ends with it
    return Promise.all([s, c && Promise.race([c, new Promise(r => setTimeout(r, 1350))]).then(() => layerConfetti.reset && layerConfetti.reset())]);   // time-boxed: slow frames never stretch the step
  }

  function coinFly(fromEl, toEl, n) {
    toEl = toEl || document.getElementById('coinPill');
    n = n || 5;
    if (!fromEl || !toEl || still()) return Promise.resolve();
    const a = mid(fromEl), b = mid(toEl), Ly = layer();
    return Promise.all(Array.from({ length: n }, (_, i) => {
      const c = Ly.appendChild(mk('img', 'fx-fly'));
      c.src = src('coin24_color'); c.alt = ''; c.draggable = false;   // 22 px: the duck coin's 24 px cut
      const p0 = { x: a.x + rnd(-18, 18), y: a.y + rnd(-10, 10) };
      const p1 = { x: (a.x + b.x) / 2 + rnd(-50, 50), y: Math.min(a.y, b.y) - rnd(70, 140) };
      const kf = [];
      for (let k = 0; k <= 10; k++) { // quadratic bezier arc
        const t = k / 10, u = 1 - t;
        const x = u * u * p0.x + 2 * u * t * p1.x + t * t * b.x - 11, y = u * u * p0.y + 2 * u * t * p1.y + t * t * b.y - 11;
        kf.push({ transform: `translate(${x}px,${y}px) scale(${1 + .4 * Math.sin(Math.PI * t) - .35 * t}) rotate(${t * 300}deg)`, opacity: k ? 1 : 0 });
      }
      return c.animate(kf, { duration: 900, delay: i * 105, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'backwards' }).finished.catch(() => {}).then(() => {
        c.remove();                                               // one blink: the pill's answer is the HUD step's shine (no pop / spray here)
      });
    })).then(() => {});
  }

  let tHost, cur, tTimer;
  /* the drop banner (flow C: a WIN / BONUS / LEGEND drop is a banner, never an overlay): never takes a tap (pointer-events: none in
     rewards.css). tier: the drop's ('legend' = the gold banner + a small confetti puff from it; 'rare' a gem; else the star) */
  const TOAST_I = { common: 'coin_color', rare: 'gem_stone_color', legend: 'duck_color' };
  function toast(text, sub, tier) {
    if (!tHost || !tHost.isConnected) tHost = host('fx-toast-host');
    clearTimeout(tTimer);
    if (cur) cur.remove();
    const t = cur = tHost.appendChild(mk('div', 'fx-toast' + (tier ? ' fx-toast-' + tier : ''), img(TOAST_I[tier] || 'glowing_star_color', 'fx-toast-i' + (tier === 'legend' ? ' fx-gold' : ''))));
    const b = t.appendChild(mk('div', 'fx-toast-b'));
    b.append(txt('div', 'fx-toast-t', text));
    if (sub) b.append(txt('div', 'fx-toast-s', sub));
    if (still()) fadeIn(t, 300);
    else t.animate([{ opacity: 0, transform: 'translateY(-16px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    const hide = () => {
      if (t !== cur) return;
      cur = null; clearTimeout(tTimer);
      if (still()) t.remove(); else run(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    };
    t.addEventListener('click', hide);
    tTimer = setTimeout(hide, 2200);
    if (tier === 'legend' && !still()) {                                     // small confetti from the banner, on the banner's own host (one group)
      const f = confettiIn(tHost), m = mid(t);
      if (f) {
        f.canvas.classList.add('fx-toast-conf');
        Promise.race([f({ particleCount: 28, spread: 70, startVelocity: 22, ticks: 90, scalar: .8, colors: ['#ffcd94', '#ff9a3e', '#ff8204'],
          shapes: ['star', 'circle'], origin: { x: m.x / innerWidth, y: m.y / innerHeight } }), new Promise(r => setTimeout(r, 1600))])
          .then(() => { if (f.reset) f.reset(); f.canvas.remove(); });
      }
    }
    return t.getAnimations()[0] && t.getAnimations()[0].finished.catch(() => {});   // the queue moves on once it has landed
  }

  // full-screen overlay shell: tap / Escape -> skip(); close() fades 200ms and removes
  function overlay(cls, skip) {
    const el = host('fx-ov ' + cls);
    let closed = false, done;
    const p = new Promise(r => (done = r));
    // Escape, and → (flow C keys: the first → only closes the overlay; app.js sees defaultPrevented and does not go Next). Enter does nothing here
    const key = e => { if (e.key === 'Escape' || e.key === 'ArrowRight') { e.preventDefault(); skip(); } else if (e.key === 'Enter') e.preventDefault(); };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key, true);
      el.style.pointerEvents = 'none';
      if (still()) { el.remove(); done(); }                                   // reduced motion: out at once (its one fade was the way in)
      else run(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).then(done);
    };
    el.addEventListener('click', skip);
    document.addEventListener('keydown', key, true);
    fadeIn(el, 270);
    return { el, close, done: p };
  }

  const TIER = { common: ['coin_color', 'COIN DROP', 'small'], rare: ['gem_stone_color', 'RARE DROP', 'medium'], legend: ['duck_color', 'LEGENDARY', 'large'] };
  const FILLER = ['cherries_color', 'star_color', 'trophy_color', 'glowing_star_color']; // never a tier icon -> no fake near-miss
  const CELL = 84;

  /* flow C (Tony, Oct 21): the slot reels never get an overlay of their own; they spin INSIDE the level-up overlay (par = its content).
     Returns { land() }: land() stops them on the payline at once (a tap / Escape / → on the overlay). */
  function reels(par, tier, calm, ovEl) {
    const T = TIER[tier] ? tier : 'common', [win, label, size] = TIER[T];
    let landed = false, rs = [];
    const p = par.appendChild(mk('div', 'fx-slots fx-in-lvl fx-t-' + T,
      `<div class="fx-slots-in"><div class="fx-bulbs">${'<i></i>'.repeat(11)}</div><div class="fx-reels"></div><div class="fx-slabel"></div></div>`));
    p.style.setProperty('--cell', CELL + 'px');
    if (!calm) p.classList.add('fx-spin');            // marquee bulbs blink only while the reels move
    const lab = p.querySelector('.fx-slabel'), box = p.querySelector('.fx-reels');
    lab.textContent = label;
    const winCls = T === 'legend' ? 'fx-gold' : '';
    rs = [0, 1, 2].map(i => {
      const n = 10 + i * 3, icons = []; // icons[1] is the payline result; strip scrolls downward onto it
      for (let k = 0; k < n; k++) { let x = win; if (k !== 1) do x = pick(FILLER); while (x === icons[k - 1]); icons.push(x); }
      const reel = box.appendChild(mk('div', 'fx-reel',
        `<div class="fx-strip">${icons.map((x, k) => `<div class="fx-cell">${img(x, k === 1 ? winCls : '')}</div>`).join('')}</div>`));
      const strip = reel.firstChild, dur = 550 + i * 200;  // inside the ~2.2 s level-up beat: the last reel lands by ~1.25 s
      strip.style.transform = `translateY(${-CELL}px)`;
      if (calm) return { strip };
      strip.classList.add('spin');
      setTimeout(() => strip.classList.remove('spin'), dur * .7);
      const a = strip.animate([
        { transform: `translateY(${-(n - 1) * CELL}px)`, easing: 'cubic-bezier(.16,1,.3,1)' },
        { transform: `translateY(${-CELL}px)` }
      ], { duration: dur, delay: 300, fill: 'backwards' });
      return { strip, a };
    });
    function land() {
      if (landed) return;
      landed = true;
      p.classList.remove('fx-spin');
      rs.forEach(r => { r.a && r.a.finish(); r.strip.classList.remove('spin'); });
      p.classList.add('win');
      if (!calm && ovEl.isConnected) {
        rs.forEach((r, i) => r.strip.children[1].firstChild.animate(popKF(1.2), { duration: 450, delay: i * 80, easing: EASE.out }));
        const c = mid(box);
        spray(ovEl, c.x, c.y, COUNT[size], DIST[size]);
      }
    }
    if (calm) land();
    else Promise.all(rs.map(r => r.a.finished)).then(land, () => {});
    return { land, done: () => landed };
  }

  // flow C: only LEVEL UP goes full screen (~2.2 s with its 300 ms fade out); WIN / BONUS / LEGEND are banners (toast)
  const KIND = { levelup: { t: 'LEVEL UP', d: 1900 } };

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
      ], { duration: 570, delay: i * 120, easing: EASE.out, fill: 'backwards' });   // stars first (0 / 80 / 160 ms)
    });
    return w;
  }

  /* the one overlay an answer may have (flow C): LEVEL UP, with the slot reels inside it when the same answer also dropped (o.drop) */
  function burst(kind, o) {
    o = o || {};
    kind = 'levelup';
    const K = KIND[kind], calm = still(), title = o.title || K.t, sub = o.sub != null ? o.sub : K.s;
    let timer, rl = null;
    const ov = overlay('fx-burst fx-' + kind, () => { if (rl && !rl.done()) { rl.land(); return; } clearTimeout(timer); ov.close(); });
    ov.el.innerHTML = '<div class="fx-rays"></div><div class="fx-dots"></div>';
    const c = ov.el.appendChild(mk('div', 'fx-bc'));
    if (!calm) c.append(stars());
    const t = c.appendChild(titleEl(title));
    const s = sub ? c.appendChild(txt('div', 'fx-plate', sub)) : null;
    if (o.drop) rl = reels(c, o.drop, calm, ov.el);
    if (!calm) {
      t.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 600, delay: 300, easing: EASE.out, fill: 'backwards' });   // then the title ribbon (300 ms)
      if (s) s.animate([{ transform: 'translateY(14px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 450, delay: 600, easing: EASE.pop, fill: 'backwards' });   // then the plate (900 ms)
      if (!rl) setTimeout(() => { if (ov.el.isConnected) { const m = mid(t); spray(ov.el, m.x, m.y, 22, 150); } }, 900);   // the sparks last (900 ms); with reels their landing sprays
    }
    timer = setTimeout(ov.close, K.d);
    return ov.done;
  }

  // "+10 XP" rising off the answer on every correct; cls "fx-float-sm" = a wrong try's quiet "+1"
  function float(el, text, cls) {
    if (!el || still()) return;
    const p = mid(el), f = layer().appendChild(txt('div', 'fx-float' + (cls ? ' ' + cls : ''), text));
    f.style.cssText = `left:${p.x}px;top:${p.y}px`;
    return run(f, [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: .25 },
      { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 1350, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  // one light sweep across the HUD coin pill (rewards.css .rw-shine)
  function shine(el) {
    if (!el || still()) return;
    el.classList.remove('rw-shine'); void el.offsetWidth; el.classList.add('rw-shine');
    el.addEventListener('animationend', () => el.classList.remove('rw-shine'), { once: true });
  }

  // every entry point joins the one queue (seq); the step's promise resolves when its part is done (slots / burst: when the overlay is gone)
  window.FX = {
    pop: el => seq('answer', () => pop(el)),
    sparks: (el, tier) => seq('layer', () => sparks(el, tier)),
    float: (el, text, cls) => seq('layer', () => float(el, text, cls)),
    coinFly: (fromEl, toEl, n) => seq('layer', () => coinFly(fromEl, toEl, n)),
    shine: el => seq('hud', () => shine(el)),
    hud: fn => seq('hud', fn),                                              // app.js: the HUD's render (count-up, bar) in the HUD step
    burst: (kind, o) => seq('burst', () => burst(kind, o)),                 // flow C: LEVEL UP only; o.drop = the reels inside it
    toast: (text, sub, tier) => seq('toast', () => toast(text, sub, tier)),
    nod                                                                     // app.js: the duck chip's calm nod, its own step after the answer's
  };
})();
