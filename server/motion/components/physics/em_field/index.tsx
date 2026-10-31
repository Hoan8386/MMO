// Electric field of point charges. Field lines are traced numerically from the positive charges along
// E = Σ q·r̂/r² (normalised RK2 steps) until they reach a negative charge or leave the view, so their
// shape and density are the real field's; small arrows ride along them in the field's direction.
// Optional: equipotential shading of V = Σ q/r (red positive, blue negative; a Raster), a grid of
// field vectors, and a light positive test charge pushed along a line.
import { Circle, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear, sequence } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster, rgb } from "../../../shared/raster";
import { glow } from "../../../shared/fx";
import { label, FONT } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { fadeUp, popIn } from "../../../transitions";

interface Props {
  title: string;
  preset: "dipole" | "like" | "single" | "quadrupole" | "custom";
  charges: { q: number; x: number; y: number }[];
  linesPerCharge: number;
  showPotential: boolean;
  showVectors: boolean;
  testCharge: boolean;
}

const PRESETS: Record<string, { q: number; x: number; y: number }[]> = {
  dipole: [{ q: 1, x: -0.35, y: 0 }, { q: -1, x: 0.35, y: 0 }],
  like: [{ q: 1, x: -0.35, y: 0 }, { q: 1, x: 0.35, y: 0 }],
  single: [{ q: 1, x: 0, y: 0 }],
  quadrupole: [{ q: 1, x: -0.3, y: -0.3 }, { q: -1, x: 0.3, y: -0.3 }, { q: -1, x: -0.3, y: 0.3 }, { q: 1, x: 0.3, y: 0.3 }],
};

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "electromagnetism");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const list = p.preset === "custom" && p.charges.length ? p.charges : PRESETS[p.preset] || PRESETS.dipole;
    // Charge positions: x, y in [-1, 1] of the half-size of the view.
    const S = Math.min(A.w, A.h) / 2;
    const Q = list.map((c) => ({ q: c.q, x: A.cx + c.x * S, y: A.cy + c.y * S }));
    const rq = 26 * k;
    const E = (x: number, y: number): [number, number] => {
      let ex = 0, ey = 0;
      for (const c of Q) {
        const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy + 1e-6, r = Math.sqrt(r2);
        ex += (c.q * dx) / (r2 * r);
        ey += (c.q * dy) / (r2 * r);
      }
      return [ex, ey];
    };
    const inside = (x: number, y: number) => x > A.x + 4 * k && x < A.x + A.w - 4 * k && y > A.y + 4 * k && y < A.y + A.h - 4 * k;
    // Trace from the positive charges (or from the negative ones backwards if there are no positives).
    const sources = Q.some((c) => c.q > 0) ? Q.filter((c) => c.q > 0) : Q;
    const dir = Q.some((c) => c.q > 0) ? 1 : -1;
    const lines: [number, number][][] = [];
    for (const c of sources) {
      const n = Math.round(p.linesPerCharge * Math.abs(c.q));
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        let x = c.x + Math.cos(a) * rq * 1.05, y = c.y + Math.sin(a) * rq * 1.05;
        const pts: [number, number][] = [[x, y]];
        const h = 4 * k;
        for (let s = 0; s < 1400; s++) {
          let [ex, ey] = E(x, y);
          let m = Math.hypot(ex, ey) || 1;
          const mx = x + (dir * h * ex) / m / 2, my = y + (dir * h * ey) / m / 2;
          [ex, ey] = E(mx, my);
          m = Math.hypot(ex, ey) || 1;
          x += (dir * h * ex) / m;
          y += (dir * h * ey) / m;
          if (!inside(x, y)) break;
          pts.push([x, y]);
          if (Q.some((o) => o !== c && Math.hypot(x - o.x, y - o.y) < rq * 0.9)) break;
        }
        if (pts.length > 3) lines.push(pts);
      }
    }
    const grow = createSignal(0);
    const flow = createSignal(0);
    const potOn = createSignal(0);
    const vecOn = createSignal(0);
    const testU = createSignal(-1);
    const testLine = lines.length ? lines[Math.floor(lines.length / 2) % lines.length] : null;
    const red = L.primary, blue = L.secondary;

    const paint = (g: CanvasRenderingContext2D) => {
      const u = grow();
      g.lineCap = "round";
      for (const pts of lines) {
        const m = Math.max(2, Math.floor(pts.length * u));
        g.strokeStyle = alpha(L.text.startsWith("#") ? L.text : "#F9FAFB", 0.55);
        g.lineWidth = 2.2 * k;
        g.beginPath();
        for (let i = 0; i < m; i++) (i ? g.lineTo : g.moveTo).call(g, pts[i][0], pts[i][1]);
        g.stroke();
        // Arrow heads flowing along the line in the field direction.
        if (u >= 1) {
          const gap = 70;
          for (let j = Math.floor((flow() * 24) % gap); j < pts.length - 2; j += gap) {
            const [x1, y1] = pts[j], [x2, y2] = pts[j + 2];
            const a = Math.atan2((y2 - y1) * dir, (x2 - x1) * dir), s = 9 * k;
            g.fillStyle = L.accent;
            g.beginPath();
            g.moveTo(x1 + Math.cos(a) * s, y1 + Math.sin(a) * s);
            g.lineTo(x1 + Math.cos(a + 2.5) * s, y1 + Math.sin(a + 2.5) * s);
            g.lineTo(x1 + Math.cos(a - 2.5) * s, y1 + Math.sin(a - 2.5) * s);
            g.fill();
          }
        }
      }
      // Field vectors on a grid (length ∝ log of strength, so near and far both show).
      if (vecOn() > 0) {
        const step = 70 * k;
        g.strokeStyle = alpha(L.highlight, 0.8 * vecOn());
        g.lineWidth = 2 * k;
        for (let x = A.x + step / 2; x < A.x + A.w; x += step)
          for (let y = A.y + step / 2; y < A.y + A.h; y += step) {
            if (Q.some((c) => Math.hypot(x - c.x, y - c.y) < rq * 1.6)) continue;
            const [ex, ey] = E(x, y), m = Math.hypot(ex, ey);
            const l = clamp(Math.log10(m * S * S * 4 + 1) * 14 * k, 6 * k, step * 0.45);
            g.beginPath();
            g.moveTo(x - ((ex / m) * l) / 2, y - ((ey / m) * l) / 2);
            g.lineTo(x + ((ex / m) * l) / 2, y + ((ey / m) * l) / 2);
            g.stroke();
          }
      }
      // Test charge riding along one line.
      const tu = testU();
      if (testLine && tu >= 0) {
        const i = Math.min(testLine.length - 1, Math.floor(tu * (testLine.length - 1)));
        const [x, y] = testLine[i];
        g.fillStyle = L.accent;
        g.shadowColor = L.accent;
        g.shadowBlur = 18 * k;
        g.beginPath();
        g.arc(x, y, 10 * k, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    };
    // Equipotential shading: colour by V, darker bands every step (contours).
    const [rr, rg, rb] = rgb(red), [br, bg, bb] = rgb(blue);
    const paintV = (data: Uint8ClampedArray, cols: number, rows: number) => {
      const on = potOn();
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x = A.x + ((i + 0.5) / cols) * A.w, y = A.y + ((j + 0.5) / rows) * A.h;
          let v = 0;
          for (const c of Q) v += c.q / Math.max(rq * 0.6, Math.hypot(x - c.x, y - c.y));
          v *= S * 0.25;
          const band = 1 - clamp(Math.abs((((v * 3) % 1) + 1) % 1 - 0.5) / 0.09, 0, 1);
          const s = clamp(Math.abs(v), 0, 1.5) / 1.5;
          const o = (j * cols + i) * 4;
          const [cr, cg, cb] = v > 0 ? [rr, rg, rb] : [br, bg, bb];
          data[o] = cr;
          data[o + 1] = cg;
          data[o + 2] = cb;
          data[o + 3] = 255 * on * clamp(s * 0.35 + band * 0.35 * Math.min(1, s * 4), 0, 0.7);
        }
    };

    const title = createRef<Txt>();
    const charges: Node[] = [];
    st.cam.add(
      <Node>
        {p.showPotential ? <Raster x={A.cx} y={A.cy} w={A.w} h={A.h} res={420} paint={paintV} /> : null}
        <Draw paint={paint} />
        {Q.map((c) => (
          <Node ref={(n: Node) => charges.push(n)} position={[c.x, c.y]}>
            <Circle size={rq * 2} fill={c.q > 0 ? red : blue} {...glow(c.q > 0 ? red : blue, 26 * k)} />
            <Txt text={c.q > 0 ? "+" : "−"} fontFamily={FONT} fontWeight={800} fontSize={40 * k} fill="#FFFFFF" />
          </Node>
        ))}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Txt x={A.x + A.w} y={A.y + A.h - 14 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={22 * k} fill={L.dim} text="đường sức: từ điện tích + sang điện tích −" />
      </Node>,
    );

    yield st.camera();
    yield flow(D, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    yield* sequence(0.15, ...charges.map((c) => popIn(c, 0.4)));
    yield* grow(1, 1.6, st.ease);
    const steps = (p.showPotential ? 1 : 0) + (p.showVectors ? 1 : 0) + (p.testCharge ? 1 : 0);
    let i = 0;
    if (p.showPotential) {
      yield* until(ctx.cue(i++, steps));
      yield* potOn(1, 0.8, st.ease);
    }
    if (p.showVectors) {
      yield* until(ctx.cue(i++, steps));
      yield* vecOn(1, 0.6, st.ease);
    }
    if (p.testCharge) {
      yield* until(ctx.cue(i++, steps));
      testU(0);
      yield* all(testU(1, Math.max(1.5, Math.min(4, D - ctx.cue(i - 1, steps) - 0.5)), (x) => x * x));
    }
  },
});
