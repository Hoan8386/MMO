// DNA double helix in 2.5D: two sugar-phosphate backbones wind round a common axis (10.5 base pairs
// per turn, the strands offset by the minor/major groove) and turn slowly; base pairs are rungs coloured
// by base, always A–T and G–C. Depth shading and back-to-front drawing give the 3D look.
// Modes: "helix" (just the molecule), "replication" (a fork opens from the left; free nucleotides
// pair with each exposed strand — semi-conservative copying), "transcription" (a bubble travels along;
// an mRNA strand is built on the template strand with U in place of T and peels away).
import { Node, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { legend } from "../../../shared/fx";
import { label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  sequence: string;
  mode: "helix" | "replication" | "transcription";
  turns: number;
  rotationSpeed: number;
  baseColors: string[];
  showLegend: boolean;
}

const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "genetics");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const seq = (p.sequence.toUpperCase().replace(/[^ACGT]/g, "") || "ATGCGTACGTTAGC").split("");
    // Enough base pairs for the requested turns (10.5 bp per turn), repeating the sequence.
    const nbp = Math.round(p.turns * 10.5);
    const bases = Array.from({ length: nbp }, (_, i) => seq[i % seq.length]);
    const col: Record<string, string> = { A: p.baseColors[0], T: p.baseColors[1], G: p.baseColors[2], C: p.baseColors[3], U: "#FDE68A" };
    // Horizontal molecule in wide frames, vertical in tall ones (drawn in a rotated frame).
    const vertical = A.tall;
    const len = (vertical ? A.h : A.w) * 0.9;
    const R = Math.min((vertical ? A.w : A.h) * (p.mode === "helix" ? 0.22 : 0.15), len / p.turns / 2.2);
    const step = len / nbp;
    const groove = Math.PI * 0.72;
    const t = createSignal(0);
    const fork = createSignal(-0.05); // replication: opened up to this fraction
    const bubble = createSignal(-0.3); // transcription: bubble centre (fraction)
    const pal = { back: L.primary, back2: L.secondary };

    const paint = (g: CanvasRenderingContext2D) => {
      const time = t();
      if (vertical) g.rotate(Math.PI / 2);
      const x0 = -len / 2;
      // Per base: axis x, the two strand angles, how far the strands are pulled apart.
      const pts = bases.map((b, i) => {
        const u = i / (nbp - 1);
        const ang = (2 * Math.PI * i) / 10.5 + time * p.rotationSpeed;
        let open = 0, rna = 0;
        if (p.mode === "replication") open = smooth(clamp((fork() - u) * 8, 0, 1));
        if (p.mode === "transcription") {
          const d = Math.abs(u - bubble());
          open = smooth(clamp((0.09 - d) / 0.04, 0, 1));
          rna = u < bubble() + 0.05 ? smooth(clamp((bubble() + 0.05 - u) * 6, 0, 1)) : 0;
        }
        return { b, x: x0 + i * step, a1: ang, a2: ang + groove, open, rna };
      });
      // Strand point: radius R around the axis; when open, the two strands part vertically and flatten.
      const strand = (q: (typeof pts)[0], which: 1 | 2): [number, number, number] => {
        const a = which === 1 ? q.a1 : q.a2;
        const y = Math.cos(a) * R * (1 - q.open * 0.7), z = Math.sin(a) * (1 - q.open);
        const sep = q.open * R * 1.5 * (which === 1 ? -1 : 1);
        return [q.x, y + sep, z];
      };
      const shade = (c: string, z: number) => mix(c, "#000000", 0.55 * (1 - (z + 1) / 2));
      // Draw order: back backbone pieces, rungs, front pieces.
      const backbone = (which: 1 | 2, front: boolean) => {
        // Four pieces per base step, so the tube curves smoothly.
        const lerp = (u: (typeof pts)[0], v: (typeof pts)[0], f: number) => ({ ...u, x: u.x + (v.x - u.x) * f, a1: u.a1 + (v.a1 - u.a1) * f, a2: u.a2 + (v.a2 - u.a2) * f, open: u.open + (v.open - u.open) * f });
        for (let i = 0; i < (nbp - 1) * 4; i++) {
          const i0 = Math.floor(i / 4), f0 = (i % 4) / 4, f1 = ((i % 4) + 1) / 4;
          const a = strand(lerp(pts[i0], pts[i0 + 1], f0), which), b = strand(lerp(pts[i0], pts[i0 + 1], f1), which);
          const bead = i % 4 === 0;
          const z = (a[2] + b[2]) / 2;
          if (front !== z >= 0) continue;
          const c = which === 1 ? pal.back : pal.back2;
          g.strokeStyle = shade(c, z);
          g.lineWidth = (12 + 6 * z) * k;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
          g.stroke();
          // Specular streak along the tube.
          g.strokeStyle = alpha("#FFFFFF", 0.18 + 0.2 * Math.max(0, z));
          g.lineWidth = (3 + 2 * z) * k;
          g.beginPath();
          g.moveTo(a[0], a[1] - (3 + 2 * z) * k);
          g.lineTo(b[0], b[1] - (3 + 2 * z) * k);
          g.stroke();
          if (!bead) continue;
          // Phosphate bead: a lit sphere.
          const rb = (8 + 4 * z) * k;
          const sp = g.createRadialGradient(a[0] - rb * 0.35, a[1] - rb * 0.35, rb * 0.1, a[0], a[1], rb);
          sp.addColorStop(0, mix(c, "#FFFFFF", 0.6 + 0.2 * z));
          sp.addColorStop(0.6, shade(c, z));
          sp.addColorStop(1, mix(shade(c, z), "#000000", 0.4));
          g.fillStyle = sp;
          g.beginPath();
          g.arc(a[0], a[1], rb, 0, Math.PI * 2);
          g.fill();
        }
      };
      backbone(1, false);
      backbone(2, false);
      for (const q of pts) {
        const s1 = strand(q, 1), s2 = strand(q, 2);
        const z = (s1[2] + s2[2]) / 2;
        const pair = PAIR[q.b];
        if (q.open < 0.5) {
          // Paired rung: half per base, joined by the hydrogen bonds in the middle.
          const mx = (s1[0] + s2[0]) / 2, my = (s1[1] + s2[1]) / 2;
          g.lineWidth = (9 + 4 * z) * k;
          g.lineCap = "round";
          g.strokeStyle = shade(col[q.b], z);
          g.beginPath();
          g.moveTo(s1[0], s1[1]);
          g.lineTo(mx, my);
          g.stroke();
          g.strokeStyle = shade(col[pair], z);
          g.beginPath();
          g.moveTo(mx, my);
          g.lineTo(s2[0], s2[1]);
          g.stroke();
        } else {
          // Open: each strand shows its own base; in replication a new partner nucleotide docks.
          const stub = R * 0.75;
          for (const [s, base, dir] of [[s1, q.b, 1], [s2, pair, -1]] as [[number, number, number], string, number][]) {
            g.strokeStyle = col[base];
            g.lineWidth = 9 * k;
            g.beginPath();
            g.moveTo(s[0], s[1]);
            g.lineTo(s[0], s[1] + dir * stub * 0.5);
            g.stroke();
            if (p.mode === "replication") {
              const dock = smooth(clamp((q.open - 0.5) * 2, 0, 1));
              const nb = PAIR[base];
              const yy = s[1] + dir * stub * (0.5 + 1.6 * (1 - dock));
              g.strokeStyle = alpha(col[nb], 0.4 + 0.6 * dock);
              g.beginPath();
              g.moveTo(s[0], yy);
              g.lineTo(s[0], yy + dir * stub * 0.5);
              g.stroke();
              // The new strand's backbone forms behind the docked bases.
              g.fillStyle = alpha(L.accent, dock);
              g.beginPath();
              g.arc(s[0], yy + dir * stub * 0.5, 4.5 * k, 0, Math.PI * 2);
              g.fill();
            }
            if (p.mode === "transcription" && dir === -1 && q.rna > 0) {
              // mRNA nucleotide paired with the template strand (U for A).
              const rb = q.b === "A" ? "U" : q.b === "T" ? "A" : q.b;
              const peel = clamp(q.rna - (q.open > 0.9 ? 0 : 0), 0, 1);
              const yy = s[1] + stub * (0.6 + (1 - q.open) * 2.4);
              g.strokeStyle = alpha(col[rb], peel);
              g.beginPath();
              g.moveTo(s[0], yy);
              g.lineTo(s[0], yy + stub * 0.45);
              g.stroke();
              g.fillStyle = alpha("#FDE68A", peel);
              g.beginPath();
              g.arc(s[0], yy + stub * 0.45, 4 * k, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
      }
      backbone(1, true);
      backbone(2, true);
      if (p.mode === "transcription") {
        // RNA polymerase: a soft enzyme body around the bubble.
        const bx = x0 + bubble() * len;
        const gr = g.createRadialGradient(bx, 0, 0, bx, 0, R * 2.4);
        gr.addColorStop(0, alpha(L.highlight, 0.32));
        gr.addColorStop(1, alpha(L.highlight, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(bx, 0, R * 2.4, R * 2.1, 0, 0, Math.PI * 2);
        g.fill();
      }
    };

    const title = createRef<Txt>();
    const note = createRef<Txt>();
    const modeText = p.mode === "replication" ? "Nhân đôi: mỗi mạch cũ làm khuôn cho một mạch mới (bán bảo toàn)" : p.mode === "transcription" ? "Phiên mã: mạch khuôn → mRNA (U thay cho T)" : "A luôn bắt cặp T · G luôn bắt cặp C";
    st.cam.add(
      <Node>
        <Draw x={A.cx} y={A.cy} paint={paint} />
        {p.title ? label(ctx, p.title, { x: ctx.safe.x, y: ctx.safe.y + 30 * k, size: 50, align: "left", ref: title, fill: L.text }) : null}
        {p.showLegend
          ? legend(ctx, L, A.x, A.y + A.h - (p.mode === "transcription" ? 150 : 120) * k, [
              [col.A, "A — Adenine"],
              [col.T, "T — Thymine"],
              [col.G, "G — Guanine"],
              [col.C, "C — Cytosine"],
              ...(p.mode === "transcription" ? ([[col.U, "U — Uracil (RNA)"]] as [string, string][]) : []),
            ].slice(0, p.mode === "transcription" ? 5 : 4) as [string, string][], 22)
          : null}
        {label(ctx, modeText, { x: A.x + A.w, y: A.y + 20 * k, size: 26, align: "right", fill: L.dim, ref: note, opacity: 0 })}
      </Node>,
    );

    yield st.camera();
    yield t(D * st.speed, D, linear);
    if (p.title) yield fadeUp(title(), 0.5);
    yield* until(ctx.cue(0, 1));
    yield note().opacity(1, 0.5);
    const left = Math.max(1.5, D - ctx.cue(0, 1) - 0.4);
    if (p.mode === "replication") yield* fork(1.15, left, linear);
    if (p.mode === "transcription") yield* bubble(1.15, left, linear);
  },
});
