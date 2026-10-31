// Viruses. capsid: an icosahedral capsid (20 triangular faces, 12 vertices) turning in 3D, its
// protein subunits (capsomeres) drawn on every face and the genome coiled inside. enveloped: a
// coronavirus-like particle — lipid envelope, spike proteins spread evenly over the sphere (golden
// spiral) and drawn back-to-front as it turns. phage: a bacteriophage lands on a bacterium on its tail
// fibres, its tail sheath contracts and the DNA is injected. cycle: the replication cycle on a host
// cell — attachment to a receptor, entry, uncoating, copying of the genome, assembly, release by budding.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label, fitX } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  kind: "capsid" | "enveloped" | "phage" | "cycle";
  spikes: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type V3 = [number, number, number];
type XY = [number, number];

// Icosahedron vertices and faces.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map((v) => {
  const l = Math.hypot(...(v as V3));
  return [v[0] / l, v[1] / l, v[2] / l] as V3;
});
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "microbiology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const callout = (at: () => XY, to0: () => XY, text: string) => {
      const s = createSignal(0);
      const to = (): XY => [fitX(ctx, to0()[0], text, 25, to0()[0] > at()[0]), to0()[1]];
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          <Line points={() => [at(), to()]} stroke={alpha(L.ink, 0.75)} lineWidth={L.lw(2 * k)} />
          <Rect position={at} size={10 * k} radius={5 * k} fill={L.ink} />
          <Txt text={text} x={() => to()[0] + (to()[0] > at()[0] ? 10 : -10) * k} y={() => to()[1]} offsetX={() => (to()[0] > at()[0] ? -1 : 1)} fontFamily={FONT} fontWeight={700} fontSize={25 * k} fill={L.text} shadowColor="rgba(0,0,0,0.85)" shadowBlur={6 * k} />
        </Node>,
      );
    };
    const cx = A.cx, cy = A.cy;
    const rotY = () => clock() * 0.45 * st.speed, rotX = 0.35;
    const R3 = (v: V3): V3 => {
      const a = rotY(), c = Math.cos(a), s = Math.sin(a);
      const x = v[0] * c + v[2] * s, z = -v[0] * s + v[2] * c;
      const y = v[1] * Math.cos(rotX) - z * Math.sin(rotX), z2 = v[1] * Math.sin(rotX) + z * Math.cos(rotX);
      return [x, y, z2];
    };
    const light: V3 = [-0.5, -0.6, 0.62];
    const shade = (n: V3) => clamp(0.35 + 0.65 * (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]), 0.2, 1);

    if (p.kind === "capsid") {
      const R = Math.min(A.w, A.h) * 0.36;
      nodes.push(
        <Draw
          paint={(g) => {
            // Genome visible through the back faces: a coiled strand.
            g.strokeStyle = alpha(L.highlight, 0.7);
            g.lineWidth = 3 * k;
            g.beginPath();
            for (let i = 0; i <= 300; i++) {
              const u = i / 300, a = u * TAU * 9;
              const v = R3([Math.cos(a) * 0.5 * Math.sin(u * Math.PI), (u - 0.5) * 1.1, Math.sin(a) * 0.5 * Math.sin(u * Math.PI)]);
              if (i) g.lineTo(cx + v[0] * R, cy + v[1] * R);
              else g.moveTo(cx + v[0] * R, cy + v[1] * R);
            }
            g.stroke();
            // Faces back to front; front faces semi-transparent so the genome shows.
            const faces = ICO_F.map((f) => {
              const vs = f.map((i) => R3(ICO_V[i]));
              const c: V3 = [(vs[0][0] + vs[1][0] + vs[2][0]) / 3, (vs[0][1] + vs[1][1] + vs[2][1]) / 3, (vs[0][2] + vs[1][2] + vs[2][2]) / 3];
              return { vs, c };
            }).sort((a, b) => a.c[2] - b.c[2]);
            for (const f of faces) {
              const l = Math.hypot(...f.c), nrm: V3 = [f.c[0] / l, f.c[1] / l, f.c[2] / l];
              const front = nrm[2] > 0;
              const col = mix(L.primary, "#FFFFFF", shade(nrm) * 0.35);
              g.fillStyle = alpha(col, front ? 0.55 : 0.25);
              g.strokeStyle = alpha("#FFFFFF", front ? 0.6 : 0.2);
              g.lineWidth = 2 * k;
              g.beginPath();
              f.vs.forEach((v, i) => (i ? g.lineTo(cx + v[0] * R, cy + v[1] * R) : g.moveTo(cx + v[0] * R, cy + v[1] * R)));
              g.closePath();
              g.fill();
              g.stroke();
              // Capsomeres: 3 subunits per face (T = 1 arrangement), as shaded knobs.
              for (let j = 0; j < 3; j++) {
                const a = f.vs[j], m: V3 = [(f.c[0] * 2 + a[0]) / 3, (f.c[1] * 2 + a[1]) / 3, (f.c[2] * 2 + a[2]) / 3];
                g.fillStyle = alpha(mix(L.secondary, "#FFFFFF", shade(nrm) * 0.4), front ? 0.95 : 0.35);
                g.beginPath();
                g.arc(cx + m[0] * R * 1.02, cy + m[1] * R * 1.02, R * 0.07, 0, TAU);
                g.fill();
              }
            }
          }}
        />,
      );
      callout(() => [cx + R * 0.6, cy - R * 0.55], () => [cx + R * 1.3, cy - R * 0.9], "Vỏ capsid hình 20 mặt");
      callout(() => [cx - R * 0.35, cy + R * 0.2], () => [cx - R * 1.3, cy + R * 0.6], "Đơn vị protein (capsomere)");
      callout(() => [cx, cy], () => [cx - R * 1.3, cy - R * 0.7], "Vật chất di truyền (ADN/ARN)");
    } else if (p.kind === "enveloped") {
      const R = Math.min(A.w, A.h) * 0.3;
      const n = p.spikes;
      // Golden-spiral directions for the spikes.
      const dirs: V3[] = Array.from({ length: n }, (_, i) => {
        const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        return [Math.cos(a) * r, y, Math.sin(a) * r];
      });
      const rr = rng(L.seed + 1);
      const mDots: V3[] = Array.from({ length: 120 }, () => {
        const y = rr() * 2 - 1, r = Math.sqrt(1 - y * y), a = rr() * TAU;
        return [Math.cos(a) * r, y, Math.sin(a) * r];
      });
      const spike = (g: CanvasRenderingContext2D, d: V3, front: boolean) => {
        const base: XY = [cx + d[0] * R, cy + d[1] * R], tip: XY = [cx + d[0] * R * 1.32, cy + d[1] * R * 1.32];
        g.strokeStyle = alpha("#E85D75", front ? 1 : 0.4);
        g.lineWidth = 5 * k;
        g.beginPath();
        g.moveTo(...base);
        g.lineTo(...tip);
        g.stroke();
        g.fillStyle = alpha(mix("#FF6B81", "#FFFFFF", shade(d) * 0.3), front ? 1 : 0.4);
        g.beginPath();
        g.arc(tip[0], tip[1], R * 0.085 * (0.8 + 0.2 * Math.max(0, d[2])), 0, TAU);
        g.fill();
      };
      nodes.push(
        <Draw
          paint={(g) => {
            const ds = dirs.map((d) => R3(d));
            for (const d of ds) if (d[2] < 0) spike(g, d, false);
            // Envelope sphere with shading and the lipid bilayer rim.
            const gr = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
            gr.addColorStop(0, mix(L.accent, "#FFFFFF", 0.35));
            gr.addColorStop(0.7, L.accent);
            gr.addColorStop(1, mix(L.accent, "#000000", 0.45));
            g.fillStyle = gr;
            g.beginPath();
            g.arc(cx, cy, R, 0, TAU);
            g.fill();
            g.strokeStyle = mix(L.accent, "#FFFFFF", 0.5);
            g.lineWidth = 6 * k;
            g.stroke();
            // Membrane (M) proteins as small dots on the visible face.
            for (const m of mDots.map((v) => R3(v))) {
              if (m[2] < 0.1) continue;
              g.fillStyle = alpha("#FFD166", 0.75 * m[2]);
              g.beginPath();
              g.arc(cx + m[0] * R * 0.98, cy + m[1] * R * 0.98, 4 * k, 0, TAU);
              g.fill();
            }
            for (const d of ds) if (d[2] >= 0) spike(g, d, true);
          }}
        />,
      );
      callout(() => [cx + R * 0.95, cy - R * 0.85], () => [cx + R * 1.7, cy - R * 1.1], "Protein gai (spike) — bám vào thụ thể");
      callout(() => [cx - R * 0.98, cy + R * 0.2], () => [cx - R * 1.7, cy + R * 0.5], "Vỏ ngoài lipid (lấy từ tế bào chủ)");
      callout(() => [cx + R * 0.2, cy + R * 0.3], () => [cx + R * 1.7, cy + R * 0.9], "Protein màng; bên trong là ARN");
    } else if (p.kind === "phage") {
      // Bacterium surface at the bottom; the phage descends, contracts, injects.
      const S = Math.min(A.w, A.h) / 1000;
      const surf = A.y + A.h * 0.78;
      const land = ctx.cue(0, 4), contract = ctx.cue(1, 4), inject = ctx.cue(2, 4);
      const y0 = () => surf - 420 * S - (1 - smooth(clamp(clock() / land, 0, 1))) * A.h * 0.5;
      const sq = () => smooth(clamp((clock() - contract) / 0.8, 0, 1)); // tail contraction
      const dna = () => clamp((clock() - inject) / 2.5, 0, 1);
      nodes.push(
        <Draw
          paint={(g) => {
            // Bacterium wall.
            g.fillStyle = alpha(L.primary, 0.22);
            g.fillRect(A.x, surf, A.w, A.h * 0.22);
            g.strokeStyle = L.primary;
            g.lineWidth = 8 * k;
            g.beginPath();
            g.moveTo(A.x, surf);
            g.lineTo(A.x + A.w, surf);
            g.stroke();
            g.save();
            g.translate(cx, y0() + sq() * 90 * S);
            g.scale(S, S);
            // Head (elongated icosahedron in profile).
            g.fillStyle = mix(L.secondary, "#FFFFFF", 0.15);
            g.strokeStyle = "#FFFFFF";
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(0, -260);
            g.lineTo(80, -210);
            g.lineTo(80, -90);
            g.lineTo(0, -40);
            g.lineTo(-80, -90);
            g.lineTo(-80, -210);
            g.closePath();
            g.fill();
            g.stroke();
            // DNA inside the head, draining as it is injected.
            g.strokeStyle = L.highlight;
            g.lineWidth = 3;
            g.beginPath();
            for (let i = 0; i < 160 * (1 - dna()); i++) {
              const a = i * 0.5, r = 50 * (1 - i / 200);
              const x = Math.cos(a) * r, y = -150 + Math.sin(a) * r * 0.9;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            // Collar, tail sheath (shortens and widens when contracted), tube, base plate.
            g.fillStyle = "#A6B4C8";
            g.fillRect(-36, -40, 72, 16);
            const sheathL = 260 - sq() * 140, sheathW = 34 + sq() * 18;
            g.fillStyle = "#7F8FA6";
            for (let i = 0; i < 10; i++) g.fillRect(-sheathW, -24 + (i * sheathL) / 10, sheathW * 2, sheathL / 10 - 3);
            g.fillStyle = "#C9D4E2";
            g.fillRect(-9, -24, 18, 380 - 20);
            g.fillStyle = "#6E7F96";
            g.fillRect(-48, -24 + sheathL, 96, 18);
            // Tail fibres touching the surface.
            g.strokeStyle = "#C9D4E2";
            g.lineWidth = 5;
            for (const sgn of [-1, 1]) {
              g.beginPath();
              g.moveTo(sgn * 40, -10 + sheathL);
              g.lineTo(sgn * 130, 120 + sheathL * 0.2);
              g.lineTo(sgn * 160, 420 - sq() * 90);
              g.stroke();
            }
            g.restore();
            // Injected DNA spreading inside the bacterium.
            if (dna() > 0) {
              g.strokeStyle = L.highlight;
              g.lineWidth = 3 * k;
              g.beginPath();
              g.moveTo(cx, surf);
              for (let i = 0; i < 120 * dna(); i++) {
                const a = i * 0.35;
                g.lineTo(cx + Math.cos(a) * i * 0.9 * k, surf + 30 * k + Math.sin(a) * i * 0.35 * k + i * 0.4 * k);
              }
              g.stroke();
            }
          }}
        />,
      );
      callout(() => [cx + 80 * S, y0() - 150 * S + sq() * 90 * S], () => [cx + 300 * S, y0() - 300 * S], "Đầu chứa ADN");
      callout(() => [cx + 40 * S, y0() + 80 * S + sq() * 90 * S], () => [cx + 300 * S, y0() + 50 * S], "Bao đuôi co lại");
      callout(() => [cx - 150 * S, surf - 20 * S], () => [cx - 360 * S, surf - 200 * S], "Sợi đuôi bám vào vi khuẩn");
      callout(() => [cx + 30 * k, surf + 50 * k], () => [cx + 300 * S, surf + 110 * k], "ADN virus được bơm vào");
    } else {
      // ---- replication cycle on a host cell.
      const hc: XY = [cx, cy + A.h * 0.05], HR = Math.min(A.w * 0.4, A.h * 0.42);
      const stepsN = 6, names = ["1. Bám vào thụ thể", "2. Xâm nhập (nhập bào)", "3. Cởi vỏ, giải phóng ARN", "4. Nhân bản ARN, tổng hợp protein", "5. Lắp ráp virus mới", "6. Giải phóng (nảy chồi)"];
      const at = (i: number) => ctx.cue(i, stepsN + 1);
      const ph = (i: number) => clamp((clock() - at(i)) / 1.2, 0, 1);
      const vir = (g: CanvasRenderingContext2D, x: number, y: number, r: number, a = 1) => {
        g.fillStyle = alpha(L.accent, a);
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.strokeStyle = alpha("#FF6B81", a);
        g.lineWidth = 3 * k;
        for (let j = 0; j < 10; j++) {
          const aa = (j / 10) * TAU;
          g.beginPath();
          g.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
          g.lineTo(x + Math.cos(aa) * r * 1.4, y + Math.sin(aa) * r * 1.4);
          g.stroke();
        }
      };
      const vr = HR * 0.07;
      nodes.push(
        <Draw
          paint={(g) => {
            // Host cell with nucleus and ribosomes.
            g.fillStyle = alpha(L.primary, 0.12);
            g.strokeStyle = alpha(L.primary, 0.85);
            g.lineWidth = 6 * k;
            g.beginPath();
            g.arc(hc[0], hc[1], HR, Math.PI * 1.05, Math.PI * 1.95 + Math.PI * 1.1);
            g.fill();
            g.stroke();
            g.fillStyle = alpha(L.secondary, 0.35);
            g.beginPath();
            g.arc(hc[0] + HR * 0.35, hc[1] + HR * 0.3, HR * 0.28, 0, TAU);
            g.fill();
            // Receptor on the membrane top.
            const top: XY = [hc[0] - HR * 0.35, hc[1] - Math.sqrt(HR * HR - (HR * 0.35) ** 2)];
            g.strokeStyle = L.highlight;
            g.lineWidth = 5 * k;
            g.beginPath();
            g.moveTo(top[0], top[1]);
            g.lineTo(top[0], top[1] - 18 * k);
            g.stroke();
            // 1: virus approaches the receptor; 2: pulled in inside a vesicle.
            const v1y = top[1] - 18 * k - vr * 1.4 - (1 - ph(0)) * A.h * 0.2;
            const inside = ph(1);
            if (ph(2) < 1) {
              const x = top[0] + inside * HR * 0.1, y = v1y + inside * HR * 0.45;
              if (inside > 0) {
                g.strokeStyle = alpha(L.primary, 0.8 * (1 - ph(2)));
                g.lineWidth = 3 * k;
                g.beginPath();
                g.arc(x, y, vr * 1.8, 0, TAU);
                g.stroke();
              }
              vir(g, x, y, vr, 1 - ph(2));
            }
            // 3: RNA released (a strand), 4: copies and proteins.
            const rnaAt: XY = [top[0] + HR * 0.1, top[1] + HR * 0.55];
            const strand = (x: number, y: number, a: number) => {
              g.strokeStyle = alpha(L.highlight, a);
              g.lineWidth = 3 * k;
              g.beginPath();
              for (let j = 0; j <= 24; j++) {
                const xx = x - 30 * k + j * 2.5 * k, yy = y + Math.sin(j * 0.9) * 6 * k;
                if (j) g.lineTo(xx, yy);
                else g.moveTo(xx, yy);
              }
              g.stroke();
            };
            if (ph(2) > 0) strand(rnaAt[0], rnaAt[1], ph(2) * (1 - ph(4) * 0.6));
            const copies = Math.floor(ph(3) * 5);
            for (let j = 0; j < copies; j++) strand(rnaAt[0] + ((j % 3) - 1) * 80 * k, rnaAt[1] + (1 + Math.floor(j / 3)) * 50 * k, 1 - ph(4) * 0.7);
            if (ph(3) > 0) {
              const r = rng(3);
              g.fillStyle = alpha("#FF6B81", ph(3) * (1 - ph(4) * 0.8));
              for (let j = 0; j < 30; j++) {
                g.beginPath();
                g.arc(rnaAt[0] + (r() - 0.5) * HR * 0.8, rnaAt[1] + r() * HR * 0.5, 5 * k, 0, TAU);
                g.fill();
              }
            }
            // 5: new virions assembled; 6: budding out of the membrane (right side).
            const nNew = 4;
            for (let j = 0; j < nNew; j++) {
              if (ph(4) <= 0) break;
              const ax = rnaAt[0] + (j - 1.5) * 70 * k, ay = rnaAt[1] + 90 * k;
              const out = ph(5);
              const ang = -0.4 + j * 0.28;
              const ex = hc[0] + Math.cos(ang) * HR * (1 + out * 0.35), ey = hc[1] + Math.sin(ang) * HR * (1 + out * 0.35);
              const f = smooth(clamp(out * 1.4 - j * 0.12, 0, 1));
              vir(g, ax + (ex - ax) * f, ay + (ey - ay) * f, vr * ph(4), 1);
            }
          }}
        />,
      );
      // Step list on the side (wide) or bottom.
      names.forEach((nm, i) => {
        const s = createSignal(0);
        shows.push(s);
        const lx = A.wide ? A.x + 20 * k : A.x + 20 * k, ly = A.wide ? A.y + 30 * k + i * 46 * k : A.y + A.h - (stepsN - i) * 40 * k;
        nodes.push(
          <Node opacity={s}>
            <Txt text={nm} x={lx} y={ly} offsetX={-1} fontFamily={FONT} fontWeight={700} fontSize={(A.wide ? 26 : 23) * k} fill={() => (clock() >= at(i) && (i === stepsN - 1 || clock() < at(i + 1)) ? L.accent : L.dim)} />
          </Node>,
        );
      });
    }

    if (!p.labels) shows.length = 0;
    const world = createRef<Node>();
    const titleRef = createRef<Txt>();
    st.cam.add(
      <Node>
        <Node ref={world} opacity={0}>
          {nodes}
        </Node>
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: titleRef, fill: L.text }) : null}
      </Node>,
    );
    yield st.camera();
    yield clock(D, D, linear);
    if (p.title) yield fadeUp(titleRef(), 0.5);
    yield* world().opacity(1, 0.6, easeOutCubic);
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.4));
    const nS = p.kind === "cycle" ? 6 : steps.length;
    for (let i = 0; i < steps.length; i++) {
      yield* until(p.kind === "cycle" ? ctx.cue(i, nS + 1) : p.kind === "phage" ? ctx.cue(Math.min(i, 3), 4) + 0.3 : ctx.cue(i, nS + 1));
      yield steps[i]();
    }
  },
});
