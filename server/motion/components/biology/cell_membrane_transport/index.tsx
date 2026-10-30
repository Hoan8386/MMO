// Transport across a cell membrane, as a seeded particle simulation (same props = same frames):
//   diffusion    small molecules slip through the lipid bilayer anywhere, net flow down the gradient
//   facilitated  molecules cross only through channel proteins, still down the gradient
//   active       the bilayer is closed; pumps spend ATP to move molecules inwards, against the gradient
// The whole run is simulated once at 30 steps/s before playback; particles then read their
// position for the current time. A simplified teaching model (stated on screen).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label, scaleNote } from "../../../shared/ui";
import { rng } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "diffusion" | "facilitated" | "active";
  particleLabel: string;
  outsideLabel: string;
  insideLabel: string;
  outside: number;
  inside: number;
  showCounts: boolean;
  seed: number;
  note: string;
}

const STEP = 1 / 30;

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const cx = safe.x + safe.w / 2;
    const T0 = safe.y + 150 * k, B0 = safe.y + safe.h - 70 * k;
    const MW = 70 * k; // membrane thickness
    const L0 = safe.x + 30 * k, R0 = safe.x + safe.w - 30 * k;
    const ml = cx - MW / 2, mr = cx + MW / 2;
    const r = 11 * k;
    const gates = [T0 + (B0 - T0) * 0.3, T0 + (B0 - T0) * 0.72]; // channel / pump centres (y)
    const gateH = 46 * k;
    const rand = rng(p.seed);

    // --- simulation ---
    type P = { x: number; y: number; vx: number; vy: number; cross: number; dir: number };
    const parts: P[] = [];
    const spawn = (side: number) => {
      const x = side < 0 ? L0 + r + rand() * (ml - L0 - 2 * r) : mr + r + rand() * (R0 - mr - 2 * r);
      parts.push({ x, y: T0 + r + rand() * (B0 - T0 - 2 * r), vx: 0, vy: 0, cross: 0, dir: 0 });
    };
    for (let i = 0; i < p.outside; i++) spawn(-1);
    for (let i = 0; i < p.inside; i++) spawn(1);
    const steps = Math.ceil(ctx.duration / STEP) + 1;
    const X = new Float32Array(steps * parts.length), Y = new Float32Array(steps * parts.length);
    const countOut = new Uint16Array(steps), countIn = new Uint16Array(steps);
    const pumpFlash = new Float32Array(steps); // ATP glow, 1 when a pump fires
    const speed = 210 * k, transit = speed * 0.6;
    const pumpEvery = Math.round(1.1 / STEP);
    for (let s = 0; s < steps; s++) {
      if (p.mode === "active" && s > 20 && s % pumpEvery === 0) {
        // Each pump takes the outside molecule nearest to it, whatever the counts on either side.
        for (const gy of gates) {
          let best: P | null = null, bd = Infinity;
          for (const q of parts) {
            if (q.cross || q.x > ml) continue;
            const d = Math.hypot(q.x - ml, q.y - gy);
            if (d < bd) (bd = d), (best = q);
          }
          if (best && bd < 420 * k) Object.assign(best, { x: ml - r, y: gy, cross: 1, dir: 1 });
        }
        pumpFlash[s] = 1;
      } else if (s) pumpFlash[s] = Math.max(0, pumpFlash[s - 1] - STEP * 2.5);
      for (const q of parts) {
        if (q.cross) {
          q.x += q.dir * transit * STEP;
          if ((q.dir > 0 && q.x > mr + r) || (q.dir < 0 && q.x < ml - r)) q.cross = 0;
        } else {
          // Persistent random walk: small turns each step at a steady thermal speed.
          q.vx += (rand() - 0.5) * speed * 0.35;
          q.vy += (rand() - 0.5) * speed * 0.35;
          const v = Math.hypot(q.vx, q.vy) || 1;
          (q.vx *= speed / v), (q.vy *= speed / v);
          let nx = q.x + q.vx * STEP;
          const ny = q.y + q.vy * STEP;
          if (ny < T0 + r || ny > B0 - r) q.vy = -q.vy;
          else q.y = ny;
          if (nx < L0 + r || nx > R0 - r) (q.vx = -q.vx), (nx = q.x);
          // Reaching the membrane from either side.
          const hits = (q.x <= ml - r && nx > ml - r) || (q.x >= mr + r && nx < mr + r);
          if (hits) {
            const dir = q.x < cx ? 1 : -1;
            const atGate = gates.some((g) => Math.abs(q.y - g) < gateH / 2);
            const pass = p.mode === "diffusion" ? rand() < 0.5 : p.mode === "facilitated" ? atGate : false;
            if (pass) Object.assign(q, { cross: 1, dir, y: atGate && p.mode === "facilitated" ? gates.reduce((a, g) => (Math.abs(q.y - g) < Math.abs(q.y - a) ? g : a)) : q.y });
            else (q.vx = -q.vx), (nx = q.x);
          }
          q.x = nx;
        }
      }
      parts.forEach((q, i) => {
        X[s * parts.length + i] = q.x;
        Y[s * parts.length + i] = q.y;
      });
      countOut[s] = parts.filter((q) => !q.cross && q.x < cx).length;
      countIn[s] = parts.filter((q) => !q.cross && q.x > cx).length;
    }

    // --- drawing ---
    const clock = createSignal(0);
    const frame = () => Math.min(steps - 1, Math.round(clock() / STEP));
    const titleTxt = createRef<Txt>();
    const scene = createRef<Node>();
    const heads = Math.floor((B0 - T0) / (22 * k));
    const gateColor = p.mode === "active" ? "#F72585" : "#9D4EDD";
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        <Node ref={scene} opacity={0}>
          <Rect x={(L0 + ml) / 2} y={(T0 + B0) / 2} width={ml - L0} height={B0 - T0} radius={16 * k} fill={theme.panel} />
          <Rect x={(mr + R0) / 2} y={(T0 + B0) / 2} width={R0 - mr} height={B0 - T0} radius={16 * k} fill="rgba(255,182,193,0.08)" />
          {/* Lipid bilayer: two rows of heads with tails pointing inwards. */}
          {Array.from({ length: heads }, (_, i) => {
            const y = T0 + 11 * k + i * 22 * k;
            if (p.mode !== "diffusion" && gates.some((g) => Math.abs(y - g) < gateH / 2 + 8 * k)) return null;
            return (
              <Node>
                <Line points={[[ml + 9 * k, y], [cx - 4 * k, y]]} stroke="#E9C46A" lineWidth={3 * k} opacity={0.7} />
                <Line points={[[mr - 9 * k, y], [cx + 4 * k, y]]} stroke="#E9C46A" lineWidth={3 * k} opacity={0.7} />
                <Circle x={ml + 9 * k} y={y} size={18 * k} fill="#F4A261" />
                <Circle x={mr - 9 * k} y={y} size={18 * k} fill="#F4A261" />
              </Node>
            );
          })}
          {p.mode !== "diffusion"
            ? gates.map((g) => (
                <Node>
                  <Rect x={cx} y={g - gateH / 2 - 12 * k} width={MW + 16 * k} height={24 * k} radius={10 * k} fill={gateColor} />
                  <Rect x={cx} y={g + gateH / 2 + 12 * k} width={MW + 16 * k} height={24 * k} radius={10 * k} fill={gateColor} />
                  {p.mode === "active" ? (
                    <Txt text="ATP" x={cx + MW / 2 + 44 * k} y={g} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={22 * k} fill="#FFD166" opacity={() => pumpFlash[frame()]} />
                  ) : null}
                </Node>
              ))
            : null}
          {parts.map((_, i) => (
            <Circle x={() => X[frame() * parts.length + i]} y={() => Y[frame() * parts.length + i]} size={r * 2} fill={theme.accent} stroke={theme.bg} lineWidth={2 * k} />
          ))}
          {/* Side names, with the live number of molecules on each side. */}
          <Txt text={() => (p.showCounts ? `${p.outsideLabel} · ${countOut[frame()]} ${p.particleLabel}` : p.outsideLabel)} x={L0 + 10 * k} y={T0 - 34 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={28 * k} fill={theme.ink} />
          <Txt text={() => (p.showCounts ? `${p.insideLabel} · ${countIn[frame()]} ${p.particleLabel}` : p.insideLabel)} x={R0 - 10 * k} y={T0 - 34 * k} offsetX={1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={28 * k} fill={theme.ink} />
          {label(ctx, { diffusion: "Màng tế bào (lớp lipid kép)", facilitated: "Kênh protein", active: "Bơm protein" }[p.mode], { x: cx, y: B0 + 34 * k, size: 24, fill: p.mode === "diffusion" ? "#F4A261" : gateColor })}
        </Node>
        {scaleNote(ctx, p.note)}
      </Node>,
    );

    yield clock(ctx.duration, ctx.duration, linear);
    yield* all(fadeUp(titleTxt(), 0.5), scene().opacity(1, 0.6));
  },
});
