// A 2×2 matrix as a transformation of the plane: the grid, the basis vectors î and ĵ and the unit square
// move smoothly from the identity to M (each point p goes to ((1−t)I + tM)·p). The columns of M are
// where î and ĵ land; the area of the unit square becomes |det M| (flipped orientation when det < 0).
// Optional: a vector v and its image Mv, and the eigenvectors — their lines stay put, the vectors on
// them only stretch by λ.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { glow } from "../../../shared/fx";
import { label, FONT } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  matrix: number[];
  vector: number[];
  showVector: boolean;
  showDeterminant: boolean;
  showEigen: boolean;
  range: number;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "linear_algebra");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const [a, b, c, d] = p.matrix; // M = [[a, b], [c, d]]: columns (a, c) and (b, d)
    const det = a * d - b * c;
    const n = p.range;
    // The matrix panel takes a side (wide) or the top (tall); the plane fills the rest.
    const panelW = A.wide ? 300 * k : 0, panelH = A.wide ? 0 : 150 * k;
    const P = { x: A.x + panelW, y: A.y + panelH, w: A.w - panelW, h: A.h - panelH };
    const ox = P.x + P.w / 2, oy = P.y + P.h / 2;
    const unit = Math.min(P.w, P.h) / (2 * n + 0.6);
    const t = createSignal(0);
    const M = () => {
      const u = t();
      return [1 - u + u * a, u * b, u * c, 1 - u + u * d];
    };
    const map = (x: number, y: number): [number, number] => {
      const [m0, m1, m2, m3] = M();
      return [ox + (m0 * x + m1 * y) * unit, oy - (m2 * x + m3 * y) * unit];
    };
    // Real eigenvalues/vectors of M.
    const tr = a + d, disc = tr * tr - 4 * det;
    const eig: { l: number; v: [number, number] }[] = [];
    if (disc >= 0) {
      for (const s of disc === 0 ? [1] : [1, -1]) {
        const l = (tr + s * Math.sqrt(disc)) / 2;
        let v: [number, number] = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : s > 0 ? [1, 0] : [0, 1];
        const m = Math.hypot(...v);
        v = [v[0] / m, v[1] / m];
        eig.push({ l, v });
      }
    }
    const eigOn = createSignal(0);
    const vecOn = createSignal(0);
    const detOn = createSignal(0);

    const paint = (g: CanvasRenderingContext2D) => {
      g.save();
      g.beginPath();
      g.rect(P.x, P.y, P.w, P.h);
      g.clip();
      // Fixed background grid, faint.
      g.strokeStyle = alpha(L.dim.startsWith("#") ? L.dim : "#9CA3AF", 0.18);
      g.lineWidth = 1 * k;
      g.beginPath();
      for (let i = -n * 2; i <= n * 2; i++) {
        g.moveTo(ox + i * unit, P.y);
        g.lineTo(ox + i * unit, P.y + P.h);
        g.moveTo(P.x, oy - i * unit);
        g.lineTo(P.x + P.w, oy - i * unit);
      }
      g.stroke();
      // Transformed grid.
      const ext = n * 3;
      g.strokeStyle = alpha("#60A5FA", 0.5);
      g.lineWidth = 2 * k;
      g.beginPath();
      for (let i = -ext; i <= ext; i++) {
        let q = map(i, -ext);
        g.moveTo(q[0], q[1]);
        q = map(i, ext);
        g.lineTo(q[0], q[1]);
        q = map(-ext, i);
        g.moveTo(q[0], q[1]);
        q = map(ext, i);
        g.lineTo(q[0], q[1]);
      }
      g.stroke();
      // Unit square → parallelogram of area |det|.
      if (detOn() > 0) {
        const q = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)];
        g.fillStyle = alpha(det < 0 ? L.highlight : L.accent, 0.3 * detOn());
        g.strokeStyle = alpha(det < 0 ? L.highlight : L.accent, detOn());
        g.lineWidth = 3 * k;
        g.beginPath();
        q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
        g.stroke();
      }
      // Eigen-lines: they map onto themselves.
      if (eigOn() > 0)
        for (const e of eig) {
          g.strokeStyle = alpha("#FDE68A", 0.75 * eigOn());
          g.lineWidth = 2.5 * k;
          g.setLineDash([10 * k, 8 * k]);
          g.beginPath();
          g.moveTo(ox - e.v[0] * unit * n * 3, oy + e.v[1] * unit * n * 3);
          g.lineTo(ox + e.v[0] * unit * n * 3, oy - e.v[1] * unit * n * 3);
          g.stroke();
          g.setLineDash([]);
        }
      g.restore();
    };
    const arrowTo = (fn: () => [number, number], color: string, w = 6) => <Line points={() => [[ox, oy], fn()]} stroke={color} lineWidth={w * k} endArrow arrowSize={16 * k} lineCap="round" {...glow(color, 10 * k)} />;
    const i = L.primary, j = L.secondary === "#F43F5E" ? L.secondary : L.highlight;
    const v = p.vector;

    const title = createRef<Txt>();
    const panel = createRef<Node>();
    const PX = A.wide ? A.x + 20 * k : A.x + A.w / 2 - 260 * k, PY = A.wide ? A.y + 60 * k : A.y + 30 * k;
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {arrowTo(() => map(1, 0), i)}
        {arrowTo(() => map(0, 1), j)}
        {p.showVector ? <Node opacity={vecOn}>{arrowTo(() => map(v[0], v[1]), L.accent, 5)}</Node> : null}
        {p.showEigen
          ? eig.map((e) => (
              <Node opacity={eigOn}>
                {arrowTo(() => map(e.v[0], e.v[1]), "#FDE68A", 4)}
              </Node>
            ))
          : null}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Node ref={panel} opacity={0}>
          <Txt x={PX} y={PY} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={30 * k} fill={L.text} text="M =" />
          <Rect x={PX + 150 * k} y={PY + (A.wide ? 0 : 0)} width={150 * k} height={110 * k} stroke={L.dim} lineWidth={3 * k} radius={6 * k} />
          <Txt x={PX + 112 * k} y={PY - 26 * k} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={i} text={num(a, 2)} />
          <Txt x={PX + 112 * k} y={PY + 26 * k} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={i} text={num(c, 2)} />
          <Txt x={PX + 188 * k} y={PY - 26 * k} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={j} text={num(b, 2)} />
          <Txt x={PX + 188 * k} y={PY + 26 * k} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={j} text={num(d, 2)} />
          <Txt x={A.wide ? PX : PX + 260 * k} y={A.wide ? PY + 100 * k : PY - 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={i} text="cột 1 = nơi î đến" />
          <Txt x={A.wide ? PX : PX + 260 * k} y={A.wide ? PY + 134 * k : PY + 8 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={j} text="cột 2 = nơi ĵ đến" />
          {p.showDeterminant ? <Txt opacity={detOn} x={A.wide ? PX : PX + 260 * k} y={A.wide ? PY + 184 * k : PY + 44 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={det < 0 ? L.highlight : L.accent} text={`det M = ${num(det, 2)}${det < 0 ? " (lật mặt)" : det === 0 ? " (ép thành đường)" : ""}`} /> : null}
          {p.showEigen ? <Txt opacity={eigOn} x={A.wide ? PX : PX + 260 * k} y={A.wide ? PY + 224 * k : PY + 80 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill="#FDE68A" text={eig.length ? `λ = ${eig.map((e) => num(e.l, 2)).join(" ; ")}` : "không có vector riêng thực (phép quay)"} /> : null}
        </Node>
      </Node>,
    );

    yield st.camera();
    if (p.title) yield fadeUp(title(), 0.5);
    yield* panel().opacity(1, 0.5);
    const steps = 1 + (p.showVector ? 1 : 0) + (p.showDeterminant ? 1 : 0) + (p.showEigen ? 1 : 0);
    let s = 0;
    if (p.showVector) {
      yield* until(ctx.cue(s++, steps));
      yield* vecOn(1, 0.4);
    }
    if (p.showDeterminant) yield* detOn(1, 0.4);
    yield* until(ctx.cue(s++, steps));
    yield* t(1, 2.4, easeInOutCubic);
    if (p.showDeterminant) yield* until(ctx.cue(s++, steps));
    if (p.showEigen) {
      yield* until(ctx.cue(s++, steps));
      yield* all(eigOn(1, 0.6, st.ease));
      // Replay: from the identity again, the eigenvectors only stretch along their lines.
      yield* t(0, 1.2, easeInOutCubic);
      yield* t(1, 2.2, easeInOutCubic);
    }
  },
});
