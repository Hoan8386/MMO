// Downloads the shared asset library listed in assets/library.json and records it in MySQL.
//
//   node scripts/download-assets.js [--only illustrations|logos|photos|cutouts] [--photos-per-query 2]
//                                   [--max-per-day 40] [--dry-run]   (the last two apply to cutouts)
//
// Sources (all free for commercial use):
//   illustrations  Microsoft Fluent Emoji, colour version (MIT) via the @iconify-json/fluent-emoji npm package
//   logos          @iconify-json/logos (CC0) and simple-icons (CC0; brand marks remain trademarks of their owners)
//   photos         Wikimedia Commons, only public-domain / CC0 / CC BY / CC BY-SA files; the credit line is kept
//   cutouts        transparent PNGs from PNGImages.com (free for commercial use, no attribution), found
//                  through the site's sitemap and capped per day as the site asks
//
// Output: storage/library/<kind>/<file> plus storage/library/manifest.json. Files already on disk are
// kept, so re-running only fetches what is new. Each asset is upserted into the `assets` table.
import fs from "node:fs/promises";
import path from "node:path";
import { SERVER_DIR, STORAGE_DIR } from "../src/config.js";
import { run } from "../src/video/proc.js";
import { LIBRARY_DIR, syncAssetsToDb } from "../src/video/library.js";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const only = opt("only");
const perQuery = Number(opt("photos-per-query", 2));
const UA = "MMO-Video-Studio/1.0 (local video tool; asset downloader)";
const CACHE = path.join(STORAGE_DIR, "tmp", "asset-cache");
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

async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (attempt === 5) throw new Error(`${url}: HTTP ${res.status}`);
    // Wikimedia answers 429 when requests come too fast: back off for longer each time.
    await new Promise((r) => setTimeout(r, (res.status === 429 ? 15000 : 2000) * attempt));
  }
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

const FREE = /^(cc0|public domain|pd|cc by(-sa)? \d|cc by(-sa)?$|attribution)/i;
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
const strip = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// Searches Wikimedia Commons for large landscape photos with a free licence.
async function commonsSearch(query, want) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=25" +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600`;
  const data = await fetchJson(url);
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
  const picked = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const meta = ii?.extmetadata || {};
    const license = strip(meta.LicenseShortName?.value);
    if (!ii || ii.mime !== "image/jpeg" || ii.width < 1600 || ii.width / ii.height < 1.3 || ii.width / ii.height > 2.4) continue;
    if (!FREE.test(license) || /nonfree|fair use/i.test(license)) continue;
    const artist = strip(meta.Artist?.value).slice(0, 80) || "Wikimedia Commons";
    picked.push({ thumb: ii.thumburl, page: ii.descriptionurl, title: p.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""), license, artist, w: ii.thumbwidth, h: ii.thumbheight });
    if (picked.length === want) break;
  }
  return picked;
}

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

// Transparent PNGs of single objects from PNGImages.com (free for commercial use, no attribution;
// the files may be used in videos but not redistributed as a collection). The site asks for
// "tens of downloads per day" and disallows /search for robots, so images are found by matching
// titles in its public sitemap (cached 30 days) and downloads are capped per day.
const PNG_SITE = "https://pngimages.com";
const PNG_INDEX = path.join(CACHE, "pngimages-index.json");
const PNG_LEDGER = path.join(CACHE, "pngimages-downloads.json");
const dailyCap = Number(opt("max-per-day", 40));
const dryRun = args.includes("--dry-run");
// Words that mark a drawing, icon or decoration rather than a photo of the object.
const NOT_PHOTO = new Set("icon icons logo clipart clip art cartoon silhouette outline vector illustration drawing sketch doodle text frame template pattern background emoji symbol sign label sticker line set collection banner border watercolor watercolour anime character cute kawaii flat 3d".split(" "));

