import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { activePreset, getSettings } from "../settings.js";
import { describeFrames } from "./catalog.js";
import { animCatalog, ANIM_ENGINE } from "./anim.js";
import { validatePlan } from "./validate.js";
import { motionSchema, motionGuide, cleanMotion } from "./motion.js";
import { STYLE_IDS, styleGuide } from "./styles.js";
import { illustrationGuide, cleanIllustration } from "./illustration.js";

const SYSTEM = `You plan short narrated videos that are assembled ONLY from a fixed library of animated templates ("frames"). You never write HTML; you return a JSON plan.

For each scene you write the narration (voice_text) and choose one frame from the list, filling its inputs.

Rules:
- Narration language: Vietnamese unless told otherwise. Natural spoken style for text-to-speech. Each scene's voice_text is 2–3 complete, flowing sentences (about 15–35 words) — never a fragment, a bare label or a single short phrase, which sounds cut off when voiced alone. Consecutive scenes read as one continuous script: carry the thought on from the previous scene with natural links ("Không chỉ vậy,", "Trong khi đó,", "Điều thú vị là", "Vì vậy") instead of restarting. Write numbers in voice_text the way they should be read aloud.
- The first scene uses the intro frame, the last scene uses the outro frame.
- Choose the frame that fits what the scene says (a number → stat frame, an enumeration → list frame, a comparison → compare frame, a person's words → quote frame). Vary frames: never the same frame twice in a row, and at most twice per video.
- Each scene's narration must fit its frame's duration range (about 2.6 Vietnamese words per second): long enough to fill at least the frame's minimum duration, short enough for its maximum; split long content across scenes, and give a short idea more context rather than a scene of a few words.
- On-screen text (inputs) is short and punchy, NOT a copy of the narration. Respect every character limit. Write numbers in inputs with digits.
- keywords: exact phrases copied verbatim from the same scene's voice_text, in spoken order, used to time the animation as described for each frame. Use [] when the frame needs none.
- transition_out: "wipe" when the next scene starts a new topic, otherwise "fade".
- Icons and logos: pick the icon that literally shows the scene's subject (a planet for space, a pill for medicine); the same icon at most twice per video. Use a brand logo only for a brand the material names. Pick a cutout only when it shows the very object the scene talks about.
- Project images listed with a description come from this very article (its own photos and captions) or were found for it: show each in the scene that talks about what it shows, before any other picture. Never show a picture of something the material does not talk about (another game, place, product or person of the same topic).
- Image frames may use project images or library photos. Use a library photo only when its description matches what the scene says, and copy its credit into the credit input.
- description: one short Vietnamese question (at most 120 characters) about the most surprising point of the video, so viewers are curious enough to click; built only on facts in the material, no emoji, no hashtags.
- Use only facts from the user's material. Never invent numbers, quotes, names, dates or a channel name, and never add opinions or evaluations (e.g. "quite competitive") that the material does not state. The only exception: wrong answer options in a quiz, which must be plausible but clearly wrong.`;

let client;
// No time limit on our side: a planning call waits as long as the server takes to answer. The SDK's
// own default (10 minutes) is replaced by a day; extra retries only ride out network drops.
const NO_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 4, timeout: NO_TIMEOUT_MS }));

// "4m05s" for a duration in ms; since(t) for the time since a Date.now() timestamp.
const duration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
const since = (t) => duration(Date.now() - t);

