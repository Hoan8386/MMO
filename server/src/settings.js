// AI settings edited on the "Cấu hình AI" page, stored in MySQL (table settings, key "ai").
// A preset is a model plus how it is billed. "token" presets are kept lean (few frames in the
// prompt, low effort). "request" presets cost the same per call however long the call is, so
// the planner sends the whole frame library, asks for more and shorter scenes and adds story
// motion (animation acting out the narration, video/motion.js) to the frames it picks; in the
// animation mode it may also insert regular frames as cards between cartoon shots.
import { query } from "./db.js";
import { config } from "./config.js";

export const EFFORTS = ["low", "medium", "high", "max"];

const PRESET_DEFAULTS = {
  token: { effort: "low", max_tokens: 16000, story_motion: false, mix_templates: false, density: "normal" },
  request: { effort: "high", max_tokens: 32000, story_motion: true, mix_templates: true, density: "rich" },
};

export const DEFAULT_SETTINGS = {
  active: "sonnet-token",
  fallbacks: config.ai.fallbacks,
  presets: [
    { id: "sonnet-token", label: "Sonnet — tính theo token", model: config.ai.planModel, billing: "token", ...PRESET_DEFAULTS.token, effort: config.ai.planEffort },
    { id: "opus-unlimited", label: "Opus 5.5 — unlimited (theo lượt)", model: "req/claude-opus-5-5", billing: "request", ...PRESET_DEFAULTS.request },
    { id: "luna-unlimited", label: "GPT-6 Luna — unlimited (theo lượt)", model: "req/gpt-6-luna", billing: "request", ...PRESET_DEFAULTS.request },
  ],
};

let cache = null;

// Fills missing fields so presets saved by an older version keep working.
function normalize(s) {
  const out = { ...DEFAULT_SETTINGS, ...s };
  out.presets = (s?.presets?.length ? s.presets : DEFAULT_SETTINGS.presets).map((p) => {
    const billing = p.billing === "request" ? "request" : "token";
    const preset = { ...PRESET_DEFAULTS[billing], ...p, billing };
    preset.effort = EFFORTS.includes(preset.effort) ? preset.effort : PRESET_DEFAULTS[billing].effort;
    preset.max_tokens = Math.min(64000, Math.max(2000, Number(preset.max_tokens) || PRESET_DEFAULTS[billing].max_tokens));
    preset.density = preset.density === "rich" ? "rich" : "normal";
    preset.story_motion = preset.story_motion !== false && billing === "request";
    delete preset.custom_scenes; // replaced by story_motion: unlimited presets no longer add frames
    return preset;
  });
  if (!out.presets.some((p) => p.id === out.active)) out.active = out.presets[0].id;
  out.fallbacks = out.fallbacks !== false;
  return out;
}

export async function loadSettings() {
  try {
    const row = (await query("SELECT value FROM settings WHERE `key`='ai'"))[0];
    cache = normalize(row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null);
  } catch {
    // Scripts without a database (CLI) fall back to the defaults built from server/.env.
    cache = normalize(null);
  }
  return cache;
}

export const getSettings = () => (cache ??= normalize(null));

export async function saveSettings(next) {
  const s = normalize(next);
  await query("INSERT INTO settings (`key`, value) VALUES ('ai', ?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [JSON.stringify(s)]);
  cache = s;
  return s;
}

// The preset the planner uses now; `id` picks another one (e.g. the test button).
export function activePreset(id) {
  const s = getSettings();
  return s.presets.find((p) => p.id === (id || s.active)) || s.presets[0];
}

// Switches the active preset for this process only (CLI --preset); nothing is saved.
export function useActivePreset(id) {
  const s = getSettings();
  if (!s.presets.some((p) => p.id === id)) throw new Error(`Không có cấu hình "${id}" — có: ${s.presets.map((p) => p.id).join(", ")}`);
  s.active = id;
}

export const isUnlimited = (preset = activePreset()) => preset.billing === "request";
