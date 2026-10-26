// Story motion for "unlimited" presets: instead of new frames, the AI adds animation on top of
// the library frames it picked, so each scene acts out what the narration says:
//   motion: { effect, camera, actors: [{ kind, name, move, side, at }] }
//   - effect  ambient animation over the scene (rain, snow, confetti, fireworks…)
//   - camera  how the whole scene moves (replaces the default slow push-in of fx.js)
//   - actors  up to 2 library characters or icons that walk, fly or pop in, starting on a keyword
// Everything comes from the fixed catalogue below and is laid out at compile time from a hash
// (never Math.random), so every render of a scene is identical. Actors keep to the side edges
// and the lane just above the captions so they do not cover the frame's text.
import { findAsset } from "./library.js";

export const EFFECTS = {
  none: "no ambient animation",
  rain: "rain falling — storms, floods, sadness, a gloomy day",
  snow: "snow drifting down — winter, cold, quiet moments",
  leaves: "leaves falling and spinning — autumn, forests, time passing",
  confetti: "a confetti burst — celebration, records, wins, good news",
  fireworks: "fireworks bursting — festivals, launches, big achievements",
  bubbles: "bubbles rising — the sea, underwater life, science, chemistry",
  embers: "glowing embers rising — fire, volcanoes, war, heat, danger",
  stars: "twinkling stars — space, night, dreams, wonder",
  hearts: "hearts floating up — love, kindness, family, gratitude",
  lightning: "lightning flashes — shock, storms, sudden danger, breakthroughs",
  wind: "speed lines streaking past — speed, wind, movement, racing",
  magic: "a sparkle burst — a reveal, magic, a surprising fact",
  glow: "a soft pulsing glow behind the content — calm emphasis, mystery",
};
export const CAMERAS = {
  push: "slow push-in (default)",
  zoom_in: "stronger zoom in — tension, focusing on a detail",
  zoom_out: "zoom out — revealing the big picture",
  pan_left: "drift to the left — travel, journeys, time moving on",
  pan_right: "drift to the right",
  tilt: "gentle rocking — the sea, dizziness, unease",
  shake: "a short shake on the first keyword — impact, explosions, shock",
  static: "no camera motion",
};
export const MOVES = {
  walk_across: "walks across the bottom lane from `side` to the other side",
  run_across: "runs across quickly",
  fly_across: "flies across the top of the scene",
  peek: "slides in from the `side` edge, peeks and wiggles",
  pop_in: "pops in at the `side` corner and bobs",
  rise: "rises up into the `side` corner",
  fall: "drops from above into the `side` corner and bounces",
  bounce: "jumps up and down at the `side` corner",
};
const KINDS = { icon: "illustration", character: "character" };
const MAX_ACTORS = 2;
const CAPTION_H = 270;

// ---------------------------------------------------------------- prompt, schema, validation

export const motionSchema = {
  type: "object",
  properties: {
    effect: { type: "string", enum: Object.keys(EFFECTS) },
    camera: { type: "string", enum: Object.keys(CAMERAS) },
    actors: {
      type: "array",
      description: `0-${MAX_ACTORS} actors`,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: Object.keys(KINDS) },
          name: { type: "string", description: "a name from the Icons or Characters list" },
          move: { type: "string", enum: Object.keys(MOVES) },
          side: { type: "string", enum: ["left", "right"] },
          at: { type: "integer", description: "index in this scene's keywords when the actor starts; -1 = scene start" },
        },
        required: ["kind", "name", "move", "side", "at"],
        additionalProperties: false,
      },
    },
  },
  required: ["effect", "camera", "actors"],
  additionalProperties: false,
};

const list = (o) => Object.entries(o).map(([k, v]) => `  ${k}: ${v}`).join("\n");

export const motionGuide = `
STORY MOTION: give every scene a "motion" object that animates the chosen frame so the picture acts out what its narration says. Motion decorates the frame; facts and on-screen text still go in the frame's inputs.
- effect — ambient animation over the whole scene:
${list(EFFECTS)}
  Pick what the sentence evokes; "none" when nothing fits. Do not use one effect in more than two scenes in a row.
- camera:
${list(CAMERAS)}
- actors — up to ${MAX_ACTORS} characters (kind "character", a name from the Characters lists) or icons (kind "icon", a name from Icons) that act in the scene: a fox runs across when the fox escapes, a rocket flies across at the launch, a scientist pops in when one is quoted. Use [] when nobody needs to act.
  move:
${list(MOVES)}
  side: "left" or "right", where the actor starts. at: index of the keyword in this scene's keywords when the actor starts, so the action lands on the spoken word; -1 = at the start of the scene.
  Actors stay on the side edges and in the lane above the captions; use them only for what the sentence is about.
- Make the video feel alive: aim for an effect or actors in most scenes and actors in about half of them, whenever the sentence has a subject that can act (a person, an animal, a vehicle, an object that moves).`;

