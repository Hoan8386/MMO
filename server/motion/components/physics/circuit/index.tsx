// DC circuits drawn as schematics with live values. series / parallel: a battery and bulbs; currents
// from Ohm's and Kirchhoff's laws, each bulb glowing with its power I²R; electrons drift along the
// wires against the conventional current at a speed ∝ current. ohm: the battery voltage is raised
// step by step, ammeter and voltmeter read I and U, and the points fall on the line I = U/R. rc: a
// switch closes and the capacitor charges, U_C = E(1 − e^(−t/RC)), charges pile up on its plates,
// the current dies away, and the graph marks the time constant τ (63 %).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { pathAt } from "../../../shared/fx";
import { FONT, label } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "series" | "parallel" | "ohm" | "rc";
  voltage: number;
  resistances: number[];
  capacitance: number;
  electrons: boolean;
  conventional: boolean;
  values: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "electromagnetism");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const E = p.voltage;
    const Rs = p.resistances.length ? p.resistances : [10];

    // ---- layout: circuit on the left (wide) or top; graph/readouts beside.
    const hasGraph = p.mode === "ohm" || p.mode === "rc";
    const CW = hasGraph && A.wide ? A.w * 0.56 : A.w, CH = hasGraph && !A.wide ? A.h * 0.55 : A.h;
    const x0 = A.x + CW * 0.1, x1 = A.x + CW * 0.9, y0 = A.y + CH * 0.18, y1 = A.y + CH * 0.85;
    const wire = L.lw(5 * k);

    // Currents (amps) as functions of time.
    const closeAt = ctx.cue(0, 4); // switch / power on
    const on = () => (clock() > closeAt ? 1 : 0);
    const RC = p.mode === "rc" ? Rs[0] * p.capacitance * 1e-3 : 1; // capacitance in mF → s
    const tauVis = RC / st.speed; // visual seconds per τ… real τ is shown in the label
    const uC = () => (p.mode === "rc" && clock() > closeAt ? E * (1 - Math.exp(-(clock() - closeAt) / Math.max(0.3, tauVis))) : 0);
    const ohmV = () => (p.mode === "ohm" ? E * clamp(Math.floor(((clock() - closeAt) / (D - closeAt - 1)) * 6) / 5, 0, 1) : E);
    const Itot = () => {
      if (p.mode === "series") return (on() * E) / Rs.reduce((a, b) => a + b, 0);
      if (p.mode === "parallel") return on() * Rs.reduce((a, r) => a + E / r, 0);
      if (p.mode === "ohm") return on() * (ohmV() / Rs[0]);
      return on() * ((E - uC()) / Rs[0]);
    };
    const Imax = p.mode === "parallel" ? Rs.reduce((a, r) => a + E / r, 0) : p.mode === "series" ? E / Rs.reduce((a, b) => a + b, 0) : E / Rs[0];

    // ---- wires as polylines with their current; dots drift along them.
    const branches: { pts: XY[]; I: () => number }[] = [];
    const parts: Node[] = [];
    const readouts: { at: XY; text: () => string; color: string }[] = [];
    // Battery on the left side, + at the top.
    const by = (y0 + y1) / 2;
    const battery = (
      <Node>
        <Line points={[[x0 - 34 * k, by - 12 * k], [x0 + 34 * k, by - 12 * k]]} stroke={L.text} lineWidth={L.lw(5 * k)} />
        <Line points={[[x0 - 18 * k, by + 12 * k], [x0 + 18 * k, by + 12 * k]]} stroke={L.text} lineWidth={L.lw(9 * k)} />
        <Txt text="+" x={x0 + 50 * k} y={by - 26 * k} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.highlight} />
        <Txt text={() => `${num(p.mode === "ohm" ? ohmV() : E, 1)} V`} x={x0 - 60 * k} y={by} offsetX={1} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.accent} />
      </Node>
    );
    parts.push(battery);
    // Brightness relative to the brightest bulb of this circuit when switched on.
    const Psteady = p.mode === "parallel" ? Math.max(...Rs.map((r) => (E * E) / r)) : p.mode === "series" ? Math.max(...Rs) * (E / Rs.reduce((a, b) => a + b, 0)) ** 2 : 1;
    const bulb = (x: number, y: number, I: () => number, R: number, vertical = false) => {
      const P = () => I() * I() * R;
      const Pmax = Psteady;
      const glowR = () => 30 * k + 90 * k * Math.sqrt(clamp(P() / Pmax, 0, 1));
      parts.push(
        <Node>
          <Draw
            paint={(g) => {
              const b = clamp(P() / Pmax, 0, 1);
              if (b <= 0.001) return;
              g.globalCompositeOperation = "lighter";
              const gr = g.createRadialGradient(x, y, 0, x, y, glowR());
              gr.addColorStop(0, `rgba(255, 236, 170, ${0.9 * Math.sqrt(b)})`);
              gr.addColorStop(1, "rgba(255, 190, 80, 0)");
              g.fillStyle = gr;
              g.beginPath();
              g.arc(x, y, glowR(), 0, TAU);
              g.fill();
            }}
          />
          <Circle x={x} y={y} size={74 * k} fill={L.bg} stroke={L.text} lineWidth={L.lw(4 * k)} />
          <Line points={vertical ? [[x - 14 * k, y - 14 * k], [x + 14 * k, y + 14 * k]] : [[x - 14 * k, y - 14 * k], [x + 14 * k, y + 14 * k]]} stroke={() => (P() > 0 ? "#FFE9A8" : L.dim)} lineWidth={3 * k} />
          <Line points={[[x - 14 * k, y + 14 * k], [x + 14 * k, y - 14 * k]]} stroke={() => (P() > 0 ? "#FFE9A8" : L.dim)} lineWidth={3 * k} />
        </Node>,
      );
      readouts.push({ at: vertical ? [x + 52 * k, y] : [x, y - 66 * k], text: () => `${num(R, 0)} Ω · ${num(I(), 2)} A · ${num(P(), 1)} W`, color: L.text });
    };
    const zigzag = (xa: number, xb: number, y: number) => {
      const pts: XY[] = [[xa, y]];
      for (let i = 1; i < 12; i++) pts.push([xa + ((xb - xa) * i) / 12, y + (i % 2 ? -16 : 16) * k]);
      pts.push([xb, y]);
      return pts;
    };

    if (p.mode === "series") {
      branches.push({ pts: [[x0, by - 12 * k], [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, by + 12 * k]], I: Itot });
      const n = Rs.length;
      Rs.forEach((R, i) => {
        // Bulbs along the top and right wires.
        const u = (i + 1) / (n + 1);
        const x = x0 + (x1 - x0) * u;
        bulb(x, y0, Itot, R);
      });
    } else if (p.mode === "parallel") {
      const n = Rs.length;
      const xs = Rs.map((_, i) => x0 + (x1 - x0) * ((i + 1) / n) * 0.85 + (x1 - x0) * 0.1);
      branches.push({ pts: [[x0, by - 12 * k], [x0, y0], [xs[n - 1], y0]], I: Itot });
      branches.push({ pts: [[xs[n - 1], y1], [x0, y1], [x0, by + 12 * k]], I: Itot });
      Rs.forEach((R, i) => {
        branches.push({ pts: [[xs[i], y0], [xs[i], y1]], I: () => (on() * E) / R });
        bulb(xs[i], (y0 + y1) / 2, () => (on() * E) / R, R, true);
      });
    } else {
      // ohm / rc: battery, switch on the top, resistor on the right, capacitor or ammeter on the bottom.
      const sx = x0 + (x1 - x0) * 0.3;
      branches.push({ pts: [[x0, by - 12 * k], [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, by + 12 * k]], I: Itot });
      const swAng = () => (on() ? 0 : -28);
      parts.push(
        <Node>
          <Rect x={sx} y={y0} width={110 * k} height={20 * k} fill={L.bg} />
          <Circle x={sx - 50 * k} y={y0} size={12 * k} fill={L.text} />
          <Circle x={sx + 50 * k} y={y0} size={12 * k} fill={L.text} />
          <Line points={[[0, 0], [100 * k, 0]]} x={sx - 50 * k} y={y0} rotation={swAng} stroke={L.text} lineWidth={L.lw(5 * k)} lineCap="round" />
          <Txt text="K" x={sx} y={y0 - 34 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.dim} />
        </Node>,
      );
      const ry = (y0 + y1) / 2;
      parts.push(
        <Node>
          <Rect x={x1} y={ry} width={40 * k} height={220 * k} fill={L.bg} />
          <Line points={zigzag(ry - 100 * k, ry + 100 * k, x1).map(([a, b]) => [b, a] as XY)} stroke={L.accent} lineWidth={L.lw(5 * k)} lineJoin="round" />
        </Node>,
      );
      readouts.push({ at: [x1 + 40 * k, ry], text: () => `R = ${num(Rs[0], 0)} Ω`, color: L.accent });
      const bx = x0 + (x1 - x0) * 0.6;
      if (p.mode === "rc") {
        // Capacitor plates with charges proportional to Q = C·U_C.
        parts.push(
          <Node>
            <Rect x={bx} y={y1} width={40 * k} height={30 * k} fill={L.bg} />
            <Line points={[[bx - 14 * k, y1 - 60 * k], [bx - 14 * k, y1 + 60 * k]]} stroke={L.text} lineWidth={L.lw(7 * k)} />
            <Line points={[[bx + 14 * k, y1 - 60 * k], [bx + 14 * k, y1 + 60 * k]]} stroke={L.text} lineWidth={L.lw(7 * k)} />
            <Draw
              paint={(g) => {
                const n = Math.round((uC() / E) * 8);
                g.font = `800 ${20 * k}px ${FONT}`;
                g.textAlign = "center";
                for (let i = 0; i < n; i++) {
                  const yy = y1 - 50 * k + (i * 100 * k) / 7;
                  // Electrons pile on the plate joined to the battery's − side (the left plate here).
                  g.fillStyle = L.secondary;
                  g.fillText("−", bx - 34 * k, yy + 7 * k);
                  g.fillStyle = L.highlight;
                  g.fillText("+", bx + 34 * k, yy + 7 * k);
                }
              }}
            />
          </Node>,
        );
        readouts.push({ at: [bx, y1 + 90 * k], text: () => `C = ${num(p.capacitance, 0)} mF · U_C = ${num(uC(), 2)} V`, color: L.text });
      } else {
        // Ammeter in series; voltmeter across the resistor (drawn beside it).
        parts.push(
          <Node>
            <Circle x={bx} y={y1} size={70 * k} fill={L.bg} stroke={L.text} lineWidth={L.lw(4 * k)} />
            <Txt text="A" x={bx} y={y1} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.secondary} />
          </Node>,
        );
        readouts.push({ at: [bx, y1 + 70 * k], text: () => `I = ${num(Itot(), 2)} A`, color: L.secondary });
        const vx = x1 - 110 * k;
        parts.push(
          <Node>
            <Line points={[[x1, ry - 120 * k], [vx, ry - 120 * k], [vx, ry - 35 * k]]} stroke={alpha(L.ink, 0.5)} lineWidth={L.lw(3 * k)} />
            <Line points={[[x1, ry + 120 * k], [vx, ry + 120 * k], [vx, ry + 35 * k]]} stroke={alpha(L.ink, 0.5)} lineWidth={L.lw(3 * k)} />
            <Circle x={vx} y={ry} size={70 * k} fill={L.bg} stroke={L.text} lineWidth={L.lw(4 * k)} />
            <Txt text="V" x={vx} y={ry} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.highlight} />
          </Node>,
        );
        readouts.push({ at: [vx - 50 * k, ry], text: () => `U = ${num(ohmV() * on(), 1)} V`, color: L.highlight });
      }
    }

    // Electrons: dots spaced along each branch, drifting from − to + (against the conventional arrows).
    const drift = branches.map(() => createSignal(0));
    const electronPaint = (g: CanvasRenderingContext2D) => {
      if (!p.electrons) return;
      branches.forEach((b, i) => {
        let len = 0;
        for (let j = 1; j < b.pts.length; j++) len += Math.hypot(b.pts[j][0] - b.pts[j - 1][0], b.pts[j][1] - b.pts[j - 1][1]);
        const n = Math.max(3, Math.round(len / (34 * k)));
        const off = drift[i]();
        for (let j = 0; j < n; j++) {
          // Branch points run in the conventional direction; electrons move backwards along them.
          const u = (((j / n - off) % 1) + 1) % 1;
          const [x, y] = pathAt(b.pts, u);
          g.fillStyle = L.secondary;
          g.shadowColor = L.secondary;
          g.shadowBlur = 8 * k * L.visual.glow;
          g.beginPath();
          g.arc(x, y, 5 * k, 0, TAU);
          g.fill();
        }
      });
      g.shadowBlur = 0;
    };
    // Conventional current arrows (+ → −) along the wires.
    const arrows = p.conventional
      ? branches.map((b) => {
          const mid = pathAt(b.pts, 0.5), ahead = pathAt(b.pts, 0.53);
          const a = Math.atan2(ahead[1] - mid[1], ahead[0] - mid[0]);
          return (
            <Node opacity={() => (on() ? 1 : 0.2)}>
              <Line points={[[mid[0] - Math.cos(a) * 26 * k, mid[1] - Math.sin(a) * 26 * k], [mid[0] + Math.cos(a) * 26 * k, mid[1] + Math.sin(a) * 26 * k]]} stroke={L.highlight} lineWidth={4 * k} endArrow arrowSize={14 * k} />
            </Node>
          );
        })
      : [];

    // ---- graph (ohm: I–U points; rc: U_C(t) and I(t) with τ).
    const GX = A.wide ? A.x + CW + 20 * k : A.x + 40 * k, GY = A.wide ? A.y + 60 * k : A.y + CH + 30 * k;
    const GW = A.wide ? A.w - CW - 40 * k : A.w - 80 * k, GH = A.wide ? A.h - 140 * k : A.h - CH - 90 * k;
    const graphRef = createRef<Node>();
    const graph = hasGraph ? (
      <Node ref={graphRef} opacity={0}>
        <Line points={[[GX, GY], [GX, GY + GH], [GX + GW, GY + GH]]} stroke={L.dim} lineWidth={2 * k} endArrow arrowSize={12 * k} />
        {p.mode === "ohm" ? (
          <Node>
            <Txt text="I (A)" x={GX + 10 * k} y={GY - 4 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.secondary} />
            <Txt text="U (V)" x={GX + GW} y={GY + GH + 28 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.highlight} />
            <Line points={[[GX, GY + GH], [GX + GW * 0.95, GY + GH - GH * 0.85]]} stroke={alpha(L.accent, 0.4)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} end={() => clamp((clock() - closeAt) / (D - closeAt - 1), 0, 1)} />
            <Draw
              paint={(g) => {
                const steps = Math.round(clamp(((clock() - closeAt) / (D - closeAt - 1)) * 6, 0, 6));
                for (let i = 0; i < Math.min(6, steps); i++) {
                  const u = i / 5;
                  g.fillStyle = L.secondary;
                  g.beginPath();
                  g.arc(GX + u * GW * 0.95, GY + GH - u * GH * 0.85, 9 * k, 0, TAU);
                  g.fill();
                }
              }}
            />
            <Txt text={`I = U / R — đường thẳng qua gốc, độ dốc 1/R`} x={GX + GW / 2} y={GY + GH + 64 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
          </Node>
        ) : (
          <Node>
            <Txt text="U_C (V)" x={GX + 10 * k} y={GY - 4 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.accent} />
            <Txt text="I" x={GX + 120 * k} y={GY - 4 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.secondary} />
            <Txt text="t" x={GX + GW} y={GY + GH + 28 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.dim} />
            <Line
              points={() => {
                const pts: XY[] = [];
                for (let i = 0; i <= 200; i++) {
                  const t = closeAt + (i / 200) * (D - closeAt);
                  if (t > clock()) break;
                  const u = E * (1 - Math.exp(-(t - closeAt) / Math.max(0.3, tauVis)));
                  pts.push([GX + ((t - closeAt) / (D - closeAt)) * GW, GY + GH - (u / E) * GH * 0.85]);
                }
                return pts.length > 1 ? pts : [[GX, GY + GH], [GX + 1, GY + GH]];
              }}
              stroke={L.accent}
              lineWidth={L.lw(4 * k)}
              {...L.glow(L.accent, 8 * k)}
            />
            <Line
              points={() => {
                const pts: XY[] = [];
                for (let i = 0; i <= 200; i++) {
                  const t = closeAt + (i / 200) * (D - closeAt);
                  if (t > clock()) break;
                  const ii = Math.exp(-(t - closeAt) / Math.max(0.3, tauVis));
                  pts.push([GX + ((t - closeAt) / (D - closeAt)) * GW, GY + GH - ii * GH * 0.85]);
                }
                return pts.length > 1 ? pts : [[GX, GY + GH], [GX + 1, GY + GH]];
              }}
              stroke={L.secondary}
              lineWidth={L.lw(3 * k)}
            />
            <Line points={[[GX + (Math.max(0.3, tauVis) / (D - closeAt)) * GW, GY + GH], [GX + (Math.max(0.3, tauVis) / (D - closeAt)) * GW, GY + GH - 0.632 * GH * 0.85]]} stroke={alpha(L.ink, 0.5)} lineWidth={1.5 * k} lineDash={[6 * k, 6 * k]} opacity={() => (clock() - closeAt > tauVis ? 1 : 0)} />
            <Txt text={`τ = RC = ${num(RC, 2)} s → 63 %`} x={GX + (Math.max(0.3, tauVis) / (D - closeAt)) * GW + 10 * k} y={GY + GH - 0.632 * GH * 0.85 - 20 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.text} opacity={() => (clock() - closeAt > tauVis ? 1 : 0)} />
            <Txt text="U_C = E(1 − e^(−t/RC))" x={GX + GW / 2} y={GY + GH + 64 * k} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
          </Node>
        )}
      </Node>
    ) : null;

    const valRef = createRef<Node>();
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          {branches.map((b) => (
            <Line points={b.pts} stroke={alpha(L.ink, 0.75)} lineWidth={wire} lineJoin="round" />
          ))}
          <Draw paint={electronPaint} />
          {parts}
          {arrows}
        </Node>
        {p.values ? (
          <Node ref={valRef} opacity={0}>
            {readouts.map((r) => (
              <Txt text={r.text} x={r.at[0]} y={r.at[1]} offsetX={r.at[0] > x1 - 10 * k ? -1 : 0} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={r.color} shadowColor="rgba(0,0,0,0.85)" shadowBlur={6 * k} />
            ))}
            <Txt text={() => `I tổng = ${num(Itot(), 2)} A`} x={A.x + CW / 2} y={y1 + 70 * k} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.secondary} opacity={p.mode === "series" || p.mode === "parallel" ? 1 : 0} />
          </Node>
        ) : null}
        {graph}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    // Electron drift integrates the current: advance each branch's offset every frame.
    const driftRun = function* (): ThreadGenerator {
      let last = 0;
      while (clock() < D - 1e-3) {
        yield;
        const t = clock(), dt = t - last;
        last = t;
        branches.forEach((b, i) => drift[i](drift[i]() + (b.I() / Math.max(Imax, 1e-6)) * dt * 0.09 * st.speed));
      }
    };
    yield st.camera();
    yield clock(D, D, linear);
    yield driftRun();
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = [];
    if (p.values) steps.push(() => valRef().opacity(1, 0.5));
    if (graph) steps.push(() => graphRef().opacity(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(Math.max(closeAt, ctx.cue(i + 1, steps.length + 2)));
      yield steps[i]();
    }
  },
});
