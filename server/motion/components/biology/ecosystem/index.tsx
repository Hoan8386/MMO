// Ecology. predator_prey: the Lotka–Volterra equations dx/dt = αx − βxy, dy/dt = δxy − γy integrated
// with RK4 — rabbits and foxes as populations of icons in a meadow, the two curves oscillating out of
// phase (predators lag prey), and the closed orbit in the phase plane. pyramid: the energy pyramid —
// producers to apex predators, only ~10 % of the energy passing up each level, the rest lost as heat.
// food_web: who eats whom — organisms appear and arrows of energy flow link them.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "predator_prey" | "pyramid" | "food_web";
  prey0: number;
  predators0: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "ecology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const R0 = rng(L.seed + 71);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    const PREY = "#FFD166", PRED = "#FF6B35";

    if (p.mode === "predator_prey") {
      // ---- Lotka–Volterra (α 1.1, β 0.04, δ 0.01, γ 0.4), ~2 cycles over the clip.
      const al = 1.1, be = 0.04, de = 0.01, ga = 0.4;
      const fps = 30, frames = Math.ceil(D * fps) + 1, Tsim = 30;
      const xs = new Float32Array(frames), ys = new Float32Array(frames);
      let s = [p.prey0, p.predators0];
      const f = (v: number[]) => [al * v[0] - be * v[0] * v[1], de * v[0] * v[1] - ga * v[1]];
      const h = (Tsim * st.speed) / (frames - 1) / 10;
      for (let i = 0; i < frames; i++) {
        xs[i] = s[0];
        ys[i] = s[1];
        for (let j = 0; j < 10; j++) {
          const k1 = f(s), k2 = f(s.map((v, q) => v + (h / 2) * k1[q])), k3 = f(s.map((v, q) => v + (h / 2) * k2[q])), k4 = f(s.map((v, q) => v + h * k3[q]));
          s = s.map((v, q) => v + (h / 6) * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q]));
        }
      }
      const fr = () => Math.min(frames - 1, Math.round(clock() * fps));
      const xMax = Math.max(...xs) * 1.1, yMax = Math.max(...ys) * 1.1;
      // Meadow with icons (count scaled), left/top.
      const MW = A.wide ? A.w * 0.42 : A.w, MH = A.wide ? A.h : A.h * 0.45;
      const spots = Array.from({ length: 160 }, () => [A.x + 20 * k + R0() * (MW - 40 * k), A.y + 20 * k + R0() * (MH - 40 * k), R0() * TAU]);
      nodes.push(
        <Draw
          paint={(g) => {
            g.fillStyle = alpha("#21E6A1", 0.08);
            g.fillRect(A.x, A.y, MW, MH);
            const i = fr();
            const nPrey = Math.round((xs[i] / xMax) * 120), nPred = Math.round((ys[i] / yMax) * 30);
            for (let j = 0; j < nPrey; j++) {
              const [x, y, a] = spots[j];
              const hop = Math.abs(Math.sin(clock() * 4 + a)) * 5 * k;
              g.fillStyle = PREY;
              g.beginPath();
              g.ellipse(x, y - hop, 9 * k, 7 * k, 0, 0, TAU);
              g.fill();
              g.beginPath();
              g.ellipse(x + 6 * k, y - hop - 9 * k, 2.5 * k, 7 * k, 0.3, 0, TAU);
              g.fill();
            }
            for (let j = 0; j < nPred; j++) {
              const [x, y, a] = spots[159 - j];
              const dx = Math.cos(clock() * 0.7 + a) * 14 * k;
              g.fillStyle = PRED;
              g.beginPath();
              g.moveTo(x + dx - 14 * k, y + 8 * k);
              g.lineTo(x + dx + 14 * k, y + 8 * k);
              g.lineTo(x + dx + 4 * k, y - 12 * k);
              g.lineTo(x + dx - 4 * k, y - 12 * k);
              g.fill();
            }
          }}
        />,
      );
      // Time series and phase plane.
      const gx = A.wide ? A.x + A.w * 0.47 : A.x + 20 * k, gw = A.wide ? A.w * 0.5 : A.w - 40 * k;
      const gy = A.wide ? A.y + 20 * k : A.y + MH + 30 * k, gh = A.wide ? A.h * 0.55 : A.h * 0.32;
      const curve = (arr: Float32Array, mx: number) => (): XY[] => {
        const n = fr(), pts: XY[] = [];
        for (let i = 0; i <= n; i += 2) pts.push([gx + (i / (frames - 1)) * gw, gy + gh - (arr[i] / mx) * gh]);
        return pts.length > 1 ? pts : [[gx, gy + gh], [gx + 1, gy + gh]];
      };
      nodes.push(
        <Node>
          <Line points={[[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]]} stroke={L.dim} lineWidth={2 * k} />
          <Line points={curve(xs, xMax)} stroke={PREY} lineWidth={L.lw(4 * k)} {...L.glow(PREY, 8 * k)} />
          <Line points={curve(ys, yMax)} stroke={PRED} lineWidth={L.lw(4 * k)} {...L.glow(PRED, 8 * k)} />
          <Txt text={() => `Thỏ (con mồi): ${num(xs[fr()], 0)}`} x={gx + 10 * k} y={gy + 16 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={PREY} />
          <Txt text={() => `Cáo (thú săn): ${num(ys[fr()], 0)}`} x={gx + 10 * k} y={gy + 48 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={PRED} />
          <Txt text="thời gian" x={gx + gw} y={gy + gh + 24 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
        </Node>,
      );
      if (A.wide) {
        const px = gx, py = gy + gh + 60 * k, pw = gw * 0.45, phh = A.y + A.h - py;
        show(
          <Node>
            <Line points={[[px, py], [px, py + phh], [px + pw, py + phh]]} stroke={L.dim} lineWidth={2 * k} />
            <Line
              points={() => {
                const n = fr(), pts: XY[] = [];
                for (let i = 0; i <= n; i += 2) pts.push([px + (xs[i] / xMax) * pw, py + phh - (ys[i] / yMax) * phh]);
                return pts.length > 1 ? pts : [[px, py + phh], [px + 1, py + phh]];
              }}
              stroke={L.secondary}
              lineWidth={3 * k}
            />
            <Txt text="mặt phẳng pha: quỹ đạo khép kín" x={px + pw + 20 * k} y={py + phh / 2} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} />
          </Node>,
        );
      }
      show(label(ctx, "Con mồi tăng → thú săn tăng theo (trễ pha) → con mồi giảm → thú săn giảm…", { x: A.cx, y: A.y + A.h - 10 * k, size: 23, fill: L.text }));
    } else if (p.mode === "pyramid") {
      const levels = [
        { name: "Sinh vật sản xuất (cỏ, tảo)", E: 10000, c: "#7CFF6B" },
        { name: "Sinh vật tiêu thụ bậc 1 (sâu, thỏ)", E: 1000, c: "#FFD166" },
        { name: "Sinh vật tiêu thụ bậc 2 (ếch, chim)", E: 100, c: "#FF9F1C" },
        { name: "Sinh vật tiêu thụ bậc 3 (rắn, đại bàng)", E: 10, c: "#FF6B35" },
      ];
      const bw = A.w * (A.wide ? 0.62 : 0.9), lh = A.h * 0.2;
      const by = A.y + A.h - 10 * k;
      levels.forEach((lv, i) => {
        const s = createSignal(0);
        shows.push(s);
        const w = bw * (1 - i * 0.22), y = by - (i + 0.5) * lh;
        nodes.push(
          <Node opacity={s}>
            <Rect x={A.x + bw / 2 + (A.wide ? 0 : (A.w - bw) / 2)} y={y} width={w} height={lh - 8 * k} radius={10 * k} fill={alpha(lv.c, 0.85)} />
            <Txt text={lv.name} x={A.x + bw / 2 + (A.wide ? 0 : (A.w - bw) / 2)} y={y - 12 * k} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill="#0B1020" />
            <Txt text={`${num(lv.E, 0)} kcal`} x={A.x + bw / 2 + (A.wide ? 0 : (A.w - bw) / 2)} y={y + 20 * k} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill="#0B1020" />
          </Node>,
        );
      });
      // Heat loss arrows (90 % at each step).
      nodes.push(
        <Draw
          paint={(g) => {
            const n = shows.filter((s) => s() > 0.5).length;
            for (let i = 1; i < n; i++) {
              const y = by - (i + 0.5) * lh, x = A.x + bw * (A.wide ? 1.0 : 0.95) + (A.wide ? 30 * k : 0);
              for (let j = 0; j < 3; j++) {
                const u = (clock() * 0.6 + j / 3) % 1;
                g.strokeStyle = `rgba(255,100,60,${1 - u})`;
                g.lineWidth = 4 * k;
                g.beginPath();
                g.moveTo(x + u * 60 * k, y + lh * 0.5 - u * 30 * k);
                g.quadraticCurveTo(x + u * 60 * k + 10 * k, y - u * 30 * k, x + u * 60 * k, y - lh * 0.3 - u * 30 * k);
                g.stroke();
              }
            }
          }}
        />,
      );
      show(label(ctx, "Chỉ ~10 % năng lượng truyền lên bậc trên; ~90 % mất đi dưới dạng nhiệt và hô hấp", { x: A.cx, y: A.y + 24 * k, size: 25, fill: L.text }));
    } else {
      // Food web: nodes on levels, arrows from food to eater (direction of energy).
      const org: [string, number, number, string][] = [
        ["Cỏ", 0.15, 0.9, "#7CFF6B"], ["Cây bụi", 0.5, 0.9, "#7CFF6B"], ["Tảo", 0.85, 0.9, "#7CFF6B"],
        ["Sâu", 0.1, 0.65, "#FFD166"], ["Thỏ", 0.35, 0.65, "#FFD166"], ["Chuột", 0.6, 0.65, "#FFD166"], ["Cá nhỏ", 0.88, 0.65, "#FFD166"],
        ["Ếch", 0.15, 0.4, "#FF9F1C"], ["Chim sẻ", 0.45, 0.4, "#FF9F1C"], ["Rắn", 0.72, 0.4, "#FF9F1C"],
        ["Cáo", 0.3, 0.15, "#FF6B35"], ["Đại bàng", 0.7, 0.15, "#FF6B35"],
      ];
      const eats: [number, number][] = [[0, 3], [0, 4], [1, 4], [1, 5], [0, 5], [2, 6], [3, 7], [3, 8], [5, 9], [7, 9], [8, 9], [4, 10], [5, 10], [4, 11], [9, 11], [8, 11], [6, 11]];
      const P = (i: number): XY => [A.x + org[i][1] * A.w, A.y + org[i][2] * A.h];
      const nS = org.length;
      org.forEach((o, i) => {
        const s = createSignal(0);
        shows.push(s);
        const [x, y] = P(i);
        nodes.push(
          <Node opacity={s}>
            <Rect x={x} y={y} width={Math.max(110, o[0].length * 22) * k} height={50 * k} radius={25 * k} fill={alpha(o[3], 0.9)} />
            <Txt text={o[0]} x={x} y={y} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill="#0B1020" />
          </Node>,
        );
      });
      nodes.unshift(
        <Draw
          paint={(g) => {
            for (const [a, b] of eats) {
              const sa = shows[a]?.() ?? 0, sb = shows[b]?.() ?? 0;
              const vis = Math.min(sa, sb);
              if (vis <= 0) continue;
              const [x1, y1] = P(a), [x2, y2] = P(b);
              const ang = Math.atan2(y2 - y1, x2 - x1);
              const ex = x2 - Math.cos(ang) * 32 * k, ey = y2 - Math.sin(ang) * 32 * k;
              g.strokeStyle = alpha(L.ink, 0.55 * vis);
              g.lineWidth = 2.5 * k;
              g.beginPath();
              g.moveTo(x1, y1 - 25 * k);
              g.lineTo(ex, ey);
              g.stroke();
              g.fillStyle = alpha(L.ink, 0.7 * vis);
              g.beginPath();
              g.moveTo(ex, ey);
              g.lineTo(ex - Math.cos(ang - 0.4) * 14 * k, ey - Math.sin(ang - 0.4) * 14 * k);
              g.lineTo(ex - Math.cos(ang + 0.4) * 14 * k, ey - Math.sin(ang + 0.4) * 14 * k);
              g.fill();
              // Energy pulse along the arrow.
              const u = (clock() * 0.5 + a * 0.13) % 1;
              g.fillStyle = alpha("#FFE66D", vis);
              g.beginPath();
              g.arc(x1 + (ex - x1) * u, y1 - 25 * k + (ey - y1 + 25 * k) * u, 4 * k, 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      void nS;
    }

    if (!p.labels && p.mode === "predator_prey") shows.length = 0;
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
    void mix;
    void smooth;
  },
});
