// Background music per topic (see src/video/music.js): each topic's style note and volume, and its tracks.
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { query, one } from "../db.js";
import { STORAGE_DIR } from "../config.js";
import { loadTopics, refreshCatalog } from "../video/catalog.js";
import { probeDuration } from "../video/proc.js";
import { slugify } from "../video/pipeline.js";
import { MUSIC_DIR, DEFAULT_VOLUME, DEFAULT_STYLES, AUDIO_EXT, topicTracks, trackPath, mixkitUrl, mixkitPath, isMixkitHost } from "../video/music.js";

const router = Router();
const upload = multer({ dest: path.join(STORAGE_DIR, "tmp"), limits: { fileSize: 40 * 1024 * 1024, files: 10 } });
const trackJson = (t) => ({ ...t, duration: t.duration != null ? Number(t.duration) : null, volume: Number(t.volume), url: `/storage/music/${t.file}` });

// Every topic with its music settings and tracks; ?topic=<id> for one topic.
router.get("/", async (req, res) => {
  const topics = [...loadTopics({ all: true }).values()].filter((t) => !req.query.topic || t.topic_id === req.query.topic);
  const out = [];
  for (const t of topics) {
    out.push({
      topic_id: t.topic_id,
      name: t.name,
      theme: t.theme,
      music_style: t.music_style ?? DEFAULT_STYLES[t.topic_id] ?? "",
      music_volume: t.music_volume ?? DEFAULT_VOLUME,
      browse_url: mixkitUrl(t.topic_id),
      tracks: (await topicTracks(t.topic_id)).map(trackJson),
    });
  }
  res.json(out);
});

router.put("/topics/:topicId", async (req, res) => {
  const { topicId } = req.params;
  if (!loadTopics({ all: true }).has(topicId)) return res.status(404).json({ error: "Không có chủ đề này" });
  const fields = {};
  if (req.body.music_style !== undefined) fields.music_style = String(req.body.music_style).slice(0, 500);
  if (req.body.music_volume !== undefined) fields.music_volume = Math.min(1, Math.max(0, Number(req.body.music_volume) || 0));
  if (!Object.keys(fields).length) return res.status(400).json({ error: "Không có gì để cập nhật" });
  await query(`UPDATE topics SET ${Object.keys(fields).map((k) => `${k}=?`).join(", ")} WHERE topic_id=?`, [...Object.values(fields), topicId]);
  await refreshCatalog();
  res.json({ topic_id: topicId, ...fields });
});

// Uploads one or more tracks (field "files") to a topic; name and mood default to the file name.
router.post("/topics/:topicId/tracks", upload.array("files"), async (req, res) => {
  const { topicId } = req.params;
  const files = req.files || [];
  const cleanup = () => Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
  if (!loadTopics({ all: true }).has(topicId)) {
    await cleanup();
    return res.status(404).json({ error: "Không có chủ đề này" });
  }
  const skipped = [];
  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (!AUDIO_EXT.includes(ext)) {
      skipped.push(f.originalname);
      await fs.rm(f.path, { force: true });
      continue;
    }
    const base = path.basename(f.originalname, ext);
    await addTrack(topicId, f.path, ext, { name: files.length === 1 && req.body.name ? req.body.name : base, mood: req.body.mood });
  }
  res.json({ tracks: (await topicTracks(topicId)).map(trackJson), skipped });
});

// Moves a downloaded or uploaded file into storage/music/<topic>/ and records it.
async function addTrack(topicId, tmpPath, ext, { name, mood, source_url = null }) {
  const file = `${topicId}/${slugify(name) || "nhac"}-${Date.now().toString(36)}${ext}`;
  await fs.mkdir(path.join(MUSIC_DIR, topicId), { recursive: true });
  await fs.rename(tmpPath, path.join(MUSIC_DIR, file));
  const duration = await probeDuration(path.join(MUSIC_DIR, file)).catch(() => null);
  await query("INSERT INTO music_tracks (topic_id, name, mood, file, duration, source_url) VALUES (?,?,?,?,?,?)", [
    topicId,
    String(name || "Nhạc nền").slice(0, 200),
    mood ? String(mood).slice(0, 300) : null,
    file,
    Number.isFinite(duration) ? duration : null,
    source_url ? String(source_url).slice(0, 500) : null,
  ]);
}

const AUDIO_TYPES = { "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg" };
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const UA = { "user-agent": "Mozilla/5.0 (MMO Video Studio)" };

