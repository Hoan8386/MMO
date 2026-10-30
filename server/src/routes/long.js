// "Video dài" tab: long minimal explainer videos (src/longvideo/). Each video lives on disk in
// storage/long/<slug>/ (state.json holds the inputs, plan, AI usage and job log), which is also its
// HyperFrames project folder.
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { STORAGE_DIR } from "../config.js";
import { slugify } from "../video/pipeline.js";
import { VOICES, DEFAULT_VOICE } from "../video/tts.js";
import { planLong, continuePlan } from "../longvideo/planner.js";
import { buildLong } from "../longvideo/build.js";
import { sceneSvg, KINDS, KIND_NAMES } from "../longvideo/visuals.js";
import { ICON_NAMES } from "../longvideo/icons.js";
import { libraryPreview, sceneProblems, mixOf } from "../longvideo/library.js";
import { loadTopics } from "../video/catalog.js";

const router = Router();
const LONG_DIR = path.join(STORAGE_DIR, "long");
const dirOf = (slug) => path.join(LONG_DIR, slugify(slug));
const running = new Set();
let lane = Promise.resolve();

async function readState(slug) {
  try {
    return JSON.parse(await fs.readFile(path.join(dirOf(slug), "state.json"), "utf8"));
  } catch {
    return null;
  }
}
const writeState = (s) => fs.writeFile(path.join(dirOf(s.slug), "state.json"), JSON.stringify(s, null, 2));
// Read-modify-write of state.json, one at a time, so a log line never overwrites a result.
let writes = Promise.resolve();
const update = (slug, change) =>
  (writes = writes.then(async () => {
    const s = await readState(slug);
    if (s) await writeState({ ...s, ...(typeof change === "function" ? change(s) : change) });
  }));

// Still preview of a scene: the final state of a drawing, or a card naming the frame/animation.
const previewOf = (sc, brand) => (["frame", "anim"].includes(sc.kind) ? libraryPreview(sc) : sceneSvg(sc, { brand, final: true }));
// The scenes' previews and problems (invalid frame inputs or animation props), and the scene mix.
const withPreviews = (s) => ({
  ...s,
  busy: running.has(s.slug),
  plan: s.plan && { ...s.plan, mix: mixOf(s.plan.scenes), scenes: s.plan.scenes.map((sc) => ({ ...sc, preview: previewOf(sc, s.brand), problems: sceneProblems(sc) })) },
});
const topicOf = (s) => (s.topic ? loadTopics({ all: true }).get(s.topic) || null : null);

// Runs one task at a time (AI calls and renders alike) and mirrors its log into state.json.
function enqueue(slug, label, task) {
  if (running.has(slug)) throw new Error("Video đang được xử lý");
  running.add(slug);
  const log = (msg) => update(slug, (s) => ({ log: [...(s.log || []).slice(-200), `[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`], message: msg }));
  lane = lane
    .then(async () => {
      await log(`▶ ${label}`);
      await task({ log });
    })
    .catch(async (err) => {
      console.error(`[long ${slug}]`, err);
      if (err.raw) await fs.writeFile(path.join(dirOf(slug), "ai_last_response.txt"), err.raw).catch(() => {});
      await log(`LỖI: ${err.message}`).catch(() => {});
      await update(slug, { status: "failed" });
    })
    .finally(() => running.delete(slug));
}

const recordUsage = (s, step, usage) => (usage ? [...(s.calls || []), { step, at: new Date().toISOString(), ...usage }] : s.calls || []);

router.get("/meta", (_req, res) =>
  res.json({ voices: VOICES, defaultVoice: DEFAULT_VOICE, kinds: KIND_NAMES.map((k) => ({ id: k, about: KINDS[k].about, params: KINDS[k].params })), icons: ICON_NAMES }),
);

router.get("/", async (_req, res) => {
  await fs.mkdir(LONG_DIR, { recursive: true });
  const out = [];
  for (const d of await fs.readdir(LONG_DIR)) {
    const s = await readState(d);
    if (s) out.push({ slug: s.slug, title: s.title, status: running.has(s.slug) ? "busy" : s.status, scenes: s.plan?.scenes.length || 0, minutes: s.minutes, updated: s.updated, video: s.video });
  }
  res.json(out.sort((a, b) => String(b.updated).localeCompare(String(a.updated))));
});

router.post("/", async (req, res) => {
  const { title, material = "", minutes = 8, brand = "", voice = DEFAULT_VOICE, rate = "+0%", topic = "" } = req.body || {};
  if (!String(title || "").trim()) return res.status(400).json({ error: "Cần tiêu đề video" });
  let slug = slugify(title) || `video-${Date.now()}`;
  while (await readState(slug)) slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
  await fs.mkdir(dirOf(slug), { recursive: true });
  const s = { slug, title: title.trim(), material, minutes: Math.min(30, Math.max(1, Number(minutes) || 8)), brand, voice, rate, topic: String(topic || ""), status: "draft", plan: null, calls: [], log: [], updated: new Date().toISOString() };
  await writeState(s);
  res.json(s);
});

