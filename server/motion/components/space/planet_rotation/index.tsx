// A planet spinning on its tilted axis, seen side-on with the Sun to the left (the solstice
// geometry: the axis leans towards or away from the Sun in the picture plane). Meridians turn
// at the planet's real sidereal rate (scaled by rotationSpeed); the night half is fixed because
// the Sun is; a marker city goes through day and night. Orthographic projection.
import { Circle, Gradient, Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { PLANETS } from "../../../shared/astro";
import { fadeUp, popIn } from "../../../transitions";

interface Props {
  title: string;
  planet: string;
  tilt: number;
  hoursPerSecond: number;
  tiltTowardSun: boolean;
  showAxis: boolean;
  showDayNight: boolean;
  showLatitudes: boolean;
  marker: { label: string; lat: number; lon: number };
  sunLabel: string;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const pl = PLANETS[p.planet];
    const tilt = p.tilt >= 0 ? p.tilt : pl.tilt;
    const day = Math.abs(pl.day);
    const dir = Math.sign(pl.day) || 1;
    const hps = p.hoursPerSecond > 0 ? p.hoursPerSecond : day / 5; // default: one turn in 5 s
    const R = Math.min(safe.h * 0.36, safe.w * 0.24);
    const cx = safe.x + safe.w * 0.55, cy = safe.y + safe.h / 2 + 30 * k;
    const clock = createSignal(0);
    const hours = () => clock() * hps;
    const spin = () => (dir * 2 * Math.PI * hours()) / day; // radians turned
    const lean = (p.tiltTowardSun ? -1 : 1) * tilt; // MC rotation is clockwise: negative leans the north pole left, towards the Sun
    const rad = Math.PI / 180;

    const meridians: Line[] = [];
    const titleTxt = createRef<Txt>();
    const globe = createRef<Node>();
    const axis = createRef<Node>();
    const night = createRef<Node>();
    const sun = createRef<Node>();
    const mk = createRef<Node>();
    const status = createRef<Txt>();
    const clockTxt = createRef<Txt>();
    // Marker in the globe's own frame, then in view coordinates (for its day/night state).
    const mLocal = () => {
      const a = p.marker.lon * rad + spin();
      return { x: R * Math.cos(p.marker.lat * rad) * Math.sin(a), y: -R * Math.sin(p.marker.lat * rad), front: Math.cos(a) };
    };
    const mViewX = () => {
      const m = mLocal(), r = lean * rad;
      return m.x * Math.cos(r) - m.y * Math.sin(r);
    };
    const lats = [0, 23.44, -23.44, 66.56, -66.56];

    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        <Node ref={sun} opacity={0}>
          {[-1, 0, 1].map((j) => (
            <Line points={[[safe.x + 20 * k, cy + j * R * 0.55], [cx - R - 50 * k, cy + j * R * 0.55]]} stroke="#FFC93C" lineWidth={5 * k} endArrow arrowSize={16 * k} lineDash={[18 * k, 12 * k]} />
          ))}
          {label(ctx, p.sunLabel, { x: safe.x + 20 * k, y: cy - R * 0.55 - 36 * k, size: 24, fill: "#FFC93C", align: "left" })}
        </Node>
        <Node ref={globe} x={cx} y={cy} rotation={lean}>
          <Circle size={R * 2} fill={pl.color} />
          <Circle size={R * 2} fill={new Gradient({ type: "radial", fromX: -R * 0.35, fromY: -R * 0.35, toX: 0, toY: 0, fromRadius: 0, toRadius: R, stops: [{ offset: 0, color: "rgba(255,255,255,0.28)" }, { offset: 1, color: "rgba(255,255,255,0)" }] })} />
          {p.showLatitudes
            ? lats.map((lat) => (
                <Line points={[[-R * Math.cos(lat * rad), -R * Math.sin(lat * rad)], [R * Math.cos(lat * rad), -R * Math.sin(lat * rad)]]} stroke="#FFFFFF" lineWidth={(lat === 0 ? 3 : 2) * k} opacity={lat === 0 ? 0.55 : 0.3} lineDash={lat === 0 ? [] : [8 * k, 8 * k]} />
              ))
            : null}
          {Array.from({ length: 12 }, (_, i) => (
            <Line
              ref={makeRef(meridians, i)}
              points={() => {
                const a = i * 30 * rad + spin();
                return Array.from({ length: 19 }, (_, j) => {
                  const lat = (-90 + j * 10) * rad;
                  return [R * Math.cos(lat) * Math.sin(a), -R * Math.sin(lat)] as [number, number];
                });
              }}
              stroke="#FFFFFF"
              lineWidth={(i === 0 ? 3.5 : 2) * k}
              opacity={() => Math.max(0, Math.cos(i * 30 * rad + spin())) * (i === 0 ? 0.8 : 0.4)}
            />
          ))}
          <Node ref={mk} position={() => [mLocal().x, mLocal().y]} opacity={() => (mLocal().front > 0 ? Math.min(1, mLocal().front * 4) : 0)}>
            <Circle size={22 * k} fill={theme.accent2} stroke="#FFFFFF" lineWidth={4 * k} />
          </Node>
          {p.showAxis ? (
            <Node ref={axis}>
              <Line points={[[0, -R - 70 * k], [0, R + 70 * k]]} stroke={theme.ink} lineWidth={4 * k} lineDash={[12 * k, 8 * k]} />
              {label(ctx, "Bắc", { y: -R - 100 * k, size: 26 })}
            </Node>
          ) : null}
        </Node>
        {/* Night side: the half away from the Sun, with a soft terminator. */}
        <Node ref={night} opacity={p.showDayNight ? 1 : 0}>
          <Circle x={cx} y={cy} size={R * 2} startAngle={-90} endAngle={90} closed fill="#020617" opacity={0.55} />
          <Circle x={cx} y={cy} size={[R * 0.3, R * 2]} startAngle={90} endAngle={270} closed fill="#020617" opacity={0.25} />
        </Node>
        {label(ctx, p.marker.label, { x: cx, y: cy + R + 60 * k, size: 28, fill: theme.accent2, ref: status })}
        {label(ctx, "", { x: safe.x + safe.w, y: safe.y + 30 * k, size: 28, align: "right", fill: theme.muted, ref: clockTxt })}
        {label(ctx, `${pl.name} · trục nghiêng ${num(tilt, 1)}° · 1 vòng = ${num(day, 1)} giờ${dir < 0 ? " (quay ngược)" : ""}`, { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted })}
      </Node>,
    );
    if (p.marker.label) status().text(() => `${p.marker.label}: ${mViewX() < 0 ? "ban ngày ☀" : "ban đêm ☾"}`);
    else status().opacity(0);
    clockTxt().text(() => `+${num(hours(), 0)} giờ · 1 giây = ${num(hps, 1)} giờ`);

    yield clock(ctx.duration, ctx.duration, linear);
    yield* all(fadeUp(titleTxt(), 0.5), popIn(globe(), 0.6));
    yield* until(ctx.cue(0, 2));
    yield* sun().opacity(1, 0.5);
    if (p.showAxis) {
      yield* until(ctx.cue(1, 2));
      yield* axis().scale(1.15, 0.25).to(1, 0.25);
    }
  },
});
