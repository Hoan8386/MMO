// The Doppler effect from wavefronts: a source moving at speed v emits a circle every period; each
// circle grows at the wave speed c from the point where it was emitted, so the fronts bunch up ahead
// and spread out behind. Observers ahead and behind hear f′ = f·c/(c ∓ v) (shown live with the pitch
// as a waveform). sonic: v = c, the fronts pile into a wall (sound barrier); supersonic: v > c, the
// fronts form a Mach cone of half-angle sin α = c/v. light: a star receding / approaching — its
// spectral lines shift to the red / blue by z = v/c (non-relativistic).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "sound" | "sonic" | "supersonic" | "light";
  speed: number;
  frequency: number;
  observers: boolean;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "waves");
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

    if (p.mode !== "light") {
      // v/c: sound mode uses the prop, sonic = 1, supersonic = prop ≥ 1.4.
      const M = p.mode === "sound" ? Math.min(p.speed, 0.85) : p.mode === "sonic" ? 1 : Math.max(1.4, p.speed);
      const c = Math.min(A.w, A.h) * 0.16 * st.speed; // px per second
      const v = M * c;
      const period = 1 / p.frequency;
      const y = A.cy;
      const x0 = A.x + A.w * (M >= 1 ? 0.12 : 0.22);
      const src = (t: number): XY => [x0 + v * t, y];
      const tEnd = D;
      // Keep the source inside the frame: wrap the scene's time window for very fast sources.
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            g.lineWidth = L.lw(3 * k);
            for (let te = 0; te <= t; te += period) {
              const [sx, sy] = src(te);
              const r = c * (t - te);
              const age = (t - te) / tEnd;
              g.strokeStyle = alpha(L.secondary, clamp(0.95 - age * 0.9, 0.1, 0.95));
              g.beginPath();
              g.arc(sx, sy, r, 0, TAU);
              g.stroke();
            }
            if (M > 1) {
              // Mach cone tangents from the source.
              const [sx, sy] = src(t), a = Math.asin(1 / M), len = v * t;
              g.strokeStyle = L.highlight;
              g.lineWidth = L.lw(4 * k);
              g.beginPath();
              g.moveTo(sx - Math.cos(a) * len, sy - Math.sin(a) * len);
              g.lineTo(sx, sy);
              g.lineTo(sx - Math.cos(a) * len, sy + Math.sin(a) * len);
              g.stroke();
            }
          }}
        />,
      );
      nodes.push(<Circle position={() => src(clock())} size={34 * k} fill={L.accent} stroke="#FFFFFF" lineWidth={3 * k} {...L.glow(L.accent, 16 * k)} />);
      if (p.observers && M < 1) {
        // Heard frequency as a ratio f′/f₀ (source moving toward / away from the listener).
        const fA = 1 / (1 - M), fB = 1 / (1 + M);
        const obs = (x: number, f: number, name: string, col: string) => (
          <Node>
            <Rect x={x} y={y} width={30 * k} height={60 * k} radius={8 * k} fill={col} />
            <Txt text={name} x={x} y={y + 70 * k} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={col} />
            <Txt text={`f' = ${num(f, 2)} f₀`} x={x} y={y + 102 * k} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.text} />
            {/* The heard pitch as a little waveform. */}
            <Draw
              paint={(g) => {
                g.strokeStyle = col;
                g.lineWidth = 3 * k;
                g.beginPath();
                for (let i = 0; i <= 80; i++) {
                  const xx = x - 80 * k + (i / 80) * 160 * k, yy = y - 90 * k + Math.sin((i / 80) * TAU * 2.2 * f - clock() * 6) * 16 * k;
                  if (i) g.lineTo(xx, yy);
                  else g.moveTo(xx, yy);
                }
                g.stroke();
              }}
            />
          </Node>
        );
        show(
          <Node>
            {obs(A.x + A.w * 0.9, fA, "người nghe phía trước", L.highlight)}
            {obs(A.x + A.w * 0.06, fB, "người nghe phía sau", L.primary)}
          </Node>,
        );
        show(label(ctx, `f' = f₀·c/(c ∓ v) — v = ${num(M, 2)}c: phía trước nghe cao hơn, phía sau trầm hơn`, { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: L.text }));
      } else if (M === 1) show(label(ctx, "v = c: các mặt sóng dồn thành một bức tường áp suất — “rào âm thanh”", { x: A.cx, y: A.y + A.h - 14 * k, size: 27, fill: L.text }));
      else show(label(ctx, `v = ${num(M, 1)}c (Mach ${num(M, 1)}): nón Mach với sin α = c/v → α = ${num((Math.asin(1 / M) * 180) / Math.PI, 0)}° — tiếng nổ siêu thanh`, { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: L.text }));
    } else {
      // ---- spectral lines of a star (H-α, H-β, H-γ, Na D) shifted by z = v/c.
      const lines = [656.3, 486.1, 434.0, 589.0];
      const z = () => p.speed * 0.05 * Math.sin(((clock() - 1) / (D - 2)) * Math.PI * 1.5) * (clock() > 1 ? 1 : 0);
      const sx = A.x + A.w * 0.08, sw = A.w * 0.84, sy = A.cy + A.h * 0.18, sh = 90 * k;
      const xOf = (nm: number) => sx + ((nm - 380) / 370) * sw;
      const color = (nm: number) => {
        let r = 0, g = 0, b = 0;
        if (nm < 440) (r = (440 - nm) / 60), (b = 1);
        else if (nm < 490) (g = (nm - 440) / 50), (b = 1);
        else if (nm < 510) (g = 1), (b = (510 - nm) / 20);
        else if (nm < 580) (r = (nm - 510) / 70), (g = 1);
        else if (nm < 645) (r = 1), (g = (645 - nm) / 65);
        else r = 1;
        return `rgb(${Math.round(255 * r)},${Math.round(255 * g)},${Math.round(255 * b)})`;
      };
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              // Continuous spectrum with absorption lines (dark).
              for (let i = 0; i < 200; i++) {
                const nm = 380 + (370 * i) / 200;
                g.fillStyle = color(nm);
                g.fillRect(xOf(nm), sy - sh / 2, sw / 200 + 1, sh);
              }
              g.fillStyle = "#000000";
              for (const nm of lines) g.fillRect(xOf(nm * (1 + z())) - 3 * k, sy - sh / 2, 6 * k, sh);
              // Rest positions (laboratory reference).
              g.strokeStyle = "rgba(255,255,255,0.7)";
              g.setLineDash([5 * k, 5 * k]);
              g.lineWidth = 1.5 * k;
              for (const nm of lines) {
                g.beginPath();
                g.moveTo(xOf(nm), sy - sh / 2 - 26 * k);
                g.lineTo(xOf(nm), sy - sh / 2);
                g.stroke();
              }
              g.setLineDash([]);
              // The star and its motion arrow.
              const zz = z(), stx = A.cx + zz * A.w * 3, sty = A.y + A.h * 0.25;
              const gr = g.createRadialGradient(stx, sty, 0, stx, sty, 70 * k);
              gr.addColorStop(0, "#FFFFFF");
              gr.addColorStop(0.3, zz > 0.005 ? "#FFB199" : zz < -0.005 ? "#A6D8FF" : "#FFF4D6");
              gr.addColorStop(1, "rgba(0,0,0,0)");
              g.fillStyle = gr;
              g.beginPath();
              g.arc(stx, sty, 70 * k, 0, TAU);
              g.fill();
            }}
          />
          <Txt text={() => (z() > 0.002 ? `ra xa: dịch chuyển đỏ, z = ${num(z(), 3)}` : z() < -0.002 ? `lại gần: dịch chuyển xanh, z = ${num(z(), 3)}` : "đứng yên")} x={A.cx} y={sy - sh / 2 - 60 * k} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={() => (z() > 0 ? "#FF7849" : "#55C7FF")} />
        </Node>,
      );
      show(label(ctx, "Vạch hấp thụ lệch khỏi vị trí đo trong phòng thí nghiệm (vạch nét đứt): λ' = λ(1 + v/c)", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: L.text }));
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
    yield* world().opacity(1, 0.5, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void Line;
  },
});
