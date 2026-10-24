import mongoose from "mongoose";

// An in-app notification for one person (the bell in the header). Removed after 90 days.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // leads_assigned · campaign_shared · task_assigned · task_due · email_reply · search_done
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    // In-app path to open, e.g. /leads/<id> or /leads?assignedTo=me
    link: { type: String, default: null },
    read: { type: Boolean, default: false },
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

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const Notification = mongoose.model("Notification", notificationSchema);
