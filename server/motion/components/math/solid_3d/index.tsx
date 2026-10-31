// Solid geometry in 3D: cube, rectangular prism, sphere, cylinder, cone, square pyramid, triangular
// prism, torus, icosahedron and dodecahedron — meshes turned by a camera, faces lit by a light
// (Lambert shading), painter's ordering, hidden edges dashed. A cutting plane can slide through
// (cross-section drawn in its own colour), the cube can unfold into its net, and the volume / surface
// formulas appear with the solid's dimensions.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  shape: "cube" | "box" | "sphere" | "cylinder" | "cone" | "pyramid" | "prism" | "torus" | "icosahedron" | "dodecahedron";
  wireframe: boolean;
  hiddenEdges: boolean;
  section: boolean;
  unfold: boolean;
  formula: boolean;
  labels: boolean;
}

type V3 = [number, number, number];
type Face = { v: number[]; c?: string };
const TAU = Math.PI * 2;

function mesh(shape: Props["shape"]): { V: V3[]; F: Face[]; edges?: [number, number][]; smooth?: boolean } {
  const V: V3[] = [], F: Face[] = [];
  if (shape === "cube" || shape === "box") {
    const [a, b, c] = shape === "cube" ? [1, 1, 1] : [1.4, 0.8, 0.9];
    for (const x of [-a, a]) for (const y of [-b, b]) for (const z of [-c, c]) V.push([x, y, z]);
    F.push({ v: [0, 1, 3, 2] }, { v: [4, 6, 7, 5] }, { v: [0, 4, 5, 1] }, { v: [2, 3, 7, 6] }, { v: [0, 2, 6, 4] }, { v: [1, 5, 7, 3] });
    return { V, F };
  }
  if (shape === "pyramid") {
    V.push([-1, 0.8, -1], [1, 0.8, -1], [1, 0.8, 1], [-1, 0.8, 1], [0, -1.1, 0]);
    F.push({ v: [0, 1, 2, 3] }, { v: [0, 4, 1] }, { v: [1, 4, 2] }, { v: [2, 4, 3] }, { v: [3, 4, 0] });
    return { V, F };
  }
  if (shape === "prism") {
    for (const z of [-1.2, 1.2]) V.push([-1, 0.7, z], [1, 0.7, z], [0, -1, z]);
    F.push({ v: [0, 1, 2] }, { v: [3, 5, 4] }, { v: [0, 3, 4, 1] }, { v: [1, 4, 5, 2] }, { v: [2, 5, 3, 0] });
    return { V, F };
  }
  if (shape === "icosahedron" || shape === "dodecahedron") {
    const P = (1 + Math.sqrt(5)) / 2;
    const ico: V3[] = [[-1, P, 0], [1, P, 0], [-1, -P, 0], [1, -P, 0], [0, -1, P], [0, 1, P], [0, -1, -P], [0, 1, -P], [P, 0, -1], [P, 0, 1], [-P, 0, -1], [-P, 0, 1]];
    const IF = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const nrm = (v: V3): V3 => {
      const l = Math.hypot(...v);
      return [(v[0] / l) * 1.3, (v[1] / l) * 1.3, (v[2] / l) * 1.3];
    };
    if (shape === "icosahedron") {
      ico.forEach((v) => V.push(nrm(v)));
      IF.forEach((f) => F.push({ v: f }));
      return { V, F };
    }
    // Dodecahedron = dual: one vertex per icosahedron face (centroid), one face per ico vertex.
    IF.forEach((f) => {
      const c: V3 = [0, 1, 2].map((a) => (ico[f[0]][a] + ico[f[1]][a] + ico[f[2]][a]) / 3) as V3;
      V.push(nrm(c));
    });
    for (let vi = 0; vi < 12; vi++) {
      const fs = IF.map((f, i) => [f, i] as [number[], number]).filter(([f]) => f.includes(vi)).map(([, i]) => i);
      // Order the five faces around the vertex.
      const c = nrm(ico[vi]);
      const ref = V[fs[0]];
      const ux: V3 = [ref[0] - c[0], ref[1] - c[1], ref[2] - c[2]];
      const uy: V3 = [c[1] * ux[2] - c[2] * ux[1], c[2] * ux[0] - c[0] * ux[2], c[0] * ux[1] - c[1] * ux[0]];
      fs.sort((a, b) => {
        const pa = V[a], pb = V[b];
        const aa = Math.atan2((pa[0] - c[0]) * uy[0] + (pa[1] - c[1]) * uy[1] + (pa[2] - c[2]) * uy[2], (pa[0] - c[0]) * ux[0] + (pa[1] - c[1]) * ux[1] + (pa[2] - c[2]) * ux[2]);
        const ab = Math.atan2((pb[0] - c[0]) * uy[0] + (pb[1] - c[1]) * uy[1] + (pb[2] - c[2]) * uy[2], (pb[0] - c[0]) * ux[0] + (pb[1] - c[1]) * ux[1] + (pb[2] - c[2]) * ux[2]);
        return aa - ab;
      });
      F.push({ v: fs });
    }
    return { V, F };
  }
  // Surfaces of revolution / parametric (smooth shading, no edge lines except silhouettes).
  const nu = 36, nv = shape === "torus" ? 18 : 14;
  const pt = (u: number, v: number): V3 => {
    const a = u * TAU;
    if (shape === "sphere") {
      const ph = v * Math.PI;
      return [Math.sin(ph) * Math.cos(a) * 1.2, -Math.cos(ph) * 1.2, Math.sin(ph) * Math.sin(a) * 1.2];
    }
    if (shape === "cylinder") return [Math.cos(a), -1.1 + v * 2.2, Math.sin(a)];
    if (shape === "cone") return [Math.cos(a) * v * 1.05, -1.1 + v * 2.2, Math.sin(a) * v * 1.05];
    const R = 1, r = 0.42, b = v * TAU;
    return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)];
  };
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) V.push(pt(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) F.push({ v: [j * nu + i, j * nu + ((i + 1) % nu), (j + 1) * nu + ((i + 1) % nu), (j + 1) * nu + i] });
  if (shape === "cylinder" || shape === "cone") {
    // Caps.
    const top = V.length;
    V.push([0, 1.1, 0]);
    for (let i = 0; i < nu; i++) F.push({ v: [nv * nu + i, nv * nu + ((i + 1) % nu), top] });
    if (shape === "cylinder") {
      const bot = V.length;
      V.push([0, -1.1, 0]);
      for (let i = 0; i < nu; i++) F.push({ v: [((i + 1) % nu), i, bot] });
    }
  }
  return { V, F, smooth: true };
}