router.get("/:slug", async (req, res) => {
  const s = await readState(req.params.slug);
  if (!s) return res.status(404).json({ error: "Không tìm thấy video" });
  res.json(withPreviews(s));
});

router.delete("/:slug", async (req, res) => {
  if (running.has(req.params.slug)) return res.status(409).json({ error: "Video đang được xử lý" });
  await fs.rm(dirOf(req.params.slug), { recursive: true, force: true });
  res.status(204).end();
});

// Saves edits: inputs (title, material, …) and/or the plan's scenes.
router.put("/:slug", async (req, res) => {
  const slug = slugify(req.params.slug);
  if (!(await readState(slug))) return res.status(404).json({ error: "Không tìm thấy video" });
  const b = req.body || {};
  await update(slug, (s) => {
    const out = { updated: new Date().toISOString() };
    for (const k of ["title", "material", "minutes", "brand", "voice", "rate", "topic"]) if (b[k] != null) out[k] = b[k];
    if (b.scenes) out.plan = { ...(s.plan || { title: s.title }), scenes: b.scenes.map(({ preview, problems, ...sc }, i) => ({ ...sc, id: `s${String(i + 1).padStart(2, "0")}` })) };
    return out;
  });
  res.json(withPreviews(await readState(slug)));
});

// Preview of one scene being edited, without saving.
router.post("/preview", (req, res) => {
  const { scene = {}, brand } = req.body || {};
  const { preview, problems, ...rest } = scene;
  const sc = { ...rest, id: rest.id || "s00" };
  res.json({ preview: previewOf(sc, brand), problems: sceneProblems(sc) });
});

const action = (label, task) => async (req, res) => {
  const slug = slugify(req.params.slug);
  const s = await readState(slug);
  if (!s) return res.status(404).json({ error: "Không tìm thấy video" });
  try {
    enqueue(slug, label, (ctx) => task(slug, req.body || {}, ctx));
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
  res.json({ ok: true });
};

router.post(
  "/:slug/plan",
  action("Lập kịch bản bằng AI", async (slug, _b, { log }) => {
    const s = await readState(slug);
    await update(slug, { status: "planning" });
    const { plan, usage, raw } = await planLong({ title: s.title, material: s.material, minutes: s.minutes, brand: s.brand, topic: topicOf(s), onLog: log });
    if (raw) await fs.writeFile(path.join(dirOf(slug), "ai_last_response.txt"), raw);
    await update(slug, (now) => ({ plan, status: "planned", calls: recordUsage(now, "plan", usage), updated: new Date().toISOString() }));
  }),
);

router.post(
  "/:slug/continue",
  action("AI viết tiếp kịch bản", async (slug, _b, { log }) => {
    const s = await readState(slug);
    if (!s.plan?.scenes.length) throw new Error("Chưa có kịch bản để viết tiếp");
    const { plan, usage } = await continuePlan({ title: s.title, material: s.material, minutes: s.minutes, brand: s.brand, plan: s.plan, topic: topicOf(s), onLog: log });
    await update(slug, (now) => ({ plan, status: "planned", calls: recordUsage(now, "continue", usage), updated: new Date().toISOString() }));
  }),
);

// body: { limit } renders only the first N scenes (a quick test).
router.post(
  "/:slug/build",
  action("Dựng & render video", async (slug, b, { log }) => {
    const s = await readState(slug);
    if (!s.plan?.scenes.length) throw new Error("Chưa có kịch bản");
    // Frame and animation scenes edited by hand are checked before anything is rendered.
    const bad = s.plan.scenes.map((sc, i) => [i, sceneProblems(sc)]).filter(([, p]) => p.length);
    if (bad.length) throw new Error(`Sửa các cảnh trước khi render: ${bad.map(([i, p]) => `cảnh ${i + 1} — ${p.join("; ")}`).join(" | ")}`);
    await update(slug, { status: "rendering" });
    let last = -1;
    const onProgress = (p) => {
      if (p >= last + 5 || p === 100) {
        last = p;
        log(`Render ${p}%`);
      }
    };
    const { file, total } = await buildLong(dirOf(slug), s, { limit: Number(b.limit) || 0, onLog: log, onProgress });
    const video = `/storage/long/${slug}/renders/${path.basename(file)}`;
    await update(slug, { status: "done", video, duration: total, updated: new Date().toISOString() });
  }),
);

export default router;
