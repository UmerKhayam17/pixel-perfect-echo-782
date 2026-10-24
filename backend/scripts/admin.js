#!/usr/bin/env node
/**
 * Server-side account administration. There is deliberately no way to create an account from the
 * web app's sign-in page: the first admin is created here, and admins add staff inside the app.
 *
 *   npm run admin -- create --name "Ali Khan" --email ali@example.com
 *   npm run admin -- reset-password --email ali@example.com
 *   npm run admin -- list
 *
 * The password is asked for interactively (hidden). Without a terminal (e.g. in a script) it is
 * read from LF_ADMIN_PASSWORD, or a temporary one is generated and printed once; temporary
 * passwords must be changed at first sign-in.
 */
import crypto from "node:crypto";
import readline from "node:readline";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { hashPassword, passwordProblem } from "../src/services/security.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") ? true : (rest[++i] ?? true);
  }
  return { command, flags };
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing while the password is typed.
      rl._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function generatePassword() {
  return crypto.randomBytes(12).toString("base64url");
}

/** Returns { password, temporary }. */
async function obtainPassword(identity) {
  if (process.env.LF_ADMIN_PASSWORD) {
    const problem = passwordProblem(process.env.LF_ADMIN_PASSWORD, identity);
    if (problem) throw new Error(`LF_ADMIN_PASSWORD: ${problem}`);
    return { password: process.env.LF_ADMIN_PASSWORD, temporary: false };
  }
  if (process.stdin.isTTY) {
    for (;;) {
      const password = await ask("Password (hidden, min 8 characters): ", { hidden: true });
      const problem = passwordProblem(password, identity);
      if (problem) {
        console.log(`  ${problem}`);
        continue;
      }
      if ((await ask("Repeat password: ", { hidden: true })) !== password) {
        console.log("  The passwords don't match.");
        continue;
      }
      return { password, temporary: false };
    }
  }
  return { password: generatePassword(), temporary: true };
}

async function create(flags) {
  const interactive = process.stdin.isTTY;
  const name = String(flags.name ?? (interactive ? await ask("Name: ") : "")).trim();
  const email = String(flags.email ?? (interactive ? await ask("Email (used to sign in): ") : "")).trim().toLowerCase();
  if (!name) throw new Error("A name is required (--name).");
  if (!EMAIL_RE.test(email)) throw new Error("A valid email is required (--email).");
  if (await User.exists({ email })) throw new Error(`${email} already has an account. Use reset-password instead.`);

  const { password, temporary } = await obtainPassword({ name, email });
  await User.create({
    name,
    email,
    role: "admin",
    passwordHash: await hashPassword(password),
    mustChangePassword: temporary,
    passwordChangedAt: new Date(),
  });
  console.log(`\nAdmin account created for ${name} <${email}>.`);
  if (temporary) printTemporary(password);
  console.log("Sign in to the app, then add your staff from Team (user menu → Team).");
}

async function resetPassword(flags) {
  const email = String(flags.email ?? (process.stdin.isTTY ? await ask("Email of the account: ") : "")).trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No account uses ${email || "that email"}.`);
  const { password, temporary } = await obtainPassword(user);
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = temporary;
  user.passwordChangedAt = new Date();
  user.active = true;
  await user.save();
  const { deletedCount } = await Session.deleteMany({ userId: user._id });
  console.log(`\nPassword reset for ${user.name} <${email}> (${user.role}); ${deletedCount} session(s) signed out.`);
  if (temporary) printTemporary(password);
}

function printTemporary(password) {
  console.log(`Temporary password: ${password}`);
  console.log("It is shown only once and must be changed at first sign-in.");
}

async function list() {
  const users = await User.find().sort({ createdAt: 1 });
  if (!users.length) return console.log("No accounts yet. Create the admin with: npm run admin -- create");
  for (const u of users) {
    console.log(`${u.role.padEnd(6)}  ${u.active ? "active  " : "inactive"}  ${u.email}  (${u.name})`);
  }
}

const COMMANDS = { create, "reset-password": resetPassword, list };

const { command, flags } = parseArgs(process.argv.slice(2));
if (!COMMANDS[command]) {
  console.log("Usage:\n  npm run admin -- create [--name NAME --email EMAIL]\n  npm run admin -- reset-password [--email EMAIL]\n  npm run admin -- list");
  process.exit(command ? 1 : 0);
}
try {
  await mongoose.connect(config.mongoUri);
  await COMMANDS[command](flags);
  await mongoose.disconnect();
} catch (err) {
  console.error(`Error: ${err.message}`);
  await mongoose.disconnect();
  process.exit(1);
}
