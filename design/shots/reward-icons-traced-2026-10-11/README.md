# Reward icons: traced SVGs replace five Fluent icons (2026-10-11)

> **Licence caveat.** The five new icons are traced from owner-supplied reference art (via image-model isolation).
> The licence of the source art is UNKNOWN. **Do not ship to production until cleared.** See `rewards/icons/NOTICE-traced.txt`.

Same filenames in `rewards/icons/`, so no code changed; `rewards/icons.js` was regenerated with `python3 tools/rw_icons.py`.
The duck, fire and trophy icons are unchanged and are still Microsoft Fluent Emoji (MIT, `rewards/icons/LICENSE-fluentui-emoji.txt`).

## Mapping

| icon (file) | used for | new source part | result |
|---|---|---|---|
| `coin_color.svg` | HUD coin window, common slot tier, coinFly | `06-gold-coin-icon` (gold coin with a star) | traced |
| `gem_stone_color.svg` | rare slot tier | `04-sym-diamond` (blue cut diamond) | traced |
| `star_color.svg` | HUD level star, level popover, reel filler | `01-gold-star` | traced |
| `glowing_star_color.svg` | drop-banner (toast) icon, reel filler | `01-gold-star` (the traced star, scaled to 76%) + vector glow + 5 rays | traced + hand-made glow |
| `cherries_color.svg` | reel filler | `04-sym-cherry` | traced |
| `duck_color.svg` | legendary tier | (none) | **unchanged Fluent**: the mascot belongs to the official duck set |
| `fire_color.svg` | HUD streak flame | (none) | **unchanged Fluent**: no fire part was supplied |
| `trophy_color.svg` | reel filler | (none) | **unchanged Fluent**: the crown is not a trophy |

Choices and parts I did not use:
- `02-coin` and `06-money-reward-coin-2` are kind `money` in the manifest, so they were skipped.
- `06-blue-gem-icon` was tried first for the gem. Its smooth gradients quantise into blotches ("camo") at 4 to 8 colours,
  and with a pre-blur it loses its facets and reads as a blue shield. `04-sym-diamond` (also a blue gem) has hard-edged facets
  that survive flattening, and its cyan reads better on the dark UI, so it is the gem.
- `05-gold-star` has a ribbon behind it; `01-gold-star` is the clean one. `05-silver-star`, `01-gold-crown`, `05-lightning-bolt`,
  `05-heart` and `04-sym-clover` have no matching icon slot.

## How the traces were made

vtracer 0.6.15 (`pip install vtracer`), Python API `vtracer.convert_raw_image_to_svg`. Per part:

1. crop the PNG to its alpha bounding box (alpha > 24), pad to a square (4% margin), resize to 96 x 96 (Lanczos);
2. optional Gaussian pre-blur (0.5 to 0.7 px) so the gradient banding does not turn into speckle;
3. quantise the opaque pixels to k colours (PIL median cut, no dither), hard alpha at 128. This merges near-identical shades;
4. vtracer: `colormode="color", hierarchical="stacked", mode="spline", color_precision=6, layer_difference=24,
   length_threshold=4, max_iterations=10, splice_threshold=45, path_precision=1`, plus per icon:

| icon | k colours | filter_speckle | pre-blur | corner_threshold |
|---|---|---|---|---|
| coin | 7 | 8 | 0.7 | 60 |
| gem_stone (diamond) | 8 | 10 | 0.6 | 40 |
| star | 8 | 8 | 0.6 | 60 |
| cherries | 8 | 6 | 0.5 | 60 |

5. rewrite every path into a `viewBox="0 0 32 32"` artboard (width/height 32, like the Fluent files), 2-decimal coordinates,
   one `<path fill d>` per shape. There is no raster, no `<image>`, no script and no external reference. The only `url()` is
   the glowing star's own radial gradient (`#g`), which stays local because each icon is a separate data URI.
6. glowing_star: the traced star scaled to 76% around the centre, behind it a radial gradient glow (#FFE27A to transparent)
   and 5 diamond rays (#FFD23F, 0.5 stroke #E08A00) between the star's points. All vector, no SVG filters.

I tried 96/112/128 px working sizes, k = 5 to 10 and pre-blur 0 to 1.5. 128 px with k = 10 was 15 to 20 KB per icon and
noisy at 16 px. Going below k = 7 (6 for the coin) flattened the coin's rim and turned the diamond's facets into a "fanged" shape.

## Sizes

| icon | old Fluent | new traced | paths |
|---|---|---|---|
| coin_color.svg | 11,772 B | **6,643 B** | 11 |
| gem_stone_color.svg | 4,669 B | **8,687 B** | 16 |
| star_color.svg | 7,684 B | **5,494 B** | 9 |
| glowing_star_color.svg | 12,111 B | **6,136 B** | 9 + glow + rays |
| cherries_color.svg | 7,581 B | **5,115 B** | 9 |

All are under the 12 KB target. `rewards/icons.js` went from 118,443 B to 102,910 B.

## Evidence

- `icons-compare.png`: each icon, old Fluent row then new traced row, at 16/24/32/64 CSS px on #0a1322 and on white, at 2x device pixels.
  `icons-compare-1x.png`: the same at 1x device pixels (worst case).
- Live, Chromium, 393 x 852 CSS px, DPR 2, served by `serve.py` with a throwaway review bank (`BANK_RVW`), `before-*` = origin/main, `after-*` = this branch:
  - `*-00b-natural-reward.png`: a real correct answer (2.02 on PHYS_RVC), with the natural slot roll and confetti
  - `*-01-hud.png`: the HUD (coin window, level star with its number, streak flame)
  - `*-02-toast.png`: the drop banner, `FX.toast('RARE DROP', ...)`
  - `*-03-coinfly.png`: `FX.coinFly(#ans, #rwCoin, 6)` mid-flight
  - `*-04-slots-spinning.png`: `FX.slots('rare')` while spinning (filler icons blurred on the reels)
  - `*-05-slots-{common,rare,legend}.png`: each tier landed (`FX.slots(tier)` under reduced motion, which lands at once)
- `tests.log`: the full `bash tests/run-all.sh` with the sympy venv first on PATH, ending in `RUN_RC=`.

## What reads well and what doesn't

- **coin**: reads as a gold coin at every size. At 16 px the star inside is a hint, much like the old bank-building glyph.
- **star**: crisp at every size. In the HUD the level number on top of it stays legible.
- **cherries**: reads as cherries at 16 px. The pair sits lower and the leaf is bigger than in Fluent, so the fruit is a bit smaller.
- **gem_stone**: reads as a cut diamond from 16 px up. At reel size (60 px) the dark facets in the lower half look busier
  than the flat Fluent gem, a little like teeth. A hand-cleaned facet layer would fix that; tracing alone can't.
- **glowing_star**: different from `star` at every size because of the rays. On the yellow drop banner the glow vanishes
  into the yellow and only the star and rays show, so it is a bit smaller there than the old icon.
- The traces are flat colour, so they look flatter than the gradient-shaded Fluent icons next to them (duck, flame, trophy).
