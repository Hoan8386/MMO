// Monte Carlo estimate of π: random points fall in a square of side 2 with an inscribed circle; the
// share that land inside tends to π/4, so 4 × inside / total → π. Points rain in faster and faster
// (seeded, so every render is the same), a counter shows the running estimate, and a chart beside it
// plots the estimate against the number of points, closing in on the dashed line π ± its error band
// (standard error 4·√(p(1−p)/n) with p = π/4).
import { Line, Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInCubic } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  points: number;
  seed: number;
  showChart: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "probability");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const N = p.points;
    const r = rng(p.seed);
    const xs = new Float32Array(N), ys = new Float32Array(N), hits = new Uint32Array(N + 1);
    for (let i = 0; i < N; i++) {
      xs[i] = r() * 2 - 1;
      ys[i] = r() * 2 - 1;
      hits[i + 1] = hits[i] + (xs[i] * xs[i] + ys[i] * ys[i] <= 1 ? 1 : 0);
    }
    // Square on the left (or top), chart on the right (or bottom).
    const chart = p.showChart;
    const side = chart ? (A.wide ? Math.min(A.h, A.w * 0.48) : Math.min(A.w, A.h * 0.55)) : Math.min(A.w, A.h);
    const S = side * 0.86;
    const sqx = chart ? (A.wide ? A.x + side / 2 : A.cx) : A.cx, sqy = chart ? (A.wide ? A.cy : A.y + side / 2) : A.cy;
    const C = A.wide ? { x: A.x + side + 60 * k, y: A.y + 90 * k, w: A.w - side - 100 * k, h: A.h - 190 * k } : { x: A.x + 70 * k, y: A.y + side + 80 * k, w: A.w - 110 * k, h: A.h - side - 150 * k };
    const n = createSignal(0); // points shown
    const est = (m: number) => (m ? (4 * hits[m]) / m : 0);

    const paint = (g: CanvasRenderingContext2D) => {
      const m = Math.floor(n());
      // Square and circle.
      g.strokeStyle = L.dim;
      g.lineWidth = 2.5 * k;
      g.strokeRect(sqx - S / 2, sqy - S / 2, S, S);
      g.strokeStyle = L.primary;
      g.lineWidth = 3 * k;
      g.beginPath();
      g.arc(sqx, sqy, S / 2, 0, Math.PI * 2);
      g.stroke();
      // Points: inside / outside colours; the newest ones bigger.
      const dot = Math.max(3, 7 - Math.log10(Math.max(10, m))) * k;
      for (let i = 0; i < m; i++) {
        const inside = xs[i] * xs[i] + ys[i] * ys[i] <= 1;
        g.fillStyle = inside ? L.accent : L.secondary;
        const s = i > m - 6 ? dot * 2.2 : dot;
        g.fillRect(sqx + (xs[i] * S) / 2 - s / 2, sqy - (ys[i] * S) / 2 - s / 2, s, s);
      }
      if (!chart || m < 2) return;
      // Estimate vs n on a log axis, with the ±2σ band around π.
      const lx = (i: number) => C.x + (Math.log10(i) / Math.log10(N)) * C.w;
      const vy = (v: number) => C.y + C.h / 2 - ((v - Math.PI) / 1.2) * (C.h / 2);
      g.fillStyle = alpha(L.primary, 0.1);
      g.beginPath();
      for (let i = 1; i <= N; i = Math.ceil(i * 1.15)) g.lineTo(lx(i), vy(Math.PI + 2 * 4 * Math.sqrt((0.785 * 0.215) / i)));
      for (let i = N; i >= 1; i = Math.floor(i / 1.15)) g.lineTo(lx(i), vy(Math.PI - 2 * 4 * Math.sqrt((0.785 * 0.215) / i)));
      g.closePath();
      g.save();
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
      g.clip();
      g.fill();
      g.strokeStyle = L.accent;
      g.lineWidth = 3 * k;
      g.beginPath();
      for (let i = 1; i <= m; i = Math.max(i + 1, Math.ceil(i * 1.02))) g.lineTo(lx(i), vy(est(i)));
      g.lineTo(lx(m), vy(est(m)));
      g.stroke();
      g.restore();
    };

    const title = createRef<Txt>();
    const info = createRef<Node>();
    const tx = A.wide ? C.x : A.x + 10 * k, ty = A.wide ? A.y + 20 * k : sqy + S / 2 + 30 * k;
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {chart ? (
          <Node ref={info} opacity={0}>
            <Line points={[[C.x, C.y + C.h / 2], [C.x + C.w, C.y + C.h / 2]]} stroke={L.highlight} lineWidth={2 * k} lineDash={[10 * k, 8 * k]} />
            <Txt x={C.x + C.w} y={C.y + C.h / 2 - 22 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.highlight} text="π = 3,14159…" />
            <Line points={[[C.x, C.y], [C.x, C.y + C.h], [C.x + C.w, C.y + C.h]]} stroke={L.dim} lineWidth={2 * k} />
            <Txt x={C.x + C.w} y={C.y + C.h + 24 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} text="số điểm (thang log)" />
          </Node>
        ) : null}
        <Txt
          x={tx}
          y={A.wide ? ty : ty}
          offsetX={-1}
          fontFamily={FONT}
          fontWeight={800}
          fontSize={36 * k}
          fill={L.text}
          text={() => {
            const m = Math.floor(n());
            return m ? `π ≈ 4 × ${hits[m].toLocaleString("vi-VN")} / ${m.toLocaleString("vi-VN")} = ${num(est(m), 4)}` : "π ≈ 4 × trong / tổng";
          }}
        />
      </Node>,
    );

    yield st.camera();
    if (p.title) yield fadeUp(title(), 0.5);
    if (chart) yield info().opacity(1, 0.5);
    // Slow start (each point visible), then faster and faster: n grows like t³.
    yield* n(N, Math.max(2, D - 1.2), easeInCubic);
  },
});
