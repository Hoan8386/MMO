// Command-line pipeline: script → plan (AI) → validate → TTS → timeline → compile → render → QC.
//
//   node scripts/make-video.js <script.txt> [--mode explainer|animation] [--preset opus-unlimited] [--slug ten-video] [--title "..."] [--channel "..."] [--topic technology|entertainment|education] [--images thu-muc-anh]
//                              [--seconds 90] [--voice vi-VN-HoaiMyNeural] [--rate +6%]
//                              [--mock] [--replan] [--no-render]
//
// Output: storage/projects/<slug>/ (plan.json, index.html, compositions/, assets/, renders/vN.mp4)
// Re-running reuses plan.json and unchanged audio; pass --replan to ask the AI again.
// Projects made here do not appear in the web dashboard, which keeps its own records in MySQL.
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, slugify, makePlan, buildProject, renderAndCheck, readJson } from "../src/video/pipeline.js";
import { loadSettings, useActivePreset } from "../src/settings.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const scriptFile = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!scriptFile) {
  console.error("Cách dùng: node scripts/make-video.js <script.txt> [--slug ...] [--title ...] [--images dir] [--mock] [--no-render]");
  process.exit(1);
}

// AI preset from the "Cấu hình AI" page (MySQL); --preset picks another one for this run.
await loadSettings();
if (opt("preset")) useActivePreset(opt("preset"));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`);
const material = await fs.readFile(scriptFile, "utf8");
const slug = opt("slug", slugify(path.basename(scriptFile, path.extname(scriptFile))));
const dir = projectDir(slug);
const project = {
  slug,
  title: opt("title", ""),
  channel: opt("channel", ""),
  mode: opt("mode", "explainer"),
  topic: opt("topic", opt("mode") === "animation" ? "storytelling" : "technology"),
  width: 1920,
  height: 1080,
  aspectRatio: "16:9",
  voice: opt("voice", "vi-VN-HoaiMyNeural"),
  rate: opt("rate", "+6%"),
  targetSeconds: Number(opt("seconds", 90)),
};
await fs.mkdir(path.join(dir, "assets", "img"), { recursive: true });
await fs.writeFile(path.join(dir, "script.txt"), material);

// Images the planner may use: copied into the project so the video owns them.
const imagesDir = opt("images");
if (imagesDir) {
  for (const f of await fs.readdir(imagesDir)) {
    if (/\.(jpe?g|png|webp)$/i.test(f)) await fs.copyFile(path.join(imagesDir, f), path.join(dir, "assets", "img", f));
  }
}

let plan = flag("replan") ? null : await readJson(path.join(dir, "plan.json"));
if (plan) log("Dùng lại plan.json có sẵn");
else {
  const res = await makePlan(dir, project, material, { mock: flag("mock"), onLog: log });
  plan = res.plan;
  if (res.calls.length) {
    const sum = (k) => res.calls.reduce((a, c) => a + (c[k] || 0), 0);
    const tokIn = sum("input_tokens") + sum("cache_read_input_tokens");
    log(`Token AI: ${tokIn} vào (${sum("cache_read_input_tokens")} từ cache) + ${sum("output_tokens")} ra = ${tokIn + sum("output_tokens")} (${res.calls.length} lần gọi)`);
  }
}
project.title ||= plan.title;
log(`Plan: ${plan.scenes.length} cảnh — ${plan.scenes.map((s) => s.frame_id).join(", ")}`);

await buildProject(dir, project, plan, { onLog: log });
if (flag("no-render")) {
  log(`Xong (không render). Thư mục: ${dir}`);
  process.exit(0);
}

let lastPct = -10;
const { file } = await renderAndCheck(dir, project, {
  onLog: log,
  onProgress: (p) => p >= lastPct + 10 && log(`Render ${(lastPct = p)}%`),
});
log(`Hoàn thành: ${file}`);
