// Renders a still of every frame, per topic, from the sample data in its meta.json.
// No AI and no TTS: scene lengths come from each frame's recommended duration.
//
//   node scripts/preview-frames.js [--topic entertainment] [--frame quiz]
//
// Output: storage/frame-previews/<topic>/<frame_id>.png (+ contact-sheet*.jpg), shown on the
// "Thư viện frame" page. The HyperFrames project used to shoot them stays next to the images.
import fs from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../src/config.js";
import { loadFrames, loadTopics, selectFrames } from "../src/video/catalog.js";
import { finalizePlan } from "../src/video/pipeline.js";
import { buildTimeline, LEAD, TAIL } from "../src/video/timeline.js";
import { compileProject } from "../src/video/compile.js";
import { checkProject } from "../src/video/render.js";
import { run } from "../src/video/proc.js";
import { config } from "../src/config.js";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const OUT = path.join(STORAGE_DIR, "frame-previews");
const frames = loadFrames();
const topics = [...loadTopics().values()].filter((t) => !opt("topic") || t.topic_id === opt("topic"));

for (const topic of topics) {
  const dir = path.join(OUT, topic.topic_id);
  await fs.mkdir(path.join(dir, "assets", "img"), { recursive: true });
  // A neutral test picture so image frames have something to show.
  const sample = path.join(dir, "assets", "img", "sample.jpg");
  await fs.access(sample).catch(() =>
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1", sample]),
  );

  let list = selectFrames(frames, { topic, images: ["sample.jpg"], perType: 99 });
  if (opt("frame")) list = list.filter((f) => f.frame_id === opt("frame") || ["intro", "outro"].includes(f.scene_type));
  // A valid plan needs an intro first and an outro last.
  const order = (f) => (f.scene_type === "intro" ? 0 : f.scene_type === "outro" ? 2 : 1);
  list.sort((a, b) => order(a) - order(b));
  const plan = finalizePlan(
    {
      title: `Xem trước frame — ${topic.name}`,
      scenes: list.map((f) => ({ frame_id: f.frame_id, voice_text: f.sample.voice_text, keywords: f.sample.keywords || [], transition_out: "fade", inputs: { ...f.sample.inputs } })),
    },
    { channel: "Kênh mẫu" },
    frames,
  );

  // Fake voice-over: as long as each frame's recommended duration, no word timings.
  const vo = Object.fromEntries(
    plan.scenes.map((s) => [s.id, { duration: Math.max(1, frames.get(s.frame_id).duration.recommended - LEAD - TAIL), words: [] }]),
  );
  const timeline = buildTimeline(plan, vo, frames);
  await compileProject(dir, { title: plan.title, topic, silent: true }, timeline);
  await checkProject(dir);

  // Shoot each scene just before its exit, when everything has appeared.
  const times = timeline.scenes.map((s) => +(s.start + s.duration - 0.7).toFixed(2));
  const shots = path.join(dir, "shots");
  await fs.rm(shots, { recursive: true, force: true });
  await run("npx", ["--yes", `hyperframes@${config.hyperframesVersion}`, "snapshot", "--at", times.join(","), "--no-end", "-o", "shots"], { cwd: dir, shell: true });
  const files = (await fs.readdir(shots)).filter((f) => /^frame-\d+/.test(f)).sort();
  for (const [i, s] of timeline.scenes.entries()) {
    if (files[i]) await fs.copyFile(path.join(shots, files[i]), path.join(dir, `${s.frame_id}.png`));
  }
  for (const f of (await fs.readdir(shots)).filter((n) => n.startsWith("contact-sheet"))) await fs.copyFile(path.join(shots, f), path.join(dir, f));
  console.log(`${topic.topic_id}: ${timeline.scenes.length} frame → ${dir}`);
}
