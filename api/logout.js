// GET /api/logout -> clears the session cookie and returns to the public site.
const { clearSessionCookie } = require("../lib/session");

module.exports = function handler(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", "/");
  res.status(302).end();
};
