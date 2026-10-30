// Projectile motion without air resistance, computed from the equations of motion:
//   x(t) = v0·cosθ·t,  y(t) = v0·sinθ·t − g·t²/2
//   flight time T = 2·v0·sinθ/g,  range R = v0²·sin2θ/g,  peak H = v0²·sin²θ/(2g)
// The world is scaled to fit the safe area; playback may be slowed or sped up to fit the clip,
// and the playback rate is then printed on screen so time is never misrepresented.
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeOutCubic, linear, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num, niceStep } from "../../../shared/format";
import { fadeUp, popIn, drawOn } from "../../../transitions";

interface Props {
  title: string;
  v0: number;
  angle: number;
  g: number;
  compareAngles: number[];
  showVectors: boolean;
  showValues: boolean;
  objectLabel: string;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const rad = (d: number) => (d * Math.PI) / 180;
    const flight = (a: number) => (2 * p.v0 * Math.sin(rad(a))) / p.g;
    const rangeOf = (a: number) => (p.v0 * p.v0 * Math.sin(2 * rad(a))) / p.g;
    const peakOf = (a: number) => (p.v0 * Math.sin(rad(a))) ** 2 / (2 * p.g);
    const angles = [p.angle, ...p.compareAngles];
    const R = rangeOf(p.angle), H = peakOf(p.angle), T = flight(p.angle);
    const maxR = Math.max(...angles.map(rangeOf)), maxH = Math.max(...angles.map(peakOf));

    // World → screen: fit the largest trajectory into the safe area under the title.
    const top = safe.y + 120 * k, floor = safe.y + safe.h - 100 * k, left = safe.x + (p.objectLabel ? 190 : 70) * k, right = safe.x + safe.w - 40 * k;
    const s = Math.min((right - left) / (maxR * 1.08), (floor - top) / (maxH * 1.25));
    // In tall frames the width limits the scale: centre the plot vertically instead of leaving it on the floor.
    const bottom = Math.min(floor, (top + floor) / 2 + (maxH * 1.25 * s) / 2);
    const X = (x: number) => left + x * s, Y = (y: number) => bottom - y * s;
    const pathOf = (a: number) => Array.from({ length: 81 }, (_, i) => {
      const t = (flight(a) * i) / 80;
      return [X(p.v0 * Math.cos(rad(a)) * t), Y(p.v0 * Math.sin(rad(a)) * t - (p.g * t * t) / 2)] as [number, number];
    });

    // Playback: the flight takes about half the clip; any rate other than 1 is shown.
    const tLaunch = ctx.cue(0, 3);
    const play = Math.max(1.2, Math.min(ctx.duration - tLaunch - 1.2, ctx.duration * 0.5));
    const rate = T / play;
    const shownRate = Math.abs(rate - 1) < 0.08 ? 1 : rate;
    const playback = T / shownRate;

    const ground = createRef<Line>();
    const ticks: Node[] = [];
    const ghosts: Line[] = [];
    const trail = createRef<Line>();
    const ball = createRef<Circle>();
    const vx = createRef<Line>(), vy = createRef<Line>(), vv = createRef<Line>();
    const clock = createSignal(0); // flight time in seconds of the real motion
    const pos = () => {
      const t = Math.min(clock(), T);
      return [X(p.v0 * Math.cos(rad(p.angle)) * t), Y(p.v0 * Math.sin(rad(p.angle)) * t - (p.g * t * t) / 2)] as [number, number];
    };
    const vel = () => {
      const t = Math.min(clock(), T);
      return [p.v0 * Math.cos(rad(p.angle)), p.v0 * Math.sin(rad(p.angle)) - p.g * t];
    };
    const vs = (40 * k) / p.v0 * 2.2; // velocity arrow scale: v0 ↦ 88 px
    const timeTxt = createRef<Txt>();
    const titleTxt = createRef<Txt>();
    const apex = createRef<Node>();
    const rangeG = createRef<Node>();
    const rateTxt = createRef<Txt>();

