import fs from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR } from "../config.js";
import { templatePath } from "./catalog.js";
import { findAsset, copyAsset, KIND_OF_INPUT } from "./library.js";
import { fill, scriptJson } from "./template.js";
import { layoutFor, aspectKey, DEFAULT_ASPECT } from "./aspects.js";
import { sceneFx } from "./fx.js";

const FONT = "BeVietnamPro-SemiBold.ttf";
const FONT_FACE = `@font-face { font-family: "Be Vietnam Pro"; src: url("assets/fonts/${FONT}") format("truetype"); font-weight: 600; }`;

// Theme tokens (from the project's topic) reach every frame as CSS custom properties on the host root.
let THEME = {};
let BACKGROUND = "grid";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Writes a complete HyperFrames project into dir from a timeline (see timeline.js).
// Each frame template is copied and filled into compositions/<scene>.html, so later
// template changes never alter an existing video.
// `silent` leaves out the voice-over (used for frame previews, which have no audio).
// Scenes are laid out on the format's design canvas and scaled into the output (see aspects.js).
export async function compileProject(dir, { title, aspectRatio = DEFAULT_ASPECT, width, height, topic, silent = false }, timeline) {
  const L = layoutFor(aspectRatio, width, height);
  THEME = topic.theme;
  BACKGROUND = topic.background || "grid";
  await fs.mkdir(path.join(dir, "compositions"), { recursive: true });
  await fs.mkdir(path.join(dir, "assets", "fonts"), { recursive: true });
  await fs.copyFile(path.join(ASSETS_DIR, "fonts", FONT), path.join(dir, "assets", "fonts", FONT));

  await fs.writeFile(
    path.join(dir, "hyperframes.json"),
    JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2),
  );
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify({ id: path.basename(dir), name: title }, null, 2));

  const used = {};
  for (const sc of timeline.scenes) {
    const tpl = await fs.readFile(templatePath(sc.frame_id), "utf8");
    let html = fill(tpl, {
      ...sc.inputs,
      __id: sc.id,
      __r: `#${sc.id}-root`,
      __w: L.scene.w,
      __h: L.scene.h,
      __fontface: FONT_FACE,
      __props: scriptJson(sc.props),
    })
      // Lets a template restyle itself per format: {{__r}}[data-aspect="9x16"] .cols { … }
      .replace(`id="${sc.id}-root"`, `id="${sc.id}-root" data-aspect="${aspectKey(aspectRatio)}"`);
    html = withFx(html, sc, { L, wide: aspectRatio === "16:9" });
    await fs.writeFile(path.join(dir, "compositions", `${sc.id}.html`), html);
    used[sc.frame_id] = sc.frame.version;
  }

  await copyLibraryAssets(dir, timeline.scenes);

  // Shared layers are sub-compositions too, so Studio shows one clean row per layer.
  const size = { W: L.W, H: L.H, total: timeline.total };
  const wipes = timeline.scenes
    .slice(0, -1)
    .filter((s) => s.transition_out === "wipe")
    .map((s) => ({ id: s.id, at: Math.round((s.start + s.duration) * 1000) / 1000 }));
  const caps = timeline.scenes.flatMap((s) => s.captions);
  await fs.writeFile(path.join(dir, "compositions", "background.html"), backgroundHtml({ W: L.full.w, H: L.full.h, total: timeline.total }));
  await fs.writeFile(path.join(dir, "compositions", "captions.html"), captionsHtml(size, caps, L.caption));
  if (wipes.length) await fs.writeFile(path.join(dir, "compositions", "transitions.html"), transitionsHtml(size, wipes));
  else await fs.rm(path.join(dir, "compositions", "transitions.html"), { force: true });

  await fs.writeFile(path.join(dir, "index.html"), hostHtml({ title, ...size, L }, timeline, wipes.length > 0, silent));
  return { frames: used };
}

// Adds the shared motion layer (fx.js) to a filled scene: its CSS, its elements as the
// root's first children (so the frame's content paints over them) and its script.
function withFx(html, sc, { L, wide }) {
  const badge = sc.frame.inputs.corner_icon && sc.inputs.corner_icon ? sc.inputs.corner_icon : null;
  const fx = sceneFx({ id: sc.id, duration: sc.duration, width: L.scene.w, height: L.scene.h, wide, background: BACKGROUND, badge });
  return html
    .replace("</style>", () => `${fx.css}\n      </style>`)
    .replace(new RegExp(`(<div id="${sc.id}-root")([^>]*>)`), (_, open, rest) => `${open}${badge ? ' class="has-badge"' : ""}${rest}\n        ${fx.html}`)
    .replace("</template>", () => `  <script>${fx.script}\n      </script>\n    </template>`);
}

