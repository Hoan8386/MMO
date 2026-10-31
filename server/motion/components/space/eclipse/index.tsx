// Eclipses. Geometry (side view, not to scale): the Sun, the Moon on its orbit and the Earth, with the
// umbra and penumbra cones of the body in front drawn from the real tangent lines. solar: the Moon passes
// between the Sun and the Earth, its umbra touching the Earth; inset, the view from inside the umbra —
// the Moon covering the Sun disc (overlap computed), the corona appearing at totality, the sky
// darkening. lunar: the Earth's shadow falls on the Moon; inset, the Moon entering the penumbra then the
// umbra and turning red (sunlight refracted through Earth's atmosphere).
import { Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  kind: "solar" | "lunar";
  inset: boolean;
  labels: boolean;
}

type XY = [number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "solar_system");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const u = () => clamp((clock() - 0.8) / (D - 1.6), 0, 1); // 0 → 1 across the event
    // Diagram (top or left part).
    const GW = p.inset && A.wide ? A.w * 0.58 : A.w, GH = p.inset && !A.wide ? A.h * 0.5 : A.h;
    const sunC: XY = [A.x + GW * 0.08, A.y + GH / 2], sunR = GH * 0.3;
    const earthC: XY = [A.x + GW * 0.8, A.y + GH / 2], earthR = GH * 0.1;
    const moonR = earthR * 0.27 * 1.6;
    // Moon position: passes through the line on its orbit around the Earth.
    const moonAng = () => (p.kind === "solar" ? Math.PI : 0) + (u() - 0.5) * 0.6;
    const orbitR = GW * 0.18;
    const moonC = (): XY => [earthC[0] + Math.cos(moonAng()) * orbitR, earthC[1] + Math.sin(moonAng()) * orbitR];
    // Shadow cones of a sphere (centre c, radius r) lit by the Sun: external tangents (umbra) and
    // internal tangents (penumbra), as polygons extending away from the Sun.
    const cones = (c: XY, r: number, len: number) => {
      const dx = c[0] - sunC[0], dy = c[1] - sunC[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
      const um = Math.atan((sunR - r) / d), pe = Math.atan((sunR + r) / d);
      const side = (sgn: number, ang: number, inner: boolean): [XY, XY] => {
        // Tangent point on the body and the direction of the tangent ray.
        const a = sgn * ang;
        const dirx = ux * Math.cos(a) - uy * Math.sin(a), diry = ux * Math.sin(a) + uy * Math.cos(a);
        const s = inner ? -sgn : sgn;
        const tp: XY = [c[0] + nx * r * s, c[1] + ny * r * s];
        return [tp, [tp[0] + dirx * len, tp[1] + diry * len]];
      };
      const [u1a, u1b] = side(-1, um, false), [u2a, u2b] = side(1, um, false);
      const [p1a, p1b] = side(1, pe, true), [p2a, p2b] = side(-1, pe, true);
      return { umbra: [u1a, u1b, u2b, u2a] as XY[], pen1: [p1a, p1b, u1b, u1a] as XY[], pen2: [p2a, p2b, u2b, u2a] as XY[] };
    };
    const poly = (g: CanvasRenderingContext2D, pts: XY[], fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(...q) : g.moveTo(...q)));
      g.closePath();
      g.fill();
    };
    const diagram = (g: CanvasRenderingContext2D) => {
      // Sun.
      const gr = g.createRadialGradient(sunC[0], sunC[1], sunR * 0.5, sunC[0], sunC[1], sunR * 1.3);
      gr.addColorStop(0, "#FFF1C1");
      gr.addColorStop(0.75, "#FFB347");
      gr.addColorStop(1, "rgba(255,150,60,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(sunC[0], sunC[1], sunR * 1.3, 0, TAU);
      g.fill();
      // Moon orbit.
      g.strokeStyle = alpha(L.ink, 0.25);
      g.setLineDash([6 * k, 8 * k]);
      g.lineWidth = 2 * k;
      g.beginPath();
      g.arc(earthC[0], earthC[1], orbitR, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      const m = moonC();
      const front = p.kind === "solar" ? { c: m, r: moonR } : { c: earthC, r: earthR };
      const cs = cones(front.c, front.r, GW * 0.6);
      poly(g, cs.pen1, "rgba(120,120,140,0.25)");
      poly(g, cs.pen2, "rgba(120,120,140,0.25)");
      poly(g, cs.umbra, "rgba(10,10,20,0.8)");
      // Earth (blue, lit side toward the Sun) and Moon.
      const eg = g.createRadialGradient(earthC[0] - earthR * 0.4, earthC[1], earthR * 0.1, earthC[0], earthC[1], earthR);
      eg.addColorStop(0, "#7FC4FF");
      eg.addColorStop(1, "#1B4E8C");
      g.fillStyle = eg;
      g.beginPath();
      g.arc(earthC[0], earthC[1], earthR, 0, TAU);
      g.fill();
      const inShadow = p.kind === "lunar" ? smooth(1 - Math.abs(u() - 0.5) * 3) : 0;
      g.fillStyle = mix("#D8D4CC", "#8B2E1E", inShadow);
      g.beginPath();
      g.arc(m[0], m[1], moonR, 0, TAU);
      g.fill();
      g.font = `700 ${22 * k}px ${FONT}`;
      g.fillStyle = L.text;
      g.textAlign = "center";
      g.fillText("Mặt Trời", sunC[0] + sunR * 0.3, sunC[1] + sunR + 30 * k);
      g.fillText("Trái Đất", earthC[0], earthC[1] + earthR + 30 * k);
      g.fillText("Mặt Trăng", m[0], m[1] - moonR - 16 * k);
    };
    // Inset: the sky as seen from Earth (solar) or the Moon's face (lunar).
    const IW = p.inset ? (A.wide ? A.w - GW - 20 * k : A.w) : 0, IH = p.inset ? (A.wide ? A.h : A.h - GH - 20 * k) : 0;
    const ic: XY = [A.wide ? A.x + GW + 20 * k + IW / 2 : A.cx, A.wide ? A.cy : A.y + GH + 20 * k + IH / 2];
    const iR = Math.min(IW, IH) * 0.22;
    const inset = (g: CanvasRenderingContext2D) => {
      if (!p.inset) return;
      g.save();
      g.beginPath();
      g.rect(ic[0] - IW / 2, ic[1] - IH / 2, IW, IH);
      g.clip();
      if (p.kind === "solar") {
        // Moon disc slides across the Sun; overlap fraction → sky darkness, corona at totality.
        const off = (u() - 0.5) * 2 * iR * 2.6;
        const mx = ic[0] + off, my = ic[1] + off * 0.15;
        const d = Math.hypot(mx - ic[0], my - ic[1]);
        const r1 = iR, r2 = iR * 1.03;
        let ov = 0;
        if (d < r1 + r2) {
          if (d <= r2 - r1) ov = 1;
          else {
            const a = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
            ov = (r1 * r1 * a + r2 * r2 * b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2))) / (Math.PI * r1 * r1);
          }
        }
        const sky = mix("#5DA9E9", "#05060F", Math.pow(ov, 3));
        g.fillStyle = sky;
        g.fillRect(ic[0] - IW / 2, ic[1] - IH / 2, IW, IH);
        if (ov > 0.97) {
          g.globalCompositeOperation = "lighter";
          const cg = g.createRadialGradient(ic[0], ic[1], iR, ic[0], ic[1], iR * 2.6);
          cg.addColorStop(0, `rgba(255,255,240,${(ov - 0.97) / 0.03})`);
          cg.addColorStop(1, "rgba(200,220,255,0)");
          g.fillStyle = cg;
          g.beginPath();
          g.arc(ic[0], ic[1], iR * 2.6, 0, TAU);
          g.fill();
          g.globalCompositeOperation = "source-over";
        }
        g.fillStyle = "#FFF4D0";
        g.beginPath();
        g.arc(ic[0], ic[1], r1, 0, TAU);
        g.fill();
        g.fillStyle = "#0A0A10";
        g.beginPath();
        g.arc(mx, my, r2, 0, TAU);
        g.fill();
        g.font = `800 ${24 * k}px ${FONT}`;
        g.fillStyle = "#FFFFFF";
        g.textAlign = "center";
        g.fillText(ov > 0.99 ? "Toàn phần — thấy vành nhật hoa" : `Che ${num(ov * 100, 0)} %`, ic[0], ic[1] + IH / 2 - 30 * k);
      } else {
        // Earth's shadow sweeping over the Moon: penumbra (soft) then umbra (red).
        g.fillStyle = "#05060F";
        g.fillRect(ic[0] - IW / 2, ic[1] - IH / 2, IW, IH);
        const sx = ic[0] + (0.5 - u()) * 2 * iR * 3.2;
        g.fillStyle = "#D8D4CC";
        g.beginPath();
        g.arc(ic[0], ic[1], iR, 0, TAU);
        g.fill();
        g.save();
        g.beginPath();
        g.arc(ic[0], ic[1], iR, 0, TAU);
        g.clip();
        g.fillStyle = "rgba(20,20,30,0.45)";
        g.beginPath();
        g.arc(sx, ic[1], iR * 2.6, 0, TAU);
        g.fill();
        g.fillStyle = "rgba(150,40,20,0.85)";
        g.beginPath();
        g.arc(sx, ic[1], iR * 1.6, 0, TAU);
        g.fill();
        g.restore();
        g.font = `800 ${24 * k}px ${FONT}`;
        g.fillStyle = "#FFFFFF";
        g.textAlign = "center";
        g.fillText("Mặt Trăng đỏ: ánh sáng khúc xạ qua khí quyển Trái Đất", ic[0], ic[1] + IH / 2 - 30 * k);
      }
      g.restore();
    };

    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const lbl = createSignal(0);
    shows.push(lbl);
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          <Draw paint={diagram} />
          <Draw paint={inset} />
          {p.labels ? (
            <Node opacity={lbl}>
              {label(ctx, p.kind === "solar" ? "Nhật thực: Mặt Trăng nằm giữa — vùng tối (umbra) thấy toàn phần, vùng nửa tối thấy một phần" : "Nguyệt thực: Trái Đất nằm giữa — Mặt Trăng đi vào bóng Trái Đất", { x: A.x + GW / 2, y: A.y + 24 * k, size: 23, fill: L.text })}
            </Node>
          ) : null}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );
    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    yield* until(ctx.cue(0, 2));
    yield lbl(1, 0.5);
    void Rect;
  },
});
