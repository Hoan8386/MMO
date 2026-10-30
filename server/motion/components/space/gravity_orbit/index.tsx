// A body launched sideways near a central mass, moved by Newtonian gravity a = −GM·r/|r|³
// (velocity-Verlet integration, 400 sub-steps per second of motion). The launch speed is given
// relative to the circular-orbit speed √(GM/r): 1 → circle, below 1 → ellipse, √2 ≈ 1.414 →
// escape (parabola), above → hyperbola. Velocity and gravity arrows ride on the body; optionally
// equal-time sectors show Kepler's second law (equal areas in equal times).
import { Circle, Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp, popIn } from "../../../transitions";

interface Props {
  title: string;
  speedFactor: number;
  centerLabel: string;
  bodyLabel: string;
  showVectors: boolean;
  equalAreas: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    // Units: GM = 1, start radius r0 = 1, so the circular speed is 1 and its period 2π.
    const v0 = p.speedFactor;
    const energy = (v0 * v0) / 2 - 1; // < 0 bound
    const bound = energy < 0;
    const a = bound ? -1 / (2 * energy) : Infinity; // semi-major axis
    const period = bound ? 2 * Math.PI * Math.pow(a, 1.5) : Infinity;
    // Show about 1.3 orbits (bound) or the escape over the clip; motion time per video second:
    const D = ctx.duration, start = 0.8;
    const span = bound ? Math.min(period * 1.3, 40) : 8;
    const rate = span / (D - start - 0.5);

    // Integrate once.
    const SUB = 400, total = Math.ceil(span * SUB) + 1, h = 1 / SUB;
    const xs = new Float64Array(total), ys = new Float64Array(total), vxs = new Float64Array(total), vys = new Float64Array(total);
    let x = 1, y = 0, vx = 0, vy = v0;
    const acc = (x: number, y: number) => {
      const r3 = Math.pow(x * x + y * y, 1.5);
      return [-x / r3, -y / r3];
    };
    let [ax, ay] = acc(x, y);
    for (let i = 0; i < total; i++) {
      xs[i] = x, ys[i] = y, vxs[i] = vx, vys[i] = vy;
      x += vx * h + 0.5 * ax * h * h;
      y += vy * h + 0.5 * ay * h * h;
      const [nax, nay] = acc(x, y);
      vx += 0.5 * (ax + nax) * h;
      vy += 0.5 * (ay + nay) * h;
      [ax, ay] = [nax, nay];
    }
    // Screen scale: fit the bound orbit (apoapsis 2a − 1 on the far side) or the escape path.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < total; i += 20) {
      minX = Math.min(minX, xs[i]), maxX = Math.max(maxX, xs[i]), minY = Math.min(minY, ys[i]), maxY = Math.max(maxY, ys[i]);
    }
    minX = Math.min(minX, -0.3), maxX = Math.max(maxX, 0.3), minY = Math.min(minY, -0.3), maxY = Math.max(maxY, 0.3);
    const areaT = safe.y + 130 * k, areaB = safe.y + safe.h - 30 * k;
    const s = Math.min((safe.w - 260 * k) / (maxX - minX), (areaB - areaT) / (maxY - minY));
    const ox = safe.x + safe.w / 2 - ((minX + maxX) / 2) * s, oy = (areaT + areaB) / 2 + ((minY + maxY) / 2) * s;
    const S = (x: number, y: number) => [ox + x * s, oy - y * s] as [number, number];

    const clock = createSignal(0); // motion time
    const idx = () => Math.min(total - 1, Math.round(clock() * SUB));
    const pos = () => S(xs[idx()], ys[idx()]);
    const trail = () => {
      const n = idx(), pts: [number, number][] = [];
      for (let i = 0; i <= n; i += 8) pts.push(S(xs[i], ys[i]));
      pts.push(pos());
      return pts;
    };
    const vScale = 90 * k;
    const sectors: Line[] = [];
    const nSect = p.equalAreas && bound ? 6 : 0;
    const sectAt = (j: number) => Math.round(((period * j) / nSect) * SUB);
    const sectDur = Math.round((period / nSect) * 0.18 * SUB); // each sector spans the same time

    const titleTxt = createRef<Txt>();
    const center = createRef<Node>();
    const body = createRef<Node>();
    const kind = bound ? (Math.abs(v0 - 1) < 0.02 ? "quỹ đạo tròn" : "quỹ đạo elip") : Math.abs(v0 - Math.SQRT2) < 0.02 ? "vừa đủ thoát (parabol)" : "thoát ra (hyperbol)";
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {label(ctx, `v₀ = ${num(v0, 3)} × vận tốc vòng tròn → ${kind}${bound ? ` · chu kỳ ${num(period / (2 * Math.PI), 2)} lần quỹ đạo tròn` : ""}`, { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted })}
        {Array.from({ length: nSect }, (_, j) => {
          const i0 = sectAt(j), pts: [number, number][] = [S(0, 0)];
          for (let i = i0; i <= Math.min(total - 1, i0 + sectDur); i += 4) pts.push(S(xs[i], ys[i]));
          return <Line ref={makeRef(sectors, j)} points={pts} closed fill={theme.accent} opacity={0} />;
        })}
        <Line points={trail} stroke={theme.accent} lineWidth={4 * k} opacity={0.8} />
        <Node ref={center}>
          <Circle x={ox} y={oy} size={90 * k} fill="#FFB703" opacity={0.25} />
          <Circle x={ox} y={oy} size={56 * k} fill="#FFC93C" />
          {label(ctx, p.centerLabel, { x: ox, y: oy + 56 * k, size: 24, fill: theme.muted })}
        </Node>
        <Node ref={body} position={pos}>
          {p.showVectors ? (
            <Node>
              <Line points={() => [[0, 0], [vxs[idx()] * vScale, -vys[idx()] * vScale]]} stroke="#7EE081" lineWidth={5 * k} endArrow arrowSize={14 * k} />
              <Line
                points={() => {
                  const [gx, gy] = acc(xs[idx()], ys[idx()]), g = Math.hypot(gx, gy), L = Math.min(110, 55 * Math.sqrt(g)) * k;
                  return [[0, 0], [(gx / g) * L, (-gy / g) * L]];
                }}
                stroke={theme.accent2}
                lineWidth={5 * k}
                endArrow
                arrowSize={14 * k}
              />
            </Node>
          ) : null}
          <Circle size={30 * k} fill="#4F9BFF" stroke={theme.ink} lineWidth={3 * k} />
          {label(ctx, p.bodyLabel, { y: -36 * k, size: 24 })}
        </Node>
        {p.showVectors ? label(ctx, "→ vận tốc", { x: safe.x + safe.w, y: safe.y + safe.h - 70 * k, size: 24, align: "right", fill: "#7EE081" }) : null}
        {p.showVectors ? label(ctx, "→ lực hấp dẫn", { x: safe.x + safe.w, y: safe.y + safe.h - 34 * k, size: 24, align: "right", fill: theme.accent2 }) : null}
      </Node>,
    );

    yield* all(fadeUp(titleTxt(), 0.5), popIn(center(), 0.5), popIn(body(), 0.5));
    yield* until(start);
    yield clock(span, D - start - 0.5, linear);
    // Equal-area sectors light up as the body sweeps them (Kepler's second law).
    for (let j = 0; j < nSect; j++) {
      const t = start + (sectAt(j) / SUB + period / nSect * 0.18) / rate;
      if (t > D - 0.6) break;
      yield* until(t);
      yield sectors[j].opacity(0.35, 0.3);
    }
  },
});
