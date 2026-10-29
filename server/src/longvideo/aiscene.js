// Scenes drawn by the AI: plain SVG on the 1920×1080 canvas plus a few motion attributes, turned
// here into the markup the scene runtime (build.js) plays. The AI's markup is untrusted, so only
// drawing tags and attributes survive (no scripts, events, external links or foreign content), and
// its ids are prefixed with the scene id, since every scene shares one page.
//
// Motion attributes the AI may put on any element (documented to it in MOTION_GUIDE):
//   step="n" [delay="s"]       enters at beat n (+ delay)
//   draw="n" [delay="s"]       a stroke drawn on at beat n
//   at="x y" | move="x0 y0 x1 y1"   the element is drawn around 0,0 and placed at x y (or travels)
//   scale="s0 s1" rot="d0 d1" spin="deg/s" bob="px" osc="seconds"   with at/move
//   orbit="cx cy rx ry startAngle speed"   (circle) circles an ellipse
//   tw="phase"  twinkles   drift="dx period"  slides in a loop   count="from to" [suffix="%"]  (text)
// plus <icon name="galaxy" x="" y="" s=""/> for a library icon (icons.js).
import { icon, ICON_NAMES } from "./icons.js";

const TAGS = new Set(["g", "path", "line", "circle", "ellipse", "rect", "polyline", "polygon", "text", "tspan", "defs", "lineargradient", "radialgradient", "stop", "clippath", "icon"]);
const ATTRS = new Set([
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "transform", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "font-size", "text-anchor", "letter-spacing",
  "font-weight", "id", "clip-path", "offset", "stop-color", "stop-opacity", "gradientunits", "dx", "dy", "fx", "fy",
]);
const DROP_WITH_CONTENT = /<(script|style|foreignobject|iframe|image|a|use|animate\w*|set)\b[\s\S]*?(<\/\1\s*>|\/>)/gi;

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const nums = (s, n) => {
  const v = String(s ?? "").trim().split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x));
  return v.length >= n ? v.slice(0, n) : null;
};
const r1 = (x) => Math.round(x * 10) / 10;

