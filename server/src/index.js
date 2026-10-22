import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { config, STORAGE_DIR, ROOT_DIR } from "./config.js";
import { initDb } from "./db.js";
import projectsRouter, { framesRouter, topicsRouter } from "./routes/projects.js";

fs.mkdirSync(STORAGE_DIR, { recursive: true });
await initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/storage", express.static(STORAGE_DIR));

app.get("/api/health", (_req, res) => res.json({ ok: true, ai: config.ai.mode, model: config.ai.planModel }));
app.use("/api/projects", projectsRouter);
app.use("/api/frames", framesRouter);
app.use("/api/topics", topicsRouter);

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
