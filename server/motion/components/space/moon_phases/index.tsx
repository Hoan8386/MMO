// Moon phases from geometry. Left: top view, Sun light from the left, the Moon on its orbit
// with its sunlit half always facing the Sun. Right: the Moon as seen from Earth (northern
// hemisphere), whose lit shape follows the elongation α: lit fraction = (1 − cos α) / 2.
// One synodic month = 29.53 days; time runs at daysPerSecond (printed on screen).
import { Circle, Line, Node, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, linear } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label, scaleNote } from "../../../shared/ui";
import { num } from "../../../shared/format";
import { fadeUp, popIn } from "../../../transitions";

interface Props {
  title: string;
  daysPerSecond: number;
  startDay: number;
  showNames: boolean;
  showFraction: boolean;
  scaleNote: string;
}

const SYNODIC = 29.530589;
const NAMES = [
  "Trăng mới (sóc)",
  "Trăng lưỡi liềm đầu tháng",
  "Bán nguyệt đầu tháng",
  "Trăng khuyết đầu tháng",
  "Trăng tròn (vọng)",
  "Trăng khuyết cuối tháng",
  "Bán nguyệt cuối tháng",
  "Trăng lưỡi liềm cuối tháng",
];

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const clock = createSignal(0);
    const day = () => (p.startDay + clock() * p.daysPerSecond) % SYNODIC;
    const alpha = () => (2 * Math.PI * day()) / SYNODIC; // elongation: 0 new, π full
    const lit = () => (1 - Math.cos(alpha())) / 2;
    const phaseName = () => NAMES[Math.round((day() / SYNODIC) * 8) % 8];

    // Top view on the left part of the frame.
    const ex = safe.x + safe.w * 0.32, ey = safe.y + safe.h / 2 + 40 * k;
    const orbitR = Math.min(safe.w * 0.2, safe.h * 0.33);
    const earthR = 46 * k, moonR = 24 * k;
    const moonPos = () => [ex - orbitR * Math.cos(alpha()), ey + orbitR * Math.sin(alpha())] as [number, number];
    // As seen from Earth, on the right.
    const vx = safe.x + safe.w * 0.78, vy = safe.y + safe.h / 2 + 10 * k, VR = Math.min(safe.h * 0.26, safe.w * 0.13);
    const litShape = () => {
      const a = alpha(), waxing = a <= Math.PI, side = waxing ? 1 : -1;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const y = -VR + (2 * VR * i) / 40, w = Math.sqrt(Math.max(0, VR * VR - y * y));
        pts.push([vx + side * w, vy + y]); // bright limb
      }
      for (let i = 40; i >= 0; i--) {
        const y = -VR + (2 * VR * i) / 40, w = Math.sqrt(Math.max(0, VR * VR - y * y));
        pts.push([vx + side * w * Math.cos(a), vy + y]); // terminator: an ellipse of half-width w·cosα
      }
      return pts;
    };

    const titleTxt = createRef<Txt>();
    const top = createRef<Node>();
    const seen = createRef<Node>();
    const nameTxt = createRef<Txt>(), fracTxt = createRef<Txt>(), dayTxt = createRef<Txt>();
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        <Node ref={top} opacity={0}>
          {[-1, 0, 1].map((j) => (
            <Line points={[[safe.x + 10 * k, ey + j * orbitR * 0.7], [safe.x + 110 * k, ey + j * orbitR * 0.7]]} stroke="#FFC93C" lineWidth={5 * k} endArrow arrowSize={14 * k} />
          ))}
          {label(ctx, "Ánh sáng Mặt Trời", { x: safe.x + 10 * k, y: ey - orbitR * 0.7 - 34 * k, size: 22, fill: "#FFC93C", align: "left" })}
          <Circle x={ex} y={ey} size={orbitR * 2} stroke={theme.line} lineWidth={3 * k} lineDash={[10 * k, 10 * k]} />
          <Circle x={ex} y={ey} size={earthR * 2} fill="#4F9BFF" />
          <Circle x={ex} y={ey} size={earthR * 2} startAngle={-90} endAngle={90} closed fill="#020617" opacity={0.55} />
          {label(ctx, "Trái Đất", { x: ex, y: ey + earthR + 26 * k, size: 22, fill: theme.muted })}
          <Node position={moonPos}>
            <Circle size={moonR * 2} fill="#D9DDE3" />
            <Circle size={moonR * 2} startAngle={-90} endAngle={90} closed fill="#1F2633" />
          </Node>
          <Line points={() => [[ex, ey], moonPos()]} stroke={theme.accent} lineWidth={2 * k} lineDash={[6 * k, 6 * k]} opacity={0.6} />
          {label(ctx, "nhìn từ trên xuống", { x: ex, y: ey - orbitR - 40 * k, size: 22, fill: theme.muted })}
        </Node>
        <Node ref={seen} opacity={0}>
          <Circle x={vx} y={vy} size={VR * 2} fill="#1F2633" stroke={theme.line} lineWidth={2 * k} />
          <Line points={litShape} closed fill="#E8EBF0" />
          {label(ctx, "nhìn từ Trái Đất", { x: vx, y: vy - VR - 40 * k, size: 22, fill: theme.muted })}
          {p.showNames ? label(ctx, "", { x: vx, y: vy + VR + 50 * k, size: 32, ref: nameTxt }) : null}
          {p.showFraction ? label(ctx, "", { x: vx, y: vy + VR + 96 * k, size: 26, fill: theme.accent, ref: fracTxt }) : null}
        </Node>
        {label(ctx, "", { x: safe.x + safe.w, y: safe.y + 30 * k, size: 26, align: "right", fill: theme.muted, ref: dayTxt })}
        {scaleNote(ctx, p.scaleNote)}
      </Node>,
    );
    if (p.showNames) nameTxt().text(phaseName);
    if (p.showFraction) fracTxt().text(() => `Phần được chiếu sáng: ${num(lit() * 100, 0)}%`);
    dayTxt().text(() => `Ngày ${num(day(), 1)} / 29,5 · 1 giây = ${num(p.daysPerSecond, 1)} ngày`);

    yield clock(ctx.duration, ctx.duration, linear);
    yield* fadeUp(titleTxt(), 0.5);
    yield* all(top().opacity(1, 0.6), popIn(seen(), 0.6));
  },
});
