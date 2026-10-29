// The diagram kinds a long-video scene can show, in the minimal black-and-white explainer style:
// thin white lines on black, one idea per scene. Each kind turns the AI's params into SVG for a
// 1920×1080 canvas and says how many reveal steps it has.
//
// Motion is declared in the markup and played by the scene runtime in build.js (GSAP):
//   data-step="n" [data-delay="s"]   enters at beat n (+ delay): rises, fades and settles
//   data-draw                        a stroke drawn on along its length (instead of fading)
//   data-m="x0 y0 x1 y1 s0 s1 spin bob osc"   a placed thing (place()): travels/scales from the
//       first state to the second over the scene's motion window — or back and forth every `osc`
//       seconds — while its galaxy arms spin `spin`°/s and it floats `bob` px on a slow sine
//   data-orbit="cx cy rx ry a0 speed"   circles an ellipse for the whole scene
//   data-tw="phase"                  twinkles
//   data-drift="dx period"           slides sideways in a loop (waves)
//   data-follow="x,y x,y …"         rides along these points while its curve is drawn
// `final` renders the end state of everything, for the editor's still previews; `render` leaves
// out what other layers draw in the video (background, headings, brand, footnote: see layers.js).
import { icon } from "./icons.js";
import { expandAiSvg, aiSteps } from "./aiscene.js";

export const W = 1920;
export const H = 1080;
const CX = 960;
const CY = 560;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r = (x) => Math.round(x * 10) / 10;
const LINE = 'fill="none" stroke="#e6e6e6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const THIN = 'fill="none" stroke="#5a5a5a" stroke-width="1.5"';
const label = (x, y, text, size = 26, fill = "#a8a8a8") =>
  text ? `<text x="${r(x)}" y="${r(y)}" text-anchor="middle" font-size="${size}" fill="${fill}">${esc(text)}</text>` : "";

// A label that wraps onto two lines when it is wider than `width` (≈ 0.55 em per character).
function wrapLabel(x, y, text, width, size = 24, fill = "#b8b8b8") {
  const s = String(text ?? "");
  if (!s || s.length * size * 0.55 <= width) return label(x, y, s, size, fill);
  const words = s.split(/\s+/);
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length;
    if (Math.max(a, b) < Math.max(words.slice(0, best).join(" ").length, words.slice(best).join(" ").length)) best = i;
  }
  const lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  const fit = Math.min(size, Math.floor(width / (0.55 * Math.max(...lines.map((l) => l.length)))));
  return `<text x="${r(x)}" y="${r(y - fit * 0.6)}" text-anchor="middle" font-size="${fit}" fill="${fill}">${lines.map((l, i) => `<tspan x="${r(x)}" dy="${i ? fit * 1.2 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
}

// A thing centred at (x, y), entering at `step`, optionally travelling to `to` and scaling s0 → s1
// (once over the motion window, or back and forth every `osc` s), spinning and floating.
function place(ctx, x, y, inner, { step = 0, delay = 0, to = [x, y], s = [1, 1], spin = 0, bob = 6, osc = 0 } = {}) {
  const [x1, y1] = to;
  const [tx, ty, ts] = ctx.final ? [x1, y1, s[1]] : [x, y, s[0]];
  const d = delay ? ` data-delay="${delay}"` : "";
  return `<g class="m" data-m="${r(x)} ${r(y)} ${r(x1)} ${r(y1)} ${s[0]} ${s[1]} ${spin} ${bob} ${osc}" transform="translate(${r(tx)} ${r(ty)}) scale(${ts})"><g data-step="${step}"${d}>${inner}</g></g>`;
}

const draw = (d, step, attrs = LINE, delay = 0, id = "") =>
  `<path${id ? ` id="${id}"` : ""} d="${d}" ${attrs} pathLength="1" data-draw data-step="${step}"${delay ? ` data-delay="${delay}"` : ""}/>`;
const at = (step, inner, delay = 0) => `<g data-step="${step}"${delay ? ` data-delay="${delay}"` : ""}>${inner}</g>`;

// A star-map grid drawn on line by line.
function grid(x0, y0, w, h, step = 0) {
  const out = [];
  for (let j = 0; j <= 5; j++) out.push(draw(`M${x0} ${r(y0 + (h * j) / 5)} H${x0 + w}`, step, `${THIN} opacity="0.55"`, j * 0.06));
  for (let i = 0; i <= 10; i++) out.push(draw(`M${r(x0 + (w * i) / 10)} ${y0} V${y0 + h}`, step, `${THIN} opacity="0.55"`, 0.3 + i * 0.04));
  return out.join("");
}

