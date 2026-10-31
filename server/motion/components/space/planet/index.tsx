// A planet or moon as a lit, turning globe: procedural surface around its real features (Earth's real
// continents, Mars' volcanoes and canyon, Jupiter's bands and Great Red Spot…), cloud layer, night
// lights, atmospheric limb, ring system with the planet's shadow on the rings and the rings' shadow on
// the planet, moons on their orbits (real period ratios), surface callouts that follow the rotation,
// a fact panel, and a cut-away view of the interior layers.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeOutCubic, linear, type SimpleSignal, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw, Raster, rgb } from "../../../shared/raster";
import { Sphere, bodyFrame } from "../../../shared/sphere";
import { rgb1 } from "../../../shared/noise";
import { FONT, label } from "../../../shared/ui";
import { starfield } from "../../../shared/fx";
import { until, clamp, rng } from "../../../shared/time";
import { fadeUp } from "../../../transitions";
import { BODIES, ORBITS, type Body, type RingBand } from "./bodies";

interface Marker {
  lat: number;
  lon: number;
  label: string;
}

interface Props {
  title: string;
  body: string;
  view: "globe" | "cross_section";
  clouds: boolean;
  atmosphere: boolean;
  nightLights: boolean;
  rings: boolean;
  moons: boolean;
  dustStorm: boolean;
  plumes: boolean;
  labels: boolean;
  facts: boolean;
  markers: Marker[];
  sunAngle: number;
  spin: number;
  viewLat: number;
  realTilt: boolean;
  stars: boolean;
}

