import mongoose from "mongoose";

export const ACTIVITY_TYPES = ["note", "call", "email", "meeting", "whatsapp", "whatsapp_unavailable", "email_reply", "stage_change"];
/** Activity types that count as reaching out to the business. */
export const CONTACT_ACTIVITIES = ["call", "email", "meeting", "whatsapp"];

// Timeline entry on a lead: a note, a logged call/email/meeting, or an automatic stage change.
const activitySchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    text: { type: String, default: "", trim: true },
    // stage_change: { from, to }
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    // Who did it: a user's name, or e.g. "Campaign (ali@…)" for automatic entries.
    by: { type: String, default: null },
    // The staff member who did it (null for automatic entries such as campaign emails).
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        ret.date = ret.createdAt;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

activitySchema.index({ leadId: 1, createdAt: -1 });

export const Activity = mongoose.model("Activity", activitySchema);
