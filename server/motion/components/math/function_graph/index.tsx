// Graph of y = f(x) for a typed formula (shared/expr.ts, no eval): axes with nice ticks, the curve drawn
// like a pen, then — at narration cues — a tangent line sliding along the curve with its slope f'(x)
// (central difference), and the area under the curve from a to b, first as Riemann rectangles that
// get finer, then the exact region with its value (Simpson's rule, 2000 intervals).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { compile, pretty } from "../../../shared/expr";
import { glow, typeOn } from "../../../shared/fx";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num, niceStep } from "../../../shared/format";
import { drawOn, fadeUp } from "../../../transitions";

interface Props {
  title: string;
  formula: string;
  xMin: number;
  xMax: number;
  yMin: number | null;
  yMax: number | null;
  curveColor: string;
  tangent: boolean;
  tangentFrom: number;
  tangentTo: number;
  integral: boolean;
  a: number;
  b: number;
  showDerivative: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "calculus");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const f = compile(p.formula);
    const x0 = Math.min(p.xMin, p.xMax), x1 = Math.max(p.xMin, p.xMax);
    // y range: given, or from the curve (ignoring blow-ups).
    const N = 400;
    const ys: number[] = [];
    for (let i = 0; i <= N; i++) {
      const y = f(x0 + ((x1 - x0) * i) / N);
      if (Number.isFinite(y)) ys.push(y);
    }
    ys.sort((u, v) => u - v);
    const lo = ys[Math.floor(ys.length * 0.02)] ?? -1, hi = ys[Math.ceil(ys.length * 0.98) - 1] ?? 1;
    let y0 = p.yMin ?? Math.min(0, lo - (hi - lo) * 0.12), y1 = p.yMax ?? Math.max(0, hi + (hi - lo) * 0.12);
    if (y1 - y0 < 1e-6) (y0 -= 1), (y1 += 1);
    const pad = 70 * k;
    const G = { x: A.x + pad, y: A.y + 50 * k, w: A.w - pad * 1.6, h: A.h - 50 * k - pad };
    const X = (x: number) => G.x + ((x - x0) / (x1 - x0)) * G.w;
    const Y = (y: number) => G.y + G.h - ((clamp(y, y0 - (y1 - y0), y1 + (y1 - y0)) - y0) / (y1 - y0)) * G.h;
    const inY = (y: number) => y >= y0 && y <= y1;
    const sx = niceStep(x1 - x0, 8), sy = niceStep(y1 - y0, 6);
    const axX = clamp(0, x0, x1), axY = clamp(0, y0, y1);
    const d = (x: number) => (f(x + 1e-4) - f(x - 1e-4)) / 2e-4;
    // Curve as segments broken where it leaves the window or is undefined.
    const segments = (fn: (x: number) => number) => {
      const out: [number, number][][] = [];
      let cur: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const x = x0 + ((x1 - x0) * i) / N, y = fn(x);
        if (Number.isFinite(y) && inY(y)) cur.push([X(x), Y(y)]);
        else if (cur.length) out.push(cur), (cur = []);
      }
      if (cur.length) out.push(cur);
      return out;
    };
    const curve = segments(f);
    const deriv = p.showDerivative ? segments(d) : [];
    // Exact area by Simpson's rule.
    const a = clamp(Math.min(p.a, p.b), x0, x1), b = clamp(Math.max(p.a, p.b), x0, x1);
    const simpson = (() => {
      const n = 2000, h = (b - a) / n;
      let s = f(a) + f(b);
      for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
      return (s * h) / 3;
    })();
    const rects = createSignal(4); // number of Riemann rectangles
    const exact = createSignal(0);
    const tx = createSignal(p.tangentFrom);

    const title = createRef<Txt>();
    const axes = createRef<Node>();
    const lines: Line[] = [];
    const formula = createRef<Txt>();
    const tan = createRef<Node>();
    const integ = createRef<Node>();
    const dline = createRef<Node>();
    const riemann = () => {
      const n = Math.round(rects()), w = (b - a) / n, out: [number, number, number][] = [];
      for (let i = 0; i < n; i++) {
        const xm = a + (i + 0.5) * w, y = f(xm);
        if (Number.isFinite(y)) out.push([X(a + i * w), X(a + (i + 1) * w), Y(y)]);
      }
      return out;
    };
    st.cam.add(
      <Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Node ref={axes} opacity={0}>
          {Array.from({ length: Math.floor((x1 - x0) / sx) + 2 }, (_, i) => {
            const x = Math.ceil(x0 / sx) * sx + i * sx;
            return x > x1 + 1e-9 ? null : <Line points={[[X(x), G.y], [X(x), G.y + G.h]]} stroke={L.line} lineWidth={1 * k} />;
          })}
          {Array.from({ length: Math.floor((y1 - y0) / sy) + 2 }, (_, i) => {
            const y = Math.ceil(y0 / sy) * sy + i * sy;
            return y > y1 + 1e-9 ? null : <Line points={[[G.x, Y(y)], [G.x + G.w, Y(y)]]} stroke={L.line} lineWidth={1 * k} />;
          })}
          <Line points={[[G.x, Y(axY)], [G.x + G.w + 20 * k, Y(axY)]]} stroke={L.dim} lineWidth={2.5 * k} endArrow arrowSize={12 * k} />
          <Line points={[[X(axX), G.y + G.h], [X(axX), G.y - 20 * k]]} stroke={L.dim} lineWidth={2.5 * k} endArrow arrowSize={12 * k} />
          {Array.from({ length: Math.floor((x1 - x0) / sx) + 2 }, (_, i) => {
            const x = Math.ceil(x0 / sx) * sx + i * sx;
            return x > x1 + 1e-9 || Math.abs(x) < 1e-9 ? null : <Txt text={num(x, 2)} x={X(x)} y={Y(axY) + 24 * k} fontFamily={FONT} fontSize={20 * k} fill={L.dim} />;
          })}
          {Array.from({ length: Math.floor((y1 - y0) / sy) + 2 }, (_, i) => {
            const y = Math.ceil(y0 / sy) * sy + i * sy;
            return y > y1 + 1e-9 || Math.abs(y) < 1e-9 ? null : <Txt text={num(y, 2)} x={X(axX) - 12 * k} y={Y(y)} offsetX={1} fontFamily={FONT} fontSize={20 * k} fill={L.dim} />;
          })}
        </Node>
        {p.integral ? (
          <Node ref={integ} opacity={0}>
            {/* Riemann rectangles, then the exact region. */}
            <Draw
              opacity={() => 1 - exact()}
              paint={(g) => {
                g.fillStyle = alpha(L.secondary, 0.35);
                g.strokeStyle = L.secondary;
                g.lineWidth = 1.5 * k;
                for (const [xa, xb, y] of riemann()) {
                  const top = Math.min(y, Y(0)), h = Math.abs(Y(0) - y);
                  g.fillRect(xa + k, top, Math.max(1, xb - xa - 2 * k), h);
                  g.strokeRect(xa + k, top, Math.max(1, xb - xa - 2 * k), h);
                }
              }}
            />
            <Line
              opacity={exact}
              closed
              fill={alpha(L.secondary, 0.4)}
              points={() => {
                const pts: [number, number][] = [[X(a), Y(0)]];
                for (let i = 0; i <= 120; i++) {
                  const x = a + ((b - a) * i) / 120, y = f(x);
                  pts.push([X(x), Y(Number.isFinite(y) ? y : 0)]);
                }
                pts.push([X(b), Y(0)]);
                return pts;
              }}
            />
            <Txt
              x={G.x + G.w - 10 * k}
              y={G.y + G.h - 24 * k}
              offsetX={1}
              fontFamily={FONT}
              fontWeight={700}
              fontSize={30 * k}
              fill={L.secondary}
              text={() => (exact() > 0.5 ? `∫ từ ${num(a, 2)} đến ${num(b, 2)} = ${num(simpson, 3)}` : `${Math.round(rects())} hình chữ nhật`)}
            />
          </Node>
        ) : null}
        {curve.map((pts, i) => <Line ref={(n: Line) => (lines[i] = n)} points={pts} stroke={p.curveColor || L.primary} lineWidth={5 * k} lineJoin="round" lineCap="round" end={0} {...glow(p.curveColor || L.primary, 12 * k)} />)}
        {p.showDerivative ? (
          <Node ref={dline} opacity={0}>
            {deriv.map((pts) => <Line points={pts} stroke={L.highlight} lineWidth={3.5 * k} lineDash={[12 * k, 8 * k]} />)}
          </Node>
        ) : null}
        {p.tangent ? (
          <Node ref={tan} opacity={0}>
            <Line
              stroke={L.accent}
              lineWidth={4 * k}
              points={() => {
                const x = tx(), y = f(x), m = d(x), h = (x1 - x0) * 0.16;
                return [[X(x - h), Y(y - m * h)], [X(x + h), Y(y + m * h)]];
              }}
            />
            <Rect size={16 * k} radius={8 * k} fill={L.accent} {...glow(L.accent, 14 * k)} x={() => X(tx())} y={() => Y(f(tx()))} />
            <Txt x={() => X(tx())} y={() => Y(f(tx())) - 36 * k} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={L.accent} text={() => `độ dốc f′(${num(tx(), 2)}) = ${num(d(tx()), 2)}`} />
          </Node>
        ) : null}
        <Txt ref={formula} x={G.x + 20 * k} y={G.y + 10 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={40 * k} fill={p.curveColor || L.primary} text="" />
        {p.showDerivative ? <Txt x={G.x + 20 * k} y={G.y + 56 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={26 * k} fill={L.highlight} opacity={() => dline()?.opacity() ?? 0} text="--- đạo hàm f′(x)" /> : null}
      </Node>,
    );

    yield st.camera();
    if (p.title) yield fadeUp(title(), 0.5);
    yield* axes().opacity(1, 0.5);
    yield typeOn(formula(), `f(x) = ${pretty(p.formula)}`, 0.8);
    yield* all(...lines.map((l) => drawOn(l, 1.4)));
    const steps = (p.tangent ? 1 : 0) + (p.showDerivative ? 1 : 0) + (p.integral ? 1 : 0);
    let i = 0;
    if (p.tangent) {
      yield* until(ctx.cue(i++, steps));
      yield* tan().opacity(1, 0.4);
      const span = Math.max(1.5, Math.min(5, (D - ctx.cue(i - 1, steps)) / (steps - i + 1) - 0.5));
      yield* tx(p.tangentTo, span, easeInOutCubic);
    }
    if (p.showDerivative) {
      yield* until(ctx.cue(i++, steps));
      yield* dline().opacity(1, 0.6, st.ease);
    }
    if (p.integral) {
      yield* until(ctx.cue(i++, steps));
      yield* integ().opacity(1, 0.4);
      const left = Math.max(1.5, D - ctx.cue(i - 1, steps) - 1.2);
      yield* rects(48, left * 0.7, linear);
      yield* exact(1, Math.min(0.8, left * 0.3), st.ease);
    }
  },
});
