// AI settings edited on the "Cấu hình AI" page, stored in MySQL (table settings, key "ai").
// A preset is a model plus how it is billed. Billing only changes how calls are counted
// ("request" presets cost the same per call); the planner treats every preset the same way.
import { query } from "./db.js";
import { config } from "./config.js";

export const EFFORTS = ["low", "medium", "high", "max"];

const PRESET_DEFAULTS = {
  token: { effort: "low", max_tokens: 16000 },
  // Unlimited presets: a plan with per-scene illustrations and custom scenes can run long.
  request: { effort: "high", max_tokens: 100000 },
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
    // 32000 was the old unlimited default, not a choice: such presets get the new, larger one.
    if (billing === "request" && Number(p.max_tokens) === 32000) preset.max_tokens = PRESET_DEFAULTS.request.max_tokens;
    preset.max_tokens = Math.min(128000, Math.max(2000, Number(preset.max_tokens) || PRESET_DEFAULTS[billing].max_tokens));
    // Options from older versions (unlimited-only planning extras), no longer used.
    for (const k of ["density", "story_motion", "mix_templates", "custom_scenes"]) delete preset[k];
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
