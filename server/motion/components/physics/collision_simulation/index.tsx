// One-dimensional collision of two bodies with coefficient of restitution e:
//   v1 = (m1u1 + m2u2 − m2·e·(u1 − u2)) / (m1 + m2)
//   v2 = (m1u1 + m2u2 + m1·e·(u1 − u2)) / (m1 + m2)
// e = 1 elastic, e = 0 perfectly inelastic (they move on together). Time runs in real time;
// the space scale is chosen so the whole motion stays in frame. A table shows momentum
// (always conserved) and kinetic energy (conserved only when e = 1) before and after.
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp, popIn } from "../../../transitions";

interface Body {
  name: string;
  mass: number;
  velocity: number;
}
interface Props {
  title: string;
  a: Body;
  b: Body;
  restitution: number;
  showTable: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const { a, b } = p, e = p.restitution;
    const meets = a.velocity > b.velocity;
    const M = a.mass + b.mass, P = a.mass * a.velocity + b.mass * b.velocity;
    const va = meets ? (P - b.mass * e * (a.velocity - b.velocity)) / M : a.velocity;
    const vb = meets ? (P + a.mass * e * (a.velocity - b.velocity)) / M : b.velocity;
    const tc = meets ? ctx.cue(0, 2) : Infinity; // the bodies touch at this moment (s)
    const D = ctx.duration;

    // Positions in metres of A's right face and B's left face; contact point is x = 0 at tc.
    const ar = (t: number) => (t < tc ? a.velocity * (t - tc) : va * (t - tc));
    const bl = (t: number) => (t < tc ? b.velocity * (t - tc) : vb * (t - tc)) + (meets ? 0 : 3);
    const wpx = (m: number) => (70 + 60 * Math.cbrt(m / Math.max(a.mass, b.mass))) * k;
    const wa = wpx(a.mass), wb = wpx(b.mass);
    const samples = [0, Math.min(tc, D), D].filter((t) => Number.isFinite(t));
    const lo = Math.min(...samples.map(ar)), hi = Math.max(...samples.map(bl));
    const margin = 170 * k; // room for a velocity arrow beyond either body
    const avail = safe.w - 2 * margin;
    const s = (avail - wa - wb) / Math.max(1e-6, hi - lo);
    const X = (m: number) => safe.x + margin + wa + (m - lo) * s; // screen x of a position in metres
    const trackY = safe.y + safe.h * 0.5;

    const clock = createSignal(0);
    const vel = (which: "a" | "b") => () => (clock() < tc ? (which === "a" ? a.velocity : b.velocity) : which === "a" ? va : vb);
    const vMax = Math.max(Math.abs(a.velocity), Math.abs(b.velocity), Math.abs(va), Math.abs(vb), 1e-6);
    const arrowLen = (v: number) => (v / vMax) * 150 * k;

    const titleTxt = createRef<Txt>();
    const flash = createRef<Circle>();
    const table = createRef<Node>();
    const box = (body: Body, color: string, w: number, right: () => number) => {
      const h = w * 0.75;
      const cx = () => right() - w / 2;
      const v = vel(body === a ? "a" : "b");
      return (
        <Node>
          <Rect x={cx} y={trackY - h / 2} width={w} height={h} radius={12 * k} fill={color} stroke={theme.ink} lineWidth={3 * k} />
          {label(ctx, body.name, { x: cx, y: trackY + 40 * k, size: 26 })}
          {label(ctx, `${num(body.mass, 2)} kg`, { x: cx, y: trackY - h / 2, size: 24, fill: "#0B1730" })}
          <Line
            points={() => [[cx(), trackY - h - 40 * k], [cx() + arrowLen(v()), trackY - h - 40 * k]]}
            stroke={color}
            lineWidth={6 * k}
            endArrow
            arrowSize={16 * k}
            opacity={() => (Math.abs(v()) > 1e-3 ? 1 : 0)}
          />
          <Txt text={() => `v = ${num(v(), 2)} m/s`} x={cx} y={trackY - h - 80 * k} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={24 * k} fill={theme.ink} />
        </Node>
      );
    };
    const ke = (m: number, v: number) => 0.5 * m * v * v;
    const row = (name: string, before: number, after: number, unit: string, y: number, color = theme.ink) => (
      <Node y={y}>
        {label(ctx, name, { x: safe.x + safe.w * 0.18, size: 26, align: "left", fill: theme.muted })}
        {label(ctx, `${num(before, 2)} ${unit}`, { x: safe.x + safe.w * 0.55, size: 28, align: "right", fill: color })}
        {label(ctx, `${num(after, 2)} ${unit}`, { x: safe.x + safe.w * 0.8, size: 28, align: "right", fill: color })}
      </Node>
    );
    const keB = ke(a.mass, a.velocity) + ke(b.mass, b.velocity), keA = ke(a.mass, va) + ke(b.mass, vb);
    const ty = trackY + 130 * k;

    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {label(ctx, `e = ${num(e, 2)} · ${e >= 0.999 ? "va chạm đàn hồi" : e <= 0.001 ? "va chạm mềm (dính vào nhau)" : "va chạm không hoàn toàn đàn hồi"}`, { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted })}
        <Line points={[[safe.x, trackY + 4 * k], [safe.x + safe.w, trackY + 4 * k]]} stroke={theme.muted} lineWidth={4 * k} />
        {box(a, theme.accent, wa, () => X(ar(clock())))}
        {box(b, theme.accent2, wb, () => X(bl(clock())) + wb)}
        <Circle ref={flash} x={X(0)} y={trackY - 40 * k} size={120 * k} fill="#FFE066" opacity={0} />
        <Node ref={table} opacity={0}>
          {label(ctx, "Trước", { x: safe.x + safe.w * 0.55, y: ty, size: 26, align: "right", fill: theme.muted })}
          {label(ctx, "Sau", { x: safe.x + safe.w * 0.8, y: ty, size: 26, align: "right", fill: theme.muted })}
          {row("Tổng động lượng p", P, a.mass * va + b.mass * vb, "kg·m/s", ty + 48 * k, theme.accent)}
          {row("Tổng động năng", keB, keA, "J", ty + 92 * k)}
          {label(ctx, `Động lượng bảo toàn ✓${keB - keA > 1e-6 ? ` · ${num((100 * (keB - keA)) / keB, 0)}% động năng thành nhiệt, biến dạng` : " · động năng bảo toàn"}`, { x: safe.x + safe.w * 0.18, y: ty + 140 * k, size: 24, align: "left", fill: theme.accent })}
        </Node>
        {meets ? null : label(ctx, "Vật sau chậm hơn vật trước: hai vật không gặp nhau", { x: safe.x + safe.w / 2, y: ty, size: 28, fill: theme.accent2 })}
      </Node>,
    );

    yield clock(D, D, linear);
    yield* fadeUp(titleTxt(), 0.5);
    if (!meets) return;
    yield* until(tc);
    yield* all(flash().opacity(0.9, 0.05), flash().scale(1.4, 0.3));
    yield* flash().opacity(0, 0.3);
    if (p.showTable) {
      yield* until(Math.max(tc + 0.8, ctx.cue(1, 2)));
      yield* fadeUp(table(), 0.5);
    }
  },
});
