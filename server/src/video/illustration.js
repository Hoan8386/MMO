// Per-scene illustrations: a small SVG diagram the planner draws for each scene (a principle, a process, a
// comparison, a mechanism) and the motion layer animates — strokes drawing themselves, parts appearing
// step by step on the spoken keywords, then flows, spins and pulses while the scene holds. The model
// writes markup only; the animation code is ours, so it stays seek-safe and the same on every render.
// Colours come from classes mapped to the topic theme, so a drawing always matches the video.

export const MAX_SVG_CHARS = 6000;
const MAX_STEPS = 6;

// The prompt section (unlimited presets).
export const illustrationGuide = `
ILLUSTRATION FOR EVERY SCENE: in "illustration" draw one small animated diagram that makes the scene's idea visible — how something works (a principle, a mechanism, a cycle, a cause → effect), a process in steps, a comparison, a scale, a map-like layout, a timeline, a simple scene of what is described. It is shown beside the frame's content and animated for you. Use it most where no photo can show the idea.
- svg: one <svg viewBox="0 0 800 450"> … </svg>, at most ${MAX_SVG_CHARS} characters, with only path, line, polyline, polygon, circle, ellipse, rect, text and g. No script, style, image, foreignObject, links, filters or event attributes; no width/height on <svg>.
- Colours only through classes: s1 s2 s3 = stroke in accent / accent2 / ink colour; f1 f2 f3 f4 = fill in accent / accent2 / panel / ink colour. Unclassed shapes are drawn as accent outlines. Text: short (≤ 3 words), font-size 26–40; it is set in the video font.
- Animation: give parts data-step="1" … data-step="${MAX_STEPS}" in the order they should appear — step n appears when the scene's n-th keyword is spoken (or spread over the narration). Lines and outlines draw themselves; filled shapes and text pop in. Add class "flow" to a path or line that carries something (water, energy, money, data, movement) to make dashes run along it, "spin" to a part that turns (a gear, a planet, a cycle), "pulse" to a part that beats or glows.
- caption: 2–6 Vietnamese words naming what the drawing shows.
Keep shapes bold and simple (stroke-width 4–8, large forms): the drawing is seen small and quickly.`;

const ALLOWED = new Set(["svg", "g", "path", "line", "polyline", "polygon", "circle", "ellipse", "rect", "text", "tspan", "title"]);
const ALLOWED_ATTRS = /^(viewBox|d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points|transform|class|data-step|text-anchor|font-size|font-weight|stroke-width|stroke-dasharray|opacity|fill-rule|dominant-baseline|xmlns)$/;

