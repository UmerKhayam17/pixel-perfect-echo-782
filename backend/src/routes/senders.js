import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { encryptSecret } from "../services/security.js";
import { Campaign } from "../models/Campaign.js";
import { Sender } from "../models/Sender.js";
import { forgetTransport, renderEmail, sendMail, smtpError } from "../services/email.js";
import { checkSender, imapDefaults } from "../services/replies.js";

export const sendersRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ["label", "fromName", "fromEmail", "replyTo", "host", "port", "secure", "username", "signature", "dailyLimit"];

/** Copies editable fields onto a sender. Returns field errors, if any. */
function applySender(sender, body) {
  for (const key of FIELDS) if (key in body) sender.set(key, body[key] === "" && key === "replyTo" ? null : body[key]);
  // null/"" leaves the stored password unchanged on edit; a string replaces it.
  if (typeof body.password === "string" && body.password !== "") sender.password = encryptSecret(body.password);
  if (!sender.label) sender.label = sender.fromEmail;
  if (body.imap && typeof body.imap === "object") {
    const imap = body.imap;
    const defaults = imapDefaults(sender.host);
    sender.set("imap.enabled", Boolean(imap.enabled));
    sender.set("imap.host", String(imap.host ?? "").trim() || defaults.host);
    sender.set("imap.port", Number(imap.port) || defaults.port);
    sender.set("imap.secure", imap.secure ?? defaults.secure);
    sender.set("imap.username", String(imap.username ?? "").trim());
    if (typeof imap.password === "string" && imap.password !== "") sender.set("imap.password", encryptSecret(imap.password));
    // A different mailbox means starting the inbox scan afresh.
    if (sender.isModified("imap.host") || sender.isModified("imap.username")) sender.set("imapState", {});
  }

  const errors = {};
  if (!sender.fromName) errors.fromName = "Enter the name recipients will see.";
  if (!EMAIL_RE.test(sender.fromEmail ?? "")) errors.fromEmail = "Enter a valid from address.";
  if (sender.replyTo && !EMAIL_RE.test(sender.replyTo)) errors.replyTo = "Enter a valid reply-to address.";
  if (!sender.host) errors.host = "Enter the SMTP server, e.g. smtp.gmail.com.";
  if (!Number.isInteger(Number(sender.port))) errors.port = "Enter the SMTP port, e.g. 587.";
  if (!sender.username) errors.username = "Enter the SMTP username (usually your email address).";
  if (!sender.password) errors.password = "Enter the SMTP password or app password.";
  return errors;
}

async function save(sender, res, status) {
  try {
    await sender.save();
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    throw err;
  }
  forgetTransport(sender._id);
  res.status(status).json(sender);
}

sendersRouter.get("/", async (_req, res) => {
  res.json(await Sender.find().sort({ createdAt: 1 }));
});

// Everyone can pick a sender for a campaign; only admins can see or change SMTP settings.
sendersRouter.use((req, res, next) => (req.method === "GET" ? next() : requireAdmin(req, res, next)));

sendersRouter.post("/", async (req, res) => {
  const sender = new Sender({});
  const errors = applySender(sender, req.body ?? {});
  if (Object.keys(errors).length) return res.status(400).json({ error: "Invalid sender", errors });
  await save(sender, res, 201);
});

sendersRouter.put("/:id", async (req, res) => {
  const sender = await Sender.findById(req.params.id);
  if (!sender) return res.status(404).json({ error: "Sender not found" });
  const errors = applySender(sender, req.body ?? {});
  if (Object.keys(errors).length) return res.status(400).json({ error: "Invalid sender", errors });
  await save(sender, res, 200);
});

sendersRouter.delete("/:id", async (req, res) => {
  if (await Campaign.exists({ senderId: req.params.id, status: "sending" })) {
    return res.status(409).json({ error: "A campaign is sending from this account. Pause or cancel it first." });
  }
  const result = await Sender.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Sender not found" });
  forgetTransport(req.params.id);
  res.status(204).end();
});

// Connects to the inbox and runs one reply check now.
sendersRouter.post("/:id/test-imap", async (req, res) => {
  const sender = await Sender.findById(req.params.id);
  if (!sender) return res.status(404).json({ error: "Sender not found" });
  try {
    res.json({ ok: true, ...(await checkSender(sender)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sends a short test email to check the SMTP settings.
sendersRouter.post("/:id/test", async (req, res) => {
  const sender = await Sender.findById(req.params.id);
  if (!sender) return res.status(404).json({ error: "Sender not found" });
  const to = String(req.body?.to ?? "").trim() || sender.fromEmail;
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: "Enter a valid address to send the test to." });
  try {
    const rendered = renderEmail(
      {
        subject: "LeadFinder test email",
        body: "This is a test from LeadFinder Pro.\n\nIf you can read this, {{senderEmail}} is set up correctly.",
      },
      null,
      sender,
    );
    await sendMail(sender, to, rendered);
    res.json({ ok: true, to });
  } catch (err) {
    forgetTransport(sender._id);
    res.status(400).json({ error: smtpError(err) });
  }
});
