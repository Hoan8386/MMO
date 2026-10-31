// Galaxies built from stars and gas: spiral (logarithmic arms with blue young stars, pink star-forming
// knots and dark dust lanes on the arms' inner edges, a yellow bulge), barred spiral, the Milky Way
// with the Sun's position, elliptical (de Vaucouleurs light profile, old red stars), irregular
// (clumpy star formation), and a collision of two disc galaxies computed as a restricted N-body
// problem (two massive cores attract each other; thousands of test stars feel both) — tidal tails
// and the bridge between them form by themselves.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster } from "../../../shared/raster";
import { makeNoise, smoothstep } from "../../../shared/noise";
import { FONT, label } from "../../../shared/ui";
import { starfield } from "../../../shared/fx";
import { until, rng, clamp } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  kind: "spiral" | "barred" | "milky_way" | "elliptical" | "irregular" | "collision";
  arms: number;
  inclination: number;
  angle: number;
  stars: number;
  gas: boolean;
  labels: boolean;
  bg: boolean;
}

interface Star {
  r: number; // radius 0–1 (disc units)
  a: number; // angle
  z: number; // height above the disc (for inclination)
  c: string;
  s: number; // size
  b: number; // brightness 0–1
}

const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "stars_galaxies");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const R0 = rng(L.seed + 101);
    const N = makeNoise(L.seed + 3);
    const nStars = Math.round(p.stars * (0.35 + 0.65 * q));
    const spiral = p.kind === "spiral" || p.kind === "barred" || p.kind === "milky_way";
    const barred = p.kind === "barred" || p.kind === "milky_way";
    const arms = p.kind === "milky_way" ? 4 : p.arms;
    const pitch = (p.kind === "milky_way" ? 12 : 14) * (Math.PI / 180);
    const cosI = Math.cos((p.inclination * Math.PI) / 180);
    const Rg = Math.min(A.w * 0.42, (A.h * 0.46) / Math.max(cosI, p.kind === "collision" ? 0.8 : 0.45), 520 * k) * (p.kind === "collision" ? 0.62 : 1);
    const cx = A.cx, cy = A.cy;

    // ---- star populations.
    const stars: Star[] = [];
    const armPhase = (r: number) => Math.log(Math.max(r, 0.05)) / Math.tan(pitch);
    if (spiral) {
      for (let i = 0; i < nStars; i++) {
        const u = R0();
        if (u < 0.22) {
          // Bulge: old yellow-red stars, concentrated.
          const r = Math.abs(R0() + R0() + R0() - 1.5) * 0.17;
          stars.push({ r, a: R0() * TAU, z: (R0() - 0.5) * 0.25 * (0.3 - r), c: R0() < 0.5 ? "#FFE3A8" : "#FFC27A", s: 1 + R0() * 1.6, b: 0.5 + R0() * 0.5 });
        } else if (u < 0.85 || !barred) {
          // Disc: concentrated along the arms (scatter shrinking with brightness).
          // Exponential disc (scale length ~0.3).
          const r = Math.min(1, 0.06 - 0.3 * Math.log(1 - R0() * 0.96));
          const arm = Math.floor(R0() * arms);
          const young = R0() < 0.4;
          // Young stars hug the arms; old disc stars only loosely follow them.
          const spread = (young ? 0.5 : 2.2) * (R0() - 0.5) * (R0() + 0.3);
          const a = armPhase(r) + (arm * TAU) / arms + spread;
          stars.push({ r: r * (1 + (R0() - 0.5) * 0.04), a, z: (R0() - 0.5) * 0.03, c: young ? (R0() < 0.7 ? "#A6D8FF" : "#E8F4FF") : R0() < 0.6 ? "#FFF2D6" : "#FFD9A0", s: young ? 1 + R0() * 2.2 : 0.8 + R0(), b: young ? 0.6 + R0() * 0.4 : 0.35 + R0() * 0.4 });
        } else {
          // The bar: an elongated cloud of old stars.
          const x = (R0() - 0.5) * 0.55, y = (R0() - 0.5) * 0.12 * (1 - Math.abs(x) * 1.4);
          stars.push({ r: Math.hypot(x, y), a: Math.atan2(y, x), z: 0, c: "#FFDCA0", s: 1 + R0(), b: 0.5 + R0() * 0.4 });
        }
      }
    } else if (p.kind === "elliptical") {
      for (let i = 0; i < nStars; i++) {
        // r^(1/4) light profile: radius from an inverted cumulative profile (approx).
        const r = Math.pow(R0(), 2.4) * 0.95;
        stars.push({ r, a: R0() * TAU, z: (R0() - 0.5) * r * 1.4, c: R0() < 0.6 ? "#FFD7A0" : "#FFB98A", s: 0.8 + R0() * 1.4, b: 0.35 + R0() * 0.5 });
      }
    } else if (p.kind === "irregular") {
      const clumps = Array.from({ length: 7 }, () => [(R0() - 0.5) * 1.2, (R0() - 0.5) * 0.8, 0.08 + R0() * 0.18]);
      for (let i = 0; i < nStars; i++) {
        const c = clumps[Math.floor(R0() * clumps.length)];
        const rr = Math.abs(R0() + R0() - 1) * c[2] * 1.6, aa = R0() * TAU;
        const x = c[0] + Math.cos(aa) * rr, y = c[1] + Math.sin(aa) * rr;
        const young = R0() < 0.55;
        stars.push({ r: Math.hypot(x, y), a: Math.atan2(y, x), z: 0, c: young ? "#A6D8FF" : "#FFE6BE", s: 1 + R0() * 1.8, b: 0.4 + R0() * 0.6 });
      }
    }

    // ---- collision: restricted N-body, precomputed for every frame.
    const fps = 30, frames = Math.ceil(D * fps) + 1;
    let sim: Float32Array | null = null, cores: Float32Array | null = null, simColors: string[] = [];
    const nSim = p.kind === "collision" ? Math.round(1400 * (0.4 + 0.6 * q)) : 0;
    if (p.kind === "collision") {
      // Units: G = 1, core masses 1; galaxy 1 on a parabolic-ish approach to galaxy 2.
      const M = [1, 1];
      const C = [
        [-1.6, -0.55, 0.38, 0.06],
        [1.6, 0.55, -0.38, -0.06],
      ]; // x, y, vx, vy
      const pts: number[][] = [];
      for (let g = 0; g < 2; g++)
        for (let i = 0; i < nSim / 2; i++) {
          const r = 0.12 + Math.pow(R0(), 0.7) * 0.55, a = R0() * TAU;
          const v = Math.sqrt(M[g] / r) * (g === 0 ? 1 : -1); // galaxy 2 turns the other way
          const x = C[g][0] + Math.cos(a) * r, y = C[g][1] + Math.sin(a) * r * 0.85;
          pts.push([x, y, C[g][2] - Math.sin(a) * v, C[g][3] + Math.cos(a) * v * 0.85]);
          simColors.push(g === 0 ? (R0() < 0.5 ? "#A6D8FF" : "#FFF2D6") : R0() < 0.5 ? "#FFB8D0" : "#FFE3A8");
        }
      sim = new Float32Array(frames * pts.length * 2);
      cores = new Float32Array(frames * 4);
      const sub = 8, dt = (1.9 * st.speed) / fps / sub, eps = 0.06;
      for (let f = 0; f < frames; f++) {
        cores.set([C[0][0], C[0][1], C[1][0], C[1][1]], f * 4);
        pts.forEach((s, i) => sim!.set([s[0], s[1]], (f * pts.length + i) * 2));
        for (let s = 0; s < sub; s++) {
          // Cores (softened gravity), then test stars (leapfrog-ish semi-implicit Euler).
          const dx = C[1][0] - C[0][0], dy = C[1][1] - C[0][1], d3 = Math.pow(dx * dx + dy * dy + 0.05, 1.5);
          C[0][2] += (M[1] * dx) / d3 * dt;
          C[0][3] += (M[1] * dy) / d3 * dt;
          C[1][2] -= (M[0] * dx) / d3 * dt;
          C[1][3] -= (M[0] * dy) / d3 * dt;
          for (const c of C) (c[0] += c[2] * dt), (c[1] += c[3] * dt);
          for (const s2 of pts) {
            let ax = 0, ay = 0;
            for (let g = 0; g < 2; g++) {
              const ex = C[g][0] - s2[0], ey = C[g][1] - s2[1], e3 = Math.pow(ex * ex + ey * ey + eps * eps, 1.5);
              ax += (M[g] * ex) / e3;
              ay += (M[g] * ey) / e3;
            }
            s2[2] += ax * dt;
            s2[3] += ay * dt;
            s2[0] += s2[2] * dt;
            s2[1] += s2[3] * dt;
          }
        }
      }
    }

    // ---- gas: a cached raster in disc coordinates (arms of pink HII + blue gas, dust lanes).
    const gasRes = Math.round(420 * (0.6 + 0.4 * q));
    const gasPaint = (data: Uint8ClampedArray, cols: number, rows: number) => {
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x = ((i + 0.5) / cols) * 2 - 1, y = ((j + 0.5) / rows) * 2 - 1;
          const r = Math.hypot(x, y), a = Math.atan2(y, x);
          let R = 0, G = 0, B = 0, Aa = 0;
          if (spiral) {
            // Distance (in phase) to the nearest arm.
            const ph = (((a - armPhase(r)) % (TAU / arms)) + TAU / arms) % (TAU / arms);
            const d = Math.min(ph, TAU / arms - ph) / (TAU / arms);
            const warp = N.fbm(x * 4 + 2, y * 4, 1.3, 4);
            const armI = Math.exp(-(((d - 0.06 * (warp - 0.5)) / 0.11) ** 2)) * smoothstep(1, 0.15, r) * smoothstep(0.04, 0.2, r);
            const glow = Math.exp(-r * 3.2);
            const knots = smoothstep(0.62, 0.8, N.fbm(x * 14, y * 14, 4, 3)) * armI;
            // Dust lane on the trailing (inner) edge of each arm.
            const lane = Math.exp(-(((ph / (TAU / arms) - 0.9 + 0.05 * warp) / 0.05) ** 2)) * smoothstep(0.95, 0.2, r) * smoothstep(0.06, 0.22, r);
            R = 0.35 * armI * warp + 1.0 * glow + 1.2 * knots;
            G = 0.45 * armI * warp + 0.85 * glow + 0.35 * knots;
            B = 0.85 * armI * warp + 0.5 * glow + 0.65 * knots;
            Aa = clamp(armI * 0.9 * (0.4 + warp) + glow * 0.95 + knots * 0.7, 0, 1);
            if (barred) {
              const bar = Math.exp(-((x / 0.32) ** 2) - (y / 0.07) ** 2);
              R += bar * 0.9;
              G += bar * 0.75;
              B += bar * 0.45;
              Aa = Math.max(Aa, bar * 0.8);
            }
            // Dust darkens (rendered as dark, semi-opaque).
            const dust = lane * 0.75 * N.fbm(x * 9, y * 9, 7, 3) * 1.6;
            R *= 1 - dust;
            G *= 1 - dust;
            B *= 1 - dust;
            Aa = Math.max(Aa, dust * 0.6);
          } else if (p.kind === "elliptical") {
            // de Vaucouleurs profile I/Ie = exp(−7.67((r/re)^¼ − 1)), shown on a log scale.
            const lnI = -7.67 * (Math.pow(Math.max(1e-4, Math.hypot(x, y / 0.75)) / 0.35, 0.25) - 1);
            const g = clamp((lnI + 3) / 10.67, 0, 1) * smoothstep(1, 0.75, r);
            R = g * 1.15;
            G = g * 0.88;
            B = g * 0.62;
            Aa = clamp(g * 1.1, 0, 1);
          } else {
            const n = N.fbm(x * 3 + 5, y * 3, 2, 5);
            const blob = smoothstep(0.5, 0.75, n) * smoothstep(1, 0.3, r);
            R = blob * 0.7;
            G = blob * 0.55;
            B = blob * 0.95;
            Aa = blob * 0.6;
          }
          const o = (j * cols + i) * 4;
          data[o] = clamp(R, 0, 1) * 255;
          data[o + 1] = clamp(G, 0, 1) * 255;
          data[o + 2] = clamp(B, 0, 1) * 255;
          data[o + 3] = Aa * 255;
        }
    };

    // ---- rotation: rigid pattern plus mild differential motion of the stars.
    const Wp = (0.06 * st.speed * TAU) / 10;
    const spin = () => Wp * clock();
    const ang = (p.angle * Math.PI) / 180;
    const project = (r: number, a: number, z: number): [number, number] => {
      // Disc coordinates → tilted (inclination) → turned on the sky.
      const x = r * Math.cos(a), y = r * Math.sin(a) * cosI - z * Math.sin(Math.acos(cosI));
      return [cx + (x * Math.cos(ang) - y * Math.sin(ang)) * Rg, cy + (x * Math.sin(ang) + y * Math.cos(ang)) * Rg];
    };
    const starPaint = (g: CanvasRenderingContext2D) => {
      g.globalCompositeOperation = "lighter";
      if (p.kind === "collision" && sim) {
        const f = Math.min(frames - 1, Math.round(clock() * fps));
        const n = simColors.length;
        const S = Rg * 0.9;
        for (let i = 0; i < n; i++) {
          const x = sim[(f * n + i) * 2], y = sim[(f * n + i) * 2 + 1];
          g.fillStyle = simColors[i];
          g.globalAlpha = 0.75;
          g.beginPath();
          g.arc(cx + x * S, cy + y * S, 1.6 * k, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        for (let c = 0; c < 2; c++) {
          const x = cx + cores![f * 4 + c * 2] * S, y = cy + cores![f * 4 + c * 2 + 1] * S;
          const gr = g.createRadialGradient(x, y, 0, x, y, 70 * k);
          gr.addColorStop(0, "rgba(255, 244, 214, 0.95)");
          gr.addColorStop(0.25, "rgba(255, 210, 150, 0.35)");
          gr.addColorStop(1, "rgba(255, 180, 120, 0)");
          g.fillStyle = gr;
          g.beginPath();
          g.arc(x, y, 70 * k, 0, TAU);
          g.fill();
        }
        return;
      }
      const t = spin();
      for (const s of stars) {
        const a = s.a + t * (1 + 0.25 * (1 - s.r));
        const [x, y] = project(s.r, a, s.z);
        g.globalAlpha = s.b;
        g.fillStyle = s.c;
        g.beginPath();
        g.arc(x, y, s.s * k, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      // Core glow.
      const [x0, y0] = project(0, 0, 0);
      const cr = Rg * (p.kind === "elliptical" ? 0.45 : 0.22);
      const gr = g.createRadialGradient(x0, y0, 0, x0, y0, cr);
      gr.addColorStop(0, "rgba(255, 248, 225, 0.95)");
      gr.addColorStop(0.3, "rgba(255, 220, 160, 0.45)");
      gr.addColorStop(1, "rgba(255, 190, 120, 0)");
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x0, y0, cr, cr * Math.max(cosI, p.kind === "elliptical" ? 0.75 : 0.35), ang, 0, TAU);
      g.fill();
    };

    // ---- labels.
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callNodes: Node[] = [];
    const call = (at: () => [number, number], to0: [number, number], text: string) => {
      const s = createSignal(0);
      const tw = text.length * 26 * k * 0.55;
      const to: [number, number] = [to0[0] >= cx ? Math.min(to0[0], A.x + A.w - tw - 12 * k) : Math.max(to0[0], A.x + tw + 12 * k), to0[1]];
      shows.push(s);
      callNodes.push(
        <Node opacity={s}>
          <Line points={() => [at(), to]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Rect position={at} size={10 * k} radius={5 * k} fill={L.accent} />
          <Txt text={text} x={to[0] + (to[0] >= cx ? 10 : -10) * k} y={to[1]} offsetX={to[0] >= cx ? -1 : 1} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={L.text} shadowColor="rgba(0,0,0,0.85)" shadowBlur={8 * k} />
        </Node>,
      );
    };
    if (p.labels) {
      const right = Math.min(cx + Rg * 1.05, A.x + A.w - 330 * k), left = Math.max(cx - Rg * 1.05, A.x + 330 * k);
      if (spiral || p.kind === "elliptical") call(() => project(0, 0, 0), [left, cy - Rg * 0.55 * Math.max(cosI, 0.5)], p.kind === "elliptical" ? "Lõi — sao già, đỏ vàng" : "Phình trung tâm (bulge)");
      if (spiral) {
        call(() => project(0.62, armPhase(0.62) + spin() * 1.1, 0), [right, cy - Rg * 0.6 * Math.max(cosI, 0.5)], "Nhánh xoắn — sao trẻ xanh, vùng hình thành sao");
        call(() => project(0.45, armPhase(0.45) + (TAU / arms) * 0.9 + spin() * 1.15, 0), [left, cy + Rg * 0.6 * Math.max(cosI, 0.5)], "Dải bụi tối");
      }
      if (barred) call(() => project(0.22, spin(), 0), [right, cy + Rg * 0.55 * Math.max(cosI, 0.5)], "Thanh ngang (bar)");
      if (p.kind === "milky_way") call(() => project(0.53, armPhase(0.53) + 0.55 + spin() * 1.13, 0), [right, cy + Rg * 0.85 * Math.max(cosI, 0.5)], "Hệ Mặt Trời — cách tâm ~26 000 năm ánh sáng");
      if (p.kind === "collision") {
        call(() => [cx - Rg * 0.9, cy - Rg * 0.4], [left, A.y + 40 * k], "Đuôi thuỷ triều");
        call(() => [cx, cy], [right, A.y + A.h - 40 * k], "Hai lõi tiến lại và hợp nhất");
      }
      if (p.kind === "irregular") call(() => [cx + Rg * 0.2, cy - Rg * 0.1], [right, cy - Rg * 0.5], "Đám sao trẻ hình thành rải rác");
    }

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    const gasSize = Rg * 2;
    st.cam.add(
      <Node>
        {p.bg || L.backdrop !== "none" ? starfield(ctx, L, { count: Math.round(180 * q), seed: L.seed + 4, clock, drift: 5 }) : null}
        <Node ref={world} opacity={0} scale={0.9}>
          {p.gas && p.kind !== "collision" ? (
            <Node x={cx} y={cy} rotation={(ang * 180) / Math.PI}>
              <Node scaleY={cosI}>
                <Node rotation={() => (spin() * 180) / Math.PI}>
                  <Raster w={gasSize} h={gasSize} res={gasRes} once paint={gasPaint} />
                </Node>
              </Node>
            </Node>
          ) : null}
          <Draw paint={starPaint} />
          {callNodes}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield world().scale(1, 1.6, easeOutCubic);
    yield* world().opacity(1, 1, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length));
      yield steps[i]();
    }
  },
});
