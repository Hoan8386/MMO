import fs from "node:fs/promises";
import { Router } from "express";
import { query, one } from "../db.js";
import { generateVideo, regenerateScene, renderVideo, isBusy } from "../pipeline/jobs.js";
import { videoDir } from "../pipeline/composer.js";

const router = Router();

const LIST_SQL = `SELECT v.id, v.title, v.type_id, v.status, v.progress, v.message, v.output_path, v.duration,
  v.created_at, v.updated_at, t.name AS type_name,
  (SELECT COUNT(*) FROM scenes s WHERE s.video_id=v.id) AS scene_count
  FROM videos v JOIN video_types t ON t.id=v.type_id`;

router.get("/", async (req, res) => {
  const where = req.query.type_id ? " WHERE v.type_id=?" : "";
  res.json(await query(`${LIST_SQL}${where} ORDER BY v.id DESC`, req.query.type_id ? [req.query.type_id] : []));
});

router.get("/:id", async (req, res) => {
  const video = await one("SELECT v.*, t.name AS type_name FROM videos v JOIN video_types t ON t.id=v.type_id WHERE v.id=?", [req.params.id]);
  if (!video) return res.status(404).json({ error: "Không tìm thấy video" });
  video.scenes = await query("SELECT * FROM scenes WHERE video_id=? ORDER BY idx", [req.params.id]);
  video.type = await one("SELECT * FROM video_types WHERE id=?", [video.type_id]);
  res.json(video);
});

router.post("/", async (req, res) => {
  const { title, type_id, script } = req.body;
  if (!title || !type_id || !script?.trim()) return res.status(400).json({ error: "Cần tiêu đề, loại video và kịch bản" });
  const result = await query("INSERT INTO videos (title, type_id, script) VALUES (?,?,?)", [title, type_id, script]);
  res.status(201).json(await one("SELECT * FROM videos WHERE id=?", [result.insertId]));
});

router.put("/:id", async (req, res) => {
  const { title, type_id, script } = req.body;
  await query(
    "UPDATE videos SET title=COALESCE(?,title), type_id=COALESCE(?,type_id), script=COALESCE(?,script) WHERE id=?",
    [title ?? null, type_id ?? null, script ?? null, req.params.id],
  );
  res.json(await one("SELECT * FROM videos WHERE id=?", [req.params.id]));
});

router.delete("/:id", async (req, res) => {
  if (isBusy(req.params.id)) return res.status(409).json({ error: "Video đang được xử lý" });
  await query("DELETE FROM videos WHERE id=?", [req.params.id]);
  await fs.rm(videoDir(req.params.id), { recursive: true, force: true });
  res.status(204).end();
});

// Long-running actions are queued; the client polls GET /:id for progress.
function action(fn) {
  return (req, res) => {
    try {
      fn(Number(req.params.id), req.params.sceneId);
      res.status(202).json({ queued: true });
    } catch (err) {
      res.status(409).json({ error: err.message });
    }
  };
}

router.post("/:id/generate", action((id) => generateVideo(id)));
router.post("/:id/render", action((id) => renderVideo(id)));
router.post("/:id/scenes/:sceneId/regenerate", action((id, sceneId) => regenerateScene(id, sceneId)));

router.put("/:id/scenes/:sceneId", async (req, res) => {
  await query("UPDATE scenes SET text=?, status='pending' WHERE id=? AND video_id=?", [req.body.text, req.params.sceneId, req.params.id]);
  res.json(await one("SELECT * FROM scenes WHERE id=?", [req.params.sceneId]));
});

export default router;
