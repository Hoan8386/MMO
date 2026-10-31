// Fibonacci squares and the golden spiral: squares of side 1, 1, 2, 3, 5, 8… are laid around each
// other (right, up, left, down), each new side the sum of the two before; a quarter circle in every
// square joins into a spiral. Beside it, the ratio of consecutive terms F(n+1)/F(n) closes in on the
// golden ratio φ = (1 + √5)/2 ≈ 1.618034.
import { Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeOutBack } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  terms: number;
  showRatios: boolean;
  showNumbers: boolean;
}

const PHI = (1 + Math.sqrt(5)) / 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "number_theory");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const n = p.terms;
    const F = [1, 1];
    while (F.length < n) F.push(F[F.length - 1] + F[F.length - 2]);
    // Layout in units (y up): square i, its arc centre and start angle.
    type Sq = { x0: number; y0: number; s: number; cx: number; cy: number; a0: number };
    const sq: Sq[] = [];
    let bx0 = 0, by0 = 0, bx1 = 1, by1 = 1;
    sq.push({ x0: 0, y0: 0, s: 1, cx: 1, cy: 1, a0: 180 });
    for (let i = 1; i < n; i++) {
      const s = F[i], dir = (i - 1) % 4;
      let q: Sq;
      if (dir === 0) q = { x0: bx1, y0: by0, s, cx: bx1, cy: by0 + s, a0: 270 };
      else if (dir === 1) q = { x0: bx0, y0: by1, s, cx: bx0, cy: by1, a0: 0 };
      else if (dir === 2) q = { x0: bx0 - s, y0: by0, s, cx: bx0, cy: by0, a0: 90 };
      else q = { x0: bx0, y0: by0 - s, s, cx: bx0 + s, cy: by0, a0: 180 };
      sq.push(q);
      bx0 = Math.min(bx0, q.x0), by0 = Math.min(by0, q.y0), bx1 = Math.max(bx1, q.x0 + s), by1 = Math.max(by1, q.y0 + s);
    }
    // Fit: tiles on one side, ratios on the other (wide) or below (tall).
    const ratios = p.showRatios;
    const R = A.wide ? { x: A.x + A.w * 0.66, y: A.y, w: A.w * 0.34, h: A.h } : { x: A.x, y: A.y + A.h * 0.66, w: A.w, h: A.h * 0.34 };
    const T = ratios ? (A.wide ? { x: A.x, y: A.y, w: A.w * 0.64, h: A.h } : { x: A.x, y: A.y, w: A.w, h: A.h * 0.64 }) : A;
    const u = Math.min((T.w * 0.94) / (bx1 - bx0), (T.h * 0.94) / (by1 - by0));
    const ox = T.x + T.w / 2 - ((bx0 + bx1) / 2) * u, oy = T.y + T.h / 2 + ((by0 + by1) / 2) * u;
    const X = (x: number) => ox + x * u, Y = (y: number) => oy - y * u;
    const shown = createSignal(0); // squares shown (fractional: the last one growing)
    const arc = createSignal(0); // spiral drawn through this many squares

    const paint = (g: CanvasRenderingContext2D) => {
      const m = shown();
      for (let i = 0; i < n; i++) {
        const f = clamp(m - i, 0, 1);
        if (f <= 0) break;
        const q = sq[i], c = L.series[i % L.series.length];
        const cxs = X(q.x0 + q.s / 2), cys = Y(q.y0 + q.s / 2), w = q.s * u * (0.6 + 0.4 * easeOutBack(f));
        g.globalAlpha = f;
        g.fillStyle = alpha(c, 0.16);
        g.strokeStyle = c;
        g.lineWidth = 2.5 * k;
        g.fillRect(cxs - w / 2, cys - w / 2, w, w);
        g.strokeRect(cxs - w / 2, cys - w / 2, w, w);
        if (p.showNumbers && q.s * u > 26 * k) {
          g.fillStyle = c;
          g.font = `700 ${Math.min(60, Math.max(16, q.s * u * 0.28)) }px "Be Vietnam Pro"`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(F[i]), cxs, cys);
        }
        g.globalAlpha = 1;
      }
      // Spiral: quarter circles, each drawn as its square's turn comes.
      const a = arc();
      g.strokeStyle = L.text;
      g.lineWidth = 4.5 * k;
      g.shadowColor = L.accent;
      g.shadowBlur = 12 * k;
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const f = clamp(a - i, 0, 1);
        if (f <= 0) break;
        const q = sq[i];
        // Canvas angles run clockwise with y down: a maths angle θ is −θ on screen.
        const s0 = (-q.a0 * Math.PI) / 180, s1 = (-(q.a0 + 90 * f) * Math.PI) / 180;
        g.arc(X(q.cx), Y(q.cy), q.s * u, s0, s1, true);
      }
      g.stroke();
      g.shadowBlur = 0;
    };

    const title = createRef<Txt>();
    const rows: Txt[] = [];
    const rowH = Math.min(46 * k, (R.h - 120 * k) / Math.max(1, n - 1));
    const phiRef = createRef<Rect>();
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {ratios ? (
          <Node>
            {A.wide
              ? F.slice(1).map((v, i) => (
                  <Txt ref={(t: Txt) => (rows[i] = t)} x={R.x + 20 * k} y={R.y + 30 * k + i * rowH} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={Math.min(28, rowH / k / 1.5) * k} fill={L.dim} opacity={0} text={`${F[i + 1]} / ${F[i]} = ${num(F[i + 1] / F[i], 6)}`} />
                ))
              : F.slice(1).map((v, i) => (
                  <Txt ref={(t: Txt) => (rows[i] = t)} x={R.x + (i % 2 ? R.w * 0.52 : 10 * k)} y={R.y + 20 * k + Math.floor(i / 2) * 40 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={L.dim} opacity={0} text={`${F[i + 1]}/${F[i]} = ${num(F[i + 1] / F[i], 5)}`} />
                ))}
            <Rect ref={phiRef} x={R.x + R.w / 2} y={R.y + R.h - 40 * k} radius={16 * k} padding={[10 * k, 22 * k]} fill={alpha(L.accent, 0.15)} stroke={L.accent} lineWidth={2 * k} layout opacity={0}>
              <Txt fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={L.accent} text={`φ = (1 + √5) / 2 ≈ ${num(PHI, 6)}`} />
            </Rect>
          </Node>
        ) : null}
      </Node>,
    );

    yield st.camera();
    if (p.title) yield fadeUp(title(), 0.5);
    // Squares and spiral advance together; each step lights its ratio.
    const per = Math.max(0.35, (D - 2.2) / n);
    for (let i = 0; i < n; i++) {
      yield* all(shown(i + 1, per * 0.6), arc(i + 1, per * 0.9));
      if (ratios && i > 0 && rows[i - 1]) {
        rows[i - 1].opacity(1);
        if (i > 1) rows[i - 2].fill(L.dim);
        rows[i - 1].fill(L.text);
      }
    }
    if (ratios) {
      yield* until(ctx.cue(0, 1));
      yield* phiRef().opacity(1, 0.5, st.ease);
    }
  },
});
