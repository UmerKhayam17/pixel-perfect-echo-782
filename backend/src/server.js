import http from "node:http";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { config } from "./config.js";
import { csrfGuard, loadSession, requireAdmin, requireAuth, securityHeaders } from "./middleware/auth.js";
import { migrateLeads } from "./models/Lead.js";
import { migrateSearches } from "./models/Search.js";
import { getSettings, migrateSettings } from "./models/Settings.js";
import { backupsRouter } from "./routes/backups.js";
import { exportsRouter } from "./routes/exports.js";
import { importsRouter } from "./routes/imports.js";
import { activitiesRouter } from "./routes/activities.js";
import { auditRouter } from "./routes/audit.js";
import { notificationsRouter } from "./routes/notifications.js";
import { reportsRouter } from "./routes/reports.js";
import { startTaskReminders } from "./services/notify.js";
import { auditTrail } from "./services/audit.js";
import { authRouter } from "./routes/auth.js";
import { campaignsRouter, suppressionsRouter } from "./routes/campaigns.js";
import { leadsRouter } from "./routes/leads.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { searchesRouter } from "./routes/searches.js";
import { sendersRouter } from "./routes/senders.js";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { tasksRouter } from "./routes/tasks.js";
import { templatesRouter } from "./routes/templates.js";
import { usersRouter } from "./routes/users.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { startBackupSchedule } from "./services/backup.js";
import { bootstrapAdmin } from "./services/bootstrap.js";
import { encryptStoredSecrets } from "./services/secrets.js";
import { startMailer } from "./services/email.js";
import { startReplyWatcher } from "./services/replies.js";
import { markOrphanedSearches } from "./services/scrapeRunner.js";

const app = express();
app.disable("x-powered-by");
// The frontend server forwards /api from this computer; trust its X-Forwarded-For so req.ip is the
// visitor's real address. Forwarded headers from anywhere else are ignored.
app.set("trust proxy", "loopback");
app.use(securityHeaders);
// Credentials (the session cookie) are only accepted from the configured frontend origins.
app.use(cors({ origin: config.corsOrigin.includes("*") ? true : config.corsOrigin, credentials: true }));
// Imports send whole spreadsheets; everything else stays small.
const jsonSmall = express.json({ limit: "1mb" });
const jsonLarge = express.json({ limit: "30mb" });
app.use((req, res, next) => (req.path.startsWith("/api/imports") ? jsonLarge : jsonSmall)(req, res, next));
app.use("/api", csrfGuard);
app.use("/api", loadSession);

app.get("/api/health", async (req, res) => {
  const db = mongoose.connection.readyState === 1;
  // Anonymous callers only learn whether the API is up.
  if (!req.user) return res.json({ ok: true, db });
  const settings = await getSettings();
  const hasPlacesKey = Boolean(settings.googlePlacesApiKey || config.placesApiKey);
  const source =
    settings.leadSource === "auto" ? (hasPlacesKey ? "google_places" : "google_maps") : settings.leadSource;
  res.json({ ok: true, db, source, hasPlacesKey });
});
// Staff activity trail for every signed-in request (see services/audit.js).
app.use("/api", auditTrail);
app.use("/api/auth", authRouter);

// Everything below requires a signed-in user.
app.use("/api", requireAuth);
app.use("/api/users", requireAdmin, usersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/backups", requireAdmin, backupsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/imports", importsRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/searches", searchesRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/senders", sendersRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/suppressions", suppressionsRouter);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid id" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

await mongoose.connect(config.mongoUri);
await migrateLeads();
await migrateSearches();
await migrateSettings();
await encryptStoredSecrets();
await bootstrapAdmin();
await markOrphanedSearches();
startMailer();
startReplyWatcher();
startTaskReminders();
startBackupSchedule();
if (config.corsOrigin.includes("*")) {
  console.warn("CORS_ORIGIN is \"*\": any website can call this API from a signed-in browser. Set it to your frontend URL.");
}
for (const host of config.host ? [config.host] : ["127.0.0.1", "::1"]) {
  http
    .createServer(app)
    .on("error", (err) => {
      // IPv6 may be disabled; the IPv4 loopback is enough then.
      if (host === "::1" && ["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(err.code)) return;
      throw err;
    })
    .listen(config.port, host, () => console.log(`API listening on http://${host.includes(":") ? `[${host}]` : host}:${config.port}/api`));
}
console.log(`python: ${config.pythonBin}`);
