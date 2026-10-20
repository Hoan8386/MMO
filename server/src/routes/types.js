import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { query, one } from "../db.js";
import { STORAGE_DIR } from "../config.js";
import { VOICES } from "../pipeline/tts.js";

const router = Router();
const upload = multer({ dest: path.join(STORAGE_DIR, "tmp"), limits: { fileSize: 8 * 1024 * 1024 } });

const FIELDS = [
  "name", "slug", "description", "style_prompt", "palette", "stroke_color", "background_color",
  "subtitle_color", "stroke_width", "width", "height", "voice", "voice_rate",
  "hand_tip_x", "hand_tip_y", "hand_natural_width", "hand_width", "hand_rotate",
];

function pick(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = f === "palette" ? JSON.stringify(body[f]) : body[f];
  return out;
}

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

router.get("/voices", (_req, res) => res.json(VOICES));

router.get("/", async (_req, res) => {
  res.json(await query(
    "SELECT t.*, (SELECT COUNT(*) FROM videos v WHERE v.type_id=t.id) AS video_count FROM video_types t ORDER BY t.id",
  ));
});

router.get("/:id", async (req, res) => {
  const row = await one("SELECT * FROM video_types WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Không tìm thấy loại video" });
  res.json(row);
});

router.post("/", async (req, res) => {
  const data = pick(req.body);
  if (!data.name || !data.style_prompt) return res.status(400).json({ error: "Cần tên và mô tả phong cách" });
  data.slug ||= slugify(data.name);
  data.palette ||= JSON.stringify(["#ffe0b8", "#e84a5f", "#f7c548", "#4fc3f7", "#81c784"]);
  const keys = Object.keys(data);
  const result = await query(
    `INSERT INTO video_types (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    keys.map((k) => data[k]),
  );
  res.status(201).json(await one("SELECT * FROM video_types WHERE id=?", [result.insertId]));
});

router.put("/:id", async (req, res) => {
  const data = pick(req.body);
  const keys = Object.keys(data);
  if (keys.length) {
    await query(`UPDATE video_types SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`, [...keys.map((k) => data[k]), req.params.id]);
  }
  res.json(await one("SELECT * FROM video_types WHERE id=?", [req.params.id]));
});

router.delete("/:id", async (req, res) => {
  const used = await one("SELECT COUNT(*) AS n FROM videos WHERE type_id=?", [req.params.id]);
  if (used.n) return res.status(409).json({ error: `Loại này đang có ${used.n} video, hãy xoá video trước` });
  await query("DELETE FROM video_types WHERE id=?", [req.params.id]);
  res.status(204).end();
});

// Hand image must be a transparent PNG; tip coordinates are set from the UI afterwards.
router.post("/:id/hand", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Chưa chọn ảnh" });
  if (req.file.mimetype !== "image/png") {
    await fs.rm(req.file.path, { force: true });
    return res.status(400).json({ error: "Ảnh bàn tay phải là PNG nền trong suốt" });
  }
  const rel = `hands/type-${req.params.id}-${Date.now()}.png`;
  await fs.mkdir(path.join(STORAGE_DIR, "hands"), { recursive: true });
  await fs.rename(req.file.path, path.join(STORAGE_DIR, rel));
  await query("UPDATE video_types SET hand_image=? WHERE id=?", [rel, req.params.id]);
  res.json(await one("SELECT * FROM video_types WHERE id=?", [req.params.id]));
});

router.delete("/:id/hand", async (req, res) => {
  await query(
    "UPDATE video_types SET hand_image=NULL, hand_tip_x=3, hand_tip_y=58.5, hand_natural_width=248 WHERE id=?",
    [req.params.id],
  );
  res.json(await one("SELECT * FROM video_types WHERE id=?", [req.params.id]));
});

export default router;
