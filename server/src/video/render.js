import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { run } from "./proc.js";

const hf = () => `hyperframes@${config.hyperframesVersion}`;

// Static checks before rendering. Throws when lint reports errors.
export async function checkProject(dir) {
  const out = await run("npx", ["--yes", hf(), "lint", "--json"], { cwd: dir, shell: true }).catch((e) => e.message);
  let report;
  try {
    report = JSON.parse(out.slice(out.indexOf("{")));
  } catch {
    report = null;
  }
  const errors = report?.findings?.filter((f) => f.severity === "error") ?? [];
  if (errors.length) throw new Error(`HyperFrames lint lỗi:\n- ${errors.map((e) => `${e.code}: ${e.message}`).join("\n- ")}`);
  return report;
}

const SEGMENTS = path.join("renders", ".hf-segments");
const LOG = path.join("renders", "render.log");
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

// Renders to renders/v<N>.mp4 and returns its path.
// The video is captured in segments (renders/.hf-segments/): a render cut off by a restart or a crash
// starts again from the segments already finished instead of from frame 0. Workers, quality and the
// browser GPU come from server/.env (config.render). What HyperFrames prints goes to renders/render.log.
// onFrames(done, total): frames captured so far, every few seconds (HyperFrames itself only prints a
// percent when a whole segment ends). totalFrames: the video's length, known before segments.json is.
export async function renderProject(dir, { onProgress = () => {}, onFrames, totalFrames = 0 } = {}) {
  const outDir = path.join(dir, "renders");
  await fs.mkdir(outDir, { recursive: true });
  const existing = (await fs.readdir(outDir)).filter((f) => /^v\d+\.mp4$/.test(f));
  const file = path.join("renders", `v${existing.length + 1}.mp4`);
  const { workers, quality, browserGpu } = config.render;
  const args = ["--yes", hf(), "render", "--output", file, "--workers", workers, "--quality", quality, "--resume"];
  if (browserGpu === "on") args.push("--browser-gpu");
  if (browserGpu === "off") args.push("--no-browser-gpu");
  const log = createWriteStream(path.join(dir, LOG));
  log.write(`[${new Date().toLocaleString("vi-VN")}] hyperframes ${args.slice(2).join(" ")}\n`);
  let previous = "";
  let looking = false;
  const timer = onFrames && setInterval(async () => {
    if (looking) return;
    looking = true;
    try {
      const d = await renderDetail(dir, { totalFrames });
      // A "stopped" file is left from a render that was cut off, until this one starts on it again.
      if (d.totalFrames && d.segments.length) onFrames(d.segments.reduce((n, s) => n + (s.status === "stopped" ? 0 : s.done), 0), d.totalFrames);
    } catch {
      // the next look will do
    } finally {
      looking = false;
    }
  }, 5000);
  try {
    await run("npx", args, {
      cwd: dir,
      shell: true,
      env: { HF_SEGMENTED_CAPTURE: "true" },
      onLine: (raw) => {
        const line = raw.replace(ANSI, "").trim();
        if (line && line !== previous) log.write(`${line}\n`);
        previous = line;
        const m = line.match(/(\d{1,3})%/);
        if (m) onProgress(Math.min(100, Number(m[1])));
      },
    });
  } catch (err) {
    log.write(`LỖI: ${err.message}\n`);
    throw err;
  } finally {
    clearInterval(timer);
    await new Promise((r) => log.end(r));
  }
  return path.join(dir, file);
}

