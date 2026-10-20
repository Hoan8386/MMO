import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { config, SERVER_DIR } from "./config.js";

let pool;

// Creates the database if needed, applies schema.sql, and opens the shared pool.
export async function initDb() {
  const { database, ...conn } = config.db;
  const admin = await mysql.createConnection({ ...conn, multipleStatements: true });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.changeUser({ database });
  const schema = await fs.readFile(path.join(SERVER_DIR, "sql", "schema.sql"), "utf8");
  await admin.query(schema);
  await admin.end();

  pool = mysql.createPool({ ...config.db, charset: "utf8mb4", connectionLimit: 10 });
  // Jobs live in memory, so anything left mid-flight by a previous run is dead.
  await pool.query(
    "UPDATE videos SET status='error', message='Server khởi động lại khi đang xử lý' WHERE status IN ('generating','rendering')",
  );
}

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
