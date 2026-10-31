// Plans a whole long video (several minutes, dozens of scenes) in ONE AI call: the AI writes the
// narration and, scene by scene, picks the visual that explains it best — a HyperFrames frame of the
// library (numbers, lists, comparisons…), a Motion Canvas animation (accurate simulations of a
// concept), or a drawing it makes itself (SVG plus motion attributes, aiscene.js). Only the frames and
// animations that fit the video are listed (library.js), with a minimum number of each so the video
// mixes them. A frame or animation scene also gets the AI's drawing, played over it as annotations
// (build.js) and used alone if the choice cannot be fixed. Strictly ONE call: choices are checked and
// fixed locally (repairScene), what still fails becomes its own drawing, and an answer cut short keeps
// its complete scenes. Voice, layers and rendering run locally.
import { callModel } from "../video/planner.js";
import { activePreset } from "../settings.js";
import { config } from "../config.js";
import { MOTION_GUIDE } from "./aiscene.js";
import { longLibrary, sceneProblems, repairScene, mixOf } from "./library.js";

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

Three kinds of scene — choose for each scene what explains it best, and follow the scene mix asked in the request:
- DRAW: you draw "g" yourself (motion guide below). Best for metaphors, maps, abstract ideas, anything the libraries do not cover. Scene 1 is always DRAW.
- FRAME: a HyperFrames template from "Library frames": "f" = frame id, "fi" = its inputs as a JSON object written as a string (only the inputs listed for that frame, within their limits — follow its Example), "g" = the overlay drawing (below). The frame shows its own title, so its title input carries the heading. Best for numbers, statistics, comparisons, lists, definitions, steps, quotes, timelines. "b" = the frame's keywords: exact phrases from "v" following its Keywords rule.
- ANIM: a Motion Canvas animation from "Library animations": "a" = component id, "ap" = its props as a JSON object string (only listed props, within their limits), "g" = the overlay drawing (below). Physically accurate: use it whenever the narration explains a mechanism or motion it simulates (orbits, waves, collisions, membranes…), with props that match the facts (real values). "b" = one exact phrase from "v" per cue of the component. Its title prop is replaced by "h".
Never invent frame ids, component ids, inputs or props; when nothing in the lists fits, DRAW.

COMBINE the three: a FRAME or ANIM scene ALSO gets "g" — an OVERLAY drawing played on top of the frame or animation, with the same motion attributes and beats: labels naming the parts, arrows and callouts pointing at what the narration talks about, highlight rings, a counter, a moving icon that adds the human-scale analogy, a small inset diagram. It keeps clear of the frame's text and the animation's main subject: use the margins (left/right thirds, corners, the band under the heading), 3–10 elements, transparent background (never a full-screen rect). The overlay must also stand on its own: if the frame or animation cannot be used, the overlay alone (with the heading) is shown instead, so it should still say the scene's idea.
There is no token budget: make every scene as rich, precise and alive as the idea deserves — detailed drawings, several beats, continuous motion — in this one answer.

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
          f: { type: "string" },
          fi: { type: "string" },
          a: { type: "string" },
          ap: { type: "string" },
        },
        required: ["h", "v"],
      },
    },
  },
  required: ["title", "scenes"],
};

// Room for every scene's drawing and overlay in the single answer: the most the API allows.
const maxTokensFor = () => 128000;

const sceneCount = (minutes) => Math.round((minutes * WORDS_PER_MIN) / 45);

const userPrompt = ({ title, material, minutes, brand, lib }) => {
  const words = Math.round(minutes * WORDS_PER_MIN);
  const t = lib.targets;
  return `Video title: ${title}
Channel name (shown in the corner, never spoken): ${brand || "(none)"}
Target length: about ${minutes} minutes → about ${words} words of narration in total, about ${sceneCount(minutes)} scenes.

Library frames (HyperFrames; * = required input):
${lib.prompt.frames || "(none for this video — do not use FRAME)"}

Library animations (Motion Canvas):
${lib.prompt.anims || "(none for this video — do not use ANIM)"}

Scene mix for this video: at least ${t.frame} FRAME scenes, at least ${t.anim} ANIM scenes (a component may be reused with different props), at least ${t.draw} DRAW scenes. Spread the kinds through the video; never three scenes of the same kind in a row.

Material / outline:
${material || "(none: explain the title with well-established knowledge)"}`;
};