function attrsOf(raw) {
  const out = {};
  for (const m of raw.matchAll(ATTR_RE)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return out;
}

// One start tag: safe drawing attributes, ids scoped to the scene, motion turned into data-*.
function convertTag(tag, raw, selfClose, { id, final }) {
  const a = attrsOf(raw);
  const keep = [];
  for (const [k, v] of Object.entries(a)) {
    if (!ATTRS.has(k)) continue;
    if (/javascript:|expression\(|url\((?!#)/i.test(v)) continue;
    let val = v;
    if (k === "id") val = `${id}-${v}`;
    val = val.replace(/url\(#([\w-]+)\)/g, `url(#${id}-$1)`);
    keep.push([k === "gradientunits" ? "gradientUnits" : k, val]);
  }
  let inner = "";
  let name = tag;
  if (tag === "icon") {
    // A library icon at x y, scale s (or placed by at/move like any element).
    name = "g";
    const s = Number(a.s) || 1;
    inner = s === 1 ? icon(ICON_NAMES.includes(a.name) ? a.name : "question") : `<g transform="scale(${s})">${icon(ICON_NAMES.includes(a.name) ? a.name : "question")}</g>`;
    if (!a.at && !a.move) a.at = `${Number(a.x) || 0} ${Number(a.y) || 0}`;
    for (const k of ["x", "y"]) {
      const i = keep.findIndex(([key]) => key === k);
      if (i >= 0) keep.splice(i, 1);
    }
  }
  const data = [];
  const step = a.draw ?? a.step;
  if (a.draw != null && /^(path|line|circle|ellipse|rect|polyline|polygon)$/.test(tag)) data.push(["pathLength", "1"], ["data-draw", ""], ["data-step", String(Number(a.draw) || 0)]);
  else if (step != null) data.push(["data-step", String(Number(step) || 0)]);
  if (a.delay != null && step != null) data.push(["data-delay", String(Math.max(0, Math.min(4, Number(a.delay) || 0)))]);

  // Placement and motion: the runtime owns this element's transform from now on.
  const move = nums(a.move, 4) || (nums(a.at, 2) ? [...nums(a.at, 2), ...nums(a.at, 2)] : null);
  if (move || a.spin || a.bob || a.osc || a.scale || a.rot) {
    const [x0, y0, x1, y1] = move || [0, 0, 0, 0];
    const [s0, s1] = nums(a.scale, 2) || [1, 1];
    const [d0, d1] = nums(a.rot, 2) || [0, 0];
    const spin = Number(a.spin) || 0, bob = Number(a.bob) || 0, osc = Number(a.osc) || 0;
    const i = keep.findIndex(([k]) => k === "transform");
    if (i >= 0) keep.splice(i, 1);
    const [tx, ty, ts, tr] = final ? [x1, y1, s1, d1] : [x0, y0, s0, d0];
    keep.push(["class", "m"], ["transform", `translate(${r1(tx)} ${r1(ty)}) scale(${ts})${tr ? ` rotate(${tr})` : ""}`]);
    data.push(["data-m", [x0, y0, x1, y1, s0, s1, spin, bob, osc, d0, d1].map(r1).join(" ")]);
  }
  if (nums(a.orbit, 6) && !final) data.push(["data-orbit", nums(a.orbit, 6).join(" ")]);
  if (a.tw != null) data.push(["data-tw", String(Number(a.tw) || 0)]);
  if (nums(a.drift, 2)) data.push(["data-drift", nums(a.drift, 2).join(" ")]);
  let count = null;
  if (tag === "text" && nums(a.count, 2)) {
    count = nums(a.count, 2);
    data.push(["data-count", count.join(" ")], ["data-suffix", String(a.suffix || "").slice(0, 6)]);
  }
  const attrs = [...keep, ...data].map(([k, v]) => (v === "" && k.startsWith("data-") ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
  const open = `<${name}${attrs}`;
  const suffix = String(a.suffix || "").slice(0, 6);
  if (tag === "icon") return { html: `${open}>${inner}</g>`, count, suffix };
  return { html: selfClose ? `${open}/>` : `${open}>`, count, suffix };
}

const CANON = { lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath" };

// The AI's scene markup → safe, runnable SVG content for the scene's .vis group.
export function expandAiSvg(src, { id, final = false }) {
  let s = String(src || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(DROP_WITH_CONTENT, "");
  s = s.replace(/<\/?svg\b[^>]*>/gi, "");
  let out = "";
  let last = 0;
  let countText = null; // a count-up text: its content becomes the starting (or final) number
  const stack = [];
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^>]*?)?)\s*(\/?)>/g)) {
    const text = s.slice(last, m.index);
    last = m.index + m[0].length;
    if (!countText) out += text.replace(/[<>]/g, "");
    const [, close, rawTag, raw, self] = m;
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) continue;
    const name = CANON[tag] || tag;
    if (close) {
      if (tag === "icon") continue;
      // Close only what was opened, so stray closers cannot break out of the scene group.
      const i = stack.lastIndexOf(name);
      if (i < 0) continue;
      while (stack.length > i) out += `</${stack.pop()}>`;
      if (countText && name === "text") countText = null;
      continue;
    }
    const { html, count, suffix } = convertTag(tag, raw, !!self || tag === "icon", { id, final });
    out += CANON[tag] ? html.replace(`<${tag}`, `<${name}`) : html;
    if (!self && tag !== "icon") {
      stack.push(name);
      if (count) {
        out += esc(`${final ? count[1] : count[0]}${suffix}`);
        countText = true;
      }
    }
  }
  if (!countText) out += s.slice(last).replace(/[<>]/g, "");
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

// Highest beat the scene uses (its number of reveal steps).
export const aiSteps = (expanded) => Math.max(1, ...[...expanded.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1])));

export const MOTION_GUIDE = `SCENE DRAWING ("g"): SVG markup (no <svg> wrapper) on a 1920×1080 canvas, black background, drawn in the style of a minimal science explainer: thin light strokes (#e6e6e6, stroke-width 2-4, fill="none"), greys (#888, #555, #333 for grids), white dots, Be Vietnam Pro text in light grey (font-size 22-30 for labels, up to 60 for a key number). Use SINGLE quotes for every attribute value (the markup sits inside a JSON string).
Layout: the scene heading and subheading are drawn for you at the top (y < 200) and the footnote at the bottom (y > 960): draw only inside x 160-1760, y 230-930, centred around (960, 560). Scene 1 (the title scene) draws a simple emblem in y 250-540 only; its title is drawn for you below it.
Allowed tags: g, path, line, circle, ellipse, rect, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, clipPath, and <icon name='…' x='' y='' s=''/> for a ready-made line icon (~100 px at s=1; a galaxy is a tilted spiral). Icons: ${ICON_NAMES.join(", ")}.
Motion (the scene must never look static: something always moves or turns):
- step='n' (+ delay='seconds'): the element fades and rises in at beat n. Beat 0 is the scene start; beats 1, 2, … fall on the scene's keywords ("b") in order. Stagger groups with delay (0.1-0.3 s apart).
- draw='n' (+ delay): a path/line/circle/rect/polyline is drawn on along its stroke at beat n (use for axes, grids, curves, outlines, arrows, rulers).
- at='x y' places an element that is drawn around 0,0 (icons, small groups); move='x0 y0 x1 y1' makes it travel over the scene (once, smoothly); with at/move you may add scale='s0 s1', rot='deg0 deg1' (once over the scene), spin='deg per second' (galaxies 15-30, never on text), bob='px' (gentle float, 3-8), osc='seconds' (move/scale/rot go back and forth with this period instead of once: stretching, breathing, expanding-contracting). Never combine at/move with a transform attribute.
- orbit='cx cy rx ry startAngle speed' on a circle: circles an ellipse all scene (speed in radians/s, 0.3-1).
- tw='phase' twinkles a dot; drift='dx period' slides an element left by dx px every period s in a loop (waves inside a clipPath).
- count='from to' suffix='%' on a text: the number counts up at its step.
Keep each scene's drawing focused (one idea, 10-40 elements, at most ~1800 characters); reuse icons rather than drawing complex shapes. Ideas: galaxies moving apart on a grid (icons with move), an elastic line of dots stretching (osc), a curve drawn on with a labelled end, cards with icons appearing one by one, a gauge needle turning (rot), a box of waves (drift), orbits, a timeline with markers, a big counted-up number, a question mark in a circle between two spinning galaxies.`;
