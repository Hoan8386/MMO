// A eukaryotic cell drawn organelle by organelle: plasma membrane (lipid bilayer rim), nucleus with
// nuclear envelope pores, nucleolus and chromatin; mitochondria with folded cristae; rough ER studded
// with ribosomes; smooth ER; Golgi stacks; lysosomes; free ribosomes; centrosome; cytoskeleton.
// Plant cells add a cell wall, a large central vacuole and chloroplasts with thylakoid stacks (grana),
// and cytoplasmic streaming carries the chloroplasts around. Vesicles bud from the ER, pass through the
// Golgi and fuse with the membrane (secretion). Labels come one by one; `focus` zooms the camera onto
// one organelle at the end.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng } from "../../../shared/time";
import { pathAt } from "../../../shared/fx";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  type: "animal" | "plant";
  organelles: string[];
  labels: boolean;
  transport: boolean;
  focus: "none" | "nucleus" | "mitochondrion" | "chloroplast" | "golgi" | "er";
}

const TAU = Math.PI * 2;
type XY = [number, number];
const ALL = ["nucleus", "mitochondrion", "rough_er", "smooth_er", "golgi", "lysosome", "ribosome", "centrosome", "cytoskeleton", "vacuole", "chloroplast", "cell_wall"];
const NAMES: Record<string, string> = {
  nucleus: "Nhân — chứa ADN",
  mitochondrion: "Ty thể — tạo ATP",
  rough_er: "Lưới nội chất hạt — tổng hợp protein",
  smooth_er: "Lưới nội chất trơn — tổng hợp lipid",
  golgi: "Bộ máy Golgi — đóng gói, vận chuyển",
  lysosome: "Lysosome — tiêu hoá",
  ribosome: "Ribosome",
  centrosome: "Trung thể",
  cytoskeleton: "Bộ khung tế bào",
  vacuole: "Không bào trung tâm",
  chloroplast: "Lục lạp — quang hợp",
  cell_wall: "Thành tế bào (cellulose)",
  membrane: "Màng tế bào",
};

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "cell_biology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const R0 = rng(L.seed + 51);
    const plant = p.type === "plant";
    const want = new Set((p.organelles.length ? p.organelles : ALL).filter((o) => (plant ? o !== "centrosome" && o !== "lysosome" : o !== "vacuole" && o !== "chloroplast" && o !== "cell_wall")));
    const has = (o: string) => want.has(o);
    // Cell outline: a soft blob (animal) or a rounded rectangle (plant).
    const W = Math.min(A.w * (p.labels && A.wide ? 0.6 : 0.9), plant ? A.h * 1.45 : A.h * 1.3), H = Math.min(A.h * 0.92, W * (plant ? 0.7 : 0.78));
    const cx = A.x + (p.labels && A.wide ? A.w * 0.36 : A.w / 2), cy = A.cy;
    const blob = (a: number) => 1 + 0.05 * Math.sin(a * 3 + 0.5) + 0.03 * Math.sin(a * 5 + 1.7);
    const rim = (a: number, s = 1, wob = 0): XY => {
      if (plant) {
        // Superellipse for a boxy plant cell.
        const c = Math.cos(a), si = Math.sin(a), n = 6;
        const r = 1 / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(si), n), 1 / n);
        return [cx + c * r * (W / 2) * s, cy + si * r * (H / 2) * s];
      }
      const b = blob(a) + wob;
      return [cx + Math.cos(a) * (W / 2) * b * s, cy + Math.sin(a) * (H / 2) * b * s];
    };
    const rimPts = (s: number, wob: () => number = () => 0) => () => Array.from({ length: 121 }, (_, i): XY => rim((i / 120) * TAU, s, wob() * Math.sin(i * 0.4 + clock())));

    // Positions (fractions of the half-axes).
    const P = (fx: number, fy: number): XY => [cx + fx * (W / 2), cy + fy * (H / 2)];
    const nuc: XY = plant ? P(-0.55, -0.45) : P(-0.05, -0.02);
    const nucR = Math.min(W, H) * (plant ? 0.13 : 0.17);
    const golgiAt: XY = plant ? P(0.45, 0.5) : P(0.45, 0.22);
    const erAt: XY = plant ? P(-0.2, -0.35) : P(-0.32, 0.25);
    const vac: XY = P(0.05, 0.05);

    // ---- static-ish drawing (wobbling with time).
    const nodes: Node[] = [];
    const t = () => clock();
    const cyto = (g: CanvasRenderingContext2D) => {
      // Cytoplasm fill with a soft gradient.
      const gr = g.createRadialGradient(cx - W * 0.1, cy - H * 0.15, 0, cx, cy, Math.max(W, H) * 0.6);
      gr.addColorStop(0, alpha(L.primary, 0.16));
      gr.addColorStop(1, alpha(L.primary, 0.06));
      g.fillStyle = gr;
      g.beginPath();
      rimPts(0.98)().forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      // Cytoskeleton: faint filaments.
      if (has("cytoskeleton")) {
        const r = rng(9);
        g.strokeStyle = alpha(L.ink, 0.07);
        g.lineWidth = 1.5 * k;
        for (let i = 0; i < 26; i++) {
          const a = r() * TAU, b2 = a + (r() - 0.5) * 2;
          const [x1, y1] = rim(a, 0.92), [x2, y2] = rim(b2 + Math.PI, 0.92);
          g.beginPath();
          g.moveTo(x1, y1);
          g.quadraticCurveTo(cx + (r() - 0.5) * W * 0.4, cy + (r() - 0.5) * H * 0.4, x2, y2);
          g.stroke();
        }
      }
    };
    const membrane = (g: CanvasRenderingContext2D) => {
      if (plant && has("cell_wall")) {
        g.strokeStyle = "#7CBF4A";
        g.lineWidth = 16 * k;
        g.beginPath();
        rimPts(1.04)().forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.stroke();
        g.strokeStyle = alpha("#C7F0A0", 0.35);
        g.lineWidth = 3 * k;
        g.stroke();
      }
      // Bilayer: two thin lines with head-group dots between.
      const pts = rimPts(1, () => (plant ? 0 : 0.008))();
      for (const [s, a] of [[0.995, 0.9], [1.0, 0.5]] as [number, number][]) {
        g.strokeStyle = alpha(L.secondary, a);
        g.lineWidth = (s === 1 ? 5 : 2.5) * k;
        g.beginPath();
        pts.forEach(([x, y], i) => {
          const xx = cx + (x - cx) * s, yy = cy + (y - cy) * s;
          if (i) g.lineTo(xx, yy);
          else g.moveTo(xx, yy);
        });
        g.closePath();
        g.stroke();
      }
    };
    const vacuole = (g: CanvasRenderingContext2D) => {
      if (!has("vacuole")) return;
      g.fillStyle = alpha("#75C8FF", 0.16);
      g.strokeStyle = alpha("#9FD9FF", 0.6);
      g.lineWidth = 3 * k;
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const a = (i / 80) * TAU, r = 1 + 0.06 * Math.sin(a * 4 + t() * 0.6);
        const x = vac[0] + Math.cos(a) * W * 0.24 * r, y = vac[1] + Math.sin(a) * H * 0.3 * r;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
    };
    const nucleus = (g: CanvasRenderingContext2D) => {
      if (!has("nucleus")) return;
      const [x, y] = nuc;
      const gr = g.createRadialGradient(x - nucR * 0.3, y - nucR * 0.3, 0, x, y, nucR);
      gr.addColorStop(0, mix(L.accent, "#FFFFFF", 0.25));
      gr.addColorStop(1, mix(L.accent, "#000000", 0.35));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, nucR, 0, TAU);
      g.fill();
      // Double envelope with pores.
      g.strokeStyle = mix(L.accent, "#FFFFFF", 0.4);
      g.lineWidth = 3 * k;
      g.beginPath();
      g.arc(x, y, nucR * 1.04, 0, TAU);
      g.stroke();
      g.fillStyle = L.bg;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(a) * nucR * 1.02, y + Math.sin(a) * nucR * 1.02, 4 * k, 0, TAU);
        g.fill();
      }
      // Chromatin squiggles and the nucleolus.
      const r = rng(4);
      g.strokeStyle = alpha("#FFFFFF", 0.3);
      g.lineWidth = 2 * k;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        let px = x + (r() - 0.5) * nucR, py = y + (r() - 0.5) * nucR;
        g.moveTo(px, py);
        for (let j = 0; j < 6; j++) {
          px += (r() - 0.5) * nucR * 0.35;
          py += (r() - 0.5) * nucR * 0.35;
          g.lineTo(px, py);
        }
        g.stroke();
      }
      g.fillStyle = mix(L.accent, "#000000", 0.55);
      g.beginPath();
      g.arc(x + nucR * 0.25, y + nucR * 0.15, nucR * 0.3, 0, TAU);
      g.fill();
    };
    // Mitochondria: capsules with a folded inner membrane, slowly drifting.
    const mitos = Array.from({ length: plant ? 4 : 6 }, (_, i) => {
      const a = R0() * TAU, d = 0.45 + R0() * 0.35;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, rot: R0() * 180, ph: R0() * TAU, i };
    }).filter((m) => Math.hypot(m.x - (nuc[0] - cx) / (W / 2), m.y - (nuc[1] - cy) / (H / 2)) > 0.45);
    const mitoAt = (m: (typeof mitos)[0]): XY => P(m.x + Math.sin(t() * 0.3 + m.ph) * 0.02, m.y + Math.cos(t() * 0.25 + m.ph) * 0.02);
    const drawMito = (g: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      const w = s, h = s * 0.48;
      g.fillStyle = "#FF8A5B";
      g.strokeStyle = "#FFC2A8";
      g.lineWidth = 3 * k;
      g.beginPath();
      g.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
      g.fill();
      g.stroke();
      g.strokeStyle = "#B8452A";
      g.lineWidth = 2.5 * k;
      g.beginPath();
      g.moveTo(-w * 0.42, 0);
      for (let i = 0; i <= 8; i++) {
        const xx = -w * 0.42 + (i / 8) * w * 0.84;
        g.lineTo(xx, (i % 2 ? -1 : 1) * h * 0.32);
      }
      g.stroke();
      g.restore();
    };
    const mitoPaint = (g: CanvasRenderingContext2D) => {
      if (!has("mitochondrion")) return;
      for (const m of mitos) {
        const [x, y] = mitoAt(m);
        drawMito(g, x, y, (m.rot * Math.PI) / 180 + Math.sin(t() * 0.2 + m.ph) * 0.1, Math.min(W, H) * 0.14);
      }
    };
    // Chloroplasts: lens shapes with stacked thylakoids, carried by cytoplasmic streaming.
    const chloros = Array.from({ length: 9 }, (_, i) => ({ u: i / 9, s: 0.86 + R0() * 0.06, rot: R0() }));
    const chloroAt = (c: (typeof chloros)[0]): XY => rim(c.u * TAU + t() * 0.06 * st.speed, c.s);
    const chloroPaint = (g: CanvasRenderingContext2D) => {
      if (!has("chloroplast")) return;
      for (const c of chloros) {
        const [x, y] = chloroAt(c);
        const a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
        g.save();
        g.translate(x, y);
        g.rotate(a);
        const w = Math.min(W, H) * 0.14, h = w * 0.5;
        g.fillStyle = "#3FBF55";
        g.strokeStyle = "#A6F08C";
        g.lineWidth = 2.5 * k;
        g.beginPath();
        g.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = "#1E7A33";
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.fillRect(-w * 0.32 + i * w * 0.18, -h * 0.25 + j * h * 0.18, w * 0.12, h * 0.12);
        g.restore();
      }
    };
    // ER: concentric folded sheets beside the nucleus; ribosome dots on the rough part.
    const erPaint = (g: CanvasRenderingContext2D) => {
      const [x0, y0] = erAt;
      if (has("rough_er"))
        for (let i = 0; i < 4; i++) {
          g.strokeStyle = "#B794F6";
          g.lineWidth = 6 * k;
          g.beginPath();
          const pts: XY[] = [];
          for (let j = 0; j <= 30; j++) {
            const u = j / 30;
            pts.push([x0 - W * 0.12 + u * W * 0.24, y0 + i * H * 0.05 + Math.sin(u * 9 + i) * H * 0.012]);
          }
          pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
          if (has("ribosome")) {
            g.fillStyle = "#3D2A73";
            for (let j = 0; j < 30; j += 2) {
              const [x, y] = pts[j];
              g.beginPath();
              g.arc(x, y - 5 * k, 3 * k, 0, TAU);
              g.fill();
            }
          }
        }
      if (has("smooth_er")) {
        g.strokeStyle = "#D0A2FF";
        g.lineWidth = 5 * k;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          for (let j = 0; j <= 30; j++) {
            const u = j / 30;
            const x = x0 + W * 0.14 + Math.sin(u * 6 + i) * W * 0.02 + i * W * 0.03, y = y0 - H * 0.05 + u * H * 0.18;
            if (j) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
    };
    const golgiPaint = (g: CanvasRenderingContext2D) => {
      if (!has("golgi")) return;
      const [x, y] = golgiAt;
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = i % 2 ? "#FFD166" : "#FFB703";
        g.lineWidth = 7 * k;
        g.lineCap = "round";
        g.beginPath();
        g.arc(x, y + H * 0.18 + i * H * 0.03, W * (0.1 - i * 0.008), -Math.PI * 0.82, -Math.PI * 0.18);
        g.stroke();
      }
    };
    const lysoPts = Array.from({ length: 5 }, () => [R0() * 1.2 - 0.6, R0() * 1.2 - 0.6]);
    const smallPaint = (g: CanvasRenderingContext2D) => {
      if (has("lysosome"))
        for (const [fx, fy] of lysoPts) {
          const [x, y] = P(fx, fy);
          g.fillStyle = "#FF6B81";
          g.beginPath();
          g.arc(x, y, Math.min(W, H) * 0.025, 0, TAU);
          g.fill();
          g.fillStyle = "#FFC2CC";
          g.beginPath();
          g.arc(x - 3 * k, y - 3 * k, Math.min(W, H) * 0.008, 0, TAU);
          g.fill();
        }
      if (has("ribosome")) {
        const r = rng(21);
        g.fillStyle = "#5B3FA6";
        for (let i = 0; i < 70; i++) {
          const a = r() * TAU, d = Math.sqrt(r()) * 0.88;
          const [x, y] = P(Math.cos(a) * d, Math.sin(a) * d);
          if (Math.hypot(x - nuc[0], y - nuc[1]) < nucR * 1.15) continue;
          g.beginPath();
          g.arc(x, y, 2.6 * k, 0, TAU);
          g.fill();
        }
      }
      if (has("centrosome")) {
        const [x, y] = P(0.18, -0.3);
        g.fillStyle = "#9FE870";
        g.save();
        g.translate(x, y);
        g.fillRect(-14 * k, -5 * k, 28 * k, 10 * k);
        g.rotate(Math.PI / 2);
        g.fillRect(-4 * k, 6 * k, 28 * k, 10 * k);
        g.restore();
      }
    };
    // Vesicle transport: ER → Golgi → membrane (exocytosis), several in flight.
    const route: XY[] = [[erAt[0] + W * 0.12, erAt[1]], [golgiAt[0] - W * 0.05, golgiAt[1] + H * 0.22], [golgiAt[0] + W * 0.05, golgiAt[1] + H * 0.12], rim(-0.3, 0.97)];
    const vesPaint = (g: CanvasRenderingContext2D) => {
      if (!p.transport || !has("golgi")) return;
      for (let i = 0; i < 4; i++) {
        const u = (t() * 0.09 * st.speed + i / 4) % 1;
        const [x, y] = pathAt(route, u);
        g.fillStyle = "#FFE08A";
        g.strokeStyle = "#FFF4CF";
        g.lineWidth = 2 * k;
        g.beginPath();
        g.arc(x, y, 9 * k * (u > 0.95 ? (1 - u) / 0.05 : 1), 0, TAU);
        g.fill();
        g.stroke();
      }
    };
    nodes.push(<Draw paint={cyto} />, <Draw paint={vacuole} />, <Draw paint={erPaint} />, <Draw paint={golgiPaint} />, <Draw paint={smallPaint} />, <Draw paint={mitoPaint} />, <Draw paint={chloroPaint} />, <Draw paint={nucleus} />, <Draw paint={vesPaint} />, <Draw paint={membrane} />);

    // ---- labels: one leader line per organelle to a column on the right (wide) or below.
    const items: { key: string; at: () => XY }[] = [];
    items.push({ key: "membrane", at: () => rim(-1.2, 1) });
    if (plant && has("cell_wall")) items.push({ key: "cell_wall", at: () => rim(-0.7, 1.04) });
    if (has("nucleus")) items.push({ key: "nucleus", at: () => nuc });
    if (has("mitochondrion") && mitos.length) items.push({ key: "mitochondrion", at: () => mitoAt(mitos[0]) });
    if (has("chloroplast")) items.push({ key: "chloroplast", at: () => chloroAt(chloros[2]) });
    if (has("vacuole")) items.push({ key: "vacuole", at: () => vac });
    if (has("rough_er")) items.push({ key: "rough_er", at: () => [erAt[0] - W * 0.05, erAt[1] + H * 0.05] });
    if (has("smooth_er")) items.push({ key: "smooth_er", at: () => [erAt[0] + W * 0.16, erAt[1] + H * 0.05] });
    if (has("golgi")) items.push({ key: "golgi", at: () => [golgiAt[0], golgiAt[1] + H * 0.2] });
    if (has("lysosome")) items.push({ key: "lysosome", at: () => P(lysoPts[0][0], lysoPts[0][1]) });
    if (has("ribosome")) items.push({ key: "ribosome", at: () => P(0.55, -0.55) });
    // Label column in the order of the organelles' heights, so leader lines do not cross.
    if (A.wide) items.sort((a, b) => a.at()[1] - b.at()[1]);
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const n = items.length;
    const colX = A.wide ? A.x + A.w * 0.72 : 0;
    const labelNodes = p.labels
      ? items.map((it, i) => {
          const s = createSignal(0);
          shows.push(s);
          const ly = A.wide ? A.y + (A.h * (i + 0.5)) / n : 0;
          const to = (): XY => (A.wide ? [colX, ly] : [it.at()[0] + (it.at()[0] > cx ? 1 : -1) * 70 * k, it.at()[1] - 50 * k]);
          return (
            <Node opacity={s}>
              <Line points={() => [it.at(), [to()[0] - (A.wide ? 14 * k : 0), to()[1]], to()]} stroke={alpha(L.ink, 0.7)} lineWidth={L.lw(2 * k)} />
              <Rect position={it.at} size={10 * k} radius={5 * k} fill={L.ink} />
              <Txt text={NAMES[it.key]} x={() => to()[0] + (A.wide || it.at()[0] > cx ? 10 : -10) * k} y={() => to()[1]} offsetX={() => (A.wide || it.at()[0] > cx ? -1 : 1)} fontFamily={FONT} fontWeight={700} fontSize={(A.wide ? 25 : 22) * k} fill={L.text} shadowColor="rgba(0,0,0,0.85)" shadowBlur={6 * k} />
            </Node>
          );
        })
      : [];

    // ---- focus: zoom the camera onto an organelle at the end.
    const focusAt: Record<string, () => XY> = { nucleus: () => nuc, mitochondrion: () => (mitos[0] ? mitoAt(mitos[0]) : nuc), chloroplast: () => chloroAt(chloros[2]), golgi: () => golgiAt, er: () => erAt };
    const lens = createRef<Node>();
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={lens}>
          <Node ref={world} opacity={0} scale={0.94}>
            {nodes}
          </Node>
        </Node>
        {labelNodes}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* all(world().opacity(1, 0.8, easeOutCubic), world().scale(1, 1, easeOutCubic));
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.4));
    const focusing = p.focus !== "none" && focusAt[p.focus];
    const nSteps = steps.length + (focusing ? 1 : 0);
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, nSteps + 1));
      yield steps[i]();
    }
    if (focusing) {
      yield* until(ctx.cue(steps.length, nSteps + 1));
      const [fx, fy] = focusAt[p.focus]();
      const z = 2.4;
      // Labels fade so the zoomed organelle stands alone; scaling about the frame origin, the shift
      // brings the organelle to the centre of the drawing area.
      for (const s of shows) yield s(0, 0.5);
      yield* all(lens().scale(z, 1.6, easeInOutCubic), lens().position([A.cx - z * fx, A.cy - z * fy], 1.6, easeInOutCubic));
    }
  },
});
