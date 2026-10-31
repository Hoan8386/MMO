// Transit method: a planet crosses its star and the brightness we receive dips; the light curve is
// drawn live underneath. The star has limb darkening I(μ) = 1 − u(1 − μ) (u = 0.6); the dip is the
// light the planet covers: the overlap of the two discs times the local intensity, over the total
// I·π(1 − u/3). So the depth is ≈ (Rp/Rs)² — an Earth-size planet on a Sun-size star dims it 0.008 %.
import { Line, Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  planetRadius: number;
  impact: number;
  transits: number;
  starColor: string;
  planetColor: string;
  showFormula: boolean;
}

const U = 0.6;

// Area of the intersection of two circles (radii R and r, centres d apart).
function overlap(R: number, r: number, d: number) {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
  const a = Math.acos((d * d + r * r - R * R) / (2 * d * r)), b = Math.acos((d * d + R * R - r * r) / (2 * d * R));
  return r * r * a + R * R * b - 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "exoplanets");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const t = createSignal(0); // 0–1 over the observation
    // Star on top, light curve below.
    const starR = Math.min(A.w * 0.2, A.h * 0.22);
    const sx = A.cx, sy = A.y + starR + 30 * k;
    const G = { x: A.x + A.w * 0.08, y: sy + starR + 90 * k, w: A.w * 0.84, h: Math.min(A.h - (2 * starR + 150 * k), A.h * 0.36) };
    const rp = p.planetRadius; // Rp/Rs
    const b = p.impact;
    const n = p.transits;
    // Planet x (in star radii) at observation fraction u: crosses −2.4 → 2.4 once per transit.
    const px = (u: number) => {
      const phase = (u * n) % 1;
      return -2.6 + phase * 5.2;
    };
    const flux = (u: number) => {
      const x = px(u), d = Math.hypot(x, b);
      const mu = Math.sqrt(clamp(1 - Math.min(1, d) ** 2, 0, 1));
      const I = 1 - U * (1 - mu);
      return 1 - (overlap(1, rp, d) * I) / (Math.PI * (1 - U / 3));
    };
    const depth = (rp * rp * (1 - U * (1 - Math.sqrt(clamp(1 - b * b, 0, 1))))) / (1 - U / 3);
    // Vertical scale: the dip fills ~70 % of the chart however small it is (axis labelled in %).
    const yOf = (f: number) => G.y + G.h * 0.15 + ((1 - f) / Math.max(depth, 1e-6)) * G.h * 0.7;
    const curve = () => {
      const pts: [number, number][] = [];
      const steps = 220, end = t();
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * end;
        pts.push([G.x + u * G.w, yOf(flux(u))]);
      }
      return pts;
    };

    const paint = (g: CanvasRenderingContext2D) => {
      // Star with limb darkening and a corona glow.
      const halo = g.createRadialGradient(sx, sy, starR * 0.9, sx, sy, starR * 1.7);
      halo.addColorStop(0, alpha(p.starColor, 0.45));
      halo.addColorStop(1, alpha(p.starColor, 0));
      g.fillStyle = halo;
      g.beginPath();
      g.arc(sx, sy, starR * 1.7, 0, Math.PI * 2);
      g.fill();
      const disc = g.createRadialGradient(sx, sy, 0, sx, sy, starR);
      for (let i = 0; i <= 10; i++) {
        const rr = i / 10, mu = Math.sqrt(1 - rr * rr), I = 1 - U * (1 - mu);
        disc.addColorStop(rr, mix(mix(p.starColor, "#000000", 0.55), mix(p.starColor, "#FFFFFF", 0.55), I));
      }
      g.fillStyle = disc;
      g.beginPath();
      g.arc(sx, sy, starR, 0, Math.PI * 2);
      g.fill();
      // Planet silhouette (lit rim on the side away from the star is too faint to show).
      const x = sx + px(t()) * starR, y = sy + b * starR;
      g.fillStyle = mix(p.planetColor, "#000000", 0.75);
      g.beginPath();
      g.arc(x, y, rp * starR, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = alpha(p.planetColor, 0.8);
      g.lineWidth = 2 * k;
      g.stroke();
    };

    const title = createRef<Txt>();
    const chart = createRef<Node>();
    const formula = createRef<Node>();
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Node ref={chart} opacity={0}>
          <Line points={[[G.x, G.y], [G.x, G.y + G.h], [G.x + G.w, G.y + G.h]]} stroke={L.dim} lineWidth={2 * k} />
          <Line points={[[G.x, yOf(1)], [G.x + G.w, yOf(1)]]} stroke={alpha(L.ink.startsWith("#") ? L.ink : "#FFFFFF", 0.15)} lineWidth={1.5 * k} lineDash={[8 * k, 8 * k]} />
          <Txt text="độ sáng nhận được" x={G.x} y={G.y - 16 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={22 * k} fill={L.dim} />
          <Txt text="thời gian" x={G.x + G.w} y={G.y + G.h + 24 * k} offsetX={1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={22 * k} fill={L.dim} />
          <Txt text={`−${num(depth * 100, depth < 0.001 ? 4 : 2)} %`} x={G.x + 10 * k} y={yOf(1 - depth)} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={700} fontSize={24 * k} fill={L.accent} />
          <Line points={curve} stroke={L.secondary} lineWidth={4 * k} lineJoin="round" shadowColor={L.secondary} shadowBlur={10 * k} />
        </Node>
        {p.showFormula ? (
          <Node ref={formula} opacity={0}>
            {label(ctx, `độ sâu ≈ (Rp / Rs)² = ${num(rp * rp * 100, 3)} %`, { x: A.x + A.w, y: A.y + 20 * k, size: 30, align: "right", fill: L.accent })}
            {label(ctx, "tối ở rìa sao (limb darkening) làm đáy cong", { x: A.x + A.w, y: A.y + 60 * k, size: 22, align: "right", fill: L.dim })}
          </Node>
        ) : null}
      </Node>,
    );

    yield st.camera();
    if (p.title) yield fadeUp(title(), 0.5);
    yield* chart().opacity(1, 0.6);
    yield t(1, Math.max(1, D - 1), linear);
    if (p.showFormula) {
      yield* until(ctx.cue(0, 1));
      yield formula().opacity(1, 0.6, st.ease);
    }
  },
});
