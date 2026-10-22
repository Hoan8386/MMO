import path from "node:path";
import { query, one } from "../db.js";
import { STORAGE_DIR } from "../config.js";
import { projectDir, makePlan, buildProject, renderAndCheck, hasManualEdits, backupSources, planErrors } from "./pipeline.js";

// Two lanes: AI planning is quick and must not wait behind a multi-minute render.
const lanes = { ai: Promise.resolve(), media: Promise.resolve() };
const running = new Set();

export const isBusy = (projectId) => running.has(Number(projectId));

export async function loadProject(id) {
  const p = await one("SELECT * FROM projects WHERE id=?", [id]);
  if (!p) throw new Error("Không tìm thấy dự án");
  p.plan = typeof p.plan === "string" ? JSON.parse(p.plan) : p.plan;
  return p;
}

// Shape the pipeline modules expect.
export const pipelineProject = (p) => ({
  slug: p.slug,
  title: p.title,
  channel: p.channel || "",
  topic: p.topic,
  voice: p.voice,
  rate: p.voice_rate,
  targetSeconds: p.target_seconds,
  aspectRatio: p.aspect_ratio,
  width: p.width,
  height: p.height,
});

export async function setProject(id, fields) {
  const keys = Object.keys(fields);
  await query(`UPDATE projects SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`, [...keys.map((k) => fields[k]), id]);
}

// Queues a task, records it in `jobs`, and mirrors progress onto the project row.
function enqueue(projectId, type, lane, task) {
  projectId = Number(projectId);
  if (running.has(projectId)) throw new Error("Dự án đang được xử lý");
  running.add(projectId);
  const job = query("INSERT INTO jobs (project_id, type) VALUES (?,?)", [projectId, type]).then((r) => r.insertId);
  const lines = [];
  const log = async (msg) => {
    lines.push(`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`);
    await setProject(projectId, { message: String(msg).slice(0, 990) });
    await query("UPDATE jobs SET log=? WHERE id=?", [lines.join("\n"), await job]);
  };
  lanes[lane] = lanes[lane]
    .then(async () => {
      await query("UPDATE jobs SET status='running', started_at=NOW() WHERE id=?", [await job]);
      await task({ log, progress: (p) => setProject(projectId, { progress: p }).catch(() => {}) });
      await query("UPDATE jobs SET status='done', log=?, finished_at=NOW() WHERE id=?", [lines.join("\n"), await job]);
    })
    .catch(async (err) => {
      console.error(`[project ${projectId}]`, err);
      lines.push(`LỖI: ${err.message}`);
      await setProject(projectId, { status: "failed", message: String(err.message).slice(0, 990) }).catch(() => {});
      await query("UPDATE jobs SET status='failed', log=?, error=?, finished_at=NOW() WHERE id=?", [lines.join("\n"), err.message, await job]).catch(() => {});
    })
    .finally(() => running.delete(projectId));
}

export function planJob(id, { mock = false } = {}) {
  enqueue(id, "plan", "ai", async ({ log }) => {
    const p = await loadProject(id);
    await setProject(id, { status: "planning", progress: 0, plan_approved: 0 });
    const { plan, calls } = await makePlan(projectDir(p.slug), pipelineProject(p), p.material, { mock, onLog: log });
    for (const c of calls) {
      await query(
        "INSERT INTO ai_calls (project_id, step, model, input_tokens, output_tokens, cache_read_input_tokens, frames_sent) VALUES (?,?,?,?,?,?,?)",
        [id, c.step, c.model, c.input_tokens, c.output_tokens, c.cache_read_input_tokens, c.frames_sent],
      );
    }
    const tokens = calls.reduce((a, c) => a + c.input_tokens + c.cache_read_input_tokens + c.output_tokens, 0);
    await setProject(id, {
      plan: JSON.stringify(plan),
      status: "awaiting_approval",
      progress: 100,
      message: `Đã lập kế hoạch ${plan.scenes.length} cảnh${calls.length ? ` (${tokens} token)` : " (mock)"} — hãy xem lại rồi duyệt`,
    });
  });
}

// Voice + compile (+ render when `render`). `force` overwrites hand edits made in Studio,
// after backing them up.
export async function buildJob(id, { render = true, force = false } = {}) {
  const p = await loadProject(id);
  const dir = projectDir(p.slug);
  if (!p.plan) throw new Error("Chưa có kế hoạch");
  const errors = await planErrors(dir, p.plan);
  if (errors.length) throw new Error(`Kế hoạch còn ${errors.length} lỗi, hãy sửa trước khi dựng:\n- ${errors.join("\n- ")}`);
  if (!force && (await hasManualEdits(dir))) {
    const err = new Error("Dự án có chỉnh sửa tay trong Studio. Dựng lại từ kế hoạch sẽ ghi đè các chỉnh sửa đó.");
    err.code = "manual_edit";
    throw err;
  }
  enqueue(id, "build", "media", async ({ log, progress }) => {
    await setProject(id, { status: "building", progress: 0, plan_approved: render ? 1 : p.plan_approved });
    if (await hasManualEdits(dir)) log(`Đã sao lưu chỉnh sửa tay vào ${await backupSources(dir)}`);
    const project = pipelineProject(p);
    const { timeline } = await buildProject(dir, project, p.plan, { onLog: log });
    await setProject(id, { plan: JSON.stringify(p.plan), manual_edit: 0, duration: timeline.total, progress: 100 });
    if (render) await doRender(id, p, dir, { log, progress });
    else await setProject(id, { status: "built", message: "Đã dựng xong — có thể mở Studio hoặc render" });
  });
}

// Renders whatever HTML is on disk now, including Studio edits.
export function renderJob(id) {
  enqueue(id, "render", "media", async ({ log, progress }) => {
    const p = await loadProject(id);
    await doRender(id, p, projectDir(p.slug), { log, progress });
  });
}

async function doRender(id, p, dir, { log, progress }) {
  const manual = await hasManualEdits(dir);
  await setProject(id, { status: "rendering", progress: 0, manual_edit: manual ? 1 : 0 });
  const { file, qc } = await renderAndCheck(dir, pipelineProject(p), { onLog: log, onProgress: progress });
  const version = Number(path.basename(file).match(/v(\d+)/)[1]);
  await query("INSERT INTO project_versions (project_id, version, file, duration, manual_edit, plan, qc) VALUES (?,?,?,?,?,?,?)", [
    id,
    version,
    path.relative(STORAGE_DIR, file).replace(/\\/g, "/"),
    qc.duration,
    manual ? 1 : 0,
    JSON.stringify(p.plan),
    JSON.stringify(qc),
  ]);
  await setProject(id, {
    status: "completed",
    progress: 100,
    current_version: version,
    duration: qc.duration,
    message: qc.ok ? `Hoàn thành phiên bản v${version}` : `Hoàn thành v${version}, QC chưa đạt: ${qc.issues.join("; ")}`,
  });
}
