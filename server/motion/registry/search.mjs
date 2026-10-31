// Finds the components that fit a piece of script, so a prompt only carries those (never the
// whole library, never source code).
//
// Matching is lexical but bilingual and accent-insensitive: every component lists `tags` and
// `keywords` (Vietnamese and English phrases a script would use for that phenomenon). A phrase
// found in the text scores by its length in words (a precise phrase beats a loose word); words of
// the name and description add a little. No match above the threshold = "no component yet".
//
//   npm --prefix server run anim:search -- "Trái Đất quay quanh Mặt Trời và tự quay quanh trục"
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listComponents } from "./registry.mjs";
import { describeInputs } from "./schema.mjs";
import { COMMON_INPUTS, withCommon } from "./common.mjs";

// A component's own inputs (the shared ones are described once per prompt, not per component).
const withoutCommon = (c) => Object.fromEntries(Object.entries(c.inputs).filter(([k]) => !(k in COMMON_INPUTS) || !withCommon({ common: c.common, inputs: {} }).inputs[k]));

// Lower case, no Vietnamese accents (đ → d), only letters/digits and single spaces.
export const fold = (s) =>
  ` ${String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const STOP = new Set(["va", "la", "cua", "cac", "nhung", "mot", "cho", "voi", "trong", "the", "and", "of", "a", "an", "to", "in", "khi", "duoc", "co", "nay", "do"]);

function score(c, text) {
  let s = 0;
  const hits = [];
  // Subtopics ("Accretion Disk · Event Horizon") count as phrases too.
  const subs = String(c.subtopic || "").split(/[·,]/).map((x) => x.trim()).filter(Boolean);
  const seen = new Set();
  for (const phrase of [...(c.keywords || []), ...c.tags, ...subs, c.name, c.id.replace(/_/g, " ")]) {
    const f = fold(phrase);
    // The same phrase listed in keywords and tags counts once.
    if (seen.has(f)) continue;
    seen.add(f);
    const words = f.trim().split(" ").filter((w) => w && !STOP.has(w));
    if (!words.length) continue;
    if (text.includes(f)) {
      s += 2 + words.length * 2;
      hits.push(phrase);
    }
  }
  // Variants (a planet, a mode…): their names and keywords are phrases too; the best one is suggested.
  let variant = null, best = 0;
  for (const v of c.variants || []) {
    let vs = 0;
    for (const phrase of [v.name, ...(v.keywords || [])]) {
      const f = fold(phrase);
      if (f.trim() && text.includes(f)) vs += 2 + f.trim().split(" ").length * 2;
    }
    if (vs > best) (best = vs), (variant = v.id);
  }
  if (variant) {
    s += best;
    hits.push(`biến thể ${variant}`);
  }
  // Loose evidence: single meaningful words of the description.
  for (const w of new Set(fold(c.description).trim().split(" "))) if (w.length > 3 && !STOP.has(w) && text.includes(` ${w} `)) s += 0.3;
  return { s, hits, variant };
}

// Returns { matches: [{ id, score, hits, ...summary }], missing: bool }.
export function searchComponents(text, { k = 6, min = 4, status = ["tested", "ready", "dev"] } = {}) {
  const t = fold(text);
  const matches = listComponents({ status })
    .map((c) => ({ c, ...score(c, t) }))
    .filter((m) => m.s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ c, s, hits, variant }) => ({ id: c.id, name: c.name, category: c.category, domain: c.domain || null, topic: c.topic || null, status: c.status, score: Math.round(s * 10) / 10, hits, variant }));
  return { matches, missing: matches.length === 0 };
}

// Prompt block for the planner: one entry per component, metadata only.
export function describeForPrompt(ids) {
  const all = new Map(listComponents().map((c) => [c.id, c]));
  const list = ids.map((id) => all.get(id)).filter(Boolean);
  const lines = list.map((c) => {
    const variants = (c.variants || []).length ? ` Variants (ready-made props to start from): ${c.variants.map((v) => `${v.name} ${JSON.stringify(v.props)}`).join("; ")}.` : "";
    const shared = c.common ? ` Shared props: ${withCommon({ common: c.common, inputs: {} }).inputs ? Object.keys(withCommon({ common: c.common, inputs: {} }).inputs).join(", ") : ""}.` : "";
    return `- ${c.id} (${c.name}; ${c.domain ? `${c.domain}/${c.topic}; ` : ""}${c.duration.min}-${c.duration.max}s${c.styles ? `; style ${c.styles.join(", ")}` : ""}): ${c.description} Props: ${describeInputs(withoutCommon(c))}.${shared}${variants}${c.cues ? ` Cues: ${c.cues}` : ""}${c.accuracy ? ` Model: ${c.accuracy}` : ""}${c.limitations ? ` Limits: ${c.limitations}` : ""}`;
  });
  // The shared props, described once.
  if (list.some((c) => c.common)) lines.push(`Shared props of the components above (only those each one lists): ${describeInputs(COMMON_INPUTS)}.`);
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = process.argv.slice(2).join(" ");
  const r = searchComponents(text);
  if (r.missing) console.log("Không có component phù hợp — cần phát triển component mới hoặc dùng frame HyperFrames thay thế.");
  for (const m of r.matches) console.log(`${m.score.toString().padStart(5)}  ${m.id}  [${m.category}, ${m.status}]  ← ${m.hits.join(", ")}`);
}
