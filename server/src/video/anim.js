// Bridge to the Motion Canvas animation library (server/motion/). The frame "anim-clip" shows one
// library component; this module lists the components the planner may use, checks the AI's
// choice against each component's own prop schema, and renders the clips at compile time.
//
// Motion Canvas and HyperFrames never share a runtime: a component is rendered headless into a
// transparent VP9 WebM at the scene's exact length, design-canvas size and topic colours, then
// played by a <video> inside the scene. Renders are cached by the hash of everything that
// changes their frames (storage/anim-cache/<hash>.webm), so re-building a video is free.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../config.js";

const ANIMLIB = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../../motion");
const CACHE = path.join(STORAGE_DIR, "anim-cache");
export const ANIM_ENGINE = "motion-canvas";
// Components the AI may pick: they rendered and passed tests/run.mjs ("dev" ones are left out).
const USABLE = ["tested", "ready"];

let lib = null;
async function load() {
  if (lib) return lib;
  if (!fs.existsSync(path.join(ANIMLIB, "registry", "registry.mjs"))) return (lib = { missing: true });
  const url = (f) => new URL(`file:///${path.join(ANIMLIB, f).replace(/\\/g, "/")}`).href;
  const [registry, search, schema] = await Promise.all(["registry/registry.mjs", "registry/search.mjs", "registry/schema.mjs"].map((f) => import(url(f))));
  lib = { registry, search, schema, render: () => import(url("renderer/render.mjs")) };
  return lib;
}
// Loaded once at start so the synchronous helpers below can be used by loadFrames and the validator.
await load();

export const animIds = () => (lib.missing ? [] : lib.registry.listComponents({ status: USABLE }).map((c) => c.id));

