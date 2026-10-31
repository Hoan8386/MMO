// Effects shared by the science components. Every moving effect is a function of a clock signal (the
// scene time, or a component's own motion time), so any frame can be computed directly and the same
// props always give the same frames (seeded randomness, no per-frame state).
//
// glow · starfield · burst (particle explosion) · ripple (circular / energy pulse rings) ·
// pathAt + trail (light trails and pulses along a path) · typeOn (formula reveal) ·
// kinetic (word-by-word typography) · callout (diagram label with a leader line) · legend
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createSignal, easeOutCubic, sequence, type SimpleSignal, type ThreadGenerator } from "@motion-canvas/core";
import type { AnimContext } from "./context";
import type { Look } from "./palettes";
import { alpha } from "./palettes";
import { rng, clamp } from "./time";
import { FONT } from "./ui";

type Clock = () => number;
type XY = [number, number];

// Soft light around a shape (purposeful glow: the source, the active part, energy).
export const glow = (color: string, blur: number) => ({ shadowColor: color, shadowBlur: blur });

// Field of stars in a rectangle, three depth layers: far stars small and dim, near ones larger;
// each twinkles on its own phase, and the layers drift at different speeds (parallax) with the clock.
export function starfield(ctx: AnimContext, L: Look, o: { count?: number; seed?: number; clock?: Clock; drift?: number; rect?: { x: number; y: number; w: number; h: number } } = {}) {
  const r = rng(o.seed ?? 7);
  const box = o.rect ?? ctx.safe;
  const clock = o.clock ?? (() => 0);
  const drift = o.drift ?? 0;
  const tints = [L.ink, L.ink, L.ink, L.secondary, L.accent];
  const stars = Array.from({ length: o.count ?? 140 }, () => {
    const depth = r();
    return { x: r() * box.w, y: r() * box.h, depth, size: (0.8 + depth * depth * 2.6) * ctx.k, phase: r() * 6.28, rate: 0.6 + r() * 1.8, tint: tints[Math.floor(r() * tints.length)] };
  });
  return (
    <Node>
      {stars.map((s) => (
        <Circle
          size={s.size * 2}
          fill={s.tint}
          x={() => box.x + ((((s.x - clock() * drift * (0.3 + s.depth)) % box.w) + box.w) % box.w)}
          y={box.y + s.y}
          opacity={() => (0.25 + 0.6 * s.depth) * (0.7 + 0.3 * Math.sin(clock() * s.rate + s.phase))}
        />
      ))}
    </Node>
  );
}

// Particles thrown out from (x, y) at time t0: speeds and directions seeded, slowed by drag, fading
// over `life` seconds. spread: angular range in degrees around `dir` (360 = all around).
export function burst(ctx: AnimContext, o: { x: number; y: number; t0: number; clock: Clock; color: string | string[]; count?: number; seed?: number; speed?: number; life?: number; size?: number; dir?: number; spread?: number }) {
  const r = rng(o.seed ?? 3);
  const colors = [o.color].flat();
  const life = o.life ?? 1.6, v0 = (o.speed ?? 420) * ctx.k, spread = ((o.spread ?? 360) * Math.PI) / 180, dir = ((o.dir ?? 0) * Math.PI) / 180;
  const parts = Array.from({ length: o.count ?? 60 }, () => ({ a: dir + (r() - 0.5) * spread, v: v0 * (0.35 + r() * 0.65), s: (o.size ?? 6) * ctx.k * (0.5 + r()), c: colors[Math.floor(r() * colors.length)], l: life * (0.6 + r() * 0.4) }));
  const age = () => o.clock() - o.t0;
  return (
    <Node>
      {parts.map((q) => {
        // Distance with drag: v·(1 − e^(−3t))/3.
        const dist = () => (q.v * (1 - Math.exp(-3 * Math.max(0, age())))) / 3;
        return (
          <Circle
            size={() => q.s * (1 - 0.5 * clamp(age() / q.l, 0, 1))}
            fill={q.c}
            {...glow(q.c, 12 * ctx.k)}
            x={() => o.x + Math.cos(q.a) * dist()}
            y={() => o.y + Math.sin(q.a) * dist()}
            opacity={() => (age() < 0 ? 0 : 1 - clamp(age() / q.l, 0, 1))}
          />
        );
      })}
    </Node>
  );
}

// Rings spreading from (x, y) every `period` seconds after t0 (wave fronts, pulses, ripples).
export function ripple(ctx: AnimContext, o: { x: number; y: number; clock: Clock; color: string; t0?: number; period?: number; count?: number; maxR: number; width?: number; until?: number }) {
  const period = o.period ?? 1.2, n = o.count ?? 3, t0 = o.t0 ?? 0;
  return (
    <Node>
      {Array.from({ length: n }, (_, i) => {
        const u = () => {
          const t = o.clock() - t0 - (i * period) / n;
          if (t < 0 || (o.until != null && o.clock() > o.until + period)) return -1;
          return (t % period) / period;
        };
        return <Circle x={o.x} y={o.y} size={() => Math.max(0, u()) * o.maxR * 2} stroke={o.color} lineWidth={(o.width ?? 4) * ctx.k} opacity={() => (u() < 0 ? 0 : (1 - u()) * 0.9)} />;
      })}
    </Node>
  );
}

