// Sends one tiny request to check the AI connection: npm run test:ai
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../src/config.js";

console.log(`AI mode: ${config.ai.mode} · model: ${config.ai.planModel} · base URL: ${process.env.ANTHROPIC_BASE_URL || "api.anthropic.com"}`);
if (config.ai.mode !== "claude") {
  console.log("Chưa có ANTHROPIC_API_KEY hoặc ANTHROPIC_AUTH_TOKEN trong server/.env — đang ở chế độ mock.");
  process.exit(1);
}
try {
  const res = await new Anthropic().messages.create({
    model: config.ai.planModel,
    max_tokens: 16,
    messages: [{ role: "user", content: "Trả lời đúng một từ: OK" }],
  });
  console.log(`OK — ${res.model} trả lời: ${res.content.find((b) => b.type === "text")?.text ?? ""}`);
} catch (err) {
  console.error(`Lỗi: ${err.status ? `HTTP ${err.status} — ` : ""}${err.message}`);
  process.exit(1);
}
