// Double-slit experiment. A plane wave of the chosen wavelength (its colour) reaches a barrier with two
// slits; behind it the two circular waves overlap and the field is computed pixel by pixel as their
// sum (a Raster), so the bright and dark directions are real interference. On the screen the
// time-averaged intensity follows the Fraunhofer pattern I(θ) = cos²(π d sinθ / λ) · sinc²(π a sinθ / λ).
// Particle mode: single quanta land one by one at random points drawn from that same distribution,
// and the fringes build up — the wave–particle duality picture.
import { Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster, rgb } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, rng, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  wavelength: number;
  slitSeparation: number;
  slitWidth: number;
  mode: "wave" | "particles" | "both";
  particles: number;
  showGraph: boolean;
}

// Visible wavelength (nm) → sRGB hex (piecewise approximation of the spectrum).
function spectral(nm: number) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) (r = -(nm - 440) / 60), (b = 1);
  else if (nm < 490) (g = (nm - 440) / 50), (b = 1);
  else if (nm < 510) (g = 1), (b = -(nm - 510) / 20);
  else if (nm < 580) (r = (nm - 510) / 70), (g = 1);
  else if (nm < 645) (r = 1), (g = -(nm - 645) / 65);
  else r = 1;
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(clamp(v * f, 0, 1), 0.8)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "quantum");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const color = spectral(p.wavelength);
    const [cr, cg, cb] = rgb(color);
    // Geometry (px): source left, barrier at 26 %, screen at 78 %, graph to the right of the screen.
    const cy = A.cy;
    const bx = A.x + A.w * 0.24, sx = A.x + A.w * (p.showGraph ? 0.74 : 0.86);
    const H = A.h * 0.92;
    const lam = 22 * k * (p.wavelength / 550); // on-screen wavelength
    const d = p.slitSeparation * lam, a = p.slitWidth * lam;
    const Ls = sx - bx;
    const kw = (2 * Math.PI) / lam;
    const t = createSignal(0); // seconds of wave travel
    // The wave front sweeps across in ~35 % of the clip; the crests themselves move slowly (well under
    // the frame rate), so the pattern reads clearly instead of strobing.
    const speed = ((sx - A.x) / (D * 0.35)) ;
    const phaseV = lam * 0.9;
    const waveOn = createSignal(0);
    const hits = createSignal(0);
    const intensity = (y: number) => {
      const s = (y - cy) / Math.hypot(y - cy, Ls);
      const beta = (Math.PI * a * s) / lam, alph = (Math.PI * d * s) / lam;
      const sinc = Math.abs(beta) < 1e-6 ? 1 : Math.sin(beta) / beta;
      return Math.cos(alph) ** 2 * sinc * sinc;
    };
    // Particle landing points: rejection sampling from I(y), seeded.
    const r = rng(17);
    const drops: [number, number][] = [];
    while (drops.length < p.particles) {
      const y = cy + (r() - 0.5) * H;
      if (r() < intensity(y)) drops.push([sx - r() * 10 * k, y]);
    }
    const showWave = p.mode !== "particles";

    // Wave field behind the barrier: sum of two cylindrical waves, revealed as they spread.
    const RW = sx - bx, RH = H;
    const paintField = (data: Uint8ClampedArray, cols: number, rows: number) => {
      const time = t(), front = time * speed, ph = kw * time * phaseV, on = waveOn();
      for (let j = 0; j < rows; j++) {
        const y = cy - RH / 2 + ((j + 0.5) / rows) * RH;
        for (let i = 0; i < cols; i++) {
          const x = bx + ((i + 0.5) / cols) * RW;
          const r1 = Math.hypot(x - bx, y - (cy - d / 2)), r2 = Math.hypot(x - bx, y - (cy + d / 2));
          const reach = front - Math.max(0, (bx - (A.x + 40 * k)));
          const w1 = r1 < reach ? Math.cos(kw * r1 - ph) / Math.sqrt(1 + r1 / (lam * 4)) : 0;
          const w2 = r2 < reach ? Math.cos(kw * r2 - ph) / Math.sqrt(1 + r2 / (lam * 4)) : 0;
          const v = (w1 + w2) * 0.9 * on;
          const o = (j * cols + i) * 4;
          const lit = clamp(v, 0, 1), dim = clamp(-v, 0, 1);
          data[o] = cr * lit + 30 * dim;
          data[o + 1] = cg * lit + 30 * dim;
          data[o + 2] = cb * lit + 60 * dim;
          data[o + 3] = 255 * clamp(Math.abs(v) * 0.9, 0, 0.85);
        }
      }
    };
    const paint = (g: CanvasRenderingContext2D) => {
      const time = t(), front = time * speed, on = waveOn();
      // Plane waves arriving from the left.
      if (showWave && on > 0) {
        g.strokeStyle = alpha(color, 0.7 * on);
        g.lineWidth = 3 * k;
        const x0 = A.x + 40 * k;
        const shift = ((time * phaseV) % lam + lam) % lam;
        for (let x = x0 + shift; x < bx; x += lam) {
          if (x - x0 > front) break;
          g.beginPath();
          g.moveTo(x, cy - H * 0.4);
          g.lineTo(x, cy + H * 0.4);
          g.stroke();
        }
      }
      // Source (left).
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 24 * k;
      g.beginPath();
      g.roundRect(A.x, cy - 40 * k, 26 * k, 80 * k, 8 * k);
      g.fill();
      g.shadowBlur = 0;
      // Barrier with two slits.
      g.fillStyle = L.dim;
      const w = 12 * k;
      g.fillRect(bx - w / 2, cy - H / 2, w, H / 2 - d / 2 - a / 2);
      g.fillRect(bx - w / 2, cy - d / 2 + a / 2, w, d - a);
      g.fillRect(bx - w / 2, cy + d / 2 + a / 2, w, H / 2 - d / 2 - a / 2);
      // Screen: time-averaged intensity bands (wave) and/or landed particles.
      g.fillStyle = alpha(L.text.startsWith("#") ? L.text : "#FFFFFF", 0.08);
      g.fillRect(sx, cy - H / 2, 16 * k, H);
      const reachScreen = clamp((front - (bx - A.x) - Ls) / (lam * 6), 0, 1);
      if (showWave && reachScreen > 0)
        for (let j = 0; j < 200; j++) {
          const y = cy - H / 2 + (j / 200) * H;
          g.fillStyle = alpha(color, intensity(y) * reachScreen);
          g.fillRect(sx, y, 16 * k, H / 200 + 1);
        }
      const m = Math.floor(hits());
      g.fillStyle = color;
      for (let i = 0; i < m; i++) {
        const [x, y] = drops[i];
        g.globalAlpha = i > m - 4 ? 1 : 0.85;
        g.beginPath();
        g.arc(x, y, (i > m - 4 ? 4 : 2.2) * k, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    // Intensity graph beside the screen.
    const GX = sx + 40 * k, GW = A.x + A.w - GX - 10 * k;
    const graph = (): [number, number][] => Array.from({ length: 161 }, (_, j) => {
      const y = cy - H / 2 + (j / 160) * H;
      return [GX + intensity(y) * GW, y];
    });

    const title = createRef<Txt>();
    const gNode = createRef<Node>();
    const info = createRef<Txt>();
    st.cam.add(
      <Node>
        {showWave ? <Raster x={bx + RW / 2} y={cy} w={RW} h={RH} res={240} paint={paintField} /> : null}
        <Draw paint={paint} />
        {p.showGraph ? (
          <Node ref={gNode} opacity={0}>
            <Line points={graph} stroke={color} lineWidth={3 * k} shadowColor={color} shadowBlur={8 * k} />
            <Line points={[[GX, cy - H / 2], [GX, cy + H / 2]]} stroke={L.dim} lineWidth={1.5 * k} />
            <Txt text="cường độ" x={GX} y={cy - H / 2 - 4 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
          </Node>
        ) : null}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Txt ref={info} x={A.x} y={A.y + 18 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={L.dim} opacity={0} text={`λ = ${num(p.wavelength, 0)} nm · khe cách ${num(p.slitSeparation, 1)}λ · rộng ${num(p.slitWidth, 1)}λ${p.mode !== "wave" ? " · " : ""}${p.mode === "particles" ? "từng hạt một" : p.mode === "both" ? "sóng + từng hạt" : ""}`} />
        {p.mode !== "wave" ? <Txt x={sx + 8 * k} y={cy + H / 2 + 22 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={color} text={() => `${Math.floor(hits()).toLocaleString("vi-VN")} hạt`} /> : null}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    yield* all(info().opacity(1, 0.5), waveOn(showWave ? 1 : 0, 0.6));
    // Graph appears once the waves have reached the screen; particles start at the first cue.
    const reachT = ((bx - A.x) + Ls) / speed / st.speed + 0.8;
    yield* until(Math.min(reachT, D * 0.5));
    if (p.showGraph) yield gNode().opacity(1, 0.6, st.ease);
    if (p.mode !== "wave") {
      yield* until(Math.max(ctx.cue(0, 1), Math.min(reachT, D * 0.5)));
      yield* hits(p.particles, Math.max(1.5, D - Math.max(ctx.cue(0, 1), Math.min(reachT, D * 0.5)) - 0.5), (x) => x * x);
    }
  },
});
