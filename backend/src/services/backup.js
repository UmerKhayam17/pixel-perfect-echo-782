import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { config } from "../config.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const { EJSON } = mongoose.mongo.BSON;

// Signed-in browsers are not worth restoring: everyone simply signs in again.
const SKIP = new Set(["sessions"]);
const FILE_RE = /^leadfinder-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.json\.gz$/;

export const backupDir = () => config.backup.dir;

/**
 * Writes every collection to one gzipped Extended-JSON file (types such as ObjectId and Date are
 * preserved). Returns { file, size, collections, documents }.
 */
export async function createBackup(reason = "manual") {
  fs.mkdirSync(backupDir(), { recursive: true });
  const db = mongoose.connection.db;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !SKIP.has(n) && !n.startsWith("system."));
  const collections = {};
  let documents = 0;
  for (const name of names.sort()) {
    collections[name] = await db.collection(name).find({}).toArray();
    documents += collections[name].length;
  }
  const payload = { app: "leadfinder", version: 1, createdAt: new Date(), reason, collections };
  const data = await gzip(EJSON.stringify(payload, { relaxed: false }));
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const file = path.join(backupDir(), `leadfinder-${stamp}.json.gz`);
  // Write to a temp file first so a crash never leaves a half-written backup behind.
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
  pruneBackups();
  return { file: path.basename(file), size: data.length, collections: names.length, documents };
}

export function listBackups() {
  if (!fs.existsSync(backupDir())) return [];
  return fs
    .readdirSync(backupDir())
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const [, day, h, m, s] = f.match(FILE_RE);
      return { file: f, size: fs.statSync(path.join(backupDir(), f)).size, createdAt: new Date(`${day}T${h}:${m}:${s}Z`) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Keeps the newest backup of each of the last `keepDays` days, plus every backup from today. */
function pruneBackups() {
  const keep = new Set();
  const days = new Map();
  const today = new Date().toISOString().slice(0, 10);
  for (const b of listBackups()) {
    const day = b.file.match(FILE_RE)[1];
    if (day === today) keep.add(b.file);
    else if (!days.has(day)) days.set(day, b.file);
  }
  [...days.values()].slice(0, config.backup.keepDays).forEach((f) => keep.add(f));
  for (const b of listBackups()) if (!keep.has(b.file)) fs.rmSync(path.join(backupDir(), b.file), { force: true });
}

/** Resolves a backup name to its path, refusing anything outside the backup folder. */
export function backupPath(name) {
  if (!FILE_RE.test(String(name))) return null;
  const file = path.join(backupDir(), name);
  return fs.existsSync(file) ? file : null;
}

export async function readBackup(file) {
  const payload = EJSON.parse((await gunzip(fs.readFileSync(file))).toString("utf8"), { relaxed: false });
  if (payload?.app !== "leadfinder" || typeof payload.collections !== "object") throw new Error("Not a LeadFinder backup file");
  return payload;
}

/** Replaces the database contents with a backup (used by the restore script, never by the API). */
export async function restoreBackup(file) {
  const payload = await readBackup(file);
  const db = mongoose.connection.db;
  const summary = {};
  for (const [name, docs] of Object.entries(payload.collections)) {
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
    summary[name] = docs.length;
  }
  return { createdAt: payload.createdAt, collections: summary };
}

/** Makes one backup a day (on start-up and then hourly checks), if enabled. */
export function startBackupSchedule() {
  if (!config.backup.enabled) return;
  const check = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (!listBackups().some((b) => b.file.includes(today))) {
        const b = await createBackup("daily");
        console.log(`Daily backup saved: ${b.file} (${b.documents} records)`);
      }
    } catch (err) {
      console.error("[backup] failed:", err);
    }
  };
  setTimeout(check, 10_000).unref();
  setInterval(check, 3600_000).unref();
}
