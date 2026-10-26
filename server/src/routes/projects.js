import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { query, one } from "../db.js";
import { STORAGE_DIR } from "../config.js";
import { loadTopics } from "../video/catalog.js";
import { projectDir, slugify, listImages, projectMedia, planErrors, hasManualEdits, readJson, finalizePlan, fetchedFile } from "../video/pipeline.js";
import { planJob, buildJob, renderJob, isBusy, loadProject, pipelineProject } from "../video/jobs.js";
import { startStudio, stopStudio, studioSession } from "../video/studio.js";
import { VOICES, voiceHash, voiceFor } from "../video/tts.js";
import { ASPECTS, DEFAULT_ASPECT } from "../video/aspects.js";
import { downloadImage } from "../news.js";

const router = Router();
const upload = multer({ dest: path.join(STORAGE_DIR, "tmp"), limits: { fileSize: 15 * 1024 * 1024, files: 20 } });
const storageUrl = (p) => `/storage/${path.relative(STORAGE_DIR, p).replace(/\\/g, "/")}`;
const FIELDS = ["title", "material", "channel", "topic", "voice", "voice_rate", "target_seconds", "auto_images", "description", "music"];
// Fetch photos of the places and scenes with the first plan: on (1) unless turned off.
const autoImages = (v) => (v === undefined || v === true || Number(v) > 0 ? 1 : 0);
const THUMB_RE = /^thumbnail\.(jpe?g|png|webp)$/i;
// The project's thumbnail file name (thumbnail.jpg/png/webp in the project folder), or null.
const thumbnailFile = async (dir) => (await fs.readdir(dir).catch(() => [])).find((f) => THUMB_RE.test(f)) || null;
const removeThumbnail = async (dir) => {
  for (const f of await fs.readdir(dir).catch(() => [])) if (THUMB_RE.test(f)) await fs.rm(path.join(dir, f), { force: true });
};

router.get("/voices", (_req, res) => res.json(VOICES));
router.get("/aspects", (_req, res) => res.json(Object.entries(ASPECTS).map(([id, a]) => ({ id, label: a.label, platforms: a.platforms, width: a.width, height: a.height }))));

// Output size follows the chosen format.
const aspectFields = (ratio) => {
  const id = ASPECTS[ratio] ? ratio : DEFAULT_ASPECT;
  return { aspect_ratio: id, width: ASPECTS[id].width, height: ASPECTS[id].height };
};

router.get("/", async (_req, res) => {
  const rows = await query(
    `SELECT p.id, p.slug, p.mode, p.title, p.topic, p.aspect_ratio, p.status, p.progress, p.message, p.duration, p.current_version, p.manual_edit,
       JSON_LENGTH(p.plan, '$.scenes') AS scene_count, p.created_at, p.updated_at,
       (SELECT v.file FROM project_versions v WHERE v.project_id=p.id ORDER BY v.version DESC LIMIT 1) AS latest_file,
       (SELECT COALESCE(SUM(a.input_tokens + a.output_tokens + a.cache_read_input_tokens), 0) FROM ai_calls a WHERE a.project_id=p.id) AS tokens
     FROM projects p ORDER BY p.id DESC`,
  );
  res.json(rows.map((r) => ({ ...r, busy: isBusy(r.id) })));
});

router.post("/", async (req, res) => {
  const { title, material } = req.body;
  if (!title?.trim() || !material?.trim()) return res.status(400).json({ error: "Cần tên dự án và tư liệu / kịch bản" });
  let slug = slugify(title) || "video";
  if (await one("SELECT id FROM projects WHERE slug=?", [slug])) slug = `${slug}-${Date.now().toString(36)}`;
  const size = aspectFields(req.body.aspect_ratio);
  // Animation projects take the storybook look of the storytelling topic unless told otherwise.
  const mode = req.body.mode === "animation" ? "animation" : "explainer";
  const topic = loadTopics().has(req.body.topic) ? req.body.topic : mode === "animation" && loadTopics().has("storytelling") ? "storytelling" : "technology";
  const r = await query(
    "INSERT INTO projects (slug, mode, title, material, channel, topic, voice, voice_rate, target_seconds, aspect_ratio, width, height, auto_images) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [slug, mode, title.trim(), material, req.body.channel || null, topic, req.body.voice || "vi-VN-HoaiMyNeural", req.body.voice_rate || "+6%", Number(req.body.target_seconds) || 90, size.aspect_ratio, size.width, size.height, autoImages(req.body.auto_images)],
  );
  const dir = projectDir(slug);
  await fs.mkdir(path.join(dir, "assets", "img"), { recursive: true });
  await fs.writeFile(path.join(dir, "script.txt"), material);
  res.status(201).json(await one("SELECT * FROM projects WHERE id=?", [r.insertId]));
});

