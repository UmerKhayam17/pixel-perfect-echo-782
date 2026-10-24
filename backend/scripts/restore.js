#!/usr/bin/env node
/**
 * Restores the database from a backup made by LeadFinder. Stop the API first.
 *
 *   npm run restore                 # lists available backups
 *   npm run restore -- <file name>  # restores one (asks for confirmation)
 *
 * A safety backup of the current data is taken before anything is replaced.
 */
import readline from "node:readline";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { backupPath, createBackup, listBackups, readBackup, restoreBackup } from "../src/services/backup.js";

const name = process.argv[2];
await mongoose.connect(config.mongoUri);
try {
  if (!name) {
    const backups = listBackups();
    if (!backups.length) console.log(`No backups in ${config.backup.dir}`);
    for (const b of backups) console.log(`${b.file}  ${(b.size / 1024).toFixed(0)} KB`);
    if (backups.length) console.log("\nRestore one with: npm run restore -- <file name>");
  } else {
    const file = backupPath(name);
    if (!file) throw new Error(`Backup not found: ${name}`);
    const payload = await readBackup(file);
    const counts = Object.entries(payload.collections).map(([k, v]) => `${k}: ${v.length}`).join(", ");
    console.log(`Backup from ${new Date(payload.createdAt).toLocaleString()}\n${counts}\n`);
    const answer = process.stdin.isTTY
      ? await new Promise((resolve) => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question("This REPLACES all current data with the backup. Type RESTORE to continue: ", (a) => {
            rl.close();
            resolve(a.trim());
          });
        })
      : process.env.LF_CONFIRM_RESTORE;
    if (answer !== "RESTORE") throw new Error("Cancelled — nothing was changed.");
    const safety = await createBackup("before-restore");
    console.log(`Safety backup of current data: ${safety.file}`);
    const result = await restoreBackup(file);
    console.log("Restored:", result.collections);
    console.log("Start the API again. Everyone will need to sign in again.");
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
