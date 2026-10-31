// Oscillators integrated with RK4 (exact nonlinear equations, not the small-angle formula): a simple
// pendulum θ'' = −(g/L)·sinθ − bθ' with force vectors (weight and its components, tension) and the
// period measured against 2π√(L/g); a double pendulum (chaotic: an optional twin starting 0.001 rad
// apart diverges); a mass on a spring x'' = −(k/m)x − bx'. Live energy bars (kinetic / potential /
// lost to damping), a trace of position against time, and the trajectory in phase space.
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
  kind: "simple" | "double" | "spring";
  angle: number;
  length: number;
  g: number;
  damping: number;
  chaos: boolean;
  vectors: boolean;
  energy: boolean;
  graph: "none" | "time" | "phase";
  trail: boolean;
}

type State = number[];
const rk4 = (f: (s: State) => State, s: State, h: number): State => {
  const k1 = f(s), k2 = f(s.map((v, i) => v + (h / 2) * k1[i])), k3 = f(s.map((v, i) => v + (h / 2) * k2[i])), k4 = f(s.map((v, i) => v + h * k3[i]));
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
};

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "classical_mechanics");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const fps = 30, frames = Math.ceil(D * fps) + 2;
    const g = p.g, Lm = p.length, b = p.damping;
    const th0 = (p.angle * Math.PI) / 180;
    const start = 0.8; // released at 0.8 s

    // ---- integrate once (fine step), keep one state per frame. Physical time = video time × speed.
    const sub = 40, h = st.speed / fps / sub;
    const runSim = (f: (s: State) => State, s0: State) => {
      const out: State[] = [];
      let s = s0;
      for (let i = 0; i < frames; i++) {
        out.push(s);
        if (i / fps >= start) for (let j = 0; j < sub; j++) s = rk4(f, s, h);
      }
      return out;
    };
    let sim: State[], twin: State[] | null = null;
    // Double pendulum (equal masses and lengths): standard equations of motion.
    const dbl = (s: State): State => {
      const [a1, a2, w1, w2] = s, d = a1 - a2, l = Lm / 2;
      const den = 3 - Math.cos(2 * d);
      const dw1 = (-g * 3 * Math.sin(a1) - g * Math.sin(a1 - 2 * a2) - 2 * Math.sin(d) * (w2 * w2 * l + w1 * w1 * l * Math.cos(d))) / (l * den) - b * w1;
      const dw2 = (2 * Math.sin(d) * (w1 * w1 * l * 2 + g * 2 * Math.cos(a1) + w2 * w2 * l * Math.cos(d))) / (l * den) - b * w2;
      return [w1, w2, dw1, dw2];
    };
    const kSpring = (4 * Math.PI * Math.PI) / (Lm * 1.2); // k/m chosen for a ~1.1·√L s period
    if (p.kind === "simple") sim = runSim((s) => [s[1], -(g / Lm) * Math.sin(s[0]) - b * s[1]], [th0, 0]);
    else if (p.kind === "double") {
      sim = runSim(dbl, [th0, th0, 0, 0]);
      if (p.chaos) twin = runSim(dbl, [th0 + 0.001, th0, 0, 0]);
    } else sim = runSim((s) => [s[1], -kSpring * s[0] - b * s[1]], [Math.min(0.9, Math.abs(th0) / 1.5), 0]);
    const at = (arr: State[]) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(clock() * fps)))];

    // ---- layout: apparatus on the left (or top), graph and energy beside it.
    const side = p.energy || p.graph !== "none";
    const AW = side && A.wide ? A.w * 0.55 : A.w, AH = side && !A.wide ? A.h * 0.6 : A.h;
    const px = A.x + AW / 2, py = A.y + AH * (p.kind === "spring" ? 0.08 : 0.12);
    const scale = p.kind === "spring" ? AH * 0.45 : Math.min(AH * 0.78, AW * 0.42) / (p.kind === "double" ? 1 : 1);
    const Lpx = scale;
    const bob = (s: State): [number, number][] => {
      if (p.kind === "simple") return [[px + Math.sin(s[0]) * Lpx, py + Math.cos(s[0]) * Lpx]];
      if (p.kind === "double") {
        const l = Lpx / 2;
        const x1 = px + Math.sin(s[0]) * l, y1 = py + Math.cos(s[0]) * l;
        return [[x1, y1], [x1 + Math.sin(s[1]) * l, y1 + Math.cos(s[1]) * l]];
      }
      return [[px, py + AH * 0.42 + s[0] * AH * 0.32]];
    };
    const tip = (arr: State[]) => () => {
      const b2 = bob(at(arr));
      return b2[b2.length - 1];
    };

    // Energies (per unit mass, relative to the lowest point).
    const energy = (s: State) => {
      if (p.kind === "simple") return { K: 0.5 * (Lm * s[1]) ** 2, U: g * Lm * (1 - Math.cos(s[0])) };
      if (p.kind === "spring") return { K: 0.5 * s[1] ** 2, U: 0.5 * kSpring * s[0] ** 2 };
      const l = Lm / 2, [a1, a2, w1, w2] = s;
      const v1 = (l * w1) ** 2, v2 = (l * w1) ** 2 + (l * w2) ** 2 + 2 * l * l * w1 * w2 * Math.cos(a1 - a2);
      return { K: 0.5 * (v1 + v2), U: g * l * (3 - 2 * Math.cos(a1) - Math.cos(a2)) };
    };
    const E0 = (() => {
      const e = energy(sim[0]);
      return e.K + e.U;
    })();

    // ---- drawing.
    const trailPaint = (arr: State[], color: string) => (g2: CanvasRenderingContext2D) => {
      if (!p.trail) return;
      const f = Math.round(clock() * fps), n = p.kind === "double" ? 150 : 40;
      g2.lineWidth = L.lw(3 * k);
      g2.lineCap = "round";
      for (let i = Math.max(1, f - n); i <= f && i < arr.length; i++) {
        const a = bob(arr[i - 1]), c = bob(arr[i]);
        const u = 1 - (f - i) / n;
        g2.strokeStyle = alpha(color, u * 0.8);
        g2.beginPath();
        g2.moveTo(a[a.length - 1][0], a[a.length - 1][1]);
        g2.lineTo(c[c.length - 1][0], c[c.length - 1][1]);
        g2.stroke();
      }
    };
    const springPaint = (g2: CanvasRenderingContext2D) => {
      if (p.kind !== "spring") return;
      const [bx, by] = bob(at(sim))[0];
      const coils = 14, y0 = py, y1 = by - 40 * k, wdt = 26 * k;
      g2.strokeStyle = L.dim;
      g2.lineWidth = L.lw(4 * k);
      g2.beginPath();
      g2.moveTo(px, y0);
      for (let i = 0; i <= coils * 2; i++) g2.lineTo(px + (i === 0 || i === coils * 2 ? 0 : i % 2 ? wdt : -wdt), y0 + ((y1 - y0) * i) / (coils * 2));
      g2.lineTo(bx, by - 40 * k);
      g2.stroke();
      g2.fillStyle = L.primary;
      g2.fillRect(bx - 50 * k, by - 40 * k, 100 * k, 80 * k);
      // Equilibrium line.
      g2.strokeStyle = alpha(L.ink, 0.3);
      g2.setLineDash([8 * k, 8 * k]);
      g2.beginPath();
      g2.moveTo(px - 140 * k, py + AH * 0.42);
      g2.lineTo(px + 140 * k, py + AH * 0.42);
      g2.stroke();
      g2.setLineDash([]);
    };

    const rods = (arr: State[], color: string, op: number) =>
      p.kind === "spring" ? null : (
        <Node opacity={op}>
          <Line points={() => [[px, py], ...bob(at(arr))]} stroke={L.ink} lineWidth={L.lw(4 * k)} lineJoin="round" />
          {bob(sim[0]).map((_, i) => (
            <Circle position={() => bob(at(arr))[i]} size={(p.kind === "double" ? 40 : 56) * k} fill={color} stroke="#FFFFFF" lineWidth={2 * k} {...L.glow(color, 18 * k)} />
          ))}
        </Node>
      );

    // Force vectors on the simple pendulum: weight mg, its tangential part −mg sinθ, tension.
    const vecShow = createSignal(0);
    const vec = () => {
      if (p.kind !== "simple") return null;
      const s = () => at(sim);
      const B = () => bob(s())[0];
      const fl = 150 * k;
      const tang = () => {
        const th = s()[0];
        return [B()[0] - Math.cos(th) * Math.sin(th) * fl, B()[1] + Math.sin(th) * Math.sin(th) * fl] as [number, number];
      };
      return (
        <Node opacity={vecShow}>
          <Line points={() => [B(), [B()[0], B()[1] + fl]]} stroke={L.accent} lineWidth={L.lw(5 * k)} endArrow arrowSize={14 * k} />
          <Txt text="mg" x={() => B()[0] + 16 * k} y={() => B()[1] + fl} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.accent} />
          <Line points={() => [B(), tang()]} stroke={L.highlight} lineWidth={L.lw(5 * k)} endArrow arrowSize={14 * k} />
          <Txt text="mg·sinθ (kéo về)" x={() => tang()[0]} y={() => tang()[1] + 26 * k} fontFamily={FONT} fontWeight={700} fontSize={21 * k} fill={L.highlight} />
          <Line points={() => [B(), [B()[0] + (px - B()[0]) * 0.35, B()[1] + (py - B()[1]) * 0.35]]} stroke={L.secondary} lineWidth={L.lw(5 * k)} endArrow arrowSize={14 * k} />
          <Txt text="T" x={() => B()[0] + (px - B()[0]) * 0.38 + 16 * k} y={() => B()[1] + (py - B()[1]) * 0.38} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.secondary} />
        </Node>
      );
    };

    // ---- side panel: energy bars and the graph.
    const SX = A.wide ? A.x + AW + 30 * k : A.x + 20 * k, SY = A.wide ? A.y + 30 * k : A.y + AH + 20 * k;
    const SW = A.wide ? A.w - AW - 50 * k : A.w - 40 * k, SH = A.wide ? A.h - 60 * k : A.h - AH - 40 * k;
    const panel = createRef<Node>();
    const barH = p.energy ? Math.min(SH * 0.42, 260 * k) : 0;
    const bars = () => {
      const e = energy(at(sim)), lost = Math.max(0, E0 - e.K - e.U);
      return [e.K / E0, e.U / E0, lost / E0];
    };
    const names = ["Động năng", "Thế năng", "Mất do ma sát"], cols = [L.secondary, L.accent, L.dim];
    const GR = { x: SX, y: SY + barH + (p.energy ? 100 * k : 0), w: SW, h: SH - barH - (p.energy ? 100 * k : 0) };
    const series = (arr: State[]) => (): [number, number][] => {
      const f = Math.min(arr.length - 1, Math.round(clock() * fps));
      const pts: [number, number][] = [];
      if (p.graph === "time")
        for (let i = 0; i <= f; i += 1) {
          const v = p.kind === "double" ? arr[i][1] : arr[i][0];
          const span = p.kind === "spring" ? 1 : Math.max(Math.abs(th0), 0.3) * (p.kind === "double" ? 3 : 1.1);
          pts.push([GR.x + (i / (frames - 1)) * GR.w, GR.y + GR.h / 2 - (v / span) * GR.h * 0.45]);
        }
      else
        for (let i = 0; i <= f; i += 1) {
          const s = arr[i];
          const x = p.kind === "double" ? Math.atan2(Math.sin(s[0]), Math.cos(s[0])) : s[0], v = p.kind === "double" ? s[2] : s[1];
          const sx = p.kind === "spring" ? 1 : Math.PI, sv = p.kind === "spring" ? Math.sqrt(kSpring) : Math.sqrt(g / Lm) * 2.2 * (p.kind === "double" ? 2.5 : 1);
          pts.push([GR.x + GR.w / 2 + (x / sx) * GR.w * 0.45, GR.y + GR.h / 2 - (v / sv) * GR.h * 0.45]);
        }
      return pts.length > 1 ? pts : [[GR.x, GR.y + GR.h / 2], [GR.x + 1, GR.y + GR.h / 2]];
    };
    // Period: small-angle formula vs the measured one (zero crossings of the simulation).
    const measured = (() => {
      if (p.kind !== "simple") return 0;
      const zs: number[] = [];
      for (let i = 1; i < sim.length; i++) if (sim[i - 1][0] > 0 && sim[i][0] <= 0) zs.push(i / fps);
      return zs.length > 1 ? (zs[zs.length - 1] - zs[0]) / (zs.length - 1) : 0;
    })();
    const sidePanel = side ? (
      <Node ref={panel} opacity={0}>
        {p.energy ? (
          <Node>
            <Txt text="Năng lượng (tổng ban đầu = 100 %)" x={SX} y={SY} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.dim} />
            {names.map((nm, i) => {
              const bw = (SW - 40 * k) / 3;
              const x = SX + i * (bw + 20 * k) + bw / 2;
              const base = SY + 62 * k + barH;
              return (
                <Node>
                  <Rect x={x} y={base - barH / 2} width={bw} height={barH} radius={8 * k} fill={alpha(L.ink, 0.06)} />
                  <Rect x={x} y={() => base - (clamp(bars()[i], 0, 1) * barH) / 2} width={bw} height={() => clamp(bars()[i], 0, 1) * barH} radius={8 * k} fill={cols[i]} {...L.glow(cols[i], 10 * k)} />
                  <Txt text={nm} x={x} y={base + 24 * k} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.text} />
                  <Txt text={() => `${num(clamp(bars()[i], 0, 1) * 100, 0)} %`} x={x} y={() => base - clamp(bars()[i], 0, 1) * barH - 18 * k} fontFamily={FONT} fontWeight={700} fontSize={20 * k} fill={cols[i]} />
                </Node>
              );
            })}
          </Node>
        ) : null}
        {p.graph !== "none" ? (
          <Node>
            <Rect x={GR.x + GR.w / 2} y={GR.y + GR.h / 2} width={GR.w} height={GR.h} radius={12 * k} fill={alpha(L.ink, 0.04)} stroke={alpha(L.ink, 0.12)} lineWidth={1.5 * k} />
            <Line points={[[GR.x, GR.y + GR.h / 2], [GR.x + GR.w, GR.y + GR.h / 2]]} stroke={alpha(L.ink, 0.2)} lineWidth={1.5 * k} />
            {p.graph === "phase" ? <Line points={[[GR.x + GR.w / 2, GR.y], [GR.x + GR.w / 2, GR.y + GR.h]]} stroke={alpha(L.ink, 0.2)} lineWidth={1.5 * k} /> : null}
            <Txt text={p.graph === "time" ? (p.kind === "spring" ? "li độ x theo thời gian" : "góc θ theo thời gian") : "không gian pha (vị trí – vận tốc)"} x={GR.x + 12 * k} y={GR.y + 20 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
            {twin ? <Line points={series(twin)} stroke={L.highlight} lineWidth={L.lw(2.5 * k)} opacity={0.85} /> : null}
            <Line points={series(sim)} stroke={L.primary} lineWidth={L.lw(3 * k)} {...L.glow(L.primary, 8 * k)} />
          </Node>
        ) : null}
      </Node>
    ) : null;

    // Formula / period note.
    const note = createRef<Node>();
    const T0 = 2 * Math.PI * Math.sqrt(Lm / g);
    const noteText =
      p.kind === "simple"
        ? `T ≈ 2π√(L/g) = ${num(T0, 2)} s · đo được ${num(measured / st.speed, 2)} s${Math.abs(th0) > 0.5 ? " (góc lớn → chậm hơn)" : ""}`
        : p.kind === "double"
          ? p.chaos
            ? "Hai con lắc lệch nhau 0,001 rad lúc đầu → chuyển động khác hẳn: hỗn loạn"
            : "Con lắc kép: không có công thức chu kỳ — chuyển động hỗn loạn"
          : `T = 2π√(m/k) = ${num((2 * Math.PI) / Math.sqrt(kSpring), 2)} s`;

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          <Rect x={px} y={py - 6 * k} width={p.kind === "spring" ? 320 * k : 220 * k} height={12 * k} radius={4 * k} fill={L.dim} />
          {twin ? <Draw paint={trailPaint(twin, L.highlight)} /> : null}
          <Draw paint={trailPaint(sim, p.kind === "double" ? L.secondary : L.primary)} />
          <Draw paint={springPaint} />
          {twin ? rods(twin, L.highlight, 0.85) : null}
          {rods(sim, L.primary, 1)}
          {p.vectors ? vec() : null}
          {p.kind === "simple" ? <Line points={[[px, py], [px, py + Lpx * 1.04]]} stroke={alpha(L.ink, 0.25)} lineWidth={1.5 * k} lineDash={[6 * k, 6 * k]} /> : null}
        </Node>
        {sidePanel}
        <Node ref={note} opacity={0}>
          {label(ctx, noteText, { x: A.x + (A.wide ? AW / 2 : A.w / 2), y: A.y + A.h - 14 * k - (A.wide ? 0 : SH + 30 * k), size: 26, fill: L.text })}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = [];
    if (p.vectors && p.kind === "simple") steps.push(() => vecShow(1, 0.5));
    if (sidePanel) steps.push(() => panel().opacity(1, 0.6));
    steps.push(() => note().opacity(1, 0.6));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void tip;
  },
});
