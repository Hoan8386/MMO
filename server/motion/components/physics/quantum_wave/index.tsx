// A quantum particle in one dimension: the time-dependent Schrödinger equation iħ∂ψ/∂t = Hψ solved
// on a grid by the Crank–Nicolson method (unitary: probability is conserved), ħ = m = 1.
// tunneling: a Gaussian wave packet with less energy than a barrier hits it — part is reflected, part
// tunnels through; the probabilities R and T are integrated from ψ (a classical ball beside it always
// bounces back). harmonic: a coherent state in a parabolic well swings without spreading. well: a
// superposition of the two lowest states of a box sloshes from side to side. measurement: a free
// packet spreads; a position measurement collapses it to a narrow spike at a place drawn from |ψ|²,
// which then spreads again. Drawn: the potential V(x), |ψ|² (probability density, glowing area) and
// Re ψ (the oscillating wave).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "tunneling" | "harmonic" | "well" | "measurement";
  barrierWidth: number;
  barrierHeight: number;
  showReal: boolean;
  classical: boolean;
  labels: boolean;
}

// Complex tridiagonal solve (Thomas): a·x[i−1] + b[i]·x[i] + a·x[i+1] = d[i]; a constant.
function solve(aRe: number, aIm: number, bRe: Float64Array, bIm: Float64Array, dRe: Float64Array, dIm: Float64Array, oRe: Float64Array, oIm: Float64Array, cRe: Float64Array, cIm: Float64Array) {
  const n = bRe.length;
  // c'[0] = a / b0; d'[0] = d0 / b0
  let br = bRe[0], bi = bIm[0], m = br * br + bi * bi;
  cRe[0] = (aRe * br + aIm * bi) / m;
  cIm[0] = (aIm * br - aRe * bi) / m;
  oRe[0] = (dRe[0] * br + dIm[0] * bi) / m;
  oIm[0] = (dIm[0] * br - dRe[0] * bi) / m;
  for (let i = 1; i < n; i++) {
    // den = b[i] − a·c'[i−1]
    br = bRe[i] - (aRe * cRe[i - 1] - aIm * cIm[i - 1]);
    bi = bIm[i] - (aRe * cIm[i - 1] + aIm * cRe[i - 1]);
    m = br * br + bi * bi;
    cRe[i] = (aRe * br + aIm * bi) / m;
    cIm[i] = (aIm * br - aRe * bi) / m;
    const nr = dRe[i] - (aRe * oRe[i - 1] - aIm * oIm[i - 1]), ni = dIm[i] - (aRe * oIm[i - 1] + aIm * oRe[i - 1]);
    oRe[i] = (nr * br + ni * bi) / m;
    oIm[i] = (ni * br - nr * bi) / m;
  }
  for (let i = n - 2; i >= 0; i--) {
    const r = oRe[i] - (cRe[i] * oRe[i + 1] - cIm[i] * oIm[i + 1]), im = oIm[i] - (cRe[i] * oIm[i + 1] + cIm[i] * oRe[i + 1]);
    oRe[i] = r;
    oIm[i] = im;
  }
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "quantum");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const fps = 30, frames = Math.ceil(D * fps) + 1;

    // ---- grid and potential per mode.
    const N = Math.round(420 + 180 * L.q);
    const Lx = p.mode === "well" ? 40 : p.mode === "harmonic" ? 90 : 220;
    const dx = Lx / N;
    const X = Float64Array.from({ length: N }, (_, i) => -Lx / 2 + (i + 0.5) * dx);
    const V = new Float64Array(N);
    const omega = 0.06;
    const V0 = p.barrierHeight, a = p.barrierWidth;
    for (let i = 0; i < N; i++) {
      const x = X[i];
      if (p.mode === "tunneling") V[i] = Math.abs(x) < a / 2 ? V0 : 0;
      else if (p.mode === "harmonic") V[i] = 0.5 * omega * omega * x * x;
      else if (p.mode === "well") V[i] = Math.abs(x) > 12 ? 40 : 0;
    }
    // Absorbing edges (complex potential) so nothing reflects off the grid's ends.
    const Vim = new Float64Array(N);
    if (p.mode === "tunneling" || p.mode === "measurement") for (let i = 0; i < N; i++) {
      const e = Math.min(i, N - 1 - i) / N;
      if (e < 0.06) Vim[i] = -0.08 * (1 - e / 0.06) ** 2;
    }

    // ---- initial state.
    const re = new Float64Array(N), im = new Float64Array(N);
    const gauss = (x0: number, s: number, k0: number) => {
      for (let i = 0; i < N; i++) {
        const g = Math.exp(-((X[i] - x0) ** 2) / (4 * s * s));
        re[i] = g * Math.cos(k0 * X[i]);
        im[i] = g * Math.sin(k0 * X[i]);
      }
    };
    const k0 = 1.0;
    if (p.mode === "tunneling") gauss(-55, 8, k0);
    else if (p.mode === "harmonic") gauss(-30, Math.sqrt(1 / (2 * omega)), 0);
    else if (p.mode === "measurement") gauss(-10, 3, 0.25);
    else
      for (let i = 0; i < N; i++) {
        const x = X[i] + 12;
        const inside = Math.abs(X[i]) < 12;
        re[i] = inside ? (Math.sin((Math.PI * x) / 24) + Math.sin((2 * Math.PI * x) / 24)) / Math.SQRT2 : 0;
      }
    const norm = () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += re[i] * re[i] + im[i] * im[i];
      s = Math.sqrt(s * dx);
      for (let i = 0; i < N; i++) (re[i] /= s), (im[i] /= s);
    };
    norm();

    // ---- evolve (Crank–Nicolson), store |ψ|² and Re ψ per frame.
    const Tsim = p.mode === "tunneling" ? 115 : p.mode === "harmonic" ? (2 * Math.PI) / omega : p.mode === "well" ? 2 * ((2 * Math.PI) / ((3 * Math.PI * Math.PI) / (2 * 24 * 24))) : 70;
    const sub = 6, dt = (Tsim * st.speed) / (frames - 1) / sub;
    const r = dt / (4 * dx * dx); // i·r is the off-diagonal factor
    const bRe = new Float64Array(N), bIm = new Float64Array(N), dRe = new Float64Array(N), dIm = new Float64Array(N);
    const oRe = new Float64Array(N), oIm = new Float64Array(N), cRe = new Float64Array(N), cIm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // LHS diag: 1 + i(2r + dt·V/2) − dt·Vim/2  (with V complex: V + i·Vim)
      bRe[i] = 1 - (dt * Vim[i]) / 2;
      bIm[i] = 2 * r + (dt * V[i]) / 2;
    }
    const rho = new Float32Array(frames * N), real = new Float32Array(frames * N);
    const measureAt = p.mode === "measurement" ? ctx.cue(0, 2) : -1;
    let measuredX = 0;
    const R0 = rng(L.seed + 7);
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < N; i++) {
        rho[f * N + i] = re[i] * re[i] + im[i] * im[i];
        real[f * N + i] = re[i];
      }
      // Measurement: collapse to a narrow packet at a position drawn from |ψ|².
      if (measureAt > 0 && Math.abs(f / fps - measureAt) < 0.5 / fps) {
        let u = R0(), acc = 0, j = 0;
        for (; j < N; j++) {
          acc += (re[j] * re[j] + im[j] * im[j]) * dx;
          if (acc >= u) break;
        }
        measuredX = X[Math.min(N - 1, j)];
        for (let i = 0; i < N; i++) {
          re[i] = Math.exp(-((X[i] - measuredX) ** 2) / (4 * 0.8 * 0.8));
          im[i] = 0;
        }
        norm();
        u = 0;
      }
      for (let s = 0; s < sub; s++) {
        for (let i = 0; i < N; i++) {
          // RHS = (1 − iHdt/2)ψ: diag' = 1 − i(2r + dtV/2) + dt·Vim/2 ; off' = +i·r
          const pr = i > 0 ? re[i - 1] : 0, pi = i > 0 ? im[i - 1] : 0, nr = i < N - 1 ? re[i + 1] : 0, ni = i < N - 1 ? im[i + 1] : 0;
          const gR = 1 + (dt * Vim[i]) / 2, gI = -(2 * r + (dt * V[i]) / 2);
          dRe[i] = gR * re[i] - gI * im[i] - r * (pi + ni);
          dIm[i] = gR * im[i] + gI * re[i] + r * (pr + nr);
        }
        // LHS off-diagonal = −i·r
        solve(0, -r, bRe, bIm, dRe, dIm, oRe, oIm, cRe, cIm);
        re.set(oRe);
        im.set(oIm);
      }
    }
    const frameOf = () => Math.min(frames - 1, Math.max(0, Math.round(clock() * fps)));

    // ---- drawing area.
    const G = { x: A.x + A.w * 0.04, y: A.y + A.h * 0.12, w: A.w * 0.92, h: A.h * 0.62 };
    let rhoMax = 0;
    for (let i = 0; i < N; i++) rhoMax = Math.max(rhoMax, rho[i]);
    if (p.mode === "measurement") rhoMax *= 1.4;
    const vMax = p.mode === "tunneling" ? V0 * 1.6 : p.mode === "harmonic" ? 0.5 * omega * omega * (Lx / 2) ** 2 : 1;
    const xs = (i: number) => G.x + ((i + 0.5) / N) * G.w;
    const base = G.y + G.h;
    const paint = (g: CanvasRenderingContext2D) => {
      const f = frameOf();
      // Potential.
      g.fillStyle = alpha(L.ink, 0.1);
      g.strokeStyle = alpha(L.ink, 0.55);
      g.lineWidth = 2 * k;
      g.beginPath();
      g.moveTo(G.x, base);
      for (let i = 0; i < N; i++) g.lineTo(xs(i), base - clamp(V[i] / vMax, 0, 1.2) * G.h * 0.8);
      g.lineTo(G.x + G.w, base);
      g.closePath();
      g.fill();
      g.stroke();
      // Energy of the packet (tunneling): a dashed line below the barrier top.
      if (p.mode === "tunneling") {
        const ey = base - ((k0 * k0) / 2 / vMax) * G.h * 0.8;
        g.setLineDash([8 * k, 8 * k]);
        g.strokeStyle = alpha(L.accent, 0.7);
        g.beginPath();
        g.moveTo(G.x, ey);
        g.lineTo(G.x + G.w, ey);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = L.accent;
        g.font = `700 ${20 * k}px ${FONT}`;
        g.fillText("năng lượng hạt E < V₀", G.x + 8 * k, ey - 10 * k);
      }
      // |ψ|² glowing area.
      const gr = g.createLinearGradient(0, base - G.h, 0, base);
      gr.addColorStop(0, alpha(L.primary, 0.95));
      gr.addColorStop(1, alpha(L.primary, 0.15));
      g.fillStyle = gr;
      g.shadowColor = L.primary;
      g.shadowBlur = 16 * k * L.visual.glow;
      g.beginPath();
      g.moveTo(G.x, base);
      for (let i = 0; i < N; i++) g.lineTo(xs(i), base - (rho[f * N + i] / rhoMax) * G.h * 0.9);
      g.lineTo(G.x + G.w, base);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      // Re ψ.
      if (p.showReal) {
        const sc = Math.sqrt(rhoMax);
        g.strokeStyle = alpha(L.secondary, 0.85);
        g.lineWidth = 2 * k;
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const y = base - G.h * 0.45 - (real[f * N + i] / sc) * G.h * 0.3;
          if (i) g.lineTo(xs(i), y);
          else g.moveTo(xs(i), y);
        }
        g.stroke();
      }
    };

    // ---- probabilities left/right of the barrier (tunneling).
    const prob = (side: -1 | 1) => () => {
      const f = frameOf();
      let s = 0;
      for (let i = 0; i < N; i++) if ((side < 0 && X[i] < -a / 2) || (side > 0 && X[i] > a / 2)) s += rho[f * N + i] * dx;
      return s;
    };
    // Transmitted fraction includes what the right absorbing edge removed: total − left − inside.
    const total0 = (() => {
      let s = 0;
      for (let i = 0; i < N; i++) s += rho[i] * dx;
      return s;
    })();
    const Tp = () => {
      const f = frameOf();
      let left = 0, inside = 0;
      for (let i = 0; i < N; i++) {
        if (X[i] < -a / 2) left += rho[f * N + i] * dx;
        else if (X[i] <= a / 2) inside += rho[f * N + i] * dx;
      }
      return clamp((total0 - left - inside) / total0, 0, 1);
    };
    void prob;

    // ---- classical comparison: a ball with the same energy bounces back from the barrier.
    const ball = () => {
      const t = clock() / D;
      const xw = -55 + 120 * t;
      const x = xw < -a / 2 ? xw : -a - xw; // reflect at the barrier
      return xs(((x + Lx / 2) / Lx) * N - 0.5);
    };

    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const extra: Node[] = [];
    const mk = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      extra.push(<Node opacity={s}>{n}</Node>);
    };
    if (p.labels) {
      const lx = G.x + 10 * k, ly = A.y + 30 * k;
      if (p.mode === "tunneling") {
        mk(label(ctx, "|ψ|² — mật độ xác suất tìm thấy hạt", { x: lx, y: ly, size: 26, align: "left", fill: L.primary }));
        mk(
          <Txt text={() => `Xuyên qua hàng rào: T = ${num(Tp() * 100, 1)} %   ·   phản xạ: R = ${num((1 - Tp()) * 100, 1)} %`} x={A.cx} y={A.y + A.h - 30 * k} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.text} />,
        );
      } else if (p.mode === "harmonic") mk(label(ctx, "Trạng thái kết hợp: gói sóng dao động như con lắc mà không loe ra", { x: lx, y: ly, size: 26, align: "left", fill: L.text }));
      else if (p.mode === "well") mk(label(ctx, "Chồng chập hai trạng thái dừng → mật độ xác suất dao động qua lại", { x: lx, y: ly, size: 26, align: "left", fill: L.text }));
      else {
        mk(label(ctx, "Gói sóng tự do loe dần ra (bất định vị trí tăng)", { x: lx, y: ly, size: 26, align: "left", fill: L.text }));
        mk(<Txt text={`Phép đo! Hàm sóng sụp đổ tại x = ${num(measuredX, 1)}`} x={A.cx} y={A.y + A.h - 30 * k} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.highlight} />);
      }
      if (p.showReal) mk(label(ctx, "Re ψ — phần thực của hàm sóng", { x: lx, y: ly + 40 * k, size: 22, align: "left", fill: L.secondary }));
    }

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    const flash = createSignal(0);
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          <Draw paint={paint} />
          {p.classical && p.mode === "tunneling" ? (
            <Node>
              <Rect x={ball} y={base + 60 * k} width={30 * k} height={30 * k} radius={15 * k} fill={L.accent} {...L.glow(L.accent, 12 * k)} />
              <Txt text="hạt cổ điển: luôn bật lại" x={G.x + 10 * k} y={base + 60 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
              <Line points={[[G.x, base + 80 * k], [G.x + G.w, base + 80 * k]]} stroke={alpha(L.ink, 0.15)} lineWidth={1.5 * k} />
            </Node>
          ) : null}
          {measureAt > 0 ? <Rect x={A.cx} y={A.cy} width={A.w} height={A.h} fill="#FFFFFF" opacity={flash} /> : null}
          {extra}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    if (p.mode === "measurement" && p.labels) {
      // Second caption exactly at the measurement, with a flash.
      yield steps[0]();
      if (p.showReal) yield shows[2](1, 0.5);
      yield* until(measureAt);
      yield flash(0.35, 0.05).to(0, 0.4);
      yield shows[1](1, 0.3);
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
