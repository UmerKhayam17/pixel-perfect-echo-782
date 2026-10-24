import mongoose from "mongoose";

// A reusable email: subject and plain-text body with {{merge}} fields.
const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // WhatsApp templates have no subject.
    channel: { type: String, enum: ["email", "whatsapp"], default: "email" },
    subject: { type: String, default: "", trim: true },
    body: { type: String, required: true },
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

export const Template = mongoose.model("Template", templateSchema);
