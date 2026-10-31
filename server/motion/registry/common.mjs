// Inputs shared by the science components (shared/palettes.ts look(), shared/stage.tsx stage()).
// A meta.json lists the ones it supports in "common": ["palette", "speed", …]; the registry merges
// their specs into "inputs", so the validator, the AI prompt and the web form all see them.
export const COMMON_INPUTS = {
  palette: {
    type: "string",
    enum: ["auto", "theme", "astronomy", "mathematics", "biology", "physics"],
    default: "auto",
    description: "bảng màu: auto = của lĩnh vực/topic, theme = màu chủ đề video, hoặc bảng của lĩnh vực khác",
  },
  mode: { type: "string", enum: ["dark", "light"], default: "dark", description: "nền tối hay sáng (khi có backdrop)" },
  backdrop: { type: "string", enum: ["none", "panel", "full"], default: "none", description: "none = trong suốt trên nền video, panel = thẻ bo góc, full = nền gradient đầy khung" },
  speed: { type: "number", min: 0.25, max: 3, default: 1, description: "tốc độ chuyển động liên tục (quay, chảy, bay)" },
  scale: { type: "number", min: 0.6, max: 1.15, default: 1, description: "cỡ toàn cảnh" },
  easing: { type: "string", enum: ["smooth", "snappy", "bouncy", "elastic", "linear"], default: "smooth", description: "kiểu chuyển bước" },
  camera: { type: "string", enum: ["static", "push_in", "pull_out", "drift", "orbit"], default: "static", description: "chuyển động camera trong cả clip" },
};

// inputs of a meta with its "common" names merged (the component's own specs win).
export function withCommon(meta) {
  const names = Array.isArray(meta.common) ? meta.common : [];
  const unknown = names.filter((n) => !COMMON_INPUTS[n]);
  return { inputs: { ...Object.fromEntries(names.filter((n) => COMMON_INPUTS[n]).map((n) => [n, COMMON_INPUTS[n]])), ...meta.inputs }, unknown };
}
