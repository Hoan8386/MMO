// Screenplay planner for the animation mode: turns a story description into a cast and a list of
// shots (one spoken line each), then into a regular plan whose scenes use the animation frames
// (anim-title, anim-shot, anim-end), so voicing, timeline, compile and render are shared.
import { callModel, planSchema } from "../video/planner.js";
import { describeFrames } from "../video/catalog.js";
import { richGuide, customSceneGuide } from "../video/guides.js";
import { validatePlan } from "../video/validate.js";
import { RIGS, RIG_IDS, ACTIONS, EMOTIONS, VOICE_STYLES } from "./rigs.js";
import { SETTING_IDS, settingName, TIMES } from "./settings.js";

const SYSTEM = `You write short animated cartoon screenplays in Vietnamese for a 2D animation engine. You never draw or write code; you return a JSON screenplay.

The engine has a fixed set of characters, settings, actions and emotions (listed by the user). Every shot is exactly ONE spoken line: either a character speaking (speaker = that character) or the narrator (speaker = "narrator").

Rules:
- Tell the story the user describes, in natural spoken Vietnamese for text-to-speech. Invent fitting dialogue; keep the user's plot, characters and ending.
- Each line is 1 short sentence (at most ~22 words). A character's line is written exactly as they say it: no name prefix, no quotation marks.
- Mix narration and dialogue; at least half of the shots should be dialogue.
- cast of a shot: the 1–3 characters visible in it, left to right. Keep the same setting, time and cast for consecutive shots of one scene so cuts are seamless; change setting when the story moves somewhere else.
- speaker must be in the shot's cast (or "narrator").
- action: what the actor does during the line. actor "none" means the speaker does it (or the first character when the narrator speaks). Use walk_in/run_in when a character arrives, walk_out/run_out when one leaves (then leave them out of the next shots until they return), talk for ordinary talking, and expressive actions (laugh, cry, jump, shock, think, sleep, hug, fall, dance, wave, point, nod, shake_head) when the line calls for it.
- emotion fits the line. camera: mostly "wide"; "close" for an important emotional line; "pan" for scenery narration.
- reactor/reaction: another character in the shot reacting at the same time (the listener laughs, gasps with shock, nods, cries…); "none" when nobody reacts. Reactions make the film lively — use them often.
- Choose characters that match the story (animals for an animal fable; grandpa/grandma/king/princess/boy/girl… for people). Use each character at most once. Give each a short Vietnamese name and a voice style that fits their age and size.
- opening: one narrator line that starts the story ("Ngày xửa ngày xưa…" or similar); it plays over the title card, so the first shot must NOT repeat it — start the first shot with what happens next. closing: one narrator line with the lesson or a warm ending.`;

const VOICE_IDS = Object.keys(VOICE_STYLES);

// Frames that may appear between cartoon shots as "cards" (chapter titles, facts, quotes…).
const CARD_FRAMES = ["story-chapter", "fun-fact", "big-question", "quote", "icon-hero", "icon-points", "timeline-steps", "place-card", "era-card", "myth-fact", "what-if", "story-cast", "percent-ring", "scale-compare", "ai-scene"];

