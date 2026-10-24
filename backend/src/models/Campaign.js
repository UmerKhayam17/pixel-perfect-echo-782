import mongoose from "mongoose";

export const CAMPAIGN_STATUSES = ["draft", "sending", "paused", "completed", "cancelled"];
export const RECIPIENT_STATUSES = ["queued", "sent", "failed", "skipped"];

const toJSON = {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "draft", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "Sender", default: null },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    // Who receives it: explicit lead ids, or a lead filter (same params as GET /api/leads).
    audience: {
      leadIds: { type: [String], default: undefined },
      query: { type: mongoose.Schema.Types.Mixed, default: undefined },
      label: { type: String, default: "" },
    },
    // Follow-up emails sent in the same thread to recipients who haven't replied.
    followUps: {
      type: [
        {
          _id: false,
          delayDays: { type: Number, min: 1, max: 60, default: 3 },
          // Empty = "Re: <original subject>", which keeps it in the same conversation.
          subject: { type: String, default: "" },
          body: { type: String, default: "" },
        },
      ],
      default: [],
    },
    options: {
      // Seconds between two emails (a random ±30% is added so sending looks human).
      delaySeconds: { type: Number, default: 45, min: 5, max: 3600 },
      // Skip addresses that any earlier campaign already emailed.
      skipEmailedBefore: { type: Boolean, default: true },
      // Skip leads that are already won or lost.
      skipClosed: { type: Boolean, default: true },
    },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    followUpsSent: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    statusText: { type: String, default: "" },
    lastError: { type: String, default: null },
    nextSendAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON },
);

export const Campaign = mongoose.model("Campaign", campaignSchema);

const recipientSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "Sender", default: null },
    businessName: { type: String, default: "" },
    email: { type: String, required: true, lowercase: true },
    status: { type: String, enum: RECIPIENT_STATUSES, default: "queued" },
    // Why it was skipped or failed.
    reason: { type: String, default: null },
    subject: { type: String, default: null },
    messageId: { type: String, default: null },
    sentAt: { type: Date, default: null },
    // Sequence: last step sent (0 = first email), when the next follow-up is due, every Message-ID sent.
    step: { type: Number, default: -1 },
    nextStepAt: { type: Date, default: null },
    messageIds: { type: [String], default: [] },
    repliedAt: { type: Date, default: null },
    replySnippet: { type: String, default: null },
    unsubscribedAt: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON },
);

recipientSchema.index({ campaignId: 1, status: 1, createdAt: 1 });
recipientSchema.index({ email: 1, status: 1 });
recipientSchema.index({ senderId: 1, sentAt: 1 });
recipientSchema.index({ nextStepAt: 1 });
recipientSchema.index({ messageIds: 1 });

export const Recipient = mongoose.model("Recipient", recipientSchema);

// Emails sent per sender per day (first emails and follow-ups), for the daily limit.
const sendCountSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true }, // YYYY-MM-DD, server local time
  count: { type: Number, default: 0 },
});
sendCountSchema.index({ senderId: 1, day: 1 }, { unique: true });
export const SendCount = mongoose.model("SendCount", sendCountSchema);

// Addresses that must never be emailed (unsubscribed, bounced or added by hand).
const suppressionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: { type: String, default: "manual" },
  },
  { timestamps: true, toJSON },
);

export const Suppression = mongoose.model("Suppression", suppressionSchema);
