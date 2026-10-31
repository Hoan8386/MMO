// A lit, textured sphere drawn pixel by pixel: planets, moons, stars, molecules' atoms. The surface is
// an equirectangular map (colour + optional height, specular, night-light masks) that turns under a
// fixed light; an optional cloud map turns at its own rate; the limb gets atmospheric scattering.
// All per-pixel geometry (normal, latitude, longitude, local east/north) is computed once, so a
// frame costs a texture lookup and a few dot products per pixel.
//
//   <Sphere radius={300} surface={maps} rot={() => clock() * 0.4} light={() => [-0.8, -0.2, 0.55]} />
//
// Axes: x right, y down (screen), z toward the viewer. tilt turns the spin axis in the image plane
// (radians, positive = north pole leans right); pitch tips the north pole toward the viewer.
import { Node, type NodeProps } from "@motion-canvas/2d";

export interface SurfaceMaps {
  w: number;
  h: number;
  // RGB 0–1 per texel, row 0 = north pole, column 0 = longitude −180°.
  color: Float32Array;
  // Height 0–1 for relief shading, and its strength.
  height?: Float32Array;
  bump?: number;
  // Shininess mask 0–1 (oceans, ice).
  spec?: Float32Array;
  // Light emitted on the night side 0–1 (city lights, lava), coloured by nightColor.
  night?: Float32Array;
  // Rotation multiplier per row (differential rotation of gas giants' bands, of the Sun).
  rowSpeed?: Float32Array;
}

export interface CloudMaps {
  w: number;
  h: number;
  alpha: Float32Array;
  // Rotation of the clouds relative to the surface's (1 = same).
  speed: number;
  color?: [number, number, number];
  // Per-texel RGB of the cloud deck (Venus), instead of one colour.
  rgb?: Float32Array;
  rowSpeed?: Float32Array;
}

export interface SphereProps extends NodeProps {
  radius: number;
  // Pixels across the drawn disc (it is scaled up to 2·radius with smoothing).
  res?: number;
  surface: SurfaceMaps;
  clouds?: CloudMaps;
  // Rotation of the surface, radians (prograde = features move left → right on the facing side).
  rot: () => number;
  tilt?: number;
  pitch?: number;
  // Direction toward the light, view coordinates (normalised inside).
  light?: () => [number, number, number];
  ambient?: number;
  // Self-luminous (stars): no lighting, limb darkening with coefficient `limb`.
  emissive?: boolean;
  limb?: number;
  atmosphere?: { color: [number, number, number]; strength: number };
  nightColor?: [number, number, number];
  // Extra shadow 0–1 at a point of the disc, local pixel coordinates (ring shadow, eclipse).
  shadow?: (x: number, y: number) => number;
  brightness?: () => number;
  // Multiplier of the cloud alpha (a dust storm spreading, haze thinning).
  cloudCover?: () => number;
}

type V3 = [number, number, number];

// The body's frame in view coordinates: spin axis (north), and the two equatorial axes (longitude
// 90° and 0°). Rings and moon orbits lie in the plane of e0 and f0.
export function bodyFrame(tilt = 0, pitch = 0) {
  const rx = (v: V3): V3 => [v[0], v[1] * Math.cos(pitch) - v[2] * Math.sin(pitch), v[1] * Math.sin(pitch) + v[2] * Math.cos(pitch)];
  const rz = (v: V3): V3 => [v[0] * Math.cos(tilt) - v[1] * Math.sin(tilt), v[0] * Math.sin(tilt) + v[1] * Math.cos(tilt), v[2]];
  return { up: rz(rx([0, -1, 0])), e0: rz(rx([1, 0, 0])), f0: rz(rx([0, 0, 1])) };
}

export class Sphere extends Node {
  private readonly o: SphereProps;
  private readonly res: number;
  private canvas: HTMLCanvasElement | null = null;
  private img: ImageData | null = null;
  // Per inside pixel: index, coverage, view normal, lat (row 0–1), lon0, east, north.
  private idx!: Int32Array;
  private cov!: Float32Array;
  private geo!: Float32Array; // nx ny nz row lon0 ex ey ez qx qy qz
  private gx: Float32Array | null = null;
  private gy: Float32Array | null = null;
  private readonly up: V3;
  private readonly e0: V3;
  private readonly f0: V3;

  public constructor(props: SphereProps) {
    super(props);
    this.o = props;
    this.res = Math.max(16, Math.round(props.res ?? 360));
    // Body frame: spin axis up, then pitched toward the viewer, then tilted in the image plane.
    const f = bodyFrame(props.tilt, props.pitch);
    this.up = f.up;
    this.e0 = f.e0;
    this.f0 = f.f0;
    this.build();
  }

