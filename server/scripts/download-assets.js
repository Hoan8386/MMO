// Downloads the shared asset library listed in assets/library.json and records it in MySQL.
//
//   node scripts/download-assets.js [--only illustrations|characters|logos|photos|cutouts] [--photos-per-query 2]
//                                   [--max-per-day 40] [--dry-run]   (the last two apply to cutouts)
//
// Sources (all free for commercial use):
//   illustrations  Microsoft Fluent Emoji, colour version (MIT) via the @iconify-json/fluent-emoji npm package
//   characters     story characters (people, animals, faces) from the same Fluent Emoji set
//   logos          @iconify-json/logos (CC0) and simple-icons (CC0; brand marks remain trademarks of their owners)
//   photos         Wikimedia Commons, only public-domain / CC0 / CC BY / CC BY-SA files; the credit line is kept
//   cutouts        transparent PNGs from PNGImages.com (free for commercial use, no attribution), found
//                  through the site's sitemap and capped per day as the site asks
//
// Output: storage/library/<kind>/<file> plus storage/library/manifest.json. Files already on disk are
// kept, so re-running only fetches what is new. Each asset is upserted into the `assets` table.
import fs from "node:fs/promises";
import path from "node:path";
import { SERVER_DIR } from "../src/config.js";
import { run } from "../src/video/proc.js";
import { LIBRARY_DIR, syncAssetsToDb } from "../src/video/library.js";
import { UA, CACHE, fetchJson, commonsSearch, pngIndex, pickPng, isPng, pngSize, pngQuota, downloadPng, PNG_SOURCE } from "../src/video/image-sources.js";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const only = opt("only");
const perQuery = Number(opt("photos-per-query", 2));
const list = JSON.parse(await fs.readFile(path.join(SERVER_DIR, "assets", "library.json"), "utf8"));
const manifestFile = path.join(LIBRARY_DIR, "manifest.json");
const old = await fs.readFile(manifestFile, "utf8").then(JSON.parse).catch(() => []);
const manifest = new Map(old.map((a) => [`${a.kind}:${a.name}`, a]));
const put = (a) => manifest.set(`${a.kind}:${a.name}`, a);
const exists = (f) => fs.access(f).then(() => true, () => false);

// npm tarball → extracted package directory (cached between runs).
async function npmPackage(name) {
  const meta = await fetchJson(`https://registry.npmjs.org/${name}/latest`);
  const dir = path.join(CACHE, `${name.replace(/[@/]/g, "_")}-${meta.version}`);
  if (!(await exists(path.join(dir, "package")))) {
    await fs.mkdir(dir, { recursive: true });
    const tgz = path.join(dir, "pkg.tgz");
    console.log(`Tải ${name}@${meta.version}…`);
    await fs.writeFile(tgz, Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer()));
    await run("tar", ["-xzf", "pkg.tgz"], { cwd: dir });
  }
  return { dir: path.join(dir, "package"), version: meta.version, license: meta.license };
}

// Iconify JSON icon → standalone SVG.
function iconifySvg(set, name) {
  const icon = set.icons[name] || set.icons[set.aliases?.[name]?.parent];
  if (!icon) return null;
  const w = icon.width ?? set.width ?? 16;
  const h = icon.height ?? set.height ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}" width="${w * 8}" height="${h * 8}">${icon.body}</svg>`;
}

async function illustrations() {
  const pkg = await npmPackage("@iconify-json/fluent-emoji");
  const set = JSON.parse(await fs.readFile(path.join(pkg.dir, "icons.json"), "utf8"));
  const topicsOf = new Map();
  for (const [topic, names] of Object.entries(list.illustrations)) for (const n of names) (topicsOf.get(n) || topicsOf.set(n, []).get(n)).push(topic);
  await fs.mkdir(path.join(LIBRARY_DIR, "illustrations"), { recursive: true });
  let added = 0;
  for (const [name, topics] of topicsOf) {
    const file = `illustrations/${name}.svg`;
    if (!(await exists(path.join(LIBRARY_DIR, file)))) {
      const svg = iconifySvg(set, name);
      if (!svg) {
        console.warn(`  bỏ qua minh hoạ không có trong Fluent Emoji: ${name}`);
        continue;
      }
      await fs.writeFile(path.join(LIBRARY_DIR, file), svg);
      added++;
    }
    put({ kind: "illustration", name, file, label: name.replace(/-/g, " "), topics: topics.filter((t) => t !== "common"), common: topics.includes("common"), source: "Microsoft Fluent Emoji", license: "MIT", credit: null, source_url: "https://github.com/microsoft/fluentui-emoji" });
  }
  console.log(`Minh hoạ: ${topicsOf.size} (mới ${added})`);
}

