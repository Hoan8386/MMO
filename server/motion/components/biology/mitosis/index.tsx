// Mitosis, one cell becoming two identical cells. Each phase starts at a narration cue:
// interphase (loose chromatin in the nucleus) → prophase (chromosomes condense into X-shaped pairs of
// sister chromatids, the envelope fades, centrosomes go to the poles) → metaphase (chromosomes line up on
// the equator, spindle fibres attached at the centromeres) → anaphase (sister chromatids pulled to
// opposite poles) → telophase (two new nuclei) → cytokinesis (the membrane pinches in two).
// Homologous chromosomes share a hue (two shades), so each daughter visibly gets one copy of every one.
import { Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  pairs: number;
  showSpindle: boolean;
  showPhases: boolean;
}

const PHASES = ["Kỳ trung gian", "Kỳ đầu", "Kỳ giữa", "Kỳ sau", "Kỳ cuối", "Phân chia tế bào chất"];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "cell_biology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const strip = p.showPhases ? 80 * k : 0;
    const cx = A.cx, cy = A.y + (A.h - strip) / 2 + 10 * k;
    // Cell size: room for it to stretch to ~1.7× its width in anaphase.
    const W = Math.min(A.w / 3.6, (A.h - strip) / 2.3), H = W * 0.9;
    const t = createSignal(0);
    const ph = createSignal(0); // 0–5, fractional while changing
    const r = rng(5);
    const n = p.pairs * 2; // chromosomes
    const chromo = Array.from({ length: n }, (_, i) => ({
      hue: mix(L.series[(i % p.pairs) + 1 > 5 ? 0 : (i % p.pairs) + 1], i < p.pairs ? "#FFFFFF" : "#000000", 0.18),
      px: (r() - 0.5) * W * 0.55,
      py: (r() - 0.5) * H * 0.55,
      pa: r() * Math.PI,
      arm: W * (0.13 + 0.06 * ((i % p.pairs) / Math.max(1, p.pairs - 1))),
    }));
    const chromatin = Array.from({ length: 8 }, () => Array.from({ length: 9 }, () => [(r() - 0.5) * W * 0.6, (r() - 0.5) * H * 0.6] as [number, number]));

    const paint = (g: CanvasRenderingContext2D) => {
      const s = ph(), time = t();
      const stretch = 1 + 0.45 * smooth(clamp(s - 2.6, 0, 1.4) / 1.4);
      const pinch = smooth(clamp(s - 4.2, 0, 0.8) / 0.8);
      const poleX = W * 0.85 * stretch;
      // Cell outline: an ellipse that elongates and pinches at the middle (cleavage furrow).
      const outline = (part: number) => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * Math.PI * 2;
          let x = Math.cos(a) * W * stretch, y = Math.sin(a) * H;
          const f = Math.exp(-((x / (W * 0.45)) ** 2));
          y *= 1 - 0.97 * pinch * f;
          if (pinch > 0.98) x += Math.sign(x) * 14 * k; // daughters drift apart
          pts.push([x, y]);
        }
        return pts.filter(() => part === 0);
      };
      const cell = outline(0);
      g.save();
      g.translate(cx, cy);
      const cyto = g.createRadialGradient(0, 0, 0, 0, 0, W * stretch);
      cyto.addColorStop(0, alpha(L.primary, 0.16));
      cyto.addColorStop(1, alpha(L.primary, 0.05));
      g.fillStyle = cyto;
      g.strokeStyle = L.primary;
      g.lineWidth = 5 * k;
      g.shadowColor = L.primary;
      g.shadowBlur = 16 * k;
      g.beginPath();
      cell.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      // Organelle specks drift in the cytoplasm.
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4 + time * 0.1, d = 0.55 + 0.35 * ((i * 7) % 10) / 10;
        g.fillStyle = alpha(L.highlight, 0.35);
        g.beginPath();
        g.ellipse(Math.cos(a) * W * stretch * d, Math.sin(a) * H * d * (1 - 0.8 * pinch * Math.exp(-(((Math.cos(a) * d) / 0.45) ** 2))), 6 * k, 3.5 * k, a, 0, Math.PI * 2);
        g.fill();
      }
      // Nuclear envelope: whole in interphase, fades in prophase, two new ones in telophase.
      const env = (x: number, rr: number, a: number) => {
        g.strokeStyle = alpha(L.secondary, a);
        g.fillStyle = alpha(L.secondary, 0.08 * a);
        g.lineWidth = 3.5 * k;
        g.setLineDash([12 * k, 6 * k]);
        g.beginPath();
        g.arc(x, 0, rr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.setLineDash([]);
      };
      env(0, W * 0.42, 1 - smooth(clamp(s - 0.6, 0, 0.6) / 0.6));
      const newEnv = smooth(clamp(s - 3.7, 0, 0.6) / 0.6);
      if (newEnv > 0) for (const sx of [-1, 1]) env(sx * poleX * 0.62, W * 0.3, newEnv);
      // Chromatin threads (interphase, and again once the new nuclei form).
      const loose = Math.max(1 - smooth(clamp(s - 0.3, 0, 0.7) / 0.7), smooth(clamp(s - 4, 0, 0.8) / 0.8));
      if (loose > 0) {
        g.lineWidth = 2.5 * k;
        for (const [ci, thread] of chromatin.entries()) {
          const c = chromo[ci % n].hue;
          for (const nuc of s > 3 ? [-1, 1] : [0]) {
            g.strokeStyle = alpha(c, 0.5 * loose);
            g.beginPath();
            thread.forEach(([x, y], i) => {
              const xx = nuc ? nuc * poleX * 0.62 + x * 0.6 : x, yy = nuc ? y * 0.6 : y;
              i ? g.lineTo(xx + Math.sin(time + i) * 2 * k, yy) : g.moveTo(xx, yy);
            });
            g.stroke();
          }
        }
      }
      // Centrosomes and spindle.
      const cen = smooth(clamp(s - 0.6, 0, 1.2) / 1.2);
      const poles: [number, number][] = [[-poleX * cen, -H * 0.05 * (1 - cen)], [poleX * cen, H * 0.05 * (1 - cen)]];
      // Chromosome positions per phase.
      const cond = smooth(clamp(s - 0.5, 0, 0.8) / 0.8) * (1 - smooth(clamp(s - 4.1, 0, 0.6) / 0.6));
      const line = smooth(clamp(s - 1.5, 0, 0.9) / 0.9); // to the plate
      const split = smooth(clamp(s - 2.7, 0, 1.1) / 1.1); // to the poles
      const spindle = p.showSpindle ? smooth(clamp(s - 1.3, 0, 0.6) / 0.6) * (1 - smooth(clamp(s - 4, 0, 0.5) / 0.5)) : 0;
      const place = n > 1 ? H * 1.1 / (n - 1) : 0;
      const centres = chromo.map((c, i) => {
        const py = (i - (n - 1) / 2) * place * 0.9;
        return [c.px * (1 - line), c.py * (1 - line) + py * line, c.pa * (1 - line) + (Math.PI / 2) * line] as [number, number, number];
      });
      if (spindle > 0) {
        g.strokeStyle = alpha(L.dim.startsWith("#") ? L.dim : "#A7C4B5", 0.45 * spindle);
        g.lineWidth = 1.6 * k;
        for (const [px, py] of poles)
          for (const [i, [x, y]] of centres.entries()) {
            const side = px < 0 ? -1 : 1;
            const ex = x + side * split * poleX * 0.8, ey = y * (1 - split * 0.7);
            g.beginPath();
            g.moveTo(px, py);
            g.quadraticCurveTo((px + ex) / 2, (py + ey) / 2 + (i % 2 ? 6 : -6) * k, ex, ey);
            g.stroke();
          }
        // Astral rays.
        for (const [px, py] of poles)
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + Math.cos(a) * 22 * k, py + Math.sin(a) * 22 * k);
            g.stroke();
          }
      }
      if (cen > 0 && s < 4.6)
        for (const [px, py] of poles) {
          g.fillStyle = L.accent;
          g.shadowColor = L.accent;
          g.shadowBlur = 12 * k;
          g.beginPath();
          g.arc(px, py, 8 * k, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
      // Condensed chromosomes: two sister chromatids joined at the centromere, pulled apart in anaphase.
      if (cond > 0)
        for (const [i, c] of chromo.entries()) {
          const [x, y, a] = centres[i];
          for (const side of [-1, 1]) {
            const ox = side * (3 * k + split * poleX * 0.8), oy = -y * split * 0.7;
            const lean = side * (0.25 + split * 0.5); // arms trail as the chromatid is dragged
            g.strokeStyle = c.hue;
            g.lineWidth = 13 * k * cond;
            g.lineCap = "round";
            g.globalAlpha = cond;
            g.beginPath();
            const bx = x + ox, by = y + oy;
            g.moveTo(bx - Math.cos(a - lean) * c.arm * cond, by - Math.sin(a - lean) * c.arm * cond);
            g.lineTo(bx, by);
            g.lineTo(bx - Math.cos(a + Math.PI + lean) * c.arm * cond, by - Math.sin(a + Math.PI + lean) * c.arm * cond);
            g.stroke();
            g.globalAlpha = 1;
          }
          // Centromere dot.
          if (split < 0.15) {
            g.fillStyle = alpha("#FFFFFF", 0.85 * cond);
            g.beginPath();
            g.arc(x, y, 4 * k, 0, Math.PI * 2);
            g.fill();
          }
        }
      g.restore();
    };

    const title = createRef<Txt>();
    const chips: Rect[] = [];
    const chipW = (A.w - 10 * k * 5) / 6;
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Txt x={A.x} y={A.y + 22 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={34 * k} fill={L.text} text={() => PHASES[clamp(Math.round(ph() - 0.2), 0, 5)]} />
        {p.showPhases
          ? PHASES.map((nm, i) => (
              <Rect ref={(c: Rect) => (chips[i] = c)} x={A.x + chipW / 2 + i * (chipW + 10 * k)} y={A.y + A.h - 30 * k} width={chipW} height={52 * k} radius={14 * k} fill={() => (Math.round(ph() - 0.2) === i ? alpha(L.primary, 0.25) : L.panel)} stroke={() => (Math.round(ph() - 0.2) >= i ? L.primary : L.line)} lineWidth={2 * k}>
                <Txt text={nm} fontFamily={FONT} fontWeight={600} fontSize={Math.min(22, chipW / k / 9.5) * k} fill={() => (Math.round(ph() - 0.2) >= i ? L.text : L.dim)} />
              </Rect>
            ))
          : null}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    for (let i = 1; i <= 5; i++) {
      yield* until(ctx.cue(i - 1, 5));
      yield* ph(i, Math.min(1.6, Math.max(0.6, (D - ctx.cue(i - 1, 5)) / (6 - i) - 0.2)), easeInOutCubic);
    }
  },
});
