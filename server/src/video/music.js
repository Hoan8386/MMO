// Background music per topic. Tracks are uploaded on the "Nhạc nền" page, kept in storage/music/<topic>/
// and listed in MySQL (music_tracks, with a mood note the planner reads); each topic also has its own
// music style note and volume (topics.music_style, topics.music_volume).
// Which track a video gets: projects.music when set to a track id ("none" = no music), otherwise the
// track the AI picked for the video's mood in its planning call (plan.music), otherwise the topic's first.
import fs from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../config.js";
import { query, one } from "../db.js";

export const MUSIC_DIR = path.join(STORAGE_DIR, "music");
export const DEFAULT_VOLUME = 0.15;
export const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg"];

// The kind of music each topic calls for, shown until a topic's own note is saved (topics.music_style).
export const DEFAULT_STYLES = {
  "ancient-civilizations": "Cinematic cổ đại: dây trầm, trống lớn, sáo ethnic, nhịp chậm hùng tráng",
  animals: "Orchestral khám phá thiên nhiên: tươi sáng, pizzicato, nhịp vừa vui tươi",
  business: "Corporate hiện đại: piano + beat nhẹ, tự tin, nhịp 100–115 BPM",
  career: "Corporate tích cực: guitar mộc, beat nhẹ, động lực vừa phải",
  crime: "Dark ambient điều tra: synth trầm, nhịp tim chậm, căng thẳng nhưng tiết chế",
  culture: "World music nhẹ: nhạc cụ dân tộc (đàn tranh, sáo trúc) phối nhẹ nhàng",
  disasters: "Ambient nghiêm trang: dây chậm, pad trầm, không giật gân",
  education: "Lo-fi / acoustic nhẹ: piano, guitar mộc, không lời, không lấn giọng đọc",
  entertainment: "Pop sôi động: beat vui, synth sáng, nhịp 110–125 BPM",
  environment: "Ambient hy vọng: piano + dây, mở dần, cảm giác thiên nhiên",
  "everyday-science": "Quirky / curious: pizzicato, marimba, vui tò mò",
  "family-friends": "Acoustic ấm áp: ukulele, guitar mộc, huýt sáo nhẹ",
  finance: "Corporate tối giản: piano + bass nhẹ, rõ ràng, tin cậy",
  "fun-facts": "Quirky vui nhộn: ukulele, glockenspiel, nhịp nhanh",
  future: "Synthwave / tech cinematic: pad rộng, arpeggio, truyền cảm hứng",
  gaming: "Electronic / chiptune: beat mạnh, synth 8-bit, năng lượng cao",
  "general-knowledge": "Upbeat nhẹ: piano + beat, tươi sáng, không lời",
  habits: "Lo-fi chill: beat nhẹ, piano ấm, thư giãn",
  health: "Ambient tươi sạch: piano nhẹ, pad mềm, cảm giác khoẻ khoắn",
  inventions: "Orchestral khám phá: dây + piano, hào hứng dần lên",
  "life-skills": "Acoustic tích cực: guitar mộc, beat nhẹ, thân thiện",
  "little-known": "Mysterious nhẹ: music box, pad, pizzicato bí ẩn",
  love: "Piano lãng mạn: piano solo hoặc dây nhẹ, chậm, ấm",
  "modern-society": "Indie / electronic nhẹ: beat hiện đại, trung tính",
  motivation: "Epic truyền cảm hứng: piano mở đầu, dây + trống dâng trào",
  mysteries: "Mystery ambient: pad tối, chuông, nhịp chậm hồi hộp",
  "news-events": "News bed: synth + nhịp đều, trung tính, không cảm xúc mạnh",
  nutrition: "Acoustic tươi vui: guitar, ukulele, nhịp vừa",
  philosophy: "Ambient sâu lắng: piano thưa, pad dài, chậm",
  psychology: "Ambient ấm: piano + pad mềm, suy tư nhẹ",
  "science-discovery": "Cinematic khoa học: pad + arpeggio, hào hứng khám phá",
  "self-development": "Uplifting acoustic: piano + guitar, tích cực, nhịp vừa",
  "social-psychology": "Curious minimal: marimba, piano, nhịp vừa tò mò",
  space: "Space ambient / cinematic: pad rộng, dây kỳ vĩ, chậm",
  storytelling: "Nhạc kể chuyện cổ tích: music box, celesta, dây nhẹ, ấm áp",
  technology: "Tech electronic: synth sạch, beat nhẹ, hiện đại, nhịp 100–120 BPM",
  travel: "Travel vlog: acoustic/pop vui, ukulele hoặc guitar, sáng sủa",
  "true-stories": "Cinematic cảm xúc: piano + dây, dâng lên ở cao trào",
  "what-if": "Curious cinematic: pad + pizzicato, dẫn dắt hồi hộp nhẹ",
  wildlife: "Nature documentary: orchestral mênh mang, sáo, dây trầm",
  "world-history": "Documentary orchestral: dây trầm, trống, trang trọng",
};

