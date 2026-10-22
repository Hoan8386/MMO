// Opens a project in HyperFrames Studio (`hyperframes preview --background`), one port per project.
// Studio writes edits straight into the project's HTML; pipeline.hasManualEdits() detects them.
import { config } from "../config.js";
import { run } from "../pipeline/proc.js";

const BASE_PORT = 3100;
const IDLE_MS = 30 * 60 * 1000;
const sessions = new Map(); // projectId → { url, port, dir, lastSeen }

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
  const port = BASE_PORT + (Number(projectId) % 100);
  const r = await preview(dir, ["--background", "--no-open", "--port", String(port)]);
  const session = { url: r.studioUrl.replace("127.0.0.1", "localhost"), port: r.port, dir, lastSeen: Date.now() };
  sessions.set(Number(projectId), session);
  return session;
}

export async function stopStudio(projectId, dir) {
  sessions.delete(Number(projectId));
  await preview(dir, ["--stop"]).catch(() => {});
}

// Called whenever the project page asks for state, so an open page keeps Studio alive.
export function studioSession(projectId) {
  const s = sessions.get(Number(projectId));
  if (s) s.lastSeen = Date.now();
  return s ? { url: s.url, port: s.port } : null;
}

setInterval(() => {
  for (const [id, s] of sessions) if (Date.now() - s.lastSeen > IDLE_MS) stopStudio(id, s.dir);
}, 60 * 1000).unref();