  private build() {
    const n = this.res, up = this.up, e0 = this.e0, f0 = this.f0;
    const idx: number[] = [], cov: number[] = [], geo: number[] = [];
    const px = 2 / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * px - 1, y = (j + 0.5) * px - 1, d = Math.hypot(x, y);
        if (d > 1 + px) continue;
        const c = Math.min(1, Math.max(0, (1 - d) / px + 0.5));
        if (c <= 0) continue;
        const dd = Math.min(d, 0.9999), s = dd / Math.max(d, 1e-9);
        const nx = x * s, ny = y * s, nz = Math.sqrt(Math.max(0, 1 - dd * dd));
        const bu = nx * up[0] + ny * up[1] + nz * up[2];
        const lat = Math.asin(Math.max(-1, Math.min(1, bu)));
        const lon0 = Math.atan2(nx * e0[0] + ny * e0[1] + nz * e0[2], nx * f0[0] + ny * f0[1] + nz * f0[2]);
        // east = n × up, north = east × n.
        let ex = ny * up[2] - nz * up[1], ey = nz * up[0] - nx * up[2], ez = nx * up[1] - ny * up[0];
        const el = Math.hypot(ex, ey, ez) || 1;
        ex /= el;
        ey /= el;
        ez /= el;
        const qx = ey * nz - ez * ny, qy = ez * nx - ex * nz, qz = ex * ny - ey * nx;
        idx.push(j * n + i);
        cov.push(c);
        geo.push(nx, ny, nz, 0.5 - lat / Math.PI, lon0, ex, ey, ez, qx, qy, qz);
      }
    this.idx = Int32Array.from(idx);
    this.cov = Float32Array.from(cov);
    this.geo = Float32Array.from(geo);
    // Height gradient (east, north) per texel, for relief.
    const S = this.o.surface;
    if (S.height && S.bump) {
      const { w, h } = S, H = S.height;
      this.gx = new Float32Array(w * h);
      this.gy = new Float32Array(w * h);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const k = r * w + c;
          const cosl = Math.max(0.15, Math.cos(((r + 0.5) / h - 0.5) * Math.PI));
          this.gx[k] = ((H[r * w + ((c + 1) % w)] - H[r * w + ((c - 1 + w) % w)]) * S.bump * w) / (4 * Math.PI * cosl);
          this.gy[k] = ((H[Math.max(0, r - 1) * w + c] - H[Math.min(h - 1, r + 1) * w + c]) * S.bump * h) / (2 * Math.PI);
        }
    }
  }

  // Where a surface point (lat, lon in degrees) is now: local [x, y] and z (> 0 = facing the viewer).
  public project(lat: number, lon: number): V3 {
    const R = this.o.radius, la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180 + this.o.rot();
    const up = this.up, e0 = this.e0, f0 = this.f0, c = Math.cos(la), s = Math.sin(la);
    const v = [0, 1, 2].map((a) => c * (Math.sin(lo) * e0[a] + Math.cos(lo) * f0[a]) + s * up[a]);
    return [v[0] * R, v[1] * R, v[2]];
  }

  protected override draw(context: CanvasRenderingContext2D) {
    const n = this.res;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = n;
      this.canvas.height = n;
      this.img = this.canvas.getContext("2d")!.createImageData(n, n);
    }
    const o = this.o, S = o.surface, C = o.clouds;
    const data = this.img!.data;
    data.fill(0);
    const rot = o.rot();
    const L0 = o.light ? o.light() : ([-0.6, -0.25, 0.75] as V3);
    const ll = Math.hypot(L0[0], L0[1], L0[2]) || 1;
    const Lx = L0[0] / ll, Ly = L0[1] / ll, Lz = L0[2] / ll;
    // Half vector with the viewer (0, 0, 1), for specular glints.
    const hl = Math.hypot(Lx, Ly, Lz + 1) || 1;
    const Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl;
    const amb = o.ambient ?? 0.04;
    const bright = o.brightness ? o.brightness() : 1;
    const atm = o.atmosphere, night = o.nightColor ?? [1, 0.78, 0.45];
    const limb = o.limb ?? 0.6;
    const cover = o.cloudCover ? o.cloudCover() : 1;
    const TW = S.w, TH = S.h, TAU = Math.PI * 2;
    const geo = this.geo, idx = this.idx, cov = this.cov, gx = this.gx, gy = this.gy;
    const R = o.radius, px = (2 * R) / n;
    for (let q = 0; q < idx.length; q++) {
      const g = q * 11;
      const nx = geo[g], ny = geo[g + 1], nz = geo[g + 2], row = geo[g + 3], lon0 = geo[g + 4];
      const tr = Math.min(TH - 1, Math.floor(row * TH));
      const sp = S.rowSpeed ? S.rowSpeed[tr] : 1;
      let u = (lon0 - rot * sp) / TAU + 0.5;
      u -= Math.floor(u);
      const tc = Math.min(TW - 1, Math.floor(u * TW));
      const t = tr * TW + tc;
      let r = S.color[t * 3], gg = S.color[t * 3 + 1], b = S.color[t * 3 + 2];
      if (o.emissive) {
        const k = (1 - limb * (1 - nz)) * bright;
        r *= k;
        gg *= k;
        b *= k;
      } else {
        // Relief: tilt the normal away from uphill.
        let mx = nx, my = ny, mz = nz;
        if (gx && gy) {
          const a = gx[t], c = gy[t];
          mx -= a * geo[g + 5] + c * geo[g + 8];
          my -= a * geo[g + 6] + c * geo[g + 9];
          mz -= a * geo[g + 7] + c * geo[g + 10];
          const ml = Math.hypot(mx, my, mz) || 1;
          mx /= ml;
          my /= ml;
          mz /= ml;
        }
        const dG = nx * Lx + ny * Ly + nz * Lz;
        const soft = dG < -0.05 ? 0 : dG > 0.12 ? 1 : ((dG + 0.05) / 0.17) ** 2 * (3 - (2 * (dG + 0.05)) / 0.17);
        let dif = mx * Lx + my * Ly + mz * Lz;
        dif = dif > 0 ? dif : 0;
        let lit = amb + (1 - amb) * dif * soft;
        if (o.shadow) lit *= 1 - o.shadow((((idx[q] % n) + 0.5) * px) - R, ((Math.floor(idx[q] / n) + 0.5) * px) - R);
        let cr = r * lit, cg = gg * lit, cb = b * lit;
        if (S.spec) {
          const h = mx * Hx + my * Hy + mz * Hz;
          if (h > 0.8) {
            const s = S.spec[t] * Math.pow(h, 60) * soft * 0.9;
            cr += s;
            cg += s;
            cb += s * 0.95;
          }
        }
        let cloudA = 0;
        if (C) {
          const cr2 = Math.min(C.h - 1, Math.floor(row * C.h));
          let cu = (lon0 - rot * C.speed * (C.rowSpeed ? C.rowSpeed[cr2] : 1)) / TAU + 0.5;
          cu -= Math.floor(cu);
          const ct = cr2 * C.w + Math.min(C.w - 1, Math.floor(cu * C.w));
          cloudA = Math.min(1, C.alpha[ct] * cover);
          if (cloudA > 0) {
            const cl = amb + (1 - amb) * (dG > 0 ? dG : 0) * soft;
            const col = C.rgb ? [C.rgb[ct * 3], C.rgb[ct * 3 + 1], C.rgb[ct * 3 + 2]] : C.color ?? [1, 1, 1];
            cr = cr * (1 - cloudA) + col[0] * cl * cloudA;
            cg = cg * (1 - cloudA) + col[1] * cl * cloudA;
            cb = cb * (1 - cloudA) + col[2] * cl * cloudA;
          }
        }
        if (S.night) {
          const dark = 1 - (dG < -0.15 ? 0 : dG > 0.05 ? 1 : (dG + 0.15) / 0.2);
          const e = S.night[t] * dark * (1 - cloudA * 0.8);
          cr += night[0] * e;
          cg += night[1] * e;
          cb += night[2] * e;
        }
        if (atm) {
          // Scattering toward the limb, on the lit side (and a little past the terminator).
          const rim = Math.pow(1 - nz, 2.2) * atm.strength * (dG < -0.3 ? 0 : dG > 0.25 ? 1 : (dG + 0.3) / 0.55);
          const haze = atm.strength * 0.12 * (dG > 0 ? dG : 0);
          cr = cr * (1 - rim * 0.5) + atm.color[0] * (rim + haze);
          cg = cg * (1 - rim * 0.5) + atm.color[1] * (rim + haze);
          cb = cb * (1 - rim * 0.5) + atm.color[2] * (rim + haze);
        }
        r = cr * bright;
        gg = cg * bright;
        b = cb * bright;
      }
      const p = idx[q] * 4;
      data[p] = r * 255;
      data[p + 1] = gg * 255;
      data[p + 2] = b * 255;
      data[p + 3] = cov[q] * 255;
    }
    this.canvas.getContext("2d")!.putImageData(this.img!, 0, 0);
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(this.canvas, -R, -R, 2 * R, 2 * R);
    context.restore();
    super.draw(context);
  }
}

// An empty map filled by fn(lat, lon, x, y, z) → [r, g, b] (degrees; x, y, z on the unit sphere with
// y = north), plus optional extra channels the function writes through `put`.
export function bakeMap(w: number, h: number, fn: (lat: number, lon: number, x: number, y: number, z: number, k: number) => [number, number, number]) {
  const color = new Float32Array(w * h * 3);
  for (let r = 0; r < h; r++) {
    const lat = 90 - ((r + 0.5) * 180) / h, la = (lat * Math.PI) / 180;
    for (let c = 0; c < w; c++) {
      const lon = -180 + ((c + 0.5) * 360) / w, lo = (lon * Math.PI) / 180;
      const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      const k = r * w + c;
      const v = fn(lat, lon, x, y, z, k);
      color[k * 3] = v[0];
      color[k * 3 + 1] = v[1];
      color[k * 3 + 2] = v[2];
    }
  }
  return color;
}
