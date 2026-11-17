/* brainrot.js: the brainrot corner (docs/design/FORMULA-CARD.md round 2, Tony's pick 1 "iOS PiP corner"). Sugar mode only, on questions
   with a saccharine layer, while a question is open. Two bare looping videos, muted (Subway on top, parkour under): no frame, no
   labels. – and ✕ are see-through overlays that show on hover, keyboard focus, or for 3 s after a tap. Drag it anywhere; it snaps
   to the nearest corner (kept per device). – stashes it into a 44x96 tab on its edge; ✕ hides it for the session. It starts
   stashed on short screens (< 700px tall) and with reduced motion (players paused). Until the first drag it never sits on an answer
   control: a corner that would cover one is skipped, and if all would, it stashes. A drop is the user's choice (the Scratchpad FAB
   rule): the dropped corner stays, covered or not (Tony, Oct 3: "i cannot drag the thing down"). At rest it is anchored with CSS
   left/right + top/bottom, so a bottom corner rides Firefox Android's sliding toolbar; transform is only for the drag and the snap. Hidden while the pad page, the keyboard or the code bar is up.
   app.js calls window.stemBrainrot.sync() after every question opens and on layout changes. Nothing loads until it first shows.
   Desktop / tablet side by side (html.side; Tony, Oct 4 picked "B: top of notes"): it docks as the first thing in the notes column,
   both players side by side, sticky, no drag, no corner math; – folds it into a "Show video" bar. Moving an iframe reloads it, so it is
   placed once and only moves when the layout crosses the breakpoint. A slow link gets none of it (slow() below).
   Docked, a label row heads the column, level with the question's "Question" label: a speech bubble + "Explain" (Tony, Oct 5, explain-column.html
   D1), and one quiet text link, "Show / Hide curated brainrot", that folds / unfolds the players (Tony, Oct 5: "no buttons, just a link";
   the – / ✕ overlays and the 36px "Show video" bar are gone there). Docked, all 5 videos sit in one box that scrolls sideways, sized so 3 and a half show (W135b, Tony Oct 31: "we can fit 3.5 visually, 5 total"); a fade at the edge with more to scroll is the cue ("with gradient fade as a scorll cue too").
   The players are 9:16 frames, side by side, capped at 40vh; a landscape video is centre-cropped, a Short fills.
   While Cluck's sheet is open (desktop) the players fold and the label row stays; they come back when it shuts, unless the header button
   was used in between (Tony, Oct 5: at 1366x768 the sheet had 177 px under them).
   Curated brainrots (Tony, Oct 5): CATS = his 8 playlists (3 on Oct 5, 5 on Oct 26; tools/client_generators/brainrot_list.py writes it, a hand-curated fallback for a failing Oct 26 feed). Each page load picks 5 random categories, one video each (Tony, Oct 29: "add 3 more brainrot vid for desktop"; Oct 31: "5 total"): docked
   shows the 5 in one sideways-scrolling row (4-5 load once a tenth of them is in the box: the half-peeking 4th at once, the 5th when scrolled to), the corner 2.
   Tony, Nov 14 (variant B, "go with bento style, the O one with the expand-jut-out button on mobile as video bkg"; html.ui-v7 ONLY, flag off = everything above):
   the 3.5-visible row is gone: docked is NO box, a bento mosaic, all 5 in view (the playing one large, span 6, + four span 3 on a 12-col grid; tapping
   a small one swaps it into the large slot, CSS order only, no iframe moves, no reload). The floating corner is two 9:16 players side by side, with – / ✕ above
   them (never over the picture, always shown). And phones SHOW it (the Oct 17 "phones get none" rule is lifted under ui-v7): a phone starts stashed as a 44x96 tab
   jutting from the screen edge whose background is a clipped slice of the playing first video (the live iframe itself, shown through the tab: nothing moves, so no
   reload, no ytimg request, and it really plays); tap = expands the corner. Sugar mode only, as before. Zero borders, radii 16 / 12, gaps on 4 8 12 16 24 32.
   BRAINROT-B2 (Tony, Nov 14, "too compact?? add more videos, vary their layout bento size"; "you are allowed to CROP the video ... its bkg"): docked v7 is now 8 videos (all 8 categories, one each) in a
   full-width interlocked bento (LAYOUT below: hero 2x2 + tall + wide + small, 12-col grid, gap 8, every video cover-cropped to its tile; app.css BRAINROT-B2 block). Lazy rule unchanged: the first 3 iframes load at once,
   the rest only when their tile is >= 10% in view. A tap swaps the hero and the tapped tile's grid cells (CSS custom property only, no iframe move). Height budget: --hmax = min(60dvh, 100dvh - 28rem), Cluck sheet keeps its header + ask at 768. */
