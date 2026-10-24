import mongoose from "mongoose";

// A signed-in browser. Only a SHA-256 of the cookie token is stored, so a database leak
// doesn't hand out working sessions.
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // MongoDB deletes the session once this passes.
    expiresAt: { type: Date, required: true },
    remember: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret.tokenHash;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model("Session", sessionSchema);
