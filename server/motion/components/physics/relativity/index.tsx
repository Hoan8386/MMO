// Special relativity with exact Lorentz factors γ = 1/√(1 − β²). time_dilation: two light clocks —
// one at rest, one moving at βc; seen from the ground the moving photon runs a longer zigzag, so its
// ticks come γ times slower (tick counters side by side). length_contraction: a ship's measured length
// L₀/γ shrinks as its speed ramps up, with the γ(β) curve. twin_paradox: a Minkowski diagram — the
// stay-at-home twin's worldline, the traveller out and back at βc, tick marks every year of each
// one's proper time, and their ages at the reunion. light_cone: the light cone, worldlines of
// particles (all inside it), and the axes of a moving observer tilting toward the light line as β grows.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "time_dilation" | "length_contraction" | "twin_paradox" | "light_cone";
  beta: number;
  years: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];
const gamma = (b: number) => 1 / Math.sqrt(1 - b * b);

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "relativity");
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
    const b = p.beta, G = gamma(b);
    const LIGHT = "#FFE66D";

    if (p.mode === "time_dilation") {
      // Clock height H px; a rest tick takes T0 video seconds.
      const H = Math.min(A.h * 0.42, 300 * k), T0 = 0.9 / st.speed;
      const restX = A.x + A.w * 0.18;
      const laneY = A.y + A.h * 0.18;
      const vpx = (A.w * 0.55) / D; // screen speed of the moving clock (not to scale with c)
      const movX0 = A.x + A.w * 0.32;
      const movX = () => movX0 + vpx * clock();
      // Photon height in a clock: triangle wave with period 2·tick (up and down).
      const phase = (t: number, tick: number) => {
        const u = (t / tick) % 2;
        return u < 1 ? u : 2 - u;
      };
      const clockBox = (x: () => number, tick: number, color: string, name: string) => (
        <Node>
          <Rect x={x} y={laneY} width={110 * k} height={10 * k} fill="#DCE6F2" />
          <Rect x={x} y={laneY + H} width={110 * k} height={10 * k} fill="#DCE6F2" />
          <Rect x={x} y={() => laneY + H - phase(clock(), tick) * H} size={18 * k} radius={9 * k} fill={LIGHT} {...L.glow(LIGHT, 16 * k)} />
          <Txt text={name} x={x} y={laneY + H + 46 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={color} />
          <Txt text={() => `${Math.floor(clock() / (2 * tick))} nhịp`} x={x} y={laneY + H + 84 * k} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={color} />
        </Node>
      );
      nodes.push(
        <Node>
          {clockBox(() => restX, T0, L.secondary, "đồng hồ đứng yên")}
          {clockBox(movX, T0 * G, L.highlight, `đồng hồ chạy với v = ${num(b, 2)}c`)}
          {/* The moving photon's zigzag as seen from the ground. */}
          <Draw
            paint={(g) => {
              const tick = T0 * G, t = clock();
              g.strokeStyle = alpha(LIGHT, 0.55);
              g.lineWidth = 2.5 * k;
              g.beginPath();
              for (let i = 0; i <= 200; i++) {
                const tt = (i / 200) * t;
                const x = movX0 + vpx * tt, y = laneY + H - phase(tt, tick) * H;
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }}
          />
        </Node>,
      );
      show(label(ctx, `γ = 1/√(1 − v²/c²) = ${num(G, 2)} → đồng hồ chuyển động chạy chậm hơn ${num(G, 2)} lần`, { x: A.cx, y: A.y + A.h - 20 * k, size: 30, fill: L.text }));
      show(label(ctx, "Ánh sáng đi đường chéo dài hơn với cùng tốc độ c → mỗi nhịp lâu hơn", { x: A.cx, y: A.y + 20 * k, size: 25, fill: L.dim }));
    } else if (p.mode === "length_contraction") {
      // β ramps from 0 to p.beta; the ship's measured length is L₀/γ(β).
      const bt = () => p.beta * smooth(clamp((clock() - 1) / (D - 3), 0, 1));
      const L0 = A.w * (A.wide ? 0.5 : 0.75);
      const sx = A.x + A.w * 0.06, sy = A.y + A.h * (A.wide ? 0.3 : 0.25);
      nodes.push(
        <Node>
          {/* Ship drawn into a box scaled along x. */}
          <Node x={sx} y={sy} scaleX={() => 1 / gamma(bt())}>
            <Draw
              paint={(g) => {
                const w = L0, h = 70 * k;
                const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
                gr.addColorStop(0, "#F4F6FA");
                gr.addColorStop(1, "#8D97A6");
                g.fillStyle = gr;
                g.beginPath();
                g.moveTo(0, -h / 2);
                g.lineTo(w * 0.82, -h / 2);
                g.quadraticCurveTo(w, 0, w * 0.82, h / 2);
                g.lineTo(0, h / 2);
                g.closePath();
                g.fill();
                g.fillStyle = L.secondary;
                for (let i = 0; i < 6; i++) {
                  g.beginPath();
                  g.arc(w * (0.15 + i * 0.11), 0, 9 * k, 0, TAU);
                  g.fill();
                }
                g.fillStyle = L.highlight;
                g.beginPath();
                g.moveTo(0, -h / 2 + 8 * k);
                g.lineTo(-60 * k, 0);
                g.lineTo(0, h / 2 - 8 * k);
                g.fill();
              }}
            />
          </Node>
          {/* Rulers: proper length and measured length. */}
          <Line points={[[sx, sy + 90 * k], [sx + L0, sy + 90 * k]]} stroke={alpha(L.ink, 0.35)} lineWidth={3 * k} lineDash={[10 * k, 8 * k]} />
          <Txt text="L₀ (đo trên tàu)" x={sx + L0 + 12 * k} y={sy + 90 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} />
          <Line points={() => [[sx, sy + 130 * k], [sx + L0 / gamma(bt()), sy + 130 * k]]} stroke={L.highlight} lineWidth={5 * k} />
          <Txt text={() => `L = L₀/γ = ${num(100 / gamma(bt()), 0)} % L₀`} x={() => sx + L0 / gamma(bt()) + 12 * k} y={sy + 130 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.highlight} />
          <Txt text={() => `v = ${num(bt(), 2)}c · γ = ${num(gamma(bt()), 2)}`} x={sx} y={sy - 80 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={L.text} />
        </Node>,
      );
      // γ(β) curve.
      const gx = A.x + A.w * (A.wide ? 0.62 : 0.1), gy = A.y + A.h * (A.wide ? 0.5 : 0.55), gw = A.w * (A.wide ? 0.34 : 0.8), gh = A.h * (A.wide ? 0.42 : 0.38);
      const yG = (gg: number) => gy + gh - ((Math.min(gg, 7) - 1) / 6) * gh;
      show(
        <Node>
          <Line points={[[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Line points={Array.from({ length: 200 }, (_, i): XY => [gx + (i / 200) * 0.99 * gw, yG(gamma((i / 200) * 0.99))])} stroke={L.secondary} lineWidth={3 * k} />
          <Rect position={() => [gx + bt() * gw, yG(gamma(bt()))]} size={16 * k} radius={8 * k} fill={L.highlight} />
          <Txt text="γ" x={gx + 12 * k} y={gy} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.dim} />
          <Txt text="v/c → 1" x={gx + gw} y={gy + gh + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={21 * k} fill={L.dim} />
        </Node>,
      );
      show(label(ctx, "Chỉ chiều dọc theo chuyển động bị co lại; người trên tàu không thấy gì khác", { x: A.cx, y: A.y + A.h - 20 * k, size: 25, fill: L.dim }));
    } else {
      // ---- Minkowski diagram: x horizontal (light-years), ct vertical (years), 45° light lines.
      const Y = p.years;
      const dw = Math.min(A.w * (A.wide ? 0.55 : 0.9), A.h * 0.9), dh = dw;
      const ox = A.x + (A.wide ? A.w * 0.08 : (A.w - dw) / 2) + dw * (p.mode === "light_cone" ? 0.5 : 0.15), oy = A.y + A.h * 0.94;
      const s = dh / (Y * 1.05); // px per year
      const P = (x: number, t: number): XY => [ox + x * s, oy - t * s];
      nodes.push(
        <Node>
          <Line points={[P(p.mode === "light_cone" ? -Y * 0.55 : -0.3, 0), P(Y * 0.75, 0)]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Line points={[P(0, 0), P(0, Y * 1.03)]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
          <Txt text="x (năm ánh sáng)" x={P(Y * 0.75, 0)[0]} y={oy + 26 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Txt text="ct (năm)" x={P(0, Y)[0] + 12 * k} y={P(0, Y)[1]} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
        </Node>,
      );
      const u = () => clamp((clock() - 1) / (D - 2.5), 0, 1); // fraction of the coordinate time shown
      if (p.mode === "twin_paradox") {
        // Traveller: out to x = βY/2 at time Y/2, back at time Y. Proper time Y/γ.
        const turnX = (b * Y) / 2;
        const trav = (t: number): number => (t <= Y / 2 ? b * t : turnX - b * (t - Y / 2));
        nodes.push(
          <Node>
            <Line points={[P(0, 0), P(Y * 0.55, Y * 0.55)]} stroke={alpha(LIGHT, 0.4)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
            <Line points={() => [P(0, 0), P(0, Y * u())]} stroke={L.secondary} lineWidth={L.lw(5 * k)} {...L.glow(L.secondary, 10 * k)} />
            <Line points={() => Array.from({ length: 81 }, (_, i): XY => P(trav((i / 80) * Y * u()), (i / 80) * Y * u()))} stroke={L.highlight} lineWidth={L.lw(5 * k)} {...L.glow(L.highlight, 10 * k)} />
            <Draw
              paint={(g) => {
                // Year ticks: every coordinate year on Earth's line; every proper year on the traveller's.
                const now = Y * u();
                g.fillStyle = L.secondary;
                for (let y = 1; y <= now + 1e-6; y++) {
                  const [x, yy] = P(0, y);
                  g.fillRect(x - 10 * k, yy - 2 * k, 20 * k, 4 * k);
                }
                g.fillStyle = L.highlight;
                for (let tau = 1; tau * G <= now + 1e-6; tau++) {
                  const t = tau * G;
                  const [x, yy] = P(trav(t), t);
                  g.beginPath();
                  g.arc(x, yy, 6 * k, 0, TAU);
                  g.fill();
                }
              }}
            />
          </Node>,
        );
        const lx = A.wide ? A.x + A.w * 0.68 : A.x + 20 * k, ly = A.wide ? A.y + A.h * 0.2 : A.y + 30 * k;
        nodes.push(
          <Node>
            <Txt text={() => `Người ở nhà: ${num(Y * u(), 1)} năm`} x={lx} y={ly} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.secondary} />
            <Txt text={() => `Người du hành: ${num((Y * u()) / G, 1)} năm`} x={lx} y={ly + 50 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.highlight} />
            <Txt text={`v = ${num(b, 2)}c · γ = ${num(G, 2)}`} x={lx} y={ly + 100 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={L.dim} />
          </Node>,
        );
        show(label(ctx, "Người du hành đổi hệ quy chiếu khi quay về → không đối xứng: trở về trẻ hơn", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: L.text }));
      } else {
        // Light cone and the axes of an observer moving at β (ct' axis slope 1/β, x' axis slope β).
        const bt = () => p.beta * smooth(clamp((clock() - 2) / (D - 4), 0, 1));
        nodes.push(
          <Node>
            <Line points={[P(-Y * 0.5, Y * 0.5 * 1.9), P(0, 0), P(Y * 0.5, Y * 0.5 * 1.9)]} stroke={LIGHT} lineWidth={3 * k} />
            <Draw
              paint={(g) => {
                const [x0, y0] = P(0, 0);
                g.fillStyle = alpha(LIGHT, 0.08);
                g.beginPath();
                g.moveTo(x0, y0);
                g.lineTo(...P(-Y * 0.95, Y * 0.95));
                g.lineTo(...P(Y * 0.95, Y * 0.95));
                g.closePath();
                g.fill();
              }}
            />
            {/* Worldlines of particles at rest, at 0.5c and of light. */}
            <Line points={[P(0, 0), P(Y * 0.25, Y)]} stroke={L.secondary} lineWidth={3 * k} end={() => u()} />
            <Line points={[P(0, 0), P(-Y * 0.5, Y)]} stroke={L.secondary} lineWidth={3 * k} end={() => u()} />
            <Line points={() => [P(0, 0), P(bt() * Y, Y)]} stroke={L.highlight} lineWidth={4 * k} />
            <Line points={() => [P(0, 0), P(Y * 0.7, bt() * Y * 0.7)]} stroke={L.highlight} lineWidth={4 * k} />
            <Txt text="ct'" x={() => P(bt() * Y, Y)[0] + 12 * k} y={() => P(bt() * Y, Y)[1]} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.highlight} />
            <Txt text="x'" x={() => P(Y * 0.7, bt() * Y * 0.7)[0] + 12 * k} y={() => P(Y * 0.7, bt() * Y * 0.7)[1]} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.highlight} />
            <Txt text={() => `quan sát viên chuyển động v = ${num(bt(), 2)}c: trục ct' và x' khép về đường ánh sáng`} x={A.cx} y={A.y + 20 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
          </Node>,
        );
        show(label(ctx, "Mọi vật có khối lượng đi bên trong nón ánh sáng — không gì vượt quá c", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: L.text }));
        show(
          <Node>
            <Txt text="tương lai" x={P(0, Y * 0.85)[0]} y={P(0, Y * 0.85)[1]} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={LIGHT} />
            <Txt text="vùng không thể liên hệ" x={P(-Y * 0.45, Y * 0.12)[0]} y={P(-Y * 0.45, Y * 0.12)[1]} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
          </Node>,
        );
      }
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
