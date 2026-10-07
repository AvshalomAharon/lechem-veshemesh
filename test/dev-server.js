// Local preview of /admin with FAKE back-end services (no network, no keys, nothing real is touched).
// Usage (from the project root):  node test/dev-server.js [success|verify-fail|process-fail]
// Then open http://localhost:3100/admin  (a signed dev session cookie is added to every request).
const http = require("http");

process.env.SESSION_SECRET = "dev-secret";
process.env.UPLOAD_TOKEN = "dev-token";

const { createSessionCookie } = require("../lib/session");
const adminHandler = require("../api/admin");
const { createHandler } = require("../api/docs");
const { createFakeDeps } = require("./fakes");

const scenario = process.argv[2] || "success";
const BAD_PRICES = { priceSourdough: 9999, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };

const fake = createFakeDeps({
  seedActive: [
    { doc_type: "pricelist", doc_key: "מחירון", file_name: "v1.md", chunk_count: 1, activated_at: "2026-10-06T19:00:00.000Z" },
    { doc_type: "other", file_name: "מידע ללקוחות.md", chunk_count: 2, activated_at: "2026-10-06T16:30:00.000Z" }
  ],
  parsePolls: [{ state: "running" }, { state: "running" }],
  prices: scenario === "verify-fail" ? BAD_PRICES : undefined,
  embedFail: scenario === "process-fail"
});
const docsHandler = createHandler(function () { return fake.deps; });
const sessionCookie = createSessionCookie("dev", "dev-secret").split(";")[0];

function decorate(res) {
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (payload) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = function (text) { res.end(text); return res; };
}

async function attachBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const type = req.headers["content-type"] || "";
  req.body = type.includes("application/json") ? JSON.parse(raw.toString("utf8") || "{}") : raw;
}

http.createServer(async function (req, res) {
  decorate(res);
  const url = new URL(req.url, "http://localhost");
  req.query = Object.fromEntries(url.searchParams);
  req.headers.cookie = sessionCookie;
  try {
    if (url.pathname === "/admin") return adminHandler(req, res);
    if (url.pathname === "/api/docs") {
      if (req.method === "POST") await attachBody(req);
      return docsHandler(req, res);
    }
    res.status(404).end("not found");
  } catch (error) {
    res.status(500).end(String(error && error.message));
  }
}).listen(3100, function () {
  console.log("dev server (" + scenario + ") on http://localhost:3100/admin");
});
