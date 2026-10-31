// The component registry: every components/<category>/<id>/meta.json, checked against the code
// on disk. A component without index.tsx, or whose example does not validate, is not listed —
// the registry only ever names components that can actually render.
// registry.json (written by build.mjs) is the same list for readers that do not scan the folder.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProps, schemaErrors } from "./schema.mjs";
import { withCommon } from "./common.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COMPONENTS_DIR = path.join(ROOT, "components");
export const PREVIEWS_DIR = path.join(ROOT, "previews");
export const STATUSES = ["dev", "tested", "ready"];
const REQUIRED = ["id", "name", "category", "description", "tags", "duration", "inputs", "version", "renderer", "output", "status"];
// Science library fields (optional, used for browsing and AI search): domain, topic, subtopic,
// styles, dimension, palette, limitations, example_usage, common (shared inputs, common.mjs).
export const DOMAINS = ["astronomy", "mathematics", "biology", "physics"];
export const STYLES = ["cinematic", "scientific", "3d", "educational", "infographic", "minimalist", "futuristic", "organic"];

let cache = null;

// Scans the folder. Returns { components: Map(id → entry), problems: [] }.
export function scan() {
  const components = new Map();
  const problems = [];
  for (const cat of fs.readdirSync(COMPONENTS_DIR)) {
    const catDir = path.join(COMPONENTS_DIR, cat);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const id of fs.readdirSync(catDir)) {
      const dir = path.join(catDir, id);
      const metaFile = path.join(dir, "meta.json");
      if (!fs.existsSync(metaFile)) continue;
      const errs = [];
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      } catch (e) {
        problems.push(`${cat}/${id}: meta.json lỗi — ${e.message}`);
        continue;
      }
      for (const k of REQUIRED) if (meta[k] == null) errs.push(`thiếu "${k}"`);
      if (meta.id !== id) errs.push(`id "${meta.id}" phải trùng tên thư mục`);
      if (meta.category !== cat) errs.push(`category "${meta.category}" phải trùng thư mục ${cat}`);
      if (!STATUSES.includes(meta.status)) errs.push(`status phải là ${STATUSES.join("|")}`);
      if (meta.domain != null && !DOMAINS.includes(meta.domain)) errs.push(`domain phải là ${DOMAINS.join("|")}`);
      for (const st of meta.styles || []) if (!STYLES.includes(st)) errs.push(`style "${st}" không có — chọn trong ${STYLES.join(", ")}`);
      if (meta.common) {
        const { inputs, unknown } = withCommon(meta);
        for (const n of unknown) errs.push(`common "${n}" không có trong registry/common.mjs`);
        meta.inputs = inputs;
      }
      if (!fs.existsSync(path.join(dir, "index.tsx"))) errs.push("thiếu index.tsx (component chưa có mã render)");
      errs.push(...schemaErrors(meta.inputs));
      let example = null;
      const exFile = path.join(dir, "example.json");
      if (!fs.existsSync(exFile)) errs.push("thiếu example.json");
      else {
        example = JSON.parse(fs.readFileSync(exFile, "utf8"));
        errs.push(...validateProps(meta.inputs, example.props).errors.map((e) => `example: ${e}`));
      }
      // Variants: named configurations (a planet, a mode, a sub-structure) the gallery previews one by
      // one and the AI picks from. Each must validate like the example.
      const variants = Array.isArray(meta.variants) ? meta.variants : [];
      const seen = new Set();
      for (const v of variants) {
        if (!v.id || !v.name || typeof v.props !== "object") errs.push(`variant cần id, name, props`);
        else if (seen.has(v.id)) errs.push(`variant "${v.id}" trùng`);
        else {
          seen.add(v.id);
          errs.push(...validateProps(meta.inputs, v.props).errors.map((e) => `variant ${v.id}: ${e}`));
        }
      }
      if (components.has(id)) errs.push(`trùng id với ${components.get(id).category}/${id}`);
      if (errs.length) {
        problems.push(...errs.map((e) => `${cat}/${id}: ${e}`));
        continue;
      }
      const preview = ["webm", "png"].map((x) => `${id}.${x}`).filter((f) => fs.existsSync(path.join(PREVIEWS_DIR, f)));
      components.set(id, {
        ...meta,
        variants: variants.map((v) => {
          const f = `${id}--${v.id}`;
          const pv = ["webm", "png"].filter((x) => fs.existsSync(path.join(PREVIEWS_DIR, `${f}.${x}`))).map((x) => `previews/${f}.${x}`);
          return { ...v, preview: pv.length ? pv : null };
        }),
        example,
        preview: preview.length ? preview.map((f) => `previews/${f}`) : null,
        docs: fs.existsSync(path.join(dir, "README.md")) ? `components/${cat}/${id}/README.md` : null,
        dir: `components/${cat}/${id}`,
      });
    }
  }
  // combines_with may name components not built yet: keep only real ones, list the rest as wanted.
  for (const c of components.values()) {
    const all = c.combines_with || [];
    c.combines_with = all.filter((id) => components.has(id));
    c.wanted = all.filter((id) => !components.has(id));
  }
  return { components, problems };
}

export function loadRegistry({ fresh = false } = {}) {
  if (!cache || fresh) cache = scan();
  return cache;
}

export const getComponent = (id) => loadRegistry().components.get(id) || null;
export const listComponents = ({ status } = {}) => [...loadRegistry().components.values()].filter((c) => !status || [status].flat().includes(c.status));

// Writes a field back into a component's meta.json (the test runner uses it for "status").
export function updateMeta(id, patch) {
  const c = getComponent(id);
  if (!c) return;
  const file = path.join(ROOT, c.dir, "meta.json");
  const meta = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...meta, ...patch }, null, 2) + "\n");
}