(() => {
  /* list:start (tools/client_generators/brainrot_list.py writes this block: [category, [[YouTube id, title, 1 = a Short]]]; don't hand-edit) */
  const CATS = [
    ["Parkour", [["z84bmLDzIIk", "Minecraft Parkour Gameplay No Copyright 4K (2 Hours)", 0], ["85z7jqGAGcc", "Minecraft Parkour Gameplay No Copyright (2 Hours)", 0], ["BXUA2FncVPI", "Minecraft Parkour Gameplay No Copyright 4K", 0], ["5ksFZIlktBY", "Minecraft Parkour Gameplay No Copyright 4K (1 HOUR)", 0], ["wxgSCIpoMQE", "Minecraft Parkour Gameplay No Copyright", 0], ["l9_9M1TetJQ", "Minecraft Parkour Gameplay No Copyright", 0], ["_A3po0HYwkY", "Minecraft Parkour Gameplay No Copyright (1 HOUR)", 0], ["u7kdVe8q5zs", "Minecraft Parkour Gameplay No Copyright", 0], ["0c4KWfPhgWA", "Minecraft Parkour Gameplay (No Copyright) 1 HOUR", 0], ["7mTTdWTw5p0", "Minecraft Parkour Gameplay NO COPYRIGHT", 0], ["952ILTHDgC4", "Minecraft Parkour Gameplay No Copyright (4K)", 0], ["YW7NV8J8oxI", "Minecraft Parkour Gameplay No Copyright (FREE TO USE)", 0], ["1DmWDZOdl6U", "Minecraft Parkour Gameplay NO COPYRIGHT", 0], ["r7QxFKBBTM8", "Minecraft Parkour Gameplay (NO COPYRIGHT)", 0], ["0vPT4tUFKWA", "Minecraft Parkour Gameplay (NO COPYRIGHT)", 0]]],
    ["Brainrot", [["lWJBIrpLq84", "Down in Ohio | TikTok Compilation 🤣", 0], ["tzD9OxAHtzU", "skibidi toilet", 1], ["AnoTVNqLJ-Q", "skibidi toilet 2", 1], ["brGo1JgwtrM", "skibidi toilet 3", 1], ["UvFroPxa67s", "skibidi toilet 4", 1], ["9S8yAqINOYs", "skibidi toilet 5", 1], ["iQWY6j4aGc8", "skibidi toilet 6", 1], ["wVNMVGY56Os", "skibidi toilet 7", 1], ["ImL2oQ_FxfU", "skibidi toilet 8", 1], ["U_lrep5F8gE", "skibidi toilet 9", 1], ["OHj0icF52tQ", "skibidi toilet 10", 1], ["mA5ShB4EmCo", "CG5 - GRIMACE (Original Song)", 0], ["-9kU8hM_iIc", "Just got the grimace shake! #shorts", 1], ["-LpYxiy9MsM", "The GRIMACE SHAKE Got Our Kids!", 1]]],
    ["Subway Surfers", [["ChBg4aowzX8", "Compilation PlayGame Subway Surfers On PC Non Stop 1 Hour HD", 0], ["L_fcrOyoWZ8", "Compilation PlayGame Subway Surfers / Subway Surf /2023/ On PC Non Stop 1 Hour HD", 0], ["AR24XK1WAb8", "Subway Surfers 1 Hour Compilation PlayGame Subway Surfers Subway Surf 2023 On PC Non Stop 1 Hour FHD", 0], ["178D8K_xa1Q", "Subway Surfers 1 Hour Compilation GamePlay Subway Surfers Subway Surf 2023 On PC Non Stop 1 Hour HD", 0], ["Xuv1wMsUz5c", "Compilation GAMEPLAY SUBWAY SURFERS 1 HOUR ON OMEN by HP Gaming Laptop 17", 0], ["p6zo3r6WxcU", "SUBWAY SURFERS GAMEPLAY 1 HOUR ON OMEN by HP Gaming Laptop 17", 0], ["0e0LFNaJupE", "Compilation Gameplay Subway Surfers - Subway Surf /2023/ Character FRANK On PC Non Stop 1 Hour FHD", 0], ["zqX0N4Pk1iI", "Compilation Gameplay Subway Surfers Subway Surf 2023 On PC Non Stop 1 Hour FHD", 0], ["GfQzoChf9Bw", "Compilation Gameplay Subway Surfers New Orleans 1 Hour Play On PC FHD", 0], ["NbgO7uM9pos", "Compilation PlayGame Subway Surfers UNLIMITED COINS Character KING On PC Non Stop HD", 0], ["Peg1INzz5_Q", "Compilation PlayGame Subway Surfers / Subway Surf /2023/ On PC FHD", 0], ["kaq9nTPPBzo", "There is Something Strange About Gameplay Subway Surfers / Subway Surf /2023/ Non Stop 1 Hour FHD", 0], ["G0cFZA-F2lk", "Compilation Gameplay Subway Surfers Subway Surf 2023 On PC Non Stop FHD", 0], ["6CPT08P-exM", "Compilation Gameplay Subway Surfers New Orleans /2023/ 1 Hour Character Tricky Play On PC HD", 0], ["DcVP5eNFCBY", "Compilation PlayGame Subway Surfers / Subway Surf /2023/ What Happen ?? Play On PC FHD", 0]]],
    ["Hydraulic Press", [["swLoxdPCJ54", "Hydraulic Press with coca #hydraulicpress #crushing #satisfying #asmr", 1], ["A6YhLxwDAuQ", "Hydraulic Press with coca #hydraulicpress #crushing #satisfying #asmr", 1], ["FOW5c4HOXpY", "Hydraulic Press with coca cans #hydraulicpress #crushing #satisfying #asmr", 1], ["SUPRvKfdp_I", "Hydraulic Press with beer cans #hydraulicpress #crushing #satisfying #asmr", 1], ["X_-eCxrgA-w", "Fanta Hydraulic Press  #hydraulicpress #asmr #crushing #satisfying #craft", 1], ["RtQLpo88J4U", "bricks Hydraulic Press  #hydraulicpress #asmr #crushing #satisfying #craft", 1], ["b_6fxkMS8yo", "bricks Hydraulic Press  #hydraulicpress #asmr #crushing #satisfying #craft #diy", 1], ["fw1ZcQwcQG0", "Toys Hydraulic Press  #hydraulicpress #asmr #crushing #satisfying #craft #diy", 1], ["kqDdwdWHC_E", "Donald trump Hydraulic Press  #hydraulicpress #asmr #crushing #satisfying #craft #diy #shorts #reels", 1], ["2VCRXsaOnss", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1], ["pOUEA4zOdLc", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1], ["Fctr6SRlOIM", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1], ["do5412RcyuA", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1], ["MTwlItvJcDU", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1], ["CWU6URX7L3E", "Crushing brick Hydraulic Press #hydraulicpress #crushing #satisfying #asmr", 1]]],
    ["Soap Cutting", [["aymLiWdcPKs", "Most satisfying thing you’ll see today! 🤤🧼 #ASMR #Shorts", 1], ["kG6CROtrjnU", "Oddly Satisfying Pink Soap Shredding ASMR! 😱💖 #shorts #oddlysatisfying #asmr", 1], ["LPYR_5j2V-k", "The crunch at the end is insane! 🧼💥 #soapcrushing #asmr#shorts", 1], ["7o1D51-dU3c", "The Most Satisfying Soap Crunch! 😍🔊 #shorts #satisfying #asmr #entertainment", 1], ["PldMs95p9hA", "Satisfying Soap Unboxing! 📦✨ | #shorts", 1], ["6e6_G53Olbo", "Wait for the first cut... 📦✂️ #soapcutting #asmr", 1], ["kBPjk_sLsiw", "Perfect grid cuts are so relaxing 🧼🎧 #oddlysatisfying #shorts", 1], ["CTjpTDRAhKo", "ASMR Soap Cutting Unboxing! 📦✨ #satisfying #soapcutting #asmr #unboxing #oddlysatisfying #shorts", 1], ["WHJBqWINe3c", "The Disturbing Truth About These 3 Soaps #shorts #TheDisturbingTruth #SoapTruth #SkincareRoutine", 1], ["MFI1UMApgIQ", "From dry to pink magic! 🧽🌸​ #Shorts #Reels #Satisfying #SpongeMagic #USA #Trending", 1], ["_gHcdcCFIJI", "July 2, 2026", 1], ["Znt4j7npwdY", "ASMR Hand Washing with Soap 🧼✨ So Clean & Super Satisfying! #shorts", 1], ["kQmWdVf_cTU", "Satisfying Soap Scraping ASMR 🧼✨ Relaxing Soap Shaving Sounds #shorts", 1], ["ijSJL8tq4vk", "Oddly Satisfying Soap Cutting ASMR 🧼 | Relaxing Soap Carving Sounds #shorts", 1], ["B1-lCAWE6Hc", "Oddly Satisfying Soap Cutting ASMR 🧼✨ | Relaxing Soap Carving Sounds #shorts", 1]]],
    ["Kinetic Sand", [["A8u2qte7zHE", "Very Satisfying ASMR Kinetic Sand Cutting / Relaxing Video 🐱❤️😇", 1], ["-bYrV6hvYvw", "Very Satisfying ASMR Kinetic Sand Cutting / Relaxing Video 🎈😇", 1], ["hmTwHu7zrW4", "Very Satisfying ASMR Kinetic Sand Cutting / Relaxing Video 🦖😇❤️", 1], ["yKoIUOpc3PU", "Very Satisfying ASMR Kinetic Sand Cutting / Relaxing Video ✂️😇❤️", 1], ["1RcnhbGlSb8", "🎄 Wait for the Roller... It's So Satisfying! 🤯 #shorts", 1], ["lAexz1ikYik", "Very Satisfying ASMR Kinetic Sand Cutting / Relaxing Video 🎈☁️😇", 1]]],
    ["Pressure Washing", [["bZCf_pDsogc", "Is the ground you usually see really clean#shorts#clean#hose#pressure", 1], ["55RttQwQM4w", "The high pressure cleaning machine has no problem cleaning cement slurry#shorts#clean#hose#machine", 1], ["1OIWVxQdcVQ", "The high pressure washer set is awesomer#shorts#hose#car#clean#machine", 1], ["sqinKXUmnaE", "Powerful Carpet Cleaning! Industrial Pressure Washer Removing Stubborn Stains 😱🔥 #shorts #cleaning", 1], ["-0tOHAy-jO4", "Heavy Duty High Pressure Water Jet in Action! Comment CLEAN for Supplier Contact #shorts #tools", 1], ["-7J5cDKtQEc", "High Pressure Cleaning Power See the Impact of a Pressure Washer on Street Surfaces  #shorts #clean", 1], ["nFb3NO0U9OY", "Witness the Power of High Pressure Water Jetting Impressive Impact Display for Cleaning Efficiency", 1], ["fOLHLYQmvb0", "pressure washer hose washer pressure washer and hose #shorts #homedecor #nature #flowers #gardening", 1], ["4Z828BHSnvY", "pressure washer hose pressure washer hose washer #shorts #how #useful #knowledge #home #machine", 1], ["4A6Ui_aR3xU", "pressure washer hose washer pressure washer and hose #shorts #lifehack #lifehack #instagood #tricks", 1], ["5RyefWn5FLE", "Can This Blast Away ANY Dirt  #shorts #cleaning #pressure #tools #diy #home #satisfy #water", 1], ["MYY9q4SlWjw", "Power Wash Anything in 10 Seconds  #shorts #carwash #cleaning #tools #pressure #diy #home #satisfy", 1], ["BG4EqWBYJSk", "High Pressure Water Gun with Home Car Washer in Action #shorts #carwash #pressure", 1], ["kuFe8fwPM9A", "Power Washer Water Jet – Satisfying Car Wash #shorts #pressurewash #carclean #satisfying #tools", 1]]],
    ["Marble Run", [["2KzIGSqvw8w", "Marble Track", 1], ["yHZxiOs_bVs", "Amazing Marble Race #satisfying", 1], ["nMkL-tIxYr4", "Marble Fun Race", 1], ["toLwaTZQDV0", "🔴🔵 Marbles + Wood Plate Display with LED Lights", 1], ["iG_G_g5kGHU", "Giant Marble Maze  #marblerun #marblerace #satisfying", 1], ["btm0Q81dcYk", "Colorful Marbles Cascade🟢🔴 #marblerun #satisfying #toys #marblerace", 1], ["YaB4QfowI4s", "🔥Epic Giant Marble Maze! #marblerun #satisfying #toys", 1], ["-2DJPsBasr4", "Swirl Funnel Marble Run 🔵⚡️ #marble #marblerun #asmr #satisfying", 1], ["f3MhS6U1UFA", "Silver Swirl Motion 🪐 #marblerun #satisfying #marblerace", 1], ["2RVXq-gPvHM", "Marble Motion Reverse 🧋🌪 #marble #satisfying #reels", 1], ["6GeTLIk8EOs", "What's wrong with these marbles? 🟢🔴🔵 #satisfying  #marblerun", 1], ["AaRcESykJlk", "Triple Marble Swirl 🌀 #marble #marblerun #satisfying #asmr", 1], ["svhVNQdd9yw", "Marble Run Funnel Reverse 🌪🟢 #shorts #marblerun #marble #satisfying", 1], ["0kjJyrz6lL4", "Wooden Marble Slide 🪵🟤 #shorts #marblerun #satisfying", 1], ["DIVRvJosC78", "Epic Reverse Marble Run 🔄", 1]]],
  ];
  // list:end
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const any = a => a[Math.floor(Math.random() * a.length)];
  const N = Math.min(document.documentElement.classList.contains("ui-v7") ? 8 : 5, CATS.length);   // B2 (Tony, Nov 14): 8 under html.ui-v7 only; flag off keeps the 5 of before
  const PICK = shuffle(CATS.map((_, i) => i)).slice(0, N), VIDS = PICK.map(c => any(CATS[c][1]));   // BRAINROT-B2: up to 8 random categories (all of them today), one video each, new every load (Tony, Oct 26: 3; Oct 29: 6; Oct 31: "5 total"; Nov 14: "add more videos"); the corner shows 2 (app.css)
  /* BRAINROT-B2 bento: the docked v7 mosaic's cells by tile count: [rows, [[row, unit col, units tall, units wide] per tile]] on the 12-col grid (a unit = 3 cols); slot 0 = the hero (2x2), then
     tall (1x2) / wide (2x1) / small (1x1) ones, interlocked, no holes. A tap swaps the hero's cells with the tapped tile's (grid-area only; the iframes never move). */
  const area = (r, c, h, w) => `${r} / ${c * 3 - 2} / ${r + h} / ${(c + w) * 3 - 2}`;
  const LAYOUT = {
    8: [4, [[1, 1, 2, 2], [1, 3, 2, 1], [1, 4, 1, 1], [2, 4, 2, 1], [3, 1, 2, 1], [3, 2, 1, 2], [4, 2, 1, 2], [4, 4, 1, 1]]],
    7: [3, [[1, 1, 2, 2], [1, 3, 2, 1], [1, 4, 1, 1], [2, 4, 2, 1], [3, 1, 1, 1], [3, 2, 1, 1], [3, 3, 1, 1]]],
    6: [3, [[1, 1, 2, 2], [1, 3, 2, 1], [1, 4, 1, 1], [2, 4, 2, 1], [3, 1, 1, 2], [3, 3, 1, 1]]],
    5: [2, [[1, 1, 2, 2], [1, 3, 1, 1], [1, 4, 1, 1], [2, 3, 1, 1], [2, 4, 1, 1]]],
  };
  const esc = t => t.replace(/[&"<]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;" })[c]);
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const G = 16, root = document.documentElement;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const sess = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { /* blocked */ } return null; };
  const ico = id => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  /* no controls, no keyboard, no fullscreen, no annotations, no end screen of other channels; the title strip YouTube still draws is
     cropped off by the box (app.css .rot .vid iframe). The video itself can't be cached (cross-origin stream, YouTube's terms): the
     player is warmed instead, built off screen once the page settles, so it is already buffering when a question opens. */
  /* a slow link (Tony, Oct 5: 128 kbps 5G) gets no corner and no request to YouTube at all. ?slow=1|0 forces it (tests). Chrome says so
     (navigator.connection); Firefox and Safari don't, so the biggest real download of this page is timed (> 4 KB, not from a cache).
     A measurement is kept per device; with none this load (all from the service worker) the kept one holds, else fast. */
  const KBPS = 1000;                                                     // under 1 Mbps a ~1 MB player takes 10 s+
  function measure() {
    const c = navigator.connection;
    if (c) return !!c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType) || c.downlink < KBPS / 1000;
    const big = [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")]
      .filter(e => e.name.startsWith(location.origin) && e.transferSize > 4096 && e.responseEnd > e.responseStart)
      .sort((a, b) => b.transferSize - a.transferSize)[0];
    return big ? big.transferSize * 8 / (big.responseEnd - big.responseStart) < KBPS : null;   // bits per ms = kbps
  }
  let slowV = null;
  function slow() {
    if (slowV !== null) return slowV;
    const f = new URLSearchParams(location.search).get("slow");
    if (f === "1" || f === "0") return (slowV = f === "1");
    const m = measure();
    if (m !== null) store("stem-slow", m ? "1" : "0");
    return (slowV = m !== null ? m : store("stem-slow") === "1");
  }
  /* phones get none of it (Tony, Oct 17): no corner, no players, no request to YouTube, so nothing buffers. "Phone" is the repo's phone
     width, max-width 700px (app.js dockMQ, the same break NAV D75 "bottom bar, phones only" uses); a tablet and a desktop keep it. */
  const PHONE = matchMedia("(max-width: 700px)");
  const v7 = () => root.classList.contains("ui-v7");                     // Tony, Nov 14: the variant B look + phones showing it live behind html.ui-v7 (fx.js sets it in <head>)
  const off = () => !!sess("stem-rot-off") || (PHONE.matches && !v7()) || slow();   // ✕ for this session, a phone (flag off only: v7 phones get the jut-out tab), or a slow link
  const src = id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`
    + "&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1&modestbranding=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
  /* keep the page's keyboard focus (Tony, Nov 17: "block it from taking focus"): an autoplaying player focuses itself when it loads, so the
     student's focus, and Escape for an open popover, ended up inside the cross-origin frame (stem-stuff-bugs brainrot-iframe-focus). We can't stop
     the frame calling focus(), so we hand focus back unless the user went in on purpose: the pointer is over that player, or Tab just moved it. */
  let lastFocus = null, lastTab = 0;
  document.addEventListener("focusin", e => { if (!(e.target instanceof HTMLIFrameElement)) lastFocus = e.target; }, true);
  document.addEventListener("keydown", e => { if (e.key === "Tab") lastTab = Date.now(); }, true);
  addEventListener("blur", () => setTimeout(() => {
    const f = document.activeElement;
    if (!(f instanceof HTMLIFrameElement) || !f.closest("#rot")) return;           // focus left the window (tab switch) or went to another frame
    if (f.matches(":hover") || Date.now() - lastTab < 800) return;               // the user chose the player
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true }); else f.blur();
  }, 0));
  /* a video YouTube won't play here (Tony, Oct 27: "Video unavailable. Playback on other websites has been disabled by the video owner")
     is swapped in its slot: an unused video of the same category, else of any category; never one shown before on this page. Nothing left
     (or 3 swaps in one slot: then it's the browser, not the videos) = the slot keeps YouTube's own message. The player says so
     over postMessage (enablejsapi=1; origin= = it posts to this page only; the Referer already carries the origin, so YouTube learns
     nothing new): the page sends {"event":"listening"} every 250 ms until the player answers, then asks for onError, the same protocol
     YouTube's www-widgetapi.js speaks, without loading that script (one more script from YouTube, for 3 messages). Swapped codes
     (developers.google.com/youtube/iframe_api_reference#onError): 2 bad id, 5 HTML5 player, 100 removed / private, 101 + 150 embedding
     off. Not 153 (no Referer): every video would fail the same. tools/client_generators/brainrot_list.py drops non-embeddable ids before they ship. */
  const YT = "https://www.youtube-nocookie.com", DEAD = [2, 5, 100, 101, 150], shown = new Set(VIDS.map(v => v[0]));
  const slots = [], tl = [], byFrame = new WeakMap();   // tl[i]: tile i (its category, swap budget); its copies in the torus share it
  function listen(f, i) {
    const say = m => { try { f.contentWindow.postMessage(JSON.stringify({ ...m, id: i, channel: "widget" }), YT); } catch { /* not there */ } };
    const T = tl[i] ??= { c: PICK[i], left: 3, slots: [] };
    const s = { f, say, T, t: 0, heard: false, gone: false, want: true, paused: false };   // want: the tile shows in the dock window (watch)
    T.slots.push(s); slots.push(s); byFrame.set(f, s);
    f.addEventListener("load", () => {
      clearInterval(s.t); s.heard = s.gone = false;
      let n = 0;
      s.t = setInterval(() => { if (s.heard || ++n > 40) clearInterval(s.t); else say({ event: "listening" }); }, 250);
    });
  }
  function swap(s) {
    const T = s.T, free = k => CATS[k][1].filter(v => !shown.has(v[0]));
    const ks = free(T.c).length ? [T.c] : CATS.map((_, k) => k).filter(k => free(k).length);
    if (!ks.length || T.left < 1) return;
    T.left--;
    const c = any(ks), [id, t, short] = any(free(c));
    shown.add(id); T.c = c;
    for (const o of T.slots) { o.gone = true; o.f.title = `${t}, muted`; o.f.parentElement.classList.toggle("short", !!short); setSrc(o.f, src(id)); }   // every copy of the tile takes the new video at once
  }
  function setSrc(f, url) { if (f.hasAttribute("src")) f.src = url; else f.dataset.src = url; }   // a copy not loaded yet takes it when it shows
  addEventListener("message", e => {
    const s = e.origin === YT && slots.find(x => x.f.contentWindow === e.source);
    if (!s || s.gone) return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === "readyToListen") return s.say({ event: "listening" });   // www-widgetapi.js answers it the same way
    if (!s.heard) { s.heard = true; s.say({ event: "command", func: "addEventListener", args: ["onError"] }); if (!s.want) playing(s, false); }
    if (m.event === "onError" && DEAD.includes(m.info)) swap(s);
  });
  /* the torus (html.ui-v7, docked): a tile plays only while it shows in the dock's window; the rest are paused over the YouTube postMessage commands */
  function playing(s, on) { if (!s.heard || s.paused === !on) return; s.paused = !on; s.say({ event: "command", func: on ? "playVideo" : "pauseVideo", args: [] }); }
  let watching = false;
  function torus() { return !!el && el.classList.contains("docked") && v7(); }
  function watchPlay() {
    const on = torus();
    if (on === watching || !watch) return; watching = on;
    if (on) el.querySelectorAll(".vid").forEach(v => watch.observe(v));
    else { watch.disconnect(); for (const s of slots) { s.want = true; playing(s, true); } }
  }

  let el = null, duo = null, world = null, shelf = null, watch = null, order = [], tab = null, link = null, stashed = innerHeight < 700 || (PHONE.matches && v7()), corner = store("stem-rot") || "bl", picked = store("stem-rot-pick") === "1", on = false, showT = 0, drag = null;
  const desk = () => innerWidth >= 720;
  const docked = () => root.classList.contains("side");                // side by side: its own slot above the notes
  let userMin = false;                                                   // the – button, the only way to fold it when docked
  /* shown by default, muted, playing; only you fold it (Tony, Oct 6: "must mute autoplay and shown by default, u can hide later").
     Gone: the fold while Cluck's sheet is open (Oct 5) and the fold under reduced motion, which made "Show" a dead click */
  const width = () => (desk() && !v7() ? 320 : 176);   // v7: the corner is two 84px 9:16 players + 8 gap, whatever the screen
  /* one tile: its card, the Playing chip and its iframe (data-src = loads when the tile shows in the dock's window, see watch) */
  const vidHTML = ([id, t, short], i, lazy) => `<div class="vid${short ? " short" : ""}" data-k="${i}"><span class="now" aria-hidden="true"><span class="eq"><b></b><b></b><b></b></span>Playing</span><iframe ${lazy ? "data-src" : "src"}="${src(id)}" title="${esc(t)}, muted"${i > 1 ? ' loading="lazy"' : ""} allow="autoplay; encrypted-media; picture-in-picture; compute-pressure" referrerpolicy="strict-origin-when-cross-origin" tabindex="-1"></iframe></div>`;
  function build() {
    el = document.createElement("div");
    el.id = "rot"; el.className = "rot"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Video corner"); el.hidden = true;
    shelf = document.createElement("div"); shelf.className = "shelf";   // the dock's window (docked v7: a fixed height, the torus wraps inside it)
    duo = document.createElement("div"); duo.className = "duo";
    duo.innerHTML = VIDS.map((v, i) => vidHTML(v, i, i > 2)).join("");
    duo.insertAdjacentHTML("beforeend", `<div class="ctl"><button type="button" data-act="min" aria-label="Make video small">${ico("i-min")}</button><button type="button" data-act="x" aria-label="Hide video for now">${ico("i-x")}</button></div>`);   // a child of the duo, not of the first player: v7 floats it above the picture, flag off still lays it on the first player's corner
    /* the torus (html.ui-v7 only): three more copies of the mosaic make a 2 x 2 world, so the window wraps on both axes. A copy's iframe loads only when its
       tile shows in the window (watch); the copies are hidden outside the docked dock (app.css .dupe) */
    const lay = LAYOUT[VIDS.length] || LAYOUT[5];
    const dupes = v7() ? [1, 2, 3].map(() => { const d = document.createElement("div"); d.className = "duo dupe"; d.setAttribute("aria-hidden", "true");
      d.innerHTML = VIDS.map((v, i) => vidHTML(v, i, true)).join(""); return d; }) : [];
    duo.querySelectorAll("iframe").forEach(listen);
    for (const d of dupes) d.querySelectorAll("iframe").forEach(listen);
    for (const d of [duo, ...dupes]) d.style.setProperty("--rows", lay[0]);
    world = document.createElement("div"); world.className = "world"; world.append(duo, ...dupes);
    watch = new IntersectionObserver(es => es.forEach(e => {
      const f = e.target.querySelector("iframe"), s = byFrame.get(f); if (!s) return;
      s.want = e.isIntersecting;
      if (s.want && !f.hasAttribute("src") && f.dataset.src) { f.src = f.dataset.src; f.removeAttribute("data-src"); }
      playing(s, s.want);
    }), { root: shelf, threshold: [0] });
    /* 4-5 (docked only: the corner keeps 2) wait until the row is scrolled to them: loading="lazy" alone still loads a frame a few
       screens off (Chromium's lazy-load margin), so their src goes in when the frame first shows inside the box (Tony, Oct 29) */
    const later = [...duo.querySelectorAll("iframe[data-src]")];
    if (later.length && !v7()) {   // docked v7: the torus loads them (watch)
      const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting || e.intersectionRatio < 0.1) return; io.unobserve(e.target); const f = e.target.querySelector("iframe"); f.src = f.dataset.src; f.removeAttribute("data-src"); }), { threshold: [0.1] });
      later.forEach(f => io.observe(f.parentElement));   // a tenth in view: the few px of the 4th that peek past the 3rd are not a scroll
    }
    tab = document.createElement("button");
    Object.assign(tab, { type: "button", className: "rtab" }); tab.dataset.act = "open"; tab.setAttribute("aria-label", "Show video");
    const hd = document.createElement("div"); hd.className = "rot-hd";      // docked only (app.css): the column's label row
    hd.innerHTML = `<span class="xb-label" aria-hidden="true">${ico("i-chat")}<span>Explain</span></span><button type="button" class="rot-link"></button>`;
    link = hd.lastElementChild;
    /* the scroll cue (docked only, app.css .shelf): a fade over the edge that has more row behind it, the box's own colour; off at that end */
    shelf.innerHTML = '<span class="fade l" aria-hidden="true"></span><span class="fade r" aria-hidden="true"></span>';
    shelf.prepend(world);
    const ends = () => { const x = duo.scrollLeft, max = duo.scrollWidth - duo.clientWidth; shelf.classList.toggle("at-start", x <= 1); shelf.classList.toggle("at-end", x >= max - 1); };
    duo.addEventListener("scroll", ends, { passive: true }); addEventListener("resize", ends); new ResizeObserver(ends).observe(duo);
    ends();
    el.append(hd, shelf, tab);                               // all stay put: moving an iframe reloads it, so stashing only hides the duo
    order = VIDS.map((_, i) => i); cells(); torusInput();
    home();
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      const t = !b && v7() && docked() && e.target.closest(".vid");
      if (t) { bigger(t); return; }
      if (!b) { el.classList.add("show"); clearTimeout(showT); showT = setTimeout(() => el.classList.remove("show"), 3000); return; }
      if (b.dataset.act === "min") { stashed = userMin = true; place(); }
      else if (b.dataset.act === "open") { stashed = userMin = false; if (!docked()) picked = true; place(true); }   // asked for: shown even if every corner is busy
      else if (b.dataset.act === "x") { sess("stem-rot-off", "1"); sync(); }
    });
    el.addEventListener("keydown", e => {
      const t = (e.key === "Enter" || e.key === " ") && e.target.matches?.(".vid[role=button]") && e.target;
      if (t) { e.preventDefault(); bigger(t); }
    });
    el.addEventListener("pointerdown", e => {
      if (e.button > 0 || stashed || docked() || e.target.closest("button")) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    el.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true; el.classList.add("drag"); el.classList.remove("snap");
      el.style.transform = `translate(${e.clientX - drag.x0}px, ${e.clientY - drag.y0}px)`;
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag; drag = null; el.classList.remove("drag");
      if (!d.moved) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r");
      picked = true; store("stem-rot", corner); store("stem-rot-pick", "1"); place(true);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  /* v7 docked mosaic: the tapped small player takes the large slot (the .hero class + CSS order; the iframes never move, so nothing reloads) */
  function bigger(v) {
    const slot = order.indexOf(+v.dataset.k);
    if (slot < 1) return;
    [order[0], order[slot]] = [order[slot], order[0]];   // the two trade cells; every copy follows, no iframe moves
    cells(); tiles();
  }
  /* order[slot] = the tile in that cell (slot 0 = the large one); every copy of a tile reads the same order */
  function cells() {
    const lay = LAYOUT[VIDS.length] || LAYOUT[5];
    el.querySelectorAll(".vid[data-k]").forEach(v => {
      const slot = order.indexOf(+v.dataset.k), a = lay[1][slot];
      if (a) v.style.setProperty("--a", area(...a));
      v.classList.toggle("hero", slot === 0);
    });
  }
  /* the torus input (docked v7): the window is a 2 x 2 world of the mosaic (duo + three copies), moved by the offset mv.x / mv.y, wrapped to one block
     (W x H), so going past an edge shows the opposite one. Wheel and touch / pointer drag move it (rAF, transform only); a fling coasts unless reduced motion.
     The wheel is the one non-passive listener: it is the dock's own, and only while the pointer is over the dock (no page scroll there). */
  const mv = { x: 0, y: 0, vx: 0, vy: 0, raf: 0, coast: 0, drag: null, suppress: false };
  const wrap = (v, m) => m > 0 ? ((v % m) + m) % m : 0;
  function paint() {
    mv.raf = 0; const r = duo.getBoundingClientRect();
    world.style.transform = `translate3d(${-wrap(mv.x, r.width)}px, ${-wrap(mv.y, r.height)}px, 0)`;
  }
  function nudge(dx, dy) { mv.x += dx; mv.y += dy; if (!mv.raf) mv.raf = requestAnimationFrame(paint); }
  function stopCoast() { cancelAnimationFrame(mv.coast); mv.coast = 0; mv.vx = mv.vy = 0; }
  function coast() { mv.vx *= .92; mv.vy *= .92; nudge(mv.vx, mv.vy); mv.coast = Math.abs(mv.vx) + Math.abs(mv.vy) > .3 ? requestAnimationFrame(coast) : 0; }
  function torusInput() {
    shelf.addEventListener("wheel", e => {
      if (!torus()) return;
      e.preventDefault(); stopCoast();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      nudge(e.deltaX * k, e.deltaY * k);
    }, { passive: false });
    shelf.addEventListener("pointerdown", e => {
      mv.suppress = false;
      if (!torus() || e.button > 0) return;
      stopCoast(); mv.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    }, { passive: true });   // no capture yet: capturing at pointerdown retargets the click to the shelf, so a tap never reached the tile
    shelf.addEventListener("pointermove", e => {
      const d = mv.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true; try { shelf.setPointerCapture(e.pointerId); } catch { /* synthetic */ }   // a drag (not a tap) owns the pointer
      const ex = e.clientX - d.lx, ey = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY;
      nudge(-ex, -ey); mv.vx = .6 * mv.vx - .4 * ex; mv.vy = .6 * mv.vy - .4 * ey;
    }, { passive: true });
    const release = e => {
      const d = mv.drag; if (!d || (e && e.pointerId !== d.id)) return;
      mv.drag = null;
      if (!d.moved) return;
      mv.suppress = true;   // the tap that ends a drag is not a tap on a tile
      if (!RM.matches && Math.abs(mv.vx) + Math.abs(mv.vy) > 1) mv.coast = requestAnimationFrame(coast); else mv.vx = mv.vy = 0;
    };
    shelf.addEventListener("pointerup", release, { passive: true }); shelf.addEventListener("pointercancel", release, { passive: true });
    shelf.addEventListener("click", e => { if (mv.suppress) { mv.suppress = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  /* the small ones are buttons ("show this one big") only in the docked v7 mosaic; everywhere else they are plain frames */
  function tiles() {
    const on = v7() && !!el && el.classList.contains("docked") && !el.classList.contains("stashed");
    duo.querySelectorAll(".vid").forEach(v => {
      const small = on && !v.classList.contains("hero");
      if (small) { v.setAttribute("role", "button"); v.tabIndex = 0; v.setAttribute("aria-label", "Show big: " + v.querySelector("iframe").title); }
      else for (const a of ["role", "tabindex", "aria-label"]) v.removeAttribute(a);
    });
  }
  /* the band it may use: under the top of the page, above the bottom bar. lift = the gap kept under it (from the window's bottom) */
  function band(h) {
    const dock = document.getElementById("dock"), top = G + 8;
    const lift = (dock && dock.getClientRects().length && root.classList.contains("dock-bottom") ? innerHeight - dock.getBoundingClientRect().top : 0) + G;   // a hidden bar (a bank on a phone, app.css C8) takes no room
    return { top, floor: Math.max(top, innerHeight - lift - h), lift };
  }
  const live = () => [...document.querySelectorAll("#q .opt, #q .ff, #q .send, #mcGo, #padFab, #wish .wchip, .cl-cta, #cluckBtn, #rwHud, #orig .orig-sol, #orig .orig-peek")].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
  const covers = (x, y, w, h) => live().some(c => x < c.right + 4 && x + w > c.left - 4 && y < c.bottom + 4 && y + h > c.top - 4);
  function spot(c, w, h) {
    const b = band(h), right = c[1] === "r";
    return { c, x: right ? innerWidth - w - G : G, y: c[0] === "t" ? b.top : b.floor };
  }
  /* anchor it to corner c (inset ex from the side, top or lift from the bottom); slide in from where it was (FLIP) when animate */
  function pin(c, ex, top, lift, animate) {
    const was = el.getBoundingClientRect(), right = c[1] === "r", bottom = c[0] === "b";
    Object.assign(el.style, { left: right ? "auto" : ex + "px", right: right ? ex + "px" : "auto",
      top: bottom ? "auto" : top + "px", bottom: bottom ? lift + "px" : "auto", transform: "" });
    el.classList.remove("snap");
    if (!animate || RM.matches) return;
    const now = el.getBoundingClientRect();
    el.style.transform = `translate(${was.left - now.left}px, ${was.top - now.top}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add("snap"); el.style.transform = ""; }));
  }
  /* its parent: the notes column when side by side, else the page (the floating corner). Only a layout change moves it */
  function home() {
    const work = document.getElementById("work"), dock = docked() && !!work;
    if (dock && el.parentElement !== work) work.prepend(el);
    else if (!dock && el.parentElement !== document.body) document.body.append(el);
    const was = el.classList.contains("docked");
    el.classList.toggle("docked", dock);
    if (dock) { Object.assign(el.style, { left: "", right: "", top: "", bottom: "", transform: "" }); stashed = userMin; }
    else if (was) stashed = userMin || innerHeight < 700 || (PHONE.matches && v7());   // back to the floating corner's own rule (a short window: it would cover the page)
    watchPlay();
  }
  function place(animate) {
    if (!el) return;
    home();
    if (el.classList.contains("docked")) {
      el.classList.toggle("stashed", stashed);
      link.dataset.act = stashed ? "open" : "min"; link.setAttribute("aria-expanded", String(!stashed));
      link.textContent = (stashed ? "Show" : "Hide") + " curated brainrot";
      tiles();
      window.stemLayout?.();                                 // the notes under it re-fill now, before paint: the column keeps its height (W129 L4: no re-centred page)
      return;
    }
    el.classList.toggle("stashed", stashed); tiles();
    const b = band(96);
    if (stashed) {
      const right = corner[1] === "r";
      el.classList.toggle("r", right);                       // v7: the tab's slice of video mirrors to the right edge
      tab.classList.toggle("r", right); tab.innerHTML = ico(right ? "i-prev" : "i-next");
      pin("b" + corner[1], 0, b.top, b.lift, animate);
      return;
    }
    duo.style.setProperty("--w", width() + "px");
    const w = width(), h = duo.getBoundingClientRect().height || (w * 9 / 16) * 2 + 8;
    const order = picked ? [corner] : [corner, ...["bl", "br", "tl", "tr"].filter(c => c !== corner)];
    const ok = order.map(c => spot(c, w, h)).find(p => picked || !covers(p.x, p.y, w, h));
    if (!ok) { stashed = true; place(animate); return; }
    pin(ok.c, G, b.top, band(h).lift, animate);
  }
  /* show it only where it belongs: a sugar question with its layer, no pad page / keyboard / open code bar, not hidden this session */
  function sync() {
    const want = !!(window.stemBrainrotWanted && window.stemBrainrotWanted()) && !off()
      && !root.classList.contains("mt") && !root.classList.contains("swap") && !root.classList.contains("bar-open")
      && !root.classList.contains("dock-away")
      && !(root.classList.contains("dock-bottom") && document.querySelector("#q input:focus"));   // a software keyboard (app.js dockMQ: phone width or touch) only: on desktop the docked corner stays (W91, Tony Oct 26)
    if (want && !el) build();
    if (!el) return;
    const warm = !want && !!(window.stemBrainrotWarm && window.stemBrainrotWarm()) && !off();
    on = want;
    el.hidden = !want && !warm;                              // diet / hidden for the session: gone
    el.classList.toggle("parked", warm);                     // sugar, just not now (pad page, keyboard...): off screen, still buffering
    el.inert = warm; el.setAttribute("aria-hidden", String(warm));
    if (want) requestAnimationFrame(() => place(false));
  }
  /* sugar: build the players off screen as soon as the page is idle, so the first question doesn't wait for YouTube. The preconnects
     live here (not in index.html), so a slow link never opens a connection to YouTube */
  function warmUp() {
    if (el || !(window.stemBrainrotWarm && window.stemBrainrotWarm()) || off()) return;
    for (const href of ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://www.youtube.com"])
      document.head.append(Object.assign(document.createElement("link"), { rel: "preconnect", href }));
    build(); sync();
  }
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
  addEventListener("load", () => idle(warmUp, { timeout: 3000 }));
  /* app.js clPlace(): Cluck's sheet opened or shut; the players stay, the sheet takes the room under them (app.css #work.cl-on) */
  function sheet() { if (on) place(false); }
  /* Tony, Nov 3: "when Cluck starts to generate, collapse the brainrot": app.js calls it as a Cluck stream starts. Docked (desktop) only: it
     folds as the "Hide curated brainrot" link does (the student's own fold, so nothing opens it again but that link); the box below takes the column */
  function fold() { if (!el || !on || stashed || !el.classList.contains("docked")) return; stashed = userMin = true; place(); }
  window.stemBrainrot = { sync, warmUp, sheet, fold, cats: CATS };
  addEventListener("resize", () => { if (on) place(false); });
  PHONE.addEventListener("change", () => { if (window.stemBrainrot) sync(); });   // a window dragged across the phone width: hide it, or bring it in
  document.addEventListener("focusin", () => setTimeout(sync, 0));
  document.addEventListener("focusout", () => setTimeout(sync, 0));
})();