// Errors in one scene's motion (at = "scenes[3]"); keywordCount bounds actors[].at.
export function motionErrors(at, motion, keywordCount) {
  if (motion == null) return [];
  if (typeof motion !== "object" || Array.isArray(motion)) return [`${at}.motion: phải là object { effect, camera, actors }`];
  const errors = [];
  if (motion.effect != null && !EFFECTS[motion.effect]) errors.push(`${at}.motion.effect: "${motion.effect}" không có, chọn một trong ${Object.keys(EFFECTS).join(", ")}`);
  if (motion.camera != null && !CAMERAS[motion.camera]) errors.push(`${at}.motion.camera: "${motion.camera}" không có, chọn một trong ${Object.keys(CAMERAS).join(", ")}`);
  const actors = motion.actors ?? [];
  if (!Array.isArray(actors)) return [...errors, `${at}.motion.actors: phải là mảng`];
  if (actors.length > MAX_ACTORS) errors.push(`${at}.motion.actors: tối đa ${MAX_ACTORS} actor`);
  actors.forEach((a, j) => {
    const p = `${at}.motion.actors[${j}]`;
    if (!KINDS[a?.kind]) return errors.push(`${p}.kind: phải là icon hoặc character`);
    if (!findAsset(KINDS[a.kind], a.name)) errors.push(`${p}.name: không có ${a.kind === "icon" ? "icon" : "nhân vật"} "${a.name}" trong thư viện`);
    if (!MOVES[a.move]) errors.push(`${p}.move: "${a.move}" không có, chọn một trong ${Object.keys(MOVES).join(", ")}`);
    if (!["left", "right"].includes(a.side)) errors.push(`${p}.side: phải là left hoặc right`);
    if (!(a.at === -1 || (Number.isInteger(a.at) && a.at >= 0 && a.at < keywordCount))) errors.push(`${p}.at: phải là -1 hoặc chỉ số trong keywords của cảnh (0–${keywordCount - 1})`);
  });
  return errors;
}

// The usable part of an AI-written motion: unknown effects or cameras dropped, actors kept only when
// every field is valid (planning makes one call, so nothing is sent back to be fixed). Returns
// { motion, dropped } where dropped counts what was removed.
export function cleanMotion(motion, keywordCount) {
  if (!motion || typeof motion !== "object" || Array.isArray(motion)) return { motion: undefined, dropped: motion == null ? 0 : 1 };
  let dropped = 0;
  const out = {};
  if (EFFECTS[motion.effect]) out.effect = motion.effect;
  else if (motion.effect != null) dropped++;
  if (CAMERAS[motion.camera]) out.camera = motion.camera;
  else if (motion.camera != null) dropped++;
  const actors = Array.isArray(motion.actors) ? motion.actors : [];
  out.actors = actors
    .filter((a) => {
      const at = a?.at === -1 || (Number.isInteger(a?.at) && a.at >= 0 && a.at < keywordCount);
      const ok = KINDS[a?.kind] && findAsset(KINDS[a.kind], a.name) && MOVES[a.move] && ["left", "right"].includes(a.side) && at;
      if (!ok) dropped++;
      return ok;
    })
    .slice(0, MAX_ACTORS);
  return { motion: out, dropped };
}

// Library assets a motion uses, as [library kind, name], for copying into the project.
export const motionAssets = (motion) => (motion?.actors || []).filter((a) => KINDS[a.kind]).map((a) => [KINDS[a.kind], a.name]);

// ---------------------------------------------------------------- rendering

// Stable pseudo-random number in [0, 1) for particle i, channel k.
const rnd = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (x) => Math.round(x * 10) / 10;

