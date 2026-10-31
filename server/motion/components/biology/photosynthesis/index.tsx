// Energy in cells. overview: a leaf takes in light, CO₂ through its stomata and water from the roots,
// gives off O₂ and makes glucose — 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ with the molecules counted. light: the
// light reactions on a thylakoid membrane — photons excite photosystem II and I, water is split
// (O₂ out, H⁺ into the lumen), electrons run down the transport chain, H⁺ builds up and flows back
// through ATP synthase, whose rotor turns to make ATP; NADP⁺ is reduced to NADPH. calvin: the Calvin
// cycle — CO₂ fixed by RuBisCO, reduced with ATP and NADPH, G3P leaves to build sugar, RuBP regenerates.
// respiration: glycolysis in the cytoplasm, the Krebs cycle in the mitochondrial matrix and the electron
// transport chain on the inner membrane, with the ATP tally (~30–32 per glucose).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { pathAt } from "../../../shared/fx";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "overview" | "light" | "calvin" | "respiration";
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "botany");
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
    const R0 = rng(L.seed + 9);
    const t = () => clock() * st.speed;
    const mol = (g: CanvasRenderingContext2D, x: number, y: number, text: string, col: string, r = 22 * k) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = "#0B1020";
      g.font = `800 ${r * 0.72}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, x, y);
    };
    const CO2 = "#9AA4B2", O2 = "#55C7FF", H2O = "#3FA9FF", GLU = "#FFD166", ATP = "#FF6B81", NADPH = "#C084FC", HPLUS = "#FFB000", ELEC = "#FFE66D";

    if (p.mode === "overview") {
      // Leaf in the middle; streams of molecules.
      const cx = A.cx, cy = A.cy, S = Math.min(A.w, A.h) * 0.36;
      nodes.push(
        <Draw
          paint={(g) => {
            // Sun rays.
            const sx = A.x + A.w * 0.1, sy = A.y + A.h * 0.1;
            g.globalCompositeOperation = "lighter";
            const sg = g.createRadialGradient(sx, sy, 0, sx, sy, S * 0.5);
            sg.addColorStop(0, "rgba(255,240,180,1)");
            sg.addColorStop(1, "rgba(255,200,80,0)");
            g.fillStyle = sg;
            g.beginPath();
            g.arc(sx, sy, S * 0.5, 0, TAU);
            g.fill();
            for (let i = 0; i < 6; i++) {
              const u = ((t() * 0.4 + i / 6) % 1);
              const x = sx + (cx - sx) * u, y = sy + (cy - S * 0.2 - sy) * u;
              g.strokeStyle = `rgba(255,230,120,${0.8 * (1 - u)})`;
              g.lineWidth = 4 * k;
              g.beginPath();
              g.moveTo(x, y);
              g.lineTo(x + 30 * k, y + 22 * k);
              g.stroke();
            }
            g.globalCompositeOperation = "source-over";
            // Leaf blade with veins.
            g.save();
            g.translate(cx, cy);
            g.rotate(-0.35);
            const gr = g.createLinearGradient(-S, 0, S, 0);
            gr.addColorStop(0, "#2E9A47");
            gr.addColorStop(1, "#5BD16F");
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(-S, 0);
            g.quadraticCurveTo(0, -S * 0.6, S, 0);
            g.quadraticCurveTo(0, S * 0.6, -S, 0);
            g.fill();
            g.strokeStyle = "rgba(220,255,200,0.6)";
            g.lineWidth = 4 * k;
            g.beginPath();
            g.moveTo(-S * 1.2, 0);
            g.lineTo(S * 0.95, 0);
            g.stroke();
            g.lineWidth = 2 * k;
            for (let i = 1; i < 6; i++) {
              const x = -S + (i / 6) * S * 1.8;
              g.beginPath();
              g.moveTo(x, 0);
              g.lineTo(x + S * 0.2, -S * 0.3 * (1 - Math.abs(x) / S));
              g.moveTo(x, 0);
              g.lineTo(x + S * 0.2, S * 0.3 * (1 - Math.abs(x) / S));
              g.stroke();
            }
            g.restore();
            // Molecule streams: CO₂ in (left), H₂O up the stem, O₂ out (right top), glucose to the stem.
            const streams: [XY, XY, string, string, number][] = [
              [[A.x + A.w * 0.05, cy + S * 0.5], [cx - S * 0.2, cy + S * 0.05], "CO₂", CO2, 0],
              [[cx - S * 1.15, A.y + A.h], [cx - S * 0.5, cy + S * 0.15], "H₂O", H2O, 0.3],
              [[cx + S * 0.3, cy - S * 0.1], [A.x + A.w * 0.95, A.y + A.h * 0.15], "O₂", O2, 0.15],
              [[cx, cy + S * 0.05], [cx - S * 1.15, A.y + A.h], "C₆H₁₂O₆", GLU, 0.5],
            ];
            for (const [a, b, txt, col, ph] of streams)
              for (let i = 0; i < 3; i++) {
                const u = (t() * 0.18 + i / 3 + ph) % 1;
                mol(g, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, txt, col, (txt.length > 3 ? 34 : 24) * k);
              }
          }}
        />,
      );
      show(label(ctx, "6CO₂ + 6H₂O  —(ánh sáng, diệp lục)→  C₆H₁₂O₆ + 6O₂", { x: A.cx, y: A.y + A.h - 18 * k, size: 34, fill: L.text }));
      show(label(ctx, "Khí khổng hút CO₂ · rễ hút nước · lá thải O₂", { x: A.x + A.w - 20 * k, y: A.y + 30 * k, size: 24, align: "right", fill: L.dim }));
    } else if (p.mode === "light") {
      // Thylakoid membrane band across the middle: stroma above, lumen below.
      const y0 = A.cy - 40 * k, mh = 80 * k;
      const xs = [0.14, 0.36, 0.56, 0.84].map((f) => A.x + A.w * f); // PSII, cyt b6f, PSI, ATP synthase
      const lumenH = () => Math.floor(clamp(clock() / (D * 0.6), 0, 1) * 26);
      const chain: XY[] = [[xs[0], y0], [xs[1], y0 + 10 * k], [xs[2], y0], [xs[2] + 120 * k, y0 - mh * 1.2]];
      nodes.push(
        <Draw
          paint={(g) => {
            const tt = t();
            g.fillStyle = alpha("#21E6A1", 0.08);
            g.fillRect(A.x, A.y, A.w, y0 - mh / 2 - A.y);
            g.fillStyle = alpha("#FFB000", 0.07);
            g.fillRect(A.x, y0 + mh / 2, A.w, A.y + A.h - y0 - mh / 2);
            // Lipid bilayer.
            g.fillStyle = alpha("#FFD166", 0.25);
            g.fillRect(A.x, y0 - mh / 2, A.w, mh);
            g.fillStyle = alpha("#FFD166", 0.75);
            for (let x = A.x; x < A.x + A.w; x += 16 * k) {
              g.beginPath();
              g.arc(x, y0 - mh / 2, 6 * k, 0, TAU);
              g.arc(x, y0 + mh / 2, 6 * k, 0, TAU);
              g.fill();
            }
            // Complexes.
            const blob = (x: number, w: number, h: number, col: string) => {
              g.fillStyle = col;
              g.beginPath();
              g.ellipse(x, y0, w, h, 0, 0, TAU);
              g.fill();
            };
            blob(xs[0], 70 * k, 70 * k, "#2E9A47");
            blob(xs[1], 50 * k, 60 * k, "#3FA9FF");
            blob(xs[2], 70 * k, 70 * k, "#21B86A");
            // ATP synthase: F0 ring in the membrane (turning) and F1 head in the stroma.
            const rot = tt * 4;
            g.fillStyle = "#C084FC";
            g.beginPath();
            g.ellipse(xs[3], y0, 50 * k, 40 * k, 0, 0, TAU);
            g.fill();
            g.strokeStyle = "#5B3FA6";
            g.lineWidth = 4 * k;
            for (let i = 0; i < 8; i++) {
              const a = rot + (i / 8) * TAU;
              g.beginPath();
              g.moveTo(xs[3], y0);
              g.lineTo(xs[3] + Math.cos(a) * 46 * k, y0 + Math.sin(a) * 36 * k);
              g.stroke();
            }
            g.fillStyle = "#9B5DE5";
            g.fillRect(xs[3] - 8 * k, y0 - mh / 2 - 60 * k, 16 * k, 60 * k);
            g.beginPath();
            g.ellipse(xs[3], y0 - mh / 2 - 90 * k, 60 * k, 40 * k, 0, 0, TAU);
            g.fill();
            // Photons arriving at PSII and PSI.
            for (const x of [xs[0], xs[2]]) {
              const u = (tt * 0.6 + (x === xs[2] ? 0.5 : 0)) % 1;
              const px = x - 160 * k + u * 160 * k, py = A.y + 20 * k + u * (y0 - mh / 2 - A.y - 20 * k);
              g.strokeStyle = ELEC;
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let j = 0; j <= 30; j++) {
                const xx = px - j * 4 * k, yy = py - j * 3 * k + Math.sin(j * 1.2) * 6 * k;
                if (j) g.lineTo(xx, yy);
                else g.moveTo(xx, yy);
              }
              g.stroke();
            }
            // Electrons along the chain.
            for (let i = 0; i < 5; i++) {
              const [x, y] = pathAt(chain, (tt * 0.25 + i / 5) % 1);
              g.fillStyle = ELEC;
              g.shadowColor = ELEC;
              g.shadowBlur = 10 * k;
              g.beginPath();
              g.arc(x, y, 7 * k, 0, TAU);
              g.fill();
              g.shadowBlur = 0;
            }
            // H⁺ accumulating in the lumen, a stream back through ATP synthase.
            const r = rng(4);
            for (let i = 0; i < lumenH(); i++) mol(g, A.x + r() * A.w * 0.7 + 20 * k, y0 + mh / 2 + 30 * k + r() * (A.y + A.h - y0 - mh) * 0.5, "H⁺", HPLUS, 14 * k);
            for (let i = 0; i < 3; i++) {
              const u = (tt * 0.5 + i / 3) % 1;
              mol(g, xs[3], y0 + mh / 2 + 40 * k - u * (mh + 80 * k), "H⁺", HPLUS, 14 * k);
            }
            // Water splitting at PSII (O₂ bubbles out), ATP and NADPH appearing in the stroma.
            const w = (tt * 0.3) % 1;
            mol(g, xs[0] - 20 * k, y0 + mh / 2 + 70 * k - w * 30 * k, "H₂O", H2O, 22 * k);
            mol(g, xs[0] + 40 * k + w * 60 * k, y0 + mh / 2 + 40 * k + w * 140 * k, "O₂", O2, 20 * k);
            const a = (tt * 0.35) % 1;
            mol(g, xs[3] + 70 * k + a * 60 * k, y0 - mh / 2 - 100 * k - a * 90 * k, "ATP", ATP, 24 * k);
            mol(g, xs[2] + 130 * k + a * 30 * k, y0 - mh * 1.4 - a * 80 * k, "NADPH", NADPH, 30 * k);
            // Labels of the complexes.
            g.fillStyle = L.text;
            g.font = `700 ${20 * k}px ${FONT}`;
            g.textAlign = "center";
            g.fillText("Quang hệ II", xs[0], y0 + 6 * k);
            g.fillText("cyt b6f", xs[1], y0 + 6 * k);
            g.fillText("Quang hệ I", xs[2], y0 + 6 * k);
            g.fillText("ATP synthase", xs[3], y0 - mh / 2 - 140 * k);
            g.fillStyle = L.dim;
            g.textAlign = "left";
            g.fillText("chất nền (stroma)", A.x + 10 * k, A.y + 20 * k);
            g.fillText("xoang thylakoid (lumen) — H⁺ tích tụ", A.x + 10 * k, A.y + A.h - 14 * k);
          }}
        />,
      );
      show(label(ctx, "Ánh sáng → tách nước, giải phóng O₂; dòng H⁺ quay ATP synthase tạo ATP", { x: A.cx, y: A.y + 60 * k, size: 25, fill: L.text }));
    } else if (p.mode === "calvin") {
      const cx = A.cx, cy = A.cy, R = Math.min(A.w, A.h) * 0.3;
      const stations: [number, string, string][] = [[-Math.PI / 2, "1. Cố định CO₂ (RuBisCO)", L.secondary], [Math.PI / 6, "2. Khử (dùng ATP, NADPH)", ATP], [(5 * Math.PI) / 6, "3. Tái tạo RuBP", NADPH]];
      nodes.push(
        <Draw
          paint={(g) => {
            const tt = t();
            g.strokeStyle = alpha(L.primary, 0.6);
            g.lineWidth = 14 * k;
            g.beginPath();
            g.arc(cx, cy, R, 0, TAU);
            g.stroke();
            // Arrow heads around the cycle (clockwise).
            g.fillStyle = L.primary;
            for (let i = 0; i < 3; i++) {
              const a = -Math.PI / 2 + (i + 0.5) * ((2 * Math.PI) / 3);
              g.save();
              g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
              g.rotate(a + Math.PI / 2);
              g.beginPath();
              g.moveTo(16 * k, 0);
              g.lineTo(-10 * k, -14 * k);
              g.lineTo(-10 * k, 14 * k);
              g.fill();
              g.restore();
            }
            // Carbon skeletons travelling around.
            for (let i = 0; i < 6; i++) {
              const a = -Math.PI / 2 + ((tt * 0.25 + i / 6) % 1) * TAU;
              mol(g, cx + Math.cos(a) * R, cy + Math.sin(a) * R, "C", "#E8ECF2", 14 * k);
            }
            // CO₂ in at station 1, ATP/NADPH in at 2, G3P out between 2 and 3.
            const u = (tt * 0.35) % 1;
            mol(g, cx, cy - R - 160 * k + u * 140 * k, "CO₂", CO2, 26 * k);
            mol(g, cx + R * 1.5 - u * R * 0.55, cy + R * 0.35, "ATP", ATP, 26 * k);
            mol(g, cx + R * 1.5 - u * R * 0.55, cy + R * 0.75, "NADPH", NADPH, 32 * k);
            mol(g, cx - u * R * 0.2, cy + R + 40 * k + u * 120 * k, "G3P", GLU, 26 * k);
            g.font = `700 ${22 * k}px ${FONT}`;
            g.fillStyle = L.dim;
            g.textAlign = "center";
            g.fillText("→ glucose, tinh bột", cx, cy + R + 200 * k);
          }}
        />,
      );
      stations.forEach(([a, nm, col]) => {
        const s = createSignal(0);
        shows.push(s);
        nodes.push(<Node opacity={s}>{label(ctx, nm, { x: cx + Math.cos(a) * R * 1.45, y: cy + Math.sin(a) * R * 1.3, size: 25, fill: col })}</Node>);
      });
      show(label(ctx, "Chu trình Calvin (pha tối) diễn ra trong chất nền lục lạp: 3 CO₂ → 1 G3P", { x: A.cx, y: A.y + 24 * k, size: 25, fill: L.text }));
    } else {
      // ---- respiration: three zones left → right with ATP tally.
      const zones = [
        { x: A.x + A.w * 0.17, name: "Đường phân (tế bào chất)", atp: 2 },
        { x: A.x + A.w * 0.5, name: "Chu trình Krebs (chất nền ty thể)", atp: 2 },
        { x: A.x + A.w * 0.83, name: "Chuỗi chuyền electron (màng trong)", atp: 28 },
      ];
      const z = (i: number) => smooth(clamp((clock() - ctx.cue(i, 4)) / 1.5, 0, 1));
      const tally = () => Math.round(z(0) * 2 + z(1) * 2 + z(2) * 28);
      nodes.push(
        <Draw
          paint={(g) => {
            const tt = t(), cy = A.cy;
            // Mitochondrion outline behind zones 2–3.
            g.fillStyle = alpha("#FF8A5B", 0.12);
            g.strokeStyle = alpha("#FFC2A8", 0.6);
            g.lineWidth = 5 * k;
            g.beginPath();
            g.ellipse(A.x + A.w * 0.66, cy, A.w * 0.32, A.h * 0.36, 0, 0, TAU);
            g.fill();
            g.stroke();
            // Glycolysis: glucose (6C) splits into 2 pyruvate (3C).
            const u0 = z(0);
            mol(g, zones[0].x, cy - 60 * k * (1 - u0), "C₆", GLU, 30 * k);
            if (u0 > 0.5) {
              mol(g, zones[0].x + 90 * k * u0, cy + 40 * k, "C₃", "#FFB703", 24 * k);
              mol(g, zones[0].x + 90 * k * u0, cy - 40 * k, "C₃", "#FFB703", 24 * k);
            }
            // Krebs: a spinning cycle releasing CO₂.
            const k1 = z(1);
            g.strokeStyle = alpha("#FF8A5B", 0.9 * k1);
            g.lineWidth = 10 * k;
            g.beginPath();
            g.arc(zones[1].x, cy, 90 * k, tt * 1.5, tt * 1.5 + TAU * 0.85);
            g.stroke();
            if (k1 > 0.2) {
              const u = (tt * 0.4) % 1;
              mol(g, zones[1].x + 90 * k + u * 60 * k, cy - 90 * k - u * 60 * k, "CO₂", CO2, 22 * k);
              mol(g, zones[1].x - 90 * k - u * 40 * k, cy + 60 * k + u * 40 * k, "NADH", NADPH, 28 * k);
            }
            // ETC: inner membrane folds with electrons and an ATP synthase.
            const e3 = z(2);
            g.strokeStyle = alpha("#FFC2A8", 0.9);
            g.lineWidth = 6 * k;
            g.beginPath();
            for (let i = 0; i <= 60; i++) {
              const y = cy - A.h * 0.28 + (i / 60) * A.h * 0.56, x = zones[2].x - 40 * k + Math.sin(i * 0.5) * 30 * k;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            if (e3 > 0) {
              for (let i = 0; i < 5; i++) {
                const yy = cy - A.h * 0.25 + ((tt * 0.3 + i / 5) % 1) * A.h * 0.5;
                g.fillStyle = ELEC;
                g.beginPath();
                g.arc(zones[2].x - 40 * k + Math.sin(((yy - cy + A.h * 0.28) / (A.h * 0.56)) * 60 * 0.5) * 30 * k, yy, 7 * k, 0, TAU);
                g.fill();
              }
              const u = (tt * 0.5) % 1;
              mol(g, zones[2].x + 60 * k + u * 60 * k, cy + 20 * k - u * 100 * k, "ATP", ATP, 26 * k);
              mol(g, zones[2].x - 120 * k, cy + A.h * 0.2 + u * 40 * k, "H₂O", H2O, 22 * k);
              mol(g, zones[2].x - 120 * k - (1 - u) * 60 * k, cy + A.h * 0.2 - 60 * k, "O₂", O2, 20 * k);
            }
          }}
        />,
      );
      zones.forEach((zn, i) => {
        const s = createSignal(0);
        shows.push(s);
        nodes.push(<Node opacity={s}>{label(ctx, `${zn.name} · ${zn.atp} ATP`, { x: zn.x, y: A.y + 30 * k + (i % 2) * 36 * k, size: 23, fill: L.text })}</Node>);
      });
      nodes.push(<Txt text={() => `ATP: ${tally()}`} x={A.x + A.w - 20 * k} y={A.y + A.h - 30 * k} offsetX={1} fontFamily={FONT} fontWeight={900} fontSize={44 * k} fill={ATP} />);
      show(label(ctx, "C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ~32 ATP", { x: A.x + 20 * k, y: A.y + A.h - 30 * k, size: 30, align: "left", fill: L.text }));
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
    void R0;
    void mix;
    void num;
    void Line;
    void Rect;
  },
});