function schema(cards = null) {
  const speakers = ["narrator", ...RIG_IDS];
  // Each card is "insert this regular scene after shot N"; its scene uses the planner's per-frame branches.
  const cardProp = cards
    ? {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: { after_shot: { type: "integer", description: "index in shots (0-based) the card follows" }, scene: { anyOf: cards.properties.scenes.items.anyOf } },
            required: ["after_shot", "scene"],
            additionalProperties: false,
          },
        },
      }
    : {};
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      moral: { type: "string", description: "the lesson, at most 110 characters" },
      cast: {
        type: "array",
        items: {
          type: "object",
          properties: { rig: { type: "string", enum: RIG_IDS }, name: { type: "string" }, voice: { type: "string", enum: VOICE_IDS } },
          required: ["rig", "name", "voice"],
          additionalProperties: false,
        },
        description: "1-5 characters",
      },
      opening: { type: "string" },
      closing: { type: "string" },
      shots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            setting: { type: "string", enum: SETTING_IDS },
            time: { type: "string", enum: Object.keys(TIMES) },
            cast: { type: "array", items: { type: "string", enum: RIG_IDS }, description: "1-3 characters" },
            speaker: { type: "string", enum: speakers },
            actor: { type: "string", enum: ["none", ...RIG_IDS] },
            action: { type: "string", enum: Object.keys(ACTIONS) },
            emotion: { type: "string", enum: EMOTIONS },
            camera: { type: "string", enum: ["wide", "close", "pan"] },
            reactor: { type: "string", enum: ["none", ...RIG_IDS] },
            reaction: { type: "string", enum: ["none", ...Object.keys(ACTIONS)] },
            line: { type: "string" },
          },
          required: ["setting", "time", "cast", "speaker", "actor", "action", "emotion", "camera", "reactor", "reaction", "line"],
          additionalProperties: false,
        },
      },
      ...cardProp,
    },
    required: ["title", "moral", "cast", "opening", "closing", "shots", ...(cards ? ["cards"] : [])],
    additionalProperties: false,
    ...(cards?.$defs ? { $defs: cards.$defs } : {}),
  };
}

function request({ material, title, targetSeconds, extra = "" }) {
  // A shot runs about its line plus ~1 s of breathing room, so ~5 s each.
  const shots = Math.max(6, Math.round(targetSeconds / 5));
  return `Characters (id — default name — kind — default voice):
${RIGS.map((r) => `- ${r.id} — ${r.name} — ${r.kind === "person" ? "người" : "con vật"} — ${r.voice}`).join("\n")}

Settings: ${SETTING_IDS.map((id) => `${id} (${settingName(id)})`).join(", ")}
Times: ${Object.entries(TIMES).map(([k, v]) => `${k} (${v})`).join(", ")}
Actions: ${Object.entries(ACTIONS).map(([k, v]) => `${k} (${v})`).join(", ")}
Emotions: ${EMOTIONS.join(", ")}
Voice styles: ${Object.entries(VOICE_STYLES).map(([k, v]) => `${k} (${v.label})`).join(", ")}

Target length: about ${targetSeconds}s, roughly ${shots} shots (about 2.6 Vietnamese words per second).
${title ? `Title: ${title}\n` : ""}${extra}
Story description from the user:
"""
${material.trim()}
"""`;
}

// Screenplay → plan with animation scenes. `labels[i]` names scene i in the AI's terms
// (shots[k], cards[j]) so validation errors can be sent back for repair.
export function screenplayToPlan(sp) {
  const castIds = [...new Set(sp.cast.map((c) => c.rig))];
  const first = sp.shots[0] || { setting: "meadow", time: "day" };
  const last = sp.shots.at(-1) || first;
  const ends = (s) => ({ setting: s.setting, time: s.time, cast: castIds.slice(0, 3) });
  const plan = {
    mode: "animation",
    title: sp.title,
    moral: sp.moral,
    cast: sp.cast,
    scenes: [
      { frame_id: "anim-title", voice_text: sp.opening, keywords: [], transition_out: "fade", inputs: { ...ends(first), title: sp.title.slice(0, 60) } },
      ...sp.shots.map((s) => ({
        frame_id: "anim-shot",
        voice_text: s.line,
        keywords: [],
        transition_out: "fade",
        inputs: {
          setting: s.setting,
          time: s.time,
          cast: s.cast,
          speaker: s.speaker,
          ...(s.actor && s.actor !== "none" ? { actor: s.actor } : {}),
          action: s.action,
          emotion: s.emotion,
          camera: s.camera,
          ...(s.reactor && s.reactor !== "none" && s.reaction && s.reaction !== "none" && s.reactor !== s.speaker ? { reactor: s.reactor, reaction: s.reaction } : {}),
        },
      })),
      { frame_id: "anim-end", voice_text: sp.closing, keywords: [], transition_out: "fade", inputs: { ...ends(last), moral: (sp.moral || "").slice(0, 120) } },
    ],
  };
  const labels = ["opening/title", ...sp.shots.map((_, k) => `shots[${k}]`), "closing/end"];
  // Cards go after their shot (scene k + 1); insert from the back so earlier positions stay valid.
  const cards = (sp.cards || []).map((c, j) => ({ ...c, j })).sort((x, y) => y.after_shot - x.after_shot || y.j - x.j);
  for (const c of cards) {
    const pos = Math.min(sp.shots.length, Math.max(0, c.after_shot)) + 2;
    plan.scenes.splice(pos, 0, { keywords: [], transition_out: "fade", inputs: {}, ...c.scene });
    labels.splice(pos, 0, `cards[${c.j}].scene`);
  }
  return { plan, labels };
}

