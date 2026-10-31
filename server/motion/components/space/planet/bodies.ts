// The bodies of the planet component: physical data (NASA fact sheets), interior layers (radius
// fractions from published models), surface features, ring systems, moons, and a procedural surface
// for each. Surfaces are illustrations built from noise around each body's known features (the
// Earth's continents are a real land mask; maria, volcanoes, storms and regions sit at their real
// approximate coordinates) — not photographs.
import { makeNoise, smoothstep, mixRGB, rgb1, type Noise } from "../../../shared/noise";
import { bakeMap, type SurfaceMaps, type CloudMaps } from "../../../shared/sphere";
import { LAND_W, LAND_H, LAND_B64 } from "../../../shared/earth_land";

type RGB = [number, number, number];

export interface Layer {
  r: number; // outer radius as a fraction of the body's radius
  color: string;
  name: string;
  note: string;
}

export interface RingBand {
  r0: number; // in body radii
  r1: number;
  a: number; // opacity
  color: string;
  name?: string;
}

export interface Body {
  id: string;
  name: string;
  kind: "planet" | "moon" | "dwarf";
  parent?: string;
  radiusKm: number;
  dayH: number; // sidereal rotation, hours (negative = retrograde)
  tilt: number; // axial tilt, degrees
  facts: [string, string][];
  atmosphere?: { color: string; strength: number };
  // Visual turn rate (rotations per 10 s at spin = 1), sign = real sense of rotation.
  spinVis: number;
  // Cloud layer rate relative to the surface (Venus' super-rotation, Earth's weather).
  cloudSpeed?: number;
  cloudLabel?: string;
  layers: Layer[];
  features: [number, number, string][];
  rings?: RingBand[];
  moons?: string[];
  ambient?: number;
  bake(tw: number, seed: number): { surface: SurfaceMaps; clouds?: CloudMaps; storm?: CloudMaps };
}

// ---------------------------------------------------------------------------------------------
// Helpers

const ramp = (stops: [number, string][], t: number): RGB => {
  const s = stops.map(([x, c]) => [x, rgb1(c)] as [number, RGB]);
  if (t <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) if (t <= s[i][0]) return mixRGB(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
  return s[s.length - 1][1];
};

const rad = Math.PI / 180;
// Unit vector of (lat, lon) in degrees, same convention as bakeMap (y north, z toward lon 0).
const vec = (lat: number, lon: number): RGB => [Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad), Math.cos(lat * rad) * Math.cos(lon * rad)];
// Angular distance in degrees between a texel's unit vector and (lat, lon).
const angTo = (x: number, y: number, z: number, c: RGB) => Math.acos(Math.max(-1, Math.min(1, x * c[0] + y * c[1] + z * c[2]))) / rad;

// Stamps craters into a height map (bowl, raised rim, faint ejecta) and returns them.
function craters(H: Float32Array, w: number, h: number, rnd: () => number, n: number, rMin: number, rMax: number, depth = 1, fixed: [number, number, number][] = []) {
  const list: [number, number, number][] = [...fixed];
  for (let i = 0; i < n; i++) {
    // Size distribution: many small, few large.
    const r = rMin + (rMax - rMin) * Math.pow(rnd(), 3);
    list.push([Math.asin(2 * rnd() - 1) / rad, rnd() * 360 - 180, r]);
  }
  for (const [lat, lon, r] of list) {
    const c = vec(lat, lon);
    const span = r * 1.8;
    const r0 = Math.max(0, Math.floor(((90 - lat - span) / 180) * h)), r1 = Math.min(h - 1, Math.ceil(((90 - lat + span) / 180) * h));
    const dl = span / Math.max(0.08, Math.cos(lat * rad));
    const c0 = Math.floor(((lon - dl + 180) / 360) * w), c1 = Math.ceil(((lon + dl + 180) / 360) * w);
    for (let row = r0; row <= r1; row++) {
      const la = (90 - ((row + 0.5) * 180) / h) * rad;
      for (let cc = c0; cc <= c1; cc++) {
        const col = ((cc % w) + w) % w;
        const lo = (-180 + ((col + 0.5) * 360) / w) * rad;
        const d = angTo(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo), c) / r;
        if (d > 1.8) continue;
        const k = row * w + col;
        const bowl = d < 1 ? -(1 - d * d) * 0.9 : 0;
        const rim = Math.exp(-(((d - 1) / 0.18) ** 2)) * 0.35;
        H[k] += (bowl + rim) * depth * Math.min(1, r / 4 + 0.35);
      }
    }
  }
  return list;
}

const normalise = (H: Float32Array) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of H) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  for (let i = 0; i < H.length; i++) H[i] = (H[i] - lo) / (hi - lo || 1);
};

// Loops over the texels of a w × h map.
function each(w: number, h: number, fn: (k: number, lat: number, lon: number, x: number, y: number, z: number) => void) {
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) * 180) / h, la = lat * rad;
    for (let c = 0; c < w; c++) {
      const lon = -180 + ((c + 0.5) * 360) / w, lo = lon * rad;
      fn(r * w + c, lat, lon, Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
    }
  }
}

const cloudMap = (w: number, h: number, speed: number, fn: (lat: number, lon: number, x: number, y: number, z: number) => number, color?: RGB, rowSpeed?: Float32Array): CloudMaps => {
  const alpha = new Float32Array(w * h);
  each(w, h, (k, lat, lon, x, y, z) => (alpha[k] = Math.max(0, Math.min(1, fn(lat, lon, x, y, z)))));
  return { w, h, alpha, speed, color, rowSpeed };
};

// Rocky cratered body: base colour ramp over albedo noise, craters with relief.
function rocky(tw: number, seed: number, o: { stops: [number, string][]; craters: number; rMax: number; depth?: number; fixed?: [number, number, number][]; dark?: (lat: number, lon: number, x: number, y: number, z: number, N: Noise) => number; bump?: number; extra?: (k: number, lat: number, lon: number, x: number, y: number, z: number, c: RGB, H: Float32Array, N: Noise) => RGB }) {
  const w = tw, h = tw / 2, N = makeNoise(seed);
  const H = new Float32Array(w * h);
  each(w, h, (k, _la, _lo, x, y, z) => (H[k] = N.fbm(x * 4 + 9, y * 4, z * 4, 5) * 0.6));
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  craters(H, w, h, rnd, o.craters, 0.5, o.rMax, o.depth ?? 1, o.fixed);
  normalise(H);
  const color = new Float32Array(w * h * 3);
  each(w, h, (k, lat, lon, x, y, z) => {
    const alb = N.fbm(x * 2.5, y * 2.5 + 3, z * 2.5, 5);
    const d = o.dark ? o.dark(lat, lon, x, y, z, N) : 0;
    let c = ramp(o.stops, alb * (1 - d * 0.85) + (H[k] - 0.5) * 0.2);
    if (o.extra) c = o.extra(k, lat, lon, x, y, z, c, H, N);
    color.set(c, k * 3);
  });
  return { w, h, color, height: H, bump: o.bump ?? 1.4 } as SurfaceMaps;
}

