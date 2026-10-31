// "Video dài" tab: long minimal explainer videos (src/longvideo/). Each video lives on disk in
// storage/long/<slug>/ (state.json holds the inputs, plan, AI usage and job log), which is also its
// HyperFrames project folder.
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { STORAGE_DIR } from "../config.js";
import { slugify } from "../video/pipeline.js";
import { VOICES, DEFAULT_VOICE } from "../video/tts.js";
import { planLong } from "../longvideo/planner.js";
import { buildLong } from "../longvideo/build.js";
import { sceneSvg, KINDS, KIND_NAMES } from "../longvideo/visuals.js";
import { ICON_NAMES } from "../longvideo/icons.js";
import { libraryPreview, sceneProblems, mixOf } from "../longvideo/library.js";
import { loadTopics } from "../video/catalog.js";
import { renderDetail } from "../video/render.js";
import { startStudio, stopStudio, studioSession } from "../video/studio.js";

const router = Router();
const LONG_DIR = path.join(STORAGE_DIR, "long");
const dirOf = (slug) => path.join(LONG_DIR, slugify(slug));
const running = new Set();
export const runningLong = () => running.size;
let lane = Promise.resolve();

// null when there is no such video. A file caught mid-write (see writeState) is read again.
async function readState(slug) {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(await fs.readFile(path.join(dirOf(slug), "state.json"), "utf8"));
    } catch (err) {
      if (err.code === "ENOENT" || attempt >= 5) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
// Written to a temporary file and renamed over state.json, so the page never reads half a file. On
// Windows the rename is refused while another program (antivirus, indexer) holds state.json open, often
// for long: then the text is written into state.json itself, which such a program still allows, retried
// for a few seconds. (readState reads a half-written file again.)
const LOCKED = ["EPERM", "EBUSY", "EACCES"];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function writeState(s) {
  const file = path.join(dirOf(s.slug), "state.json");
  const tmp = `${file}.tmp`;
  const text = JSON.stringify(s, null, 2);
  await fs.writeFile(tmp, text);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fs.rename(tmp, file);
    } catch (err) {
      if (!LOCKED.includes(err.code)) throw err;
      await pause(50);
    }
  }
  await fs.rm(tmp, { force: true }).catch(() => {});
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.writeFile(file, text);
    } catch (err) {
      if (attempt >= 30 || !LOCKED.includes(err.code)) throw err;
      await pause(200);
    }
  }
}
// Read-modify-write of state.json, one at a time, so a log line never overwrites a result. A write that
// fails is reported to its caller only: the chain goes on, or every later update would be skipped.
let writes = Promise.resolve();
const update = (slug, change) => {
  const run = writes.then(async () => {
    const s = await readState(slug);
    if (s) await writeState({ ...s, ...(typeof change === "function" ? change(s) : change) });
  });
  writes = run.catch((err) => console.error(`[long ${slug}] state.json:`, err.message));
  return run;
};

// At start-up nothing is running: a video left "planning" or "rendering" was cut off by a restart of
// the server. It is marked failed (with its progress) so the page offers to run it again instead of
// showing a task that will never finish.
(async () => {
  for (const d of await fs.readdir(LONG_DIR).catch(() => [])) {
    if (d.startsWith(".")) continue;
    const s = await readState(d);
    if (!s || !["planning", "rendering"].includes(s.status)) continue;
    const msg = "Server đã khởi động lại khi đang xử lý nên tác vụ bị huỷ — bấm lại để chạy tiếp (giọng đọc và animation đã xong được dùng lại)";
    await update(d, (now) => ({
      status: "failed",
      message: msg,
      log: [...(now.log || []).slice(-200), `[${new Date().toLocaleTimeString("vi-VN")}] LỖI: ${msg}`],
      progress: now.progress && !now.progress.endedAt
        ? { ...now.progress, endedAt: Date.now(), error: msg, stages: now.progress.stages.map((st) => (st.status === "running" ? { ...st, status: "failed", endedAt: Date.now() } : st)) }
        : now.progress,
    }));
  }
})();

