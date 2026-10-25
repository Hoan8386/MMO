// Images found for one video: the AI names the 5–10 things the material talks about (in English, the
// language of the image sites), then each one is fetched, best first:
//   1. a transparent PNG from PNGImages.com            → assets/cutouts/p-<name>.png (cutout input)
//   2. a Commons photo with its background removed     → assets/cutouts/p-<name>.png (rembg, scripts/cutout.py)
//   3. the Commons photo itself                        → assets/img/p-<name>.jpg     (image input)
// What was fetched is recorded in assets/fetched.json (label, source, licence, credit) so the planner
// can describe the images and image frames carry the photo credit.
import fs from "node:fs/promises";
import path from "node:path";
import { config, SERVER_DIR, STORAGE_DIR } from "../config.js";
import { activePreset } from "../settings.js";
import { run } from "./proc.js";
import { callModel, cleanItems } from "./planner.js";
import { slugify, readJson, fetchedFile } from "./pipeline.js";
import { UA, commonsSearch, pngIndex, pickPng, isPng, pngSize, pngQuota, downloadPng, PNG_SOURCE, sleep } from "./image-sources.js";

const CUTOUT_SCRIPT = path.join(SERVER_DIR, "scripts", "cutout.py");
const CHECK_SCRIPT = path.join(SERVER_DIR, "scripts", "png_check.py");
// A usable cutout (scripts/png_check.py): background really removed, subject solid, a photo rather than
// vector art (thresholds measured on the library cutouts).
const LIMITS = { coverage: 0.92, solid: 0.4, uniform: 0.6 };

const SYSTEM = `You pick the pictures for a short narrated video. From the material, list the concrete things the video talks about that can be shown as a photo of ONE object: animals, foods, products, devices, vehicles, plants, landmarks, tools, famous objects. Skip abstract ideas, people's names, numbers and events.

For each item give:
- queries: 1–2 English search phrases as they would title a stock PNG image, most specific first, the second one more generic (e.g. ["golden retriever", "dog"], ["iphone 15", "smartphone"]). 1–3 words each, lowercase, nouns only, no words like "image", "photo", "png", "transparent".
- label: short Vietnamese name of the thing as said in the video.
Order items by how important they are to the video.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { queries: { type: "array", items: { type: "string" } }, label: { type: "string" } },
        required: ["queries", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// What the AI wants pictured: [{ queries: [en], label: vi }]. Returns { items, call } (call = token usage).
async function imageQueries({ title, material, topic, want }) {
  const prompt = `List ${want} items (at least ${Math.max(3, want - 4)}).
${title ? `Video title: ${title}\n` : ""}Topic: ${topic?.name || "general"}

