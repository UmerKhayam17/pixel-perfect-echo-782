import mongoose from "mongoose";

export const TASK_TYPES = ["todo", "call", "email", "meeting"];

// A follow-up: optionally attached to a lead, done when doneAt is set.
const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: TASK_TYPES, default: "todo" },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null, index: true },
    dueAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // When the "due soon / overdue" reminder was sent (reset when the due date changes).
    remindedAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        // leadId may be populated with { businessName } for task lists.
        const lead = ret.leadId;
        if (lead && typeof lead === "object" && "businessName" in lead) {
          ret.lead = { id: lead.id ?? String(lead._id), businessName: lead.businessName };
          ret.leadId = ret.lead.id;
        } else {
          ret.leadId = lead ? String(lead) : null;
        }
        // assignedTo / createdBy may be populated with { name } too.
        for (const [field, key] of [["assignedTo", "assignee"], ["createdBy", "creator"]]) {
          const user = ret[field];
          if (user && typeof user === "object" && "name" in user) {
            ret[key] = { id: String(user._id ?? user.id), name: user.name };
            ret[field] = ret[key].id;
          } else {
            ret[field] = user ? String(user) : null;
          }
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

taskSchema.index({ done: 1, dueAt: 1 });

export const Task = mongoose.model("Task", taskSchema);
