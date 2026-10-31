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

export const DOMAINS = Object.keys(D) as Domain[];
export const PALETTE_IDS = ["auto", "theme", ...DOMAINS];

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
}

export function look(ctx: AnimContext, domain: Domain, topic?: string): Look {
  const p = ctx.props as Record<string, any>;
  const mode = p.mode === "light" ? "light" : "dark";
  const choice = p.palette ?? "auto";
  let pal: Palette;
  if (choice === "theme") {
    const t = ctx.theme;
    pal = { ...palette(domain, topic), primary: t.accent, secondary: t.accent2, ink: t.ink, muted: t.muted };
  } else pal = palette(DOMAINS.includes(choice) ? choice : domain, choice === "auto" ? topic : undefined, mode);
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