// Short keys from the AI → the field names the rest of the module uses.
// JSON text written by the AI → object; null when it is not a JSON object.
const parseObj = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  try {
    const o = JSON.parse(String(v || "{}"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
};

export function expandScenes(list, from = 0) {
  return (list || [])
    .filter((s) => s && typeof s.v === "string" && s.v.trim())
    .map((s, i) => ({
      id: `s${String(from + i + 1).padStart(2, "0")}`,
      heading: String(s.h || "").slice(0, 60),
      sub: String(s.s || "").slice(0, 90),
      // The first scene is the title card (its title is drawn by the titles layer).
      kind: from + i === 0 ? "title" : s.f ? "frame" : s.a ? "anim" : s.k || "ai",
      ...(s.f && from + i > 0 ? { frame_id: String(s.f), inputs: parseObj(s.fi) } : {}),
      ...(s.a && from + i > 0 ? { component: String(s.a), props: parseObj(s.ap) } : {}),
      params: s.p && typeof s.p === "object" ? s.p : {},
      svg: typeof s.g === "string" ? s.g : "",
      note: String(s.n || "").slice(0, 100),
      beats: Array.isArray(s.b) ? s.b.filter((x) => typeof x === "string").slice(0, 4) : [],
      voice_text: s.v.trim(),
    }));
}

// The active preset's model and effort (no forced low effort: quality first), with the largest answer.
const presetFor = () => ({ ...activePreset(), max_tokens: maxTokensFor() });

// Checks the frame/animation scenes and fixes them locally — never another AI call. What still fails
// becomes a drawn scene showing the AI's own overlay drawing (or the fallback drawing if it has none).
// Returns { scenes, usages }.
async function checkScenes(scenes, lib, { onLog, offset = 0 }) {
  const opts = { frameIds: lib.frameIds, animIds: lib.animIds };
  for (const [i, sc] of scenes.entries()) {
    if (!sceneProblems(sc, opts).length) continue;
    const notes = repairScene(sc);
    const problems = sceneProblems(sc, opts);
    const name = sc.kind === "frame" ? sc.frame_id : sc.component;
    if (!problems.length) {
      onLog(`Cảnh ${offset + i + 1} (${name}): tự sửa — ${notes.join(", ")}`);
      continue;
    }
    onLog(`Cảnh ${offset + i + 1} (${name}) không dùng được → dùng hình AI vẽ cho cảnh này: ${problems.slice(0, 2).join("; ")}`);
    Object.assign(sc, { kind: "ai", frame_id: undefined, inputs: undefined, component: undefined, props: undefined });
  }
  return { scenes, usages: [] };
}

const mixLog = (scenes, targets) => {
  const m = mixOf(scenes);
  const short = [m.frame < targets.frame && `frame ${m.frame}/${targets.frame}`, m.anim < targets.anim && `animation ${m.anim}/${targets.anim}`].filter(Boolean);
  return `Phối cảnh: ${m.frame} frame HyperFrames, ${m.anim} animation Motion Canvas, ${m.draw} cảnh tự vẽ${short.length ? ` — thấp hơn mục tiêu: ${short.join(", ")}` : ""}`;
};

const sumUsage = (list) => list.filter(Boolean).reduce((a, u) => ({ ...a, ...u, input_tokens: (a.input_tokens || 0) + (u.input_tokens || 0), output_tokens: (a.output_tokens || 0) + (u.output_tokens || 0) }), {});

// topic: the topic object chosen for the video (or null: matched like a general science explainer).
// Characters an answer takes per scene (narration, drawing, overlay, JSON), to estimate the AI's progress.
const CHARS_PER_SCENE = 3200;

// onStage(key, info): progress for the page — "library", "ai" (with chars written and an estimated
// percent), "check".
export async function planLong({ title, material, minutes, brand, topic = null, onLog = () => {}, onStage = () => {} }) {
  onStage("library");
  const lib = longLibrary({ topic, title, material, scenes: sceneCount(minutes) });
  const library = { topic: topic?.topic_id || null, frameIds: lib.frameIds, animIds: lib.animIds, targets: lib.targets };
  if (config.ai.mode === "mock") return { plan: { ...mockPlan(title, brand), library }, usage: null, raw: "" };
  onLog(`Thư viện cho video: ${lib.frameIds.length} frame HyperFrames, ${lib.animIds.length} animation Motion Canvas${lib.animIds.length ? ` (${lib.animIds.join(", ")})` : ""}`);
  onLog(`AI viết kịch bản, chọn frame/animation và vẽ các cảnh còn lại (1 lượt gọi, ~${minutes} phút)`);
  const expected = sceneCount(minutes) * CHARS_PER_SCENE;
  onStage("ai", { detail: "đang chờ AI bắt đầu trả lời", percent: 0 });
  const onStream = ({ chars, thinking }) =>
    onStage("ai", {
      percent: Math.min(97, Math.round((chars / expected) * 100)),
      detail: chars ? `đã viết ${chars.toLocaleString("vi-VN")} ký tự (~${Math.min(sceneCount(minutes), Math.round(chars / CHARS_PER_SCENE))}/${sceneCount(minutes)} cảnh, ước tính)` : `AI đang suy nghĩ${thinking ? ` (${thinking.toLocaleString("vi-VN")} ký tự)` : ""}`,
    });
  const { json, text, usage } = await callModel([{ role: "user", content: userPrompt({ title, material, minutes, brand, lib }) }], SCHEMA, SYSTEM, presetFor(), onLog, onStream);
  if (!json?.scenes?.length) throw Object.assign(new Error(`AI trả về kế hoạch không đọc được. Đoạn đầu: ${text.slice(0, 300)}`), { raw: text });
  onStage("check", { detail: `${json.scenes.length} cảnh` });
  const { scenes, usages } = await checkScenes(expandScenes(json.scenes), lib, { onLog });
  const blank = scenes.filter((sc) => sc.kind === "ai" && !sc.svg.trim()).length;
  onLog(`Nhận ${scenes.length} cảnh, ${usage.output_tokens} token ra${blank ? ` — ${blank} cảnh thiếu hình, dùng hình dự phòng` : ""}`);
  onLog(mixLog(scenes, lib.targets));
  return { plan: { title: json.title || title, description: json.description || "", scenes, library }, usage: sumUsage([usage, ...usages]), raw: text };
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
