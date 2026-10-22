// The video pipeline as reusable steps, shared by the CLI (scripts/make-video.js) and the API jobs.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { STORAGE_DIR } from "../config.js";
import { loadFrames, selectFrames, getTopic } from "./catalog.js";
import { planVideo } from "./planner.js";
import { validatePlan } from "./validate.js";
import { voiceScenes } from "./tts.js";
import { buildTimeline } from "./timeline.js";
import { compileProject } from "./compile.js";
import { checkProject, renderProject, qualityCheck } from "./render.js";

export const PROJECTS_DIR = path.join(STORAGE_DIR, "projects");
export const projectDir = (slug) => path.join(PROJECTS_DIR, slug);
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

export const slugify = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export async function listImages(dir) {
  const imgDir = path.join(dir, "assets", "img");
  await fs.mkdir(imgDir, { recursive: true });
  return (await fs.readdir(imgDir)).filter((f) => IMAGE_RE.test(f));
}

// project: { title, channel, topic, voice, rate, targetSeconds, aspectRatio, width, height }
export async function makePlan(dir, project, material, { mock = false, onLog = () => {} } = {}) {
  const frames = loadFrames();
  const images = await listImages(dir);
  const topic = getTopic(project.topic);
  const allowed = selectFrames(frames, { topic, aspectRatio: project.aspectRatio, images });
  onLog(`Chủ đề ${topic.name}: thư viện ${frames.size} frame, gửi cho AI ${allowed.length} frame phù hợp, ${images.length} ảnh`);
  const { plan, calls } = await planVideo({
    material,
    title: project.title,
    channel: project.channel,
    topic,
    frames,
    allowed,
    images,
    targetSeconds: project.targetSeconds,
    mock,
    onLog,
  });
  const stamped = calls.map((c) => ({ ...c, at: new Date().toISOString(), frames_sent: allowed.length }));
  if (stamped.length) {
    const logFile = path.join(dir, "ai_calls.json");
    const prev = await readJson(logFile, []);
    await fs.writeFile(logFile, JSON.stringify([...prev, ...stamped], null, 2));
  }
  finalizePlan(plan, project, frames);
  return { plan, calls: stamped };
}

// Numbers scenes s01… in order and applies project-level values the AI must not decide.
export function finalizePlan(plan, project, frames = loadFrames()) {
  plan.scenes.forEach((s, i) => {
    s.id = `s${String(i + 1).padStart(2, "0")}`;
    s.inputs ||= {};
    s.keywords ||= [];
    s.transition_out ||= "fade";
    if (project.channel && frames.get(s.frame_id)?.inputs.channel) s.inputs.channel = project.channel;
  });
  return plan;
}

export async function planErrors(dir, plan) {
  if (!plan) return ["chưa có kế hoạch"];
  return validatePlan(plan, loadFrames(), { images: await listImages(dir) });
}

// Voice → timeline → compile → lint. Writes plan.json, timeline.json and the HyperFrames
// project, and records a hash of the generated HTML so later hand edits can be detected.
export async function buildProject(dir, project, plan, { onLog = () => {} } = {}) {
  const frames = loadFrames();
  const errors = validatePlan(plan, frames, { images: await listImages(dir) });
  if (errors.length) throw new Error(`Kế hoạch chưa hợp lệ:\n- ${errors.join("\n- ")}`);
  finalizePlan(plan, project, frames);
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(project, null, 2));

  onLog("Tạo giọng đọc");
  const vo = await voiceScenes(dir, plan.scenes, project);
  const cached = Object.values(vo).filter((v) => v.cached).length;
  if (cached) onLog(`Dùng lại ${cached}/${plan.scenes.length} file audio không đổi`);

  const timeline = buildTimeline(plan, vo, frames);
  timeline.warnings.forEach((w) => onLog(`Cảnh báo: ${w}`));
  const { frames: used } = await compileProject(dir, { ...project, title: project.title || plan.title, topic: getTopic(project.topic) }, timeline);
  await fs.writeFile(
    path.join(dir, "timeline.json"),
    JSON.stringify(
      {
        total: timeline.total,
        frames: used,
        warnings: timeline.warnings,
        scenes: timeline.scenes.map(({ id, frame_id, start, duration, audio, props }) => ({ id, frame_id, start, duration, audio, marks: props.marks })),
      },
      null,
      2,
    ),
  );
  onLog(`Đã biên dịch dự án HyperFrames: ${timeline.total}s`);

  onLog("Kiểm tra bằng hyperframes lint");
  await checkProject(dir);
  await fs.writeFile(path.join(dir, ".compile-hash"), await sourceHash(dir));
  return { timeline, used };
}

export async function renderAndCheck(dir, project, { onLog = () => {}, onProgress = () => {} } = {}) {
  const { total } = await readJson(path.join(dir, "timeline.json"), {});
  if (!total) throw new Error("Dự án chưa được dựng — hãy dựng trước khi render");
  onLog("Render MP4");
  const file = await renderProject(dir, { onProgress });
  const qc = await qualityCheck(file, { width: project.width, height: project.height, duration: total });
  await fs.writeFile(path.join(dir, "qc.json"), JSON.stringify({ file: path.basename(file), ...qc }, null, 2));
  if (!qc.ok) onLog(`QC chưa đạt: ${qc.issues.join("; ")}`);
  return { file, qc };
}

// Hash of the HTML the compiler writes. Differs from .compile-hash once someone edits in Studio.
// Studio stamps data-hf-id on every element when it first opens a project; those ids are not edits.
export async function sourceHash(dir) {
  const h = crypto.createHash("sha1");
  const files = ["index.html", ...(await fs.readdir(path.join(dir, "compositions")).catch(() => [])).sort().map((f) => `compositions/${f}`)];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), "utf8").catch(() => "");
    h.update(f);
    h.update(text.replace(/\s+data-hf-id="[^"]*"/g, "").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex");
}

export async function hasManualEdits(dir) {
  const saved = await fs.readFile(path.join(dir, ".compile-hash"), "utf8").catch(() => null);
  return saved != null && saved !== (await sourceHash(dir));
}

// Copies the current HTML into backups/<time>/ before a recompile overwrites hand edits.
export async function backupSources(dir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dir, "backups", stamp);
  await fs.mkdir(path.join(dest, "compositions"), { recursive: true });
  await fs.copyFile(path.join(dir, "index.html"), path.join(dest, "index.html")).catch(() => {});
  for (const f of await fs.readdir(path.join(dir, "compositions")).catch(() => [])) {
    await fs.copyFile(path.join(dir, "compositions", f), path.join(dest, "compositions", f));
  }
  return path.relative(dir, dest);
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}
