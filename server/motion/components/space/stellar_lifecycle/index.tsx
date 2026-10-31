// Life of a star, chosen by its mass: a nebula collapses into a protostar, the star burns hydrogen
// on the main sequence (colour from its mass: red dwarfs to blue giants; lifetime ≈ 10¹⁰ yr × M^-2.5),
// swells into a red giant (or supergiant), then ends as a planetary nebula + white dwarf (below
// 8 solar masses), or in a supernova leaving a neutron star (8–20) or a black hole (above ~20).
// Each stage starts at a narration cue; a strip of stage chips tracks where we are.
import { Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeInOutCubic, linear, useThread } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { label, FONT } from "../../../shared/ui";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mass: number;
  showTimeline: boolean;
  showLifetime: boolean;
}

// Main-sequence colour by mass (approximate spectral classes M → O).
function msColor(m: number) {
  if (m < 0.6) return "#FF8A4C";
  if (m < 1.1) return "#FFD27A";
  if (m < 2) return "#FFF4D6";
  if (m < 8) return "#DCE8FF";
  return "#9CC2FF";
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "stars_galaxies");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const M = p.mass;
    const fate = M < 8 ? "dwarf" : M < 20 ? "neutron" : "hole";
    const names = ["Tinh vân", "Tiền sao", "Dãy chính", M < 8 ? "Sao khổng lồ đỏ" : "Siêu khổng lồ đỏ", M < 8 ? "Tinh vân hành tinh" : "Siêu tân tinh", fate === "dwarf" ? "Sao lùn trắng" : fate === "neutron" ? "Sao neutron" : "Hố đen"];
    const N = names.length;
    const chips = p.showTimeline ? 1 : 0;
    const stripH = chips ? 90 * k : 0;
    const cx = A.cx, cy = A.y + (A.h - stripH) / 2;
    const R0 = Math.min(A.w, A.h - stripH) * 0.11; // main-sequence radius on screen
    const Rmax = (Math.min(A.w, A.h - stripH) / 2) * 0.82; // a giant fills the view, no more
    const t = createSignal(0);
    const s = createSignal(0); // stage, fractional while morphing
    const boom = createSignal(-1); // seconds since supernova / shell
    const r = rng(21);
    const cloud = Array.from({ length: 70 }, () => ({ a: r() * Math.PI * 2, d: Math.pow(r(), 0.6), size: 0.2 + r() * 0.5, c: r() < 0.5 ? L.primary : r() < 0.5 ? L.accent : L.secondary, w: (r() - 0.5) * 0.3 }));
    const debris = Array.from({ length: 420 }, () => ({ a: r() * Math.PI * 2, v: 0.5 + r() * 0.8, size: 1 + r() * 3, c: [L.accent, L.primary, L.highlight, "#FFFFFF"][Math.floor(r() * 4)] }));
    const ms = msColor(M);
    const giant = M < 8 ? "#FF7A45" : "#FF5A3C";
    const lifetime = 1e10 * Math.pow(M, -2.5);

    const paint = (g: CanvasRenderingContext2D) => {
      const time = t(), sv = s();
      const cur = Math.floor(sv), f = sv - cur;
      g.globalCompositeOperation = "lighter";
      // Nebula (stages 0–1): clouds that collapse toward the centre.
      const neb = clamp(1.6 - sv, 0, 1);
      if (neb > 0) {
        const spread = R0 * (3.2 - 2.4 * smooth(clamp(sv, 0, 1)));
        for (const q of cloud) {
          const a = q.a + time * q.w;
          const x = cx + Math.cos(a) * q.d * spread, y = cy + Math.sin(a) * q.d * spread * 0.7;
          const rr = q.size * spread * 0.55;
          const gr = g.createRadialGradient(x, y, 0, x, y, rr);
          gr.addColorStop(0, alpha(q.c, 0.16 * neb));
          gr.addColorStop(1, alpha(q.c, 0));
          g.fillStyle = gr;
          g.beginPath();
          g.arc(x, y, rr, 0, Math.PI * 2);
          g.fill();
        }
      }
      // The star itself: radius and colour by stage.
      let R = 0, col = ms, bright = 1;
      if (sv < 1) (R = R0 * 0.25 * smooth(sv)), (col = "#FF9F6B"), (bright = smooth(sv));
      else if (sv < 2) (R = R0 * (0.25 + 0.75 * smooth(f))), (col = mix("#FF9F6B", ms, smooth(f)));
      else if (sv < 3) (R = R0 + (Rmax * (M < 8 ? 0.8 : 1) - R0) * smooth(f)), (col = mix(ms, giant, smooth(f)));
      else if (sv < 4) (R = Rmax * (M < 8 ? 0.8 : 1) * (1 - 0.92 * smooth(f))), (col = giant), (bright = 1 - 0.5 * f);
      else R = 0;
      if (R > 0) {
        const halo = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9);
        halo.addColorStop(0, alpha(col, 0.5 * bright));
        halo.addColorStop(1, alpha(col, 0));
        g.fillStyle = halo;
        g.beginPath();
        g.arc(cx, cy, R * 1.9, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = "source-over";
        const disc = g.createRadialGradient(cx - R * 0.25, cy - R * 0.25, 0, cx, cy, R);
        disc.addColorStop(0, mix(col, "#FFFFFF", 0.6));
        disc.addColorStop(0.7, col);
        disc.addColorStop(1, mix(col, "#000000", 0.35));
        g.fillStyle = disc;
        g.globalAlpha = clamp(bright, 0, 1);
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.fill();
        // Convection cells: a fine mottling of brighter and darker patches that slowly churn.
        for (let i = 0; i < 140; i++) {
          const a = i * 2.39996 + time * 0.05 * ((i % 5) - 2), d = Math.sqrt((i + 0.5) / 140) * 0.92;
          const on = Math.sin(time * 1.3 + i * 1.7);
          g.globalCompositeOperation = on > 0 ? "lighter" : "source-over";
          g.fillStyle = on > 0 ? alpha("#FFFFFF", 0.05 * on) : alpha("#000000", -0.07 * on);
          g.beginPath();
          g.arc(cx + Math.cos(a) * d * R, cy + Math.sin(a) * d * R, R * 0.07, 0, Math.PI * 2);
          g.fill();
        }
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 1;
      }
      // End: shell (planetary nebula) or supernova debris + shock, then the remnant.
      const b = boom();
      if (b >= 0) {
        const maxR = Math.min(A.w, A.h - stripH) * 0.42;
        if (fate === "dwarf") {
          const rr = maxR * (1 - Math.exp(-b * 0.6));
          for (let i = 0; i < 3; i++) {
            g.strokeStyle = alpha([L.secondary, L.primary, L.highlight][i], 0.35 * Math.exp(-b * 0.05));
            g.lineWidth = (14 - i * 4) * k;
            g.beginPath();
            g.ellipse(cx, cy, rr * (1 - i * 0.12), rr * (0.8 - i * 0.1), 0.3, 0, Math.PI * 2);
            g.stroke();
          }
        } else {
          if (b < 0.6) {
            const fl = g.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2);
            fl.addColorStop(0, alpha("#FFFFFF", 0.9 * (1 - b / 0.6)));
            fl.addColorStop(1, alpha(L.accent, 0));
            g.fillStyle = fl;
            g.beginPath();
            g.arc(cx, cy, maxR * 1.2, 0, Math.PI * 2);
            g.fill();
          }
          const front = maxR * (1 - Math.exp(-b * 0.9));
          // The ejected gas glows as a new nebula, the material of future stars.
          for (const q of cloud) {
            const d = front * (0.4 + 0.6 * q.d), x = cx + Math.cos(q.a) * d, y = cy + Math.sin(q.a) * d;
            const rr = q.size * front * 0.45;
            const gr = g.createRadialGradient(x, y, 0, x, y, rr);
            gr.addColorStop(0, alpha(q.c, 0.14 * Math.min(1, b * 2)));
            gr.addColorStop(1, alpha(q.c, 0));
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x, y, rr, 0, Math.PI * 2);
            g.fill();
          }
          g.strokeStyle = alpha(L.accent, 0.5 * Math.exp(-b * 0.25));
          g.lineWidth = 6 * k;
          g.beginPath();
          g.arc(cx, cy, front, 0, Math.PI * 2);
          g.stroke();
          for (const q of debris) {
            const d = front * q.v;
            g.fillStyle = alpha(q.c, 0.8 * Math.exp(-b * 0.2));
            g.beginPath();
            g.arc(cx + Math.cos(q.a) * d, cy + Math.sin(q.a) * d, q.size * k, 0, Math.PI * 2);
            g.fill();
          }
        }
        // Remnant.
        const rem = clamp(b * 1.5, 0, 1);
        if (fate === "dwarf") {
          g.fillStyle = alpha("#F8FAFF", rem);
          g.shadowColor = "#FFFFFF";
          g.shadowBlur = 24 * k;
          g.beginPath();
          g.arc(cx, cy, 9 * k, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        } else if (fate === "neutron") {
          // Pulsar: two beams sweeping round.
          const ang = time * 4;
          for (const sgn of [1, -1]) {
            const bx = cx + Math.cos(ang) * maxR * 0.7 * sgn, by = cy + Math.sin(ang) * maxR * 0.25 * sgn;
            const bg = g.createLinearGradient(cx, cy, bx, by);
            bg.addColorStop(0, alpha(L.highlight, 0.7 * rem));
            bg.addColorStop(1, alpha(L.highlight, 0));
            g.strokeStyle = bg;
            g.lineWidth = 10 * k;
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(bx, by);
            g.stroke();
          }
          g.fillStyle = alpha("#CFFAFE", rem);
          g.beginPath();
          g.arc(cx, cy, 8 * k, 0, Math.PI * 2);
          g.fill();
        } else {
          g.globalCompositeOperation = "source-over";
          g.fillStyle = alpha("#000000", rem);
          g.beginPath();
          g.arc(cx, cy, 26 * k, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = alpha(L.accent, rem);
          g.lineWidth = 3 * k;
          g.beginPath();
          g.arc(cx, cy, 28 * k, 0, Math.PI * 2);
          g.stroke();
        }
      }
    };

    const title = createRef<Txt>();
    const stageName = createRef<Txt>();
    const chipRefs: Rect[] = [];
    const chipW = (A.w - 10 * k * (N - 1)) / N;
    const life = createRef<Txt>();
    st.cam.add(
      <Node>
        <Draw paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        <Txt ref={stageName} x={A.x} y={A.y + 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={34 * k} fill={L.text} text={() => names[clamp(Math.round(s()), 0, N - 1)]} />
        {p.showLifetime ? <Txt ref={life} x={A.x} y={A.y + 64 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={L.dim} opacity={0} text={`${num(M, 1)} lần khối lượng Mặt Trời · ở dãy chính ≈ ${lifetime >= 1e9 ? `${num(lifetime / 1e9, 1)} tỉ` : `${num(lifetime / 1e6, 0)} triệu`} năm`} /> : null}
        {chips ? (
          <Node>
            {names.map((nm, i) => (
              <Rect ref={(n: Rect) => (chipRefs[i] = n)} x={A.x + chipW / 2 + i * (chipW + 10 * k)} y={A.y + A.h - 34 * k} width={chipW} height={56 * k} radius={14 * k} fill={L.panel} stroke={L.line} lineWidth={2 * k}>
                <Txt text={nm} fontFamily={FONT} fontWeight={600} fontSize={Math.min(22, (chipW / k) / 9) * k} fill={L.dim} />
              </Rect>
            ))}
          </Node>
        ) : null}
      </Node>,
    );
    const light = (i: number) => {
      const c = chipRefs[i];
      if (!c) return;
      c.stroke(L.accent);
      c.fill(alpha(L.accent, 0.18));
      (c.children()[0] as Txt).fill(L.text);
    };

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    light(0);
    // Stages 1–4 morph at cues; stage 5 (remnant) follows the explosion/shell.
    for (let i = 1; i <= 4; i++) {
      yield* until(ctx.cue(i - 1, 4));
      if (i === 2 && p.showLifetime) yield life().opacity(1, 0.5);
      if (i < 4) {
        light(i);
        yield* s(i, 1.2, easeInOutCubic);
      } else {
        yield* s(3.98, 0.8, easeInOutCubic);
        s(4);
        light(4);
        boom(0);
        yield boom(Math.max(2, D - useThread().time()), Math.max(2, D - useThread().time()), linear);
        yield* until(useThread().time() + Math.min(1.2, Math.max(0.3, D - useThread().time() - 1)));
        light(5);
        s(5);
      }
    }
  },
});
