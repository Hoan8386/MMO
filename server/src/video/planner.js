import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { describeFrames } from "./catalog.js";
import { validatePlan } from "./validate.js";

const SYSTEM = `You plan short narrated videos that are assembled ONLY from a fixed library of animated templates ("frames"). You never write HTML; you return a JSON plan.

For each scene you write the narration (voice_text) and choose one frame from the list, filling its inputs.

Rules:
- Narration language: Vietnamese unless told otherwise. Natural spoken style for text-to-speech: 1–2 short sentences per scene. Write numbers in voice_text the way they should be read aloud.
- The first scene uses the intro frame, the last scene uses the outro frame.
- Choose the frame that fits what the scene says (a number → stat frame, an enumeration → list frame, a comparison → compare frame, a person's words → quote frame). Vary frames; avoid the same frame twice in a row.
- On-screen text (inputs) is short and punchy, NOT a copy of the narration. Respect every character limit. Write numbers in inputs with digits.
- keywords: exact phrases copied verbatim from the same scene's voice_text, in spoken order, used to time the animation as described for each frame. Use [] when the frame needs none.
- transition_out: "wipe" when the next scene starts a new topic, otherwise "fade".
- Use only facts from the user's material. Never invent numbers, quotes, names, dates or a channel name, and never add opinions or evaluations (e.g. "quite competitive") that the material does not state.`;

let client;

// Asks the AI for a plan, validates it, and gives the AI one chance to repair errors.
// Returns { plan, calls } where calls records token usage for cost tracking.
export async function planVideo({ material, title, channel, topic, frames, allowed, images = [], targetSeconds = 90, mock = false, onLog = () => {} }) {
  const allowedIds = allowed.map((f) => f.frame_id);
  if (mock || config.ai.mode === "mock") {
    const plan = mockPlan({ material, title, allowed, images, topic });
    const errors = validatePlan(plan, frames, { allowedFrameIds: allowedIds, images });
    if (errors.length) throw new Error(`Plan mẫu không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { plan, calls: [] };
  }

  // Extra retries ride out brief network/DNS drops on the way to the API or gateway.
  client ??= new Anthropic({ maxRetries: 4 });
  const schema = planSchema(allowed, images);
  const words = Math.round(targetSeconds * 2.6);
  const prompt = `Available frames (* = required input):
${describeFrames(allowed)}

Project images: ${images.length ? images.join(", ") : "(none — do not use image frames)"}
Topic: ${topic ? `${topic.name} — ${topic.description}` : "general"}
Narration tone: ${topic?.tone || "clear and natural"}
Target length: about ${targetSeconds}s of narration (~${words} Vietnamese words in total).
${title ? `Video title: ${title}\n` : ""}Channel name: ${channel || "(none — leave every channel input empty)"}

User material:
"""
${material.trim()}
"""`;

  const messages = [{ role: "user", content: prompt }];
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
    calls.push({ step: "plan", attempt, model: config.ai.model, ...usage });
    const errors = json ? validatePlan(json, frames, { allowedFrameIds: allowedIds, images }) : ["không đọc được JSON"];
    if (!errors.length) return { plan: json, calls };
    onLog(`Plan có ${errors.length} lỗi, yêu cầu AI sửa`);
    if (attempt === 3) throw new Error(`AI trả về plan không hợp lệ:\n- ${errors.join("\n- ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `The plan has these errors. Return the complete corrected plan.\n- ${errors.join("\n- ")}` });
  }
}

async function callModel(messages, schema) {
  const body = {
    model: config.ai.planModel,
    max_tokens: 16000,
    system: SYSTEM,
    messages,
    output_config: { effort: config.ai.planEffort, format: { type: "json_schema", schema } },
  };
  const response = config.ai.fallbacks
    ? await client.messages.create({ ...body, fallbacks: "default" }, { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } })
    : await client.messages.create(body);
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
  const usage = {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
  };
  return { json, text, usage };
}

// One schema branch per allowed frame, so the model can only emit inputs that frame accepts.
// Length limits live in the prompt and the validator: structured outputs ignore maxLength.
function planSchema(allowed, images) {
  const branch = (f) => {
    const props = {};
    const required = [];
    for (const [k, i] of Object.entries(f.inputs)) {
      if (i.type === "number") props[k] = { type: "number" };
      else if (i.type === "numbers") props[k] = { type: "array", items: { type: "number" }, description: `${i.minItems ?? 1}-${i.maxItems ?? 6} numbers` };
      else if (i.type === "list")
        props[k] = { type: "array", items: { type: "string", description: `at most ${i.itemMaxLength ?? 60} characters` }, description: `${i.minItems ?? 1}-${i.maxItems ?? 5} items` };
      else if (i.type === "image") props[k] = images.length ? { type: "string", enum: images } : { type: "string" };
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
  };
}

// Deterministic plan for running the pipeline without spending tokens:
// one sentence per scene, frame picked by simple heuristics.
// Fills a frame's required text inputs with a cut-down string (mock mode only).
function fillText(frame, text, cut) {
  const inputs = {};
  for (const [k, i] of Object.entries(frame.inputs)) {
    if (!i.required) continue;
    if (i.type === "string") inputs[k] = cut(text, i.maxLength ?? 60);
    else if (i.type === "list") inputs[k] = Array.from({ length: i.minItems ?? 2 }, (_, n) => cut(`${text} ${n + 1}`, i.itemMaxLength ?? 40));
    else if (i.type === "number") inputs[k] = 1;
  }
  return inputs;
}

function mockPlan({ material, title, allowed, images, topic }) {
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
      inputs: { ...fillText(intro, videoTitle, cut), ...(intro.inputs.kicker ? { kicker: topic?.kicker || "Video" } : {}) },
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
    } else {
      scenes.push({
        frame_id: "headline",
        voice_text: s,
        keywords: [],
        transition_out: i % 3 === 2 ? "wipe" : "fade",
        inputs: { title: cut(s.split(" ").slice(0, 9).join(" "), 70), subtitle: cut(s, 110) },
      });
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