// Banded gas/ice giant: latitude profile of colours, turbulence, per-row differential rotation.
function banded(tw: number, seed: number, o: { bands: [number, string][]; turb: number; streak: number; poles?: string; spot?: { lat: number; lon: number; rx: number; ry: number; color: string; ring?: string }; hex?: boolean; shear?: number; calm?: [number, number] }) {
  const w = tw, h = tw / 2, N = makeNoise(seed);
  const color = new Float32Array(w * h * 3);
  const rowSpeed = new Float32Array(h);
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) * 180) / h;
    const calm = o.calm && lat > o.calm[0] && lat < o.calm[1];
    rowSpeed[r] = calm ? 1 : 1 + (o.shear ?? 0.03) * Math.sin(lat * 0.32) * Math.cos(lat * rad);
  }
  const profile = (lat: number) => {
    const b = o.bands;
    for (let i = 1; i < b.length; i++) if (lat <= b[i][0]) return mixRGB(rgb1(b[i - 1][1]), rgb1(b[i][1]), smoothstep(0, 1, (lat - b[i - 1][0]) / (b[i][0] - b[i - 1][0])));
    return rgb1(b[b.length - 1][1]);
  };
  each(w, h, (k, lat, lon, x, y, z) => {
    // Band edges ripple; streaks are noise stretched along longitude.
    const wob = (N.fbm(x * 3, y * 9, z * 3, 4) - 0.5) * o.turb;
    let la = lat + wob;
    let sx = x, sy = y, sz = z;
    if (o.spot) {
      // Vortex: the noise around the spot is swirled, the spot itself is an ellipse.
      const dLon = ((lon - o.spot.lon + 540) % 360) - 180, dLat = lat - o.spot.lat;
      const e = Math.hypot(dLon / o.spot.rx, dLat / o.spot.ry);
      if (e < 2.2) {
        const ang = (2.2 - e) * 1.6;
        const nx = dLon * Math.cos(ang) - dLat * Math.sin(ang), ny = dLon * Math.sin(ang) + dLat * Math.cos(ang);
        sx = Math.sin((o.spot.lon + nx) * rad);
        sy = Math.sin((o.spot.lat + ny) * rad) * 3;
        sz = Math.cos((o.spot.lon + nx) * rad);
        la = lat + wob * Math.min(1, e / 2.2);
      }
    }
    let c = profile(la);
    const st = N.fbm(sx * 2 + 5, sy * 22, sz * 2, 5);
    c = mixRGB(c, mixRGB(c, [1, 0.97, 0.92], 0.5), (st - 0.5) * o.streak + 0.0);
    c = mixRGB(c, mixRGB(c, [0, 0, 0], 0.5), Math.max(0, 0.5 - st) * o.streak * 0.8);
    if (o.poles) c = mixRGB(c, rgb1(o.poles), smoothstep(48, 80, Math.abs(lat)) * 0.85);
    if (o.hex && lat > 70) {
      // Saturn's north polar hexagon (edge at ~78° N).
      const th = ((lon * rad) % (Math.PI / 3) + Math.PI / 3) % (Math.PI / 3);
      const rh = 12 * Math.cos(Math.PI / 6) / Math.cos(th - Math.PI / 6);
      const inside = 90 - lat < rh;
      if (inside) c = mixRGB(c, rgb1("#6E7F8E"), 0.55);
    }
    if (o.spot) {
      const dLon = ((lon - o.spot.lon + 540) % 360) - 180, dLat = lat - o.spot.lat;
      const e = Math.hypot(dLon / o.spot.rx, dLat / o.spot.ry);
      const inner = 1 - smoothstep(0.75, 1.0, e);
      const ring = Math.exp(-(((e - 1.05) / 0.12) ** 2));
      c = mixRGB(c, rgb1(o.spot.color), inner * (0.75 + 0.25 * N.fbm(dLon * 0.4, dLat * 0.4, 3, 3)));
      if (o.spot.ring) c = mixRGB(c, rgb1(o.spot.ring), ring * 0.6);
    }
    color.set(c, k * 3);
  });
  return { w, h, color, rowSpeed } as SurfaceMaps;
}

// Decoded Earth land mask (bit per cell).
let LAND: Uint8Array | null = null;
const landBit = (r: number, c: number) => {
  const i = Math.min(LAND_H - 1, Math.max(0, r)) * LAND_W + (((c % LAND_W) + LAND_W) % LAND_W);
  return (LAND![i >> 3] >> (i & 7)) & 1;
};
// Land fraction 0–1 at (lat, lon), interpolated between cells (smooth coasts once thresholded).
const landAt = (lat: number, lon: number) => {
  if (!LAND) LAND = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0));
  const fr = ((90 - lat) / 180) * LAND_H - 0.5, fc = ((lon + 180) / 360) * LAND_W - 0.5;
  const r = Math.floor(fr), c = Math.floor(fc), u = fc - c, v = fr - r;
  return (landBit(r, c) * (1 - u) + landBit(r, c + 1) * u) * (1 - v) + (landBit(r + 1, c) * (1 - u) + landBit(r + 1, c + 1) * u) * v;
};

// Soft rectangular region in degrees (for climate zones); 1 inside, fading over `soft` degrees.
const region = (lat: number, lon: number, la0: number, la1: number, lo0: number, lo1: number, soft = 6) =>
  smoothstep(la0 - soft, la0 + soft, lat) * (1 - smoothstep(la1 - soft, la1 + soft, lat)) * smoothstep(lo0 - soft, lo0 + soft, lon) * (1 - smoothstep(lo1 - soft, lo1 + soft, lon));

// ---------------------------------------------------------------------------------------------
// The bodies

const EARTH_LAYERS: Layer[] = [
  { r: 0.19, color: "#FFF1B8", name: "Lõi trong", note: "sắt–niken rắn · ~5 400 °C" },
  { r: 0.55, color: "#FFB547", name: "Lõi ngoài", note: "sắt lỏng · tạo từ trường" },
  { r: 0.9, color: "#E8613A", name: "Manti dưới", note: "đá nóng, chảy dẻo rất chậm" },
  { r: 0.99, color: "#A8432E", name: "Manti trên", note: "tới độ sâu ~660 km" },
  { r: 1, color: "#7A5A48", name: "Vỏ", note: "5–70 km (phóng to để dễ thấy)" },
];

