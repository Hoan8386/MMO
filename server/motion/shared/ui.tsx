// Small building blocks shared by components: labels, pills, arrows, the "not to scale" note.
import { Line, Rect, Txt, type Node } from "@motion-canvas/2d";
import { createRef, type Reference, type SignalValue } from "@motion-canvas/core";
import type { AnimContext } from "./context";

export const FONT = "Be Vietnam Pro";

export function label(ctx: AnimContext, text: string, opts: { x?: SignalValue<number>; y?: SignalValue<number>; size?: number; fill?: string; align?: "left" | "center" | "right"; opacity?: SignalValue<number>; ref?: Reference<Txt> } = {}) {
  const size = (opts.size ?? 30) * ctx.k;
  const offsetX = opts.align === "left" ? -1 : opts.align === "right" ? 1 : 0;
  return (
    <Txt
      ref={opts.ref}
      text={text}
      x={opts.x ?? 0}
      y={opts.y ?? 0}
      offsetX={offsetX}
      fontFamily={FONT}
      fontWeight={600}
      fontSize={size}
      fill={opts.fill ?? ctx.theme.ink}
      opacity={opts.opacity ?? 1}
    />
  );
}

// A title in the top-left of the safe area.
export function title(ctx: AnimContext, text: string, ref?: Reference<Txt>) {
  return label(ctx, text, { x: ctx.safe.x, y: ctx.safe.y + 30 * ctx.k, size: 50, align: "left", ref });
}

// Rounded pill with text, used for tags and notes.
export function pill(ctx: AnimContext, text: string, opts: { x?: number; y?: number; size?: number; stroke?: string; ref?: Reference<Rect> } = {}) {
  const size = (opts.size ?? 26) * ctx.k;
  return (
    <Rect ref={opts.ref} x={opts.x ?? 0} y={opts.y ?? 0} radius={size} padding={[size * 0.35, size * 0.8]} fill={ctx.theme.panel} stroke={opts.stroke ?? ctx.theme.line} lineWidth={2 * ctx.k} layout>
      <Txt text={text} fontFamily={FONT} fontWeight={600} fontSize={size} fill={ctx.theme.ink} />
    </Rect>
  );
}

// x of a label's anchor moved so its whole text stays inside the safe area. The text extends to the
// right of x when `right`, else to the left (width estimated from the character count).
export function fitX(ctx: AnimContext, x: number, text: string, size: number, right: boolean) {
  const w = text.length * size * ctx.k * 0.56 + 12 * ctx.k;
  const x0 = ctx.safe.x, x1 = ctx.safe.x + ctx.safe.w;
  return right ? Math.min(x, x1 - w) : Math.max(x, x0 + w);
}

// Disclaimer shown on drawings whose sizes or distances are not to scale.
export function scaleNote(ctx: AnimContext, text: string) {
  return label(ctx, text, { x: ctx.safe.x + ctx.safe.w, y: ctx.safe.y + ctx.safe.h - 14 * ctx.k, size: 22, fill: ctx.theme.muted, align: "right", opacity: 0.9 });
}

export function arrow(ctx: AnimContext, from: [number, number], to: [number, number], color: string, ref?: Reference<Line>, width = 6) {
  return <Line ref={ref} points={[from, to]} stroke={color} lineWidth={width * ctx.k} endArrow arrowSize={18 * ctx.k} lineCap="round" />;
}

export const ref = createRef;
export type { Node };
