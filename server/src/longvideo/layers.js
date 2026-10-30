// Full-length layers of a long video, written into index.html around the scene clips. Each uses its
// own animation runtime, all seeked by HyperFrames from the same clock (they start at 0, so their
// time is the video's time):
//   space   — Three.js: a deep 3D starfield with twinkling stars and faint nebulae; the camera
//             glides forward through it for the whole video and sways a little.
//   titles  — Anime.js: every scene's heading types in letter by letter, its subheading and
//             footnote fade in, and all leave before the next scene; the channel name stays in
//             the corner.
//   grain   — CSS keyframes: film grain and a vignette over everything.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js";
export const ANIME_URL = "https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js";

export function spaceLayer(total) {
  return {
    html: `      <canvas id="space"></canvas>`,
    css: `      #space { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }`,
    script: `    <script type="module">
      import * as THREE from "${THREE_URL}";
      const TOTAL = ${total};
      const canvas = document.getElementById("space");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1920, 1080, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 1);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 600);
      // Seeded, so every render worker builds the same sky.
      let seed = 1234567;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const SPEED = 0.35;
      const depth = 60 + TOTAL * SPEED;
      const N = Math.min(9000, 2500 + Math.round(depth * 12));
      const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (rnd() - 0.5) * 140;
        pos[i * 3 + 1] = (rnd() - 0.5) * 80;
        pos[i * 3 + 2] = 40 - rnd() * (depth + 80);
        size[i] = 0.6 + Math.pow(rnd(), 3) * 2.6;
        phase[i] = rnd() * 6.283;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
      const stars = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 } },
        vertexShader: \`
          attribute float size; attribute float phase; uniform float time; varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float twinkle = 0.65 + 0.35 * sin(time * (0.8 + fract(phase) * 1.6) + phase * 7.0);
            vAlpha = twinkle * clamp(1.0 - (-mv.z) / 160.0, 0.0, 1.0) * clamp((-mv.z - 1.0) / 6.0, 0.0, 1.0);
            gl_PointSize = size * (220.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }\`,
        fragmentShader: \`
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(0.92), a * a * vAlpha * 0.75);
          }\`,
      });
      scene.add(new THREE.Points(geo, stars));
      // Faint nebulae: large soft sprites from a drawn gradient (no texture files to load).
      const glow = document.createElement("canvas");
      glow.width = glow.height = 256;
      const g = glow.getContext("2d");
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.4, "rgba(200,200,210,0.16)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(glow);
      const clouds = [];
      for (let i = 0; i < Math.round(depth / 30) + 4; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.05 + rnd() * 0.06 }));
        const s = 40 + rnd() * 70;
        m.scale.set(s, s * (0.4 + rnd() * 0.4), 1);
        m.position.set((rnd() - 0.5) * 160, (rnd() - 0.5) * 70, 10 - rnd() * (depth + 60));
        m.material.rotation = rnd() * 3.14;
        scene.add(m);
        clouds.push(m);
      }
      function renderAt(t) {
        stars.uniforms.time.value = t;
        camera.position.set(Math.sin(t * 0.045) * 3, Math.sin(t * 0.031) * 1.6, 30 - t * SPEED);
        camera.rotation.set(Math.sin(t * 0.027) * 0.03, Math.sin(t * 0.021) * 0.05, Math.sin(t * 0.017) * 0.02);
        renderer.render(scene, camera);
      }
      window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
      renderAt(window.__hfThreeTime || 0);
    </script>`,
  };
}

