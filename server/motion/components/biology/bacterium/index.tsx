// Bacteria. anatomy: a rod-shaped bacterium (E. coli-like) — cell wall and membrane, nucleoid DNA
// loop, plasmids, ribosomes, pili, and a helical flagellum whose wave travels backward as it turns,
// pushing the cell forward. fission: binary fission — the DNA copies, the copies separate, the cell
// elongates and pinches into two. colony: growth from one cell by doubling every generation time,
// N = 2^(t/g), drawn as a spreading colony with the exponential curve (and its log-scale straight
// line). shapes: cocci (spheres, in chains and clusters), bacilli (rods) and spirilla (spirals).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label, fitX } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "anatomy" | "fission" | "colony" | "shapes";
  generation: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "microbiology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callout = (at: () => XY, to0: () => XY, text: string) => {
      const s = createSignal(0);
      const to = (): XY => [fitX(ctx, to0()[0], text, 25, to0()[0] > at()[0]), to0()[1]];
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Line points={() => [at(), to()]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Rect position={at} size={10 * k} radius={5 * k} fill={L.ink} />
          <Txt text={text} x={() => to()[0] + (to()[0] > at()[0] ? 10 : -10) * k} y={() => to()[1]} offsetX={() => (to()[0] > at()[0] ? -1 : 1)} fontFamily={FONT} fontWeight={700} fontSize={25 * k} fill={L.text} shadowColor="rgba(0,0,0,0.85)" shadowBlur={6 * k} />
        </Node>,
      );
    };
    const cx = A.cx, cy = A.cy;
    const WALL = "#21E6A1", BODY = "#0E6B52";

    // Capsule outline (rod with round ends) centred at (x, y), length l, radius r, angle a.
    const capsule = (g: CanvasRenderingContext2D, x: number, y: number, l: number, r: number, a: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-l / 2, -r);
      g.lineTo(l / 2, -r);
      g.arc(l / 2, 0, r, -Math.PI / 2, Math.PI / 2);
      g.lineTo(-l / 2, r);
      g.arc(-l / 2, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
      g.closePath();
      g.restore();
    };
    const cellBody = (g: CanvasRenderingContext2D, x: number, y: number, l: number, r: number, a: number, inner = true) => {
      capsule(g, x, y, l, r, a);
      const gr = g.createLinearGradient(x, y - r, x, y + r);
      gr.addColorStop(0, mix(BODY, "#FFFFFF", 0.25));
      gr.addColorStop(1, mix(BODY, "#000000", 0.25));
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = WALL;
      g.lineWidth = 7 * k;
      g.stroke();
      if (inner) {
        capsule(g, x, y, l, r * 0.86, a);
        g.strokeStyle = alpha("#7CFF6B", 0.7);
        g.lineWidth = 2.5 * k;
        g.stroke();
      }
    };

    if (p.mode === "anatomy") {
      const len = Math.min(A.w * 0.42, 700 * k), r = len * 0.2;
      const bx = cx + len * 0.12, by = cy;
      const rr = rng(L.seed + 2);
      const ribs = Array.from({ length: 70 }, () => [(rr() - 0.5) * len * 1.05, (rr() - 0.5) * r * 1.4]);
      const pili = Array.from({ length: 16 }, () => [rr() * TAU, 0.6 + rr() * 0.5]);
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            // Flagellum: a helix seen side-on, its wave travelling away from the cell as it turns.
            g.strokeStyle = alpha("#B4F5D8", 0.85);
            g.lineWidth = 4 * k;
            g.beginPath();
            const fx0 = bx - len / 2 - r;
            for (let i = 0; i <= 160; i++) {
              const u = i / 160, x = fx0 - u * len * 1.1, y = by + Math.sin(u * TAU * 3.2 + t * 9 * st.speed) * r * 0.35 * smooth(clamp(u * 4, 0, 1));
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            // Pili: short straight hairs.
            g.strokeStyle = alpha("#B4F5D8", 0.45);
            g.lineWidth = 2 * k;
            for (const [a, l] of pili) {
              const ex = Math.cos(a), ey = Math.sin(a);
              const sx = bx + ex * (len / 2) * 0.9, sy = by + ey * r * 0.98;
              g.beginPath();
              g.moveTo(sx, sy);
              g.lineTo(sx + ex * r * l * 0.6, sy + ey * r * l * 0.6);
              g.stroke();
            }
            cellBody(g, bx, by, len, r, 0);
            // Ribosomes.
            g.fillStyle = "#C084FC";
            for (const [x, y] of ribs) {
              if (Math.abs(x) > len / 2 + r * 0.6 - Math.abs(y) * 0.3) continue;
              g.beginPath();
              g.arc(bx + x, by + y, 3.5 * k, 0, TAU);
              g.fill();
            }
            // Nucleoid: a tangled loop of DNA.
            g.strokeStyle = "#FFD166";
            g.lineWidth = 3 * k;
            g.beginPath();
            for (let i = 0; i <= 260; i++) {
              const u = (i / 260) * TAU;
              const x = bx + Math.cos(u * 3 + 0.4) * len * 0.18 + Math.cos(u * 7) * len * 0.05, y = by + Math.sin(u * 5) * r * 0.45 + Math.sin(u * 2) * r * 0.1;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.closePath();
            g.stroke();
            // Plasmids: small rings.
            g.strokeStyle = "#FF6B81";
            g.lineWidth = 3 * k;
            for (const [x, y] of [[len * 0.36, -r * 0.4], [-len * 0.32, r * 0.45]]) {
              g.beginPath();
              g.ellipse(bx + x, by + y, r * 0.16, r * 0.11, 0.4, 0, TAU);
              g.stroke();
            }
          }}
        />,
      );
      callout(() => [bx + len * 0.45, by - r * 0.95], () => [bx + len * 0.6, by - r * 2.2], "Thành tế bào (peptidoglycan)");
      callout(() => [bx + len * 0.05, by + r * 0.4], () => [bx + len * 0.35, by + r * 2.2], "Vùng nhân — ADN vòng, không có màng nhân");
      callout(() => [bx + len * 0.36 + r * 0.16, by - r * 0.4], () => [bx + len * 0.75, by - r * 0.4], "Plasmid");
      callout(() => [bx - len * 0.2, by - r * 0.6], () => [bx - len * 0.3, by - r * 2.2], "Ribosome");
      callout(() => [bx - len / 2 - r - len * 0.4, by], () => [bx - len / 2 - len * 0.3, by + r * 2], "Roi (tiên mao) — quay để bơi");
    } else if (p.mode === "fission") {
      const len = Math.min(A.w * 0.3, 520 * k), r = len * 0.22;
      const u = () => clamp((clock() - 0.8) / (D - 2), 0, 1);
      nodes.push(
        <Draw
          paint={(g) => {
            const t = u();
            // 0–0.35 DNA copies, 0.35–0.6 elongation + separation, 0.6–0.85 septum, 0.85–1 two cells move apart.
            const el = smooth(clamp((t - 0.3) / 0.35, 0, 1));
            const pinch = smooth(clamp((t - 0.55) / 0.3, 0, 1));
            const apart = smooth(clamp((t - 0.82) / 0.18, 0, 1));
            const L2 = len * (1 + el), half = L2 / 2;
            if (pinch < 1) {
              cellBody(g, cx, cy, L2, r, 0);
              if (pinch > 0) {
                // Septum: the wall growing inward from both sides at the middle.
                g.fillStyle = WALL;
                g.fillRect(cx - 4 * k, cy - r, 8 * k, r * pinch);
                g.fillRect(cx - 4 * k, cy + r - r * pinch, 8 * k, r * pinch);
              }
            } else {
              const off = half / 2 + apart * r * 1.4;
              cellBody(g, cx - off, cy, half - r * 0.2, r, 0);
              cellBody(g, cx + off, cy, half - r * 0.2, r, 0);
            }
            // DNA loops: one, then two copies drifting to the poles.
            const copy = smooth(clamp(t / 0.3, 0, 1));
            const sep = el * half * 0.5 + (pinch >= 1 ? apart * r * 1.4 : 0);
            const loop = (x: number, a: number) => {
              g.strokeStyle = alpha("#FFD166", a);
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let i = 0; i <= 120; i++) {
                const w = (i / 120) * TAU;
                const xx = x + Math.cos(w * 3) * r * 0.5, yy = cy + Math.sin(w * 2) * r * 0.45;
                if (i) g.lineTo(xx, yy);
                else g.moveTo(xx, yy);
              }
              g.closePath();
              g.stroke();
            };
            loop(cx - sep, 1);
            loop(cx + sep, copy);
          }}
        />,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Txt
            text={() => {
              const t = clamp((clock() - 0.8) / (D - 2), 0, 1);
              return t < 0.3 ? "1. Nhân đôi ADN" : t < 0.55 ? "2. Tế bào dài ra, hai bản ADN tách về hai đầu" : t < 0.85 ? "3. Vách ngăn hình thành ở giữa" : "4. Hai tế bào con giống hệt nhau";
            }}
            x={cx}
            y={A.y + A.h - 20 * k}
            fontFamily={FONT}
            fontWeight={800}
            fontSize={30 * k}
            fill={L.text}
          />
        </Node>,
      );
    } else if (p.mode === "colony") {
      // Generation time g (video seconds); N(t) = 2^(t/g) capped by the drawing.
      const g0 = (D - 2) / Math.max(3, Math.min(9, p.generation));
      const N = () => Math.pow(2, Math.max(0, clock() - 1) / g0);
      const cap = 512;
      const rr = rng(L.seed + 7);
      // Positions grow outward like a colony (each new cell placed near the colony's edge).
      const pos: [number, number, number][] = [[0, 0, rr() * Math.PI]];
      while (pos.length < cap) {
        const parent = pos[Math.floor(rr() * pos.length)];
        const a = rr() * TAU, d = 1.05;
        const x = parent[0] + Math.cos(a) * d, y = parent[1] + Math.sin(a) * d;
        if (pos.some((q) => Math.hypot(q[0] - x, q[1] - y) < 0.9)) continue;
        pos.push([x, y, rr() * Math.PI]);
      }
      pos.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      const PW = A.wide ? A.w * 0.5 : A.w, ccx = A.x + PW / 2, ccy = A.wide ? cy : A.y + A.h * 0.3;
      const unit = Math.min(PW, A.wide ? A.h : A.h * 0.55) / 30;
      nodes.push(
        <Draw
          paint={(g) => {
            const n = Math.min(cap, Math.floor(N()));
            for (let i = 0; i < n; i++) {
              const [x, y, a] = pos[i];
              cellBody(g, ccx + x * unit, ccy + y * unit, unit * 0.7, unit * 0.32, a, false);
            }
          }}
        />,
      );
      const gx = A.wide ? A.x + A.w * 0.56 : A.x + A.w * 0.08, gw = A.wide ? A.w * 0.4 : A.w * 0.84, gy = A.wide ? A.y + A.h * 0.12 : A.y + A.h * 0.62, gh = A.wide ? A.h * 0.66 : A.h * 0.3;
      const Nmax = Math.pow(2, (D - 1) / g0);
      nodes.push(
        <Node>
          <Line points={[[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Line
            points={() => {
              const pts: XY[] = [];
              for (let i = 0; i <= 160; i++) {
                const t = 1 + ((clock() - 1) * i) / 160;
                if (clock() < 1) break;
                pts.push([gx + ((t - 1) / (D - 1)) * gw, gy + gh - (Math.pow(2, (t - 1) / g0) / Nmax) * gh]);
              }
              return pts.length > 1 ? pts : [[gx, gy + gh], [gx + 1, gy + gh]];
            }}
            stroke={L.primary}
            lineWidth={L.lw(4 * k)}
            {...L.glow(L.primary, 8 * k)}
          />
          <Txt text={() => `N = 2^(t/g) = ${num(Math.floor(N()), 0)} tế bào`} x={gx + 10 * k} y={gy - 10 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.text} />
          <Txt text={() => `${num(Math.max(0, clock() - 1) / g0, 1)} thế hệ (E. coli: ~20 phút/thế hệ)`} x={gx + 10 * k} y={gy + 30 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} />
          <Txt text="thời gian" x={gx + gw} y={gy + gh + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{label(ctx, "Tăng trưởng hàm mũ: mỗi thế hệ số tế bào gấp đôi", { x: A.cx, y: A.y + A.h - 14 * k, size: 27, fill: L.text })}</Node>);
    } else {
      // Shapes: three panels.
      const cols = A.wide ? 3 : 1, rows = A.wide ? 1 : 3;
      const pw = A.w / cols, ph = A.h / rows;
      const centre = (i: number): XY => [A.x + pw * ((A.wide ? i : 0) + 0.5), A.y + ph * ((A.wide ? 0 : i) + 0.5)];
      const s0 = Math.min(pw, ph) / 8;
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            // Cocci: chains and clusters of spheres.
            const [c1x, c1y] = centre(0);
            for (let i = 0; i < 6; i++) {
              const x = c1x - s0 * 2.5 + i * s0 * 1.05, y = c1y - s0 * 1.2 + Math.sin(i * 0.9 + t) * s0 * 0.15;
              g.fillStyle = mix(BODY, "#FFFFFF", 0.2);
              g.strokeStyle = WALL;
              g.lineWidth = 5 * k;
              g.beginPath();
              g.arc(x, y, s0 * 0.5, 0, TAU);
              g.fill();
              g.stroke();
            }
            for (const [dx, dy] of [[0, 0], [1, 0], [0.5, 0.86], [-0.5, 0.86], [1.5, 0.86], [0.5, 1.72]]) {
              g.beginPath();
              g.arc(c1x - s0 * 0.5 + dx * s0, c1y + s0 * 0.6 + dy * s0, s0 * 0.5, 0, TAU);
              g.fill();
              g.stroke();
            }
            // Bacilli.
            const [c2x, c2y] = centre(1);
            for (let i = 0; i < 3; i++) cellBody(g, c2x + (i - 1) * s0 * 0.6, c2y + (i - 1) * s0 * 1.4, s0 * 2.4, s0 * 0.45, -0.3 + i * 0.25 + Math.sin(t + i) * 0.05, false);
            // Spirilla: thick helical rods.
            const [c3x, c3y] = centre(2);
            for (let j = 0; j < 2; j++) {
              g.strokeStyle = WALL;
              g.lineWidth = s0 * 0.42;
              g.lineCap = "round";
              g.beginPath();
              for (let i = 0; i <= 80; i++) {
                const u = i / 80, x = c3x - s0 * 2.4 + u * s0 * 4.8, y = c3y + (j - 0.5) * s0 * 2 + Math.sin(u * TAU * 2.2 + t * 2) * s0 * 0.5;
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
              g.strokeStyle = mix(BODY, "#FFFFFF", 0.2);
              g.lineWidth = s0 * 0.28;
              g.stroke();
            }
          }}
        />,
      );
      ["Cầu khuẩn (coccus)", "Trực khuẩn (bacillus)", "Xoắn khuẩn (spirillum)"].forEach((nm, i) => {
        const s = createSignal(0);
        shows.push(s);
        const [x, y] = centre(i);
        nodes.push(<Node opacity={s}>{label(ctx, nm, { x, y: y + Math.min(pw, ph) * 0.4, size: 28, fill: L.text })}</Node>);
      });
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
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.4));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