// Frames in a segment being written. Until it is finished its MP4 has no index (moov), but ffmpeg writes
// the H.264 stream into one open-ended mdat box as length-prefixed NAL units: a frame starts at each
// slice (types 1 and 5) whose first_mb_in_slice is 0 (first bit of the slice header set). The position
// reached is kept per file, so each look only reads what was added since.
const counted = new Map(); // file → { pos, frames }
async function framesWritten(file) {
  const fh = await fs.open(file, "r");
  try {
    const { size } = await fh.stat();
    const b = Buffer.alloc(16);
    let { pos, frames } = counted.get(file) || { pos: 0, frames: 0 };
    if (pos > size) ({ pos, frames } = { pos: 0, frames: 0 }); // a new render rewrote the file
    if (!pos) {
      for (;;) {
        if (pos + 8 > size) return 0;
        await fh.read(b, 0, 8, pos);
        const len = b.readUInt32BE(0);
        if (b.toString("latin1", 4, 8) === "mdat") {
          pos += len === 1 ? 16 : 8;
          break;
        }
        if (len < 8) return 0;
        pos += len;
      }
    }
    while (pos + 6 <= size) {
      await fh.read(b, 0, 6, pos);
      const len = b.readUInt32BE(0);
      if (!len || pos + 4 + len > size) break; // the unit still being written
      const type = b[4] & 0x1f;
      if ((type === 1 || type === 5) && b[5] & 0x80) frames++;
      pos += 4 + len;
    }
    counted.set(file, { pos, frames });
    return frames;
  } finally {
    await fh.close();
  }
}

// What a render of dir has done so far, for the page's detail view. HyperFrames cuts the video into
// segments of segmentFrames frames, captured side by side; segments.json lists the finished ones, and
// the frames of the others are counted in their files (framesWritten).
// totalFrames: the video's length in frames, used until segments.json exists.
export async function renderDetail(dir, { totalFrames = 0 } = {}) {
  const root = path.join(dir, SEGMENTS);
  // The newest plan (another render of changed content gets another folder).
  const plans = [];
  for (const d of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory()) continue;
    const st = await fs.stat(path.join(root, d.name)).catch(() => null);
    if (st) plans.push({ name: d.name, mtime: st.mtimeMs });
  }
  const plan = plans.sort((a, b) => b.mtime - a.mtime)[0];
  const log = (await fs.readFile(path.join(dir, LOG), "utf8").catch(() => "")).split("\n").filter(Boolean).slice(-80);
  if (!plan) return { segments: [], totalFrames, log };

  const folder = path.join(root, plan.name);
  const meta = JSON.parse(await fs.readFile(path.join(folder, "segments.json"), "utf8").catch(() => "null")) || {};
  const total = meta.totalFrames || totalFrames;
  const per = meta.segmentFrames || 3000;
  const done = new Map((meta.completed || []).map((c) => [c.index, c]));
  const files = new Map();
  for (const f of await fs.readdir(folder).catch(() => [])) {
    const m = f.match(/^segment_(\d+)\.mp4$/);
    if (m) files.set(Number(m[1]), await fs.stat(path.join(folder, f)).catch(() => null));
  }
  const count = total ? Math.ceil(total / per) : Math.max(0, ...files.keys()) + 1;
  const segments = [];
  for (let i = 0; i < count; i++) {
    const start = i * per;
    const frames = (total ? Math.min(total, start + per) : start + per) - start;
    const c = done.get(i);
    const st = files.get(i);
    if (c) segments.push({ index: i, start, frames, done: frames, bytes: c.bytes, status: "done", at: c.completedAt });
    else if (!st) segments.push({ index: i, start, frames, done: 0, bytes: 0, status: "pending" });
    else {
      const written = await framesWritten(path.join(folder, `segment_${String(i).padStart(5, "0")}.mp4`)).catch(() => 0);
      // A file nobody wrote to for a minute belongs to a render that was cut off.
      const live = Date.now() - st.mtimeMs < 60_000;
      segments.push({ index: i, start, frames, done: Math.min(frames, written), bytes: st.size, status: live ? "rendering" : "stopped", at: new Date(st.mtimeMs).toISOString() });
    }
  }
  return { plan: plan.name, segments, totalFrames: total, segmentFrames: per, log };
}

// Technical checks on the rendered file.
export async function qualityCheck(file, { width, height, duration }) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file]);
  const info = JSON.parse(out);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  const actual = Number(info.format.duration);
  const issues = [];
  if (!video) issues.push("không có luồng hình");
  else if (video.width !== width || video.height !== height) issues.push(`độ phân giải ${video.width}x${video.height}, cần ${width}x${height}`);
  if (!audio) issues.push("không có luồng âm thanh");
  if (Math.abs(actual - duration) > 0.5) issues.push(`thời lượng ${actual.toFixed(2)}s, dự kiến ${duration.toFixed(2)}s`);
  return { ok: issues.length === 0, issues, duration: actual, width: video?.width, height: video?.height, hasAudio: !!audio };
}
