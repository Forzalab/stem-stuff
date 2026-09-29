#!/usr/bin/env python3
"""Build stem-stuff.html: index.html with its local css/js and KaTeX (fonts as data URIs)
inlined, so it opens from disk (file://). Problems are NOT included (the page asks for
p/<CODE>.json files via the file picker). See OFFLINE.md.

usage: python3 tools/bundle.py [out]      (default: <repo>/stem-stuff.html)
KaTeX: vendor/katex/ as index.html links it (a CDN KaTeX URL also works: local copy if versions match, else downloaded)."""
import base64
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KATEX_LOCAL = os.path.join(ROOT, "tests", "node_modules", "katex")
KATEX_CDN = re.compile(r"^https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/([\d.]+)/(katex(?:\.min)?\.(?:css|js))$")
_cache = {}


def get(url):
    """Bytes for a KaTeX CDN url (local copy if the version matches) or a local path."""
    if url in _cache:
        return _cache[url]
    m = KATEX_CDN.match(url) or re.match(r"^https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/([\d.]+)/(fonts/[\w-]+\.woff2)$", url)
    data = None
    if m:
        try:
            ver = json.load(open(os.path.join(KATEX_LOCAL, "package.json")))["version"]
            if ver == m.group(1):
                data = open(os.path.join(KATEX_LOCAL, "dist", m.group(2)), "rb").read()
        except OSError:
            pass
        if data is None:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read()
    else:
        path = os.path.normpath(os.path.join(ROOT, url.split("?")[0]))
        if not path.startswith(ROOT + os.sep):
            raise ValueError("outside repo: " + url)
        data = open(path, "rb").read()
    _cache[url] = data
    return data


def inline_fonts(url):
    """CSS text with @font-face woff2 files as data URIs (woff/ttf fallbacks dropped)."""
    css = get(url).decode().replace("</style", "<\\/style")
    base = url.rsplit("/", 1)[0] + "/" if "/" in url else ""

    def face(m):
        block = m.group(0)
        w2 = re.search(r"url\(['\"]?([\w./-]+\.woff2)['\"]?\)", block)
        if not w2:
            return block
        b64 = base64.b64encode(get(base + w2.group(1))).decode()
        return re.sub(r"src:[^;}]+", 'src:url(data:font/woff2;base64,%s) format("woff2")' % b64, block)

    return re.sub(r"@font-face\{[^}]*\}", face, css)


def module_text(src, seen=()):
    """Module source with relative imports rewritten to data: URLs (file:// can't load module files)."""
    if src in seen:
        raise ValueError("import cycle at " + src)
    js = get(src).decode()
    base = src.rsplit("/", 1)[0] + "/" if "/" in src else ""

    def imp(m):
        spec = m.group(2)
        if not spec.startswith("."):
            return m.group(0)
        dep = os.path.normpath(base + spec).replace(os.sep, "/")
        uri = "data:text/javascript;base64," + base64.b64encode(module_text(dep, seen + (src,)).encode()).decode()
        return m.group(1) + uri + m.group(3)

    return re.sub(r"""(\b(?:from|import)\s*["'])([^"']+)(["'])""", imp, js)


def script_text(js):
    return js.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def build(out=None):
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    deferred = []

    def css_link(m):
        tag = m.group(0)
        href = re.search(r'href\s*=\s*"([^"]+)"', tag).group(1)
        if KATEX_CDN.match(href) or not re.match(r"^(https?:)?//|^data:", href):
            return "<style>%s</style>" % inline_fonts(href)
        if re.match(r"^(https?:)?//|^data:", href):
            return tag  # web fonts etc: used when online, system fallback when not
        return tag

    def script(m):
        tag, src = m.group(0), m.group(2)
        if not KATEX_CDN.match(src) and re.match(r"^(https?:)?//", src):
            return tag
        attrs = m.group(1) + m.group(3)
        if re.search(r'type\s*=\s*"module"', attrs):
            return '<script type="module">%s</script>' % script_text(module_text(src))
        body = script_text(get(src).decode())
        if re.search(r"\b(defer|async)\b", attrs):
            deferred.append("<script>%s</script>" % body)  # defer = run after parse: move to end, keep order
            return ""
        return "<script>%s</script>" % body

    html = re.sub(r'<link\b[^>]*rel\s*=\s*"stylesheet"[^>]*>', css_link, html)
    html = re.sub(r'<script\b([^>]*?)\bsrc\s*=\s*"([^"]+)"([^>]*)>\s*</script>', script, html)
    html = re.sub(r'<link\b[^>]*rel\s*=\s*"(?:manifest|modulepreload|preload)"[^>]*>\n?', "", html)
    html = html.replace("<head>", '<head>\n<meta name="stem-bundle" content="1">', 1)
    html = html.replace("</body>", "\n".join(deferred) + "\n</body>", 1) if "</body>" in html else html + "\n".join(deferred)
    out = out or os.path.join(ROOT, "stem-stuff.html")
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    os.replace(tmp, out)
    return out


if __name__ == "__main__":
    p = build(sys.argv[1] if len(sys.argv) > 1 else None)
    print(p, os.path.getsize(p), "bytes")
