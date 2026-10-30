// What every component receives: the view, its validated props and the job's geometry.
// Coordinates are Motion Canvas ones: (0, 0) is the centre of the frame, y grows downwards.
import type { View2D } from "@motion-canvas/2d";
import type { ThreadGenerator } from "@motion-canvas/core";

export interface Theme {
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  line: string;
  panel: string;
}

// The area a component may draw in (the rest is left for captions and margins).
export interface SafeArea {
  x: number; // left edge
  y: number; // top edge
  w: number;
  h: number;
}

export interface AnimJob {
  component: string;
  props: Record<string, any>;
  duration: number;
  fps: number;
  width: number;
  height: number;
  // Margins in pixels kept free of content; bottom is the caption band in videos.
  safe?: { top: number; right: number; bottom: number; left: number };
  theme?: Partial<Theme>;
  // Moments (seconds) the narration reaches each keyword; components use them to time their steps.
  cues?: (number | null)[];
  // Seconds of narration inside the clip, for spreading steps when a cue is missing.
  speech?: [number, number];
  // Opaque background colour (previews only); clips for videos stay transparent.
  background?: string;
}

export interface AnimContext<P = Record<string, any>> {
  view: View2D;
  props: P;
  duration: number;
  width: number;
  height: number;
  safe: SafeArea;
  theme: Theme;
  // Time (s) for step i of n: its cue if the narration gave one, else spread over the speech.
  cue(i: number, n: number): number;
  // Label scale: text sizes are authored for a 1080 px tall frame.
  k: number;
}

export interface AnimComponent<P = any> {
  run(ctx: AnimContext<P>): ThreadGenerator;
}

export const defineAnimation = <P>(c: AnimComponent<P>) => c;

export const DEFAULT_THEME: Theme = {
  bg: "#0B1730",
  bg2: "#13264A",
  ink: "#E6F0FF",
  muted: "#93A9CC",
  accent: "#4FC3F7",
  accent2: "#FFB74D",
  line: "rgba(230, 240, 255, 0.18)",
  panel: "rgba(230, 240, 255, 0.07)",
};

export function makeContext(view: View2D, job: AnimJob): AnimContext {
  const s = { top: 60, right: 80, bottom: 60, left: 80, ...job.safe };
  const safe = { x: -job.width / 2 + s.left, y: -job.height / 2 + s.top, w: job.width - s.left - s.right, h: job.height - s.top - s.bottom };
  const [v0, v1] = job.speech ?? [0.3, Math.max(0.6, job.duration - 1)];
  const cues = job.cues ?? [];
  return {
    view,
    props: job.props,
    duration: job.duration,
    width: job.width,
    height: job.height,
    safe,
    theme: { ...DEFAULT_THEME, ...job.theme },
    k: Math.min(job.width, job.height) / 1080,
    cue: (i, n) => {
      const t = cues[i] ?? v0 + ((v1 - v0) * (i + 0.15)) / Math.max(1, n);
      return Math.min(job.duration - 0.5, Math.max(0.2, t));
    },
  };
}