// Still preview of a scene: the final state of a drawing, or a card naming the frame/animation.
const previewOf = (sc, brand) => (["frame", "anim"].includes(sc.kind) ? libraryPreview(sc) : sceneSvg(sc, { brand, final: true }));
// The scenes' previews and problems (invalid frame inputs or animation props), and the scene mix.
const withPreviews = (s) => ({
  ...s,
  busy: running.has(s.slug),
  studio: studioSession(`long:${s.slug}`),
  plan: s.plan && { ...s.plan, mix: mixOf(s.plan.scenes), scenes: s.plan.scenes.map((sc) => ({ ...sc, preview: previewOf(sc, s.brand), problems: sceneProblems(sc) })) },
});
const topicOf = (s) => (s.topic ? loadTopics({ all: true }).get(s.topic) || null : null);

// The steps of each task, with their share of the whole (for the overall percent on the page).
const STAGES = {
  plan: [
    ["library", "Chuẩn bị thư viện frame & animation", 2],
    ["ai", "AI viết kịch bản & vẽ cảnh (1 lượt gọi)", 90],
    ["check", "Kiểm tra & tự sửa cảnh", 8],
  ],
  build: [
    ["voice", "Lồng tiếng", 20],
    ["anim", "Render animation Motion Canvas", 25],
    ["compose", "Dựng dự án HyperFrames", 5],
    ["render", "Render MP4", 50],
  ],
};

// Structured progress of the running task, mirrored into state.json (state.progress) for the page:
// each step's status (pending, running, done, skipped, failed), counts or percent, a detail line and
// when it started and ended. Writes are throttled to one a second, except step changes.
function tracker(slug, task, label) {
  const p = { task, label, startedAt: Date.now(), stages: STAGES[task].map(([key, name, weight]) => ({ key, label: name, weight, status: "pending" })) };
  let last = 0;
  const save = (force) => {
    if (!force && Date.now() - last < 1000) return;
    last = Date.now();
    return update(slug, { progress: JSON.parse(JSON.stringify(p)) }).catch(() => {});
  };
  return {
    save,
    // Starts or updates one step; the steps before it are done (or stay skipped).
    stage(key, info = {}) {
      const i = p.stages.findIndex((s) => s.key === key);
      if (i < 0) return;
      let changed = false;
      p.stages.forEach((s, j) => {
        if (j < i && (s.status === "running" || s.status === "pending")) {
          s.status = "done";
          s.endedAt = Date.now();
          changed = true;
        }
      });
      const s = p.stages[i];
      const { skipped, ...rest } = info;
      const starting = s.status !== "running";
      if (skipped) Object.assign(s, rest, { status: "skipped", startedAt: Date.now(), endedAt: Date.now() });
      else if (starting) Object.assign(s, rest, { status: "running", startedAt: Date.now() });
      else Object.assign(s, rest);
      // A step that starts, ends or is skipped is saved at once; counts and percents once a second.
      save(changed || skipped || starting);
    },
    finish() {
      for (const s of p.stages) if (s.status === "running" || s.status === "pending") Object.assign(s, { status: "done", percent: 100, endedAt: Date.now() });
      p.endedAt = Date.now();
      return save(true);
    },
    fail(message) {
      for (const s of p.stages) if (s.status === "running") Object.assign(s, { status: "failed", endedAt: Date.now() });
      Object.assign(p, { endedAt: Date.now(), error: message });
      return save(true);
    },
  };
}

