// POST /api/login  { username, password }  ->  sets the session cookie.
// Credentials come from environment variables (ADMIN_USER, ADMIN_PASSWORD); the session is
// signed with SESSION_SECRET. If anything is missing the login stays closed.
const { createSessionCookie, safeEqual } = require("../lib/session");
const { getEnv } = require("../lib/env");

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;
const FAILURE_DELAY_MS = 700;

// n8n "התראה: כניסה מוצלחת למערכת" webhook (public URL, no secret in it). Called only after a correct
// username and password; it emails the owner, at most once per 30 minutes (limited inside n8n).
const LOGIN_NOTIFY_URL = "https://avshalom.app.n8n.cloud/webhook/admin-login-success";
const LOGIN_NOTIFY_TIMEOUT_MS = 2000;

// Best-effort limit per IP (serverless instances do not share memory, so this only slows
// down simple brute-force attempts; the delay on every failure does the rest).
const failures = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (forwarded ? String(forwarded).split(",")[0] : (req.socket && req.socket.remoteAddress) || "unknown").trim();
}

function isBlocked(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function registerFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function readBody(req) {
  const body = req.body;
  if (body && typeof body === "object") return body;
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    return {};
  }
}

// Sends only the browser's user agent (no username, password or IP). Awaited, because a serverless
// function may be frozen right after the response, but with a short timeout and every error swallowed:
// a failed notification must never block or fail the login.
async function notifyLogin(req) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, LOGIN_NOTIFY_TIMEOUT_MS);
  try {
    await fetch(LOGIN_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAgent: String((req.headers && req.headers["user-agent"]) || "") }),
      signal: controller.signal
    });
  } catch (error) {
    // Ignored on purpose.
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "method_not_allowed" });
  }

  const adminUser = getEnv("ADMIN_USER");
  const adminPassword = getEnv("ADMIN_PASSWORD");
  const secret = getEnv("SESSION_SECRET");
  if (!adminUser || !adminPassword || !secret) {
    return res.status(500).json({ ok: false, code: "not_configured" });
  }

  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return res.status(429).json({ ok: false, code: "too_many_attempts" });
  }

  const body = readBody(req);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Evaluate both comparisons so the response time does not reveal which one failed.
  const userOk = safeEqual(username, adminUser);
  const passwordOk = safeEqual(password, adminPassword);

  if (!(userOk && passwordOk)) {
    registerFailure(ip);
    await delay(FAILURE_DELAY_MS);
    return res.status(401).json({ ok: false, code: "invalid_credentials" });
  }

  failures.delete(ip);
  await notifyLogin(req);
  res.setHeader("Set-Cookie", createSessionCookie(adminUser, secret));
  return res.status(200).json({ ok: true });
};
