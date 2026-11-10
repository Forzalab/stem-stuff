#!/bin/bash
# Rebuild the traced reward icons from the isolated parts (scratch), into ./final.
# Trace (vtracer) -> recolour onto the gift family ramps sampled from the refs (pal.json) -> glowing star from the gold star.
set -e
cd "$(dirname "$0")"
P=../r5/FX/parts
mkdir -p old final raw
cp -n /home/user/stem-stuff/.claude/worktrees/agent-adad7c41f8a250d02/rewards/icons/*_color.svg old/ 2>/dev/null || true
python3 pal.py $P > pal.json
python3 trace.py $P/06-gold-coin-icon.png raw/coin.svg     --px 96 --k 7 --speckle 8  --blur 0.7
python3 trace.py $P/04-sym-diamond.png    raw/gem.svg      --px 96 --k 8 --speckle 10 --blur 0.6 --corner 40
python3 trace.py $P/01-gold-star.png      raw/star.svg     --px 96 --k 8 --speckle 8  --blur 0.6
python3 trace.py $P/04-sym-cherry.png     raw/cherries.svg --px 96 --k 8 --speckle 6  --blur 0.5
python3 recolor.py raw/coin.svg final/coin_color.svg      gold
python3 recolor.py raw/gem.svg  final/gem_stone_color.svg blue
python3 recolor.py raw/star.svg final/star_color.svg      gold
cp raw/cherries.svg final/cherries_color.svg
python3 glow.py final/star_color.svg final/glowing_star_color.svg 0.76
echo "forbidden-content scan (expect nothing):"
grep -lE '<image|<script|href=|https?://[^w]' final/*.svg || true
ls -l final
