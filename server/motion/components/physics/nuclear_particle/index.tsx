// Nuclear and particle physics. decay: a grid of unstable nuclei; each decays at a random moment drawn
// from the exponential law (seeded), so the count left follows N₀·2^(−t/T½) only on average — the
// live curve tracks the theory with real scatter. alpha / beta / gamma: one nucleus emits an α particle
// (2p + 2n), a β⁻ electron (a neutron turning into a proton, with an antineutrino) or a γ photon, with
// the reaction written out. fusion: deuterium and tritium overcome repulsion, fuse into helium-4 and a
// fast neutron; E = Δm·c² from the real masses (17.6 MeV). collider: two beams circle an accelerator
// ring, collide in the detector, and the products fly out on tracks curved by the magnetic field
// (charged tracks curve, neutral ones go straight; tighter curl = lower momentum).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
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
  mode: "decay" | "alpha" | "beta" | "gamma" | "fusion" | "collider";
  halfLife: number;
  nuclei: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "nuclear");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const R0 = rng(L.seed + 29);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    const PROTON = L.highlight, NEUTRON = "#9AA4B2", ELECTRON = L.secondary, GAMMA = "#FFE66D";
    const ball = (x: number, y: number, r: number, c: string) => (
      <Circle x={x} y={y} size={r * 2} fill={c} stroke="rgba(255,255,255,0.6)" lineWidth={1.5 * k} />
    );
    // A nucleus as a packed cluster of protons and neutrons (deterministic layout).
    const cluster = (Z: number, Nn: number, r: number, seed: number): [number, number, string][] => {
      const rr = rng(seed), pts: [number, number, string][] = [];
      const n = Z + Nn;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996, d = r * Math.sqrt(i / n) * 2.1;
        pts.push([Math.cos(a) * d + (rr() - 0.5) * r * 0.3, Math.sin(a) * d + (rr() - 0.5) * r * 0.3, i % 2 && pts.filter((q) => q[2] === PROTON).length < Z ? PROTON : pts.filter((q) => q[2] === NEUTRON).length < Nn ? NEUTRON : PROTON]);
      }
      return pts;
    };
    const t0 = 1.2;

    if (p.mode === "decay") {
      const n = p.nuclei;
      const cols = Math.ceil(Math.sqrt(n * (A.wide ? 1 : 1.6) * (A.wide ? 0.9 : 1)));
      const rows = Math.ceil(n / cols);
      const GW = A.wide ? A.w * 0.46 : A.w * 0.9, GH = A.wide ? A.h * 0.85 : A.h * 0.5;
      const cell = Math.min(GW / cols, GH / rows);
      const gx = A.x + (A.wide ? 0 : (A.w - cols * cell) / 2), gy = A.y + (A.wide ? (A.h - rows * cell) / 2 : 0);
      // Half-life in video seconds; decay time t = −T½·log₂(U).
      const Th = (p.halfLife * (D - t0)) / 5;
      const times = Array.from({ length: n }, () => t0 - Th * Math.log2(1 - R0() * 0.999999));
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            for (let i = 0; i < n; i++) {
              const x = gx + ((i % cols) + 0.5) * cell, y = gy + (Math.floor(i / cols) + 0.5) * cell;
              const age = t - times[i];
              const decayed = age > 0;
              g.fillStyle = decayed ? alpha(L.secondary, 0.55) : PROTON;
              g.beginPath();
              g.arc(x, y, cell * 0.36, 0, TAU);
              g.fill();
              if (decayed && age < 0.5) {
                g.strokeStyle = `rgba(255,255,200,${1 - age / 0.5})`;
                g.lineWidth = 3 * k;
                g.beginPath();
                g.arc(x, y, cell * (0.4 + age * 1.6), 0, TAU);
                g.stroke();
              }
            }
          }}
        />,
      );
      // Live curve vs theory.
      const cx0 = A.wide ? A.x + A.w * 0.54 : A.x + A.w * 0.08, cw = A.wide ? A.w * 0.42 : A.w * 0.84;
      const cy0 = A.wide ? A.y + A.h * 0.12 : A.y + A.h * 0.6, ch = A.wide ? A.h * 0.66 : A.h * 0.32;
      const xT = (t: number) => cx0 + ((t - t0) / (D - t0)) * cw;
      const left = (t: number) => times.filter((tt) => tt > t).length;
      nodes.push(
        <Node>
          <Line points={[[cx0, cy0], [cx0, cy0 + ch], [cx0 + cw, cy0 + ch]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Txt text="số hạt nhân còn lại" x={cx0 + 10 * k} y={cy0 - 6 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Txt text="thời gian" x={cx0 + cw} y={cy0 + ch + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Line points={Array.from({ length: 101 }, (_, i): XY => [cx0 + (i / 100) * cw, cy0 + ch - Math.pow(2, -((i / 100) * (D - t0)) / Th) * ch])} stroke={alpha(L.ink, 0.45)} lineWidth={2.5 * k} lineDash={[8 * k, 6 * k]} />
          {[1, 2, 3].map((m) => (
            <Node opacity={() => (clock() > t0 + m * Th ? 1 : 0.0)}>
              <Line points={[[xT(t0 + m * Th), cy0 + ch], [xT(t0 + m * Th), cy0 + ch - ch / 2 ** m]]} stroke={alpha(L.accent, 0.6)} lineWidth={1.5 * k} lineDash={[5 * k, 5 * k]} />
              <Txt text={`${m}T½ → ${num(100 / 2 ** m, 1)} %`} x={xT(t0 + m * Th) + 6 * k} y={cy0 + ch - ch / 2 ** m - 16 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={19 * k} fill={L.accent} />
            </Node>
          ))}
          <Line
            points={() => {
              const pts: XY[] = [];
              const end = Math.max(t0, clock());
              for (let i = 0; i <= 160; i++) {
                const t = t0 + ((end - t0) * i) / 160;
                pts.push([xT(t), cy0 + ch - (left(t) / n) * ch]);
              }
              return pts;
            }}
            stroke={L.highlight}
            lineWidth={L.lw(3.5 * k)}
            {...L.glow(L.highlight, 8 * k)}
          />
          <Txt text={() => `còn ${left(clock())}/${n}`} x={cx0 + cw} y={cy0 + 10 * k} offsetX={1} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.highlight} />
        </Node>,
      );
      show(label(ctx, "Từng hạt nhân phân rã ngẫu nhiên — nhưng cứ mỗi chu kỳ bán rã, còn lại một nửa", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: L.text }));
    } else if (p.mode === "alpha" || p.mode === "beta" || p.mode === "gamma") {
      const cx = A.x + A.w * 0.32, cy = A.cy, r = Math.min(A.w, A.h) * 0.045;
      const nuc = cluster(p.mode === "alpha" ? 18 : 14, p.mode === "alpha" ? 24 : 18, r, 7);
      const tE = ctx.cue(0, 3);
      const fly = () => clamp((clock() - tE) / 2.4, 0, 1);
      const recoil = () => -fly() * 30 * k;
      const shake = () => (clock() < tE ? Math.sin(clock() * 40) * 3 * k * clamp(clock() / tE, 0, 1) : 0);
      nodes.push(
        <Node x={() => cx + recoil() + shake()} y={cy}>
          {nuc.map(([x, y, c]) => ball(x, y, r * 0.55, c))}
        </Node>,
      );
      const far = A.x + A.w * 0.92 - cx;
      if (p.mode === "alpha") {
        const ap = cluster(2, 2, r * 0.5, 3);
        nodes.push(
          <Node x={() => cx + 3 * r + fly() ** 0.7 * far} y={cy} opacity={() => (clock() > tE ? 1 : 0)}>
            {ap.map(([x, y, c]) => ball(x, y, r * 0.55, c))}
            <Txt text="α (He-4)" y={-r * 2.2} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
          </Node>,
        );
        show(label(ctx, "²³⁸U → ²³⁴Th + ⁴He  (hạt α: 2 proton + 2 neutron, bị chặn bởi tờ giấy)", { x: A.cx, y: A.y + A.h - 20 * k, size: 27, fill: L.text }));
      } else if (p.mode === "beta") {
        // One neutron at the edge turns red (→ proton); an electron and an antineutrino leave.
        nodes.push(
          <Node>
            <Circle x={() => cx + recoil() + r * 1.6} y={cy - r * 0.6} size={r * 1.1} fill={() => (clock() > tE ? PROTON : NEUTRON)} stroke="#FFFFFF" lineWidth={2 * k} />
            <Node opacity={() => (clock() > tE ? 1 : 0)}>
              <Circle x={() => cx + 2 * r + fly() ** 0.6 * far} y={() => cy - fly() * A.h * 0.18} size={r * 0.5} fill={ELECTRON} {...L.glow(ELECTRON, 14 * k)} />
              <Txt text="e⁻ (tia β)" x={() => cx + 2 * r + fly() ** 0.6 * far} y={() => cy - fly() * A.h * 0.18 - 26 * k} fontFamily={FONT} fontWeight={800} fontSize={23 * k} fill={ELECTRON} />
              <Circle x={() => cx + 2 * r + fly() ** 0.6 * far * 0.9} y={() => cy + fly() * A.h * 0.2} size={r * 0.3} fill="#D9D9D9" />
              <Txt text="ν̄ (phản neutrino)" x={() => cx + 2 * r + fly() ** 0.6 * far * 0.9} y={() => cy + fly() * A.h * 0.2 + 26 * k} fontFamily={FONT} fontWeight={700} fontSize={21 * k} fill={L.dim} />
            </Node>
          </Node>,
        );
        show(label(ctx, "n → p + e⁻ + ν̄   ·   ¹⁴C → ¹⁴N + e⁻ + ν̄  (dùng để định tuổi carbon)", { x: A.cx, y: A.y + A.h - 20 * k, size: 27, fill: L.text }));
      } else {
        nodes.push(
          <Draw
            paint={(g) => {
              if (clock() < tE) return;
              const x0 = cx + 2 * r, len = A.w * 0.5, head = fly() * (len + 200 * k);
              g.strokeStyle = GAMMA;
              g.lineWidth = 3.5 * k;
              g.shadowColor = GAMMA;
              g.shadowBlur = 16 * k * L.visual.glow;
              g.beginPath();
              for (let i = 0; i <= 160; i++) {
                const x = x0 + head - (i / 160) * 220 * k;
                if (x < x0) break;
                const y = cy + Math.sin((x / (14 * k)) * TAU) * 16 * k;
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
              g.shadowBlur = 0;
            }}
          />,
        );
        // Excited nucleus glows before emitting.
        nodes.push(
          <Draw
            paint={(g) => {
              const e = clock() < tE ? 1 : Math.max(0, 1 - (clock() - tE) * 2);
              const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
              gr.addColorStop(0, `rgba(255,240,150,${0.6 * e})`);
              gr.addColorStop(1, "rgba(255,200,80,0)");
              g.fillStyle = gr;
              g.beginPath();
              g.arc(cx, cy, r * 4, 0, TAU);
              g.fill();
            }}
          />,
        );
        show(label(ctx, "Hạt nhân ở trạng thái kích thích → phát photon γ năng lượng cao, số proton/neutron không đổi", { x: A.cx, y: A.y + A.h - 20 * k, size: 26, fill: L.text }));
      }
      show(label(ctx, p.mode === "alpha" ? "Phân rã alpha" : p.mode === "beta" ? "Phân rã beta trừ" : "Phát xạ gamma", { x: A.x + 20 * k, y: A.y + 30 * k, size: 34, align: "left", fill: L.accent }));
    } else if (p.mode === "fusion") {
      // Masses (u): D 2.014102, T 3.016049, He-4 4.002603, n 1.008665 → Δm·931.494 MeV.
      const dm = 2.014102 + 3.016049 - 4.002603 - 1.008665;
      const E = dm * 931.494;
      const cx = A.cx, cy = A.cy, r = Math.min(A.w, A.h) * 0.04;
      const tF = ctx.cue(0, 3);
      const approach = () => clamp(clock() / tF, 0, 1);
      const after = () => clamp((clock() - tF) / 2.2, 0, 1);
      const D2 = cluster(1, 1, r * 0.5, 2), T3 = cluster(1, 2, r * 0.6, 4), He = cluster(2, 2, r * 0.6, 6);
      const gap = A.w * 0.32;
      nodes.push(
        <Node>
          <Node x={() => cx - gap * (1 - approach() ** 2)} y={cy} opacity={() => (clock() < tF ? 1 : 0)}>
            {D2.map(([x, y, c]) => ball(x, y, r * 0.55, c))}
            <Txt text="D (²H)" y={-r * 2.2} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
          </Node>
          <Node x={() => cx + gap * (1 - approach() ** 2)} y={cy} opacity={() => (clock() < tF ? 1 : 0)}>
            {T3.map(([x, y, c]) => ball(x, y, r * 0.55, c))}
            <Txt text="T (³H)" y={-r * 2.2} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
          </Node>
          <Node x={() => cx - after() * gap * 0.35} y={() => cy - after() * A.h * 0.12} opacity={() => (clock() >= tF ? 1 : 0)}>
            {He.map(([x, y, c]) => ball(x, y, r * 0.55, c))}
            <Txt text="⁴He (3,5 MeV)" y={-r * 2.4} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
          </Node>
          <Node x={() => cx + after() ** 0.6 * gap * 1.3} y={() => cy + after() * A.h * 0.2} opacity={() => (clock() >= tF ? 1 : 0)}>
            {ball(0, 0, r * 0.6, NEUTRON)}
            <Txt text="n (14,1 MeV)" y={r * 1.8} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
          </Node>
          <Draw
            paint={(g) => {
              const d = clock() - tF;
              if (d < 0 || d > 1.5) return;
              g.globalCompositeOperation = "lighter";
              const R = r * (2 + d * 14);
              const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
              gr.addColorStop(0, `rgba(255,255,230,${1 - d / 1.5})`);
              gr.addColorStop(1, "rgba(255,180,80,0)");
              g.fillStyle = gr;
              g.beginPath();
              g.arc(cx, cy, R, 0, TAU);
              g.fill();
            }}
          />
          {/* Coulomb barrier note while approaching. */}
          <Txt text="lực đẩy tĩnh điện — cần ~100 triệu °C để vượt qua" x={cx} y={cy + r * 3.5} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} opacity={() => (clock() < tF ? clamp(clock() / 1, 0, 1) : 0)} />
        </Node>,
      );
      show(label(ctx, `²H + ³H → ⁴He + n · Δm = ${num(dm, 6)} u → E = Δm·c² = ${num(E, 1)} MeV`, { x: A.cx, y: A.y + A.h - 20 * k, size: 28, fill: L.text }));
      show(label(ctx, "Phản ứng nhiệt hạch — nguồn năng lượng của Mặt Trời và lò ITER", { x: A.x + 20 * k, y: A.y + 30 * k, size: 28, align: "left", fill: L.accent }));
    } else {
      // ---- collider: ring, two bunches circling opposite ways, collision, curved tracks.
      const cx = A.cx, cy = A.cy, Rr = Math.min(A.w, A.h) * 0.4;
      const tC = ctx.cue(0, 3);
      const ang = () => Math.min(clock(), tC) * 2.2 * st.speed;
      const ip: XY = [cx, cy + Rr]; // interaction point at the bottom
      const bunch = (sgn: number): XY => {
        const a = Math.PI / 2 + sgn * (ang() - 2.2 * st.speed * tC);
        return [cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr];
      };
      // Tracks: helices projected — circles of radius ∝ momentum, sense by charge.
      const rr = rng(L.seed + 3);
      const tracks = Array.from({ length: 22 }, () => ({ a: rr() * TAU, pT: 0.25 + rr() * 1.6, q: rr() < 0.15 ? 0 : rr() < 0.5 ? 1 : -1, c: ["#FFE66D", "#55C7FF", "#FF77E8", "#7CFF6B", "#FFB000"][Math.floor(rr() * 5)] }));
      nodes.push(
        <Node>
          <Circle x={cx} y={cy} size={Rr * 2} stroke={alpha(L.ink, 0.35)} lineWidth={14 * k} />
          <Circle x={cx} y={cy} size={Rr * 2} stroke={alpha(L.primary, 0.6)} lineWidth={3 * k} />
          {/* Detector: concentric layers at the interaction point. */}
          <Draw
            paint={(g) => {
              const lay = [[0.1, "rgba(85,199,255,0.25)"], [0.2, "rgba(0,214,143,0.2)"], [0.3, "rgba(255,176,0,0.18)"], [0.38, "rgba(192,132,252,0.18)"]] as [number, string][];
              for (const [f, c] of lay.reverse()) {
                g.strokeStyle = c;
                g.lineWidth = 16 * k;
                g.beginPath();
                g.arc(ip[0], ip[1], Rr * f, 0, TAU);
                g.stroke();
              }
              const t = clock();
              // Bunches.
              if (t < tC + 0.05)
                for (const [s, col] of [[1, L.secondary], [-1, L.highlight]] as [number, string][]) {
                  const [x, y] = bunch(s);
                  const gr = g.createRadialGradient(x, y, 0, x, y, 26 * k);
                  gr.addColorStop(0, col);
                  gr.addColorStop(1, "rgba(0,0,0,0)");
                  g.fillStyle = gr;
                  g.beginPath();
                  g.arc(x, y, 26 * k, 0, TAU);
                  g.fill();
                }
              const d = t - tC;
              if (d < 0) return;
              // Flash and tracks growing outward along their arcs (B field into the page).
              g.globalCompositeOperation = "lighter";
              const fl = Math.max(0, 1 - d * 2);
              const gr = g.createRadialGradient(ip[0], ip[1], 0, ip[0], ip[1], 120 * k);
              gr.addColorStop(0, `rgba(255,255,255,${fl})`);
              gr.addColorStop(1, "rgba(255,255,255,0)");
              g.fillStyle = gr;
              g.beginPath();
              g.arc(ip[0], ip[1], 120 * k, 0, TAU);
              g.fill();
              g.globalCompositeOperation = "source-over";
              const len = clamp(d / 1.6, 0, 1) * Rr * 0.4;
              for (const tr of tracks) {
                g.strokeStyle = tr.c;
                g.lineWidth = 2.5 * k;
                g.beginPath();
                const rc = tr.pT * Rr * 0.25; // curvature radius ∝ momentum
                let x = ip[0], y = ip[1], a = tr.a;
                g.moveTo(x, y);
                const n = 40;
                for (let i = 0; i < n; i++) {
                  const ds = len / n;
                  if (tr.q !== 0) a += (tr.q * ds) / rc;
                  x += Math.cos(a) * ds;
                  y += Math.sin(a) * ds;
                  if (Math.hypot(x - ip[0], y - ip[1]) > Rr * 0.4) break;
                  g.lineTo(x, y);
                }
                g.stroke();
              }
            }}
          />
          <Txt text="vòng gia tốc" x={cx} y={cy - Rr - 30 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.dim} />
        </Node>,
      );
      show(label(ctx, "Hạt mang điện cong trong từ trường của máy dò (cong nhiều = động lượng nhỏ), hạt trung hoà đi thẳng", { x: A.cx, y: A.y + 20 * k, size: 24, fill: L.text }));
      show(label(ctx, "Năng lượng va chạm biến thành hạt mới: E = mc²", { x: A.x + 20 * k, y: A.y + A.h - 20 * k, size: 28, align: "left", fill: L.accent }));
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
      yield* until(ctx.cue(i + 1, steps.length + 2));
      yield steps[i]();
    }
    void easeInOutCubic;
    void Rect;
  },
});
