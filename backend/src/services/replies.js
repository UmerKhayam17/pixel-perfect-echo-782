import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Activity } from "../models/Activity.js";
import { Campaign, Recipient, Suppression } from "../models/Campaign.js";
import { Lead } from "../models/Lead.js";
import { Sender } from "../models/Sender.js";
import { Task } from "../models/Task.js";
import { decryptSecret } from "./security.js";
import { notify } from "./notify.js";

/**
 * Reply tracking: watches each sender's inbox over IMAP. A reply to a campaign email is logged on
 * the lead's timeline, gets a follow-up task and stops the rest of the sequence. "Unsubscribe" /
 * "stop" replies and bounces put the address on the do-not-email list.
 */

const CHECK_EVERY_MS = 3 * 60 * 1000;
const FIRST_LOOKBACK_DAYS = 14;
const MAX_SOURCE_BYTES = 2_000_000;

const UNSUBSCRIBE_RE = /\b(unsubscribe|opt[\s-]?out|remove me|take me off|stop (?:emailing|sending|contacting)|do not (?:email|contact)|don'?t (?:email|contact) me)\b|^\s*stop\s*[.!]?\s*$/im;
const AUTO_REPLY_RE = /^(?:auto(?:matic)?[\s-]?reply|out of (?:the )?office|away from (?:the )?office|on vacation|autoreply)/i;
const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (?:subsystem|system)/i;
const BOUNCE_SUBJECT_RE = /undeliver|delivery status notification|failure notice|returned mail|delivery (?:has )?failed|mail delivery failed|could not be delivered/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

/** Default IMAP servers for the providers offered on the Email setup page. */
export function imapDefaults(smtpHost = "") {
  const host = smtpHost.toLowerCase();
  if (host.includes("gmail")) return { host: "imap.gmail.com", port: 993, secure: true };
  if (host.includes("office365") || host.includes("outlook")) return { host: "outlook.office365.com", port: 993, secure: true };
  if (host.includes("zoho")) return { host: "imap.zoho.com", port: 993, secure: true };
  if (host.includes("yahoo")) return { host: "imap.mail.yahoo.com", port: 993, secure: true };
  return { host: host.replace(/^smtp\./, "imap."), port: 993, secure: true };
}

function imapConfig(sender) {
  const defaults = imapDefaults(sender.host);
  return {
    host: sender.imap?.host || defaults.host,
    port: sender.imap?.port || defaults.port,
    secure: sender.imap?.secure ?? defaults.secure,
    auth: {
      user: sender.imap?.username || sender.username,
      pass: decryptSecret(sender.imap?.password) || decryptSecret(sender.password),
    },
    logger: false,
    socketTimeout: 60000,
  };
}

/** The new part of a reply, without the quoted original ("On … wrote:" and "> …" lines). */
export function replyText(text = "") {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^On .{5,200}wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s.+/i.test(line.trim()) && out.length) break;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Marks a recipient as replied: timeline entry, task, sequence stopped, counters updated. */
export async function recordReply(recipient, { text = "", from = null, date = new Date(), by = null, manual = false } = {}) {
  if (recipient.repliedAt) return false;
  const snippet = text.slice(0, 1000);
  await Recipient.updateOne({ _id: recipient._id }, { $set: { repliedAt: date, replySnippet: snippet.slice(0, 300), nextStepAt: null } });
  await Campaign.updateOne({ _id: recipient.campaignId }, { $inc: { replied: 1 } });
  const lead = await Lead.findById(recipient.leadId, { businessName: 1, stage: 1, assignedTo: 1 });
  if (!lead) return true;
  await Activity.create({
    leadId: lead._id,
    type: "email_reply",
    text: snippet || "(empty reply)",
    by: by ?? (from ? `Reply from ${from}` : "Email reply"),
    meta: null,
  });
  // A reply counts as contact; leave "qualified" and beyond as they are.
  await Lead.updateOne({ _id: lead._id }, { $set: { lastContactedAt: date } });
  if (!manual) {
    const campaign = await Campaign.findById(recipient.campaignId, { createdBy: 1, name: 1 });
    await notify([lead.assignedTo ?? campaign?.createdBy], {
      type: "email_reply",
      title: `${lead.businessName} replied`,
      body: snippet.slice(0, 140) || `To “${campaign?.name ?? "a campaign"}”`,
      link: `/leads/${lead._id}`,
    });
    await Task.create({ title: `Reply to ${lead.businessName}`, type: "email", leadId: lead._id, dueAt: new Date(), assignedTo: lead.assignedTo ?? null });
  }
  return true;
}

async function suppress(email, reason) {
  await Suppression.updateOne({ email }, { $setOnInsert: { email, reason } }, { upsert: true });
}

/**
 * Handles one incoming message for `sender`. Returns what happened, for logging/tests:
 * "reply" | "unsubscribe" | "bounce" | "auto-reply" | "ignored".
 */
export async function processMessage(sender, msg) {
  const fromAddress = (msg.from?.value?.[0]?.address ?? "").toLowerCase();
  const fromName = msg.from?.value?.[0]?.name || fromAddress;
  const subject = msg.subject ?? "";
  const body = msg.text ?? "";
  const date = msg.date ?? new Date();
  const since = new Date(Date.now() - 90 * 86400000);

  // Bounces: find which of our recipients the failure notice is about.
  if (BOUNCE_FROM_RE.test(fromAddress + " " + fromName) || BOUNCE_SUBJECT_RE.test(subject)) {
    const mentioned = [...new Set((body.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))].filter((e) => e !== sender.fromEmail);
    const hits = await Recipient.find({ senderId: sender._id, email: { $in: mentioned }, status: "sent", bouncedAt: null, sentAt: { $gte: since } });
    for (const r of hits) {
      await Recipient.updateOne({ _id: r._id }, { $set: { bouncedAt: date, nextStepAt: null, reason: "Bounced" } });
      await Campaign.updateOne({ _id: r.campaignId }, { $inc: { bounced: 1 } });
      await suppress(r.email, "bounced");
    }
    return hits.length ? "bounce" : "ignored";
  }

  const autoSubmitted = String(msg.headers?.get?.("auto-submitted") ?? "").toLowerCase();
  if ((autoSubmitted && autoSubmitted !== "no") || AUTO_REPLY_RE.test(subject)) return "auto-reply";

  // Replies: match the thread first (In-Reply-To / References), then the sender's address.
  const refs = [msg.inReplyTo, ...(Array.isArray(msg.references) ? msg.references : [msg.references])].filter(Boolean);
  let recipient = refs.length ? await Recipient.findOne({ senderId: sender._id, messageIds: { $in: refs } }) : null;
  if (!recipient && fromAddress) {
    recipient = await Recipient.findOne({ senderId: sender._id, email: fromAddress, status: "sent", sentAt: { $gte: since } }).sort({ sentAt: -1 });
  }
  if (!recipient) return "ignored";

  const text = replyText(body);
  if (UNSUBSCRIBE_RE.test(subject) || UNSUBSCRIBE_RE.test(text.slice(0, 500))) {
    await suppress(recipient.email, "unsubscribed");
    if (!recipient.unsubscribedAt) {
      await Recipient.updateOne({ _id: recipient._id }, { $set: { unsubscribedAt: date, nextStepAt: null } });
      await Campaign.updateOne({ _id: recipient.campaignId }, { $inc: { unsubscribed: 1 } });
    }
    await Activity.create({ leadId: recipient.leadId, type: "email_reply", text: `Asked to unsubscribe: “${text.slice(0, 300)}”`, by: `Reply from ${fromName}` });
    return "unsubscribe";
  }
  await recordReply(recipient, { text, from: fromName, date });
  return "reply";
}

/** Checks one sender's inbox for new mail since the last check. */
export async function checkSender(sender) {
  const client = new ImapFlow(imapConfig(sender));
  const state = sender.imapState ?? {};
  const results = { checked: 0, reply: 0, unsubscribe: 0, bounce: 0 };
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      const validity = String(mailbox.uidValidity);
      let uids;
      if (state.uidValidity !== validity || !state.lastUid) {
        // First run (or the mailbox was rebuilt): look back a couple of weeks.
        uids = await client.search({ since: new Date(Date.now() - FIRST_LOOKBACK_DAYS * 86400000) }, { uid: true });
      } else {
        uids = await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true });
        uids = uids.filter((u) => u > state.lastUid);
      }
      let lastUid = state.uidValidity === validity ? state.lastUid : 0;
      for (const uid of uids ?? []) {
        const meta = await client.fetchOne(String(uid), { size: true }, { uid: true });
        if (meta && meta.size <= MAX_SOURCE_BYTES) {
          const { source } = await client.fetchOne(String(uid), { source: true }, { uid: true });
          const outcome = await processMessage(sender, await simpleParser(source));
          if (outcome in results) results[outcome]++;
        }
        results.checked++;
        lastUid = Math.max(lastUid, uid);
      }
      await Sender.updateOne(
        { _id: sender._id },
        { $set: { "imapState.uidValidity": validity, "imapState.lastUid": lastUid, "imapState.lastCheckedAt": new Date(), "imapState.lastError": null } },
      );
    } finally {
      lock.release();
    }
    await client.logout();
    return results;
  } catch (err) {
    const message = err.authenticationFailed ? "Inbox login failed — check the IMAP username and password" : err.responseText || err.message;
    await Sender.updateOne({ _id: sender._id }, { $set: { "imapState.lastError": message, "imapState.lastCheckedAt": new Date() } });
    try {
      await client.logout();
    } catch {
      /* already closed */
    }
    throw Object.assign(new Error(message), { status: 400 });
  }
}

let busy = false;
async function checkAll() {
  if (busy) return;
  busy = true;
  try {
    for (const sender of await Sender.find({ "imap.enabled": true })) {
      try {
        const r = await checkSender(sender);
        if (r.reply || r.unsubscribe || r.bounce) console.log(`[replies] ${sender.fromEmail}:`, r);
      } catch (err) {
        console.error(`[replies] ${sender.fromEmail}: ${err.message}`);
      }
    }
  } finally {
    busy = false;
  }
}

export function startReplyWatcher() {
  setTimeout(checkAll, 20_000).unref();
  setInterval(checkAll, CHECK_EVERY_MS).unref();
}
