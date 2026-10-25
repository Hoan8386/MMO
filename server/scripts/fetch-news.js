// Fetches the latest articles of a topic from its news feeds (assets/news-sources.json),
// with each article's image, and saves them under storage/news/<topic>/.
//
//   node scripts/fetch-news.js <topic_id> [--limit 20] [--region vn|intl|all] [--images] [--full]
//   node scripts/fetch-news.js --all [--limit 10] [--images]
//   node scripts/fetch-news.js --list
//
//   --region  vn = Vietnamese papers, intl = foreign sites specialised in the topic, all (default)
//   --images  download each article's image to storage/news/<topic>/img/
//   --full    also read each article page for its full text and large (og:image) photo
//
// Output: storage/news/<topic>/<YYYY-MM-DD_HHmm>.json and latest.json. News photos belong to
// their publishers: credit the source and check the licence before using one in a video.
import fs from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../src/config.js";
import { newsSources, topicFeeds, fetchTopicNews, fetchArticle, downloadImage, REGIONS } from "../src/news.js";
import { slugify } from "../src/video/pipeline.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const limit = Number(opt("limit", 20));
const region = REGIONS.includes(opt("region")) ? opt("region") : "all";
const sources = newsSources();

if (flag("list")) {
  for (const id of Object.keys(sources)) {
    const names = (r) => topicFeeds(id, r).map((f) => f.name).join(", ") || "—";
    console.log(`${id}
  VN:        ${names("vn")}
  Nước ngoài: ${names("intl")}`);
  }
  process.exit(0);
}

const topics = flag("all") ? Object.keys(sources).filter((id) => topicFeeds(id, region).length) : args.filter((a) => !a.startsWith("--") && a !== opt("limit") && a !== opt("region"));
if (!topics.length) {
  console.error("Cách dùng: node scripts/fetch-news.js <topic_id> [--limit 20] [--images] [--full] | --all | --list");
  process.exit(1);
}

// Local time, e.g. 2026-10-23_1907.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

for (const topic of topics) {
  if (!topicFeeds(topic, region).length) {
    console.error(`! ${topic}: chưa gắn trang báo nào trong assets/news-sources.json`);
    continue;
  }
  const dir = path.join(STORAGE_DIR, "news", topic);
  const { feeds, articles } = await fetchTopicNews(topic, { limit, region, refresh: true });
  console.log(`\n# ${topic}: ${articles.length} bài`);
  for (const f of feeds) console.log(`  ${f.error ? "✗" : "✓"} [${f.region === "vn" ? "VN" : "QT"}] ${f.name}: ${f.error || `${f.count} bài`}`);

  for (const [i, a] of articles.entries()) {
    if (flag("full")) {
      try {
        const full = await fetchArticle(a.link);
        a.text = full.text;
        a.image = full.image || a.image;
      } catch (err) {
        a.error = err.cause?.code || err.message;
      }
    }
    if (flag("images") && a.image) {
      try {
        a.image_file = path.join("img", await downloadImage(a.image, path.join(dir, "img"), `${String(i + 1).padStart(2, "0")}-${slugify(a.title).slice(0, 50)}`)).replace(/\\/g, "/");
      } catch (err) {
        a.image_error = err.cause?.code || err.message;
      }
    }
    const when = a.published ? new Date(a.published).toLocaleString("vi-VN") : "?";
    console.log(`  ${String(i + 1).padStart(2)}. [${when}] ${a.source} — ${a.title}${a.image_file ? `  (ảnh: ${a.image_file})` : a.image ? "" : "  (không có ảnh)"}`);
  }

  await fs.mkdir(dir, { recursive: true });
  const out = JSON.stringify({ topic, region, fetched_at: new Date().toISOString(), feeds, articles }, null, 2);
  await fs.writeFile(path.join(dir, `${stamp}.json`), out);
  await fs.writeFile(path.join(dir, "latest.json"), out);
  console.log(`  → ${path.relative(process.cwd(), path.join(dir, `${stamp}.json`))}`);
}
