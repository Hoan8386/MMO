// Photos for the scenes of a video: each scene of the plan lists the places, scenes and things its
// sentence shows (planner.js, scene.visuals, written in the same AI call as the plan) and each one gets
// a free Wikimedia Commons photo → assets/img/p-<name>.jpg.
// What was fetched is recorded in assets/fetched.json (query, label, source, licence, credit): the same
// query is never downloaded twice, the planner can describe the images and image frames carry the credit.
import fs from "node:fs/promises";
import path from "node:path";
import { slugify, readJson, fetchedFile } from "./pipeline.js";
import { UA, commonsSearch, sleep } from "./image-sources.js";

// The words a photo must mention to count as showing `subject` ("League of Legends" → league, legends):
// accents dropped, lower case, short and filler words left out.
const FILLER = new Set("the of and a an in on at to for de la le du des".split(" "));
const subjectWords = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !FILLER.has(w));
const mentions = (text, words) => {
  const have = new Set(subjectWords(text));
  return words.every((w) => have.has(w) || have.has(`${w}s`) || (w.endsWith("s") && have.has(w.slice(0, -1))));
};

// One photo per item ({ queries, label, subject? }), its first query first. With a subject (the proper
// name the article is about) a photo is kept only when its title, categories or description name that
// subject — a photo of another game, place or person is worse than none. An item whose first query was
// fetched before reuses that photo. Never throws for one bad image.
// Returns { item index: image file name } for every item that has a photo.
export async function downloadImages(dir, items, { onLog = () => {} } = {}) {
  const record = await readJson(fetchedFile(dir), { items: [] });
  const imgDir = path.join(dir, "assets", "img");
  await fs.mkdir(imgDir, { recursive: true });
  const exists = (f) => fs.access(path.join(dir, f)).then(() => true, () => false);
  const known = new Map();
  for (const e of record.items) if (e.kind === "photo" && (await exists(e.file))) known.set(e.query, path.basename(e.file));
  // The same photo is not used for two different things.
  const pages = new Set(record.items.map((e) => e.source_url));

  // Cache key: the subject and the first query, so a photo found without a subject is not reused for one.
  const keyOf = (it) => (it.subject ? `${subjectWords(it.subject).join(" ")}|${it.queries[0]}` : it.queries[0]);
  const files = {};
  const todo = [];
  items.forEach((it, i) => (known.has(keyOf(it)) ? (files[i] = known.get(keyOf(it))) : todo.push(i)));
  const unique = [...new Map(todo.map((i) => [keyOf(items[i]), i])).values()];
  if (unique.length) onLog(`Tải ảnh cho ${unique.length} địa điểm, cảnh: ${unique.map((i) => items[i].label || items[i].queries[0]).join(", ")}`);

  const added = [];
  for (const i of unique) {
    const it = items[i];
    const must = subjectWords(it.subject);
    let ph = null;
    for (const q of it.queries) {
      // A named subject has fewer photos: look at more results and accept smaller, squarer ones.
      const found = await commonsSearch(must.length ? `${q} ${must.filter((w) => !q.includes(w)).join(" ")}`.trim() : q, must.length ? 10 : 3, must.length ? { minWidth: 800, minRatio: 1.0 } : { minWidth: 1200 }).catch(() => []);
      await sleep(1000);
      ph = found.find((p) => !pages.has(p.page) && (!must.length || mentions(p.text, must)));
      if (ph) break;
    }
    if (!ph) {
      onLog(`  ✗ ${it.label}: không có ảnh đúng${it.subject ? ` "${it.subject}"` : ""} — bỏ trống thay vì lấy ảnh không liên quan`);
      continue;
    }
    const name = uniqueName(`p-${slugify(it.queries[0]).slice(0, 40)}`, record.items, added);
    try {
      const res = await fetch(ph.thumb, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fs.writeFile(path.join(imgDir, `${name}.jpg`), Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      onLog(`  ✗ ${it.label}: ${err.message}`);
      continue;
    }
    pages.add(ph.page);
    known.set(keyOf(it), `${name}.jpg`);
    const credit = `${ph.artist} / ${ph.license}`.slice(0, 120);
    added.push({ name, query: keyOf(it), label: it.label, kind: "photo", file: `assets/img/${name}.jpg`, source: "Wikimedia Commons", license: ph.license, credit, source_url: ph.page, title: ph.title });
    onLog(`  ✓ ${it.label}: ${ph.title}`);
  }
  // Items sharing a query with one just downloaded get the same photo.
  for (const i of todo) if (known.has(keyOf(items[i]))) files[i] = known.get(keyOf(items[i]));

  record.items.push(...added);
  await fs.writeFile(fetchedFile(dir), JSON.stringify(record, null, 2));
  const total = Object.keys(files).length;
  onLog(`Ảnh cho các cảnh: ${total}/${items.length} có ảnh (${added.length} ảnh mới tải)`);
  return files;
}

const uniqueName = (base, ...lists) => {
  const taken = new Set(lists.flat().map((e) => e.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};
