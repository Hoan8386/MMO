import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { config, STORAGE_DIR, ROOT_DIR } from "./config.js";
import { initDb } from "./db.js";
import projectsRouter from "./routes/projects.js";
import { framesRouter, topicsRouter, libraryRouter, animationRouter } from "./routes/catalog.js";
import { seedTopics, refreshCatalog } from "./video/catalog.js";
import { syncAssetsToDb } from "./video/library.js";
import { loadSettings, activePreset } from "./settings.js";
import settingsRouter from "./routes/settings.js";
import newsRouter from "./routes/news.js";
import musicRouter from "./routes/music.js";
import longRouter from "./routes/long.js";

fs.mkdirSync(STORAGE_DIR, { recursive: true });
await initDb();
await seedTopics();
await syncAssetsToDb();
await refreshCatalog();
await loadSettings();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/storage", express.static(STORAGE_DIR));

app.get("/api/health", (_req, res) => {
  const p = activePreset();
  res.json({ ok: true, ai: config.ai.mode, model: p.model, billing: p.billing, preset: p.label });
});
app.use("/api/settings", settingsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/frames", framesRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/library", libraryRouter);
app.use("/api/animation", animationRouter);
app.use("/api/news", newsRouter);
app.use("/api/music", musicRouter);
app.use("/api/long", longRouter);

// Serve the built React app when it exists (npm run build in web/).
const webDist = path.join(ROOT_DIR, "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|storage).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`API: http://localhost:${config.port}  (AI mode: ${config.ai.mode})`);
});
