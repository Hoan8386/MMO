// Shared asset library: illustrations and story characters (Fluent Emoji), brand logos, stock photos
// and cutouts (transparent PNG objects) in storage/library/.
// scripts/download-assets.js fills the folder and manifest.json; the server mirrors it into MySQL
// (assets + topic_assets) and keeps the rows in memory. Scripts without a database read the manifest.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "../config.js";
import { initDb, query } from "../db.js";

export const LIBRARY_DIR = path.join(STORAGE_DIR, "library");
const MANIFEST = path.join(LIBRARY_DIR, "manifest.json");

// Where each kind lands inside a compiled project, and the input types that use it.
export const PROJECT_DIR_OF = { illustration: "assets/icons", logo: "assets/logos", photo: "assets/img", cutout: "assets/cutouts", character: "assets/characters" };
export const KIND_OF_INPUT = { icon: "illustration", icons: "illustration", logo: "logo", cutout: "cutout", character: "character", characters: "character" };

let cache = null;

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    return [];
  }
}

// Every asset: { kind, name, file, label, topics[], common, source, license, credit, source_url }.
export function loadAssets() {
  return (cache ??= readManifest());
}

export const findAsset = (kind, name) => loadAssets().find((a) => a.kind === kind && a.name === name) || null;

// Assets that fit a topic: the common ones plus those linked to it.
export const topicAssets = (topicId, kind) => loadAssets().filter((a) => a.kind === kind && (a.common || a.topics.includes(topicId)));

export const assetPath = (a) => path.join(LIBRARY_DIR, a.file);

// Copies one library asset into a project (file name = what templates reference).
export async function copyAsset(dir, a) {
  const dest = path.join(dir, PROJECT_DIR_OF[a.kind], path.basename(a.file));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(assetPath(a), dest);
}

// Upserts manifest.json into MySQL and drops assets that left the manifest (rejected photos).
// Topic links are only added, never removed, so links made in the database survive a re-download.
export async function syncAssetsToDb({ force = false } = {}) {
  const list = readManifest();
  if (!list.length) return 0;
  await initDb({ resetJobs: false });
  // Nothing new since the last sync (the server runs this at every start).
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM assets");
  if (!force && n >= list.length) return 0;
  for (const a of list) {
    await query(
      `INSERT INTO assets (kind, name, file, label, common, source, license, credit, source_url, width, height) VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE file=VALUES(file), label=VALUES(label), source=VALUES(source), license=VALUES(license), credit=VALUES(credit), source_url=VALUES(source_url), width=VALUES(width), height=VALUES(height)`,
      [a.kind, a.name, a.file, a.label, a.common ? 1 : 0, a.source, a.license, a.credit, a.source_url, a.width ?? null, a.height ?? null],
    );
    if (a.topics.length) {
      const [{ id }] = await query("SELECT id FROM assets WHERE kind=? AND name=?", [a.kind, a.name]);
      await query(`INSERT IGNORE INTO topic_assets (topic_id, asset_id) VALUES ${a.topics.map(() => "(?,?)").join(",")}`, a.topics.flatMap((t) => [t, id]));
    }
  }
  const keep = new Set(list.map((a) => `${a.kind}:${a.name}`));
  const gone = (await query("SELECT id, kind, name FROM assets")).filter((r) => !keep.has(`${r.kind}:${r.name}`)).map((r) => r.id);
  if (gone.length) await query(`DELETE FROM assets WHERE id IN (${gone.map(() => "?").join(",")})`, gone);
  return list.length;
}

// Reloads the in-memory list from MySQL (server only).
export async function refreshAssets() {
  const rows = await query(
    `SELECT a.*, GROUP_CONCAT(ta.topic_id) AS topic_ids FROM assets a LEFT JOIN topic_assets ta ON ta.asset_id = a.id GROUP BY a.id ORDER BY a.kind, a.name`,
  );
  cache = rows.map(({ topic_ids, common, created_at, ...a }) => ({ ...a, common: !!common, topics: topic_ids ? topic_ids.split(",") : [] }));
  return cache;
}
