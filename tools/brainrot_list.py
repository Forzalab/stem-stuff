"""Curated brainrots: read Tony's 3 YouTube playlists (RSS, newest 15 each) and rewrite the CATS block in brainrot.js.
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
    with open(TARGET, encoding="utf-8") as f:
        src = f.read()
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(rewrite(src, cats))


if __name__ == "__main__":
    main()
