import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { EFFORTS, activePreset, getSettings } from "../settings.js";
import { describeFrames } from "./catalog.js";
import { validatePlan } from "./validate.js";
import { motionSchema, motionGuide } from "./motion.js";

const SYSTEM = `You plan short narrated videos that are assembled ONLY from a fixed library of animated templates ("frames"). You never write HTML; you return a JSON plan.

For each scene you write the narration (voice_text) and choose one frame from the list, filling its inputs.

Rules:
- Narration language: Vietnamese unless told otherwise. Natural spoken style for text-to-speech: 1–2 short sentences per scene. Write numbers in voice_text the way they should be read aloud.
- The first scene uses the intro frame, the last scene uses the outro frame.
- Choose the frame that fits what the scene says (a number → stat frame, an enumeration → list frame, a comparison → compare frame, a person's words → quote frame). Vary frames: never the same frame twice in a row, and at most twice per video.
- Each scene's narration must fit its frame's duration range (about 2.6 Vietnamese words per second); split long content across scenes.
- On-screen text (inputs) is short and punchy, NOT a copy of the narration. Respect every character limit. Write numbers in inputs with digits.
- keywords: exact phrases copied verbatim from the same scene's voice_text, in spoken order, used to time the animation as described for each frame. Use [] when the frame needs none.
- transition_out: "wipe" when the next scene starts a new topic, otherwise "fade".
- Icons and logos: pick the icon that literally shows the scene's subject (a planet for space, a pill for medicine); the same icon at most twice per video. Use a brand logo only for a brand the material names. Pick a cutout only when it shows the very object the scene talks about.
- Images and cutouts found for this video (the ones listed with a description) were picked for this material: show most of them, each in the scene that talks about what it shows.
- Image frames may use project images or library photos. Use a library photo only when its description matches what the scene says, and copy its credit into the credit input.
- Use only facts from the user's material. Never invent numbers, quotes, names, dates or a channel name, and never add opinions or evaluations (e.g. "quite competitive") that the material does not state. The only exception: wrong answer options in a quiz, which must be plausible but clearly wrong.`;

let client;
const GATEWAY_LIMIT_MS = 300_000;

// "4m05s" for a duration in ms; since(t) for the time since a Date.now() timestamp.
const duration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
const since = (t) => duration(Date.now() - t);

