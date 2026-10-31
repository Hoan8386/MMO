// Vectors on a coordinate grid. addition: a + b tip to tail and by the parallelogram rule, components
// shown. dot: b turns around a; the projection of b on a and a·b = |a||b|cos θ update live (zero when
// perpendicular, negative past 90°). cross: in 3D, a × b stands perpendicular to both with length equal
// to the parallelogram's area, flipping as b swings past a. field: a vector field (vortex, source or
// saddle) drawn as arrows, with particles advected along it.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "addition" | "dot" | "cross" | "field";
  field: "vortex" | "source" | "saddle";
  labels: boolean;
}

type XY = [number, number];
type V3 = [number, number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "linear_algebra");
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
    const CA = L.primary, CB = L.secondary, CR = L.accent, INK = L.text;
    const u = Math.min(A.w, A.h) / 10; // px per unit
    const cx = A.cx - (p.mode === "dot" ? u * 2 : 0), cy = A.cy + u * (p.mode === "field" ? 0 : 1.5);
    const S = (q: XY): XY => [cx + q[0] * u, cy - q[1] * u];
    const arrow = (g: CanvasRenderingContext2D, a: XY, b: XY, c: string, w = 5, head = 18) => {
      g.strokeStyle = c;
      g.fillStyle = c;
      g.lineWidth = L.lw(w * k);
      g.lineCap = "round";
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const hs = Math.min(head * k, len * 0.45);
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(b[0] - Math.cos(ang) * hs * 0.8, b[1] - Math.sin(ang) * hs * 0.8);
      g.stroke();
      g.beginPath();
      g.moveTo(...b);
      g.lineTo(b[0] - Math.cos(ang - 0.42) * hs, b[1] - Math.sin(ang - 0.42) * hs);
      g.lineTo(b[0] - Math.cos(ang + 0.42) * hs, b[1] - Math.sin(ang + 0.42) * hs);
      g.closePath();
      g.fill();
    };
    const grid = (g: CanvasRenderingContext2D) => {
      g.strokeStyle = alpha(INK, 0.08);
      g.lineWidth = 1.5 * k;
      for (let i = -12; i <= 12; i++) {
        g.beginPath();
        g.moveTo(cx + i * u, A.y);
        g.lineTo(cx + i * u, A.y + A.h);
        g.moveTo(A.x, cy + i * u);
        g.lineTo(A.x + A.w, cy + i * u);
        g.stroke();
      }
      g.strokeStyle = alpha(INK, 0.4);
      g.lineWidth = 2.5 * k;
      g.beginPath();
      g.moveTo(A.x, cy);
      g.lineTo(A.x + A.w, cy);
      g.moveTo(cx, A.y);
      g.lineTo(cx, A.y + A.h);
      g.stroke();
    };
    const tag = (g: CanvasRenderingContext2D, s: string, q: XY, c: string, size = 28) => {
      g.font = `800 ${size * k}px ${FONT}`;
      g.fillStyle = c;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(s, q[0], q[1]);
    };

    if (p.mode === "addition") {
      const a: XY = [3, 1], b: XY = [1, 2.5];
      const slide = () => smooth(clamp((clock() - ctx.cue(1, 4)) / 1.2, 0, 1));
      const para = () => smooth(clamp((clock() - ctx.cue(2, 4)) / 1, 0, 1));
      nodes.push(
        <Draw
          paint={(g) => {
            grid(g);
            const o = S([0, 0]);
            arrow(g, o, S(a), CA);
            tag(g, "a", S([a[0] / 2, a[1] / 2 - 0.4]), CA);
            // b slides to the tip of a.
            const off: XY = [a[0] * slide(), a[1] * slide()];
            arrow(g, S(off), S([off[0] + b[0], off[1] + b[1]]), CB);
            tag(g, "b", S([off[0] + b[0] / 2 + 0.35, off[1] + b[1] / 2]), CB);
            if (para() > 0) {
              g.globalAlpha = para();
              g.setLineDash([8 * k, 8 * k]);
              arrow(g, o, S(b), alpha(CB, 0.5), 3);
              arrow(g, S(b), S([a[0] + b[0], a[1] + b[1]]), alpha(CA, 0.5), 3);
              g.setLineDash([]);
              arrow(g, o, S([a[0] + b[0], a[1] + b[1]]), CR, 6);
              tag(g, "a + b", S([(a[0] + b[0]) / 2 - 0.7, (a[1] + b[1]) / 2 + 0.3]), CR, 30);
              g.globalAlpha = 1;
            }
          }}
        />,
      );
      show(label(ctx, `a = (${a[0]}, ${a[1]}) · b = (${b[0]}, ${b[1]})`, { x: A.x + 20 * k, y: A.y + 24 * k, size: 28, align: "left", fill: INK }));
      shows.push(createSignal(0));
      show(label(ctx, `a + b = (${a[0] + b[0]}, ${a[1] + b[1]}) — nối đuôi hoặc quy tắc hình bình hành`, { x: A.x + 20 * k, y: A.y + 62 * k, size: 28, align: "left", fill: CR }));
    } else if (p.mode === "dot") {
      const a: XY = [3.5, 0.8];
      const la = Math.hypot(...a), aa = Math.atan2(a[1], a[0]);
      const bang = () => aa + 0.3 + clamp((clock() - 1) / (D - 2), 0, 1) * Math.PI * 1.1;
      const b = (): XY => [Math.cos(bang()) * 2.6, Math.sin(bang()) * 2.6];
      nodes.push(
        <Draw
          paint={(g) => {
            grid(g);
            const o = S([0, 0]), B = b();
            const proj = (B[0] * a[0] + B[1] * a[1]) / (la * la);
            const P: XY = [a[0] * proj, a[1] * proj];
            // Extend a's line, the projection and the drop line.
            g.strokeStyle = alpha(CA, 0.3);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(...S([-a[0] * 0.9, -a[1] * 0.9]));
            g.lineTo(...S([a[0] * 1.3, a[1] * 1.3]));
            g.stroke();
            g.setLineDash([7 * k, 7 * k]);
            g.strokeStyle = alpha(INK, 0.6);
            g.beginPath();
            g.moveTo(...S(B));
            g.lineTo(...S(P));
            g.stroke();
            g.setLineDash([]);
            arrow(g, o, S(P), proj >= 0 ? CR : L.highlight, 9, 20);
            arrow(g, o, S(a), CA);
            arrow(g, o, S(B), CB);
            tag(g, "a", S([a[0] + 0.3, a[1] + 0.3]), CA);
            tag(g, "b", S([B[0] * 1.15, B[1] * 1.15]), CB);
            const th = Math.acos(clamp((B[0] * a[0] + B[1] * a[1]) / (la * 2.6), -1, 1));
            g.strokeStyle = INK;
            g.lineWidth = 2 * k;
            g.beginPath();
            g.arc(o[0], o[1], u * 0.6, -aa, -bang(), true);
            g.stroke();
            const dotv = B[0] * a[0] + B[1] * a[1];
            g.font = `800 ${28 * k}px ${FONT}`;
            g.textAlign = "left";
            g.fillStyle = INK;
            g.fillText(`θ = ${num((th * 180) / Math.PI, 0)}°`, A.x + A.w * 0.62, A.y + 40 * k);
            g.fillStyle = dotv >= 0 ? CR : L.highlight;
            g.fillText(`a·b = |a||b|cos θ = ${num(dotv, 2)}`, A.x + A.w * 0.62, A.y + 84 * k);
            g.fillStyle = L.dim;
            g.font = `600 ${22 * k}px ${FONT}`;
            g.fillText(Math.abs(dotv) < 0.25 ? "vuông góc → a·b = 0" : dotv > 0 ? "góc nhọn → dương" : "góc tù → âm", A.x + A.w * 0.62, A.y + 120 * k);
          }}
        />,
      );
      show(label(ctx, "Tích vô hướng = độ dài a × độ dài hình chiếu của b lên a", { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: INK }));
    } else if (p.mode === "cross") {
      const a: V3 = [2.2, 0, 0.4];
      const bAng = () => 0.4 + clamp((clock() - 1) / (D - 2), 0, 1) * Math.PI * 1.5;
      const b = (): V3 => [Math.cos(bAng()) * 2, 0, Math.sin(bAng()) * 2];
      const cross = (p1: V3, p2: V3): V3 => [p1[1] * p2[2] - p1[2] * p2[1], p1[2] * p2[0] - p1[0] * p2[2], p1[0] * p2[1] - p1[1] * p2[0]];
      // 3D view: the xz plane tilted, y up.
      const yaw = () => -0.6 + clock() * 0.12, tilt = 0.45;
      const P3 = (v: V3): XY => {
        const c = Math.cos(yaw()), s = Math.sin(yaw());
        const x = v[0] * c - v[2] * s, z = v[0] * s + v[2] * c;
        const y = v[1] * Math.cos(tilt) - z * Math.sin(tilt);
        return [A.cx + x * u * 1.2, A.cy + u * 0.8 - y * u * 1.2];
      };
      nodes.push(
        <Draw
          paint={(g) => {
            // Plane grid (xz).
            g.strokeStyle = alpha(INK, 0.1);
            g.lineWidth = 1.5 * k;
            for (let i = -3; i <= 3; i++) {
              g.beginPath();
              g.moveTo(...P3([i, 0, -3]));
              g.lineTo(...P3([i, 0, 3]));
              g.moveTo(...P3([-3, 0, i]));
              g.lineTo(...P3([3, 0, i]));
              g.stroke();
            }
            const B = b(), C = cross(a, B), o = P3([0, 0, 0]);
            // Parallelogram a, b.
            g.fillStyle = alpha(CR, 0.25);
            g.beginPath();
            g.moveTo(...o);
            g.lineTo(...P3(a));
            g.lineTo(...P3([a[0] + B[0], 0, a[2] + B[2]]));
            g.lineTo(...P3(B));
            g.closePath();
            g.fill();
            const scale = 0.5;
            arrow(g, o, P3(a), CA);
            arrow(g, o, P3(B), CB);
            arrow(g, o, P3([C[0] * scale, C[1] * scale, C[2] * scale]), CR, 6);
            tag(g, "a", P3([a[0] * 1.15, 0, a[2] * 1.15]), CA);
            tag(g, "b", P3([B[0] * 1.15, 0, B[2] * 1.15]), CB);
            tag(g, "a × b", P3([C[0] * scale * 1.1 + 0.4, C[1] * scale * 1.1, C[2] * scale * 1.1]), CR);
            g.font = `800 ${28 * k}px ${FONT}`;
            g.textAlign = "left";
            g.fillStyle = INK;
            g.fillText(`|a × b| = |a||b| sin θ = ${num(Math.hypot(...C), 2)} = diện tích hình bình hành`, A.x + 10 * k, A.y + 30 * k);
          }}
        />,
      );
      show(label(ctx, "a × b vuông góc với cả a và b — chiều theo quy tắc bàn tay phải", { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: INK }));
    } else {
      const F = (x: number, y: number): XY => (p.field === "vortex" ? [-y, x] : p.field === "source" ? [x, y] : [x, -y]);
      const R = rng(L.seed + 7);
      const parts = Array.from({ length: 220 }, () => [(R() - 0.5) * 10, (R() - 0.5) * 7]);
      const span = 1.4;
      nodes.push(
        <Draw
          paint={(g) => {
            grid(g);
            for (let x = -6; x <= 6; x++)
              for (let y = -4; y <= 4; y++) {
                const [fx, fy] = F(x, y), m = Math.hypot(fx, fy) || 1;
                const l = Math.min(0.8, 0.25 + m * 0.08);
                const a = S([x, y]), b = S([x + (fx / m) * l, y + (fy / m) * l]);
                arrow(g, a, b, alpha(CA, 0.4 + Math.min(0.5, m * 0.08)), 2.5, 10);
              }
            // Particles: advect by integrating the field (normalised speed), cycled lifetime.
            const t = clock() * st.speed;
            for (const q of parts) {
              let x = q[0], y = q[1];
              const life = (t * 0.4 + (q[0] + 5) * 0.07) % span;
              for (let s = 0; s < life * 20; s++) {
                const [fx, fy] = F(x, y), m = Math.hypot(fx, fy) || 1;
                x += (fx / m) * 0.08;
                y += (fy / m) * 0.08;
              }
              const a = 1 - life / span;
              g.fillStyle = alpha(CR, a);
              const [px, py] = S([x, y]);
              if (px < A.x || px > A.x + A.w || py < A.y || py > A.y + A.h) continue;
              g.beginPath();
              g.arc(px, py, 4 * k, 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      show(label(ctx, p.field === "vortex" ? "F(x, y) = (−y, x): trường xoáy — rot F ≠ 0, div F = 0" : p.field === "source" ? "F(x, y) = (x, y): trường nguồn — div F > 0" : "F(x, y) = (x, −y): điểm yên ngựa", { x: A.cx, y: A.y + 24 * k, size: 27, fill: INK }));
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
