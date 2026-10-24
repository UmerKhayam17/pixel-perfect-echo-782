import mongoose from "mongoose";

// One CSV/Excel import: what came in, what happened to it, and who did it.
const importSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    by: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    totalRows: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    // Existing leads that got missing details filled in.
    updated: { type: Number, default: 0 },
    // Already in the database, left untouched.
    skippedExisting: { type: Number, default: 0 },
    // Rows repeating an earlier row of the same file (folded into it).
    duplicatesInFile: { type: Number, default: 0 },
    invalid: { type: Number, default: 0 },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    undoneAt: { type: Date, default: null },
  },
  {
    timestamps: true,
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

export const Import = mongoose.model("Import", importSchema);
