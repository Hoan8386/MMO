// Expansion of space: galaxies sit at fixed comoving coordinates on a grid; the scale factor a(t) grows
// and every distance grows with it, so no galaxy is the centre and each sees the others recede. Arrows
// from the home galaxy show Hubble's law v = H·d (twice as far → twice as fast), a small chart plots
// v against d, and a light wave travelling between galaxies is stretched with space: its wavelength
// grows by the same factor, 1 + z = a(received) / a(emitted).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { glow } from "../../../shared/fx";
import { label } from "../../../shared/ui";
import { until, rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  expansion: number;
  galaxies: number;
  showGrid: boolean;
  showHubble: boolean;
  showRedshift: boolean;
  seed: number;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "cosmology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const t = createSignal(0);
    const a = createSignal(1); // scale factor, 1 → expansion
    // Layout: the universe view, and beside (wide) or under (tall) it the Hubble chart.
    const side = p.showHubble ? (A.wide ? "right" : "bottom") : "none";
    const U = side === "right" ? { x: A.x, y: A.y, w: A.w * 0.64, h: A.h } : side === "bottom" ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.62 } : A;
    const C = side === "right" ? { x: A.x + A.w * 0.69, y: A.y + A.h * 0.18, w: A.w * 0.31, h: A.h * 0.62 } : { x: A.x + A.w * 0.12, y: A.y + A.h * 0.68, w: A.w * 0.76, h: A.h * 0.26 };
    const ux = U.x + U.w / 2, uy = U.y + U.h / 2;
    // Comoving grid spacing chosen so the expanded grid still fits: positions × a ≤ half the view.
    const amax = p.expansion;
    const half = Math.min(U.w, U.h) / 2;
    const cell = (half * 0.92) / amax / 3.4;
    const r = rng(p.seed);
    // Galaxies on (jittered) comoving lattice points; the home galaxy is at the origin.
    const pts: { x: number; y: number; rot: number; kind: number; size: number; tint: string }[] = [];
    const span = Math.floor((U.w / 2 / cell) / 1) + 1, spanY = Math.floor((U.h / 2 / cell) / 1) + 1;
    for (let i = -span; i <= span; i++)
      for (let j = -spanY; j <= spanY; j++) {
        if (i === 0 && j === 0) continue;
        if (r() > p.galaxies / 100) continue;
        pts.push({ x: (i + (r() - 0.5) * 0.5) * cell, y: (j + (r() - 0.5) * 0.5) * cell, rot: r() * Math.PI, kind: r() < 0.6 ? 0 : 1, size: (16 + r() * 16) * k, tint: L.series[Math.floor(r() * 4)] });
      }
    pts.unshift({ x: 0, y: 0, rot: 0.4, kind: 0, size: 34 * k, tint: L.accent });
    // Galaxies watched by the arrows: the nearest few at different distances.
    const watched = pts.slice(1).filter((g) => Math.abs(g.x) * amax < U.w / 2 - 40 * k && Math.abs(g.y) * amax < U.h / 2 - 40 * k).sort((g, h) => Math.hypot(g.x, g.y) - Math.hypot(h.x, h.y)).filter((_, i) => i % 3 === 0).slice(0, 5);
    const arrows = createSignal(0);
    const wave = createSignal(-1); // photon travel 0–1
    const emitA = createSignal(1); // scale factor when the light left its galaxy

    const inView = (x: number, y: number, m = 0) => Math.abs(x - ux) < U.w / 2 - m && Math.abs(y - uy) < U.h / 2 - m;
    const paint = (g: CanvasRenderingContext2D) => {
      const s = a();
      // Comoving grid, stretched by a.
      if (p.showGrid) {
        g.strokeStyle = alpha(L.secondary, 0.16);
        g.lineWidth = 1.5 * k;
        g.beginPath();
        for (let i = -span; i <= span; i++) {
          const x = ux + i * cell * s;
          if (Math.abs(x - ux) > U.w / 2) continue;
          g.moveTo(x, U.y);
          g.lineTo(x, U.y + U.h);
        }
        for (let j = -spanY; j <= spanY; j++) {
          const y = uy + j * cell * s;
          if (Math.abs(y - uy) > U.h / 2) continue;
          g.moveTo(U.x, y);
          g.lineTo(U.x + U.w, y);
        }
        g.stroke();
      }
      g.globalCompositeOperation = "lighter";
      for (const q of pts) {
        const x = ux + q.x * s, y = uy + q.y * s;
        if (!inView(x, y, q.size)) continue;
        g.save();
        g.translate(x, y);
        g.rotate(q.rot + t() * 0.15);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, q.size);
        gr.addColorStop(0, alpha(L.ink, 0.95));
        gr.addColorStop(0.25, alpha(q.tint, 0.7));
        gr.addColorStop(1, alpha(q.tint, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(0, 0, q.size, q.size * (q.kind ? 0.6 : 0.38), 0, 0, Math.PI * 2);
        g.fill();
        if (!q.kind) {
          // Two faint spiral arms.
          g.strokeStyle = alpha(q.tint, 0.35);
          g.lineWidth = 1.6 * k;
          for (const arm of [0, Math.PI]) {
            g.beginPath();
            for (let u = 0; u <= 1; u += 0.1) {
              const ang = arm + u * 3.2, rr = q.size * (0.2 + 0.9 * u);
              g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.42);
            }
            g.stroke();
          }
        }
        g.restore();
      }
      g.globalCompositeOperation = "source-over";
      // Hubble arrows: v = H·d, drawn from the home galaxy's view.
      if (arrows() > 0)
        for (const q of watched) {
          const x = ux + q.x * s, y = uy + q.y * s, d = Math.hypot(q.x, q.y) * s;
          const len = d * 0.45 * arrows();
          const ex = x + (q.x / Math.hypot(q.x, q.y)) * len, ey = y + (q.y / Math.hypot(q.x, q.y)) * len;
          g.strokeStyle = L.highlight;
          g.fillStyle = L.highlight;
          g.lineWidth = 4 * k;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(ex, ey);
          g.stroke();
          const ang = Math.atan2(ey - y, ex - x), h = 14 * k;
          g.beginPath();
          g.moveTo(ex + Math.cos(ang) * h * 0.4, ey + Math.sin(ang) * h * 0.4);
          g.lineTo(ex - Math.cos(ang - 0.5) * h, ey - Math.sin(ang - 0.5) * h);
          g.lineTo(ex - Math.cos(ang + 0.5) * h, ey - Math.sin(ang + 0.5) * h);
          g.fill();
        }
      // A light wave from a far galaxy to home: wavelength ∝ a at each point of its path.
      const w = wave();
      if (w >= 0 && watched.length) {
        const src = watched[watched.length - 1];
        const x0 = ux + src.x * s, y0 = uy + src.y * s;
        const len = Math.hypot(x0 - ux, y0 - uy), ang = Math.atan2(uy - y0, ux - x0);
        g.save();
        g.translate(x0, y0);
        g.rotate(ang);
        g.lineWidth = 4 * k;
        const head = len * w;
        const a0 = emitA();
        g.beginPath();
        let phase = 0;
        for (let x = 0; x <= head; x += 3) {
          // Emitted with λ0; the part that has travelled longest (the head) is stretched by a/a_emit.
          const lam = 34 * k * (1 + (s / a0 - 1) * (x / Math.max(1, head)));
          phase += (2 * Math.PI * 3) / lam;
          g.lineTo(x, Math.sin(phase) * 12 * k);
        }
        const grad = g.createLinearGradient(0, 0, Math.max(1, head), 0);
        grad.addColorStop(0, "#EF4444");
        grad.addColorStop(1, "#60A5FA");
        g.strokeStyle = grad;
        g.shadowColor = L.secondary;
        g.shadowBlur = 10 * k;
        g.stroke();
        g.restore();
      }
    };

    // Hubble chart: v against d for the watched galaxies — a straight line through the origin.
    const chart = createRef<Node>();
    const dots: Rect[] = [];
    const dmax = Math.max(...watched.map((q) => Math.hypot(q.x, q.y))) * amax * 1.1 || 1;
    const title = createRef<Txt>();
    const aText = createRef<Txt>();
    const zText = createRef<Txt>();
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Txt ref={aText} x={U.x + 12 * k} y={U.y + 24 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={26 * k} fill={L.dim} text={() => `hệ số tỉ lệ a = ${num(a(), 2)} · khoảng cách × ${num(a(), 2)}`} />
        <Txt ref={zText} x={U.x + 12 * k} y={U.y + 60 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={26 * k} fill={L.highlight} opacity={0} text={() => `bước sóng bị kéo giãn: 1 + z = ${num(a() / emitA(), 2)}`} />
        {p.showHubble ? (
          <Node ref={chart} opacity={0}>
            <Line points={[[C.x, C.y], [C.x, C.y + C.h], [C.x + C.w, C.y + C.h]]} stroke={L.dim} lineWidth={2.5 * k} />
            <Txt text="vận tốc lùi xa v" x={C.x} y={C.y - 22 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={22 * k} fill={L.dim} />
            <Txt text="khoảng cách d" x={C.x + C.w} y={C.y + C.h + 26 * k} offsetX={1} fontFamily="Be Vietnam Pro" fontWeight={600} fontSize={22 * k} fill={L.dim} />
            <Line points={() => [[C.x, C.y + C.h], [C.x + C.w * a() / amax, C.y + C.h - C.h * 0.9 * a() / amax]]} stroke={alpha(L.highlight, 0.6)} lineWidth={2 * k} lineDash={[8 * k, 6 * k]} />
            {watched.map((q, i) => {
              const d = () => (Math.hypot(q.x, q.y) * a()) / dmax;
              return <Rect ref={(n: Rect) => (dots[i] = n)} size={14 * k} radius={7 * k} fill={L.highlight} {...glow(L.highlight, 10 * k)} x={() => C.x + d() * C.w} y={() => C.y + C.h - d() * C.h * 0.9} />;
            })}
            <Txt text="v = H · d" x={C.x + C.w * 0.08} y={C.y + 10 * k} offsetX={-1} fontFamily="Be Vietnam Pro" fontWeight={800} fontSize={32 * k} fill={L.highlight} />
          </Node>
        ) : null}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    const n = 1 + (p.showHubble ? 1 : 0) + (p.showRedshift ? 1 : 0);
    // Expansion runs from the first cue to the end of the clip.
    yield* until(ctx.cue(0, n));
    const start = ctx.cue(0, n);
    yield a(amax, Math.max(1, D - start - 0.4), easeInOutCubic);
    let i = 1;
    if (p.showHubble) {
      yield* until(ctx.cue(i++, n));
      yield* all(arrows(1, 0.8, st.ease), chart().opacity(1, 0.6));
    }
    if (p.showRedshift) {
      yield* until(ctx.cue(i++, n));
      wave(0);
      emitA(a());
      yield* all(zText().opacity(1, 0.4), wave(1, Math.max(1, D - ctx.cue(i - 1, n) - 0.6), linear));
    }
  },
});
