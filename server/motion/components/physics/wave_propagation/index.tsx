// Travelling waves y(x, t) = A·sin(kx − ωt), k = 2π/λ, ω = 2πf, speed v = f·λ.
// Optional second wave: same direction (interference, beats) or opposite direction
// (standing wave); the sum is drawn thick, each component thin. Fast waves (sound, light) are
// shown slowed down so that one oscillation is visible; the slow-down factor is printed.
import { Circle, Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp, popIn } from "../../../transitions";

interface Wave {
  frequency: number;
  wavelength: number;
  amplitude: number;
}
interface Props extends Wave {
  title: string;
  mode: "transverse" | "longitudinal";
  unitLabel: string;
  showParticle: boolean;
  showLabels: boolean;
  second: Wave & { enabled: boolean; direction: "same" | "opposite" };
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const L = 2.5 * p.wavelength; // metres shown across the frame
    const both = p.second.enabled;
    const long = p.mode === "longitudinal";
    // Longitudinal displacement is a share of the on-screen wavelength (k·A = 0.4, so particles never
    // pass each other) and the same amount is kept free at both ends.
    const span = safe.w - 80 * k;
    const dispMax = long ? (0.4 * (span / 2.5)) / (2 * Math.PI) : 0;
    const x0 = safe.x + 40 * k + dispMax, x1 = safe.x + safe.w - 40 * k - dispMax, cy = safe.y + safe.h * 0.55;
    const sx = (x1 - x0) / L;
    const Apx = long ? dispMax / (both ? 2 : 1) : Math.min(safe.h * 0.2, safe.w * 0.16) / (both ? 1.6 : 1);
    const lamY = long ? cy - 120 * k : cy - Apx * 1.6 - 30 * k; // λ bracket clear of the wave
    // Slow motion: the displayed rate of the faster wave is at most 1 cycle per second.
    const fMax = Math.max(p.frequency, both ? p.second.frequency : 0);
    const slow = fMax > 1 ? 1 / fMax : 1;
    const clock = createSignal(0);
    const t = () => clock() * slow; // physical seconds
    const amp = createSignal(0); // grows in at the start
    const w1 = (x: number) => p.amplitude * Math.sin((2 * Math.PI * x) / p.wavelength - 2 * Math.PI * p.frequency * t());
    const w2 = (x: number) => (both ? p.second.amplitude * Math.sin((2 * Math.PI * x) / p.second.wavelength - (p.second.direction === "same" ? 1 : -1) * 2 * Math.PI * p.second.frequency * t()) : 0);
    const N = 220;
    const curve = (f: (x: number) => number) => () =>
      Array.from({ length: N + 1 }, (_, i) => {
        const x = (L * i) / N;
        return [x0 + x * sx, cy - amp() * Apx * f(x)] as [number, number];
      });

    const titleTxt = createRef<Txt>();
    const lam = createRef<Node>();
    const ampG = createRef<Node>();
    const info = createRef<Txt>();
    const bead = createRef<Circle>();
    const px = 1.25 * p.wavelength; // tracked particle of the medium
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {label(ctx, "", { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted, ref: info })}
        <Line points={[[x0, cy], [x1, cy]]} stroke={theme.line} lineWidth={2 * k} lineDash={[10 * k, 10 * k]} />
        {p.mode === "transverse" ? (
          <Node>
            {both ? <Line points={curve(w1)} stroke={theme.accent} lineWidth={3 * k} opacity={0.5} /> : null}
            {both ? <Line points={curve(w2)} stroke={theme.accent2} lineWidth={3 * k} opacity={0.5} /> : null}
            <Line points={curve((x) => w1(x) + w2(x))} stroke={both ? theme.ink : theme.accent} lineWidth={7 * k} lineCap="round" lineJoin="round" />
            {p.showParticle ? (
              <Node>
                <Line points={[[x0 + px * sx, cy - Apx * 1.15 * (both ? 2 : 1)], [x0 + px * sx, cy + Apx * 1.15 * (both ? 2 : 1)]]} stroke={theme.accent2} lineWidth={2 * k} lineDash={[6 * k, 6 * k]} opacity={0.7} />
                <Circle ref={bead} x={x0 + px * sx} y={() => cy - amp() * Apx * (w1(px) + w2(px))} size={26 * k} fill={theme.accent2} stroke={theme.ink} lineWidth={3 * k} />
              </Node>
            ) : null}
          </Node>
        ) : (
          // Longitudinal: columns of particles displaced along x; dense where they bunch up.
          <Node>
            {Array.from({ length: 56 }, (_, i) =>
              Array.from({ length: 5 }, (_, r) => {
                const xr = (L * (i + 0.5)) / 56;
                const dx = () => amp() * Apx * (w1(xr) + w2(xr));
                return <Circle x={() => x0 + xr * sx + dx()} y={cy + (r - 2) * 34 * k} size={14 * k} fill={i === Math.round(56 * (px / L)) && p.showParticle ? theme.accent2 : theme.accent} />;
              }),
            )}
          </Node>
        )}
        {p.showLabels ? (
          <Node ref={lam} opacity={0}>
            <Line points={[[x0 + 0.25 * p.wavelength * sx, lamY], [x0 + 1.25 * p.wavelength * sx, lamY]]} stroke={theme.ink} lineWidth={3 * k} startArrow endArrow arrowSize={12 * k} />
            {label(ctx, `λ = ${num(p.wavelength, 3)} ${p.unitLabel}`, { x: x0 + 0.75 * p.wavelength * sx, y: lamY - 32 * k, size: 28 })}
          </Node>
        ) : null}
        {p.showLabels && p.mode === "transverse" && !both ? (
          <Node ref={ampG} opacity={0}>
            <Line points={[[x1 + 20 * k, cy], [x1 + 20 * k, cy - Apx]]} stroke={theme.ink} lineWidth={3 * k} startArrow endArrow arrowSize={10 * k} />
            {label(ctx, "A", { x: x1 + 4 * k, y: cy - Apx / 2, size: 28, align: "right" })}
          </Node>
        ) : null}
        {label(ctx, `→ v = f·λ = ${num(p.frequency * p.wavelength, 2)} ${p.unitLabel}/s`, { x: safe.x + safe.w / 2, y: safe.y + safe.h - 30 * k, size: 28, fill: theme.accent })}
      </Node>,
    );
    info().text(`f = ${num(p.frequency, 2)} Hz · T = ${num(1 / p.frequency, 4)} s${slow < 1 ? ` · chiếu chậm ${num(1 / slow, 0)} lần` : ""}${both ? (p.second.direction === "opposite" ? " · hai sóng ngược chiều → sóng dừng" : " · hai sóng chồng lên nhau") : ""}`);

    yield clock(ctx.duration, ctx.duration, linear);
    yield amp(1, 1.2);
    yield* fadeUp(titleTxt(), 0.5);
    if (bead()) yield popIn(bead(), 0.4);
    if (p.showLabels) {
      yield* until(ctx.cue(0, 2));
      yield* lam().opacity(1, 0.5);
      if (ampG()) {
        yield* until(ctx.cue(1, 2));
        yield* ampG().opacity(1, 0.5);
      }
    }
  },
});