type V3 = [number, number, number];
const rad = Math.PI / 180;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Opacity and colour of a ring system at radius r (body radii): bands + fine ringlets.
function ringProfile(bands: RingBand[], seed: number) {
  const N = 900, r0 = 1, r1 = Math.max(...bands.map((b) => b.r1)) + 0.02;
  const a = new Float32Array(N), c = new Float32Array(N * 3);
  const rnd = rng(seed);
  const ripple = Array.from({ length: 60 }, () => [rnd() * 400 + 40, rnd() * 6.28, rnd() * 0.35]);
  for (let i = 0; i < N; i++) {
    const r = r0 + ((i + 0.5) / N) * (r1 - r0);
    const b = bands.find((x) => r >= x.r0 && r < x.r1);
    if (!b) continue;
    let fine = 1;
    for (const [f, ph, amp] of ripple) fine += amp * Math.sin(r * f + ph) * 0.12;
    a[i] = clamp(b.a * fine, 0, 1);
    const col = rgb1(b.color), v = 0.9 + 0.2 * Math.sin(r * 97 + 1.3);
    c.set([col[0] * v, col[1] * v, col[2] * v], i * 3);
  }
  return { at: (r: number) => (r < r0 || r >= r1 ? -1 : Math.floor(((r - r0) / (r1 - r0)) * N)), a, c, r1 };
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const B: Body = BODIES[p.body] ?? BODIES.earth;
    const L = look(ctx, "astronomy", "solar_system");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;

    // ---- layout: the globe, rings/moons around it, the fact panel beside (wide) or under (tall).
    const hasRings = p.rings && !!B.rings;
    const moonIds = p.moons ? (B.moons ?? []).filter((m) => ORBITS[m]) : [];
    const reach = Math.max(1.12, hasRings ? Math.max(...B.rings!.map((r) => r.r1)) + 0.05 : 0, ...moonIds.map((m) => ORBITS[m].r + ORBITS[m].size + 0.1));
    const panel = p.facts ? (A.wide ? "side" : "below") : "none";
    const PW = panel === "side" ? Math.min(560 * k, A.w * 0.34) : 0;
    const PH = panel === "below" ? Math.min(B.facts.length * 54 * k + 90 * k, A.h * 0.34) : 0;
    const gw = A.w - PW, gh = A.h - PH;
    // Space for callouts beside the globe.
    const side = p.labels ? 1.32 : 1;
    const R = Math.min(gw / (2 * reach * side), gh / (2 * Math.max(1.12, reach * (hasRings ? 0.55 : 1))), 400 * k) * 0.94;
    const cx = A.x + gw / 2, cy = A.y + gh / 2;

    // ---- geometry of the body: tilt, view latitude, light.
    const tilt = (p.realTilt ? (B.tilt > 90 ? B.tilt - 180 : B.tilt) : 0) * rad;
    const pitch = -p.viewLat * rad;
    const F = bodyFrame(tilt, pitch);
    const sa = p.sunAngle * rad;
    const Lv: V3 = (() => {
      const v: V3 = [-Math.sin(sa), -0.12, Math.cos(sa)];
      const n = Math.hypot(...v);
      return [v[0] / n, v[1] / n, v[2] / n];
    })();
    const omega = (B.spinVis * p.spin * st.speed * Math.PI * 2) / 10;
    // Start so that the first feature (or marker) faces the viewer when its callout appears.
    const first = p.markers[0] ?? (B.features[0] ? { lat: B.features[0][0], lon: B.features[0][1] } : { lat: 0, lon: 0 });
    const tFirst = ctx.cue(0, Math.max(1, (p.markers.length || B.features.length) + 1));
    const rot0 = -first.lon * rad - omega * tFirst - 0.25 * Math.sign(p.sunAngle || 1);
    const rot = () => rot0 + omega * clock();

    // ---- maps.
    const tw = Math.round((B.id === "earth" ? 640 : 512) * (q < 0.6 ? 0.5 : q < 0.9 ? 0.75 : 1) / 2) * 2;
    const maps = B.bake(tw, L.seed);
    const cloudLayer = p.dustStorm && maps.storm ? maps.storm : p.clouds ? maps.clouds : undefined;
    const stormGrow = createSignal(p.dustStorm && maps.storm ? 0 : 1);

    // ---- rings: two cached rasters (behind / in front of the globe), planet shadow included.
    const ringNodes: Node[] = [];
    let ringShadow: ((x: number, y: number) => number) | undefined;
    if (hasRings) {
      const prof = ringProfile(B.rings!, L.seed);
      const ext = prof.r1 * R;
      const up = F.up;
      const lit = 0.6 + 0.4 * Math.abs(dot(up, Lv));
      const paint = (front: boolean) => (data: Uint8ClampedArray, cols: number, rows: number) => {
        if (Math.abs(up[2]) < 0.015) return;
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const X = (((i + 0.5) / cols) * 2 - 1) * prof.r1, Y = (((j + 0.5) / rows) * 2 - 1) * prof.r1;
            const Z = -(up[0] * X + up[1] * Y) / up[2];
            if (Z >= 0 !== front) continue;
            const r = Math.hypot(X, Y, Z);
            const ix = prof.at(r);
            if (ix < 0 || prof.a[ix] <= 0) continue;
            // In the planet's shadow: on the far side from the light, within one radius of the axis.
            const pl = X * Lv[0] + Y * Lv[1] + Z * Lv[2];
            // Soft-edged (penumbra) for a less cut-out look.
            const shade = pl < 0 ? 0.22 + 0.78 * Math.min(1, Math.max(0, (r * r - pl * pl - 0.92) / 0.14)) : 1;
            const o = (j * cols + i) * 4;
            data[o] = prof.c[ix * 3] * 255 * lit * shade;
            data[o + 1] = prof.c[ix * 3 + 1] * 255 * lit * shade;
            data[o + 2] = prof.c[ix * 3 + 2] * 255 * lit * shade;
            data[o + 3] = prof.a[ix] * 255 * (shade < 1 ? 0.85 : 1);
          }
      };
      const res = Math.round(Math.min(900, ext * 2) * (0.5 + 0.5 * q));
      ringNodes.push(<Raster w={ext * 2} h={ext * 2} res={res} once paint={paint(false)} zIndex={-3} />, <Raster w={ext * 2} h={ext * 2} res={res} once paint={paint(true)} zIndex={1} />);
      // Shadow of the rings on the globe: follow the ray from the surface toward the light to the ring plane.
      const uL = dot(up, Lv);
      if (Math.abs(uL) > 0.02)
        ringShadow = (x, y) => {
          const X = x / R, Y = y / R, Z = Math.sqrt(Math.max(0, 1 - X * X - Y * Y));
          const t = -(up[0] * X + up[1] * Y + up[2] * Z) / uL;
          if (t <= 0) return 0;
          const ix = prof.at(Math.hypot(X + t * Lv[0], Y + t * Lv[1], Z + t * Lv[2]));
          return ix < 0 ? 0 : prof.a[ix] * 0.8;
        };
    }

    // ---- the globe.
    const globe = createRef<Sphere>();
    const res = Math.round(Math.min(600, 2 * R) * (0.55 + 0.45 * q));
    const atm = p.atmosphere && B.atmosphere ? { color: rgb1(B.atmosphere.color), strength: B.atmosphere.strength } : undefined;
    const surface = p.nightLights ? maps.surface : { ...maps.surface, night: undefined };
    const halo = atm
      ? (g: CanvasRenderingContext2D) => {
          const ox = Lv[0] * R * 0.06, oy = Lv[1] * R * 0.06;
          const gr = g.createRadialGradient(ox, oy, R * 0.96, ox, oy, R * (1.1 + 0.08 * B.atmosphere!.strength));
          gr.addColorStop(0, alpha(B.atmosphere!.color, 0.42 * B.atmosphere!.strength * Math.max(0.3, L.visual.glow)));
          gr.addColorStop(1, alpha(B.atmosphere!.color, 0));
          g.fillStyle = gr;
          g.beginPath();
          g.arc(ox, oy, R * 1.2, 0, Math.PI * 2);
          g.fill();
        }
      : null;

    // ---- moons on their orbits (equatorial plane, compressed radii, real period ratios).
    const moonNodes: Node[] = [];
    const orbitBack: [number, number][][] = [], orbitFront: [number, number][][] = [];
    const fastest = Math.min(...moonIds.map((m) => ORBITS[m].period), 99);
    moonIds.forEach((m, i) => {
      const O = ORBITS[m], MB = BODIES[m];
      const mm = MB.bake(256, L.seed + i);
      const w = (2 * Math.PI * fastest) / (O.period * 9) * st.speed;
      const ph0 = i * 2.1 + 0.6;
      const pos = (): V3 => {
        const a = ph0 + w * clock();
        return [0, 1, 2].map((ax) => O.r * (Math.cos(a) * F.e0[ax] + Math.sin(a) * F.f0[ax])) as V3;
      };
      const back: [number, number][] = [], front: [number, number][] = [];
      for (let s = 0; s <= 120; s++) {
        const a = (s / 120) * Math.PI * 2;
        const P = [0, 1, 2].map((ax) => O.r * (Math.cos(a) * F.e0[ax] + Math.sin(a) * F.f0[ax]));
        (P[2] < 0 ? back : front).push([cx + P[0] * R, cy + P[1] * R]);
      }
      orbitBack.push(back);
      orbitFront.push(front);
      const mr = Math.max(7 * k, O.size * R);
      moonNodes.push(
        <Node x={() => cx + pos()[0] * R} y={() => cy + pos()[1] * R} zIndex={() => (pos()[2] < 0 ? -2 : 2)}>
          <Sphere radius={mr} res={Math.max(24, Math.round(Math.min(160, mr * 2)))} surface={mm.surface} clouds={mm.clouds} rot={() => -Math.atan2(pos()[0], pos()[2])} tilt={tilt} pitch={pitch} light={() => Lv} ambient={0.03} atmosphere={MB.atmosphere ? { color: rgb1(MB.atmosphere.color), strength: MB.atmosphere.strength * 0.8 } : undefined} />
          <Txt text={MB.name} y={mr + 22 * k} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} opacity={() => (pos()[2] < 0 ? 0.55 : 0.95)} />
        </Node>,
      );
    });
    // Orbit lines split in front/behind; drawn so the planet hides the far half.
    const orbitPaint = (sets: [number, number][][], a: number) => (g: CanvasRenderingContext2D) => {
      g.strokeStyle = alpha(L.ink, a);
      g.lineWidth = L.lw(1.6 * k);
      g.setLineDash([6 * k, 8 * k]);
      for (const pts of sets) {
        // Points of one half are contiguous except across the start of the loop: draw in runs.
        let prev: [number, number] | null = null;
        g.beginPath();
        for (const pt of pts) {
          if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 40 * k) g.moveTo(pt[0], pt[1]);
          else if (!prev) g.moveTo(pt[0], pt[1]);
          else g.lineTo(pt[0], pt[1]);
          prev = pt;
        }
        g.stroke();
      }
    };

    // ---- Enceladus' plumes: particles thrown out along the south polar normals.
    const plumeNode =
      p.plumes && B.id === "enceladus"
        ? (
            <Draw
              zIndex={() => 0.5}
              paint={(g) => {
                const s = globe();
                if (!s) return;
                g.globalCompositeOperation = "lighter";
                const r = rng(5);
                const t = clock();
                for (let j = 0; j < 4; j++) {
                  const lon = -60 + j * 40;
                  const pp = s.project(-80, lon);
                  const n: V3 = [pp[0] / R, pp[1] / R, pp[2]];
                  for (let i = 0; i < 90 * q + 20; i++) {
                    const life = (t * 0.35 + r()) % 1, spread = (r() - 0.5) * 0.5;
                    const d = life * R * 1.4;
                    const x = cx + pp[0] + (n[0] + spread * n[1]) * d, y = cy + pp[1] + (n[1] - spread * n[0]) * d;
                    g.fillStyle = `rgba(200, 235, 255, ${(1 - life) * 0.35})`;
                    g.beginPath();
                    g.arc(x, y, (1.5 + life * 4) * k, 0, Math.PI * 2);
                    g.fill();
                  }
                }
              }}
            />
          )
        : null;

    // ---- callouts that follow surface points (fade out on the far side).
    const marks: { lat: number; lon: number; text: string; show: SimpleSignal<number> }[] = [...p.markers.map((m) => ({ lat: m.lat, lon: m.lon, text: m.label })), ...(p.markers.length ? [] : B.features.map(([lat, lon, text]) => ({ lat, lon, text })))]
      .slice(0, 6)
      .map((m) => ({ ...m, show: createSignal(0) }));
    const markNodes = marks.map((m) => {
      const P = () => (globe() ? globe().project(m.lat, m.lon) : ([0, 0, -1] as V3));
      const vis = () => m.show() * clamp((P()[2] - 0.08) / 0.25, 0, 1);
      const dir = (): [number, number] => {
        const x = P()[0], y = P()[1], l = Math.hypot(x, y) || 1;
        return [x / l, y / l];
      };
      // The label stays inside the globe's area (never over the fact panel or past the frame).
      const textW = m.text.length * 26 * k * 0.56 + 16 * k;
      const end = (): [number, number] => {
        const [dx, dy] = dir();
        const d = Math.max(R * 1.1 + 40 * k, Math.hypot(P()[0], P()[1]) + 50 * k);
        const x = cx + dx * d, y = cy + dy * d;
        return [dx >= 0 ? Math.min(x, A.x + gw - textW) : Math.max(x, A.x + textW), clamp(y, A.y + 20 * k, A.y + gh - 20 * k)];
      };
      return (
        <Node opacity={vis} zIndex={3}>
          <Rect x={() => cx + P()[0]} y={() => cy + P()[1]} size={12 * k} radius={6 * k} fill={L.accent} stroke={"#000000"} lineWidth={1.5 * k} {...L.glow(L.accent, 12 * k)} />
          <Line points={() => [[cx + P()[0], cy + P()[1]], end()]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Txt text={m.text} x={() => end()[0] + (dir()[0] >= 0 ? 8 : -8) * k} y={() => end()[1]} offsetX={() => (dir()[0] >= 0 ? -1 : 1)} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={L.text} shadowColor={"rgba(0,0,0,0.85)"} shadowBlur={8 * k} />
        </Node>
      );
    });

    // ---- cut-away of the interior: a quarter wedge opening toward the upper right.
    const cut = createSignal(0);
    const layerShow = B.layers.map(() => createSignal(0));
    const wedge = (
      <Draw
        zIndex={0.6}
        paint={(g) => {
          const u = cut();
          if (u <= 0) return;
          const a0 = -Math.PI / 2, a1 = a0 + (Math.PI / 2) * u;
          g.translate(cx, cy);
          for (let i = B.layers.length - 1; i >= 0; i--) {
            const Ly = B.layers[i], r = Ly.r * R, rIn = i ? B.layers[i - 1].r * R : 0;
            // Thin outer crusts are drawn at a visible minimum thickness.
            const rr = i === B.layers.length - 1 ? R : Math.min(r, R - 6 * k);
            const gr = g.createRadialGradient(-R * 0.2, -R * 0.2, rIn * 0.6, 0, 0, Math.max(rr, 1));
            const [cr, cg, cb] = rgb(Ly.color);
            gr.addColorStop(0, `rgb(${Math.min(255, cr * 1.15)}, ${Math.min(255, cg * 1.15)}, ${Math.min(255, cb * 1.15)})`);
            gr.addColorStop(1, `rgb(${cr * 0.75}, ${cg * 0.75}, ${cb * 0.75})`);
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(0, 0);
            g.arc(0, 0, rr, a0, a1);
            g.closePath();
            g.fill();
            g.strokeStyle = "rgba(0,0,0,0.35)";
            g.lineWidth = 1.5 * k;
            g.beginPath();
            g.arc(0, 0, rr, a0, a1);
            g.stroke();
          }
          // The two cut faces' edges.
          g.strokeStyle = "rgba(255,255,255,0.55)";
          g.lineWidth = 2 * k;
          g.beginPath();
          g.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
          g.lineTo(0, 0);
          g.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
          g.stroke();
          // Glow of the hot core.
          if (L.visual.glow > 0) {
            const core = g.createRadialGradient(0, 0, 0, 0, 0, B.layers[0].r * R * 1.4);
            core.addColorStop(0, alpha(B.layers[0].color, 0.45 * L.visual.glow));
            core.addColorStop(1, alpha(B.layers[0].color, 0));
            g.fillStyle = core;
            g.beginPath();
            g.moveTo(0, 0);
            g.arc(0, 0, B.layers[0].r * R * 1.4, a0, a1);
            g.closePath();
            g.fill();
          }
        }}
      />
    );
    // Layer labels stacked to the right of the wedge, leader to the middle of each band (at −45°).
    const layerNodes = B.layers.map((Ly, i) => {
      const rIn = i ? B.layers[i - 1].r : 0;
      const rm = ((Ly.r + rIn) / 2) * R;
      const at: [number, number] = [cx + Math.cos(-Math.PI / 4) * rm, cy + Math.sin(-Math.PI / 4) * rm];
      const n = B.layers.length;
      // Outer layers higher: the leaders (all at −45°) then never cross.
      const lx = cx + R * 1.12, ly = cy - R * 0.95 + (n - 1 - i + 0.5) * ((R * 1.5) / n);
      return (
        <Node opacity={layerShow[i]} zIndex={3}>
          <Line points={[at, [lx - 12 * k, ly], [lx, ly]]} stroke={alpha(L.ink, 0.7)} lineWidth={L.lw(2 * k)} />
          <Rect x={at[0]} y={at[1]} size={10 * k} radius={5 * k} fill={L.ink} />
          <Txt text={Ly.name} x={lx + 10 * k} y={ly - 13 * k} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={26 * k} fill={Ly.color} shadowColor={"rgba(0,0,0,0.8)"} shadowBlur={6 * k} />
          {Ly.note ? <Txt text={Ly.note} x={lx + 10 * k} y={ly + 16 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={20 * k} fill={L.dim} /> : null}
        </Node>
      );
    });

    // ---- fact panel.
    const factsRef = createRef<Node>();
    const PX = panel === "side" ? A.x + A.w - PW : A.x + A.w * 0.08;
    const PY = panel === "side" ? A.cy - (B.facts.length * 58 * k + 70 * k) / 2 : A.y + A.h - PH + 10 * k;
    const factW = panel === "side" ? PW : A.w * 0.84;
    const factNode =
      panel !== "none" ? (
        <Node ref={factsRef} opacity={0} zIndex={4}>
          <Rect x={PX + factW / 2} y={PY + (B.facts.length * (panel === "side" ? 58 : 46) * k + 70 * k) / 2} width={factW} height={B.facts.length * (panel === "side" ? 58 : 46) * k + 70 * k} radius={18 * k} fill={alpha(L.bg, 0.72)} stroke={alpha(L.primary, 0.5)} lineWidth={L.lw(2 * k)} />
          <Txt text={B.name} x={PX + 24 * k} y={PY + 34 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={32 * k} fill={L.accent} />
          {B.facts.map(([a, b], i) => (
            <Node y={PY + 80 * k + i * (panel === "side" ? 58 : 46) * k}>
              <Txt text={a} x={PX + 24 * k} offsetX={-1} fontFamily={FONT} fontWeight={500} fontSize={21 * k} fill={L.dim} />
              <Txt text={b} x={PX + factW - 24 * k} offsetX={1} fontFamily={FONT} fontWeight={700} fontSize={23 * k} fill={L.text} />
            </Node>
          ))}
        </Node>
      ) : null;

    const titleRef = createRef<Txt>();
    const world = createRef<Node>();
    st.cam.add(
      <Node>
        {p.stars || L.backdrop !== "none" ? starfield(ctx, L, { count: Math.round(160 * q), seed: L.seed + 3, clock, drift: 4 }) : null}
        <Node ref={world} opacity={0} scale={0.92}>
          {orbitBack.length ? <Draw zIndex={-2.5} paint={orbitPaint(orbitBack, 0.22)} /> : null}
          <Node x={cx} y={cy} zIndex={-3}>
            {ringNodes[0] ?? null}
          </Node>
          {halo ? <Draw x={cx} y={cy} zIndex={-1} paint={halo} /> : null}
          <Sphere
            ref={globe}
            x={cx}
            y={cy}
            zIndex={0}
            radius={R}
            res={res}
            surface={surface}
            clouds={cloudLayer}
            cloudCover={p.dustStorm ? stormGrow : undefined}
            rot={rot}
            tilt={tilt}
            pitch={pitch}
            light={() => Lv}
            ambient={B.ambient ?? 0.035}
            atmosphere={atm}
            nightColor={B.id === "io" ? [1, 0.45, 0.12] : [1, 0.8, 0.5]}
            shadow={ringShadow}
          />
          {plumeNode}
          {wedge}
          <Node x={cx} y={cy} zIndex={1}>
            {ringNodes[1] ?? null}
          </Node>
          {orbitFront.length ? <Draw zIndex={1.5} paint={orbitPaint(orbitFront, 0.4)} /> : null}
          {moonNodes}
          {markNodes}
          {layerNodes}
        </Node>
        {factNode}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );

    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* all(world().opacity(1, 0.9, easeOutCubic), world().scale(1, 1.2, easeOutCubic));
    if (p.dustStorm) yield stormGrow(1, Math.max(2, D * 0.6), linear);
    // Steps at cues: callouts (globe) or the cut and its layers (cross section), then the facts.
    const steps: (() => ThreadGenerator)[] = [];
    if (p.view === "cross_section") {
      steps.push(() => cut(1, 1.4, st.ease));
      layerShow.forEach((s) => steps.push(() => s(1, 0.5)));
    } else if (p.labels) marks.forEach((m) => steps.push(() => m.show(1, 0.5)));
    if (factNode) steps.push(() => factsRef().opacity(1, 0.6));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
