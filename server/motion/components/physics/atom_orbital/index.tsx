// The hydrogen atom from its exact solutions. cloud: an orbital as an electron cloud — thousands of
// points drawn at random from |ψ|² = |R_nl(r)·Y_lm|² (rejection sampling), coloured by the sign of
// ψ (the phase), turning in 3D with perspective; morphs through a list of orbitals. slice: |ψ|² on a
// plane through the nucleus, with the radial and angular nodes visible. levels: the energy levels
// E_n = −13.6 eV/n²; the electron drops (emits) or jumps up (absorbs) with photons of the right
// wavelength 1/λ = R(1/n₁² − 1/n₂²) — Balmer lines lighting up on a spectrum strip.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "cloud" | "slice" | "levels";
  orbitals: string[];
  points: number;
  transitions: string[];
  labels: boolean;
}

const TAU = Math.PI * 2;
type Orb = { n: number; l: number; name: string; psi: (x: number, y: number, z: number) => number; box: number; nodes: string };
const S2 = Math.SQRT2;
const ORBS: Record<string, Orb> = {
  "1s": { n: 1, l: 0, name: "1s", box: 6, nodes: "0 nút", psi: (x, y, z) => 2 * Math.exp(-Math.hypot(x, y, z)) },
  "2s": { n: 2, l: 0, name: "2s", box: 16, nodes: "1 nút cầu (r = 2a₀)", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (1 / (2 * S2)) * (2 - r) * Math.exp(-r / 2); } },
  "2p_z": { n: 2, l: 1, name: "2p_z", box: 16, nodes: "1 mặt phẳng nút (xy)", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (1 / (2 * Math.sqrt(6))) * z * Math.exp(-r / 2); } },
  "2p_x": { n: 2, l: 1, name: "2p_x", box: 16, nodes: "1 mặt phẳng nút (yz)", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (1 / (2 * Math.sqrt(6))) * x * Math.exp(-r / 2); } },
  "3s": { n: 3, l: 0, name: "3s", box: 30, nodes: "2 nút cầu", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (2 / (81 * Math.sqrt(3))) * (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3); } },
  "3p_z": { n: 3, l: 1, name: "3p_z", box: 30, nodes: "1 nút cầu + 1 mặt phẳng nút", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (4 / (81 * Math.sqrt(6))) * (6 - r) * z * Math.exp(-r / 3); } },
  "3d_z2": { n: 3, l: 2, name: "3d_z²", box: 30, nodes: "2 mặt nón nút", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (1 / (81 * Math.sqrt(6))) * (3 * z * z - r * r) * Math.exp(-r / 3); } },
  "3d_xz": { n: 3, l: 2, name: "3d_xz", box: 30, nodes: "2 mặt phẳng nút", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (Math.SQRT2 / (81 * Math.sqrt(Math.PI))) * x * z * Math.exp(-r / 3); } },
  "3d_x2y2": { n: 3, l: 2, name: "3d_x²−y²", box: 30, nodes: "2 mặt phẳng nút", psi: (x, y, z) => { const r = Math.hypot(x, y, z); return (1 / (81 * Math.sqrt(2 * Math.PI))) * (x * x - y * y) * Math.exp(-r / 3); } },
};
export const ORB_IDS = Object.keys(ORBS);