// Asks the AI for a plan in ONE call. What the answer gets wrong is fixed here instead of asking again:
// over-long texts are cut, unknown icons dropped, missing pictures replaced; whatever is left goes back
// as `errors` for the plan editor. Returns { plan, calls, errors }; calls records token usage.
// library: { icons: [name], logos: [name], photos: [{ name, label, credit }] } that suit the topic.
// extra: additional prompt sections (rich mode) for unlimited presets; motion: each scene also gets
// a story motion (motion.js) layered on its frame.
// visuals: each scene also lists the photos its sentence calls for (scene.visuals) and an image input
// may say "visual:<n>" for the scene's n-th one; fetchImages(items) downloads them after the answer and
// returns { item index: image file } for the ones found.
// music: the topic's background tracks [{ id, name, mood }]; with two or more the AI picks one (plan.music).
export async function planVideo({ material, title, channel, topic, frames, allowed, images = [], labels = {}, library = EMPTY_LIBRARY, targetSeconds = 90, extra = "", motion = false, music = [], visuals = false, fetchImages = null, savedAnswer = null, mock = false, onLog = () => {} }) {
  const allowedIds = allowed.map((f) => f.frame_id);
  if (mock || config.ai.mode === "mock") {
    const plan = mockPlan({ material, title, allowed, images, library, topic });
    const errors = validatePlan(plan, frames, { allowedFrameIds: allowedIds, images, cutouts: library.cutouts });
    if (errors.length) throw new Error(`Plan mẫu không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { plan, calls: [], errors: [] };
  }

  anthropic();
  const req = planRequest({ material, title, channel, topic, allowed, images, labels, library, targetSeconds, extra, motion, music, visuals: visuals && !!fetchImages });
  // savedAnswer: the AI's last answer (ai_last_response.txt) processed again, without a new call.
  if (savedAnswer) onLog("Dùng lại câu trả lời AI gần nhất (không gọi AI)");
  else onLog("AI lập kế hoạch (1 lượt gọi)");
  const answer = savedAnswer ? { json: parseLooseJson(savedAnswer), text: savedAnswer, usage: null } : null;
  const { json, text, usage } = answer || await callModel(req.messages, req.schema, SYSTEM, activePreset(), onLog).catch((err) => {
    if (err instanceof Anthropic.APIConnectionError) {
      const host = process.env.ANTHROPIC_BASE_URL ? new URL(process.env.ANTHROPIC_BASE_URL).host : "api.anthropic.com";
      throw new Error(`Không kết nối được tới máy chủ AI (${host}): ${err.cause?.code || err.message}. Kiểm tra mạng rồi bấm lập kế hoạch lại.`);
    }
    throw err;
  });
  const calls = usage ? [{ step: "plan", attempt: 1, ...usage }] : [];
  // The full answer goes back to the caller either way (saved as ai_last_response.txt).
  if (!json || !Array.isArray(json.scenes)) throw Object.assign(new Error(`AI trả về kế hoạch không đọc được (toàn văn lưu ở ai_last_response.txt). Đoạn đầu: ${text.slice(0, 300)}`), { raw: text });
  if (!strictJson(text)) onLog("JSON của AI có lỗi cú pháp nhỏ (xuống dòng trong chuỗi, dấu phẩy thừa hoặc bị cắt cụt) — đã tự sửa, kiểm tra lại các cảnh cuối");

  tidyScenes(json, library);
  if (!music.some((t) => String(t.id) === String(json.music))) delete json.music;
  if (!STYLE_IDS.includes(json.style)) delete json.style;
  const fixed = [...autoFix(json, frames), ...ensureEnds(json, frames, allowed, library)];
  if (fixed.length) onLog(`Tự sửa ${fixed.length} chỗ trong kế hoạch: ${fixed.join("; ").slice(0, 300)}`);
  // A line of a few words sounds cut off once voiced on its own: point those scenes out.
  const short = json.scenes.map((sc, i) => [i, String(sc.voice_text || "").trim().split(/s+/).filter(Boolean).length]).filter(([i, n]) => i > 0 && i < json.scenes.length - 1 && n < 10);
  if (short.length) onLog(`Lời đọc ngắn (dưới 10 từ, nghe dễ bị cụt) ở cảnh ${short.map(([i, n]) => `${i + 1} (${n} từ)`).join(", ")} — có thể viết thêm trong trình sửa kế hoạch`);
  let pictures = images;
  if (req.visuals) pictures = await attachVisuals(json, frames, fetchImages, { images, library, onLog });
  else for (const sc of json.scenes) sc.visuals = [];
  const errors = validatePlan(json, frames, { allowedFrameIds: allowedIds, images: pictures, cutouts: library.cutouts });
  if (errors.length) onLog(`Kế hoạch còn ${errors.length} lỗi cần sửa tay trong trình sửa (không gọi lại AI): ${errors.join("; ").slice(0, 300)}`);
  return { plan: json, calls, errors, raw: text };
}

const EMPTY_LIBRARY = { icons: [], logos: [], photos: [], cutouts: [], characters: [] };

// How many photos one scene may list (the schema enumerates visual:1…visual:MAX for image inputs).
const MAX_VISUALS = 8;
const MAX_SCENE_ICONS = 3;

// AI-written picture items cleaned into what the image sites understand: [{ queries: [english], label }].
// A model sometimes packs both phrases in one string ("plains zebra, zebra"); they are split again.
export const cleanItems = (list) =>
  (Array.isArray(list) ? list : [])
    .map((it) => ({
      label: String(it?.label || "").slice(0, 60),
      queries: [it?.queries]
        .flat()
        .flatMap((q) => String(q ?? "").split(/[,;/|]/))
        .map((q) => q.toLowerCase().replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 2),
    }))
    .filter((it) => it.queries.length);

// Scene-level pictures as the model wrote them → clean lists: visuals [{ queries, label, keyword }]
// (keyword kept only when it really is in the narration) and icons that exist in the library.
function tidyScenes(plan, library) {
  const icons = new Set(library.icons);
  for (const sc of plan.scenes) {
    const raw = Array.isArray(sc.visuals) ? sc.visuals.slice(0, MAX_VISUALS) : [];
    const voice = String(sc.voice_text || "").toLowerCase();
    sc.visuals = raw.map((v, i) => {
      const [item] = cleanItems([v]);
      const keyword = typeof v?.keyword === "string" && v.keyword.trim() && voice.includes(v.keyword.trim().toLowerCase()) ? v.keyword.trim() : "";
      const subject = typeof v?.subject === "string" ? v.subject.trim().slice(0, 80) : "";
      return item ? { ...item, subject, keyword, n: i + 1 } : null;
    });
    sc.icons = [...new Set((Array.isArray(sc.icons) ? sc.icons : []).filter((x) => icons.has(x)))].slice(0, MAX_SCENE_ICONS);
    // The drawing is kept only when its SVG is clean (see illustration.js); otherwise the scene has none.
    const drawing = "illustration" in sc ? cleanIllustration(sc.illustration) : null;
    if (drawing) sc.illustration = drawing;
    else delete sc.illustration;
  }
}

// Fixes what does not need the AI: texts and lists over their limits are cut, unknown inputs and bad
// keywords / transitions dropped. Returns a short note per fix.
function autoFix(plan, frames) {
  const notes = [];
  const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "").replace(/[\s,.;:–-]+$/, "") + "…");
  plan.title = typeof plan.title === "string" && plan.title.trim() ? plan.title : "Video";
  plan.scenes.forEach((sc, i) => {
    const frame = frames.get(sc.frame_id);
    if (!Array.isArray(sc.keywords)) sc.keywords = [];
    if (!["fade", "wipe"].includes(sc.transition_out)) sc.transition_out = "fade";
    if ("motion" in sc) {
      const { motion, dropped } = cleanMotion(sc.motion, sc.keywords.length);
      if (motion) sc.motion = motion;
      else delete sc.motion;
      if (dropped) notes.push(`s${i + 1}.motion: bỏ ${dropped} phần không hợp lệ`);
    }
    if (!frame || !sc.inputs || typeof sc.inputs !== "object") return;
    for (const k of Object.keys(sc.inputs)) {
      const spec = frame.inputs[k];
      const v = sc.inputs[k];
      if (!spec) {
        delete sc.inputs[k];
        notes.push(`s${i + 1}: bỏ "${k}"`);
      } else if (["string"].includes(spec.type) && !spec.enum && typeof v === "string" && spec.maxLength && v.length > spec.maxLength) {
        sc.inputs[k] = cut(v, spec.maxLength);
        notes.push(`s${i + 1}.${k}: rút gọn`);
      } else if (spec.type === "list" && Array.isArray(v)) {
        let list = spec.maxItems && v.length > spec.maxItems ? v.slice(0, spec.maxItems) : v;
        if (!spec.enum && spec.itemMaxLength) list = list.map((x) => (typeof x === "string" ? cut(x, spec.itemMaxLength) : x));
        if (JSON.stringify(list) !== JSON.stringify(v)) {
          // Lists that must match another list in length are trimmed together.
          for (const [a, b] of frame.same_length || []) {
            const other = a === k ? b : b === k ? a : null;
            if (other && Array.isArray(sc.inputs[other])) sc.inputs[other] = sc.inputs[other].slice(0, list.length);
          }
          sc.inputs[k] = list;
          notes.push(`s${i + 1}.${k}: rút gọn danh sách`);
        }
      } else if (["icons", "characters"].includes(spec.type) && Array.isArray(v) && spec.maxItems && v.length > spec.maxItems) {
        sc.inputs[k] = v.slice(0, spec.maxItems);
        notes.push(`s${i + 1}.${k}: bớt phần tử`);
      }
    }
  });
  return notes;
}

// Downloads the photos every scene listed, then puts them in place: scene.visuals becomes
// [{ image, label, keyword }] (only the ones found) and an image input "visual:<n>" gets the scene's
// n-th photo — or, when that one was not found, another photo of the scene, of a nearby scene, a
// project image or a library photo. Returns the image names the plan may now use.
async function attachVisuals(plan, frames, fetchImages, { images, library, onLog }) {
  const items = [];
  plan.scenes.forEach((sc, s) => sc.visuals.forEach((v, j) => v && items.push({ s, j, queries: v.queries, label: v.label, subject: v.subject })));
  const found = items.length ? await fetchImages(items.map(({ queries, label }) => ({ queries, label }))).catch((err) => (onLog(`Không tải được ảnh: ${err.message}`), {})) : {};
  const fileOf = new Map(items.map((it, i) => [`${it.s}:${it.j}`, found[i]]));
  for (const [s, sc] of plan.scenes.entries()) {
    sc.visuals = sc.visuals.map((v, j) => (v && fileOf.get(`${s}:${j}`) ? { image: fileOf.get(`${s}:${j}`), label: v.label, keyword: v.keyword, n: v.n } : null));
  }
  const near = (s) =>
    [...plan.scenes.keys()]
      .sort((a, b) => Math.abs(a - s) - Math.abs(b - s))
      .flatMap((k) => plan.scenes[k].visuals.filter(Boolean).map((v) => v.image));
  let replaced = 0;
  for (const [s, sc] of plan.scenes.entries()) {
    const frame = frames.get(sc.frame_id);
    for (const [k, v] of Object.entries(sc.inputs || {})) {
      if (frame?.inputs[k]?.type !== "image" || typeof v !== "string" || !/^visual:\d+$/.test(v)) continue;
      const n = Number(v.slice(7));
      const own = sc.visuals.find((x) => x?.n === n)?.image;
      // Only pictures of this material: never a topic library photo, which may show something else.
      const pick = own || sc.visuals.find(Boolean)?.image || near(s)[0] || images[0];
      if (pick) sc.inputs[k] = pick;
      if (!own && pick) replaced++;
    }
    sc.visuals = sc.visuals.filter(Boolean).map(({ n, ...x }) => x);
  }
  if (replaced) onLog(`${replaced} cảnh không tìm được đúng ảnh, đã dùng ảnh gần nhất thay thế`);
  return [...new Set([...images, ...Object.values(found)])];
}

const visualsGuide = `
Photos for each scene: in "visuals" list, for the scene's own sentence, every place, scene, person, product or event it shows — as many as the sentence names (three places → three photos, the main scene and the smaller scenes inside it), none for an abstract sentence; at most ${MAX_VISUALS}. They are downloaded after you plan and shown one after another behind the scene. Photos must show THIS material's own subject, never just its topic: an article about League of Legends gets League of Legends photos only, never other games or "esports" in general.
For each: subject = the proper name the photo must show, in English as it is written on Wikipedia ("League of Legends", "Faker", "Hoan Kiem Lake", "iPhone 16") — "" only for a plain generic thing named in the sentence; queries = 1–2 English image-search phrases that both contain the subject (e.g. ["league of legends world championship", "league of legends worlds stage"], ["hoan kiem lake hanoi", "turtle tower hoan kiem"]), never a broader phrase without it, 1–5 lowercase words, no words like "photo" or "image"; label = short Vietnamese name; keyword = the exact phrase of the voice_text at which the photo should appear ("" for the start). A photo whose subject cannot be found is left out rather than replaced by something else.
An image input may use "visual:<n>" to show the scene's n-th photo (n from 1).`;

const iconsGuide = `
Icons for each scene: in "icons" pick 0–${MAX_SCENE_ICONS} icons from the Icons list that literally show what the scene's sentence talks about; they pop in at the edge of the scene. [] when none fits.`;

// The planning request (system prompt, first user message, output schema), without calling the API.
// Library lists only reach the prompt when an allowed frame can use them; icons always do (scene icons).
// labels: what the project's own images and cutouts show ({ image file or cutout name: label }).
// visuals: each scene also lists its photos (see planVideo); music: the topic's tracks to choose from.
export function planRequest({ material, title, channel, topic, allowed, images = [], labels = {}, library = EMPTY_LIBRARY, targetSeconds = 90, extra = "", motion = false, music = [], visuals = false }) {
  // Story motion casts icons and characters as actors, so their lists go in even when no frame uses them.
  // Motion Canvas clips: only the components of the topic's type reach the prompt, those the material
  // talks about first (metadata, never code); with none, the clip frame is dropped instead of
  // tempting the AI to invent one.
  const anim = allowed.some((f) => f.engine === ANIM_ENGINE) ? animCatalog(`${title || ""}
${material}`, topic) : null;
  if (anim) {
    allowed = anim.ids.length
      ? allowed.map((f) => (f.engine === ANIM_ENGINE ? { ...f, inputs: { ...f.inputs, component: { ...f.inputs.component, enum: anim.ids } } } : f))
      : allowed.filter((f) => f.engine !== ANIM_ENGINE);
    if (anim.ids.length)
      extra += `
Animation components for frame anim-clip (pre-rendered Motion Canvas animations). Use only these ids and only the props listed for each; write props as a JSON object string, e.g. "{\"v0\":20}". Give the scene one keyword per cue of the component. Use a clip where the narration explains motion or a mechanism, at most one clip in every three scenes:
${anim.prompt}`;
  }
  const uses = (...types) => allowed.some((f) => Object.values(f.inputs).some((i) => types.includes(i.type)));
  const lib = {
    icons: library.icons,
    logos: uses("logo") ? library.logos : [],
    // Topic library photos show the topic, not this material: left out when the scenes get their own photos.
    photos: uses("image") && !visuals ? library.photos : [],
    cutouts: uses("cutout") ? library.cutouts || [] : [],
    characters: motion || uses("character", "characters") ? library.characters || [] : [],
  };
  if (motion) extra += motionGuide;
  // Unlimited presets (motion on) also get an animated drawing for every scene.
  if (motion) extra += illustrationGuide;
  if (visuals) extra += visualsGuide;
  extra += styleGuide;
  if (lib.icons.length) extra += iconsGuide;
  const groups = {};
  for (const c of lib.characters) (groups[c.group] ||= []).push(c.name);
  // Placeholders visual:<n> are valid image names only in the schema; the prompt lists the real ones.
  const placeholders = Array.from({ length: visuals ? MAX_VISUALS : 0 }, (_, i) => `visual:${i + 1}`);
  const tracks = music.length > 1 ? music : [];
  if (tracks.length)
    extra += `
Background music: in "music" give the id of the track whose mood fits the video best:
${tracks.map((t) => `- ${t.id}: ${t.name}${t.mood ? ` — ${t.mood}` : ""}`).join("\n")}`;
  const schema = planSchema(allowed, [...images, ...lib.photos.map((p) => p.name), ...placeholders], lib, { motion, visuals, music: tracks.map((t) => String(t.id)), illustrate: motion });
  const words = Math.round(targetSeconds * 2.6);
  const described = (n) => (labels[n] ? `${n} (${labels[n]})` : n);
  const prompt = `Available frames (* = required input):
${describeFrames(allowed, { samples: motion })}

Project images: ${images.length ? images.map(described).join(", ") : visuals ? "(none yet — use visual:<n> for the scene's own photos)" : lib.photos.length ? "(none)" : "(none — do not use image frames)"}
${lib.photos.length ? `Library photos (name — what it shows — credit):\n${lib.photos.map((p) => `- ${p.name} — ${p.label} — ${p.credit}`).join("\n")}\n` : ""}${lib.icons.length ? `Icons: ${lib.icons.join(", ")}\n` : ""}${lib.logos.length ? `Logos: ${lib.logos.join(", ")}\n` : ""}${lib.cutouts.length ? `Cutouts (photo of one object, background removed${lib.cutouts.some((n) => labels[n]) ? "; those with a description were found for this video's material, prefer them" : ""}): ${lib.cutouts.map(described).join(", ")}\n` : ""}${Object.entries(groups)
    .map(([g, names]) => `Characters — ${g}: ${names.join(", ")}\n`)
    .join("")}Topic: ${topic ? `${topic.name} — ${topic.description}` : "general"}
Narration tone: ${topic?.tone || "clear and natural"}
Target length: about ${targetSeconds}s of narration (~${words} Vietnamese words in total).
${title ? `Video title: ${title}\n` : ""}Channel name: ${channel || "(none — leave every channel input empty)"}
${extra}

User material:
"""
${material.trim()}
"""`;
  return { system: SYSTEM, messages: [{ role: "user", content: prompt }], schema, visuals };
}


// Model, effort and output length come from the active preset (Cấu hình AI page).
// Streaming keeps long "unlimited" answers flowing; there is no time limit on our side.
// onLog gets a timer every 30s: time since the request, and whether the answer has started.
// A call that fails is not asked again at a lower effort (that would be a second paid call); only a
// stream the gateway closed before sending anything is retried, since nothing was generated.
export async function callModel(messages, schema, system = SYSTEM, preset = activePreset(), onLog = () => {}) {
  anthropic();
  const started = Date.now();
  const effort = preset.effort;
  let response;
  let empty = 0;
  for (;;) {
    const body = {
      model: preset.model,
      max_tokens: preset.max_tokens,
      system: config.ai.structured ? system : `${system}

${schemaInPrompt(schema)}`,
      messages,
      output_config: config.ai.structured ? { effort, format: { type: "json_schema", schema } } : { effort },
    };
    try {
      response = await streamOnce(body, onLog);
      break;
    } catch (err) {
      // The gateway sometimes opens the stream and closes it without a single event; nothing was
      // generated, so ask again (twice at most).
      if (/without sending any chunks/.test(err.message) && ++empty <= 2) {
        onLog(`Gateway đóng kết nối mà không gửi dữ liệu: gọi lại (lần ${empty}/2)`);
        continue;
      }
      // Cut mid-answer (a gateway time limit, a dropped connection): what was written is kept — the
      // plan's reader closes it at the last complete scene — instead of losing the whole call.
      if (err.partialText?.length > 2000) {
        onLog(`Kết nối bị ngắt giữa chừng (${err.message.slice(0, 160)}) — giữ ${err.partialText.length} ký tự AI đã viết, dùng các cảnh đã hoàn chỉnh`);
        response = { content: [{ type: "text", text: err.partialText }], stop_reason: "cut", model: preset.model, usage: {} };
        break;
      }
      // Cut by the far side after a long wait: our side never gives up, so say where it came from.
      if (err instanceof Anthropic.APIError && Date.now() - started > 240_000)
        err.message = `${err.message} — máy chủ AI/cổng trung gian đã tự ngắt lượt gọi (phía ứng dụng không giới hạn thời gian chờ). Thử hạ effort ở trang Cấu hình AI để AI trả lời nhanh hơn.`;
      throw err;
    }
  }
  onLog(`AI trả lời xong sau ${since(started)}`);
  if (response.stop_reason === "refusal") throw new Error("AI từ chối lập kế hoạch cho nội dung này");
  // Out of output tokens: like a cut connection, the complete scenes so far are used.
  if (response.stop_reason === "max_tokens")
    onLog(`AI chạm giới hạn max_tokens (${response.usage?.output_tokens} token ra) — dùng các cảnh đã hoàn chỉnh; nâng max_tokens ở trang Cấu hình AI nếu thiếu cảnh`);
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const json = parseLooseJson(text);
  // `model` is what actually answered (a fallback or gateway may differ from the request).
  const usage = {
    model: response.model || preset.model,
    billing: preset.billing,
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: response.usage?.cache_creation_input_tokens ?? 0,
  };
  return { json, text, usage };
}

// The JSON object in a model's answer, read leniently since a plan comes from one call and a near-miss
// must not waste it: markdown fences and text around the object are ignored, raw line breaks and tabs
// inside strings (common in custom-scene code) are escaped, trailing commas dropped, and an answer cut
// off mid-way keeps everything up to its last complete element (e.g. the scenes finished so far).
// Returns null when nothing usable is found.
// Whether the answer was valid JSON as it came (only a markdown fence around it allowed).
const strictJson = (text) => {
  try {
    JSON.parse(text.trim().replace(/^```(?:json)?s*|s*```$/g, ""));
    return true;
  } catch {
    return false;
  }
};

export function parseLooseJson(text) {
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(text);
  if (direct && typeof direct === "object") return direct;
  const start = text.indexOf("{");
  if (start < 0) return null;
  // One pass: escape control characters inside strings, and remember after each closed object/array
  // which brackets were still open, so a cut-off answer can be closed at its last complete element.
  let out = "";
  let inString = false;
  let escaped = false;
  let word = ""; // letters outside strings: only true / false / null (or a number's exponent) belong there
  const stack = [];
  const cuts = []; // [length of out, closers needed]
  // A stray word outside a string ('…"keyword": "x"}hes], …' came back once) is dropped.
  const endWord = () => {
    if (word && (/^(true|false|null)$/.test(word) || (/^[eE]$/.test(word) && /\d$/.test(out)))) out += word;
    word = "";
  };
  for (const c of text.slice(start)) {
    if (!inString && /[A-Za-z_]/.test(c)) {
      word += c;
      continue;
    }
    endWord();
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      else if (c === "\n") { out += "\\n"; continue; }
      else if (c === "\r") { out += "\\r"; continue; }
      else if (c === "\t") { out += "\\t"; continue; }
      else if (c < " ") { out += `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`; continue; }
      out += c;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      stack.pop();
      out = out.replace(/,\s*$/, ""); // a trailing comma before the closer
      out += c;
      if (!stack.length) break; // the end of the top-level object
      cuts.push([out.length, [...stack].reverse().join("")]);
      continue;
    }
    out += c;
  }
  const whole = tryParse(out);
  if (whole && typeof whole === "object") return whole;
  // Cut off: close at the latest point that still parses.
  for (let i = cuts.length - 1; i >= Math.max(0, cuts.length - 400); i--) {
    const [len, closers] = cuts[i];
    const fixed = tryParse(`${out.slice(0, len)}${closers}`);
    if (fixed && typeof fixed === "object") return fixed;
  }
  return null;
}

// Without structured outputs the model is told the schema; validation and the repair round still
// catch whatever it gets wrong.
const schemaInPrompt = (schema) =>
  `OUTPUT FORMAT: reply with ONE JSON object and nothing else (no markdown fences, no comments). It must conform to this JSON Schema:
${JSON.stringify(schema)}`;

// One streamed request; returns the final message. Errors carry the elapsed time and progress.
async function streamOnce(body, onLog) {
  const stream = getSettings().fallbacks
    ? client.messages.stream({ ...body, fallbacks: "default" }, { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } })
    : client.messages.stream(body);
  const started = Date.now();
  // firstByte: response headers; lastEvent: last SSE event of any kind (pings included), so a
  // gateway that cuts a silent connection shows up as a long gap before the error.
  let firstByte = 0;
  let lastEvent = 0;
  let chars = 0;
  let thinking = 0;
  let text = ""; // the answer so far, kept for when the connection is cut mid-way
  stream.on("connect", () => {
    firstByte = lastEvent = Date.now();
    onLog(`AI kết nối sau ${since(started)} (effort ${body.output_config.effort}${body.output_config.format ? "" : ", schema trong prompt"})`);
  });
  stream.on("streamEvent", (e) => {
    lastEvent = Date.now();
    if (e.type === "content_block_delta" && e.delta.type === "thinking_delta") thinking += e.delta.thinking.length;
  });
  stream.on("text", (t) => {
    chars += t.length;
    text += t;
  });
  const progress = () => (firstByte ? `trả lời ${chars} ký tự, suy nghĩ ${thinking} ký tự, dữ liệu cuối ${since(lastEvent)} trước` : "chưa có phản hồi");
  const timer = setInterval(() => onLog(`⏱ Đang chờ AI: ${since(started)} — ${progress()}`), 30_000);
  try {
    return await stream.finalMessage();
  } catch (err) {
    err.message = `${err.message} (sau ${since(started)}, ${progress()})`;
    err.partialText = text;
    throw err;
  } finally {
    clearInterval(timer);
  }
}

// One schema branch per allowed frame, so the model can only emit inputs that frame accepts.
// Length limits live in the prompt and the validator: structured outputs ignore maxLength.
export function planSchema(allowed, images, lib = EMPTY_LIBRARY, { motion = false, visuals = false, music = [], illustrate = false } = {}) {
  // Shared enums live in $defs so a long icon list is sent once, not once per frame.
  const $defs = motion ? { motion: motionSchema } : {};
  if (lib.icons.length) $defs.icon = { type: "string", enum: lib.icons };
  if (lib.logos.length) $defs.logo = { type: "string", enum: lib.logos };
  if (lib.cutouts?.length) $defs.cutout = { type: "string", enum: lib.cutouts };
  if (lib.characters?.length) $defs.character = { type: "string", enum: lib.characters.map((c) => c.name) };
  const ref = (name) => ($defs[name] ? { $ref: `#/$defs/${name}` } : { type: "string" });
  // Scene-level photos and icons (the same for every frame), defined once.
  if (visuals)
    $defs.visuals = {
      type: "array",
      description: "photos of the places, scenes and things this scene's sentence shows",
      items: {
        type: "object",
        properties: { subject: { type: "string" }, queries: { type: "array", items: { type: "string" } }, label: { type: "string" }, keyword: { type: "string" } },
        required: ["subject", "queries", "label", "keyword"],
        additionalProperties: false,
      },
    };
  const sceneIcons = lib.icons.length ? { type: "array", items: ref("icon"), description: "0-3 icons for this scene" } : null;
  if (illustrate)
    $defs.illustration = {
      type: "object",
      description: "an animated SVG diagram of the scene's idea",
      properties: { svg: { type: "string" }, caption: { type: "string" } },
      required: ["svg", "caption"],
      additionalProperties: false,
    };
  const branch = (f) => {
    const props = {};
    const required = [];
    for (const [k, i] of Object.entries(f.inputs)) {
      if (i.type === "number") props[k] = { type: "number" };
      else if (i.type === "numbers") props[k] = { type: "array", items: { type: "number" }, description: `${i.minItems ?? 1}-${i.maxItems ?? 6} numbers` };
      else if (i.type === "list" && i.enum) props[k] = { type: "array", items: { type: "string", enum: i.enum }, description: `${i.minItems ?? 1}-${i.maxItems ?? 5} items` };
      else if (i.type === "list")
        props[k] = { type: "array", items: { type: "string", description: `at most ${i.itemMaxLength ?? 60} characters` }, description: `${i.minItems ?? 1}-${i.maxItems ?? 5} items` };
      else if (i.type === "string" && i.enum) props[k] = { type: "string", enum: i.enum };
      else if (i.type === "code") props[k] = { type: "string", description: `${i.description || "code"}, at most ${i.maxLength} characters` };
      else if (i.type === "json") props[k] = { type: "string", description: i.description || "JSON object as a string" };
      else if (i.type === "image") props[k] = images.length ? { type: "string", enum: images } : { type: "string" };
      else if (["icon", "logo", "cutout", "character"].includes(i.type)) props[k] = ref(i.type);
      else if (i.type === "characters") props[k] = { type: "array", items: ref("character"), description: `${i.minItems ?? 1}-${i.maxItems ?? 5} character names` };
      else if (i.type === "icons") props[k] = { type: "array", items: ref("icon"), description: `${i.minItems ?? 1}-${i.maxItems ?? 4} icon names` };
      else props[k] = { type: "string", description: `at most ${i.maxLength ?? 80} characters` };
      if (i.required) required.push(k);
    }
    return {
      type: "object",
      properties: {
        frame_id: { type: "string", enum: [f.frame_id] },
        voice_text: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        transition_out: { type: "string", enum: ["fade", "wipe"] },
        inputs: { type: "object", properties: props, required, additionalProperties: false },
        ...(visuals ? { visuals: { $ref: "#/$defs/visuals" } } : {}),
        ...(sceneIcons ? { icons: sceneIcons } : {}),
        ...(illustrate ? { illustration: { $ref: "#/$defs/illustration" } } : {}),
        ...(motion ? { motion: { $ref: "#/$defs/motion" } } : {}),
      },
      required: ["frame_id", "voice_text", "keywords", "transition_out", "inputs", ...(visuals ? ["visuals"] : []), ...(sceneIcons ? ["icons"] : []), ...(illustrate ? ["illustration"] : []), ...(motion ? ["motion"] : [])],
      additionalProperties: false,
    };
  };
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string", description: "one short curiosity question, at most 120 characters" },
      style: { type: "string", enum: STYLE_IDS },
      ...(music.length ? { music: { type: "string", enum: music } } : {}),
      scenes: { type: "array", items: { anyOf: allowed.map(branch) } },
    },
    required: ["title", "description", "style", ...(music.length ? ["music"] : []), "scenes"],
    additionalProperties: false,
    ...(Object.keys($defs).length ? { $defs } : {}),
  };
}

