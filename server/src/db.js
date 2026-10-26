import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { config, SERVER_DIR } from "./config.js";

let pool;

// Creates the database if needed, applies schema.sql, and opens the shared pool.
// Scripts that run beside the server pass resetJobs: false so they leave running jobs alone.
export async function initDb({ resetJobs = true } = {}) {
  if (pool) return;
  const { database, ...conn } = config.db;
  const admin = await mysql.createConnection({ ...conn, multipleStatements: true });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.changeUser({ database });
  const schema = await fs.readFile(path.join(SERVER_DIR, "sql", "schema.sql"), "utf8");
  await admin.query(schema);
  // Columns added after a table first shipped (CREATE TABLE IF NOT EXISTS skips existing tables).
  const [hasTopic] = await admin.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='projects' AND COLUMN_NAME='topic'",
    [database],
  );
  if (!hasTopic.length) await admin.query("ALTER TABLE projects ADD COLUMN topic VARCHAR(50) NOT NULL DEFAULT 'technology' AFTER channel");
  const [hasMode] = await admin.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='projects' AND COLUMN_NAME='mode'",
    [database],
  );
  const [hasBilling] = await admin.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_calls' AND COLUMN_NAME='billing'",
    [database],
  );
  if (!hasBilling.length) await admin.query("ALTER TABLE ai_calls ADD COLUMN billing ENUM('token','request') NOT NULL DEFAULT 'token' AFTER model");
  if (!hasMode.length) await admin.query("ALTER TABLE projects ADD COLUMN mode ENUM('explainer','animation') NOT NULL DEFAULT 'explainer' AFTER slug");
  const [kind] = await admin.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='assets' AND COLUMN_NAME='kind'",
    [database],
  );
  if (kind.length && !kind[0].t.includes("'character'"))
    await admin.query("ALTER TABLE assets MODIFY kind ENUM('illustration','logo','photo','cutout','character') NOT NULL");
  const [hasAutoImages] = await admin.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='projects' AND COLUMN_NAME='auto_images'",
    [database],
  );
  if (!hasAutoImages.length) await admin.query("ALTER TABLE projects ADD COLUMN auto_images INT NOT NULL DEFAULT 1 AFTER height");
  const [hasDescription] = await admin.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='projects' AND COLUMN_NAME='description'",
    [database],
  );
  if (!hasDescription.length) await admin.query("ALTER TABLE projects ADD COLUMN description VARCHAR(500) NULL AFTER auto_images");
  // Background music (music.js): the project's choice and each topic's style note and volume.
  const hasColumn = async (table, column) =>
    (await admin.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?", [database, table, column]))[0].length > 0;
  if (!(await hasColumn("projects", "music"))) await admin.query("ALTER TABLE projects ADD COLUMN music VARCHAR(20) NULL AFTER description");
  if (!(await hasColumn("topics", "music_style"))) await admin.query("ALTER TABLE topics ADD COLUMN music_style VARCHAR(500) NULL AFTER theme");
  if (!(await hasColumn("music_tracks", "source_url"))) await admin.query("ALTER TABLE music_tracks ADD COLUMN source_url VARCHAR(500) NULL AFTER duration");
  if (!(await hasColumn("topics", "music_volume"))) await admin.query("ALTER TABLE topics ADD COLUMN music_volume DECIMAL(4,2) NOT NULL DEFAULT 0.15 AFTER music_style");
  const [jobType] = await admin.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='jobs' AND COLUMN_NAME='type'",
    [database],
  );
  if (jobType.length && !jobType[0].t.includes("'images'")) await admin.query("ALTER TABLE jobs MODIFY type ENUM('plan','build','render','images') NOT NULL");
  await admin.end();

  pool = mysql.createPool({ ...config.db, charset: "utf8mb4", connectionLimit: 10 });
  if (!resetJobs) return;
  // Jobs live in memory, so anything left mid-flight by a previous run is dead.
  await pool.query(
    "UPDATE projects SET status='failed', message='Server khởi động lại khi đang xử lý' WHERE status IN ('planning','building','rendering')",
  );
  await pool.query("UPDATE jobs SET status='failed', error='Server khởi động lại', finished_at=NOW() WHERE status IN ('queued','running')");
}

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