// Copies the library icons, logos and photos the scenes use into the project's assets/.
async function copyLibraryAssets(dir, scenes) {
  const wanted = new Map();
  for (const sc of scenes) {
    for (const [k, spec] of Object.entries(sc.frame.inputs)) {
      const v = sc.inputs[k];
      if (v == null || v === "") continue;
      const kind = spec.type === "image" ? "photo" : KIND_OF_INPUT[spec.type];
      if (!kind) continue;
      for (const name of [v].flat()) {
        const a = findAsset(kind, name);
        if (a) wanted.set(`${kind}:${name}`, a);
      }
    }
  }
  for (const a of wanted.values()) await copyAsset(dir, a);
}

const cssVars = () => Object.entries(THEME).map(([k, v]) => `--${k}: ${v};`).join(" ");

function subComp(id, { W, H, total }, style, body, script) {
  return `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        ${FONT_FACE}
        #${id}-root { position: absolute; inset: 0; font-family: "Be Vietnam Pro", sans-serif; font-weight: 600; }
${style}
      </style>
      <div id="${id}-root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-duration="${total}">
${body}
      </div>
      <script>
        (() => {
          const R = document.getElementById("${id}-root");
          const tl = gsap.timeline({ paused: true });
${script}
          window.__timelines["${id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}

// Background layer per topic. Each style: CSS, extra elements, and slow motion over the whole video.
// Positions come from fixed lists, never Math.random, so every render is identical.
// `css` and `html` may be functions of the canvas size ({ W, H }, design px) so tall formats keep the look.
const SPOTS = [[180, 160, 420], [1500, 120, 360], [980, 620, 520], [320, 760, 300], [1680, 820, 460], [720, 260, 260], [1300, 420, 320], [60, 480, 380]];
const STARS = [[40, 60], [130, 190], [210, 40], [300, 150], [390, 70], [470, 210], [90, 130], [260, 230], [340, 20], [440, 120]];
const BACKGROUNDS = {
  grid: {
    css: `        #background-root .pattern { position: absolute; inset: 0; opacity: 0.35; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 96px 96px; }`,
  },
  burst: {
    css: `        #background-root .pattern { position: absolute; left: 50%; top: 50%; width: 3000px; height: 3000px; margin: -1500px 0 0 -1500px; opacity: 0.5; background: repeating-conic-gradient(from 0deg, var(--panel) 0deg 9deg, transparent 9deg 18deg); }
        #background-root .dots { position: absolute; inset: 0; opacity: 0.45; background-image: radial-gradient(var(--line) 2px, transparent 2.5px); background-size: 44px 44px; }`,
    html: '<div class="dots"></div>',
    anim: (total) => `tl.fromTo(R.querySelector(".pattern"), { rotation: 0 }, { rotation: 40, duration: ${total}, ease: "none" }, 0);`,
  },
  paper: {
    css: `        #background-root .pattern { position: absolute; inset: 0; background-image: linear-gradient(var(--line) 1px, transparent 1px); background-size: 100% 64px; background-position: 0 40px; opacity: 0.6; }
        #background-root .margin { position: absolute; top: 0; bottom: 0; left: 96px; width: 3px; background: rgba(229, 72, 77, 0.35); }`,
    html: '<div class="margin"></div>',
  },
  dots: {
    css: ({ H }) => `        #background-root .pattern { position: absolute; inset: -120px; opacity: 0.7; background-image: radial-gradient(var(--line) 2.6px, transparent 3px); background-size: 40px 40px; }
        #background-root .band { position: absolute; left: -200px; right: -200px; top: ${Math.round(H * 0.59)}px; height: 300px; transform: rotate(-6deg); background: var(--panel); }`,
    html: '<div class="band"></div>',
    anim: (total) => `tl.fromTo(R.querySelector(".pattern"), { x: 0, y: 0 }, { x: 80, y: 40, duration: ${total}, ease: "none" }, 0);`,
  },
  stars: {
    css: ({ H }) => `        #background-root .pattern { position: absolute; inset: -300px; opacity: 0.85; background-image: ${STARS.map(([x, y], i) => `radial-gradient(${i % 3 ? 1.6 : 2.6}px ${i % 3 ? 1.6 : 2.6}px at ${x}px ${y}px, var(--ink), transparent)`).join(", ")}; background-size: 500px 250px; }
        #background-root .far { position: absolute; inset: -300px; opacity: 0.4; background-image: ${STARS.map(([x, y]) => `radial-gradient(1.2px 1.2px at ${Math.round(y * 1.7)}px ${Math.round(x * 0.7)}px, var(--ink), transparent)`).join(", ")}; background-size: 420px 330px; }
        #background-root .nebula { position: absolute; width: 1500px; height: 900px; left: -300px; top: ${Math.round(H * 0.37)}px; border-radius: 50%; background: radial-gradient(ellipse, var(--glow), transparent 70%); }`,
    html: '<div class="far"></div><div class="nebula"></div>',
    anim: (total) => `tl.fromTo(R.querySelector(".pattern"), { x: 0 }, { x: -160, duration: ${total}, ease: "none" }, 0);
          tl.fromTo(R.querySelector(".far"), { x: 0 }, { x: -60, duration: ${total}, ease: "none" }, 0);`,
  },
  waves: {
    css: ({ H }) => `        #background-root .wave { position: absolute; left: 50%; width: 3400px; height: 3400px; margin-left: -1700px; border-radius: 43%; background: var(--panel); }
        #background-root .w1 { top: ${H - 320}px; } #background-root .w2 { top: ${H - 250}px; border-radius: 41%; } #background-root .w3 { top: ${H - 170}px; border-radius: 45%; }
        #background-root .pattern { position: absolute; inset: 0; opacity: 0.3; background-image: radial-gradient(var(--line) 2px, transparent 2.5px); background-size: 56px 56px; }`,
    html: '<div class="wave w1"></div><div class="wave w2"></div><div class="wave w3"></div>',
    anim: (total) => `[[".w1", 30], [".w2", -24], [".w3", 18]].forEach(([s, r]) => tl.fromTo(R.querySelector(s), { rotation: 0 }, { rotation: r, duration: ${total}, ease: "none" }, 0));`,
  },
  bokeh: {
    css: ({ W, H }) => `        #background-root .pattern { position: absolute; inset: 0; }
        #background-root .spot { position: absolute; border-radius: 50%; }
${SPOTS.map(([x, y, d], i) => `        #background-root .b${i} { left: ${Math.round((x * W) / 1920)}px; top: ${Math.round((y * H) / 1080)}px; width: ${d}px; height: ${d}px; background: radial-gradient(circle, var(${i % 2 ? "--accent2" : "--accent"}) 0%, transparent 68%); opacity: ${i % 3 ? 0.16 : 0.24}; }`).join("\n")}`,
    html: SPOTS.map((_, i) => `<div class="spot b${i}"></div>`).join(""),
    anim: (total) => `${JSON.stringify(SPOTS.map((_, i) => [i, (i % 2 ? -1 : 1) * (60 + i * 12)]))}.forEach(([i, dy]) => tl.fromTo(R.querySelector(".b" + i), { y: 0 }, { y: dy, duration: ${total}, ease: "sine.inOut" }, 0));`,
  },
  vignette: {
    css: `        #background-root .pattern { position: absolute; inset: 0; opacity: 0.18; background-image: repeating-linear-gradient(0deg, var(--line) 0 1px, transparent 1px 5px); }
        #background-root .light { position: absolute; width: 1700px; height: 1300px; left: 110px; top: -260px; border-radius: 50%; background: radial-gradient(ellipse, var(--bg2), transparent 70%); opacity: 0.9; }
        #background-root .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(0, 0, 0, 0.55) 100%); }`,
    html: '<div class="light"></div><div class="vig"></div>',
    anim: (total) => `tl.fromTo(R.querySelector(".light"), { x: -120 }, { x: 120, duration: ${total}, ease: "sine.inOut" }, 0);`,
  },
};
export const BACKGROUND_STYLES = Object.keys(BACKGROUNDS);

