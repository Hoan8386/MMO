// Free image sources shared by the library downloader (scripts/download-assets.js) and the per-project
// image fetcher (auto-images.js):
//   PNGImages.com      transparent PNGs of single objects (free for commercial use, no attribution). The
//                      site asks for "tens of downloads per day" and disallows /search for robots, so
//                      images are found by matching titles in its public sitemap (cached 30 days) and
//                      every download counts against one daily cap kept in a ledger file.
//   Wikimedia Commons  photos with a public-domain / CC0 / CC BY / CC BY-SA licence; the credit is kept.
import fs from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../config.js";

export const UA = "MMO-Video-Studio/1.0 (local video tool; asset downloader)";
export const CACHE = path.join(STORAGE_DIR, "tmp", "asset-cache");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (attempt === 5) throw new Error(`${url}: HTTP ${res.status}`);
    // Wikimedia answers 429 when requests come too fast: back off for longer each time.
    await sleep((res.status === 429 ? 15000 : 2000) * attempt);
  }
}

// ---- Wikimedia Commons ----

const FREE = /^(cc0|public domain|pd|cc by(-sa)? \d|cc by(-sa)?$|attribution)/i;
const strip = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// Searches Wikimedia Commons for large landscape photos with a free licence. Each result carries
// `text` (file title, categories and description) so a caller can check what the photo really shows.
export async function commonsSearch(query, want, { minWidth = 1600, minRatio = 1.3 } = {}) {
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
    if (!ii || ii.mime !== "image/jpeg" || ii.width < minWidth || ii.width / ii.height < minRatio || ii.width / ii.height > 2.4) continue;
    if (!FREE.test(license) || /nonfree|fair use/i.test(license)) continue;
    const artist = strip(meta.Artist?.value).slice(0, 80) || "Wikimedia Commons";
    const title = p.title.replace(/^File:/, "").replace(/\.[^.]+$/, "");
    const text = [title, strip(meta.Categories?.value), strip(meta.ImageDescription?.value).slice(0, 500), strip(meta.ObjectName?.value)].join(" | ");
    picked.push({ thumb: ii.thumburl, page: ii.descriptionurl, title, text, license, artist, w: ii.thumbwidth, h: ii.thumbheight });
    if (picked.length === want) break;
  }
  return picked;
}

// ---- Wikipedia ----

// Files on an article that are decoration rather than a photo of its subject.
const NOT_SUBJECT = /logo|icon|flag|coat[ _]of[ _]arms|seal[ _]of|symbol|signature|locator|location[ _]map|map[ _]of|blank[ _]map|wikiquote|wiktionary|commons-logo|question[ _]book|edit-clear|ambox|padlock|disambig|\.svg$/i;

// The photos used on the Wikipedia article about `subject` (found by search): they show exactly that
// subject, unlike a keyword search. English first, then Vietnamese for Vietnamese places and people.
// Same result shape as commonsSearch; only freely licensed files (non-free "fair use" files are skipped).
export async function wikipediaImages(subject, { want = 8, langs = ["en", "vi"], minWidth = 800 } = {}) {
  for (const lang of langs) {
    const api = `https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2`;
    const found = await fetchJson(`${api}&action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(subject)}`).catch(() => null);
    const page = found?.query?.search?.[0]?.title;
    if (!page) continue;
    const data = await fetchJson(
      `${api}&action=query&generator=images&gimlimit=50&titles=${encodeURIComponent(page)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600`,
    ).catch(() => null);
    const picked = [];
    for (const p of data?.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      const meta = ii?.extmetadata || {};
      const license = strip(meta.LicenseShortName?.value);
      if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || NOT_SUBJECT.test(p.title) || ii.width < minWidth || ii.width / ii.height < 0.75) continue;
      if (!FREE.test(license) || /nonfree|fair use/i.test(license)) continue;
      const title = p.title.replace(/^(File|Tập tin|Hình):/, "").replace(/\.[^.]+$/, "");
      picked.push({
        thumb: ii.thumburl,
        page: ii.descriptionurl,
        title,
        text: [page, title, strip(meta.ImageDescription?.value).slice(0, 300)].join(" | "),
        license,
        artist: strip(meta.Artist?.value).slice(0, 80) || "Wikimedia Commons",
        w: ii.thumbwidth,
        h: ii.thumbheight,
        article: `${lang}:${page}`,
      });
    }
    // Wider photos first: they fill a 16:9 scene best.
    picked.sort((a, b) => b.w / b.h - a.w / a.h);
    if (picked.length) return picked.slice(0, want);
  }
  return [];
}

// ---- PNGImages.com ----

