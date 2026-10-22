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

// Renders to renders/v<N>.mp4 and returns its path.
export async function renderProject(dir, { onProgress = () => {} } = {}) {
  const outDir = path.join(dir, "renders");
  await fs.mkdir(outDir, { recursive: true });
  const existing = (await fs.readdir(outDir)).filter((f) => /^v\d+\.mp4$/.test(f));
  const file = path.join("renders", `v${existing.length + 1}.mp4`);
  await run("npx", ["--yes", hf(), "render", "--output", file], {
    cwd: dir,
    shell: true,
    onLine: (line) => {
      const m = line.match(/(\d{1,3})%/);
      if (m) onProgress(Math.min(100, Number(m[1])));
    },
  });
  return path.join(dir, file);
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
