// Extra prompt sections for "unlimited" presets (billed per request, so a longer prompt and answer cost
// nothing extra): more scenes, the whole matching frame library, cartoon shots mixed into explainer
// videos and AI-designed scenes. Their other addition, story motion on every scene, lives in motion.js.
// Everything still comes back in ONE call; the answer is kept compact (a few custom scenes with short
// code rather than many long ones) so that call stays reasonably fast.

// Scene density: how many scenes to aim for.
export const richGuide = (targetSeconds, kind = "scenes") => `
RICH MODE (no token budget — make the video as engaging as you can):
- Aim for about ${Math.round(targetSeconds / 4)} ${kind} (one idea each, 3–6 s of narration), never two similar ${kind} in a row.
- Use the full variety of frames available — pick for each scene the frame that shows its idea best, not the same few templates; give every scene keywords that land its animation on the spoken words.
- Open with a hook, build curiosity, end with a clear takeaway.`;

// Cartoon shots (anim-shot) inside a regular explainer video.
export const mixGuide = `
CARTOON SHOTS (frame anim-shot) may appear between regular frames, e.g. a character reacting to a fact, asking the viewer a question, or acting out an example:
- One spoken line per shot; speaker is a character in the shot's cast (their own line, no name prefix) or "narrator".
- cast = 1–3 characters on screen; keep the same setting/time/cast for consecutive anim-shot scenes so cuts are seamless.
- action/emotion/camera bring the line to life; reactor/reaction let a second character react at the same time (e.g. one explains, the other is shocked).
- Use cartoon shots for at most about a quarter of the scenes; facts and numbers still belong in the data frames.`;

// How many AI-designed scenes one plan may hold, and how long their code may be in total per scene,
// so the single planning call finishes well within the gateway's time limit.
export const MAX_CUSTOM_SCENES = 4;
const CUSTOM_CODE_CHARS = 3500;

// AI-written scenes (frame ai-scene). Canvas size depends on the project's format.
export const customSceneGuide = ({ w, h }) => `
CUSTOM SCENES (frame ai-scene): do not force an idea into a template that shows it badly — design your own scene when no library frame fits: a custom diagram, an animated comparison, a map-like layout, a visual metaphor, kinetic typography. Up to ${MAX_CUSTOM_SCENES} per video, for the ideas that deserve them most.
- Keep each one compact: html + css + script together under about ${CUSTOM_CODE_CHARS} characters.
- Canvas: ${w}×${h} px (the scene root, position: absolute). Keep the bottom 270 px empty for captions. Lay everything out with position: absolute inside.
- Colours: CSS variables var(--bg) var(--bg2) var(--ink) var(--muted) var(--accent) var(--accent2) var(--on-accent) var(--panel) var(--line) var(--glow). The font is already "Be Vietnam Pro" 600. Text must be large (≥ 40 px, titles 70–110 px) and short.
- css: plain rules such as ".title { … }" — they are scoped to this scene automatically. No @import, no external url().
- html: markup only (no script/style tags). Images only assets/icons/NAME.svg (list NAME in icons) or assets/characters/NAME.svg (list NAME in characters). Inline SVG is welcome for shapes, charts, arrows and paths.
- script: GSAP 3. Available: P (P.D scene length in s, P.vo/P.voEnd narration start/end, P.marks keyword times), R (scene root), $(selector), $$(selector) → array, tl (the scene's paused timeline), at(i, n) (moment of keyword i of n).
- Put EVERY tween on tl at an absolute time: tl.fromTo(el, {from}, {to}, time). Entrance within the first second, reveals timed to keywords with at(i, n), gentle motion while holding (yoyo with repeat computed from P.D). The exit fade is added automatically.
- Never use timers, Math.random, Date, network, DOM events or window/document globals beyond R/$/$$.
- Motion-design quality: staggered reveals, eases like power3.out and back.out(1.7), scale/rotation pops, SVG strokes drawn with strokeDashoffset, counters via onUpdate on a plain object { v: 0 }.`;
