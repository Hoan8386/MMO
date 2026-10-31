// The stage of a science component: an optional backdrop (gradient "full" or rounded "panel"), a camera
// group that every visual goes into, and the shared knobs of registry/common.mjs — scale, speed,
// easing, camera move. The stage clips to the safe area, so a camera push never spills into captions.
//
//   const L = look(ctx, "astronomy", "black_holes");
//   const st = stage(ctx, L);            // added to the view
//   st.cam.add(<…/>);                    // visuals, in the usual centred coordinates
//   yield st.camera();                   // starts the camera move (runs for the whole clip)
import { Node, Rect, Gradient } from "@motion-canvas/2d";
import {
  createRef,
  easeInOutCubic,
  easeInOutSine,
  easeOutBack,
  easeOutElastic,
  easeOutExpo,
  linear,
  type ThreadGenerator,
  type TimingFunction,
  all,
} from "@motion-canvas/core";
import type { AnimContext } from "./context";
import type { Look } from "./palettes";

export const EASINGS: Record<string, TimingFunction> = {
  smooth: easeInOutCubic,
  snappy: easeOutExpo,
  bouncy: easeOutBack,
  elastic: easeOutElastic,
  linear,
};

export interface Stage {
  root: Rect;
  cam: Node;
  // Easing for step transitions (props.easing).
  ease: TimingFunction;
  // Multiplier of continuous motion (props.speed): rotation, flow, orbits.
  speed: number;
  // Starts the camera move; yield (not yield*) it so it runs alongside the steps.
  camera(): ThreadGenerator;
}

export function stage(ctx: AnimContext, L: Look): Stage {
  const { safe, k, view } = ctx;
  const p = ctx.props as Record<string, any>;
  const root = createRef<Rect>();
  const lens = createRef<Node>();
  const cam = createRef<Node>();
  const cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2;
  const s0 = typeof p.scale === "number" ? p.scale : 1;
  const fill =
    L.backdrop === "full"
      ? new Gradient({ type: "radial", from: [0, -safe.h * 0.15], to: [0, -safe.h * 0.15], fromRadius: 0, toRadius: Math.hypot(safe.w, safe.h) * 0.62, stops: [{ offset: 0, color: L.bg2 }, { offset: 1, color: L.bg }] })
      : L.backdrop === "panel"
        ? L.bg
        : null;
  // lens: centred on the stage, carries the camera's scale, turn and drift (pivot = stage centre);
  // cam: undoes the stage offset, so children use the frame's own coordinates.
  view.add(
    <Rect ref={root} x={cx} y={cy} width={safe.w} height={safe.h} clip fill={fill} radius={L.backdrop === "panel" ? 28 * k : 0}>
      <Node ref={lens} scale={s0}>
        <Node ref={cam} x={-cx} y={-cy} />
      </Node>
    </Rect>,
  );
  const D = ctx.duration;
  const mode = String(p.camera || "static");
  const camera = function* (): ThreadGenerator {
    const c = lens();
    if (mode === "push_in") yield* c.scale(s0 * 1.12, D, easeInOutSine);
    else if (mode === "pull_out") {
      c.scale(s0 * 1.12);
      yield* c.scale(s0, D, easeInOutSine);
    } else if (mode === "drift") {
      // A slow sideways travel, slightly pushed in so the edges never show.
      const dx = safe.w * 0.03;
      c.scale(s0 * 1.06).x(dx);
      yield* c.x(-dx, D, easeInOutSine);
    } else if (mode === "orbit") {
      // A slow turn with a slight push, like a camera circling the subject.
      c.rotation(-2.5).scale(s0 * 1.04);
      yield* all(c.rotation(2.5, D, easeInOutSine), c.scale(s0 * 1.1, D, easeInOutSine));
    }
  };
  return { root: root(), cam: cam(), ease: EASINGS[p.easing] || easeInOutCubic, speed: typeof p.speed === "number" ? p.speed : 1, camera };
}

// The drawing area under the title (if any), with its centre and orientation.
export function area(ctx: AnimContext, hasTitle: boolean) {
  const { safe, k } = ctx;
  const top = hasTitle ? 110 * k : 0;
  const a = { x: safe.x, y: safe.y + top, w: safe.w, h: safe.h - top };
  return { ...a, cx: a.x + a.w / 2, cy: a.y + a.h / 2, wide: a.w > a.h * 1.25, tall: a.h > a.w * 1.15 };
}