// Distance bar |——| with a label under it.
const ruler = (x, y, w, text, step) =>
  draw(`M${r(x - w / 2)} ${y} H${r(x + w / 2)}`, step, `${LINE} stroke-width="2"`) +
  at(step, `<path d="M${r(x - w / 2)} ${y - 10} V${y + 10} M${r(x + w / 2)} ${y - 10} V${y + 10}" ${LINE} stroke-width="2"/>${label(x, y + 40, text, 24)}`, 0.3);

const roundRect = (w, h, rad = 14) =>
  `M${-w / 2 + rad} ${-h / 2} H${w / 2 - rad} Q${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + rad} V${h / 2 - rad} Q${w / 2} ${h / 2} ${w / 2 - rad} ${h / 2} H${-w / 2 + rad} Q${-w / 2} ${h / 2} ${-w / 2} ${h / 2 - rad} V${-h / 2 + rad} Q${-w / 2} ${-h / 2} ${-w / 2 + rad} ${-h / 2}Z`;

// A rounded card whose outline draws on, then its icon and label come in.
const card = (ctx, x, y, w, h, inner, text, step) =>
  place(
    ctx,
    x,
    y,
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14" fill="#101010" opacity="0.9"/>${draw(roundRect(w, h), step, 'fill="none" stroke="#cfcfcf" stroke-width="2.5"')}${at(step, inner + wrapLabel(0, h / 2 - 30, text, w - 24, 24), 0.35)}`,
    { step, bob: 4 },
  );

const SPOTS = [[-520, -170], [-80, -210], [470, -160], [-30, 0], [-330, 150], [380, 140], [-600, 60], [600, -10]];

// Deterministic pseudo-random numbers (renders must not use Math.random).
const seeded = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

