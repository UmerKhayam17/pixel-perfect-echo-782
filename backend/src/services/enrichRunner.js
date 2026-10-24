import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { config } from "../config.js";
import { Lead, refreshKeys, refreshScores } from "../models/Lead.js";

/**
 * Runs scraper/enrich.py for saved leads: website audit + missing email + social links, and fresh
 * Google rating / reviews / status. One job at a time; progress is kept in memory.
 */
let job = null;

const publicJob = () =>
  job && {
    id: job.id,
    status: job.status,
    statusText: job.statusText,
    done: job.done,
    total: job.total,
    leads: job.leadCount,
    updated: job.updated.size,
    emailsFound: job.emailsFound,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    startedBy: job.startedBy,
    error: job.error,
  };

export const currentEnrichJob = publicJob;
export const enrichRunning = () => job?.status === "running";

async function applyResult(r) {
  const lead = await Lead.findById(r.id);
  if (!lead) return;
  const set = {};
  if ("audit" in r) set.audit = r.audit ? { ...r.audit, checkedAt: new Date() } : null;
  if (r.email && !lead.email) {
    set.email = r.email;
    job.emailsFound++;
  }
  if (r.website && !lead.website) set.website = r.website;
  for (const f of ["rating", "reviewCount", "businessStatus", "lat", "lng"]) if (r[f] != null) set[f] = r[f];
  for (const [network, url] of Object.entries(r.socials ?? {})) set[`socials.${network}`] = url;
  if (!Object.keys(set).length) return;
  await Lead.updateOne({ _id: lead._id }, { $set: set });
  job.updated.add(String(lead._id));
}

/**
 * Starts a job for `leads` (documents with website/sourceUrl/email/rating/audit).
 * options: { website, google, onlyMissing }.
 */
export function startEnrich(leads, options, startedBy) {
  if (enrichRunning()) throw Object.assign(new Error("An enrich job is already running."), { status: 409 });
  const items = leads
    .map((l) => ({
      id: String(l._id),
      website: options.website && l.website && !(options.onlyMissing && l.audit) ? l.website : null,
      wantEmail: !l.email,
      sourceUrl: options.google && l.sourceUrl && !(options.onlyMissing && l.rating != null) ? l.sourceUrl : null,
      wantGoogle: options.google,
    }))
    .filter((l) => l.website || l.sourceUrl);
  if (!items.length) throw Object.assign(new Error("Nothing to check — these leads are already up to date."), { status: 400 });

  const file = path.join(os.tmpdir(), `leadfinder-enrich-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ leads: items, headless: config.headless }));
  const child = spawn(config.pythonBin, [path.join(config.scraperDir, "enrich.py"), file], {
    cwd: config.scraperDir,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !["APP_SECRET", "ADMIN_PASSWORD"].includes(k))),
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    windowsHide: true,
  });

  job = {
    id: Date.now().toString(36),
    child,
    status: "running",
    statusText: "Starting…",
    done: 0,
    total: items.length,
    leadCount: items.length,
    updated: new Set(),
    emailsFound: 0,
    startedAt: new Date(),
    finishedAt: null,
    startedBy,
    error: null,
    cancelled: false,
  };
  const current = job;

  let queue = Promise.resolve();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    queue = queue.then(async () => {
      if (event.type === "result") await applyResult(event);
      else if (event.type === "progress") {
        current.done = event.done;
        current.total = event.total;
      } else if (event.type === "status") current.statusText = event.text;
      else if (event.type === "error") current.error = event.message;
    }).catch((err) => console.error("[enrich] failed to apply result:", err));
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[enrich] ${chunk}`));
  child.stdin.on("error", () => {});
  child.on("error", (err) => {
    current.error = `Could not start the enrich script (${config.pythonBin}): ${err.message}`;
  });
  child.on("close", (code) => {
    queue = queue.then(async () => {
      const ids = [...current.updated];
      if (ids.length) await Promise.all([refreshScores({ _id: { $in: ids } }), refreshKeys({ _id: { $in: ids } })]);
      current.status = current.cancelled ? "cancelled" : code === 0 ? "completed" : "failed";
      current.finishedAt = new Date();
      if (current.status === "completed") current.statusText = `Done — ${ids.length} leads updated, ${current.emailsFound} new emails.`;
      if (current.status === "failed") current.statusText = current.error ?? `Stopped with code ${code}`;
      fs.rmSync(file, { force: true });
    });
  });
  return publicJob();
}

export function cancelEnrich() {
  if (!enrichRunning()) return false;
  job.cancelled = true;
  job.statusText = "Cancelling…";
  job.child.stdin.write("cancel\n");
  const running = job;
  setTimeout(() => running.status === "running" && running.child.kill(), 15000).unref();
  return true;
}