// Asks the AI for a plan, validates it, and gives the AI one chance to repair errors.
// Returns { plan, calls } where calls records token usage for cost tracking.
// library: { icons: [name], logos: [name], photos: [{ name, label, credit }] } that suit the topic.
// extra: additional prompt sections (rich mode) for unlimited presets; motion: each scene also gets
// a story motion (motion.js) layered on its frame.
// illustrate: the AI also lists that many things to picture ("illustrations") and may put "new:<n>"
// in cutout inputs; once the plan is valid, fetchImages(items) downloads them (in the same planning
// call, no extra request) and returns { "new:<n>": cutout name } for the ones found. A placeholder left
// unresolved goes back to the AI as an ordinary plan error.
export async function planVideo({ material, title, channel, topic, frames, allowed, images = [], labels = {}, library = EMPTY_LIBRARY, targetSeconds = 90, extra = "", motion = false, illustrate = 0, fetchImages = null, mock = false, onLog = () => {} }) {
  const allowedIds = allowed.map((f) => f.frame_id);
  if (mock || config.ai.mode === "mock") {
    const plan = mockPlan({ material, title, allowed, images, library, topic });
    const errors = validatePlan(plan, frames, { allowedFrameIds: allowedIds, images, cutouts: library.cutouts });
    if (errors.length) throw new Error(`Plan mẫu không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { plan, calls: [] };
  }

  // Extra retries ride out brief network/DNS drops on the way to the API or gateway.
  client ??= new Anthropic({ maxRetries: 4 });
  const req = planRequest({ material, title, channel, topic, allowed, images, labels, library, targetSeconds, extra, motion, illustrate: fetchImages ? illustrate : 0 });
  const { messages, schema } = req;
  let pending = req.illustrate > 0; // illustrations not fetched yet
  let cutouts = library.cutouts;
  const calls = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    onLog(`AI lập kế hoạch (lần ${attempt})`);
    const { json, text, usage } = await callModel(messages, schema, SYSTEM, activePreset(), onLog).catch((err) => {
      if (err instanceof Anthropic.APIConnectionError) {
        const host = process.env.ANTHROPIC_BASE_URL ? new URL(process.env.ANTHROPIC_BASE_URL).host : "api.anthropic.com";
        throw new Error(`Không kết nối được tới máy chủ AI (${host}): ${err.cause?.code || err.message}. Kiểm tra mạng rồi bấm lập kế hoạch lại.`);
      }
      throw err;
    });
    calls.push({ step: "plan", attempt, ...usage });
    const items = pending ? illustrationItems(json) : [];
    const placeholders = items.map((_, i) => `new:${i + 1}`);
    let errors = json ? validatePlan(json, frames, { allowedFrameIds: allowedIds, images, cutouts: [...cutouts, ...placeholders] }) : ["không đọc được JSON"];
    if (pending && json && !items.length) errors.push("illustrations: cần liệt kê những thứ cần minh hoạ (queries tiếng Anh + label)");
    if (!errors.length && pending) {
      // The plan is sound: fetch the pictures it asked for and put their names in place of new:<n>.
      pending = false;
      delete json.illustrations;
      const found = await fetchImages(items, usedPlaceholders(json)).catch((err) => (onLog(`Không tải được ảnh minh hoạ: ${err.message}`), {}));
      cutouts = [...new Set([...Object.values(found), ...cutouts])];
      for (const sc of json.scenes) for (const [k, v] of Object.entries(sc.inputs || {})) if (found[v]) sc.inputs[k] = found[v];
      errors = validatePlan(json, frames, { allowedFrameIds: allowedIds, images, cutouts });
      if (errors.length) {
        // Only the scenes whose picture was not found need changing; tell the AI what it has now.
        if (attempt === 3) throw new Error(`AI trả về plan không hợp lệ:\n- ${errors.join("\n- ")}`);
        onLog(`Không tìm được ảnh cho ${errors.length} chỗ trong kế hoạch, yêu cầu AI đổi cảnh đó`);
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `No picture could be found for some new:<n> placeholders. Return the complete plan again without "illustrations" and without any "new:" value: in those scenes use one of these cutouts — ${cutouts.join(", ")} — or switch to a frame that needs no cutout.\n- ${errors.join("\n- ")}`,
        });
        continue;
      }
    }
    if (!errors.length) return { plan: json, calls };
    onLog(`Plan có ${errors.length} lỗi, yêu cầu AI sửa: ${errors.join("; ").slice(0, 300)}`);
    onLog(`AI đã trả về (đoạn đầu): ${text.slice(0, 300)}`);
    if (attempt === 3) throw new Error(`AI trả về plan không hợp lệ:\n- ${errors.join("\n- ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `The plan has these errors. Return the complete corrected plan.\n- ${errors.join("\n- ")}` });
  }
}

const EMPTY_LIBRARY = { icons: [], logos: [], photos: [], cutouts: [], characters: [] };

// AI-written picture items cleaned into what the image sites understand: [{ queries: [english], label }].
export const cleanItems = (list) =>
  (Array.isArray(list) ? list : [])
    .map((it) => ({ label: String(it?.label || "").slice(0, 60), queries: (Array.isArray(it?.queries) ? it.queries : []).map((q) => String(q).toLowerCase().replace(/[^a-z0-9 -]+/g, " ").trim()).filter(Boolean).slice(0, 2) }))
    .filter((it) => it.queries.length);
const illustrationItems = (json) => cleanItems(json?.illustrations);

// Which illustrations the scenes use (1-based numbers), in order of first use.
const usedPlaceholders = (plan) => [...new Set(plan.scenes.flatMap((s) => Object.values(s.inputs || {})).filter((v) => typeof v === "string" && /^new:\d+$/.test(v)).map((v) => Number(v.slice(4))))];

const illustrateGuide = (n) => `
Pictures for this video: in "illustrations" list ${n}–${n + 3} concrete things from the material that can be shown as a photo of ONE object (animals, foods, products, devices, vehicles, plants, landmarks, tools; not abstract ideas, people, numbers or events), most important first. For each: queries = 1–2 English stock-image search phrases, most specific first, then a more generic one (e.g. ["golden retriever", "dog"], ["iphone 15", "smartphone"]), 1–3 lowercase words, nouns only, no words like "photo", "png", "transparent"; label = short Vietnamese name as said in the video.
These are downloaded as transparent cutout photos after you plan. A cutout input may use "new:<n>" (n = position in illustrations, from 1) to show item n: use most of the first ${n} items this way, each in the scene that talks about it, rather than the library cutouts.`;

// The planning request (system prompt, first user message, output schema), without calling the API.
// Library lists only reach the prompt when an allowed frame can use them.
// labels: what the project's own images and cutouts show ({ image file or cutout name: label }).
// illustrate: how many things the AI should list in "illustrations" (see planVideo); only when a frame takes a cutout.
export function planRequest({ material, title, channel, topic, allowed, images = [], labels = {}, library = EMPTY_LIBRARY, targetSeconds = 90, extra = "", motion = false, illustrate = 0 }) {
  // Story motion casts icons and characters as actors, so their lists go in even when no frame uses them.
  const uses = (...types) => allowed.some((f) => Object.values(f.inputs).some((i) => types.includes(i.type)));
  const lib = {
    icons: motion || uses("icon", "icons") ? library.icons : [],
    logos: uses("logo") ? library.logos : [],
    photos: uses("image") ? library.photos : [],
    cutouts: uses("cutout") ? library.cutouts || [] : [],
    characters: motion || uses("character", "characters") ? library.characters || [] : [],
  };
  if (motion) extra += motionGuide;
  if (!uses("cutout")) illustrate = 0;
  if (illustrate) extra += illustrateGuide(illustrate);
  const groups = {};
  for (const c of lib.characters) (groups[c.group] ||= []).push(c.name);
  // Placeholders new:<n> are valid cutout names only in the schema; the prompt lists the real ones.
  const placeholders = Array.from({ length: illustrate ? illustrate + 3 : 0 }, (_, i) => `new:${i + 1}`);
  const schema = planSchema(allowed, [...images, ...lib.photos.map((p) => p.name)], { ...lib, cutouts: [...lib.cutouts, ...placeholders] }, { motion, illustrate });
  const words = Math.round(targetSeconds * 2.6);
  const described = (n) => (labels[n] ? `${n} (${labels[n]})` : n);
  const prompt = `Available frames (* = required input):
${describeFrames(allowed)}

Project images: ${images.length ? images.map(described).join(", ") : lib.photos.length ? "(none)" : "(none — do not use image frames)"}
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
  return { system: SYSTEM, messages: [{ role: "user", content: prompt }], schema, illustrate };
}


// Model, effort and output length come from the active preset (Cấu hình AI page).
// Streaming keeps long "unlimited" answers within the SDK's request time limit.
// onLog gets a timer every 30s: time since the request, and whether the answer has started.
// The per-request gateway ends any response after GATEWAY_LIMIT_MS ("Lượt gọi đã bị phía khách
// hủy"); a call cut there is retried with the next lower effort, which thinks for less time.
export async function callModel(messages, schema, system = SYSTEM, preset = activePreset(), onLog = () => {}) {
  client ??= new Anthropic({ maxRetries: 4 });
  const started = Date.now();
  let response;
  let empty = 0;
  for (let effort = preset.effort; ; ) {
    const body = {
      model: preset.model,
      max_tokens: preset.max_tokens,
      system: config.ai.structured ? system : `${system}

${schemaInPrompt(schema)}`,
      messages,
      output_config: config.ai.structured ? { effort, format: { type: "json_schema", schema } } : { effort },
    };
    const attempt = Date.now();
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
      const lower = EFFORTS[EFFORTS.indexOf(effort) - 1];
      if (preset.billing !== "request" || !lower || Date.now() - attempt < GATEWAY_LIMIT_MS * 0.8 || !(err instanceof Anthropic.APIError)) throw err;
      onLog(`Gateway cắt lượt gọi ở giới hạn ${duration(GATEWAY_LIMIT_MS)}: gọi lại với effort ${lower} (đang là ${effort})`);
      effort = lower;
    }
  }
  onLog(`AI trả lời xong sau ${since(started)}`);
  if (response.stop_reason === "refusal") throw new Error("AI từ chối lập kế hoạch cho nội dung này");
  if (response.stop_reason === "max_tokens") {
    const raw = response.content.map((b) => b.text ?? `[${b.type}]`).join("");
    throw new Error(`AI trả về bị cắt ngang (max_tokens, ${response.usage?.output_tokens} token ra): …${raw.slice(-300)}`);
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) try { json = JSON.parse(m[0]); } catch { /* reported as a validation error */ }
  }
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
  stream.on("connect", () => {
    firstByte = lastEvent = Date.now();
    onLog(`AI kết nối sau ${since(started)} (effort ${body.output_config.effort}${body.output_config.format ? "" : ", schema trong prompt"})`);
  });
  stream.on("streamEvent", (e) => {
    lastEvent = Date.now();
    if (e.type === "content_block_delta" && e.delta.type === "thinking_delta") thinking += e.delta.thinking.length;
  });
  stream.on("text", (t) => (chars += t.length));
  const progress = () => (firstByte ? `trả lời ${chars} ký tự, suy nghĩ ${thinking} ký tự, dữ liệu cuối ${since(lastEvent)} trước` : "chưa có phản hồi");
  const timer = setInterval(() => onLog(`⏱ Đang chờ AI: ${since(started)} — ${progress()}`), 30_000);
  try {
    return await stream.finalMessage();
  } catch (err) {
    err.message = `${err.message} (sau ${since(started)}, ${progress()})`;
    throw err;
  } finally {
    clearInterval(timer);
  }
}

// One schema branch per allowed frame, so the model can only emit inputs that frame accepts.
// Length limits live in the prompt and the validator: structured outputs ignore maxLength.
export function planSchema(allowed, images, lib = EMPTY_LIBRARY, { motion = false, illustrate = 0 } = {}) {
  // Shared enums live in $defs so a long icon list is sent once, not once per frame.
  const $defs = motion ? { motion: motionSchema } : {};
  if (lib.icons.length) $defs.icon = { type: "string", enum: lib.icons };
  if (lib.logos.length) $defs.logo = { type: "string", enum: lib.logos };
  if (lib.cutouts?.length) $defs.cutout = { type: "string", enum: lib.cutouts };
  if (lib.characters?.length) $defs.character = { type: "string", enum: lib.characters.map((c) => c.name) };
  const ref = (name) => ($defs[name] ? { $ref: `#/$defs/${name}` } : { type: "string" });
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
        ...(motion ? { motion: { $ref: "#/$defs/motion" } } : {}),
      },
      required: ["frame_id", "voice_text", "keywords", "transition_out", "inputs", ...(motion ? ["motion"] : [])],
      additionalProperties: false,
    };
  };
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      ...(illustrate
        ? {
            illustrations: {
              type: "array",
              description: `${illustrate}-${illustrate + 3} things to picture`,
              items: { type: "object", properties: { queries: { type: "array", items: { type: "string" } }, label: { type: "string" } }, required: ["queries", "label"], additionalProperties: false },
            },
          }
        : {}),
      scenes: { type: "array", items: { anyOf: allowed.map(branch) } },
    },
    required: illustrate ? ["title", "illustrations", "scenes"] : ["title", "scenes"],
    additionalProperties: false,
    ...(Object.keys($defs).length ? { $defs } : {}),
  };
}

// Deterministic plan for running the pipeline without spending tokens:
// one sentence per scene, frame picked by simple heuristics.
// Fills a frame's required text inputs with a cut-down string (mock mode only).
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
  return { title: videoTitle, scenes };
}
