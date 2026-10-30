// Turns a long-video plan into a HyperFrames project and an MP4. A scene is one of:
//   drawn (kind "ai"/"title"/library kinds) — the AI's SVG, played by the RUNTIME below;
//   "frame" — a HyperFrames frame template of server/frames/, filled with the AI's inputs and
//             coloured by LONG_THEME (CSS custom properties on the page);
//   "anim"  — a Motion Canvas clip (server/motion/), rendered at the scene's exact length with alpha
//             and played by a <video> over the starfield.
// A frame or animation scene may also carry the AI's drawing (sc.svg): it plays as an overlay
// composition above the scene (labels, arrows, highlights on the beats), without the camera move so
// it stays registered with what is under it.
// Voice: the shared TTS (video/tts.js), reused per line by hash. Timing: each scene lasts its
// narration and overlaps the next by OVERLAP seconds, so scenes cross-fade. Inside a scene each
// diagram step (data-step) starts at its spoken keyword, and everything keeps moving between
// steps (spinning galaxies, orbits, floating, looping stretches, a slow camera push) on one
// seek-safe GSAP timeline. Around the scenes, layers.js adds a Three.js starfield, Anime.js titles
// and a CSS grain, all rendered together by HyperFrames.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { ASSETS_DIR } from "../config.js";
import { voiceScenes, DEFAULT_VOICE } from "../video/tts.js";
import { keywordTimes, LEAD } from "../video/timeline.js";
import { renderProject } from "../video/render.js";
import { scriptJson, fill } from "../video/template.js";
import { templatePath } from "../video/catalog.js";
import { renderAnimClips, getAnimation, parseAnimInputs } from "../video/anim.js";
import { LONG_THEME } from "./library.js";
import { sceneSvg, stepsOf, W, H } from "./visuals.js";
import { spaceLayer, titlesLayer, grainLayer } from "./layers.js";

const FONT = "BeVietnamPro-SemiBold.ttf";
const OVERLAP = 0.5; // cross-fade between scenes
const TAIL = 0.8; // after the voice; minus the overlap, the pause between two lines is ~0.45 s
const r3 = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Scene-local times: beats[n] is when step n appears; move is the window of one-way motion.
function sceneTiming(sc, audio) {
  const D = r3(Math.max(3.5, LEAD + audio.duration + TAIL));
  const steps = stepsOf(sc);
  const spoken = keywordTimes(sc.beats, audio.words);
  const beats = [0.3];
  for (let i = 1; i <= steps; i++) beats.push(spoken[i - 1] ?? r3(LEAD + (audio.duration * i) / (steps + 1)));
  for (let i = 1; i < beats.length; i++) beats[i] = r3(Math.min(D - 1, Math.max(beats[i], beats[i - 1] + 0.4)));
  const m0 = Math.min(beats[1] ?? LEAD, 2.5);
  return { D, beats, move: [m0, r3(Math.max(m0 + 2, D - 0.6))] };
}

export function buildTimeline(plan, vo) {
  let t = 0;
  const scenes = plan.scenes.map((sc, i) => {
    const audio = vo[sc.id];
    const timing = sceneTiming(sc, audio);
    const start = r3(t);
    t = start + timing.D - (i < plan.scenes.length - 1 ? OVERLAP : 0);
    // marks/voEnd: when each keyword is spoken and when the voice ends (frames and clips use them).
    // An animation scene keeps its component props under props.anim (props now holds timing).
    const props = { ...timing, vo: LEAD, voEnd: r3(LEAD + audio.duration), marks: keywordTimes(sc.beats, audio.words), first: i === 0, ...(sc.kind === "anim" ? { anim: sc.props } : {}) };
    return { ...sc, start, duration: timing.D, audio: { start: r3(start + LEAD), duration: r3(audio.duration) }, props };
  });
  return { scenes, total: r3(t) };
}