router.get("/:id", async (req, res) => {
  const p = await loadProject(req.params.id).catch(() => null);
  if (!p) return res.status(404).json({ error: "Không tìm thấy dự án" });
  const dir = projectDir(p.slug);
  const timeline = await readJson(path.join(dir, "timeline.json"));
  // Audio is shown only when it matches the scene's current text, voice and rate.
  const voDir = path.join(dir, "assets", "vo");
  const byHash = new Map();
  for (const f of await fs.readdir(voDir).catch(() => [])) {
    if (!f.endsWith(".meta.json")) continue;
    const id = f.slice(0, -".meta.json".length);
    const meta = await readJson(path.join(voDir, f));
    if (meta?.hash) byHash.set(meta.hash, { id, ...meta });
  }
  const media = await projectMedia(dir);
  const thumb = await thumbnailFile(dir);
  const sceneDur = Object.fromEntries((timeline?.scenes ?? []).map((s) => [s.id, s.duration]));
  const audio = {};
  for (const s of p.plan?.scenes ?? []) {
    const v = voiceFor(s, { voice: p.voice, rate: p.voice_rate }, p.plan);
    const hit = byHash.get(voiceHash(s.voice_text, v.voice, v.rate, v.pitch));
    if (s.id && hit) audio[s.id] = { url: `${storageUrl(path.join(voDir, `${hit.id}.mp3`))}?h=${hit.hash}`, duration: hit.duration, scene_duration: sceneDur[hit.id] };
  }
  const [versions, usage, jobs] = await Promise.all([
    query("SELECT id, version, file, duration, manual_edit, qc, created_at FROM project_versions WHERE project_id=? ORDER BY version DESC", [p.id]),
    one("SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, COALESCE(SUM(cache_read_input_tokens),0) AS cache_read_input_tokens FROM ai_calls WHERE project_id=?", [p.id]),
    query("SELECT id, type, status, log, error, started_at, finished_at FROM jobs WHERE project_id=? ORDER BY id DESC LIMIT 5", [p.id]),
  ]);
  res.json({
    ...p,
    busy: isBusy(p.id),
    plan_errors: p.plan ? await planErrors(dir, p.plan) : [],
    built: !!timeline,
    // True when the plan was edited after the last build, so a render would show the old version.
    plan_changed: !!timeline && JSON.stringify(p.plan) !== JSON.stringify(await readJson(path.join(dir, "plan.json"))),
    warnings: timeline?.warnings ?? [],
    has_manual_edits: timeline ? await hasManualEdits(dir) : false,
    audio,
    images: media.images.map((name) => ({ name, label: media.labels[name], credit: media.credits[name], url: storageUrl(path.join(dir, "assets", "img", name)) })),
    // ?t= changes when the file is replaced, so the browser shows the new one.
    thumbnail: thumb ? `${storageUrl(path.join(dir, thumb))}?t=${Math.round((await fs.stat(path.join(dir, thumb))).mtimeMs)}` : null,
    cutouts: media.cutouts.map((name) => ({ name, label: media.labels[name], url: storageUrl(path.join(dir, "assets", "cutouts", `${name}.png`)) })),
    versions: versions.map((v) => ({ ...v, url: `/storage/${v.file}` })),
    usage,
    jobs,
    studio: studioSession(p.id),
  });
});

