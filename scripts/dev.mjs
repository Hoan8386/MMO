// Starts the API and the web dev server together.
// Spawns node directly (no shell), so it works even when ComSpec is missing on Windows.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "server", "src");

console.log(`[dev] khởi động (node ${process.version}, ${process.execPath})`);
process.on("exit", (code) => console.log(`[dev] thoát (mã ${code})`));
process.on("uncaughtException", (err) => {
  console.error("[dev] lỗi:", err);
  process.exit(1);
});

const procs = {
  api: { color: 34, cwd: path.join(root, "server"), args: ["src/index.js"] },
  web: { color: 32, cwd: path.join(root, "web"), args: ["node_modules/vite/bin/vite.js"] },
};
const tagOf = (name) => `\x1b[${procs[name].color}m[${name}]\x1b[0m `;
const children = {};
let stopping = false;

function start(name) {
  const { cwd, args } = procs[name];
  const child = spawn(process.execPath, args, { cwd, env: process.env });
  const tag = tagOf(name);
  const pipe = (stream, out) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(tag + line + "\n");
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("error", (err) => console.error(`${tag}không khởi chạy được:`, err.message));
  child.on("exit", (code) => {
    if (stopping || child.restarting) return;
    console.log(`${tag}đã dừng (mã ${code})`);
    // A crashed API waits for the next code change, like node --watch; the web server ends everything.
    if (name === "api") console.log(`${tag}sửa code trong server/src để chạy lại`);
    else shutdown(code ?? 1);
  });
  children[name] = child;
}

// The API restarts when a file of server/src really changes. Not node --watch: Windows reports a file
// that is only read (last-access time, on by default) as changed, so opening or searching the code
// restarted the API and killed the render it was running. Contents are compared instead, and a restart
// waits until no video task is running (/api/health busy).
const hashes = new Map();
const hashOf = (file) => {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null; // deleted
  }
};
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const f of walk(SRC)) hashes.set(f, hashOf(f));

const pending = new Set();
let timer = null;
fs.watch(SRC, { recursive: true }, (_event, name) => {
  if (!name || !/\.(m?js|json)$/.test(name)) return;
  pending.add(path.join(SRC, name));
  clearTimeout(timer);
  timer = setTimeout(check, 300);
});

let waiting = false;
function check() {
  const changed = [...pending].filter((f) => {
    const h = hashOf(f);
    if (h === hashes.get(f)) return false;
    hashes.set(f, h);
    return true;
  });
  pending.clear();
  if (changed.length) restartApi(changed.map((f) => path.relative(SRC, f)));
}

async function busyTasks() {
  try {
    const res = await fetch("http://localhost:4000/api/health", { signal: AbortSignal.timeout(3000) });
    return (await res.json()).busy || 0;
  } catch {
    return 0; // not answering: nothing to protect
  }
}

async function restartApi(files) {
  const tag = tagOf("api");
  console.log(`${tag}code đã đổi (${files.join(", ")})`);
  if (waiting) return;
  waiting = true;
  for (let said = false; (await busyTasks()) > 0; said = true) {
    if (!said) console.log(`${tag}đang có tác vụ chạy — đợi xong mới khởi động lại API`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  waiting = false;
  if (stopping) return;
  const old = children.api;
  if (old.exitCode === null) {
    old.restarting = true;
    await new Promise((r) => {
      old.once("exit", r);
      old.kill();
    });
  }
  console.log(`${tag}khởi động lại`);
  start("api");
}

start("api");
start("web");

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of Object.values(children)) if (c.exitCode === null) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