// A model-written SVG reduced to the allowed elements and attributes, or "" when nothing usable is left.
// (Attribute values are kept as written, with quotes and angle brackets refused.)
export function sanitizeSvg(svg) {
  const text = String(svg || "").trim();
  if (!/^<svg[\s>]/i.test(text) || text.length > MAX_SVG_CHARS * 1.5) return "";
  let ok = true;
  const out = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*?)(\/?)\s*>/g, (_, close, name, attrs, self) => {
      const tag = name.toLowerCase();
      if (!ALLOWED.has(tag)) {
        if (["script", "style", "foreignobject", "image", "use", "a", "iframe"].includes(tag)) ok = false;
        return "";
      }
      if (close) return `</${tag}>`;
      const kept = [];
      for (const m of attrs.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const [key, value] = [m[1], m[3] ?? m[4]];
        if (ALLOWED_ATTRS.test(key) && !/[<>"]|url\s*\(|javascript:/i.test(value)) kept.push(`${key}="${value}"`);
      }
      return `<${tag}${kept.length ? ` ${kept.join(" ")}` : ""}${self ? " /" : ""}>`;
    });
  if (!ok) return "";
  // Sizing comes from the layer; a viewBox is required to scale.
  const svgTag = out.match(/^<svg[^>]*>/)?.[0] || "";
  if (!/viewBox=/.test(svgTag)) return "";
  return out.replace(/^<svg[^>]*>/, svgTag.replace(/\s(width|height)="[^"]*"/g, "")).replace(/<\/svg>[\s\S]*$/, "</svg>");
}

// The scene's illustration: { svg, caption } cleaned, or null.
export function cleanIllustration(v) {
  const svg = sanitizeSvg(v?.svg);
  return svg ? { svg, caption: String(v?.caption || "").trim().slice(0, 60) } : null;
}

// Motion-layer parts (fx.js) for one illustration. wide: 16:9 (drawing on the right) or other formats
// (drawing in the upper part). marks: the scene's keyword times, used for the steps.
export function illustrationLayer({ r, svg, caption, D, wide, marks = [] }) {
  const css = `
        ${r} .fx-illus { position: absolute; z-index: 1; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 10px; ${
          wide ? "right: 3.5%; top: 13%; width: 40%; height: 62%;" : "left: 7%; right: 7%; top: 7%; height: 33%;"
        } }
        ${r} .fx-illus svg { width: 100%; flex: 1; min-height: 0; overflow: visible; filter: drop-shadow(0 0 18px var(--glow)); }
        ${r} .fx-illus svg :is(path, line, polyline, polygon, circle, ellipse, rect) { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
        ${r} .fx-illus svg .s1 { stroke: var(--accent); } ${r} .fx-illus svg .s2 { stroke: var(--accent2); } ${r} .fx-illus svg .s3 { stroke: var(--ink); }
        ${r} .fx-illus svg .f1 { fill: var(--accent); } ${r} .fx-illus svg .f2 { fill: var(--accent2); } ${r} .fx-illus svg .f3 { fill: var(--panel); } ${r} .fx-illus svg .f4 { fill: var(--ink); }
        ${r} .fx-illus svg :is(.f1, .f2, .f3, .f4):not(.s1):not(.s2):not(.s3) { stroke: none; }
        ${r} .fx-illus svg text { fill: var(--ink); stroke: none; font-family: "Be Vietnam Pro", sans-serif; font-weight: 600; }
        ${r} .fx-illus svg * { transform-box: fill-box; transform-origin: center; }
        ${r} .fx-illus .cap { font: 600 30px "Be Vietnam Pro", sans-serif; color: var(--muted); letter-spacing: 0.02em; opacity: 0; }`;
  const html = `<div class="fx-illus">${svg}${caption ? `<div class="cap">${caption.replace(/[<>&]/g, "")}</div>` : ""}</div>`;
  const script = `
          // Illustration: parts appear step by step (on the keywords when there are some), strokes draw
          // themselves, then flows run, spins turn and pulses beat until the scene ends.
          (() => {
            const box = R.querySelector(".fx-illus");
            if (!box) return;
            const svg = box.querySelector("svg");
            const MARKS = ${JSON.stringify(marks.filter((m) => m != null))};
            const parts = [...svg.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect, text")];
            const stepOf = (el) => Math.min(${MAX_STEPS}, Number(el.closest("[data-step]")?.getAttribute("data-step")) || 1);
            const steps = Math.max(1, ...parts.map(stepOf));
            const span = Math.max(1, Math.min(D * 0.7, D - 1.2) - 0.5);
            const timeOf = (n) => (MARKS[n - 1] != null ? Math.max(0.3, MARKS[n - 1] - 0.1) : 0.5 + ((n - 1) * span) / steps);
            const order = new Map();
            parts.forEach((el) => {
              const n = stepOf(el);
              const k = order.get(n) || 0;
              order.set(n, k + 1);
              const at = Math.min(D - 0.8, timeOf(n) + k * 0.06);
              const filled = /\\bf[1-4]\\b/.test(el.getAttribute("class") || "") || el.tagName === "text";
              const len = !filled && typeof el.getTotalLength === "function" ? el.getTotalLength() : 0;
              if (len > 0) tl.fromTo(el, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: Math.min(1.2, 0.4 + len / 900), ease: "power2.inOut" }, at);
              else tl.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, at);
            });
            const cap = box.querySelector(".cap");
            if (cap) tl.fromTo(cap, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.6);
            // Repeats that fit before the exit (whole cycles only).
            const reps = (at, cycle) => Math.max(0, Math.floor((D - 0.5 - at) / cycle) - 1);
            svg.querySelectorAll(".flow").forEach((el) => {
              const at = timeOf(stepOf(el)) + 1;
              const n = reps(at, 1.2);
              if (n > 0) tl.fromTo(el, { strokeDasharray: "14 18", strokeDashoffset: 0 }, { strokeDashoffset: -64, duration: 1.2, ease: "none", repeat: n }, at);
            });
            svg.querySelectorAll(".spin").forEach((el, i) => {
              const at = timeOf(stepOf(el)) + 0.5;
              if (D - 0.5 - at > 1) tl.fromTo(el, { rotation: 0 }, { rotation: i % 2 ? -360 : 360, duration: Math.max(1, D - 0.5 - at), ease: "none" }, at);
            });
            svg.querySelectorAll(".pulse").forEach((el) => {
              const at = timeOf(stepOf(el)) + 0.6;
              const n = reps(at, 1.6);
              if (n > 0) tl.to(el, { scale: 1.12, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, at);
            });
            tl.to(box, { opacity: 0, duration: 0.35 }, D - 0.45);
          })();`;
  return { css, html, script };
}