// Story characters (people, animals, faces) from the same Fluent Emoji set; every topic may use them.
// The label starts with the group ("animals: lion") so the planner can list them by group.
async function characters() {
  const pkg = await npmPackage("@iconify-json/fluent-emoji");
  const set = JSON.parse(await fs.readFile(path.join(pkg.dir, "icons.json"), "utf8"));
  await fs.mkdir(path.join(LIBRARY_DIR, "characters"), { recursive: true });
  let added = 0;
  let total = 0;
  for (const [group, names] of Object.entries(list.characters || {})) {
    for (const name of names) {
      const file = `characters/${name}.svg`;
      if (!(await exists(path.join(LIBRARY_DIR, file)))) {
        const svg = iconifySvg(set, name);
        if (!svg) {
          console.warn(`  bỏ qua nhân vật không có trong Fluent Emoji: ${name}`);
          continue;
        }
        await fs.writeFile(path.join(LIBRARY_DIR, file), svg);
        added++;
      }
      total++;
      put({ kind: "character", name, file, label: `${group}: ${name.replace(/-/g, " ")}`, topics: [], common: true, source: "Microsoft Fluent Emoji", license: "MIT", credit: null, source_url: "https://github.com/microsoft/fluentui-emoji" });
    }
  }
  console.log(`Nhân vật: ${total} (mới ${added})`);
}

async function logos() {
  const logoPkg = await npmPackage("@iconify-json/logos");
  const logoSet = JSON.parse(await fs.readFile(path.join(logoPkg.dir, "icons.json"), "utf8"));
  const siPkg = await npmPackage("simple-icons");
  const siData = JSON.parse(await fs.readFile(path.join(siPkg.dir, "data", "simple-icons.json"), "utf8"));
  const siBySlug = new Map((siData.icons || siData).map((i) => [i.slug, i]));
  await fs.mkdir(path.join(LIBRARY_DIR, "logos"), { recursive: true });
  let added = 0;
  for (const entry of list.logos) {
    const simple = entry.startsWith("si:");
    const slug = simple ? entry.slice(3) : entry;
    const name = slug.replace(/-icon$/, "");
    const file = `logos/${name}.svg`;
    const si = simple && siBySlug.get(slug);
    if (!(await exists(path.join(LIBRARY_DIR, file)))) {
      let svg;
      if (simple) {
        const raw = await fs.readFile(path.join(siPkg.dir, "icons", `${slug}.svg`), "utf8").catch(() => null);
        svg = raw && si ? raw.replace("<svg ", `<svg fill="#${si.hex}" width="192" height="192" `).replace(/<title>.*?<\/title>/, "") : null;
      } else svg = iconifySvg(logoSet, slug);
      if (!svg) {
        console.warn(`  bỏ qua logo không tìm thấy: ${entry}`);
        continue;
      }
      await fs.writeFile(path.join(LIBRARY_DIR, file), svg);
      added++;
    }
    put({ kind: "logo", name, file, label: si?.title || name.replace(/-/g, " "), topics: [], common: true, source: simple ? "Simple Icons" : "SVG Logos (gilbarbara)", license: "CC0-1.0", credit: null, source_url: simple ? "https://simpleicons.org" : "https://github.com/gilbarbara/logos" });
  }
  console.log(`Logo: ${list.logos.length} (mới ${added})`);
}

// Stable, descriptive file name for a Commons photo: lib-<topic>-<slug of the file title>.jpg.
const photoName = (topic, title) =>
  `lib-${topic}-${title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "")}.jpg`;
async function photos() {
  await fs.mkdir(path.join(LIBRARY_DIR, "photos"), { recursive: true });
  // Photos reviewed and rejected: never downloaded again, removed if already there.
  const excluded = new Set(list.exclude_photos || []);
  for (const name of excluded) {
    manifest.delete(`photo:${name}`);
    await fs.rm(path.join(LIBRARY_DIR, "photos", name), { force: true });
  }
  let added = 0;
  for (const [topic, queries] of Object.entries(list.photos)) {
    let n = 0;
    const seen = new Set();
    for (const q of queries) {
      await new Promise((r) => setTimeout(r, 1500));
      // A few spare results so rejected or duplicate photos can be replaced.
      const found = await commonsSearch(q, perQuery + 4).catch((err) => (console.warn(`  ${topic} "${q}": ${err.message}`), []));
      let took = 0;
      for (const ph of found) {
        if (took === perQuery) break;
        const name = photoName(topic, ph.title);
        if (seen.has(name) || excluded.has(name)) continue;
        seen.add(name);
        n++;
        took++;
        const file = `photos/${name}`;
        if (!(await exists(path.join(LIBRARY_DIR, file)))) {
          const res = await fetch(ph.thumb, { headers: { "User-Agent": UA } });
          if (!res.ok) {
            console.warn(`  ${name}: HTTP ${res.status}`);
            n--;
            took--;
            continue;
          }
          await fs.writeFile(path.join(LIBRARY_DIR, file), Buffer.from(await res.arrayBuffer()));
          added++;
          await new Promise((r) => setTimeout(r, 300));
        }
        put({ kind: "photo", name, file, label: ph.title.slice(0, 250), topics: [topic], common: false, source: "Wikimedia Commons", license: ph.license, credit: `${ph.artist} / ${ph.license}`.slice(0, 120), source_url: ph.page, width: ph.w, height: ph.h });
      }
    }
    console.log(`Ảnh ${topic}: ${n}`);
  }
  console.log(`Ảnh: mới ${added}`);
}

