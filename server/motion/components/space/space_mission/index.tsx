// Spaceflight scenes. launch: a two-stage rocket lifts off (exhaust plume, ground smoke, gravity
// turn, stage and fairing separation) with telemetry from integrating the rocket equation with
// Falcon-9-like numbers; hohmann: Earth, a low orbit, the transfer ellipse and the circularisation
// burn to geostationary orbit, Δv from the vis-viva equation; gravity_assist: a probe swings past a
// moving planet — the turn is symmetric in the planet's frame but adds the planet's velocity in the
// Sun's frame (vector diagram); satellites: LEO, GPS and geostationary satellites moving with
// Kepler's third law; landing: the Mars entry, descent and landing sequence (heat shield glow,
// parachute, powered descent, sky crane).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { Sphere } from "../../../shared/sphere";
import { FONT, label, fitX } from "../../../shared/ui";
import { starfield } from "../../../shared/fx";
import { until, rng, clamp, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";
import { BODIES } from "../planet/bodies";

interface Props {
  title: string;
  mission: "launch" | "hohmann" | "gravity_assist" | "satellites" | "landing";
  timeScale: number;
  telemetry: boolean;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

// Rocket outline at (x, y) pointing along angle `a` (0 = up), length Lr; parts: which stages remain.
function drawRocket(g: CanvasRenderingContext2D, x: number, y: number, a: number, Lr: number, parts: { first: boolean; fairing: boolean; upper?: boolean }) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const w = Lr * 0.09;
  const body = (y0: number, y1: number, ww: number) => {
    const gr = g.createLinearGradient(-ww, 0, ww, 0);
    gr.addColorStop(0, "#8D97A6");
    gr.addColorStop(0.35, "#F4F6FA");
    gr.addColorStop(0.7, "#D9DEE6");
    gr.addColorStop(1, "#6F7886");
    g.fillStyle = gr;
    g.fillRect(-ww, y0, ww * 2, y1 - y0);
  };
  // Second stage + payload fairing (top), first stage (bottom). y grows downward; tip at −Lr.
  if (parts.first) {
    body(-Lr * 0.62, 0, w);
    g.fillStyle = "#1E2430";
    g.fillRect(-w, -Lr * 0.62, w * 2, Lr * 0.025);
    // Grid fins and landing legs (folded).
    g.fillStyle = "#3A4250";
    g.fillRect(-w * 1.5, -Lr * 0.57, w * 0.5, Lr * 0.03);
    g.fillRect(w, -Lr * 0.57, w * 0.5, Lr * 0.03);
    g.beginPath();
    g.moveTo(-w, -Lr * 0.06);
    g.lineTo(-w * 1.5, 0);
    g.lineTo(-w, 0);
    g.moveTo(w, -Lr * 0.06);
    g.lineTo(w * 1.5, 0);
    g.lineTo(w, 0);
    g.fill();
  }
  const top0 = parts.first ? -Lr * 0.62 : 0;
  if (parts.upper === false) {
    g.restore();
    return;
  }
  body(top0 - Lr * 0.2, top0, w);
  g.fillStyle = "#2C3442";
  g.fillRect(-w * 0.55, top0, w * 1.1, Lr * 0.035);
  if (parts.fairing) {
    const fw = w * 1.25, fy = top0 - Lr * 0.2;
    const gr = g.createLinearGradient(-fw, 0, fw, 0);
    gr.addColorStop(0, "#9AA3B0");
    gr.addColorStop(0.4, "#FFFFFF");
    gr.addColorStop(1, "#7A8392");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-fw, fy);
    g.lineTo(-fw, fy - Lr * 0.1);
    g.quadraticCurveTo(-fw, fy - Lr * 0.18, 0, fy - Lr * 0.2);
    g.quadraticCurveTo(fw, fy - Lr * 0.18, fw, fy - Lr * 0.1);
    g.lineTo(fw, fy);
    g.closePath();
    g.fill();
  } else {
    // Payload exposed: a satellite with solar panels folded.
    const fy = top0 - Lr * 0.2;
    g.fillStyle = "#D4AF37";
    g.fillRect(-w * 0.8, fy - Lr * 0.09, w * 1.6, Lr * 0.09);
    g.fillStyle = "#1B3A7A";
    g.fillRect(-w * 0.75, fy - Lr * 0.16, w * 1.5, Lr * 0.07);
  }
  g.restore();
}

