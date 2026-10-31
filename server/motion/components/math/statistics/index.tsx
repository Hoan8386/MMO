// Probability and statistics with seeded data. galton: balls fall through a Galton board, bouncing
// left or right at each peg with probability ½; the bins fill to the binomial distribution, whose
// shape approaches the normal curve (central limit theorem). normal: the normal distribution with the
// 68–95–99.7 rule shaded band by band. regression: points appear around a trend; the least-squares line
// turns from the mean to its fitted slope, residuals shown, with r and the equation. lln: running
// average of coin flips converging to ½ (law of large numbers). bayes: a population of 1 000 — the
// prevalence, true and false positives — and P(ill | positive) from Bayes' theorem.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "galton" | "normal" | "regression" | "lln" | "bayes";
  count: number;
  prevalence: number;
  sensitivity: number;
  falsePositive: number;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;
const gauss = (x: number, m: number, s: number) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(TAU));

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "probability");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const R0 = rng(L.seed + 91);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    const C1 = L.primary, C2 = L.secondary, C3 = L.accent, INK = L.text;

    if (p.mode === "galton") {
      const rows = 12, n = p.count;
      const paths: number[][] = Array.from({ length: n }, () => Array.from({ length: rows }, () => (R0() < 0.5 ? 0 : 1)));
      const bins = paths.map((pp) => pp.reduce((a, b) => a + b, 0));
      const top = A.y + 20 * k, bw = Math.min(A.w * 0.8, A.h * 1.1), dx = bw / (rows + 1), dy = (A.h * 0.5) / rows;
      const cx = A.cx, binTop = top + rows * dy + 30 * k, binH = A.y + A.h - binTop - 10 * k;
      const fall = 1.0; // seconds per ball to traverse
      const rate = (n - 1) / Math.max(1, D - 2.5); // balls launched per second
      const launch = (i: number) => 0.6 + i / rate;
      const pegX = (r: number, j: number) => cx + (j - r / 2) * dx;
      const pos = (i: number, t: number): XY | null => {
        const u = (t - launch(i)) / fall;
        if (u < 0) return null;
        if (u >= 1) return null;
        const f = u * rows, r = Math.floor(f), w = f - r;
        const j0 = paths[i].slice(0, r).reduce((a, b) => a + b, 0), j1 = j0 + (paths[i][r] ?? 0);
        const x0 = pegX(r, j0), x1 = pegX(r + 1, j1);
        return [x0 + (x1 - x0) * w, top + (r + w) * dy - Math.sin(w * Math.PI) * dy * 0.3];
      };
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            g.fillStyle = alpha(INK, 0.6);
            for (let r = 0; r < rows; r++)
              for (let j = 0; j <= r; j++) {
                g.beginPath();
                g.arc(pegX(r, j), top + r * dy + dy * 0.5, 4 * k, 0, TAU);
                g.fill();
              }
            // Bins and stacked balls.
            const cnt = new Array(rows + 1).fill(0);
            for (let i = 0; i < n; i++) if (t >= launch(i) + fall) cnt[bins[i]]++;
            const maxC = (n * 0.23) | 0;
            for (let j = 0; j <= rows; j++) {
              const x = pegX(rows, j);
              g.strokeStyle = alpha(INK, 0.3);
              g.lineWidth = 1.5 * k;
              g.beginPath();
              g.moveTo(x - dx / 2, binTop);
              g.lineTo(x - dx / 2, binTop + binH);
              g.stroke();
              const h = (cnt[j] / maxC) * binH;
              g.fillStyle = alpha(C1, 0.85);
              g.fillRect(x - dx / 2 + 3 * k, binTop + binH - h, dx - 6 * k, h);
            }
            // Balls in flight.
            g.fillStyle = C3;
            for (let i = 0; i < n; i++) {
              const q = pos(i, t);
              if (!q) continue;
              g.beginPath();
              g.arc(q[0], q[1], 6 * k, 0, TAU);
              g.fill();
            }
            // Normal curve (mean rows/2, variance rows/4) scaled to the expected counts.
            const done = cnt.reduce((a, b) => a + b, 0);
            if (done > n * 0.3) {
              g.strokeStyle = C2;
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let i = 0; i <= 100; i++) {
                const x = -0.5 + (i / 100) * (rows + 1), y = gauss(x, rows / 2, Math.sqrt(rows / 4)) * done;
                const px = pegX(rows, x), py = binTop + binH - (y / maxC) * binH;
                if (i) g.lineTo(px, py);
                else g.moveTo(px, py);
              }
              g.stroke();
            }
          }}
        />,
      );
      show(label(ctx, "Mỗi chốt: trái hay phải với xác suất ½ → phân phối nhị thức tiến tới đường cong chuẩn", { x: A.cx, y: A.y + A.h - 14 * k, size: 23, fill: INK }));
    } else if (p.mode === "normal") {
      const gx = A.x + A.w * 0.06, gw = A.w * 0.88, gy = A.y + A.h * 0.12, gh = A.h * 0.72;
      const X = (z: number) => gx + ((z + 4) / 8) * gw, Y = (v: number) => gy + gh - (v / 0.42) * gh;
      const band = (i: number) => smooth(clamp((clock() - ctx.cue(i, 4)) / 0.8, 0, 1));
      nodes.push(
        <Draw
          paint={(g) => {
            const cols = [alpha(C1, 0.55), alpha(C2, 0.45), alpha(C3, 0.4)];
            for (let b = 2; b >= 0; b--) {
              const u = band(b);
              if (u <= 0) continue;
              const s = b + 1;
              g.fillStyle = cols[b];
              g.beginPath();
              g.moveTo(X(-s * u), Y(0));
              for (let i = 0; i <= 100; i++) {
                const z = -s * u + (2 * s * u * i) / 100;
                g.lineTo(X(z), Y(gauss(z, 0, 1)));
              }
              g.lineTo(X(s * u), Y(0));
              g.closePath();
              g.fill();
            }
            g.strokeStyle = INK;
            g.lineWidth = L.lw(4 * k);
            g.beginPath();
            for (let i = 0; i <= 200; i++) {
              const z = -4 + (8 * i) / 200;
              if (i) g.lineTo(X(z), Y(gauss(z, 0, 1)));
              else g.moveTo(X(z), Y(gauss(z, 0, 1)));
            }
            g.stroke();
            g.strokeStyle = alpha(INK, 0.4);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(gx, Y(0));
            g.lineTo(gx + gw, Y(0));
            g.stroke();
            g.font = `700 ${22 * k}px ${FONT}`;
            g.fillStyle = INK;
            g.textAlign = "center";
            for (let z = -3; z <= 3; z++) g.fillText(z === 0 ? "μ" : `${z > 0 ? "+" : "−"}${Math.abs(z)}σ`, X(z), Y(0) + 30 * k);
            const txt = ["68,3 %", "95,4 %", "99,7 %"];
            for (let b = 0; b < 3; b++)
              if (band(b) > 0.9) {
                g.fillStyle = [C1, C2, C3][b];
                g.font = `800 ${28 * k}px ${FONT}`;
                g.fillText(txt[b], X(0), Y(gauss(0, 0, 1)) - 30 * k - b * 36 * k);
              }
          }}
        />,
      );
      show(label(ctx, "Quy tắc 68–95–99,7: tỉ lệ dữ liệu trong khoảng μ ± 1σ, 2σ, 3σ", { x: A.cx, y: A.y + 24 * k, size: 26, fill: INK }));
    } else if (p.mode === "regression") {
      const n = Math.min(60, p.count);
      const pts: XY[] = Array.from({ length: n }, () => {
        const x = R0() * 10;
        const e = Math.sqrt(-2 * Math.log(1 - R0())) * Math.cos(TAU * R0());
        return [x, 1.5 + 0.8 * x + e * 1.4];
      });
      const mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
      const sxy = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0), sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), syy = pts.reduce((a, q) => a + (q[1] - my) ** 2, 0);
      const b1 = sxy / sxx, b0 = my - b1 * mx, r = sxy / Math.sqrt(sxx * syy);
      const gx = A.x + A.w * 0.08, gw = A.w * 0.84, gy = A.y + A.h * 0.1, gh = A.h * 0.75;
      const X = (x: number) => gx + (x / 10) * gw, Y = (y: number) => gy + gh - (y / 12) * gh;
      const appear = () => clamp((clock() - 0.6) / (D * 0.3), 0, 1);
      const fit = () => smooth(clamp((clock() - ctx.cue(1, 3)) / 1.6, 0, 1));
      nodes.push(
        <Draw
          paint={(g) => {
            g.strokeStyle = alpha(INK, 0.45);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(gx, gy);
            g.lineTo(gx, gy + gh);
            g.lineTo(gx + gw, gy + gh);
            g.stroke();
            const slope = b1 * fit(), icpt = my - slope * mx;
            const m = Math.floor(appear() * n);
            if (fit() > 0)
              for (let i = 0; i < m; i++) {
                const [x, y] = pts[i];
                g.strokeStyle = alpha(C3, 0.6);
                g.lineWidth = 2 * k;
                g.beginPath();
                g.moveTo(X(x), Y(y));
                g.lineTo(X(x), Y(icpt + slope * x));
                g.stroke();
              }
            for (let i = 0; i < m; i++) {
              g.fillStyle = C1;
              g.beginPath();
              g.arc(X(pts[i][0]), Y(pts[i][1]), 7 * k, 0, TAU);
              g.fill();
            }
            if (appear() >= 1) {
              g.strokeStyle = C2;
              g.lineWidth = L.lw(5 * k);
              g.beginPath();
              g.moveTo(X(0), Y(icpt));
              g.lineTo(X(10), Y(icpt + slope * 10));
              g.stroke();
            }
          }}
        />,
      );
      show(label(ctx, "Dữ liệu minh hoạ (sinh ngẫu nhiên quanh y = 1,5 + 0,8x)", { x: A.x + 20 * k, y: A.y + 20 * k, size: 22, align: "left", fill: L.dim }));
      show(label(ctx, "Đường hồi quy làm tổng bình phương phần dư (đoạn đỏ) nhỏ nhất", { x: A.cx, y: A.y + A.h - 50 * k, size: 25, fill: INK }));
      show(label(ctx, `ŷ = ${num(b0, 2)} + ${num(b1, 2)}x   ·   r = ${num(r, 2)}`, { x: A.cx, y: A.y + A.h - 14 * k, size: 30, fill: C2 }));
    } else if (p.mode === "lln") {
      const n = p.count * 4;
      const flips = Array.from({ length: n }, () => (R0() < 0.5 ? 1 : 0));
      const avg: number[] = [];
      let s = 0;
      flips.forEach((f, i) => avg.push((s += f) / (i + 1)));
      const gx = A.x + A.w * 0.06, gw = A.w * 0.88, gy = A.y + A.h * 0.15, gh = A.h * 0.6;
      const shown = () => Math.max(1, Math.floor(clamp((clock() - 0.5) / (D - 1.5), 0, 1) ** 2 * n));
      const X = (i: number) => gx + (Math.log(i + 1) / Math.log(n + 1)) * gw, Y = (v: number) => gy + gh - v * gh;
      nodes.push(
        <Draw
          paint={(g) => {
            g.strokeStyle = alpha(C3, 0.7);
            g.setLineDash([10 * k, 8 * k]);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(gx, Y(0.5));
            g.lineTo(gx + gw, Y(0.5));
            g.stroke();
            g.setLineDash([]);
            g.strokeStyle = alpha(INK, 0.45);
            g.beginPath();
            g.moveTo(gx, gy);
            g.lineTo(gx, gy + gh);
            g.lineTo(gx + gw, gy + gh);
            g.stroke();
            const m = shown();
            g.strokeStyle = C1;
            g.lineWidth = L.lw(3 * k);
            g.beginPath();
            for (let i = 0; i < m; i++) (i ? g.lineTo(X(i), Y(avg[i])) : g.moveTo(X(i), Y(avg[i])));
            g.stroke();
            g.font = `800 ${30 * k}px ${FONT}`;
            g.fillStyle = INK;
            g.fillText(`${m} lần tung · tỉ lệ mặt ngửa = ${num(avg[m - 1], 3)}`, gx, A.y + A.h - 40 * k);
            g.font = `600 ${20 * k}px ${FONT}`;
            g.fillStyle = L.dim;
            g.fillText("số lần tung (thang log)", gx + gw - 230 * k, gy + gh + 26 * k);
          }}
        />,
      );
      show(label(ctx, "Luật số lớn: càng tung nhiều, tỉ lệ càng sát 1/2", { x: A.cx, y: A.y + 24 * k, size: 27, fill: C3 }));
    } else {
      // Bayes: 1 000 people as dots.
      const N = 1000, cols = A.wide ? 50 : 25, rows = N / cols;
      const cell = Math.min((A.w * (A.wide ? 0.62 : 0.94)) / cols, (A.h * (A.wide ? 0.9 : 0.58)) / rows);
      const gx = A.x + (A.wide ? 0 : (A.w - cols * cell) / 2), gy = A.y + (A.wide ? (A.h - rows * cell) / 2 : 10 * k);
      const ill = Math.round(N * p.prevalence), tp = Math.round(ill * p.sensitivity), fp = Math.round((N - ill) * p.falsePositive);
      const post = tp / (tp + fp);
      const order = Array.from({ length: N }, (_, i) => i).sort(() => R0() - 0.5);
      const isIll = new Set(order.slice(0, ill));
      const pos = new Set([...order.slice(0, tp), ...order.slice(ill, ill + fp)]);
      const step = (i: number) => clock() > ctx.cue(i, 4);
      nodes.push(
        <Draw
          paint={(g) => {
            for (let i = 0; i < N; i++) {
              const x = gx + ((i % cols) + 0.5) * cell, y = gy + (Math.floor(i / cols) + 0.5) * cell;
              let c = alpha(INK, 0.25);
              if (step(0) && isIll.has(i)) c = C3;
              if (step(1) && pos.has(i)) c = isIll.has(i) ? "#FF4D6D" : "#FFD166";
              if (step(2) && !pos.has(i)) c = alpha(INK, 0.08);
              g.fillStyle = c;
              g.beginPath();
              g.arc(x, y, cell * 0.36, 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      const tx = A.wide ? A.x + A.w * 0.66 : A.x + 20 * k, ty = A.wide ? A.y + 40 * k : A.y + A.h * 0.66;
      show(<Txt text={`${N} người · ${num(p.prevalence * 100, 1)} % mắc bệnh = ${ill} người`} x={tx} y={ty} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={C3} />);
      show(<Txt text={`Xét nghiệm dương: ${tp} người bệnh thật + ${fp} báo nhầm`} x={tx} y={ty + 44 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill="#FFD166" />);
      show(<Txt text={`P(bệnh | dương tính) = ${tp}/(${tp} + ${fp}) = ${num(post * 100, 1)} %`} x={tx} y={ty + 100 * k} offsetX={-1} fontFamily={FONT} fontWeight={900} fontSize={30 * k} fill={INK} />);
    }

    if (!p.labels && p.mode !== "bayes") shows.length = 0;
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
    const nC = p.mode === "bayes" || p.mode === "normal" ? 4 : steps.length + 1;
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(Math.min(i, nC - 1), nC) + (p.mode === "bayes" ? 0.3 : 0));
      yield steps[i]();
    }
    void Line;
    void Rect;
    void easeInOutCubic;
  },
});
