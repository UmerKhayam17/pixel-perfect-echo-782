import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const scrypt = promisify(crypto.scrypt);

/* -------------------------------- Passwords ------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** "scrypt$N$r$p$salt$hash" (base64url parts). */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Verifying against this when the email is unknown keeps response times the same, so
// attackers can't probe which addresses have accounts.
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString("hex"));
export const verifyDummy = (password) => verifyPassword(password, DUMMY_HASH);

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "11111111", "letmein1", "iloveyou", "admin123", "welcome1"]);

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password, { email = "", name = "" } = {}) {
  const pw = String(password ?? "");
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "Use at most 200 characters.";
  if (COMMON.has(pw.toLowerCase())) return "This password is too common.";
  if (/^(.)\1+$/.test(pw)) return "Don't repeat a single character.";
  const lower = pw.toLowerCase();
  if ((email && lower === email.toLowerCase()) || (name && lower === name.toLowerCase())) {
    return "Don't use your name or email as the password.";
  }
  return null;
}

/* ---------------------------------- Tokens -------------------------------- */

export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/* --------------------------- Encryption at rest --------------------------- */

// AES-256-GCM key: APP_SECRET from .env, otherwise a key file generated on first start.
function loadKey() {
  if (config.appSecret) return crypto.createHash("sha256").update(config.appSecret).digest();
  const file = path.join(config.root, ".app-secret");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
    console.log(`Generated an encryption key at ${file}. Back it up: without it, saved email passwords can't be read.`);
  }
  return crypto.createHash("sha256").update(fs.readFileSync(file, "utf8").trim()).digest();
}

const KEY = loadKey();
const PREFIX = "enc:v1:";

export const isEncrypted = (value) => typeof value === "string" && value.startsWith(PREFIX);

export function encryptSecret(plain) {
  if (!plain || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(value) {
  if (!isEncrypted(value)) return value ?? "";
  const [iv, tag, data] = value.slice(PREFIX.length).split(".").map((s) => Buffer.from(s, "base64url"));
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    console.error("Could not decrypt a stored secret — was the encryption key (APP_SECRET / .app-secret) changed?");
    return "";
  }
}
