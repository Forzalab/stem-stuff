"""Vercel entry: the stem-stuff API (serve.dispatch) as a WSGI app. vercel.json rewrites /p/, /state/, /b/ and /check
here with the original path in ?path=; static files come from public/ (tools/build_public.py)."""
import os
import sys
from urllib.parse import parse_qs

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402

REASON = {200: "OK", 400: "Bad Request", 404: "Not Found", 429: "Too Many Requests", 503: "Service Unavailable"}


def app(environ, start_response):
    path = parse_qs(environ.get("QUERY_STRING", "")).get("path", [environ.get("PATH_INFO", "")])[0]
    try:
        n = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        n = 0
    body = environ["wsgi.input"].read(min(n, 4097)) if n > 0 else b""
    if environ.get("REQUEST_METHOD") == "POST" and path.split("?")[0] == "/explain":   # Cluck's stream (design/EASY.md Phase 4)
        status, headers, chunks = serve.explain(environ.get("HTTP_COOKIE", ""), body)
        start_response(f"{status} {REASON.get(status, '')}", list(headers.items()))
        return chunks                                          # an iterable: the runtime sends it as it comes (or all at once)
    res = serve.dispatch(environ.get("REQUEST_METHOD", "GET"), path, environ.get("HTTP_COOKIE", ""), body)
    status, headers, data = res or serve._json(404, {"error": "not found"}, None)
    start_response(f"{status} {REASON.get(status, '')}", list(headers.items()) + [("Content-Length", str(len(data)))])
    return [data]
