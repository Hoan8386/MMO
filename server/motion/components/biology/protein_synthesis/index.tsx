// Gene expression with the real genetic code. transcription: RNA polymerase opens the DNA double
// helix (drawn as two strands with paired bases), reads the template strand and builds mRNA from
// complementary nucleotides (A→U, T→A, G→C, C→G). translation: the ribosome moves along the mRNA codon
// by codon; for each codon a tRNA with the complementary anticodon brings its amino acid, a peptide
// bond joins it to the growing chain, until a stop codon releases the protein, which folds. The
// sequence is the prop `gene` (coding strand, 5'→3'), translated with the standard 64-codon table.
import { Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha, mix } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, smooth } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  stage: "both" | "transcription" | "translation";
  gene: string;
  labels: boolean;
}

const TAU = Math.PI * 2;
// Standard genetic code (mRNA codons).
const CODE: Record<string, string> = {};
{
  const b = "UCAG";
  const aa = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
  let i = 0;
  for (const x of b) for (const y of b) for (const z of b) CODE[x + y + z] = aa[i++];
}
const AA3: Record<string, string> = { F: "Phe", L: "Leu", S: "Ser", Y: "Tyr", C: "Cys", W: "Trp", P: "Pro", H: "His", Q: "Gln", R: "Arg", I: "Ile", M: "Met", T: "Thr", N: "Asn", K: "Lys", V: "Val", A: "Ala", D: "Asp", E: "Glu", G: "Gly", "*": "STOP" };
const BASE_COL: Record<string, string> = { A: "#FF6B81", T: "#FFD166", U: "#FFB000", G: "#21E6A1", C: "#00CFFF" };
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const TO_RNA: Record<string, string> = { A: "U", T: "A", G: "C", C: "G" }; // from the template base

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "biology", "genetics");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const nodes: Node[] = [];
    // Sequence: keep A/C/G/T, start at the first ATG, cut at the first in-frame stop.
    let seq = p.gene.toUpperCase().replace(/[^ACGT]/g, "");
    const atg = seq.indexOf("ATG");
    if (atg > 0) seq = seq.slice(atg);
    seq = seq.slice(0, Math.floor(seq.length / 3) * 3) || "ATGGCCTAA";
    const coding = seq.split("");
    const template = coding.map((b) => PAIR[b]);
    const mrna = coding.map((b) => (b === "T" ? "U" : b));
    const codons: string[] = [];
    for (let i = 0; i < mrna.length; i += 3) {
      const c = mrna.slice(i, i + 3).join("");
      codons.push(c);
      if (CODE[c] === "*") break;
    }
    const peptide = codons.map((c) => CODE[c]);
    const n = coding.length;

    const both = p.stage === "both";
    const T1 = p.stage === "translation" ? 0 : both ? D * 0.45 : D; // transcription runs 0.6 → T1
    const t2a = p.stage === "transcription" ? D : both ? T1 + 0.4 : 0.6; // translation start
    const cell = Math.min((A.w * 0.9) / n, 64 * k);
    const x0 = A.cx - (n * cell) / 2;
    const font = `800 ${cell * 0.5}px ${FONT}`;
    const base = (g: CanvasRenderingContext2D, x: number, y: number, b: string, dir: 1 | -1, a = 1) => {
      // A base as a coloured peg sticking from the backbone toward its partner.
      g.globalAlpha = a;
      g.fillStyle = BASE_COL[b];
      g.fillRect(x - cell * 0.3, dir > 0 ? y : y - cell * 0.9, cell * 0.6, cell * 0.9);
      g.fillStyle = "#0B1020";
      g.font = font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b, x, y + (dir > 0 ? cell * 0.45 : -cell * 0.45));
      g.globalAlpha = 1;
    };

    if (p.stage !== "translation") {
      // ---- transcription.
      const yC = A.y + A.h * (both ? 0.22 : 0.35), gap = cell * 2.2;
      const yT = yC + gap;
      const prog = () => clamp((clock() - 0.6) / (T1 - 1.2), 0, 1);
      const pos = () => prog() * n; // polymerase position in bases
      nodes.push(
        <Draw
          opacity={() => (both && clock() > T1 ? clamp(1 - (clock() - T1) / 0.4, 0, 1) : 1)}
          paint={(g) => {
            const t = clock(), ps = pos();
            // Bubble: the strands part around the polymerase (±4 bases).
            const open = (i: number) => smooth(clamp(1 - Math.abs(i + 0.5 - ps) / 5, 0, 1)) * (prog() > 0 && prog() < 1 ? 1 : 0);
            // Backbones.
            for (const [y0, sgn] of [[yC, -1], [yT, 1]] as [number, number][]) {
              g.strokeStyle = sgn < 0 ? "#9B5DE5" : "#7A7FA8";
              g.lineWidth = 6 * k;
              g.beginPath();
              for (let i = 0; i <= n; i++) {
                const x = x0 + i * cell, y = y0 + sgn * open(Math.min(n - 1, i)) * cell * 1.2;
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }
            for (let i = 0; i < n; i++) {
              const x = x0 + (i + 0.5) * cell, o = open(i);
              base(g, x, yC - o * cell * 1.2, coding[i], 1);
              base(g, x, yT + o * cell * 1.2, template[i], -1);
            }
            // mRNA: built behind the polymerase, peeling away below the template.
            const made = Math.floor(ps);
            const yR = yT + cell * 2.6;
            g.strokeStyle = BASE_COL.U;
            g.lineWidth = 5 * k;
            g.beginPath();
            g.moveTo(x0, yR);
            g.lineTo(x0 + made * cell, yR);
            g.stroke();
            for (let i = 0; i < made; i++) base(g, x0 + (i + 0.5) * cell, yR, mrna[i], -1);
            // RNA polymerase: a translucent blob around the bubble.
            if (prog() > 0 && prog() < 1) {
              const px = x0 + ps * cell, py = (yC + yT) / 2 + cell * 0.6;
              const gr = g.createRadialGradient(px, py, 0, px, py, cell * 3.2);
              gr.addColorStop(0, alpha(L.highlight, 0.45));
              gr.addColorStop(1, alpha(L.highlight, 0.05));
              g.fillStyle = gr;
              g.beginPath();
              g.ellipse(px, py, cell * 3.2, cell * 2.6 + Math.sin(t * 3) * 3 * k, 0, 0, TAU);
              g.fill();
            }
            g.font = `700 ${22 * k}px ${FONT}`;
            g.textAlign = "left";
            g.fillStyle = L.dim;
            g.fillText("mạch mã gốc ADN 3'→5'", x0, yT + cell * 1.4 + 16 * k);
            g.fillText("mạch bổ sung 5'→3'", x0, yC - cell * 1.3);
            if (made > 0) {
              g.fillStyle = BASE_COL.U;
              g.fillText("mRNA 5'→3'", x0 + made * cell + 12 * k, yR - cell * 0.4);
            }
          }}
        />,
      );
    }
    if (p.stage !== "transcription") {
      // ---- translation.
      const yR = A.y + A.h * (both ? 0.62 : 0.55);
      const nc = codons.length;
      const per = (D - t2a - 1.6) / nc; // seconds per codon
      const step = () => clamp((clock() - t2a) / per, 0, nc); // codons read (fractional)
      const ribX = () => x0 + (Math.min(Math.floor(step()), nc - 1) * 3 + 1.5) * cell + smooth(step() % 1 > 0.7 ? (step() % 1 - 0.7) / 0.3 : 0) * cell * 3;
      const chainY = yR - cell * 5.2;
      nodes.push(
        <Draw
          opacity={() => clamp((clock() - (t2a - 0.4)) / 0.4, 0, 1)}
          paint={(g) => {
            const s = step(), i = Math.min(Math.floor(s), nc - 1), f = s - Math.floor(s);
            // mRNA strand with codon brackets.
            g.strokeStyle = BASE_COL.U;
            g.lineWidth = 5 * k;
            g.beginPath();
            g.moveTo(x0, yR);
            g.lineTo(x0 + n * cell, yR);
            g.stroke();
            for (let j = 0; j < n; j++) base(g, x0 + (j + 0.5) * cell, yR, mrna[j], -1);
            for (let c = 0; c < nc; c++) {
              g.strokeStyle = alpha(L.ink, c === i ? 0.9 : 0.25);
              g.lineWidth = 2 * k;
              g.strokeRect(x0 + c * 3 * cell + 2 * k, yR - cell * 1.0, cell * 3 - 4 * k, cell * 2.0);
            }
            // Ribosome: large and small subunits sandwiching the mRNA.
            const rx = ribX();
            g.fillStyle = alpha("#9B5DE5", 0.55);
            g.beginPath();
            g.ellipse(rx, yR - cell * 1.9, cell * 3.2, cell * 2.1, 0, 0, TAU);
            g.fill();
            g.fillStyle = alpha("#C084FC", 0.6);
            g.beginPath();
            g.ellipse(rx, yR + cell * 1.4, cell * 2.6, cell * 1.0, 0, 0, TAU);
            g.fill();
            // Incoming tRNA for the current codon: arrives, pairs, hands over its amino acid.
            const c = codons[i];
            if (CODE[c] !== "*" && clock() > t2a) {
              const arrive = smooth(clamp(f / 0.35, 0, 1));
              const tx = x0 + (i * 3 + 1.5) * cell, ty = yR - cell * 1.15 - (1 - arrive) * cell * 4;
              g.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
              // Cloverleaf body.
              g.fillStyle = "#3FA9FF";
              g.beginPath();
              g.moveTo(tx - cell * 1.3, ty);
              g.lineTo(tx + cell * 1.3, ty);
              g.lineTo(tx + cell * 0.5, ty - cell * 1.6);
              g.lineTo(tx - cell * 0.5, ty - cell * 1.6);
              g.closePath();
              g.fill();
              // Anticodon (complementary to the codon).
              for (let j = 0; j < 3; j++) {
                const ab = { A: "U", U: "A", G: "C", C: "G" }[c[j]] ?? "N";
                base(g, tx + (j - 1) * cell, ty, ab, -1);
              }
              g.globalAlpha = 1;
              if (f < 0.6) {
                // Amino acid riding on top of the tRNA.
                g.fillStyle = mix(L.accent, "#FFFFFF", 0.1);
                g.beginPath();
                g.arc(tx, ty - cell * 2.1, cell * 0.62, 0, TAU);
                g.fill();
                g.fillStyle = "#0B1020";
                g.font = `800 ${cell * 0.36}px ${FONT}`;
                g.textAlign = "center";
                g.fillText(AA3[CODE[c]], tx, ty - cell * 2.1);
              }
            }
            // Polypeptide chain: amino acids added so far, as beads; folds after the stop.
            const done = Math.min(nc - (CODE[codons[nc - 1]] === "*" ? 1 : 0), Math.floor(s + (f >= 0.6 ? 1 : 0)));
            const fold = smooth(clamp((clock() - (t2a + per * nc)) / 1.2, 0, 1));
            const beads: [number, number][] = [];
            for (let j = 0; j < done; j++) {
              // Straight chain trailing from the ribosome; folded = a compact spiral.
              const sx = rx - (done - 1 - j) * cell * 1.05, sy = chainY;
              const a = j * 1.1, r = cell * (0.6 + j * 0.18);
              const fx = A.cx + Math.cos(a) * r, fy = chainY - cell * 1.2 + Math.sin(a) * r * 0.7;
              beads.push([sx + (fx - sx) * fold, sy + (fy - sy) * fold]);
            }
            g.strokeStyle = alpha(L.ink, 0.6);
            g.lineWidth = 3 * k;
            g.beginPath();
            beads.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
            beads.forEach(([x, y], j) => {
              g.fillStyle = mix(L.accent, L.secondary, j / Math.max(1, done - 1));
              g.beginPath();
              g.arc(x, y, cell * 0.5, 0, TAU);
              g.fill();
              g.fillStyle = "#0B1020";
              g.font = `800 ${cell * 0.32}px ${FONT}`;
              g.textAlign = "center";
              g.fillText(AA3[peptide[j]], x, y);
            });
          }}
        />,
      );
      // Live readout of the current codon.
      nodes.push(
        <Txt
          text={() => {
            if (clock() < t2a) return "";
            const s = step(), i = Math.min(Math.floor(s), nc - 1), c = codons[i];
            return s >= nc ? `Gặp mã kết thúc → chuỗi polypeptide rời ribosome và gấp nếp` : `codon ${c} → ${AA3[CODE[c]]}${CODE[c] === "*" ? " (kết thúc)" : ""}`;
          }}
          x={A.cx}
          y={A.y + A.h - 18 * k}
          fontFamily={FONT}
          fontWeight={800}
          fontSize={30 * k}
          fill={L.text}
        />,
      );
    }
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    if (p.labels) {
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{label(ctx, p.stage === "translation" ? "Dịch mã tại ribosome" : "Phiên mã trong nhân → dịch mã ở tế bào chất", { x: A.x + 10 * k, y: A.y + 24 * k, size: 30, align: "left", fill: L.accent })}</Node>);
    }

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
    yield* world().opacity(1, 0.5, easeOutCubic);
    for (const s of shows) yield s(1, 0.5);
    void Rect;
    void Line;
    void TO_RNA;
  },
});