function backgroundHtml(size) {
  const bg = BACKGROUNDS[BACKGROUND] || BACKGROUNDS.grid;
  return subComp(
    "background",
    size,
    `        #background-root .base { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 0%, var(--bg2) 0%, var(--bg) 60%); }
${typeof bg.css === "function" ? bg.css(size) : bg.css}
        #background-root .glow { position: absolute; width: 1100px; height: 1100px; left: ${size.W - 820}px; top: -300px; border-radius: 50%; background: radial-gradient(circle, var(--glow), transparent 65%); }`,
    `        <div class="base"></div><div class="pattern"></div>${bg.html || ""}<div class="glow"></div>`,
    `          tl.fromTo(R.querySelector(".glow"), { x: 0, y: 0 }, { x: -700, y: 260, duration: ${size.total}, ease: "sine.inOut" }, 0);${bg.anim ? `
          ${bg.anim(size.total)}` : ""}`,
  );
}

function transitionsHtml(size, wipes) {
  return subComp(
    "transitions",
    size,
    `        #transitions-root .wipe { position: absolute; inset: 0; background: linear-gradient(90deg, var(--accent2), var(--accent)); }`,
    wipes
      .map((w) => `        <div id="wipe-${w.id}" class="wipe clip" data-start="${(w.at - 0.4).toFixed(3)}" data-duration="0.8" data-track-index="0"></div>`)
      .join("\n"),
    `          for (const w of ${JSON.stringify(wipes)}) {
            const p = document.getElementById("wipe-" + w.id);
            tl.fromTo(p, { xPercent: -101 }, { xPercent: 0, duration: 0.38, ease: "power2.in" }, w.at - 0.4);
            tl.to(p, { xPercent: 101, duration: 0.38, ease: "power2.out" }, w.at + 0.02);
          }`,
  );
}

