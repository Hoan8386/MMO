// A nerve impulse. A neuron (branching dendrites, cell body, axon, axon terminals) carries action
// potentials from left to right: on a myelinated axon the impulse jumps from one node of Ranvier to the
// next (saltatory conduction), on a bare axon it creeps along. Under it, the membrane potential at one
// point traces the textbook spike: rest −70 mV → +40 mV (Na⁺ in) → −80 mV (K⁺ out) → rest. At the
// terminal, vesicles release neurotransmitter across the synaptic cleft.
import { Line, Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { callout } from "../../../shared/fx";
import { label, FONT } from "../../../shared/ui";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  myelinated: boolean;
  impulses: number;
  showGraph: boolean;
  showSynapse: boolean;
  labels: boolean;
}

// Membrane potential (mV) τ seconds after the impulse passes (shape of a real spike, time stretched).
function spike(tau0: number) {
  const tau = tau0 / 2; // stretched so the dip below rest is visible
  if (tau < 0) return -70;
  if (tau < 0.12) return -70 + 110 * smooth(tau / 0.12); // depolarisation to +40
  if (tau < 0.32) return 40 - 120 * smooth((tau - 0.12) / 0.2); // repolarisation to −80
  if (tau < 0.8) return -80 + 10 * smooth((tau - 0.32) / 0.48); // back to rest
  return -70;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "neuroscience");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const graphH = p.showGraph ? Math.min(A.h * 0.3, 260 * k) : 0;
    const NH = A.h - graphH - (p.showGraph ? 40 * k : 0); // neuron band
    const ny = A.y + NH / 2;
    const somaX = A.x + A.w * 0.2, somaR = Math.min(NH * 0.13, A.w * 0.05);
    const axX0 = somaX + somaR * 0.9, axX1 = A.x + A.w * (p.showSynapse ? 0.8 : 0.9);
    const nodes = 6;
    const nodeX = Array.from({ length: nodes + 1 }, (_, i) => axX0 + ((axX1 - axX0) * i) / nodes);
    const t = createSignal(0);
    const r = rng(9);
    // Dendrite tree (seeded recursive branches toward the left).
    const branches: [number, number, number, number, number][] = [];
    const grow = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      branches.push([x, y, x2, y2, w]);
      if (depth > 0) for (const s of [-1, 1]) grow(x2, y2, a + s * (0.35 + r() * 0.35), len * (0.62 + r() * 0.12), w * 0.65, depth - 1);
    };
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i - 2) * 0.42 + (r() - 0.5) * 0.2;
      grow(somaX + Math.cos(a) * somaR * 0.9, ny + Math.sin(a) * somaR * 0.9, a, somaR * 1.3, 7 * k, 3);
    }
    // Impulse timing: each impulse leaves the soma at start_i and takes `travel` seconds to the end.
    const travel = 1.6;
    const starts = Array.from({ length: p.impulses }, (_, i) => 1 + i * ((D - 1 - travel - 1) / Math.max(1, p.impulses)));
    // Position (0–1 along the axon) of impulse i at time s: jumps between nodes when myelinated.
    const front = (s: number, start: number) => {
      const u = (s - start) / travel;
      if (u < 0 || u > 1.05) return -1;
      if (!p.myelinated) return u;
      const seg = u * nodes, j = Math.floor(seg), f = seg - j;
      return (j + smooth(clamp((f - 0.55) / 0.3, 0, 1))) / nodes; // dwell at a node, then jump
    };
    const probe = 0.5; // recording point on the axon
    const vAt = (s: number) => {
      let v = -70;
      for (const st0 of starts) {
        // When does the impulse reach the probe?
        const reach = st0 + travel * (p.myelinated ? (Math.round(probe * nodes) + 0.85) / nodes : probe);
        v = Math.max(v, spike(s - reach));
      }
      return v;
    };

    const paint = (g: CanvasRenderingContext2D) => {
      const s = t();
      // Dendrites and soma.
      g.lineCap = "round";
      for (const [x1, y1, x2, y2, w] of branches) {
        g.strokeStyle = alpha(L.primary, 0.85);
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      const sg = g.createRadialGradient(somaX - somaR * 0.3, ny - somaR * 0.3, 0, somaX, ny, somaR);
      sg.addColorStop(0, mix(L.primary, "#FFFFFF", 0.4));
      sg.addColorStop(1, mix(L.primary, "#000000", 0.35));
      g.fillStyle = sg;
      g.beginPath();
      g.arc(somaX, ny, somaR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(L.secondary, "#000000", 0.2);
      g.beginPath();
      g.arc(somaX, ny, somaR * 0.38, 0, Math.PI * 2);
      g.fill();
      // Axon core and myelin sheaths with gaps (nodes of Ranvier).
      g.strokeStyle = alpha(L.primary, 0.9);
      g.lineWidth = 8 * k;
      g.beginPath();
      g.moveTo(axX0, ny);
      g.lineTo(axX1, ny);
      g.stroke();
      if (p.myelinated)
        for (let i = 0; i < nodes; i++) {
          const xa = nodeX[i] + 9 * k, xb = nodeX[i + 1] - 9 * k, h = 30 * k;
          const mg = g.createLinearGradient(0, ny - h / 2, 0, ny + h / 2);
          mg.addColorStop(0, mix(L.secondary, "#FFFFFF", 0.35));
          mg.addColorStop(1, mix(L.secondary, "#000000", 0.3));
          g.fillStyle = mg;
          g.beginPath();
          g.roundRect(xa, ny - h / 2, xb - xa, h, h / 2);
          g.fill();
        }
      // Terminals: a few branches ending in bulbs.
      const ends: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.38, len = somaR * 1.4;
        const ex = axX1 + Math.cos(a) * len, ey = ny + Math.sin(a) * len;
        ends.push([ex, ey]);
        g.strokeStyle = alpha(L.primary, 0.9);
        g.lineWidth = 5 * k;
        g.beginPath();
        g.moveTo(axX1, ny);
        g.lineTo(ex, ey);
        g.stroke();
        g.fillStyle = L.primary;
        g.beginPath();
        g.arc(ex, ey, 9 * k, 0, Math.PI * 2);
        g.fill();
      }
      // Impulses: glowing fronts (and a soft wake) along the axon; terminals flash on arrival.
      g.globalCompositeOperation = "lighter";
      for (const st0 of starts) {
        const u = front(s, st0);
        if (u < 0) continue;
        const x = axX0 + clamp(u, 0, 1) * (axX1 - axX0);
        const gl = g.createRadialGradient(x, ny, 0, x, ny, 46 * k);
        gl.addColorStop(0, alpha("#FFFFFF", 0.95));
        gl.addColorStop(0.3, alpha(L.highlight, 0.8));
        gl.addColorStop(1, alpha(L.highlight, 0));
        g.fillStyle = gl;
        g.beginPath();
        g.arc(x, ny, 46 * k, 0, Math.PI * 2);
        g.fill();
        if (u >= 1)
          for (const [ex, ey] of ends) {
            g.fillStyle = alpha(L.highlight, 0.7);
            g.beginPath();
            g.arc(ex, ey, 18 * k, 0, Math.PI * 2);
            g.fill();
          }
      }
      g.globalCompositeOperation = "source-over";
      // Synapse: neurotransmitter crossing the cleft to the next cell after each arrival.
      if (p.showSynapse) {
        const post = A.x + A.w * 0.8 + somaR * 2.2;
        g.strokeStyle = alpha(L.secondary, 0.9);
        g.lineWidth = 6 * k;
        g.beginPath();
        g.arc(post + somaR * 2.6, ny, somaR * 2.6, Math.PI * 0.72, Math.PI * 1.28);
        g.stroke();
        for (const st0 of starts) {
          const age = s - (st0 + travel);
          if (age < 0 || age > 1.4) continue;
          for (let i = 0; i < 18; i++) {
            const [ex, ey] = ends[i % 4];
            const u = clamp(age / 0.9, 0, 1);
            const x = ex + (post - ex) * u + Math.sin(i * 7) * 6 * k, y = ey + (ny - ey) * u * 0.5 + Math.cos(i * 5) * 10 * k;
            g.fillStyle = alpha(L.accent, 1 - clamp((age - 0.9) / 0.5, 0, 1));
            g.beginPath();
            g.arc(x, y, 4 * k, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      // Probe marker.
      if (p.showGraph) {
        const px = axX0 + probe * (axX1 - axX0);
        g.strokeStyle = alpha(L.accent, 0.8);
        g.lineWidth = 2 * k;
        g.setLineDash([6 * k, 6 * k]);
        g.beginPath();
        g.moveTo(px, ny + 24 * k);
        g.lineTo(px, A.y + NH + 10 * k);
        g.stroke();
        g.setLineDash([]);
      }
    };

    // Voltage trace at the probe.
    const G = { x: A.x + 90 * k, y: A.y + NH + 40 * k, w: A.w - 120 * k, h: graphH - 20 * k };
    const vy = (v: number) => G.y + G.h - ((v + 90) / 140) * G.h;
    const trace = (): [number, number][] => {
      const pts: [number, number][] = [];
      const now = t();
      for (let i = 0; i <= 300; i++) {
        const s = (i / 300) * D;
        if (s > now) break;
        pts.push([G.x + (s / D) * G.w, vy(vAt(s))]);
      }
      return pts.length > 1 ? pts : [[G.x, vy(-70)], [G.x + 1, vy(-70)]];
    };
    const title = createRef<Txt>();
    const tags: Node[] = [];
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {p.labels ? (
          <Node>
            {callout(ctx, L, [somaX - somaR * 2.4, ny - somaR * 1.2], "Sợi nhánh", { dx: -10, dy: -90, ref: (n) => tags.push(n) })}
            {callout(ctx, L, [somaX, ny - somaR], "Thân tế bào", { dx: 60, dy: -110, ref: (n) => tags.push(n) })}
            {callout(ctx, L, [(nodeX[2] + nodeX[3]) / 2, ny - 15 * k], p.myelinated ? "Bao myelin" : "Sợi trục", { dx: 40, dy: -100, color: L.secondary, ref: (n) => tags.push(n) })}
            {p.myelinated ? callout(ctx, L, [nodeX[4], ny + 6 * k], "Eo Ranvier", { dx: 40, dy: 90, color: L.highlight, ref: (n) => tags.push(n) }) : null}
            {callout(ctx, L, [axX1 + somaR * 1.2, ny - somaR * 0.6], "Cúc tận cùng", { dx: -30, dy: -110, ref: (n) => tags.push(n) })}
          </Node>
        ) : null}
        {p.showGraph ? (
          <Node>
            <Line points={[[G.x, G.y], [G.x, G.y + G.h], [G.x + G.w, G.y + G.h]]} stroke={L.dim} lineWidth={2 * k} />
            {[40, -70].map((v) => <Txt text={`${v > 0 ? "+" : ""}${v} mV`} x={G.x - 10 * k} y={vy(v)} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />)}
            <Line points={[[G.x, vy(-70)], [G.x + G.w, vy(-70)]]} stroke={L.line} lineWidth={1.5 * k} lineDash={[8 * k, 6 * k]} />
            <Line points={trace} stroke={L.accent} lineWidth={3.5 * k} lineJoin="round" shadowColor={L.accent} shadowBlur={8 * k} />
            <Txt text="điện thế màng tại điểm đo" x={G.x + G.w} y={G.y - 4 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
          </Node>
        ) : null}
      </Node>,
    );
    for (const n of tags) n.opacity(0);

    yield st.camera();
    yield t(D, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    for (const [i, n] of tags.entries()) {
      yield* until(ctx.cue(i, tags.length));
      yield n.opacity(1, 0.4, st.ease);
    }
  },
});
