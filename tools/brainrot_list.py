"""Curated brainrots: read Tony's 3 YouTube playlists (RSS, newest 15 each), add the hand-curated STATIC categories, and rewrite the CATS block in brainrot.js.
Run by hand when a playlist changes; commit the result. No runtime fetch: sw.js caches brainrot.js, the list rides along.
A Short (feed link /shorts/<id>) is flagged 1: brainrot.js lets it fill its 9:16 frame instead of centre-cropping a landscape video.
usage: python3 tools/brainrot_list.py"""
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "brainrot.js")
PLAYLISTS = [("Parkour", "PLmSs-0cFIbfVWhkZx0i4UMiZdr2C0Z8w7"),          # Tony, Oct 5
             ("Brainrot", "PLGgy9JJbLirtf32CrMSCLiGcBqKAj0WRL"),
             ("Subway Surfers", "PLGspExVREA9D1_jjA77wSmxdzlw1E507h")]
# Hand-curated categories with no playlist (Tony, Oct 26, todo 78: "hydraulic press and soap squeezing/cutting videos"): written after the
# playlists on every run. Each id passed YouTube oEmbed (embeddable); title = oEmbed's, verbatim; short = 1 when oEmbed is taller than wide.
STATIC = [
    ("Hydraulic Press", [
        ["q9BtYEnrkg4", "Top 100 Best Hydraulic Press Moments | Satisfying Crushing Compilation", 0],
        ["eSvhnGdncP8", "Top 100 Best Hydraulic Press Moments VOL 3 | Satisfying Crushing Compilation", 0],
        ["Tbi09Ohrn2k", "Top 100 Best Hydraulic Press Moments VOL 4 | Satisfying Crushing Compilation", 0],
        ["grp9vjohWKc", "Top 100 Best Hydraulic Press Moments VOL 5 | Satisfying Crushing Compilation", 0],
        ["JUlL6vqdjms", "Top 100 Best Hydraulic Press Moments VOL 11 | Satisfying Crushing Compilation", 0],
        ["VahKXgW2nXc", "Ultimate ASMR Hydraulic Press Compilation 2024 EDITION: 1 HOUR of Relaxation", 0],
        ["O5waCW0aHZE", "Ultimate ASMR Hydraulic Press Compilation: 1 Hour of Pure Crushing Relaxation", 0],
        ["2jJznk-pRVk", "Best Satisfying Hydraulic Press Moments of 2023", 0],
        ["YNC8bJnwwxo", "Best Hydraulic Press Compilation: Satisfying Crushes & Surprising Results | REUPLOAD", 0],
        ["d9izfWJl0Jw", "TOP 30 STRONG OBJECTS CRUSHED BY 500 TON HYDRAULIC PRESS", 0],
        ["TnOaLbu3hy8", "TOP 20 STRONG OBJECTS CRUSHED BY 500 TON HYDRAULIC PRESS", 0],
        ["_Dqu5YtFiw4", "500 TON HYDRAULIC PRESS VS VERY HARD OBJECTS", 0],
    ]),
    ("Soap Cutting", [
        ["f63gAuLHnBo", "[ASMR]Compilation set★ASMR SOAP★Crushing soap★Cutting soap cubes★FOAM&GLITTER&STARCH★", 0],
        ["Njq04uncvrQ", "Compilation set★ASMR SOAP★Compilation set★Crushing soap★Cutting soap cubes★FOAM&GLITTER&STARCH★", 0],
        ["9eqvo0uqpTs", "Asmr soap with foam and glitter 💕✨ Crushing crunchy 💗 Cutting soap cubes 💕", 0],
        ["JZj2HF_UP0M", "Very Satisfying Videos. Dry soap cutting ASMR. Relaxing soap crushing. Soap ASMR no talking.", 0],
        ["04IQf9Jc5dQ", "200 soap cubes !!! 😱 long video 2 hours of cutting soap cubes🤤", 0],
        ["J9dvPQuHz-I", "1 Hour Satisfying Soap Crushing Videos - Relaxing Soap Cutting ASMR for Sleep", 0],
        ["N6rmyRCL64o", "ASMR Best Satisfying Soap Triggers for Sleep (No Talking)", 0],
        ["pEQJjCrVI8M", "Soap Carving ASMR ! Relaxing Sounds ! Satisfying ASMR Video | P96", 0],
        ["xUFcRa261kI", "Soap Carving ASMR | Satisfying ASMR Video | P151", 0],
        ["K6H6peOuMPA", "Soap Carving ASMR ! Relaxing Sounds ! Satisfying ASMR Video | P974", 0],
        ["orD6yIilR0A", "ASMR Soap carving", 0],
        ["6S28fH1qUNc", "Relaxing Soap Cutting ASMR. Satisfying Soap and lipstick cutting. Corte de jabón - 859", 0],
    ]),
]
FEED = "https://www.youtube.com/feeds/videos.xml?playlist_id="
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
BLOCK = re.compile(r"(/\* list:start[^\n]*\n).*?(\n *// list:end)", re.S)


def parse(xml):
    """feed XML -> [[id, title, short]]"""
    out = []
    for e in ET.fromstring(xml).findall("a:entry", NS):
        vid, title, link = e.findtext("yt:videoId", "", NS), e.findtext("a:title", "", NS), e.find("a:link", NS)
        if vid:
            out.append([vid, title.strip(), int("/shorts/" in (link.get("href", "") if link is not None else ""))])
    return out


def block(cats):
    """[(name, vids)] -> the JS lines between the markers"""
    rows = ",\n".join(f"    [{json.dumps(n)}, {json.dumps(v, ensure_ascii=False)}]" for n, v in cats)
    return f"  const CATS = [\n{rows},\n  ];"


def rewrite(src, cats):
    if not BLOCK.search(src):
        raise SystemExit("brainrot.js: list:start / list:end markers not found")
    return BLOCK.sub(lambda m: m.group(1) + block(cats) + m.group(2), src, count=1)


def main():
    cats = []
    for name, pid in PLAYLISTS:
        with urllib.request.urlopen(FEED + pid, timeout=20) as r:
            vids = parse(r.read())
        if not vids:
            raise SystemExit(f"{name}: empty feed")
        cats.append((name, vids))
        print(f"{name}: {len(vids)} videos, {sum(v[2] for v in vids)} shorts", file=sys.stderr)
    cats += STATIC                                                     # curated by hand, kept on every rerun
    with open(TARGET, encoding="utf-8") as f:
        src = f.read()
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(rewrite(src, cats))


if __name__ == "__main__":
    main()
