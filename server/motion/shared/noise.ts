// Seeded 3D value noise and its fractal sums, for procedural surfaces (planets, gas, terrain, tissue).
// Sampling 3D noise at a point of the unit sphere gives a texture without seams or pinched poles.
export interface Noise {
  // Smooth noise in [0, 1].
  n3(x: number, y: number, z: number): number;
  // Fractal sum of `oct` octaves, in [0, 1].
  fbm(x: number, y: number, z: number, oct?: number, lac?: number, gain?: number): number;
  // Ridged fractal (sharp crests: cracks, mountain chains, filaments), in [0, 1].
  ridge(x: number, y: number, z: number, oct?: number): number;
}

export function makeNoise(seed = 1): Noise {
  // Permutation table shuffled by a seeded generator.
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rnd();
  const h = (i: number, j: number, k: number) => vals[perm[perm[perm[i & 255] + (j & 255)] + (k & 255)]];
  const f = (t: number) => t * t * (3 - 2 * t);
  const n3 = (x: number, y: number, z: number) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const u = f(x - i), v = f(y - j), w = f(z - k);
    const x00 = h(i, j, k) + (h(i + 1, j, k) - h(i, j, k)) * u;
    const x10 = h(i, j + 1, k) + (h(i + 1, j + 1, k) - h(i, j + 1, k)) * u;
    const x01 = h(i, j, k + 1) + (h(i + 1, j, k + 1) - h(i, j, k + 1)) * u;
    const x11 = h(i, j + 1, k + 1) + (h(i + 1, j + 1, k + 1) - h(i, j + 1, k + 1)) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
  const fbm = (x: number, y: number, z: number, oct = 5, lac = 2, gain = 0.5) => {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * n3(x, y, z);
      norm += amp;
      amp *= gain;
      x *= lac;
      y *= lac;
      z *= lac;
    }
    return s / norm;
  };
  const ridge = (x: number, y: number, z: number, oct = 4) => {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const r = 1 - Math.abs(2 * n3(x, y, z) - 1);
      s += amp * r * r;
      norm += amp;
      amp *= 0.5;
      x *= 2.1;
      y *= 2.1;
      z *= 2.1;
    }
    return s / norm;
  };
  return { n3, fbm, ridge };
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Linear mix of two RGB triples (0–1).
export const mixRGB = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// "#RRGGBB" → [r, g, b] in 0–1.
export const rgb1 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
