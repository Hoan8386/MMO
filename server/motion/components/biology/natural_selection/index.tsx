// Evolution. selection: peppered moths on tree bark that darkens with soot (industrial melanism). Each
// generation birds catch the moths that stand out; the survivors breed. The dark form's frequency
// follows a Wright–Fisher model with selection (seeded random sampling of N moths per generation):
// p′ = p / (p + (1 − p)(1 − s)) on dark bark, then N offspring drawn binomially — so the curve rises
// with real genetic drift. timeline: the history of life on a logarithmic-feeling time ribbon, from
// the first cells 3.8 billion years ago to humans.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "selection" | "timeline";
  population: number;
  generations: number;
  selection: number;
  startDark: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
type XY = [number, number];

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "evolution");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };

    if (p.mode === "selection") {
      const N = p.population, G = p.generations, s = p.selection;
      const R = rng(L.seed + 81);
      // Simulate: per generation the list of moths (dark?) and who gets eaten.
      const gens: { dark: boolean[]; eaten: boolean[]; p: number }[] = [];
      let pf = p.startDark;
      for (let g = 0; g <= G; g++) {
        const dark = Array.from({ length: N }, () => R() < pf);
        const freq = dark.filter(Boolean).length / N;
        // Birds take light moths with probability s, dark ones rarely (bark dark from gen 1).
        const eaten = dark.map((d) => (g === 0 ? false : R() < (d ? s * 0.08 : s)));
        gens.push({ dark, eaten, p: freq });
        const surv = dark.filter((d, i) => !eaten[i]);
        pf = surv.length ? surv.filter(Boolean).length / surv.length : freq;
        // Recurrent mutation (~1 % per generation each way) keeps the dark form from being lost
        // by drift while it is rare, as it reappeared in real moth populations.
        pf = pf * 0.99 + (1 - pf) * 0.01;
      }
      const genLen = (D - 1.5) / (G + 1);
      const gen = () => clamp(Math.floor((clock() - 0.8) / genLen), 0, G);
      const within = () => clamp(((clock() - 0.8) % genLen) / genLen, 0, 1);
      const BW = A.wide ? A.w * 0.55 : A.w, BH = A.wide ? A.h : A.h * 0.55;
      const spots = Array.from({ length: N }, () => [A.x + 30 * k + R() * (BW - 60 * k), A.y + 30 * k + R() * (BH - 60 * k), (R() - 0.5) * 0.6]);
      const soot = () => smooth(clamp((clock() - 0.8) / (genLen * 2), 0, 1));
      nodes.push(
        <Draw
          paint={(g) => {
            // Bark: lichen-pale, darkening with soot.
            const bark = mix("#C9C2B0", "#2E2A26", soot());
            g.fillStyle = bark;
            g.fillRect(A.x, A.y, BW, BH);
            const r = rng(3);
            g.strokeStyle = mix(bark, "#000000", 0.25);
            g.lineWidth = 3 * k;
            for (let i = 0; i < 30; i++) {
              const x = A.x + r() * BW;
              g.beginPath();
              g.moveTo(x, A.y);
              g.bezierCurveTo(x + (r() - 0.5) * 60 * k, A.y + BH * 0.3, x + (r() - 0.5) * 60 * k, A.y + BH * 0.7, x + (r() - 0.5) * 40 * k, A.y + BH);
              g.stroke();
            }
            // Moths of the current generation; the eaten ones vanish in the second half of it.
            const gi = gen(), u = within();
            const G0 = gens[gi];
            for (let i = 0; i < N; i++) {
              const [x, y, a] = spots[i];
              const gone = G0.eaten[i] ? smooth(clamp((u - 0.45) / 0.25, 0, 1)) : 0;
              const appear = smooth(clamp(u / 0.15, 0, 1));
              const al = appear * (1 - gone);
              if (al <= 0.01) continue;
              g.save();
              g.translate(x, y);
              g.rotate(a);
              g.globalAlpha = al;
              g.fillStyle = G0.dark[i] ? "#26221E" : "#E8E2D2";
              for (const sgn of [-1, 1]) {
                g.beginPath();
                g.ellipse(sgn * 11 * k, 0, 12 * k, 8 * k, sgn * 0.4, 0, TAU);
                g.fill();
              }
              g.fillStyle = G0.dark[i] ? "#14110E" : "#9C958A";
              g.fillRect(-2 * k, -8 * k, 4 * k, 16 * k);
              g.restore();
            }
            g.globalAlpha = 1;
            // Birds swooping on their prey.
            for (let i = 0; i < N; i++) {
              if (!G0.eaten[i]) continue;
              const f = clamp((u - 0.3) / 0.35, 0, 1);
              if (f <= 0 || f >= 1) continue;
              const [x, y] = spots[i];
              const bx = x + (1 - f) * 200 * k, by = y - (1 - f) * 160 * k;
              g.strokeStyle = "#1B1B1B";
              g.lineWidth = 4 * k;
              g.beginPath();
              g.moveTo(bx - 18 * k, by - 6 * k);
              g.quadraticCurveTo(bx - 8 * k, by - 14 * k, bx, by);
              g.quadraticCurveTo(bx + 8 * k, by - 14 * k, bx + 18 * k, by - 6 * k);
              g.stroke();
            }
          }}
        />,
      );
      // Frequency graph.
      const gx = A.wide ? A.x + BW + 50 * k : A.x + 40 * k, gw = A.wide ? A.w - BW - 70 * k : A.w - 80 * k;
      const gy = A.wide ? A.y + 60 * k : A.y + BH + 50 * k, gh = A.wide ? A.h * 0.6 : A.h - BH - 110 * k;
      nodes.push(
        <Node>
          <Line points={[[gx, gy], [gx, gy + gh], [gx + gw, gy + gh]]} stroke={L.dim} lineWidth={2 * k} />
          <Line
            points={() => {
              const pts: XY[] = [];
              for (let i = 0; i <= gen(); i++) pts.push([gx + (i / G) * gw, gy + gh - gens[i].p * gh]);
              return pts.length > 1 ? pts : [[gx, gy + gh - gens[0].p * gh], [gx + 1, gy + gh - gens[0].p * gh]];
            }}
            stroke={L.accent}
            lineWidth={L.lw(4 * k)}
            {...L.glow(L.accent, 8 * k)}
          />
          <Txt text={() => `Thế hệ ${gen()} · bướm sẫm màu: ${num(gens[gen()].p * 100, 0)} %`} x={gx} y={gy - 26 * k} offsetX={-1} fontFamily={FONT} fontWeight={800} fontSize={26 * k} fill={L.text} />
          <Txt text="100 %" x={gx - 8 * k} y={gy} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={18 * k} fill={L.dim} />
          <Txt text="thế hệ →" x={gx + gw} y={gy + gh + 22 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={19 * k} fill={L.dim} />
        </Node>,
      );
      show(label(ctx, "Vỏ cây bị muội than làm sẫm → bướm sáng màu dễ bị chim phát hiện", { x: A.cx, y: A.y + A.h - 14 * k, size: 24, fill: L.text }));
      show(label(ctx, "Biến dị có lợi được giữ lại và tăng dần qua các thế hệ", { x: A.cx, y: A.y + A.h - 48 * k, size: 24, fill: L.accent }));
    } else {
      // ---- timeline of life (billions of years ago).
      const ev: [number, string, string][] = [
        [3.8, "Tế bào đầu tiên", "#7CFF6B"],
        [2.4, "Vi khuẩn lam tạo O₂", "#21E6A1"],
        [1.8, "Tế bào nhân thực", "#00CFFF"],
        [0.54, "Bùng nổ kỷ Cambri", "#9B5DE5"],
        [0.37, "Sinh vật lên cạn", "#FFD166"],
        [0.23, "Khủng long", "#FF9F1C"],
        [0.066, "Khủng long tuyệt chủng", "#FF6B35"],
        [0.0003, "Loài người", "#FF6B81"],
      ];
      // Position: square-root scale of time ago, so recent events are not crushed together.
      const x0 = A.x + 40 * k, x1 = A.x + A.w - 40 * k, y = A.cy;
      const xOf = (bya: number) => x0 + (1 - Math.sqrt(bya / 4)) * (x1 - x0);
      const prog = () => clamp((clock() - 0.8) / (D - 2), 0, 1);
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              const gr = g.createLinearGradient(x0, 0, x1, 0);
              gr.addColorStop(0, "#1B4D3E");
              gr.addColorStop(1, "#FF6B81");
              g.strokeStyle = gr;
              g.lineWidth = 14 * k;
              g.lineCap = "round";
              g.beginPath();
              g.moveTo(x0, y);
              g.lineTo(x0 + (x1 - x0) * prog(), y);
              g.stroke();
            }}
          />
          <Txt text="4 tỉ năm trước" x={x0} y={y + 40 * k} offsetX={-1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
          <Txt text="ngày nay" x={x1} y={y + 40 * k} offsetX={1} fontFamily={FONT} fontWeight={600} fontSize={20 * k} fill={L.dim} />
        </Node>,
      );
      ev.forEach(([t, nm, c], i) => {
        const x = xOf(t), up = i % 2 === 0;
        nodes.push(
          <Node opacity={() => (prog() * (x1 - x0) >= x - x0 - 2 ? 1 : 0)}>
            <Line points={[[x, y], [x, y + (up ? -1 : 1) * 90 * k]]} stroke={c} lineWidth={3 * k} />
            <Rect x={x} y={y} size={20 * k} radius={10 * k} fill={c} {...L.glow(c, 12 * k)} />
            <Txt text={nm} x={x} y={y + (up ? -1 : 1) * 116 * k} fontFamily={FONT} fontWeight={800} fontSize={23 * k} fill={c} />
            <Txt text={t >= 0.01 ? `${num(t * 1000, 0)} triệu năm` : "300 000 năm"} x={x} y={y + (up ? -1 : 1) * 146 * k} fontFamily={FONT} fontWeight={500} fontSize={18 * k} fill={L.dim} />
          </Node>,
        );
      });
      show(label(ctx, "Nếu lịch sự sống là 24 giờ, loài người xuất hiện ở 4 giây cuối", { x: A.cx, y: A.y + A.h - 14 * k, size: 26, fill: L.text }));
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
    const steps: (() => ThreadGenerator)[] = shows.map((s) => () => s(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
  },
});