// Runs one task at a time (AI calls and renders alike) and mirrors its log and progress into state.json.
function enqueue(slug, label, task, kind) {
  if (running.has(slug)) throw new Error("Video đang được xử lý");
  running.add(slug);
  const log = (msg) => update(slug, (s) => ({ log: [...(s.log || []).slice(-200), `[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`], message: msg }));
  const track = kind ? tracker(slug, kind, label) : null;
  lane = lane
    .then(async () => {
      await log(`▶ ${label}`);
      await track?.save(true);
      await task({ log, stage: (key, info) => track?.stage(key, info) });
      await track?.finish();
    })
    .catch(async (err) => {
      console.error(`[long ${slug}]`, err);
      if (err.raw) await fs.writeFile(path.join(dirOf(slug), "ai_last_response.txt"), err.raw).catch(() => {});
      await track?.fail(err.message);
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
    if (d.startsWith(".")) continue;
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

// Deleting on Windows: another process (Defender, the search indexer, an Explorer or editor window, a
// reader of state.json) can hold a handle for a moment and make rmdir fail with EBUSY/EPERM. The folder
// is first renamed into a hidden trash folder (so the video leaves the list at once), then removed with
// retries; whatever is still locked stays in the trash and is swept on the next delete.
const TRASH = path.join(LONG_DIR, ".trash");
const sweepTrash = async () => {
  for (const d of await fs.readdir(TRASH).catch(() => [])) await fs.rm(path.join(TRASH, d), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
};
router.delete("/:slug", async (req, res) => {
  const slug = slugify(req.params.slug);
  if (running.has(slug)) return res.status(409).json({ error: "Video đang được xử lý" });
  await stopStudio(`long:${slug}`, dirOf(slug)).catch(() => {});
  await fs.mkdir(TRASH, { recursive: true });
  const target = path.join(TRASH, `${slug}-${Date.now()}`);
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) {
    moved = await fs.rename(dirOf(slug), target).then(
      () => true,
      (e) => (e.code === "ENOENT" ? true : new Promise((r) => setTimeout(() => r(false), 200))),
    );
  }
  if (!moved) return res.status(423).json({ error: "Thư mục video đang bị chương trình khác mở (Explorer, VS Code…) — đóng lại rồi xoá lần nữa" });
  res.status(204).end();
  sweepTrash();
});

// The render seen from inside: HyperFrames' segments (finished, being captured with an estimate of
// their frames, not started), the tail of its output (renders/render.log) and the Studio session.
router.get("/:slug/render", async (req, res) => {
  const slug = slugify(req.params.slug);
  const dir = dirOf(slug);
  const timeline = JSON.parse(await fs.readFile(path.join(dir, "timeline.json"), "utf8").catch(() => "null"));
  const detail = await renderDetail(dir, { totalFrames: timeline ? Math.round(timeline.total * 30) : 0 });
  res.json({ ...detail, busy: running.has(slug), studio: studioSession(`long:${slug}`) });
});

// HyperFrames Studio on the video's project (index.html + compositions/), to watch and scrub it in the
// browser. Edits made there are overwritten by the next "Dựng & render", which writes the project again.
router.post("/:slug/studio", async (req, res) => {
  const slug = slugify(req.params.slug);
  const dir = dirOf(slug);
  if (!(await fs.stat(path.join(dir, "index.html")).catch(() => null))) return res.status(409).json({ error: "Hãy dựng video (Render thử hoặc Render toàn bộ) trước khi mở Studio" });
  try {
    res.json(await startStudio(`long:${slug}`, dir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.delete("/:slug/studio", async (req, res) => {
  const slug = slugify(req.params.slug);
  await stopStudio(`long:${slug}`, dirOf(slug));
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

// kind: the progress steps to show ("plan" or "build", see STAGES).
const action = (label, task, kind) => async (req, res) => {
  const slug = slugify(req.params.slug);
  const s = await readState(slug);
  if (!s) return res.status(404).json({ error: "Không tìm thấy video" });
  try {
    enqueue(slug, label, (ctx) => task(slug, req.body || {}, ctx), kind);
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
  res.json({ ok: true });
};

router.post(
  "/:slug/plan",
  action(
    "Lập kịch bản bằng AI",
    async (slug, _b, { log, stage }) => {
      const s = await readState(slug);
      await update(slug, { status: "planning" });
      const { plan, usage, raw } = await planLong({ title: s.title, material: s.material, minutes: s.minutes, brand: s.brand, topic: topicOf(s), onLog: log, onStage: stage });
      if (raw) await fs.writeFile(path.join(dirOf(slug), "ai_last_response.txt"), raw);
      await update(slug, (now) => ({ plan, status: "planned", calls: recordUsage(now, "plan", usage), updated: new Date().toISOString() }));
    },
    "plan",
  ),
);

// body: { limit } renders only the first N scenes (a quick test).
router.post(
  "/:slug/build",
  action("Dựng & render video", async (slug, b, { log, stage }) => {
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
    const { file, total } = await buildLong(dirOf(slug), s, { limit: Number(b.limit) || 0, onLog: log, onProgress, onStage: stage });
    const video = `/storage/long/${slug}/renders/${path.basename(file)}`;
    await update(slug, { status: "done", video, duration: total, updated: new Date().toISOString() });
  }, "build"),
);

export default router;
