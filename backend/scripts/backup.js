#!/usr/bin/env node
/** Takes a backup now: `npm run backup`. The API also does this automatically once a day. */
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { createBackup } from "../src/services/backup.js";

await mongoose.connect(config.mongoUri);
try {
  const b = await createBackup("manual");
  console.log(`Saved ${b.file} — ${b.documents} records from ${b.collections} collections (${(b.size / 1024).toFixed(0)} KB) in ${config.backup.dir}`);
} catch (err) {
  console.error(`Backup failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