const HEART = `<svg viewBox="0 0 32 29"><path fill="currentColor" d="M16 29 2.7 15.6A8.5 8.5 0 0 1 14.7 3.5L16 4.8l1.3-1.3a8.5 8.5 0 0 1 12 12.1Z"/></svg>`;
const PALETTE = ["var(--accent)", "var(--accent2)", "#facc15", "#22c55e", "#ec4899", "#38bdf8"];

// Particles of an effect. Each: { el, from, to, dur, at, ease, loop?, phase?, yoyo? } with GSAP vars.
// A looping particle repeats its path until the scene ends; `phase` (0–1) starts it part-way
// along the path so the scene opens already filled instead of waiting for the first wave.
function particles(effect, { W, H, D, t0 }) {
  const P = [];
  const add = (cls, style, tw, html = "") => P.push({ el: `<i class="mo-p ${cls}" style="${style}">${html}</i>`, ...tw });
  const floor = H - CAPTION_H;
  const falling = (n, cls, size, dur, path, extra = () => "") => {
    for (let i = 0; i < n; i++) {
      const s = Math.round(lerp(size[0], size[1], rnd(i, 3)));
      add(cls, `left:0;top:0;width:${s}px;height:${s}px${extra(i, s)}`, { ...path(i), dur: r1(lerp(dur[0], dur[1], rnd(i, 1))), at: 0, ease: "none", loop: true, phase: rnd(i, 2) });
    }
  };
  switch (effect) {
    case "rain":
      for (let i = 0; i < 54; i++) {
        const dur = r1(lerp(0.55, 0.95, rnd(i, 1)));
        const x = Math.round(rnd(i, 0) * (W + 200));
        add("rain", `left:0;top:0;height:${Math.round(lerp(50, 95, rnd(i, 3)))}px`, { from: { x, y: -140 }, to: { x: x - 120, y: H + 40 }, dur, at: 0, ease: "none", loop: true, phase: rnd(i, 2) });
      }
      break;
    case "snow":
      falling(42, "snow", [6, 16], [5, 9], (i) => {
        const x = Math.round(rnd(i, 0) * W);
        return { from: { x, y: -30 }, to: { x: x + Math.round(lerp(-80, 80, rnd(i, 4))), y: H + 30 } };
      });
      break;
    case "leaves":
      falling(18, "leaf", [24, 42], [5, 8], (i) => {
        const x = Math.round(rnd(i, 0) * W);
        return { from: { x, y: -50, rotation: 0 }, to: { x: x + Math.round(lerp(-200, 200, rnd(i, 4))), y: H + 50, rotation: Math.round(lerp(-540, 540, rnd(i, 5))) } };
      }, (i) => `;background:${["#7cb342", "#f9a825", "#ef6c00", "var(--accent)"][i % 4]}`);
      break;
    case "bubbles":
      falling(24, "bubble", [18, 64], [6, 10], (i) => {
        const x = Math.round(rnd(i, 0) * W);
        return { from: { x, y: H + 70 }, to: { x: x + Math.round(lerp(-60, 60, rnd(i, 4))), y: -90 } };
      });
      break;
    case "embers":
      falling(36, "ember", [4, 10], [3, 6], (i) => {
        const x = Math.round(rnd(i, 0) * W);
        return { from: { x, y: Math.round(H * 0.95), opacity: 1 }, to: { x: x + Math.round(lerp(-90, 90, rnd(i, 4))), y: Math.round(H * lerp(0.1, 0.45, rnd(i, 5))), opacity: 0 } };
      });
      break;
    case "wind":
      for (let i = 0; i < 30; i++) {
        const y = Math.round(lerp(0.08, 0.92, rnd(i, 0)) * floor);
        add("wind", `left:0;top:${y}px;width:${Math.round(lerp(120, 320, rnd(i, 3)))}px`, { from: { x: W + 40 }, to: { x: -360 }, dur: r1(lerp(0.5, 0.9, rnd(i, 1))), at: 0, ease: "none", loop: true, phase: rnd(i, 2) });
      }
      break;
    case "hearts":
      for (let i = 0; i < 16; i++) {
        const s = Math.round(lerp(26, 50, rnd(i, 3)));
        const x = Math.round(lerp(0.05, 0.95, rnd(i, 0)) * W);
        add("heart", `left:0;top:0;width:${s}px;height:${s}px;color:${i % 3 ? "#ef4444" : "var(--accent)"}`, {
          from: { x, y: floor, opacity: 0.95, scale: 0.5 },
          to: { x: x + Math.round(lerp(-60, 60, rnd(i, 4))), y: floor - Math.round(lerp(300, 600, rnd(i, 5))), opacity: 0, scale: 1.1 },
          dur: r1(lerp(3, 5, rnd(i, 1))), at: r1(t0 + rnd(i, 2) * 2.5), ease: "power1.out", loop: true,
        }, HEART);
      }
      break;
    case "stars":
      for (let i = 0; i < 34; i++) {
        const s = Math.round(lerp(8, 20, rnd(i, 3)));
        add("star", `left:${Math.round(rnd(i, 0) * W)}px;top:${Math.round(rnd(i, 1) * H * 0.55)}px;width:${s}px;height:${s}px`, {
          from: { opacity: 0.1, scale: 0.6 }, to: { opacity: 0.9, scale: 1 }, dur: r1(lerp(0.6, 1.3, rnd(i, 2))), at: r1(0.2 + rnd(i, 4) * 1.2), ease: "sine.inOut", yoyo: true,
        });
      }
      break;
    case "confetti":
      for (let i = 0; i < 64; i++) {
        const x0 = Math.round(W * lerp(0.3, 0.7, rnd(i, 0)));
        add("confetti", `left:0;top:0;background:${PALETTE[i % PALETTE.length]}`, {
          from: { x: x0, y: -40, rotation: 0, opacity: 1 },
          to: { x: x0 + Math.round(lerp(-W * 0.45, W * 0.45, rnd(i, 2))), y: floor + Math.round(lerp(-200, 120, rnd(i, 3))), rotation: Math.round(lerp(-720, 720, rnd(i, 4))), opacity: 0 },
          dur: r1(lerp(2.4, 3.8, rnd(i, 1))), at: r1(t0 + rnd(i, 5) * 0.4), ease: "power1.out",
        });
      }
      break;
    case "fireworks":
      for (let b = 0; b < 3; b++) {
        const cx = W * [0.22, 0.78, 0.5][b];
        const cy = H * [0.22, 0.26, 0.14][b];
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const rad = lerp(170, 280, rnd(b * 18 + i, 1));
          add("spark", `left:0;top:0;background:${PALETTE[(b + i) % PALETTE.length]}`, {
            from: { x: Math.round(cx), y: Math.round(cy), scale: 1.4, opacity: 1 },
            to: { x: Math.round(cx + Math.cos(a) * rad), y: Math.round(cy + Math.sin(a) * rad + 40), scale: 0.4, opacity: 0 },
            dur: 1.6, at: r1(t0 + b * 0.9), ease: "power1.out",
          });
        }
      }
      break;
    case "magic":
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + rnd(i, 0);
        const rad = lerp(220, 460, rnd(i, 1));
        const s = Math.round(lerp(12, 28, rnd(i, 2)));
        add("star", `left:0;top:0;width:${s}px;height:${s}px`, {
          from: { x: Math.round(W / 2), y: Math.round(H * 0.42), scale: 0.2, opacity: 1, rotation: 0 },
          to: { x: Math.round(W / 2 + Math.cos(a) * rad), y: Math.round(H * 0.42 + Math.sin(a) * rad * 0.6), scale: 1.2, opacity: 0, rotation: 180 },
          dur: r1(lerp(1.1, 1.8, rnd(i, 3))), at: r1(t0), ease: "power3.out",
        });
      }
      break;
  }
  return P;
}