// Mixkit music pages per topic (a mood or genre listing on mixkit.co/free-stock-music/). Mixkit's terms
// forbid scripts or bots that mass-download its items, so the "Nhạc nền" page opens this listing for a
// person to pick tracks; a pasted track link is then fetched one file at a time (routes/music.js).
const MIXKIT_PAGES = {
  "ancient-civilizations": "mood/majestic",
  animals: "mood/playful",
  business: "corporate-music",
  career: "mood/motivating",
  crime: "mood/suspenseful",
  culture: "mood/peaceful",
  disasters: "mood/serious",
  education: "lo-fi-beats",
  entertainment: "mood/upbeat",
  environment: "mood/hopeful",
  "everyday-science": "mood/quirky",
  "family-friends": "mood/warm",
  finance: "mood/confident",
  "fun-facts": "mood/humorous",
  future: "mood/futuristic",
  gaming: "chiptune",
  "general-knowledge": "mood/positive",
  habits: "chillout",
  health: "mood/calm",
  inventions: "mood/uplifting",
  "life-skills": "mood/friendly",
  "little-known": "mood/mysterious",
  love: "mood/romantic",
  "modern-society": "electronic",
  motivation: "mood/triumphant",
  mysteries: "mood/eerie",
  "news-events": "mood/neutral",
  nutrition: "mood/cheerful",
  philosophy: "mood/meditative",
  psychology: "mood/reflective",
  "science-discovery": "cinematic",
  "self-development": "mood/determined",
  "social-psychology": "minimalism",
  space: "atmospheres",
  storytelling: "mood/magical",
  technology: "electronica",
  travel: "mood/carefree",
  "true-stories": "mood/emotional",
  "what-if": "mood/tension",
  wildlife: "film-and-orchestral",
  "world-history": "mood/dramatic",
};

export const mixkitPath = (topicId) => MIXKIT_PAGES[topicId] || "";
export const mixkitUrl = (topicId) => `https://mixkit.co/free-stock-music/${mixkitPath(topicId) ? `${mixkitPath(topicId)}/` : ""}`;

// Hosts a pasted music link may point to: mixkit.co track pages and assets.mixkit.co files.
export const isMixkitHost = (host) => host === "mixkit.co" || host.endsWith(".mixkit.co");

const TRACK_SQL =`SELECT m.id, m.topic_id, m.name, m.mood, m.file, m.duration, m.source_url, COALESCE(t.music_volume, ${DEFAULT_VOLUME}) AS volume
  FROM music_tracks m LEFT JOIN topics t ON t.topic_id = m.topic_id`;

// The topic's tracks, oldest first: [{ id, topic_id, name, mood, file, duration, volume }].
export const topicTracks = (topicId) => query(`${TRACK_SQL} WHERE m.topic_id=? ORDER BY m.id`, [topicId]);

export const trackById = (id) => one(`${TRACK_SQL} WHERE m.id=?`, [Number(id)]);

export const trackPath = (t) => path.join(MUSIC_DIR, t.file);

// project: pipelineProject(); plan.music: the id the planner chose, if any. Returns a track or null.
export async function pickTrack(project, plan) {
  if (project.music === "none") return null;
  if (project.music && project.music !== "auto") {
    const chosen = await trackById(project.music);
    if (chosen) return chosen;
  }
  const tracks = await topicTracks(project.topic);
  return tracks.find((t) => String(t.id) === String(plan?.music)) || tracks[0] || null;
}

// Copies the track into the project (assets/music/bgm.<ext>) for the compiler.
// Returns { file, duration, volume } as compileProject expects.
export async function copyTrack(dir, track) {
  const ext = path.extname(track.file).toLowerCase();
  const musicDir = path.join(dir, "assets", "music");
  await fs.rm(musicDir, { recursive: true, force: true });
  await fs.mkdir(musicDir, { recursive: true });
  await fs.copyFile(trackPath(track), path.join(musicDir, `bgm${ext}`));
  return { file: `assets/music/bgm${ext}`, duration: Number(track.duration) || 0, volume: Number(track.volume) };
}