// GET on a Mixkit host only, also after redirects.
async function mixkitGet(url, accept) {
  const r = await fetch(url, { headers: { ...UA, accept }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!isMixkitHost(new URL(r.url).hostname)) throw new Error("link chuyển hướng ra ngoài Mixkit");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// The tracks on one Mixkit listing page: [{ id, title, author, duration, moods: [], file }].
// Each track is a card with its player (preview url = the full mp3), title, author, tag links and length.
export function parseMixkitList(html) {
  const text = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const cards = html.split('data-test-id="audio-player"').slice(1);
  const out = [];
  for (const card of cards) {
    const file = card.match(/data-audio-player-preview-url-value="(https:\/\/assets\.mixkit\.co\/music\/(\d+)\/\2\.mp3)"/);
    if (!file || out.some((t) => t.id === file[2])) continue;
    const meta = card.split("item-grid-music-preview__meta-download")[0];
    out.push({
      id: file[2],
      file: file[1],
      title: text(meta.match(/item-grid-card__title">([\s\S]*?)<\/h2>/)?.[1]) || `Mixkit ${file[2]}`,
      author: text(meta.match(/item-grid-music-preview__author">([\s\S]*?)<\/p>/)?.[1]).replace(/^by\s+/i, ""),
      duration: text(meta.match(/data-test-id="duration">([\s\S]*?)<\/div>/)?.[1]),
      moods: [...meta.matchAll(/href="\/free-stock-music\/(?:mood|tag)\/[a-z0-9-]+\/">([^<]+)<\/a>/g)].map((m) => text(m[1])).slice(0, 6),
    });
  }
  return out;
}

const listCache = new Map(); // listing path → { at, tracks }

// The tracks of the topic's Mixkit listing (or ?path=mood/calm, ?page=2), read once on request and
// cached for an hour — the same single page a person would open, not a crawl of the library.
router.get("/mixkit/:topicId", async (req, res) => {
  const { topicId } = req.params;
  const base = String(req.query.path || mixkitPath(topicId)).replace(/[^a-z0-9/-]/g, "");
  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  const url = `https://mixkit.co/free-stock-music/${base ? `${base}/` : ""}${page > 1 ? `?page=${page}` : ""}`;
  try {
    const hit = listCache.get(url);
    const tracks = hit && Date.now() - hit.at < 3600_000 ? hit.tracks : parseMixkitList(await (await mixkitGet(url, "text/html")).text());
    listCache.set(url, { at: Date.now(), tracks });
    const have = new Set((await topicTracks(topicId)).map((t) => t.source_url));
    res.json({ url, page, tracks: tracks.map((t) => ({ ...t, added: have.has(t.file) })) });
  } catch (err) {
    res.status(502).json({ error: `Không đọc được danh sách nhạc Mixkit: ${err.cause?.code || err.message}` });
  }
});

// Adds one Mixkit track to a topic ({ url, name?, mood? }): the file on assets.mixkit.co, picked from
// the list above or pasted. One file per request — Mixkit's terms forbid bots that mass-download items.
router.post("/topics/:topicId/tracks/from-url", async (req, res) => {
  const { topicId } = req.params;
  if (!loadTopics({ all: true }).has(topicId)) return res.status(404).json({ error: "Không có chủ đề này" });
  let u;
  try {
    u = new URL(String(req.body.url || "").trim());
  } catch {
    return res.status(400).json({ error: "Link không hợp lệ" });
  }
  if (u.protocol !== "https:" || u.hostname !== "assets.mixkit.co") return res.status(400).json({ error: "Chỉ nhận link file nhạc của Mixkit (https://assets.mixkit.co/…mp3)" });
  if ((await topicTracks(topicId)).some((t) => t.source_url === u.href)) return res.status(409).json({ error: "Bản nhạc này đã có trong chủ đề" });
  let tmp = null;
  try {
    const r = await mixkitGet(u.href, "audio/*");
    const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = AUDIO_TYPES[type] || (type === "application/octet-stream" && AUDIO_EXT.find((e) => u.pathname.toLowerCase().endsWith(e)));
    if (!ext) throw new Error(`không phải file nhạc (${type || "không rõ loại"})`);
    if (Number(r.headers.get("content-length")) > MAX_AUDIO_BYTES) throw new Error("file lớn hơn 40 MB");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_AUDIO_BYTES) throw new Error("file lớn hơn 40 MB");
    tmp = path.join(STORAGE_DIR, "tmp", `music-${Date.now()}${ext}`);
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, buf);
    // A pasted download link names the track: …/mixkit-hip-hop-02-738.mp3 → "hip hop 02".
    const fromFile = path.basename(u.pathname).replace(/\.[a-z0-9]+$/i, "").replace(/^mixkit-/, "").replace(/-\d+$/, "").replace(/-/g, " ");
    const name = req.body.name || (/^\d+$/.test(fromFile) ? `Mixkit ${fromFile}` : fromFile);
    await addTrack(topicId, tmp, ext, { name, mood: req.body.mood, source_url: u.href });
    tmp = null;
  } catch (err) {
    if (tmp) await fs.rm(tmp, { force: true });
    return res.status(400).json({ error: `Không tải được nhạc: ${err.cause?.code || err.message}` });
  }
  res.json({ tracks: (await topicTracks(topicId)).map(trackJson) });
});

// Renames a track, edits its mood, or moves it to another topic (the file stays where it is).
router.put("/tracks/:id", async (req, res) => {
  const t = await one("SELECT * FROM music_tracks WHERE id=?", [req.params.id]);
  if (!t) return res.status(404).json({ error: "Không có bản nhạc này" });
  const fields = {};
  if (req.body.name !== undefined) fields.name = String(req.body.name).slice(0, 200) || t.name;
  if (req.body.mood !== undefined) fields.mood = String(req.body.mood).slice(0, 300) || null;
  if (req.body.topic_id !== undefined && loadTopics({ all: true }).has(req.body.topic_id)) fields.topic_id = req.body.topic_id;
  if (!Object.keys(fields).length) return res.status(400).json({ error: "Không có gì để cập nhật" });
  await query(`UPDATE music_tracks SET ${Object.keys(fields).map((k) => `${k}=?`).join(", ")} WHERE id=?`, [...Object.values(fields), t.id]);
  res.json({ id: t.id, ...fields });
});

router.delete("/tracks/:id", async (req, res) => {
  const t = await one("SELECT * FROM music_tracks WHERE id=?", [req.params.id]);
  if (!t) return res.status(404).json({ error: "Không có bản nhạc này" });
  await query("DELETE FROM music_tracks WHERE id=?", [t.id]);
  await fs.rm(trackPath(t), { force: true });
  // Projects that chose this track fall back to automatic.
  await query("UPDATE projects SET music=NULL WHERE music=?", [String(t.id)]);
  res.status(204).end();
});

export default router;
