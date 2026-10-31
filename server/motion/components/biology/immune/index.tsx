// Blood and immunity. blood: a vessel with laminar flow (velocity profile ∝ 1 − (r/R)², fastest in the
// middle) carrying red blood cells (biconcave discs, tumbling), white blood cells and platelets.
// clotting: the wall is torn; platelets stick to the wound and to each other, fibrin threads weave a
// mesh, red cells get trapped and the leak stops. antibody: Y-shaped antibodies bind the antigens on
// virus particles (each arm to one antigen), cross-linking them into clumps (agglutination).
// phagocytosis: a macrophage stretches pseudopods around a bacterium, engulfs it into a phagosome,
// lysosomes fuse and the bacterium is digested.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "blood" | "clotting" | "antibody" | "phagocytosis";
  cells: number;
  labels: boolean;
}

const TAU = Math.PI * 2;
const RBC = "#E8394A", WBC = "#F2EEF7", PLT = "#E9C46A";

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "human_biology");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const R0 = rng(L.seed + 61);
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const show = (n: Node) => {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{n}</Node>);
    };
    // Red cell: a disc with a paler dimple, seen at an angle (tumbling).
    const redCell = (g: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number, a = 1) => {
      const sy = Math.max(0.25, Math.abs(Math.cos(tilt)));
      g.globalAlpha = a;
      g.fillStyle = RBC;
      g.beginPath();
      g.ellipse(x, y, r, r * sy, tilt * 0.3, 0, TAU);
      g.fill();
      g.fillStyle = mix(RBC, "#000000", 0.25);
      g.beginPath();
      g.ellipse(x, y, r * 0.45, r * 0.45 * sy, tilt * 0.3, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    };
    const whiteCell = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      g.fillStyle = WBC;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * TAU, rr = r * (1 + 0.06 * Math.sin(a * 5 + clock() * 2));
        if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
      g.fillStyle = "#9B5DE5";
      for (const [dx, dy] of [[-0.3, -0.1], [0.05, 0.2], [0.3, -0.15]]) {
        g.beginPath();
        g.arc(x + dx * r, y + dy * r, r * 0.28, 0, TAU);
        g.fill();
      }
    };

    if (p.mode === "blood" || p.mode === "clotting") {
      const vy = A.cy, VR = Math.min(A.h * 0.36, A.w * 0.22);
      const clot = p.mode === "clotting";
      const tInj = clot ? ctx.cue(0, 4) : 1e9;
      const woundX = A.x + A.w * 0.55;
      const n = p.cells;
      const cells = Array.from({ length: n }, () => {
        const u = R0();
        return { r: (R0() * 2 - 1) * 0.85, x: R0(), type: u < 0.86 ? "rbc" : u < 0.93 ? "wbc" : "plt", tilt: R0() * TAU, spin: (R0() - 0.5) * 3 };
      });
      const vmax = (A.w * 0.22) * st.speed;
      // Flow slows near a growing clot (illustrative).
      const plug = () => (clot ? smooth(clamp((clock() - tInj - 1) / (D - tInj - 2), 0, 1)) : 0);
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            // Vessel walls (endothelium) and plasma.
            g.fillStyle = alpha("#FFD6A5", 0.12);
            g.fillRect(A.x, vy - VR, A.w, VR * 2);
            g.fillStyle = "#C25A68";
            g.fillRect(A.x, vy - VR - 22 * k, A.w, 22 * k);
            g.fillRect(A.x, vy + VR, A.w, 22 * k);
            if (clot && t > tInj) {
              // Tear in the lower wall.
              g.fillStyle = L.bg;
              g.beginPath();
              g.moveTo(woundX - 60 * k, vy + VR);
              g.lineTo(woundX - 20 * k, vy + VR + 22 * k);
              g.lineTo(woundX + 30 * k, vy + VR + 22 * k);
              g.lineTo(woundX + 60 * k, vy + VR);
              g.fill();
            }
            for (const c of cells) {
              const v = vmax * (1 - c.r * c.r) * (1 - 0.85 * plug());
              let x = A.x + ((((c.x * A.w + v * t) % (A.w + 60 * k)) + A.w + 60 * k) % (A.w + 60 * k)) - 30 * k;
              let y = vy + c.r * VR;
              // Platelets near the wound stick to it after the injury.
              if (clot && c.type === "plt" && t > tInj) {
                const stick = smooth(clamp((t - tInj - c.x * 2) / 1.2, 0, 1));
                const tx = woundX + (c.r * 60) * k, ty = vy + VR - 14 * k - Math.abs(c.r) * 30 * k;
                x = x + (tx - x) * stick;
                y = y + (ty - y) * stick;
              }
              // Some red cells get trapped in the mesh.
              if (clot && c.type === "rbc" && Math.abs(c.r) > 0.55 && c.r > 0 && t > tInj + 1.5 && Math.abs(x - woundX) < 120 * k) x = woundX + (c.x - 0.5) * 160 * k;
              if (c.type === "rbc") redCell(g, x, y, 22 * k, c.tilt + t * c.spin);
              else if (c.type === "wbc") whiteCell(g, x, y, 30 * k);
              else {
                g.fillStyle = PLT;
                g.beginPath();
                g.ellipse(x, y, 9 * k, 6 * k, c.tilt, 0, TAU);
                g.fill();
              }
            }
            // Fibrin mesh over the wound.
            if (clot && t > tInj + 1) {
              const m = plug(), r = rng(5);
              g.strokeStyle = alpha("#FFF4D6", 0.8 * m);
              g.lineWidth = 2 * k;
              for (let i = 0; i < 40 * m; i++) {
                g.beginPath();
                g.moveTo(woundX + (r() - 0.5) * 260 * k, vy + VR - r() * 120 * k);
                g.lineTo(woundX + (r() - 0.5) * 260 * k, vy + VR + r() * 20 * k);
                g.stroke();
              }
            }
            // Velocity profile arrows on the left.
            const px = A.x + 60 * k;
            g.strokeStyle = alpha(L.ink, 0.5);
            g.lineWidth = 2 * k;
            for (let j = -4; j <= 4; j++) {
              const r = j / 5, len = 90 * k * (1 - r * r);
              g.beginPath();
              g.moveTo(px, vy + r * VR);
              g.lineTo(px + len, vy + r * VR);
              g.stroke();
            }
          }}
        />,
      );
      if (clot) {
        show(label(ctx, "1. Thành mạch bị tổn thương", { x: A.x + 20 * k, y: A.y + 24 * k, size: 26, align: "left", fill: L.text }));
        show(label(ctx, "2. Tiểu cầu bám vào vết thương, kết dính", { x: A.x + 20 * k, y: A.y + 60 * k, size: 26, align: "left", fill: PLT }));
        show(label(ctx, "3. Lưới fibrin giữ hồng cầu → cục máu đông", { x: A.x + 20 * k, y: A.y + 96 * k, size: 26, align: "left", fill: "#FFF4D6" }));
      } else {
        show(label(ctx, "Hồng cầu — vận chuyển O₂ (đĩa lõm hai mặt)", { x: A.x + 20 * k, y: A.y + 24 * k, size: 25, align: "left", fill: RBC }));
        show(label(ctx, "Bạch cầu — bảo vệ cơ thể", { x: A.x + 20 * k, y: A.y + 60 * k, size: 25, align: "left", fill: WBC }));
        show(label(ctx, "Tiểu cầu — làm đông máu", { x: A.x + 20 * k, y: A.y + 96 * k, size: 25, align: "left", fill: PLT }));
        show(label(ctx, "Dòng chảy tầng: nhanh ở giữa, chậm sát thành mạch", { x: A.cx, y: A.y + A.h - 14 * k, size: 25, fill: L.dim }));
      }
    } else if (p.mode === "antibody") {
      // Viruses drift; antibodies home in and bind; bound viruses pull together into a clump.
      const nV = 7, nAb = 14;
      const vir = Array.from({ length: nV }, (_, i) => ({ x: A.x + A.w * (0.15 + 0.7 * R0()), y: A.y + A.h * (0.2 + 0.6 * R0()), ph: R0() * TAU, i }));
      const tBind = ctx.cue(0, 3), tClump = ctx.cue(1, 3);
      const vPos = (v: (typeof vir)[0]): [number, number] => {
        const c = smooth(clamp((clock() - tClump) / 2, 0, 1));
        const x = v.x + Math.sin(clock() * 0.6 + v.ph) * 20 * k, y = v.y + Math.cos(clock() * 0.5 + v.ph) * 20 * k;
        const gx = A.cx + ((v.i % 3) - 1) * 80 * k, gy = A.cy + (Math.floor(v.i / 3) - 1) * 80 * k;
        return [x + (gx - x) * c, y + (gy - y) * c];
      };
      const abs = Array.from({ length: nAb }, (_, i) => ({ v: i % nV, w: (i + 1 + (i % 3)) % nV, sx: A.x + R0() * A.w, sy: R0() < 0.5 ? A.y : A.y + A.h, ph: R0() }));
      const ab = (g: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number) => {
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.strokeStyle = "#FFD166";
        g.lineWidth = 7 * k;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(0, s * 0.6);
        g.lineTo(0, 0);
        g.lineTo(-s * 0.5, -s * 0.6);
        g.moveTo(0, 0);
        g.lineTo(s * 0.5, -s * 0.6);
        g.stroke();
        g.strokeStyle = "#FF9F1C";
        g.lineWidth = 4 * k;
        g.beginPath();
        g.moveTo(-s * 0.5, -s * 0.6);
        g.lineTo(-s * 0.62, -s * 0.78);
        g.moveTo(s * 0.5, -s * 0.6);
        g.lineTo(s * 0.62, -s * 0.78);
        g.stroke();
        g.restore();
      };
      nodes.push(
        <Draw
          paint={(g) => {
            for (const v of vir) {
              const [x, y] = vPos(v);
              g.fillStyle = L.accent;
              g.beginPath();
              g.arc(x, y, 30 * k, 0, TAU);
              g.fill();
              // Antigens: little triangles on the surface.
              g.fillStyle = "#21E6A1";
              for (let j = 0; j < 8; j++) {
                const a = (j / 8) * TAU + v.ph;
                g.beginPath();
                g.moveTo(x + Math.cos(a) * 38 * k, y + Math.sin(a) * 38 * k);
                g.lineTo(x + Math.cos(a + 0.18) * 28 * k, y + Math.sin(a + 0.18) * 28 * k);
                g.lineTo(x + Math.cos(a - 0.18) * 28 * k, y + Math.sin(a - 0.18) * 28 * k);
                g.fill();
              }
            }
            for (const a of abs) {
              const b = smooth(clamp((clock() - tBind - a.ph * 1.5) / 1.6, 0, 1));
              const [vx, vy] = vPos(vir[a.v]), [wx, wy] = vPos(vir[a.w]);
              // Bound: sits between its two viruses (bridging them).
              const mx = (vx + wx) / 2, my = (vy + wy) / 2;
              const tx = a.v === a.w ? vx + 50 * k : mx, ty = a.v === a.w ? vy : my;
              const x = a.sx + (tx - a.sx) * b, y = a.sy + (ty - a.sy) * b;
              ab(g, x, y, Math.atan2(wy - vy, wx - vx) + Math.PI / 2, 46 * k);
            }
          }}
        />,
      );
      show(label(ctx, "Kháng thể (hình chữ Y) nhận diện đúng kháng nguyên trên virus", { x: A.cx, y: A.y + 24 * k, size: 26, fill: L.text }));
      show(label(ctx, "Mỗi kháng thể có 2 đầu gắn → kết dính virus thành cụm, vô hiệu hoá", { x: A.cx, y: A.y + A.h - 18 * k, size: 26, fill: L.text }));
    } else {
      // Phagocytosis.
      const cx = A.cx - A.w * 0.08, cy = A.cy, MR = Math.min(A.w, A.h) * 0.24;
      const tTouch = ctx.cue(0, 4), tEngulf = ctx.cue(1, 4), tDigest = ctx.cue(2, 4);
      const bx = () => cx + MR * 1.9 - smooth(clamp(clock() / tTouch, 0, 1)) * MR * 0.7 - smooth(clamp((clock() - tEngulf) / 1.5, 0, 1)) * MR * 0.9;
      nodes.push(
        <Draw
          paint={(g) => {
            const t = clock();
            const reach = smooth(clamp((t - tTouch) / 1.4, 0, 1)) * (1 - smooth(clamp((t - tEngulf - 0.8) / 1, 0, 1)));
            // Macrophage outline with two pseudopods reaching toward the bacterium.
            g.fillStyle = alpha("#B794F6", 0.55);
            g.strokeStyle = "#D0A2FF";
            g.lineWidth = 4 * k;
            g.beginPath();
            for (let i = 0; i <= 80; i++) {
              const a = (i / 80) * TAU;
              let r = MR * (1 + 0.06 * Math.sin(a * 4 + t));
              // Pseudopods around angle 0 (toward the right).
              const d = Math.abs(((a + Math.PI) % TAU) - Math.PI);
              if (d < 0.9) r += reach * MR * 0.75 * Math.exp(-(((d - 0.5) / 0.18) ** 2));
              const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.closePath();
            g.fill();
            g.stroke();
            // Nucleus.
            g.fillStyle = "#6E44C9";
            g.beginPath();
            g.ellipse(cx - MR * 0.35, cy + MR * 0.2, MR * 0.3, MR * 0.22, 0.4, 0, TAU);
            g.fill();
            // Bacterium (rod), inside a phagosome after engulfing; digested (fading) at the end.
            const dig = smooth(clamp((t - tDigest) / 2, 0, 1));
            const x = bx(), y = cy;
            if (t > tEngulf + 0.8) {
              g.strokeStyle = alpha("#FFFFFF", 0.6);
              g.lineWidth = 3 * k;
              g.beginPath();
              g.ellipse(x, y, MR * 0.32, MR * 0.2, 0, 0, TAU);
              g.stroke();
            }
            g.globalAlpha = 1 - dig * 0.9;
            g.fillStyle = "#21E6A1";
            g.beginPath();
            g.ellipse(x, y, MR * 0.24, MR * 0.11, 0, 0, TAU);
            g.fill();
            g.globalAlpha = 1;
            // Lysosomes moving to the phagosome and fusing.
            for (let i = 0; i < 4; i++) {
              const a = i * 1.7 + 0.5;
              const sx = cx + Math.cos(a) * MR * 0.6, sy = cy + Math.sin(a) * MR * 0.6;
              const f = smooth(clamp((t - tDigest + 0.8 - i * 0.2) / 1, 0, 1));
              g.fillStyle = "#FF6B81";
              g.beginPath();
              g.arc(sx + (x - sx) * f, sy + (y - sy) * f, MR * 0.07 * (1 - f * 0.5), 0, TAU);
              g.fill();
            }
          }}
        />,
      );
      show(label(ctx, "1. Đại thực bào phát hiện vi khuẩn", { x: A.x + 20 * k, y: A.y + 24 * k, size: 26, align: "left", fill: L.text }));
      show(label(ctx, "2. Chân giả bao lấy, nuốt vào thành túi thực bào", { x: A.x + 20 * k, y: A.y + 60 * k, size: 26, align: "left", fill: L.text }));
      show(label(ctx, "3. Lysosome hoà vào, enzyme tiêu huỷ vi khuẩn", { x: A.x + 20 * k, y: A.y + 96 * k, size: 26, align: "left", fill: L.text }));
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
    void Line;
    void Rect;
  },
});
