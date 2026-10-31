// A Schwarzschild black hole seen at an adjustable inclination: thin accretion disk of orbiting gas
// (Keplerian angular speed ω ∝ r^-1.5, temperature T ∝ r^-3/4 → colour, Doppler beaming brightens the
// side moving toward us), the far side of the disk bent up over the shadow by gravitational lensing,
// the photon ring at the edge of the shadow, optional relativistic jets along the spin axis, and a
// background star field displaced by the point-lens equation. Radii follow Schwarzschild ratios:
// shadow ≈ 2.6 rs, photon sphere 1.5 rs, innermost stable orbit (disk inner edge) 3 rs.
// Optional: a probe falling in, stretched by tides and dimmed by gravitational redshift √(1 − rs/r).
import { Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear, useThread } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { callout } from "../../../shared/fx";
import { label } from "../../../shared/ui";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  diskSize: number;
  tilt: number;
  spin: number;
  brightness: number;
  particles: number;
  jets: boolean;
  infall: boolean;
  labels: boolean;
  lensing: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, safe, k } = ctx;
    const L = look(ctx, "astronomy", "black_holes");
    const st = stage(ctx, L);
    const D = ctx.duration;
    const t = createSignal(0); // scene seconds × speed
    const top = p.title ? 120 * k : 20 * k;
    const cx = safe.x + safe.w / 2, cy = safe.y + top / 2 + safe.h / 2;
    const e = (clamp(p.tilt, 3, 85) * Math.PI) / 180; // elevation: 0 edge-on, 90 face-on
    const se = Math.sin(e), ce = Math.cos(e);
    const rOut = p.diskSize, rIn = 3; // in rs
    // Pixels per rs: the disk (width 2·rOut) and the lensed arc + jets must fit.
    const rs = Math.min((safe.w * 0.86) / (2 * rOut), (safe.h - top) * 0.88 / (2 * Math.max(rOut * se + 1.5, 4.4 + (p.jets ? 3 : 0))));
    const Rsh = 2.6 * rs;

    // Gas parcels: radius biased to the inside (denser, hotter), seeded phases.
    const r = rng(11);
    const gas = Array.from({ length: p.particles }, () => {
      const rr = rIn + Math.pow(r(), 1.6) * (rOut - rIn);
      return { r: rr, a0: r() * Math.PI * 2, w: Math.pow(rr / rIn, -1.5), s: 0.6 + r() * 1.4, j: r() };
    });
    // Background stars, positions relative to the hole, drifting slowly (the lens moves across them).
    const stars = Array.from({ length: 220 }, () => ({ x: (r() - 0.5) * safe.w * 1.6, y: (r() - 0.5) * (safe.h + 200 * k), m: r() }));
    const thetaE = rs * 4.2;
    const jetSeed = Array.from({ length: 40 }, () => ({ p: r(), x: r(), s: r() })); // Einstein radius of the lens on the sky

    const heat = (u: number) => (u > 0.66 ? mix(L.series[1], L.series[0], (u - 0.66) / 0.34) : u > 0.33 ? mix(L.series[2], L.series[1], (u - 0.33) / 0.33) : mix(L.series[3], L.series[2], u / 0.33));
    const light = createSignal(0); // 0 → 1 as the disk ignites
    const jetOn = createSignal(0);
    const fall = createSignal(-1); // probe progress 0–1 (−1 = hidden)

    // Disk parcel at radius rr, angle a → screen, depth (sin a > 0 = near side, drawn over the shadow).
    const proj = (rr: number, a: number): [number, number] => [Math.cos(a) * rr * rs, Math.sin(a) * rr * rs * se];

    const paint = (g: CanvasRenderingContext2D) => {
      const time = t();
      const lit = light();
      // 1. Lensed star field: image radius θ = (β + √(β² + 4θE²)) / 2, the second image on the far side.
      if (p.lensing) {
        for (const s of stars) {
          let x = s.x - ((time * 18 * k) % (safe.w * 1.6));
          if (x < -safe.w * 0.8) x += safe.w * 1.6;
          const b = Math.hypot(x, s.y) || 1;
          const th = (b + Math.sqrt(b * b + 4 * thetaE * thetaE)) / 2;
          const th2 = (b - Math.sqrt(b * b + 4 * thetaE * thetaE)) / 2; // negative: opposite side
          const size = (0.8 + s.m * 1.8) * k;
          g.fillStyle = alpha(L.ink, 0.35 + 0.5 * s.m);
          const px = (x / b) * th, py = (s.y / b) * th;
          if (Math.abs(px) < safe.w / 2 - 10 * k && Math.abs(py) < (safe.h - top) / 2 - 10 * k) g.fillRect(px - size / 2, py - size / 2, size, size);
          const qx = (x / b) * th2, qy = (s.y / b) * th2;
          if (Math.abs(th2) > Rsh * 1.02 && Math.abs(th2) < Rsh * 2.2) {
            g.fillStyle = alpha(L.ink, 0.25 * s.m);
            g.fillRect(qx - size / 3, qy - size / 3, size * 0.66, size * 0.66);
          }
        }
      }
      g.globalCompositeOperation = "lighter";
      // 2. Soft glow of the inner disk.
      const glowR = rs * (rIn + 3);
      const gl = g.createRadialGradient(0, 0, Rsh * 0.8, 0, 0, glowR * 1.6);
      gl.addColorStop(0, alpha(L.series[1], 0.35 * lit * p.brightness));
      gl.addColorStop(1, alpha(L.series[3], 0));
      g.fillStyle = gl;
      g.beginPath();
      g.ellipse(0, 0, glowR * 1.6, glowR * 1.6 * Math.max(se, 0.35), 0, 0, Math.PI * 2);
      g.fill();
      // 3. Jets (behind for the upper one when tilted toward us).
      const jet = (dir: number) => {
        const len = rs * 9 * jetOn();
        if (len <= 0) return;
        const ex = 0, ey = -dir * len * ce;
        const jg = g.createLinearGradient(0, 0, ex, ey);
        jg.addColorStop(0, alpha(L.ink, 0.55));
        jg.addColorStop(0.25, alpha(L.secondary, 0.35));
        jg.addColorStop(1, alpha(L.highlight, 0));
        g.fillStyle = jg;
        g.beginPath();
        g.moveTo(-rs * 0.08, 0);
        g.lineTo(ex - rs * 0.45, ey);
        g.lineTo(ex + rs * 0.45, ey);
        g.lineTo(rs * 0.08, 0);
        g.fill();
        // Knots of plasma streaming outward, widening and fading.
        for (let i = 0; i < 40; i++) {
          const u = (time * 0.55 + jetSeed[i].p) % 1;
          const w = (0.08 + 0.4 * u) * rs * (jetSeed[i].x - 0.5);
          g.fillStyle = alpha(i % 3 ? L.secondary : L.ink, 0.7 * (1 - u) * jetOn());
          g.beginPath();
          g.arc(ex * u + w, ey * u, rs * (0.04 + 0.07 * jetSeed[i].s) * (1 + u), 0, Math.PI * 2);
          g.fill();
        }
      };
      jet(1);
      // 4. Far half of the disk (behind the hole) and its lensed image arching over the shadow.
      const parcel = (q: (typeof gas)[0], near: boolean) => {
        const a = q.a0 + time * q.w * p.spin;
        const sin = Math.sin(a);
        if (near !== sin > 0) return;
        const [x, y] = proj(q.r, a);
        const u = Math.pow(rIn / q.r, 0.75); // temperature 0–1
        // Doppler beaming: β ∝ r^-1/2, the approaching side (cos a < 0 here) brightens as D³.
        const beta = 0.55 * Math.sqrt(rIn / q.r);
        const dop = Math.pow(clamp(1 - beta * Math.cos(a) * ce, 0.35, 1.8), 3);
        const bright = clamp(0.18 * dop * (0.4 + u) * lit * p.brightness, 0, 1);
        g.fillStyle = alpha(heat(u), bright);
        const s = q.s * k * (0.9 + u * 1.3);
        g.beginPath();
        g.ellipse(x, y, s * 1.4, s * 0.8, 0, 0, Math.PI * 2);
        g.fill();
      };
      // Lensed image of the far half: its light is bent over the top of the shadow (and, fainter,
      // under it), hugging the photon ring — an arc per radius, brighter on the approaching side.
      const halo = (flip: number, strength: number) => {
        for (let i = 0; i < 22; i++) {
          const rr = rIn + ((i + 0.5) / 22) * (rOut - rIn);
          const u = Math.pow(rIn / rr, 0.75);
          const R = Rsh * 1.04 + (rr - rIn) * rs * (flip > 0 ? 0.3 : 0.12);
          const lg = g.createLinearGradient(-R, 0, R, 0);
          const a = 0.11 * lit * p.brightness * (0.4 + u) * strength;
          lg.addColorStop(0, alpha(heat(u), clamp(a * 2.2, 0, 1)));
          lg.addColorStop(0.5, alpha(heat(u), a));
          lg.addColorStop(1, alpha(heat(u), a * 0.45));
          g.strokeStyle = lg;
          g.lineWidth = ((rOut - rIn) / 22) * rs * (flip > 0 ? 0.36 : 0.14);
          g.beginPath();
          // A little past the horizontal, so the arc ends under the disk instead of in a cut.
          g.ellipse(0, 0, R, R * (0.82 + 0.18 * se), 0, flip > 0 ? Math.PI - 0.14 : -0.14, flip > 0 ? Math.PI * 2 + 0.14 : Math.PI + 0.14);
          g.stroke();
        }
      };
      for (const q of gas) parcel(q, false);
      // Continuous haze under the parcels so the disk reads as a surface.
      for (let i = 0; i < 26; i++) {
        const rr = rIn + ((i + 0.5) / 26) * (rOut - rIn);
        const u = Math.pow(rIn / rr, 0.75);
        g.strokeStyle = alpha(heat(u), 0.05 * lit * p.brightness * (0.5 + u));
        g.lineWidth = ((rOut - rIn) / 26) * rs * 1.1;
        g.beginPath();
        g.ellipse(0, 0, rr * rs, rr * rs * se, 0, Math.PI, Math.PI * 2);
        g.stroke();
      }
      // 5. The shadow and its photon ring.
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#000000";
      g.beginPath();
      g.arc(0, 0, Rsh, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = alpha(L.series[0], 0.9 * lit);
      g.lineWidth = 2.5 * k;
      g.shadowColor = L.series[1];
      g.shadowBlur = 18 * k * lit;
      g.beginPath();
      g.arc(0, 0, Rsh * 1.01, 0, Math.PI * 2);
      g.stroke();
      g.shadowBlur = 0;
      halo(1, 1);
      halo(-1, 0.45);
      // 6. Near half of the disk, in front of the shadow.
      for (let i = 0; i < 26; i++) {
        const rr = rIn + ((i + 0.5) / 26) * (rOut - rIn);
        const u = Math.pow(rIn / rr, 0.75);
        g.strokeStyle = alpha(heat(u), 0.06 * lit * p.brightness * (0.5 + u));
        g.lineWidth = ((rOut - rIn) / 26) * rs * 1.1;
        g.beginPath();
        g.ellipse(0, 0, rr * rs, rr * rs * se, 0, 0, Math.PI);
        g.stroke();
      }
      for (const q of gas) parcel(q, true);
      jet(-1);
      // 7. Infalling probe: spiral inward, tidal stretch ∝ r⁻³, redshift dimming √(1 − rs/r).
      const f = fall();
      if (f >= 0) {
        const rr = rOut * 1.15 - (rOut * 1.15 - 1.02) * smooth(f);
        const a = -Math.PI * 0.6 + f * Math.PI * 3.2;
        const [x, y] = proj(rr, a);
        const z = Math.sqrt(clamp(1 - 1 / rr, 0, 1));
        const stretch = 1 + clamp(30 / Math.pow(rr, 3), 0, 6);
        g.globalCompositeOperation = "source-over";
        g.save();
        g.translate(x, y);
        g.rotate(Math.atan2(y, x));
        g.fillStyle = mix(L.highlight, L.secondary, z);
        g.globalAlpha = 0.25 + 0.75 * z;
        g.shadowColor = L.secondary;
        g.shadowBlur = 14 * k * z;
        g.beginPath();
        g.ellipse(0, 0, 9 * k * stretch, (9 * k) / Math.sqrt(stretch), 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    };

    const title = createRef<Txt>();
    const marks: Node[] = [];
    const mark = (n: Node) => marks.push(n);
    const noteRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Draw x={cx} y={cy} paint={paint} />
        {p.labels ? (
          <Node>
            {callout(ctx, L, [cx + Rsh * 0.71, cy - Rsh * 0.71], "Chân trời sự kiện · bóng tối ≈ 2,6 rs", { dx: 170, dy: -90, color: L.text, ref: mark })}
            {callout(ctx, L, [cx - Rsh * 1.01, cy], "Vòng photon", { dx: -150, dy: -70, color: L.series[0], ref: mark })}
            {callout(ctx, L, [cx + (rIn + (rOut - rIn) * 0.55) * rs, cy + (rIn + (rOut - rIn) * 0.55) * rs * se * 0.2], "Đĩa bồi tụ · mép trong 3 rs", { dx: 40, dy: 110, color: L.series[1], ref: mark })}
            {p.jets ? callout(ctx, L, [cx, cy - rs * 6 * ce], "Tia vật chất tương đối tính", { dx: 160, dy: -30, color: L.secondary, ref: mark }) : null}
          </Node>
        ) : null}
        {p.title ? label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {p.infall ? label(ctx, "Càng gần chân trời, ánh sáng càng đỏ và mờ: √(1 − rs/r)", { x: safe.x + safe.w, y: safe.y + safe.h - 24 * k, size: 24, align: "right", fill: L.dim, ref: noteRef, opacity: 0 }) : null}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    yield* light(1, 1.6, st.ease);
    const steps = marks.length + (p.jets ? 1 : 0) + (p.infall ? 1 : 0);
    let i = 0;
    for (const m of marks) {
      yield* until(ctx.cue(i++, steps));
      yield m.opacity(1, 0.5, st.ease);
    }
    if (p.jets) {
      yield* until(ctx.cue(i++, steps));
      yield jetOn(1, 1.2, st.ease);
    }
    if (p.infall) {
      yield* until(ctx.cue(i++, steps));
      const left = Math.max(1.5, D - useThread().time() - 0.4);
      fall(0);
      yield* all(noteRef().opacity(1, 0.5), fall(1, left, linear));
    }
  },
});