// Transparent PNGs of single objects from PNGImages.com (see src/video/image-sources.js); the files may
// be used in videos but not redistributed as a collection. Downloads are capped per day.
const dailyCap = Number(opt("max-per-day", 40));
const dryRun = args.includes("--dry-run");

async function cutouts() {
  await fs.mkdir(path.join(LIBRARY_DIR, "cutouts"), { recursive: true });
  // A cutout taken off the list is removed from disk and from the manifest.
  const listed = new Set(Object.values(list.cutouts || {}).flatMap((g) => Object.keys(g)));
  for (const a of [...manifest.values()].filter((a) => a.kind === "cutout" && !listed.has(a.name))) {
    manifest.delete(`cutout:${a.name}`);
    await fs.rm(path.join(LIBRARY_DIR, a.file), { force: true });
  }
  const rejected = new Set(list.exclude_cutouts || []);
  const index = await pngIndex();
  const quota = await pngQuota(dailyCap);
  let added = 0;
  const waiting = [];
  for (const [group, entries] of Object.entries(list.cutouts || {})) {
    for (const [name, query] of Object.entries(entries)) {
      const file = `cutouts/${name}.png`;
      const known = manifest.get(`cutout:${name}`);
      // Keep a PNGImages file unless it was rejected; anything else (old rembg cutouts) is replaced.
      if (known?.source === "PNGImages.com" && !rejected.has(known.source_url) && (await exists(path.join(LIBRARY_DIR, file)))) continue;
      const hits = pickPng(index, query, rejected);
      if (!hits.length) {
        console.warn(`  ${name}: không có PNG nào khớp "${[query].flat().join(" / ")}"`);
        continue;
      }
      let hit = null;
      for (const h of dryRun ? hits.slice(0, 1) : hits) {
        if (dryRun || (await isPng(h.f))) {
          hit = h;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!hit) {
        console.warn(`  ${name}: các ảnh chọn đều không phải PNG nền trong`);
        continue;
      }
      if (dryRun) {
        console.log(`  ${name} ← ${hit.t}  ${hit.p}`);
        continue;
      }
      let buf;
      try {
        buf = await downloadPng(hit, quota);
      } catch (e) {
        if (e.code === "quota") waiting.push(name);
        else console.warn(`  ${name}: ${e.message}`);
        continue;
      }
      const size = pngSize(buf);
      await fs.writeFile(path.join(LIBRARY_DIR, file), buf);
      added++;
      put({ kind: "cutout", name, file, label: hit.t.slice(0, 250), topics: group === "common" ? [] : [group], common: group === "common", ...PNG_SOURCE, credit: null, source_url: hit.p, ...size });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (waiting.length) console.log(`Đã tải ${quota.used}/${dailyCap} ảnh hôm nay (giới hạn của PNGImages.com). Còn ${waiting.length} ảnh, chạy lại vào ngày mai: ${waiting.join(", ")}`);
  console.log(`Ảnh PNG nền trong: mới ${added}, tổng ${[...manifest.values()].filter((a) => a.kind === "cutout").length}`);
}

await fs.mkdir(LIBRARY_DIR, { recursive: true });
if (!only || only === "illustrations") await illustrations();
if (!only || only === "characters") await characters();
if (!only || only === "logos") await logos();
if (!only || only === "photos") await photos();
if (!only || only === "cutouts") await cutouts();
await fs.writeFile(manifestFile, JSON.stringify([...manifest.values()], null, 1));
console.log(`manifest.json: ${manifest.size} tài nguyên`);

try {
  const n = await syncAssetsToDb({ force: true });
  console.log(`Đã ghi ${n} tài nguyên vào MySQL (bảng assets)`);
} catch (err) {
  console.warn(`Chưa ghi được vào MySQL (${err.message}). Server sẽ tự nhập manifest.json khi khởi động.`);
}
process.exit(0);
