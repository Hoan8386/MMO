// Writes registry/registry.json: the metadata of every component that has code, a valid schema
// and a valid example (no source code). Readers that do not scan the folder (the web UI, other
// tools) use this file. Prints the components that were left out and why.
//
//   npm --prefix server run anim:registry
import fs from "node:fs";
import path from "node:path";
import { loadRegistry, ROOT } from "./registry.mjs";

const { components, problems } = loadRegistry({ fresh: true });
const list = [...components.values()].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
fs.writeFileSync(path.join(ROOT, "registry", "registry.json"), JSON.stringify({ count: list.length, components: list }, null, 2) + "\n");
const by = {};
for (const c of list) (by[c.category] ||= []).push(`${c.id} [${c.status}]`);
for (const [cat, ids] of Object.entries(by)) console.log(`${cat}: ${ids.join(", ")}`);
if (problems.length) console.log(`\nKhông đưa vào registry:\n- ${problems.join("\n- ")}`);
console.log(`\n${list.length} component → registry/registry.json`);
