// Colour systems of the science library: one palette per domain, refined per topic, each in a dark
// and (where it suits) a light version. Components never hard-code colours: they ask look() for the
// palette of their domain/topic, and the props "palette", "mode" and "backdrop" (shared inputs,
// registry/common.mjs) change it without touching the animation logic.
//
// Roles: bg/bg2 backdrop gradient · primary (the main object) · secondary (the second kind of object)
// · accent (what the narration points at) · highlight (energy, heat, warnings) · ink/muted text ·
// series: distinct colours for several objects of the same kind (kept in this order across scenes,
// so "the second planet" or "base G" has the same colour everywhere).
import type { AnimContext } from "./context";
// The colours themselves live in palettes.json, shared with the server and the web gallery.
import data from "./palettes.json";

export interface Palette {
  id: string;
  name: string;
  bg: string;
  bg2: string;
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
  ink: string;
  muted: string;
  series: string[];
}

export type Domain = "astronomy" | "mathematics" | "biology" | "physics";

const D = data.domains as Record<Domain, Palette>;

// Topic refinements: only the roles that change.
const T = data.topics as Record<string, Partial<Palette>>;

// Light versions: same hues on a paper background (text darkens, strong colours deepen a little).
const LIGHT = data.light as Record<Domain, Partial<Palette>>;

// Named themes of the spec (Deep Space, Nebula Purple, Electric Blue, Cell Green, Geometry Blue…):
// a full palette each, chosen with props.palette = its id.
const THEMES = data.themes as Record<string, Palette & { domain: Domain }>;
export const THEME_IDS = Object.keys(THEMES);

// Visual styles (props.visual): glow strength, line weight, fill opacity and surface treatment.
export interface Visual {
  name: string;
  glow: number;
  line: number;
  fill: number;
  vignette?: boolean;
  scanlines?: boolean;
  bg?: string;
  bg2?: string;
  ink?: string;
  muted?: string;
}
const VISUALS = data.visuals as Record<string, Visual>;
export const VISUAL_IDS = Object.keys(VISUALS);

// Render quality (props.quality): multiplier of particle counts and raster resolutions.
export const QUALITY: Record<string, number> = { low: 0.45, medium: 0.7, high: 1 };

export const DOMAINS = Object.keys(D) as Domain[];
export const PALETTE_IDS = ["auto", "theme", ...DOMAINS, ...THEME_IDS];

export function palette(domain: Domain, topic?: string, mode: "dark" | "light" = "dark"): Palette {
  return { ...D[domain], ...(topic ? T[topic] : {}), ...(mode === "light" ? LIGHT[domain] : {}) };
}

// What a component draws with: the palette chosen by props (auto = its own domain/topic), the text
// colours (the video theme's on a transparent clip, the palette's own on a backdrop), and the
// timing/easing knobs of the shared inputs.
export interface Look extends Palette {
  text: string;
  dim: string;
  line: string;
  panel: string;
  backdrop: "none" | "panel" | "full";
  visual: Visual & { id: string };
  // Particle / resolution multiplier of props.quality (1 = high).
  q: number;
  // props.seed (default 1): seed of every random layout, so a scene can be reproduced or varied.
  seed: number;
  // Glow as shadow props, scaled by the visual style (none in the clean and blackboard styles).
  glow(color: string, blur: number): { shadowColor: string; shadowBlur: number };
  // Line width scaled by the visual style.
  lw(w: number): number;
}

export function look(ctx: AnimContext, domain: Domain, topic?: string): Look {
  const p = ctx.props as Record<string, any>;
  const mode = p.mode === "light" ? "light" : "dark";
  const choice = p.palette ?? "auto";
  let pal: Palette;
  if (choice === "theme") {
    const t = ctx.theme;
    pal = { ...palette(domain, topic), primary: t.accent, secondary: t.accent2, ink: t.ink, muted: t.muted };
  } else if (THEMES[choice]) pal = { ...THEMES[choice], ...(mode === "light" ? LIGHT[THEMES[choice].domain] : {}) };
  else pal = palette(DOMAINS.includes(choice) ? choice : domain, choice === "auto" ? topic : undefined, mode);
  const vid = VISUALS[p.visual] ? String(p.visual) : "standard";
  const V = VISUALS[vid];
  // Blackboard: chalk colours on a green-black board.
  if (V.bg) pal = { ...pal, bg: V.bg, bg2: V.bg2 ?? V.bg, ink: V.ink ?? pal.ink, muted: V.muted ?? pal.muted };
  const backdrop = p.backdrop === "panel" || p.backdrop === "full" ? p.backdrop : "none";
  const own = backdrop !== "none";
  const dark = mode === "dark";
  return {
    ...pal,
    backdrop,
    text: own ? pal.ink : ctx.theme.ink,
    dim: own ? pal.muted : ctx.theme.muted,
    line: own ? (dark ? "rgba(248,250,252,0.16)" : "rgba(15,23,42,0.16)") : ctx.theme.line,
    panel: own ? (dark ? "rgba(248,250,252,0.06)" : "rgba(15,23,42,0.05)") : ctx.theme.panel,
    visual: { ...V, id: vid },
    q: QUALITY[p.quality] ?? 1,
    seed: Number.isFinite(p.seed) ? p.seed : 1,
    glow: (color: string, blur: number) => ({ shadowColor: color, shadowBlur: blur * V.glow }),
    lw: (w: number) => w * V.line,
  };
}

// "#RRGGBB" + alpha 0–1 → rgba().
export function alpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Linear mix of two "#RRGGBB" colours.
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1, 7), 16), pb = parseInt(b.slice(1, 7), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
