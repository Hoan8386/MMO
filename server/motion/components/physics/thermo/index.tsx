// Heat and gases. gas: particles in a cylinder with speeds drawn from the Maxwell–Boltzmann
// distribution; heating at constant volume (pressure rises), at constant pressure (the piston rises)
// or compressing at constant temperature — gauges for T, P, V follow PV = NkT, and a live histogram of
// speeds sits on the theoretical curve f(v) ∝ v·e^(−mv²/2kT) (2D). conduction: a rod heated at one end,
// the heat equation solved numerically — colour and atom jiggling show the temperature profile.
// convection: a pot heated from below; warm fluid rises in rolling cells. phase: a solid heats,
// melts and boils — the heating curve has its flat steps (latent heat) while the particles go from a
// vibrating lattice to a liquid to a gas. carnot: the Carnot cycle on a PV diagram with the piston,
// the four strokes and the enclosed work.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "gas" | "conduction" | "convection" | "phase" | "carnot";
  process: "isochoric" | "isobaric" | "isothermal";
  particles: number;
  histogram: boolean;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];
// Temperature 0–1 → colour (cold blue → white → hot red-orange).
const heat = (u: number) => {
  const t = clamp(u, 0, 1);
  return t < 0.5 ? mix("#3FA9FF", "#F2F2F2", t * 2) : mix("#F2F2F2", "#FF4D2E", (t - 0.5) * 2);
};
// Reflect a coordinate into [0, 1] (bouncing between two walls).
const bounce = (u: number) => {
  const m = ((u % 2) + 2) % 2;
  return m > 1 ? 2 - m : m;
};

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "thermodynamics");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const R0 = rng(L.seed + 13);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    const t0 = 1.2, t1 = D - 1; // process runs between t0 and t1
    const progAt = (t: number) => smooth(clamp((t - t0) / (t1 - t0), 0, 1));
    const prog = () => progAt(clock());

    if (p.mode === "gas") {
      // ---- state: T (K), V (relative), P from PV = NkT (relative to the start).
      const Tof = (t: number) => (p.process === "isothermal" ? 300 : 300 + 300 * progAt(t));
      const T = () => Tof(clock());
      const V = () => (p.process === "isochoric" ? 1 : p.process === "isobaric" ? T() / 300 : 1 / (1 + prog()));
      const P = () => T() / 300 / V();
      const n = Math.round(p.particles * (0.4 + 0.6 * q));
      // Velocities in units of √(kT₀/m): Gaussian components (Box–Muller).
      const parts = Array.from({ length: n }, () => {
        const g = () => Math.sqrt(-2 * Math.log(1 - R0())) * Math.cos(TAU * R0());
        return { x: R0(), y: R0(), vx: g(), vy: g() };
      });
      // Path length so far: ∫ √(T/T₀) dt — speeds scale with √T (tabulated).
      const N2 = 600, Sx = new Float32Array(N2 + 1);
      for (let i = 1; i <= N2; i++) {
        Sx[i] = Sx[i - 1] + Math.sqrt(Tof((i / N2) * D) / 300) * (D / N2);
      }
      const S = () => Sx[Math.min(N2, Math.floor((clock() / D) * N2))];
      const box = { x: A.x + A.w * (A.wide ? 0.06 : 0.1), w: A.w * (A.wide ? 0.4 : 0.8), bottom: A.y + A.h * (A.wide ? 0.92 : 0.55), hMax: A.h * (A.wide ? 0.8 : 0.45) };
      const h0 = box.hMax * (p.process === "isobaric" ? 0.5 : 0.85);
      const H = () => h0 * V();
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              const h = H(), top = box.bottom - h;
              // Cylinder walls and the piston.
              g.strokeStyle = alpha(L.ink, 0.7);
              g.lineWidth = 6 * k;
              g.beginPath();
              g.moveTo(box.x, box.bottom - box.hMax);
              g.lineTo(box.x, box.bottom);
              g.lineTo(box.x + box.w, box.bottom);
              g.lineTo(box.x + box.w, box.bottom - box.hMax);
              g.stroke();
              g.fillStyle = "#8D97A6";
              g.fillRect(box.x + 4 * k, top - 22 * k, box.w - 8 * k, 22 * k);
              g.fillRect(box.x + box.w / 2 - 10 * k, top - box.hMax, 20 * k, box.hMax - 22 * k);
              // Burner glow under the cylinder while heating.
              if (p.process !== "isothermal" && clock() > t0) {
                const gr = g.createRadialGradient(box.x + box.w / 2, box.bottom + 30 * k, 0, box.x + box.w / 2, box.bottom + 30 * k, box.w * 0.5);
                gr.addColorStop(0, `rgba(255,120,40,${0.6 * prog() + 0.2})`);
                gr.addColorStop(1, "rgba(255,80,20,0)");
                g.fillStyle = gr;
                g.fillRect(box.x, box.bottom, box.w, 60 * k);
              }
              // Particles: free flight with bounces, colour by speed.
              const s = S() * 0.05 * st.speed, vs = Math.sqrt(T() / 300);
              for (const q2 of parts) {
                const x = box.x + 8 * k + bounce(q2.x + q2.vx * s * 0.6) * (box.w - 16 * k);
                const y = top + 8 * k + bounce(q2.y + q2.vy * s * (h0 / h) * 0.6) * (h - 16 * k);
                const sp = Math.hypot(q2.vx, q2.vy) * vs;
                g.fillStyle = heat(sp / 3.2);
                g.beginPath();
                g.arc(x, y, 5 * k, 0, TAU);
                g.fill();
              }
            }}
          />
        </Node>,
      );
      // Gauges.
      const gx = A.wide ? A.x + A.w * 0.52 : A.x + A.w * 0.1, gy = A.wide ? A.y + A.h * 0.08 : A.y + A.h * 0.6;
      show(
        <Node>
          {(
            [
              ["Nhiệt độ T", () => `${num(T(), 0)} K`, L.highlight],
              ["Thể tích V", () => `${num(V(), 2)} V₀`, L.secondary],
              ["Áp suất P", () => `${num(P(), 2)} P₀`, L.accent],
            ] as [string, () => string, string][]
          ).map(([a, b, c], i) => (
            <Node x={gx + i * (A.wide ? 270 : 230) * k} y={gy}>
              <Txt text={a} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} />
              <Txt text={b} y={40 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={36 * k} fill={c} />
            </Node>
          ))}
          <Txt text={p.process === "isochoric" ? "Đẳng tích: đun nóng → hạt nhanh hơn → va chạm mạnh hơn → P tăng" : p.process === "isobaric" ? "Đẳng áp: đun nóng → piston đẩy lên, V tăng tỉ lệ T" : "Đẳng nhiệt: nén chậm → V giảm, P tăng (PV = hằng số)"} x={gx} y={gy + 100 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
        </Node>,
      );
      // Speed histogram vs Maxwell–Boltzmann (2D): f(v) = (v/σ²)·e^(−v²/2σ²), σ² = T/T₀.
      if (p.histogram) {
        const hx = gx, hy = A.wide ? A.y + A.h * 0.42 : A.y + A.h * 0.78, hw = A.wide ? A.w * 0.42 : A.w * 0.8, hh = A.wide ? A.h * 0.42 : A.h * 0.18;
        show(
          <Draw
            paint={(g) => {
              const bins = 24, vmax = 6, cnt = new Array(bins).fill(0);
              const vs = Math.sqrt(T() / 300);
              for (const q2 of parts) cnt[Math.min(bins - 1, Math.floor((Math.hypot(q2.vx, q2.vy) * vs / vmax) * bins))]++;
              const bw = hw / bins;
              const scale = hh / (n * 0.12);
              for (let i = 0; i < bins; i++) {
                g.fillStyle = heat((((i + 0.5) / bins) * vmax) / 3.2);
                g.globalAlpha = 0.85;
                g.fillRect(hx + i * bw + 1, hy + hh - cnt[i] * scale, bw - 2, cnt[i] * scale);
              }
              g.globalAlpha = 1;
              const s2 = T() / 300;
              g.strokeStyle = L.ink;
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let i = 0; i <= 100; i++) {
                const v = (i / 100) * vmax;
                const f = (v / s2) * Math.exp((-v * v) / (2 * s2));
                const y = hy + hh - f * (vmax / bins) * n * scale;
                if (i) g.lineTo(hx + (v / vmax) * hw, y);
                else g.moveTo(hx + (v / vmax) * hw, y);
              }
              g.stroke();
              g.strokeStyle = alpha(L.ink, 0.4);
              g.lineWidth = 1.5 * k;
              g.beginPath();
              g.moveTo(hx, hy + hh);
              g.lineTo(hx + hw, hy + hh);
              g.stroke();
              g.font = `600 ${20 * k}px ${FONT}`;
              g.fillStyle = L.dim;
              g.fillText("phân bố tốc độ — đường cong Maxwell–Boltzmann", hx, hy - 10 * k);
              g.fillText("tốc độ →", hx + hw - 90 * k, hy + hh + 24 * k);
            }}
          />,
        );
      }
    } else if (p.mode === "conduction") {
      // ---- heat equation on a rod (explicit FTCS, stable step), hot reservoir at x = 0.
      const M = 60, frames = Math.ceil(D * 30) + 1;
      const T = new Float32Array(M);
      const hist = new Float32Array(frames * M);
      const alphaDt = 0.45; // α·dt/dx² (≤ 0.5)
      const stepsPerFrame = Math.round(28 * st.speed);
      for (let f = 0; f < frames; f++) {
        hist.set(T, f * M);
        if (f / 30 < t0) continue;
        for (let s = 0; s < stepsPerFrame; s++) {
          T[0] = 1;
          const prev = T.slice();
          for (let i = 1; i < M - 1; i++) T[i] = prev[i] + alphaDt * (prev[i - 1] - 2 * prev[i] + prev[i + 1]);
          T[M - 1] = T[M - 2];
        }
      }
      const fr = () => Math.min(frames - 1, Math.round(clock() * 30));
      const rx = A.x + A.w * 0.12, rw = A.w * 0.76, ry = A.cy, rh = Math.min(A.h * 0.16, 120 * k);
      nodes.push(
        <Draw
          paint={(g) => {
            const f = fr();
            for (let i = 0; i < M; i++) {
              g.fillStyle = heat(hist[f * M + i]);
              g.fillRect(rx + (i / M) * rw, ry - rh / 2, rw / M + 1, rh);
            }
            // Atoms jiggling with amplitude ∝ √T.
            const r = rng(3);
            for (let i = 0; i < M; i += 2)
              for (let j = 0; j < 3; j++) {
                const Tl = hist[f * M + i];
                const amp = (1.5 + 7 * Math.sqrt(Tl)) * k;
                const x = rx + ((i + 1) / M) * rw + Math.sin(clock() * 30 + r() * 9) * amp, y = ry - rh * 0.3 + j * rh * 0.3 + Math.cos(clock() * 27 + r() * 9) * amp;
                g.fillStyle = "rgba(20,20,30,0.55)";
                g.beginPath();
                g.arc(x, y, 5 * k, 0, TAU);
                g.fill();
              }
            // Flame at the hot end.
            g.globalCompositeOperation = "lighter";
            const gr = g.createRadialGradient(rx - 30 * k, ry, 0, rx - 30 * k, ry, 90 * k);
            gr.addColorStop(0, `rgba(255,200,80,${clock() > t0 ? 0.9 : 0.1})`);
            gr.addColorStop(1, "rgba(255,80,20,0)");
            g.fillStyle = gr;
            g.beginPath();
            g.arc(rx - 30 * k, ry, 90 * k, 0, TAU);
            g.fill();
            g.globalCompositeOperation = "source-over";
            // Temperature profile graph under the rod.
            const gy = ry + rh / 2 + 40 * k, gh = Math.min(A.h * 0.28, 220 * k);
            g.strokeStyle = alpha(L.ink, 0.35);
            g.lineWidth = 1.5 * k;
            g.strokeRect(rx, gy, rw, gh);
            g.strokeStyle = L.highlight;
            g.lineWidth = 3 * k;
            g.beginPath();
            for (let i = 0; i < M; i++) {
              const x = rx + ((i + 0.5) / M) * rw, y = gy + gh - hist[f * M + i] * gh;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            g.font = `600 ${20 * k}px ${FONT}`;
            g.fillStyle = L.dim;
            g.fillText("nhiệt độ dọc thanh", rx + 8 * k, gy + 22 * k);
          }}
        />,
      );
      show(label(ctx, "Dẫn nhiệt: nguyên tử dao động mạnh truyền năng lượng cho nguyên tử bên cạnh", { x: A.cx, y: A.y + 40 * k, size: 27, fill: L.text }));
    } else if (p.mode === "convection") {
      // ---- two rolling cells; tracer particles follow ψ = sin(πx/W)·sin(πy/H) (per cell).
      const px = A.x + A.w * 0.2, pw = A.w * 0.6, py = A.y + A.h * 0.12, ph = A.h * 0.72;
      const n = Math.round(700 * q + 200);
      const tr = Array.from({ length: n }, () => ({ u: R0(), v: R0() }));
      // Precompute positions by integrating the velocity field (one cell is [0,0.5]×[0,1]).
      const frames = Math.ceil(D * 30) + 1;
      const pos = new Float32Array(frames * n * 2);
      const vel = (u: number, v: number): XY => {
        const c = u < 0.5 ? 1 : -1, uu = u < 0.5 ? u * 2 : (u - 0.5) * 2;
        // u-velocity = ∂ψ/∂y, v-velocity = −∂ψ/∂x (cell-local, alternating sense).
        return [c * 0.5 * Math.sin(Math.PI * uu) * Math.cos(Math.PI * v) * 0.5, -c * Math.cos(Math.PI * uu) * Math.sin(Math.PI * v) * 0.5];
      };
      const cur = tr.map((t) => [t.u, t.v]);
      for (let f = 0; f < frames; f++) {
        cur.forEach((c, i) => pos.set(c, (f * n + i) * 2));
        for (let s = 0; s < 4; s++)
          for (const c of cur) {
            const [a, b] = vel(c[0], c[1]);
            c[0] = clamp(c[0] + (a * st.speed) / 120, 0.002, 0.998);
            c[1] = clamp(c[1] + (b * st.speed) / 120, 0.002, 0.998);
          }
      }
      nodes.push(
        <Draw
          paint={(g) => {
            const f = Math.min(frames - 1, Math.round(clock() * 30));
            g.strokeStyle = alpha(L.ink, 0.6);
            g.lineWidth = 6 * k;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px, py + ph);
            g.lineTo(px + pw, py + ph);
            g.lineTo(px + pw, py);
            g.stroke();
            const gr = g.createRadialGradient(px + pw / 2, py + ph + 30 * k, 0, px + pw / 2, py + ph + 30 * k, pw * 0.5);
            gr.addColorStop(0, "rgba(255,120,40,0.85)");
            gr.addColorStop(1, "rgba(255,80,20,0)");
            g.fillStyle = gr;
            g.fillRect(px, py + ph, pw, 60 * k);
            for (let i = 0; i < n; i++) {
              const u = pos[(f * n + i) * 2], v = pos[(f * n + i) * 2 + 1];
              // Warmer near the bottom, cooling as it rises and moves along the top.
              g.fillStyle = heat(0.25 + 0.7 * v);
              g.beginPath();
              g.arc(px + u * pw, py + v * ph, 4.5 * k, 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      show(label(ctx, "Đối lưu: chất lỏng nóng nở ra, nhẹ hơn nên nổi lên; phần nguội chìm xuống", { x: A.cx, y: A.y + 40 * k, size: 27, fill: L.text }));
    } else if (p.mode === "phase") {
      // ---- heating curve with plateaus; particles: lattice → liquid → gas.
      // Water: heat Q (kJ per kg) to go from −20 °C to 120 °C.
      const segs = [
        { q: 42, T0: -20, T1: 0, name: "rắn nóng lên" },
        { q: 334, T0: 0, T1: 0, name: "nóng chảy (nhiệt nóng chảy 334 kJ/kg)" },
        { q: 418, T0: 0, T1: 100, name: "lỏng nóng lên" },
        { q: 2257, T0: 100, T1: 100, name: "sôi (nhiệt hoá hơi 2 257 kJ/kg)" },
        { q: 40, T0: 100, T1: 120, name: "hơi nóng lên" },
      ];
      const Qtot = segs.reduce((a, s) => a + s.q, 0);
      // Display the Q axis with the long boiling step compressed (square root) so all steps show.
      const qs = segs.map((s) => Math.sqrt(s.q));
      const qsTot = qs.reduce((a, b) => a + b, 0);
      const at = (u: number) => {
        let acc = 0;
        for (let i = 0; i < segs.length; i++) {
          const w = qs[i] / qsTot;
          if (u <= acc + w || i === segs.length - 1) {
            const f = clamp((u - acc) / w, 0, 1);
            return { i, f, T: segs[i].T0 + (segs[i].T1 - segs[i].T0) * f };
          }
          acc += w;
        }
        return { i: 0, f: 0, T: -20 };
      };
      const u = () => clamp((clock() - t0) / (t1 - t0), 0, 1);
      // Particles on a lattice; disorder and freedom grow with the phase.
      const cols = 9, rows = 7, n = cols * rows;
      const P = Array.from({ length: n }, (_, i) => ({ gx: i % cols, gy: Math.floor(i / cols), ph: R0() * TAU, vx: R0() * 2 - 1, vy: R0() * 2 - 1, rx: R0(), ry: R0() }));
      const bx = A.x + A.w * (A.wide ? 0.06 : 0.1), bw = A.w * (A.wide ? 0.38 : 0.8), by = A.y + A.h * 0.1, bh = A.h * (A.wide ? 0.8 : 0.42);
      nodes.push(
        <Draw
          paint={(g) => {
            const s = at(u()), t = clock();
            // order: 0 solid, 1 liquid, 2 gas (blended within the transition steps).
            const order = s.i < 1 ? 0 : s.i === 1 ? s.f : s.i === 2 ? 1 : s.i === 3 ? 1 + s.f : 2;
            g.strokeStyle = alpha(L.ink, 0.5);
            g.lineWidth = 4 * k;
            g.strokeRect(bx, by, bw, bh);
            const cell = Math.min(bw / (cols + 2), bh / (rows + 2));
            for (const q2 of P) {
              const lx = bx + bw / 2 + (q2.gx - (cols - 1) / 2) * cell, ly = by + bh - cell * 1.2 - (rows - 1 - q2.gy) * cell * 0.95;
              const vib = (2 + 3 * clamp(order, 0, 1)) * k;
              // Liquid: loose, sliding; gas: anywhere in the box, fast.
              const lqx = bx + bw / 2 + (q2.gx - (cols - 1) / 2) * cell * 1.05 + Math.sin(t * 0.8 + q2.ph) * cell * 0.6;
              const lqy = by + bh - cell * 0.8 - (rows - 1 - q2.gy) * cell * 0.85 + Math.cos(t * 0.7 + q2.ph) * cell * 0.25;
              const gx = bx + 10 * k + bounce(q2.rx + q2.vx * t * 0.25) * (bw - 20 * k), gy = by + 10 * k + bounce(q2.ry + q2.vy * t * 0.25) * (bh - 20 * k);
              let x: number, y: number;
              if (order <= 1) (x = lx + (lqx - lx) * order), (y = ly + (lqy - ly) * order);
              else (x = lqx + (gx - lqx) * (order - 1)), (y = lqy + (gy - lqy) * (order - 1));
              x += Math.sin(t * 25 + q2.ph) * vib;
              y += Math.cos(t * 23 + q2.ph) * vib;
              g.fillStyle = heat((s.T + 20) / 140);
              g.beginPath();
              g.arc(x, y, cell * 0.36, 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      // Heating curve.
      const cx0 = A.wide ? A.x + A.w * 0.5 : A.x + A.w * 0.1, cw = A.wide ? A.w * 0.46 : A.w * 0.8;
      const cy0 = A.wide ? A.y + A.h * 0.1 : A.y + A.h * 0.58, ch = A.wide ? A.h * 0.72 : A.h * 0.34;
      const yT = (T: number) => cy0 + ch - ((T + 20) / 140) * ch;
      nodes.push(
        <Node>
          <Line points={[[cx0, cy0], [cx0, cy0 + ch], [cx0 + cw, cy0 + ch]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Txt text="T (°C)" x={cx0 + 10 * k} y={cy0 - 10 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={21 * k} fill={L.dim} />
          <Txt text="nhiệt lượng cung cấp →" x={cx0 + cw} y={cy0 + ch + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
          {[0, 100].map((T) => (
            <Node>
              <Line points={[[cx0, yT(T)], [cx0 + cw, yT(T)]]} stroke={alpha(L.ink, 0.15)} lineWidth={1.5 * k} lineDash={[6 * k, 6 * k]} />
              <Txt text={`${T} °C`} x={cx0 - 8 * k} y={yT(T)} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
            </Node>
          ))}
          <Line
            points={() => {
              const pts: XY[] = [];
              for (let i = 0; i <= 200; i++) {
                const uu = (i / 200) * u();
                pts.push([cx0 + uu * cw, yT(at(uu).T)]);
              }
              return pts;
            }}
            stroke={L.highlight}
            lineWidth={L.lw(4 * k)}
            {...L.glow(L.highlight, 10 * k)}
          />
          <Txt text={() => segs[at(u()).i].name} x={cx0 + cw / 2} y={cy0 + ch + 64 * k} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.text} />
          <Txt text={() => `${num(at(u()).T, 0)} °C`} x={() => cx0 + u() * cw} y={() => yT(at(u()).T) - 26 * k} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.highlight} />
        </Node>,
      );
      void Qtot;
    } else {
      // ---- Carnot cycle: isothermal expansion (hot), adiabatic expansion, isothermal compression (cold), adiabatic compression.
      const g = 1.4, Th = 1, Tc = 0.6;
      const V1 = 1, V2 = 2;
      const V3 = V2 * Math.pow(Th / Tc, 1 / (g - 1)), V4 = V1 * Math.pow(Th / Tc, 1 / (g - 1));
      const Pof = (V: number, leg: number) => (leg === 0 ? Th / V : leg === 1 ? (Th / V2) * Math.pow(V2 / V, g) : leg === 2 ? Tc / V : (Tc / V4) * Math.pow(V4 / V, g));
      const legs = [[V1, V2], [V2, V3], [V3, V4], [V4, V1]];
      const state = () => {
        const u = ((clock() - t0) / (t1 - t0)) * 4;
        const leg = clamp(Math.floor(u), 0, 3), f = clamp(u - leg, 0, 1);
        const [va, vb] = legs[leg];
        const V = va + (vb - va) * (clock() < t0 ? 0 : f);
        return { leg, V, P: Pof(V, leg) };
      };
      const gx = A.wide ? A.x + A.w * 0.48 : A.x + A.w * 0.12, gw = A.wide ? A.w * 0.48 : A.w * 0.8, gy = A.wide ? A.y + A.h * 0.06 : A.y + A.h * 0.5, gh = A.wide ? A.h * 0.8 : A.h * 0.42;
      const Vmax = V3 * 1.08, Pmax = Th / V1 * 1.1;
      const toG = (V: number, P: number): XY => [gx + (V / Vmax) * gw, gy + gh - (P / Pmax) * gh];
      const legCol = [L.highlight, L.accent, L.secondary, L.primary];
      const legName = ["1→2 dãn đẳng nhiệt (nhận nhiệt Q₁ từ nguồn nóng)", "2→3 dãn đoạn nhiệt (nguội đi)", "3→4 nén đẳng nhiệt (nhả nhiệt Q₂ ra nguồn lạnh)", "4→1 nén đoạn nhiệt (nóng lên)"];
      nodes.push(
        <Node>
          <Line points={[[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Txt text="P" x={gx + 12 * k} y={gy} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.dim} />
          <Txt text="V" x={gx + gw} y={gy + gh + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.dim} />
          {legs.map(([va, vb], i) => (
            <Line points={Array.from({ length: 41 }, (_, j) => toG(va + ((vb - va) * j) / 40, Pof(va + ((vb - va) * j) / 40, i)))} stroke={legCol[i]} lineWidth={L.lw(4 * k)} end={() => (state().leg > i ? 1 : state().leg === i ? clamp(((clock() - t0) / (t1 - t0)) * 4 - i, 0, 1) : 0)} {...L.glow(legCol[i], 8 * k)} />
          ))}
          <Rect position={() => toG(state().V, state().P)} size={18 * k} radius={9 * k} fill="#FFFFFF" />
          <Txt text={() => legName[state().leg]} x={gx + gw / 2} y={gy + gh + 64 * k} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={() => legCol[state().leg]} />
          <Txt text={`Hiệu suất Carnot η = 1 − T₂/T₁ = ${num((1 - Tc / Th) * 100, 0)} %`} x={gx + gw - 10 * k} y={gy + 20 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={23 * k} fill={L.text} />
        </Node>,
      );
      // Piston cylinder following V, with hot / cold reservoir contact.
      const cx1 = A.wide ? A.x + A.w * 0.08 : A.x + A.w * 0.1, cw1 = A.wide ? A.w * 0.3 : A.w * 0.8, cyb = A.wide ? A.y + A.h * 0.85 : A.y + A.h * 0.4, chMax = A.wide ? A.h * 0.7 : A.h * 0.3;
      nodes.push(
        <Draw
          paint={(gg) => {
            const s = state();
            const h = (s.V / Vmax) * chMax;
            gg.fillStyle = s.leg === 0 ? "rgba(255,90,50,0.8)" : s.leg === 2 ? "rgba(60,150,255,0.8)" : "rgba(140,140,150,0.5)";
            gg.fillRect(cx1, cyb, cw1, 26 * k);
            gg.fillStyle = heat(s.leg === 0 ? 0.85 : s.leg === 2 ? 0.2 : s.leg === 1 ? 0.85 - 0.65 * ((s.V - V2) / (V3 - V2)) : 0.2 + 0.65 * ((V4 - s.V) / (V4 - V1)));
            gg.globalAlpha = 0.35;
            gg.fillRect(cx1, cyb - h, cw1, h);
            gg.globalAlpha = 1;
            gg.strokeStyle = alpha(L.ink, 0.7);
            gg.lineWidth = 5 * k;
            gg.strokeRect(cx1, cyb - chMax, cw1, chMax);
            gg.fillStyle = "#8D97A6";
            gg.fillRect(cx1 + 4 * k, cyb - h - 20 * k, cw1 - 8 * k, 20 * k);
          }}
        />,
      );
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
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
