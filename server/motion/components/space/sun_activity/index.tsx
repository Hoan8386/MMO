// The Sun: a self-luminous globe with granulation (convection cells), sunspots in the activity belts,
// faculae, limb darkening and differential rotation; around it the corona's streamers, prominences
// (plasma loops along magnetic field lines, with plasma draining along them), and — by mode — a
// flare with its post-flare loop arcade, a coronal mass ejection (bright front, dark cavity, core)
// expanding outward, the solar wind on a Parker spiral, or a cut-away of the interior (core,
// radiative zone with a photon's random walk, convective zone with turning cells).
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { Sphere, type SurfaceMaps } from "../../../shared/sphere";
import { makeNoise, smoothstep, mixRGB, rgb1 } from "../../../shared/noise";
import { FONT, label, fitX } from "../../../shared/ui";
import { starfield } from "../../../shared/fx";
import { until, clamp, rng } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "active" | "quiet" | "flare" | "cme" | "wind" | "structure";
  spots: number;
  prominences: boolean;
  corona: boolean;
  labels: boolean;
  facts: boolean;
  stars: boolean;
}

const rad = Math.PI / 180;
type V3 = [number, number, number];

// Photosphere: granulation (3D Worley cells: bright cell centres, dark lanes), sunspots with umbra
// and penumbra, faculae around them, and the rotation rate per latitude.
function bakeSun(tw: number, seed: number, spots: [number, number, number][]): SurfaceMaps {
  const w = tw, h = tw / 2, N = makeNoise(seed);
  const color = new Float32Array(w * h * 3), rowSpeed = new Float32Array(h);
  for (let r = 0; r < h; r++) {
    const s = Math.sin((90 - ((r + 0.5) * 180) / h) * rad);
    // Carrington-type law: 14.71 − 2.39 sin²φ − 1.78 sin⁴φ degrees per day.
    rowSpeed[r] = (14.71 - 2.39 * s * s - 1.78 * s ** 4) / 14.71;
  }
  const hash = (i: number, j: number, k: number) => {
    let x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed) * 43758.5453;
    const a = x - Math.floor(x);
    x = Math.sin(i * 269.5 + j * 183.3 + k * 246.1 + seed) * 43758.5453;
    const b = x - Math.floor(x);
    x = Math.sin(i * 113.5 + j * 271.9 + k * 124.6 + seed) * 43758.5453;
    return [a, b, x - Math.floor(x)];
  };
  const S = 42; // cells across the unit sphere's diameter
  const sv = spots.map(([la, lo, r]) => [[Math.cos(la * rad) * Math.sin(lo * rad), Math.sin(la * rad), Math.cos(la * rad) * Math.cos(lo * rad)], r] as [V3, number]);
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) * 180) / h, la = lat * rad;
    for (let c = 0; c < w; c++) {
      const lo = (-180 + ((c + 0.5) * 360) / w) * rad;
      const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      const px = x * S, py = y * S, pz = z * S;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      let f1 = 9, f2 = 9;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (let d = -1; d <= 1; d++) {
            const o = hash(ix + a, iy + b, iz + d);
            const dd = (ix + a + o[0] - px) ** 2 + (iy + b + o[1] - py) ** 2 + (iz + d + o[2] - pz) ** 2;
            if (dd < f1) (f2 = f1), (f1 = dd);
            else if (dd < f2) f2 = dd;
          }
      const lane = smoothstep(0.0, 0.35, Math.sqrt(f2) - Math.sqrt(f1));
      const big = N.fbm(x * 6, y * 6, z * 6, 3);
      let col = mixRGB(rgb1("#D9661A"), rgb1("#FFE7A6"), lane * 0.75 + big * 0.25);
      // Sunspots and faculae.
      for (const [v, sr] of sv) {
        const d = Math.acos(Math.max(-1, Math.min(1, x * v[0] + y * v[1] + z * v[2]))) / rad / sr;
        if (d < 3) {
          const fac = Math.exp(-(((d - 1.9) / 0.6) ** 2)) * 0.35 * N.fbm(x * 30, y * 30, z * 30, 2);
          col = mixRGB(col, [1, 0.97, 0.85], fac);
          const ang = Math.atan2(y - v[1], x - v[0]);
          const fib = 0.75 + 0.25 * Math.sin(ang * 60 + N.n3(x * 50, y * 50, z * 50) * 4);
          col = mixRGB(col, mixRGB(rgb1("#5A2608"), rgb1("#A0521A"), fib), 1 - smoothstep(0.9, 1.15, d));
          col = mixRGB(col, rgb1("#2A0E04"), 1 - smoothstep(0.38, 0.5, d));
        }
      }
      color.set(col, (r * w + c) * 3);
    }
  }
  return { w, h, color, rowSpeed };
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "stars_galaxies");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const R0 = rng(L.seed + 17);

    // Layout: the Sun on the left when something leaves it to the right (CME, wind), else centred.
    const outflow = p.mode === "cme" || p.mode === "wind";
    const PW = p.facts && A.wide ? Math.min(500 * k, A.w * 0.3) : 0;
    const gw = A.w - PW;
    const R = Math.min(outflow && A.wide ? gw * 0.2 : gw * 0.3, A.h * (A.tall ? 0.22 : 0.33), 360 * k);
    const cx = outflow && A.wide ? A.x + R * 1.55 : A.x + gw / 2, cy = outflow && A.tall ? A.y + R * 1.6 : A.cy;

    // Sunspots in the activity belts (±8–30°), on the visible face.
    const nSpots = p.mode === "structure" || p.mode === "quiet" ? 0 : p.spots;
    const spots: [number, number, number][] = [];
    for (let i = 0; i < nSpots; i++) spots.push([(R0() < 0.5 ? -1 : 1) * (8 + R0() * 20), -55 + R0() * 100, 1.2 + R0() * 2.3]);
    const tw = q < 0.6 ? 384 : q < 0.9 ? 448 : 512;
    const surf = bakeSun(tw, L.seed, spots);
    const omega = (0.25 * st.speed * Math.PI * 2) / 10;
    const rot = () => omega * clock() - 0.2;
    const sun = createRef<Sphere>();

    // ---- corona: streamers whose lengths breathe slowly.
    const N = makeNoise(L.seed + 5);
    const corona = (g: CanvasRenderingContext2D) => {
      const t = clock();
      g.globalCompositeOperation = "lighter";
      const glow = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 2.1);
      glow.addColorStop(0, `rgba(255, 210, 140, ${0.55 * Math.max(0.4, L.visual.glow)})`);
      glow.addColorStop(0.35, "rgba(255, 160, 80, 0.14)");
      glow.addColorStop(1, "rgba(255, 120, 60, 0)");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(cx, cy, R * 2.1, 0, Math.PI * 2);
      g.fill();
      if (!p.corona) return;
      const n = Math.round(48 * q + 12);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + N.n3(i, 0.3, 1) * 0.2;
        // Streamers are longer near the equator (helmet streamers), short at the poles.
        const eq = 0.45 + 0.55 * Math.abs(Math.cos(a));
        const len = R * (0.5 + 1.3 * eq * N.n3(Math.cos(a) * 2, Math.sin(a) * 2, t * 0.12 + i * 0.01));
        const wdt = (0.05 + 0.06 * N.n3(i, 4, 2)) * R;
        const x0 = cx + Math.cos(a) * R * 0.95, y0 = cy + Math.sin(a) * R * 0.95;
        const x1 = cx + Math.cos(a) * (R + len), y1 = cy + Math.sin(a) * (R + len);
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, "rgba(255, 236, 200, 0.22)");
        gr.addColorStop(1, "rgba(255, 200, 150, 0)");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x0 - Math.sin(a) * wdt, y0 + Math.cos(a) * wdt);
        g.quadraticCurveTo(cx + Math.cos(a) * (R + len * 0.4), cy + Math.sin(a) * (R + len * 0.4), x1, y1);
        g.quadraticCurveTo(cx + Math.cos(a) * (R + len * 0.4), cy + Math.sin(a) * (R + len * 0.4), x0 + Math.sin(a) * wdt, y0 - Math.cos(a) * wdt);
        g.closePath();
        g.fill();
      }
    };
    // Limb: redder and darker toward the edge (seen through more, cooler gas).
    const limb = (g: CanvasRenderingContext2D) => {
      const gr = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
      gr.addColorStop(0, "rgba(255, 90, 20, 0)");
      gr.addColorStop(0.8, "rgba(230, 70, 10, 0.18)");
      gr.addColorStop(1, "rgba(180, 40, 0, 0.55)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
    };

    // ---- prominences: loops standing on the limb, several strands, plasma draining down them.
    const proms = [200, 325, 48].map((deg, i) => {
      const a = deg * rad, span = (9 + i * 3) * rad, hgt = R * (0.22 + 0.08 * i);
      return { a, span, hgt, rise: createSignal(p.prominences && p.mode !== "structure" ? 1 : 0) };
    });
    const loopPt = (pr: (typeof proms)[0], u: number, strand: number, scale: number): [number, number] => {
      const a = pr.a + (u - 0.5) * pr.span * (1 + strand * 0.08);
      const hh = Math.sin(u * Math.PI) * pr.hgt * scale * (1 + strand * 0.06);
      const r = R * 0.985 + hh;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const prominence = (g: CanvasRenderingContext2D) => {
      const t = clock();
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      for (const pr of proms) {
        const s = pr.rise();
        if (s <= 0) continue;
        for (let strand = -2; strand <= 2; strand++) {
          g.strokeStyle = `rgba(255, ${90 + strand * 12}, 60, ${0.16 * s})`;
          g.lineWidth = (10 - Math.abs(strand) * 2) * k;
          g.shadowColor = "rgba(255, 80, 40, 0.9)";
          g.shadowBlur = 18 * k * L.visual.glow;
          g.beginPath();
          for (let i = 0; i <= 40; i++) {
            const [x, y] = loopPt(pr, i / 40, strand, s * (1 + 0.03 * Math.sin(t * 1.3 + strand)));
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
        g.shadowBlur = 0;
        // Blobs of plasma sliding down both legs.
        for (let j = 0; j < 10; j++) {
          const u0 = ((t * 0.18 + j / 10) % 1) * 0.5;
          for (const u of [0.5 - u0, 0.5 + u0]) {
            const [x, y] = loopPt(pr, u, (j % 5) - 2, s);
            g.fillStyle = `rgba(255, 190, 150, ${0.55 * s})`;
            g.beginPath();
            g.arc(x, y, 3.2 * k, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    };

    // ---- flare: a sudden brightening over an active region, then an arcade of hot loops.
    const flareT = createSignal(-1); // seconds since the flare started (−1 = not yet)
    const flareAt: [number, number] = [cx + R * 0.52, cy - R * 0.28];
    const flare = (g: CanvasRenderingContext2D) => {
      const t = flareT();
      if (t < 0) return;
      // Impulsive rise (~0.4 s), slow decay.
      const I = t < 0.4 ? t / 0.4 : Math.exp(-(t - 0.4) / 1.8);
      g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(flareAt[0], flareAt[1], 0, flareAt[0], flareAt[1], R * (0.25 + 0.5 * I));
      gr.addColorStop(0, `rgba(255, 255, 255, ${0.95 * I})`);
      gr.addColorStop(0.3, `rgba(255, 240, 200, ${0.6 * I})`);
      gr.addColorStop(1, "rgba(255, 200, 120, 0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(flareAt[0], flareAt[1], R * 0.8, 0, Math.PI * 2);
      g.fill();
      // Post-flare loops rising in an arcade.
      const arc = clamp((t - 0.6) / 2.5, 0, 1);
      for (let i = 0; i < 7; i++) {
        const off = (i - 3) * 0.045 * R, hh = R * 0.1 * arc * (0.8 + 0.2 * Math.sin(i));
        g.strokeStyle = `rgba(255, 245, 210, ${0.5 * arc})`;
        g.lineWidth = 3 * k;
        g.beginPath();
        g.ellipse(flareAt[0] + off, flareAt[1], R * 0.05, hh + 1, -0.5, Math.PI, Math.PI * 2);
        g.stroke();
      }
    };
    // Particles thrown out by the flare.
    const flareBurst = (g: CanvasRenderingContext2D) => {
      const t = flareT();
      if (t < 0 || t > 4) return;
      const r = rng(3);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 160 * q; i++) {
        const a = -0.9 + (r() - 0.5) * 1.8, v = (0.3 + r()) * R * 0.5;
        const d = v * (1 - Math.exp(-2 * t));
        g.fillStyle = `rgba(255, 230, 180, ${Math.max(0, 1 - t / 3.5) * 0.8})`;
        g.beginPath();
        g.arc(flareAt[0] + Math.cos(a) * d, flareAt[1] + Math.sin(a) * d, 2.2 * k, 0, Math.PI * 2);
        g.fill();
      }
    };

    // ---- CME: a three-part structure expanding outward (to the right, or upward in tall frames).
    const cmeT = createSignal(-1);
    const cmeDir = outflow && A.tall ? -Math.PI / 2 : 0;
    const cmePts = Array.from({ length: Math.round(1600 * q + 300) }, () => {
      const part = R0();
      return { part, a: (R0() - 0.5) * Math.PI * 0.95, j: R0(), s: 0.6 + R0() * 1.2 };
    });
    const cme = (g: CanvasRenderingContext2D) => {
      const t = cmeT();
      if (t < 0) return;
      g.globalCompositeOperation = "lighter";
      // Front distance grows fast then coasts; the bubble widens with distance.
      const dist = R * (0.15 + 2.4 * (1 - Math.exp(-t / 2.2)) + t * 0.12);
      const bub = R * 0.25 + dist * 0.55;
      const fade = clamp(1.4 - dist / (R * 4), 0.1, 1);
      const ca = Math.cos(cmeDir), sa = Math.sin(cmeDir);
      const base: [number, number] = [cx + ca * R, cy + sa * R];
      for (const pt of cmePts) {
        let x: number, y: number, al: number;
        if (pt.part < 0.55) {
          // Bright leading shell.
          const rr = bub * (0.92 + pt.j * 0.12);
          x = Math.cos(pt.a) * rr;
          y = Math.sin(pt.a) * rr * 1.05;
          x += dist - bub;
          al = 0.55;
        } else if (pt.part < 0.82) {
          // Legs tied to the Sun.
          const u = pt.j;
          x = (dist - bub) * u + Math.cos(pt.a) * R * 0.05;
          y = (pt.a > 0 ? 1 : -1) * (R * 0.18 + (bub * 0.7 - R * 0.18) * u);
          al = 0.25;
        } else {
          // Bright core (the erupted filament).
          const rr = bub * 0.22 * pt.j;
          x = dist - bub * 1.05 + Math.cos(pt.a * 4) * rr;
          y = Math.sin(pt.a * 4) * rr;
          al = 0.7;
        }
        g.fillStyle = `rgba(255, ${pt.part > 0.82 ? 150 : 225}, ${pt.part > 0.82 ? 120 : 190}, ${al * fade})`;
        g.beginPath();
        g.arc(base[0] + x * ca - y * sa, base[1] + x * sa + y * ca, pt.s * 1.8 * k, 0, Math.PI * 2);
        g.fill();
      }
    };

    // ---- solar wind on a Parker spiral (the Sun turns while the plasma flies out radially).
    const windPts = Array.from({ length: Math.round(900 * q + 200) }, () => ({ a: R0() * Math.PI * 2, ph: R0(), v: 0.8 + R0() * 0.4, fast: R0() < 0.3 }));
    const wind = (g: CanvasRenderingContext2D) => {
      if (p.mode !== "wind") return;
      const t = clock();
      g.globalCompositeOperation = "lighter";
      const maxR = Math.hypot(A.w, A.h);
      for (const w of windPts) {
        const u = (t * 0.09 * w.v * (w.fast ? 1.6 : 1) * st.speed + w.ph) % 1;
        const r = R * 1.05 + u * maxR;
        const a = w.a + (r / R) * 0.04;
        g.fillStyle = w.fast ? `rgba(160, 230, 255, ${(1 - u) * 0.6})` : `rgba(255, 220, 170, ${(1 - u) * 0.6})`;
        g.beginPath();
        g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, (1.4 + u * 1.6) * k, 0, Math.PI * 2);
        g.fill();
      }
    };

    // ---- interior cut-away.
    const LAYERS = [
      { r: 0.25, color: "#FFFFFF", name: "Lõi", note: "15 triệu °C · tổng hợp hạt nhân H → He" },
      { r: 0.7, color: "#FFD166", name: "Vùng bức xạ", note: "năng lượng đi bằng photon, mất hàng vạn năm" },
      { r: 1, color: "#FF7849", name: "Vùng đối lưu", note: "khí nóng cuộn lên như nồi nước sôi" },
    ];
    const cut = createSignal(0);
    const layerShow = LAYERS.map(() => createSignal(0));
    const walk = (() => {
      // A photon's random walk inside the radiative zone (precomputed, seeded).
      const r = rng(L.seed + 9);
      const pts: [number, number][] = [];
      let x = 0.27, y = -0.27;
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2;
        x += Math.cos(a) * 0.03;
        y += Math.sin(a) * 0.03;
        const d = Math.hypot(x, y);
        if (d > 0.68) (x *= 0.66 / d), (y *= 0.66 / d);
        if (d < 0.27) (x *= 0.28 / d), (y *= 0.28 / d);
        // Stay inside the cut quarter (upper right).
        if (x < 0.02) x = 0.04;
        if (y > -0.02) y = -0.04;
        pts.push([x, y]);
      }
      return pts;
    })();
    const interior = (g: CanvasRenderingContext2D) => {
      const u = cut();
      if (u <= 0) return;
      const a0 = -Math.PI / 2, a1 = a0 + (Math.PI / 2) * u;
      g.save();
      g.translate(cx, cy);
      for (let i = LAYERS.length - 1; i >= 0; i--) {
        const Ly = LAYERS[i];
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, Ly.r * R);
        gr.addColorStop(0, i === 0 ? "#FFFFFF" : Ly.color);
        gr.addColorStop(1, i === 2 ? "#E0451A" : i === 1 ? "#FF9F43" : "#FFE9A8");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, Ly.r * R, a0, a1);
        g.closePath();
        g.fill();
      }
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, R, a0, a1);
      g.closePath();
      g.clip();
      const t = clock();
      // Convection: rolling cells in the outer shell.
      if (layerShow[2]() > 0) {
        g.strokeStyle = `rgba(255, 245, 220, ${0.55 * layerShow[2]()})`;
        g.lineWidth = 2.4 * k;
        for (let i = 0; i < 6; i++) {
          const ac = a0 + ((i + 0.5) / 6) * (Math.PI / 2), rc = R * 0.85;
          const x = Math.cos(ac) * rc, y = Math.sin(ac) * rc, s = R * 0.11;
          const ph = t * 2 * (i % 2 ? 1 : -1);
          g.beginPath();
          g.ellipse(x, y, s, s * 0.8, ac, ph, ph + Math.PI * 1.5);
          g.stroke();
        }
      }
      // Radiative zone: the photon's zigzag drawn progressively.
      if (layerShow[1]() > 0) {
        const n = Math.floor(clamp(t / D, 0, 1) * walk.length * 1.6) % walk.length;
        g.strokeStyle = `rgba(80, 40, 0, ${0.6 * layerShow[1]()})`;
        g.lineWidth = 1.6 * k;
        g.beginPath();
        walk.slice(0, Math.max(2, n)).forEach(([x, y], i) => (i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R)));
        g.stroke();
        const [hx, hy] = walk[Math.max(1, n) - 1];
        g.fillStyle = "#FFFFFF";
        g.shadowColor = "#FFFFFF";
        g.shadowBlur = 12 * k;
        g.beginPath();
        g.arc(hx * R, hy * R, 5 * k, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
      // Fusion flicker in the core.
      if (layerShow[0]() > 0) {
        const r = rng(Math.floor(t * 12));
        for (let i = 0; i < 14; i++) {
          const a = a0 + r() * (Math.PI / 2), d = r() * 0.22 * R;
          g.fillStyle = `rgba(255, 255, 255, ${0.9 * layerShow[0]()})`;
          g.beginPath();
          g.arc(Math.cos(a) * d, Math.sin(a) * d, (2 + r() * 3) * k, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    };
    const layerNodes = LAYERS.map((Ly, i) => {
      const rm = ((Ly.r + (i ? LAYERS[i - 1].r : 0)) / 2) * R;
      const at: [number, number] = [cx + Math.cos(-Math.PI / 4) * rm, cy + Math.sin(-Math.PI / 4) * rm];
      const lx = cx + R * 1.1, ly = cy - R * 0.85 + i * R * 0.55;
      return (
        <Node opacity={layerShow[i]}>
          <Line points={[at, [lx - 12 * k, ly], [lx, ly]]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Txt text={Ly.name} x={lx + 10 * k} y={ly - 14 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={Ly.color} shadowColor="rgba(0,0,0,0.8)" shadowBlur={6 * k} />
          <Txt text={Ly.note} x={lx + 10 * k} y={ly + 18 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={21 * k} fill={L.dim} />
        </Node>
      );
    });

    // ---- callouts for the features of the mode.
    const call = (at: [number, number], to0: [number, number], text: string, show: ReturnType<typeof createSignal<number>>) => {
      const to: [number, number] = [fitX(ctx, to0[0], text, 26, to0[0] >= at[0]), to0[1]];
      return (
      <Node opacity={show}>
        <Line points={[at, to]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
        <Rect position={at} size={10 * k} radius={5 * k} fill={L.ink} />
        <Txt text={text} x={to[0] + (to[0] >= at[0] ? 10 : -10) * k} y={to[1]} offsetX={to[0] >= at[0] ? -1 : 1} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={L.text} shadowColor="rgba(0,0,0,0.85)" shadowBlur={8 * k} />
      </Node>
      );
    };
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callNodes: Node[] = [];
    const addCall = (at: [number, number], to: [number, number], text: string) => {
      const s = createSignal(0);
      shows.push(s);
      callNodes.push(call(at, to, text, s));
    };
    if (p.labels && p.mode !== "structure") {
      const right = cx + R * 1.25, left = cx - R * 1.25;
      if (spots.length) addCall([cx + R * 0.1, cy - R * 0.3], [right, cy - R * 0.85], "Vết đen Mặt Trời (~3 800 °C)");
      if (p.prominences) addCall(loopPt(proms[0], 0.5, 0, 1), [left, cy + R * 0.95], "Tai lửa — plasma theo đường sức từ");
      if (p.corona) addCall([cx - R * 0.95, cy - R * 0.55], [left, cy - R * 1.0], "Vành nhật hoa (1–3 triệu °C)");
      if (p.mode === "flare") addCall(flareAt, [right, cy + R * 0.2], "Bùng nổ Mặt Trời (flare)");
      if (p.mode === "cme") addCall([cx + R * 1.6 * Math.cos(cmeDir), cy + R * 1.6 * Math.sin(cmeDir)], [cx + R * 2.2, cy - R * 0.9], "Phun trào khối vành nhật hoa (CME)");
      if (p.mode === "wind") addCall([cx + R * 1.8, cy + R * 0.4], [cx + R * 2.3, cy + R * 1.0], "Gió Mặt Trời ~400–800 km/s");
    }

    // ---- facts.
    const FACTS: [string, string][] = [["Bán kính", "696 000 km (109 Trái Đất)"], ["Bề mặt", "~5 500 °C"], ["Lõi", "~15 triệu °C"], ["Thành phần", "73 % H · 25 % He"], ["Tuổi", "4,6 tỉ năm"], ["Ánh sáng tới Trái Đất", "8 phút 20 giây"]];
    const factsRef = createRef<Node>();
    const fx = A.wide ? A.x + A.w - PW : A.x + A.w * 0.08, fw = A.wide ? PW : A.w * 0.84;
    const fy = A.wide ? A.cy - (FACTS.length * 56 * k + 70 * k) / 2 : A.y + A.h - (FACTS.length * 46 * k + 80 * k);
    const rowH = (A.wide ? 56 : 46) * k;
    const factNode = p.facts ? (
      <Node ref={factsRef} opacity={0}>
        <Rect x={fx + fw / 2} y={fy + (FACTS.length * rowH + 70 * k) / 2} width={fw} height={FACTS.length * rowH + 70 * k} radius={18 * k} fill={alpha(L.bg, 0.72)} stroke={alpha(L.accent, 0.5)} lineWidth={L.lw(2 * k)} />
        <Txt text="Mặt Trời" x={fx + 24 * k} y={fy + 34 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={L.accent} />
        {FACTS.map(([a, b], i) => (
          <Node y={fy + 80 * k + i * rowH}>
            <Txt text={a} x={fx + 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={21 * k} fill={L.dim} />
            <Txt text={b} x={fx + fw - 24 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={22 * k} fill={L.text} />
          </Node>
        ))}
      </Node>
    ) : null;

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        {p.stars || L.backdrop !== "none" ? starfield(ctx, L, { count: Math.round(150 * q), seed: L.seed + 2, clock, drift: 3 }) : null}
        <Node ref={world} opacity={0}>
          <Draw paint={corona} />
          <Draw paint={wind} />
          <Draw paint={cme} />
          <Sphere ref={sun} x={cx} y={cy} radius={R} res={Math.round(Math.min(560, 2 * R) * (0.55 + 0.45 * q))} surface={surf} rot={rot} tilt={7.25 * rad} emissive limb={0.35} brightness={() => 1.08} />
          <Draw paint={limb} />
          <Draw paint={prominence} />
          <Draw paint={flare} />
          <Draw paint={flareBurst} />
          <Draw paint={interior} />
          {layerNodes}
          {callNodes}
        </Node>
        {factNode}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.8, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = [];
    if (p.mode === "structure") {
      steps.push(() => cut(1, 1.4, st.ease));
      layerShow.forEach((s) => steps.push(() => s(1, 0.6)));
    } else {
      if (p.mode === "flare")
        steps.push(function* () {
          flareT(0);
          yield* flareT(D, D, linear);
        });
      if (p.mode === "cme")
        steps.push(function* () {
          cmeT(0);
          yield* cmeT(D, D, linear);
        });
      shows.forEach((s) => steps.push(() => s(1, 0.5)));
    }
    if (factNode) steps.push(() => factsRef().opacity(1, 0.6));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
