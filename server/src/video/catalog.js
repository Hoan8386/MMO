import fs from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "../config.js";
import { query } from "../db.js";
import { loadAssets, refreshAssets, KIND_OF_INPUT } from "./library.js";
import { RIG_IDS, ACTIONS, EMOTIONS } from "../animation/rigs.js";
import { SETTING_IDS, TIMES } from "../animation/settings.js";

// Named value lists that animation frames reference as "enum": "@name", so adding a character
// or a setting never needs a meta.json edit.
const ENUMS = {
  "@rigs": RIG_IDS,
  "@speakers": ["narrator", ...RIG_IDS],
  "@settings": SETTING_IDS,
  "@times": Object.keys(TIMES),
  "@actions": Object.keys(ACTIONS),
  "@emotions": EMOTIONS,
};

export const FRAMES_DIR = path.join(SERVER_DIR, "frames");

// Loads every frame's meta.json. Templates stay on disk until the compiler needs them.
export function loadFrames() {
  const frames = new Map();
  for (const name of fs.readdirSync(FRAMES_DIR)) {
    const metaFile = path.join(FRAMES_DIR, name, "meta.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (meta.frame_id !== name) throw new Error(`frames/${name}: frame_id "${meta.frame_id}" phải trùng tên thư mục`);
    for (const spec of Object.values(meta.inputs)) if (typeof spec.enum === "string") spec.enum = ENUMS[spec.enum] || [];
    frames.set(name, meta);
  }
  return frames;
}

export function templatePath(frameId) {
  return path.join(FRAMES_DIR, frameId, "template.html");
}

export const TOPICS_DIR = path.join(SERVER_DIR, "topics");

// Topics live in MySQL (table topics); server/topics/*.json seed the table and serve scripts
// that run without a database. Shape: { topic_id, order, name, description, tone, kicker, icon,
// default_tags, related_tags, background, theme, active }.
let dbTopics = null;

function loadTopicFiles() {
  return fs
    .readdirSync(TOPICS_DIR)
    .filter((n) => n.endsWith(".json"))
    .map((f) => ({ active: true, ...JSON.parse(fs.readFileSync(path.join(TOPICS_DIR, f), "utf8")) }));
}

// Active topics in display order; pass { all: true } to include hidden ones.
export function loadTopics({ all = false } = {}) {
  const list = (dbTopics ?? loadTopicFiles()).filter((t) => all || t.active);
  const topics = new Map();
  for (const t of list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) topics.set(t.topic_id, t);
  return topics;
}

export function getTopic(id) {
  const topics = loadTopics({ all: true });
  return topics.get(id) || topics.get("technology") || [...topics.values()][0];
}

// Inserts topics from the seed files that the table does not have yet.
export async function seedTopics() {
  for (const t of loadTopicFiles()) {
    await query(
      `INSERT IGNORE INTO topics (topic_id, name, description, tone, kicker, icon, default_tags, related_tags, background, theme, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [t.topic_id, t.name, t.description, t.tone, t.kicker, t.icon, JSON.stringify(t.default_tags), JSON.stringify(t.related_tags), t.background, JSON.stringify(t.theme), t.order ?? 99],
    );
  }
}

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

// Reloads topics and the asset library from MySQL into memory (server only).
export async function refreshCatalog() {
  const rows = await query("SELECT * FROM topics ORDER BY sort_order, name");
  dbTopics = rows.map((r) => ({
    topic_id: r.topic_id,
    order: r.sort_order,
    name: r.name,
    description: r.description,
    tone: r.tone,
    kicker: r.kicker,
    icon: r.icon,
    default_tags: parse(r.default_tags),
    related_tags: parse(r.related_tags),
    background: r.background,
    theme: parse(r.theme),
    music_style: r.music_style ?? null,
    music_volume: r.music_volume != null ? Number(r.music_volume) : null,
    active: !!r.active,
  }));
  await refreshAssets();
}

// Selects the frames the planner may use. Done in code (never by the AI) so the prompt
// only carries frames that fit this video: active, right aspect ratio, sharing a tag with
// the topic (or tagged "common"), at most `perType` per scene type and `maxContent` frames
// besides intros and outros, best tag match first. Animation projects (engine "animation")
// get exactly the animation frames; other projects never see them.
export function selectFrames(frames, { topic, aspectRatio = "16:9", images = [], cutouts = [], perType = 4, maxContent = 20, engine = null } = {}) {
  const usable = [...frames.values()].filter(
    (f) =>
      f.status === "active" &&
      (f.engine || null) === engine &&
      f.aspect_ratios.includes(aspectRatio) &&
      // A frame that needs an image (or a library icon/logo) is useless when there is none.
      (images.length > 0 || !Object.values(f.inputs).some((i) => i.type === "image" && i.required)) &&
      Object.values(f.inputs).every((i) => !i.required || !KIND_OF_INPUT[i.type] || hasKind(KIND_OF_INPUT[i.type]) || (i.type === "cutout" && cutouts.length > 0)),
  );
  if (!topic || engine) return usable;

  const weight = (t) => (topic.default_tags.includes(t) ? 3 : topic.related_tags.includes(t) ? 1 : t === "common" ? 1 : 0);
  // Images and cutouts fetched or uploaded for this video should reach it: the frames that show them rank higher.
  const own = (f) => Object.values(f.inputs).some((i) => (i.type === "cutout" && cutouts.length) || (i.type === "image" && images.length));
  const score = (f) => f.tags.reduce((s, t) => s + weight(t), 0) + (own(f) ? 3 : 0);
  const picked = usable.filter((f) => score(f) > 0);
  // Every video needs an intro and an outro, even if none is tagged for this topic.
  for (const type of ["intro", "outro"]) {
    if (!picked.some((f) => f.scene_type === type)) picked.push(...usable.filter((f) => f.scene_type === type));
  }
  const byType = {};
  for (const f of picked.sort((a, b) => score(b) - score(a))) (byType[f.scene_type] ||= []).push(f);
  const kept = Object.values(byType).flatMap((list) => list.slice(0, perType));
  const ends = kept.filter((f) => ["intro", "outro"].includes(f.scene_type));
  const content = kept.filter((f) => !ends.includes(f)).sort((a, b) => score(b) - score(a)).slice(0, maxContent);
  return [...ends, ...content];
}

const hasKind = (kind) => loadAssets().some((a) => a.kind === kind);

// One compact line per frame for the prompt: no HTML, no samples.
// samples: also show each frame's example scene (unlimited presets: more context, better-filled frames).
export function describeFrames(list, { samples = false } = {}) {
  return list
    .map((f) => {
      const inputs = Object.entries(f.inputs)
        .map(([k, i]) => {
          const lim =
            i.type === "list"
              ? `list ${i.minItems ?? 1}-${i.maxItems ?? 5} items ≤${i.itemMaxLength ?? 60} chars`
              : i.type === "numbers"
                ? `numbers ${i.minItems ?? 1}-${i.maxItems ?? 6}`
              : i.type === "icons"
                ? `icon names ${i.minItems ?? 1}-${i.maxItems ?? 4}`
              : i.type === "icon"
                ? "icon name"
              : i.type === "logo"
                ? "logo name"
              : i.type === "cutout"
                ? "cutout name (transparent PNG object)"
              : i.type === "character"
                ? "character name"
              : i.type === "characters"
                ? `character names ${i.minItems ?? 1}-${i.maxItems ?? 5}`
              : i.enum
                ? `one of: ${i.enum.join("|")}`
              : i.type === "code"
                ? `code ≤${i.maxLength} chars`
              : i.type === "string"
                ? `≤${i.maxLength ?? 80} chars`
                : i.type;
          return `${k}${i.required ? "*" : ""} (${lim}${i.description ? `; ${i.description}` : ""})`;
        })
        .join(", ");
      const same = (f.same_length || []).map(([a, b]) => ` ${a} and ${b} same length.`).join("");
      const example = samples && f.sample ? `
  Example: ${JSON.stringify({ voice_text: f.sample.voice_text, keywords: f.sample.keywords || [], inputs: f.sample.inputs || {} })}` : "";
      return `- ${f.frame_id}: ${f.description} Inputs: ${inputs}.${same} Keywords: ${f.keywords}. Duration ${f.duration.min}-${f.duration.max}s.${example}`;
    })
    .join("\n");
}
