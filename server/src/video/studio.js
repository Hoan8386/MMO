// Opens a project in HyperFrames Studio (`hyperframes preview --background`), one port per project.
// A project is keyed by its id (explainer videos, ports 3100–3199) or by a name such as "long:<slug>"
// (long videos, ports 3200–3299).
// Studio writes edits straight into the project's HTML; pipeline.hasManualEdits() detects them.
import { config } from "../config.js";
import { run } from "./proc.js";

const BASE_PORT = 3100;
const IDLE_MS = 30 * 60 * 1000;
const sessions = new Map(); // key → { url, port, dir, lastSeen }
const keyOf = (id) => String(id);
const portOf = (key) => {
  if (/^d+$/.test(key)) return BASE_PORT + (Number(key) % 100);
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BASE_PORT + 100 + (h % 100);
};

const hf = () => `hyperframes@${config.hyperframesVersion}`;

async function preview(dir, args) {
  // Pass the directory explicitly: with a shell, npx may resolve the project from the server's cwd.
  const out = await run("npx", ["--yes", hf(), "preview", `"${dir}"`, ...args, "--json"], { cwd: dir, shell: true });
  const line = out.trim().split(/\r?\n/).reverse().find((l) => l.startsWith("{"));
  const res = line ? JSON.parse(line) : null;
  if (!res?.ok) throw new Error(`Không mở được Studio: ${out.slice(-400)}`);
  return res.result;
}

export async function startStudio(projectId, dir) {
  const port = portOf(keyOf(projectId));
  const r = await preview(dir, ["--background", "--no-open", "--port", String(port)]);
  const session = { url: r.studioUrl.replace("127.0.0.1", "localhost"), port: r.port, dir, lastSeen: Date.now() };
  sessions.set(keyOf(projectId), session);
  return session;
}

export async function stopStudio(projectId, dir) {
  sessions.delete(keyOf(projectId));
  await preview(dir, ["--stop"]).catch(() => {});
}

// Called whenever the project page asks for state, so an open page keeps Studio alive.
export function studioSession(projectId) {
  const s = sessions.get(keyOf(projectId));
  if (s) s.lastSeen = Date.now();
  return s ? { url: s.url, port: s.port } : null;
}

setInterval(() => {
  for (const [id, s] of sessions) if (Date.now() - s.lastSeen > IDLE_MS) stopStudio(id, s.dir);
}, 60 * 1000).unref();
