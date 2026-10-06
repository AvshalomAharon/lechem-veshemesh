// Signed, expiring session cookie for the bakery back-office (no database, no dependencies).
// The secret comes from the SESSION_SECRET environment variable - never from the repository.
const crypto = require("crypto");

const COOKIE_NAME = "ls_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

// Constant-time comparison that also hides the length of the compared values.
function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function createSessionCookie(user, secret) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ u: user, exp: expires })).toString("base64url");
  const value = payload + "." + sign(payload, secret);
  return COOKIE_NAME + "=" + value + "; Path=/; Max-Age=" + MAX_AGE_SECONDS + "; HttpOnly; Secure; SameSite=Strict";
}

function clearSessionCookie() {
  return COOKIE_NAME + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

function readCookie(req, name) {
  const header = (req.headers && req.headers.cookie) || "";
  const parts = header.split(";");
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index > -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

// Returns { user } for a valid, unexpired session; otherwise null.
function readSession(req, secret) {
  if (!secret) return null;
  const raw = readCookie(req, COOKIE_NAME);
  const dot = raw.indexOf(".");
  if (dot < 1) return null;

  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { user: data.u };
  } catch (error) {
    return null;
  }
}

module.exports = { createSessionCookie, clearSessionCookie, readSession, safeEqual };
