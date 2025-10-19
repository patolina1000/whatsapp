import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import multer from "multer";
import pkg from "pg";

const { Pool } = pkg;

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedImageTypes = ["image/jpeg", "image/png"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = allowedImageTypes.includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido. Use JPG/JPEG ou PNG."), ok);
  },
});

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

app.post("/api/admin/media", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  const extension = req.file.mimetype === "image/png" ? ".png" : ".jpg";

  res.json({
    ok: true,
    mimetype: req.file.mimetype,
    extension,
    size: req.file.size,
  });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.message === "Formato inválido. Use JPG/JPEG ou PNG.") {
    return res.status(400).json({ error: err.message });
  }

  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Arquivo excede o limite permitido." });
  }

  console.error(err);
  return res.status(500).json({ error: "unexpected" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("server on", PORT);
});
