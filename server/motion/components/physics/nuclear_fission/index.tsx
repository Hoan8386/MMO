// Nuclear fission of uranium-235. A slow neutron strikes the nucleus (a packed cluster of protons and
// neutrons); the excited U-236 wobbles, stretches into a peanut and splits into two fragments (e.g.
// barium-141 and krypton-92) that fly apart, releasing three neutrons and ≈ 200 MeV — the equation
// is written underneath. Chain mode: each released neutron splits another nucleus, generation after
// generation (1 → 3 → 9…), the counter showing the exponential growth.
import { Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { typeOn } from "../../../shared/fx";
import { label, FONT } from "../../../shared/ui";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "single" | "chain";
  generations: number;
  showEquation: boolean;
  showLabels: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "nuclear");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const eqH = p.showEquation ? 80 * k : 0;
    const B = { x: A.x, y: A.y, w: A.w, h: A.h - eqH };
    const t = createSignal(0);
    const proton = L.highlight === "#FBBF24" ? "#EF4444" : L.accent, neutron = L.secondary;
    // Nucleons packed in a disc (sunflower spiral), each tagged with the fragment it ends up in.
    const r = rng(3);
    const N = 48;
    const nucleons = Array.from({ length: N }, (_, i) => {
      const a = i * 2.39996, d = Math.sqrt((i + 0.5) / N);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      return { x, y, p: r() < 0.39, side: x + (r() - 0.5) * 0.25 < -0.05 ? -1 : 1, z: r() };
    });
    nucleons.sort((u, v) => u.z - v.z);

    // One fission event at (x, y), radius R: hit at time th; returns nothing — drawn from the clock.
    const drawFission = (g: CanvasRenderingContext2D, x: number, y: number, R: number, th: number, time: number, angle: number) => {
      const s = time - th; // seconds since the hit
      const wob = s > 0 ? smooth(clamp(s / 0.7, 0, 1)) : 0; // stretch into a peanut
      const fly = s > 0.7 ? smooth(clamp((s - 0.7) / 1.4, 0, 1)) : 0; // fragments apart
      const shake = s > 0 && s < 0.7 ? Math.sin(s * 40) * 0.03 : 0;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      // Energy flash at the split.
      if (s > 0.65 && s < 1.6) {
        const f = 1 - (s - 0.65) / 0.95;
        const gr = g.createRadialGradient(x, y, 0, x, y, R * 4);
        gr.addColorStop(0, alpha("#FFFFFF", 0.8 * f));
        gr.addColorStop(0.3, alpha(L.highlight, 0.5 * f));
        gr.addColorStop(1, alpha(L.primary, 0));
        g.globalCompositeOperation = "lighter";
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, R * 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = alpha(L.highlight, f);
        g.lineWidth = 4 * k;
        g.beginPath();
        g.arc(x, y, R * (1.2 + (1 - f) * 3), 0, Math.PI * 2);
        g.stroke();
        g.globalCompositeOperation = "source-over";
      }
      const rn = R * 0.19;
      for (const q of nucleons) {
        // Peanut: stretch along the split axis and pinch the middle; then the halves fly apart.
        let u = q.x * (1 + 0.45 * wob) + q.side * fly * 3.2, v = q.y * (1 - 0.25 * wob * Math.exp(-q.x * q.x * 6));
        u += shake * q.side;
        const px = x + (u * ca - v * sa) * R, py = y + (u * sa + v * ca) * R;
        const c = q.p ? proton : neutron;
        const sp = g.createRadialGradient(px - rn * 0.35, py - rn * 0.35, rn * 0.1, px, py, rn);
        sp.addColorStop(0, mix(c, "#FFFFFF", 0.55));
        sp.addColorStop(0.65, c);
        sp.addColorStop(1, mix(c, "#000000", 0.45));
        g.fillStyle = sp;
        g.beginPath();
        g.arc(px, py, rn, 0, Math.PI * 2);
        g.fill();
      }
      // The three released neutrons.
      if (s > 0.7)
        for (let i = 0; i < 3; i++) {
          const a = angle + Math.PI / 2 + (i - 1) * 1.1 + (i === 1 ? Math.PI : 0);
          const d = R * (1 + (s - 0.7) * 3.2);
          const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
          g.fillStyle = neutron;
          g.shadowColor = neutron;
          g.shadowBlur = 14 * k;
          g.beginPath();
          g.arc(nx, ny, rn * 1.1, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
    };

    // Layout of events.
    type Ev = { x: number; y: number; R: number; th: number; angle: number; from?: [number, number] };
    const events: Ev[] = [];
    const hit0 = 1.6;
    if (p.mode === "single") {
      events.push({ x: B.x + B.w / 2, y: B.y + B.h / 2, R: Math.min(B.w, B.h) * 0.13, th: hit0, angle: 0.25, from: [B.x + 30 * k, B.y + B.h / 2 - 20 * k] });
    } else {
      const G = p.generations;
      const gap = (D - hit0 - 2.5) / Math.max(1, G - 1);
      let prev: Ev[] = [];
      for (let gi = 0; gi < G; gi++) {
        const count = 3 ** gi;
        const x = B.x + ((gi + 0.5) / G) * B.w;
        const R = Math.min(B.h / (count * 2.6), B.w / G / 3.2, B.h * 0.12);
        const row: Ev[] = [];
        for (let i = 0; i < count; i++) {
          const y = B.y + ((i + 0.5) / count) * B.h;
          const parent = prev[Math.floor(i / 3)];
          row.push({ x, y, R, th: hit0 + gi * gap, angle: 0.3 + i, from: parent ? [parent.x, parent.y] : [B.x + 10 * k, y] });
        }
        events.push(...row);
        prev = row;
      }
    }
    const flight = 0.9; // seconds a neutron takes to reach its nucleus

    const paint = (g: CanvasRenderingContext2D) => {
      const time = t();
      for (const ev of events) {
        // Incoming neutron.
        if (ev.from && time > ev.th - flight && time < ev.th) {
          const u = (time - (ev.th - flight)) / flight;
          const nx = ev.from[0] + (ev.x - ev.R - ev.from[0]) * u, ny = ev.from[1] + (ev.y - ev.from[1]) * u;
          g.strokeStyle = alpha(neutron, 0.5);
          g.lineWidth = 3 * k;
          g.beginPath();
          g.moveTo(ev.from[0] + (ev.x - ev.from[0]) * Math.max(0, u - 0.25), ev.from[1] + (ev.y - ev.from[1]) * Math.max(0, u - 0.25));
          g.lineTo(nx, ny);
          g.stroke();
          g.fillStyle = neutron;
          g.shadowColor = neutron;
          g.shadowBlur = 16 * k;
          g.beginPath();
          g.arc(nx, ny, ev.R * 0.21, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
        drawFission(g, ev.x, ev.y, ev.R, ev.th, time, ev.angle);
      }
    };

    const title = createRef<Txt>();
    const eq = createRef<Txt>();
    const tags = createRef<Node>();
    const ev0 = events[0];
    const count = () => events.filter((e) => t() > e.th + 0.7).length;
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {p.showLabels && p.mode === "single" ? (
          <Node ref={tags} opacity={() => clamp((t() - ev0.th - 0.75) * 2.5, 0, 1)}>
            <Txt x={() => ev0.x - Math.cos(ev0.angle) * ev0.R * (1 + 3.2 * smooth(clamp((t() - ev0.th - 0.7) / 1.4, 0, 1)))} y={() => ev0.y - Math.sin(ev0.angle) * ev0.R * 3.2 * smooth(clamp((t() - ev0.th - 0.7) / 1.4, 0, 1)) - ev0.R * 1.3} fontFamily={FONT} fontWeight={700} fontSize={30 * k} fill={L.text} text="Ba-141" />
            <Txt x={() => ev0.x + Math.cos(ev0.angle) * ev0.R * (1 + 3.2 * smooth(clamp((t() - ev0.th - 0.7) / 1.4, 0, 1)))} y={() => ev0.y + Math.sin(ev0.angle) * ev0.R * 3.2 * smooth(clamp((t() - ev0.th - 0.7) / 1.4, 0, 1)) + ev0.R * 1.3} fontFamily={FONT} fontWeight={700} fontSize={30 * k} fill={L.text} text="Kr-92" />
            <Txt x={ev0.x} y={ev0.y + ev0.R * 1.9} fontFamily={FONT} fontWeight={800} fontSize={34 * k} fill={L.highlight} text="≈ 200 MeV" opacity={() => clamp((t() - ev0.th - 0.8) * 2, 0, 1)} />
          </Node>
        ) : null}
        {p.showLabels && p.mode === "single" ? <Txt x={ev0.x} y={ev0.y - ev0.R * 1.6} fontFamily={FONT} fontWeight={700} fontSize={30 * k} fill={L.text} text={() => (t() < ev0.th ? "U-235" : t() < ev0.th + 0.7 ? "U-236 (kích thích)" : "")} /> : null}
        {p.mode === "chain" ? <Txt x={A.x + A.w} y={A.y + 18 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={30 * k} fill={L.highlight} text={() => `${count()} hạt nhân đã phân hạch`} /> : null}
        {p.showEquation ? <Txt ref={eq} x={A.cx} y={A.y + A.h - eqH / 2} fontFamily={FONT} fontWeight={700} fontSize={32 * k} fill={L.text} text="" /> : null}
      </Node>,
    );

    yield st.camera();
    yield t(D, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    if (p.showEquation) {
      yield* until(Math.max(ctx.cue(0, 1), hit0 + 0.8));
      yield* typeOn(eq(), "n + ²³⁵U → ²³⁶U* → ¹⁴¹Ba + ⁹²Kr + 3n + ≈ 200 MeV", 1.4);
    }
  },
});
