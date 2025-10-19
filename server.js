import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pkg from "pg";

const { Pool } = pkg;

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function ensureState() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rr_state (
      id      INT PRIMARY KEY DEFAULT 1,
      counter BIGINT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    INSERT INTO rr_state (id, counter) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}

ensureState().catch(console.error);

app.use(express.static(__dirname));

app.get("/health", (_req, res) => res.send("ok"));

app.get("/api/next-number", async (req, res) => {
  try {
    const n = Math.max(1, Math.min(1000, parseInt(req.query.n || "1", 10) || 1));
    const { rows } = await pool.query(
      `UPDATE rr_state SET counter = counter + 1 WHERE id = 1 RETURNING counter;`
    );
    const cnt = Number(rows[0].counter);
    const index = ((cnt - 1) % n + n) % n;
    res.set("Cache-Control", "no-store");
    res.json({ index });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "unexpected" });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("server on", PORT);
});
