// Magnetism with fields computed from their sources. bar_magnet: two poles (1/r² each) — field lines
// traced numerically from N to S (and through the magnet S → N), compass needles turning to the local
// field, optional iron filings; wire: a straight current out of the page, circles of B ∝ 1/r and the
// right-hand rule; solenoid: the field of its turns summed (wires out of the page on top, into it at
// the bottom) — straight and strong inside, like a bar magnet outside; lorentz: a charge in a uniform
// field B into the page moves on a circle r = mv/(qB), the force qv×B always toward the centre;
// induction: a magnet pushed in and out of a coil — the flux Φ(t) through the coil and the EMF −dΦ/dt
// on a galvanometer and a graph, the induced current opposing the change (Lenz's law).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, createSignal, easeInOutCubic, easeOutCubic, linear, type ThreadGenerator } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { look, alpha } from "../../../shared/palettes";
import { stage, area } from "../../../shared/stage";
import { Draw } from "../../../shared/raster";
import { FONT, label } from "../../../shared/ui";
import { until, clamp, rng } from "../../../shared/time";
import { num } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  mode: "bar_magnet" | "wire" | "solenoid" | "lorentz" | "induction";
  lines: number;
  compasses: boolean;
  filings: boolean;
  flow: boolean;
  labels: boolean;
  charge: "positive" | "negative";
}

type XY = [number, number];
const TAU = Math.PI * 2;

