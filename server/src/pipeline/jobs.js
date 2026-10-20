import fs from "node:fs/promises";
import path from "node:path";
import { query, one } from "../db.js";
import { STORAGE_DIR } from "../config.js";
import { splitScript } from "./script.js";
import { synthesize } from "./tts.js";
import { drawScene } from "./ai.js";
import { composeProject, videoDir } from "./composer.js";
import { renderProject } from "./render.js";

// One job at a time: rendering is CPU-heavy and TTS/AI calls are rate limited.
let chain = Promise.resolve();
const running = new Set();

function enqueue(videoId, task) {
  if (running.has(videoId)) throw new Error("Video này đang được xử lý");
  running.add(videoId);
  chain = chain
    .then(task)
    .catch(async (err) => {
      console.error(`[video ${videoId}]`, err);
      await setVideo(videoId, { status: "error", message: String(err.message).slice(0, 480) });
    })
    .finally(() => running.delete(videoId));
}

async function setVideo(id, fields) {
  const keys = Object.keys(fields);
  await query(`UPDATE videos SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`, [...keys.map((k) => fields[k]), id]);
}

async function loadVideo(id) {
  const video = await one("SELECT * FROM videos WHERE id=?", [id]);
  if (!video) throw new Error("Không tìm thấy video");
  const type = await one("SELECT * FROM video_types WHERE id=?", [video.type_id]);
  return { video, type };
}

// Voice + drawing for one scene; errors are stored on the scene so others still finish.
async function buildScene(type, video, scene, prevText, nextText) {
  try {
    const file = path.join(videoDir(video.id), "assets", "vo", `scene-${scene.id}.mp3`);
    const duration = await synthesize(scene.text, type.voice, type.voice_rate, file);
    const paths = await drawScene({ type, text: scene.text, prevText, nextText });
    if (!paths.length) throw new Error("AI không trả về nét vẽ hợp lệ");
    await query("UPDATE scenes SET audio_path=?, audio_duration=?, paths=?, status='ready', message=NULL WHERE id=?", [
      path.relative(STORAGE_DIR, file).replace(/\\/g, "/"),
      duration,
      JSON.stringify(paths),
      scene.id,
    ]);
  } catch (err) {
    await query("UPDATE scenes SET status='error', message=? WHERE id=?", [String(err.message).slice(0, 480), scene.id]);
  }
}

export function generateVideo(videoId) {
  enqueue(videoId, async () => {
    const { video, type } = await loadVideo(videoId);
    await setVideo(videoId, { status: "generating", progress: 0, message: "Đang tách kịch bản" });

    await query("DELETE FROM scenes WHERE video_id=?", [videoId]);
    await fs.rm(path.join(videoDir(videoId), "assets", "vo"), { recursive: true, force: true });
    const lines = splitScript(video.script);
    if (!lines.length) throw new Error("Kịch bản trống");
    for (const [i, text] of lines.entries()) {
      await query("INSERT INTO scenes (video_id, idx, text) VALUES (?,?,?)", [videoId, i, text]);
    }

    const scenes = await query("SELECT * FROM scenes WHERE video_id=? ORDER BY idx", [videoId]);
    for (const [i, scene] of scenes.entries()) {
      await setVideo(videoId, { progress: Math.round((i / scenes.length) * 100), message: `Đang làm cảnh ${i + 1}/${scenes.length}` });
      await buildScene(type, video, scene, scenes[i - 1]?.text, scenes[i + 1]?.text);
    }
    const failed = await one("SELECT COUNT(*) AS n FROM scenes WHERE video_id=? AND status='error'", [videoId]);
    await setVideo(videoId, {
      status: "ready",
      progress: 100,
      message: failed.n ? `${failed.n} cảnh bị lỗi — hãy tạo lại các cảnh đó trước khi render` : "Sẵn sàng render",
    });
  });
}

export function regenerateScene(videoId, sceneId) {
  enqueue(videoId, async () => {
    const { video, type } = await loadVideo(videoId);
    const scenes = await query("SELECT * FROM scenes WHERE video_id=? ORDER BY idx", [videoId]);
    const i = scenes.findIndex((s) => s.id === Number(sceneId));
    if (i < 0) throw new Error("Không tìm thấy cảnh");
    await setVideo(videoId, { status: "generating", message: `Đang làm lại cảnh ${i + 1}` });
    await buildScene(type, video, scenes[i], scenes[i - 1]?.text, scenes[i + 1]?.text);
    await setVideo(videoId, { status: "ready", message: "Sẵn sàng render" });
  });
}

export function renderVideo(videoId) {
  enqueue(videoId, async () => {
    const { video, type } = await loadVideo(videoId);
    const scenes = await query("SELECT * FROM scenes WHERE video_id=? ORDER BY idx", [videoId]);
    if (!scenes.length) throw new Error("Chưa có cảnh nào — hãy bấm Tạo cảnh trước");
    if (scenes.some((s) => s.status !== "ready")) throw new Error("Còn cảnh chưa sẵn sàng hoặc bị lỗi");

    await setVideo(videoId, { status: "rendering", progress: 0, message: "Đang dựng HyperFrames" });
    const { dir, duration } = await composeProject(video, type, scenes);
    await setVideo(videoId, { message: "Đang render MP4" });
    const file = await renderProject(dir, (p) => setVideo(videoId, { progress: p }).catch(() => {}));
    await setVideo(videoId, {
      status: "done",
      progress: 100,
      message: "Hoàn thành",
      duration,
      output_path: path.relative(STORAGE_DIR, path.join(dir, file)).replace(/\\/g, "/"),
    });
  });
}

export const isBusy = (videoId) => running.has(Number(videoId));
