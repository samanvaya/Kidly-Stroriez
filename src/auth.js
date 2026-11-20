import crypto from "node:crypto";
import { Router } from "express";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCRYPT_N = 16384;
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: SCRYPT_N }, (err, key) =>
      err ? reject(err) : resolve(key.toString("hex"))
    )
  );
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: SCRYPT_N }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
  const expectedBuf = Buffer.from(expected, "hex");
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
}

export function signToken(userId, secret) {
  const ts = Date.now().toString(36);
  const payload = `${userId}.${ts}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, ts, given] = parts;
  if (!userId || !ts || !given || given.length !== 64) return null;
  const payload = `${userId}.${ts}`;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(payload).digest("hex"),
    "hex"
  );
  const givenBuf = Buffer.from(given, "hex");
  if (givenBuf.length !== expected.length || !crypto.timingSafeEqual(givenBuf, expected)) return null;
  // Reject tokens older than 7 days even if the signature is valid.
  if (Date.now() - parseInt(ts, 36) > TOKEN_MAX_AGE_MS) return null;
  return { userId };
}

export function parentGate(db, secret) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Login required." });
    }
    const result = verifyToken(header.slice(7), secret);
    if (!result) return res.status(401).json({ error: "Login required." });
    const user = db.findUserById(result.userId);
    if (!user) return res.status(401).json({ error: "Login required." });
    req.user = { id: user.id, email: user.email };
    return next();
  };
}

// Simple in-memory rate limiter — same pattern as src/app.js.
// Accepts overrides so tests can use small limits without sleeping.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }
    return next();
  };
}

export function createAuthRouter(db, secret, {
  loginMax = 10,
  loginWindowMs = 15 * 60 * 1000,
  registerMax = 5,
  registerWindowMs = 60 * 60 * 1000,
} = {}) {
  const router = Router();
  const loginLimit = rateLimit({ windowMs: loginWindowMs, max: loginMax });
  const registerLimit = rateLimit({ windowMs: registerWindowMs, max: registerMax });

  router.post("/register", registerLimit, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    const passwordHash = await hashPassword(password);
    const { value, error } = db.createUser({ email, passwordHash });
    if (error) return res.status(409).json({ error });
    return res.status(201).json({ token: signToken(value.id, secret) });
  });

  router.post("/login", loginLimit, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = db.findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    return res.json({ token: signToken(user.id, secret) });
  });

  router.post("/logout", (_req, res) => res.json({ ok: true }));

  // Lets the frontend silently verify a stored token is still valid on page load.
  router.get("/me", parentGate(db, secret), (req, res) => res.json(req.user));

  return router;
}
