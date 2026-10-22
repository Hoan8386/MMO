// Shared motion layer the compiler adds to every scene, on top of the frame's own animation:
//   - drifting sparkles behind the content (shape follows the topic's background style)
//   - library icons and cutouts bob gently while the scene holds
//   - a slow push-in of the whole scene, like a camera easing forward
//   - the optional `corner_icon` input: a library icon in a glowing disc that pops in and keeps pulsing
// Motion uses CSS custom properties (--fy, --fr, --push) applied through the independent
// `translate` / `rotate` / `scale` properties, so it never fights a template's own transforms.
// Positions come from fixed lists, never Math.random, so every render is identical.

// Sparkle positions as fractions of the canvas, kept to the edges so they never sit under text.
const SPARKS = [
  [0.04, 0.14, 14], [0.09, 0.42, 8], [0.05, 0.71, 11], [0.14, 0.88, 7], [0.22, 0.06, 9],
  [0.95, 0.1, 10], [0.9, 0.36, 7], [0.96, 0.6, 13], [0.86, 0.84, 8], [0.74, 0.05, 6],
  [0.42, 0.04, 7], [0.6, 0.93, 9],
];
const SPARK_SHAPE = { stars: "star", burst: "star", bokeh: "orb", waves: "orb" };

const BADGE = 180;

export function sceneFx({ id, duration: D, width: W, height: H, wide, background, badge }) {
  const r = `#${id}-root`;
  const shape = SPARK_SHAPE[background] || "dot";
  const sparks = SPARKS.map(([x, y, s], i) => ({ x: Math.round(x * W), y: Math.round(y * H), s: shape === "orb" ? s * 3 : s, i }));

  const css = `
        ${r} { scale: var(--push, 1); }
        ${r} .fx-layer { position: absolute; inset: 0; pointer-events: none; }
        ${r} .fx-spark { position: absolute; opacity: 0; translate: 0 var(--fy, 0px); }
        ${r} .fx-spark.dot { border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); }
        ${r} .fx-spark.orb { border-radius: 50%; background: radial-gradient(circle, var(--accent2), transparent 70%); }
        ${r} .fx-spark.star { background: var(--accent); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); filter: drop-shadow(0 0 6px var(--accent)); }
        ${r} .fx-spark:nth-child(3n) { background-color: var(--accent2); }
        ${r} :is(img[src^="assets/icons/"], img[src^="assets/cutouts/"]) { translate: 0 var(--fy, 0px); rotate: var(--fr, 0deg); }${
          badge
            ? `
        ${r} .fx-badge { position: absolute; z-index: 5; width: ${BADGE}px; height: ${BADGE}px; ${wide ? "top: 70px; right: 110px;" : `top: 70px; left: 50%; margin-left: -${BADGE / 2}px;`} }
        ${r} .fx-badge .disc { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 35% 30%, var(--bg2), var(--bg) 75%); border: 3px solid var(--line); box-shadow: 0 0 70px var(--glow), inset 0 0 30px var(--panel); }
        ${r} .fx-badge .ring { position: absolute; inset: -6px; border-radius: 50%; border: 4px solid var(--accent); opacity: 0; }
        ${r} .fx-badge img { position: absolute; left: 50%; top: 50%; width: 118px; height: 118px; margin: -59px 0 0 -59px; }${
          wide
            ? `
        ${r}.has-badge .wrap { right: 340px; }`
            : ""
        }`
            : ""
        }`;

  const html =
    `<div class="fx-layer">${sparks.map((p) => `<i class="fx-spark ${shape}" style="left:${p.x}px;top:${p.y}px;width:${p.s}px;height:${p.s}px"></i>`).join("")}</div>` +
    (badge ? `<div class="fx-badge"><div class="ring"></div><div class="disc"></div><img src="assets/icons/${badge}.svg" alt="" /></div>` : "");

  const script = `
        (() => {
          const R = document.getElementById("${id}-root");
          const tl = window.__timelines["${id}"];
          if (!R || !tl) return;
          const D = ${D};
          // Repeats of a yoyo that fit before the exit and end back where they started.
          const yoyos = (at, half) => 2 * Math.floor((D - 0.5 - at) / (2 * half)) - 1;
          tl.fromTo(R, { "--push": 1 }, { "--push": 1.025, duration: D, ease: "none" }, 0);
          R.querySelectorAll(".fx-spark").forEach((el, i) => {
            const at = 0.15 + (i % 6) * 0.12;
            tl.fromTo(el, { opacity: 0, scale: 0.3 }, { opacity: ${shape === "orb" ? 0.35 : 0.55}, scale: 1, duration: 0.6, ease: "power2.out" }, at);
            tl.fromTo(el, { "--fy": "0px" }, { "--fy": (i % 2 ? -1 : 1) * (40 + (i % 4) * 18) + "px", duration: Math.max(1, D - at), ease: "sine.inOut" }, at);
            const tw = 1 + (i % 5) * 0.2;
            if (yoyos(tw, 0.9) > 0) tl.to(el, { opacity: 0.15, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: yoyos(tw, 0.9) }, tw);
            tl.to(el, { opacity: 0, duration: 0.35 }, D - 0.45);
          });
          R.querySelectorAll('img[src^="assets/icons/"], img[src^="assets/cutouts/"]').forEach((el, i) => {
            const at = 1.1 + (i % 4) * 0.25;
            const n = yoyos(at, 1.6);
            if (n < 1) return;
            tl.fromTo(el, { "--fy": "0px", "--fr": "0deg" }, { "--fy": "-14px", "--fr": (i % 2 ? -4 : 4) + "deg", duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: n }, at);
          });${
            badge
              ? `
          const B = R.querySelector(".fx-badge");
          tl.fromTo(B, { opacity: 0, scale: 0.2, rotation: -25 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.8)" }, 0.35);
          const ring = B.querySelector(".ring");
          for (let t = 1.1; t < D - 1.2; t += 1.8) tl.fromTo(ring, { opacity: 0.7, scale: 1 }, { opacity: 0, scale: 1.4, duration: 1.2, ease: "power1.out" }, t);
          tl.to(B, { opacity: 0, scale: 0.6, duration: 0.4, ease: "power2.in" }, D - 0.45);`
              : ""
          }
        })();`;

  return { css, html, script };
}
