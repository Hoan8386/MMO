// A small, safe parser for the formulas of math components (no eval): numbers, x, pi, e,
// + − × ÷ ^ (right-assoc), unary minus, implicit multiplication (2x, 3sin(x), (x+1)(x−1)) and
// sin cos tan asin acos atan sinh cosh tanh exp ln log log10 sqrt abs floor ceil sign.
// compile("x^2 - 2x + 1") → (x) => number. Throws a readable error on a bad formula.

const FN: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log,
  log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
};
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function lex(src: string): Tok[] {
  const s = src.replace(/×|·/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/\s+/g, "").toLowerCase();
  const out: Tok[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/)!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/.test(c)) {
      const m = s.slice(i).match(/^[a-z]+\d*/)!;
      // Split runs like "xsin" or "pix" into known names.
      let w = m[0];
      while (w) {
        const name = ["log10", ...Object.keys(FN), ...Object.keys(CONST), "x"].sort((a, b) => b.length - a.length).find((n) => w.startsWith(n));
        if (!name) throw new Error(`không hiểu "${w}" trong công thức`);
        out.push({ t: "id", v: name });
        w = w.slice(name.length);
      }
      i += m[0].length;
    } else if ("+-*/^()".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else throw new Error(`ký tự "${c}" không dùng được trong công thức`);
  }
  // Implicit multiplication: 2x, 2(…), x(…), )(, )x, x sin…
  const res: Tok[] = [];
  for (const tok of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === "num" || (prev.t === "id" && !FN[prev.v]) || (prev.t === "op" && prev.v === ")"));
    const curStarts = tok.t === "num" || tok.t === "id" || (tok.t === "op" && tok.v === "(");
    if (prevEnds && curStarts) res.push({ t: "op", v: "*" });
    res.push(tok);
  }
  return res;
}

type Ast = (x: number) => number;

export function compile(src: string): Ast {
  const toks = lex(src);
  let i = 0;
  const peek = () => toks[i];
  const take = (v?: string) => {
    const t = toks[i++];
    if (!t || (v && t.v !== v)) throw new Error(`công thức thiếu "${v ?? "giá trị"}"`);
    return t;
  };
  const expr = (): Ast => {
    let a = term();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = take().v, l = a, r = term();
      a = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return a;
  };
  const term = (): Ast => {
    let a = unary();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = take().v, l = a, r = unary();
      a = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
    }
    return a;
  };
  const unary = (): Ast => {
    if (peek()?.t === "op" && peek().v === "-") {
      take();
      const a = unary();
      return (x) => -a(x);
    }
    if (peek()?.t === "op" && peek().v === "+") take();
    return power();
  };
  const power = (): Ast => {
    const b = atom();
    if (peek()?.t === "op" && peek().v === "^") {
      take();
      const e = unary();
      return (x) => Math.pow(b(x), e(x));
    }
    return b;
  };
  const atom = (): Ast => {
    const t = take();
    if (t.t === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.t === "id") {
      if (t.v === "x") return (x) => x;
      if (t.v in CONST) {
        const v = CONST[t.v];
        return () => v;
      }
      const f = FN[t.v];
      if (peek()?.v === "(") {
        take("(");
        const a = expr();
        take(")");
        return (x) => f(a(x));
      }
      const a = power();
      return (x) => f(a(x));
    }
    if (t.v === "(") {
      const a = expr();
      take(")");
      return a;
    }
    throw new Error(`"${t.v}" đặt sai chỗ trong công thức`);
  };
  const f = expr();
  if (i < toks.length) throw new Error(`thừa "${toks[i].v}" cuối công thức`);
  return f;
}

// Pretty form for labels: x^2 → x², * → ·, sqrt → √.
export function pretty(src: string) {
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  return src
    .replace(/\^(-?\d)/g, (_, d: string) => d.split("").map((c) => sup[c] ?? c).join(""))
    .replace(/\*/g, "·")
    .replace(/sqrt/g, "√")
    .replace(/pi/g, "π");
}
