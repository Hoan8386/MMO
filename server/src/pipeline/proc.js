import { spawn } from "node:child_process";

// Runs a command, streaming stdout lines to onLine, and resolves with the full output.
export function run(cmd, args, { cwd, onLine, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell, windowsHide: true });
    let out = "";
    const take = (chunk) => {
      const text = chunk.toString();
      out += text;
      if (onLine) text.split(/\r?\n|\r/).forEach((l) => l.trim() && onLine(l));
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited with ${code}: ${out.slice(-800)}`));
    });
  });
}

export async function probeDuration(file) {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]);
  return Number(out.trim());
}
