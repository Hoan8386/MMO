// The heart and circulation. heart: a cross-section with four chambers; the cardiac cycle at the
// chosen rate — atrial systole, ventricular systole, diastole — with the walls contracting, the
// atrioventricular and semilunar valves opening and closing at the right moments, blood (blue on the
// right side, red on the left) flowing through, and the ECG (P wave, QRS, T wave) traced in sync.
// circulation: the double circulation — pulmonary loop (heart → lungs → heart, blood turning red) and
// systemic loop (heart → body → heart, turning blue), with blood cells streaming around.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { pathAt } from "../../../shared/fx";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "heart" | "circulation";
  bpm: number;
  ecg: boolean;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];
const RED = "#E8394A", BLUE = "#4C6FFF";

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "human_biology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    // Panels that are not labels (shown even with labels off).
    const panels: ReturnType<typeof createSignal<number>>[] = [];
    // Beat phase 0–1 (displayed slower than real so it can be followed: rate × 0.5).
    const period = 60 / p.bpm / (0.5 * st.speed);
    const ph = () => (clock() / period) % 1;
    // Cycle timing (fractions of the beat): atrial systole 0–0.12, ventricular systole 0.2–0.5.
    const atrial = () => Math.sin(clamp(ph() / 0.12, 0, 1) * Math.PI);
    const vent = () => Math.sin(clamp((ph() - 0.2) / 0.3, 0, 1) * Math.PI);
    const avOpen = () => (ph() < 0.2 || ph() > 0.55 ? 1 : 0); // mitral/tricuspid
    const slOpen = () => (ph() > 0.24 && ph() < 0.48 ? 1 : 0); // aortic/pulmonary
    // ECG: P (0.02–0.1), QRS (0.17–0.22), T (0.4–0.52).
    const ecgAt = (u: number) => {
      const f = ((u % 1) + 1) % 1;
      const g = (c: number, w: number, a: number) => a * Math.exp(-(((f - c) / w) ** 2));
      return g(0.06, 0.025, 0.15) - g(0.175, 0.006, 0.12) + g(0.19, 0.009, 1.0) - g(0.205, 0.008, 0.25) + g(0.46, 0.04, 0.3);
    };

    if (p.mode === "heart") {
      const HW = A.wide ? A.w * 0.55 : A.w;
      const cx = A.x + HW / 2, cy = A.y + (A.wide ? A.h * 0.5 : A.h * 0.36), S = Math.min(HW * 0.45, A.h * (A.wide ? 0.45 : 0.32));
      // Chamber shapes (screen left = the heart's right side, as in anatomy diagrams).
      const chamber = (x: number, y: number, rx: number, ry: number, squeeze: number) => ({ x, y, rx: rx * (1 - 0.18 * squeeze), ry: ry * (1 - 0.12 * squeeze) });
      nodes.push(
        <Draw
          paint={(g) => {
            const a = atrial(), v = vent();
            // Outer muscle.
            const beat = 1 - 0.04 * v;
            g.save();
            g.translate(cx, cy);
            g.scale(beat, beat);
            g.translate(-cx, -cy);
            g.fillStyle = "#B83A4B";
            g.beginPath();
            g.moveTo(cx, cy + S * 1.0);
            g.bezierCurveTo(cx - S * 1.15, cy + S * 0.25, cx - S * 1.0, cy - S * 0.85, cx - S * 0.25, cy - S * 0.75);
            g.lineTo(cx + S * 0.25, cy - S * 0.75);
            g.bezierCurveTo(cx + S * 1.0, cy - S * 0.85, cx + S * 1.15, cy + S * 0.25, cx, cy + S * 1.0);
            g.fill();
            g.restore();
            // Great vessels.
            g.fillStyle = BLUE;
            g.fillRect(cx - S * 0.72, cy - S * 1.15, S * 0.22, S * 0.5); // superior vena cava
            g.fillStyle = mix(BLUE, "#FFFFFF", 0.1);
            g.beginPath();
            g.moveTo(cx - S * 0.1, cy - S * 0.55);
            g.quadraticCurveTo(cx - S * 0.05, cy - S * 1.2, cx + S * 0.55, cy - S * 1.15);
            g.lineWidth = S * 0.16;
            g.strokeStyle = BLUE;
            g.stroke(); // pulmonary artery
            g.strokeStyle = RED;
            g.lineWidth = S * 0.2;
            g.beginPath();
            g.moveTo(cx + S * 0.08, cy - S * 0.5);
            g.bezierCurveTo(cx + S * 0.1, cy - S * 1.35, cx - S * 0.6, cy - S * 1.35, cx - S * 0.45, cy - S * 1.05);
            g.stroke(); // aortic arch
            // Chambers: RA, RV (blue), LA, LV (red).
            const RA = chamber(cx - S * 0.45, cy - S * 0.35, S * 0.33, S * 0.28, a);
            const LA = chamber(cx + S * 0.45, cy - S * 0.35, S * 0.33, S * 0.28, a);
            const RV = chamber(cx - S * 0.35, cy + S * 0.3, S * 0.36, S * 0.45, v);
            const LV = chamber(cx + S * 0.3, cy + S * 0.3, S * 0.4, S * 0.52, v);
            for (const [c, col] of [[RA, BLUE], [RV, BLUE], [LA, RED], [LV, RED]] as [ReturnType<typeof chamber>, string][]) {
              g.fillStyle = mix(col, "#000000", 0.15);
              g.beginPath();
              g.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU);
              g.fill();
            }
            // Septum.
            g.strokeStyle = "#8E2A38";
            g.lineWidth = S * 0.08;
            g.beginPath();
            g.moveTo(cx - S * 0.02, cy - S * 0.6);
            g.lineTo(cx - S * 0.02, cy + S * 0.8);
            g.stroke();
            // Valves: AV between atria and ventricles (two flaps), semilunar at the vessel exits.
            const flaps = (x: number, y: number, w: number, open: number) => {
              g.strokeStyle = "#FFF4D6";
              g.lineWidth = 5 * k;
              g.lineCap = "round";
              const ang = open ? 1.2 : 0.05;
              for (const s of [-1, 1]) {
                g.beginPath();
                g.moveTo(x + s * w, y);
                g.lineTo(x + s * w - s * Math.cos(ang) * w * 0.9, y + Math.sin(ang) * w * 0.9);
                g.stroke();
              }
            };
            flaps(RA.x + S * 0.05, cy - S * 0.05, S * 0.14, avOpen());
            flaps(LA.x - S * 0.05, cy - S * 0.05, S * 0.14, avOpen());
            flaps(cx - S * 0.1, cy - S * 0.5, S * 0.08, slOpen());
            flaps(cx + S * 0.08, cy - S * 0.47, S * 0.08, slOpen());
            // Blood cells flowing along the current path of the phase.
            const paths: [XY[], string, number][] = [];
            if (avOpen()) {
              paths.push([[[RA.x, cy - S * 0.9], [RA.x, RA.y], [RV.x, RV.y]], BLUE, 1]);
              paths.push([[[LA.x + S * 0.3, cy - S * 0.6], [LA.x, LA.y], [LV.x, LV.y]], RED, 1]);
            }
            if (slOpen()) {
              paths.push([[[RV.x, RV.y], [cx - S * 0.1, cy - S * 0.55], [cx + S * 0.55, cy - S * 1.15]], BLUE, 1.6]);
              paths.push([[[LV.x, LV.y], [cx + S * 0.08, cy - S * 0.5], [cx - S * 0.45, cy - S * 1.1]], RED, 1.6]);
            }
            for (const [pts, col, sp] of paths)
              for (let i = 0; i < 7; i++) {
                const [x, y] = pathAt(pts, (clock() * 0.9 * sp + i / 7) % 1);
                g.fillStyle = mix(col, "#FFFFFF", 0.25);
                g.beginPath();
                g.ellipse(x, y, 9 * k, 6 * k, 0.5, 0, TAU);
                g.fill();
              }
          }}
        />,
      );
      // Phase readout and labels.
      nodes.push(
        <Txt
          text={() => (ph() < 0.15 ? "Tâm nhĩ co — đẩy máu xuống tâm thất" : ph() < 0.2 ? "Van nhĩ–thất đóng (tiếng “bùm”)" : ph() < 0.5 ? "Tâm thất co — máu lên động mạch phổi và động mạch chủ" : ph() < 0.56 ? "Van động mạch đóng (tiếng “bụp”)" : "Tâm trương — tim giãn, máu về đầy các ngăn")}
          x={cx}
          y={A.y + 20 * k}
          fontFamily={FONT}
          fontWeight={800}
          fontSize={26 * k}
          fill={L.text}
        />,
      );
      const names: [XY, string][] = [
        [[cx - S * 0.45, cy - S * 0.35], "Tâm nhĩ phải"],
        [[cx + S * 0.45, cy - S * 0.35], "Tâm nhĩ trái"],
        [[cx - S * 0.35, cy + S * 0.35], "Tâm thất phải"],
        [[cx + S * 0.3, cy + S * 0.35], "Tâm thất trái"],
      ];
      for (const [[x, y], nm] of names) {
        const s = createSignal(0);
        shows.push(s);
        nodes.push(<Node opacity={s}>{label(ctx, nm, { x, y, size: 21, fill: "#FFFFFF" })}</Node>);
      }
      if (p.ecg) {
        const ex = A.wide ? A.x + HW + 20 * k : A.x + 20 * k, ew = A.wide ? A.w - HW - 40 * k : A.w - 40 * k;
        const ey = A.wide ? A.cy : A.y + A.h * 0.82, eh = A.wide ? A.h * 0.4 : A.h * 0.22;
        const s = createSignal(0);
        panels.push(s);
        nodes.push(
          <Node opacity={s}>
            <Rect x={ex + ew / 2} y={ey} width={ew} height={eh} radius={12 * k} fill="rgba(0,20,10,0.55)" stroke={alpha("#21E6A1", 0.4)} lineWidth={2 * k} />
            <Draw
              paint={(g) => {
                // Sweep display: two beats across, the newest trace bright.
                const span = period * 2.2, now = clock();
                g.strokeStyle = "#21E6A1";
                g.lineWidth = 3 * k;
                g.shadowColor = "#21E6A1";
                g.shadowBlur = 8 * k * L.visual.glow;
                g.beginPath();
                for (let i = 0; i <= 300; i++) {
                  const tt = now - span + (i / 300) * span;
                  const x = ex + 10 * k + (i / 300) * (ew - 20 * k), y = ey + eh * 0.2 - ecgAt(tt / period) * eh * 0.55;
                  if (i) g.lineTo(x, y);
                  else g.moveTo(x, y);
                }
                g.stroke();
                g.shadowBlur = 0;
              }}
            />
            <Txt text={`Điện tâm đồ · ${p.bpm} nhịp/phút (chiếu chậm 2×)`} x={ex + 14 * k} y={ey - eh / 2 + 20 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill="#8BFFCB" />
          </Node>,
        );
      }
    } else {
      // ---- double circulation loops.
      const cx = A.cx, cy = A.cy + A.h * 0.05, S = Math.min(A.w, A.h) * 0.42;
      const heart: XY = [cx, cy];
      const lungs: XY = [cx, cy - S * 0.85], body: XY = [cx, cy + S * 0.9];
      const pul: XY[] = [[cx - S * 0.12, cy - S * 0.1], [cx - S * 0.55, cy - S * 0.5], [lungs[0] - S * 0.3, lungs[1]], [lungs[0] + S * 0.3, lungs[1]], [cx + S * 0.55, cy - S * 0.5], [cx + S * 0.12, cy - S * 0.1]];
      const sys: XY[] = [[cx + S * 0.12, cy + S * 0.1], [cx + S * 0.9, cy + S * 0.3], [body[0] + S * 0.45, body[1]], [body[0] - S * 0.45, body[1]], [cx - S * 0.9, cy + S * 0.3], [cx - S * 0.12, cy + S * 0.1]];
      nodes.push(
        <Draw
          paint={(g) => {
            const draw = (pts: XY[], c1: string, c2: string, swap: number) => {
              for (let i = 1; i < pts.length; i++) {
                const u = i / (pts.length - 1);
                g.strokeStyle = u < swap ? c1 : c2;
                g.lineWidth = 16 * k;
                g.lineCap = "round";
                g.beginPath();
                g.moveTo(...pts[i - 1]);
                g.lineTo(...pts[i]);
                g.stroke();
              }
              for (let i = 0; i < 14; i++) {
                const u = (clock() * 0.12 * st.speed + i / 14) % 1;
                const [x, y] = pathAt(pts, u);
                g.fillStyle = mix(u < swap ? c1 : c2, "#FFFFFF", 0.3);
                g.beginPath();
                g.ellipse(x, y, 9 * k, 6 * k, 0, 0, TAU);
                g.fill();
              }
            };
            draw(pul, BLUE, RED, 0.5);
            draw(sys, RED, BLUE, 0.5);
            // Organs.
            g.fillStyle = "#F28BA0";
            for (const s of [-1, 1]) {
              g.beginPath();
              g.ellipse(lungs[0] + s * S * 0.3, lungs[1], S * 0.22, S * 0.28, 0, 0, TAU);
              g.fill();
            }
            g.fillStyle = "#C9A27A";
            g.beginPath();
            g.ellipse(body[0], body[1], S * 0.5, S * 0.16, 0, 0, TAU);
            g.fill();
            const b = 1 + 0.06 * vent();
            g.fillStyle = "#B83A4B";
            g.beginPath();
            g.ellipse(heart[0], heart[1], S * 0.2 * b, S * 0.22 * b, 0, 0, TAU);
            g.fill();
          }}
        />,
      );
      const items: [XY, string][] = [
        [[lungs[0], lungs[1] - S * 0.36], "Phổi — máu nhận O₂, thải CO₂"],
        [[body[0], body[1] + S * 0.24], "Các cơ quan — máu nhả O₂"],
        [[cx - S * 0.75, cy - S * 0.55], "Vòng tuần hoàn phổi (nhỏ)"],
        [[cx + S * 0.95, cy + S * 0.55], "Vòng tuần hoàn lớn"],
      ];
      for (const [[x, y], nm] of items) {
        const s = createSignal(0);
        shows.push(s);
        nodes.push(<Node opacity={s}>{label(ctx, nm, { x, y, size: 24, fill: L.text })}</Node>);
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
    for (const s of panels) yield s(1, 0.6);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void Line;
    void smooth;
  },
});