// Exhaust plume below the nozzle (bright core, orange flame, flicker), and shock diamonds.
function drawPlume(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wd: number, t: number, thin: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.globalCompositeOperation = "lighter";
  const fl = 1 + 0.08 * Math.sin(t * 40) + 0.05 * Math.sin(t * 73);
  const ln = len * fl;
  // Thin air: the plume widens with altitude.
  const ww = wd * (1 + thin * 2.5);
  const gr = g.createLinearGradient(0, 0, 0, ln);
  gr.addColorStop(0, "rgba(255,255,240,0.95)");
  gr.addColorStop(0.2, "rgba(255,200,90,0.85)");
  gr.addColorStop(0.6, "rgba(255,110,40,0.45)");
  gr.addColorStop(1, "rgba(255,60,20,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-wd * 0.5, 0);
  g.quadraticCurveTo(-ww, ln * 0.4, 0, ln);
  g.quadraticCurveTo(ww, ln * 0.4, wd * 0.5, 0);
  g.closePath();
  g.fill();
  if (thin < 0.5)
    for (let i = 1; i <= 4; i++) {
      g.fillStyle = `rgba(255,250,230,${0.5 * (1 - i / 5) * (1 - thin * 2)})`;
      g.beginPath();
      g.ellipse(0, ln * 0.12 * i, wd * 0.28, wd * 0.18, 0, 0, TAU);
      g.fill();
    }
  g.restore();
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "space_exploration");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const nodes: Node[] = [];
    const steps: (() => ThreadGenerator)[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const tele: [string, () => string][] = [];
    const callTo = (at: () => XY, to0: () => XY, text: string) => {
      const s = createSignal(0);
      const to = (): XY => [fitX(ctx, to0()[0], text, 25, to0()[0] >= at()[0]), to0()[1]];
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Line points={() => [at(), to()]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Rect position={at} size={10 * k} radius={5 * k} fill={L.accent} />
          <Txt text={text} x={() => to()[0] + (to()[0] >= at()[0] ? 10 : -10) * k} y={() => to()[1]} offsetX={() => (to()[0] >= at()[0] ? -1 : 1)} fontFamily={FONT} fontWeight={700} fontSize={25 * k} fill={L.text} shadowColor="rgba(0,0,0,0.9)" shadowBlur={8 * k} />
        </Node>,
      );
    };

    if (p.mission === "launch") {
      // ---- integrate ascent: two stages, thrust/mass/burn from Falcon-9-like figures, no drag.
      const S1 = { m0: 549e3, mp: 395e3, T: 7.6e6, burn: 162 }, S2 = { m0: 116e3, mp: 92.7e3, T: 0.98e6, burn: 397 };
      const dt = 0.5, tl: { t: number; h: number; x: number; v: number; ang: number; a: number; stage: number }[] = [];
      let h = 0, x = 0, vx = 0, vy = 0, t = 0;
      while (t < 260) {
        const st1 = t < S1.burn;
        const m = st1 ? S1.m0 - (S1.mp * t) / S1.burn : S2.m0 - (S2.mp * (t - S1.burn - 3)) / S2.burn;
        const T = st1 ? S1.T : t > S1.burn + 3 ? S2.T : 0;
        // Pitch program: vertical for 10 s, then a gravity turn toward ~70° from vertical.
        const ang = t < 10 ? 0 : Math.min(1.25, ((t - 10) / 220) * 1.25 + 0.05);
        const g0 = 9.81 * (6371e3 / (6371e3 + h)) ** 2;
        const ax = (T / m) * Math.sin(ang), ay = (T / m) * Math.cos(ang) - g0 + (vx * vx) / (6371e3 + h);
        vx += ax * dt;
        vy += ay * dt;
        x += vx * dt;
        h = Math.max(0, h + vy * dt);
        tl.push({ t, h, x, v: Math.hypot(vx, vy), ang, a: Math.hypot(ax, ay + g0) / 9.81, stage: st1 ? 1 : 2 });
        t += dt;
      }
      const ts = p.timeScale * st.speed; // mission seconds per video second
      const T0 = 1.2; // ignition at 1.2 s, liftoff at ~2.2 s
      const missionT = () => Math.max(0, (clock() - T0 - 1) * ts);
      const at = () => tl[Math.min(tl.length - 1, Math.floor(missionT() / dt))];
      const sepT = S1.burn, fairT = 200;
      // Screen: the rocket stays near 60 % height once it climbs; the world scrolls down.
      const Lr = Math.min(A.h * 0.36, 380 * k);
      const groundY = A.y + A.h - 40 * k;
      const rx0 = A.x + A.w * (A.wide ? 0.38 : 0.5);
      const climb = () => Math.min(at().h * 0.004 * k, 1e9); // px per metre at the start
      const rocketY = () => groundY - Math.min(climb(), A.h * 0.38);
      const scroll = () => Math.max(0, climb() - A.h * 0.38);
      const thin = () => clamp(at().h / 60e3, 0, 1);
      const r = rng(L.seed + 5);
      const smoke = Array.from({ length: Math.round(140 * q + 40) }, () => ({ a: (r() - 0.5) * Math.PI, v: 0.4 + r() * 0.9, s: 0.5 + r(), d: r() * 0.6 }));
      const paint = (g: CanvasRenderingContext2D) => {
        const tt = clock(), s = at(), sc = scroll();
        // Sky darkens with altitude.
        const sky = g.createLinearGradient(0, A.y, 0, A.y + A.h);
        const day = 1 - thin();
        sky.addColorStop(0, `rgba(${20 + 40 * day}, ${30 + 110 * day}, ${60 + 160 * day}, 1)`);
        sky.addColorStop(1, `rgba(${40 + 140 * day}, ${60 + 150 * day}, ${90 + 150 * day}, 1)`);
        g.fillStyle = sky;
        g.fillRect(A.x, A.y, A.w, A.h);
        // Stars appear as the sky darkens.
        const rs = rng(9);
        g.fillStyle = `rgba(255,255,255,${thin() * 0.8})`;
        for (let i = 0; i < 120; i++) g.fillRect(A.x + rs() * A.w, A.y + rs() * A.h, 2 * k, 2 * k);
        // Ground, pad and tower scroll away.
        const gy = groundY + sc;
        if (gy < A.y + A.h + 400 * k) {
          g.fillStyle = "#2B3A2E";
          g.fillRect(A.x, gy, A.w, A.h);
          g.fillStyle = "#59606B";
          g.fillRect(rx0 - Lr * 0.35, gy - 8 * k, Lr * 0.7, 10 * k);
          g.strokeStyle = "#B4483A";
          g.lineWidth = 3 * k;
          const tx = rx0 + Lr * 0.18;
          g.strokeRect(tx, gy - Lr * 1.05, Lr * 0.07, Lr * 1.05);
          for (let i = 0; i < 14; i++) {
            g.beginPath();
            g.moveTo(tx, gy - (i * Lr * 1.05) / 14);
            g.lineTo(tx + Lr * 0.07, gy - ((i + 1) * Lr * 1.05) / 14);
            g.stroke();
          }
          // Smoke billowing from the flame trench after ignition.
          const age = tt - T0;
          if (age > 0)
            for (const m of smoke) {
              const life = clamp(age * m.v * 0.5 - m.d, 0, 2);
              if (life <= 0) continue;
              const dist = life * Lr * 0.7;
              const sx = rx0 + Math.sin(m.a) * dist * 1.4, sy = gy - 10 * k - Math.abs(Math.cos(m.a)) * dist * 0.3;
              g.fillStyle = `rgba(225,225,230,${0.22 * (1 - life / 2.2)})`;
              g.beginPath();
              g.arc(sx, sy, (20 + life * 60) * m.s * k, 0, TAU);
              g.fill();
            }
        }
        // Rocket (and the falling first stage after separation).
        const mt = missionT();
        const ry = rocketY();
        const ang = s.ang * 0.55; // drawn turn (screen keeps the rocket in view)
        const burning = tt > T0 && (mt < sepT || mt > sepT + 3);
        if (mt > sepT) {
          const fall = (mt - sepT) / ts;
          const fy = ry + fall * fall * 120 * k, fx = rx0 - fall * 40 * k;
          g.globalAlpha = clamp(1 - fall / 3, 0, 1);
          drawRocket(g, fx, fy, ang + fall * 0.5, Lr, { first: true, fairing: false, upper: false });
          g.globalAlpha = 1;
        }
        const hasFirst = mt < sepT;
        const nozzle: XY = [rx0 + Math.sin(ang) * 0, ry];
        if (burning) drawPlume(g, nozzle[0], hasFirst ? ry : ry - Lr * 0.62, ang, Lr * (hasFirst ? 0.75 : 0.45), Lr * (hasFirst ? 0.14 : 0.08), tt, thin());
        drawRocket(g, rx0, hasFirst ? ry : ry - Lr * 0.62, ang, Lr, { first: hasFirst, fairing: mt < fairT });
        if (mt > fairT) {
          const f = (mt - fairT) / ts;
          for (const sgn of [-1, 1]) {
            g.save();
            g.translate(rx0 + sgn * (20 + f * 60) * k, ry - Lr * 0.95 + f * f * 60 * k);
            g.rotate(sgn * f * 0.8);
            g.fillStyle = `rgba(230,234,240,${clamp(1 - f / 2.5, 0, 1)})`;
            g.fillRect(-Lr * 0.055, -Lr * 0.1, Lr * 0.055 * 1.1, Lr * 0.2);
            g.restore();
          }
        }
      };
      nodes.push(<Draw paint={paint} />);
      tele.push(["T+", () => `${Math.floor(missionT() / 60)}:${String(Math.floor(missionT() % 60)).padStart(2, "0")}`], ["Độ cao", () => `${num(at().h / 1000, 1)} km`], ["Vận tốc", () => `${num(at().v * 3.6, 0)} km/h`], ["Gia tốc", () => `${num(at().a, 1)} g`], ["Tầng", () => (at().stage === 1 ? "1 (9 động cơ)" : "2 (1 động cơ)")]);
      callTo(() => [rx0, groundY + scroll() - 4 * k], () => [rx0 - Lr * 0.9, groundY - Lr * 0.2 + scroll()], "Đánh lửa — lực đẩy 7,6 MN");
      callTo(() => [rx0, rocketY() - Lr * 0.62], () => [rx0 - Lr * 0.85, rocketY() - Lr * 0.8], "Tách tầng 1 (T+2:42)");
      callTo(() => [rx0, rocketY() - Lr * 0.62 - Lr * 0.85], () => [rx0 + Lr * 0.6, rocketY() - Lr * 1.1], "Bỏ chóp bảo vệ — đã ra khỏi khí quyển dày");
      // The callouts follow the mission timeline (separation and fairing at their mission times).
      steps.push(function* () {
        yield* until(T0);
        yield* shows[0](1, 0.4);
      });
      const sepAt = T0 + 1 + sepT / ts, fairAt = T0 + 1 + fairT / ts;
      shows[1] && steps.push(function* () {
        yield* until(Math.min(D - 1, sepAt));
        yield* shows[0](0, 0.3);
        yield* shows[1](1, 0.4);
      });
      shows[2] && steps.push(function* () {
        yield* until(Math.min(D - 0.6, fairAt));
        yield* shows[1](0, 0.3);
        yield* shows[2](1, 0.4);
      });
    } else if (p.mission === "hohmann" || p.mission === "satellites") {
      // ---- Earth with orbits (radii in Earth radii, compressed by a square root for display).
      const RE = 6371;
      const earthR = Math.min(A.w, A.h) * (p.mission === "hohmann" ? 0.1 : 0.085);
      const cx = A.x + A.w * (A.wide ? 0.42 : 0.5), cy = A.cy;
      const disp = (rkm: number) => earthR * (1 + Math.sqrt(rkm / RE - 1) * (p.mission === "hohmann" ? 0.95 : 0.9));
      const E = BODIES.earth.bake(Math.round(320 * (0.6 + 0.4 * q)), L.seed);
      nodes.push(<Sphere x={cx} y={cy} radius={earthR} res={Math.round(Math.min(300, earthR * 2))} surface={E.surface} clouds={E.clouds} rot={() => clock() * 0.25} tilt={0.4} light={() => [-0.7, -0.2, 0.6]} atmosphere={{ color: [0.44, 0.71, 1], strength: 0.7 }} />);
      const mu = 398600; // km³/s²
      if (p.mission === "hohmann") {
        const r1 = RE + 300, r2 = 42164;
        const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
        const a = (r1 + r2) / 2;
        const vp = Math.sqrt(mu * (2 / r1 - 1 / a)), va = Math.sqrt(mu * (2 / r2 - 1 / a));
        const dv1 = vp - v1, dv2 = v2 - va;
        const tTrans = (Math.PI * Math.sqrt(a ** 3 / mu)) / 3600; // hours
        // Phases (video time): parking orbit, burn 1, transfer half-ellipse, burn 2, GEO.
        const tB1 = ctx.cue(0, 4), tB2 = ctx.cue(2, 4);
        const pos = (): XY => {
          const t = clock();
          if (t < tB1) {
            const th = Math.PI / 2 - (tB1 - t) * 2.4; // arrive at the bottom (periapsis) at the burn
            const rr = disp(r1);
            return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr];
          }
          if (t < tB2) {
            // Transfer: true anomaly 0 → π with the Kepler time law (eccentric anomaly by Newton).
            const e = (r2 - r1) / (r2 + r1);
            const M = (Math.PI * (t - tB1)) / (tB2 - tB1);
            let Ee = M;
            for (let i = 0; i < 8; i++) Ee -= (Ee - e * Math.sin(Ee) - M) / (1 - e * Math.cos(Ee));
            const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(Ee / 2), Math.sqrt(1 - e) * Math.cos(Ee / 2));
            const rk = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
            const th = Math.PI / 2 + nu;
            return [cx + Math.cos(th) * disp(rk), cy + Math.sin(th) * disp(rk)];
          }
          const th = -Math.PI / 2 + (t - tB2) * 0.5;
          return [cx + Math.cos(th) * disp(r2), cy + Math.sin(th) * disp(r2)];
        };
        const orbitPts = (fn: (th: number) => number, a0 = 0, a1 = TAU): XY[] => Array.from({ length: 121 }, (_, i) => {
          const th = a0 + ((a1 - a0) * i) / 120;
          return [cx + Math.cos(th) * fn(th), cy + Math.sin(th) * fn(th)];
        });
        const e = (r2 - r1) / (r2 + r1);
        const trans = orbitPts((th) => disp((a * (1 - e * e)) / (1 + e * Math.cos(th - Math.PI / 2))), Math.PI / 2, Math.PI * 1.5);
        nodes.push(
          <Node>
            <Line points={orbitPts(() => disp(r1))} stroke={alpha(L.secondary, 0.7)} lineWidth={L.lw(3 * k)} closed />
            <Line points={orbitPts(() => disp(r2))} stroke={alpha(L.primary, 0.75)} lineWidth={L.lw(3 * k)} closed lineDash={[10 * k, 8 * k]} />
            <Line points={trans} stroke={L.accent} lineWidth={L.lw(3.5 * k)} end={() => clamp((clock() - tB1) / (tB2 - tB1), 0, 1)} {...L.glow(L.accent, 10 * k)} />
            <Draw
              paint={(g) => {
                const [x, y] = pos();
                g.fillStyle = "#FFFFFF";
                g.shadowColor = L.secondary;
                g.shadowBlur = 16 * k;
                g.beginPath();
                g.arc(x, y, 8 * k, 0, TAU);
                g.fill();
                // Burn flames at the two manoeuvres.
                for (const tb of [tB1, tB2]) {
                  const d = clock() - tb;
                  if (d > 0 && d < 0.8) {
                    g.fillStyle = `rgba(255,170,60,${1 - d / 0.8})`;
                    g.beginPath();
                    g.arc(x, y, (14 + d * 40) * k, 0, TAU);
                    g.fill();
                  }
                }
              }}
            />
          </Node>,
        );
        const tx = A.x + A.w * (A.wide ? 0.7 : 0.08), ty = A.wide ? A.y + 40 * k : A.y + A.h - 230 * k;
        const lines: [string, string][] = [
          ["Quỹ đạo thấp LEO (300 km)", `${num(v1, 2)} km/s`],
          ["Đốt lần 1 ở cận điểm", `Δv = ${num(dv1, 2)} km/s`],
          ["Bay trên elip chuyển tiếp", `${num(tTrans, 1)} giờ`],
          ["Đốt lần 2 ở viễn điểm", `Δv = ${num(dv2, 2)} km/s`],
          ["Quỹ đạo địa tĩnh GEO (35 786 km)", `${num(v2, 2)} km/s`],
        ];
        lines.forEach(([a1, b1], i) => {
          const s = createSignal(0);
          shows.push(s);
          nodes.push(
            <Node opacity={s} y={ty + i * 62 * k}>
              <Txt text={a1} x={tx} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={L.dim} />
              <Txt text={b1} x={tx} y={28 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={27 * k} fill={i % 2 ? L.accent : L.text} />
            </Node>,
          );
        });
        steps.push(() => shows[0](1, 0.4), () => shows[1](1, 0.4), () => shows[2](1, 0.4), () => shows[3](1, 0.4), () => shows[4](1, 0.4));
      } else {
        // Satellites: real altitudes; angular speed from Kepler's 3rd law (ω ∝ r^−3/2), time compressed.
        const sats = [
          { name: "Trạm ISS — 420 km, 92 phút", r: RE + 420, inc: 0.9, c: L.secondary },
          { name: "Quỹ đạo cực (ảnh vệ tinh) — 800 km", r: RE + 800, inc: Math.PI / 2, c: "#7CFF6B" },
          { name: "GPS — 20 200 km, 12 giờ", r: RE + 20200, inc: 0.95, c: L.accent },
          { name: "Địa tĩnh — 35 786 km, 24 giờ", r: 42164, inc: 0, c: L.primary },
        ];
        const T = (r: number) => (TAU * Math.sqrt(r ** 3 / mu)) / 3600; // hours
        const hoursPerSec = 1.6 * p.timeScale * st.speed / 20;
        sats.forEach((s, i) => {
          const rr = disp(s.r);
          const ry = Math.cos(s.inc) * 0.35 + (s.inc === Math.PI / 2 ? 0 : 0.0);
          const shape = (th: number): XY => (s.inc === Math.PI / 2 ? [cx + Math.sin(th) * rr * 0.18, cy - Math.cos(th) * rr] : [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * Math.max(0.18, ry)]);
          const th = () => i * 1.3 + (clock() * hoursPerSec * TAU) / T(s.r);
          const z = () => (s.inc === Math.PI / 2 ? Math.cos(th()) : Math.sin(th()));
          const pts = Array.from({ length: 121 }, (_, j) => shape((j / 120) * TAU));
          nodes.push(
            <Node>
              <Line points={pts} stroke={alpha(s.c, 0.5)} lineWidth={L.lw(2 * k)} closed />
              <Node position={() => shape(th())} zIndex={() => (z() > 0 ? 2 : -2)}>
                <Rect width={18 * k} height={8 * k} fill={s.c} {...L.glow(s.c, 10 * k)} />
                <Rect width={8 * k} height={8 * k} fill="#FFFFFF" />
              </Node>
            </Node>,
          );
          const s2 = createSignal(0);
          shows.push(s2);
          const lx = A.wide ? A.x + A.w * 0.72 : A.x + A.w * 0.06, ly = A.wide ? A.y + 60 * k + i * 70 * k : A.y + A.h - 300 * k + i * 70 * k;
          nodes.push(
            <Node opacity={s2}>
              <Rect x={lx} y={ly} width={22 * k} height={10 * k} fill={s.c} />
              <Txt text={s.name} x={lx + 22 * k} y={ly} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
              <Txt text={`v = ${num(Math.sqrt(mu / s.r), 1)} km/s`} x={lx + 22 * k} y={ly + 28 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={21 * k} fill={L.dim} />
            </Node>,
          );
          steps.push(() => s2(1, 0.4));
        });
      }
    } else if (p.mission === "gravity_assist") {
      // ---- planet moving left → right; the probe's hyperbola in the planet's frame, shifted with it.
      const cx0 = A.x + A.w * 0.3, cy = A.cy + A.h * 0.08;
      const pr = Math.min(A.w, A.h) * 0.09;
      const vP = (A.w * 0.4) / D; // planet speed on screen
      const J = BODIES.jupiter.bake(Math.round(320 * (0.6 + 0.4 * q)), L.seed);
      const planetX = () => cx0 + vP * clock();
      // Hyperbolic flyby: eccentricity e, turn angle δ = 2 asin(1/e).
      const e = 1.6, delta = 2 * Math.asin(1 / e);
      const tc = D * 0.45;
      const rel = (t: number): XY => {
        // Parameterise by hyperbolic anomaly F ~ time (sinh law, approximately uniform in t for display).
        const F = (t - tc) * 0.9;
        const a = pr * 1.4;
        const x = a * (e - Math.cosh(F)), y = a * Math.sqrt(e * e - 1) * Math.sinh(F);
        // Rotate so the approach comes from the lower left and passes behind (leading side) the planet.
        const rot = -Math.PI / 2 - delta / 2 + 0.25;
        return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
      };
      const probe = (): XY => {
        const r = rel(clock());
        return [planetX() + r[0], cy + r[1]];
      };
      const path = (): XY[] => Array.from({ length: 80 }, (_, i) => {
        const t = (clock() * i) / 79;
        const r = rel(t);
        return [cx0 + vP * t + r[0], cy + r[1]];
      });
      nodes.push(
        <Node>
          <Line points={[[A.x, cy], [A.x + A.w, cy]]} stroke={alpha(L.ink, 0.12)} lineWidth={2 * k} lineDash={[8 * k, 10 * k]} />
          <Sphere x={planetX} y={cy} radius={pr} res={Math.round(Math.min(260, pr * 2))} surface={J.surface} rot={() => clock() * 0.6} tilt={0.05} light={() => [-0.5, -0.2, 0.8]} />
          <Line points={path} stroke={L.secondary} lineWidth={L.lw(3 * k)} {...L.glow(L.secondary, 10 * k)} />
          <Rect position={probe} size={14 * k} fill="#FFFFFF" rotation={45} {...L.glow("#FFFFFF", 14 * k)} />
        </Node>,
      );
      // Vector diagram: v_in + V_planet and v_out + V_planet (same |v| in the planet frame).
      const vd = createSignal(0);
      shows.push(vd);
      const ox = A.x + A.w * 0.72, oy = A.y + A.h * 0.25, sc = Math.min(A.w, A.h) * 0.14;
      const vin: XY = [Math.cos(-0.9) * 1, Math.sin(-0.9) * -1];
      const vout: XY = [Math.cos(-0.9 + delta) * 1, -Math.sin(-0.9 + delta)];
      const Vp: XY = [0.9, 0];
      const arrowL = (from: XY, d: XY, color: string, t: string) => (
        <Node>
          <Line points={[from, [from[0] + d[0] * sc, from[1] + d[1] * sc]]} stroke={color} lineWidth={L.lw(5 * k)} endArrow arrowSize={16 * k} />
          <Txt text={t} x={from[0] + d[0] * sc * 0.55} y={from[1] + d[1] * sc * 0.55 - 18 * k} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={color} />
        </Node>
      );
      nodes.push(
        <Node opacity={vd}>
          <Txt text="Trong hệ Mặt Trời:" x={ox - sc * 0.2} y={oy - sc * 0.55} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={24 * k} fill={L.text} />
          {arrowL([ox, oy + sc * 0.5], Vp, L.accent, "V hành tinh")}
          {arrowL([ox + Vp[0] * sc, oy + sc * 0.5], vin, L.dim, "v vào")}
          {arrowL([ox, oy + sc * 1.6], Vp, L.accent, "V hành tinh")}
          {arrowL([ox + Vp[0] * sc, oy + sc * 1.6], vout, L.secondary, "v ra")}
          <Txt text="|v| như nhau trong hệ hành tinh — hướng quay đi δ" x={ox - sc * 0.2} y={oy + sc * 2.4} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={20 * k} fill={L.dim} />
          <Txt text={`δ = 2·arcsin(1/e) = ${num((delta * 180) / Math.PI, 0)}° → tàu nhanh hơn sau khi bay qua`} x={ox - sc * 0.2} y={oy + sc * 2.7} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={21 * k} fill={L.accent} />
        </Node>,
      );
      callTo(probe, () => [probe()[0] - 80 * k, probe()[1] + 110 * k], "Tàu thăm dò");
      callTo(() => [planetX(), cy - pr], () => [planetX() + 40 * k, cy - pr - 90 * k], "Hành tinh đang chuyển động");
      steps.push(() => shows[1](1, 0.4), () => shows[2](1, 0.4), () => vd(1, 0.6));
    } else {
      // ---- Mars EDL: entry (plasma), parachute, heat-shield drop, powered descent, sky crane.
      const cx = A.x + A.w * 0.5, top = A.y + A.h * 0.12, groundY = A.y + A.h - 30 * k;
      const S = Math.min(A.w, A.h) / 900;
      const phases = [0, 0.3, 0.55, 0.75, 1].map((u) => u * (D - 1.5) + 0.8);
      const ph = () => {
        const t = clock();
        let i = 0;
        while (i < phases.length - 1 && t > phases[i + 1]) i++;
        return { i, u: clamp((t - phases[i]) / (phases[i + 1] - phases[i]), 0, 1) };
      };
      const Lbl = ["Vào khí quyển — tấm chắn nhiệt ~1 300 °C", "Bung dù siêu thanh", "Thả tấm chắn nhiệt, radar dò mặt đất", "Động cơ hãm, cần cẩu bay hạ xe tự hành"];
      const telem = [["20 000 km/h", "125 km"], ["1 500 km/h", "11 km"], ["300 km/h", "8 km"], ["2,7 km/h", "20 m"]];
      const r = rng(4);
      const paint = (g: CanvasRenderingContext2D) => {
        const { i, u } = ph(), t = clock();
        // Sky: dusty pink; ground rises at the end.
        const sky = g.createLinearGradient(0, A.y, 0, A.y + A.h);
        sky.addColorStop(0, "#2A1A22");
        sky.addColorStop(1, "#C98A6A");
        g.fillStyle = sky;
        g.fillRect(A.x, A.y, A.w, A.h);
        const gy = groundY + (1 - smooth(clamp((t - phases[2]) / (phases[4] - phases[2]), 0, 1))) * A.h * 0.6;
        g.fillStyle = "#8C4A2E";
        g.beginPath();
        g.moveTo(A.x, gy);
        for (let x = 0; x <= 40; x++) g.lineTo(A.x + (x / 40) * A.w, gy - Math.sin(x * 1.3) * 10 * k - Math.sin(x * 0.4) * 22 * k);
        g.lineTo(A.x + A.w, A.y + A.h);
        g.lineTo(A.x, A.y + A.h);
        g.fill();
        const y = top + (i === 0 ? u * A.h * 0.22 : A.h * 0.22 + (i >= 3 ? (gy - top - A.h * 0.42) * u : 0));
        g.save();
        g.translate(cx, y);
        g.scale(S, S);
        if (i === 0) {
          // Entry: aeroshell pointing down, plasma sheath glowing.
          g.globalCompositeOperation = "lighter";
          for (let j = 0; j < 40 * q + 10; j++) {
            const a = (r() - 0.5) * 2.4, d = 60 + r() * 220 * (0.5 + u);
            g.fillStyle = `rgba(255, ${140 + r() * 100}, 60, ${0.25 * (1 - u * 0.6)})`;
            g.beginPath();
            g.arc(Math.sin(a) * d * 0.4, -Math.cos(a) * d, 10 + r() * 16, 0, TAU);
            g.fill();
          }
          g.globalCompositeOperation = "source-over";
        }
        if (i <= 2) {
          // Aeroshell: back shell (cone) + heat shield (dropped in phase 2).
          g.fillStyle = "#E8E2D6";
          g.beginPath();
          g.moveTo(-70, 10);
          g.lineTo(-30, -60);
          g.lineTo(30, -60);
          g.lineTo(70, 10);
          g.fill();
          const drop = i === 2 ? u * 260 : 0;
          g.fillStyle = i === 0 ? `rgb(255, ${120 + 80 * (1 - u)}, 80)` : "#5A3A2A";
          g.beginPath();
          g.ellipse(0, 18 + drop, 74, 16, 0, 0, TAU);
          g.fill();
        }
        if (i === 1 || i === 2) {
          // Parachute: canopy with gores and suspension lines.
          const open = i === 1 ? smooth(clamp(u * 3, 0, 1)) : 1;
          const cw = 210 * open, chy = -330;
          g.strokeStyle = "rgba(240,240,240,0.7)";
          g.lineWidth = 2;
          for (let s = -4; s <= 4; s++) {
            g.beginPath();
            g.moveTo((s / 4) * cw, chy + 20);
            g.lineTo(0, -60);
            g.stroke();
          }
          for (let s = 0; s < 8; s++) {
            g.fillStyle = s % 2 ? "#F2F2F2" : "#D9502F";
            g.beginPath();
            g.moveTo(0, chy - 90 * open);
            g.lineTo(-cw + (s * 2 * cw) / 8, chy + 20);
            g.lineTo(-cw + ((s + 1) * 2 * cw) / 8, chy + 20);
            g.closePath();
            g.fill();
          }
        }
        if (i >= 2) {
          // Descent stage and rover (lowered on bridles in phase 3).
          const low = i === 3 ? smooth(u) * 110 : 0;
          g.fillStyle = "#B8BEC8";
          g.fillRect(-60, -10, 120, 30);
          if (i === 3) {
            g.globalCompositeOperation = "lighter";
            for (const sx of [-55, 55]) {
              const gr = g.createLinearGradient(0, 20, 0, 90);
              gr.addColorStop(0, "rgba(255,230,180,0.9)");
              gr.addColorStop(1, "rgba(255,120,40,0)");
              g.fillStyle = gr;
              g.beginPath();
              g.moveTo(sx - 8, 20);
              g.lineTo(sx + 8, 20);
              g.lineTo(sx + 2 + Math.sin(t * 50) * 3, 90);
              g.lineTo(sx - 2, 90);
              g.fill();
            }
            g.globalCompositeOperation = "source-over";
            g.strokeStyle = "#DDDDDD";
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(-20, 20);
            g.lineTo(-30, 40 + low);
            g.moveTo(20, 20);
            g.lineTo(30, 40 + low);
            g.stroke();
          }
          // Rover: body, mast, six wheels.
          g.fillStyle = "#F0EDE6";
          g.fillRect(-45, 40 + low, 90, 26);
          g.fillRect(25, 12 + low, 6, 28);
          g.fillRect(18, 6 + low, 22, 9);
          g.fillStyle = "#2C2C2C";
          for (const wx of [-36, 0, 36]) {
            g.beginPath();
            g.arc(wx, 74 + low, 11, 0, TAU);
            g.fill();
          }
        }
        g.restore();
      };
      nodes.push(<Draw paint={paint} />);
      tele.push(["Giai đoạn", () => `${ph().i + 1}/4`], ["Vận tốc", () => telem[Math.min(3, ph().i)][0]], ["Độ cao", () => telem[Math.min(3, ph().i)][1]]);
      Lbl.forEach((text, i) => {
        const s = createSignal(0);
        shows.push(s);
        nodes.push(<Node opacity={s}>{label(ctx, text, { x: A.x + 20 * k, y: A.y + A.h - 60 * k - i * 0, size: 30, align: "left", fill: L.text })}</Node>);
        steps.push(function* () {
          yield* until(phases[i] + 0.1);
          if (i) yield shows[i - 1](0, 0.3);
          yield* s(1, 0.4);
        });
      });
    }

    // ---- telemetry panel (launch / landing).
    const telRef = createRef<Node>();
    const telNode =
      p.telemetry && tele.length ? (
        <Node ref={telRef} opacity={0}>
          <Rect x={A.x + A.w - 170 * k} y={A.y + 40 * k + (tele.length * 46 * k) / 2} width={320 * k} height={tele.length * 46 * k + 30 * k} radius={14 * k} fill="rgba(5,8,22,0.72)" stroke={alpha(L.secondary, 0.6)} lineWidth={2 * k} />
          {tele.map(([a, b], i) => (
            <Node y={A.y + 62 * k + i * 46 * k}>
              <Txt text={a} x={A.x + A.w - 312 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={22 * k} fill={L.dim} />
              <Txt text={b} x={A.x + A.w - 28 * k} offsetX={1} fontFamily="JetBrains Mono, monospace" fontWeight={700} fontSize={24 * k} fill={L.secondary} />
            </Node>
          ))}
        </Node>
      ) : null;

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        {(p.mission === "hohmann" || p.mission === "satellites" || p.mission === "gravity_assist") && L.backdrop !== "none" ? starfield(ctx, L, { count: Math.round(140 * q), seed: L.seed, clock, drift: 2 }) : null}
        <Node ref={world} opacity={0}>
          {nodes}
        </Node>
        {telNode}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    if (telNode) yield telRef().opacity(1, 0.5);
    if (!p.labels) return;
    if (p.mission === "launch" || p.mission === "landing") {
      // Timeline-bound steps wait for their own mission moments.
      for (const s of steps) yield s();
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
