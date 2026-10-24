import mongoose from "mongoose";

const exportSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    format: { type: String, enum: ["csv", "xlsx"], required: true },
    scope: { type: String, required: true },
    fields: [{ type: String }],
    count: { type: Number, required: true },
    status: { type: String, enum: ["completed", "failed"], default: "completed" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    by: { type: String, default: null },
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

export const Export = mongoose.model("Export", exportSchema);
