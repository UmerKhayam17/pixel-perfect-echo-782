import mongoose from "mongoose";
import { config } from "../config.js";

/**
 * Staff activity trail: every change made through the API, important reads (viewing a lead,
 * exporting), sign-ins, and the pages and buttons each person uses in the app.
 * Entries are removed automatically after AUDIT_RETENTION_DAYS.
 */
const auditSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    userName: { type: String, default: null },
    role: { type: String, default: null },
    // action: API change or read · page: page opened · click: button/link pressed · auth: sign-in events
    kind: { type: String, enum: ["action", "page", "click", "auth"], required: true },
    action: { type: String, default: null },
    label: { type: String, required: true },
    path: { type: String, default: null },
    method: { type: String, default: null },
    status: { type: Number, default: null },
    target: {
      type: { type: String, default: null },
      id: { type: String, default: null },
      label: { type: String, default: null },
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

auditSchema.index({ userId: 1, createdAt: -1 });
auditSchema.index({ "target.id": 1, createdAt: -1 });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.auditRetentionDays * 86400 });

export const AuditLog = mongoose.model("AuditLog", auditSchema);
