// Two black holes spiral together and merge (GW150914-like): the orbit shrinks and speeds up as the
// leading-order "chirp" (separation ∝ τ^¼, orbital phase ∝ τ^⅝ with τ the time to merger), then a
// flash and the ringdown of the single remnant. On a perspective grid of space-time, the wells of
// the two masses move with them and gravitational waves spread outward as a two-armed spiral
// (quadrupole pattern cos 2(φ − θ(t − r/c)), amplitude ∝ 1/r, at the retarded time). Below, the
// strain h(t) is traced live; an L-shaped detector (LIGO) stretches one arm while squeezing the other.
import { Node, Rect, Txt, Line } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { starfield } from "../../../shared/fx";
import { until, clamp } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mergeAt: number;
  massRatio: number;
  grid: boolean;
  waveform: boolean;
  detector: boolean;
  labels: boolean;
}

const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "black_holes");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;

    // ---- the chirp (video time; τ = time to merger).
    const tc = clamp(p.mergeAt, 0.3, 0.9) * D;
    const w0 = (TAU * 0.35) / Math.max(0.5, st.speed ** -1); // initial orbital angular speed, rad/s
    const C = w0 * (8 / 5) * Math.pow(tc, 3 / 8);
    const wMax = TAU * 2.2; // display cap of the orbital speed (keeps the waves resolvable at 30 fps)
    const theta = (t: number) => {
      if (t < tc) {
        const tau = tc - t;
        const th = -C * Math.pow(tau, 5 / 8);
        return th;
      }
      return -C * 0 + wMax * (t - tc);
    };
    const omega = (t: number) => (t < tc ? Math.min(wMax, (5 / 8) * C * Math.pow(Math.max(1e-3, tc - t), -3 / 8)) : wMax);
    const sep = (t: number) => (t < tc ? Math.max(0.12, Math.pow((tc - t) / tc, 1 / 4)) : 0);
    // Strain: amplitude ∝ ω^⅔ during inspiral, then an exponentially damped ringdown.
    const strain = (t: number) => {
      if (t < 0) return 0;
      if (t < tc) return Math.pow(omega(t) / wMax, 2 / 3) * Math.cos(2 * theta(t));
      const d = t - tc;
      return Math.exp(-d / 0.45) * Math.cos(2 * theta(tc) + TAU * 3.2 * d);
    };

    // ---- layout: grid on top, waveform strip below (wide: detector at the right of the strip).
    const stripH = p.waveform ? Math.min(A.h * 0.24, 220 * k) : 0;
    const G = { x: A.x, y: A.y, w: A.w, h: A.h - stripH - (stripH ? 20 * k : 0) };
    const gcx = G.x + G.w / 2, gcy = G.y + G.h * 0.48;
    const S = Math.min(G.w * 0.4, G.h * 0.62);
    const m1 = 1, m2 = p.massRatio; // m2 ≤ 1
    const a0 = 0.42; // initial separation, grid units (grid spans −1…1)
    const pos = (t: number, which: 0 | 1): [number, number] => {
      const s = sep(t) * a0, th = theta(t);
      const f = which === 0 ? m2 / (m1 + m2) : -m1 / (m1 + m2);
      return [Math.cos(th) * s * f, Math.sin(th) * s * f];
    };
    // Perspective projection of the grid plane (tilted toward the viewer).
    const tilt = 0.95;
    // Plane coordinates: y grows toward the viewer, z up (wells are negative). Far rows (y < 0) are
    // smaller; heights move points up/down the screen.
    const proj = (x: number, y: number, z: number): [number, number] => {
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
      const pz = 2.6 / (2.6 - y * Math.sin(tilt) * 0.9);
      return [gcx + x * S * pz, gcy + yy * S * pz * 0.9];
    };
    const height = (x: number, y: number, t: number) => {
      let z = 0;
      if (t < tc) {
        const [ax, ay] = pos(t, 0), [bx, by] = pos(t, 1);
        z -= (0.045 * m1) / Math.sqrt((x - ax) ** 2 + (y - ay) ** 2 + 0.02) + (0.045 * m2) / Math.sqrt((x - bx) ** 2 + (y - by) ** 2 + 0.02);
      } else z -= (0.045 * (m1 + m2) * 0.95) / Math.sqrt(x * x + y * y + 0.025);
      // Gravitational waves at the retarded time (speed: 0.55 grid units per second).
      const r = Math.hypot(x, y), tr = t - r / 0.55;
      if (tr > 0) {
        const phi = Math.atan2(y, x);
        const amp = tr < tc ? Math.pow(omega(tr) / wMax, 2 / 3) : Math.exp(-(tr - tc) / 0.45);
        const th = tr < tc ? theta(tr) : theta(tc) + TAU * 1.6 * (tr - tc);
        z += (0.05 * amp * Math.cos(2 * (phi - th))) / Math.max(0.25, r) * 0.45;
      }
      return Math.max(-0.5, z);
    };
    const n = Math.round(30 + 14 * q), segs = Math.round(50 + 30 * q);
    const gridPaint = (g: CanvasRenderingContext2D) => {
      if (!p.grid) return;
      const t = clock();
      g.lineWidth = L.lw(1.4 * k);
      for (let dir = 0; dir < 2; dir++)
        for (let i = 0; i <= n; i++) {
          const u = (i / n) * 2 - 1;
          g.beginPath();
          for (let j = 0; j <= segs; j++) {
            const v = (j / segs) * 2 - 1;
            const x = dir ? u : v, y = dir ? v : u;
            const [px, py] = proj(x, y, height(x, y, t));
            if (j) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          const fade = 1 - Math.abs(u) * 0.6;
          g.strokeStyle = alpha(L.secondary, 0.38 * fade);
          g.stroke();
        }
    };
    // Black holes: dark discs with a thin bright photon ring; merger flash.
    const bhPaint = (g: CanvasRenderingContext2D) => {
      const t = clock();
      const draw = (x: number, y: number, m: number) => {
        const [px, py] = proj(x, y, height(x, y, t) * 0.9);
        const r = 26 * k * Math.sqrt(m);
        const gr = g.createRadialGradient(px, py, r * 0.9, px, py, r * 2.4);
        gr.addColorStop(0, alpha(L.accent, 0.55 * Math.max(0.3, L.visual.glow)));
        gr.addColorStop(1, alpha(L.primary, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(px, py, r * 2.4, 0, TAU);
        g.fill();
        g.fillStyle = "#000000";
        g.beginPath();
        g.arc(px, py, r, 0, TAU);
        g.fill();
        g.strokeStyle = "#FFE7B0";
        g.lineWidth = 2.5 * k;
        g.beginPath();
        g.arc(px, py, r * 1.05, 0, TAU);
        g.stroke();
      };
      if (t < tc) {
        draw(...pos(t, 0), m1);
        draw(...pos(t, 1), m2);
      } else draw(0, 0, (m1 + m2) * 0.95);
      const d = t - tc;
      if (d > 0 && d < 1.2) {
        const [px, py] = proj(0, 0, -0.2);
        g.globalCompositeOperation = "lighter";
        const gr = g.createRadialGradient(px, py, 0, px, py, S * 0.6 * (0.3 + d));
        gr.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - d / 1.2)})`);
        gr.addColorStop(1, "rgba(180,140,255,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(px, py, S * 0.6 * (0.3 + d), 0, TAU);
        g.fill();
      }
    };

    // ---- waveform strip and detector.
    const W = { x: A.x + 10 * k, y: A.y + A.h - stripH, w: (p.detector && A.wide ? A.w * 0.7 : A.w) - 20 * k, h: stripH };
    const wavePts = (): [number, number][] => {
      const t = clock(), pts: [number, number][] = [];
      const N = 600;
      for (let i = 0; i <= N; i++) {
        const tt = (i / N) * D;
        if (tt > t) break;
        pts.push([W.x + (tt / D) * W.w, W.y + W.h / 2 - strain(tt) * W.h * 0.4]);
      }
      return pts.length > 1 ? pts : [[W.x, W.y + W.h / 2], [W.x + 1, W.y + W.h / 2]];
    };
    const det = { x: A.x + A.w * 0.86, y: W.y + W.h - 14 * k, s: Math.min(A.w * 0.1, W.h * 0.5) };
    const detPaint = (g: CanvasRenderingContext2D) => {
      // Arms change by ±h (exaggerated ~10²⁰ times); the wave reaches the detector late.
      const h = strain(clock() - 0.4) * 0.18;
      const lx = det.s * (1 + h), ly = det.s * (1 - h);
      g.strokeStyle = L.secondary;
      g.lineWidth = 5 * k;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(det.x - det.s * 0.5, det.y);
      g.lineTo(det.x - det.s * 0.5 + lx, det.y);
      g.moveTo(det.x - det.s * 0.5, det.y);
      g.lineTo(det.x - det.s * 0.5, det.y - ly);
      g.stroke();
      g.fillStyle = L.accent;
      g.fillRect(det.x - det.s * 0.5 - 9 * k, det.y - 9 * k, 18 * k, 18 * k);
      for (const [mx, my] of [[det.x - det.s * 0.5 + lx, det.y], [det.x - det.s * 0.5, det.y - ly]]) {
        g.fillStyle = "#FFFFFF";
        g.beginPath();
        g.arc(mx, my, 6 * k, 0, TAU);
        g.fill();
      }
    };

    // ---- labels.
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callNodes: Node[] = [];
    const call = (at: () => [number, number], to0: [number, number], text: string) => {
      const s = createSignal(0);
      // Keep the whole label inside the frame.
      const tw = text.length * 25 * k * 0.55;
      const to: [number, number] = [to0[0] >= gcx ? Math.min(to0[0], A.x + A.w - tw - 12 * k) : Math.max(to0[0], A.x + tw + 12 * k), to0[1]];
      shows.push(s);
      callNodes.push(
        <Node opacity={s}>
          <Line points={() => [at(), to]} stroke={alpha(L.ink, 0.7)} lineWidth={L.lw(2 * k)} />
          <Txt text={text} x={to[0] + (to[0] >= gcx ? 10 : -10) * k} y={to[1]} offsetX={to[0] >= gcx ? -1 : 1} fontFamily={FONT} fontWeight={700} fontSize={25 * k} fill={L.text} shadowColor="rgba(0,0,0,0.9)" shadowBlur={8 * k} />
        </Node>,
      );
    };
    if (p.labels) {
      call(() => proj(...pos(Math.min(clock(), tc - 0.01), 0), 0), [G.x + G.w * 0.08, G.y + 40 * k], "Hai hố đen (36 và 29 lần Mặt Trời) xoắn vào nhau");
      call(() => proj(0.75, -0.2, 0), [G.x + G.w * 0.92, G.y + 40 * k], "Sóng hấp dẫn lan ra với tốc độ ánh sáng");
      call(() => proj(0, 0, -0.3), [G.x + G.w * 0.92, G.y + G.h * 0.9], "Hợp nhất: 3 khối lượng Mặt Trời thành năng lượng sóng");
    }

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        {L.backdrop !== "none" ? starfield(ctx, L, { count: Math.round(140 * q), seed: L.seed, clock, drift: 2 }) : null}
        <Node ref={world} opacity={0}>
          <Draw paint={gridPaint} />
          <Draw paint={bhPaint} />
          {p.waveform ? (
            <Node>
              <Rect x={W.x + W.w / 2} y={W.y + W.h / 2} width={W.w} height={W.h} radius={14 * k} fill={alpha(L.bg, 0.6)} stroke={alpha(L.ink, 0.15)} lineWidth={1.5 * k} />
              <Line points={[[W.x, W.y + W.h / 2], [W.x + W.w, W.y + W.h / 2]]} stroke={alpha(L.ink, 0.15)} lineWidth={1 * k} />
              <Line points={wavePts} stroke={L.accent} lineWidth={L.lw(3 * k)} {...L.glow(L.accent, 10 * k)} />
              <Txt text="biến dạng h(t) — tín hiệu “chirp”" x={W.x + 16 * k} y={W.y + 22 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
              <Line points={[[W.x + (tc / D) * W.w, W.y + 8 * k], [W.x + (tc / D) * W.w, W.y + W.h - 8 * k]]} stroke={alpha(L.highlight, 0.6)} lineWidth={1.5 * k} lineDash={[5 * k, 5 * k]} />
              <Txt text="hợp nhất" x={W.x + (tc / D) * W.w + 8 * k} y={W.y + W.h - 20 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={19 * k} fill={L.highlight} />
            </Node>
          ) : null}
          {p.detector && p.waveform && A.wide ? (
            <Node>
              <Draw paint={detPaint} />
              <Txt text="Giao thoa kế LIGO" x={W.x + W.w + 30 * k} y={W.y + 16 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={19 * k} fill={L.text} />
              <Txt text="tay dài ra, tay kia ngắn lại" x={W.x + W.w + 30 * k} y={W.y + 40 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={17 * k} fill={L.dim} />
              <Txt text="(thật: ~1/10 000 đường kính proton)" x={W.x + W.w + 30 * k} y={W.y + 62 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={16 * k} fill={L.dim} />
            </Node>
          ) : null}
          {callNodes}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.8, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    // The merger callout waits for the merger itself.
    for (let i = 0; i < steps.length; i++) {
      yield* until(i === 2 ? tc : ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