// Components of the video's type: those whose category or tags meet the topic's tags (main tags
// count double), like frames. Returns [{ component, score }] best first; no topic = every component.
export function animForTopic(topic, { status = USABLE } = {}) {
  if (lib.missing) return [];
  const list = lib.registry.listComponents({ status });
  if (!topic) return list.map((c) => ({ component: c, score: 0 }));
  const main = new Set(topic.default_tags || []), related = new Set(topic.related_tags || []);
  return list
    .map((c) => {
      const keys = new Set([c.category, ...c.tags].map((t) => String(t).toLowerCase()));
      const score = [...keys].reduce((n, t) => n + (main.has(t) ? 2 : related.has(t) ? 1 : 0), 0);
      return { component: c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.component.id.localeCompare(b.component.id));
}

// What the planner sends to the AI for one video: the components of the topic's type, the ones the
// material talks about first, at most k (metadata only, never code).
export function animCatalog(material, topic, { k = 8 } = {}) {
  if (lib.missing) return { ids: [], prompt: "" };
  const text = lib.search.searchComponents(material, { k: 999, min: 0, status: USABLE }).matches;
  const relevance = Object.fromEntries(text.map((m) => [m.id, m.score]));
  const ids = animForTopic(topic)
    .map(({ component: c, score }) => ({ id: c.id, rank: (relevance[c.id] || 0) + score }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, k)
    .map((x) => x.id);
  return { ids, prompt: ids.length ? lib.search.describeForPrompt(ids) : "" };
}

// Parses the props JSON text the AI wrote. Returns { props, errors }.
export function parseAnimInputs(inputs) {
  if (lib.missing) return { props: {}, errors: ["thư viện server/motion không tìm thấy"] };
  const comp = lib.registry.getComponent(inputs.component);
  if (!comp) return { props: {}, errors: [`component "${inputs.component}" không có trong thư viện`] };
  if (!USABLE.includes(comp.status)) return { props: {}, errors: [`component "${inputs.component}" chưa qua kiểm thử`] };
  let raw = {};
  if (inputs.props) {
    try {
      raw = JSON.parse(inputs.props);
    } catch (e) {
      return { props: {}, errors: [`props không phải JSON hợp lệ: ${e.message}`] };
    }
  }
  return lib.schema.validateProps(comp.inputs, raw);
}

// One render at a time (video builds and preview renders share one headless browser).
let chain = Promise.resolve();
const exclusive = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

export const MOTION_DIR = ANIMLIB;
export const listAnimations = () => (lib.missing ? [] : lib.registry.listComponents());
export const getAnimation = (id) => (lib.missing ? null : lib.registry.getComponent(id));
export const validateAnimProps = (id, props) => {
  const c = getAnimation(id);
  return c ? lib.schema.validateProps(c.inputs, props) : { props: {}, errors: [`component "${id}" không có trong thư viện`] };
};
export const searchAnimations = (text) => (lib.missing ? [] : lib.search.searchComponents(text, { k: 12, status: ["dev", "tested", "ready"] }).matches);

// Sets a component's status (the web UI's "approve" button moves tested → ready) and reloads the registry.
export function setAnimStatus(id, status) {
  if (!lib.registry.STATUSES.includes(status)) throw new Error(`Trạng thái phải là ${lib.registry.STATUSES.join(", ")}`);
  lib.registry.updateMeta(id, { status });
  lib.registry.loadRegistry({ fresh: true });
  return getAnimation(id);
}

// A trial render from the web UI: one component with the given props, in a topic's colours and a
// format's scene canvas. Cached like video clips. Returns the clip's path under storage/.
export function renderAnimTrial({ component, props, duration, width, height, theme, background }) {
  return exclusive(async () => {
    const { renderJob, jobHash, prepareJob, encode, closeBrowser, ensureBuild } = await lib.render();
    await ensureBuild();
    const job = { component, props, duration, fps: 30, width, height, theme, background, safe: { top: 60, right: 90, bottom: 280, left: 90 } };
    const key = jobHash(prepareJob(job, { lenient: true }));
    const dir = path.join(CACHE, "trials");
    const out = path.join(dir, `${key}.webm`);
    if (!fs.existsSync(out)) {
      await fsp.mkdir(dir, { recursive: true });
      const tmp = path.join(dir, `${key}.frames`);
      try {
        const m = await renderJob(job, tmp, { lenient: true });
        if (!m.ok) throw new Error(m.errors.join(" | "));
        await encode(tmp, job.fps, out);
      } finally {
        await fsp.rm(tmp, { recursive: true, force: true });
        await closeBrowser();
      }
    }
    return `anim-cache/trials/${key}.webm`;
  });
}

// Renders every anim-clip scene of a timeline into <dir>/assets/anim/<scene id>.webm.
// geometry: { width, height } of the scene design canvas; theme: the topic colours.
export function renderAnimScenes(dir, scenes, { width, height, theme, onLog = () => {} }) {
  const jobs = scenes
    .filter((s) => s.frame.engine === ANIM_ENGINE)
    .map((sc) => {
      const { props, errors } = parseAnimInputs(sc.inputs);
      if (errors.length) throw new Error(`${sc.id} (${sc.inputs.component}): ${errors.join("; ")}`);
      // Captions own the bottom band of every scene (see frames/README.md).
      return { id: sc.id, component: sc.inputs.component, props, duration: sc.duration, width, height, theme, safe: { top: 60, right: 90, bottom: 280, left: 90 }, cues: sc.props.marks, speech: [sc.props.vo, sc.props.voEnd] };
    });
  return renderAnimClips(dir, jobs, { onLog });
}

// Renders clips into <dir>/assets/anim/<id>.webm, each lasting exactly its scene (cached by the hash
// of everything that changes its frames). jobs: [{ id, component, props, duration, width, height,
// safe, theme, cues, speech }]. Used by explainer videos (anim-clip) and long videos.
export function renderAnimClips(dir, jobs, { onLog = () => {} } = {}) {
  if (!jobs.length) return Promise.resolve();
  return exclusive(async () => {
    const { renderJob, jobHash, prepareJob, encode, closeBrowser, ensureBuild } = await lib.render();
    await ensureBuild();
    await fsp.mkdir(path.join(dir, "assets", "anim"), { recursive: true });
    await fsp.mkdir(CACHE, { recursive: true });
    try {
      for (const { id, ...rest } of jobs) {
        const job = { ...rest, fps: 30, duration: Math.round(rest.duration * 1000) / 1000 };
        const key = jobHash(prepareJob(job, { lenient: true }));
        const cached = path.join(CACHE, `${key}.webm`);
        if (!fs.existsSync(cached)) {
          onLog(`Render animation ${id}: ${job.component} (${job.duration}s)`);
          const tmp = path.join(CACHE, `${key}.frames`);
          try {
            const m = await renderJob(job, tmp, { lenient: true });
            if (!m.ok) throw new Error(`${id} (${job.component}): ${m.errors.join(" | ")}`);
            await encode(tmp, job.fps, cached);
          } finally {
            await fsp.rm(tmp, { recursive: true, force: true });
          }
        }
        await fsp.copyFile(cached, path.join(dir, "assets", "anim", `${id}.webm`));
      }
    } finally {
      await closeBrowser();
    }
  });
}
