"""Vercel entry: the stem-stuff API (serve.dispatch) as a WSGI app. vercel.json rewrites /p/, /state/, /repair/, /b/ and /check
(and /log/incident, /health) here with the original path in ?path=; static files come from public/ (tools/build_and_ship/build_public.py)."""
import os
import sys
from urllib.parse import parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "server"))
import serve  # noqa: E402

REASON = {200: "OK", 204: "No Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error",
          502: "Bad Gateway", 503: "Service Unavailable"}


def app(environ, start_response):
    serve.set_trace(environ.get("HTTP_TRACEPARENT"), environ.get("HTTP_X_VERCEL_ID"))   # the W3C trace id + Vercel request id: on every log line (serve.log)
    path = parse_qs(environ.get("QUERY_STRING", "")).get("path", [environ.get("PATH_INFO", "")])[0]
    try:
        n = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        n = 0
    body = environ["wsgi.input"].read(min(n, serve.POST_MAX + 1)) if n > 0 else b""
    stream = serve.STREAMS.get(path.split("?")[0]) if environ.get("REQUEST_METHOD") == "POST" else None
    staged = None if stream or environ.get("REQUEST_METHOD") != "POST" else serve.STAGED_POSTS.get(path.split("?")[0], lambda *a: None)(environ.get("HTTP_COOKIE", ""), body)
    if stream or staged:                                       # Cluck's streams: /explain, /chat; a proof Check that asked for stages
        status, headers, chunks = staged or stream(environ.get("HTTP_COOKIE", ""), body)
        start_response(f"{status} {REASON.get(status, '')}", list(headers.items()))
        return chunks                                          # an iterable: the runtime sends it as it comes (or all at once)
    res = serve.dispatch(environ.get("REQUEST_METHOD", "GET"), path, environ.get("HTTP_COOKIE", ""), body, environ.get("HTTP_USER_AGENT", ""))
    status, headers, data = res or serve._json(404, {"error": "not found"}, None)
    start_response(f"{status} {REASON.get(status, '')}", list(headers.items()) + [("Content-Length", str(len(data)))])
    return [data]
