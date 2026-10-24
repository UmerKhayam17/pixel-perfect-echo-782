import { Router } from "express";
import { config } from "../config.js";
import { backupPath, createBackup, listBackups } from "../services/backup.js";

// Admin only (mounted behind requireAdmin). Restoring is deliberately CLI-only: `npm run restore`.
export const backupsRouter = Router();

backupsRouter.get("/", (_req, res) => {
  res.json({ enabled: config.backup.enabled, keepDays: config.backup.keepDays, dir: config.backup.dir, backups: listBackups() });
});

backupsRouter.post("/", async (_req, res) => {
  res.status(201).json(await createBackup("manual"));
});

backupsRouter.get("/:name/download", (req, res) => {
  const file = backupPath(req.params.name);
  if (!file) return res.status(404).json({ error: "Backup not found" });
  res.download(file, req.params.name);
});
