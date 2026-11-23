/* auto-skeleton core 0.1.1 (src/core/*.ts), MIT, (c) 2026 Midhun. https://github.com/theengineeringmind/auto-skeleton @ 419cfadee711d3c235fcaafce2fcc28d295201c3 (2026-09-13).
   Vendored as plain JS: the TypeScript core compiled with tsc (target es2020) and joined into one IIFE by hand, nothing else changed. License: auto-skeleton.LICENSE.txt.
   BUILD-TIME ONLY: tools/build_and_ship/splash_skeleton.mjs injects it into a Playwright page to measure() the real page and renderSkeleton() the launch splash markup.
   It is not loaded by index.html and adds no window name. Do not edit; to update, re-vendor at a new pinned sha. */
var AutoSkeleton=(function(){
// types


// geometry
/** Round to two decimals so layouts serialize cleanly and compare stably. */
function round(n) {
    return Math.round(n * 100) / 100;
}
/** Convert a viewport-relative DOMRect into coordinates relative to `origin`. */
function toRelative(rect, origin) {
    return {
        x: round(rect.left - origin.left),
        y: round(rect.top - origin.top),
        width: round(rect.width),
        height: round(rect.height),
    };
}
/** Shrink a rect vertically around its centre. */
function scaleHeight(rect, scale) {
    const height = round(rect.height * scale);
    return { ...rect, y: round(rect.y + (rect.height - height) / 2), height };
}
/** True when the two rects share at least half of the smaller one's vertical span. */
function sameLine(a, b) {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    const overlap = bottom - top;
    if (overlap <= 0)
        return false;
    return overlap >= Math.min(a.height, b.height) * 0.5;
}
/** Bounding box of two rects. */
function union(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, width: round(right - x), height: round(bottom - y) };
}
/**
 * Merge text fragments that sit on the same line and are horizontally close
 * into a single bar. Fragments are first grouped by vertical overlap, then
 * merged left to right when the gap between them is at most `gap`.
 */
function mergeLineRects(rects, gap) {
    if (rects.length === 0)
        return [];
    const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
    // Group into lines by vertical overlap with the running union of the line.
    const lines = [];
    let current = [];
    let currentBox = null;
    for (const r of sorted) {
        if (currentBox && sameLine(currentBox, r)) {
            current.push(r);
            currentBox = union(currentBox, r);
        }
        else {
            if (current.length)
                lines.push(current);
            current = [r];
            currentBox = r;
        }
    }
    if (current.length)
        lines.push(current);
    const out = [];
    for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        let acc = line[0];
        for (let i = 1; i < line.length; i++) {
            const next = line[i];
            const distance = next.x - (acc.x + acc.width);
            if (distance <= gap) {
                acc = union(acc, next);
            }
            else {
                out.push(acc);
                acc = next;
            }
        }
        out.push(acc);
    }
    return out;
}
/** Drop rects that are too small to matter or that fall entirely outside the bounds. */
function isVisible(rect, bounds, minSize) {
    if (rect.width < minSize || rect.height < minSize)
        return false;
    if (rect.x + rect.width <= 0 || rect.y + rect.height <= 0)
        return false;
    if (rect.x >= bounds.width || rect.y >= bounds.height)
        return false;
    return true;
}

// styles
const STYLE_ID = 'auto-skeleton-styles';
/**
 * The default stylesheet. Exported so apps with a strict CSP can ship it in
 * their own CSS and pass `injectStyles: false`.
 *
 * Customise with CSS variables on any ancestor, or per instance through
 * the `color`, `highlight`, `duration` and `fade` options:
 * - `--auto-skeleton-color`      base block colour
 * - `--auto-skeleton-highlight`  shimmer highlight colour
 * - `--auto-skeleton-duration`   one shimmer sweep
 * - `--auto-skeleton-fade`       fade-out duration when content arrives
 *
 * The shimmer is a single `transform` animation per block pseudo-element,
 * offset so every block shows the same sweep. Transforms run on the
 * compositor, so an animating skeleton causes no style or layout work on
 * the main thread.
 */
