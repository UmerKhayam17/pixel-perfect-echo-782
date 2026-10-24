import mongoose from "mongoose";

// An SMTP account campaigns can send from.
const senderSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    fromName: { type: String, required: true, trim: true },
    fromEmail: { type: String, required: true, trim: true, lowercase: true },
    replyTo: { type: String, default: null, trim: true, lowercase: true },
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true, min: 1, max: 65535 },
    // true = implicit TLS (usually port 465); false = STARTTLS (usually 587).
    secure: { type: Boolean, default: false },
    username: { type: String, required: true, trim: true },
    password: { type: String, default: "" },
    signature: { type: String, default: "" },
    // Reply tracking: read the inbox over IMAP to spot replies, unsubscribes and bounces.
    imap: {
      enabled: { type: Boolean, default: false },
      host: { type: String, default: "", trim: true },
      port: { type: Number, default: 993 },
      secure: { type: Boolean, default: true },
      // Empty = same as the SMTP login (true for Gmail, Outlook, Zoho, Yahoo).
      username: { type: String, default: "", trim: true },
      password: { type: String, default: "" },
    },
    imapState: {
      uidValidity: { type: String, default: null },
      lastUid: { type: Number, default: 0 },
      lastCheckedAt: { type: Date, default: null },
      lastError: { type: String, default: null },
    },
    // Safety cap on emails per day from this account.
    dailyLimit: { type: Number, default: 200, min: 1, max: 10000 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        // The password is write-only from the API's point of view.
        ret.hasPassword = Boolean(ret.password);
        delete ret.password;
        if (ret.imap) {
          ret.imap.hasPassword = Boolean(ret.imap.password);
          delete ret.imap.password;
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const Sender = mongoose.model("Sender", senderSchema);
