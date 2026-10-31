import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config, SERVER_DIR } from "../config.js";
import { run, probeDuration } from "./proc.js";
import { VOICE_STYLES, rigById } from "../animation/rigs.js";
import { ELEVEN_VOICES, elevenVoiceId, narrationTone, CHARACTER_VOICES, elevenVoiceAll } from "./elevenlabs-tts.js";

const ELEVEN = config.tts.engine === "elevenlabs";

const SCRIPT = path.join(SERVER_DIR, "scripts", "tts_words.py");

const EDGE_VOICES = [
  { id: "vi-VN-HoaiMyNeural", label: "Tiếng Việt — Nữ (Hoài My)" },
  { id: "vi-VN-NamMinhNeural", label: "Tiếng Việt — Nam (Nam Minh)" },
  { id: "en-US-JennyNeural", label: "English — Female (Jenny)" },
  { id: "en-US-GuyNeural", label: "English — Male (Guy)" },
];
// The voices of the engine in use (server/.env TTS_ENGINE / ELEVENLABS_API_KEY).
export const VOICES = ELEVEN ? ELEVEN_VOICES : EDGE_VOICES;
export const DEFAULT_VOICE = VOICES[0].id;

// Identifies a voiced line; audio is reused whenever text, voice, rate, pitch and the ElevenLabs tone
// are unchanged. (Without a pitch or tone the hash is the same as before they existed, so old audio
// stays valid.) An ElevenLabs voice always counts the model and tone (the default tone when none is
// given, as synthesize does), so changing ELEVENLABS_MODEL voices every line again.
export const voiceHash = (text, voice, rate, pitch, tone) => {
  const t = tone || (String(voice).startsWith("eleven:") ? "documentary" : "");
  return crypto
    .createHash("sha1")
    .update(`${text}\n${voice}\n${rate}${pitch && pitch !== "+0Hz" ? `\n${pitch}` : ""}${t ? `\n${config.tts.elevenModel}\n${t}` : ""}`)
    .digest("hex")
    .slice(0, 16);
};

// The voice of one scene: in an animation, a character's line uses that character's voice style
// (plan.cast); narration and every other video use the project voice.
// With ElevenLabs the narrator's tone (how steady or expressive) follows the video style (plan.style).
export function voiceFor(scene, project, plan) {
  const speaker = scene.inputs?.speaker;
  if (scene.frame_id?.startsWith("anim-") && speaker && speaker !== "narrator") {
    const member = (plan.cast || []).find((c) => c.rig === speaker);
    const key = VOICE_STYLES[member?.voice] ? member.voice : rigById(speaker)?.voice;
    const style = VOICE_STYLES[key];
    if (style && ELEVEN) return { voice: CHARACTER_VOICES[key] || elevenVoiceId(style.voice), rate: style.rate, pitch: undefined, tone: "character" };
    if (style) return { voice: style.voice, rate: style.rate, pitch: style.pitch };
  }
  if (ELEVEN) return { voice: elevenVoiceId(project.voice), rate: project.rate, pitch: undefined, tone: narrationTone(plan?.style) };
  return { voice: project.voice, rate: project.rate, pitch: undefined };
}

// Voices every scene into assets/vo/<id>.mp3 with word timings, skipping scenes whose
// text/voice/rate did not change since the last run. Returns { [sceneId]: {duration, words, cached} }.
// `voiceOf(scene)` gives each scene its { voice, rate, pitch }; by default the project voice.
// onProgress(done, total): scenes voiced so far (reused ones count as done at once).
export async function voiceScenes(dir, scenes, { voice, rate }, voiceOf = () => ({ voice, rate }), { onProgress = () => {} } = {}) {
  const voDir = path.join(dir, "assets", "vo");
  await fs.mkdir(voDir, { recursive: true });

  const hashOf = (sc) => {
    const v = voiceOf(sc);
    return voiceHash(sc.voice_text, v.voice, v.rate, v.pitch, v.tone);
  };

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
  for (const [i, sc] of scenes.entries()) {
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
    const v = voiceOf(sc);
    // ElevenLabs also hears the neighbouring lines, so the intonation runs on from scene to scene.
    const around = ELEVEN ? { tone: v.tone, previous: scenes[i - 1]?.voice_text, next: scenes[i + 1]?.voice_text } : {};
    jobs.push({ id: sc.id, text: sc.voice_text, voice: v.voice, rate: v.rate, ...(v.pitch ? { pitch: v.pitch } : {}), ...around, mp3, words, metaFile, hash });
  }
  // Drop audio of scenes that no longer exist (e.g. s09 after deleting a scene).
  const ids = new Set(scenes.map((s) => s.id));
  for (const f of await fs.readdir(voDir)) {
    const id = f.split(".")[0];
    if (/^s\d+$/.test(id) && !ids.has(id)) await fs.rm(path.join(voDir, f), { force: true });
  }

  if (jobs.length) {
    // The words file is written last, so its presence marks a finished scene. The meta file goes too:
    // it is written again per finished line (keep), so a run cut off midway only redoes the rest.
    for (const j of jobs) await Promise.all([fs.rm(j.words, { force: true }), fs.rm(j.metaFile, { force: true })]);
    const keep = async (j) => {
      const duration = await probeDuration(j.mp3).catch(() => 0);
      if (duration > 0) await fs.writeFile(j.metaFile, JSON.stringify({ hash: j.hash, duration }));
    };
    let failure = null;
    let done = scenes.length - jobs.length;
    const tick = () => onProgress(++done, scenes.length);
    onProgress(done, scenes.length);
    if (ELEVEN) failure = await elevenVoiceAll(jobs, (j) => keep(j).catch(() => {}).then(tick)).then(() => null, (err) => err);
    else {
      const jobsFile = path.join(voDir, "_jobs.json");
      await fs.writeFile(jobsFile, JSON.stringify(jobs));
      // The edge-tts script prints "ok <file>" per finished line.
      failure = await run(config.pythonBin, [SCRIPT, jobsFile], { onLine: (l) => l.startsWith("ok ") && tick() }).then(() => null, (err) => err);
      await fs.rm(jobsFile, { force: true });
    }
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
  onProgress(scenes.length, scenes.length);
  return result;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