const autoskeletonCSS = `
.auto-skeleton {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  contain: layout style paint;
  --_c: var(--auto-skeleton-color, rgba(128, 128, 128, 0.18));
  --_h: var(--auto-skeleton-highlight, rgba(128, 128, 128, 0.34));
}
.auto-skeleton__block {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--_c);
}
.auto-skeleton[data-animate="true"] .auto-skeleton__block::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--_x) * -1);
  width: var(--auto-skeleton-w);
  background: linear-gradient(90deg, transparent 0%, var(--_h) 50%, transparent 100%);
  transform: translateX(-100%);
  animation: auto-skeleton-sweep var(--auto-skeleton-duration, 1.6s) linear infinite;
}
@keyframes auto-skeleton-sweep {
  to { transform: translateX(100%); }
}
.auto-skeleton--fading {
  opacity: 0;
  transition: opacity var(--auto-skeleton-fade, 200ms) ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .auto-skeleton[data-animate="true"] .auto-skeleton__block::after { animation: none; content: none; }
}
`.trim();
/**
 * Insert the stylesheet into `doc` once. Safe to call repeatedly and from
 * multiple bundles: the tag is looked up by id. Returns the style element.
 */
function ensureStyles(doc = document, nonce) {
    const existing = doc.getElementById(STYLE_ID);
    if (existing instanceof HTMLStyleElement)
        return existing;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    if (nonce)
        style.setAttribute('nonce', nonce);
    style.textContent = autoskeletonCSS;
    (doc.head ?? doc.documentElement).appendChild(style);
    return style;
}

// classify
const MEDIA = new Set(['img', 'svg', 'video', 'canvas', 'picture', 'iframe', 'object', 'embed', 'audio']);
const CONTROL = new Set(['input', 'textarea', 'select', 'button', 'progress', 'meter']);
const IGNORED = new Set([
    'script',
    'style',
    'template',
    'noscript',
    'br',
    'wbr',
    'head',
    'meta',
    'link',
    'title',
]);
const BLOCK_ROLES = new Set(['img', 'progressbar', 'slider', 'switch', 'checkbox', 'radio']);
const DATA_ATTRIBUTE = 'data-auto-skeleton';
function isTransparent(color) {
    if (!color || color === 'transparent')
        return true;
    const match = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!match)
        return false;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length === 4 && Number.parseFloat(parts[3]) === 0;
}
function hasVisibleBorder(style) {
    const widths = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
    ];
    return widths.some((w) => Number.parseFloat(w) > 0) && style.borderTopStyle !== 'none';
}
function isEmptyLeaf(element) {
    if (element.childElementCount > 0)
        return false;
    return !(element.textContent ?? '').trim();
}
function kindOf(element) {
    const tag = element.localName;
    if (MEDIA.has(tag) || element.getAttribute('role') === 'img')
        return 'media';
    if (CONTROL.has(tag))
        return 'control';
    return 'box';
}
function classify(element, window, options, context = {}) {
    const custom = options.classify?.(element);
    if (custom)
        return custom;
    const attr = element.getAttribute(DATA_ATTRIBUTE);
    if (attr === 'skip' || attr === 'block' || attr === 'descend')
        return attr;
    const tag = element.localName;
    if (IGNORED.has(tag))
        return 'skip';
    const style = window.getComputedStyle(element);
    if (style.display === 'none')
        return 'skip';
    if (!context.root) {
        const hidden = style.visibility === 'hidden' || style.visibility === 'collapse';
        if (hidden && style.visibility !== context.parentVisibility)
            return 'skip';
        if (Number.parseFloat(style.opacity) === 0)
            return 'skip';
    }
    if (MEDIA.has(tag) || CONTROL.has(tag))
        return 'block';
    const role = element.getAttribute('role');
    if (role && BLOCK_ROLES.has(role))
        return 'block';
    const decorated = style.backgroundImage !== 'none' || !isTransparent(style.backgroundColor) || hasVisibleBorder(style);
    if (decorated) {
        // A decorated element with nothing inside is pure visual (a CSS-only
        // image, gradient, divider or placeholder) and is painted whole.
        if (isEmptyLeaf(element))
            return 'block';
        // A decorated element no taller than a line or two with only text inside
        // is a chip, badge, tag or pill: one shape, not a text bar.
        const rect = element.getBoundingClientRect();
        if (rect.height <= options.maxBackgroundBlock) {
            if (rect.width <= options.maxBackgroundBlock)
                return 'block';
            if (rect.width <= options.maxBackgroundBlock * 4 && element.childElementCount === 0)
                return 'block';
        }
    }
    return 'descend';
}
/** Read the element's border radius as a single CSS shorthand value. */
function radiusOf(style) {
    const norm = (value) => (!value || value === '0' ? '0px' : value);
    const tl = norm(style.borderTopLeftRadius);
    const tr = norm(style.borderTopRightRadius);
    const br = norm(style.borderBottomRightRadius);
    const bl = norm(style.borderBottomLeftRadius);
    if (tl === tr && tr === br && br === bl)
        return tl;
    return `${tl} ${tr} ${br} ${bl}`;
}

