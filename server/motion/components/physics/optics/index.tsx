// Ray optics with real angles. reflection: rays on a plane mirror, angle of incidence = angle of
// reflection; refraction: a ray crossing into glass bends by Snell's law n₁sinθ₁ = n₂sinθ₂, the
// partly reflected ray's strength from Fresnel's equations; tir: going from glass to air the angle
// sweeps past the critical angle and the refracted ray vanishes (total internal reflection); prism:
// white light dispersed by a BK7 prism (Cauchy n(λ) = A + B/λ², each colour traced through both faces);
// lens: a converging lens forms the image of an arrow from the three principal rays and
// 1/f = 1/d + 1/d′ — the object walks in from beyond 2f to inside f (real inverted → virtual upright);
// fiber: light trapped in an optical fibre by repeated total internal reflection.
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "reflection" | "refraction" | "tir" | "prism" | "lens" | "fiber";
  n1: number;
  n2: number;
  angle: number;
  focal: number;
  labels: boolean;
  beams: number;
}

type XY = [number, number];
const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

// Wavelength (nm) → sRGB (approximation of the visible spectrum).
function waveRGB(l: number) {
  let r = 0, g = 0, b = 0;
  if (l < 440) (r = -(l - 440) / 60), (b = 1);
  else if (l < 490) (g = (l - 440) / 50), (b = 1);
  else if (l < 510) (g = 1), (b = -(l - 510) / 20);
  else if (l < 580) (r = (l - 510) / 70), (g = 1);
  else if (l < 645) (r = 1), (g = -(l - 645) / 65);
  else r = 1;
  const f = l < 420 ? 0.3 + (0.7 * (l - 380)) / 40 : l > 700 ? 0.3 + (0.7 * (780 - l)) / 80 : 1;
  return `rgb(${Math.round(255 * Math.pow(r * f, 0.8))}, ${Math.round(255 * Math.pow(g * f, 0.8))}, ${Math.round(255 * Math.pow(b * f, 0.8))})`;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "waves");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const draw = createSignal(0); // rays growing in
    const cx = A.cx, cy = A.cy;
    const beam = L.secondary;
    const rayLine = (pts: () => XY[], color: string, width = 4, op: () => number = () => 1) => (
      <Line points={pts} stroke={color} lineWidth={L.lw(width * k)} opacity={op} end={draw} lineCap="round" {...L.glow(color, 12 * k)} />
    );
    const arc = (at: XY, a0: number, a1: number, r: number, color: string, text: string, op: () => number = () => 1) => (
      <Node opacity={op}>
        <Draw
          paint={(g) => {
            g.strokeStyle = color;
            g.lineWidth = 2.5 * k;
            g.beginPath();
            g.arc(at[0], at[1], r, Math.min(a0, a1), Math.max(a0, a1));
            g.stroke();
          }}
        />
        <Txt text={text} x={at[0] + Math.cos((a0 + a1) / 2) * (r + 34 * k)} y={at[1] + Math.sin((a0 + a1) / 2) * (r + 34 * k)} fontFamily={FONT} fontWeight={700} fontSize={23 * k} fill={color} />
      </Node>
    );
    const S = Math.min(A.w, A.h) * 0.42;

    if (p.mode === "reflection" || p.mode === "refraction" || p.mode === "tir") {
      // Interface horizontal through the centre. Medium 1 on top (reflection: mirror).
      const n1 = p.mode === "tir" ? Math.max(p.n1, p.n2) : p.n1, n2 = p.mode === "tir" ? Math.min(p.n1, p.n2) : p.n2;
      const crit = n1 > n2 ? Math.asin(n2 / n1) : Math.PI / 2;
      // Angle of incidence: fixed, or (tir) sweeping from 10° to past the critical angle.
      const th = () => (p.mode === "tir" ? (10 + (deg(crit) + 15 - 10) * clamp((clock() - 1) / (D - 2.5), 0, 1)) * (Math.PI / 180) : (p.angle * Math.PI) / 180);
      const inc = (): XY => [cx - Math.sin(th()) * S, cy - Math.cos(th()) * S];
      const refl = (): XY => [cx + Math.sin(th()) * S, cy - Math.cos(th()) * S];
      const sin2 = () => (n1 / n2) * Math.sin(th());
      const refr = (): XY => {
        const s = sin2();
        if (s >= 1) return [cx, cy];
        const t2 = Math.asin(s);
        return [cx + Math.sin(t2) * S, cy + Math.cos(t2) * S];
      };
      // Fresnel reflectance (unpolarised).
      const Rf = () => {
        const t1 = th(), s = sin2();
        if (s >= 1) return 1;
        const t2 = Math.asin(s), c1 = Math.cos(t1), c2 = Math.cos(t2);
        const rs = ((n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2)) ** 2, rp = ((n1 * c2 - n2 * c1) / (n1 * c2 + n2 * c1)) ** 2;
        return (rs + rp) / 2;
      };
      const mirror = p.mode === "reflection";
      nodes.push(
        <Node>
          {mirror ? (
            <Node>
              <Rect x={cx} y={cy + 10 * k} width={S * 2.2} height={20 * k} fill={alpha(L.ink, 0.12)} />
              <Line points={[[cx - S * 1.1, cy], [cx + S * 1.1, cy]]} stroke="#DCE6F2" lineWidth={6 * k} />
              <Draw
                paint={(g) => {
                  g.strokeStyle = alpha(L.ink, 0.35);
                  g.lineWidth = 2 * k;
                  for (let x = -S * 1.1; x < S * 1.1; x += 26 * k) {
                    g.beginPath();
                    g.moveTo(cx + x, cy + 4 * k);
                    g.lineTo(cx + x - 14 * k, cy + 22 * k);
                    g.stroke();
                  }
                }}
              />
            </Node>
          ) : (
            <Node>
              <Rect x={cx} y={cy + S * 0.6} width={S * 2.4} height={S * 1.2} fill={alpha(L.secondary, 0.1)} />
              <Line points={[[cx - S * 1.2, cy], [cx + S * 1.2, cy]]} stroke={alpha(L.ink, 0.6)} lineWidth={2.5 * k} />
              <Txt text={`n₁ = ${num(n1, 2)}${n1 > 1.2 ? " (thuỷ tinh)" : " (không khí)"}`} x={cx - S * 1.15} y={cy - 30 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.dim} />
              <Txt text={`n₂ = ${num(n2, 2)}${n2 > 1.2 ? (n2 > 1.4 ? " (thuỷ tinh)" : " (nước)") : " (không khí)"}`} x={cx - S * 1.15} y={cy + 34 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.dim} />
            </Node>
          )}
          <Line points={[[cx, cy - S], [cx, cy + S]]} stroke={alpha(L.ink, 0.45)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
          <Txt text="pháp tuyến" x={cx + 10 * k} y={cy - S + 10 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={20 * k} fill={L.dim} />
          {rayLine(() => [inc(), [cx, cy]], beam, 5)}
          {rayLine(() => [[cx, cy], refl()], beam, 5, () => (mirror ? 1 : 0.25 + 0.75 * Math.sqrt(Rf())))}
          {mirror ? null : rayLine(() => [[cx, cy], refr()], L.accent, 5, () => (sin2() >= 1 ? 0 : Math.sqrt(1 - Rf())))}
          {arc([cx, cy], -Math.PI / 2 - th(), -Math.PI / 2, S * 0.28, beam, "θ₁", () => draw())}
          {arc([cx, cy], -Math.PI / 2, -Math.PI / 2 + th(), S * 0.24, beam, mirror ? "θ'" : "", () => draw() * (mirror ? 1 : 0.6))}
        </Node>,
      );
      // Live readout.
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Txt
            text={() =>
              mirror
                ? `góc tới = góc phản xạ = ${num(deg(th()), 0)}°`
                : sin2() >= 1
                  ? `θ₁ = ${num(deg(th()), 0)}° > góc tới hạn ${num(deg(crit), 1)}° → phản xạ toàn phần`
                  : `n₁·sinθ₁ = n₂·sinθ₂ → θ₁ = ${num(deg(th()), 0)}°, θ₂ = ${num(deg(Math.asin(sin2())), 1)}°`
            }
            x={cx}
            y={A.y + A.h - 20 * k}
            fontFamily={FONT}
            fontWeight={800}
            fontSize={28 * k}
            fill={() => (sin2() >= 1 && !mirror ? L.highlight : L.text)}
          />
        </Node>,
      );
    } else if (p.mode === "prism") {
      // Equilateral prism; incoming white beam; each wavelength traced through both faces.
      const side = S * 1.25;
      const P: XY[] = [[cx, cy - side * 0.55], [cx - side / 2, cy + side * 0.32], [cx + side / 2, cy + side * 0.32]];
      const nOf = (lnm: number) => 1.5046 + 0.0042 / (lnm / 1000) ** 2; // BK7 Cauchy (λ in µm)
      const hit = (o: XY, d: XY, a: XY, b: XY): [number, XY] | null => {
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const den = d[0] * ey - d[1] * ex;
        if (Math.abs(den) < 1e-9) return null;
        const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
        return t > 1e-6 && u >= 0 && u <= 1 ? [t, [o[0] + d[0] * t, o[1] + d[1] * t]] : null;
      };
      const refract = (d: XY, nrm: XY, n1: number, n2: number): XY | null => {
        // nrm points against d.
        const c = -(d[0] * nrm[0] + d[1] * nrm[1]), r = n1 / n2, kk = 1 - r * r * (1 - c * c);
        if (kk < 0) return null;
        const f = r * c - Math.sqrt(kk);
        return [r * d[0] + f * nrm[0], r * d[1] + f * nrm[1]];
      };
      const normalOut = (a: XY, b: XY): XY => {
        const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
        let nx = ey / l, ny = -ex / l;
        const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - (cy - side * 0.0);
        if (nx * mx + ny * my < 0) (nx = -nx), (ny = -ny);
        return [nx, ny];
      };
      const src: XY = [A.x + A.w * 0.04, cy + side * 0.12];
      const target: XY = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      const d0l = Math.hypot(target[0] - src[0], target[1] - src[1]);
      const d0: XY = [(target[0] - src[0]) / d0l, (target[1] - src[1]) / d0l];
      const lambdas = [400, 440, 480, 520, 560, 600, 640, 690];
      const paths = lambdas.map((lm) => {
        const n = nOf(lm);
        const h1 = hit(src, d0, P[0], P[1])!;
        const n1 = normalOut(P[0], P[1]);
        const d1 = refract(d0, n1, 1, n)!;
        const h2 = hit(h1[1], d1, P[0], P[2]) ?? hit(h1[1], d1, P[1], P[2]);
        if (!h2) return { lm, pts: [src, h1[1]] as XY[] };
        const n2 = normalOut(P[0], P[2]);
        const d2 = refract(d1, [-n2[0], -n2[1]], n, 1) ?? d1;
        const far: XY = [h2[1][0] + d2[0] * S * 2.2, h2[1][1] + d2[1] * S * 2.2];
        return { lm, pts: [h1[1], h2[1], far] as XY[] };
      });
      const entry = paths[0].pts[0];
      nodes.push(
        <Node>
          <Line points={P} closed fill={alpha("#BFE6FF", 0.12)} stroke={alpha("#DDF3FF", 0.8)} lineWidth={3 * k} />
          {rayLine(() => [src, entry], "#FFFFFF", 7)}
          {paths.map((pp) => (
            <Line points={pp.pts} stroke={waveRGB(pp.lm)} lineWidth={L.lw(3.2 * k)} end={() => clamp(draw() * 2 - 1, 0, 1)} {...L.glow(waveRGB(pp.lm), 10 * k)} />
          ))}
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          {label(ctx, `Chiết suất phụ thuộc bước sóng: n(tím 400 nm) = ${num(nOf(400), 3)} > n(đỏ 690 nm) = ${num(nOf(690), 3)} → tím lệch nhiều nhất`, { x: cx, y: A.y + A.h - 20 * k, size: 25, fill: L.text })}
        </Node>,
      );
    } else if (p.mode === "lens") {
      // Thin converging lens at the centre, focal length f; object arrow moves from 2.6f to 0.6f.
      const f = S * 0.42 * p.focal;
      const oh = S * 0.32;
      const dObj = () => f * (2.6 - 2.0 * clamp((clock() - 1.2) / (D - 2.4), 0, 1));
      const dImg = () => (dObj() * f) / (dObj() - f);
      const mag = () => -dImg() / dObj();
      const ox = () => cx - dObj();
      const ix = () => cx + dImg();
      const ihy = () => cy - oh * mag();
      const real = () => dObj() > f;
      const big = 10 * S;
      nodes.push(
        <Node>
          <Line points={[[A.x, cy], [A.x + A.w, cy]]} stroke={alpha(L.ink, 0.35)} lineWidth={2 * k} />
          <Draw
            paint={(g) => {
              // Lens shape and the focal points.
              g.fillStyle = alpha("#BFE6FF", 0.18);
              g.strokeStyle = alpha("#DDF3FF", 0.85);
              g.lineWidth = 3 * k;
              g.beginPath();
              g.ellipse(cx, cy, 22 * k, S * 0.75, 0, 0, TAU);
              g.fill();
              g.stroke();
              g.fillStyle = L.accent;
              for (const x of [cx - f, cx + f, cx - 2 * f, cx + 2 * f]) {
                g.beginPath();
                g.arc(x, cy, (Math.abs(x - cx) > f * 1.5 ? 5 : 8) * k, 0, TAU);
                g.fill();
              }
              g.font = `700 ${22 * k}px ${FONT}`;
              g.textAlign = "center";
              g.fillText("F", cx - f, cy + 32 * k);
              g.fillText("F'", cx + f, cy + 32 * k);
              g.fillStyle = L.dim;
              g.fillText("2F", cx - 2 * f, cy + 32 * k);
              g.fillText("2F'", cx + 2 * f, cy + 32 * k);
            }}
          />
          <Line points={() => [[ox(), cy], [ox(), cy - oh]]} stroke={L.highlight} lineWidth={7 * k} endArrow arrowSize={18 * k} />
          <Line points={() => [[ix(), cy], [ix(), ihy()]]} stroke={L.primary} lineWidth={7 * k} endArrow arrowSize={18 * k} opacity={() => draw() * (Math.abs(dImg()) < big ? 1 : 0)} lineDash={() => (real() ? [] : [10 * k, 8 * k])} />
          {/* Ray 1: parallel to the axis → through F'. */}
          {rayLine(() => [[ox(), cy - oh], [cx, cy - oh], [cx + big, cy - oh + (big / f) * oh]], beam, 3.5)}
          {/* Ray 2: through the optical centre, straight. */}
          {rayLine(() => [[ox(), cy - oh], [cx + big, cy - oh + (big * oh) / dObj()]], L.accent, 3.5)}
          {/* Ray 3: through F → parallel after the lens (only when the object is outside F). */}
          {rayLine(() => {
            const yl = cy - oh + (dObj() * oh) / (dObj() - f) * 1;
            return real() ? [[ox(), cy - oh], [cx, yl], [cx + big, yl]] : [[ox(), cy - oh], [ox(), cy - oh]];
          }, L.primary, 3.5)}
          {/* Virtual image: dashed extensions backwards. */}
          <Line points={() => (real() ? [[cx, cy], [cx, cy]] : [[cx, cy - oh], [ix(), ihy()]])} stroke={alpha(beam, 0.6)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
          <Line points={() => (real() ? [[cx, cy], [cx, cy]] : [[cx, cy], [ix(), ihy()]])} stroke={alpha(L.accent, 0.6)} lineWidth={2 * k} lineDash={[8 * k, 8 * k]} />
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Txt
            text={() => `d = ${num(dObj() / f, 2)}f → d' = ${Math.abs(dImg()) > big ? "∞" : num(dImg() / f, 2) + "f"}, ${dObj() > f ? `ảnh thật, ngược chiều, ${Math.abs(mag()) > 1 ? "lớn hơn" : "nhỏ hơn"} vật` : "ảnh ảo, cùng chiều, lớn hơn vật (kính lúp)"}`}
            x={cx}
            y={A.y + A.h - 20 * k}
            fontFamily={FONT}
            fontWeight={800}
            fontSize={27 * k}
            fill={L.text}
          />
          <Txt text="1/f = 1/d + 1/d'" x={A.x + 20 * k} y={A.y + 30 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={30 * k} fill={L.accent} />
        </Node>,
      );
    } else {
      // Fibre: core between two cladding walls; the ray bounces by total internal reflection.
      const y0 = cy - S * 0.22, y1 = cy + S * 0.22, x0 = A.x + A.w * 0.05, x1 = A.x + A.w * 0.95;
      const slope = Math.tan((Math.max(8, 90 - p.angle) * Math.PI) / 180);
      const pts: XY[] = [[x0, cy]];
      let x = x0, y = cy, dir = -1;
      while (x < x1) {
        const ty = dir < 0 ? y0 : y1;
        const dx = Math.abs(ty - y) / slope;
        x += dx;
        y = ty;
        pts.push([Math.min(x, x1), x > x1 ? y + ((x - x1) * slope * -dir) : y]);
        dir = -dir;
      }
      nodes.push(
        <Node>
          <Rect x={(x0 + x1) / 2} y={cy} width={x1 - x0} height={S * 0.8} radius={S * 0.4} fill={alpha(L.primary, 0.12)} stroke={alpha(L.primary, 0.45)} lineWidth={2 * k} />
          <Rect x={(x0 + x1) / 2} y={cy} width={x1 - x0} height={y1 - y0} fill={alpha("#BFE6FF", 0.12)} stroke={alpha("#DDF3FF", 0.6)} lineWidth={2 * k} />
          <Txt text="lõi (n lớn)" x={x0 + 20 * k} y={cy + 6 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Txt text="vỏ (n nhỏ hơn)" x={x0 + 20 * k} y={y0 - 34 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={21 * k} fill={L.dim} />
          <Line points={pts} stroke={beam} lineWidth={L.lw(4 * k)} end={draw} {...L.glow(beam, 12 * k)} />
          <Draw
            paint={(g) => {
              // Light pulses travelling along the zigzag.
              const t = clock();
              const total = pts.length - 1;
              for (let j = 0; j < 3; j++) {
                const u = (t * 0.12 * st.speed + j / 3) % 1;
                const i = Math.floor(u * total), f2 = u * total - i;
                if (!pts[i + 1]) continue;
                const x2 = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f2, y2 = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f2;
                g.globalCompositeOperation = "lighter";
                const gr = g.createRadialGradient(x2, y2, 0, x2, y2, 26 * k);
                gr.addColorStop(0, "rgba(255,255,255,0.95)");
                gr.addColorStop(1, "rgba(120,220,255,0)");
                g.fillStyle = gr;
                g.beginPath();
                g.arc(x2, y2, 26 * k, 0, TAU);
                g.fill();
              }
            }}
          />
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{label(ctx, "Tia sáng phản xạ toàn phần liên tục ở mặt lõi–vỏ nên truyền đi xa mà gần như không mất", { x: cx, y: A.y + A.h - 20 * k, size: 26, fill: L.text })}</Node>);
    }

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
    yield draw(1, 1.4, easeInOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(Math.max(1.6, ctx.cue(i, steps.length + 1)));
      yield steps[i]();
    }
    void Circle;
  },
});