export const BODIES: Record<string, Body> = {
  earth: {
    id: "earth",
    name: "Trái Đất",
    kind: "planet",
    radiusKm: 6371,
    dayH: 23.93,
    tilt: 23.44,
    spinVis: 0.4,
    cloudSpeed: 1.12,
    cloudLabel: "mây",
    atmosphere: { color: "#6FB6FF", strength: 0.75 },
    facts: [["Bán kính", "6 371 km"], ["Một ngày", "23 giờ 56 phút"], ["Một năm", "365,25 ngày"], ["Trọng lực", "9,81 m/s²"], ["Nhiệt độ TB", "15 °C"], ["Vệ tinh", "1"]],
    layers: EARTH_LAYERS,
    features: [[21, 105.8, "Việt Nam"], [0, -60, "Rừng Amazon"], [23, 12, "Sa mạc Sahara"], [28, 86.9, "Dãy Himalaya"], [0, -150, "Thái Bình Dương"]],
    moons: ["moon"],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed);
      const color = new Float32Array(w * h * 3), H = new Float32Array(w * h), spec = new Float32Array(w * h), night = new Float32Array(w * h);
      // Coast proximity: the land mask blurred (shallow seas near land are lighter).
      const land = new Float32Array(w * h);
      each(w, h, (k, lat, lon, x, y, z) => {
        const j = (N.fbm(x * 18, y * 18, z * 18, 3) - 0.5) * 1.2;
        land[k] = landAt(lat + j * 0.5, lon + j * 0.5) > 0.5 ? 1 : 0;
      });
      const near = new Float32Array(land);
      for (let pass = 0; pass < 3; pass++) {
        const src = new Float32Array(near);
        for (let r = 0; r < h; r++)
          for (let c = 0; c < w; c++) {
            let s = 0;
            for (let d = -2; d <= 2; d++) s += src[r * w + ((c + d + w) % w)] + src[Math.min(h - 1, Math.max(0, r + d)) * w + c];
            near[r * w + c] = s / 10;
          }
      }
      each(w, h, (k, lat, lon, x, y, z) => {
        const al = Math.abs(lat);
        if (land[k]) {
          const e = N.fbm(x * 4, y * 4, z * 4, 4), m = N.ridge(x * 3 + 2, y * 3, z * 3, 3);
          const elev = e * 0.6 + m * 0.5;
          H[k] = 0.3 + elev * 0.7;
          const desert = Math.max(region(lat, lon, 15, 32, -17, 35), region(lat, lon, 14, 32, 35, 60), region(lat, lon, -30, -19, 118, 142, 5), region(lat, lon, 38, 47, 88, 112, 5), region(lat, lon, 28, 37, -117, -104, 4), region(lat, lon, -28, -20, 15, 25, 4) * 0.7);
          const jungle = Math.max(region(lat, lon, -14, 4, -75, -47, 5), region(lat, lon, -5, 5, 10, 30, 5), region(lat, lon, -8, 18, 95, 150, 5));
          let c = ramp([[0, "#3E6B2F"], [0.5, "#5B7F3A"], [1, "#8C8A55"]], e);
          c = mixRGB(c, ramp([[0, "#1F4A1F"], [1, "#2F5E26"]], e), jungle * 0.8);
          c = mixRGB(c, ramp([[0, "#C79A5B"], [0.6, "#D9B47A"], [1, "#B9824E"]], e), desert);
          c = mixRGB(c, rgb1("#8A7D6A"), smoothstep(55, 68, al) * 0.6);
          c = mixRGB(c, ramp([[0, "#7A6650"], [1, "#BDB2A2"]], m), smoothstep(0.62, 0.8, m) * 0.6);
          const ice = Math.max(smoothstep(62, 66, -lat), smoothstep(58, 64, lat) * region(lat, lon, 60, 85, -74, -12, 3), smoothstep(80, 84, al));
          c = mixRGB(c, rgb1("#F2F6FA"), ice);
          color.set(c, k * 3);
          spec[k] = ice * 0.25;
          // City lights (illustrative density, brighter in the most populated regions).
          const pop = Math.max(region(lat, lon, 36, 60, -10, 40), region(lat, lon, 26, 48, -98, -70), region(lat, lon, 8, 30, 70, 90), region(lat, lon, 22, 42, 104, 141), region(lat, lon, -35, -5, -58, -34) * 0.6, region(lat, lon, 4, 14, 0, 10) * 0.7, region(lat, lon, 10, 22, 100, 110) * 0.8);
          const city = smoothstep(0.55, 0.8, N.fbm(x * 40, y * 40, z * 40, 3)) * (0.15 + pop) * (1 - ice) * (1 - desert * 0.85) * (al < 66 ? 1 : 0);
          night[k] = Math.min(1, city * 1.6);
        } else {
          const shallow = near[k];
          let c = ramp([[0, "#06204F"], [0.35, "#0B3A7A"], [0.8, "#1B6FA8"], [1, "#2E95B8"]], shallow * 1.2 + N.fbm(x * 6, y * 6, z * 6, 3) * 0.2);
          const seaIce = Math.max(smoothstep(72, 78, lat), smoothstep(64, 70, -lat));
          c = mixRGB(c, rgb1("#E4EEF5"), seaIce * 0.9);
          color.set(c, k * 3);
          H[k] = 0.3;
          spec[k] = 1 - seaIce;
        }
      });
      const clouds = cloudMap(w, h, 1.12, (lat, _lon, x, y, z) => {
        const q = N.fbm(x * 2 + 30, y * 2, z * 2, 3);
        const n = N.fbm(x * 4 + q * 2.2, y * 6 + q * 1.4, z * 4, 6);
        const band = 0.13 * Math.exp(-(((lat - 6) / 8) ** 2)) + 0.12 * Math.exp(-(((Math.abs(lat) - 52) / 12) ** 2)) - 0.1 * Math.exp(-(((Math.abs(lat) - 25) / 8) ** 2));
        return smoothstep(0.5, 0.72, n + band) * 0.95;
      });
      return { surface: { w, h, color, height: H, bump: 0.3, spec, night }, clouds };
    },
  },
  moon: {
    id: "moon",
    name: "Mặt Trăng",
    kind: "moon",
    parent: "earth",
    radiusKm: 1737,
    dayH: 655.7,
    tilt: 6.7,
    spinVis: 0.04,
    ambient: 0.02,
    facts: [["Bán kính", "1 737 km"], ["Cách Trái Đất", "384 400 km"], ["Quay một vòng", "27,3 ngày (khoá thuỷ triều)"], ["Trọng lực", "1,62 m/s²"], ["Nhiệt độ", "−173 … 127 °C"]],
    layers: [
      { r: 0.14, color: "#FFE9A8", name: "Lõi trong", note: "sắt rắn" },
      { r: 0.19, color: "#FFB547", name: "Lõi ngoài", note: "sắt lỏng" },
      { r: 0.28, color: "#E8784A", name: "Lớp nóng chảy một phần", note: "" },
      { r: 0.975, color: "#9C6A55", name: "Manti", note: "đá silicat" },
      { r: 1, color: "#BDB6AD", name: "Vỏ", note: "~40 km, dày hơn ở mặt khuất" },
    ],
    features: [[33, -16, "Biển Mưa (Mare Imbrium)"], [8.5, 31.4, "Biển Yên Tĩnh — Apollo 11"], [-43.3, -11.2, "Hố Tycho"], [9.6, -20, "Hố Copernicus"]],
    bake(tw, seed) {
      const maria: [number, number, number][] = [[33, -16, 11], [28, 17, 7], [8, 31, 8], [17, 59, 4.5], [-8, 51, 5], [-21, -17, 6.5], [18, -57, 17], [56, 0, 6], [-24, -39, 4], [-15, 35, 3.5], [-2, -30, 6]];
      const mv = maria.map(([la, lo, r]) => [vec(la, lo), r] as [RGB, number]);
      const surface = rocky(tw, seed, {
        stops: [[0, "#4A4643"], [0.35, "#7B7672"], [0.7, "#A9A49E"], [1, "#CFCAC2"]],
        craters: 300,
        rMax: 5,
        depth: 0.6,
        bump: 0.8,
        fixed: [[-43.3, -11.2, 2.6], [9.6, -20, 2.4], [-9, -1, 1.8], [-58, -14, 3.5]],
        dark: (_la, _lo, x, y, z, N) => {
          let d = 0;
          for (const [c, r] of mv) d = Math.max(d, 1 - smoothstep(r * 0.75, r * 1.15, angTo(x, y, z, c) + (N.fbm(x * 9, y * 9, z * 9, 3) - 0.5) * r * 0.6));
          return d;
        },
        extra: (_k, _la, _lo, x, y, z, c, _H, N) => {
          // Ray system of Tycho: bright streaks fanning out.
          const t = vec(-43.3, -11.2), d = angTo(x, y, z, t);
          if (d < 40 && d > 2.5) {
            const ray = smoothstep(0.72, 0.9, N.n3(Math.atan2(y - t[1], x - t[0]) * 9, 3, 1)) * (1 - d / 40);
            return mixRGB(c, [0.86, 0.84, 0.8], ray * 0.6);
          }
          return c;
        },
      });
      return { surface };
    },
  },
  mercury: {
    id: "mercury",
    name: "Sao Thủy",
    kind: "planet",
    radiusKm: 2440,
    dayH: 1407.6,
    tilt: 0.03,
    spinVis: 0.3,
    ambient: 0.02,
    facts: [["Bán kính", "2 440 km"], ["Cách Mặt Trời", "0,39 AU"], ["Một ngày Mặt Trời", "176 ngày Trái Đất"], ["Một năm", "88 ngày"], ["Nhiệt độ", "−180 … 430 °C"], ["Vệ tinh", "0"]],
    layers: [
      { r: 0.83, color: "#FFB547", name: "Lõi sắt", note: "chiếm ~85 % bán kính" },
      { r: 0.98, color: "#B4664A", name: "Manti", note: "silicat" },
      { r: 1, color: "#9C948C", name: "Vỏ", note: "~35 km" },
    ],
    features: [[30, 170, "Lòng chảo Caloris"], [-58, -54, "Vách đá Discovery Rupes"]],
    bake(tw, seed) {
      const cal = vec(30, 170);
      return {
        surface: rocky(tw, seed + 3, {
          stops: [[0, "#4C4642"], [0.4, "#7A716A"], [0.75, "#A39A90"], [1, "#C4BCB2"]],
          craters: 420,
          rMax: 4.5,
          depth: 0.6,
          bump: 0.9,
          fixed: [[30, 170, 13]],
          dark: (_la, _lo, x, y, z) => 0.3 * (1 - smoothstep(10, 16, angTo(x, y, z, cal))),
        }),
      };
    },
  },
  venus: {
    id: "venus",
    name: "Sao Kim",
    kind: "planet",
    radiusKm: 6052,
    dayH: -5832.5,
    tilt: 177.4,
    spinVis: -0.08,
    cloudSpeed: 8,
    cloudLabel: "tầng mây axit sulfuric",
    atmosphere: { color: "#FFD89A", strength: 0.9 },
    facts: [["Bán kính", "6 052 km"], ["Một ngày (tự quay)", "243 ngày, quay ngược"], ["Mây quay quanh", "~4 ngày (siêu quay)"], ["Áp suất bề mặt", "92 lần Trái Đất"], ["Nhiệt độ bề mặt", "~465 °C"], ["Khí quyển", "96,5 % CO₂"]],
    layers: [
      { r: 0.5, color: "#FFB547", name: "Lõi sắt–niken", note: "có thể một phần lỏng" },
      { r: 0.99, color: "#D8693E", name: "Manti", note: "silicat" },
      { r: 1, color: "#9E6A4C", name: "Vỏ", note: "núi lửa, ~30 km" },
    ],
    features: [[67, 3, "Núi Maxwell"], [-3, 100, "Aphrodite Terra"], [26, -86, "Núi lửa Maat Mons (vùng)"]],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 11);
      // Surface (seen when the clouds are turned off): radar-style lava plains and highlands.
      const H = new Float32Array(w * h), color = new Float32Array(w * h * 3);
      each(w, h, (k, lat, lon, x, y, z) => {
        const e = N.fbm(x * 3, y * 3, z * 3, 6), r = N.ridge(x * 6, y * 6, z * 6, 3);
        const high = Math.max(region(lat, lon, 60, 75, -40, 40, 6), region(lat, lon, -15, 5, 60, 150, 8));
        H[k] = e * 0.6 + r * 0.25 + high * 0.4;
        color.set(ramp([[0, "#5C2A14"], [0.4, "#9A4A22"], [0.7, "#C9763A"], [1, "#E9B070"]], H[k] * 0.9 + 0.05), k * 3);
      });
      normalise(H);
      // Clouds: an unbroken cream deck with dark chevrons (the "Y" feature seen in ultraviolet),
      // turning ~60 times faster than the ground (super-rotation).
      const cc = new Float32Array(w * h * 3), alpha = new Float32Array(w * h).fill(0.98);
      each(w, h, (k, lat, lon, _x, y) => {
        const a = (lon + Math.abs(lat) * 1.6) * rad;
        const chev = N.fbm(Math.sin(a) * 2, y * 5, Math.cos(a) * 2, 5);
        let c = ramp([[0, "#B98B4E"], [0.45, "#DDBB7F"], [0.7, "#F1DDAA"], [1, "#FBF0CF"]], chev);
        c = mixRGB(c, rgb1("#FFF4D6"), smoothstep(50, 80, Math.abs(lat)) * 0.6);
        cc.set(c, k * 3);
      });
      return { surface: { w, h, color, height: H, bump: 1 }, clouds: { w, h, alpha, speed: 8, rgb: cc } };
    },
  },
  mars: {
    id: "mars",
    name: "Sao Hỏa",
    kind: "planet",
    radiusKm: 3390,
    dayH: 24.62,
    tilt: 25.19,
    spinVis: 0.6,
    cloudSpeed: 1.25,
    cloudLabel: "bão bụi",
    atmosphere: { color: "#E8A27A", strength: 0.32 },
    facts: [["Bán kính", "3 390 km"], ["Một ngày (sol)", "24 giờ 37 phút"], ["Một năm", "687 ngày"], ["Trọng lực", "3,71 m/s²"], ["Nhiệt độ TB", "−63 °C"], ["Vệ tinh", "2 (Phobos, Deimos)"]],
    layers: [
      { r: 0.54, color: "#FFB547", name: "Lõi sắt–lưu huỳnh", note: "lỏng, ~1 830 km" },
      { r: 0.985, color: "#C1593A", name: "Manti", note: "silicat" },
      { r: 1, color: "#A0523A", name: "Vỏ", note: "~50 km" },
    ],
    features: [[18.6, -134, "Núi Olympus (21,9 km)"], [-8, -70, "Hẻm Valles Marineris"], [-42, 70, "Lòng chảo Hellas"], [84, 0, "Chỏm băng cực Bắc"], [-4.6, 137.4, "Hố Gale — Curiosity"], [18.4, 77.5, "Hố Jezero — Perseverance"]],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 21);
      const H = new Float32Array(w * h);
      const volc: [number, number, number, number][] = [[18.6, -134, 6.5, 1.4], [11.8, -104.5, 3.2, 0.8], [1.5, -113, 3.2, 0.8], [-8.3, -120.5, 3.4, 0.8], [40.5, -110, 3, 0.4]];
      const dark: [number, number, number][] = [[10, 70, 10], [45, -30, 12], [0, 0, 8], [-25, -40, 14], [-15, 100, 12], [-55, -20, 16], [-20, 150, 14]];
      const vv = volc.map(([a, b, r, hh]) => [vec(a, b), r, hh] as [RGB, number, number]);
      const dv = dark.map(([a, b, r]) => [vec(a, b), r] as [RGB, number]);
      const hel = vec(-42, 70);
      each(w, h, (k, lat, lon, x, y, z) => {
        let e = N.fbm(x * 3, y * 3, z * 3, 6) * 0.5 + 0.1 * Math.tanh(lat / 20);
        for (const [c, r, hh] of vv) e += hh * Math.exp(-((angTo(x, y, z, c) / r) ** 2));
        // Valles Marineris: a trough along 8° S from 100° W to 40° W.
        const vm = Math.exp(-(((lat + 7 - 3 * Math.sin((lon + 70) * 0.06)) / 1.6) ** 2)) * region(lat, lon, -30, 15, -100, -40, 4);
        e -= vm * 0.7;
        e -= 0.5 * (1 - smoothstep(10, 22, angTo(x, y, z, hel)));
        H[k] = e;
      });
      let s = seed * 31;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      craters(H, w, h, rnd, 220, 0.5, 3.5, 0.15);
      normalise(H);
      const color = new Float32Array(w * h * 3), spec = new Float32Array(w * h);
      each(w, h, (k, lat, lon, x, y, z) => {
        const alb = N.fbm(x * 4 + 7, y * 4, z * 4, 5);
        let d = 0;
        for (const [c, r] of dv) d = Math.max(d, 1 - smoothstep(r * 0.6, r * 1.3, angTo(x, y, z, c) + (alb - 0.5) * r));
        let c = ramp([[0, "#8A3B22"], [0.45, "#B65A32"], [0.75, "#D2804C"], [1, "#E3A06A"]], alb + (H[k] - 0.5) * 0.3);
        c = mixRGB(c, ramp([[0, "#3E2219"], [1, "#6A3A28"]], alb), d * 0.75);
        const capN = smoothstep(77, 81, lat + (N.fbm(x * 9, y * 9, z * 9, 3) - 0.5) * 5), capS = smoothstep(80, 84, -lat + (N.fbm(x * 9 + 4, y * 9, z * 9, 3) - 0.5) * 4);
        c = mixRGB(c, rgb1("#F4F1EC"), Math.max(capN, capS));
        spec[k] = Math.max(capN, capS) * 0.3;
        color.set(c, k * 3);
        void lon;
      });
      // Dust storm: a veil spreading from Hellas/Solis (cloudCover scales it in time).
      const storm = cloudMap(w, h, 1.25, (lat, _lon, x, y, z) => smoothstep(0.38, 0.7, N.fbm(x * 3 + 50, y * 4, z * 3, 5) + 0.12 - Math.abs(lat) / 260), [0.86, 0.6, 0.42]);
      // Thin water-ice clouds over the volcanoes (afternoon orographic clouds).
      const clouds = cloudMap(w, h, 1.1, (_lat, _lon, x, y, z) => {
        let c = 0;
        for (const [cc, r] of vv) c = Math.max(c, Math.exp(-((angTo(x, y, z, cc) / (r * 2.2)) ** 2)));
        return c * smoothstep(0.45, 0.75, N.fbm(x * 10, y * 10, z * 10, 4)) * 0.6;
      });
      return { surface: { w, h, color, height: H, bump: 0.75, spec }, clouds, storm };
    },
  },
  jupiter: {
    id: "jupiter",
    name: "Sao Mộc",
    kind: "planet",
    radiusKm: 69911,
    dayH: 9.93,
    tilt: 3.13,
    spinVis: 0.9,
    atmosphere: { color: "#F2D6B0", strength: 0.35 },
    facts: [["Bán kính", "69 911 km (11 lần Trái Đất)"], ["Một ngày", "9 giờ 56 phút"], ["Một năm", "11,9 năm"], ["Khối lượng", "318 lần Trái Đất"], ["Nhiệt độ đỉnh mây", "−110 °C"], ["Vệ tinh", "95 (4 vệ tinh Galileo)"]],
    layers: [
      { r: 0.2, color: "#FFE9A8", name: "Lõi đặc (pha loãng)", note: "đá, băng, kim loại" },
      { r: 0.78, color: "#C084FC", name: "Hydro kim loại lỏng", note: "dẫn điện, tạo từ trường mạnh" },
      { r: 0.99, color: "#E8B27A", name: "Hydro phân tử", note: "khí → lỏng theo độ sâu" },
      { r: 1, color: "#F5E3C7", name: "Tầng mây", note: "amoniac, nước" },
    ],
    features: [[-22, 0, "Vết Đỏ Lớn"], [12, 60, "Vành đai Xích đạo Bắc"], [0, 120, "Đới Xích đạo"]],
    rings: [{ r0: 1.72, r1: 1.81, a: 0.07, color: "#B49A7E", name: "vành chính (rất mờ)" }],
    moons: ["io", "europa", "ganymede", "callisto"],
    bake(tw, seed) {
      return {
        surface: banded(tw, seed + 31, {
          bands: [[-90, "#7E8A92"], [-48, "#A79C88"], [-38, "#CDB79A"], [-33, "#E2D2B4"], [-26, "#B9875E"], [-19, "#EDE0C6"], [-14, "#B27650"], [-7, "#CC9A6D"], [0, "#EFE3CB"], [7, "#E7D3B0"], [11, "#9E6340"], [18, "#C38A60"], [24, "#EEE2C8"], [31, "#B07E58"], [36, "#E0CFB0"], [42, "#A88F74"], [55, "#9A9286"], [90, "#7C858C"]],
          turb: 4,
          streak: 0.9,
          poles: "#7F8890",
          spot: { lat: -22, lon: 0, rx: 12, ry: 6.5, color: "#C2522F", ring: "#F2E4CC" },
          shear: 0.04,
          calm: [-32, -12],
        }),
      };
    },
  },
  saturn: {
    id: "saturn",
    name: "Sao Thổ",
    kind: "planet",
    radiusKm: 58232,
    dayH: 10.66,
    tilt: 26.73,
    spinVis: 0.8,
    atmosphere: { color: "#F5E2B8", strength: 0.3 },
    facts: [["Bán kính", "58 232 km"], ["Một ngày", "10 giờ 34 phút"], ["Một năm", "29,4 năm"], ["Mật độ", "0,69 g/cm³ (nhẹ hơn nước)"], ["Vành đai", "rộng ~280 000 km, dày ~10 m – 1 km"], ["Vệ tinh", "146 (Titan, Enceladus…)"]],
    layers: [
      { r: 0.22, color: "#FFE9A8", name: "Lõi đá–băng", note: "" },
      { r: 0.5, color: "#C084FC", name: "Hydro kim loại lỏng", note: "" },
      { r: 0.99, color: "#E8C88E", name: "Hydro–heli phân tử", note: "" },
      { r: 1, color: "#F5E6C4", name: "Tầng mây", note: "" },
    ],
    features: [[-25, 40, "Dải mây"], [85, 0, "Lục giác cực Bắc"]],
    rings: [
      { r0: 1.11, r1: 1.236, a: 0.05, color: "#7D7062", name: "D" },
      { r0: 1.239, r1: 1.527, a: 0.3, color: "#8F806C", name: "vành C" },
      { r0: 1.527, r1: 1.95, a: 0.92, color: "#E9D9B4", name: "vành B" },
      { r0: 1.95, r1: 2.025, a: 0.08, color: "#5A5046", name: "khe Cassini" },
      { r0: 2.025, r1: 2.27, a: 0.62, color: "#D3C29E", name: "vành A" },
      { r0: 2.32, r1: 2.335, a: 0.55, color: "#D8CCB4", name: "vành F" },
    ],
    moons: ["titan", "enceladus"],
    bake(tw, seed) {
      return {
        surface: banded(tw, seed + 41, {
          bands: [[-90, "#7E8C93"], [-60, "#B9A983"], [-40, "#DAC492"], [-25, "#C9AE78"], [-12, "#E7D3A0"], [0, "#F1E1B4"], [12, "#E3CC94"], [25, "#CDB27E"], [40, "#DCC79A"], [60, "#B8AE90"], [90, "#7E8C93"]],
          turb: 1.5,
          streak: 0.35,
          poles: "#8C98A0",
          hex: true,
          shear: 0.03,
        }),
      };
    },
  },
  uranus: {
    id: "uranus",
    name: "Sao Thiên Vương",
    kind: "planet",
    radiusKm: 25362,
    dayH: -17.24,
    tilt: 97.77,
    spinVis: -0.6,
    atmosphere: { color: "#B8F3FA", strength: 0.55 },
    facts: [["Bán kính", "25 362 km"], ["Một ngày", "17 giờ 14 phút (quay ngược)"], ["Trục nghiêng", "97,8° — lăn trên quỹ đạo"], ["Một năm", "84 năm"], ["Nhiệt độ", "−224 °C (lạnh nhất)"], ["Vệ tinh", "28"]],
    layers: [
      { r: 0.25, color: "#FFD38A", name: "Lõi đá", note: "" },
      { r: 0.75, color: "#4CC9F0", name: "Manti \"băng\"", note: "nước, amoniac, metan lỏng nóng" },
      { r: 1, color: "#A6F6FF", name: "Khí quyển H₂–He–CH₄", note: "metan hấp thụ đỏ → xanh lam" },
    ],
    features: [[60, 0, "Vùng cực sáng"]],
    rings: [
      { r0: 1.64, r1: 1.66, a: 0.35, color: "#8C9396" },
      { r0: 1.73, r1: 1.75, a: 0.3, color: "#8C9396" },
      { r0: 1.86, r1: 1.88, a: 0.3, color: "#8C9396" },
      { r0: 1.98, r1: 2.0, a: 0.75, color: "#A8B0B4", name: "vành ε" },
    ],
    bake(tw, seed) {
      return { surface: banded(tw, seed + 51, { bands: [[-90, "#A9E6EC"], [-40, "#86D3DE"], [0, "#7BCAD8"], [40, "#8ED6E1"], [90, "#BDEEF2"]], turb: 0.6, streak: 0.12, shear: 0.02 }) };
    },
  },
  neptune: {
    id: "neptune",
    name: "Sao Hải Vương",
    kind: "planet",
    radiusKm: 24622,
    dayH: 16.11,
    tilt: 28.32,
    spinVis: 0.7,
    cloudSpeed: 1.3,
    cloudLabel: "mây metan trắng",
    atmosphere: { color: "#7FA8FF", strength: 0.6 },
    facts: [["Bán kính", "24 622 km"], ["Một ngày", "16 giờ 6 phút"], ["Một năm", "165 năm"], ["Gió", "tới ~2 100 km/h (mạnh nhất Hệ Mặt Trời)"], ["Nhiệt độ", "−214 °C"], ["Vệ tinh", "16 (Triton)"]],
    layers: [
      { r: 0.25, color: "#FFD38A", name: "Lõi đá", note: "" },
      { r: 0.8, color: "#168BFF", name: "Manti \"băng\"", note: "nước, amoniac, metan" },
      { r: 1, color: "#5CA0FF", name: "Khí quyển H₂–He–CH₄", note: "" },
    ],
    features: [[-20, 0, "Vết Tối Lớn (1989)"], [-42, 80, "Mây \"Scooter\""]],
    rings: [
      { r0: 2.14, r1: 2.16, a: 0.12, color: "#7D8590", name: "Le Verrier" },
      { r0: 2.53, r1: 2.55, a: 0.18, color: "#7D8590", name: "Adams" },
    ],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 61);
      const surface = banded(tw, seed + 61, { bands: [[-90, "#3A5BD0"], [-60, "#2E4CC0"], [-35, "#4468DC"], [-15, "#3554CC"], [10, "#3E62D8"], [40, "#2F4FC4"], [90, "#3A5BD0"]], turb: 2, streak: 0.3, spot: { lat: -20, lon: 0, rx: 10, ry: 5.5, color: "#14236E" }, calm: [-32, -10], shear: 0.05 });
      const clouds = cloudMap(w, h, 1.3, (lat, lon, x, y, z) => {
        const streaks = Math.exp(-(((lat - 26) / 3) ** 2)) + Math.exp(-(((lat + 42) / 2.5) ** 2)) + 0.8 * Math.exp(-(((lat + 25) / 2) ** 2)) * region(lat, lon, -40, -10, -14, 18, 4);
        return streaks * smoothstep(0.5, 0.75, N.fbm(x * 3, y * 30, z * 3, 4)) * 1.2;
      });
      return { surface, clouds };
    },
  },
  pluto: {
    id: "pluto",
    name: "Sao Diêm Vương",
    kind: "dwarf",
    radiusKm: 1188,
    dayH: -153.3,
    tilt: 122.5,
    spinVis: -0.35,
    atmosphere: { color: "#9EC7FF", strength: 0.25 },
    facts: [["Bán kính", "1 188 km"], ["Cách Mặt Trời", "30–49 AU"], ["Một năm", "248 năm"], ["Một ngày", "6,4 ngày"], ["Nhiệt độ", "~−230 °C"], ["Vệ tinh", "5 (Charon)"]],
    layers: [
      { r: 0.72, color: "#9C6A55", name: "Lõi đá", note: "" },
      { r: 0.86, color: "#4CC9F0", name: "Đại dương ngầm?", note: "giả thuyết, chưa xác nhận" },
      { r: 1, color: "#E8E2D6", name: "Vỏ băng nitơ–nước", note: "" },
    ],
    features: [[20, 178, "Tombaugh Regio — \"trái tim\""], [-5, 100, "Cthulhu Macula"]],
    moons: ["charon"],
    bake(tw, seed) {
      const sp = vec(22, 178), east = vec(5, -150);
      return {
        surface: rocky(tw, seed + 71, {
          stops: [[0, "#6E4A36"], [0.4, "#A77A5C"], [0.75, "#CBA383"], [1, "#E6D2BA"]],
          craters: 120,
          rMax: 3,
          bump: 0.8,
          extra: (_k, lat, lon, x, y, z, c, _H, N) => {
            const j = (N.fbm(x * 8, y * 8, z * 8, 3) - 0.5) * 6;
            const heart = Math.max(1 - smoothstep(13, 17, angTo(x, y, z, sp) + j), (1 - smoothstep(12, 20, angTo(x, y, z, east) + j)) * 0.8);
            const cth = region(lat + j * 0.5, lon, -22, 12, 40, 155, 6);
            let out = mixRGB(c, ramp([[0, "#3E1E14"], [1, "#6A3424"]], N.fbm(x * 5, y * 5, z * 5, 3)), cth * 0.85);
            out = mixRGB(out, rgb1("#F4EDE0"), heart * 0.92);
            return out;
          },
        }),
      };
    },
  },
  charon: {
    id: "charon",
    name: "Charon",
    kind: "moon",
    parent: "pluto",
    radiusKm: 606,
    dayH: 153.3,
    tilt: 0,
    spinVis: 0.35,
    facts: [["Bán kính", "606 km (nửa Sao Diêm Vương)"], ["Quỹ đạo", "6,4 ngày, khoá thuỷ triều hai chiều"]],
    layers: [
      { r: 0.7, color: "#9C6A55", name: "Lõi đá", note: "" },
      { r: 1, color: "#C8C4BE", name: "Manti và vỏ băng", note: "" },
    ],
    features: [[80, 0, "Mordor Macula (vùng cực đỏ)"]],
    bake(tw, seed) {
      return {
        surface: rocky(tw, seed + 81, {
          stops: [[0, "#5E5A56"], [0.5, "#8E8984"], [1, "#BDB8B2"]],
          craters: 200,
          rMax: 4,
          extra: (_k, lat, _lon, x, y, z, c, _H, N) => mixRGB(mixRGB(c, rgb1("#7A4434"), smoothstep(55, 75, lat + (N.fbm(x * 6, y * 6, z * 6, 3) - 0.5) * 10) * 0.8), rgb1("#6B6560"), Math.exp(-(((lat - 2) / 6) ** 2)) * 0.4),
        }),
      };
    },
  },
  io: {
    id: "io",
    name: "Io",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 1822,
    dayH: 42.5,
    tilt: 0,
    spinVis: 0.4,
    facts: [["Bán kính", "1 822 km"], ["Núi lửa", "~400 núi lửa đang hoạt động"], ["Nguồn nhiệt", "lực thuỷ triều của Sao Mộc"]],
    layers: [
      { r: 0.52, color: "#FFB547", name: "Lõi sắt", note: "" },
      { r: 0.97, color: "#E8613A", name: "Manti silicat nóng chảy một phần", note: "" },
      { r: 1, color: "#E6D36E", name: "Vỏ lưu huỳnh–silicat", note: "" },
    ],
    features: [[-19, -105, "Núi lửa Pele"], [13, -50, "Loki Patera"]],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 91);
      let s = seed * 13;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const vents: [RGB, number][] = [[vec(-19, -105), 2.2], [vec(13, -50), 3.2], ...Array.from({ length: 70 }, () => [vec(Math.asin(2 * rnd() - 1) / rad, rnd() * 360 - 180), 0.6 + rnd() * 1.4] as [RGB, number])];
      const color = new Float32Array(w * h * 3), night = new Float32Array(w * h), H = new Float32Array(w * h);
      const pele = vec(-19, -105);
      each(w, h, (k, lat, _lon, x, y, z) => {
        const a = N.fbm(x * 4, y * 4, z * 4, 5);
        let c = ramp([[0, "#B5873A"], [0.4, "#E0C35E"], [0.7, "#EFE29A"], [1, "#F4EFD0"]], a);
        c = mixRGB(c, rgb1("#C9783E"), smoothstep(0.55, 0.75, N.fbm(x * 7 + 3, y * 7, z * 7, 4)) * 0.6);
        c = mixRGB(c, rgb1("#8C6F5A"), smoothstep(55, 80, Math.abs(lat)) * 0.5);
        let lava = 0;
        for (const [v, r] of vents) {
          const d = angTo(x, y, z, v);
          if (d < r * 3) {
            c = mixRGB(c, rgb1("#2A1C14"), 1 - smoothstep(r * 0.4, r, d));
            c = mixRGB(c, rgb1("#B44A2A"), Math.exp(-(((d - r * 1.6) / (r * 0.5)) ** 2)) * 0.5);
            lava = Math.max(lava, 1 - smoothstep(0, r * 0.7, d));
          }
        }
        const pd = angTo(x, y, z, pele);
        c = mixRGB(c, rgb1("#C2452A"), Math.exp(-(((pd - 7) / 1.2) ** 2)) * 0.7);
        color.set(c, k * 3);
        night[k] = lava;
        H[k] = a * 0.5;
      });
      return { surface: { w, h, color, night, height: H, bump: 0.5 } };
    },
  },
  europa: {
    id: "europa",
    name: "Europa",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 1561,
    dayH: 85.2,
    tilt: 0,
    spinVis: 0.4,
    facts: [["Bán kính", "1 561 km"], ["Vỏ băng", "dày 15–25 km"], ["Đại dương ngầm", "nước mặn, có thể gấp đôi lượng nước Trái Đất"]],
    layers: [
      { r: 0.42, color: "#FFB547", name: "Lõi sắt", note: "" },
      { r: 0.88, color: "#B4664A", name: "Manti đá", note: "" },
      { r: 0.985, color: "#168BFF", name: "Đại dương nước mặn", note: "~100 km" },
      { r: 1, color: "#EAF3F7", name: "Vỏ băng", note: "15–25 km" },
    ],
    features: [[-5, 160, "Vùng hỗn độn Conamara"], [15, -90, "Các đường nứt (lineae)"]],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 101);
      const color = new Float32Array(w * h * 3), H = new Float32Array(w * h), spec = new Float32Array(w * h);
      each(w, h, (k, _lat, _lon, x, y, z) => {
        const base = N.fbm(x * 3, y * 3, z * 3, 4);
        let c = ramp([[0, "#B8A48C"], [0.5, "#DCD2C2"], [1, "#F2EEE6"]], base);
        const r1 = N.ridge(x * 5, y * 5, z * 5, 3), r2 = N.ridge(x * 11 + 4, y * 11, z * 11, 2);
        const lines = Math.max(smoothstep(0.82, 0.95, r1), smoothstep(0.86, 0.96, r2) * 0.7);
        c = mixRGB(c, rgb1("#9A5A3E"), lines * 0.75);
        const chaos = smoothstep(0.62, 0.75, N.fbm(x * 6 + 9, y * 6, z * 6, 4));
        c = mixRGB(c, rgb1("#A0785C"), chaos * 0.5);
        color.set(c, k * 3);
        H[k] = 0.5 + lines * 0.2 - chaos * 0.1;
        spec[k] = 0.15;
      });
      return { surface: { w, h, color, height: H, bump: 0.6, spec } };
    },
  },
  ganymede: {
    id: "ganymede",
    name: "Ganymede",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 2634,
    dayH: 171.7,
    tilt: 0,
    spinVis: 0.4,
    facts: [["Bán kính", "2 634 km — vệ tinh lớn nhất"], ["Đặc biệt", "có từ trường riêng"]],
    layers: [
      { r: 0.25, color: "#FFB547", name: "Lõi sắt", note: "" },
      { r: 0.55, color: "#B4664A", name: "Manti silicat", note: "" },
      { r: 0.8, color: "#9FC9E8", name: "Băng áp suất cao", note: "" },
      { r: 0.9, color: "#168BFF", name: "Đại dương ngầm", note: "" },
      { r: 1, color: "#C9C2B6", name: "Vỏ băng", note: "" },
    ],
    features: [[35, -145, "Galileo Regio (vùng tối)"]],
    bake(tw, seed) {
      const gal = vec(35, -145);
      return {
        surface: rocky(tw, seed + 111, {
          stops: [[0, "#5A524A"], [0.45, "#8A8274"], [0.7, "#B5AC9C"], [1, "#D9D2C4"]],
          craters: 260,
          rMax: 3.5,
          dark: (_la, _lo, x, y, z, N) => Math.max(smoothstep(0.5, 0.62, N.fbm(x * 2.2 + 2, y * 2.2, z * 2.2, 4)), 1 - smoothstep(18, 30, angTo(x, y, z, gal))),
          extra: (_k, _la, _lo, x, y, z, c, _H, N) => mixRGB(c, rgb1("#CFC8BA"), smoothstep(0.8, 0.95, N.ridge(x * 14, y * 14, z * 14, 2)) * 0.35),
        }),
      };
    },
  },
  callisto: {
    id: "callisto",
    name: "Callisto",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 2410,
    dayH: 400.5,
    tilt: 0,
    spinVis: 0.4,
    facts: [["Bán kính", "2 410 km"], ["Bề mặt", "nhiều hố va chạm nhất Hệ Mặt Trời"]],
    layers: [
      { r: 0.75, color: "#8C6A55", name: "Hỗn hợp đá–băng", note: "chưa phân lớp rõ" },
      { r: 0.9, color: "#168BFF", name: "Đại dương ngầm?", note: "giả thuyết" },
      { r: 1, color: "#6E655C", name: "Vỏ băng", note: "" },
    ],
    features: [[15, -56, "Lòng chảo Valhalla"]],
    bake(tw, seed) {
      const val = vec(15, -56);
      return {
        surface: rocky(tw, seed + 121, {
          stops: [[0, "#2E2925"], [0.45, "#4E4640"], [0.8, "#7A7068"], [1, "#B0A89E"]],
          craters: 900,
          rMax: 3,
          extra: (_k, _la, _lo, x, y, z, c, H) => {
            const d = angTo(x, y, z, val);
            const rings = d < 30 ? Math.max(0, Math.sin(d * 1.1)) ** 6 * (1 - d / 30) : 0;
            return mixRGB(mixRGB(c, rgb1("#C8C0B4"), smoothstep(0.62, 0.75, H[_k]) * 0.6), rgb1("#B5ACA0"), Math.max(rings * 0.6, (1 - smoothstep(3, 8, d)) * 0.7));
          },
        }),
      };
    },
  },
  titan: {
    id: "titan",
    name: "Titan",
    kind: "moon",
    parent: "saturn",
    radiusKm: 2575,
    dayH: 382.7,
    tilt: 0,
    spinVis: 0.4,
    cloudSpeed: 1.05,
    cloudLabel: "sương mù hữu cơ",
    atmosphere: { color: "#E9A64E", strength: 1 },
    facts: [["Bán kính", "2 575 km"], ["Khí quyển", "dày 1,5 lần Trái Đất, 95 % nitơ"], ["Bề mặt", "hồ và biển metan–etan lỏng"], ["Nhiệt độ", "−179 °C"]],
    layers: [
      { r: 0.7, color: "#9C6A55", name: "Lõi đá ngậm nước", note: "" },
      { r: 0.8, color: "#9FC9E8", name: "Băng áp suất cao", note: "" },
      { r: 0.94, color: "#168BFF", name: "Đại dương nước–amoniac", note: "" },
      { r: 1, color: "#D9A050", name: "Vỏ băng", note: "" },
    ],
    features: [[-10, -100, "Xanadu"], [72, -50, "Biển Kraken (metan lỏng)"]],
    bake(tw, seed) {
      const w = tw, h = tw / 2, N = makeNoise(seed + 131);
      const color = new Float32Array(w * h * 3), spec = new Float32Array(w * h);
      each(w, h, (k, lat, lon, x, y, z) => {
        const dunes = N.fbm(x * 4, y * 4, z * 4, 5);
        const xan = region(lat, lon, -25, 10, -140, -60, 8);
        const lakes = smoothstep(62, 70, lat) * smoothstep(0.5, 0.65, N.fbm(x * 8, y * 8, z * 8, 4));
        let c = ramp([[0, "#3E2A18"], [0.5, "#6A4A28"], [1, "#9A7444"]], dunes * (1 - Math.exp(-(((Math.abs(lat) - 0) / 25) ** 2)) * 0.5));
        c = mixRGB(c, rgb1("#C9A26C"), xan * 0.8);
        c = mixRGB(c, rgb1("#141820"), lakes);
        color.set(c, k * 3);
        spec[k] = lakes;
      });
      const clouds = cloudMap(w, h, 1.05, (lat) => 0.93 - 0.03 * Math.cos(lat * rad), [0.85, 0.6, 0.3]);
      return { surface: { w, h, color, spec }, clouds };
    },
  },
  enceladus: {
    id: "enceladus",
    name: "Enceladus",
    kind: "moon",
    parent: "saturn",
    radiusKm: 252,
    dayH: 32.9,
    tilt: 0,
    spinVis: 0.4,
    facts: [["Bán kính", "252 km"], ["Bề mặt", "phản xạ ~99 % ánh sáng — sáng nhất Hệ Mặt Trời"], ["Cực Nam", "mạch phun hơi nước từ đại dương ngầm"]],
    layers: [
      { r: 0.75, color: "#9C6A55", name: "Lõi đá xốp", note: "" },
      { r: 0.9, color: "#168BFF", name: "Đại dương toàn cầu", note: "" },
      { r: 1, color: "#F2F6F8", name: "Vỏ băng", note: "mỏng nhất ở cực Nam" },
    ],
    features: [[-82, 0, "\"Sọc hổ\" — mạch phun"]],
    bake(tw, seed) {
      return {
        surface: rocky(tw, seed + 141, {
          stops: [[0, "#B9C2C6"], [0.5, "#DDE4E7"], [1, "#FAFCFD"]],
          craters: 220,
          rMax: 3,
          bump: 1,
          extra: (_k, lat, lon, x, y, z, c, _H, N) => {
            let out = mixRGB(c, rgb1("#A8B7BE"), smoothstep(0.84, 0.95, N.ridge(x * 6, y * 6, z * 6, 3)) * 0.5);
            // Four parallel "tiger stripes" across the south polar region.
            if (lat < -62) {
              const px = Math.cos(lat * rad) * Math.cos(lon * rad), u = (px * 90 + 2) % 9;
              const stripe = Math.exp(-(((u - 4.5) / 0.7) ** 2)) * smoothstep(-62, -70, lat);
              out = mixRGB(out, rgb1("#5FA3B8"), stripe * 0.85);
            }
            return out;
          },
        }),
      };
    },
  },
};

export const BODY_IDS = Object.keys(BODIES);

// Moon orbit shown around a parent (radius in parent radii, compressed; period in days, real).
export const ORBITS: Record<string, { r: number; period: number; size: number }> = {
  moon: { r: 2.6, period: 27.32, size: 0.27 },
  io: { r: 1.75, period: 1.769, size: 0.11 },
  europa: { r: 2.2, period: 3.551, size: 0.095 },
  ganymede: { r: 2.75, period: 7.155, size: 0.14 },
  callisto: { r: 3.3, period: 16.69, size: 0.13 },
  titan: { r: 2.75, period: 15.95, size: 0.14 },
  enceladus: { r: 2.48, period: 1.37, size: 0.06 },
  charon: { r: 2.5, period: 6.387, size: 0.51 },
};
