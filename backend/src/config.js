import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scraperDir = path.join(root, "scraper");

function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venvPython =
    process.platform === "win32"
      ? path.join(scraperDir, ".venv", "Scripts", "python.exe")
      : path.join(scraperDir, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) return venvPython;
  return process.platform === "win32" ? "python" : "python3";
}

export const config = {
  root,
  port: Number(process.env.PORT ?? 5000),
  // Only this computer can reach the API by default; set HOST=0.0.0.0 to share it on your network.
  // Empty = both loopback addresses (127.0.0.1 and ::1), since "localhost" may resolve to either.
  host: process.env.HOST || "",
  // Encrypts saved passwords and API keys. Falls back to a generated key file (.app-secret).
  appSecret: process.env.APP_SECRET || "",
  // Set to "true" when the app is served over HTTPS so cookies are only sent encrypted.
  cookieSecure: process.env.COOKIE_SECURE === "true",
  // "none" is needed when the frontend and API are on different domains (requires HTTPS).
  cookieSameSite: ["strict", "lax", "none"].includes(process.env.COOKIE_SAMESITE) ? process.env.COOKIE_SAMESITE : "lax",
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  // Staff activity log retention.
  auditRetentionDays: Math.max(7, Number(process.env.AUDIT_RETENTION_DAYS ?? 180)),
  backup: {
    enabled: process.env.BACKUP_ENABLED !== "false",
    dir: process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(root, "backups"),
    keepDays: Math.max(1, Number(process.env.BACKUP_KEEP_DAYS ?? 14)),
  },
  // Admin account created on startup if it doesn't exist yet (see services/bootstrap.js).
  admin: {
    name: (process.env.ADMIN_NAME ?? "").trim(),
    email: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? "",
  },
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/leadfinder",
  corsOrigin: (process.env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()),
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY || "",
  headless: process.env.SCRAPER_HEADLESS !== "false",
  pythonBin: resolvePython(),
  scraperDir,
  scraperEntry: path.join(scraperDir, "main.py"),
};
