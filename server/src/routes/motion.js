// Motion Canvas animation library (server/motion/) for the web UI: list, try, validate, approve.
import { Router } from "express";
import { loadTopics } from "../video/catalog.js";
import { layoutFor } from "../video/aspects.js";
import { listAnimations, getAnimation, validateAnimProps, searchAnimations, setAnimStatus, renderAnimTrial, animForTopic, animCatalog } from "../video/anim.js";

const router = Router();

// Every component with the topics whose videos may use it (the same filter the planner applies).
router.get("/", (_req, res) => {
  const topics = [...loadTopics().values()];
  const fits = new Map();
  for (const t of topics) for (const { component } of animForTopic(t, { status: ["dev", "tested", "ready"] })) (fits.get(component.id) || fits.set(component.id, []).get(component.id)).push(t.topic_id);
  res.json(listAnimations().map((c) => ({ ...c, topics: fits.get(c.id) || [], preview: (c.preview || []).map((p) => `/motion-${p}`) })));
});

// What the AI would receive for a video of this topic and material.
router.post("/match", (req, res) => {
  const topic = loadTopics({ all: true }).get(req.body.topic) || null;
  const text = String(req.body.text || "");
  const { ids } = animCatalog(text, topic);
  res.json({ ids, mentioned: searchAnimations(text).map((m) => ({ id: m.id, score: m.score, hits: m.hits })) });
});

router.post("/:id/validate", (req, res) => {
  if (!getAnimation(req.params.id)) return res.status(404).json({ error: "Không có component này" });
  res.json(validateAnimProps(req.params.id, req.body.props ?? {}));
});

// Renders a trial clip (takes 10–30 s; cached when nothing changed).
router.post("/:id/render", async (req, res) => {
  const c = getAnimation(req.params.id);
  if (!c) return res.status(404).json({ error: "Không có component này" });
  const { props, errors } = validateAnimProps(c.id, req.body.props ?? {});
  if (errors.length) return res.status(400).json({ error: errors.join("; "), errors });
  const duration = Math.min(60, Math.max(1, Number(req.body.duration) || c.duration.default));
  const L = layoutFor(req.body.aspect || "16:9");
  const topic = loadTopics({ all: true }).get(req.body.topic);
  try {
    const file = await renderAnimTrial({ component: c.id, props, duration, width: L.scene.w, height: L.scene.h, theme: topic?.theme, background: topic?.theme?.bg || "#0B1730" });
    res.json({ url: `/storage/${file}`, width: L.scene.w, height: L.scene.h });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id/status", (req, res) => {
  if (!getAnimation(req.params.id)) return res.status(404).json({ error: "Không có component này" });
  try {
    res.json(setAnimStatus(req.params.id, req.body.status));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