export const KINDS = {
  title: {
    about: "intro card: ringed-planet logo + big title (first scene)",
    params: "{ }",
    steps: 1,
    svg: (p, ctx) =>
      place(ctx, CX, 420, `${draw("M-150 0 A150 22 0 0 1 150 0", 0, `${LINE} stroke-width="6"`)}<circle r="74" fill="#000"/>${draw("M0 -74 A74 74 0 1 1 -0.1 -74", 0, `${LINE} stroke-width="10"`, 0.2)}${draw("M-150 0 A150 22 0 0 0 150 0", 0, `${LINE} stroke-width="6"`, 0.5)}`, { s: [0.85, 1], bob: 8 }) +
      (ctx.render ? "" : at(0, `<text x="${CX}" y="660" text-anchor="middle" font-size="64" fill="#fff">${esc(ctx.scene.heading)}</text>${label(CX, 720, ctx.brand, 26, "#bdbdbd")}`)),
  },
  galaxies: {
    about: "galaxies on a star-map grid; expand=true pushes them apart (cosmic expansion); label shows a growing distance bar",
    params: '{ "n": 3-8, "expand": bool, "label": "short text or empty" }',
    steps: 2,
    svg: (p, ctx) => {
      const n = Math.min(8, Math.max(3, Number(p.n) || 6));
      const k = p.expand ? 0.55 : 1;
      const g = SPOTS.slice(0, n).map(([dx, dy], i) => place(ctx, CX + dx * k, CY + dy * k, icon("galaxy"), { step: 0, delay: 0.5 + i * 0.12, to: [CX + dx, CY + dy], spin: i % 2 ? 24 : -24, s: [0.8, 1.05], bob: 5 }));
      const bar = p.label ? place(ctx, CX, CY + 290, ruler(0, 0, 420, p.label, 1), { s: p.expand ? [0.55, 1] : [1, 1], bob: 0 }) : "";
      return grid(CX - 680, CY - 250, 1360, 500) + g.join("") + bar;
    },
  },
  graph: {
    about: "axes with one curve drawn on: rise (slows down), accelerate (speeds up), linear, flat, wave, fall",
    params: '{ "curve": "rise|accelerate|linear|flat|wave|fall", "x": "x-axis label", "y": "y-axis label", "note": "label at the curve end or empty" }',
    steps: 2,
    svg: (p, ctx) => {
      const x0 = CX - 520, y0 = CY + 230, w = 1040, h = 440;
      // Each curve as cubic Béziers [p0, c1, c2, p1], so the path and the dot riding it (sampled
      // here, never measured in the page) come from the same numbers.
      const C = (...q) => q;
      const curves = {
        rise: [C([x0, y0], [x0 + 160, y0 - 300], [x0 + 520, y0 - 380], [x0 + w, y0 - 410])],
        accelerate: [C([x0, y0 - 20], [x0 + 500, y0 - 60], [x0 + 800, y0 - 140], [x0 + w, y0 - 420])],
        linear: [C([x0, y0], [x0 + w / 3, y0 - 400 / 3], [x0 + (2 * w) / 3, y0 - 800 / 3], [x0 + w, y0 - 400])],
        flat: [C([x0, y0 - 200], [x0 + w / 3, y0 - 200], [x0 + (2 * w) / 3, y0 - 200], [x0 + w, y0 - 200])],
        wave: [0, 1, 2, 3].map((i) => C([x0 + i * 260, y0 - 200], [x0 + i * 260 + 87, y0 - 200 - (i % 2 ? -150 : 150)], [x0 + i * 260 + 173, y0 - 200 - (i % 2 ? -150 : 150)], [x0 + (i + 1) * 260, y0 - 200])),
        fall: [C([x0, y0 - 410], [x0 + 260, y0 - 120], [x0 + 600, y0 - 40], [x0 + w, y0 - 20])],
      };
      const segs = curves[p.curve] || curves.rise;
      const d = `M${segs[0][0].join(" ")} ${segs.map((q) => `C${q.slice(1).map((pt) => pt.join(" ")).join(" ")}`).join(" ")}`;
      const bez = ([a, b, c, e], u) => [0, 1].map((k) => (1 - u) ** 3 * a[k] + 3 * (1 - u) ** 2 * u * b[k] + 3 * (1 - u) * u * u * c[k] + u ** 3 * e[k]);
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const v = (i / 120) * segs.length;
        const j = Math.min(segs.length - 1, Math.floor(v));
        pts.push(bez(segs[j], v - j).map(Math.round).join(","));
      }
      const end = segs.at(-1)[3];
      const dot = ctx.final ? `<circle cx="${end[0]}" cy="${end[1]}" r="9" fill="#fff"/>` : `<circle r="9" fill="#fff" data-follow="${pts.join(" ")}" data-step="1"/>`;
      return (
        draw(`M${x0} ${y0 - h} V${y0} H${x0 + w + 40}`, 0, `${LINE} stroke-width="2.5"`) +
        at(0, label(x0 + w / 2, y0 + 56, p.x, 24) + `<text x="${x0 - 24}" y="${y0 - h - 16}" font-size="24" fill="#a8a8a8">${esc(p.y || "")}</text>`, 0.6) +
        draw(d, 1, `${LINE} stroke-width="4"`) +
        dot +
        at(2, label(end[0] - 60, end[1] - 30, p.note, 24, "#dcdcdc"))
      );
    },
  },
  cards: {
    about: "2-4 rounded cards in a row, each an icon + label, revealed one by one; checks=true ticks each card at the end",
    params: '{ "items": [{ "icon": "<icon>", "label": "≤ 18 chars" }], "checks": bool }',
    steps: 5,
    svg: (p, ctx) => {
      const items = (p.items || []).slice(0, 4);
      const n = Math.max(1, items.length);
      const w = n > 3 ? 260 : 300, gap = w + 60;
      return items
        .map((it, i) => {
          const x = CX + (i - (n - 1) / 2) * gap;
          const c = card(ctx, x, CY - 20, w, 260, `<g transform="translate(0 -34) scale(0.9)">${icon(it.icon)}</g>`, it.label, i);
          return c + (p.checks ? place(ctx, x, CY + 180, draw("M-30 2 L-8 24 L32 -22", n, `${LINE} stroke-width="5"`, i * 0.2), { step: n, bob: 0, s: [0.6, 0.6] }) : "");
        })
        .join("");
    },
  },
  compare: {
    about: "two things side by side with ≠, =, → or vs between them",
    params: '{ "left": { "icon": "<icon>", "label": "text" }, "op": "≠|=|→|vs", "right": { "icon": "<icon>", "label": "text" } }',
    steps: 3,
    svg: (p, ctx) => {
      const side = (s, x, step) => place(ctx, x, CY - 20, `<g transform="scale(1.7)">${icon(s?.icon)}</g>${wrapLabel(0, 150, s?.label, 420, 28)}`, { step, s: [0.9, 1], spin: s?.icon === "galaxy" ? 20 : 0, bob: 8 });
      return side(p.left, CX - 400, 0) + place(ctx, CX, CY - 10, `<text y="34" text-anchor="middle" font-size="96" fill="#fff">${esc(p.op || "≠")}</text>`, { step: 1, s: [0.7, 1], bob: 0 }) + side(p.right, CX + 400, 2);
    },
  },
  mystery: {
    about: "two galaxies with an unknown between them: a ? circle, a wave or an empty box (something unseen acting across space)",
    params: '{ "middle": "question|wave|box", "label": "short text or empty" }',
    steps: 2,
    svg: (p, ctx) => {
      const mid = {
        wave: `<g clip-path="url(#${ctx.scene.id}-clip)"><path d="M-260 0 Q-227 -40 -195 0 T-130 0 T-65 0 T0 0 T65 0 T130 0 T195 0 T260 0" ${LINE} data-drift="130 2.4"/></g><clipPath id="${ctx.scene.id}-clip"><rect x="-130" y="-60" width="260" height="120"/></clipPath>${label(0, 80, "?", 44, "#fff")}`,
        box: `${draw(roundRect(220, 220, 16), 1, 'fill="none" stroke="#666" stroke-width="2"')}${label(0, 16, "?", 52, "#bbb")}`,
      }[p.middle] || `<circle r="90" fill="#0b0b0b"/>${draw("M0 -90 A90 90 0 1 1 -0.1 -90", 1, 'fill="none" stroke="#888" stroke-width="2.5"')}${label(0, 22, "?", 68, "#fff")}`;
      return (
        place(ctx, CX - 440, CY - 30, `<g transform="scale(1.5)">${icon("galaxy")}</g>`, { spin: -22, to: [CX - 470, CY - 40], bob: 8 }) +
        place(ctx, CX + 440, CY + 40, `<g transform="scale(1.5)">${icon("galaxy")}</g>`, { spin: 22, to: [CX + 470, CY + 50], bob: 8 }) +
        place(ctx, CX, CY, mid, { step: 1, s: [0.85, 1.05], bob: 5 }) +
        (p.label ? ruler(CX, CY + 220, 380, p.label, 2) : "")
      );
    },
  },
  gauge: {
    about: "a dial (speedometer) whose needle swings to value 0-1, with a label; good for 'an invisible accelerator', pressure, rate",
    params: '{ "value": 0-1, "label": "text", "aside": "<icon> shown beside or empty" }',
    steps: 2,
    svg: (p, ctx) => {
      const v = Math.min(1, Math.max(0, Number(p.value ?? 0.7)));
      const a0 = -Math.PI, a1 = -Math.PI + Math.PI * v;
      const needle = (a) => `<path d="M0 0 L${r(Math.cos(a) * 130)} ${r(Math.sin(a) * 130)}" ${LINE} stroke-width="5"/><circle r="10" fill="#fff"/>`;
      const x = p.aside ? CX - 220 : CX;
      const ticks = [...Array(9)].map((_, i) => { const a = -Math.PI + (i * Math.PI) / 8; return `M${r(x + Math.cos(a) * 150)} ${r(CY + 40 + Math.sin(a) * 150)} L${r(x + Math.cos(a) * 168)} ${r(CY + 40 + Math.sin(a) * 168)}`; }).join(" ");
      return (
        draw(`M${x - 170} ${CY + 40} A170 170 0 0 1 ${x + 170} ${CY + 40}`, 0) +
        draw(ticks, 0, `${THIN} stroke="#888"`, 0.4) +
        `<g transform="translate(${x} ${CY + 40})">${ctx.final ? needle(a1) : `<g class="needle" data-a0="${a0}" data-a1="${a1}">${needle(a0)}</g>`}</g>` +
        at(0, label(x, CY + 120, p.label, 26), 0.6) +
        (p.aside ? place(ctx, CX + 260, CY, `<g transform="scale(1.4)">${icon(p.aside)}</g>`, { step: 2, s: [0.7, 1] }) : "")
      );
    },
  },
  box: {
    about: "a 3D wireframe box (a region of space) filled with dots, waves (vacuum energy), a grid of evenly spaced dots, or empty; grow=true makes the box expand",
    params: '{ "fill": "dots|waves|even|empty", "label": "text or empty", "grow": bool }',
    steps: 2,
    svg: (p, ctx) => {
      const w = 420, h = 260, d = 60;
      const shell = `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="#101010"/>${draw(`M${-w / 2} ${-h / 2} l${d} ${-d} h${w} v${h} l${-d} ${d} M${w / 2} ${-h / 2} l${d} ${-d}`, 0, `${THIN} stroke="#8a8a8a"`, 0.4)}${draw(`M${-w / 2} ${-h / 2} H${w / 2} V${h / 2} H${-w / 2} Z`, 0, 'fill="none" stroke="#cfcfcf" stroke-width="2"')}`;
      const clip = `${ctx.scene.id}-box`;
      let fill = "";
      if (p.fill === "waves") fill = `<clipPath id="${clip}"><rect x="${-w / 2 + 6}" y="${-h / 2 + 6}" width="${w - 12}" height="${h - 12}"/></clipPath><g clip-path="url(#${clip})">${[0, 1, 2, 3, 4].map((i) => `<path d="M${-w / 2 - 100} ${-80 + i * 40} q25 -16 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" fill="none" stroke="#ddd" stroke-width="2.5" data-drift="100 ${2 + i * 0.35}"/>`).join("")}</g>`;
      else if (p.fill === "even") fill = [...Array(5)].flatMap((_, rw) => [...Array(7)].map((_, c) => `<circle cx="${-150 + c * 50}" cy="${-90 + rw * 45}" r="4" fill="#ddd" data-tw="${(rw * 7 + c) * 0.37}"/>`)).join("");
      else if (p.fill === "dots") fill = [[-150, -80], [-90, -20], [-40, 60], [10, -60], [60, 20], [120, -90], [150, 70], [-130, 80], [90, 90], [-10, 10], [40, -100], [-60, -100]].map(([x, y], i) => place(ctx, x * 0.8, y * 0.8, `<circle r="5" fill="#eee"/>`, { to: [x, y], step: 1, delay: i * 0.05, bob: 3 })).join("");
      return place(ctx, CX, CY, shell + at(1, fill), { s: p.grow ? [0.75, 1.15] : [0.96, 1.02], bob: 4 }) + (p.label ? at(2, label(CX, CY + 250, p.label, 26)) : "");
    },
  },
  burst: {
    about: "dots spreading out evenly from everywhere inside a frame (Big Bang is not an explosion from one point)",
    params: '{ "label": "text or empty" }',
    steps: 1,
    svg: (p, ctx) => {
      const dots = [...Array(12)].map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return place(ctx, CX + Math.cos(a) * 34, CY + Math.sin(a) * 34, `<circle r="7" fill="#d8d8d8"/>`, { to: [CX + Math.cos(a) * 300, CY + Math.sin(a) * 190], osc: 4.5, bob: 0, step: 0, delay: 0.4 + i * 0.03 });
      });
      return `<rect x="${CX - 460}" y="${CY - 260}" width="920" height="520" rx="12" fill="#0e0e0e" opacity="0.9"/>` + draw(`M${CX - 448} ${CY - 260} H${CX + 448} Q${CX + 460} ${CY - 260} ${CX + 460} ${CY - 248} V${CY + 248} Q${CX + 460} ${CY + 260} ${CX + 448} ${CY + 260} H${CX - 448} Q${CX - 460} ${CY + 260} ${CX - 460} ${CY + 248} V${CY - 248} Q${CX - 460} ${CY - 260} ${CX - 448} ${CY - 260}Z`, 0, 'fill="none" stroke="#bdbdbd" stroke-width="2"') + dots.join("") + `<circle cx="${CX}" cy="${CY}" r="24" fill="none" stroke="#ddd" stroke-width="2"/><path d="M${CX - 16} ${CY + 16} L${CX + 16} ${CY - 16}" stroke="#ddd" stroke-width="2"/>` + at(1, label(CX, CY + 320, p.label, 26));
    },
  },
  timeline: {
    about: "a horizontal time axis with 2-4 labelled markers (each with an icon above) and a dot travelling along it; e.g. looking far = looking into the past",
    params: '{ "items": [{ "icon": "<icon>", "label": "≤ 20 chars" }] }',
    steps: 4,
    svg: (p, ctx) => {
      const items = (p.items || []).slice(0, 4);
      const n = Math.max(1, items.length);
      const x0 = CX - 640, x1 = CX + 640, y = CY + 160;
      const marks = items.map((it, i) => {
        const x = x0 + 120 + (i * (x1 - x0 - 240)) / Math.max(1, n - 1);
        return draw(`M${r(x)} ${y} V${y - 150}`, i, `${THIN} stroke="#999"`) + at(i, wrapLabel(x, y + 50, it.label, 340, 26), 0.2) + place(ctx, x, y - 230, `<g transform="scale(1.2)">${icon(it.icon || "galaxy")}</g>`, { step: i, delay: 0.3, s: [0.7, 1], spin: it.icon === "galaxy" || !it.icon ? 20 : 0 });
      });
      return draw(`M${x0} ${y} H${x1}`, 0) + at(0, `<path d="M${x1 - 14} ${y - 8} L${x1} ${y} L${x1 - 14} ${y + 8}" ${LINE}/>`, 0.8) + marks.join("") + place(ctx, x0 + 60, y - 40, `<circle r="9" fill="#fff"/><circle r="22" fill="url(#lv-glow)" opacity="0.6"/>`, { to: [x1 - 80, y - 40], bob: 0 });
    },
  },
  rope: {
    about: "an elastic band with evenly spaced beads that stretches: every gap grows, the more beads apart the bigger the growth",
    params: '{ "label": "text or empty" }',
    steps: 1,
    svg: (p, ctx) => {
      const n = 7;
      const beads = [...Array(n)].map((_, i) => {
        const k = i - (n - 1) / 2;
        return place(ctx, CX + k * 90, CY, `<circle r="${i === 3 ? 11 : 8}" fill="${i === 3 ? "#fff" : "#bbb"}"/>`, { to: [CX + k * 150, CY], osc: 5, bob: 0, delay: 0.2 + i * 0.06 });
      });
      const spans = ctx.final ? "" : place(ctx, CX + 45, CY - 60, `<path d="M-45 0 H45 M-45 -8 V8 M45 -8 V8" ${LINE} stroke-width="2"/>${label(0, -18, "1 đoạn", 20)}`, { to: [CX + 75, CY - 60], s: [1, 1.66], osc: 5, bob: 0, step: 1 });
      return place(ctx, CX, CY, `<path d="M-330 0 H330" stroke="#888" stroke-width="5" stroke-linecap="round"/>`, { s: [1, 1.66], osc: 5, bob: 0 }) + spans + beads.join("") + at(1, label(CX, CY + 110, p.label, 26));
    },
  },
  orbit: {
    about: "a big tilted galaxy with stars orbiting it (gravity, dark matter holding structures together)",
    params: '{ "label": "text or empty" }',
    steps: 1,
    svg: (p, ctx) => {
      const rings = [140, 220, 300].map((rx, i) => draw(`M${CX - rx} ${CY} A${rx} ${rx * 0.45} 0 1 1 ${CX + rx} ${CY} A${rx} ${rx * 0.45} 0 1 1 ${CX - rx} ${CY}`, 0, `${THIN} stroke="#444"`, i * 0.2)).join("");
      const stars = [[140, 0.3, 0.9], [220, 2.2, 0.6], [300, 4.1, 0.42], [300, 1.2, 0.42], [220, 5.4, 0.6]].map(([rx, a, sp], i) =>
        ctx.final ? `<circle cx="${r(CX + Math.cos(a) * rx)}" cy="${r(CY + Math.sin(a) * rx * 0.45)}" r="6" fill="#ddd"/>` : `<circle r="6" fill="#ddd" data-orbit="${CX} ${CY} ${rx} ${r(rx * 0.45)} ${a} ${sp}" data-step="${i ? 1 : 0}"/>`,
      );
      return rings + place(ctx, CX, CY, `<g transform="scale(2.6)">${icon("galaxy")}</g>`, { spin: 30, s: [0.85, 1], bob: 0 }) + stars.join("") + at(1, label(CX, CY + 230, p.label, 26));
    },
  },
  field: {
    about: "a dark sky scattered with many faint stars/galaxies (surveys, maps of millions of galaxies); split=true adds a scanning line",
    params: '{ "split": bool, "label": "text or empty" }',
    steps: 1,
    svg: (p, ctx) => {
      const rnd = seeded(7);
      const pts = [...Array(110)].map((_, i) => `<circle cx="${r(CX - 640 + rnd() * 1280)}" cy="${r(CY - 250 + rnd() * 500)}" r="${r(1.5 + rnd() * 2.5)}" fill="#ddd" data-tw="${r(rnd() * 6.28)}"/>`);
      const line = p.split ? place(ctx, CX - 560, CY, `<path d="M0 -260 V260" stroke="#fff" stroke-width="2"/><rect x="-60" y="-260" width="60" height="520" fill="url(#lv-scan)"/>`, { to: [CX + 560, CY], bob: 0 }) : "";
      return at(0, pts.slice(0, 55).join(""), 0.3) + at(1, pts.slice(55).join("")) + line + label(CX, CY + 320, p.label, 26);
    },
  },
  icons: {
    about: "a row of 1-3 large icons with labels revealed one by one (methods, examples, ingredients)",
    params: '{ "items": [{ "icon": "<icon>", "label": "≤ 22 chars" }] }',
    steps: 3,
    svg: (p, ctx) => {
      const items = (p.items || []).slice(0, 3);
      const n = Math.max(1, items.length);
      return items.map((it, i) => place(ctx, CX + (i - (n - 1) / 2) * 460, CY - 20, `<g transform="scale(1.8)">${icon(it.icon)}</g>${wrapLabel(0, 150, it.label, 400, 28)}`, { step: i, s: [0.8, 1.04], spin: it.icon === "galaxy" ? 20 : 0, bob: 8 })).join("");
    },
  },
  statement: {
    about: "one short sentence in large type, for a key takeaway or a turning point",
    params: '{ "text": "≤ 60 chars" }',
    steps: 1,
    svg: (p, ctx) => {
      const words = String(p.text || "").split(/\s+/).filter(Boolean);
      const tspans = words.map((w, i) => `<tspan data-word="${i}">${esc(w)}${i < words.length - 1 ? " " : ""}</tspan>`).join("");
      return place(ctx, CX, CY, `<text y="20" text-anchor="middle" font-size="58" fill="#f2f2f2">${ctx.final ? esc(words.join(" ")) : tspans}</text>`, { s: [0.97, 1.03], bob: 0 }) + draw(`M${CX - 220} ${CY + 70} H${CX + 220}`, 1, `${LINE} stroke-width="2"`);
    },
  },
};

