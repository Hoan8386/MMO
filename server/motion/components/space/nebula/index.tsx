// Nebulae as layered gas and stars: emission (hydrogen-alpha red with ionised-oxygen teal near the hot
// stars), reflection (blue dust lit by bright stars), dark (a cold dust cloud blotting out the stars
// behind), planetary (a shell blown off a dying star around its white dwarf — ring or bipolar),
// supernova remnant (a filamentary shock shell expanding around a pulsar) and star-forming pillars
// (dust columns rimmed bright by the young stars above them). Gas is computed once per clip
// (domain-warped fractal noise); motion comes from parallax between star layers and the gas, the
// slow expansion of shells, and twinkling stars.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster } from "../../../shared/raster";
import { makeNoise, smoothstep } from "../../../shared/noise";
import { FONT, label, fitX } from "../../../shared/ui";
import { until, rng, clamp } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  kind: "emission" | "reflection" | "dark" | "planetary" | "supernova_remnant" | "pillars";
  colors: "natural" | "hubble";
  shape: "ring" | "bipolar";
  density: number;
  starCount: number;
  labels: boolean;
}

const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "stars_galaxies");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const N = makeNoise(L.seed + 11);
    const R0 = rng(L.seed + 23);
    const shell = p.kind === "planetary" || p.kind === "supernova_remnant";
    // Gas area: the whole drawing area for clouds; a centred square for shells.
    const GW = shell ? Math.min(A.w, A.h) * 0.92 : A.w, GH = shell ? GW : A.h;
    const cx = A.cx, cy = A.cy;
    const hub = p.colors === "hubble";
    // Emission colours: Hα red, [OIII] teal, [SII] orange (Hubble palette maps them to G/B/R).
    const HA = hub ? [0.35, 0.9, 0.45] : [1.0, 0.3, 0.42];
    const O3 = hub ? [0.25, 0.6, 1.0] : [0.25, 0.85, 0.82];
    const S2 = hub ? [1.0, 0.65, 0.25] : [1.0, 0.45, 0.3];

    // ---- gas, computed once (aspect-correct coordinates: x in −1…1, y scaled).
    const res = Math.round(560 * (0.55 + 0.45 * q));
    const asp = GH / GW;
    const gasPaint = (data: Uint8ClampedArray, cols: number, rows: number) => {
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x = ((i + 0.5) / cols) * 2 - 1, y = (((j + 0.5) / rows) * 2 - 1) * asp;
          // Domain warp: noise displaced by noise gives billowing, filamentary clouds.
          const wx = N.fbm(x * 1.6 + 3, y * 1.6, 0.5, 4), wy = N.fbm(x * 1.6, y * 1.6 + 7, 1.5, 4);
          const n = N.fbm(x * 2.2 + wx * 1.8, y * 2.2 + wy * 1.8, 2.5, 6);
          const fil = N.ridge(x * 3 + wx * 2, y * 3 + wy * 2, 4.5, 4);
          let R = 0, G = 0, B = 0, Aa = 0;
          const dens = p.density;
          if (p.kind === "emission" || p.kind === "pillars") {
            const r = Math.hypot(x * 0.9, (y + (p.kind === "pillars" ? 0.5 * asp : 0)) * 1.1);
            const ha = smoothstep(0.35, 0.8, n * dens + 0.15 - r * 0.25) * (0.6 + 0.6 * fil);
            const o3 = smoothstep(0.45, 0.8, n * dens + 0.4 - r * 0.9) * 0.9;
            const s2 = smoothstep(0.75, 0.95, fil) * ha * 0.6;
            R = HA[0] * ha + O3[0] * o3 + S2[0] * s2;
            G = HA[1] * ha + O3[1] * o3 + S2[1] * s2;
            B = HA[2] * ha + O3[2] * o3 + S2[2] * s2;
            Aa = clamp(Math.max(ha, o3) * 0.95, 0, 1);
            // Dark dust lanes.
            const dust = smoothstep(0.55, 0.72, N.fbm(x * 3 + 9 + wx, y * 3 + wy, 6, 5)) * 0.85;
            if (p.kind === "pillars") {
              // Three columns rising from the bottom, narrowing upward, lit along their tops.
              let m = 0, rim = 0;
              const cols3 = [[-0.45, 0.17, 0.2], [0.05, 0.12, 0.35], [0.42, 0.09, 0.55]];
              for (const [px, wd, top] of cols3) {
                const yy = y / asp; // −1 top … 1 bottom
                const h = clamp((yy - (top - 0.05) * 1) / 1.2, 0, 1);
                const wobble = (N.fbm(yy * 4 + px * 10, px * 5, 3, 3) - 0.5) * 0.12;
                const d = Math.abs(x - px - wobble) / (wd * (0.55 + 0.6 * h));
                const body = (1 - smoothstep(0.75, 1.0, d)) * smoothstep(top - 0.12, top + 0.05, yy) * (0.85 + 0.15 * fil);
                m = Math.max(m, body);
                // Rim: the edge of the column (and its cap) facing up toward the stars.
                rim = Math.max(rim, Math.exp(-(((d - 0.85) / 0.12) ** 2)) * smoothstep(top - 0.1, top + 0.1, yy) * (1 - h * 0.6) + Math.exp(-(((yy - top) / 0.04) ** 2)) * (d < 1 ? 1 : 0));
              }
              const mm = clamp(m, 0, 1);
              R = R * (1 - mm) + mm * 0.16 + rim * 1.0 * mm;
              G = G * (1 - mm) + mm * 0.09 + rim * 0.7 * mm;
              B = B * (1 - mm) + mm * 0.06 + rim * 0.5 * mm;
              Aa = Math.max(Aa, mm * 0.97);
            } else {
              R *= 1 - dust;
              G *= 1 - dust;
              B *= 1 - dust;
              Aa = Math.max(Aa * (1 - dust * 0.3), dust * 0.55 * smoothstep(0.2, 0.6, n));
            }
          } else if (p.kind === "reflection") {
            const r = Math.hypot(x, y);
            const v = smoothstep(0.3, 0.85, n * dens + 0.25 - r * 0.35) * (0.5 + 0.5 * fil);
            R = v * 0.35;
            G = v * 0.6;
            B = v * 1.0;
            Aa = v * 0.85;
          } else if (p.kind === "dark") {
            // A dark cloud in front of faint glowing gas (shapes from the same noise).
            const back = smoothstep(0.35, 0.75, N.fbm(x * 1.4 + 20, y * 1.4, 8, 5)) * 0.6;
            const cloud = smoothstep(0.48, 0.6, n * dens + 0.12 - Math.abs(y) * 0.2);
            R = HA[0] * back * (1 - cloud) + 0.04 * cloud;
            G = HA[1] * back * (1 - cloud) + 0.03 * cloud;
            B = HA[2] * back * (1 - cloud) + 0.03 * cloud;
            Aa = Math.max(back * 0.8, cloud * 0.98);
          } else if (p.kind === "planetary") {
            const rr = p.shape === "bipolar" ? Math.hypot(x / (0.55 + 1.3 * Math.abs(y)), y * 0.62) : Math.hypot(x, y * 1.15);
            const sh = Math.exp(-(((rr - 0.55) / 0.13) ** 2));
            const inner = smoothstep(0.62, 0.2, rr);
            const knots = smoothstep(0.65, 0.85, N.fbm(Math.atan2(y, x) * 4 + 9, rr * 6, 3, 3)) * sh;
            R = HA[0] * (sh * 0.9 + knots * 0.6) + O3[0] * inner * 0.8;
            G = HA[1] * (sh * 0.9 + knots * 0.4) + O3[1] * inner * 0.8;
            B = HA[2] * (sh * 0.9 + knots * 0.4) + O3[2] * inner * 0.9;
            Aa = clamp(sh * (0.7 + 0.4 * fil) + inner * 0.55 + knots * 0.3, 0, 1) * smoothstep(1.0, 0.75, rr);
          } else {
            // Supernova remnant: shock filaments in a thick shell, synchrotron glow inside.
            const r = Math.hypot(x, y) + (wx - 0.5) * 0.18;
            const shellM = smoothstep(0.55, 0.72, r) * smoothstep(0.98, 0.84, r);
            const f = smoothstep(0.7, 0.9, fil) * shellM;
            const sync = smoothstep(0.65, 0.0, r) * (0.5 + 0.5 * n);
            R = f * HA[0] * 1.1 + S2[0] * f * 0.4 + sync * 0.55;
            G = f * HA[1] * 0.9 + S2[1] * f * 0.3 + sync * 0.7;
            B = f * HA[2] * 0.9 + sync * 1.0;
            Aa = clamp(f + sync * 0.6, 0, 1);
          }
          const o = (j * cols + i) * 4;
          data[o] = clamp(R, 0, 1) * 255;
          data[o + 1] = clamp(G, 0, 1) * 255;
          data[o + 2] = clamp(B, 0, 1) * 255;
          data[o + 3] = clamp(Aa, 0, 1) * 255;
        }
    };

    // ---- stars: background (behind the gas), embedded and foreground layers, parallax with time.
    const mk = (n: number, near: number) =>
      Array.from({ length: Math.round(n * (0.4 + 0.6 * q)) }, () => ({ x: R0(), y: R0(), s: (0.6 + R0() * 1.6) * (1 + near), ph: R0() * TAU, c: ["#FFFFFF", "#CFE3FF", "#FFE6C4", "#A6C8FF"][Math.floor(R0() * 4)], b: 0.3 + R0() * 0.6 }));
    const back = mk(p.kind === "dark" ? p.starCount * 3 : p.starCount * 1.4, 0);
    const front = mk(p.starCount * 0.25, 0.8);
    // Bright stars: the ionising/illuminating stars, with diffraction spikes.
    const bright = p.kind === "reflection" ? [[-0.15, -0.1], [0.2, 0.08], [0.05, -0.3], [-0.3, 0.22], [0.35, -0.2]] : p.kind === "emission" ? [[0.02, 0.02], [-0.08, 0.1], [0.1, -0.05]] : p.kind === "pillars" ? [[0.0, -0.85], [-0.3, -0.75], [0.35, -0.9]] : [];
    const drift = (near: number) => clock() * (6 + near * 22) * k * st.speed;
    const starPaint = (layer: typeof back, near: number) => (g: CanvasRenderingContext2D) => {
      const t = clock();
      g.globalCompositeOperation = "lighter";
      const W = A.w + 80 * k, H = A.h;
      for (const s of layer) {
        const x = A.x - 40 * k + ((((s.x * W - drift(near)) % W) + W) % W), y = A.y + s.y * H;
        g.globalAlpha = s.b * (0.75 + 0.25 * Math.sin(t * 2 + s.ph));
        g.fillStyle = s.c;
        g.beginPath();
        g.arc(x, y, s.s * k, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    const brightPaint = (g: CanvasRenderingContext2D) => {
      const t = clock();
      g.globalCompositeOperation = "lighter";
      for (const [bx, by] of bright) {
        const x = cx + bx * GW * 0.5 - drift(0.4), y = cy + by * GH * 0.5;
        const pulse = 1 + 0.08 * Math.sin(t * 3 + bx * 10);
        const gr = g.createRadialGradient(x, y, 0, x, y, 46 * k * pulse);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.15, "rgba(200,225,255,0.6)");
        gr.addColorStop(1, "rgba(160,200,255,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, 46 * k * pulse, 0, TAU);
        g.fill();
        if (L.visual.glow > 0.3) {
          g.strokeStyle = "rgba(220,235,255,0.5)";
          g.lineWidth = 1.5 * k;
          g.beginPath();
          g.moveTo(x - 70 * k * pulse, y);
          g.lineTo(x + 70 * k * pulse, y);
          g.moveTo(x, y - 70 * k * pulse);
          g.lineTo(x, y + 70 * k * pulse);
          g.stroke();
        }
      }
      // The central star of a shell: white dwarf (planetary) or a pulsar's flashes (remnant).
      if (shell) {
        const pul = p.kind === "supernova_remnant" ? Math.pow(Math.max(0, Math.sin(t * 9)), 12) : 0.6 + 0.1 * Math.sin(t * 2);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 30 * k);
        gr.addColorStop(0, `rgba(255,255,255,${0.5 + 0.5 * pul})`);
        gr.addColorStop(1, "rgba(180,210,255,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, 30 * k, 0, TAU);
        g.fill();
      }
    };

    // Shells expand slowly; clouds drift and breathe.
    const expand = () => (shell ? 0.93 + 0.1 * (clock() / D) : 1.04 + 0.02 * Math.sin((clock() / D) * Math.PI));
    const gasX = () => cx - (shell ? 0 : drift(0.35));

    // ---- labels.
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callNodes: Node[] = [];
    const call = (at: [number, number], to0: [number, number], text: string) => {
      const s = createSignal(0);
      const to: [number, number] = [fitX(ctx, to0[0], text, 26, to0[0] >= at[0]), to0[1]];
      shows.push(s);
      callNodes.push(
        <Node opacity={s}>
          <Line points={[at, to]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Rect position={at} size={10 * k} radius={5 * k} fill={L.ink} />
          <Txt text={text} x={to[0] + (to[0] >= at[0] ? 10 : -10) * k} y={to[1]} offsetX={to[0] >= at[0] ? -1 : 1} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={L.text} shadowColor="rgba(0,0,0,0.9)" shadowBlur={10 * k} />
        </Node>,
      );
    };
    if (p.labels) {
      const R2 = Math.min(GW, GH) * 0.5;
      const lx = A.x + A.w * 0.08, rx = A.x + A.w * 0.92;
      if (p.kind === "emission") {
        call([cx - R2 * 0.4, cy - R2 * 0.25], [lx, A.y + 50 * k], "Hydro ion hoá phát sáng đỏ (Hα)");
        call([cx + R2 * 0.05, cy + R2 * 0.05], [rx, A.y + 50 * k], "Oxy ion hoá (xanh lục lam) quanh sao nóng");
        call([cx + R2 * 0.4, cy + R2 * 0.35], [rx, A.y + A.h - 40 * k], "Dải bụi che ánh sáng");
      } else if (p.kind === "pillars") {
        call([cx + 0.05 * GW * 0.5, cy + 0.2 * GH * 0.5], [rx, cy], "Cột khí và bụi lạnh — nơi sao hình thành");
        call([cx, cy - 0.85 * GH * 0.5], [rx, A.y + 40 * k], "Sao trẻ nóng thổi mòn đỉnh cột");
      } else if (p.kind === "reflection") call([cx - 0.15 * GW * 0.5, cy - 0.1 * GH * 0.5], [rx, A.y + 50 * k], "Bụi phản xạ ánh sáng xanh của sao sáng");
      else if (p.kind === "dark") call([cx, cy], [rx, A.y + 50 * k], "Đám mây bụi lạnh che khuất sao phía sau");
      else if (p.kind === "planetary") {
        call([cx + R2 * 0.55, cy - R2 * 0.1], [rx, A.y + 50 * k], "Lớp khí ngôi sao đã thổi ra");
        call([cx, cy], [lx, A.y + A.h - 40 * k], "Sao lùn trắng ở tâm");
      } else {
        call([cx + R2 * 0.8, cy + R2 * 0.2], [rx, A.y + 50 * k], "Sóng xung kích — sợi khí nóng");
        call([cx, cy], [lx, A.y + A.h - 40 * k], "Sao xung (pulsar) còn lại");
      }
    }

    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          <Draw paint={starPaint(back, 0)} />
          <Node x={gasX} y={cy} scale={expand}>
            <Raster w={GW * 1.05} h={GH * 1.05} res={res} once paint={gasPaint} />
          </Node>
          <Draw paint={brightPaint} />
          <Draw paint={starPaint(front, 0.8)} />
          {callNodes}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 1.2, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length));
      yield steps[i]();
    }
  },
});
