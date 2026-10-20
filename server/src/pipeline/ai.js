import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    paths: {
      type: "array",
      items: {
        type: "object",
        properties: {
          d: { type: "string" },
          stroke: { type: "string" },
          fill: { type: "string" },
        },
        required: ["d", "stroke", "fill"],
        additionalProperties: false,
      },
    },
  },
  required: ["paths"],
  additionalProperties: false,
};

const SYSTEM = `You illustrate narrated explainer videos. For each narration line you design ONE scene as SVG path data that a hand with a pencil will draw stroke by stroke, then color in.

Rules:
- Return only path data. Every element is a path with an absolute "d" attribute using M, L, H, V, C, Q, A and Z commands. No <text>; write any letters or numbers as short pen strokes.
- List paths in the order a person would draw them: big shapes first (heads, bodies, objects), then details (eyes, mouths, decorations), then motion lines and small accents last.
- Closed shapes that should be colored get a "fill" color from the palette; open lines use fill "none". Every path has a "stroke" color, normally the outline color.
- Draw inside the drawing area given below and leave the bottom band empty for subtitles. Keep the composition centered and balanced with generous white space.
- Use 10 to 45 paths. Prefer a clear visual metaphor for the line over literal illustration.`;

let client;

export async function drawScene({ type, text, prevText, nextText }) {
  if (config.ai.mode === "mock") return mockScene(type, text);
  client ??= new Anthropic();

  const area = drawingArea(type);
  const palette = JSON.parse(typeof type.palette === "string" ? type.palette : JSON.stringify(type.palette));
  const prompt = `Style: ${type.style_prompt}

Canvas: ${type.width}x${type.height}. Drawing area: x ${area.x0}–${area.x1}, y ${area.y0}–${area.y1}.
Outline color: ${type.stroke_color}. Background: ${type.background_color}. Fill palette: ${palette.join(", ")}.

Previous line (context only): ${prevText || "(none)"}
Line to illustrate: ${text}
Next line (context only): ${nextText || "(none)"}`;

  const body = {
    model: config.ai.model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: config.ai.effort, format: { type: "json_schema", schema: SCENE_SCHEMA } },
  };
  // The SDK reads ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN from the environment, so a gateway needs no code change.
  const response = config.ai.fallbacks
    ? await client.messages.create(
        { ...body, fallbacks: "default" },
        { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } },
      )
    : await client.messages.create(body);

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude từ chối vẽ cảnh này (${response.stop_details?.category ?? "không rõ lý do"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("Claude trả về bị cắt ngang (max_tokens)");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Claude không trả về nội dung");
  return sanitize(JSON.parse(textBlock.text).paths, type);
}

export function drawingArea(type) {
  const padX = Math.round(type.width * 0.08);
  return {
    x0: padX,
    x1: type.width - padX,
    y0: Math.round(type.height * 0.08),
    y1: Math.round(type.height * 0.76),
  };
}

const PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-eE]+$/;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|none|[a-zA-Z]{3,20})$/;

// Drops anything that is not plain path data so model output can never inject markup.
export function sanitize(paths, type) {
  return (paths || [])
    .filter((p) => typeof p.d === "string" && p.d.length < 6000 && PATH_RE.test(p.d))
    .map((p) => ({
      d: p.d.trim(),
      stroke: COLOR_RE.test(p.stroke) ? p.stroke : type.stroke_color,
      fill: COLOR_RE.test(p.fill) ? p.fill : "none",
    }))
    .slice(0, 80);
}

// Deterministic placeholder scene for running the pipeline without an API key:
// a stick figure plus a speech bubble, shifted per line so scenes differ.
function mockScene(type, text) {
  const area = drawingArea(type);
  const palette = typeof type.palette === "string" ? JSON.parse(type.palette) : type.palette;
  const seed = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const cx = Math.round(area.x0 + (area.x1 - area.x0) * (0.3 + (seed % 20) / 100));
  const top = area.y0 + 120;
  const s = type.stroke_color;
  const skin = palette[0] || "none";
  const accent = palette[(seed % (palette.length - 1)) + 1] || "none";
  const bx = cx + 160;
  return [
    { d: `M ${cx + 55} ${top} A 55 55 0 1 1 ${cx - 55} ${top} A 55 55 0 1 1 ${cx + 55} ${top}`, stroke: s, fill: skin },
    { d: `M ${cx - 20} ${top - 8} l 0 7`, stroke: s, fill: "none" },
    { d: `M ${cx + 20} ${top - 8} l 0 7`, stroke: s, fill: "none" },
    { d: `M ${cx - 22} ${top + 22} q 22 ${seed % 2 ? 18 : -14} 44 0`, stroke: s, fill: "none" },
    { d: `M ${cx} ${top + 55} L ${cx} ${top + 230}`, stroke: s, fill: "none" },
    { d: `M ${cx} ${top + 230} L ${cx - 45} ${top + 360}`, stroke: s, fill: "none" },
    { d: `M ${cx} ${top + 230} L ${cx + 45} ${top + 360}`, stroke: s, fill: "none" },
    { d: `M ${cx} ${top + 95} L ${cx - 55} ${top + 175}`, stroke: s, fill: "none" },
    { d: `M ${cx} ${top + 95} L ${cx + 80} ${top + 40}`, stroke: s, fill: "none" },
    { d: `M ${bx + 40} ${top - 100} L ${bx + 360} ${top - 100} Q ${bx + 400} ${top - 100} ${bx + 400} ${top - 60} L ${bx + 400} ${top + 90} Q ${bx + 400} ${top + 130} ${bx + 360} ${top + 130} L ${bx + 40} ${top + 130} Q ${bx} ${top + 130} ${bx} ${top + 90} L ${bx} ${top + 50} L ${bx - 50} ${top + 60} L ${bx} ${top + 20} L ${bx} ${top - 60} Q ${bx} ${top - 100} ${bx + 40} ${top - 100} Z`, stroke: s, fill: accent },
    { d: `M ${bx + 60} ${top - 30} L ${bx + 340} ${top - 30}`, stroke: s, fill: "none" },
    { d: `M ${bx + 60} ${top + 15} L ${bx + 300} ${top + 15}`, stroke: s, fill: "none" },
    { d: `M ${bx + 60} ${top + 60} L ${bx + 220} ${top + 60}`, stroke: s, fill: "none" },
    { d: `M ${cx - 160} ${top + 370} L ${cx + 160} ${top + 370}`, stroke: palette[4] || s, fill: "none" },
  ];
}
