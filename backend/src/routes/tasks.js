import { Router } from "express";
import mongoose from "mongoose";
import { Lead } from "../models/Lead.js";
import { User } from "../models/User.js";
import { TASK_TYPES, Task } from "../models/Task.js";
import { canSeeLead, isAdmin, visibleLeadIds } from "../services/access.js";
import { logActivity } from "../services/crm.js";
import { notify } from "../services/notify.js";

/** Tasks a member sees: assigned to them, created by them, or on leads they can see. */
async function taskScope(user) {
  if (isAdmin(user)) return {};
  return { $or: [{ assignedTo: user._id }, { createdBy: user._id }, { leadId: { $in: await visibleLeadIds(user) } }] };
}

async function findTask(req) {
  return Task.findOne({ $and: [{ _id: req.params.id }, await taskScope(req.user)] });
}

export const tasksRouter = Router();

const withLead = (query) =>
  query.populate("leadId", "businessName").populate("assignedTo", "name").populate("createdBy", "name");

/**
 * Admins can give a task to any active teammate. If it's on a lead the assignee can't see yet,
 * that one lead is shared with them so the task's link works. Returns the user, or null if invalid.
 */
async function resolveAssignee(id, leadId) {
  if (!mongoose.isValidObjectId(id)) return null;
  const user = await User.findOne({ _id: id, active: true });
  if (!user) return null;
  if (leadId && !(await canSeeLead(user, leadId))) {
    await User.updateOne({ _id: user._id }, { $addToSet: { "access.leadIds": leadId } });
  }
  return user;
}

async function notifyAssignee(userId, task, by) {
  await notify(userId, {
    type: "task_assigned",
    title: `New task for you: ${task.title}`,
    body: `From ${by.name}${task.dueAt ? ` · due ${task.dueAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}`,
    link: task.leadId ? `/leads/${task.leadId}` : "/tasks",
  });
}

function parseDue(value) {
  if (value === null || value === "" || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ?status=open (default) | done | all, optionally ?leadId=
tasksRouter.get("/", async (req, res) => {
  const filter = {};
  const status = req.query.status ?? "open";
  if (status === "open") filter.done = false;
  else if (status === "done") filter.done = true;
  if (req.query.leadId && mongoose.isValidObjectId(req.query.leadId)) filter.leadId = req.query.leadId;
  // ?assignedTo=me | <userId> (admins can look at anyone's list).
  if (req.query.assignedTo === "me") filter.assignedTo = req.user._id;
  else if (isAdmin(req.user) && mongoose.isValidObjectId(req.query.assignedTo)) filter.assignedTo = req.query.assignedTo;
  Object.assign(filter, await taskScope(req.user));

  const sort = status === "done" ? { doneAt: -1 } : { dueAt: 1, createdAt: 1 };
  const tasks = await withLead(Task.find(filter).sort(sort).limit(status === "open" ? 1000 : 300));
  // Open tasks without a due date go last rather than first.
  if (status !== "done") tasks.sort((a, b) => Number(!a.dueAt) - Number(!b.dueAt));
  res.json(tasks);
});

tasksRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? "").trim();
  const dueAt = parseDue(body.dueAt);
  const errors = {};
  if (!title) errors.title = "Please describe the task.";
  if (dueAt === undefined) errors.dueAt = "Invalid due date.";
  if (body.type && !TASK_TYPES.includes(body.type)) errors.type = `Type must be one of ${TASK_TYPES.join(", ")}.`;
  let leadId = null;
  if (body.leadId) {
    if (!(await canSeeLead(req.user, body.leadId))) {
      errors.leadId = "Lead not found.";
    } else {
      leadId = body.leadId;
    }
  }
  // Admins can give a task to someone; members' tasks are their own.
  let assignedTo = req.user._id;
  if (isAdmin(req.user) && body.assignedTo && String(body.assignedTo) !== String(req.user._id)) {
    const assignee = await resolveAssignee(body.assignedTo, leadId);
    if (!assignee) errors.assignedTo = "Choose an active teammate.";
    else assignedTo = assignee._id;
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: "Invalid task", errors });

  const task = await Task.create({ title, type: body.type ?? "todo", leadId, dueAt, createdBy: req.user._id, assignedTo });
  if (String(assignedTo) !== String(req.user._id)) await notifyAssignee(assignedTo, task, req.user);
  const assigneeName = String(assignedTo) === String(req.user._id) ? null : (await User.findById(assignedTo, { name: 1 }))?.name;
  res.locals.audit = {
    label: assigneeName ? `Gave ${assigneeName} a task “${title}”` : `Added task “${title}”`,
    target: leadId ? { type: "lead", id: String(leadId) } : null,
  };
  res.status(201).json(await withLead(Task.findById(task._id)));
});

tasksRouter.patch("/:id", async (req, res) => {
  const task = await findTask(req);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const body = req.body ?? {};

  if ("title" in body) {
    const title = String(body.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "Please describe the task." });
    task.title = title;
  }
  if ("type" in body) {
    if (!TASK_TYPES.includes(body.type)) return res.status(400).json({ error: `Type must be one of ${TASK_TYPES.join(", ")}.` });
    task.type = body.type;
  }
  if ("dueAt" in body) {
    const dueAt = parseDue(body.dueAt);
    if (dueAt === undefined) return res.status(400).json({ error: "Invalid due date." });
    task.dueAt = dueAt;
    task.remindedAt = null;
  }
  // Admins can hand an existing task to someone else.
  let reassignedTo = null;
  if ("assignedTo" in body && isAdmin(req.user) && String(body.assignedTo) !== String(task.assignedTo)) {
    const assignee = await resolveAssignee(body.assignedTo, task.leadId);
    if (!assignee) return res.status(400).json({ error: "Choose an active teammate.", errors: { assignedTo: "Choose an active teammate." } });
    task.assignedTo = assignee._id;
    task.remindedAt = null;
    if (String(assignee._id) !== String(req.user._id)) reassignedTo = assignee;
  }
  const completing = body.done === true && !task.done;
  if ("done" in body) {
    task.done = Boolean(body.done);
    task.doneAt = task.done ? (task.doneAt ?? new Date()) : null;
  }
  await task.save();

  // Finishing a call/email/meeting task records it on the lead's timeline.
  if (completing && task.leadId) {
    const type = task.type === "todo" ? "note" : task.type;
    await logActivity(task.leadId, type, `Completed task: ${task.title}`, req.user.name, req.user._id);
  }
  if (completing) {
    res.locals.audit = { action: "task.complete", label: `Completed task “${task.title}”`, target: task.leadId ? { type: "lead", id: String(task.leadId) } : null };
  }
  if (reassignedTo) {
    await notifyAssignee(reassignedTo._id, task, req.user);
    res.locals.audit = {
      label: `Gave task “${task.title}” to ${reassignedTo.name}`,
      target: task.leadId ? { type: "lead", id: String(task.leadId) } : null,
    };
  }
  res.json(await withLead(Task.findById(task._id)));
});

tasksRouter.delete("/:id", async (req, res) => {
  const task = await findTask(req);
  if (!task) return res.status(404).json({ error: "Task not found" });
  await task.deleteOne();
  res.status(204).end();
});
