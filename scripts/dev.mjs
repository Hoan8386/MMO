// Starts the API and the web dev server together.
// Spawns node directly (no shell), so it works even when ComSpec is missing on Windows.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log(`[dev] khởi động (node ${process.version}, ${process.execPath})`);
process.on("exit", (code) => console.log(`[dev] thoát (mã ${code})`));
process.on("uncaughtException", (err) => {
  console.error("[dev] lỗi:", err);
  process.exit(1);
});

const procs = [
  { name: "api", color: 34, cwd: path.join(root, "server"), args: ["--watch", "src/index.js"] },
  { name: "web", color: 32, cwd: path.join(root, "web"), args: ["node_modules/vite/bin/vite.js"] },
];

const children = procs.map(({ name, color, cwd, args }) => {
  const child = spawn(process.execPath, args, { cwd, env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(tag + line + "\n");
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("error", (err) => console.error(`${tag}không khởi chạy được:`, err.message));
  child.on("exit", (code) => {
    console.log(`${tag}đã dừng (mã ${code})`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
