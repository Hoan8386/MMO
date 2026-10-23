// The video pipeline as reusable steps, shared by the CLI (scripts/make-video.js) and the API jobs.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { STORAGE_DIR } from "../config.js";
import { loadFrames, selectFrames, getTopic } from "./catalog.js";
import { planVideo } from "./planner.js";
import { planAnimation } from "../animation/planner.js";
import { rigById } from "../animation/rigs.js";
import { activePreset } from "../settings.js";
import { layoutFor } from "./aspects.js";
import { richGuide, mixGuide, customSceneGuide } from "./guides.js";
import { topicAssets, findAsset } from "./library.js";
import { validatePlan } from "./validate.js";
import { voiceScenes, voiceFor } from "./tts.js";
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
  if (project.mode === "animation") return makeAnimationPlan(dir, project, material, frames, { mock, onLog });
  const images = await listImages(dir);
  const topic = getTopic(project.topic);
  // Unlimited presets (billed per request) get the whole matching library, cartoon shots and
  // AI-designed scenes, plus extra guidance; token presets stay lean.
  const preset = activePreset();
  const unlimited = preset.billing === "request";
  const allowed = selectFrames(frames, { topic, aspectRatio: project.aspectRatio, images, ...(unlimited ? { perType: 99, maxContent: 99 } : {}) });
  const supports = (id) => frames.get(id)?.status === "active" && frames.get(id).aspect_ratios.includes(project.aspectRatio || "16:9");
  let extra = "";
  if (unlimited && preset.density === "rich") extra += richGuide(project.targetSeconds || 90);
  if (unlimited && preset.mix_templates && supports("anim-shot")) {
    allowed.push(frames.get("anim-shot"));
    extra += mixGuide;
  }
  if (unlimited && preset.custom_scenes && supports("ai-scene")) {
    allowed.push(frames.get("ai-scene"));
    extra += customSceneGuide(layoutFor(project.aspectRatio || "16:9", project.width, project.height).scene);
  }
  const library = topicLibrary(topic.topic_id);
  onLog(`Model ${preset.model} (${unlimited ? "theo lượt, chế độ unlimited" : "theo token"})`);
  onLog(`Chủ đề ${topic.name}: thư viện ${frames.size} frame, gửi cho AI ${allowed.length} frame phù hợp, ${images.length} ảnh dự án, ${library.photos.length} ảnh thư viện, ${library.icons.length} icon`);
  const { plan, calls } = await planVideo({
    material,
    title: project.title,
    channel: project.channel,
    topic,
    frames,
    allowed,
    images,
    library,
    targetSeconds: project.targetSeconds,
    extra,
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

// Names of the library icons, logos, photos, cutouts and characters that suit a topic (what the planner may pick from).
export function topicLibrary(topicId) {
  return {
    icons: topicAssets(topicId, "illustration").map((a) => a.name),
    logos: topicAssets(topicId, "logo").map((a) => a.name),
    photos: topicAssets(topicId, "photo").map(({ name, label, credit }) => ({ name, label, credit })),
    cutouts: topicAssets(topicId, "cutout").map((a) => a.name),
    // Characters are grouped (people, animals, faces) so the prompt can list them by group.
    characters: topicAssets(topicId, "character").map(({ name, label }) => ({ name, group: label.split(":")[0] })),
  };
}

// Animation mode: the AI writes a screenplay (cast + one shot per spoken line).
async function makeAnimationPlan(dir, project, material, frames, { mock, onLog }) {
  onLog("Phim hoạt hình: AI viết kịch bản, chọn nhân vật, bối cảnh và hành động");
  const preset = activePreset();
  const unlimited = preset.billing === "request";
  onLog(`Model ${preset.model} (${unlimited ? "theo lượt, chế độ unlimited" : "theo token"})`);
  const options = unlimited
    ? {
        rich: preset.density === "rich",
        mix: preset.mix_templates,
        custom: preset.custom_scenes,
        library: topicLibrary(project.topic || "storytelling"),
        canvas: layoutFor(project.aspectRatio || "16:9", project.width, project.height).scene,
      }
    : {};
  const { plan, calls } = await planAnimation({ material, title: project.title, targetSeconds: project.targetSeconds, frames, mock, onLog, options });
  const stamped = calls.map((c) => ({ ...c, at: new Date().toISOString(), frames_sent: 3 }));
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
  if (plan.scenes.some((s) => s.frame_id?.startsWith("anim-"))) {
    plan.cast ||= [];
    for (const id of new Set(plan.scenes.flatMap((s) => s.inputs?.cast || []))) {
      const rig = rigById(id);
      if (rig && !plan.cast.some((c) => c.rig === id)) plan.cast.push({ rig: id, name: rig.name, voice: rig.voice });
    }
  }
  plan.scenes.forEach((s, i) => {
    s.id = `s${String(i + 1).padStart(2, "0")}`;
    s.inputs ||= {};
    s.keywords ||= [];
    s.transition_out ||= "fade";
    const frame = frames.get(s.frame_id);
    if (project.channel && frame?.inputs.channel) s.inputs.channel = project.channel;
    // A library photo always carries its licence credit.
    const photo = typeof s.inputs.image === "string" && findAsset("photo", s.inputs.image);
    if (photo?.credit && frame?.inputs.credit && !s.inputs.credit) s.inputs.credit = shortCredit(photo.credit, frame.inputs.credit.maxLength ?? 40);
  });
  return plan;
}

// "Author / licence" cut to fit, always keeping the licence.
function shortCredit(credit, max) {
  if (credit.length <= max) return credit;
  const [author, license = ""] = credit.split(" / ");
  return `${author.slice(0, Math.max(1, max - license.length - 4))}… / ${license}`.slice(0, max);
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
  const vo = await voiceScenes(dir, plan.scenes, project, (sc) => voiceFor(sc, project, plan));
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
