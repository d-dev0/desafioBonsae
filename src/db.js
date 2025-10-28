import pkg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config.env from project root
dotenv.config({ path: path.resolve(__dirname, "../config.env") });
const { Pool } = pkg;

// Prefer DATABASE_URL if provided; otherwise, build from discrete vars with sane fallbacks
const connectionString = process.env.DATABASE_URL;

const host = process.env.DB_HOST || process.env.PGHOST || "localhost";
const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
const user = String(process.env.DB_USER || process.env.PGUSER || "postgres");
const rawPass = process.env.DB_PASS ?? process.env.PGPASSWORD;
const password = String(rawPass || "");
const database = String(process.env.DB_NAME || process.env.PGDATABASE || "postgres");

// Build config safely - always include password as string to avoid SCRAM errors
const baseConfig = connectionString
  ? { connectionString }
  : { host, port, user, password, database };

export const pool = new Pool(baseConfig);
