import { config } from "../config.js";
import { User } from "../models/User.js";
import { hashPassword, passwordProblem } from "./security.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates the admin account from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env on startup.
 * It only ever creates the account: if that email already exists nothing is changed, so a
 * password changed in the app is never overwritten. Because the .env password is stored in plain
 * text, the admin is asked to choose a new one at first sign-in.
 */
export async function bootstrapAdmin() {
  const { name, email, password } = config.admin;
  if (!email && !password) {
    if (!(await User.exists({}))) {
      console.warn("No user accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env and restart, or run: npm run admin -- create");
    }
    return;
  }
  if (!EMAIL_RE.test(email)) return console.error("ADMIN_EMAIL in .env is not a valid email address — admin not created.");

  const existing = await User.findOne({ email });
  if (existing) {
    if (password) console.warn(`Admin ${email} exists. You can now remove ADMIN_PASSWORD from backend/.env.`);
    return;
  }
  if (!password) return console.error("ADMIN_PASSWORD is empty in .env — admin not created.");
  const problem = passwordProblem(password, { email, name });
  if (problem) return console.error(`ADMIN_PASSWORD in .env is too weak (${problem}) — admin not created.`);

  await User.create({
    name: name || email.split("@")[0],
    email,
    role: "admin",
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    passwordChangedAt: new Date(),
  });
  console.log(`Created admin account ${email} from .env. Sign in and choose a new password, then remove ADMIN_PASSWORD from .env.`);
}
