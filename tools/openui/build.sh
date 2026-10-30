#!/usr/bin/env bash
# Vendor OpenUI Lang (render plan v2, Part A; sprint box P0.4): lang-core's parser, streaming parser and prompt generator,
# built from source into one zod-free ES module with no telemetry, plus the spec's conformance fixtures.
#   vendor/openui-lang.mjs            the bundle (exports: tools/openui/entry.ts), MIT notice in its first line
#   vendor/openui-lang.LICENSE.txt    upstream LICENSE, as is
#   tests/fixtures/openui/1.0/        spec/fixtures/1.0, as is (tests only; tools/build_public.py skips tests/)
#   tests/fixtures/openui/prompt.txt  the prompt the OFFICIAL npm build (real zod) prints for library.json (pins zod-shim.mjs)
# usage: tools/openui/build.sh <openui checkout at the pinned tag>
#   GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch @openuidev/lang-core@1.0.2 https://github.com/thesysdev/openui /tmp/openui
#   tools/openui/build.sh /tmp/openui
# Needs node + npx (esbuild and the npm package are fetched at the pinned versions). Same input, same bytes out.
# Patches (nothing else changes; the source is upstream's):
#   zod/v4, zod/v4/core -> tools/openui/zod-shim.mjs   (built-in function/step schemas are only read for prompt signatures)
#   src/telemetry/runtime.ts -> tools/openui/telemetry-stub.ts   (no PostHog calls; the npm postinstall is not shipped at all)
set -euo pipefail
VERSION=1.0.2                                         # @openuidev/lang-core, tag @openuidev/lang-core@1.0.2
COMMIT=f08a660535e55b5b2a24a0eb68568edaf9e4fe4b        # that tag's commit
ESBUILD=0.25.10
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
src="${1:?usage: tools/openui/build.sh <openui checkout>}"; src="$(cd "$src" && pwd)"
core="$src/packages/lang-core"

got="$(node -p "require('$core/package.json').version")"
[ "$got" = "$VERSION" ] || { echo "lang-core is $got, want $VERSION (check out tag @openuidev/lang-core@$VERSION)" >&2; exit 1; }
head="$(cat "$src/.git/HEAD" 2>/dev/null || true)"
[ -z "$head" ] || [ "$head" = "$COMMIT" ] || { echo "checkout is at $head, want $COMMIT" >&2; exit 1; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cp -r "$core/src" "$tmp/src"
rm -rf "$tmp/src/__tests__" "$tmp/src/parser/__tests__" "$tmp/src/postinstall.ts" "$tmp/src/telemetry/install.ts"
cp "$here/telemetry-stub.ts" "$tmp/src/telemetry/runtime.ts"
cp "$here/zod-shim.mjs" "$tmp/zod-shim.mjs"
cp "$here/entry.ts" "$tmp/src/entry.ts"
grep -rlE "from \"zod/v4(/core)?\"" "$tmp/src" | while read -r f; do
  sed -i -E "s#from \"zod/v4(/core)?\"#from \"$tmp/zod-shim.mjs\"#" "$f"
done

notice="/*! OpenUI Lang core $VERSION (github.com/thesysdev/openui @ ${COMMIT:0:7}, packages/lang-core), MIT License, Copyright (c) 2011-2024 Thesys Inc. Full text: vendor/openui-lang.LICENSE.txt. Zod-free, telemetry-free build: tools/openui/build.sh */"
(cd "$tmp" && npx --yes "esbuild@$ESBUILD" src/entry.ts --bundle --format=esm --minify --target=es2020 \
  --legal-comments=none --log-level=warning "--banner:js=$notice" --outfile=out.mjs)
# self-contained (no import of zod or anything else) and silent (no network, no env reads)
for bad in 'from"' 'import(' 'require(' posthog 'fetch(' 'sendBeacon' 'XMLHttpRequest' ci-info 'process.env'; do
  if grep -qF "$bad" "$tmp/out.mjs"; then echo "bundle still has '$bad'" >&2; exit 1; fi
done
cp "$tmp/out.mjs" "$repo/vendor/openui-lang.mjs"
cp "$src/LICENSE" "$repo/vendor/openui-lang.LICENSE.txt"
rm -rf "$repo/tests/fixtures/openui/1.0"; mkdir -p "$repo/tests/fixtures/openui"
cp -r "$src/spec/fixtures/1.0" "$repo/tests/fixtures/openui/1.0"
cp "$src/LICENSE" "$repo/tests/fixtures/openui/LICENSE"

# The golden prompt from the official package (real zod), never from this build: the test compares the two.
# --ignore-scripts: its postinstall is the install telemetry. zod goes in $tmp/node_modules, where dist/ resolves it.
(cd "$tmp" && npm pack --silent "@openuidev/lang-core@$VERSION" >/dev/null && mkdir pkg && tar xzf openuidev-lang-core-*.tgz -C pkg \
  && npm install --silent --no-save --ignore-scripts --no-package-lock --prefix "$tmp" zod@4 >/dev/null \
  && OPENUI_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs';
    const { generateSystemPrompt } = await import('$tmp/pkg/package/dist/index.mjs');
    const spec = JSON.parse(readFileSync('$repo/tests/fixtures/openui/1.0/library.json', 'utf8'));
    writeFileSync('$repo/tests/fixtures/openui/prompt.txt', generateSystemPrompt({ library: spec, promptOptions: { toolCalls: true, bindings: true } }));")
echo "vendor/openui-lang.mjs: $(wc -c <"$repo/vendor/openui-lang.mjs") bytes, $(gzip -9c "$repo/vendor/openui-lang.mjs" | wc -c) gzip"
