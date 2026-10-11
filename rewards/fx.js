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
  const COUNT = { small: 10, medium: 18, large: 30 }, DIST = { small: 70, medium: 105, large: 145 };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const done = a => a.finished.catch(() => {});
  const D = 200;                                                    // one slot = STYLE.md --d-move

  /* ONE BLINK (20261010-B2; STYLE.md §1.6 / §2.8, palette §10): one group moves at a time. Everything runs on one lane, one job after
     the other: a beat (below), then a drop's reels, a burst, the banner. While the lane is busy, html.fx-busy pauses the Cluck chip's
     wiggle (rewards.css). Triggers, odds, XP and when app.js pays are unchanged: choreography only. */
  let lane = Promise.resolve(), jobs = 0;
  const root = document.documentElement;
  function queue(job) {
    jobs++; root.classList.add('fx-busy');
    return (lane = lane.then(job).catch(() => {}).then(() => { if (!--jobs) root.classList.remove('fx-busy'); }));
  }

  /* the Cluck chip's wiggle (rewards.css) never moves with the answer: html.fx-pick while a picked choice waits for Check (paused),
     html.fx-rest once the question is solved (it rests; out of tries keeps it). Set in the same task as the change, before a paint */
  function hush() {
    const q = document.getElementById('q'), fb = document.getElementById('fb');
    root.classList.toggle('fx-pick', !!(q && q.querySelector('.opt[aria-checked="true"]')));
    root.classList.toggle('fx-rest', !!(q && q.classList.contains('closed') && !(fb && fb.querySelector('.verdict.lock'))));
  }
  new MutationObserver(hush).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-checked'] });

  /* the beat: what app.js asks for in one go (rewardShow, rewardTick) is one lane job. Each part gets a slot in palette order, answer →
     stars → ribbon ("+N XP") → button (the coins into the HUD strip), and every start is set up front as a WAAPI delay 200 ms apart, so
     a busy main thread cannot push two parts together. The answer's slot also waits for the page's own lock-in fades (app.css, ≤ 400 ms).
     Then the HUD catches up in its own slot, then the ribbon fades out. A right answer is still by about 1.2 s. */
  const ORDER = ['answer', 'stars', 'ribbon', 'coins'];
  let parts = null;
  const settle = () => Math.min(2 * D, Math.max(0, ...document.getAnimations().map(a => {
    const t = a.playState === 'running' && a.effect && a.effect.getComputedTiming();
    return t && isFinite(t.endTime) && !(a.effect.target && a.effect.target.closest && a.effect.target.closest('.rw-skin')) ? t.endTime - (t.localTime || 0) : 0;
  })));
  function beat() {
    if (parts) return parts;
    const ps = parts = [], gathered = Promise.resolve().then(() => { parts = null; });
    hold();
    queue(async () => {
      await gathered;
      ps.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      let at = 0;
      const runs = ps.map((p, i) => { if (i) at += i === 1 && ps[0].kind === 'answer' ? Math.max(D, settle()) : D; return Promise.resolve(p.play(at)).then(p.ok, p.ok); });
      await Promise.all(runs);
      await release();
      await floatsOut();
    });
    return ps;
  }
  const part = (kind, play) => new Promise(ok => beat().push({ kind, play, ok }));

  /* the HUD strip holds its old bar / flame / level while the beat plays (engine.js renders at app.js's 450 ms; nothing moves then)
     and catches up in its own slot after the coins. Reduced motion: nothing to hold (the HUD changes at once). */
  let held = null, hudShine = null, hudPop = null;
  function hold() {
    const h = document.querySelector('.rw-hud');
    if (held || !h || still()) return;
    const bar = h.querySelector('.rw-bar i'), fl = h.querySelector('.rw-flame');
    h.style.setProperty('--rw-p0', (bar && bar.style.getPropertyValue('--p')) || '0');
    h.style.setProperty('--rw-fs0', (fl && fl.style.getPropertyValue('--fs')) || '1');
    h.classList.add('rw-hold');
    held = h;
  }
  /* a right answer holds the balance too: engine.js counts it up for 600 ms from app.js's 450 ms, which would tick under the ribbon and
     the coins. The number on screen waits (what engine.js writes is kept, and read back) until the HUD's slot, where it counts up in
     200 ms. A wrong try's +1 is not held: one number swap, no count */
  function holdNum() {
    const h = document.querySelector('.rw-hud'), num = h && h.querySelector('.rw-num');
    if (!num || num.__held || still()) return;
    const k = num.__held = { from: +num.textContent || 0, want: num.textContent, to: null };
    Object.defineProperty(num, 'textContent', { configurable: true, get: () => k.want, set: v => { k.want = String(v); if (k.to != null && k.want === k.to) letGo(num); } });
  }
  const setText = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').set;
  function letGo(num) { if (!num.__held) return; clearTimeout(num.__held.t); delete num.__held; delete num.textContent; }
  /* the held balance counts up in the HUD's slot (one 200 ms ease-out, no overshoot). engine.js may still be counting (a busy phone):
     its writes stay swallowed until it reaches the same number (or 1 s passes), so the two counts never show together */
  function countIn(num) {
    const k = num && num.__held; if (!k) return null;
    const R = window.Rewards, b = R && R.state ? +R.state().xp : +k.want, a = k.from;
    k.to = String(b);
    if (k.want === k.to) letGo(num); else k.t = setTimeout(() => letGo(num), 1000);
    if (!isFinite(b) || b === a) { setText.call(num, String(b)); return null; }
    const t0 = performance.now();
    return new Promise(r => { (function step(t) {
      const q = Math.min(1, Math.max(0, (t - t0) / D));
      setText.call(num, String(q < 1 ? Math.round(a + (b - a) * (1 - Math.pow(1 - q, 3))) : b));
      if (q < 1) requestAnimationFrame(step); else r();
    })(t0); });
  }
  async function release() {
    const h = held, sh = hudShine, pp = hudPop; held = hudShine = hudPop = null;
    if (!h) return;
    h.classList.remove('rw-hold');                                  // bar + flame ease to the new value, a level-up pulses (rewards.css)
    const all = [];
    if (pp && pp.isConnected) all.push(pp.animate(popKF(1.15), { duration: D, easing: 'ease-out' }));
    if (sh && sh.isConnected) {
      sh.classList.remove('rw-shine'); void sh.offsetWidth; sh.classList.add('rw-shine');   // the class stays until the next shine: it plays once
      all.push({ finished: wait(D) });
    }
    const n = countIn(h.querySelector('.rw-num')); if (n) all.push({ finished: n });
    if (h.isConnected) all.push(...h.getAnimations({ subtree: true }).filter(a => isFinite(a.effect.getComputedTiming().endTime)));   // flushes style: the transitions start now
    await Promise.all(all.map(done));
  }
  // the "+N XP" ribbons leave together, after the HUD has caught up. Reduced motion: they stay a moment, then go at once (no second fade)
  let floats = [];
  async function floatsOut() {
    const f = floats; floats = [];
    if (!f.length) return;
    if (still()) { await wait(4 * D); f.forEach(n => n.remove()); return; }
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
  function spray(par, x, y, n, dist, delay = 0) {                 // one slot: every spark is gone D ms after its start
    const all = [];
    for (let i = 0; i < n; i++) {
      const s = par.appendChild(mk('i', 'fx-sp fx-sp' + (i % 4)));
      s.style.cssText = `left:${x}px;top:${y}px;--c:${pick(COLORS)};opacity:0`;   // unseen until its slot
      const a = i / n * 360 + rnd(-12, 12), d = dist * rnd(.6, 1.2), r = `rotate(${a}deg) translateX`;
      all.push(run(s, [
        { transform: `${r}(0) scale(.3)`, opacity: 1 },
        { transform: `${r}(${d * .75}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `${r}(${d}px) scale(0)`, opacity: 0 }
      ], { duration: D, delay, easing: 'cubic-bezier(.1,.7,.3,1)' }));
    }
    return Promise.all(all);
  }

  // slot 0, the answer: one 200 ms pop. It takes over app.css's two-beat .opt.pop pulse on this answer, so the answer is done by 200 ms
  function pop(el) {
    if (!el || still()) return;
    for (const a of el.getAnimations()) if (a.animationName === 'opt-pop') a.finish();
    holdNum();
    part('answer', at => el.isConnected ? done(el.animate(popKF(1.06), { duration: D, delay: at, easing: 'ease-out' })) : null);
  }

  /* slot 1, the stars: one short spark burst from the answer, 200 ms (Tony, Oct 4: confetti on every correct). CSS sparks only: the
     canvas-confetti library draws from requestAnimationFrame for ~2 s, so it could not be held to one slot (it was the long tail) */
  function sparks(el, tier) {
    if (!el || still()) return;
    tier = COUNT[tier] ? tier : 'small';
    part('stars', at => { if (!el.isConnected) return null; const p = mid(el); return spray(layer(), p.x, p.y, COUNT[tier], DIST[tier], at); });
  }

  // slot 3, the button: the coins fly into the HUD strip together, all landed 200 ms after the slot starts; the strip answers in its own slot
  function coinFly(fromEl, toEl, n) {
    toEl = toEl || document.getElementById('coinPill');
    n = n || 5;
    if (!fromEl || !toEl || still()) return Promise.resolve();
    hudPop = toEl;
    return part('coins', at => {
      if (!fromEl.isConnected || !toEl.isConnected) return null;
      const a = mid(fromEl), b = mid(toEl), Ly = layer(), lag = n > 1 ? 40 / (n - 1) : 0;
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
        return run(c, kf, { duration: D - 40, delay: at + i * lag, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'backwards' });
      }));
    });
  }

  let tHost, cur, tTimer;
  function toast(text, sub) {                                     // the drop banner: never takes a tap (pointer-events: none in rewards.css)
    return queue(async () => {
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
    return queue(async () => {
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
    return queue(async () => {
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
  // cls "fx-float-sm" = a wrong try's quiet "+1". Reduced motion: one opacity fade in, no movement, then gone at once
  function float(el, text, cls) {
    if (!el) return;
    part('ribbon', at => {
      if (!el.isConnected) return null;
      const p = mid(el), f = layer().appendChild(txt('div', 'fx-float' + (cls ? ' ' + cls : ''), text));
      f.style.cssText = `left:${p.x}px;top:${p.y}px;transform:translate(-50%,-110%)`;
      floats.push(f);
      return done(f.animate(still() ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'translate(-50%,-50%)', opacity: 0 }, { transform: 'translate(-50%,-110%)', opacity: 1 }],
      { duration: D, delay: at, fill: 'both', easing: 'ease-out' }));
    });
  }

  // one light sweep across the HUD coin pill (rewards.css .rw-shine), in the HUD's own slot
  function shine(el) {
    if (!el || still()) return;
    beat();
    hudShine = el;
  }

  window.FX = { pop, sparks, coinFly, toast, slots, burst, float, shine };
})();