router.put("/:id", async (req, res) => {
  const fields = Object.fromEntries(FIELDS.filter((f) => req.body[f] !== undefined).map((f) => [f, req.body[f]]));
  if (fields.auto_images !== undefined) fields.auto_images = autoImages(fields.auto_images);
  // Background music: "auto" (stored as NULL), "none" or a track id.
  if (fields.music !== undefined) fields.music = fields.music === "none" ? "none" : /^\d+$/.test(String(fields.music)) ? String(fields.music) : null;
  if (req.body.aspect_ratio !== undefined) Object.assign(fields, aspectFields(req.body.aspect_ratio));
  if (!Object.keys(fields).length) return res.status(400).json({ error: "Không có gì để cập nhật" });
  await query(`UPDATE projects SET ${Object.keys(fields).map((k) => `${k}=?`).join(", ")} WHERE id=?`, [...Object.values(fields), req.params.id]);
  if (fields.material !== undefined) {
    const p = await loadProject(req.params.id);
    await fs.writeFile(path.join(projectDir(p.slug), "script.txt"), fields.material);
  }
  res.json(await one("SELECT * FROM projects WHERE id=?", [req.params.id]));
});

// Saves an edited plan even when invalid, so work is never lost; errors come back for display.
router.put("/:id/plan", async (req, res) => {
  if (isBusy(req.params.id)) return res.status(409).json({ error: "Dự án đang được xử lý" });
  const p = await loadProject(req.params.id);
  const plan = req.body.plan;
  if (!plan || !Array.isArray(plan.scenes)) return res.status(400).json({ error: "Kế hoạch không đúng định dạng" });
  finalizePlan(plan, pipelineProject(p));
  const status = ["draft", "failed", "planning"].includes(p.status) ? "awaiting_approval" : p.status;
  await query("UPDATE projects SET plan=?, plan_approved=0, status=? WHERE id=?", [JSON.stringify(plan), status, p.id]);
  res.json({ plan, plan_errors: await planErrors(projectDir(p.slug), plan) });
});

function action(fn) {
  return async (req, res) => {
    try {
      await fn(Number(req.params.id), req.body || {});
      res.status(202).json({ queued: true });
    } catch (err) {
      res.status(409).json({ error: err.message, code: err.code });
    }
  };
}

router.post("/:id/plan", action((id, b) => planJob(id, { mock: !!b.mock })));
router.post("/:id/build", action((id, b) => buildJob(id, { render: b.render !== false, force: !!b.force })));
router.post("/:id/render", action((id) => renderJob(id)));

// Sets the thumbnail from an uploaded file (field "image"), an image URL ({ url }, e.g. the news
// article's photo) or one of the project's images ({ image }).
router.post("/:id/thumbnail", upload.single("image"), async (req, res) => {
  const p = await loadProject(req.params.id);
  const dir = projectDir(p.slug);
  const file = req.file;
  try {
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) throw new Error("Chỉ nhận ảnh JPEG, PNG hoặc WebP");
      await removeThumbnail(dir);
      await fs.rename(file.path, path.join(dir, `thumbnail${ext}`));
    } else if (req.body.url) {
      // Downloaded next to the old one first, so a failed download keeps it.
      const tmp = path.join(STORAGE_DIR, "tmp");
      const name = await downloadImage(String(req.body.url), tmp, `thumb-${p.id}-${Date.now()}`);
      await removeThumbnail(dir);
      await fs.rename(path.join(tmp, name), path.join(dir, `thumbnail${path.extname(name)}`));
    } else if (req.body.image) {
      const name = path.basename(String(req.body.image));
      if (!(await listImages(dir)).includes(name)) throw new Error("Không có ảnh này trong dự án");
      await removeThumbnail(dir);
      await fs.copyFile(path.join(dir, "assets", "img", name), path.join(dir, `thumbnail${path.extname(name).toLowerCase()}`));
    } else throw new Error("Cần ảnh tải lên, url hoặc tên ảnh dự án");
  } catch (err) {
    if (file) await fs.rm(file.path, { force: true });
    return res.status(400).json({ error: `Không đặt được thumbnail: ${err.cause?.code || err.message}` });
  }
  const thumb = await thumbnailFile(dir);
  res.json({ thumbnail: `${storageUrl(path.join(dir, thumb))}?t=${Date.now()}` });
});

