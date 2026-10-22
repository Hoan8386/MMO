import fs from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR } from "../config.js";
import { templatePath } from "./catalog.js";
import { fill, scriptJson } from "./template.js";

const FONT = "BeVietnamPro-SemiBold.ttf";
const FONT_FACE = `@font-face { font-family: "Be Vietnam Pro"; src: url("assets/fonts/${FONT}") format("truetype"); font-weight: 600; }`;

// Theme tokens (from the project's topic) reach every frame as CSS custom properties on the host root.
let THEME = {};
let BACKGROUND = "grid";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Writes a complete HyperFrames project into dir from a timeline (see timeline.js).
// Each frame template is copied and filled into compositions/<scene>.html, so later
// template changes never alter an existing video.
export async function compileProject(dir, { title, width = 1920, height = 1080, topic }, timeline) {
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
    const html = fill(tpl, {
      ...sc.inputs,
      __id: sc.id,
      __r: `#${sc.id}-root`,
      __w: width,
      __h: height,
      __fontface: FONT_FACE,
      __props: scriptJson(sc.props),
    });
    await fs.writeFile(path.join(dir, "compositions", `${sc.id}.html`), html);
    used[sc.frame_id] = sc.frame.version;
  }

  // Shared layers are sub-compositions too, so Studio shows one clean row per layer.
  const size = { W: width, H: height, total: timeline.total };
  const wipes = timeline.scenes
    .slice(0, -1)
    .filter((s) => s.transition_out === "wipe")
    .map((s) => ({ id: s.id, at: Math.round((s.start + s.duration) * 1000) / 1000 }));
  const caps = timeline.scenes.flatMap((s) => s.captions);
  await fs.writeFile(path.join(dir, "compositions", "background.html"), backgroundHtml(size));
  await fs.writeFile(path.join(dir, "compositions", "captions.html"), captionsHtml(size, caps));
  if (wipes.length) await fs.writeFile(path.join(dir, "compositions", "transitions.html"), transitionsHtml(size, wipes));
  else await fs.rm(path.join(dir, "compositions", "transitions.html"), { force: true });

  await fs.writeFile(path.join(dir, "index.html"), hostHtml({ title, ...size }, timeline, wipes.length > 0));
  return { frames: used };
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

// Background layer per topic: "grid" (technology), "burst" (entertainment), "paper" (education).
const BACKGROUNDS = {
  grid: `        #background-root .pattern { position: absolute; inset: 0; opacity: 0.35; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 96px 96px; }`,
  burst: `        #background-root .pattern { position: absolute; left: 50%; top: 50%; width: 3000px; height: 3000px; margin: -1500px 0 0 -1500px; opacity: 0.5; background: repeating-conic-gradient(from 0deg, var(--panel) 0deg 9deg, transparent 9deg 18deg); }
        #background-root .dots { position: absolute; inset: 0; opacity: 0.45; background-image: radial-gradient(var(--line) 2px, transparent 2.5px); background-size: 44px 44px; }`,
  paper: `        #background-root .pattern { position: absolute; inset: 0; background-image: linear-gradient(var(--line) 1px, transparent 1px); background-size: 100% 64px; background-position: 0 40px; opacity: 0.6; }
        #background-root .margin { position: absolute; top: 0; bottom: 0; left: 96px; width: 3px; background: rgba(229, 72, 77, 0.35); }`,
};

function backgroundHtml(size) {
  const extra = { burst: '<div class="dots"></div>', paper: '<div class="margin"></div>' }[BACKGROUND] || "";
  const spin = BACKGROUND === "burst" ? `
          tl.fromTo(R.querySelector(".pattern"), { rotation: 0 }, { rotation: 40, duration: ${size.total}, ease: "none" }, 0);` : "";
  return subComp(
    "background",
    size,
    `        #background-root .base { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 0%, var(--bg2) 0%, var(--bg) 60%); }
${BACKGROUNDS[BACKGROUND] || BACKGROUNDS.grid}
        #background-root .glow { position: absolute; width: 1100px; height: 1100px; left: 1100px; top: -300px; border-radius: 50%; background: radial-gradient(circle, var(--glow), transparent 65%); }`,
    `        <div class="base"></div><div class="pattern"></div>${extra}<div class="glow"></div>`,
    `          tl.fromTo(R.querySelector(".glow"), { x: 0, y: 0 }, { x: -700, y: 260, duration: ${size.total}, ease: "sine.inOut" }, 0);${spin}`,
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
function captionsHtml(size, caps) {
  return subComp(
    "captions",
    size,
    `        #captions-root .cap { position: absolute; left: 0; right: 0; bottom: 70px; margin: 0 auto; width: fit-content; max-width: 1560px; padding: 16px 34px; border-radius: 18px; background: var(--cap-bg); color: var(--cap-ink); font-size: 46px; line-height: 1.3; text-align: center; }`,
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

function hostHtml({ title, W, H, total }, { scenes }, hasWipes) {
  const layer = (id, track, kind = "") =>
    `      <div id="h-${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="${total}" data-track-index="${track}"${kind ? ` data-track-kind="${kind}"` : ""} data-width="${W}" data-height="${H}"></div>`;
  const sceneHosts = scenes
    .map(
      (s) =>
        `      <div id="h-${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-width="${W}" data-height="${H}"></div>`,
    )
    .join("\n");
  const audios = scenes
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
      #main { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${THEME.bg}; ${cssVars()} }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
${layer("background", 0)}
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

