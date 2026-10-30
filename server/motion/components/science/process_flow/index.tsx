// A process in 2–6 steps: cards joined by arrows, each step arriving on its cue, with particles
// that keep flowing along the arrows already drawn (the process "runs"). Lays itself out as a
// row, a two-row snake (many steps in a wide frame) or a column (tall frames).
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeOutBack, linear, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { FONT, label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  steps: { label: string; detail: string }[];
  flow: boolean;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const n = p.steps.length;
    const tall = ctx.height > ctx.width * 1.1;
    const top = safe.y + 120 * k, bottom = safe.y + safe.h - 20 * k;
    const areaH = bottom - top;
    // Grid of cards: rows × cols, filled left→right then right→left (snake) so arrows stay short.
    const cols = tall ? 1 : n > 4 ? Math.ceil(n / 2) : n;
    const rows = Math.ceil(n / cols);
    const gapX = 90 * k, gapY = tall ? 60 * k : 90 * k;
    const cw = Math.min(420 * k, (safe.w - (cols - 1) * gapX) / cols);
    const ch = Math.min(tall ? 220 * k : 260 * k, (areaH - (rows - 1) * gapY) / rows);
    const gridW = cols * cw + (cols - 1) * gapX, gridH = rows * ch + (rows - 1) * gapY;
    const at = (i: number) => {
      const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0;
      return [safe.x + (safe.w - gridW) / 2 + c * (cw + gapX) + cw / 2, top + (areaH - gridH) / 2 + r * (ch + gapY) + ch / 2] as [number, number];
    };
    // Arrow from card i to card i+1, between their facing edges.
    const link = (i: number) => {
      const [x1, y1] = at(i), [x2, y2] = at(i + 1);
      if (Math.abs(y1 - y2) < 1) {
        const d = Math.sign(x2 - x1);
        return [[x1 + (d * cw) / 2 + d * 10 * k, y1], [x2 - (d * cw) / 2 - d * 10 * k, y2]] as [number, number][];
      }
      return [[x1, y1 + ch / 2 + 10 * k], [x2, y2 - ch / 2 - 10 * k]] as [number, number][];
    };

    const cards: Node[] = [];
    const arrows: Line[] = [];
    const titleTxt = createRef<Txt>();
    const clock = createSignal(0);
    const fs = Math.min(36, (cw / k) / 9);
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {p.steps.slice(0, -1).map((_, i) => (
          <Line ref={makeRef(arrows, i)} points={link(i)} stroke={theme.accent2} lineWidth={7 * k} endArrow arrowSize={20 * k} lineCap="round" end={0} />
        ))}
        {p.flow
          ? p.steps.slice(0, -1).map((_, i) =>
              [0, 1, 2].map((j) => {
                const [[ax, ay], [bx, by]] = link(i);
                const u = () => (clock() * 0.6 + j / 3) % 1;
                return <Circle x={() => ax + (bx - ax) * u()} y={() => ay + (by - ay) * u()} size={14 * k} fill={theme.ink} opacity={() => (arrows[i].end() >= 1 ? 0.9 * Math.sin(Math.PI * u()) : 0)} />;
              }),
            )
          : null}
        {p.steps.map((s, i) => (
          <Rect ref={makeRef(cards, i)} position={at(i)} width={cw} height={ch} radius={22 * k} fill={theme.panel} stroke={theme.accent} lineWidth={4 * k} layout direction="column" justifyContent="center" alignItems="center" gap={8 * k} padding={18 * k} opacity={0}>
            <Rect width={46 * k} height={46 * k} radius={23 * k} fill={theme.accent} layout justifyContent="center" alignItems="center">
              <Txt text={String(i + 1)} fontFamily={FONT} fontWeight={600} fontSize={24 * k} fill={theme.bg} />
            </Rect>
            <Txt text={s.label} width={cw - 36 * k} textAlign="center" textWrap fontFamily={FONT} fontWeight={600} fontSize={fs * k} fill={theme.ink} />
            {s.detail ? <Txt text={s.detail} width={cw - 36 * k} textAlign="center" textWrap fontFamily={FONT} fontWeight={600} fontSize={fs * 0.68 * k} fill={theme.muted} /> : null}
          </Rect>
        ))}
      </Node>,
    );

    yield clock(ctx.duration, ctx.duration, linear);
    yield* fadeUp(titleTxt(), 0.5);
    for (let i = 0; i < n; i++) {
      yield* until(ctx.cue(i, n) - (i ? 0.45 : 0));
      if (i) yield* arrows[i - 1].end(1, 0.4);
      cards[i].scale(0.85);
      yield* all(cards[i].opacity(1, 0.3), cards[i].scale(1, 0.45, easeOutBack));
    }
  },
});