// Karaoke captions: one clip per caption line, each word lights up when it is spoken.
function captionsHtml(size, caps, { bottom, font, maxWidth }) {
  return subComp(
    "captions",
    size,
    `        #captions-root .cap { position: absolute; left: 0; right: 0; bottom: ${bottom}px; margin: 0 auto; width: fit-content; max-width: ${maxWidth}px; padding: ${Math.round(font * 0.35)}px ${Math.round(font * 0.74)}px; border-radius: 18px; background: var(--cap-bg); color: var(--cap-ink); font-size: ${font}px; line-height: 1.3; text-align: center; }`,
    caps
      .map(
        (c, i) =>
          `        <div id="cap-${i}" class="cap clip" data-start="${c.start}" data-duration="${c.duration}" data-track-index="0">${c.words
            .map((w) => `<span>${esc(w.w)}</span>`)
            .join(" ")}</div>`,
      )
      .join("\n"),
    `          const CAPS = ${JSON.stringify(caps.map((c) => ({ s: c.start, w: c.words.map((w) => w.t) })))};
          CAPS.forEach((c, i) => {
            const box = document.getElementById("cap-" + i);
            tl.fromTo(box, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, c.s);
            box.querySelectorAll("span").forEach((el, j) => {
              tl.fromTo(el, { color: "${THEME["cap-ink"]}" }, { color: "${THEME["cap-hi"]}", duration: 0.08 }, c.w[j]);
            });
          });`,
  );
}

function hostHtml({ title, W, H, total, L }, { scenes }, hasWipes, silent) {
  const layer = (id, track, kind = "", w = W, h = H) =>
    `      <div id="h-${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="${total}" data-track-index="${track}"${kind ? ` data-track-kind="${kind}"` : ""} data-width="${w}" data-height="${h}"></div>`;
  const sceneHosts = scenes
    .map(
      (s) =>
        `      <div id="h-${s.id}" class="scene" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-width="${L.scene.w}" data-height="${L.scene.h}"></div>`,
    )
    .join("\n");
  // Scenes and the background are laid out in design pixels and scaled into the output.
  const scaled =
    L.scale === 1
      ? ""
      : `
      #main > .scene, #h-background { position: absolute; left: 0; transform-origin: 0 0; transform: scale(${L.scale}); }
      #main > .scene { top: ${L.scene.top}px; width: ${L.scene.w}px; height: ${L.scene.h}px; }
      #h-background { top: 0; width: ${L.full.w}px; height: ${L.full.h}px; }`;
  const audios = (silent ? [] : scenes)
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
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${THEME.bg}; }
      #main { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${THEME.bg}; ${cssVars()} }${scaled}
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
${layer("background", 0, "", L.full.w, L.full.h)}
${sceneHosts}
${hasWipes ? layer("transitions", 2) + "\n" : ""}${layer("captions", 3, "captions")}
${audios}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

