import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db.js";
import { getSettings, saveSettings, activePreset, EFFORTS } from "../settings.js";

const router = Router();

// Settings plus usage per model, so the page shows what each preset has cost so far.
router.get("/", async (_req, res) => {
  const usage = await query(
    `SELECT model, billing, COUNT(*) AS calls, COUNT(DISTINCT project_id) AS projects,
       COALESCE(SUM(input_tokens + cache_read_input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens, MAX(created_at) AS last_used
     FROM ai_calls GROUP BY model, billing ORDER BY last_used DESC`,
  );
  res.json({ settings: getSettings(), efforts: EFFORTS, gateway: process.env.ANTHROPIC_BASE_URL ? new URL(process.env.ANTHROPIC_BASE_URL).host : "api.anthropic.com", usage });
});

router.put("/", async (req, res) => {
  const s = req.body || {};
  if (!Array.isArray(s.presets) || !s.presets.length) return res.status(400).json({ error: "Cần ít nhất một cấu hình model" });
  for (const p of s.presets) {
    if (!p.id || !String(p.model || "").trim()) return res.status(400).json({ error: "Mỗi cấu hình cần mã và tên model" });
  }
  res.json(await saveSettings(s));
});

// Model ids the gateway offers (for the suggestions list).
router.get("/models", async (_req, res) => {
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const headers = { "anthropic-version": "2023-06-01" };
  if (process.env.ANTHROPIC_AUTH_TOKEN) headers.authorization = `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`;
  if (process.env.ANTHROPIC_API_KEY) headers["x-api-key"] = process.env.ANTHROPIC_API_KEY;
  try {
    const r = await fetch(new URL("/v1/models?limit=1000", base), { headers });
    const j = await r.json();
    res.json((j.data || []).map((m) => m.id));
  } catch (err) {
    res.status(502).json({ error: `Không lấy được danh sách model: ${err.message}` });
  }
});

// One tiny request with a preset (saved or as edited on the page) to check that it answers.
router.post("/test", async (req, res) => {
  const preset = req.body?.model ? req.body : activePreset(req.body?.id);
  const t = Date.now();
  try {
    const client = new Anthropic({ maxRetries: 1 });
    const r = await client.messages.create({
      model: preset.model,
      max_tokens: 64,
      output_config: { effort: preset.effort || "low" },
      messages: [{ role: "user", content: "Trả lời đúng một từ: OK" }],
    });
    res.json({ ok: true, ms: Date.now() - t, model: r.model, text: r.content.find((b) => b.type === "text")?.text ?? "", usage: r.usage });
  } catch (err) {
    res.json({ ok: false, ms: Date.now() - t, error: `${err.status ? `HTTP ${err.status} — ` : ""}${err.message}` });
  }
});

export default router;
