import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config, SERVER_DIR } from "../config.js";
import { run, probeDuration } from "./proc.js";

const SCRIPT = path.join(SERVER_DIR, "scripts", "tts_words.py");

export const VOICES = [
  { id: "vi-VN-HoaiMyNeural", label: "Tiếng Việt — Nữ (Hoài My)" },
  { id: "vi-VN-NamMinhNeural", label: "Tiếng Việt — Nam (Nam Minh)" },
  { id: "en-US-JennyNeural", label: "English — Female (Jenny)" },
  { id: "en-US-GuyNeural", label: "English — Male (Guy)" },
];

// Identifies a voiced line; audio is reused whenever text, voice and rate are unchanged.
export const voiceHash = (text, voice, rate) => crypto.createHash("sha1").update(`${text}\n${voice}\n${rate}`).digest("hex").slice(0, 16);

// Voices every scene into assets/vo/<id>.mp3 with word timings, skipping scenes whose
// text/voice/rate did not change since the last run. Returns { [sceneId]: {duration, words, cached} }.
export async function voiceScenes(dir, scenes, { voice, rate }) {
  const voDir = path.join(dir, "assets", "vo");
  await fs.mkdir(voDir, { recursive: true });

  const hashOf = (sc) => voiceHash(sc.voice_text, voice, rate);

  // Index existing audio by hash first, so reordered or renumbered scenes reuse their voice.
  const pool = new Map();
  for (const f of await fs.readdir(voDir)) {
    if (!f.endsWith(".meta.json")) continue;
    const id = f.slice(0, -".meta.json".length);
    const meta = await readJson(path.join(voDir, f));
    if (!meta?.hash || pool.has(meta.hash)) continue;
    const mp3 = await fs.readFile(path.join(voDir, `${id}.mp3`)).catch(() => null);
    const words = await readJson(path.join(voDir, `${id}.words.json`));
    if (mp3 && words) pool.set(meta.hash, { meta, mp3, words });
  }

  const result = {};
  const jobs = [];
  for (const sc of scenes) {
    const hash = hashOf(sc);
    const mp3 = path.join(voDir, `${sc.id}.mp3`);
    const words = path.join(voDir, `${sc.id}.words.json`);
    const metaFile = path.join(voDir, `${sc.id}.meta.json`);
    const hit = pool.get(hash);
    if (hit) {
      await fs.writeFile(mp3, hit.mp3);
      await fs.writeFile(words, JSON.stringify(hit.words));
      await fs.writeFile(metaFile, JSON.stringify(hit.meta));
      result[sc.id] = { ...hit.meta, words: hit.words, cached: true };
      continue;
    }
    jobs.push({ id: sc.id, text: sc.voice_text, voice, rate, mp3, words, metaFile, hash });
  }
  // Drop audio of scenes that no longer exist (e.g. s09 after deleting a scene).
  const ids = new Set(scenes.map((s) => s.id));
  for (const f of await fs.readdir(voDir)) {
    const id = f.split(".")[0];
    if (/^s\d+$/.test(id) && !ids.has(id)) await fs.rm(path.join(voDir, f), { force: true });
  }

  if (jobs.length) {
    // The words file is written last, so its presence marks a finished scene.
    for (const j of jobs) await fs.rm(j.words, { force: true });
    const jobsFile = path.join(voDir, "_jobs.json");
    await fs.writeFile(jobsFile, JSON.stringify(jobs));
    const failure = await run(config.pythonBin, [SCRIPT, jobsFile]).then(() => null, (err) => err);
    await fs.rm(jobsFile, { force: true });
    // Keep every scene that did finish, so a retry only redoes the ones that failed.
    const failed = [];
    for (const j of jobs) {
      const words = await readJson(j.words);
      const duration = words ? await probeDuration(j.mp3).catch(() => 0) : 0;
      if (!(duration > 0)) {
        failed.push(j.id);
        continue;
      }
      await fs.writeFile(j.metaFile, JSON.stringify({ hash: j.hash, duration }));
      result[j.id] = { hash: j.hash, duration, words, cached: false };
    }
    if (failed.length) {
      const reason = /No audio was received/.test(failure?.message ?? "")
        ? "dịch vụ edge-tts không trả về audio (thường do quá tải hoặc giới hạn tạm thời)"
        : failure?.message.slice(-300) ?? "audio rỗng";
      throw new Error(`Không tạo được giọng đọc cho cảnh ${failed.join(", ")}: ${reason}. Các cảnh khác đã được lưu — bấm dựng lại để thử tiếp.`);
    }
  }
  return result;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

