import pkg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../config.env") });
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;
const [host, port, user, password, database] = [
  process.env.DB_HOST || process.env.PGHOST || "localhost",
  Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  String(process.env.DB_USER || process.env.PGUSER || "postgres"),
  String((process.env.DB_PASS ?? process.env.PGPASSWORD) || ""),
  String(process.env.DB_NAME || process.env.PGDATABASE || "postgres")
];

export const pool = new Pool(connectionString ? { connectionString } : { host, port, user, password, database });
