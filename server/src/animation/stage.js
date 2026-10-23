// Compile-time half of the animation mode: builds each shot's SVG stage (setting + placed
// characters) and the extra props the runtime (runtime.js) needs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rigSvg, rigById, RIG_IDS } from "./rigs.js";
import { settingSvg, GROUND } from "./settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = fs.readFileSync(path.join(here, "runtime.js"), "utf8").replace(/^\/\* eslint[^\n]*\n/m, "");

// Width of the 1920×1080 world that stays visible on a canvas of this shape (the stage SVG uses
// "slice", so tall formats crop the sides).
const visibleWidth = (w, h) => Math.min(1920, (1080 * w) / h);

// Where each cast member stands and how big they are.
export function shotLayout(cast, canvas) {
  const vw = visibleWidth(canvas.w, canvas.h);
  const n = Math.max(1, cast.length);
  const narrow = vw < 1200;
  // Keep ~150 world px free at each side: arms, shells and tails reach well past the body.
  const span = Math.min(vw - (narrow ? 300 : 360), n * (narrow ? 260 : 460));
  const left = 960 - span / 2;
  const pos = cast.map((_, i) => Math.round(n === 1 ? 960 : left + (span * i) / (n - 1)));
  const fit = narrow ? Math.min(1, vw / (n * 300)) : 1;
  const scale = cast.map((id) => +((rigById(id)?.scale ?? 1) * fit * (narrow ? 0.9 : 1)).toFixed(3));
  return { pos, scale, vw: Math.round(vw) };
}

// Extra props for the runtime, including continuity with the previous shot: the same place and
// time means no fade-in, and characters already on stage do not pop in again.
export function shotProps(sc, prev, layout) {
  const inp = sc.inputs;
  const cast = (inp.cast || []).filter((id) => RIG_IDS.includes(id));
  const idx = (id) => (id && id !== "narrator" ? cast.indexOf(id) : -1);
  const pinp = prev?.frame?.engine === "animation" ? prev.inputs : null;
  const continued = !!pinp && pinp.setting === inp.setting && (pinp.time || "day") === (inp.time || "day");
  const left = pinp && /_out$/.test(pinp.action || "") ? pinp.actor || pinp.speaker : null;
  const enter = cast.map((id) => !continued || !(pinp.cast || []).includes(id) || id === left);
  const speaker = idx(inp.speaker);
  const actor = inp.actor ? idx(inp.actor) : inp.action && inp.action !== "talk" ? (speaker >= 0 ? speaker : 0) : speaker;
  return {
    cast,
    speaker,
    actor,
    action: inp.action || (speaker >= 0 ? "talk" : "idle"),
    // A second character reacting at the same time (e.g. one talks, the other laughs).
    reactor: inp.reactor && inp.reaction ? idx(inp.reactor) : -1,
    reaction: inp.reaction || null,
    emotion: inp.emotion || "neutral",
    camera: inp.camera || "wide",
    continued,
    enter,
    pos: layout.pos,
    scale: layout.scale,
    vw: layout.vw,
  };
}

// The stage SVG for one shot; ids are prefixed with the scene id so scenes never clash.
export function stageHtml(sc, layout) {
  const cast = (sc.inputs.cast || []).filter((id) => RIG_IDS.includes(id));
  const actors = cast
    .map((id, i) => `<g class="actor" data-rig="${id}" transform="translate(${layout.pos[i]} ${GROUND}) scale(${layout.scale[i]})"><g class="mover">${rigSvg(id)}</g></g>`)
    .join("");
  return `<svg class="stage" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
<g class="world">${settingSvg(sc.inputs.setting, sc.inputs.time || "day", `${sc.id}-bg`)}<g class="actors">${actors}</g></g>
<rect class="fade" x="-2000" y="-2000" width="6000" height="6000" fill="#000"/>
</svg>`;
}

export const ENGINE_JS = RUNTIME;
