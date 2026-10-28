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
import { topicAssets, findAsset } from "./library.js";
import { downloadImages } from "./auto-images.js";
import { richGuide, mixGuide, customSceneGuide } from "./guides.js";
import { layoutFor } from "./aspects.js";
import { topicTracks, pickTrack, copyTrack } from "./music.js";
import { styleFor, STYLES } from "./styles.js";
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

// The project's own cutouts (auto-images.js): PNGs in assets/cutouts that are not library copies.
export async function listCutouts(dir) {
  const files = await fs.readdir(path.join(dir, "assets", "cutouts")).catch(() => []);
  return files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).filter((n) => !findAsset("cutout", n));
}

// Record of the images fetched for this video: { items: [{ name, kind, file, label, credit, … }] }.
export const fetchedFile = (dir) => path.join(dir, "assets", "fetched.json");

// The project's own images and cutouts, with what each shows (labels, by image file or cutout name)
// and the credit of each fetched photo (credits, by image file).
export async function projectMedia(dir) {
  const [images, cutouts, { items }] = await Promise.all([listImages(dir), listCutouts(dir), readJson(fetchedFile(dir), { items: [] })]);
  const byName = new Map(items.map((e) => [e.kind === "photo" ? path.basename(e.file) : e.name, e]));
  const labels = {};
  const credits = {};
  for (const n of [...images, ...cutouts]) {
    const e = byName.get(n);
    if (e?.label) labels[n] = e.label;
    if (e?.credit && images.includes(n)) credits[n] = e.credit;
  }
  return { images, cutouts, labels, credits };
}

// project: { title, channel, topic, voice, rate, targetSeconds, aspectRatio, width, height, autoImages }
// fromSaved: process the AI's last saved answer again (ai_last_response.txt) instead of calling the AI.
export async function makePlan(dir, project, material, { mock = false, fromSaved = false, onLog = () => {} } = {}) {
  const frames = loadFrames();
  const savedAnswer = fromSaved ? await fs.readFile(path.join(dir, "ai_last_response.txt"), "utf8").catch(() => null) : null;
  if (fromSaved && !savedAnswer) throw new Error("Chưa có câu trả lời AI nào được lưu cho dự án này — hãy lập kế hoạch bằng AI");
  if (fromSaved && project.mode === "animation") throw new Error("Dùng lại câu trả lời đã lưu chưa hỗ trợ phim hoạt hình — hãy lập kế hoạch bằng AI");
  if (project.mode === "animation") return makeAnimationPlan(dir, project, material, frames, { mock, onLog });
  const { images, cutouts, labels } = await projectMedia(dir);
  const topic = getTopic(project.topic);
  // Unlimited presets (billed per request) get more in the same single call: the whole matching frame
  // library, more scenes, story motion on every scene, cartoon shots and AI-designed scenes.
  const preset = activePreset();
  const unlimited = preset.billing === "request";
  // Each scene also lists the photos its sentence calls for (auto-images.js), in the same AI call.
  const visuals = project.autoImages > 0;
  // A scene's own photo counts as a project image, so the image frames are offered.
  const allowed = selectFrames(frames, { topic, aspectRatio: project.aspectRatio, images: visuals ? [...images, "visual:1"] : images, cutouts, ...(unlimited ? { perType: 99, maxContent: 99 } : {}) });
  const supports = (id) => frames.get(id)?.status === "active" && frames.get(id).aspect_ratios.includes(project.aspectRatio || "16:9");
  let extra = "";
  if (unlimited) {
    extra += richGuide(project.targetSeconds || 90);
    if (supports("anim-shot")) {
      allowed.push(frames.get("anim-shot"));
      extra += mixGuide;
    }
    if (supports("ai-scene")) {
      allowed.push(frames.get("ai-scene"));
      extra += customSceneGuide(layoutFor(project.aspectRatio || "16:9", project.width, project.height).scene);
    }
  }
  const library = topicLibrary(topic.topic_id);
  // The cutouts fetched for this video come first: they show what this material is about.
  library.cutouts = [...cutouts, ...library.cutouts];
  // Background music the AI may choose from (the topic's tracks), in the same call.
  const music = project.music && project.music !== "auto" ? [] : await topicTracks(topic.topic_id).catch(() => []);
  onLog(`Model ${preset.model} (${unlimited ? "theo lượt, chế độ unlimited: thêm frame, chuyển động, cảnh hoạt hình, cảnh AI tự thiết kế" : "theo token"})`);
  onLog(`Chủ đề ${topic.name}: thư viện ${frames.size} frame, gửi cho AI ${allowed.length} frame phù hợp, ${images.length} ảnh dự án, ${cutouts.length} ảnh tách nền của dự án, ${library.photos.length} ảnh thư viện, ${library.icons.length} icon, ${music.length} bản nhạc nền`);
  const { plan, calls, errors, raw } = await planVideo({
    material,
    title: project.title,
    channel: project.channel,
    topic,
    frames,
    allowed,
    images,
    labels,
    library,
    targetSeconds: project.targetSeconds,
    extra,
    motion: unlimited,
    music,
    visuals,
    fetchImages: (items) => downloadImages(dir, items, { onLog }),
    savedAnswer,
    mock,
    onLog,
  }).catch(async (err) => {
    if (err.raw) await saveRaw(dir, err.raw);
    throw err;
  });
  if (raw && !savedAnswer) await saveRaw(dir, raw);
  const { credits } = await projectMedia(dir);
  const stamped = calls.map((c) => ({ ...c, at: new Date().toISOString(), frames_sent: allowed.length }));
  if (stamped.length) {
    const logFile = path.join(dir, "ai_calls.json");
    const prev = await readJson(logFile, []);
    await fs.writeFile(logFile, JSON.stringify([...prev, ...stamped], null, 2));
  }
  finalizePlan(plan, project, frames, credits);
  return { plan, calls: stamped, errors: errors || [] };
}