const FORMULA: Record<string, [string, string]> = {
  cube: ["V = a³", "S = 6a²"],
  box: ["V = a·b·c", "S = 2(ab + bc + ca)"],
  sphere: ["V = 4/3·πr³", "S = 4πr²"],
  cylinder: ["V = πr²h", "S = 2πr(r + h)"],
  cone: ["V = 1/3·πr²h", "S = πr(r + l)"],
  pyramid: ["V = 1/3·S_đáy·h", "S = S_đáy + S_xung quanh"],
  prism: ["V = S_đáy·h", "S = 2S_đáy + chu vi·h"],
  torus: ["V = 2π²Rr²", "S = 4π²Rr"],
  icosahedron: ["20 mặt tam giác đều", "12 đỉnh · 30 cạnh"],
  dodecahedron: ["12 mặt ngũ giác đều", "20 đỉnh · 30 cạnh"],
};
const NAME: Record<string, string> = { cube: "Hình lập phương", box: "Hình hộp chữ nhật", sphere: "Hình cầu", cylinder: "Hình trụ", cone: "Hình nón", pyramid: "Hình chóp tứ giác", prism: "Hình lăng trụ tam giác", torus: "Hình xuyến", icosahedron: "Khối 20 mặt đều", dodecahedron: "Khối 12 mặt đều" };

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "mathematics", "geometry");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const M = mesh(p.shape);
    const side = p.formula && A.wide;
    const cx = A.x + (side ? A.w * 0.4 : A.w / 2), cy = A.cy + (side ? 0 : -A.h * 0.05);
    const S = Math.min(side ? A.w * 0.22 : A.w * 0.3, A.h * 0.3);
    const yaw = () => clock() * 0.5 * st.speed + 0.6, pitch = 0.42;
    const rot = (v: V3): V3 => {
      const a = yaw(), c = Math.cos(a), s = Math.sin(a);
      const x = v[0] * c + v[2] * s, z = -v[0] * s + v[2] * c;
      return [x, v[1] * Math.cos(pitch) - z * Math.sin(pitch), v[1] * Math.sin(pitch) + z * Math.cos(pitch)];
    };
    const proj = (v: V3): [number, number] => {
      const f = 5 / (5 - v[2]);
      return [cx + v[0] * S * f, cy + v[1] * S * f];
    };
    const light: V3 = (() => {
      const l: V3 = [-0.5, -0.7, 0.6];
      const n = Math.hypot(...l);
      return [l[0] / n, l[1] / n, l[2] / n];
    })();
    const secY = createSignal(-2); // cutting plane height (world y), slides through
    const unfoldU = createSignal(0);
    const base = L.primary, edge = mix(L.primary, "#FFFFFF", 0.6);

    const paint = (g: CanvasRenderingContext2D) => {
      if (p.unfold && p.shape === "cube" && unfoldU() > 0) return;
      const R = M.V.map(rot);
      const P2 = R.map(proj);
      const faces = M.F.map((f) => {
        const vs = f.v.map((i) => R[i]);
        const c: V3 = [0, 1, 2].map((a) => vs.reduce((s, v) => s + v[a], 0) / vs.length) as V3;
        // Normal from the first three vertices (sign fixed to point away from the centre).
        const a = vs[0], b = vs[1], d = vs[2];
        let n: V3 = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
        const nl = Math.hypot(...n) || 1;
        n = [n[0] / nl, n[1] / nl, n[2] / nl];
        const rc = p.shape === "torus" ? c : [0, 0, 0];
        if ((c[0] - (rc as V3)[0]) * n[0] + (c[1] - (rc as V3)[1]) * n[1] + (c[2] - (rc as V3)[2]) * n[2] < 0 && p.shape !== "torus") n = [-n[0], -n[1], -n[2]];
        return { f, vs, c, n };
      });
      faces.sort((a, b) => a.c[2] - b.c[2]);
      // Hidden edges (dashed), drawn first so faces cover them where solid.
      if (p.hiddenEdges && !M.smooth) {
        g.setLineDash([7 * k, 7 * k]);
        g.strokeStyle = alpha(edge, 0.55);
        g.lineWidth = 2 * k;
        for (const fc of faces) {
          if (fc.n[2] > 0) continue;
          g.beginPath();
          fc.f.v.forEach((i, j) => (j ? g.lineTo(...P2[i]) : g.moveTo(...P2[i])));
          g.closePath();
          g.stroke();
        }
        g.setLineDash([]);
      }
      for (const fc of faces) {
        const front = fc.n[2] > 0 || p.shape === "torus";
        if (!front && !p.wireframe) continue;
        const lit = clamp(0.25 + 0.75 * Math.max(0, fc.n[0] * light[0] + fc.n[1] * light[1] + fc.n[2] * light[2]), 0, 1);
        g.beginPath();
        fc.f.v.forEach((i, j) => (j ? g.lineTo(...P2[i]) : g.moveTo(...P2[i])));
        g.closePath();
        if (!p.wireframe) {
          g.fillStyle = mix(mix(base, "#000000", 0.55), mix(base, "#FFFFFF", 0.3), lit);
          g.globalAlpha = L.visual.fill * (p.section ? 0.55 : 0.95);
          g.fill();
          g.globalAlpha = 1;
        }
        if (!M.smooth || p.wireframe) {
          g.strokeStyle = alpha(edge, front ? 0.95 : 0.3);
          g.lineWidth = (M.smooth ? 1 : 2.5) * k;
          g.stroke();
        }
      }
      // Cross-section: intersect every face edge with the plane y = secY (world) → polygon.
      if (p.section && secY() > -1.9) {
        const yP = secY();
        const pts: V3[] = [];
        const E = new Set<string>();
        for (const f of M.F)
          for (let j = 0; j < f.v.length; j++) {
            const a = f.v[j], b = f.v[(j + 1) % f.v.length];
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (E.has(key)) continue;
            E.add(key);
            const va = M.V[a], vb = M.V[b];
            if ((va[1] - yP) * (vb[1] - yP) < 0) {
              const t = (yP - va[1]) / (vb[1] - va[1]);
              pts.push([va[0] + (vb[0] - va[0]) * t, yP, va[2] + (vb[2] - va[2]) * t]);
            }
          }
        if (pts.length >= 3) {
          const cxs = pts.reduce((s, v) => s + v[0], 0) / pts.length, czs = pts.reduce((s, v) => s + v[2], 0) / pts.length;
          pts.sort((a, b) => Math.atan2(a[2] - czs, a[0] - cxs) - Math.atan2(b[2] - czs, b[0] - cxs));
          g.fillStyle = alpha(L.accent, 0.7);
          g.strokeStyle = L.accent;
          g.lineWidth = 3 * k;
          g.beginPath();
          pts.map((v) => proj(rot(v))).forEach((q, j) => (j ? g.lineTo(...q) : g.moveTo(...q)));
          g.closePath();
          g.fill();
          g.stroke();
        }
        // Plane outline.
        const sq: V3[] = [[-1.8, yP, -1.8], [1.8, yP, -1.8], [1.8, yP, 1.8], [-1.8, yP, 1.8]];
        g.strokeStyle = alpha(L.accent, 0.5);
        g.lineWidth = 2 * k;
        g.beginPath();
        sq.map((v) => proj(rot(v))).forEach((q, j) => (j ? g.lineTo(...q) : g.moveTo(...q)));
        g.closePath();
        g.stroke();
      }
    };

    // Cube net: six squares unfolding from the cube (2D cross shape) as u goes 0 → 1.
    const netPaint = (g: CanvasRenderingContext2D) => {
      if (!(p.unfold && p.shape === "cube") || unfoldU() <= 0) return;
      const u = smooth(unfoldU()), s = S * 0.75;
      const cells: [number, number][] = [[0, 0], [-1, 0], [1, 0], [2, 0], [0, -1], [0, 1]];
      cells.forEach(([i, j], n) => {
        const x = cx + i * s * u - s / 2, y = cy + j * s * u - s / 2;
        g.fillStyle = mix(base, "#FFFFFF", 0.1 + n * 0.05);
        g.globalAlpha = 0.9;
        g.fillRect(x, y, s, s);
        g.globalAlpha = 1;
        g.strokeStyle = edge;
        g.lineWidth = 3 * k;
        g.strokeRect(x, y, s, s);
      });
    };

    const fRef = createRef<Node>();
    const [f1, f2] = FORMULA[p.shape];
    const fx = side ? A.x + A.w * 0.72 : A.cx, fy = side ? A.cy - 40 * k : A.y + A.h - 70 * k;
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          <Draw paint={paint} />
          <Draw paint={netPaint} />
        </Node>
        {p.formula ? (
          <Node ref={fRef} opacity={0}>
            <Txt text={NAME[p.shape]} x={fx} y={fy - 60 * k} fontFamily={FONT} fontWeight={800} fontSize={34 * k} fill={L.text} />
            <Txt text={f1} x={fx} y={fy} fontFamily={FONT} fontWeight={800} fontSize={40 * k} fill={L.accent} />
            <Txt text={f2} x={fx} y={fy + 54 * k} fontFamily={FONT} fontWeight={700} fontSize={32 * k} fill={L.secondary} />
          </Node>
        ) : null}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );
    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.7, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = [];
    if (p.formula) steps.push(() => fRef().opacity(1, 0.6));
    if (p.section)
      steps.push(function* () {
        secY(-1.6);
        yield* secY(1.5, Math.max(2, D * 0.45), easeInOutCubic);
      });
    if (p.unfold && p.shape === "cube") steps.push(() => unfoldU(1, 1.6, easeInOutCubic));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void Line;
    void Rect;
  },
});
