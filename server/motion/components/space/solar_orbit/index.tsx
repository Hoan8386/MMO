// Planets on their real elliptical orbits (J2000 elements, Kepler's equation): directions and
// eccentricities are true, periods are true relative to each other (Kepler's third law shows by
// itself), distances are compressed with a square-root scale so inner and outer planets fit
// together, and sizes are not to scale. Both facts are written on screen.
import { Circle, Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label, scaleNote } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { PLANETS, orbitPos } from "../../../shared/astro";
import { fadeUp, popIn } from "../../../transitions";

interface Props {
  title: string;
  planets: string[];
  highlight: string;
  orbitSpeed: number;
  cameraMode: "overview" | "tilted";
  showLabels: boolean;
  showPeriods: boolean;
  scaleNote: string;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const list = p.planets.map((id) => ({ id, ...PLANETS[id] }));
    const cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2 + 30 * k;
    const squash = p.cameraMode === "tilted" ? 0.45 : 1;
    const sunR = 42 * k;
    // Room for a label (about 300 px wide) at the far ends of the outer orbit.
    const rMax = Math.min(safe.w / 2 - 170 * k, (safe.h / 2 - 90 * k) / squash);
    const aMax = Math.max(...list.map((q) => q.a * (1 + q.e)));
    const map = (r: number) => sunR + 26 * k + (rMax - sunR - 26 * k) * Math.sqrt(r / aMax);
    const toScreen = ([x, y]: [number, number]) => {
      const r = Math.hypot(x, y), s = map(r) / (r || 1);
      return [cx + x * s, cy - y * s * squash] as [number, number];
    };
    // Simulated days per second of video: one Earth year in 8 s at orbitSpeed 1.
    const dps = (365.26 / 8) * p.orbitSpeed;
    const clock = createSignal(0);
    const days = () => clock() * dps;

    const orbits: Line[] = [];
    const bodies: Node[] = [];
    const size = (q: { radius: number }) => (6 + 9 * Math.log10(q.radius / 1000)) * k;
    const titleTxt = createRef<Txt>();
    const sun = createRef<Node>();
    const counter = createRef<Txt>();
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {list.map((q, i) => (
          <Line
            ref={makeRef(orbits, i)}
            points={Array.from({ length: 145 }, (_, j) => toScreen(orbitPos(q, (q.period * j) / 144)))}
            closed
            stroke={q.id === p.highlight ? q.color : theme.line}
            lineWidth={(q.id === p.highlight ? 4 : 2.5) * k}
            end={0}
          />
        ))}
        <Node ref={sun}>
          <Circle x={cx} y={cy} size={sunR * 4} fill="#FFB703" opacity={0.18} />
          <Circle x={cx} y={cy} size={sunR * 2.8} fill="#FFB703" opacity={0.3} />
          <Circle x={cx} y={cy} size={sunR * 2} fill="#FFC93C" stroke="#FFE38A" lineWidth={4 * k} />
          {label(ctx, "Mặt Trời", { x: cx, y: cy + sunR + 30 * k, size: 24, fill: theme.muted })}
        </Node>
        {list.map((q, i) => (
          <Node ref={makeRef(bodies, i)} position={() => toScreen(orbitPos(q, days()))} opacity={0}>
            {q.id === p.highlight ? <Circle size={size(q) * 2 + 26 * k} stroke={q.color} lineWidth={3 * k} opacity={0.6} /> : null}
            {q.rings ? <Circle size={[size(q) * 4.4, size(q) * 1.4]} stroke="#E3CB8F" lineWidth={3 * k} rotation={-18} /> : null}
            <Circle size={size(q) * 2} fill={q.color} stroke={theme.bg} lineWidth={2 * k} />
            {p.showLabels
              ? label(ctx, p.showPeriods ? `${q.name} · ${num(q.period, 0)} ngày` : q.name, { y: -size(q) - 24 * k, size: q.id === p.highlight ? 26 : 22, fill: q.id === p.highlight ? theme.ink : theme.muted })
              : null}
          </Node>
        ))}
        {label(ctx, "", { x: safe.x + safe.w, y: safe.y + 30 * k, size: 28, align: "right", fill: theme.muted, ref: counter })}
        {scaleNote(ctx, p.scaleNote)}
      </Node>,
    );
    counter().text(() => `Ngày thứ ${num(days(), 0)} · 1 giây = ${num(dps, 0)} ngày`);

    yield clock(ctx.duration, ctx.duration, linear);
    yield* all(fadeUp(titleTxt(), 0.5), popIn(sun(), 0.6));
    for (let i = 0; i < list.length; i++) {
      yield* until(ctx.cue(i, list.length) - 0.3);
      yield all(orbits[i].end(1, 0.8), bodies[i].opacity(1, 0.4));
    }
  },
});