const EFFECT_CSS = (r) => `
        ${r} .mo-front, ${r} .mo-back { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        ${r} .mo-front { z-index: 20; }
        ${r} .mo-p { position: absolute; display: block; opacity: 0; }
        ${r} .mo-p.rain { width: 3px; border-radius: 2px; background: linear-gradient(transparent, var(--accent2)); rotate: 18deg; }
        ${r} .mo-p.snow { border-radius: 50%; background: #fff; box-shadow: 0 0 8px rgba(255, 255, 255, 0.9); }
        ${r} .mo-p.leaf { border-radius: 0 80% 0 80%; }
        ${r} .mo-p.confetti { width: 12px; height: 20px; border-radius: 2px; }
        ${r} .mo-p.spark { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 10px rgba(255, 255, 255, 0.8); }
        ${r} .mo-p.bubble { border-radius: 50%; border: 2px solid var(--accent2); background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.5), transparent 60%); }
        ${r} .mo-p.ember { border-radius: 50%; background: #fbbf24; box-shadow: 0 0 12px #f97316, 0 0 24px #ef4444; }
        ${r} .mo-p.star { background: var(--accent); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); filter: drop-shadow(0 0 6px var(--accent)); }
        ${r} .mo-p.heart svg { width: 100%; height: 100%; display: block; }
        ${r} .mo-p.wind { height: 3px; border-radius: 2px; background: linear-gradient(90deg, transparent, var(--ink)); }
        ${r} .mo-flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
        ${r} .mo-bolt { position: absolute; top: 0; width: 200px; height: 38%; opacity: 0; filter: drop-shadow(0 0 18px #fde047); }
        ${r} .mo-glow { position: absolute; left: 50%; top: 45%; width: 70%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: radial-gradient(circle, var(--glow), transparent 65%); opacity: 0; }
        ${r} .mo-actor { position: absolute; left: 0; top: 0; opacity: 0; }
        ${r} .mo-actor img { width: 100%; height: 100%; display: block; }
        ${r} .mo-actor.flip img { scale: -1 1; }`;

