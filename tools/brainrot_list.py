"""Curated brainrots: read Tony's 8 YouTube playlists (RSS, newest 15 each) and rewrite the CATS block in brainrot.js.
A playlist with a FALLBACK list whose feed fails (HTTP error, timeout) or comes back empty gets that list instead; the run goes on.
Run by hand when a playlist changes; commit the result. No runtime fetch: sw.js caches brainrot.js, the list rides along.
A Short (feed link /shorts/<id>) is flagged 1: brainrot.js lets it fill its 9:16 frame instead of centre-cropping a landscape video.
A video YouTube won't play in an embed is dropped (todo 105: oEmbed 401 / 403 / 404); brainrot.js still swaps one that goes bad later.
usage: python3 tools/brainrot_list.py"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "brainrot.js")
PLAYLISTS = [("Parkour", "PLmSs-0cFIbfVWhkZx0i4UMiZdr2C0Z8w7"),          # Tony, Oct 5
             ("Brainrot", "PLGgy9JJbLirtf32CrMSCLiGcBqKAj0WRL"),
             ("Subway Surfers", "PLGspExVREA9D1_jjA77wSmxdzlw1E507h"),
             ("Hydraulic Press", "PLIBm3moPkDhaZrkZ-rxkirsphZ2Fnkw3V"),      # Tony, Oct 26
             ("Soap Cutting", "PLeQTxdXK8k64"),
             ("Kinetic Sand", "PLDH5HFJhX9kQ"),
             ("Pressure Washing", "PLy8J11EiVseMBG-Eq-U5cmnHUZE7EKLQ3"),
             ("Marble Run", "PL6NGwXalsxaT_UG5avTg98BsLWLaCBsPU")]
# Per-category FALLBACK (todo 78, Tony, Oct 26: "if playlist suddenly 404, choose a random link to put in"): hand-curated, used when that
# playlist's feed fails or is empty. Marble Run = marble runs + domino chains. Each id passed YouTube oEmbed (embeddable);
# title = oEmbed's, verbatim; short = 1 when oEmbed is taller than wide. The 3 Oct 5 playlists have none: an empty feed there still aborts.
FALLBACK = {
    "Hydraulic Press": [
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
    ],
    "Soap Cutting": [
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
    ],
    "Kinetic Sand": [
        ["3clqk2U3T9Y", "Very Satisfying and Relaxing Compilation 148 Kinetic Sand ASMR", 0],
        ["mjMW51EFNVw", "Very Satisfying Video Compilation 63 Kinetic Sand Cutting ASMR", 0],
        ["rF6awqlStl4", "Very Satisfying and Relaxing Compilation 275 Kinetic Sand ASMR", 0],
        ["8BYrvVeejzg", "Very Satisfying and Relaxing Compilation 109 Kinetic Sand ASMR", 0],
        ["rI7lhVuWPuU", "Crunchy Kinetic Sand Cutting Video Compilation ASMR", 0],
        ["4iBqx-LrG7I", "The Most Satisfying Kinetic Sand ASMR Ever", 0],
        ["C6Nsmyi0hmk", "Very Satisfying and Relaxing Compilation 302 Kinetic Sand ASMR", 0],
        ["C_PWdv5Bluw", "Very Satisfying and Relaxing Compilation 298 Kinetic Sand ASMR", 0],
        ["WEzBCiP6jLg", "Very Satisfying CRUNCHY Compilation Kinetic Sand ASMR", 0],
        ["etp46Aca_UM", "*1 HOUR* All of Very Satisfying ASMR Videos - Kinetic Sand Cutting ASMR Compilation", 0],
        ["T87KwRk9IvE", "1 Hour Kinetic Sand ASMR! Satisfying Sand ASMR Cutting! Relaxing Kinetic Sand ASMR #13", 0],
        ["USRtMtLHkfY", "3 Hour Kinetic Sand ASMR Marathon | No Talking, Just Satisfaction", 0],
    ],
    "Pressure Washing": [
        ["oTWeDOhm4_c", "Extremely Satisfying Pressure Washing ▶ 1", 0],
        ["iJaw4nP2VS0", "Extremely Satisfying Pressure Washing ▶ 2", 0],
        ["vX--cenq70I", "INGENIOUS & Oddly Satisfying Pressure Washing  Videos #74", 0],
        ["MuubW9KBNw8", "Oddly Satisfying Pressure Washing  Videos #2", 0],
        ["j0vh9e_wPMI", "Oddly Satisfying Pressure Washing  Videos #3", 0],
        ["pAQ9bAoUkZg", "7 Hours Oddly Satisfying Pressure Washing To Get You Out Of Any Event", 0],
        ["sZ8T9sQcQ4Q", "Best Pressure/Power Washing Video Compilation Ever! [1080p HD]", 0],
        ["fnjOmFVavxc", "Worst Patio Ever! Extreme ASMR Pressure Washing, #satisfying, #asmr, #pressurewashing, #viral,", 0],
        ["Z8LSeCgzFmU", "Super Muddy Pressure Washing Compilation Vol 1 | The Most Satisfying Video You'll Ever Watch!", 0],
        ["plSsCNEmRmA", "Pressure washing in real time - Satisfying pressure washing ASMR to help you relax and sleep!", 0],
        ["rKMojw8tdds", "Pressure Washing 15 Years Of NEGLECT... Real Speed Pure ASMR No Talking", 0],
        ["ni-hoolFhKo", "ASMR Pressure Washing 💦 Relaxing Power Wash Sounds (No Talking) Can I save this Expensive driveway?🤔", 0],
    ],
    "Marble Run": [
        ["_y-G5YM6paE", "Magic Marble Run Compilation", 0],
        ["E1NyZ5PtnAk", "Marble Run Race ASMR 1000 Marbles Rain Gutter VS Mega Whirlpool ASMR Amakandu 1H", 0],
        ["Z6GnsxR7c18", "Marble run race ASMR ☆ Summary video of over 10 types of marble runs.Compilation Long video!", 0],
        ["BIybpXKovDA", "Marble Run ASMR ☆ Colorful Marble Race　22 piece winding course", 0],
        ["QkGjmDTqSzE", "Marble Run Race ☆ HABA Slope + Cuboro + Bornelund Quadrilla + Transparent pipe", 0],
        ["tbxZd-Ea43I", "The World's Largest marble run race", 0],
        ["dRYav_fwBW4", "Non-Stop Wooden Marble Run! Endless Chain Reaction ASMR ♾️ Compilation", 0],
        ["VMrg-cvhXto", "250,000 DOMINOES - Most Relaxing/Satisfying Domino Falldown Compilation (No Music)", 0],
        ["MK1VPyx0gXg", "1 HOUR of the Most Satisfying Domino Falldowns [No Music]", 0],
        ["NlHAW1YTWiM", "75,000 Dominoes Falling to Relax Your Mind (ODDLY SATISFYING)", 0],
        ["nTLQluEp1Nw", "Satisfying Domino & Marble Tricks! (Relaxing Compilation)", 0],
        ["i-Oqf-f8FjU", "The World's Largest marble run race compilation video", 0],
    ],
}
FEED = "https://www.youtube.com/feeds/videos.xml?playlist_id="
OEMBED = "https://www.youtube.com/oembed?format=json&url=https%3A//www.youtube.com/watch%3Fv%3D"
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


def embeddable(name, vids):
    """drop what oEmbed says can't be embedded: 401 / 403 = embedding off (or private), 404 = gone. Any other failure can't tell: kept"""
    out = []
    for v in vids:
        try:
            with urllib.request.urlopen(OEMBED + v[0], timeout=20):
                pass
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                print(f"{name}: dropped {v[0]} (oEmbed {e.code})", file=sys.stderr)
                continue
        except OSError:
            pass
        out.append(v)
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
        try:
            with urllib.request.urlopen(FEED + pid, timeout=20) as r:
                vids = parse(r.read())
        except (OSError, ET.ParseError):                                   # HTTPError / URLError / timeout are OSErrors
            if name not in FALLBACK:
                raise
            vids = []
        vids = embeddable(name, vids)
        if not vids:
            if name not in FALLBACK:
                raise SystemExit(f"{name}: empty feed")
            print(f"{name}: feed failed, using fallback", file=sys.stderr)
            vids = embeddable(name, FALLBACK[name])
            if not vids:
                raise SystemExit(f"{name}: no embeddable video, fallback included")
        cats.append((name, vids))
        print(f"{name}: {len(vids)} videos, {sum(v[2] for v in vids)} shorts", file=sys.stderr)
    with open(TARGET, encoding="utf-8") as f:
        src = f.read()
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(rewrite(src, cats))


if __name__ == "__main__":
    main()