export const KIND_NAMES = Object.keys(KINDS);

// The whole scene as one SVG: heading, subheading, brand, the diagram and its footnote.
// Unknown kinds fall back to a statement of the heading, so one bad scene never breaks a video.
export function sceneSvg(scene, { brand = "", final = false, render = false } = {}) {
  const kind = KINDS[scene.kind] ? scene.kind : "statement";
  const params = KINDS[scene.kind] ? scene.params || {} : { text: scene.heading };
  const ctx = { final, render, brand, scene };
  // A scene the AI drew itself; library kinds remain for older plans and for a missing drawing.
  const drawn = scene.svg
    ? expandAiSvg(scene.svg, { id: scene.id, final }) +
      (kind === "title" && !render ? `<text x="${CX}" y="660" text-anchor="middle" font-size="64" fill="#fff">${esc(scene.heading)}</text>${label(CX, 720, brand, 26, "#bdbdbd")}` : "")
    : KINDS[kind].svg(params, ctx);
  const head =
    kind === "title" || render
      ? ""
      : `<g class="hd"><text x="${CX}" y="128" text-anchor="middle" font-size="40" fill="#fff" letter-spacing="1.5">${esc(String(scene.heading || "").toLocaleUpperCase("vi"))}</text>${label(CX, 178, scene.sub, 24, "#8f8f8f")}</g>`;
  const corner = brand && kind !== "title" && !render ? `<text x="1860" y="70" text-anchor="end" font-size="24" fill="#fff">${esc(brand)}</text>` : "";
  const foot = scene.note && !render ? `<g class="ft">${label(CX, 1010, scene.note, 22, "#6f6f6f")}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-weight="600">
<defs><radialGradient id="lv-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><linearGradient id="lv-scan"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.18"/></linearGradient></defs>
${render ? "" : `<rect width="${W}" height="${H}" fill="#000"/>`}${head}${corner}<g class="vis">${drawn}</g>${foot}</svg>`;
}

export const stepsOf = (scene) => (scene.svg ? aiSteps(expandAiSvg(scene.svg, { id: scene.id })) : (KINDS[scene.kind] || KINDS.statement).steps);
