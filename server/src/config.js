import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(here, "..");
export const ROOT_DIR = path.resolve(SERVER_DIR, "..");
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const ASSETS_DIR = path.join(SERVER_DIR, "assets");

// server/.env wins over variables inherited from the shell, and blank entries are
// removed so the Anthropic SDK falls back to its defaults instead of reading "".
dotenv.config({ path: path.join(SERVER_DIR, ".env"), override: true, quiet: true });
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) {
  if (!process.env[k]?.trim()) delete process.env[k];
}

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  db: {
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "mmo_video",
  },
  ai: {
    mode: env.AI_MODE || (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? "claude" : "mock"),
    // Model for the video planner; planning is a small JSON task.
    planModel:"req/claude-opus-5-5" || env.PLAN_MODEL || "claude-sonnet-5-5",
    planEffort: env.PLAN_EFFORT || "low",
    // Server-side refusal fallback is an Anthropic API beta; third-party gateways may reject it.
    fallbacks: (env.AI_FALLBACKS || "on") !== "off",
    // Structured outputs (the JSON schema sent as output_config.format). Through a gateway such as
    // caheoai a schema-constrained answer is held back until it is complete, and the gateway drops
    // connections that stay silent for ~90s; so by default the schema goes into the prompt instead
    // whenever ANTHROPIC_BASE_URL is set. on/off overrides.
    structured: env.AI_STRUCTURED ? env.AI_STRUCTURED !== "off" : !env.ANTHROPIC_BASE_URL,
  },
  pythonBin: path.resolve(SERVER_DIR, env.PYTHON_BIN || ".venv\\Scripts\\python.exe"),
  hyperframesVersion: env.HYPERFRAMES_VERSION || "0.8.181",
};
