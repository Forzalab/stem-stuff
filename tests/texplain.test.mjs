// texPlain (nav.js, todo 108): TeX -> the plain, grader-exact text a copy puts on the clipboard (Tony's 11 answers, plan and-a-todo-list-dapper-yeti).
// The table pins every locked example; the sweep converts every $..$ / $$..$$ in the repo banks without throwing (tests/test_texplain.py
// then checks the plain expressions parse in serve.py to_python).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { texPlain } from "../nav.js";

const T = [
  // Tony's locked examples (answers 2-9)
  ["\\frac{1}{2}mv^2", "(1/2)*m*v^2"],
  ["\\sqrt{x^2+16}", "sqrt(x^2 + 16)"],
  ["v=\\sqrt{2gh}", "v = sqrt(2*g*h)"],
  ["2\\pi r", "2*pi*r"],
  ["e^{-x/2}", "e^(-x/2)"],
  ["3.2\\times10^{-3}", "3.2e-3"],
  ["v_0", "v_0"],
  ["\\vec{F}", "vec(F)"],
  ["\\mu", "mu"],
  ["\\theta", "theta"],
  ["x \\le 3", "x <= 3"],
  ["x \\ge 3", "x >= 3"],
  ["a\\ne b", "a != b"],
  ["30^\\circ", "30 deg"],
  ["\\dot{x}", "dx/dt"],
  ["\\ddot{x}", "d^2x/dt^2"],
  ["\\lim_{x\\to\\infty} f", "lim(x->inf) f"],
  ["\\sin^2 x", "sin(x)^2"],
  ["\\ln|x|", "ln(abs(x))"],
  ["3.2\\,\\text{m/s}", "3.2 m/s"],
  ["F = \\frac{1}{2}kx^2 + mgh", "F = (1/2)*k*x^2 + m*g*h"],
  ["\\frac{d}{dx}(x^2)", "d/dx (x^2)"],
  // rows: one per line
  ["\\begin{aligned} a &= b+c \\\\ &= d\\end{aligned}", "a = b + c\n= d"],
  ["f(x)=\\begin{cases} x & x>0\\\\ 0 & \\text{otherwise}\\end{cases}", "f(x) =\nx, x > 0\n0, otherwise"],
  ["x+1=2 \\\\ x=1", "x + 1 = 2\nx = 1"],
  // more
  ["\\frac{dy}{dx}", "dy/dx"],
  ["\\frac{d^2y}{dx^2}", "d^2y/dx^2"],
  ["\\int_0^3 x^2\\,dx", "int(0, 3) x^2 dx"],
  ["\\int f(x)\\,dx", "int f(x) dx"],
  ["\\sum_{i=1}^{n} i", "sum(i=1, n) i"],
  ["\\log_2 8", "log(8)/log(2)"],
  ["\\log_{10} x", "log10(x)"],
  ["\\sin x\\cos x", "sin(x)*cos(x)"],
  ["\\tan^{-1} x", "atan(x)"],
  ["\\sin 30^\\circ", "sin(30 deg)"],
  ["\\cos(2\\theta)", "cos(2*theta)"],
  ["\\frac12", "1/2"],
  ["\\dfrac{x}{2y}", "x/(2*y)"],
  ["\\frac{a+b}{c}", "(a + b)/c"],
  ["\\frac{1}{x^2}", "1/x^2"],
  ["\\sqrt{\\frac{2h}{g}}", "sqrt((2*h)/g)"],
  ["T = 2\\pi\\sqrt{\\frac{L}{g}}", "T = 2*pi*sqrt(L/g)"],
  ["\\sqrt[3]{x}", "x^(1/3)"],
  ["x = -3", "x = -3"],
  ["x^{-1}", "x^(-1)"],
  ["x^{n+1}", "x^(n + 1)"],
  ["e^{i\\pi}+1=0", "e^(i*pi) + 1 = 0"],
  ["x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", "x = (-b +- sqrt(b^2 - 4*a*c))/(2*a)"],
  ["6.02 \\times 10^{23}", "6.02e23"],
  ["a\\cdot10^{3}", "a*10^3"],
  ["x\\cdot y", "x*y"],
  ["12 \\div 4", "12/4"],
  ["2(x+1)", "2*(x + 1)"],
  ["(x+1)(x-1)", "(x + 1)*(x - 1)"],
  ["|a|+|b|", "abs(a) + abs(b)"],
  ["\\left(\\frac{a}{b}\\right)^2", "(a/b)^2"],
  ["f'(x) = 2x", "f'(x) = 2*x"],
  ["E = mc^2", "E = m*c^2"],
  ["\\omega = 2\\pi f", "omega = 2*pi*f"],
  ["v_{max}", "v_max"],
  ["F_{net} = ma", "F_net = m*a"],
  ["\\Delta x", "Delta x"],
  ["m\\ddot{x} = -kx", "m*(d^2x/dt^2) = -k*x"],
  ["\\text{KE} = \\tfrac12 mv^2", "KE = (1/2)*m*v^2"],
  ["\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}", "lim(h->0) (f(x + h) - f(x))/h"],
  ["\\binom{5}{2}", "C(5, 2)"],
  ["1{,}000", "1000"],
  ["10\\%", "10%"],
  ["n!", "n!"],
  ["\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}", "[1, 2; 3, 4]"],
  ["\\neg p \\wedge q", "not p and q"],
  ["p \\to q", "p -> q"],
  ["\\forall x \\in \\mathbb{R}", "for all x in R"],
  ["a \\equiv b \\pmod{n}", "a == b (mod n)"],
  ["\\sin x", "sin(x)"],                                  // a bare name is never s*i*n
  ["sin x + \\pi", "sin(x) + pi"],
  ["\\htmlClass{chg}{3}x", "3*x"],
  // math.js toTex (the revealed answer renders through it): braces round every base
  ["\\frac{\\sqrt{{x}^{2}+16}}{2}", "sqrt(x^2 + 16)/2"],
  ["{\\left(x+1\\right)}^{2}", "(x + 1)^2"],
  ["{(a+b)}^{2}", "(a + b)^2"],
  ["2\\cdot{x}^{3}", "2*x^3"],                         // a snack's changed number (chg.mjs) is just the number
];

