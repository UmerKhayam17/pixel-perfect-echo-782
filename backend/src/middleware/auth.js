import { config } from "../config.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { randomToken, sha256 } from "../services/security.js";

export const SESSION_COOKIE = "lf_session";
const SHORT_SESSION_MS = 12 * 3600 * 1000;
const LONG_SESSION_MS = config.sessionDays * 86400 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieOptions(expiresAt, remember) {
  return {
    httpOnly: true,
    secure: config.cookieSecure || config.cookieSameSite === "none",
    sameSite: config.cookieSameSite,
    path: "/api",
    // Without "keep me signed in" the cookie ends with the browser session.
    ...(remember ? { expires: expiresAt } : {}),
  };
}

export const clientIp = (req) => req.ip ?? req.socket.remoteAddress ?? "";

/** Starts a session for `user` and sets the cookie. */
export async function signIn(req, res, user, remember) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (remember ? LONG_SESSION_MS : SHORT_SESSION_MS));
  await Session.create({
    tokenHash: sha256(token),
    userId: user._id,
    expiresAt,
    remember,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt, remember));
}

export async function signOut(req, res) {
  if (req.session) await Session.deleteOne({ _id: req.session._id });
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(null, false) });
}

/** Attaches req.user / req.session when the request carries a valid session cookie. */
export async function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).populate("userId");
  const user = session?.userId;
  if (!session || !user?.active) {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(null, false) });
    return next();
  }
  req.session = session;
  req.user = user;

  // Sliding expiry: keep active sessions alive without writing on every request.
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    const update = { lastSeenAt: new Date(now) };
    const lifetime = session.remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
    if (session.expiresAt.getTime() - now < lifetime / 2) {
      update.expiresAt = new Date(now + lifetime);
      res.cookie(SESSION_COOKIE, token, cookieOptions(update.expiresAt, session.remember));
    }
    await Session.updateOne({ _id: session._id }, update);
    await User.updateOne({ _id: user._id }, { lastSeenAt: update.lastSeenAt });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in.", code: "unauthenticated" });
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: "Choose a new password to continue.", code: "password_change_required" });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only an admin can do this.", code: "forbidden" });
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when the page that sent the request is on the address the request was sent to — e.g. the
 * app opened at http://192.168.1.20:8080 calling /api through the frontend server's proxy.
 */
function sameHost(origin, req) {
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * CSRF protection: state-changing requests must carry a custom header (which other sites can't
 * add without passing CORS) and, when the browser sends an Origin, come from an allowed one.
 */
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !config.corsOrigin.includes("*") && !config.corsOrigin.includes(origin) && !sameHost(origin, req)) {
    return res.status(403).json({ error: "Request from an unknown origin was blocked." });
  }
  if (req.headers["x-requested-with"] !== "LeadFinder") {
    return res.status(403).json({ error: "Missing X-Requested-With header." });
  }
  next();
}

export function securityHeaders(_req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
  });
  if (config.cookieSecure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

/** Small in-memory fixed-window limiter (single API process). */
export function rateLimit({ windowMs, max, key, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  const limiter = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    if (entry.count >= max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    entry.count++;
    next();
  };
  /** Forget the counter, e.g. after a successful login. */
  limiter.reset = (req) => hits.delete(key(req));
  return limiter;
}