// [{ t: title, f: file url, p: page url }] for every PNG listed in the sitemap.
async function pngIndex() {
  const cached = await fs.stat(PNG_INDEX).catch(() => null);
  if (cached && Date.now() - cached.mtimeMs < 30 * 864e5) return JSON.parse(await fs.readFile(PNG_INDEX, "utf8"));
  console.log("Đọc sitemap PNGImages.com…");
  const index = await (await fetch(`${PNG_SITE}/sitemap_index.xml`, { headers: { "User-Agent": UA } })).text();
  const maps = [...index.matchAll(/<loc>([^<]*pngs-sitemap\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  const list = [];
  for (const url of maps) {
    const xml = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>\s*(?:<lastmod>[^<]*<\/lastmod>\s*)?<image:image><image:loc>([^<]+)<\/image:loc><image:title>([^<]*)<\/image:title>/g))
      list.push({ p: m[1], f: m[2], t: m[3].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') });
    await new Promise((r) => setTimeout(r, 3000));
  }
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(PNG_INDEX, JSON.stringify(list));
  console.log(`  ${list.length} PNG trong sitemap`);
  return list;
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const stem = (w) => w.replace(/(es|s)$/, "");

// Best title for a query: every query word present, fewest drawing words, then fewest extra words.
// "png:<page slug>" picks one image exactly.
function pickOne(index, query, rejected) {
  if (query.startsWith("png:")) return index.find((e) => e.p.endsWith(`/${query.slice(4)}.html`)) || null;
  const want = words(query).map(stem);
  let best = null;
  for (const e of index) {
    if (rejected.has(e.p)) continue;
    const tw = words(e.t);
    const ts = new Set(tw.map(stem));
    if (!want.every((w) => ts.has(w))) continue;
    const score = tw.filter((w) => NOT_PHOTO.has(w)).length * 10 + (tw.length - want.length) + (/realistic|photo/.test(e.t.toLowerCase()) ? -3 : 0);
    if (!best || score < best.score) best = { ...e, score };
  }
  return best;
}

// Width and height from a PNG's IHDR chunk.
// Candidates for one list entry: a query, or an array of queries / exact slugs tried in order.
const pickPng = (index, entry, rejected) => [entry].flat().map((q) => pickOne(index, q, rejected)).filter(Boolean);

// Some files are served as JPEG despite the .png name; a HEAD request tells without spending a download.
async function isPng(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } }).catch(() => null);
  return !!res?.ok && /image\/png/.test(res.headers.get("content-type") || "");
}

const pngSize = (buf) => (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG" ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

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
  const ledger = await fs.readFile(PNG_LEDGER, "utf8").then(JSON.parse).catch(() => ({}));
  const today = new Date().toISOString().slice(0, 10);
  let used = ledger[today] || 0;
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
      if (used >= dailyCap) {
        waiting.push(name);
        continue;
      }
      let buf;
      try {
        const res = await fetch(hit.f, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        console.warn(`  ${name}: ${e.message}`);
        continue;
      }
      used++;
      ledger[today] = used;
      await fs.writeFile(PNG_LEDGER, JSON.stringify(ledger));
      const size = pngSize(buf);
      if (!size) {
        console.warn(`  ${name}: "${hit.t}" không phải PNG`);
        continue;
      }
      await fs.writeFile(path.join(LIBRARY_DIR, file), buf);
      added++;
      put({ kind: "cutout", name, file, label: hit.t.slice(0, 250), topics: group === "common" ? [] : [group], common: group === "common", source: "PNGImages.com", license: "PNGImages free license (commercial use, no attribution)", credit: null, source_url: hit.p, ...size });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (waiting.length) console.log(`Đã tải ${used}/${dailyCap} ảnh hôm nay (giới hạn của PNGImages.com). Còn ${waiting.length} ảnh, chạy lại vào ngày mai: ${waiting.join(", ")}`);
  console.log(`Ảnh PNG nền trong: mới ${added}, tổng ${[...manifest.values()].filter((a) => a.kind === "cutout").length}`);
}

await fs.mkdir(LIBRARY_DIR, { recursive: true });
if (!only || only === "illustrations") await illustrations();
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
