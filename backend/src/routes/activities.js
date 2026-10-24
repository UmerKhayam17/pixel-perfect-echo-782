import { Router } from "express";
import { Activity } from "../models/Activity.js";
import { canSeeLead, isAdmin } from "../services/access.js";

/** Members may only change their own entries, on leads they can see. */
async function editable(req, res) {
  const activity = await Activity.findById(req.params.id);
  if (!activity || !(await canSeeLead(req.user, activity.leadId))) {
    res.status(404).json({ error: "Activity not found" });
    return null;
  }
  if (!isAdmin(req.user) && String(activity.userId) !== String(req.user._id)) {
    res.status(403).json({ error: "You can only change entries you made." });
    return null;
  }
  return activity;
}

export const activitiesRouter = Router();

// Activities are created under /api/leads/:id/activities; only editing and deleting live here.
activitiesRouter.patch("/:id", async (req, res) => {
  const activity = await editable(req, res);
  if (!activity) return;
  if (activity.type === "stage_change") return res.status(400).json({ error: "Stage changes cannot be edited." });
  const text = String(req.body?.text ?? "").trim();
  if (activity.type === "note" && !text) return res.status(400).json({ error: "A note needs some text." });
  activity.text = text.slice(0, 10000);
  await activity.save();
  res.json(activity);
});

activitiesRouter.delete("/:id", async (req, res) => {
  const activity = await editable(req, res);
  if (!activity) return;
  await activity.deleteOne();
  res.status(204).end();
});