// cache
/**
 * A small LRU cache for layouts. Keyed by whatever the caller chooses;
 * `layoutCacheKey` builds a key from a name and a container width, which is
 * what determines a layout in practice.
 */
class LayoutCache {
    constructor(max = 100) {
        this.max = max;
        this.map = new Map();
        if (!(Number.isInteger(max) && max > 0))
            throw new RangeError('auto-skeleton: cache size must be a positive integer');
    }
    get size() {
        return this.map.size;
    }
    has(key) {
        return this.map.has(key);
    }
    get(key) {
        const value = this.map.get(key);
        if (value === undefined)
            return undefined;
        // Refresh recency.
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }
    set(key, layout) {
        if (this.map.has(key))
            this.map.delete(key);
        this.map.set(key, layout);
        if (this.map.size > this.max) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined)
                this.map.delete(oldest);
        }
    }
    /**
     * The most recently stored layout whose key was built with
     * `layoutCacheKey(name, …)`, regardless of width. Lets a wrapper paint
     * something plausible on the very first frame and only re-measure when
     * the width turns out to differ.
     */
    latest(name) {
        const prefix = `${name}@`;
        let found;
        for (const [key, value] of this.map)
            if (key.startsWith(prefix))
                found = value;
        return found;
    }
    delete(key) {
        return this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
}
function layoutCacheKey(name, width) {
    return `${name}@${Math.round(width)}`;
}
/** Shared default cache used by framework wrappers when no cache is supplied. */
const defaultLayoutCache = new LayoutCache();

// measure


const DEFAULT_MEASURE_OPTIONS = {
    textScale: 0.7,
    minSize: 2,
    maxBackgroundBlock: 64,
    mergeGap: 4,
    textRadius: '4px',
    maxBlocks: 400,
    classify: undefined,
};
function resolveMeasureOptions(options = {}) {
    const resolved = { ...DEFAULT_MEASURE_OPTIONS };
    for (const key of Object.keys(options)) {
        const value = options[key];
        if (value !== undefined)
            resolved[key] = value;
    }
    if (!(resolved.textScale > 0 && resolved.textScale <= 1)) {
        throw new RangeError(`auto-skeleton: textScale must be in (0, 1], got ${String(options.textScale)}`);
    }
    if (!(Number.isInteger(resolved.maxBlocks) && resolved.maxBlocks > 0)) {
        throw new RangeError(`auto-skeleton: maxBlocks must be a positive integer, got ${String(options.maxBlocks)}`);
    }
    return resolved;
}
/**
 * Measure a rendered DOM subtree and describe it as a list of skeleton blocks.
 *
 * The root must be attached to a document and laid out (it may be
 * `visibility: hidden`, but not `display: none`). Coordinates in the result
 * are relative to the root's border box.
 */
function measure(root, options) {
    const opts = resolveMeasureOptions(options);
    const win = root.ownerDocument.defaultView;
    if (!win)
        throw new Error('auto-skeleton: root element is not attached to a window');
    const rootRect = root.getBoundingClientRect();
    const origin = { left: rootRect.left, top: rootRect.top };
    const bounds = { width: rootRect.width, height: rootRect.height };
    const blocks = [];
    const textRects = [];
    // Text rects are an upper bound on text bars (merging only reduces them),
    // so this is a conservative early-exit budget.
    const full = () => blocks.length + textRects.length >= opts.maxBlocks;
    const pushBlock = (element) => {
        const rect = toRelative(element.getBoundingClientRect(), origin);
        if (!isVisible(rect, bounds, opts.minSize))
            return;
        blocks.push({ ...rect, radius: radiusOf(win.getComputedStyle(element)), kind: kindOf(element) });
    };
    // Whitespace-only nodes are measured too: a space between two inline
    // elements has a real width and lets "Hello <b>world</b>" become one bar.
    // Collapsed whitespace (indentation between blocks) yields zero-size rects
    // that the size filter drops.
    const collectText = (node) => {
        if (node.data.length === 0)
            return;
        const range = root.ownerDocument.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
            const rect = toRelative(r, origin);
            if (isVisible(rect, bounds, opts.minSize))
                textRects.push(rect);
        }
        range.detach();
    };
    const walk = (element) => {
        const parentVisibility = win.getComputedStyle(element).visibility;
        for (const child of Array.from(element.childNodes)) {
            if (full())
                return;
            if (child.nodeType === Node.TEXT_NODE) {
                collectText(child);
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE)
                continue;
            const el = child;
            const decision = classify(el, win, opts, { parentVisibility });
            if (decision === 'skip')
                continue;
            if (decision === 'block') {
                pushBlock(el);
                continue;
            }
            walk(el);
        }
    };
    // The root itself may be a single block (for example an <img>). Otherwise
    // its own box is never painted; only its contents are.
    const rootDecision = classify(root, win, opts, { root: true });
    if (rootDecision === 'block') {
        pushBlock(root);
    }
    else if (rootDecision === 'descend') {
        walk(root);
    }
    for (const line of mergeLineRects(textRects, opts.mergeGap)) {
        const scaled = scaleHeight(line, opts.textScale);
        blocks.push({ ...scaled, radius: opts.textRadius, kind: 'text' });
    }
    blocks.sort((a, b) => a.y - b.y || a.x - b.x);
    return {
        width: Math.round(bounds.width * 100) / 100,
        height: Math.round(bounds.height * 100) / 100,
        blocks: blocks.length > opts.maxBlocks ? blocks.slice(0, opts.maxBlocks) : blocks,
    };
}