// Point at fraction u (0–1) of the arc length of a polyline.
export function pathAt(points: XY[], u: number): XY {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) seg.push((total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])));
  const d = clamp(u, 0, 1) * total;
  let i = seg.findIndex((s) => s >= d);
  if (i < 0) i = seg.length - 1;
  const s0 = i ? seg[i - 1] : 0, f = (d - s0) / Math.max(1e-9, seg[i] - s0);
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
}

// A glowing head running along a path with a fading tail (light trail, signal, energy pulse).
// u(): head position 0–1; tail: tail length as a fraction of the path.
export function trail(ctx: AnimContext, points: XY[], u: () => number, color: string, o: { tail?: number; size?: number; width?: number } = {}) {
  const tail = o.tail ?? 0.12, steps = 14;
  return (
    <Node opacity={() => (u() <= 0 || u() >= 1.0001 ? 0 : 1)}>
      <Line
        points={() => Array.from({ length: steps + 1 }, (_, i) => pathAt(points, u() - tail + (tail * i) / steps))}
        stroke={color}
        lineWidth={(o.width ?? 6) * ctx.k}
        lineCap="round"
        opacity={0.55}
        {...glow(color, 14 * ctx.k)}
      />
      <Circle size={(o.size ?? 18) * ctx.k} fill={color} position={() => pathAt(points, u())} {...glow(color, 24 * ctx.k)} />
    </Node>
  );
}

// Formula / text reveal, character by character.
export function* typeOn(txt: Txt, text: string, d = 0.8): ThreadGenerator {
  const n = createSignal(0);
  txt.text(() => text.slice(0, Math.round(n())));
  yield* n(text.length, d);
  txt.text(text);
}

// Words that rise in one after another (kinetic typography). Returns the node and its entrance.
export function kinetic(ctx: AnimContext, text: string, o: { x: number; y: number; size?: number; fill: string; accent?: string; stress?: string[] }) {
  const words = text.split(/\s+/).filter(Boolean);
  const stress = new Set((o.stress || []).map((w) => w.toLowerCase()));
  const refs: Txt[] = [];
  const node = (
    <Node x={o.x} y={o.y}>
      <Rect layout gap={14 * ctx.k} offsetX={-1}>
        {words.map((w, i) => (
          <Txt ref={(t: Txt) => (refs[i] = t)} text={w} fontFamily={FONT} fontWeight={stress.has(w.toLowerCase()) ? 800 : 600} fontSize={(o.size ?? 44) * ctx.k} fill={stress.has(w.toLowerCase()) ? o.accent ?? o.fill : o.fill} opacity={0} />
        ))}
      </Rect>
    </Node>
  );
  const enter = function* (d = 0.9): ThreadGenerator {
    yield* sequence(d / Math.max(1, words.length), ...refs.map((t) => all(t.opacity(1, 0.3), t.y(14 * ctx.k).y(0, 0.35, easeOutCubic))));
  };
  return { node, enter };
}

// A label joined to a point of a diagram by a thin leader line (scientific annotation).
export function callout(ctx: AnimContext, L: Look, at: XY, text: string, o: { dx?: number; dy?: number; color?: string; size?: number; ref?: (n: Node) => void } = {}) {
  const dx = (o.dx ?? 120) * ctx.k, dy = (o.dy ?? -80) * ctx.k, color = o.color ?? L.text;
  const end: XY = [at[0] + dx, at[1] + dy];
  return (
    <Node ref={o.ref} opacity={0}>
      <Circle position={at} size={10 * ctx.k} fill={color} />
      <Line points={[at, [end[0] - Math.sign(dx) * 6 * ctx.k, end[1]]]} stroke={alpha(color.startsWith("#") ? color : "#FFFFFF", 0.7)} lineWidth={2 * ctx.k} />
      <Txt text={text} x={end[0]} y={end[1]} offsetX={dx >= 0 ? -1 : 1} fontFamily={FONT} fontWeight={600} fontSize={(o.size ?? 26) * ctx.k} fill={color} />
    </Node>
  );
}

// Colour key: rows of swatch + text, top-left at (x, y).
export function legend(ctx: AnimContext, L: Look, x: number, y: number, rows: [string, string][], size = 24) {
  return (
    <Node>
      {rows.map(([color, text], i) => (
        <Node y={y + i * size * 1.5 * ctx.k}>
          <Circle x={x + 9 * ctx.k} size={16 * ctx.k} fill={color} {...glow(color, 8 * ctx.k)} />
          <Txt x={x + 28 * ctx.k} offsetX={-1} text={text} fontFamily={FONT} fontWeight={600} fontSize={size * ctx.k} fill={L.dim} />
        </Node>
      ))}
    </Node>
  );
}

export type { Clock, XY, SimpleSignal };
