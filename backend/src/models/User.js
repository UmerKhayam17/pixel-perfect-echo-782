import mongoose from "mongoose";

export const ROLES = ["admin", "member"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    // admin: everything, including settings, email accounts and users. member: CRM, searches and campaigns.
    role: { type: String, enum: ROLES, default: "member" },
    active: { type: Boolean, default: true },
    // Set when an admin creates the account or resets its password: the user must pick a new one.
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    // Members only see leads from these searches/imports (plus leads assigned to them). Admins see all.
    access: {
      searchIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Search" }], default: [] },
      importIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Import" }], default: [] },
      // Single leads shared with them, e.g. by giving them a task on it.
      leadIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lead" }], default: [] },
    },
    // Per-member switches (see services/access.js for defaults). Ignored for admins.
    permissions: {
      import: { type: Boolean, default: true },
      export: { type: Boolean, default: false },
      campaigns: { type: Boolean, default: true },
    },
    lastSeenAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret.passwordHash;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const User = mongoose.model("User", userSchema);