// The per-scene player. Steps rise and fade (or draw) in at their beats; a single clock tween
// repaints everything that moves continuously, as a pure function of scene time.
const RUNTIME = `
  const tl = gsap.timeline({ paused: true });
  const clamp = (k) => Math.min(1, Math.max(0, k));
  const interpolate = (t, [a, b], [c, d]) => c + (d - c) * clamp((t - a) / Math.max(0.001, b - a));
  const smooth = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const beat = (n) => P.beats[Math.min(n, P.beats.length - 1)];
  const svg = R.querySelector("svg");
  const vis = R.querySelector(".vis");
  // Cross-fade in and out (the next scene starts while this one fades), with a gentle camera.
  if (!P.first) tl.fromTo(R, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 0);
  if (!P.overlay) tl.fromTo(svg, { scale: 0.965, transformOrigin: "50% 52%" }, { scale: 1, duration: 1.2, ease: "power3.out" }, 0);
  tl.to(R, { opacity: 0, duration: 0.5, ease: "power1.inOut" }, P.D - 0.52);
  if (!P.overlay) tl.to(svg, { scale: 1.025, duration: 0.6, ease: "power2.in" }, P.D - 0.6);
  R.querySelectorAll("[data-step]").forEach((el) => {
    const at = beat(Number(el.dataset.step)) + Number(el.dataset.delay || 0);
    if (el.hasAttribute("data-draw")) tl.fromTo(el, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut" }, at);
    // A moving element's transform belongs to paint(), which also pops it in; others rise in.
    else if (el.classList.contains("m")) tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, at);
    else tl.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.8, ease: "back.out(1.6)" }, at);
  });
  R.querySelectorAll("[data-word]").forEach((el, i) => tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.35 }, beat(0) + 0.3 + i * 0.12));
  const num = (el, k) => el.getAttribute(k).split(" ").map(Number);
  const movers = [...R.querySelectorAll(".m")].map((el, i) => ({ el, v: num(el, "data-m"), arms: el.querySelector(".arms"), ph: i * 1.7, at: el.hasAttribute("data-step") ? beat(Number(el.dataset.step)) + Number(el.dataset.delay || 0) : null }));
  const backOut = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
  const counters = [...R.querySelectorAll("[data-count]")].map((el) => ({ el, v: num(el, "data-count"), suffix: el.dataset.suffix || "", at: beat(Number(el.dataset.step || 0)), dec: el.dataset.count.includes(".") ? 1 : 0 }));
  const needles = [...R.querySelectorAll(".needle")].map((el) => ({ el, a0: Number(el.dataset.a0), a1: Number(el.dataset.a1) }));
  const orbits = [...R.querySelectorAll("[data-orbit]")].map((el) => ({ el, v: num(el, "data-orbit") }));
  const twinkles = [...R.querySelectorAll("[data-tw]")].map((el) => ({ el, ph: Number(el.dataset.tw) }));
  const drifts = [...R.querySelectorAll("[data-drift]")].map((el) => ({ el, v: num(el, "data-drift") }));
  // Curve riders: the points come sampled from the server, so nothing is measured in the page.
  const riders = [...R.querySelectorAll("[data-follow]")].map((el) => ({ el, pts: el.dataset.follow.split(" ").map((p) => p.split(",").map(Number)), at: beat(Number(el.dataset.step)) }));
  const clock = { t: 0 };
  const paint = () => {
    const t = clock.t;
    const once = smooth(interpolate(t, P.move, [0, 1]));
    for (const { el, v: [x0, y0, x1, y1, s0, s1, spin, bob, osc, d0 = 0, d1 = 0], arms, ph, at } of movers) {
      const k = osc ? smooth(0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, t - P.move[0])) / osc)) : once;
      const fy = bob ? Math.sin(t * 0.9 + ph) * bob : 0;
      const fx = bob ? Math.cos(t * 0.6 + ph) * bob * 0.5 : 0;
      const pop = at == null ? 1 : 0.55 + 0.45 * backOut(clamp((t - at) / 0.7));
      const turn = d0 + (d1 - d0) * k;
      const rot = spin ? " rotate(" + (spin * t).toFixed(2) + ")" : "";
      el.setAttribute("transform", "translate(" + (x0 + (x1 - x0) * k + fx).toFixed(1) + " " + (y0 + (y1 - y0) * k + fy).toFixed(1) + ") scale(" + ((s0 + (s1 - s0) * k) * pop).toFixed(3) + ")" + (turn ? " rotate(" + turn.toFixed(2) + ")" : "") + (arms ? "" : rot));
      if (arms) arms.setAttribute("transform", rot);
    }
    for (const n of needles) {
      const k = interpolate(t, [beat(1), beat(1) + 1.4], [0, 1]);
      const swing = (n.a1 - n.a0) * (1 - Math.pow(1 - k, 3) * Math.cos(k * 9)) + (k >= 1 ? Math.sin(t * 7) * 0.02 : 0);
      n.el.setAttribute("transform", "rotate(" + ((swing * 180) / Math.PI).toFixed(2) + ")");
    }
    for (const { el, v: [cx, cy, rx, ry, a0, sp] } of orbits) {
      const a = a0 + t * sp;
      el.setAttribute("cx", (cx + Math.cos(a) * rx).toFixed(1));
      el.setAttribute("cy", (cy + Math.sin(a) * ry).toFixed(1));
    }
    for (const { el, ph } of twinkles) el.setAttribute("opacity", (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + ph))).toFixed(2));
    for (const { el, v: [dx, period] } of drifts) el.setAttribute("transform", "translate(" + (-((t / period) % 1) * dx).toFixed(1) + " 0)");
    for (const rd of riders) {
      const k = smooth(interpolate(t, [rd.at, rd.at + 1.3], [0, 1]));
      const [x, y] = rd.pts[Math.round(k * (rd.pts.length - 1))];
      rd.el.setAttribute("cx", x.toFixed(1));
      rd.el.setAttribute("cy", y.toFixed(1));
    }
    for (const c of counters) {
      const v = c.v[0] + (c.v[1] - c.v[0]) * smooth(interpolate(t, [c.at, c.at + 1.6], [0, 1]));
      c.el.textContent = v.toFixed(c.dec).replace(".", ",") + c.suffix;
    }
    // Slow camera: a push-in and a small pan across the whole scene (not on an overlay, which must
    // stay aligned with the frame or clip under it).
    if (!P.overlay) vis.setAttribute("transform", "translate(" + (960 + Math.sin(t * 0.25) * 10).toFixed(1) + " " + (560 + Math.cos(t * 0.2) * 6).toFixed(1) + ") scale(" + (1 + 0.05 * t / P.D).toFixed(4) + ") translate(-960 -560)");
  };
  tl.to(clock, { t: P.D, duration: P.D, ease: "none", onUpdate: paint }, 0);
  paint();`;