    const step = niceStep(maxR, 5);
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        <Line ref={ground} points={[[left - 20 * k, bottom], [right, bottom]]} stroke={theme.ink} lineWidth={5 * k} lineCap="round" />
        {Array.from({ length: Math.floor(maxR / step) + 1 }, (_, i) => (
          <Node ref={makeRef(ticks, i)} opacity={0}>
            <Line points={[[X(i * step), bottom], [X(i * step), bottom + 12 * k]]} stroke={theme.muted} lineWidth={3 * k} />
            {label(ctx, `${num(i * step, 0)} m`, { x: X(i * step), y: bottom + 36 * k, size: 22, fill: theme.muted })}
          </Node>
        ))}
        {p.compareAngles.map((a, i) => (
          <Line ref={makeRef(ghosts, i)} points={pathOf(a)} stroke={theme.muted} lineWidth={3 * k} lineDash={[10 * k, 10 * k]} end={0} />
        ))}
        <Line ref={trail} points={pathOf(p.angle)} stroke={theme.accent} lineWidth={6 * k} lineCap="round" end={() => Math.min(1, clock() / T)} />
        <Line ref={vx} points={() => [pos(), [pos()[0] + vel()[0] * vs, pos()[1]]]} stroke={theme.accent2} lineWidth={5 * k} endArrow arrowSize={14 * k} opacity={0} />
        <Line ref={vy} points={() => [pos(), [pos()[0], pos()[1] - vel()[1] * vs]]} stroke="#7EE081" lineWidth={5 * k} endArrow arrowSize={14 * k} opacity={0} />
        <Line ref={vv} points={() => [pos(), [pos()[0] + vel()[0] * vs, pos()[1] - vel()[1] * vs]]} stroke={theme.ink} lineWidth={4 * k} endArrow arrowSize={14 * k} opacity={0} />
        <Circle ref={ball} size={34 * k} fill={theme.accent2} stroke={theme.ink} lineWidth={3 * k} position={pos} />
        {label(ctx, "", { x: right, y: safe.y + 34 * k, size: 28, align: "right", fill: theme.muted, ref: timeTxt })}
        <Node ref={apex} opacity={0}>
          <Line points={[[X(R / 2), Y(H)], [X(R / 2), bottom]]} stroke={theme.muted} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
          {label(ctx, `H = ${num(H)} m`, { x: X(R / 2), y: Y(H) - 36 * k, size: 28, fill: theme.accent })}
        </Node>
        <Node ref={rangeG} opacity={0}>
          <Line points={[[X(0), bottom + 84 * k], [X(R), bottom + 84 * k]]} stroke={theme.accent} lineWidth={4 * k} startArrow endArrow arrowSize={12 * k} />
          <Rect x={X(R / 2)} y={bottom + 84 * k} width={240 * k} height={44 * k} radius={22 * k} fill={theme.bg2} />
          {label(ctx, `R = ${num(R)} m`, { x: X(R / 2), y: bottom + 84 * k, size: 28, fill: theme.accent })}
        </Node>
        {label(ctx, `v₀ = ${num(p.v0)} m/s · θ = ${num(p.angle, 0)}° · g = ${num(p.g, 2)} m/s²`, { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted })}
        {label(ctx, shownRate === 1 ? "" : `Tốc độ phát ×${num(shownRate, 2)}`, { x: right, y: safe.y + 72 * k, size: 22, align: "right", fill: theme.muted, ref: rateTxt })}
        {label(ctx, p.objectLabel, { x: X(0) - 22 * k, y: bottom - 22 * k, size: 24, fill: theme.muted, align: "right" })}
      </Node>,
    );
    timeTxt().text(() => `t = ${num(Math.min(clock(), T), 2)} s`);

    yield* all(fadeUp(titleTxt(), 0.5), drawOn(ground(), 0.6), popIn(ball(), 0.4));
    yield* all(...ticks.map((t, i) => t.opacity(1, 0.3 + i * 0.05)));
    yield* until(tLaunch);
    if (p.showVectors) yield all(vx().opacity(1, 0.3), vy().opacity(1, 0.3), vv().opacity(0.9, 0.3));
    // Ghost trajectories of the comparison angles appear with the launch.
    yield all(...ghosts.map((g) => g.end(1, playback, linear)));
    yield* clock(T, playback, linear);
    yield* all(vx().opacity(0, 0.3), vy().opacity(0, 0.3), vv().opacity(0, 0.3));
    if (p.showValues) {
      yield* until(ctx.cue(1, 3));
      yield* all(apex().opacity(1, 0.5), apex().y(0, 0.5, easeOutCubic));
      yield* until(ctx.cue(2, 3));
      yield* rangeG().opacity(1, 0.5);
    }
  },
});