// Wavelength (nm) → colour (visible) or a violet-grey for UV/IR.
function lineColor(nm: number) {
  if (nm < 380 || nm > 750) return "#8C7CC8";
  let r = 0, g = 0, b = 0;
  if (nm < 440) (r = (440 - nm) / 60), (b = 1);
  else if (nm < 490) (g = (nm - 440) / 50), (b = 1);
  else if (nm < 510) (g = 1), (b = (510 - nm) / 20);
  else if (nm < 580) (r = (nm - 510) / 70), (g = 1);
  else if (nm < 645) (r = 1), (g = (645 - nm) / 65);
  else r = 1;
  return `rgb(${Math.round(255 * r)}, ${Math.round(255 * g)}, ${Math.round(255 * b)})`;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "quantum");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const orbs = (p.orbitals.length ? p.orbitals : ["2p_z"]).map((id) => ORBS[id] ?? ORBS["1s"]);
    const POS = "#FFB000", NEG = "#3FA9FF";
    let levelRun: (() => ThreadGenerator) | null = null;
    const cx = A.cx, cy = A.cy;
    const R = Math.min(A.w, A.h) * 0.42;

    // Index of the orbital shown at time t, and the cross-fade.
    const seg = () => {
      const n = orbs.length, u = clamp(clock() / D, 0, 0.9999) * n;
      const i = Math.floor(u), f = u - i;
      return { i, fade: n > 1 ? clamp(Math.min(f / 0.12, (1 - f) / 0.12), 0, 1) : 1 };
    };

    if (p.mode === "cloud") {
      // Sample every orbital once (seeded).
      const rnd = rng(L.seed + 41);
      const clouds = orbs.map((o) => {
        let mx = 0;
        for (let i = 0; i < 6000; i++) {
          const x = (rnd() * 2 - 1) * o.box, y = (rnd() * 2 - 1) * o.box, z = (rnd() * 2 - 1) * o.box;
          mx = Math.max(mx, o.psi(x, y, z) ** 2);
        }
        const pts: number[] = [];
        const want = Math.round(p.points * (0.4 + 0.6 * q));
        let tries = 0;
        while (pts.length / 4 < want && tries < 4e6) {
          tries++;
          const x = (rnd() * 2 - 1) * o.box, y = (rnd() * 2 - 1) * o.box, z = (rnd() * 2 - 1) * o.box;
          const v = o.psi(x, y, z);
          if ((v * v) / (mx * 1.1) > rnd()) pts.push(x / o.box, y / o.box, z / o.box, Math.sign(v));
        }
        return Float32Array.from(pts);
      });
      const paint = (g: CanvasRenderingContext2D) => {
        const { i, fade } = seg();
        const pts = clouds[i];
        const t = clock();
        const a = t * 0.35 * st.speed, tilt = 0.35;
        const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), stt = Math.sin(tilt);
        g.globalCompositeOperation = "lighter";
        for (let j = 0; j < pts.length; j += 4) {
          // Rotate about the vertical (z up in physics → screen y), then tilt toward the viewer.
          const x = pts[j], y = pts[j + 1], z = pts[j + 2];
          const x1 = x * ca + y * sa, y1 = -x * sa + y * ca;
          const zz = z * ct - y1 * stt, yy = z * stt + y1 * ct;
          const pz = 3 / (3 + yy);
          const sx = cx + x1 * R * pz, sy = cy - zz * R * pz;
          g.fillStyle = pts[j + 3] > 0 ? POS : NEG;
          g.globalAlpha = (0.22 + 0.35 * pz - 0.2) * fade;
          g.fillRect(sx - 1.6 * k * pz, sy - 1.6 * k * pz, 3.2 * k * pz, 3.2 * k * pz);
        }
        g.globalAlpha = 1;
        // Nucleus.
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 14 * k);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(1, "rgba(255,80,120,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, 14 * k, 0, TAU);
        g.fill();
      };
      nodes.push(<Draw paint={paint} />);
    } else if (p.mode === "slice") {
      // |ψ|² on the xz plane (sign tinted), one raster per orbital, cross-faded.
      orbs.forEach((o, idx) => {
        let mx = 0;
        const rr = rng(idx + 5);
        for (let i = 0; i < 4000; i++) {
          const x = (rr() * 2 - 1) * o.box, z = (rr() * 2 - 1) * o.box;
          mx = Math.max(mx, o.psi(x, 0, z) ** 2);
        }
        const paint = (data: Uint8ClampedArray, cols: number, rows: number) => {
          for (let j = 0; j < rows; j++)
            for (let i = 0; i < cols; i++) {
              const x = (((i + 0.5) / cols) * 2 - 1) * o.box, z = -(((j + 0.5) / rows) * 2 - 1) * o.box;
              const v = o.psi(x, 0, z);
              // Gamma to show the faint outer lobes too.
              const d = Math.pow(clamp((v * v) / mx, 0, 1), 0.45);
              const [r, g, b] = v >= 0 ? [255, 176, 0] : [63, 169, 255];
              const o4 = (j * cols + i) * 4;
              data[o4] = r;
              data[o4 + 1] = g;
              data[o4 + 2] = b;
              data[o4 + 3] = d * 255;
            }
        };
        nodes.push(
          <Node opacity={() => (seg().i === idx ? seg().fade : 0)}>
            <Raster x={cx} y={cy} w={R * 2} h={R * 2} res={Math.round(360 * (0.6 + 0.4 * q))} once paint={paint} />
          </Node>,
        );
      });
      nodes.push(
        <Node>
          <Line points={[[cx - R, cy], [cx + R, cy]]} stroke={alpha(L.ink, 0.2)} lineWidth={1.5 * k} />
          <Line points={[[cx, cy - R], [cx, cy + R]]} stroke={alpha(L.ink, 0.2)} lineWidth={1.5 * k} />
          <Txt text="z" x={cx + 14 * k} y={cy - R + 10 * k} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.dim} />
          <Txt text="x" x={cx + R - 10 * k} y={cy + 20 * k} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.dim} />
        </Node>,
      );
    }

    if (p.mode === "cloud" || p.mode === "slice") {
      // Orbital name, quantum numbers, nodes, energy.
      const info = (
        <Node>
          <Txt text={() => orbs[seg().i].name} x={A.x + 20 * k} y={A.y + 50 * k} offsetX={-1} fontFamily={FONT} fontWeight={900} fontSize={64 * k} fill={L.text} opacity={() => seg().fade} />
          <Txt text={() => `n = ${orbs[seg().i].n}, ℓ = ${orbs[seg().i].l} · E = −13,6/${orbs[seg().i].n}² = ${num(-13.6 / orbs[seg().i].n ** 2, 2)} eV`} x={A.x + 20 * k} y={A.y + 104 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={25 * k} fill={L.dim} opacity={() => seg().fade} />
          <Txt text={() => orbs[seg().i].nodes} x={A.x + 20 * k} y={A.y + 140 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={25 * k} fill={L.dim} opacity={() => seg().fade} />
        </Node>
      );
      nodes.push(info);
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Rect x={A.x + A.w - 200 * k} y={A.y + A.h - 70 * k} width={20 * k} height={20 * k} radius={10 * k} fill={POS} />
          <Txt text="ψ > 0" x={A.x + A.w - 180 * k} y={A.y + A.h - 70 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.text} />
          <Rect x={A.x + A.w - 200 * k} y={A.y + A.h - 36 * k} width={20 * k} height={20 * k} radius={10 * k} fill={NEG} />
          <Txt text="ψ < 0" x={A.x + A.w - 180 * k} y={A.y + A.h - 36 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.text} />
          {label(ctx, p.mode === "cloud" ? "mật độ điểm ∝ |ψ|² — xác suất tìm thấy electron" : "lát cắt mặt phẳng xz của |ψ|²", { x: A.x + 20 * k, y: A.y + A.h - 40 * k, size: 23, align: "left", fill: L.dim })}
        </Node>,
      );
    } else {
      // ---- energy levels and transitions.
      const levels = [1, 2, 3, 4, 5, 6];
      const Ry = 1.0973731568e7;
      const LX = A.x + A.w * (A.wide ? 0.08 : 0.06), LW = A.w * (A.wide ? 0.42 : 0.88);
      const LT = A.y + A.h * 0.08, LH = A.h * (A.wide ? 0.78 : 0.5);
      // Higher energy (less negative) is higher on screen: y = top + LH/n², n = ∞ at the top.
      const yE = (n: number) => LT + LH * (1 / (n * n));
      nodes.push(
        <Node>
          {levels.map((n) => (
            <Node>
              <Line points={[[LX, yE(n)], [LX + LW, yE(n)]]} stroke={alpha(L.ink, n === 1 ? 0.8 : 0.5)} lineWidth={(n === 1 ? 4 : 2.5) * k} />
              <Txt text={`n = ${n}`} x={LX - 12 * k} y={yE(n)} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.text} />
              <Txt text={`${num(-13.6 / (n * n), 2)} eV`} x={LX + LW + 12 * k} y={yE(n)} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
            </Node>
          ))}
          <Line points={[[LX, LT], [LX + LW, LT]]} stroke={alpha(L.ink, 0.3)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
          <Txt text="n = ∞ (ion hoá, 0 eV)" x={LX + LW / 2} y={LT - 18 * k} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
        </Node>,
      );
      // Spectrum strip (visible range), lines light up when emitted.
      const SX = A.wide ? A.x + A.w * 0.6 : A.x + A.w * 0.06, SY = A.wide ? A.cy : A.y + A.h * 0.75, SW = A.wide ? A.w * 0.36 : A.w * 0.88, SH = 70 * k;
      const xOfNm = (nm: number) => SX + ((nm - 380) / (750 - 380)) * SW;
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              const gr = g.createLinearGradient(SX, 0, SX + SW, 0);
              for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, lineColor(380 + (370 * i) / 10));
              g.globalAlpha = 0.18;
              g.fillStyle = gr;
              g.fillRect(SX, SY - SH / 2, SW, SH);
              g.globalAlpha = 1;
              g.strokeStyle = alpha(L.ink, 0.4);
              g.strokeRect(SX, SY - SH / 2, SW, SH);
            }}
          />
          <Txt text="quang phổ vạch của hydro (vùng nhìn thấy)" x={SX} y={SY - SH / 2 - 22 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Txt text="380 nm" x={SX} y={SY + SH / 2 + 20 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={18 * k} fill={L.dim} />
          <Txt text="750 nm" x={SX + SW} y={SY + SH / 2 + 20 * k} offsetX={1} fontFamily={FONT} fontWeight={500} fontSize={18 * k} fill={L.dim} />
        </Node>,
      );
      // Transitions "a-b": a → b. a > b emits; a < b absorbs.
      const trs = (p.transitions.length ? p.transitions : ["3-2", "4-2", "5-2", "2-1"]).map((s) => s.split("-").map(Number) as [number, number]).filter(([a, b]) => a >= 1 && b >= 1 && a !== b && a <= 6 && b <= 6);
      const nT = trs.length;
      const elecN = createSignal(trs.length ? trs[0][0] : 2);
      const ex = LX + LW * 0.25;
      const eY = createSignal(yE(elecN()));
      nodes.push(<Rect x={ex} y={eY} width={26 * k} height={26 * k} radius={13 * k} fill={L.secondary} stroke="#FFFFFF" lineWidth={3 * k} {...L.glow(L.secondary, 16 * k)} />);
      const photons: { t0: Signal; up: boolean; nm: number; x: number; y0: number; y1: number }[] = [];
      type Signal = ReturnType<typeof createSignal<number>>;
      trs.forEach(([a, b], i) => {
        const nm = 1e9 / (Ry * Math.abs(1 / (b * b) - 1 / (a * a)));
        const col = lineColor(nm);
        const s = createSignal(0);
        shows.push(s);
        const x = LX + LW * (0.42 + 0.14 * i);
        nodes.push(
          <Node opacity={s}>
            <Line points={[[x, yE(a)], [x, yE(b)]]} stroke={col} lineWidth={4 * k} endArrow arrowSize={14 * k} {...L.glow(col, 10 * k)} />
            <Txt text={`${num(nm, 0)} nm${nm < 380 ? " (tử ngoại)" : nm > 750 ? " (hồng ngoại)" : ""}`} x={x + 10 * k} y={(yE(a) + yE(b)) / 2} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={20 * k} fill={col} />
            {nm >= 380 && nm <= 750 ? <Rect x={xOfNm(nm)} y={SY} width={6 * k} height={SH} fill={col} {...L.glow(col, 16 * k)} /> : null}
          </Node>,
        );
        photons.push({ t0: createSignal(-1), up: a < b, nm, x, y0: yE(a), y1: yE(b) });
      });
      // Photon wiggles: leaving the atom (emission) or arriving (absorption).
      nodes.push(
        <Draw
          paint={(g) => {
            for (const ph of photons) {
              const t = ph.t0();
              if (t < 0 || t > 1.4) continue;
              const col = lineColor(ph.nm);
              const u = t / 1.4;
              const startX = ph.up ? SX + SW : ex, endX = ph.up ? ex : SX + SW * 0.5;
              const hx = startX + (endX - startX) * u, hy = (ph.y0 + ph.y1) / 2;
              const wl = clamp(ph.nm / 25, 8, 30) * k;
              g.strokeStyle = col;
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let j = 0; j <= 60; j++) {
                const x = hx - (j / 60) * 120 * k * Math.sign(endX - startX);
                const y = hy + Math.sin((x / wl) * TAU) * 12 * k * Math.exp(-(((j - 30) / 22) ** 2));
                if (j) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }
          }}
        />,
      );
      levelRun = function* (): ThreadGenerator {
        for (let i = 0; i < nT; i++) {
          const [a, b] = trs[i];
          yield* until(ctx.cue(i, nT + 1));
          if (Math.abs(eY() - yE(a)) > 1) yield* eY(yE(a), 0.4, easeInOutCubic);
          const ph = photons[i];
          if (ph.up) {
            yield (function* () {
              ph.t0(0);
              yield* ph.t0(1.4, 1.4, linear);
            })();
            yield* until(ctx.cue(i, nT + 1) + 1.2);
            yield* eY(yE(b), 0.35, easeInOutCubic);
            yield shows[i](1, 0.4);
          } else {
            yield* eY(yE(b), 0.35, easeInOutCubic);
            yield (function* () {
              ph.t0(0);
              yield* ph.t0(1.4, 1.4, linear);
            })();
            yield shows[i](1, 0.4);
          }
          elecN(b);
        }
      };
    }

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
    yield* world().opacity(1, 0.8, easeOutCubic);
    if (levelRun) {
      yield* levelRun();
      return;
    }
    for (let i = 0; i < shows.length; i++) {
      yield* until(ctx.cue(i, shows.length + 1));
      yield shows[i](1, 0.5);
    }
  },
});
