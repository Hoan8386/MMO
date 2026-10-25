// Latest articles for a topic, from the RSS feeds of reputable news sites listed in
// assets/news-sources.json, plus full-text extraction of one article and image download.
// Used by the "Lấy tin mới" button (routes/news.js) and scripts/fetch-news.js; needs no database.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR } from "./config.js";

const SOURCES_FILE = path.join(ASSETS_DIR, "news-sources.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MMO-Video-Studio/1.0 news reader";
const FEED_TIMEOUT_MS = 12_000;
const CACHE_MS = 10 * 60_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

// { topic_id: { keywords?: [], feeds: [{ name, url, keywords? }], foreign: [...] } }, re-read when the
// file changes. feeds are Vietnamese papers, foreign are international sites specialised in the topic.
let sources = null;
let sourcesMtime = 0;
export function newsSources() {
  const mtime = fs.statSync(SOURCES_FILE).mtimeMs;
  if (!sources || mtime !== sourcesMtime) {
    const { _comment, ...rest } = JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8"));
    sources = rest;
    sourcesMtime = mtime;
  }
  return sources;
}

export const REGIONS = ["vn", "intl"];

// Feeds of a topic, each tagged with its region; region "all" returns both groups.
export function topicFeeds(topicId, region = "all") {
  const t = newsSources()[topicId] || {};
  return [
    ...(region !== "intl" ? (t.feeds || []).map((f) => ({ ...f, region: "vn" })) : []),
    ...(region !== "vn" ? (t.foreign || []).map((f) => ({ ...f, region: "intl" })) : []),
  ];
}

// ---------------------------------------------------------------- text helpers

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", copy: "©", reg: "®", deg: "°", middot: "·", bull: "•" };
// Latin-1 accented letters, which some sites (Thanh Niên) write as named entities: &agrave; &Ocirc;…
const BASE = { A: { grave: 192, acute: 193, circ: 194, tilde: 195 }, E: { grave: 200, acute: 201, circ: 202 }, I: { grave: 204, acute: 205 }, O: { grave: 210, acute: 211, circ: 212, tilde: 213 }, U: { grave: 217, acute: 218 }, Y: { acute: 221 } };
for (const [l, accents] of Object.entries(BASE))
  for (const [accent, code] of Object.entries(accents)) {
    NAMED[`${l}${accent}`] = String.fromCodePoint(code);
    NAMED[`${l.toLowerCase()}${accent}`] = String.fromCodePoint(code + 32);
  }

export const decode = (s = "") =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n] ?? m);

const cdata = (s = "") => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const stripTags = (s = "") => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
const clean = (s = "") => decode(stripTags(cdata(s))).replace(/\s+/g, " ").trim();
const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];
const attr = (xml, name, a) => xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, "i"))?.[1];

