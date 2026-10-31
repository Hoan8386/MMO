// Fractals. mandelbrot: the set of c for which zₙ₊₁ = zₙ² + c stays bounded, computed per frame with
// smooth (continuous escape-time) colouring while the view zooms exponentially into a chosen point
// (seahorse valley by default). julia: the filled Julia set of a c that travels round a circle, so the
// set morphs. sierpinski: the triangle built level by level (and the chaos game filling it). koch: the
// snowflake iterated — perimeter ×4/3 each step (to infinity), area converging to 8/5 of the triangle.
// tree: a branching tree, each branch splitting into two shorter ones at a swaying angle.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster, rgb } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  kind: "mandelbrot" | "julia" | "sierpinski" | "koch" | "tree";
  target: "seahorse" | "elephant" | "spiral";
  zoom: number;
  depth: number;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;
const TARGETS: Record<string, XY> = { seahorse: [-0.743643887037151, 0.13182590420533], elephant: [0.2821, 0.01], spiral: [-0.7746806106269039, -0.1374168856037867] };

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "fractals");
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
    const pal = [L.bg, L.primary, L.secondary, L.accent, L.highlight, "#FFFFFF"].map(rgb);
    const colorAt = (u: number): [number, number, number] => {
      // Cyclic palette.
      const x = ((u % 1) + 1) % 1 * (pal.length - 1), i = Math.floor(x), f = x - i;
      const a = pal[i], b = pal[Math.min(pal.length - 1, i + 1)];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };

    if (p.kind === "mandelbrot" || p.kind === "julia") {
      const W = A.w, H = A.h;
      const res = Math.round(Math.min(360, W / 4) * (0.55 + 0.45 * L.q));
      const tgt = TARGETS[p.target];
      const zoomAt = () => Math.pow(p.zoom, clamp((clock() - 0.6) / (D - 1.2), 0, 1));
      const paint = (data: Uint8ClampedArray, cols: number, rows: number) => {
        const z = p.kind === "mandelbrot" ? zoomAt() : 1;
        const span = (p.kind === "mandelbrot" ? 3.2 : 3.4) / z;
        const c0: XY = p.kind === "mandelbrot" ? [tgt[0] + (-0.5 - tgt[0]) / z, tgt[1] + (0 - tgt[1]) / z] : [0, 0];
        const asp = rows / cols;
        const maxIt = Math.round(80 + 40 * Math.log2(z + 1));
        const ja = clock() * 0.35 * st.speed;
        const jc: XY = [0.7885 * Math.cos(ja), 0.7885 * Math.sin(ja)];
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const x0 = c0[0] + ((i + 0.5) / cols - 0.5) * span, y0 = c0[1] + ((j + 0.5) / rows - 0.5) * span * asp;
            let x = p.kind === "mandelbrot" ? 0 : x0, y = p.kind === "mandelbrot" ? 0 : y0;
            const cx = p.kind === "mandelbrot" ? x0 : jc[0], cy = p.kind === "mandelbrot" ? y0 : jc[1];
            let n = 0, x2 = x * x, y2 = y * y;
            while (n < maxIt && x2 + y2 < 256) {
              y = 2 * x * y + cy;
              x = x2 - y2 + cx;
              x2 = x * x;
              y2 = y * y;
              n++;
            }
            const o = (j * cols + i) * 4;
            if (n >= maxIt) {
              data[o] = 0;
              data[o + 1] = 0;
              data[o + 2] = 0;
              data[o + 3] = 255;
              continue;
            }
            // Smooth iteration count ν = n + 1 − log₂(log|z|).
            const nu = n + 1 - Math.log2(Math.log(Math.sqrt(x2 + y2)));
            const c = colorAt(nu / 28);
            data[o] = c[0];
            data[o + 1] = c[1];
            data[o + 2] = c[2];
            data[o + 3] = 255;
          }
      };
      nodes.push(<Raster x={A.cx} y={A.cy} w={W} h={H} res={res} paint={paint} />);
      if (p.kind === "mandelbrot") {
        nodes.push(
          <Node>
            <Rect x={A.x + 170 * k} y={A.y + A.h - 40 * k} width={320 * k} height={52 * k} radius={12 * k} fill="rgba(0,0,0,0.55)" />
            <Txt text={() => `phóng to ×${num(zoomAt(), 0)}`} x={A.x + 170 * k} y={A.y + A.h - 40 * k} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill="#FFFFFF" />
          </Node>,
        );
        show(label(ctx, "zₙ₊₁ = zₙ² + c — điểm c thuộc tập Mandelbrot nếu dãy không chạy ra vô cùng", { x: A.cx, y: A.y + 24 * k, size: 25, fill: "#FFFFFF" }));
      } else {
        nodes.push(<Txt text={() => `c = ${num(0.7885 * Math.cos(clock() * 0.35 * st.speed), 3)} + ${num(0.7885 * Math.sin(clock() * 0.35 * st.speed), 3)}i`} x={A.x + 20 * k} y={A.y + A.h - 30 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill="#FFFFFF" />);
        show(label(ctx, "Tập Julia: cùng công thức z² + c, cố định c và cho z chạy", { x: A.cx, y: A.y + 24 * k, size: 25, fill: "#FFFFFF" }));
      }
    } else if (p.kind === "sierpinski") {
      const s = Math.min(A.w * 0.8, A.h * 1.05);
      const top: XY = [A.cx, A.y + A.h * 0.04], left: XY = [A.cx - s / 2, top[1] + s * 0.866], right: XY = [A.cx + s / 2, top[1] + s * 0.866];
      const lvl = () => Math.min(p.depth, Math.floor(clamp((clock() - 0.6) / (D * 0.7), 0, 1) * (p.depth + 1)));
      const r = rng(L.seed + 3);
      const chaos: XY[] = [];
      let q: XY = [A.cx, A.cy];
      const V = [top, left, right];
      for (let i = 0; i < 9000 * L.q + 2000; i++) {
        const v = V[Math.floor(r() * 3)];
        q = [(q[0] + v[0]) / 2, (q[1] + v[1]) / 2];
        if (i > 10) chaos.push(q);
      }
      nodes.push(
        <Draw
          paint={(g) => {
            const draw = (a: XY, b: XY, c: XY, n: number, d: number) => {
              if (n === 0) {
                g.fillStyle = mix(L.primary, L.accent, d / Math.max(1, p.depth));
                g.beginPath();
                g.moveTo(...a);
                g.lineTo(...b);
                g.lineTo(...c);
                g.closePath();
                g.fill();
                return;
              }
              const ab: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc: XY = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca: XY = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
              draw(a, ab, ca, n - 1, d + 1);
              draw(ab, b, bc, n - 1, d + 1);
              draw(ca, bc, c, n - 1, d + 1);
            };
            draw(top, left, right, lvl(), 0);
            // Chaos game points (overlay after the last level).
            const cg = clamp((clock() - D * 0.75) / (D * 0.2), 0, 1);
            if (cg > 0) {
              g.fillStyle = "#FFFFFF";
              const n = Math.floor(chaos.length * cg);
              for (let i = 0; i < n; i++) g.fillRect(chaos[i][0], chaos[i][1], 1.6 * k, 1.6 * k);
            }
          }}
        />,
      );
      nodes.push(<Txt text={() => `bậc ${lvl()} · ${3 ** lvl()} tam giác · diện tích còn ${num(100 * 0.75 ** lvl(), 1)} %`} x={A.x + 20 * k} y={A.y + A.h - 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.text} />);
      show(label(ctx, "Trò chơi hỗn loạn: nhảy nửa đường tới một đỉnh ngẫu nhiên → vẫn ra tam giác Sierpinski", { x: A.cx, y: A.y + 24 * k, size: 23, fill: L.dim }));
    } else if (p.kind === "koch") {
      const s = Math.min(A.w * 0.55, A.h * 0.8);
      const c: XY = [A.cx, A.cy + s * 0.06];
      const base: XY[] = [0, 1, 2].map((i) => [c[0] + Math.cos(-Math.PI / 2 + (i * TAU) / 3) * s * 0.58, c[1] + Math.sin(-Math.PI / 2 + (i * TAU) / 3) * s * 0.58] as XY);
      const koch = (pts: XY[]): XY[] => {
        const out: XY[] = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const dx = (b[0] - a[0]) / 3, dy = (b[1] - a[1]) / 3;
          const p1: XY = [a[0] + dx, a[1] + dy], p2: XY = [a[0] + 2 * dx, a[1] + 2 * dy];
          // Peak: rotate (dx, dy) by −60° (outward for a clockwise-on-screen triangle).
          const ang = -Math.PI / 3;
          const pk: XY = [p1[0] + dx * Math.cos(ang) - dy * Math.sin(ang), p1[1] + dx * Math.sin(ang) + dy * Math.cos(ang)];
          out.push(a, p1, pk, p2);
        }
        return out;
      };
      const levels: XY[][] = [base];
      for (let i = 0; i < p.depth; i++) levels.push(koch(levels[i]));
      const lvl = () => Math.min(p.depth, Math.floor(clamp((clock() - 0.6) / (D * 0.75), 0, 1) * (p.depth + 1)));
      nodes.push(
        <Draw
          paint={(g) => {
            const pts = levels[lvl()];
            g.fillStyle = alpha(L.secondary, 0.18);
            g.strokeStyle = L.secondary;
            g.lineWidth = L.lw(3 * k);
            g.shadowColor = L.secondary;
            g.shadowBlur = 12 * k * L.visual.glow;
            g.beginPath();
            pts.forEach((q, i) => (i ? g.lineTo(...q) : g.moveTo(...q)));
            g.closePath();
            g.fill();
            g.stroke();
            g.shadowBlur = 0;
          }}
        />,
      );
      nodes.push(<Txt text={() => `bậc ${lvl()} · ${3 * 4 ** lvl()} cạnh · chu vi ×${num((4 / 3) ** lvl(), 2)} · diện tích → 8/5 tam giác ban đầu`} x={A.cx} y={A.y + A.h - 20 * k} fontFamily={FONT} fontWeight={800} fontSize={25 * k} fill={L.text} />);
      show(label(ctx, "Chu vi tăng vô hạn nhưng diện tích hữu hạn", { x: A.cx, y: A.y + 24 * k, size: 27, fill: L.accent }));
    } else {
      const base: XY = [A.cx, A.y + A.h - 10 * k], len0 = A.h * 0.28;
      const grow = () => clamp((clock() - 0.4) / (D * 0.6), 0, 1) * p.depth;
      nodes.push(
        <Draw
          paint={(g) => {
            const sway = 0.42 + 0.12 * Math.sin(clock() * 0.8 * st.speed);
            const gr = grow();
            const branch = (x: number, y: number, a: number, l: number, d: number) => {
              const u = clamp(gr - d, 0, 1);
              if (u <= 0) return;
              const x2 = x + Math.cos(a) * l * u, y2 = y + Math.sin(a) * l * u;
              g.strokeStyle = mix("#8B5A2B", L.primary, d / p.depth);
              g.lineWidth = Math.max(1, (p.depth - d + 1) * 2.2) * k;
              g.lineCap = "round";
              g.beginPath();
              g.moveTo(x, y);
              g.lineTo(x2, y2);
              g.stroke();
              if (u >= 1 && d < p.depth) {
                branch(x2, y2, a - sway, l * 0.72, d + 1);
                branch(x2, y2, a + sway * 0.85, l * 0.68, d + 1);
              }
              if (d === p.depth && u >= 1) {
                g.fillStyle = alpha(L.accent, 0.7);
                g.beginPath();
                g.arc(x2, y2, 4 * k, 0, TAU);
                g.fill();
              }
            };
            branch(base[0], base[1], -Math.PI / 2, len0, 0);
          }}
        />,
      );
      show(label(ctx, `Mỗi nhánh tách thành 2 nhánh nhỏ hơn → sau ${p.depth} lần: ${2 ** p.depth} ngọn`, { x: A.cx, y: A.y + 24 * k, size: 26, fill: L.text }));
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
    void smooth;
  },
});