// The AI's last full answer, kept in the project folder to look into when a plan comes out wrong.
const saveRaw = (dir, text) => fs.writeFile(path.join(dir, "ai_last_response.txt"), text).catch(() => {});

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
  onLog(`Model ${preset.model} (${unlimited ? "theo lượt, chế độ unlimited: thêm cảnh, thẻ chen giữa có chuyển động" : "theo token"})`);
  const options = unlimited ? { rich: true, mix: true, motion: true, library: topicLibrary(project.topic || "storytelling") } : {};
  const { plan, calls, errors = [], raw } = await planAnimation({ material, title: project.title, targetSeconds: project.targetSeconds, frames, mock, onLog, options }).catch(async (err) => {
    if (err.raw) await saveRaw(dir, err.raw);
    throw err;
  });
  if (raw) await saveRaw(dir, raw);
  const stamped = calls.map((c) => ({ ...c, at: new Date().toISOString(), frames_sent: 3 }));
  if (stamped.length) {
    const logFile = path.join(dir, "ai_calls.json");
    const prev = await readJson(logFile, []);
    await fs.writeFile(logFile, JSON.stringify([...prev, ...stamped], null, 2));
  }
  finalizePlan(plan, project, frames);
  return { plan, calls: stamped, errors };
}

// Numbers scenes s01… in order and applies project-level values the AI must not decide.
// credits: { image file: credit } for the project's fetched photos.
export function finalizePlan(plan, project, frames = loadFrames(), credits = {}) {
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
    s.visuals ||= [];
    s.icons ||= [];
    s.transition_out ||= "fade";
    const frame = frames.get(s.frame_id);
    if (project.channel && frame?.inputs.channel) s.inputs.channel = project.channel;
    // A library photo always carries its licence credit.
    const credit = typeof s.inputs.image === "string" && (credits[s.inputs.image] || findAsset("photo", s.inputs.image)?.credit);
    if (credit && frame?.inputs.credit && !s.inputs.credit) s.inputs.credit = shortCredit(credit, frame.inputs.credit.maxLength ?? 40);
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
  const { images, cutouts } = await projectMedia(dir);
  return validatePlan(plan, loadFrames(), { images, cutouts });
}

// Voice → timeline → compile → lint. Writes plan.json, timeline.json and the HyperFrames
// project, and records a hash of the generated HTML so later hand edits can be detected.
export async function buildProject(dir, project, plan, { onLog = () => {} } = {}) {
  const frames = loadFrames();
  const { images, cutouts, credits } = await projectMedia(dir);
  const errors = validatePlan(plan, frames, { images, cutouts });
  if (errors.length) throw new Error(`Kế hoạch chưa hợp lệ:\n- ${errors.join("\n- ")}`);
  finalizePlan(plan, project, frames, credits);
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(project, null, 2));

  onLog("Tạo giọng đọc");
  const vo = await voiceScenes(dir, plan.scenes, project, (sc) => voiceFor(sc, project, plan));
  const cached = Object.values(vo).filter((v) => v.cached).length;
  if (cached) onLog(`Dùng lại ${cached}/${plan.scenes.length} file audio không đổi`);

  const timeline = buildTimeline(plan, vo, frames);
  timeline.warnings.forEach((w) => onLog(`Cảnh báo: ${w}`));
  // Background music: the project's choice, else the one the AI picked, else the topic's first track.
  const track = await pickTrack(project, plan).catch((err) => (onLog(`Không đọc được nhạc nền: ${err.message}`), null));
  const music = track ? await copyTrack(dir, track) : null;
  onLog(music ? `Nhạc nền: ${track.name} (âm lượng ${Math.round(music.volume * 100)}%)` : "Không có nhạc nền");
  const style = styleFor(plan, project.topic);
  onLog(`Phong cách dựng: ${STYLES[style].label}${plan.style ? "" : " (mặc định theo chủ đề)"}`);
  const { frames: used } = await compileProject(dir, { ...project, title: project.title || plan.title, topic: getTopic(project.topic), music, style }, timeline);
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