const FONT_FACE = `@font-face { font-family: "Be Vietnam Pro"; src: url("assets/fonts/${FONT}") format("truetype"); font-weight: 600; }`;

// A library frame, filled like in explainer videos (video/compile.js). Long videos have no caption
// band, so the frame (laid out above one) is moved down a little to sit in the middle.
function frameSceneHtml(sc) {
  const tpl = fsSync.readFileSync(templatePath(sc.frame_id), "utf8");
  const props = { ...sc.inputs, D: sc.duration, vo: sc.props.vo, voEnd: sc.props.voEnd, marks: sc.props.marks };
  return fill(tpl, { ...sc.inputs, __id: sc.id, __dur: sc.duration, __r: `#${sc.id}-root`, __w: W, __h: H, __fontface: FONT_FACE, __props: scriptJson(props) })
    .replace(`id="${sc.id}-root"`, `id="${sc.id}-root" data-aspect="16x9"`)
    .replace("</style>", () => `  #${sc.id}-root { translate: 0 70px; }\n      </style>`);
}

// A Motion Canvas clip (rendered by renderAnimClips into assets/anim/<id>.webm), cross-faded like
// the drawn scenes.
function animSceneHtml(sc) {
  return `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #${sc.id}-root { position: absolute; inset: 0; }
        #${sc.id}-root .wrap { position: absolute; inset: 0; }
        #${sc.id}-root video { position: absolute; inset: 0; width: 100%; height: 100%; }
      </style>
      <div id="${sc.id}-root" data-composition-id="${sc.id}" data-width="${W}" data-height="${H}">
        <div class="wrap">
          <video id="${sc.id}-anim" class="clip" src="assets/anim/${sc.id}.webm" muted playsinline data-start="0" data-duration="${sc.duration}" data-track-index="0"></video>
        </div>
      </div>
      <script>
        (() => {
          const P = ${scriptJson({ D: sc.duration, first: sc.props.first })};
          const W = document.getElementById("${sc.id}-root").querySelector(".wrap");
          const tl = gsap.timeline({ paused: true });
          tl.fromTo(W, { opacity: P.first ? 1 : 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 0);
          tl.to(W, { opacity: 0, duration: 0.5, ease: "power1.inOut" }, P.D - 0.52);
          window.__timelines["${sc.id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}

// The clip jobs of the animation scenes: the heading layer shows the title, so the component's own
// title is left empty and its drawing keeps clear of the heading (top) and the footnote (bottom).
function animJobs(scenes) {
  return scenes
    .filter((sc) => sc.kind === "anim")
    .map((sc) => {
      const raw = { ...(sc.props.anim || {}) };
      if (getAnimation(sc.component)?.inputs.title) raw.title = "";
      const { props, errors } = parseAnimInputs({ component: sc.component, props: JSON.stringify(raw) });
      if (errors.length) throw new Error(`Cảnh ${sc.id} (${sc.component}): ${errors.join("; ")}`);
      return { id: sc.id, component: sc.component, props, duration: sc.duration, width: W, height: H, theme: LONG_THEME, safe: { top: 210, right: 100, bottom: 130, left: 100 }, cues: sc.props.marks, speech: [sc.props.vo, sc.props.voEnd] };
    });
}

function sceneHtml(sc) {
  if (sc.kind === "frame") return frameSceneHtml(sc);
  if (sc.kind === "anim") return animSceneHtml(sc);
  return drawnSceneHtml(sc);
}

// The AI's drawing over a frame or animation scene, as its own composition ("<scene>-ov").
const hasOverlay = (sc) => ["frame", "anim"].includes(sc.kind) && !!String(sc.svg || "").trim();
const overlayOf = (sc) => ({ ...sc, id: `${sc.id}-ov`, props: { ...sc.props, overlay: true } });

function drawnSceneHtml(sc) {
  return `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        @font-face { font-family: "Be Vietnam Pro"; src: url("assets/fonts/${FONT}") format("truetype"); font-weight: 600; }
        #${sc.id}-root { position: absolute; inset: 0; }
        #${sc.id}-root svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      </style>
      <div id="${sc.id}-root" data-composition-id="${sc.id}" data-width="${W}" data-height="${H}">
        ${sceneSvg(sc, { render: true })}
      </div>
      <script>
        (() => {
          const P = ${scriptJson(sc.props)};
          const R = document.getElementById("${sc.id}-root");${RUNTIME}
          window.__timelines["${sc.id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}

function hostHtml(title, timeline, brand) {
  const space = spaceLayer(timeline.total);
  const titles = titlesLayer(timeline, brand);
  const grain = grainLayer(timeline.total);
  // Alternate tracks so overlapping scenes sit on separate rows in Studio; overlays get rows of their own.
  const host = (id, s, track, cls) =>
    `      <div id="h-${id}" class="${cls}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="${track}" data-width="${W}" data-height="${H}"></div>`;
  const hosts = timeline.scenes
    .flatMap((s, i) => [host(s.id, s, 1 + (i % 2), "scene"), ...(hasOverlay(s) ? [host(`${s.id}-ov`, s, 6 + (i % 2), "scene ov")] : [])])
    .join("\n");
  const audios = timeline.scenes
    .map((s) => `      <audio id="vo-${s.id}" src="assets/vo/${s.id}.mp3" data-start="${s.audio.start}" data-duration="${s.audio.duration}" data-track-index="4" data-volume="1"></audio>`)
    .join("\n");
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Be Vietnam Pro"; src: url("assets/fonts/${FONT}") format("truetype"); font-weight: 600; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #main { width: 100%; height: 100%; overflow: hidden; background: #000; }
      /* Theme tokens of library frames (server/frames/), in the long-video colours. */
      #main { ${Object.entries(LONG_THEME).map(([k, v]) => `--${k}: ${v};`).join(" ")} }
      #main { position: relative; }
      #main > .scene { position: absolute; inset: 0; z-index: 2; }
      #main > .scene.ov { z-index: 3; pointer-events: none; }
${space.css}
${titles.css}
${grain.css}
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${timeline.total}" data-width="${W}" data-height="${H}">
${space.html}
${hosts}
${titles.html}
${grain.html}
${audios}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
${space.script}
${titles.script}
  </body>
</html>
`;
}

// limit: only the first N scenes (a quick test render of a long video).
export async function buildLong(dir, state, { limit = 0, render = true, onLog = () => {}, onProgress = () => {} } = {}) {
  const plan = state.plan;
  const scenes = limit > 0 ? plan.scenes.slice(0, limit) : plan.scenes;
  onLog(`Tạo giọng đọc cho ${scenes.length} cảnh`);
  const vo = await voiceScenes(dir, scenes, { voice: state.voice || DEFAULT_VOICE, rate: state.rate || "+0%" });
  const fresh = Object.values(vo).filter((v) => !v.cached).length;
  onLog(`Giọng đọc xong (${fresh} cảnh mới, ${scenes.length - fresh} dùng lại)`);

  const timeline = buildTimeline({ ...plan, scenes }, vo);
  // Old scene files from a longer build would otherwise linger in compositions/.
  await fs.rm(path.join(dir, "compositions"), { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "compositions"), { recursive: true });
  await fs.mkdir(path.join(dir, "assets", "fonts"), { recursive: true });
  await fs.copyFile(path.join(ASSETS_DIR, "fonts", FONT), path.join(dir, "assets", "fonts", FONT));
  await fs.writeFile(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2));
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify({ id: path.basename(dir), name: plan.title }, null, 2));
  const jobs = animJobs(timeline.scenes);
  if (jobs.length) {
    onLog(`Render ${jobs.length} animation Motion Canvas (dùng lại bản đã render nếu không đổi)`);
    await renderAnimClips(dir, jobs, { onLog });
  }
  for (const sc of timeline.scenes) {
    await fs.writeFile(path.join(dir, "compositions", `${sc.id}.html`), sceneHtml(sc));
    if (hasOverlay(sc)) await fs.writeFile(path.join(dir, "compositions", `${sc.id}-ov.html`), drawnSceneHtml(overlayOf(sc)));
  }
  const overlays = timeline.scenes.filter(hasOverlay).length;
  if (overlays) onLog(`${overlays} cảnh frame/animation có thêm lớp SVG vẽ đè (chú thích, mũi tên, điểm nhấn)`);
  await fs.writeFile(path.join(dir, "index.html"), hostHtml(plan.title, timeline, state.brand));
  await fs.writeFile(path.join(dir, "timeline.json"), JSON.stringify(timeline, null, 2));
  onLog(`Dựng dự án HyperFrames: ${timeline.scenes.length} cảnh, ${Math.floor(timeline.total / 60)}:${String(Math.round(timeline.total % 60)).padStart(2, "0")} (GSAP + Three.js + Anime.js + CSS)`);
  if (!render) return { total: timeline.total };

  onLog("Render MP4 bằng HyperFrames…");
  const file = await renderProject(dir, { onProgress });
  onLog(`Xong: ${path.basename(file)}`);
  return { total: timeline.total, file };
}