export default defineAnimation<Props>({
  *run(ctx) {
    const { props: p, k } = ctx;
    const L = look(ctx, "physics", "electromagnetism");
    const st = stage(ctx, L);
    const A = area(ctx, !!p.title);
    const D = ctx.duration;
    const clock = createSignal(0);
    const q = L.q;
    const R0 = rng(L.seed + 3);
    const cx = A.cx, cy = A.cy;
    const S = Math.min(A.w, A.h) * 0.5; // one field unit in pixels
    const N_COL = L.highlight, S_COL = L.primary;
    const nodes: Node[] = [];
    const shows: ReturnType<typeof createSignal<number>>[] = [];
    const reveal = createSignal(0); // field lines drawing on

    // ---- field of the mode (field units, origin at the stage centre).
    let B: (x: number, y: number) => XY = () => [0, 0];
    const poles: { x: number; y: number; m: number }[] = [];
    const wires: { x: number; y: number; I: number }[] = [];
    const magW = 0.62, magH = 0.16;
    if (p.mode === "bar_magnet") {
      poles.push({ x: magW / 2 - 0.04, y: 0, m: 1 }, { x: -magW / 2 + 0.04, y: 0, m: -1 });
    } else if (p.mode === "wire") wires.push({ x: 0, y: 0, I: 1 });
    else if (p.mode === "solenoid") {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const x = -0.55 + (1.1 * i) / (n - 1);
        wires.push({ x, y: -0.2, I: 1 }, { x, y: 0.2, I: -1 });
      }
    }
    if (poles.length || wires.length)
      B = (x, y) => {
        let bx = 0, by = 0;
        for (const pl of poles) {
          const dx = x - pl.x, dy = y - pl.y, r3 = Math.pow(dx * dx + dy * dy + 1e-4, 1.5);
          bx += (pl.m * dx) / r3;
          by += (pl.m * dy) / r3;
        }
        for (const w of wires) {
          // Out of the page (I > 0): counter-clockwise circles (screen y down → clockwise sign flip).
          const dx = x - w.x, dy = y - w.y, r2 = dx * dx + dy * dy + 1e-4;
          bx += (w.I * dy) / r2 * 0.25;
          by += (-w.I * dx) / r2 * 0.25;
        }
        return [bx, by];
      };
    const toPx = (x: number, y: number): XY => [cx + x * S, cy + y * S];

    // ---- streamlines (RK2 on the unit field direction).
    const trace = (x: number, y: number, dir: number, maxN = 700, stop?: (x: number, y: number) => boolean): XY[] => {
      const pts: XY[] = [toPx(x, y)];
      const h = 0.012;
      for (let i = 0; i < maxN; i++) {
        let [bx, by] = B(x, y);
        let m = Math.hypot(bx, by) || 1;
        const mx = x + (dir * h * bx) / m / 2, my = y + (dir * h * by) / m / 2;
        [bx, by] = B(mx, my);
        m = Math.hypot(bx, by) || 1;
        x += (dir * h * bx) / m;
        y += (dir * h * by) / m;
        pts.push(toPx(x, y));
        if (Math.abs(x) > (A.w / S) * 0.55 || Math.abs(y) > (A.h / S) * 0.55) break;
        if (stop && stop(x, y)) break;
      }
      return pts;
    };
    const fieldLines: XY[][] = [];
    if (p.mode === "bar_magnet") {
      const n = p.lines;
      const N = poles[0];
      const Sp = poles[1];
      const nearS = (x: number, y: number) => Math.hypot(x - Sp.x, y - Sp.y) < 0.03;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * TAU;
        const sx = N.x + Math.cos(a) * 0.035, sy = N.y + Math.sin(a) * 0.035;
        const line = trace(sx, sy, 1, 900, nearS);
        fieldLines.push(line);
        // A line that leaves the frame instead of reaching S: its mirror image arrives at S from the
        // other side (traced backwards from S), so both poles show their open lines.
        const [ex, ey] = line[line.length - 1];
        if (Math.hypot((ex - cx) / S - Sp.x, (ey - cy) / S - Sp.y) > 0.05) {
          const b = Math.PI - a;
          fieldLines.push(trace(Sp.x + Math.cos(b) * 0.035, Sp.y + Math.sin(b) * 0.035, -1, 900).reverse());
        }
      }
    } else if (p.mode === "wire") {
      for (let i = 1; i <= Math.round(p.lines / 2); i++) {
        const r = 0.08 * i * (1 + i * 0.12);
        fieldLines.push(Array.from({ length: 121 }, (_, j) => toPx(Math.cos((j / 120) * TAU) * r, Math.sin((j / 120) * TAU) * r)));
      }
    } else if (p.mode === "solenoid") {
      const n = p.lines;
      for (let i = 0; i < n; i++) {
        const y = -0.17 + (0.34 * (i + 0.5)) / n;
        fieldLines.push([...trace(0, y, -1, 900).reverse(), ...trace(0, y, 1, 900).slice(1)]);
      }
    }
    // Direction of each line at a fraction u of its length (for moving arrows).
    const along = (pts: XY[], u: number): [XY, number] => {
      const i = Math.min(pts.length - 2, Math.max(0, Math.floor(u * (pts.length - 1))));
      return [pts[i], Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])];
    };
    if (fieldLines.length) {
      nodes.push(
        <Node>
          {fieldLines.map((pts) => (
            <Line points={pts} stroke={alpha(L.secondary, 0.75)} lineWidth={L.lw(2.6 * k)} end={reveal} {...L.glow(L.secondary, 6 * k)} />
          ))}
          {p.flow ? (
            <Draw
              paint={(g) => {
                if (reveal() < 1) return;
                const t = clock();
                g.fillStyle = L.ink;
                for (const pts of fieldLines)
                  for (let j = 0; j < 3; j++) {
                    const u = (((t * 0.06 * st.speed + j / 3) % 1) + 1) % 1;
                    const [[x, y], a] = along(pts, u);
                    g.save();
                    g.translate(x, y);
                    g.rotate(a);
                    g.beginPath();
                    g.moveTo(9 * k, 0);
                    g.lineTo(-6 * k, -6 * k);
                    g.lineTo(-6 * k, 6 * k);
                    g.closePath();
                    g.fill();
                    g.restore();
                  }
              }}
            />
          ) : null}
        </Node>,
      );
    }
    // Iron filings: short segments along B, denser near the poles.
    if (p.filings && (p.mode === "bar_magnet" || p.mode === "solenoid" || p.mode === "wire")) {
      const segs = Array.from({ length: Math.round(1400 * q) }, () => [(R0() - 0.5) * (A.w / S), (R0() - 0.5) * (A.h / S)]);
      const fil = createSignal(0);
      shows.push(fil);
      nodes.unshift(
        <Draw
          paint={(g) => {
            g.strokeStyle = alpha(L.ink, 0.35 * fil());
            g.lineWidth = 1.6 * k;
            for (const [x, y] of segs) {
              if (p.mode === "bar_magnet" && Math.abs(x) < magW / 2 && Math.abs(y) < magH / 2) continue;
              const [bx, by] = B(x, y), m = Math.hypot(bx, by) || 1;
              const l = 9 * k;
              const [px, py] = toPx(x, y);
              g.beginPath();
              g.moveTo(px - (bx / m) * l, py - (by / m) * l);
              g.lineTo(px + (bx / m) * l, py + (by / m) * l);
              g.stroke();
            }
          }}
        />,
      );
    }
    // Compass needles on a ring / grid, turning from random to the field direction.
    if (p.compasses && (p.mode === "bar_magnet" || p.mode === "wire" || p.mode === "solenoid")) {
      const align = createSignal(0);
      shows.push(align);
      const spots: XY[] =
        p.mode === "wire"
          ? Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * TAU) * 0.42, Math.sin((i / 8) * TAU) * 0.42])
          : [[-0.75, 0], [0.75, 0], [0, -0.42], [0, 0.42], [-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]];
      for (const [x, y] of spots) {
        const [bx, by] = B(x, y);
        const target = (Math.atan2(by, bx) * 180) / Math.PI;
        const start = R0() * 360 - 180;
        const [px, py] = toPx(x, y);
        nodes.push(
          <Node x={px} y={py}>
            <Circle size={56 * k} fill={alpha(L.bg, 0.85)} stroke={alpha(L.ink, 0.6)} lineWidth={2 * k} />
            <Node rotation={() => start + (((target - start + 540) % 360) - 180) * align()}>
              <Line points={[[0, 0], [22 * k, 0]]} stroke={N_COL} lineWidth={6 * k} lineCap="round" />
              <Line points={[[0, 0], [-22 * k, 0]]} stroke={alpha(L.ink, 0.8)} lineWidth={6 * k} lineCap="round" />
            </Node>
          </Node>,
        );
      }
    }

    // ---- sources drawn on top.
    if (p.mode === "bar_magnet") {
      const [mx, my] = toPx(0, 0);
      nodes.push(
        <Node>
          <Rect x={mx - (magW * S) / 4} y={my} width={(magW * S) / 2} height={magH * S} fill={S_COL} radius={[8 * k, 0, 0, 8 * k]} />
          <Rect x={mx + (magW * S) / 4} y={my} width={(magW * S) / 2} height={magH * S} fill={N_COL} radius={[0, 8 * k, 8 * k, 0]} />
          <Txt text="S" x={mx - (magW * S) / 4} y={my} fontFamily={FONT} fontWeight={900} fontSize={44 * k} fill="#FFFFFF" />
          <Txt text="N" x={mx + (magW * S) / 4} y={my} fontFamily={FONT} fontWeight={900} fontSize={44 * k} fill="#FFFFFF" />
        </Node>,
      );
    } else if (p.mode === "wire") {
      nodes.push(
        <Node>
          <Circle x={cx} y={cy} size={56 * k} fill={L.accent} stroke="#FFFFFF" lineWidth={3 * k} {...L.glow(L.accent, 16 * k)} />
          <Circle x={cx} y={cy} size={14 * k} fill="#1B1B1B" />
        </Node>,
      );
    } else if (p.mode === "solenoid") {
      nodes.push(
        <Node>
          <Rect x={cx} y={cy} width={1.2 * S} height={0.4 * S} stroke={alpha(L.ink, 0.25)} lineWidth={2 * k} radius={10 * k} />
          {wires.map((w) => {
            const [x, y] = toPx(w.x, w.y);
            return (
              <Node x={x} y={y}>
                <Circle size={28 * k} fill={L.accent} stroke="#FFFFFF" lineWidth={2 * k} />
                {w.I > 0 ? <Circle size={8 * k} fill="#1B1B1B" /> : <Txt text="×" fontFamily={FONT} fontWeight={900} fontSize={26 * k} fill="#1B1B1B" />}
              </Node>
            );
          })}
        </Node>,
      );
    }

    // ---- lorentz: uniform B into the page, a charge circling.
    if (p.mode === "lorentz") {
      const sgn = p.charge === "positive" ? 1 : -1;
      const rr = 0.42; // radius in field units (r = mv/qB)
      const w = (0.9 * st.speed * TAU) / 8;
      const cxo = 0, cyo = 0;
      // Positive charge, B into the page: F = qv×B turns it counter-clockwise on screen.
      const ang = () => -sgn * w * clock() + Math.PI / 2;
      const pos = (): XY => toPx(cxo + Math.cos(ang()) * rr, cyo + Math.sin(ang()) * rr);
      const vdir = (): XY => [Math.sin(ang()) * sgn, -Math.cos(ang()) * sgn];
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              g.fillStyle = alpha(L.ink, 0.35);
              g.font = `700 ${22 * k}px ${FONT}`;
              g.textAlign = "center";
              g.textBaseline = "middle";
              for (let x = A.x + 40 * k; x < A.x + A.w; x += 90 * k) for (let y = A.y + 40 * k; y < A.y + A.h; y += 90 * k) g.fillText("×", x, y);
              // Trail of the orbit.
              g.strokeStyle = alpha(sgn > 0 ? L.highlight : L.secondary, 0.6);
              g.lineWidth = L.lw(3 * k);
              g.beginPath();
              const a0 = ang();
              for (let i = 0; i <= 80; i++) {
                const a = a0 + (sgn * i * 0.04);
                const [x, y] = toPx(Math.cos(a) * rr, Math.sin(a) * rr);
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }}
          />
          <Line points={() => [pos(), [pos()[0] + vdir()[0] * 140 * k, pos()[1] + vdir()[1] * 140 * k]]} stroke={L.accent} lineWidth={L.lw(5 * k)} endArrow arrowSize={16 * k} />
          <Txt text="v" x={() => pos()[0] + vdir()[0] * 160 * k} y={() => pos()[1] + vdir()[1] * 160 * k} fontFamily={FONT} fontWeight={800} fontSize={28 * k} fill={L.accent} />
          <Line points={() => [pos(), [pos()[0] + (cx - pos()[0]) * 0.45, pos()[1] + (cy - pos()[1]) * 0.45]]} stroke={L.highlight} lineWidth={L.lw(5 * k)} endArrow arrowSize={16 * k} />
          <Txt text="F = qv×B" x={() => pos()[0] + (cx - pos()[0]) * 0.55} y={() => pos()[1] + (cy - pos()[1]) * 0.55 - 20 * k} fontFamily={FONT} fontWeight={800} fontSize={24 * k} fill={L.highlight} />
          <Circle position={pos} size={44 * k} fill={sgn > 0 ? L.highlight : L.secondary} stroke="#FFFFFF" lineWidth={3 * k} {...L.glow(sgn > 0 ? L.highlight : L.secondary, 18 * k)} />
          <Txt text={sgn > 0 ? "+" : "−"} position={pos} fontFamily={FONT} fontWeight={900} fontSize={34 * k} fill="#FFFFFF" />
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(
        <Node opacity={s}>
          {label(ctx, "B hướng vào trong màn hình (×)", { x: A.x + 20 * k, y: A.y + 30 * k, size: 26, align: "left", fill: L.dim })}
          {label(ctx, "r = mv / (|q|B) — lực luôn vuông góc vận tốc nên chỉ đổi hướng", { x: A.cx, y: A.y + A.h - 20 * k, size: 28, fill: L.text })}
        </Node>,
      );
    }

    // ---- induction: magnet in and out of a coil; Φ and EMF.
    if (p.mode === "induction") {
      const coilX = cx - S * 0.25, coilY = cy - S * 0.05, coilR = S * 0.22;
      const mx = () => coilX + S * (0.95 - 0.75 * (0.5 - 0.5 * Math.cos((clock() / D) * TAU * 2)));
      // Flux of a dipole through a coaxial loop at distance d: Φ ∝ R²/(R² + d²)^{3/2}.
      const flux = (t: number) => {
        const d = (coilX + S * (0.95 - 0.75 * (0.5 - 0.5 * Math.cos((t / D) * TAU * 2))) - coilX) / S;
        return 0.22 ** 2 / Math.pow(0.22 ** 2 + d * d, 1.5);
      };
      const emf = (t: number) => -(flux(t + 0.01) - flux(t - 0.01)) / 0.02;
      const emfMax = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(emf((i / 200) * D))));
      nodes.push(
        <Node>
          <Draw
            paint={(g) => {
              // Coil: ellipses (front halves drawn after the magnet would need z-order; drawn as a side view).
              for (let i = 0; i < 7; i++) {
                const x = coilX - S * 0.18 + i * S * 0.06;
                g.strokeStyle = "#D98B3A";
                g.lineWidth = 6 * k;
                g.beginPath();
                g.ellipse(x, coilY, 16 * k, coilR, 0, 0, TAU);
                g.stroke();
              }
              // Induced current arrows on the front of the coil, direction from the sign of the EMF.
              const e = emf(clock()) / emfMax;
              if (Math.abs(e) > 0.05) {
                g.fillStyle = L.highlight;
                for (let i = 0; i < 7; i++) {
                  const x = coilX - S * 0.18 + i * S * 0.06, y = coilY + (e > 0 ? -1 : 1) * coilR * 0.2;
                  g.beginPath();
                  g.moveTo(x + 10 * k, y);
                  g.lineTo(x - 8 * k, y + (e > 0 ? 9 : -9) * k);
                  g.lineTo(x - 8 * k, y - (e > 0 ? 9 : -9) * k);
                  g.fill();
                }
              }
              // Wires to the galvanometer.
              g.strokeStyle = alpha(L.ink, 0.6);
              g.lineWidth = 3 * k;
              g.beginPath();
              g.moveTo(coilX - S * 0.18, coilY + coilR);
              g.lineTo(coilX - S * 0.18, coilY + coilR + S * 0.25);
              g.lineTo(coilX + S * 0.18, coilY + coilR + S * 0.25);
              g.lineTo(coilX + S * 0.18, coilY + coilR);
              g.stroke();
            }}
          />
          <Node x={mx} y={coilY}>
            <Rect x={-S * 0.1} width={S * 0.2} height={S * 0.12} fill={N_COL} radius={[6 * k, 0, 0, 6 * k]} />
            <Rect x={S * 0.1} width={S * 0.2} height={S * 0.12} fill={S_COL} radius={[0, 6 * k, 6 * k, 0]} />
            <Txt text="N" x={-S * 0.1} fontFamily={FONT} fontWeight={900} fontSize={34 * k} fill="#FFFFFF" />
            <Txt text="S" x={S * 0.1} fontFamily={FONT} fontWeight={900} fontSize={34 * k} fill="#FFFFFF" />
          </Node>
          <Node x={coilX} y={coilY + coilR + S * 0.25}>
            <Circle size={110 * k} fill={L.bg} stroke={L.text} lineWidth={3 * k} />
            <Line points={[[0, 30 * k], [0, -36 * k]]} rotation={() => clamp(emf(clock()) / emfMax, -1, 1) * 55} stroke={L.highlight} lineWidth={4 * k} lineCap="round" />
            <Txt text="G" y={34 * k} fontFamily={FONT} fontWeight={800} fontSize={22 * k} fill={L.dim} />
          </Node>
          <Draw
            paint={(g) => {
              const gx = A.x + A.w * 0.6, gw = A.w * 0.36, gy = A.y + A.h * 0.62, gh = A.h * 0.3;
              g.strokeStyle = alpha(L.ink, 0.3);
              g.lineWidth = 1.5 * k;
              g.beginPath();
              g.moveTo(gx, gy + gh / 2);
              g.lineTo(gx + gw, gy + gh / 2);
              g.stroke();
              const N2 = 200, t = clock();
              const fmax = flux(D / 2) || 1;
              for (const [fn, col, sc] of [[flux, L.secondary, 1 / Math.max(flux(0), fmax)], [emf, L.highlight, 1 / emfMax]] as [(t: number) => number, string, number][]) {
                g.strokeStyle = col;
                g.lineWidth = L.lw(3 * k);
                g.beginPath();
                for (let i = 0; i <= N2; i++) {
                  const tt = (i / N2) * D;
                  if (tt > t) break;
                  const v = fn(tt) * sc * (fn === flux ? 1 : 0.5);
                  const x = gx + (tt / D) * gw, y = gy + gh / 2 - v * gh * (fn === flux ? 0.45 : 0.9);
                  if (i) g.lineTo(x, y);
                  else g.moveTo(x, y);
                }
                g.stroke();
              }
              g.font = `700 ${21 * k}px ${FONT}`;
              g.fillStyle = L.secondary;
              g.fillText("từ thông Φ", gx, gy - 6 * k);
              g.fillStyle = L.highlight;
              g.fillText("suất điện động e = −dΦ/dt", gx + 150 * k, gy - 6 * k);
            }}
          />
        </Node>,
      );
      const s = createSignal(0);
      shows.push(s);
      nodes.push(<Node opacity={s}>{label(ctx, "Định luật Lenz: dòng cảm ứng chống lại sự biến thiên từ thông", { x: A.cx, y: A.y + 30 * k, size: 27, fill: L.text })}</Node>);
    }

    // ---- captions per mode.
    const cap = createSignal(0);
    const capText: Record<string, string> = {
      bar_magnet: "Đường sức đi ra từ cực N, vào cực S — kim la bàn nằm dọc đường sức",
      wire: "Quy tắc nắm tay phải: dòng điện hướng ra (•), đường sức là các vòng tròn ngược chiều kim đồng hồ",
      solenoid: "Bên trong ống dây: từ trường đều và mạnh; bên ngoài giống nam châm thẳng",
    };
    if (capText[p.mode] && p.labels) nodes.push(<Node opacity={cap}>{label(ctx, capText[p.mode], { x: A.cx, y: A.y + A.h - 16 * k, size: 27, fill: L.text })}</Node>);

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
    const steps: (() => ThreadGenerator)[] = [];
    if (fieldLines.length) steps.push(() => reveal(1, 1.6, easeInOutCubic));
    shows.forEach((s) => steps.push(() => s(1, 0.8, st.ease)));
    if (capText[p.mode] && p.labels) steps.push(() => cap(1, 0.5));
    for (let i = 0; i < steps.length; i++) {
      yield* until(ctx.cue(i, steps.length + 1));
      yield steps[i]();
    }
    void num;
  },
});