// Deterministic plan for running the pipeline without spending tokens:
// one sentence per scene, frame picked by simple heuristics.
// Fills a frame's required text inputs with a cut-down string (mock mode only).
// A video opens with an intro and closes with an outro. When the answer lacks one (the model forgot it,
// or a broken answer was cut short), a plain one is added instead of failing the plan.
function ensureEnds(plan, frames, allowed, library) {
  const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
  const typeOf = (sc) => frames.get(sc?.frame_id)?.scene_type;
  const pick = (type, prefer) => allowed.find((f) => f.frame_id === prefer) || allowed.find((f) => f.scene_type === type);
  const base = { keywords: [], transition_out: "fade", visuals: [], icons: [] };
  const notes = [];
  if (typeOf(plan.scenes[0]) !== "intro") {
    const f = pick("intro");
    const title = String(plan.title || "Video");
    if (f) plan.scenes.unshift({ ...base, frame_id: f.frame_id, voice_text: `${title.replace(/[.!?…]+$/, "")}.`, inputs: fillText(f, title, cut, library) });
    if (f) notes.push("thêm cảnh mở đầu");
  }
  if (typeOf(plan.scenes.at(-1)) !== "outro") {
    const f = pick("outro", "outro-subscribe");
    const inputs = f?.frame_id === "outro-subscribe" ? { message: "Cảm ơn bạn đã xem", cta: "Đăng ký kênh để xem video tiếp theo" } : f ? fillText(f, "Cảm ơn bạn đã xem", cut, library) : null;
    if (f) plan.scenes.push({ ...base, frame_id: f.frame_id, voice_text: "Cảm ơn bạn đã theo dõi. Đừng quên đăng ký kênh để xem những video tiếp theo nhé.", inputs });
    if (f) notes.push("thêm cảnh kết");
  }
  return notes;
}

