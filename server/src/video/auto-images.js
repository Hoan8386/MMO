// Photos for the scenes of a video: each scene of the plan lists the places, scenes and things its
// sentence shows (planner.js, scene.visuals, written in the same AI call as the plan) and each one gets
// a free Wikimedia Commons photo → assets/img/p-<name>.jpg.
// What was fetched is recorded in assets/fetched.json (query, label, source, licence, credit): the same
// query is never downloaded twice, the planner can describe the images and image frames carry the credit.
import fs from "node:fs/promises";
import path from "node:path";
import { slugify, readJson, fetchedFile } from "./pipeline.js";
import { UA, commonsSearch, sleep } from "./image-sources.js";

// One photo per item ({ queries, label }), its specific query first, then the generic one. An item
// whose first query was fetched before reuses that photo. Never throws for one bad image.
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

  const files = {};
  const todo = [];
  items.forEach((it, i) => (known.has(it.queries[0]) ? (files[i] = known.get(it.queries[0])) : todo.push(i)));
  const unique = [...new Map(todo.map((i) => [items[i].queries[0], i])).values()];
  if (unique.length) onLog(`Tải ảnh cho ${unique.length} địa điểm, cảnh: ${unique.map((i) => items[i].label || items[i].queries[0]).join(", ")}`);

  const added = [];
  for (const i of unique) {
    const it = items[i];
    let ph = null;
    for (const q of it.queries) {
      const found = await commonsSearch(q, 3, { minWidth: 1200 }).catch(() => []);
      await sleep(1000);
      ph = found.find((p) => !pages.has(p.page));
      if (ph) break;
    }
    if (!ph) {
      onLog(`  ✗ ${it.label}: không tìm thấy ảnh phù hợp`);
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
    known.set(it.queries[0], `${name}.jpg`);
    const credit = `${ph.artist} / ${ph.license}`.slice(0, 120);
    added.push({ name, query: it.queries[0], label: it.label, kind: "photo", file: `assets/img/${name}.jpg`, source: "Wikimedia Commons", license: ph.license, credit, source_url: ph.page, title: ph.title });
    onLog(`  ✓ ${it.label}: ${ph.title}`);
  }
  // Items sharing a query with one just downloaded get the same photo.
  for (const i of todo) if (known.has(items[i].queries[0])) files[i] = known.get(items[i].queries[0]);

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