Material:
"""
${material.trim().slice(0, 12000)}
"""`;
  // A small extraction task: low effort and a short answer whatever the active preset says.
  const preset = { ...activePreset(), effort: "low", max_tokens: 4000 };
  const { json, usage } = await callModel([{ role: "user", content: prompt }], SCHEMA, SYSTEM, preset);
  return { items: cleanItems(json?.items), call: { step: "images", attempt: 1, ...usage } };
}

// The "Tự tìm ảnh" button: one AI call for the keywords, then downloadImages. The first plan of a video
// gets its keywords from the planning call instead (planner.js, illustrations). Returns { added, calls }.
export async function fetchProjectImages(dir, project, material, { topic, count = 8, mock = false, onLog = () => {} } = {}) {
  if (mock || config.ai.mode === "mock") {
    onLog("Bỏ qua tự tìm ảnh: chế độ mock không gọi AI để chọn từ khoá");
    return { added: [], calls: [] };
  }
  onLog(`Tự tìm ${count} ảnh minh hoạ theo nội dung (ưu tiên PNG tách nền)`);
  const { items, call } = await imageQueries({ title: project.title, material, topic, want: count + 4 });
  onLog(`AI gợi ý ${items.length} thứ cần minh hoạ: ${items.map((it) => it.queries[0]).join(", ")}`);
  return { added: await downloadImages(dir, items, { count, onLog }), calls: [call] };
}

// Downloads one image for each item, in order, until `count` were found, and records them in
// assets/fetched.json. Items fetched before (same first query) are skipped. Never throws for one bad
// image. Returns the new entries; each carries `index`, the item's position in `items`.
//
// Each item walks its sources until one gives a clean cutout: for every query (specific first, so
// "baobab tree" comes before "tree") a PNGImages PNG, then a Commons photo for rembg; a second Commons
// photo last. Photos are cut out in one rembg batch per round; an item whose cutout failed goes on
// with its next sources in a second round, and keeps its first photo when nothing better turns up.
export async function downloadImages(dir, items, { count = 8, onLog = () => {} } = {}) {
  const record = await readJson(fetchedFile(dir), { items: [] });
  const seen = new Set(record.items.map((e) => e.query));
  const todo = items.map((it, index) => ({ ...it, index })).filter((it) => !seen.has(it.queries[0]));

  const cutDir = path.join(dir, "assets", "cutouts");
  const imgDir = path.join(dir, "assets", "img");
  await fs.mkdir(cutDir, { recursive: true });
  await fs.mkdir(imgDir, { recursive: true });
  const ctx = {
    cutDir,
    imgDir,
    onLog,
    index: await pngIndex({ onLog }).catch((err) => (onLog(`Không đọc được danh mục PNGImages.com: ${err.message}`), [])),
    quota: await pngQuota(),
    rejected: new Set(), // PNGImages pages that turned out wrong (not a PNG, failed the check)
    quotaHit: false,
    noRembg: false,
  };
  const added = [];
  const started = [];
  let waiting = []; // jobs with a photo waiting for rembg

  for (const it of todo) {
    if (added.length + waiting.length >= count) break;
    const name = uniqueName(`p-${slugify(it.queries[0]).slice(0, 40)}`, record.items, started);
    const job = {
      name,
      label: it.label,
      base: { name, query: it.queries[0], label: it.label, index: it.index },
      steps: [...it.queries.flatMap((q) => [["png", q], ["photo", q, 0]]), ["photo", it.queries[0], 1]],
      pages: new Set(),
      photo: null, // { entry, src } waiting for rembg
      fallback: null, // first photo whose cutout failed, used as a plain photo if nothing better
    };
    started.push(job);
    const cut = await advance(job, ctx);
    if (cut) added.push(cut);
    else if (job.photo) waiting.push(job);
    else onLog(`  ✗ ${it.label}: không tìm thấy ảnh phù hợp`);
  }

  for (let round = 1; waiting.length; round++) {
    const cuts = await cutoutPhotos(waiting.map((j) => j.photo), ctx);
    const next = [];
    for (const job of waiting) {
      const cut = cuts.get(job.name);
      if (cut?.entry) {
        added.push(cut.entry);
        if (job.fallback) await fs.rm(job.fallback.src, { force: true });
        continue;
      }
      if (job.fallback) await fs.rm(job.photo.src, { force: true });
      else job.fallback = job.photo;
      job.photo = null;
      const retry = round === 1 ? await advance(job, ctx) : null;
      if (retry) {
        await fs.rm(job.fallback.src, { force: true });
        added.push(retry);
      } else if (job.photo) next.push(job);
      else {
        const { entry, src } = job.fallback;
        added.push({ ...entry, kind: "photo", file: `assets/img/${path.basename(src)}` });
        onLog(`  ✓ ${job.label}: ảnh chụp Wikimedia (không tách nền được: ${cut?.why || "lỗi"})`);
      }
    }
    waiting = next;
  }

  record.items.push(...added.map(({ index, ...e }) => e));
  await fs.writeFile(fetchedFile(dir), JSON.stringify(record, null, 2));
  const n = added.filter((e) => e.kind === "cutout").length;
  onLog(`Đã thêm ${added.length} ảnh cho video: ${n} ảnh PNG tách nền, ${added.length - n} ảnh chụp`);
  return added;
}

// Takes a job's next sources until one gives a checked PNG (returned as its entry) or a Commons
// photo is downloaded (set as job.photo, for rembg). Returns null otherwise.
async function advance(job, ctx) {
  const file = path.join(ctx.cutDir, `${job.name}.png`);
  while (job.steps.length) {
    const [source, q, nth] = job.steps.shift();
    if (source === "png") {
      // Drawings and icons (score ≥ 10) or titles about more than the object (over 2 extra words)
      // would clash with the video. Titles on the site are not always right, so each download is
      // checked and the next candidate tried.
      const hits = ctx.quotaHit ? [] : pickPng(ctx.index, q, ctx.rejected, { per: 3 }).filter((h) => h.score < 10 && h.extra <= 2);
      for (const h of hits) {
        ctx.rejected.add(h.p);
        if (!(await isPng(h.f))) continue;
        try {
          await fs.writeFile(file, await downloadPng(h, ctx.quota));
        } catch (err) {
          if (err.code !== "quota") continue;
          ctx.onLog(`  PNGImages.com: ${err.message} (giới hạn của trang), chuyển sang ảnh Wikimedia`);
          ctx.quotaHit = true;
          break;
        }
        const why = badCutout((await checkPngs([file]))?.get(file));
        if (!why) {
          ctx.onLog(`  ✓ ${job.label}: PNG tách nền "${h.t}"`);
          await sleep(1500);
          return { ...job.base, kind: "cutout", file: `assets/cutouts/${job.name}.png`, ...PNG_SOURCE, credit: null, source_url: h.p, ...pngSize(await fs.readFile(file)) };
        }
        await fs.rm(file, { force: true });
        ctx.onLog(`  bỏ PNG "${h.t}": ${why}`);
        await sleep(1000);
      }
      continue;
    }
    // Without rembg a second photo cannot do better than the first.
    if (ctx.noRembg && job.fallback) continue;
    const ph = (await commonsSearch(q, nth + 1, { minWidth: 1200 }).catch(() => []))[nth];
    await sleep(1000);
    if (!ph || job.pages.has(ph.page)) continue;
    job.pages.add(ph.page);
    const src = path.join(ctx.imgDir, `${job.name}${job.fallback ? "-2" : ""}.jpg`);
    try {
      const res = await fetch(ph.thumb, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      ctx.onLog(`  ${job.label}: ${err.message}`);
      continue;
    }
    const credit = `${ph.artist} / ${ph.license}`.slice(0, 120);
    job.photo = { entry: { ...job.base, source: "Wikimedia Commons", license: ph.license, credit, source_url: ph.page, title: ph.title }, src };
    return null;
  }
  return null;
}

const uniqueName = (base, ...lists) => {
  const taken = new Set(lists.flat().map((e) => e.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

// JSON lines printed by a Python helper, keyed by `key`.
const jsonLines = (out, key) =>
  new Map(
    out
      .split(/\r?\n/)
      .filter((l) => l.startsWith("{"))
      .flatMap((l) => {
        try {
          const r = JSON.parse(l);
          return [[r[key], r]];
        } catch {
          return []; // a log line, not a result
        }
      }),
  );

// scripts/png_check.py on some PNGs → Map(file → { coverage, solid, uniform }), or null when Python
// with Pillow is not available (the PNGs are then used unchecked).
async function checkPngs(files) {
  return run(config.pythonBin, [CHECK_SCRIPT, ...files]).then((out) => jsonLines(out, "file"), () => null);
}

// Why a cutout should not be used, or "" when it is fine.
function badCutout(r) {
  if (!r) return "";
  if (r.error) return r.error;
  if (r.coverage > LIMITS.coverage) return "nền chưa được tách";
  if (r.solid < LIMITS.solid) return "vật thể mờ, tách nền lỗi";
  if (r.uniform > LIMITS.uniform) return "hình vẽ / hình bóng, không phải ảnh chụp";
  return "";
}

// Removes the background of photos in one rembg run (the model loads once). Returns
// Map(name → { entry } for a clean cutout, which replaces the photo, or { why } when it failed).
async function cutoutPhotos(photos, ctx) {
  const pngOf = (p) => path.join(ctx.cutDir, `${p.entry.name}.png`);
  let made = new Map();
  const jobs = path.join(STORAGE_DIR, "tmp", `cutout-${Date.now()}.json`);
  if (!ctx.noRembg) {
    try {
      await fs.mkdir(path.dirname(jobs), { recursive: true });
      await fs.writeFile(jobs, JSON.stringify(photos.map((p) => [p.src, pngOf(p)])));
      ctx.onLog(`Tách nền ${photos.length} ảnh chụp (rembg)`);
      made = jsonLines(await run(config.pythonBin, [CUTOUT_SCRIPT, jobs]), "out");
    } catch (err) {
      ctx.noRembg = true;
      ctx.onLog(`  Không tách nền được (${err.message.split("\n")[0].slice(0, 160)}) — giữ ảnh chụp gốc. Cài: .venv\\Scripts\\pip install rembg pillow`);
    } finally {
      await fs.rm(jobs, { force: true });
    }
  }
  const ok = photos.filter((p) => made.get(pngOf(p)) && !made.get(pngOf(p)).error);
  const checks = ok.length ? await checkPngs(ok.map(pngOf)) : null;
  const result = new Map();
  for (const p of photos) {
    const r = made.get(pngOf(p));
    const why = !r ? "chưa cài rembg" : r.error || badCutout(checks?.get(pngOf(p)));
    if (!why) {
      await fs.rm(p.src, { force: true });
      result.set(p.entry.name, { entry: { ...p.entry, kind: "cutout", file: `assets/cutouts/${p.entry.name}.png`, width: r.width, height: r.height } });
      ctx.onLog(`  ✓ ${p.entry.label}: ảnh Wikimedia đã tách nền`);
    } else {
      await fs.rm(pngOf(p), { force: true });
      result.set(p.entry.name, { why });
      ctx.onLog(`  ${p.entry.label}: tách nền không đạt (${why}), thử nguồn khác`);
    }
  }
  return result;
}
