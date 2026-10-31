// Trigonometry and complex numbers. unit_circle: a point runs round the unit circle; its projections
// are cos θ and sin θ, unrolled to the right as the two waves (with the angle in radians as an arc).
// euler: e^{iθ} as the sum of its power series 1 + iθ + (iθ)²/2! + … — each term turns 90° from the
// last and shrinks, the partial sums spiral onto the unit circle; for θ = π they land on −1 (e^{iπ} = −1).
// multiply: z·w turns z by arg w and scales it by |w| (angles add, lengths multiply). roots: the n-th
// roots of unity, a regular n-gon on the unit circle, z^n = 1.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "unit_circle" | "euler" | "multiply" | "roots";
  theta: number;
  n: number;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "algebra");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    const COS = L.secondary, SIN = L.accent, INK = L.text;
    const axes = (g: CanvasRenderingContext2D, cx: number, cy: number, R: number, re = "Re", im = "Im") => {
      g.strokeStyle = alpha(INK, 0.45);
      g.lineWidth = 2 * k;
      g.beginPath();
      g.moveTo(cx - R * 1.3, cy);
      g.lineTo(cx + R * 1.3, cy);
      g.moveTo(cx, cy + R * 1.3);
      g.lineTo(cx, cy - R * 1.3);
      g.stroke();
      g.fillStyle = L.dim;
      g.font = `700 ${22 * k}px ${FONT}`;
      g.fillText(re, cx + R * 1.3 - 30 * k, cy + 28 * k);
      g.fillText(im, cx + 10 * k, cy - R * 1.3 + 20 * k);
    };
    const circle = (g: CanvasRenderingContext2D, cx: number, cy: number, R: number) => {
      g.strokeStyle = alpha(INK, 0.7);
      g.lineWidth = 3 * k;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.stroke();
    };
    const vec = (g: CanvasRenderingContext2D, a: XY, b: XY, c: string, w = 4) => {
      g.strokeStyle = c;
      g.fillStyle = c;
      g.lineWidth = L.lw(w * k);
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b);
      g.stroke();
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      g.beginPath();
      g.moveTo(...b);
      g.lineTo(b[0] - Math.cos(ang - 0.4) * 16 * k, b[1] - Math.sin(ang - 0.4) * 16 * k);
      g.lineTo(b[0] - Math.cos(ang + 0.4) * 16 * k, b[1] - Math.sin(ang + 0.4) * 16 * k);
      g.fill();
    };

    if (p.mode === "unit_circle") {
      const R = Math.min(A.h * 0.3, A.w * 0.16);
      const cx = A.x + R * 1.5, cy = A.cy;
      const th = () => clamp((clock() - 0.8) / (D - 1.5), 0, 1) * TAU * 1.25 * st.speed;
      const wx0 = cx + R * 1.6, wW = A.x + A.w - wx0 - 20 * k;
      const span = TAU * 1.25 * st.speed;
      nodes.push(
        <Draw
          paint={(g) => {
            axes(g, cx, cy, R, "x", "y");
            circle(g, cx, cy, R);
            const t = th(), P: XY = [cx + Math.cos(t) * R, cy - Math.sin(t) * R];
            // Angle arc and its length (radians).
            g.strokeStyle = L.highlight;
            g.lineWidth = 5 * k;
            g.beginPath();
            g.arc(cx, cy, R, 0, -t, true);
            g.stroke();
            vec(g, [cx, cy], P, INK, 3);
            g.strokeStyle = COS;
            g.lineWidth = 5 * k;
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(P[0], cy);
            g.stroke();
            g.strokeStyle = SIN;
            g.beginPath();
            g.moveTo(P[0], cy);
            g.lineTo(P[0], P[1]);
            g.stroke();
            g.fillStyle = "#FFFFFF";
            g.beginPath();
            g.arc(P[0], P[1], 9 * k, 0, TAU);
            g.fill();
            // Waves to the right: sin (top-aligned with the circle's centre) and cos.
            g.strokeStyle = alpha(INK, 0.3);
            g.lineWidth = 1.5 * k;
            g.beginPath();
            g.moveTo(wx0, cy);
            g.lineTo(wx0 + wW, cy);
            g.stroke();
            for (const [fn, col] of [[Math.sin, SIN], [Math.cos, COS]] as [(x: number) => number, string][]) {
              g.strokeStyle = col;
              g.lineWidth = L.lw(4 * k);
              g.beginPath();
              for (let i = 0; i <= 200; i++) {
                const a = (i / 200) * t;
                const x = wx0 + (a / span) * wW, y = cy - fn(a) * R;
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }
            // Link the point to the head of the sine wave.
            g.setLineDash([6 * k, 6 * k]);
            g.strokeStyle = alpha(SIN, 0.6);
            g.beginPath();
            g.moveTo(P[0], P[1]);
            g.lineTo(wx0 + (t / span) * wW, P[1]);
            g.stroke();
            g.setLineDash([]);
            g.font = `800 ${26 * k}px ${FONT}`;
            g.fillStyle = L.highlight;
            g.fillText(`θ = ${num(t, 2)} rad = ${num((t * 180) / Math.PI, 0)}°`, A.x, A.y + 30 * k);
            g.fillStyle = COS;
            g.fillText(`cos θ = ${num(Math.cos(t), 2)}`, A.x, A.y + 66 * k);
            g.fillStyle = SIN;
            g.fillText(`sin θ = ${num(Math.sin(t), 2)}`, A.x, A.y + 102 * k);
          }}
        />,
      );
      show(label(ctx, "cos²θ + sin²θ = 1 — mọi điểm trên đường tròn đơn vị", { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: INK }));
    } else if (p.mode === "euler") {
      const R = Math.min(A.h * 0.36, A.w * 0.22);
      const cx = A.cx - R * 0.2, cy = A.cy;
      const th = p.theta;
      // Terms (iθ)^n / n!: magnitude θ^n/n!, direction n·90°.
      const terms: XY[] = [];
      let f = 1;
      for (let n = 0; n < 16; n++) {
        if (n) f *= n;
        const m = Math.pow(th, n) / f, a = (n * Math.PI) / 2;
        terms.push([Math.cos(a) * m, Math.sin(a) * m]);
      }
      const shown = () => clamp((clock() - 0.8) / (D * 0.65), 0, 1) * terms.length;
      nodes.push(
        <Draw
          paint={(g) => {
            axes(g, cx, cy, R);
            circle(g, cx, cy, R);
            let x = 0, y = 0;
            const n = shown();
            for (let i = 0; i < Math.ceil(n); i++) {
              const u = Math.min(1, n - i);
              const nx = x + terms[i][0] * u, ny = y + terms[i][1] * u;
              vec(g, [cx + x * R, cy - y * R], [cx + nx * R, cy - ny * R], i % 2 ? SIN : COS, 3.5);
              x = nx;
              y = ny;
            }
            const end: XY = [cx + Math.cos(th) * R, cy - Math.sin(th) * R];
            g.fillStyle = L.highlight;
            g.beginPath();
            g.arc(end[0], end[1], 11 * k, 0, TAU);
            g.fill();
            g.font = `800 ${26 * k}px ${FONT}`;
            g.fillStyle = INK;
            g.fillText(`tổng ${Math.ceil(n)} số hạng: ${num(x, 3)} ${y >= 0 ? "+" : "−"} ${num(Math.abs(y), 3)}i`, A.x, A.y + A.h - 20 * k);
          }}
        />,
      );
      show(label(ctx, "e^{iθ} = 1 + iθ + (iθ)²/2! + (iθ)³/3! + …  (mỗi số hạng quay thêm 90°)", { x: A.x, y: A.y + 24 * k, size: 25, align: "left", fill: INK }));
      show(label(ctx, Math.abs(th - Math.PI) < 0.01 ? "θ = π:  e^{iπ} + 1 = 0" : `→ cos θ + i·sin θ = ${num(Math.cos(th), 3)} + ${num(Math.sin(th), 3)}i`, { x: A.x + A.w, y: A.y + 70 * k, size: 34, align: "right", fill: L.highlight }));
    } else if (p.mode === "multiply") {
      const R = Math.min(A.h * 0.3, A.w * 0.2);
      const cx = A.cx, cy = A.cy;
      const z: XY = [1.1, 0.45], w: XY = [0.6, 0.9];
      const az = Math.atan2(z[1], z[0]), rz = Math.hypot(...z), aw = Math.atan2(w[1], w[0]), rw = Math.hypot(...w);
      const u = () => smooth(clamp((clock() - ctx.cue(1, 3)) / 2.2, 0, 1));
      nodes.push(
        <Draw
          paint={(g) => {
            axes(g, cx, cy, R * 1.4);
            circle(g, cx, cy, R);
            const t = u();
            const a = az + aw * t, r = rz * (1 + (rw - 1) * t);
            const S = (q: XY): XY => [cx + q[0] * R, cy - q[1] * R];
            vec(g, S([0, 0]), S(z), alpha(COS, 0.5), 3);
            vec(g, S([0, 0]), S(w), SIN, 4);
            vec(g, S([0, 0]), S([Math.cos(a) * r, Math.sin(a) * r]), L.highlight, 5);
            g.strokeStyle = alpha(L.highlight, 0.6);
            g.lineWidth = 3 * k;
            g.beginPath();
            g.arc(cx, cy, R * 0.35, -az, -a, true);
            g.stroke();
            g.font = `800 ${26 * k}px ${FONT}`;
            g.fillStyle = COS;
            g.fillText("z", S(z)[0] + 10 * k, S(z)[1]);
            g.fillStyle = SIN;
            g.fillText("w", S(w)[0] + 10 * k, S(w)[1]);
            g.fillStyle = L.highlight;
            const zw = S([Math.cos(a) * r, Math.sin(a) * r]);
            g.fillText(t > 0.98 ? "z·w" : "", zw[0] + 10 * k, zw[1]);
          }}
        />,
      );
      show(label(ctx, `|z·w| = |z|·|w| = ${num(rz, 2)} × ${num(rw, 2)} = ${num(rz * rw, 2)}`, { x: A.x, y: A.y + 24 * k, size: 27, align: "left", fill: INK }));
      show(label(ctx, `arg(z·w) = arg z + arg w = ${num((az * 180) / Math.PI, 0)}° + ${num((aw * 180) / Math.PI, 0)}°`, { x: A.x, y: A.y + 62 * k, size: 27, align: "left", fill: L.highlight }));
    } else {
      const R = Math.min(A.h * 0.38, A.w * 0.25);
      const cx = A.cx, cy = A.cy, n = p.n;
      const u = () => clamp((clock() - 0.8) / (D * 0.5), 0, 1);
      nodes.push(
        <Draw
          paint={(g) => {
            axes(g, cx, cy, R);
            circle(g, cx, cy, R);
            const m = Math.ceil(u() * n);
            g.strokeStyle = L.highlight;
            g.lineWidth = L.lw(3.5 * k);
            g.beginPath();
            for (let j = 0; j <= m; j++) {
              const a = (j * TAU) / n, q: XY = [cx + Math.cos(a) * R, cy - Math.sin(a) * R];
              if (j) g.lineTo(...q);
              else g.moveTo(...q);
            }
            g.stroke();
            for (let j = 0; j < m; j++) {
              const a = (j * TAU) / n, q: XY = [cx + Math.cos(a) * R, cy - Math.sin(a) * R];
              g.fillStyle = j ? COS : L.highlight;
              g.beginPath();
              g.arc(q[0], q[1], 10 * k, 0, TAU);
              g.fill();
              g.font = `700 ${20 * k}px ${FONT}`;
              g.fillStyle = INK;
              g.fillText(`e^{${j ? `${j}·2πi/${n}` : "0"}}`, q[0] + Math.cos(a) * 34 * k - 30 * k, q[1] - Math.sin(a) * 34 * k);
            }
          }}
        />,
      );
      show(label(ctx, `z^${n} = 1 có đúng ${n} nghiệm: các đỉnh của đa giác đều ${n} cạnh`, { x: A.cx, y: A.y + 24 * k, size: 27, fill: INK }));
    }

    if (!p.labels) shows.length = 0;
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          {nodes}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );
    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void Line;
    void Rect;
    void easeInOutCubic;
  },
});
