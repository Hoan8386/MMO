// Plans a whole long video (several minutes, dozens of scenes) in ONE AI call: the AI writes the
// narration AND draws every scene itself — SVG plus motion attributes (aiscene.js) that the scene
// runtime plays — so each video carries its own visuals. Nothing else calls the AI: voice, layers and
// rendering run locally. continuePlan() exists only for an answer cut off by max_tokens.
import { callModel } from "../video/planner.js";
import { activePreset } from "../settings.js";
import { config } from "../config.js";
import { MOTION_GUIDE } from "./aiscene.js";

// Spoken Vietnamese words (syllables) per minute at the default rate, measured on rendered videos:
// ElevenLabs reads much faster than edge-tts, so a script for the same length needs more words.
const WORDS_PER_MIN = config.tts.engine === "elevenlabs" ? 230 : 170;

const EXAMPLE = {
  h: "Các thiên hà rời xa nhau",
  s: "Quan sát từ năm 1929",
  n: "Minh hoạ, không theo tỉ lệ",
  b: ["rời xa nhau", "càng nhanh"],
  v: "Khi nhìn ra xa, các nhà thiên văn nhận thấy gần như mọi thiên hà đều đang rời xa nhau. Và thiên hà càng ở xa thì lùi ra càng nhanh.",
  g: "<g opacity='0.5'><path d='M300 330 H1620 M300 450 H1620 M300 570 H1620 M300 690 H1620 M300 810 H1620' stroke='#444' stroke-width='1.5' draw='0'/><path d='M420 300 V840 M660 300 V840 M900 300 V840 M1140 300 V840 M1380 300 V840' stroke='#444' stroke-width='1.5' draw='0' delay='0.3'/></g><icon name='galaxy' move='800 470 560 380' spin='22' bob='5' step='0' delay='0.5'/><icon name='galaxy' move='1050 450 1360 360' spin='-20' bob='5' step='0' delay='0.6'/><icon name='galaxy' move='960 600 960 640' spin='18' bob='4' step='0' delay='0.7'/><icon name='galaxy' move='820 700 520 760' spin='-24' bob='5' step='1'/><icon name='galaxy' move='1110 690 1420 750' spin='20' bob='5' step='1' delay='0.15'/><g at='960 880' scale='0.5 1'><path d='M-210 0 H210 M-210 -10 V10 M210 -10 V10' stroke='#e6e6e6' stroke-width='2' fill='none'/><text y='40' text-anchor='middle' font-size='24' fill='#aaa'>Khoảng cách tăng</text></g>",
};

const SYSTEM = `You write long, calm, documentary-style explainer videos (several minutes) in the minimal style of science channels: black background, thin white line diagrams, ONE idea per scene, and you DRAW every scene yourself as animated SVG. You return one JSON plan.

Rules:
- Narration language: Vietnamese unless told otherwise. Natural spoken style for text-to-speech, like a patient teacher. Each scene's "v" (voice) is 2-4 flowing sentences (25-60 words). Consecutive scenes read as one continuous script with natural links; build curiosity, ask questions, then answer them.
- Structure: hook question → background → the key observation → explanation step by step with simple analogies (an elastic band, a map, a balloon) → what is still unknown → short recap. Scene 1 is the title scene ("h" = the video title).
- Each scene: "h" heading (≤ 42 chars, a short claim or question, no trailing period), optional "s" subheading (≤ 60 chars), "n" footnote (≤ 70 chars, an honest disclaimer like "Minh hoạ, không theo tỉ lệ" or a source hint; "" if none), "b" beats: 0-4 exact phrases copied verbatim from "v", in spoken order — beat n starts when phrase n is spoken — "v" the narration, and "g" the scene's drawing.
- The drawing literally shows what the narration says at that moment, and each beat reveals the part being talked about. Keep a consistent visual language across the video (same galaxy icon, same grid, same card style), but every scene has its own composition.
- On-screen text is short, NOT a copy of the narration. Write numbers on screen with digits; in "v" write numbers as they are read aloud.
- Use only facts from the material or well-established science; never invent quotes, statistics, names or dates. Mark open questions as open.

${MOTION_GUIDE}

Example scene:
${JSON.stringify(EXAMPLE)}`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          h: { type: "string" },
          s: { type: "string" },
          n: { type: "string" },
          b: { type: "array", items: { type: "string" } },
          v: { type: "string" },
          g: { type: "string" },
        },
        required: ["h", "v", "g"],
      },
    },
  },
  required: ["title", "scenes"],
};

// Room for every scene's drawing in the single answer (about 700 tokens per scene).
const maxTokensFor = (preset) => Math.min(128000, Math.max(preset.max_tokens, 96000));

const userPrompt = ({ title, material, minutes, brand }) => {
  const words = Math.round(minutes * WORDS_PER_MIN);
  return `Video title: ${title}
Channel name (shown in the corner, never spoken): ${brand || "(none)"}
Target length: about ${minutes} minutes → about ${words} words of narration in total, about ${Math.round(words / 45)} scenes.

Material / outline:
${material || "(none: explain the title with well-established knowledge)"}`;
};

