// Plane geometry, measured live. pythagoras: squares on the sides of a right triangle, then the
// rearrangement proof — four copies of the triangle inside a square of side a + b leave a hole of
// area c², rearranged they leave a² + b². construction: compass-and-straightedge constructions drawn
// stroke by stroke (perpendicular bisector, equilateral triangle, angle bisector). inscribed_angle: a
// point slides along a circle; the inscribed angle stays half the central angle on the same arc.
// centers: a triangle whose vertices drift — medians/centroid G, perpendicular bisectors/circumcentre O
// with the circumcircle, altitudes/orthocentre H — and the Euler line through O, G, H.
// transform: translation, rotation, reflection and scaling of a shape on a grid, with its ghost.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
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
  mode: "pythagoras" | "construction" | "inscribed_angle" | "centers" | "transform";
  a: number;
  b: number;
  construction: "perpendicular_bisector" | "equilateral" | "angle_bisector";
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;
const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "geometry");
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
    const C1 = L.secondary, C2 = L.accent, C3 = L.highlight, INK = L.text;
    const poly = (g: CanvasRenderingContext2D, pts: XY[], fill: string | null, stroke: string, w = 3) => {
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(...q) : g.moveTo(...q)));
      g.closePath();
      if (fill) {
        g.fillStyle = fill;
        g.fill();
      }
      g.strokeStyle = stroke;
      g.lineWidth = L.lw(w * k);
      g.stroke();
    };
    const dot = (g: CanvasRenderingContext2D, q: XY, c: string, r = 7) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(q[0], q[1], r * k, 0, TAU);
      g.fill();
    };
    const text = (g: CanvasRenderingContext2D, s: string, q: XY, c: string, size = 26) => {
      g.fillStyle = c;
      g.font = `800 ${size * k}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(s, q[0], q[1]);
    };

    if (p.mode === "pythagoras") {
      const a = p.a, b = p.b, c = Math.hypot(a, b);
      // Phase 1 (left): triangle with squares. Phase 2 (right): the two arrangements.
      const unit = Math.min(A.w / (A.wide ? 2.2 : 1.1), A.h / (A.wide ? 1.1 : 2.2)) / (a + b) * 0.95;
      const t1 = ctx.cue(1, 4), t2 = ctx.cue(2, 4);
      const m = () => smooth(clamp((clock() - t2) / 2, 0, 1));
      const left: XY = A.wide ? [A.x + A.w * 0.25, A.cy] : [A.cx, A.y + A.h * 0.27];
      const right: XY = A.wide ? [A.x + A.w * 0.72, A.cy] : [A.cx, A.y + A.h * 0.75];
      nodes.push(
        <Draw
          paint={(g) => {
            // Right triangle with legs a (horizontal), b (vertical), squares outward.
            const o: XY = [left[0] - (a * unit) / 2 + (b * unit) * 0.15, left[1] + (b * unit) / 2 - (a * unit) * 0.1];
            const P: XY = [o[0] + a * unit, o[1]], Q: XY = [o[0], o[1] - b * unit];
            poly(g, [o, P, Q], alpha(INK, 0.12), INK, 3);
            poly(g, [o, P, [P[0], o[1] + a * unit], [o[0], o[1] + a * unit]], alpha(C1, 0.35), C1);
            poly(g, [o, Q, [Q[0] - b * unit, Q[1]], [o[0] - b * unit, o[1]]], alpha(C2, 0.35), C2);
            // Square on the hypotenuse, on the side away from the right angle.
            const dx = P[0] - Q[0], dy = P[1] - Q[1];
            const M: XY = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
            let nx = dy, ny = -dx;
            if ((o[0] - M[0]) * nx + (o[1] - M[1]) * ny > 0) (nx = -nx), (ny = -ny);
            poly(g, [Q, P, [P[0] + nx, P[1] + ny], [Q[0] + nx, Q[1] + ny]], alpha(C3, 0.35), C3);
            text(g, "a²", [o[0] + (a * unit) / 2, o[1] + (a * unit) / 2], C1, 34);
            text(g, "b²", [o[0] - (b * unit) / 2, o[1] - (b * unit) / 2], C2, 34);
            text(g, "c²", [M[0] + nx / 2, M[1] + ny / 2], C3, 34);
            // Right-angle mark.
            g.strokeStyle = INK;
            g.lineWidth = 2 * k;
            g.strokeRect(o[0], o[1] - 18 * k, 18 * k, 18 * k);
            if (clock() < t1) return;
            // Two squares of side a + b: (1) four triangles around a tilted square c²;
            // (2) the same triangles rearranged into two rectangles, leaving a² and b².
            const s = (a + b) * unit, R0: XY = [right[0] - s / 2, right[1] - s / 2];
            const tri1 = [
              [[0, 0], [a, 0], [0, b]],
              [[a, 0], [a + b, 0], [a + b, a]],
              [[a + b, a], [a + b, a + b], [b, a + b]],
              [[b, a + b], [0, a + b], [0, b]],
            ] as XY[][];
            const tri2 = [
              [[0, 0], [a, 0], [0, b]],
              [[a, b], [0, b], [a, 0]],
              [[a, b], [a + b, b], [a, a + b]],
              [[a + b, a + b], [a, a + b], [a + b, b]],
            ] as XY[][];
            poly(g, [R0, [R0[0] + s, R0[1]], [R0[0] + s, R0[1] + s], [R0[0], R0[1] + s]], null, alpha(INK, 0.6), 2);
            const u = m();
            tri1.forEach((tr, i) => {
              const pts = tr.map((q, j) => lerp([R0[0] + q[0] * unit, R0[1] + q[1] * unit], [R0[0] + tri2[i][j][0] * unit, R0[1] + tri2[i][j][1] * unit], u));
              poly(g, pts, alpha(INK, 0.22), INK, 2.5);
            });
            if (u < 0.05) text(g, "c²", [right[0], right[1]], C3, 44);
            if (u > 0.95) {
              text(g, "b²", [R0[0] + (a + b / 2) * unit, R0[1] + (b / 2) * unit], C2, 40);
              text(g, "a²", [R0[0] + (a / 2) * unit, R0[1] + (b + a / 2) * unit], C1, 40);
            }
          }}
        />,
      );
      show(label(ctx, `a = ${num(a, 1)}, b = ${num(b, 1)} → c = √(a² + b²) = ${num(c, 2)}`, { x: A.cx, y: A.y + 24 * k, size: 28, fill: INK }));
      show(label(ctx, "Cùng một hình vuông (a + b)² trừ đi 4 tam giác như nhau…", { x: A.cx, y: A.y + A.h - 54 * k, size: 25, fill: L.dim }));
      show(label(ctx, "…nên c² = a² + b²", { x: A.cx, y: A.y + A.h - 18 * k, size: 32, fill: C3 }));
    } else if (p.mode === "construction") {
      const cx = A.cx, cy = A.cy + A.h * 0.08, s = Math.min(A.w, A.h) * 0.22;
      const steps = 4;
      const stepU = (i: number) => smooth(clamp((clock() - ctx.cue(i, steps + 1)) / 1.2, 0, 1));
      const arc = (g: CanvasRenderingContext2D, c: XY, r: number, a0: number, a1: number, u: number, col: string) => {
        if (u <= 0) return;
        g.strokeStyle = col;
        g.lineWidth = 2.5 * k;
        g.beginPath();
        g.arc(c[0], c[1], r, a0, a0 + (a1 - a0) * u);
        g.stroke();
        // Compass: a thin V from the centre to the pencil.
        if (u < 1) {
          const pe: XY = [c[0] + Math.cos(a0 + (a1 - a0) * u) * r, c[1] + Math.sin(a0 + (a1 - a0) * u) * r];
          const hinge: XY = [(c[0] + pe[0]) / 2, Math.min(c[1], pe[1]) - r * 0.6];
          g.strokeStyle = alpha(INK, 0.8);
          g.lineWidth = 4 * k;
          g.beginPath();
          g.moveTo(...c);
          g.lineTo(...hinge);
          g.lineTo(...pe);
          g.stroke();
        }
      };
      const seg = (g: CanvasRenderingContext2D, a: XY, b: XY, u: number, col: string, w = 3) => {
        if (u <= 0) return;
        g.strokeStyle = col;
        g.lineWidth = L.lw(w * k);
        g.beginPath();
        g.moveTo(...a);
        g.lineTo(...lerp(a, b, u));
        g.stroke();
      };
      nodes.push(
        <Draw
          paint={(g) => {
            const A1: XY = [cx - s, cy], B1: XY = [cx + s, cy];
            if (p.construction === "perpendicular_bisector" || p.construction === "equilateral") {
              seg(g, A1, B1, 1, INK);
              dot(g, A1, INK);
              dot(g, B1, INK);
              text(g, "A", [A1[0] - 24 * k, A1[1]], INK);
              text(g, "B", [B1[0] + 24 * k, B1[1]], INK);
              const r = p.construction === "equilateral" ? 2 * s : s * 1.4;
              const h = Math.sqrt(r * r - s * s);
              const top: XY = [cx, cy - h], bot: XY = [cx, cy + h];
              const ang = Math.atan2(h, s);
              arc(g, A1, r, -ang - 0.35, ang + 0.35, stepU(0), C1);
              arc(g, B1, r, Math.PI - ang - 0.35, Math.PI + ang + 0.35, stepU(1), C2);
              if (stepU(1) >= 1) {
                dot(g, top, C3, 8);
                if (p.construction === "perpendicular_bisector") dot(g, bot, C3, 8);
              }
              if (p.construction === "perpendicular_bisector") {
                seg(g, [top[0], top[1] - 40 * k], [bot[0], bot[1] + 40 * k], stepU(2), C3, 4);
                if (stepU(3) > 0) {
                  dot(g, [cx, cy], C3, 9);
                  text(g, "M — trung điểm, MA = MB", [cx + 190 * k, cy - 26 * k], C3, 24);
                }
              } else {
                seg(g, A1, top, stepU(2), C3, 4);
                seg(g, B1, top, stepU(2), C3, 4);
                if (stepU(3) > 0) text(g, "AB = BC = CA", [cx, cy + 50 * k], C3, 28);
              }
            } else {
              // Angle bisector of angle at O between rays OA, OB.
              const O: XY = [cx - s * 1.2, cy + s * 0.5], a1 = -0.15, a2 = -1.05, R = s * 2.4;
              seg(g, O, [O[0] + Math.cos(a1) * R, O[1] + Math.sin(a1) * R], 1, INK);
              seg(g, O, [O[0] + Math.cos(a2) * R, O[1] + Math.sin(a2) * R], 1, INK);
              dot(g, O, INK);
              const r1 = s * 0.9;
              arc(g, O, r1, a2 - 0.1, a1 + 0.1, stepU(0), C1);
              const P1: XY = [O[0] + Math.cos(a1) * r1, O[1] + Math.sin(a1) * r1], P2: XY = [O[0] + Math.cos(a2) * r1, O[1] + Math.sin(a2) * r1];
              if (stepU(0) >= 1) (dot(g, P1, C1), dot(g, P2, C1));
              const r2 = s * 0.8, mid = (a1 + a2) / 2;
              arc(g, P1, r2, Math.PI + mid - 0.9, Math.PI + mid + 0.5, stepU(1), C2);
              arc(g, P2, r2, mid - 0.2, mid + 1.1, stepU(1), C2);
              const X: XY = [O[0] + Math.cos(mid) * (r1 * Math.cos((a1 - a2) / 2) + Math.sqrt(r2 * r2 - (r1 * Math.sin((a1 - a2) / 2)) ** 2)), O[1] + Math.sin(mid) * (r1 * Math.cos((a1 - a2) / 2) + Math.sqrt(r2 * r2 - (r1 * Math.sin((a1 - a2) / 2)) ** 2))];
              if (stepU(1) >= 1) dot(g, X, C3, 8);
              seg(g, O, [O[0] + Math.cos(mid) * R, O[1] + Math.sin(mid) * R], stepU(2), C3, 4);
              if (stepU(3) > 0) text(g, `hai góc bằng nhau: ${num(((a1 - a2) * 90) / Math.PI, 0)}° + ${num(((a1 - a2) * 90) / Math.PI, 0)}°`, [cx + s * 0.6, cy + s * 0.9], C3, 26);
            }
          }}
        />,
      );
    } else if (p.mode === "inscribed_angle") {
      const cx = A.cx, cy = A.cy + A.h * 0.04, R = Math.min(A.w, A.h) * 0.36;
      const aA = Math.PI * 0.15, aB = Math.PI * 0.85; // arc AB below
      const Pang = () => Math.PI * (1.15 + 0.7 * (0.5 - 0.5 * Math.cos((clock() / D) * TAU)));
      const pt = (a: number): XY => [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
      const angAt = (v: XY, a: XY, b: XY) => {
        const u = Math.atan2(a[1] - v[1], a[0] - v[0]), w = Math.atan2(b[1] - v[1], b[0] - v[0]);
        let d = Math.abs(u - w);
        if (d > Math.PI) d = TAU - d;
        return d;
      };
      nodes.push(
        <Draw
          paint={(g) => {
            const Ap = pt(aA), Bp = pt(aB), P = pt(Pang()), O: XY = [cx, cy];
            g.strokeStyle = alpha(INK, 0.6);
            g.lineWidth = 3 * k;
            g.beginPath();
            g.arc(cx, cy, R, 0, TAU);
            g.stroke();
            g.strokeStyle = C3;
            g.lineWidth = 6 * k;
            g.beginPath();
            g.arc(cx, cy, R, aA, aB);
            g.stroke();
            // Central angle.
            g.fillStyle = alpha(C2, 0.25);
            g.beginPath();
            g.moveTo(...O);
            g.arc(cx, cy, R * 0.25, aA, aB);
            g.closePath();
            g.fill();
            poly(g, [Ap, O, Bp], null, C2, 3);
            // Inscribed angle at P.
            g.strokeStyle = C1;
            g.lineWidth = 3 * k;
            g.beginPath();
            g.moveTo(...Ap);
            g.lineTo(...P);
            g.lineTo(...Bp);
            g.stroke();
            const u0 = Math.atan2(Ap[1] - P[1], Ap[0] - P[0]), u1 = Math.atan2(Bp[1] - P[1], Bp[0] - P[0]);
            g.fillStyle = alpha(C1, 0.3);
            g.beginPath();
            g.moveTo(...P);
            g.arc(P[0], P[1], R * 0.22, Math.min(u0, u1), Math.max(u0, u1));
            g.closePath();
            g.fill();
            dot(g, Ap, INK);
            dot(g, Bp, INK);
            dot(g, P, C1, 9);
            dot(g, O, C2);
            text(g, "A", [Ap[0] + 22 * k, Ap[1] + 16 * k], INK);
            text(g, "B", [Bp[0] - 22 * k, Bp[1] + 16 * k], INK);
            text(g, "P", [P[0] + (P[0] - cx) * 0.1, P[1] + (P[1] - cy) * 0.12], C1);
            text(g, "O", [O[0] + 22 * k, O[1] - 10 * k], C2);
            const ins = (angAt(P, Ap, Bp) * 180) / Math.PI, cen = (angAt(O, Ap, Bp) * 180) / Math.PI;
            text(g, `∠APB = ${num(ins, 1)}°`, [A.x + 170 * k, A.y + 40 * k], C1, 30);
            text(g, `∠AOB = ${num(cen, 1)}°`, [A.x + 170 * k, A.y + 84 * k], C2, 30);
          }}
        />,
      );
      show(label(ctx, "P chạy trên cung lớn: góc nội tiếp không đổi và bằng nửa góc ở tâm", { x: A.cx, y: A.y + A.h - 16 * k, size: 26, fill: INK }));
    } else if (p.mode === "centers") {
      const cx = A.cx, cy = A.cy, s = Math.min(A.w, A.h) * 0.32;
      const V = (i: number): XY => {
        const t = clock() * 0.35 * st.speed;
        const base: XY[] = [[-0.9, 0.6], [1.0, 0.65], [-0.15, -0.8]];
        return [cx + (base[i][0] + 0.18 * Math.sin(t + i * 2.1)) * s, cy + (base[i][1] + 0.15 * Math.cos(t * 1.3 + i)) * s];
      };
      const circum = (a: XY, b: XY, c: XY): XY => {
        const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
        const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
        return [ux, uy];
      };
      const sh = [0, 1, 2, 3].map((i) => () => smooth(clamp((clock() - ctx.cue(i, 5)) / 0.8, 0, 1)));
      nodes.push(
        <Draw
          paint={(g) => {
            const a = V(0), b = V(1), c = V(2);
            poly(g, [a, b, c], alpha(INK, 0.06), INK, 3.5);
            const G: XY = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
            const O = circum(a, b, c);
            const H: XY = [a[0] + b[0] + c[0] - 2 * O[0], a[1] + b[1] + c[1] - 2 * O[1]];
            const mids: XY[] = [lerp(b, c, 0.5), lerp(c, a, 0.5), lerp(a, b, 0.5)];
            if (sh[0]() > 0) {
              g.globalAlpha = sh[0]();
              [a, b, c].forEach((v, i) => {
                g.strokeStyle = C1;
                g.lineWidth = 2 * k;
                g.beginPath();
                g.moveTo(...v);
                g.lineTo(...mids[i]);
                g.stroke();
              });
              dot(g, G, C1, 9);
              text(g, "G", [G[0] + 18 * k, G[1] + 18 * k], C1);
            }
            if (sh[1]() > 0) {
              g.globalAlpha = sh[1]();
              g.strokeStyle = alpha(C2, 0.8);
              g.lineWidth = 2 * k;
              g.beginPath();
              g.arc(O[0], O[1], Math.hypot(a[0] - O[0], a[1] - O[1]), 0, TAU);
              g.stroke();
              mids.forEach((m) => {
                g.beginPath();
                g.moveTo(...O);
                g.lineTo(...m);
                g.stroke();
              });
              dot(g, O, C2, 9);
              text(g, "O", [O[0] + 18 * k, O[1] - 18 * k], C2);
            }
            if (sh[2]() > 0) {
              g.globalAlpha = sh[2]();
              [a, b, c].forEach((v, i) => {
                const p1 = [b, c, a][i], p2 = [c, a, b][i];
                const dx = p2[0] - p1[0], dy = p2[1] - p1[1], t = ((v[0] - p1[0]) * dx + (v[1] - p1[1]) * dy) / (dx * dx + dy * dy);
                const foot: XY = [p1[0] + dx * t, p1[1] + dy * t];
                g.strokeStyle = alpha(C3, 0.85);
                g.setLineDash([6 * k, 6 * k]);
                g.beginPath();
                g.moveTo(...v);
                g.lineTo(...foot);
                g.stroke();
                g.setLineDash([]);
              });
              dot(g, H, C3, 9);
              text(g, "H", [H[0] - 18 * k, H[1] - 18 * k], C3);
            }
            if (sh[3]() > 0) {
              g.globalAlpha = sh[3]();
              const dx = H[0] - O[0], dy = H[1] - O[1];
              g.strokeStyle = L.primary;
              g.lineWidth = 4 * k;
              g.beginPath();
              g.moveTo(O[0] - dx * 0.6, O[1] - dy * 0.6);
              g.lineTo(H[0] + dx * 0.4, H[1] + dy * 0.4);
              g.stroke();
            }
            g.globalAlpha = 1;
          }}
        />,
      );
      show(label(ctx, "G: trọng tâm (trung tuyến) · O: tâm đường tròn ngoại tiếp · H: trực tâm", { x: A.cx, y: A.y + 20 * k, size: 25, fill: INK }));
      show(label(ctx, "Đường thẳng Euler: O, G, H luôn thẳng hàng và OG : GH = 1 : 2", { x: A.cx, y: A.y + A.h - 16 * k, size: 26, fill: L.primary }));
    } else {
      // ---- transformations on a grid.
      const cx = A.cx, cy = A.cy, u = Math.min(A.w, A.h) / 12;
      const shape: XY[] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 3], [0, 3]];
      const phases = ["Tịnh tiến theo vector (3, −1)", "Quay 90° quanh gốc O", "Đối xứng qua trục Oy", "Vị tự tỉ số 1,5 tâm O"];
      const ph = () => clamp(Math.floor((clock() - 0.8) / ((D - 1.5) / 4)), 0, 3);
      const f = () => smooth(clamp((((clock() - 0.8) % ((D - 1.5) / 4)) / ((D - 1.5) / 4)) * 1.6, 0, 1));
      const T = (q: XY, i: number, t: number): XY => {
        if (i === 0) return [q[0] + 3 * t, q[1] - 1 * t];
        if (i === 1) {
          const a = (Math.PI / 2) * t;
          return [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a)];
        }
        if (i === 2) return [q[0] * (1 - 2 * t), q[1]];
        return [q[0] * (1 + 0.5 * t), q[1] * (1 + 0.5 * t)];
      };
      const toS = (q: XY): XY => [cx + q[0] * u, cy - q[1] * u];
      nodes.push(
        <Draw
          paint={(g) => {
            g.strokeStyle = alpha(INK, 0.1);
            g.lineWidth = 1.5 * k;
            for (let i = -12; i <= 12; i++) {
              g.beginPath();
              g.moveTo(cx + i * u, A.y);
              g.lineTo(cx + i * u, A.y + A.h);
              g.moveTo(A.x, cy + i * u);
              g.lineTo(A.x + A.w, cy + i * u);
              g.stroke();
            }
            g.strokeStyle = alpha(INK, 0.5);
            g.lineWidth = 2.5 * k;
            g.beginPath();
            g.moveTo(A.x, cy);
            g.lineTo(A.x + A.w, cy);
            g.moveTo(cx, A.y);
            g.lineTo(cx, A.y + A.h);
            g.stroke();
            const i = ph();
            poly(g, shape.map(toS), alpha(INK, 0.08), alpha(INK, 0.35), 2);
            if (i === 2) {
              g.strokeStyle = alpha(C3, 0.8);
              g.setLineDash([10 * k, 8 * k]);
              g.beginPath();
              g.moveTo(cx, A.y);
              g.lineTo(cx, A.y + A.h);
              g.stroke();
              g.setLineDash([]);
            }
            poly(g, shape.map((q) => toS(T(q, i, f()))), alpha(C1, 0.4), C1, 3.5);
            text(g, phases[i], [cx, A.y + 28 * k], INK, 28);
          }}
        />,
      );
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
      yield* until(p.mode === "pythagoras" ? ctx.cue([0, 2, 3][i] ?? i, 4) : ctx.cue(i + (p.mode === "centers" ? 3 : 0), steps.length + (p.mode === "centers" ? 4 : 1)));
      yield steps[i]();
    }
    void Line;
    void Rect;
    void mix;
    void easeInOutCubic;
  },
});
