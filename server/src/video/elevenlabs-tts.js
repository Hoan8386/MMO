// Voiceover with ElevenLabs (text-to-speech/{voice}/with-timestamps). The response carries the MP3 and
// the start/end time of every character, from which the word timings are taken exactly — they drive
// captions, keyword marks and scene photo cues, like edge-tts word boundaries.
// The key in use may only have the text-to-speech permission (no voices/models listing), and on the free
// plan only ElevenLabs' default voices work through the API: the voices below were checked with it.
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const ELEVEN_VOICES = [
  // A Voice Library voice (native Vietnamese), the default: the API refuses library voices on the free
  // plan (HTTP 402), so it needs a paid plan or credits.
  { id: "eleven:ueSxRO0nLF1bj93J2hVt", label: "ElevenLabs — Nam, giọng Việt bản xứ (Trung Caha)" },
  { id: "eleven:XrExE9yKIg1WjnnlVkGX", label: "ElevenLabs — Nữ, ấm áp, rõ ràng (Matilda)" },
  { id: "eleven:Xb7hH8MSUJpSbSDYk0k2", label: "ElevenLabs — Nữ, tự tin (Alice)" },
  { id: "eleven:FGY2WhTYpPnrIDTdsKH5", label: "ElevenLabs — Nữ, trẻ trung, sôi nổi (Laura)" },
  { id: "eleven:cgSgspJ2msm6clMCkdW9", label: "ElevenLabs — Nữ, trẻ, vui tươi (Jessica)" },
  { id: "eleven:pFZP5JQG7iQjIQuC4Bku", label: "ElevenLabs — Nữ, chín chắn (Lily)" },
  { id: "eleven:SAz9YHcvj6GT2YYXdXww", label: "ElevenLabs — Trung tính, thư thái (River)" },
  { id: "eleven:nPczCjzI2devNBz1zQrb", label: "ElevenLabs — Nam, trầm, kể chuyện (Brian)" },
  { id: "eleven:onwK4e9ZLuTAKqWW03F9", label: "ElevenLabs — Nam, đọc tin (Daniel)" },
  { id: "eleven:JBFqnCBsd6RMkjVDRZzb", label: "ElevenLabs — Nam, ấm, kể chuyện (George)" },
  { id: "eleven:pNInz6obpgDQGcFmaJgB", label: "ElevenLabs — Nam, trầm, mạnh (Adam)" },
  { id: "eleven:cjVigY5qzO86Huf0OWal", label: "ElevenLabs — Nam, mượt mà (Eric)" },
  { id: "eleven:iP95p4xoKVk53GoZ742B", label: "ElevenLabs — Nam, tự nhiên (Chris)" },
  { id: "eleven:CwhRBWXzGAHq8TQ4Fs17", label: "ElevenLabs — Nam, thoải mái (Roger)" },
  { id: "eleven:IKne3meq5aSn9XLyUdCD", label: "ElevenLabs — Nam, trẻ, năng động (Charlie)" },
  { id: "eleven:TX3LPaxmHKxFdv7VOQHJ", label: "ElevenLabs — Nam, trẻ (Liam)" },
  { id: "eleven:bIHbv24MWmeRgasZH58o", label: "ElevenLabs — Nam, thân thiện (Will)" },
  { id: "eleven:pqHfZKP75CvOlQylNhV4", label: "ElevenLabs — Nam, lớn tuổi (Bill)" },
];

// edge-tts voices of older projects → the closest ElevenLabs voice.
const FROM_EDGE = { "vi-VN-HoaiMyNeural": "eleven:XrExE9yKIg1WjnnlVkGX", "vi-VN-NamMinhNeural": "eleven:nPczCjzI2devNBz1zQrb", "en-US-JennyNeural": "eleven:Xb7hH8MSUJpSbSDYk0k2", "en-US-GuyNeural": "eleven:cjVigY5qzO86Huf0OWal" };
export const elevenVoiceId = (voice) => (String(voice || "").startsWith("eleven:") ? voice : FROM_EDGE[voice] || ELEVEN_VOICES[0].id);

// How steady or expressive the voice is, per video style (styles.js) — ElevenLabs voice_settings.
// Lower stability = more emotion and variation; style adds the voice's own character.
const TONES = {
  documentary: { stability: 0.55, style: 0.15 },
  news: { stability: 0.65, style: 0.05 },
  kinetic: { stability: 0.35, style: 0.35 },
  playful: { stability: 0.35, style: 0.35 },
  cinematic: { stability: 0.4, style: 0.3 },
  tech: { stability: 0.55, style: 0.15 },
  storybook: { stability: 0.45, style: 0.25 },
  character: { stability: 0.3, style: 0.45 },
};
export const narrationTone = (style) => (TONES[style] ? style : "documentary");

// Character voices of cartoon shots (animation/rigs.js VOICE_STYLES keys).
export const CHARACTER_VOICES = {
  man: "eleven:nPczCjzI2devNBz1zQrb",
  woman: "eleven:XrExE9yKIg1WjnnlVkGX",
  boy: "eleven:TX3LPaxmHKxFdv7VOQHJ",
  girl: "eleven:cgSgspJ2msm6clMCkdW9",
  old_man: "eleven:pqHfZKP75CvOlQylNhV4",
  old_woman: "eleven:pFZP5JQG7iQjIQuC4Bku",
  deep: "eleven:pNInz6obpgDQGcFmaJgB",
  squeaky: "eleven:FGY2WhTYpPnrIDTdsKH5",
};

