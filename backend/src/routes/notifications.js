import { Router } from "express";
import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";

// Each person's own notifications (the bell). Nobody can see anyone else's.
export const notificationsRouter = Router();

notificationsRouter.get("/", async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);
  res.json({ items, unread });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ updated: result.modifiedCount });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  await Notification.updateOne({ _id: req.params.id, userId: req.user._id }, { read: true });
  res.status(204).end();
});