// Peak opacity of each particle kind (they start hidden; the first tween fades them to this).
const PEAK = { rain: 0.45, wind: 0.25, bubble: 0.55, leaf: 0.85 };

// Placement and tweens of one actor. Tween: { img?, from?, to, dur, at, ease, repeat?, yoyo? };
// `img` animates the picture inside the actor box (bobbing), the box itself carries the path.
// Characters (Fluent Emoji) face left, so one walking to the right is flipped.
function actor(a, j, { W, H, D, start, k }) {
  const size = Math.round((a.kind === "character" ? 190 : 140) * k);
  const lane = H - CAPTION_H - size - 10;
  const left = a.side === "left";
  const inset = Math.round(60 * k) + j * (size + 24);
  const cornerX = left ? inset : W - size - inset;
  const end = r1(D - 0.45);
  const T = [];
  const bob = (from, half, amp) => {
    const n = 2 * Math.floor((end - from) / (2 * half)) - 1;
    if (n > 0) T.push({ img: true, from: { y: 0 }, to: { y: -Math.round(amp) }, dur: half, at: r1(from), ease: "sine.inOut", repeat: n, yoyo: true });
  };
  const fadeOut = () => T.push({ to: { opacity: 0 }, dur: 0.35, at: end, ease: "power1.in" });
  let flip = false;
  switch (a.move) {
    case "walk_across":
    case "run_across":
    case "fly_across": {
      const fast = a.move === "run_across";
      const dur = r1(Math.min(Math.max(end - start, fast ? 1.4 : 2.5), fast ? 3 : 7));
      const y = a.move === "fly_across" ? Math.round(60 * k) : lane;
      flip = left && a.kind === "character";
      T.push({ from: { x: left ? -size : W, y, opacity: 1 }, to: { x: left ? W : -size }, dur, at: r1(start), ease: "none" });
      if (a.move === "fly_across") T.push({ img: true, from: { y: -28 }, to: { y: 28 }, dur: 0.8, at: r1(start), ease: "sine.inOut", repeat: Math.max(1, 2 * Math.floor(dur / 1.6) - 1), yoyo: true });
      else bob(start, fast ? 0.14 : 0.28, fast ? 18 : 10);
      break;
    }
    case "peek": {
      const shown = Math.round(left ? -size * 0.25 : W - size * 0.75);
      T.push({ from: { x: left ? -size : W, y: lane, opacity: 1 }, to: { x: shown }, dur: 0.6, at: r1(start), ease: "back.out(1.6)" });
      const n = 2 * Math.floor((end - start - 1.1) / 1.2) - 1;
      if (n > 0) T.push({ img: true, from: { rotation: -6 }, to: { rotation: 6 }, dur: 0.6, at: r1(start + 0.7), ease: "sine.inOut", repeat: n, yoyo: true });
      T.push({ to: { x: left ? -size : W }, dur: 0.4, at: r1(end - 0.1), ease: "power2.in" });
      break;
    }
    case "pop_in":
    case "bounce":
      T.push({ from: { x: cornerX, y: lane, scale: 0, opacity: 1 }, to: { scale: 1 }, dur: 0.5, at: r1(start), ease: "back.out(2.2)" });
      if (a.move === "bounce") bob(start + 0.5, 0.32, 60 * k);
      else bob(start + 0.6, 0.6, 10);
      fadeOut();
      break;
    case "rise":
      T.push({ from: { x: cornerX, y: H + 20, opacity: 1 }, to: { y: lane }, dur: 0.9, at: r1(start), ease: "power3.out" });
      bob(start + 0.9, 0.7, 8);
      fadeOut();
      break;
    case "fall":
      T.push({ from: { x: cornerX, y: -size, opacity: 1 }, to: { y: lane }, dur: 1.1, at: r1(start), ease: "bounce.out" });
      bob(start + 1.2, 0.7, 8);
      fadeOut();
      break;
  }
  return { size, flip, tweens: T };
}

