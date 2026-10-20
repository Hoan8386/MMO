import { config } from "../config.js";
import { run } from "./proc.js";

// Renders a composed HyperFrames project to output.mp4, reporting 0–100 progress.
export async function renderProject(dir, onProgress) {
  const hf = `hyperframes@${config.hyperframesVersion}`;
  await run("npx", ["--yes", hf, "check"], { cwd: dir, shell: true });
  await run("npx", ["--yes", hf, "render", "--output", "output.mp4"], {
    cwd: dir,
    shell: true,
    onLine: (line) => {
      const m = line.match(/(\d{1,3})%/);
      if (m) onProgress(Math.min(100, Number(m[1])));
    },
  });
  return "output.mp4";
}
