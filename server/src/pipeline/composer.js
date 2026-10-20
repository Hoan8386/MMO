import fs from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR, STORAGE_DIR } from "../config.js";

const LEAD = 0.3; // silence before each line
const TAIL = 0.6; // breathing room after each line
const HAND_REST_DUR = 0.5;

export function videoDir(videoId) {
  return path.join(STORAGE_DIR, "videos", String(videoId));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 100) / 100;

// Lays scenes out back to back on one timeline, driven by each line's real audio length.
export function planTimeline(scenes) {
  let t = 0;
  return scenes.map((sc) => {
    const audio = Number(sc.audio_duration);
    const start = t;
    const duration = LEAD + audio + TAIL;
    t += duration;
    return {
      ...sc,
      start: r2(start),
      duration: r2(duration),
      audioStart: r2(start + LEAD),
      drawStart: r2(start + 0.15),
      drawEnd: r2(start + LEAD + Math.max(1.2, audio - 0.1)),
    };
  });
}

// Writes a complete HyperFrames project for the video and returns its directory.
export async function composeProject(video, type, scenes) {
  const dir = videoDir(video.id);
  await fs.mkdir(path.join(dir, "assets", "fonts"), { recursive: true });
  await fs.copyFile(
    path.join(ASSETS_DIR, "fonts", "BeVietnamPro-SemiBold.ttf"),
    path.join(dir, "assets", "fonts", "BeVietnamPro-SemiBold.ttf"),
  );
  const handSrc = type.hand_image ? path.join(STORAGE_DIR, type.hand_image) : path.join(ASSETS_DIR, "hand.png");
  await fs.copyFile(handSrc, path.join(dir, "assets", "hand.png"));

  await fs.writeFile(
    path.join(dir, "hyperframes.json"),
    JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2),
  );
  await fs.writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify({ id: `video-${video.id}`, name: video.title, createdAt: new Date().toISOString() }, null, 2),
  );

  const timeline = planTimeline(scenes);
  const total = r2(timeline.reduce((a, s) => a + s.duration, 0) + 0.4);
  await fs.writeFile(path.join(dir, "index.html"), renderHtml(type, timeline, total));
  return { dir, duration: total };
}

function renderHtml(type, timeline, total) {
  const W = Number(type.width);
  const H = Number(type.height);
  const scale = Number(type.hand_width) / Number(type.hand_natural_width);
  const handScale = Number(type.hand_width);
  const subSize = Math.round(H * 0.034);

  const sceneSvgs = timeline
    .map((s, i) => {
      const paths = (typeof s.paths === "string" ? JSON.parse(s.paths) : s.paths) || [];
      const body = paths
        .map((p) => `<path class="d" data-stroke="${esc(p.stroke)}" data-fill="${esc(p.fill)}" d="${esc(p.d)}" />`)
        .join("\n          ");
      return `      <svg id="s${i}" class="scene clip" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" viewBox="0 0 ${W} ${H}">
        <g filter="url(#rough)">
          ${body}
        </g>
      </svg>`;
    })
    .join("\n");

  const subs = timeline
    .map((s, i) => `      <div id="sub${i}" class="sub clip" data-start="${r2(s.audioStart - 0.1)}" data-duration="${r2(s.duration - LEAD + 0.1)}" data-track-index="3">${esc(s.text)}</div>`)
    .join("\n");

  const audios = timeline
    .map((s, i) => `      <audio id="vo${i}" src="assets/vo/${path.basename(s.audio_path)}" data-start="${s.audioStart}" data-duration="${r2(Number(s.audio_duration))}" data-track-index="4"></audio>`)
    .join("\n");

  const draws = timeline
    .map((s, i) => `      draw("#s${i}", ${s.drawStart}, ${s.drawEnd});\n      rest(${r2(s.drawEnd + 0.05)}, ${HAND_REST_DUR});`)
    .join("\n");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {
        font-family: "Be Vietnam Pro";
        src: url("assets/fonts/BeVietnamPro-SemiBold.ttf") format("truetype");
        font-weight: 600;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${type.background_color}; }
      #root { position: relative; width: 100%; height: 100%; background: ${type.background_color}; font-family: "Be Vietnam Pro", sans-serif; }
      .scene { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
      .scene path { fill: none; stroke: ${type.stroke_color}; stroke-width: ${type.stroke_width}; stroke-linecap: round; stroke-linejoin: round; }
      .sub { position: absolute; left: ${Math.round(W * 0.08)}px; right: ${Math.round(W * 0.08)}px; bottom: ${Math.round(H * 0.09)}px; text-align: center; color: ${type.subtitle_color}; font-size: ${subSize}px; font-weight: 600; line-height: 1.35; }
      #hand { position: absolute; left: 0; top: 0; width: ${handScale}px; height: ${handScale}px; }
      .hand-art { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: rotate(${type.hand_rotate}deg); }
      .hand-art img { position: absolute; left: ${r2(-Number(type.hand_tip_x) * scale)}px; top: ${r2(-Number(type.hand_tip_y) * scale)}px; width: ${handScale}px; filter: drop-shadow(6px 10px 8px rgba(0, 0, 0, 0.18)); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
      <svg width="0" height="0" style="position: absolute">
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </svg>
${sceneSvgs}
      <div id="hand" class="clip" data-start="0" data-duration="${total}" data-track-index="2">
        <div class="hand-art"><img src="assets/hand.png" alt="" /></div>
      </div>
${subs}
${audios}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const hand = document.getElementById("hand");
      const REST = { x: ${Math.round(W * 0.93)}, y: ${Math.round(H * 1.1)} };
      tl.set(hand, { x: REST.x, y: REST.y }, 0);

      // Draws every path.d in sel between t0 and t1 with the pencil tip tracing each stroke,
      // then colors closed shapes in.
      function draw(sel, t0, t1) {
        const paths = [...document.querySelectorAll(sel + " path.d")];
        if (!paths.length) return;
        const lens = paths.map((p) => Math.max(1, p.getTotalLength()));
        const travel = Math.min(0.12, ((t1 - t0) * 0.3) / paths.length);
        const total = lens.reduce((a, b) => a + b, 0);
        const avail = t1 - t0 - travel * paths.length;
        let t = t0;
        paths.forEach((p, i) => {
          const len = lens[i];
          const dur = (len / total) * avail;
          p.style.strokeDasharray = len + 1;
          p.style.strokeDashoffset = len + 1;
          p.style.opacity = 0;
          p.style.stroke = p.dataset.stroke;
          const start = p.getPointAtLength(0);
          tl.to(hand, { x: start.x, y: start.y, duration: travel, ease: "power1.inOut" }, t);
          t += travel;
          tl.set(p, { opacity: 1 }, t);
          tl.fromTo(p, { strokeDashoffset: len + 1 }, { strokeDashoffset: 0, duration: dur, ease: "none" }, t);
          const steps = Math.max(1, Math.ceil(len / 18));
          const keyframes = [];
          for (let s = 1; s <= steps; s++) {
            const pt = p.getPointAtLength((len * s) / steps);
            keyframes.push({ x: pt.x, y: pt.y, duration: dur / steps, ease: "none" });
          }
          tl.to(hand, { keyframes }, t);
          if (p.dataset.fill && p.dataset.fill !== "none") {
            p.style.fill = p.dataset.fill;
            tl.fromTo(p, { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.35, ease: "power1.out" }, t + dur);
          }
          t += dur;
        });
      }

      function rest(t, d) {
        tl.to(hand, { x: REST.x, y: REST.y, duration: d, ease: "power2.inOut" }, t);
      }

${draws}

      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}