// Plan errors use scenes[i]; the AI wrote shots[k] and cards[j].
const toShotErrors = (errors, labels) => errors.map((e) => e.replace(/scenes\[(\d+)\]/g, (_, i) => labels[Number(i)] || `scenes[${i}]`));

// options: { unlimited, rich, mix, custom, library, canvas } from the active preset (see pipeline.js).
export async function planAnimation({ material, title, targetSeconds = 60, frames, mock = false, onLog = () => {}, options = {} }) {
  const cardFrames = options.mix ? CARD_FRAMES.filter((id) => frames.get(id)?.status === "active" && (id !== "ai-scene" || options.custom)).map((id) => frames.get(id)) : [];
  const allowed = [...[...frames.values()].filter((f) => f.engine === "animation"), ...cardFrames].map((f) => f.frame_id);
  const check = (plan) => {
    const errors = validatePlan(plan, frames, { allowedFrameIds: allowed });
    const castIds = plan.cast.map((c) => c.rig);
    plan.scenes.forEach((s, i) => (s.inputs.cast || []).forEach((id) => !castIds.includes(id) && errors.push(`scenes[${i}].inputs.cast: "${id}" chưa có trong cast của phim`)));
    if (new Set(castIds).size !== castIds.length) errors.push("cast: mỗi nhân vật chỉ dùng một lần");
    return errors;
  };
  if (mock) {
    const { plan } = screenplayToPlan(mockScreenplay(material, title));
    const errors = check(plan);
    if (errors.length) throw new Error(`Kịch bản mẫu không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { plan, calls: [] };
  }
  let extra = "";
  let cardSchema = null;
  if (options.rich) extra += richGuide(targetSeconds, "shots").replace(/about \d+ shots/, `about ${Math.round(targetSeconds / 3.5)} shots`);
  if (cardFrames.length) {
    const lib = { icons: options.library?.icons || [], logos: [], photos: [], cutouts: [], characters: (options.library?.characters || []) };
    cardSchema = planSchema(cardFrames, [], lib);
    extra += `
CARDS: between shots you may insert regular animated scenes ("cards") — a chapter title when the story moves on, a fun fact, a question to the viewer, a quote, a timeline… Narrated by the narrator (voice_text). Use 2–5 cards in the film, never two in a row.
Card frames (* = required input):
${describeFrames(cardFrames)}
${lib.icons.length ? `Icons for cards: ${lib.icons.join(", ")}\n` : ""}`;
    if (cardFrames.some((f) => f.frame_id === "ai-scene")) extra += customSceneGuide(options.canvas || { w: 1920, h: 1080 });
  }
  const messages = [{ role: "user", content: request({ material, title, targetSeconds, extra }) }];
  const calls = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    onLog(`AI viết kịch bản hoạt hình (lần ${attempt})`);
    const { json, text, usage } = await callModel(messages, schema(cardSchema), SYSTEM);
    calls.push({ step: "plan", attempt, ...usage });
    let plan = null;
    let labels = [];
    let errors = ["không đọc được JSON"];
    if (json?.shots?.length) {
      ({ plan, labels } = screenplayToPlan(json));
      errors = check(plan);
    }
    if (!errors.length) return { plan, calls };
    onLog(`Kịch bản có ${errors.length} lỗi, yêu cầu AI sửa: ${errors.join("; ").slice(0, 300)}`);
    if (attempt === 3) throw new Error(`AI trả về kịch bản không hợp lệ:\n- ${errors.join("\n- ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `The screenplay has these errors. Return the complete corrected screenplay.\n- ${toShotErrors(errors, labels).join("\n- ")}` });
  }
}

// ---------------------------------------------------------------- mock (no AI)
// Recognises common Vietnamese character words in the description; quotes become dialogue.
const WORDS = [
  [/gấu trúc/i, "panda"], [/thỏ/i, "rabbit"], [/rùa/i, "turtle"], [/cáo/i, "fox"], [/mèo/i, "cat"], [/chó|cún/i, "dog"], [/gấu/i, "bear"],
  [/sư tử/i, "lion"], [/chuột/i, "mouse"], [/heo|lợn/i, "pig"], [/khỉ/i, "monkey"], [/voi/i, "elephant"], [/ếch/i, "frog"], [/gà/i, "chicken"],
  [/công chúa/i, "princess"], [/nhà vua|vua/i, "king"], [/ông/i, "grandpa"], [/bà/i, "grandma"], [/cô giáo/i, "teacher"], [/bác sĩ/i, "doctor"],
  [/nông dân/i, "farmer"], [/công an|cảnh sát/i, "police"], [/đầu bếp/i, "chef"], [/cậu bé|bé trai/i, "boy"], [/cô bé|bé gái/i, "girl"],
];
const SETTING_WORDS = [[/rừng/i, "forest"], [/làng/i, "village"], [/nhà/i, "house_inside"], [/lớp|trường/i, "classroom"], [/phố|thành phố/i, "city"], [/biển/i, "beach"], [/núi/i, "mountain"], [/sông|suối|cầu/i, "riverside"], [/lâu đài|cung điện/i, "castle"], [/đồng|cỏ/i, "meadow"]];

// A whole-word test: Vietnamese letters fall outside \b, so "gà" must not match inside "ngày".
const hasWord = (re, text) => new RegExp(`(^|[^\\p{L}])(${re.source})(?=[^\\p{L}]|$)`, "iu").test(text);

function mockScreenplay(material, title) {
  const found = [];
  for (const [re, id] of WORDS) if (hasWord(re, material) && !found.includes(id) && found.length < 3) found.push(id);
  const castIds = found.length ? found : ["boy", "girl"];
  const cast = castIds.map((id) => {
    const r = RIGS.find((x) => x.id === id);
    return { rig: id, name: r.name, voice: r.voice };
  });
  const setting = SETTING_WORDS.find(([re]) => hasWord(re, material))?.[1] || "meadow";
  const sentences = material.replace(/\s+/g, " ").split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => s.length > 2);
  const actions = ["walk_in", "talk", "think", "laugh", "wave", "jump", "point", "nod"];
  const shots = sentences.slice(0, 14).map((s, i) => {
    const quote = s.match(/["“](.+?)["”]/);
    const who = castIds[i % castIds.length];
    return {
      setting,
      time: i > 8 ? "sunset" : "day",
      cast: castIds,
      speaker: quote ? who : "narrator",
      actor: quote ? "none" : who,
      action: i === 0 ? "walk_in" : actions[i % actions.length],
      emotion: ["neutral", "happy", "surprised", "sad"][i % 4],
      camera: i % 5 === 3 ? "close" : "wide",
      reactor: quote && castIds.length > 1 ? castIds[(i + 1) % castIds.length] : "none",
      reaction: quote && castIds.length > 1 ? ["nod", "laugh", "shock"][i % 3] : "none",
      line: (quote ? quote[1] : s).slice(0, 160),
    };
  });
  const t = title || sentences[0]?.slice(0, 50) || "Câu chuyện";
  return { title: t, moral: "Hãy luôn tử tế và cố gắng hết mình.", cast, opening: `Ngày xửa ngày xưa, có một câu chuyện tên là ${t}.`, closing: "Câu chuyện đến đây là hết. Hẹn gặp lại các bạn!", shots };
}