function fillText(frame, text, cut, library = EMPTY_LIBRARY) {
  const inputs = {};
  for (const [k, i] of Object.entries(frame.inputs)) {
    if (!i.required) continue;
    if (i.type === "string") inputs[k] = cut(text, i.maxLength ?? 60);
    else if (i.type === "list") inputs[k] = Array.from({ length: i.minItems ?? 2 }, (_, n) => cut(`${text} ${n + 1}`, i.itemMaxLength ?? 40));
    else if (i.type === "number") inputs[k] = 1;
    else if (i.type === "icon" && library.icons.length) inputs[k] = library.icons[0];
    else if (i.type === "logo" && library.logos.length) inputs[k] = library.logos[0];
    else if (i.type === "cutout" && library.cutouts?.length) inputs[k] = library.cutouts[0];
    else if (i.type === "character" && library.characters?.length) inputs[k] = library.characters[0].name;
    else if (i.type === "characters" && library.characters?.length)
      inputs[k] = library.characters.slice(0, i.minItems ?? 2).map((c) => c.name);
  }
  return inputs;
}

function mockPlan({ material, title, allowed, images, library, topic }) {
  const has = (id) => allowed.some((f) => f.frame_id === id);
  const sentences = material
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
  const videoTitle = title || cut(sentences[0] || "Bản tin", 70);
  const intro = allowed.find((f) => f.scene_type === "intro");
  const scenes = [
    {
      frame_id: intro.frame_id,
      voice_text: `Chào mừng bạn đến với video hôm nay: ${videoTitle}.`,
      keywords: [],
      transition_out: "wipe",
      inputs: { ...fillText(intro, videoTitle, cut, library), ...(intro.inputs.kicker ? { kicker: topic?.kicker || "Video" } : {}) },
    },
  ];
  let img = 0;
  sentences.forEach((s, i) => {
    const num = s.match(/(\d+(?:[.,]\d+)?)\s*(%|phần trăm)?/);
    const parts = s.split(/,\s*|\s+và\s+/).filter((p) => p.trim().length > 2);
    if (num && has("stat-big")) {
      scenes.push({
        frame_id: "stat-big",
        voice_text: s,
        keywords: [num[1]],
        transition_out: "fade",
        inputs: { value: Number(num[1].replace(",", ".")), unit: num[2] ? "%" : "", label: cut(s.replace(num[0], "").trim(), 70) },
      });
    } else if (parts.length >= 3 && has("bullet-list")) {
      const items = parts.slice(-3).map((p) => cut(p.trim(), 60));
      scenes.push({
        frame_id: "bullet-list",
        voice_text: s,
        keywords: items.map((p) => p.split(" ")[0]),
        transition_out: "fade",
        inputs: { title: cut(parts[0], 50), items },
      });
    } else if (images.length && img < images.length && i % 2 === 1 && has("image-caption")) {
      scenes.push({
        frame_id: "image-caption",
        voice_text: s,
        keywords: [],
        transition_out: "fade",
        inputs: { image: images[img++], title: cut(s.split(" ").slice(0, 5).join(" "), 40), caption: cut(s, 120) },
      });
    } else if (has("headline")) {
      scenes.push({
        frame_id: "headline",
        voice_text: s,
        keywords: [],
        transition_out: i % 3 === 2 ? "wipe" : "fade",
        inputs: { title: cut(s.split(" ").slice(0, 9).join(" "), 70), subtitle: cut(s, 110) },
      });
    } else {
      // Topics without headline (e.g. storytelling): any allowed content frame, filled generically.
      const content = allowed.filter((f) => !["intro", "outro"].includes(f.scene_type) && !Object.values(f.inputs).some((x) => x.required && x.type === "image"));
      const f = content[i % content.length];
      scenes.push({ frame_id: f.frame_id, voice_text: s, keywords: [], transition_out: "fade", inputs: fillText(f, s, cut, library) });
    }
  });
  scenes.push({
    frame_id: "outro-subscribe",
    voice_text: "Cảm ơn bạn đã theo dõi. Đừng quên đăng ký kênh để cập nhật tin mới nhé.",
    keywords: [],
    transition_out: "fade",
    inputs: { message: "Cảm ơn bạn đã xem", cta: "Đăng ký để cập nhật tin mới" },
  });
  // One library icon per content scene, so the scene icon layer shows up in a mock video too.
  const last = scenes.length - 1;
  scenes.forEach((s, i) => Object.assign(s, { visuals: [], icons: i > 0 && i < last && library.icons.length ? [library.icons[i % library.icons.length]] : [] }));
  return { title: videoTitle, description: `Bạn đã biết hết về ${videoTitle.replace(/[?.!…]+$/, "")}?`.slice(0, 120), scenes };
}
