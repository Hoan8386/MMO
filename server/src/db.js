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