// Graphemes, so a Vietnamese letter with its marks stays one animated unit.
const seg = new Intl.Segmenter("vi", { granularity: "grapheme" });
const letters = (text) =>
  String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="w">${[...seg.segment(w)].map((g) => `<span class="ch">${esc(g.segment)}</span>`).join("")}</span>`)
    .join(" ");

export function titlesLayer(timeline, brand) {
  const ms = (s) => Math.round(s * 1000);
  // A library frame shows its own title, so its scene only gets the footnote here.
  const headed = (s) => s.kind !== "frame";
  const blocks = timeline.scenes.map((s) => {
    const big = s.kind === "title";
    const head = big ? s.heading : String(s.heading || "").toLocaleUpperCase("vi");
    return `        <div class="t${big ? " big" : ""}" id="t-${s.id}">${headed(s) ? `<div class="h">${letters(head)}</div>` : ""}${s.sub && !big && headed(s) ? `<div class="sub">${esc(s.sub)}</div>` : ""}${big && brand ? `<div class="sub">${esc(brand)}</div>` : ""}${s.note && !big ? `<div class="note">${esc(s.note)}</div>` : ""}</div>`;
  });
  const steps = timeline.scenes
    .map((s) => {
      const t0 = ms(s.start + (s.kind === "title" ? 1.1 : 0.25));
      const out = ms(s.start + s.duration - 0.55);
      const hasSub = (s.kind === "title" && brand) || (s.sub && s.kind !== "title" && headed(s));
      return [
        headed(s) && `tl.add("#t-${s.id} .ch", { opacity: [0, 1], y: [${s.kind === "title" ? 40 : 22}, 0], duration: 520, delay: anime.stagger(${s.kind === "title" ? 45 : 22}) }, ${t0});`,
        hasSub && `tl.add("#t-${s.id} .sub", { opacity: [0, 1], y: [10, 0], duration: 700 }, ${t0 + 450});`,
        s.note && s.kind !== "title" && `tl.add("#t-${s.id} .note", { opacity: [0, 0.9], duration: 800 }, ${t0 + 900});`,
        `tl.add("#t-${s.id}", { opacity: [1, 0], y: [0, -14], duration: 420, ease: "inQuad" }, ${out});`,
      ]
        .filter(Boolean)
        .join("\n      ");
    })
    .join("\n      ");
  const second = timeline.scenes[1]?.start ?? 0;
  return {
    html: `      <div id="titles">
${blocks.join("\n")}
        ${brand ? `<div id="brand">${esc(brand)}</div>` : ""}
      </div>`,
    css: `      #titles { position: absolute; inset: 0; z-index: 3; pointer-events: none; font-family: "Be Vietnam Pro", sans-serif; font-weight: 600; color: #fff; }
      #titles .t { position: absolute; inset: 0; }
      #titles .h { position: absolute; top: 96px; left: 0; right: 0; text-align: center; font-size: 40px; letter-spacing: 1.5px; }
      #titles .big .h { top: 612px; font-size: 64px; letter-spacing: 0; }
      #titles .w { display: inline-block; white-space: nowrap; }
      #titles .ch { display: inline-block; opacity: 0; }
      #titles .sub { position: absolute; top: 156px; left: 0; right: 0; text-align: center; font-size: 24px; color: #8f8f8f; opacity: 0; }
      #titles .big .sub { top: 702px; font-size: 26px; color: #bdbdbd; }
      #titles .note { position: absolute; top: 988px; left: 0; right: 0; text-align: center; font-size: 22px; color: #6f6f6f; opacity: 0; }
      #brand { position: absolute; top: 44px; right: 60px; font-size: 24px; opacity: 0; }`,
    script: `    <script src="${ANIME_URL}"></script>
    <script>
      const tl = anime.createTimeline({ autoplay: false, defaults: { ease: "outCubic" } });
      ${steps}
      ${brand ? `tl.add("#brand", { opacity: [0, 1], duration: 800 }, ${ms(second + 0.2)});` : ""}
      window.__hfAnime = window.__hfAnime || [];
      window.__hfAnime.push(tl);
    </script>`,
  };
}

// Film grain (an SVG noise tile jittered in steps) and a vignette, as a CSS animation with a finite
// iteration count covering the whole video.
export function grainLayer(total) {
  const noise = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>')}")`;
  const period = 0.6;
  return {
    html: `      <div id="grain" class="clip" data-start="0" data-duration="${total}" data-track-index="6"></div>
      <div id="vignette"></div>`,
    css: `      #grain { position: absolute; inset: -60px; z-index: 4; pointer-events: none; opacity: 0.05; background-image: ${noise};
        animation: grain-jitter ${period}s steps(6) ${Math.ceil(total / period) + 1} both; }
      @keyframes grain-jitter { 0% { transform: translate(0, 0); } 20% { transform: translate(-37px, 21px); } 40% { transform: translate(24px, -43px); } 60% { transform: translate(-18px, -12px); } 80% { transform: translate(41px, 30px); } 100% { transform: translate(0, 0); } }
      #vignette { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: radial-gradient(ellipse at 50% 52%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%); }`,
  };
}
