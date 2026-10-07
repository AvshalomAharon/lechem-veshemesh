// /api/docs?action=upload|process|verify|activate|list  - the safe-replace pipeline for pricelists and
// "other" documents. Logged-in session only. The browser drives the steps one request at a time.
const { readSession } = require("../lib/session");
const { getEnv } = require("../lib/env");
const pipeline = require("../lib/docs/pipeline");
const { buildDeps } = require("../lib/docs/deps");

const PipelineError = pipeline.PipelineError;
const MAX_BODY_BYTES = pipeline.MAX_BYTES + 1024 * 1024;

function getAction(req) {
  if (req.query && req.query.action) return String(req.query.action);
  try {
    return new URL(req.url || "", "http://localhost").searchParams.get("action") || "";
  } catch (error) {
    return "";
  }
}

function header(req, name) {
  const value = req.headers && req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PipelineError("receive", "הקובץ גדול מדי (מעל 4MB).", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readJson(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : (body || "{}"));
  } catch (error) {
    return {};
  }
}

function decodeFileName(raw) {
  try {
    return decodeURIComponent(raw || "");
  } catch (error) {
    throw new PipelineError("receive", "שם הקובץ לא תקין.", 400);
  }
}

const ACTIONS = {
  upload: { method: "POST", run: async function (deps, req) {
    return pipeline.receive(deps, {
      docType: header(req, "x-doc-type"),
      fileName: decodeFileName(header(req, "x-file-name")),
      buffer: await readRawBody(req)
    });
  } },
  process: { method: "POST", run: function (deps, req) { return pipeline.processVersion(deps, readJson(req).versionId); } },
  verify: { method: "POST", run: function (deps, req) { return pipeline.verifyVersion(deps, readJson(req).versionId); } },
  activate: { method: "POST", run: function (deps, req) { return pipeline.activateVersion(deps, readJson(req).versionId); } },
  list: { method: "GET", run: function (deps) { return pipeline.listDocuments(deps); } }
};

function createHandler(getDeps) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    const session = readSession(req, getEnv("SESSION_SECRET"));
    if (!session) {
      return res.status(401).json({ ok: false, code: "unauthorized", message: "פג תוקף הכניסה. יש להתחבר מחדש." });
    }

    const action = ACTIONS[getAction(req)];
    if (!action) return res.status(400).json({ ok: false, code: "unknown_action", message: "פעולה לא מוכרת." });
    if (req.method !== action.method) {
      res.setHeader("Allow", action.method);
      return res.status(405).json({ ok: false, code: "method_not_allowed", message: "שיטת בקשה לא נתמכת." });
    }

    let deps;
    try {
      deps = getDeps();
    } catch (error) {
      return res.status(500).json({ ok: false, code: "not_configured", message: error.userMessage || "השרת לא הוגדר." });
    }

    try {
      const result = await action.run(deps, req);
      return res.status(200).json(Object.assign({ ok: true }, result));
    } catch (error) {
      if (error instanceof PipelineError) {
        return res.status(error.status).json({
          ok: false,
          step: error.step,
          message: error.message,
          versionId: error.versionId || undefined,
          detail: error.detail || undefined,
          previousKept: true
        });
      }
      console.error("api/docs unexpected error:", error && error.message);
      return res.status(500).json({
        ok: false,
        code: "server_error",
        message: "אירעה שגיאה בשרת. נסו שוב.",
        detail: (error && error.detail) || undefined
      });
    }
  };
}

module.exports = createHandler(function () { return buildDeps(getEnv); });
module.exports.createHandler = createHandler;
