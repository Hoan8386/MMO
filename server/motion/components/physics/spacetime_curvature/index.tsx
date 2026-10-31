// Curved spacetime as the classic "rubber sheet": a perspective grid whose depth at distance r from a
// mass is −M/√(r² + ε²) (the shape of the Newtonian potential, the usual teaching picture of an
// embedding diagram). A mass appears and the sheet sinks; a small body circles in the well with Kepler's
// angular speed ω ∝ √(M/r³); a light ray passing by is bent toward the mass (deflection ∝ M/b).
// Binary mode: two masses orbit each other and ripples spread across the sheet at twice the orbital
// frequency — gravitational waves.
import { Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mass: number;
  elevation: number;
  gridLines: number;
  showOrbit: boolean;
  showLight: boolean;
  binary: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "relativity");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const t = createSignal(0);
    const M = createSignal(0); // mass shown (grows in)
    const orbOn = createSignal(0);
    const rayU = createSignal(-1);
    const waves = createSignal(0);
    const e = (p.elevation * Math.PI) / 180;
    const ce = Math.cos(e), se = Math.sin(e);
    const eps = 0.2;
    // Binary: the two masses sit at ±a around the centre.
    const sep = 0.13;
    const omegaB = 1.4;
    const bodies = (time: number): [number, number, number][] =>
      p.binary
        ? [
            [Math.cos(time * omegaB) * sep, Math.sin(time * omegaB) * sep, M() / 2],
            [-Math.cos(time * omegaB) * sep, -Math.sin(time * omegaB) * sep, M() / 2],
          ]
        : [[0, 0, M()]];
    const height = (x: number, z: number, time: number) => {
      let h = 0;
      for (const [bx, bz, m] of bodies(time)) h -= (m * 0.085) / Math.sqrt((x - bx) ** 2 + (z - bz) ** 2 + eps * eps);
      // Gravitational-wave ripples (binary), frequency 2ω, fading as 1/√r.
      if (p.binary && waves() > 0) {
        const r = Math.hypot(x, z), ang = Math.atan2(z, x);
        const k2 = 14, w = 2 * omegaB;
        // Quadrupole spiral cos(2φ − kr + 2ωt) travelling outward; the front reaches r = 1.6·waves().
        const front = clamp((waves() * 1.6 - r) * 6 + 1, 0, 1);
        h += (0.04 * Math.cos(2 * ang - k2 * r + w * time) * front) / Math.sqrt(r + 0.15);
      }
      return h;
    };
    // Projection: world (x, y up, z depth) → screen, perspective, camera above the near edge.
    const F = Math.min(A.w * 0.62, A.h * 1.25);
    const cx = A.cx, cy = A.cy - A.h * 0.12;
    const proj = (x: number, y: number, z: number): [number, number, number] => {
      const y2 = y * ce + z * se, z2 = -y * se + z * ce + 2.4;
      return [cx + (x * F) / z2, cy - (y2 * F) / z2, z2];
    };
    const r0 = 0.55;

    const paint = (g: CanvasRenderingContext2D) => {
      const time = t();
      const n = p.gridLines;
      // Grid lines in both directions, coloured by depth (far = dimmer).
      g.lineWidth = 1.8 * k;
      for (const along of [0, 1])
        for (let i = 0; i <= n; i++) {
          const c = -1 + (2 * i) / n;
          g.beginPath();
          let zf = 0;
          for (let j = 0; j <= 80; j++) {
            const s = -1 + (2 * j) / 80;
            const x = along ? c : s, z = along ? s : c;
            const [X, Y, Z] = proj(x, height(x, z, time), z);
            zf += Z;
            j ? g.lineTo(X, Y) : g.moveTo(X, Y);
          }
          const depth = clamp((zf / 81 - 1.6) / 1.6, 0, 1);
          g.strokeStyle = alpha(mix(L.secondary, L.primary, depth), 0.85 - 0.45 * depth);
          g.stroke();
        }
      // Light ray: a straight path at z = b, bent toward the mass by ∝ M/b, glowing.
      const ru = rayU();
      if (ru >= 0) {
        const b = 0.32, defl = M() * 0.45;
        g.strokeStyle = L.accent;
        g.shadowColor = L.accent;
        g.shadowBlur = 16 * k;
        g.lineWidth = 3.5 * k;
        g.beginPath();
        for (let j = 0; j <= 60 * ru; j++) {
          const x = -1 + (2 * j) / 60;
          // Bend: the ray's z moves toward 0 after closest approach (integrated 1/r² pull).
          const z = -b + defl * (0.5 + Math.atan(x / b) / Math.PI) * 0.6;
          const [X, Y] = proj(x, height(x, z, time) + 0.03, z);
          j ? g.lineTo(X, Y) : g.moveTo(X, Y);
        }
        g.stroke();
        g.shadowBlur = 0;
      }
      // Masses at the bottom of their wells.
      for (const [bx, bz, m] of bodies(time)) {
        if (m <= 0.01) continue;
        const [X, Y, Z] = proj(bx, height(bx, bz, time) + 0.05, bz);
        const R = ((0.05 + 0.06 * Math.sqrt(m)) * F) / Z;
        const gr = g.createRadialGradient(X - R * 0.35, Y - R * 0.35, R * 0.1, X, Y, R);
        gr.addColorStop(0, "#FFF7D6");
        gr.addColorStop(0.5, L.accent);
        gr.addColorStop(1, mix(L.accent, "#000000", 0.5));
        g.fillStyle = gr;
        g.shadowColor = L.accent;
        g.shadowBlur = 30 * k;
        g.beginPath();
        g.arc(X, Y, R, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
      // Orbiting body: circular orbit in the well, ω = √(M / r³).
      if (orbOn() > 0 && !p.binary) {
        const w = Math.sqrt(Math.max(0.05, M()) / r0 ** 3) * 0.9;
        g.strokeStyle = alpha(L.secondary, 0.5 * orbOn());
        g.setLineDash([8 * k, 8 * k]);
        g.lineWidth = 2 * k;
        g.beginPath();
        for (let j = 0; j <= 90; j++) {
          const a = (j / 90) * Math.PI * 2;
          const [X, Y] = proj(Math.cos(a) * r0, height(Math.cos(a) * r0, Math.sin(a) * r0, time) + 0.02, Math.sin(a) * r0);
          j ? g.lineTo(X, Y) : g.moveTo(X, Y);
        }
        g.stroke();
        g.setLineDash([]);
        const a = time * w;
        const [X, Y, Z] = proj(Math.cos(a) * r0, height(Math.cos(a) * r0, Math.sin(a) * r0, time) + 0.04, Math.sin(a) * r0);
        g.fillStyle = alpha(L.secondary, orbOn());
        g.shadowColor = L.secondary;
        g.shadowBlur = 16 * k;
        g.beginPath();
        g.arc(X, Y, (0.035 * F) / Z, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    };

    const title = createRef<Txt>();
    const notes: Txt[] = [];
    const lines = [
      ["Khối lượng làm cong không–thời gian", L.text],
      ...(p.showOrbit && !p.binary ? [["Vật chuyển động theo chỗ trũng → quỹ đạo", L.secondary]] : []),
      ...(p.showLight ? [["Ánh sáng cũng đi theo độ cong → bị bẻ lệch", L.accent]] : []),
      ...(p.binary ? [["Hai vật quay quanh nhau tạo sóng hấp dẫn (tần số gấp đôi)", L.highlight]] : []),
    ] as [string, string][];
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Node>{lines.map(([tx, c], i) => <Txt ref={(n: Txt) => (notes[i] = n)} x={A.x} y={A.y + 20 * k + i * 38 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={26 * k} fill={c} opacity={0} text={tx} />)}</Node>
        {label(ctx, "mô hình tấm cao su: hình minh hoạ, không theo tỉ lệ", { x: A.x + A.w, y: A.y + A.h - 14 * k, size: 20, align: "right", fill: L.dim })}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    const steps = lines.length;
    yield* until(ctx.cue(0, steps));
    yield* all(M(p.mass, 1.6, easeInOutCubic), notes[0].opacity(1, 0.5));
    let i = 1;
    if (p.showOrbit && !p.binary) {
      yield* until(ctx.cue(i, steps));
      yield* all(orbOn(1, 0.6), notes[i++].opacity(1, 0.5));
    }
    if (p.showLight) {
      yield* until(ctx.cue(i, steps));
      rayU(0);
      yield* all(rayU(1, 1.6, linear), notes[i++].opacity(1, 0.5));
    }
    if (p.binary) {
      yield* until(ctx.cue(i, steps));
      yield* all(waves(1, Math.max(2, D - ctx.cue(i, steps) - 0.5), linear), notes[i++].opacity(1, 0.5));
    }
  },
});