test("texPlain: the table (every locked example, then the rest)", () => {
  assert.ok(T.length >= 40, `${T.length} cases`);
  for (const [tex, want] of T) assert.equal(texPlain(tex), want, tex);
});

/* every $..$ / $$..$$ in the repo banks, and every formula's tex */
function bankTex() {
  const root = new URL("../", import.meta.url), out = [];
  const files = [...readdirSync(new URL("banks/", root)).filter(f => f.endsWith(".json")).map(f => new URL("banks/" + f, root)), new URL("problems.json", root)];
  const walk = (o, k) => {
    if (typeof o === "string") {
      if (k === "tex") { out.push(o); return; }
      const s = o.replace(/\\\$/g, "");
      for (const m of s.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) out.push(m[1] ?? m[2]);
    } else if (Array.isArray(o)) { if (o.every(x => typeof x === "string")) walk(o.join("\n"), k); else o.forEach(x => walk(x, k)); }
    else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) walk(v, kk);
  };
  for (const f of files) walk(JSON.parse(readFileSync(f, "utf8")));
  return out;
}
test("texPlain: every bank formula converts, never throws, never leaves TeX", () => {
  const all = bankTex();
  assert.ok(all.length > 100, `only ${all.length}`);
  for (const t of all) {
    const p = texPlain(t);
    assert.equal(typeof p, "string", t);
    assert.ok(!/\\[A-Za-z]/.test(p), `TeX left in ${JSON.stringify(p)} from ${t}`);
  }
});
