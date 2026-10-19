// A tiny DOM for the views.js unit tests (no jsdom in tests/node_modules): exactly the calls views.js makes, nothing more.
class Node {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get children() { return this.childNodes.filter(n => n instanceof Element); }
  append(...ns) {
    for (let n of ns) {
      if (typeof n === "string") n = this.ownerDocument.createTextNode(n);
      if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
      n.parentNode = this; this.childNodes.push(n);
    }
  }
  replaceChildren(...ns) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...ns); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
  set textContent(v) { this.replaceChildren(this.ownerDocument.createTextNode(String(v))); }
}
class Text extends Node {
  constructor(doc, v) { super(doc); this.data = v; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}
class Element extends Node {
  constructor(doc, tag, ns) { super(doc); this.tagName = tag.toUpperCase(); this.namespaceURI = ns; this.attrs = new Map(); this.listeners = {}; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get classList() {
    const get = () => (this.getAttribute("class") || "").split(/\s+/).filter(Boolean), set = a => this.setAttribute("class", a.join(" "));
    return {
      add: c => { const a = get(); if (!a.includes(c)) set([...a, c]); },
      remove: c => set(get().filter(x => x !== c)),
      contains: c => get().includes(c),
    };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, ev = {}) {
    const e = { type, target: this, preventDefault() {}, ...ev };
    for (let n = this; n; n = n.parentNode) for (const fn of n.listeners?.[type] || []) fn(e);
  }
  click() { if (!this.hasAttribute("disabled")) this.dispatch("click"); }
}
export function makeDocument() {
  const doc = {
    createElement: t => new Element(doc, t, "html"),
    createElementNS: (ns, t) => new Element(doc, t, ns),
    createTextNode: v => new Text(doc, String(v)),
  };
  return doc;
}
export const mount = () => makeDocument().createElement("div");
/** Every element under el (el included) that passes pred. */
export function all(el, pred = () => true) {
  const out = [];
  (function walk(n) { if (n instanceof Element) { if (pred(n)) out.push(n); n.childNodes.forEach(walk); } })(el);
  return out;
}
export const byClass = (el, c) => all(el, n => n.classList.contains(c));
export const one = (el, c) => byClass(el, c)[0];
/** A stable serialization (tags, attributes, text) for comparing two DOMs. */
export function html(n) {
  if (n instanceof Text) return n.data;
  const a = [...n.attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
  return `<${n.tagName.toLowerCase()}${a}>${n.childNodes.map(html).join("")}</${n.tagName.toLowerCase()}>`;
}
