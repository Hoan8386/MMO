// Bar or line chart of real figures: axis with "nice" ticks, values counted up as each item
// appears (on its cue), an optional highlighted item, unit and source. Values are plotted to
// scale from zero (bar) or from a padded minimum (line, where zero may be far below the data);
// a line chart over years is spaced by the years themselves.
import { Circle, Line, Node, Rect, Txt } from "@motion-canvas/2d";
import { all, createRef, createSignal, easeOutCubic, makeRef } from "@motion-canvas/core";
import { defineAnimation } from "../../../shared/context";
import { label } from "../../../shared/ui";
import { until } from "../../../shared/time";
import { num, niceStep } from "../../../shared/format";
import { fadeUp } from "../../../transitions";

interface Props {
  title: string;
  type: "bar" | "line";
  unit: string;
  data: { label: string; value: number }[];
  highlight: number;
  decimals: number;
  source: string;
}

export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props: p, theme, safe, k } = ctx;
    const n = p.data.length;
    const vals = p.data.map((d) => d.value);
    const bar = p.type === "bar";
    let vMin = bar ? Math.min(0, ...vals) : Math.min(...vals);
    let vMax = Math.max(0, ...vals);
    if (!bar) {
      const pad = (vMax - vMin || Math.abs(vMax) || 1) * 0.15;
      vMin -= pad;
      vMax += pad;
    }
    const step = niceStep(vMax - vMin, 5);
    vMin = Math.floor(vMin / step) * step;
    vMax = Math.ceil(vMax / step) * step;
    const x0 = safe.x + 120 * k, x1 = safe.x + safe.w - 30 * k, y0 = safe.y + safe.h - 70 * k, y1 = safe.y + 150 * k;
    const Y = (v: number) => y0 - ((v - vMin) / (vMax - vMin || 1)) * (y0 - y1);
    const slot = (x1 - x0) / n;
    // A line chart whose labels are all numbers (years…) is placed by value, so uneven
    // intervals keep their true slope; otherwise items are evenly spaced categories.
    const hl = (i: number) => i === p.highlight;
    const xs = p.data.map((d) => Number(d.label.replace(",", ".")));
    const numeric = !bar && xs.every((v) => Number.isFinite(v)) && new Set(xs).size === n;
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const X = (i: number) => (numeric ? x0 + slot * 0.5 + ((xs[i] - xLo) / (xHi - xLo)) * (x1 - x0 - slot) : x0 + slot * (i + 0.5));
    // Axis labels that would overlap are dropped, never the highlighted one.
    const showLabel = p.data.map(() => true);
    let kept = -1;
    for (let i = 0; i < n; i++) {
      if (kept >= 0 && X(i) - X(kept) < 95 * k) {
        if (hl(i)) showLabel[kept] = false;
        else {
          showLabel[i] = false;
          continue;
        }
      }
      kept = i;
    }
    const grow = p.data.map(() => createSignal(0)); // 0 → 1 as each item comes in
    const color = (i: number) => (p.highlight < 0 ? theme.accent : hl(i) ? theme.accent2 : theme.accent);

    const titleTxt = createRef<Txt>();
    const axes = createRef<Node>();
    const line = createRef<Line>();
    const items: Node[] = [];
    const fsLabel = Math.min(26, (slot / k) / 6);
    view.add(
      <Node>
        {label(ctx, p.title, { x: safe.x, y: safe.y + 30 * k, size: 50, align: "left", ref: titleTxt })}
        {p.unit ? label(ctx, `Đơn vị: ${p.unit}`, { x: safe.x, y: safe.y + 84 * k, size: 26, align: "left", fill: theme.muted }) : null}
        <Node ref={axes} opacity={0}>
          {Array.from({ length: Math.round((vMax - vMin) / step) + 1 }, (_, i) => {
            const v = vMin + i * step;
            return (
              <Node>
                <Line points={[[x0, Y(v)], [x1, Y(v)]]} stroke={theme.line} lineWidth={(Math.abs(v) < step / 1e6 ? 3 : 1.5) * k} />
                {label(ctx, num(v, Math.max(0, -Math.floor(Math.log10(step)))), { x: x0 - 16 * k, y: Y(v), size: 22, align: "right", fill: theme.muted })}
              </Node>
            );
          })}
        </Node>
        {!bar ? (
          <Line ref={line} points={p.data.map((d, i) => [X(i), Y(d.value)] as [number, number])} stroke={theme.accent} lineWidth={6 * k} lineJoin="round" lineCap="round" end={0} />
        ) : null}
        {p.data.map((d, i) => (
          <Node ref={makeRef(items, i)}>
            {bar ? (
              <Rect x={X(i)} y={() => (Y(0) + Y(d.value * grow[i]())) / 2} width={slot * 0.62} height={() => Math.max(0, Math.abs(Y(0) - Y(d.value * grow[i]())))} radius={[10 * k, 10 * k, 0, 0]} fill={color(i)} />
            ) : (
              <Circle x={X(i)} y={Y(d.value)} size={() => (hl(i) ? 26 : 18) * k * grow[i]()} fill={color(i)} stroke={theme.bg} lineWidth={3 * k} />
            )}
            <Txt
              text={() => num(d.value * grow[i](), p.decimals)}
              x={X(i)}
              y={() => (bar ? Y(Math.max(0, d.value) * grow[i]()) : Y(d.value)) - 30 * k}
              fontFamily="Be Vietnam Pro"
              fontWeight={600}
              fontSize={(hl(i) ? 32 : 26) * k}
              fill={hl(i) ? theme.accent2 : theme.ink}
              opacity={() => Math.min(1, grow[i]() * 3)}
            />
            {showLabel[i] ? label(ctx, d.label, { x: X(i), y: y0 + 34 * k, size: fsLabel, fill: hl(i) ? theme.accent2 : theme.muted, opacity: () => Math.min(1, grow[i]() * 3) }) : null}
          </Node>
        ))}
        {p.source ? label(ctx, `Nguồn: ${p.source}`, { x: safe.x + safe.w, y: safe.y + 84 * k, size: 22, align: "right", fill: theme.muted }) : null}
      </Node>,
    );

    // Share of the line's length up to point i, so the pen reaches each point as it appears.
    const seg = p.data.map((d, i) => (i ? Math.hypot(X(i) - X(i - 1), Y(d.value) - Y(p.data[i - 1].value)) : 0));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    const upTo = (i: number) => seg.slice(0, i + 1).reduce((a, b) => a + b, 0) / total;
    yield* all(fadeUp(titleTxt(), 0.5), axes().opacity(1, 0.6));
    for (let i = 0; i < n; i++) {
      yield* until(ctx.cue(i, n) - 0.2);
      const t = Math.min(0.9, (ctx.cue(i + 1, n) - ctx.cue(i, n)) * 0.8 || 0.9);
      if (!bar && i) yield line().end(upTo(i), Math.max(0.2, t), easeOutCubic);
      yield grow[i](1, Math.max(0.25, t), easeOutCubic);
    }
  },
});