// Whole-word match: Vietnamese letters fall outside \b, so "ăn" must not match inside "năm".
const hasWord = (text, word) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^\\p{L}]|$)`, "iu").test(text);

// ---------------------------------------------------------------- fetching

async function get(url, { timeout = FEED_TIMEOUT_MS } = {}) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// Only public http(s) addresses: the server fetches URLs that come from the browser.
function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Địa chỉ không hợp lệ");
  }
  const h = u.hostname;
  if (!/^https?:$/.test(u.protocol) || h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h) || !h.includes("."))
    throw new Error("Chỉ lấy được từ địa chỉ http(s) công khai");
  return u;
}

// RSS 2.0 <item> and Atom <entry> → { title, link, published, summary, image }.
export function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks
    .map((b) => {
      const body = cdata(tag(b, "description") || tag(b, "content:encoded") || tag(b, "dc:content") || tag(b, "summary") || tag(b, "content") || "");
      const link = clean(tag(b, "link") || "") || attr(b, "link", "href") || clean(tag(b, "guid") || "");
      const image =
        attr(b, "enclosure", "url") || attr(b, "media:content", "url") || attr(b, "media:thumbnail", "url") || body.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || null;
      const date = clean(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date") || "");
      const t = Date.parse(date);
      return {
        title: clean(tag(b, "title") || ""),
        link: decode(link),
        published: Number.isFinite(t) ? new Date(t).toISOString() : null,
        summary: clean(body).slice(0, 400),
        image: image ? decode(image) : null,
      };
    })
    .filter((a) => a.title && /^https?:/.test(a.link));
}

// og:image of a page, reading only up to the end of <head> (many foreign feeds carry no image).
async function pageImage(url) {
  try {
    const res = await get(url, { timeout: 8000 });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let head = "";
    while (head.length < 400_000 && !/<\/head>/i.test(head)) {
      const { done, value } = await reader.read();
      if (done) break;
      head += dec.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? decode(m[1]) : null;
  } catch {
    return null;
  }
}

const cache = new Map();

// Newest articles of a topic across its feeds. region: "vn" (Vietnamese papers), "intl" (foreign
// sites) or "all". Returns { feeds: [{ name, url, region, count, error }], articles }.
// Each article: { title, link, source, region, published, summary, image }.
export async function fetchTopicNews(topicId, { limit = 30, refresh = false, region = "all" } = {}) {
  const key = `${topicId}:${region}:${limit}`;
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const topic = newsSources()[topicId] || {};
  const feeds = await Promise.all(
    topicFeeds(topicId, region).map(async (f) => {
      const info = { name: f.name, url: f.url, region: f.region };
      try {
        const items = parseFeed(await (await get(f.url)).text());
        // The topic's keywords narrow broad Vietnamese sections; foreign feeds are already specialised.
        const words = f.keywords || (f.region === "vn" ? topic.keywords : null);
        const kept = words?.length ? items.filter((a) => words.some((w) => hasWord(`${a.title} ${a.summary}`, w))) : items;
        return { ...info, count: kept.length, error: null, items: kept.map((a) => ({ ...a, source: f.name, region: f.region })) };
      } catch (err) {
        return { ...info, count: 0, error: err.cause?.code || err.message, items: [] };
      }
    }),
  );
  const seen = new Set();
  const articles = feeds
    .flatMap((f) => f.items)
    .filter((a) => !seen.has(a.link) && seen.add(a.link))
    .sort((a, b) => (b.published || "").localeCompare(a.published || ""))
    .slice(0, limit);
  await Promise.all(articles.filter((a) => !a.image).map(async (a) => (a.image = await pageImage(a.link))));
  const data = { topic: topicId, fetched_at: new Date().toISOString(), feeds: feeds.map(({ items, ...f }) => f), articles };
  cache.set(key, { at: Date.now(), data });
  return data;
}

// Junk paragraphs news pages put next to the article body (membership, app and copyright notes).
const JUNK = /©|bản quyền|Tuổi Trẻ Sao|dấu tích xanh|đăng nhập|đăng ký nhận|tải ứng dụng|theo dõi .* trên|bình luận|chia sẻ bài viết|cookie|^Email:|Tài khoản bị khóa|Vui lòng|tổng biên tập|Giấy phép|Hotline|Tài khoản được|1 sao =|sign up|subscribe|newsletter|advertisement|all rights reserved|^read more|^related:/i;
// Markers of the boxes and page footer that follow the article: stop reading there.
const STOP = /Đã có lỗi xảy ra|sẽ g[ởửơ]i đến bạn|^Báo điện tử|^Địa chỉ:|Cơ quan chủ quản|^Tin liên quan|^Xem thêm:?$|^Related (articles|stories|content)|^More from |^You may also like|^Sign in to|Please enter your (username|email)|is part of .*(media|publish)|corporate site|\( ?READ MORE|subsidiary of|log ?(in|out) |display name|before commenting|Google News|ad-free/i;

// Title, lead, main image and body text of one article page.
export async function fetchArticle(url) {
  const u = assertPublicUrl(url);
  const html = await (await get(u.href, { timeout: 20_000 })).text();
  const meta = (p) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, "i"));
    return m ? decode(m[1]).trim() : "";
  };
  // The body starts at the article container when the page marks one; paragraphs before it are menus.
  const start = [/itemprop=["']articleBody["']/i, /<article\b/i, /<main\b/i].map((re) => html.search(re)).find((i) => i >= 0) ?? 0;
  const seen = new Set();
  const paragraphs = [];
  let size = 0;
  const footer = html.slice(start).search(/<footer/i);
  for (const m of html.slice(start, footer > 0 ? start + footer : undefined).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = clean(m[1]);
    // A marker before the body (a "follow us" bar at the top) only means skip that line.
    if (STOP.test(text) && size > 600) break;
    if (STOP.test(text)) continue;
    if (text.length < 40 || JUNK.test(text) || seen.has(text)) continue;
    seen.add(text);
    paragraphs.push(text);
    if ((size += text.length) > 9000) break;
  }
  return {
    url: u.href,
    title: meta("og:title") || clean(tag(html, "title") || ""),
    summary: meta("og:description") || meta("description"),
    image: meta("og:image") || null,
    site: meta("og:site_name") || u.hostname.replace(/^www\./, ""),
    text: paragraphs.join("\n\n"),
  };
}

// Saves an image into dir as <baseName>.<ext>; returns the file name. JPEG, PNG and WebP only.
export async function downloadImage(url, dir, baseName) {
  const u = assertPublicUrl(url);
  const res = await get(u.href, { timeout: 30_000 });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`Không phải ảnh JPEG/PNG/WebP (${type || "không rõ loại"})`);
  if (Number(res.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("Ảnh lớn hơn 15 MB");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Ảnh lớn hơn 15 MB");
  await fsp.mkdir(dir, { recursive: true });
  const name = `${baseName}${ext}`;
  await fsp.writeFile(path.join(dir, name), buf);
  return name;
}