const PNG_SITE = "https://pngimages.com";
const PNG_INDEX = path.join(CACHE, "pngimages-index.json");
const PNG_LEDGER = path.join(CACHE, "pngimages-downloads.json");
// Files already downloaded, by page slug, so the same PNG is never fetched (and counted) twice.
const PNG_FILES = path.join(CACHE, "pngimages-files");
export const PNG_SOURCE = { source: "PNGImages.com", license: "PNGImages free license (commercial use, no attribution)" };
// Words that mark a drawing, icon or decoration rather than a photo of the object.
const NOT_PHOTO = new Set("icon icons logo clipart clip art artwork painting engraving cartoon silhouette outline vector illustration drawing sketch doodle text frame template pattern background emoji symbol sign label sticker line set collection banner border watercolor watercolour anime character cute kawaii flat 3d abstract psychedelic themed design graphic ornament tattoo poster mandala".split(" "));
// Words image sites add to any title ("Zebra, HD Png Download"); they say nothing about the picture.
const FILLER = new Set("hd png download transparent image images free picture pic file high quality resolution".split(" "));

let indexCache = null;

// [{ t: title, f: file url, p: page url }] for every PNG listed in the sitemap.
export async function pngIndex({ onLog = console.log } = {}) {
  if (indexCache) return indexCache;
  const cached = await fs.stat(PNG_INDEX).catch(() => null);
  if (cached && Date.now() - cached.mtimeMs < 30 * 864e5) return (indexCache = JSON.parse(await fs.readFile(PNG_INDEX, "utf8")));
  onLog("Đọc sitemap PNGImages.com…");
  const index = await (await fetch(`${PNG_SITE}/sitemap_index.xml`, { headers: { "User-Agent": UA } })).text();
  const maps = [...index.matchAll(/<loc>([^<]*pngs-sitemap\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  const list = [];
  for (const url of maps) {
    const xml = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>\s*(?:<lastmod>[^<]*<\/lastmod>\s*)?<image:image><image:loc>([^<]+)<\/image:loc><image:title>([^<]*)<\/image:title>/g))
      list.push({ p: m[1], f: m[2], t: m[3].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') });
    await sleep(3000);
  }
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(PNG_INDEX, JSON.stringify(list));
  onLog(`  ${list.length} PNG trong sitemap`);
  return (indexCache = list);
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const stem = (w) => w.replace(/(es|s)$/, "");

// Best titles for a query: every query word present, fewest drawing words, then fewest extra words
// (extra = words beyond the query, site filler not counted). "png:<page slug>" picks one image exactly.
function pickTop(index, query, rejected, per) {
  if (query.startsWith("png:")) return [index.find((e) => e.p.endsWith(`/${query.slice(4)}.html`))].filter(Boolean);
  const want = words(query).map(stem);
  if (!want.length) return [];
  const hits = [];
  for (const e of index) {
    if (rejected.has(e.p)) continue;
    const tw = words(e.t);
    const ts = new Set(tw.map(stem));
    if (!want.every((w) => ts.has(w))) continue;
    const extra = tw.filter((w) => !FILLER.has(w)).length - want.length;
    const score = tw.filter((w) => NOT_PHOTO.has(w)).length * 10 + extra + (/realistic|photo/.test(e.t.toLowerCase()) ? -3 : 0);
    hits.push({ ...e, score, extra });
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, per);
}

// Candidates for one list entry: a query, or an array of queries / exact slugs tried in order;
// `per` best titles for each query.
export const pickPng = (index, entry, rejected = new Set(), { per = 1 } = {}) => [entry].flat().flatMap((q) => pickTop(index, q, rejected, per));

// Some files are served as JPEG despite the .png name; a HEAD request tells without spending a download.
export async function isPng(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } }).catch(() => null);
  return !!res?.ok && /image\/png/.test(res.headers.get("content-type") || "");
}

// Width and height from a PNG's IHDR chunk.
export const pngSize = (buf) => (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG" ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

// Downloads made today, shared by every caller: { used, cap, left(), add() }.
export async function pngQuota(cap = 40) {
  const ledger = await fs.readFile(PNG_LEDGER, "utf8").then(JSON.parse).catch(() => ({}));
  const today = new Date().toISOString().slice(0, 10);
  const quota = {
    used: ledger[today] || 0,
    cap,
    left: () => Math.max(0, cap - quota.used),
    async add() {
      ledger[today] = ++quota.used;
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(PNG_LEDGER, JSON.stringify(ledger));
    },
  };
  return quota;
}

// One PNG from the index → Buffer. A file downloaded before (by any project or the library) comes
// from the local cache and does not count against the daily cap. Throws when the cap is reached.
export async function downloadPng(hit, quota) {
  const cacheFile = path.join(PNG_FILES, `${path.basename(hit.p, ".html")}.png`);
  const cached = await fs.readFile(cacheFile).catch(() => null);
  if (cached) return cached;
  if (!quota.left()) throw Object.assign(new Error(`đã tải ${quota.used}/${quota.cap} ảnh PNGImages hôm nay`), { code: "quota" });
  const res = await fetch(hit.f, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await quota.add();
  if (!pngSize(buf)) throw new Error(`"${hit.t}" không phải PNG`);
  await fs.mkdir(PNG_FILES, { recursive: true });
  await fs.writeFile(cacheFile, buf);
  return buf;
}
