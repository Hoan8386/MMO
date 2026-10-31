// Inputs shared by the science components (shared/palettes.ts look(), shared/stage.tsx stage()).
// A meta.json lists the ones it supports in "common": ["palette", "speed", …]; the registry merges
// their specs into "inputs", so the validator, the AI prompt and the web form all see them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAL = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "shared", "palettes.json"), "utf8"));
export const THEMES = PAL.themes;
export const VISUALS = PAL.visuals;

export const COMMON_INPUTS = {
  palette: {
    type: "string",
    enum: ["auto", "theme", "astronomy", "mathematics", "biology", "physics", ...Object.keys(THEMES)],
    default: "auto",
    description: `bảng màu: auto = của lĩnh vực/topic, theme = màu chủ đề video, tên lĩnh vực, hoặc theme có tên (${Object.values(THEMES)
      .map((t) => `${t.id} = ${t.name}`)
      .join(", ")})`,
  },
  mode: { type: "string", enum: ["dark", "light"], default: "dark", description: "nền tối hay sáng (khi có backdrop)" },
  backdrop: { type: "string", enum: ["none", "panel", "full"], default: "none", description: "none = trong suốt trên nền video, panel = thẻ bo góc, full = nền gradient đầy khung" },
  visual: {
    type: "string",
    enum: Object.keys(VISUALS),
    default: "standard",
    description: `phong cách hình ảnh: ${Object.entries(VISUALS)
      .map(([id, v]) => `${id} = ${v.name}`)
      .join(", ")} (vignette/scanline chỉ hiện khi có backdrop)`,
  },
  quality: { type: "string", enum: ["low", "medium", "high"], default: "high", description: "chất lượng: low/medium giảm số hạt và độ phân giải để render nhanh" },
  seed: { type: "integer", min: 1, max: 9999, default: 1, description: "seed của bố cục ngẫu nhiên (cùng seed = cùng hình)" },
  speed: { type: "number", min: 0.25, max: 3, default: 1, description: "tốc độ chuyển động liên tục (quay, chảy, bay)" },
  scale: { type: "number", min: 0.6, max: 1.15, default: 1, description: "cỡ toàn cảnh" },
  easing: { type: "string", enum: ["smooth", "snappy", "bouncy", "elastic", "linear"], default: "smooth", description: "kiểu chuyển bước" },
  camera: { type: "string", enum: ["static", "push_in", "pull_out", "drift", "orbit"], default: "static", description: "chuyển động camera trong cả clip" },
};

// The full set a new science component declares: "common": "all" stands for these.
export const ALL_COMMON = Object.keys(COMMON_INPUTS);

// inputs of a meta with its "common" names merged (the component's own specs win).
export function withCommon(meta) {
  const names = meta.common === "all" ? ALL_COMMON : Array.isArray(meta.common) ? meta.common : [];
  const unknown = names.filter((n) => !COMMON_INPUTS[n]);
  return { inputs: { ...Object.fromEntries(names.filter((n) => COMMON_INPUTS[n]).map((n) => [n, COMMON_INPUTS[n]])), ...meta.inputs }, unknown };
}
