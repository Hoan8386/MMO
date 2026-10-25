import { Router } from "express";
import { query, one } from "../db.js";
import { loadFrames, loadTopics, selectFrames, refreshCatalog } from "../video/catalog.js";
import { loadAssets } from "../video/library.js";
import { topicFeeds } from "../news.js";
import { BACKGROUND_STYLES } from "../video/compile.js";
import { RIGS, rigPreviewSvg, ACTIONS, EMOTIONS, VOICE_STYLES } from "../animation/rigs.js";
import { SETTING_IDS, settingName, settingPreviewSvg, TIMES } from "../animation/settings.js";

// Frame library (read-only): metadata the planner and the plan editor use.
export const framesRouter = Router();
framesRouter.get("/", (_req, res) => res.json([...loadFrames().values()]));

export const THEME_KEYS = ["bg", "bg2", "ink", "muted", "accent", "accent2", "on-accent", "panel", "line", "glow", "cap-bg", "cap-ink", "cap-hi"];

// Topics: stored in MySQL, with the frames the planner may use and how many library assets fit.
export const topicsRouter = Router();
topicsRouter.get("/", (req, res) => {
  const frames = loadFrames();
  const assets = loadAssets();
  const count = (t, kind) => assets.filter((a) => a.kind === kind && (a.common || a.topics.includes(t.topic_id))).length;
  res.json(
    [...loadTopics({ all: req.query.all === "1" }).values()].map((t) => ({
      ...t,
      frame_ids: selectFrames(frames, { topic: t, images: ["x"] }).map((f) => f.frame_id),
      assets: { illustration: count(t, "illustration"), logo: count(t, "logo"), photo: count(t, "photo") },
      news_feeds: topicFeeds(t.topic_id, "vn").map((f) => f.name),
      news_foreign: topicFeeds(t.topic_id, "intl").map((f) => f.name),
    })),
  );
});

// Values the topic editor offers: background styles, theme keys and the tags frames use.
topicsRouter.get("/options", (_req, res) => {
  const tags = new Set([...loadFrames().values()].flatMap((f) => f.tags));
  res.json({ backgrounds: BACKGROUND_STYLES, theme_keys: THEME_KEYS, tags: [...tags].sort() });
});

function topicRow(body) {
  const errors = [];
  const tags = (v) => (Array.isArray(v) ? v.map(String).map((t) => t.trim()).filter(Boolean) : []);
  const row = {
    name: String(body.name || "").trim(),
    description: String(body.description || "").trim(),
    tone: String(body.tone || "").trim(),
    kicker: String(body.kicker || "").trim(),
    icon: String(body.icon || "").trim() || null,
    default_tags: tags(body.default_tags),
    related_tags: tags(body.related_tags),
    background: BACKGROUND_STYLES.includes(body.background) ? body.background : "grid",
    theme: body.theme || {},
    sort_order: Number.isFinite(Number(body.order)) ? Number(body.order) : 99,
    active: body.active === false || body.active === 0 ? 0 : 1,
  };
  if (!row.name) errors.push("Thiếu tên chủ đề");
  if (!row.default_tags.length) errors.push("Cần ít nhất một tag chính để chọn frame");
  const missing = THEME_KEYS.filter((k) => typeof row.theme[k] !== "string" || !row.theme[k].trim());
  if (missing.length) errors.push(`Bảng màu thiếu: ${missing.join(", ")}`);
  return { row, errors };
}

const COLS = ["name", "description", "tone", "kicker", "icon", "default_tags", "related_tags", "background", "theme", "sort_order", "active"];
const values = (row) => COLS.map((c) => (["default_tags", "related_tags", "theme"].includes(c) ? JSON.stringify(row[c]) : row[c]));

topicsRouter.post("/", async (req, res) => {
  const id = String(req.body.topic_id || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) return res.status(400).json({ error: "Mã chủ đề chỉ gồm chữ thường, số và gạch ngang (2–49 ký tự)" });
  if (await one("SELECT topic_id FROM topics WHERE topic_id=?", [id])) return res.status(400).json({ error: `Mã chủ đề "${id}" đã tồn tại` });
  const { row, errors } = topicRow(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  await query(`INSERT INTO topics (topic_id, ${COLS.join(", ")}) VALUES (?${",?".repeat(COLS.length)})`, [id, ...values(row)]);
  await refreshCatalog();
  res.status(201).json(loadTopics({ all: true }).get(id));
});

topicsRouter.put("/:id", async (req, res) => {
  if (!(await one("SELECT topic_id FROM topics WHERE topic_id=?", [req.params.id]))) return res.status(404).json({ error: "Không tìm thấy chủ đề" });
  const { row, errors } = topicRow(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  await query(`UPDATE topics SET ${COLS.map((c) => `${c}=?`).join(", ")} WHERE topic_id=?`, [...values(row), req.params.id]);
  await refreshCatalog();
  res.json(loadTopics({ all: true }).get(req.params.id));
});

// Deleting is only allowed while no project uses the topic; otherwise hide it (active = 0).
topicsRouter.delete("/:id", async (req, res) => {
  const used = await one("SELECT COUNT(*) AS n FROM projects WHERE topic=?", [req.params.id]);
  if (used.n) return res.status(400).json({ error: `Có ${used.n} dự án đang dùng chủ đề này — hãy ẩn chủ đề thay vì xoá` });
  await query("DELETE FROM topic_assets WHERE topic_id=?", [req.params.id]);
  await query("DELETE FROM topics WHERE topic_id=?", [req.params.id]);
  await refreshCatalog();
  res.status(204).end();
});

// Shared asset library: ?kind=illustration|logo|photo&topic=<topic_id> (topic keeps common assets too).
export const libraryRouter = Router();
libraryRouter.get("/", (req, res) => {
  const { kind, topic } = req.query;
  const list = loadAssets().filter((a) => (!kind || a.kind === kind) && (!topic || a.common || a.topics.includes(topic)));
  res.json(list.map((a) => ({ ...a, url: `/storage/library/${a.file}` })));
});

// Animation mode catalogue: characters and settings (as SVG for previews), actions, emotions, voices.
export const animationRouter = Router();
animationRouter.get("/", (_req, res) => {
  res.json({
    rigs: RIGS.map((r) => ({ id: r.id, name: r.name, kind: r.kind, voice: r.voice, svg: rigPreviewSvg(r.id, 200) })),
    settings: SETTING_IDS.map((id) => ({ id, name: settingName(id), svg: settingPreviewSvg(id, "day", 360) })),
    times: TIMES,
    actions: ACTIONS,
    emotions: EMOTIONS,
    voices: Object.fromEntries(Object.entries(VOICE_STYLES).map(([k, v]) => [k, v.label])),
  });
});