const API = "https://api.elevenlabs.io/v1/text-to-speech";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "+6%" → speed 1.06 (ElevenLabs accepts 0.7–1.2).
const speedOf = (rate) => {
  const m = String(rate || "").match(/^([+-]?\d+(?:\.\d+)?)%$/);
  return m ? Math.min(1.2, Math.max(0.7, 1 + Number(m[1]) / 100)) : 1;
};

// What the API's error means for the user.
function explain(status, detail) {
  const code = detail?.code || detail?.status || "";
  const msg = detail?.message || (typeof detail === "string" ? detail : "") || `HTTP ${status}`;
  if (code === "quota_exceeded" || /quota/i.test(msg)) return `ElevenLabs hết hạn mức ký tự của tháng: ${msg}`;
  if (status === 401) return `Key ElevenLabs không hợp lệ hoặc thiếu quyền text_to_speech: ${msg}`;
  if (status === 402) return `Giọng này cần gói ElevenLabs trả phí: ${msg}`;
  if (status === 404) return `Không có giọng này trong tài khoản ElevenLabs: ${msg}`;
  return `ElevenLabs HTTP ${status}: ${msg}`;
}

// One line → { audio: Buffer, alignment }. previous/next: the neighbouring lines, so the intonation
// flows from scene to scene. Retries rate limits and server errors with backoff.
async function synthesize({ text, voiceId, speed, tone, previous, next }) {
  if (!config.tts.elevenKey) throw new Error("chưa có ELEVENLABS_API_KEY trong server/.env");
  const t = TONES[tone] || TONES.documentary;
  const body = {
    text,
    model_id: config.tts.elevenModel,
    language_code: "vi",
    voice_settings: { stability: t.stability, similarity_boost: 0.8, style: t.style, use_speaker_boost: true, speed },
    ...(previous ? { previous_text: previous } : {}),
    ...(next ? { next_text: next } : {}),
  };
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`${API}/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": config.tts.elevenKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(explain(res.status, data.detail));
        // Bad key, unknown voice, paid voice, quota: retrying cannot help.
        if (![429, 500, 502, 503, 504].includes(res.status) || /quota/i.test(err.message)) throw Object.assign(err, { fatal: true });
        throw err;
      }
      if (!data.audio_base64) throw new Error("ElevenLabs không trả về audio");
      return { audio: Buffer.from(data.audio_base64, "base64"), alignment: data.alignment || data.normalized_alignment };
    } catch (err) {
      if (err.fatal) throw err;
      last = err;
      await sleep(2000 * 2 ** attempt); // 2, 4, 8, 16, 32 s
    }
  }
  throw last;
}

// Character timings → words [{ t, d, w }] like edge-tts word boundaries (punctuation left out).
function wordTimings(alignment) {
  const chars = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  const words = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const w = cur.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (w) words.push({ t: Math.round(cur.t * 1000) / 1000, d: Math.round(Math.max(0.05, cur.e - cur.t) * 1000) / 1000, w });
    cur = null;
  };
  chars.forEach((c, i) => {
    if (/\s/.test(c)) return flush();
    // A word starts at its first letter; leading quotes or brackets do not count.
    if (!cur) cur = { text: "", t: starts[i], e: ends[i] };
    if (!cur.text.replace(/[^\p{L}\p{N}]/gu, "") && /[\p{L}\p{N}]/u.test(c)) cur.t = starts[i];
    cur.text += c;
    if (/[\p{L}\p{N}]/u.test(c)) cur.e = ends[i];
  });
  flush();
  return words;
}

// Voices one line into job.mp3 and its word timings into job.words (the files the edge-tts script writes).
// job: { text, voice, rate, tone, previous?, next?, mp3, words }
export async function elevenVoice(job) {
  const voiceId = elevenVoiceId(job.voice).slice("eleven:".length);
  const { audio, alignment } = await synthesize({ text: job.text, voiceId, speed: speedOf(job.rate), tone: job.tone, previous: job.previous, next: job.next });
  if (!audio.length) throw new Error("audio rỗng");
  await fs.writeFile(job.mp3, audio);
  await fs.writeFile(job.words, JSON.stringify(wordTimings(alignment)));
}

// Voices many lines, two at a time (the free plan allows few concurrent requests); every line that can
// be voiced is, before the first error is thrown.
export async function elevenVoiceAll(jobs) {
  const queue = [...jobs];
  const errors = [];
  const worker = async () => {
    for (let job; (job = queue.shift()); ) {
      try {
        await elevenVoice(job);
      } catch (err) {
        errors.push(new Error(`${path.basename(job.mp3, ".mp3")}: ${err.message}`));
        // Nothing more can be voiced once the quota is gone or the key is refused.
        if (/hạn mức|không hợp lệ/.test(err.message)) queue.length = 0;
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (errors.length) throw errors[0];
}
