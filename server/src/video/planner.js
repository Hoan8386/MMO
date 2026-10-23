import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { activePreset, getSettings } from "../settings.js";
import { describeFrames } from "./catalog.js";
import { validatePlan } from "./validate.js";

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
- Image frames may use project images or library photos. Use a library photo only when its description matches what the scene says, and copy its credit into the credit input.
- Use only facts from the user's material. Never invent numbers, quotes, names, dates or a channel name, and never add opinions or evaluations (e.g. "quite competitive") that the material does not state. The only exception: wrong answer options in a quiz, which must be plausible but clearly wrong.`;

let client;

// Asks the AI for a plan, validates it, and gives the AI one chance to repair errors.
// Returns { plan, calls } where calls records token usage for cost tracking.
// library: { icons: [name], logos: [name], photos: [{ name, label, credit }] } that suit the topic.
// extra: additional prompt sections (rich mode, cartoon shots, custom scenes) for unlimited presets.
export async function planVideo({ material, title, channel, topic, frames, allowed, images = [], library = EMPTY_LIBRARY, targetSeconds = 90, extra = "", mock = false, onLog = () => {} }) {
  const allowedIds = allowed.map((f) => f.frame_id);
  if (mock || config.ai.mode === "mock") {
    const plan = mockPlan({ material, title, allowed, images, library, topic });
    const errors = validatePlan(plan, frames, { allowedFrameIds: allowedIds, images });
    if (errors.length) throw new Error(`Plan mẫu không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { plan, calls: [] };
  }

  // Extra retries ride out brief network/DNS drops on the way to the API or gateway.
  client ??= new Anthropic({ maxRetries: 4 });
  const { messages, schema } = planRequest({ material, title, channel, topic, allowed, images, library, targetSeconds, extra });
  const calls = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    onLog(`AI lập kế hoạch (lần ${attempt})`);
    const { json, text, usage } = await callModel(messages, schema).catch((err) => {
      if (err instanceof Anthropic.APIConnectionError) {
        const host = process.env.ANTHROPIC_BASE_URL ? new URL(process.env.ANTHROPIC_BASE_URL).host : "api.anthropic.com";
        throw new Error(`Không kết nối được tới máy chủ AI (${host}): ${err.cause?.code || err.message}. Kiểm tra mạng rồi bấm lập kế hoạch lại.`);
      }
      throw err;
    });
    calls.push({ step: "plan", attempt, ...usage });
    const errors = json ? validatePlan(json, frames, { allowedFrameIds: allowedIds, images }) : ["không đọc được JSON"];
    if (!errors.length) return { plan: json, calls };
    onLog(`Plan có ${errors.length} lỗi, yêu cầu AI sửa: ${errors.join("; ").slice(0, 300)}`);
    if (attempt === 3) throw new Error(`AI trả về plan không hợp lệ:\n- ${errors.join("\n- ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `The plan has these errors. Return the complete corrected plan.\n- ${errors.join("\n- ")}` });
  }
}

const EMPTY_LIBRARY = { icons: [], logos: [], photos: [], cutouts: [], characters: [] };

// The planning request (system prompt, first user message, output schema), without calling the API.
// Library lists only reach the prompt when an allowed frame can use them.
export function planRequest({ material, title, channel, topic, allowed, images = [], library = EMPTY_LIBRARY, targetSeconds = 90, extra = "" }) {
  const uses = (...types) => allowed.some((f) => Object.values(f.inputs).some((i) => types.includes(i.type)));
  const lib = {
    icons: uses("icon", "icons") ? library.icons : [],
    logos: uses("logo") ? library.logos : [],
    photos: uses("image") ? library.photos : [],
    cutouts: uses("cutout") ? library.cutouts || [] : [],
    characters: uses("character", "characters") ? library.characters || [] : [],
  };
  const groups = {};
  for (const c of lib.characters) (groups[c.group] ||= []).push(c.name);
  const schema = planSchema(allowed, [...images, ...lib.photos.map((p) => p.name)], lib);
  const words = Math.round(targetSeconds * 2.6);
  const prompt = `Available frames (* = required input):
${describeFrames(allowed)}

Project images: ${images.length ? images.join(", ") : lib.photos.length ? "(none)" : "(none — do not use image frames)"}
${lib.photos.length ? `Library photos (name — what it shows — credit):\n${lib.photos.map((p) => `- ${p.name} — ${p.label} — ${p.credit}`).join("\n")}\n` : ""}${lib.icons.length ? `Icons: ${lib.icons.join(", ")}\n` : ""}${lib.logos.length ? `Logos: ${lib.logos.join(", ")}\n` : ""}${lib.cutouts.length ? `Cutouts (photo of one object, background removed): ${lib.cutouts.join(", ")}\n` : ""}${Object.entries(groups)
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
  return { system: SYSTEM, messages: [{ role: "user", content: prompt }], schema };
}


// Model, effort and output length come from the active preset (Cấu hình AI page).
// Streaming keeps long "unlimited" answers within the SDK's request time limit.
export async function callModel(messages, schema, system = SYSTEM, preset = activePreset()) {
  client ??= new Anthropic({ maxRetries: 4 });
  const body = {
    model: preset.model,
    max_tokens: preset.max_tokens,
    system,
    messages,
    output_config: { effort: preset.effort, format: { type: "json_schema", schema } },
  };
  const response = getSettings().fallbacks
    ? await client.messages.stream({ ...body, fallbacks: "default" }, { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } }).finalMessage()
    : await client.messages.stream(body).finalMessage();
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

// One schema branch per allowed frame, so the model can only emit inputs that frame accepts.
// Length limits live in the prompt and the validator: structured outputs ignore maxLength.
export function planSchema(allowed, images, lib = EMPTY_LIBRARY) {
  // Shared enums live in $defs so a long icon list is sent once, not once per frame.
  const $defs = {};
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
      },
      required: ["frame_id", "voice_text", "keywords", "transition_out", "inputs"],
      additionalProperties: false,
    };
  };
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      scenes: { type: "array", items: { anyOf: allowed.map(branch) } },
    },
    required: ["title", "scenes"],
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