router.delete("/:id/thumbnail", async (req, res) => {
  const p = await loadProject(req.params.id);
  await removeThumbnail(projectDir(p.slug));
  res.status(204).end();
});

router.post("/:id/studio", async (req, res) => {
  const p = await loadProject(req.params.id);
  const dir = projectDir(p.slug);
  if (!(await readJson(path.join(dir, "timeline.json")))) return res.status(409).json({ error: "Hãy dựng dự án trước khi mở Studio" });
  try {
    res.json(await startStudio(p.id, dir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/studio", async (req, res) => {
  const p = await loadProject(req.params.id);
  const dir = projectDir(p.slug);
  await stopStudio(p.id, dir);
  const manual = await hasManualEdits(dir);
  await query("UPDATE projects SET manual_edit=? WHERE id=?", [manual ? 1 : 0, p.id]);
  res.json({ manual_edit: manual });
});

router.post("/:id/images", upload.array("images"), async (req, res) => {
  const p = await loadProject(req.params.id);
  const imgDir = path.join(projectDir(p.slug), "assets", "img");
  await fs.mkdir(imgDir, { recursive: true });
  for (const f of req.files || []) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      await fs.rm(f.path, { force: true });
      continue;
    }
    const name = `${slugify(path.basename(f.originalname, ext)) || "anh"}${ext}`;
    await fs.rename(f.path, path.join(imgDir, name));
  }
  res.json(await listImages(projectDir(p.slug)));
});

// Downloads an image from a URL (e.g. a news article's photo) into the project's images.
router.post("/:id/images/from-url", async (req, res) => {
  const p = await loadProject(req.params.id);
  const dir = projectDir(p.slug);
  const imgDir = path.join(dir, "assets", "img");
  const existing = await listImages(dir);
  const base = slugify(String(req.body.name || "")).slice(0, 50) || "anh-bai-bao";
  let name = base;
  for (let n = 2; existing.some((f) => path.parse(f).name === name); n++) name = `${base}-${n}`;
  let file;
  try {
    file = await downloadImage(String(req.body.url || ""), imgDir, name);
  } catch (err) {
    return res.status(400).json({ error: `Không tải được ảnh: ${err.cause?.code || err.message}` });
  }
  // What the photo shows (its caption) and where it came from, so the planner can place it and image
  // frames carry the credit (see projectMedia).
  if (req.body.label || req.body.credit) {
    const record = await readJson(fetchedFile(dir), { items: [] });
    record.items.push({
      name: path.parse(file).name,
      kind: "photo",
      file: `assets/img/${file}`,
      label: String(req.body.label || req.body.name || "").slice(0, 160),
      credit: req.body.credit ? String(req.body.credit).slice(0, 120) : null,
      source: "article",
      source_url: String(req.body.url),
    });
    await fs.writeFile(fetchedFile(dir), JSON.stringify(record, null, 2));
  }
  res.json(await listImages(dir));
});

router.delete("/:id/images/:name", async (req, res) => {
  const p = await loadProject(req.params.id);
  await fs.rm(path.join(projectDir(p.slug), "assets", "img", path.basename(req.params.name)), { force: true });
  res.status(204).end();
});

router.delete("/:id/cutouts/:name", async (req, res) => {
  const p = await loadProject(req.params.id);
  await fs.rm(path.join(projectDir(p.slug), "assets", "cutouts", `${path.basename(req.params.name)}.png`), { force: true });
  res.status(204).end();
});

router.delete("/:id", async (req, res) => {
  if (isBusy(req.params.id)) return res.status(409).json({ error: "Dự án đang được xử lý" });
  const p = await loadProject(req.params.id);
  await stopStudio(p.id, projectDir(p.slug)).catch(() => {});
  await query("DELETE FROM projects WHERE id=?", [p.id]);
  // Windows briefly locks a folder another program is watching or scanning (EBUSY): retry, and never
  // report a failure for a project that is already gone from the list.
  await fs.rm(projectDir(p.slug), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch((err) => console.warn(`Chưa xoá được thư mục ${p.slug}: ${err.message}`));
  res.status(204).end();
});

export default router;
