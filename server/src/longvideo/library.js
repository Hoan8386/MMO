// What a long video may use besides the drawings the AI makes itself:
//   frame — a HyperFrames template of the frame library (server/frames/): cards, numbers, lists,
//           comparisons, timelines… filled with the AI's inputs, in the long-video colours;
//   anim  — a Motion Canvas component (server/motion/): an accurate simulation of a concept
//           (orbits, waves, collisions, cells…), rendered as a transparent clip.
// Only the frames and components that fit the video reach the prompt (metadata, never code). The
// same module checks the AI's choices scene by scene and draws still previews for the editor.
import { loadFrames, selectFrames, describeFrames } from "../video/catalog.js";
import { inputErrors } from "../video/validate.js";
import { animCatalog, parseAnimInputs, getAnimation } from "../video/anim.js";

// Colours of the long-video style (black, white lines, two soft accents) as frame theme tokens
// (CSS custom properties on the page) and as the Motion Canvas theme of the clips.
export const LONG_THEME = {
  bg: "#000000",
  bg2: "#101010",
  ink: "#F2F2F2",
  muted: "#9A9A9A",
  accent: "#7DD3FC",
  accent2: "#FBBF24",
  "on-accent": "#000000",
  panel: "rgba(255, 255, 255, 0.06)",
  line: "rgba(255, 255, 255, 0.18)",
  glow: "rgba(125, 211, 252, 0.14)",
};

// A video without a topic is matched like a general science explainer.
const AUTO_TOPIC = { topic_id: "auto", default_tags: ["science", "explainer"], related_tags: ["statistics", "comparison", "history", "tips"] };
// Inputs that need the shared picture library; long videos have no photos and their own icons.
const ASSET_TYPES = ["image", "icon", "icons", "logo", "cutout", "character", "characters"];

// Frames a long video can show: content frames of the topic (no intro/outro, no frame needing a
// picture, no special engine), with their picture inputs removed.
export function longFrames(topic) {
  const all = loadFrames();
  const picked = selectFrames(all, { topic: topic || AUTO_TOPIC, aspectRatio: "16:9", images: [], perType: 2, maxContent: 16 }).filter(
    (f) =>
      !f.engine &&
      !["intro", "outro"].includes(f.scene_type) &&
      !Object.values(f.inputs).some((i) => i.required && ASSET_TYPES.includes(i.type)) &&
      !f.tags.includes("story"),
  );
  return picked.map((f) => ({ ...f, inputs: Object.fromEntries(Object.entries(f.inputs).filter(([, i]) => !ASSET_TYPES.includes(i.type))) }));
}

// Everything the planner needs: the lists, their prompt text and how many scenes of each kind to ask for.
export function longLibrary({ topic, title, material, scenes }) {
  const frames = longFrames(topic);
  const anims = animCatalog(`${title}\n${material}`, topic || null, { k: 10 });
  const want = (share) => Math.max(1, Math.round(scenes * share));
  return {
    frames,
    frameIds: frames.map((f) => f.frame_id),
    animIds: anims.ids,
    prompt: { frames: frames.length ? describeFrames(frames) : "", anims: anims.prompt },
    targets: { frame: frames.length ? want(0.25) : 0, anim: anims.ids.length ? want(0.25) : 0, draw: want(0.3) },
  };
}

// Problems of one scene's frame or animation choice ([] = fine; drawn scenes have none).
export function sceneProblems(sc, { frameIds = null, animIds = null } = {}) {
  if (sc.kind === "frame") {
    const frame = loadFrames().get(sc.frame_id);
    if (!frame || frame.engine) return [`frame "${sc.frame_id}" không có trong thư viện`];
    if (frameIds && !frameIds.includes(sc.frame_id)) return [`frame "${sc.frame_id}" không nằm trong danh sách được gửi`];
    if (!sc.inputs) return ["fi (inputs) không phải một JSON object"];
    const usable = { ...frame, inputs: Object.fromEntries(Object.entries(frame.inputs).filter(([, i]) => !ASSET_TYPES.includes(i.type))) };
    return inputErrors("inputs", usable, sc.inputs || {});
  }
  if (sc.kind === "anim") {
    if (animIds && !animIds.includes(sc.component)) return [`animation "${sc.component}" không nằm trong danh sách được gửi`];
    if (!sc.props) return ["ap (props) không phải một JSON object"];
    return parseAnimInputs({ component: sc.component, props: JSON.stringify(sc.props || {}) }).errors;
  }
  return [];
}

export const mixOf = (scenes) => ({
  frame: scenes.filter((s) => s.kind === "frame").length,
  anim: scenes.filter((s) => s.kind === "anim").length,
  draw: scenes.filter((s) => !["frame", "anim"].includes(s.kind)).length,
});

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Still preview of a frame or animation scene for the editor: the library's preview picture (if
// any) under a label naming what will be rendered there.
export function libraryPreview(sc) {
  const isAnim = sc.kind === "anim";
  const c = isAnim ? getAnimation(sc.component) : null;
  const f = isAnim ? null : loadFrames().get(sc.frame_id);
  const name = isAnim ? c?.name || sc.component : f?.name || sc.frame_id;
  const pic = isAnim ? (c?.preview || []).find((p) => p.endsWith(".png")) : null;
  const lines = Object.entries(isAnim ? sc.props || {} : sc.inputs || {})
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`.slice(0, 80));
  return `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" font-family="Be Vietnam Pro, sans-serif">
  <rect width="1920" height="1080" fill="#000"/>
  ${pic ? `<image href="/motion-${esc(pic)}" x="0" y="0" width="1920" height="1080" opacity="0.55"/>` : ""}
  <rect x="80" y="70" width="${isAnim ? 560 : 520}" height="64" rx="32" fill="${isAnim ? "#7DD3FC" : "#FBBF24"}"/>
  <text x="${isAnim ? 360 : 340}" y="113" text-anchor="middle" font-size="30" font-weight="600" fill="#000">${isAnim ? "Motion Canvas · animation" : "HyperFrames · frame"}</text>
  <text x="960" y="${pic ? 980 : 480}" text-anchor="middle" font-size="56" font-weight="600" fill="#fff">${esc(name)}</text>
  ${pic ? "" : lines.map((l, i) => `<text x="960" y="${570 + i * 50}" text-anchor="middle" font-size="30" fill="#9a9a9a">${esc(l)}</text>`).join("")}
</svg>`;
}
