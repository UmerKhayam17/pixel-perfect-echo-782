import { Notification } from "../models/Notification.js";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";

/** Sends one notification to each user (ids may repeat or be null; never throws). */
export async function notify(userIds, { type, title, body = "", link = null }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((userId) => ({ userId, type, title, body, link })));
  } catch (err) {
    console.error("[notify]", err.message);
  }
}

export const notifyAdmins = async (message) =>
  notify((await User.find({ role: "admin", active: true }, { _id: 1 })).map((u) => u._id), message);

/**
 * Task reminders: once when a task is due within the next 15 minutes (or already overdue and never
 * reminded), to whoever the task belongs to.
 */
async function remindDueTasks() {
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  const tasks = await Task.find({ done: false, dueAt: { $ne: null, $lte: soon }, remindedAt: null }).populate("leadId", "businessName").limit(500);
  for (const task of tasks) {
    const overdue = task.dueAt < new Date();
    await notify([task.assignedTo ?? task.createdBy], {
      type: "task_due",
      title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
      body: [task.leadId?.businessName, task.dueAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · "),
      link: task.leadId ? `/leads/${task.leadId._id}` : "/tasks",
    });
    await Task.updateOne({ _id: task._id }, { remindedAt: new Date() });
  }
}

export function startTaskReminders() {
  const run = () => remindDueTasks().catch((err) => console.error("[reminders]", err.message));
  setTimeout(run, 15_000).unref();
  setInterval(run, 60_000).unref();
}
