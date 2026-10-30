// Renders one animation job to a PNG sequence with alpha (+ optional WebM), headless.
//
//   npm --prefix server run anim:render -- --component projectile_motion [--props '{"angle":45}'] [--duration 8]
//        [--width 1920 --height 1080 --fps 30] [--out dir] [--webm] [--poster]
//   npm --prefix server run anim:render -- --job job.json --out dir
//
// Steps: validate the props against the component's schema (registry/schema.mjs), build the
// render page once (vite, cached until a source file changes), serve it locally, open it in
// Chrome through puppeteer-core and let Motion Canvas' Renderer push every frame back here.
// Output: <out>/frame-00000.png… and <out>/manifest.json (timing, size, content bounds, errors).
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { loadRegistry, getComponent } from "../registry/registry.mjs";
import { validateProps } from "../registry/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Tools come from the server's node_modules (motion/ is part of the server package).
const require = createRequire(import.meta.url);
const VITE = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const DIST = path.join(ROOT, "renderer", "dist");
const SOURCES = ["shared", "transitions", "components", "renderer/app"].map((d) => path.join(ROOT, d));

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const newest = (dir) => {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
};

// Builds the render page when it is missing or older than any source file (async: never blocks a server).
export async function ensureBuild() {
  const stamp = path.join(DIST, "index.html");
  const built = fs.existsSync(stamp) ? fs.statSync(stamp).mtimeMs : 0;
  if (built && Math.max(...SOURCES.filter(fs.existsSync).map(newest)) < built) return;
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [VITE, "build", "-c", path.join(ROOT, "vite.config.mjs")], { cwd: ROOT });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`vite build failed:\n${log}`))));
  });
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".json": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Fills defaults, checks the props and returns the job the page receives (or throws).
// lenient: accept any duration (a video scene lasts as long as its narration), not only the
// component's suggested range.
export function prepareJob(job, { lenient = false } = {}) {
  const comp = getComponent(job.component);
  if (!comp) throw new Error(`Không có component "${job.component}" trong registry`);
  const { props, errors } = validateProps(comp.inputs, job.props || {});
  if (errors.length) throw new Error(`Props của ${job.component} không hợp lệ:\n- ${errors.join("\n- ")}`);
  const duration = Number(job.duration) || comp.duration.default;
  if (lenient ? duration < 0.5 : duration < comp.duration.min || duration > comp.duration.max) throw new Error(`${job.component}: duration ${duration}s ngoài khoảng ${comp.duration.min}–${comp.duration.max}s`);
  return { fps: 30, width: 1920, height: 1080, ...job, props, duration, version: comp.version };
}

// Stable key of a job: same key = same frames, so callers can cache renders. It includes the
// build (vite names bundles by content hash), so editing any component's code invalidates old clips.
// Call after ensureBuild().
const buildId = () => (fs.existsSync(path.join(DIST, "index.html")) ? fs.readFileSync(path.join(DIST, "index.html"), "utf8") : "");
export const jobHash = (job) =>
  crypto.createHash("sha1").update(JSON.stringify([buildId(), job.component, job.version, job.props, job.duration, job.fps, job.width, job.height, job.safe, job.theme, job.cues, job.speech, job.background])).digest("hex").slice(0, 16);

let browserPromise = null;
const browser = () =>
  (browserPromise ??= puppeteer.launch({
    executablePath: CHROMES.find((p) => fs.existsSync(p)),
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-gpu-vsync"],
  }));
export const closeBrowser = async () => {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
};

// Renders a prepared job into outDir. Returns the manifest.
export async function renderJob(input, outDir, { webm = false, poster = false, lenient = false } = {}) {
  const job = prepareJob(input, { lenient });
  await ensureBuild();
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(outDir, { recursive: true });
  const server = await serve();
  const page = await (await browser()).newPage();
  const logs = [];
  page.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(String(e)));
  let union = null;
  const boxes = [];
  const writes = [];
  await page.exposeFunction("__frame", (frame, png, box) => {
    writes.push(fsp.writeFile(path.join(outDir, `frame-${String(frame).padStart(5, "0")}.png`), Buffer.from(png.slice(png.indexOf(",") + 1), "base64")));
    if (box) {
      boxes.push(box);
      union = union ? [Math.min(union[0], box[0]), Math.min(union[1], box[1]), Math.max(union[2], box[2]), Math.max(union[3], box[3])] : box;
    }
  });
  const t0 = Date.now();
  try {
    await page.setViewport({ width: 800, height: 600 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__render === "function", { timeout: 30000 });
    const r = await page.evaluate((j) => window.__render(j), job);
    await Promise.all(writes);
    const files = (await fsp.readdir(outDir)).filter((f) => f.startsWith("frame-")).sort();
    const manifest = {
      component: job.component,
      version: job.version,
      hash: jobHash(job),
      duration: job.duration,
      fps: job.fps,
      width: job.width,
      height: job.height,
      frames: files.length,
      expectedFrames: Math.round(job.duration * job.fps) + 1,
      contentBox: union,
      ok: r.ok && !logs.length,
      errors: [...r.errors, ...logs],
      renderMs: Date.now() - t0,
      job,
    };
    await fsp.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    if (webm) await encode(outDir, job.fps, path.join(outDir, "clip.webm"));
    if (poster && files.length) await fsp.copyFile(path.join(outDir, files[Math.floor(files.length * 0.8)]), path.join(outDir, "poster.png"));
    return manifest;
  } finally {
    await page.close();
    server.close();
  }
}

// PNG sequence → VP9 WebM keeping the alpha channel. Asynchronous, so a server calling it keeps
// answering. "realtime" encodes about 10× faster than "good" (4 s instead of 40 s for 9 s of
// 1080×1920); flat diagrams stay sharp at crf 24, the file is just somewhat larger.
export function encode(dir, fps, out) {
  const args = ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(dir, "frame-%05d.png"), "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24", "-row-mt", "1", "-threads", "8", "-deadline", "realtime", "-cpu-used", "8", out];
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err}`))));
  });
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  loadRegistry();
  const job = opt("job")
    ? JSON.parse(fs.readFileSync(opt("job"), "utf8"))
    : {
        component: opt("component"),
        props: opt("props") ? JSON.parse(opt("props")) : getComponent(opt("component"))?.example?.props ?? {},
        duration: opt("duration") ? Number(opt("duration")) : getComponent(opt("component"))?.example?.duration,
        cues: opt("props") ? undefined : getComponent(opt("component"))?.example?.cues,
        width: Number(opt("width") || 1920),
        height: Number(opt("height") || 1080),
        fps: Number(opt("fps") || 30),
      };
  const out = opt("out") || path.join(ROOT, ".cache", "renders", job.component);
  try {
    const m = await renderJob(job, out, { webm: args.includes("--webm"), poster: args.includes("--poster") });
    console.log(`${m.ok ? "OK" : "LỖI"} ${m.component}: ${m.frames}/${m.expectedFrames} khung, ${(m.renderMs / 1000).toFixed(1)}s → ${out}`);
    if (m.errors.length) console.log(m.errors.join("\n"));
    process.exitCode = m.ok ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await closeBrowser();
  }
}
