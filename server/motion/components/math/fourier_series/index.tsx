// Fourier series. wave: a square / sawtooth / triangle wave built from rotating circles (epicycles) —
// circle n turns n times as fast with radius bₙ (square: 4/(nπ) for odd n); the tip's height traces the
// partial sum, and adding terms sharpens the corners (with the Gibbs overshoot at jumps). drawing: the
// discrete Fourier transform of a closed curve (a heart, a star or a treble-like loop), its coefficients
// sorted by size, chained as epicycles that redraw the curve. spectrum: the amplitudes as bars.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "wave" | "drawing";
  wave: "square" | "sawtooth" | "triangle";
  shape: "heart" | "star" | "infinity";
  terms: number;
  spectrum: boolean;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "calculus");
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
    // Coefficients as (frequency, amplitude, phase); the tip of the chain is Σ a·e^{i(fωt + φ)}.
    let coefs: [number, number, number][] = [];
    if (p.mode === "wave") {
      for (let n = 1; coefs.length < p.terms; n++) {
        if (p.wave === "square" && n % 2 === 1) coefs.push([n, 4 / (n * Math.PI), 0]);
        if (p.wave === "sawtooth") coefs.push([n, (2 / (n * Math.PI)) * (n % 2 ? 1 : -1), 0]);
        if (p.wave === "triangle" && n % 2 === 1) coefs.push([n, (8 / (Math.PI * Math.PI * n * n)) * ((n - 1) / 2 % 2 ? -1 : 1), -Math.PI / 2]);
        if (n > 400) break;
      }
    } else {
      // Sample the shape (N points), DFT, keep the largest `terms` coefficients.
      const N = 256;
      const pts: XY[] = Array.from({ length: N }, (_, i) => {
        const t = (i / N) * TAU;
        if (p.shape === "heart") return [16 * Math.sin(t) ** 3 / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17];
        if (p.shape === "star") {
          // Five rounded points.
          const r = 0.55 + 0.4 * Math.abs(Math.cos(2.5 * t)) ** 3;
          return [r * Math.cos(t - Math.PI / 2), r * Math.sin(t - Math.PI / 2)];
        }
        const d = 1 + Math.sin(t) ** 2;
        return [(Math.cos(t) / d) * 1.1, ((Math.sin(t) * Math.cos(t)) / d) * 1.1];
      });
      const all: [number, number, number][] = [];
      for (let f = -N / 2; f < N / 2; f++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const a = (-TAU * f * n) / N;
          re += pts[n][0] * Math.cos(a) - pts[n][1] * Math.sin(a);
          im += pts[n][0] * Math.sin(a) + pts[n][1] * Math.cos(a);
        }
        re /= N;
        im /= N;
        all.push([f, Math.hypot(re, im), Math.atan2(im, re)]);
      }
      all.sort((a, b) => b[1] - a[1]);
      coefs = all.slice(0, p.terms);
    }
    const nC = coefs.length;
    // Terms added progressively over the first 60 % of the clip (wave mode), all at once for drawings.
    const active = () => (p.mode === "wave" ? Math.max(1, Math.min(nC, Math.ceil(clamp((clock() - 0.6) / (D * 0.6), 0, 1) * nC))) : nC);
    const w = (TAU * 0.22 * st.speed) / (p.mode === "wave" ? 1 : 1.8);

    const R = p.mode === "wave" ? Math.min(A.h * 0.26, A.w * 0.14) : Math.min(A.h * 0.42, A.w * 0.3);
    const cx = p.mode === "wave" ? A.x + R * 1.6 : A.cx, cy = p.mode === "wave" ? A.cy - (p.spectrum ? A.h * 0.1 : 0) : A.cy;
    const chain = (t: number, n: number): XY[] => {
      const out: XY[] = [[cx, cy]];
      let x = cx, y = cy;
      for (let i = 0; i < n; i++) {
        const [f, a, ph] = coefs[i];
        const ang = f * w * t + ph;
        x += Math.cos(ang) * a * R;
        y += (p.mode === "wave" ? -Math.sin(ang) : Math.sin(ang)) * a * R;
        out.push([x, y]);
      }
      return out;
    };
    const wx0 = cx + R * 1.9, wW = A.x + A.w - wx0 - 10 * k;
    // The traced curve: for wave mode the tip's height against time (scrolling); for drawings the path.
    const trace: XY[] = [];
    nodes.push(
      <Draw
        paint={(g) => {
          const t = clock(), n = active();
          const ch = chain(t, n);
          // Circles and radii.
          for (let i = 0; i < n; i++) {
            const r = Math.hypot(ch[i + 1][0] - ch[i][0], ch[i + 1][1] - ch[i][1]);
            g.strokeStyle = alpha(L.ink, 0.18);
            g.lineWidth = 1.5 * k;
            g.beginPath();
            g.arc(ch[i][0], ch[i][1], r, 0, TAU);
            g.stroke();
            g.strokeStyle = alpha(L.secondary, 0.85);
            g.lineWidth = 2 * k;
            g.beginPath();
            g.moveTo(...ch[i]);
            g.lineTo(...ch[i + 1]);
            g.stroke();
          }
          const tip = ch[n];
          if (p.mode === "wave") {
            // The wave: y of the tip over the last few seconds, scrolling to the right.
            g.strokeStyle = alpha(L.accent, 0.6);
            g.setLineDash([6 * k, 6 * k]);
            g.beginPath();
            g.moveTo(...tip);
            g.lineTo(wx0, tip[1]);
            g.stroke();
            g.setLineDash([]);
            g.strokeStyle = L.accent;
            g.lineWidth = L.lw(4 * k);
            g.shadowColor = L.accent;
            g.shadowBlur = 10 * k * L.visual.glow;
            g.beginPath();
            const span = (TAU / w) * 2.2;
            for (let i = 0; i <= 300; i++) {
              const tt = t - (i / 300) * span;
              if (tt < 0) break;
              const c2 = chain(tt, n);
              const x = wx0 + (i / 300) * wW, y = c2[n][1];
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            g.shadowBlur = 0;
            // Target wave, faint.
            g.strokeStyle = alpha(L.ink, 0.25);
            g.lineWidth = 2 * k;
            g.beginPath();
            for (let i = 0; i <= 300; i++) {
              const tt = t - (i / 300) * span, ph = (((w * tt) % TAU) + TAU) % TAU;
              const v = p.wave === "square" ? (ph < Math.PI ? 1 : -1) : p.wave === "sawtooth" ? (ph < Math.PI ? ph / Math.PI : ph / Math.PI - 2) : (2 / Math.PI) * Math.asin(Math.sin(ph));
              const x = wx0 + (i / 300) * wW, y = cy - v * R;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
          } else {
            // Redraw the path traced so far (one full turn of the base frequency = the whole shape).
            g.strokeStyle = L.accent;
            g.lineWidth = L.lw(4 * k);
            g.shadowColor = L.accent;
            g.shadowBlur = 10 * k * L.visual.glow;
            g.beginPath();
            const tEnd = Math.min(t, TAU / w);
            for (let i = 0; i <= 400; i++) {
              const tt = (i / 400) * tEnd;
              const q = chain(tt, n)[n];
              if (i) g.lineTo(...q);
              else g.moveTo(...q);
            }
            g.stroke();
            g.shadowBlur = 0;
          }
          g.fillStyle = "#FFFFFF";
          g.beginPath();
          g.arc(tip[0], tip[1], 7 * k, 0, TAU);
          g.fill();
          void trace;
        }}
      />,
    );
    nodes.push(<Txt text={() => `${active()} số hạng`} x={A.x + 10 * k} y={A.y + A.h - (p.spectrum && p.mode === "wave" ? A.h * 0.24 : 24 * k)} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.text} />);
    if (p.spectrum && p.mode === "wave") {
      const sx = A.x + A.w * 0.2, sw = A.w * 0.6, sy = A.y + A.h - 10 * k, sh = A.h * 0.18;
      const amax = Math.max(...coefs.map((c) => Math.abs(c[1])));
      show(
        <Draw
          paint={(g) => {
            const n = active(), fmax = coefs[nC - 1][0];
            for (let i = 0; i < nC; i++) {
              const [f, a] = coefs[i];
              const x = sx + (f / (fmax + 1)) * sw, h = (Math.abs(a) / amax) * sh;
              g.fillStyle = i < n ? L.secondary : alpha(L.ink, 0.15);
              g.fillRect(x - 6 * k, sy - h, 12 * k, h);
            }
            g.font = `600 ${20 * k}px ${FONT}`;
            g.fillStyle = L.dim;
            g.fillText("phổ biên độ theo tần số", sx, sy - sh - 10 * k);
          }}
        />,
      );
    }
    show(
      label(ctx, p.mode === "wave" ? (p.wave === "square" ? "Sóng vuông = (4/π)·[sin x + sin 3x/3 + sin 5x/5 + …]" : p.wave === "sawtooth" ? "Sóng răng cưa = (2/π)·Σ (−1)ⁿ⁺¹ sin nx / n" : "Sóng tam giác = (8/π²)·Σ (−1)ᵏ sin((2k+1)x)/(2k+1)²") : "Mỗi đường tròn là một số hạng Fourier — xếp nối đuôi, chúng vẽ lại cả hình", { x: A.cx, y: A.y + 24 * k, size: 26, fill: L.text }),
    );

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
    void Line;
    void Rect;
  },
});