// Short keys from the AI → the field names the rest of the module uses.
export function expandScenes(list, from = 0) {
  return (list || [])
    .filter((s) => s && typeof s.v === "string" && s.v.trim())
    .map((s, i) => ({
      id: `s${String(from + i + 1).padStart(2, "0")}`,
      heading: String(s.h || "").slice(0, 60),
      sub: String(s.s || "").slice(0, 90),
      // The first scene is the title card (its title is drawn by the titles layer).
      kind: from + i === 0 ? "title" : s.k || "ai",
      params: s.p && typeof s.p === "object" ? s.p : {},
      svg: typeof s.g === "string" ? s.g : "",
      note: String(s.n || "").slice(0, 100),
      beats: Array.isArray(s.b) ? s.b.filter((x) => typeof x === "string").slice(0, 4) : [],
      voice_text: s.v.trim(),
    }));
}

const presetFor = () => {
  const preset = activePreset();
  // Writing a script and its drawings needs no long deliberation; low effort keeps the call quick.
  return { ...preset, effort: "low", max_tokens: maxTokensFor(preset) };
};

export async function planLong({ title, material, minutes, brand, onLog = () => {} }) {
  if (config.ai.mode === "mock") return { plan: mockPlan(title, brand), usage: null, raw: "" };
  onLog(`AI viết kịch bản + vẽ hình động cho toàn bộ video (1 lượt gọi, ~${minutes} phút)`);
  const { json, text, usage } = await callModel([{ role: "user", content: userPrompt({ title, material, minutes, brand }) }], SCHEMA, SYSTEM, presetFor(), onLog);
  if (!json?.scenes?.length) throw Object.assign(new Error(`AI trả về kế hoạch không đọc được. Đoạn đầu: ${text.slice(0, 300)}`), { raw: text });
  const scenes = expandScenes(json.scenes);
  const blank = scenes.filter((sc) => !sc.svg.trim()).length;
  onLog(`Nhận ${scenes.length} cảnh, ${usage.output_tokens} token ra${blank ? ` — ${blank} cảnh thiếu hình, dùng hình dự phòng` : ""}`);
  return { plan: { title: json.title || title, description: json.description || "", scenes }, usage, raw: text };
}

// One more call for the scenes after the last one (when the first answer was cut short).
export async function continuePlan({ title, material, minutes, brand, plan, onLog = () => {} }) {
  const done = plan.scenes;
  const tail = done.slice(-3).map((s) => `- ${s.heading}: ${s.voice_text}`).join("\n");
  const said = done.map((s) => s.heading).join(" | ");
  onLog(`AI viết tiếp từ cảnh ${done.length + 1} (1 lượt gọi)`);
  const content = `${userPrompt({ title, material, minutes, brand })}

The first ${done.length} scenes are already written (headings: ${said}). The last ones were:
${tail}

Continue the SAME script from scene ${done.length + 1} to the end (do not repeat anything, no new title scene). Return { "title", "scenes": [only the new scenes] }.`;
  const { json, text, usage } = await callModel([{ role: "user", content }], SCHEMA, SYSTEM, presetFor(), onLog);
  if (!json?.scenes?.length) throw Object.assign(new Error(`AI trả về phần tiếp không đọc được. Đoạn đầu: ${text.slice(0, 300)}`), { raw: text });
  const scenes = expandScenes(json.scenes, done.length);
  onLog(`Thêm ${scenes.length} cảnh, ${usage.output_tokens} token ra`);
  return { plan: { ...plan, scenes: [...done, ...scenes] }, usage, raw: text };
}

// A short sample without AI (AI_MODE=mock), so the tab can be tried end to end.
function mockPlan(title, brand) {
  const v = (s) => s;
  return {
    title,
    description: "",
    scenes: expandScenes([
      { h: title, k: "title", p: {}, v: v(`Chào mừng bạn đến với ${brand || "kênh"}. Hôm nay chúng ta cùng tìm hiểu: ${title}.`) },
      EXAMPLE,
      { h: "Giãn nở tăng tốc", k: "graph", p: { curve: "accelerate", x: "Thời gian", y: "Quy mô", note: "Tăng tốc" }, b: ["nhanh dần"], v: "Điều bất ngờ là sự giãn nở không chậm lại như mọi người nghĩ. Nó đang nhanh dần theo thời gian." },
      { h: "Kiểm tra lại phép đo", k: "cards", p: { items: [{ icon: "ruler", label: "Khoảng cách" }, { icon: "bulb", label: "Độ sáng" }, { icon: "sliders", label: "Sai số" }], checks: true }, b: ["khoảng cách", "độ sáng", "sai số"], v: "Các nhà khoa học đã kiểm tra lại khoảng cách, độ sáng và cả sai số của phép đo. Kết quả vẫn giữ nguyên." },
      { h: "Điều gì còn thiếu?", k: "mystery", p: { middle: "question" }, b: ["chưa biết"], v: "Vậy thứ gì đang đẩy vũ trụ giãn nở nhanh hơn? Câu trả lời đến nay vẫn là điều chúng ta chưa biết." },
    ]),
  };
}
