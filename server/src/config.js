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
    model: env.AI_MODEL || "claude-opus-5-5",
    effort: env.AI_EFFORT || "medium",
    // Server-side refusal fallback is an Anthropic API beta; third-party gateways may reject it.
    fallbacks: (env.AI_FALLBACKS || "on") !== "off",
  },
  pythonBin: path.resolve(SERVER_DIR, env.PYTHON_BIN || ".venv\\Scripts\\python.exe"),
  hyperframesVersion: env.HYPERFRAMES_VERSION || "0.8.181",
};
