// Draws one test scene to check the AI connection: npm run test:ai
import { config } from "../src/config.js";
import { drawScene } from "../src/pipeline/ai.js";

const type = {
  width: 1920,
  height: 1080,
  palette: ["#ffe0b8", "#e84a5f", "#f7c548"],
  stroke_color: "#141414",
  background_color: "#ffffff",
  style_prompt: "Whiteboard stick-figure style.",
};

console.log(`AI mode: ${config.ai.mode} · model: ${config.ai.model} · base URL: ${process.env.ANTHROPIC_BASE_URL || "api.anthropic.com"}`);
if (config.ai.mode !== "claude") {
  console.log("Chưa có ANTHROPIC_API_KEY hoặc ANTHROPIC_AUTH_TOKEN trong server/.env — đang ở chế độ mock.");
  process.exit(1);
}
try {
  const paths = await drawScene({ type, text: "Một người que vẫy tay chào." });
  console.log(`OK — Claude trả về ${paths.length} nét vẽ.`);
} catch (err) {
  console.error(`Lỗi: ${err.status ? `HTTP ${err.status} — ` : ""}${err.message}`);
  process.exit(1);
}
