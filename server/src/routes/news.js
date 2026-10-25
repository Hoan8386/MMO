import { Router } from "express";
import { fetchTopicNews, fetchArticle, topicFeeds, REGIONS } from "../news.js";

// Latest articles of a topic from its news feeds (assets/news-sources.json), and one article's text.
// ?region=vn (Vietnamese papers) | intl (foreign sites) | all.
const router = Router();

router.get("/topics/:id", async (req, res) => {
  const region = REGIONS.includes(req.query.region) ? req.query.region : "all";
  if (!topicFeeds(req.params.id, region).length) return res.status(404).json({ error: "Chủ đề này chưa gắn trang báo nào (assets/news-sources.json)" });
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  res.json(await fetchTopicNews(req.params.id, { limit, region, refresh: req.query.refresh === "1" }));
});

router.get("/article", async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: "Thiếu url" });
  try {
    res.json(await fetchArticle(String(req.query.url)));
  } catch (err) {
    res.status(502).json({ error: `Không đọc được bài báo: ${err.cause?.code || err.message}` });
  }
});

export default router;
