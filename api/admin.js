// GET /admin -> the back-office page for a valid session, otherwise the login form.
// The back-office HTML lives in private/ (blocked from direct access in vercel.json) and the
// upload token is injected here, so it is only ever sent to a logged-in browser.
const fs = require("fs");
const path = require("path");
const { readSession } = require("../lib/session");
const { getEnv } = require("../lib/env");

function readPrivateFile(name) {
  const candidates = [
    path.join(process.cwd(), "private", name),
    path.join(__dirname, "..", "private", name)
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  throw new Error("private/" + name + " not found");
}

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const session = readSession(req, getEnv("SESSION_SECRET"));
  if (!session) {
    return res.status(200).send(readPrivateFile("login.html"));
  }

  const uploadToken = getEnv("UPLOAD_TOKEN");
  const html = readPrivateFile("admin.html").replace("__UPLOAD_TOKEN__", function () { return uploadToken; });
  return res.status(200).send(html);
};
