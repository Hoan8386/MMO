// Chaos and emergent patterns. lorenz: the Lorenz system (σ = 10, ρ = 28, β = 8/3) integrated with
// RK4 — the butterfly-shaped strange attractor traced in 3D while the camera turns; optionally a second
// trajectory starting 10⁻⁵ away, which separates completely (sensitive dependence). automaton: an
// elementary cellular automaton (rule 30, 90 or 110) growing row by row from one cell. life: Conway's
// Game of Life from a seeded soup plus gliders — births, deaths and travelling patterns.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "lorenz" | "automaton" | "life";
  twin: boolean;
  rule: number;
  labels: boolean;
}

type V3 = [number, number, number];
const TAU = Math.PI * 2;

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

    if (p.mode === "lorenz") {
      const steps = 9000, dt = 0.005;
      const f = (v: V3): V3 => [10 * (v[1] - v[0]), v[0] * (28 - v[2]) - v[1], v[0] * v[1] - (8 / 3) * v[2]];
      const integ = (s0: V3) => {
        const out = new Float32Array(steps * 3);
        let s = s0;
        for (let i = 0; i < steps; i++) {
          out.set(s, i * 3);
          const k1 = f(s), k2 = f(s.map((v, j) => v + (dt / 2) * k1[j]) as V3), k3 = f(s.map((v, j) => v + (dt / 2) * k2[j]) as V3), k4 = f(s.map((v, j) => v + dt * k3[j]) as V3);
          s = s.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])) as V3;
        }
        return out;
      };
      const a = integ([1, 1, 1]), b = p.twin ? integ([1.00001, 1, 1]) : null;
      const cx = A.cx, cy = A.cy + A.h * 0.38, S = Math.min(A.w, A.h) / 62;
      const shown = () => Math.floor(clamp((clock() - 0.5) / (D - 1), 0, 1) * (steps - 1));
      const proj = (x: number, y: number, z: number): [number, number] => {
        const t = clock() * 0.18 * st.speed;
        const xr = x * Math.cos(t) - y * Math.sin(t), yr = x * Math.sin(t) + y * Math.cos(t);
        const pz = 120 / (120 + yr);
        return [cx + xr * S * pz, cy - z * S * pz];
      };
      const drawTraj = (g: CanvasRenderingContext2D, arr: Float32Array, c1: string, c2: string) => {
        const n = shown();
        for (let i = 1; i <= n; i += 2) {
          const u = i / steps;
          g.strokeStyle = mix(c1, c2, u);
          g.globalAlpha = 0.35 + 0.65 * Math.max(0, 1 - (n - i) / 3000);
          const [x0, y0] = proj(arr[(i - 1) * 3], arr[(i - 1) * 3 + 1], arr[(i - 1) * 3 + 2]);
          const [x1, y1] = proj(arr[(i + 1) * 3 - 3], arr[(i + 1) * 3 - 2], arr[(i + 1) * 3 - 1]);
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
        }
        g.globalAlpha = 1;
        const [hx, hy] = proj(arr[n * 3], arr[n * 3 + 1], arr[n * 3 + 2]);
        g.fillStyle = "#FFFFFF";
        g.shadowColor = c2;
        g.shadowBlur = 16 * k;
        g.beginPath();
        g.arc(hx, hy, 7 * k, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
      };
      nodes.push(
        <Draw
          paint={(g) => {
            g.lineWidth = L.lw(1.8 * k);
            drawTraj(g, a, L.primary, L.secondary);
            if (b) drawTraj(g, b, L.highlight, L.accent);
          }}
        />,
      );
      if (b)
        nodes.push(
          <Txt
            text={() => {
              const n = shown();
              const d = Math.hypot(a[n * 3] - b[n * 3], a[n * 3 + 1] - b[n * 3 + 1], a[n * 3 + 2] - b[n * 3 + 2]);
              return `khoảng cách hai quỹ đạo: ${d < 0.01 ? d.toExponential(1) : num(d, 2)}`;
            }}
            x={A.x + 20 * k}
            y={A.y + A.h - 24 * k}
            offsetX={-1}
            fontFamily={FONT}
            fontWeight={800}
            fontSize={26 * k}
            fill={L.text}
          />,
        );
      show(label(ctx, "dx/dt = σ(y − x) · dy/dt = x(ρ − z) − y · dz/dt = xy − βz", { x: A.x + 20 * k, y: A.y + 24 * k, size: 25, align: "left", fill: L.text }));
      if (b) show(label(ctx, "Lệch 0,00001 lúc đầu → sau vài vòng hai quỹ đạo hoàn toàn khác (hiệu ứng cánh bướm)", { x: A.x + 20 * k, y: A.y + 62 * k, size: 23, align: "left", fill: L.dim }));
    } else if (p.mode === "automaton") {
      const rule = [30, 90, 110].includes(p.rule) ? p.rule : 30;
      const cols = Math.round(A.wide ? 241 : 151), rows = Math.round((cols * A.h) / A.w);
      const cell = Math.min(A.w / cols, A.h / rows);
      const grid: Uint8Array[] = [];
      let row = new Uint8Array(cols);
      row[rule === 110 ? cols - 2 : Math.floor(cols / 2)] = 1;
      for (let r = 0; r < rows; r++) {
        grid.push(row);
        const nx = new Uint8Array(cols);
        for (let i = 0; i < cols; i++) {
          const l = row[(i - 1 + cols) % cols], c = row[i], rr = row[(i + 1) % cols];
          nx[i] = (rule >> ((l << 2) | (c << 1) | rr)) & 1;
        }
        row = nx;
      }
      const gx = A.cx - (cols * cell) / 2, gy = A.y;
      const shownRows = () => Math.floor(clamp((clock() - 0.5) / (D - 1.5), 0, 1) * rows);
      nodes.push(
        <Draw
          paint={(g) => {
            const n = shownRows();
            for (let r = 0; r < n; r++)
              for (let i = 0; i < cols; i++)
                if (grid[r][i]) {
                  g.fillStyle = mix(L.primary, L.accent, r / rows);
                  g.fillRect(gx + i * cell, gy + r * cell, cell + 0.5, cell + 0.5);
                }
          }}
        />,
      );
      // The rule's 8 cases.
      show(
        <Draw
          paint={(g) => {
            const s = 16 * k, x0 = A.x + 10 * k, y0 = A.y + A.h - 70 * k;
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(x0 - 8 * k, y0 - 30 * k, 8 * (s * 3.6) + 16 * k, s * 3 + 50 * k);
            g.font = `700 ${18 * k}px ${FONT}`;
            g.fillStyle = "#FFFFFF";
            g.fillText(`Luật ${rule}`, x0, y0 - 10 * k);
            for (let c = 7; c >= 0; c--) {
              const x = x0 + (7 - c) * s * 3.6;
              for (let j = 0; j < 3; j++) {
                g.fillStyle = (c >> (2 - j)) & 1 ? L.accent : "rgba(255,255,255,0.15)";
                g.fillRect(x + j * s, y0, s - 2, s - 2);
              }
              g.fillStyle = (rule >> c) & 1 ? L.accent : "rgba(255,255,255,0.15)";
              g.fillRect(x + s, y0 + s * 1.3, s - 2, s - 2);
            }
          }}
        />,
      );
      show(label(ctx, rule === 30 ? "Luật 30: một quy tắc đơn giản sinh ra mẫu hỗn loạn" : rule === 90 ? "Luật 90: tam giác Sierpinski xuất hiện" : "Luật 110: đủ mạnh để tính toán mọi thứ (Turing-complete)", { x: A.cx, y: A.y + A.h - 18 * k, size: 25, fill: L.text }));
    } else {
      // Game of Life on a torus.
      const cols = A.wide ? 96 : 60, rows = Math.round((cols * A.h) / A.w);
      const cell = Math.min(A.w / cols, A.h / rows);
      const R = rng(L.seed + 5);
      let g0 = new Uint8Array(cols * rows);
      for (let i = 0; i < g0.length; i++) g0[i] = R() < 0.18 ? 1 : 0;
      // A few gliders in a clear band.
      for (let gli = 0; gli < 4; gli++) {
        const x = 4 + gli * 12, y = 3;
        for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) g0[(y + dy) * cols + x + dx] = 1;
      }
      const gens = Math.round(D * 8);
      const hist: Uint8Array[] = [g0];
      for (let n = 0; n < gens; n++) {
        const nx = new Uint8Array(cols * rows);
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) s += g0[((y + dy + rows) % rows) * cols + ((x + dx + cols) % cols)];
            const alive = g0[y * cols + x];
            nx[y * cols + x] = (alive && (s === 2 || s === 3)) || (!alive && s === 3) ? 1 : 0;
          }
        hist.push(nx);
        g0 = nx;
      }
      const gx = A.cx - (cols * cell) / 2, gy = A.cy - (rows * cell) / 2;
      const gen = () => Math.min(gens, Math.floor(clamp(clock() - 0.5, 0, D) * 8 * st.speed));
      nodes.push(
        <Draw
          paint={(g) => {
            const n = gen(), cur = hist[n], prev = hist[Math.max(0, n - 1)];
            for (let i = 0; i < cur.length; i++) {
              if (!cur[i]) continue;
              const x = i % cols, y = Math.floor(i / cols);
              g.fillStyle = prev[i] ? L.primary : L.accent; // newborn cells highlighted
              g.fillRect(gx + x * cell + 1, gy + y * cell + 1, cell - 2, cell - 2);
            }
          }}
        />,
      );
      nodes.push(<Txt text={() => `thế hệ ${gen()} · ${hist[gen()].reduce((a, b) => a + b, 0)} tế bào sống`} x={A.x + 20 * k} y={A.y + A.h - 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.text} />);
      show(label(ctx, "Sống tiếp nếu có 2–3 hàng xóm sống; sinh ra nếu đúng 3", { x: A.cx, y: A.y + 24 * k, size: 26, fill: L.text }));
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
    yield* world().opacity(1, 0.5, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void Line;
    void Rect;
    void alpha;
  },
});
