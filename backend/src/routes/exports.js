import { Router } from "express";
import { Export } from "../models/Export.js";

export const exportsRouter = Router();

const mine = (req) => (req.user.role === "admin" ? {} : { userId: req.user._id });

exportsRouter.get("/", async (req, res) => {
  res.json(await Export.find(mine(req)).sort({ createdAt: -1 }).limit(200));
});

// Files are generated in the browser; the API keeps the export history.
exportsRouter.post("/", async (req, res) => {
  const { filename, format, scope, fields, count, status } = req.body ?? {};
  if (!filename || !["csv", "xlsx"].includes(format)) {
    return res.status(400).json({ error: "filename and format (csv|xlsx) are required" });
  }
  const record = await Export.create({
    filename: String(filename),
    format,
    scope: String(scope ?? "All leads"),
    fields: Array.isArray(fields) ? fields.map(String) : [],
    count: Number(count) || 0,
    status: status === "failed" ? "failed" : "completed",
    userId: req.user._id,
    by: req.user.name,
  });
  res.status(201).json(record);
});

exportsRouter.delete("/", async (req, res) => {
  const result = await Export.deleteMany(mine(req));
  res.json({ deleted: result.deletedCount });
});

exportsRouter.delete("/:id", async (req, res) => {
  const result = await Export.deleteOne({ _id: req.params.id, ...mine(req) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Export not found" });
  res.status(204).end();
});
