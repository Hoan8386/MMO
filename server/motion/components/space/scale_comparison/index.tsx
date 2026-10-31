// Sizes to scale: the planets (and moons or dwarf planets) side by side with their real radii, each a
// turning textured globe from the planet component; optionally the edge of the Sun behind them for
// scale. The camera pans along the row; names and diameters label each body.
import { Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { Sphere } from "../../../shared/sphere";
import { rgb1 } from "../../../shared/noise";
import { FONT, label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";
import { BODIES } from "../planet/bodies";

interface Props {
  title: string;
  set: "planets" | "rocky" | "moons" | "dwarfs";
  sun: boolean;
  labels: boolean;
}

const SETS: Record<string, string[]> = {
  planets: ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"],
  rocky: ["mercury", "venus", "earth", "moon", "mars"],
  moons: ["ganymede", "titan", "callisto", "io", "moon", "europa", "enceladus"],
  dwarfs: ["earth", "moon", "pluto", "charon"],
};

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "astronomy", "solar_system");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const ids = SETS[p.set];
    const bodies = ids.map((id) => BODIES[id]);
    const rmax = Math.max(...bodies.map((b) => b.radiusKm));
    // Scale so the largest body fills ~70 % of the height; the row may be wider than the frame (pan).
    const pxPerKm = (A.h * 0.36) / rmax;
    const gap = 40 * k;
    let x = 0;
    const xs = bodies.map((b) => {
      const r = Math.max(2, b.radiusKm * pxPerKm);
      const cx = x + r;
      x += 2 * r + gap;
      return cx;
    });
    const total = x - gap;
    const baseY = A.y + A.h * 0.62;
    const pan = createSignal(0);
    const startX = A.x + Math.max(40 * k, (A.w - total) / 2);
    const endX = total > A.w ? A.x + A.w - total - 40 * k : startX;
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          {p.sun ? (
            <Draw
              paint={(g) => {
                // The Sun's edge: radius 696 000 km at the same scale, its limb on the left.
                const R = 696000 * pxPerKm, cx = startX + (endX - startX) * pan() - R - 30 * k;
                const gr = g.createRadialGradient(cx, baseY, R * 0.97, cx, baseY, R * 1.05);
                gr.addColorStop(0, "rgba(255,190,90,1)");
                gr.addColorStop(1, "rgba(255,150,60,0)");
                g.fillStyle = gr;
                g.beginPath();
                g.arc(cx, baseY, R * 1.05, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = "#FFB347";
                g.beginPath();
                g.arc(cx, baseY, R, 0, Math.PI * 2);
                g.fill();
              }}
            />
          ) : null}
          {bodies.map((b, i) => {
            const r = Math.max(2, b.radiusKm * pxPerKm);
            const maps = b.bake(r > 60 ? 384 : 192, L.seed + i);
            return (
              <Node x={() => startX + (endX - startX) * pan() + xs[i]} y={baseY}>
                <Sphere radius={r} res={Math.round(Math.min(480, Math.max(24, r * 2)))} surface={maps.surface} clouds={maps.clouds} rot={() => clock() * 0.4 * Math.sign(b.spinVis || 1)} tilt={((b.tilt > 90 ? b.tilt - 180 : b.tilt) * Math.PI) / 180} pitch={-0.15} light={() => [-0.75, -0.15, 0.6]} atmosphere={b.atmosphere ? { color: rgb1(b.atmosphere.color), strength: b.atmosphere.strength * 0.8 } : undefined} />
                {p.labels ? (
                  <Node>
                    <Txt text={b.name} y={r + 34 * k} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.text} />
                    <Txt text={`${num(b.radiusKm * 2, 0)} km`} y={r + 64 * k} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
                  </Node>
                ) : null}
              </Node>
            );
          })}
        </Node>
        {p.labels ? label(ctx, `Đúng tỉ lệ kích thước${p.sun ? " — cung tròn bên trái là rìa Mặt Trời" : ""} (khoảng cách không theo tỉ lệ)`, { x: A.cx, y: A.y + 24 * k, size: 24, fill: L.dim }) : null}
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );
    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.8, easeOutCubic);
    yield* until(0.8);
    yield* pan(1, Math.max(1, D - 2), easeInOutCubic);
  },
});
