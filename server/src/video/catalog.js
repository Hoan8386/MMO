import fs from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "../config.js";

export const FRAMES_DIR = path.join(SERVER_DIR, "frames");

// Loads every frame's meta.json. Templates stay on disk until the compiler needs them.
export function loadFrames() {
  const frames = new Map();
  for (const name of fs.readdirSync(FRAMES_DIR)) {
    const metaFile = path.join(FRAMES_DIR, name, "meta.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (meta.frame_id !== name) throw new Error(`frames/${name}: frame_id "${meta.frame_id}" phải trùng tên thư mục`);
    frames.set(name, meta);
  }
  return frames;
}

export function templatePath(frameId) {
  return path.join(FRAMES_DIR, frameId, "template.html");
}

export const TOPICS_DIR = path.join(SERVER_DIR, "topics");

// Topics (server/topics/*.json): tags that pick frames, plus the theme and narration tone.
export function loadTopics() {
  const topics = new Map();
  const list = fs.readdirSync(TOPICS_DIR).filter((n) => n.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(TOPICS_DIR, f), "utf8")));
  for (const t of list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) topics.set(t.topic_id, t);
  return topics;
}

export function getTopic(id) {
  const topics = loadTopics();
  return topics.get(id) || topics.get("technology");
}

// Selects the frames the planner may use. Done in code (never by the AI) so the prompt
// only carries frames that fit this video: active, right aspect ratio, sharing a tag with
// the topic (or tagged "common"), at most `perType` per scene type, best tag match first.
export function selectFrames(frames, { topic, aspectRatio = "16:9", images = [], perType = 4 } = {}) {
  const usable = [...frames.values()].filter(
    (f) =>
      f.status === "active" &&
      f.aspect_ratios.includes(aspectRatio) &&
      // A frame that needs an image is useless when the project has none.
      (images.length > 0 || !Object.values(f.inputs).some((i) => i.type === "image" && i.required)),
  );
  if (!topic) return usable;

  const weight = (t) => (topic.default_tags.includes(t) ? 3 : topic.related_tags.includes(t) ? 1 : t === "common" ? 1 : 0);
  const score = (f) => f.tags.reduce((s, t) => s + weight(t), 0);
  const picked = usable.filter((f) => score(f) > 0);
  // Every video needs an intro and an outro, even if none is tagged for this topic.
  for (const type of ["intro", "outro"]) {
    if (!picked.some((f) => f.scene_type === type)) picked.push(...usable.filter((f) => f.scene_type === type));
  }
  const byType = {};
  for (const f of picked.sort((a, b) => score(b) - score(a))) (byType[f.scene_type] ||= []).push(f);
  return Object.values(byType).flatMap((list) => list.slice(0, perType));
}

// One compact line per frame for the prompt: no HTML, no samples.
export function describeFrames(list) {
  return list
    .map((f) => {
      const inputs = Object.entries(f.inputs)
        .map(([k, i]) => {
          const lim =
            i.type === "list"
              ? `list ${i.minItems ?? 1}-${i.maxItems ?? 5} items ≤${i.itemMaxLength ?? 60} chars`
              : i.type === "numbers"
                ? `numbers ${i.minItems ?? 1}-${i.maxItems ?? 6}`
              : i.type === "string"
                ? `≤${i.maxLength ?? 80} chars`
                : i.type;
          return `${k}${i.required ? "*" : ""} (${lim}${i.description ? `; ${i.description}` : ""})`;
        })
        .join(", ");
      const same = (f.same_length || []).map(([a, b]) => ` ${a} and ${b} same length.`).join("");
      return `- ${f.frame_id}: ${f.description} Inputs: ${inputs}.${same} Keywords: ${f.keywords}. Duration ${f.duration.min}-${f.duration.max}s.`;
    })
    .join("\n");
}
