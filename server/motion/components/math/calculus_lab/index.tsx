// Calculus. taylor: a function and its Taylor polynomials around 0, one more term at a time — the
// approximation hugs the curve over a wider and wider interval (sin x, eˣ, ln(1 + x) whose series
// only converges for |x| < 1). slope_field: the direction field of a differential equation dy/dx =
// f(x, y) with solution curves integrated by RK4 from several starting points. limit: (sin x)/x as
// x → 0 — the point slides toward the hole at 0 while the table of values closes in on 1. revolution:
// the volume of a solid of revolution by discs — y = f(x) spun about the x-axis, discs of volume
// πf(x)²Δx summed and compared with the exact integral.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "taylor" | "slope_field" | "limit" | "revolution";
  fn: "sin" | "exp" | "ln1p";
  ode: "logistic" | "decay" | "xy";
  terms: number;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "calculus");
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
    const INK = L.text, CF = L.primary, CA = L.accent;
    // Graph frame: x in [x0, x1], y in [y0, y1].
    const frame = (x0: number, x1: number, y0: number, y1: number, box = { x: A.x + 20 * k, y: A.y + 70 * k, w: A.w - 40 * k, h: A.h - 110 * k }) => {
      const X = (x: number) => box.x + ((x - x0) / (x1 - x0)) * box.w, Y = (y: number) => box.y + box.h - ((y - y0) / (y1 - y0)) * box.h;
      const axes = (g: CanvasRenderingContext2D) => {
        g.strokeStyle = alpha(INK, 0.4);
        g.lineWidth = 2 * k;
        g.beginPath();
        g.moveTo(box.x, Y(0));
        g.lineTo(box.x + box.w, Y(0));
        g.moveTo(X(0), box.y);
        g.lineTo(X(0), box.y + box.h);
        g.stroke();
      };
      const plot = (g: CanvasRenderingContext2D, f: (x: number) => number, c: string, w = 4, xa = x0, xb = x1) => {
        g.strokeStyle = c;
        g.lineWidth = L.lw(w * k);
        g.beginPath();
        let pen = false;
        for (let i = 0; i <= 400; i++) {
          const x = xa + ((xb - xa) * i) / 400, y = f(x);
          if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) {
            pen = false;
            continue;
          }
          if (pen) g.lineTo(X(x), Y(clamp(y, y0 - 1, y1 + 1)));
          else g.moveTo(X(x), Y(clamp(y, y0 - 1, y1 + 1)));
          pen = true;
        }
        g.stroke();
      };
      return { X, Y, axes, plot, box };
    };

    if (p.mode === "taylor") {
      const F = p.fn === "sin" ? Math.sin : p.fn === "exp" ? Math.exp : (x: number) => (x > -1 ? Math.log(1 + x) : NaN);
      const coef = (n: number) => (p.fn === "sin" ? (n % 2 ? (((n - 1) / 2) % 2 ? -1 : 1) / fact(n) : 0) : p.fn === "exp" ? 1 / fact(n) : n === 0 ? 0 : ((n % 2 ? 1 : -1) / n));
      const [x0, x1, y0, y1] = p.fn === "sin" ? [-9, 9, -3, 3] : p.fn === "exp" ? [-4, 3, -2, 12] : [-1.5, 2.5, -3, 2];
      const fr = frame(x0, x1, y0, y1);
      // Number of non-zero terms shown grows over the clip.
      const order = () => {
        const want = clamp((clock() - 0.8) / (D * 0.75), 0, 1) * p.terms;
        let n = 0, cnt = 0;
        while (cnt < Math.ceil(want) && n < 40) {
          if (coef(n) !== 0) cnt++;
          n++;
        }
        return Math.max(1, n);
      };
      const T = (x: number, n: number) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += coef(i) * x ** i;
        return s;
      };
      nodes.push(
        <Draw
          paint={(g) => {
            fr.axes(g);
            if (p.fn === "ln1p") {
              g.fillStyle = alpha(CA, 0.08);
              g.fillRect(fr.X(-1), fr.box.y, fr.X(1) - fr.X(-1), fr.box.h);
            }
            fr.plot(g, F, CF, 5, p.fn === "ln1p" ? -0.99 : x0);
            const n = order();
            fr.plot(g, (x) => T(x, n), CA, 3.5);
            const terms: string[] = [];
            for (let i = 0; i < n; i++) {
              const c = coef(i);
              if (!c) continue;
              const d = p.fn === "ln1p" ? `${i}` : `${i}!`;
              terms.push(`${terms.length ? (c > 0 ? " + " : " − ") : c < 0 ? "−" : ""}${i === 0 ? "1" : `x${i > 1 ? toSup(i) : ""}${p.fn === "exp" || p.fn === "sin" ? (i > 1 ? `/${d}` : "") : i > 1 ? `/${i}` : ""}`}`);
            }
            g.font = `800 ${24 * k}px ${FONT}`;
            g.fillStyle = CA;
            g.textAlign = "left";
            g.fillText(`P(x) = ${terms.join("")}`.slice(0, 90), A.x + 20 * k, A.y + 32 * k);
          }}
        />,
      );
      show(label(ctx, p.fn === "ln1p" ? "Chuỗi của ln(1 + x) chỉ hội tụ khi |x| < 1 (vùng tô sáng)" : "Thêm số hạng → đa thức bám sát hàm trên khoảng ngày càng rộng", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: INK }));
    } else if (p.mode === "slope_field") {
      const f = (x: number, y: number) => (p.ode === "logistic" ? y * (1 - y / 4) : p.ode === "decay" ? -0.6 * y : x - y);
      const [x0, x1, y0, y1] = p.ode === "logistic" ? [0, 10, -0.5, 5.5] : p.ode === "decay" ? [0, 8, -4, 4] : [-4, 4, -4, 4];
      const fr = frame(x0, x1, y0, y1);
      const starts = p.ode === "logistic" ? [0.1, 0.5, 1.5, 5, 3] : p.ode === "decay" ? [-3.5, -2, 1, 2.5, 3.8] : [-3, -1, 0, 1.5, 3];
      const sol = starts.map((y) => {
        const pts: XY[] = [];
        let x = x0, yy = y;
        const h = (x1 - x0) / 400;
        for (let i = 0; i <= 400; i++) {
          pts.push([x, yy]);
          const k1 = f(x, yy), k2 = f(x + h / 2, yy + (h / 2) * k1), k3 = f(x + h / 2, yy + (h / 2) * k2), k4 = f(x + h, yy + h * k3);
          yy += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
          x += h;
        }
        return pts;
      });
      nodes.push(
        <Draw
          paint={(g) => {
            fr.axes(g);
            const nx = 24, ny = 14;
            g.strokeStyle = alpha(INK, 0.45);
            g.lineWidth = 2 * k;
            for (let i = 0; i <= nx; i++)
              for (let j = 0; j <= ny; j++) {
                const x = x0 + ((x1 - x0) * i) / nx, y = y0 + ((y1 - y0) * j) / ny;
                const sl = f(x, y);
                // Screen-space direction.
                const dx = fr.X(x + 1) - fr.X(x), dy = fr.Y(y + sl) - fr.Y(y), m = Math.hypot(dx, dy) || 1;
                const l = 12 * k;
                g.beginPath();
                g.moveTo(fr.X(x) - (dx / m) * l, fr.Y(y) - (dy / m) * l);
                g.lineTo(fr.X(x) + (dx / m) * l, fr.Y(y) + (dy / m) * l);
                g.stroke();
              }
            const u = clamp((clock() - 1) / (D * 0.6), 0, 1);
            sol.forEach((pts, si) => {
              g.strokeStyle = mix(CF, CA, si / (sol.length - 1));
              g.lineWidth = L.lw(4 * k);
              g.beginPath();
              const n = Math.floor(u * (pts.length - 1));
              for (let i = 0; i <= n; i++) (i ? g.lineTo(fr.X(pts[i][0]), fr.Y(pts[i][1])) : g.moveTo(fr.X(pts[i][0]), fr.Y(pts[i][1])));
              g.stroke();
            });
          }}
        />,
      );
      show(label(ctx, p.ode === "logistic" ? "dy/dx = y(1 − y/4): tăng trưởng logistic, mọi nghiệm dương tiến về sức chứa 4" : p.ode === "decay" ? "dy/dx = −0,6y: phân rã mũ, mọi nghiệm tiến về 0" : "dy/dx = x − y: các nghiệm tiến sát đường tiệm cận y = x − 1", { x: A.cx, y: A.y + 28 * k, size: 25, fill: INK }));
    } else if (p.mode === "limit") {
      const F = (x: number) => Math.sin(x) / x;
      const fr = frame(-10, 10, -0.4, 1.3, { x: A.x + 20 * k, y: A.y + 60 * k, w: A.w * (A.wide ? 0.6 : 1) - 40 * k, h: A.h * (A.wide ? 1 : 0.6) - 100 * k });
      const xt = () => 4 * Math.pow(0.02, smooth(clamp((clock() - 1) / (D - 2.5), 0, 1)));
      nodes.push(
        <Draw
          paint={(g) => {
            fr.axes(g);
            fr.plot(g, F, CF, 4.5);
            g.strokeStyle = CF;
            g.fillStyle = L.bg;
            g.lineWidth = 3 * k;
            g.beginPath();
            g.arc(fr.X(0), fr.Y(1), 9 * k, 0, TAU);
            g.fill();
            g.stroke();
            for (const s of [-1, 1]) {
              const x = s * xt();
              g.fillStyle = CA;
              g.beginPath();
              g.arc(fr.X(x), fr.Y(F(x)), 9 * k, 0, TAU);
              g.fill();
            }
            // Table of values.
            const tx = A.wide ? A.x + A.w * 0.66 : A.x + 40 * k, ty = A.wide ? A.y + 100 * k : A.y + A.h * 0.66;
            g.font = `800 ${26 * k}px ${FONT}`;
            g.textAlign = "left";
            g.fillStyle = INK;
            g.fillText("x", tx, ty);
            g.fillText("sin x / x", tx + 180 * k, ty);
            const xs = [1, 0.5, 0.1, 0.01, 0.001];
            const shownN = Math.ceil(clamp((clock() - 1) / (D - 2.5), 0, 1) * xs.length);
            xs.slice(0, shownN).forEach((x, i) => {
              g.fillStyle = L.dim;
              g.fillText(String(x).replace(".", ","), tx, ty + (i + 1) * 40 * k);
              g.fillStyle = CA;
              g.fillText(num(F(x), 6), tx + 180 * k, ty + (i + 1) * 40 * k);
            });
          }}
        />,
      );
      show(label(ctx, "lim (x→0) sin x / x = 1 — hàm không xác định tại 0 nhưng tiến tới 1", { x: A.cx, y: A.y + 24 * k, size: 27, fill: INK }));
    } else {
      // Volume of revolution: y = √x on [0, 4] about the x-axis; exact V = π∫x dx = 8π.
      const f = (x: number) => Math.sqrt(x);
      const a0 = 0, b0 = 4, exact = 8 * Math.PI;
      const n = () => Math.max(2, Math.round(2 + clamp((clock() - 1) / (D - 3), 0, 1) * 30));
      const box = { x: A.x + 60 * k, y: A.y + 80 * k, w: A.w * (A.wide ? 0.62 : 0.9) - 60 * k, h: A.h * (A.wide ? 0.8 : 0.55) };
      const sx = box.w / 4.6, X = (x: number) => box.x + x * sx, cy = box.y + box.h / 2, Y = (y: number) => cy - y * sx;
      nodes.push(
        <Draw
          paint={(g) => {
            g.strokeStyle = alpha(INK, 0.45);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(X(-0.2), cy);
            g.lineTo(X(4.5), cy);
            g.stroke();
            const N = n(), dx = (b0 - a0) / N;
            // Discs as ellipses (seen at a slant), shaded.
            for (let i = 0; i < N; i++) {
              const x = a0 + (i + 0.5) * dx, r = f(x) * sx;
              const gr = g.createLinearGradient(0, cy - r, 0, cy + r);
              gr.addColorStop(0, mix(CF, "#FFFFFF", 0.35));
              gr.addColorStop(1, mix(CF, "#000000", 0.35));
              g.fillStyle = gr;
              g.globalAlpha = 0.85;
              g.fillRect(X(a0 + i * dx), cy - r, dx * sx, 2 * r);
              g.globalAlpha = 1;
              g.strokeStyle = alpha("#FFFFFF", 0.5);
              g.lineWidth = 1.5 * k;
              g.beginPath();
              g.ellipse(X(a0 + (i + 1) * dx), cy, Math.max(2, r * 0.25), r, 0, 0, TAU);
              g.stroke();
            }
            // The curve and its mirror.
            g.strokeStyle = CA;
            g.lineWidth = L.lw(4 * k);
            for (const s of [1, -1]) {
              g.beginPath();
              for (let i = 0; i <= 200; i++) {
                const x = (4 * i) / 200;
                if (i) g.lineTo(X(x), cy - s * f(x) * sx);
                else g.moveTo(X(x), cy - s * f(x) * sx);
              }
              g.stroke();
            }
            let V = 0;
            for (let i = 0; i < N; i++) V += Math.PI * f(a0 + (i + 0.5) * dx) ** 2 * dx;
            const tx = A.wide ? A.x + A.w * 0.68 : A.x + 40 * k, ty = A.wide ? A.y + 140 * k : A.y + A.h * 0.7;
            g.font = `800 ${28 * k}px ${FONT}`;
            g.textAlign = "left";
            g.fillStyle = INK;
            g.fillText(`${N} đĩa: V ≈ ${num(V, 3)}`, tx, ty);
            g.fillStyle = CA;
            g.fillText(`tích phân: V = π∫₀⁴ x dx = 8π ≈ ${num(exact, 3)}`, tx, ty + 46 * k);
            void Y;
          }}
        />,
      );
      show(label(ctx, "Quay y = √x quanh trục Ox: V = π∫ f(x)² dx — càng nhiều đĩa càng sát", { x: A.cx, y: A.y + 24 * k, size: 26, fill: INK }));
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
  },
});

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
function toSup(n: number) {
  return String(n)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("");
}