// render

const CONTAINER_CLASS = 'auto-skeleton';
const BLOCK_CLASS = 'auto-skeleton__block';
const FADING_CLASS = 'auto-skeleton--fading';
function cssTime(value) {
    return typeof value === 'number' ? `${value}ms` : value;
}
/** Inline custom properties for a theme. Empty when nothing is set. */
function themeStyle(theme = {}) {
    const style = {};
    if (theme.color !== undefined)
        style['--auto-skeleton-color'] = theme.color;
    if (theme.highlight !== undefined)
        style['--auto-skeleton-highlight'] = theme.highlight;
    if (theme.duration !== undefined)
        style['--auto-skeleton-duration'] = cssTime(theme.duration);
    if (theme.fade !== undefined)
        style['--auto-skeleton-fade'] = cssTime(theme.fade);
    return style;
}
/** Inline style for the container. Shared by the DOM renderer and framework wrappers. */
function containerStyle(layout, theme) {
    return {
        ...themeStyle(theme),
        height: `${layout.height}px`,
        '--auto-skeleton-w': `${layout.width}px`,
    };
}
/** Inline style for one block. Shared by the DOM renderer and framework wrappers. */
function blockStyle(block) {
    return {
        left: `${block.x}px`,
        top: `${block.y}px`,
        width: `${block.width}px`,
        height: `${block.height}px`,
        borderRadius: block.radius,
        '--_x': `${block.x}px`,
    };
}
function blockClassName(block) {
    return `${BLOCK_CLASS} ${BLOCK_CLASS}--${block.kind}`;
}
function applyStyle(el, style) {
    for (const [key, value] of Object.entries(style)) {
        if (key.startsWith('--'))
            el.style.setProperty(key, value);
        else
            el.style[key] = value;
    }
}
/** Replace the container's blocks with those from a new layout. */
function updateSkeleton(container, layout, theme) {
    applyStyle(container, containerStyle(layout, theme));
    const doc = container.ownerDocument;
    const fragment = doc.createDocumentFragment();
    for (const block of layout.blocks) {
        const el = doc.createElement('div');
        el.className = blockClassName(block);
        el.setAttribute('aria-hidden', 'true');
        applyStyle(el, blockStyle(block));
        fragment.appendChild(el);
    }
    container.replaceChildren(fragment);
}
/**
 * Build a skeleton DOM element from a layout. The result is a `div` with
 * `role="status"` and `aria-busy="true"` that you can insert anywhere.
 */
function renderSkeleton(layout, options = {}) {
    const doc = options.document ?? document;
    if (options.injectStyles !== false)
        ensureStyles(doc, options.nonce);
    const container = doc.createElement('div');
    container.className = options.className ? `${CONTAINER_CLASS} ${options.className}` : CONTAINER_CLASS;
    container.setAttribute('role', 'status');
    container.setAttribute('aria-busy', 'true');
    container.setAttribute('aria-label', options.label ?? 'Loading');
    container.dataset['animate'] = String(options.animate !== false);
    updateSkeleton(container, layout, options);
    return container;
}

// skeleton


/**
 * Measure `source` and return a live skeleton element for it. This is the
 * one-call vanilla API; frameworks wrappers compose `measure` and
 * `renderSkeleton` directly.
 */
function createSkeleton(source, options = {}) {
    let layout = measure(source, options);
    const element = renderSkeleton(layout, options);
    return {
        element,
        get layout() {
            return layout;
        },
        update() {
            layout = measure(source, options);
            updateSkeleton(element, layout, options);
            return layout;
        },
        destroy() {
            element.remove();
        },
    };
}

return {measure,renderSkeleton,updateSkeleton,autoskeletonCSS,ensureStyles,createSkeleton};
})();
