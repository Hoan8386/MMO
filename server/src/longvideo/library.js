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
  // Every fitting frame (no token budget): the more templates the AI sees, the better it matches each idea.
  const picked = selectFrames(all, { topic: topic || AUTO_TOPIC, aspectRatio: "16:9", images: [], perType: 99, maxContent: 99 }).filter(
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
  const anims = animCatalog(`${title}\n${material}`, topic || null, { k: 24 });
  const want = (share) => Math.max(1, Math.round(scenes * share));
  return {
    frames,
    frameIds: frames.map((f) => f.frame_id),
    animIds: anims.ids,
    // Frames come with their example scene, so their inputs are filled the way they are meant to be.
    prompt: { frames: frames.length ? describeFrames(frames, { samples: true }) : "", anims: anims.prompt },
    // A component may come back with other props, but not more than twice: with few fitting
    // animations the video asks for fewer animation scenes rather than repeating one.
    targets: { frame: frames.length ? want(0.25) : 0, anim: Math.min(anims.ids.length * 2, anims.ids.length ? want(0.25) : 0), draw: want(0.3) },
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

// Fixes what needs no AI, so a plan stays one call: frame inputs that are not the frame's are dropped,
// texts and lists cut to their limits; animation props named in an error are dropped (the component's
// default value takes over). Returns notes of what changed; the caller re-checks the scene.
export function repairScene(sc) {
  const notes = [];
  const cut = (v, n) => (v.length <= n ? v : v.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
  if (sc.kind === "frame" && sc.inputs) {
    const frame = loadFrames().get(sc.frame_id);
    if (!frame) return notes;
    for (const [k, v] of Object.entries(sc.inputs)) {
      const spec = frame.inputs[k];
      if (!spec || ASSET_TYPES.includes(spec.type)) {
        delete sc.inputs[k];
        notes.push(`bỏ "${k}"`);
      } else if (spec.type === "string" && !spec.enum && typeof v === "string" && spec.maxLength && v.length > spec.maxLength) {
        sc.inputs[k] = cut(v, spec.maxLength);
        notes.push(`rút gọn "${k}"`);
      } else if (spec.type === "list" && Array.isArray(v)) {
        const list = (spec.maxItems ? v.slice(0, spec.maxItems) : v).map((x) => (typeof x === "string" && spec.itemMaxLength && !spec.enum ? cut(x, spec.itemMaxLength) : x));
        if (JSON.stringify(list) !== JSON.stringify(v)) {
          for (const [a, b] of frame.same_length || []) {
            const other = a === k ? b : b === k ? a : null;
            if (other && Array.isArray(sc.inputs[other])) sc.inputs[other] = sc.inputs[other].slice(0, list.length);
          }
          sc.inputs[k] = list;
          notes.push(`rút gọn danh sách "${k}"`);
        }
      }
    }
  }
  if (sc.kind === "anim" && sc.props) {
    for (let round = 0; round < 3; round++) {
      const errors = sceneProblems(sc);
      if (!errors.length) break;
      // An error names its prop first ("v0: phải là số"); the rest may list the valid ones, which stay.
      const named = Object.keys(sc.props).filter((k) => errors.some((e) => e.split(":")[0].trim() === k));
      if (!named.length) break;
      for (const k of named) delete sc.props[k];
      notes.push(`bỏ prop ${named.join(", ")} (dùng mặc định)`);
    }
  }
  return notes;
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