// One tween as GSAP code. Only the first fromTo on an element renders its start values at once;
// later ones wait for their own start time, so they never overwrite an earlier state at build time.
function tween(target, t, first) {
  const to = { ...t.to, duration: t.dur, ease: t.ease, ...(t.repeat > 0 ? { repeat: t.repeat } : {}), ...(t.yoyo ? { yoyo: true } : {}) };
  if (!t.from) return `tl.to(${target}, ${JSON.stringify(to)}, ${t.at});`;
  return `tl.fromTo(${target}, ${JSON.stringify(t.from)}, ${JSON.stringify(first ? to : { ...to, immediateRender: false })}, ${t.at});`;
}

// CSS, layers and script for a scene's motion; null when the scene has none.
// marks: keyword times (scene-local seconds, null when a keyword was not heard).
// Returns { css, back, front, camera, script }: back/front go under/over the frame's content,
// camera is the root tween that replaces fx.js's push-in.
export function motionLayer({ id, D, W, H, marks = [], motion }) {
  if (!motion || typeof motion !== "object") return null;
  const k = Math.min(W, H) / 1080;
  const end = D - 0.45;
  const when = (i) => (Number.isInteger(i) && i >= 0 && marks[i] != null ? marks[i] : 0.6);
  // Effects tied to a moment start on the first keyword (or shortly after the scene starts).
  const t0 = r1(Math.min(when(0), Math.max(0.3, D - 2.5)));
  const effect = EFFECTS[motion.effect] ? motion.effect : "none";
  const front = [];
  const back = [];
  const lines = [];

  particles(effect, { W, H, D, t0 }).forEach((p, i) => {
    front.push(p.el);
    const el = `P[${i}]`;
    const peak = PEAK[p.el.match(/mo-p (\w+)/)[1]] ?? 0.9;
    const from = { ...p.from, opacity: p.from.opacity ?? peak };
    const to = { ...p.to, opacity: p.to.opacity ?? peak };
    if (p.yoyo) {
      const n = 2 * Math.floor((end - p.at) / (2 * p.dur)) - 1;
      lines.push(tween(el, { from, to, dur: p.dur, at: p.at, ease: p.ease, repeat: Math.max(0, n), yoyo: true }, true));
    } else if (p.loop) {
      // Part of the path first (from the phase point), then whole laps until the scene ends.
      const mid = Object.fromEntries(Object.keys(to).map((key) => [key, Math.round(lerp(from[key] ?? 0, to[key], p.phase || 0) * 100) / 100]));
      const head = r1(p.dur * (1 - (p.phase || 0)));
      lines.push(tween(el, { from: p.phase ? mid : from, to, dur: p.phase ? head : p.dur, at: p.at, ease: p.ease }, p.at <= 0));
      const lapStart = r1(p.at + (p.phase ? head : p.dur));
      const laps = Math.floor((end - lapStart) / p.dur);
      if (laps > 0) lines.push(tween(el, { from, to, dur: p.dur, at: lapStart, ease: p.ease, repeat: laps - 1 }, false));
    } else {
      // A burst stays hidden until its moment (no start values rendered before then).
      lines.push(tween(el, { from, to, dur: p.dur, at: p.at, ease: p.ease }, p.at <= 0));
    }
  });
  // Particles still on screen fade with the scene.
  if (front.length) lines.push(`tl.to(P, { opacity: 0, duration: 0.35 }, ${r1(end)});`);

  if (effect === "glow") {
    back.push(`<div class="mo-glow"></div>`);
    const n = 2 * Math.floor((end - 0.3) / 3) - 1;
    lines.push(`tl.fromTo(R.querySelector(".mo-glow"), { opacity: 0, scale: 0.85 }, { opacity: 0.9, scale: 1.05, duration: 1.5, ease: "sine.inOut"${n > 0 ? `, repeat: ${n}, yoyo: true` : ""} }, 0.3);`);
  }
  if (effect === "lightning") {
    front.push(`<div class="mo-flash"></div><svg class="mo-bolt" style="left:${Math.round(W - 240 * k)}px" viewBox="0 0 100 240"><polyline fill="none" stroke="#fef08a" stroke-width="7" stroke-linejoin="round" points="62,0 34,96 58,96 26,240 80,80 54,80 78,0"/></svg>`);
    [[0, 0.85], [0.2, 0.6], [1.5, 0.75]].forEach(([dt, op], n) => {
      const at = r1(t0 + dt);
      if (at > end - 0.2) return;
      lines.push(tween(`R.querySelector(".mo-flash")`, { from: { opacity: op }, to: { opacity: 0 }, dur: 0.35, at, ease: "power2.out" }, n === 0));
      lines.push(tween(`R.querySelector(".mo-bolt")`, { from: { opacity: 1 }, to: { opacity: 0 }, dur: 0.4, at, ease: "power1.in" }, n === 0));
    });
  }

  (Array.isArray(motion.actors) ? motion.actors : [])
    .filter((a) => KINDS[a?.kind] && MOVES[a.move] && a.name)
    .slice(0, MAX_ACTORS)
    .forEach((a, j) => {
      const { size, flip, tweens } = actor(a, j, { W, H, D, start: Math.min(when(a.at), Math.max(0.2, D - 1.6)), k });
      const src = a.kind === "icon" ? `assets/icons/${a.name}.svg` : `assets/characters/${a.name}.svg`;
      front.push(`<div class="mo-actor${flip ? " flip" : ""}" style="width:${size}px;height:${size}px"><img src="${src}" alt="" /></div>`);
      let boxFirst = true;
      let imgFirst = true;
      for (const t of tweens) {
        if (t.img) {
          lines.push(tween(`A[${j}].querySelector("img")`, t, imgFirst));
          imgFirst = false;
        } else {
          lines.push(tween(`A[${j}]`, t, boxFirst));
          if (t.from) boxFirst = false;
        }
      }
    });

  // Camera: --push (scale), --cx (pan) and --crot (rocking) on the scene root.
  const px = (n) => `"${Math.round(n * k)}px"`;
  const camera = {
    push: `tl.fromTo(R, { "--push": 1 }, { "--push": 1.025, duration: ${D}, ease: "none" }, 0);`,
    zoom_in: `tl.fromTo(R, { "--push": 1 }, { "--push": 1.09, duration: ${D}, ease: "power1.inOut" }, 0);`,
    zoom_out: `tl.fromTo(R, { "--push": 1.09 }, { "--push": 1, duration: ${D}, ease: "power1.out" }, 0);`,
    pan_left: `tl.fromTo(R, { "--push": 1.06, "--cx": ${px(40)} }, { "--cx": ${px(-40)}, duration: ${D}, ease: "sine.inOut" }, 0);`,
    pan_right: `tl.fromTo(R, { "--push": 1.06, "--cx": ${px(-40)} }, { "--cx": ${px(40)}, duration: ${D}, ease: "sine.inOut" }, 0);`,
    tilt: `tl.fromTo(R, { "--push": 1.04, "--crot": "-1deg" }, { "--crot": "1deg", duration: 2, ease: "sine.inOut", repeat: ${Math.max(1, 2 * Math.floor(D / 4) - 1)}, yoyo: true }, 0);`,
    shake: `tl.fromTo(R, { "--push": 1 }, { "--push": 1.03, duration: ${D}, ease: "none" }, 0);
          tl.fromTo(R, { "--cx": "0px" }, { "--cx": ${px(14)}, duration: 0.06, ease: "sine.inOut", repeat: 7, yoyo: true, immediateRender: false }, ${t0});`,
    static: "",
  }[CAMERAS[motion.camera] ? motion.camera : "push"];

  return {
    css: EFFECT_CSS(`#${id}-root`),
    back: back.length ? `<div class="mo-back">${back.join("")}</div>` : "",
    front: front.length ? `<div class="mo-front">${front.join("")}</div>` : "",
    camera,
    script: lines.length
      ? `
          const P = R.querySelectorAll(".mo-p");
          const A = R.querySelectorAll(".mo-actor");
          ${lines.join("\n          ")}`
      : "",
  };
}
