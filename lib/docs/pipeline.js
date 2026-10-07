// The safe-replace pipeline for knowledge-base documents: receive -> process -> verify -> activate.
// Every function takes `deps` (db, parser, embed, extractPrices, now) so it can be tested with fakes.
// New chunks live in documents_staging; only activate (one SQL transaction) touches the live documents table.
const { splitText } = require("./chunker");
const { validatePrices } = require("./prices");

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies above ~4.5MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;
const PARSE_TIMEOUT_MS = 5 * 60 * 1000;

const EXTENSIONS = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".md": "text/markdown",
  ".txt": "text/plain"
};
const TEXT_EXTENSIONS = [".md", ".txt"];
const DOC_TYPES = ["pricelist", "other"];

const FALLBACK_MESSAGES = {
  receive: "קליטת הקובץ נכשלה. נסו שוב.",
  process: "עיבוד המסמך נכשל. נסו שוב בעוד רגע.",
  verify: "בדיקת המסמך נכשלה. נסו שוב.",
  activate: "ההחלפה נכשלה. נסו שוב."
};

class PipelineError extends Error {
  constructor(step, message, status) {
    super(message);
    this.name = "PipelineError";
    this.step = step;
    this.status = status || 400;
    this.versionId = null;
  }
}

function fileExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index).toLowerCase();
}

// Only PipelineError messages and errors that carry a userMessage are safe to show; everything else is logged.
function safeMessage(err, step) {
  if (err instanceof PipelineError) return err.message;
  if (err && typeof err.userMessage === "string") return err.userMessage;
  return FALLBACK_MESSAGES[step];
}

// Removes every partial row of the version, marks it failed, and returns the error to throw.
// The live documents / price_list tables are never touched here.
async function failVersion(deps, versionId, step, err) {
  const known = err instanceof PipelineError || (err && typeof err.userMessage === "string");
  if (!known) console.error("docs pipeline failed at " + step + ":", err && err.message);
  const message = safeMessage(err, step);
  try {
    await deps.db.deleteStaging(versionId);
  } catch (cleanupError) {
    console.error("docs pipeline: staging cleanup failed:", cleanupError && cleanupError.message);
  }
  try {
    await deps.db.updateVersion(versionId, { status: "failed", error_step: step, error_message: message, source_text: null });
  } catch (markError) {
    console.error("docs pipeline: marking version failed did not work:", markError && markError.message);
  }
  const failure = new PipelineError(step, message, err instanceof PipelineError ? err.status : 500);
  failure.versionId = versionId;
  if (err && typeof err.detail === "string") failure.detail = err.detail;
  return failure;
}

async function guarded(deps, versionId, step, work) {
  try {
    return await work();
  } catch (err) {
    throw await failVersion(deps, versionId, step, err);
  }
}

// Loads a version that may still be worked on. These errors are not failures of the version itself.
async function loadPending(deps, versionId, step) {
  const version = versionId ? await deps.db.getVersion(versionId) : null;
  if (!version) throw new PipelineError(step, "הגרסה לא נמצאה.", 404);
  if (version.status !== "pending") throw new PipelineError(step, "הגרסה כבר לא ממתינה (היא הוחלפה או נכשלה). אפשר להתחיל העלאה חדשה.", 409);
  return version;
}

async function receive(deps, input) {
  const docType = input && input.docType;
  if (!DOC_TYPES.includes(docType)) throw new PipelineError("receive", "סוג המסמך לא תקין.", 400);

  const fileName = String((input && input.fileName) || "").trim();
  if (!fileName) throw new PipelineError("receive", "חסר שם קובץ.", 400);

  const extension = fileExtension(fileName);
  if (!EXTENSIONS[extension]) {
    throw new PipelineError("receive", "סוג הקובץ לא נתמך. אפשר להעלות PDF, תמונה (JPG או PNG) או קובץ טקסט (MD או TXT).", 400);
  }

  const buffer = input.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new PipelineError("receive", "הקובץ ריק.", 400);
  if (buffer.length > MAX_BYTES) {
    throw new PipelineError("receive", "הקובץ גדול מדי (מעל 4MB). אפשר לשלוח PDF או תמונה קטנה יותר.", 413);
  }

  const isText = TEXT_EXTENSIONS.includes(extension);
  let sourceText = null;
  if (isText) {
    sourceText = buffer.toString("utf8").replace(/^﻿/, "");
    if (!sourceText.trim()) throw new PipelineError("receive", "בקובץ אין טקסט.", 422);
  }

  const version = await deps.db.insertVersion({
    doc_type: docType,
    doc_key: docType === "pricelist" ? "מחירון" : fileName,
    file_name: fileName,
    source_text: sourceText
  });

  if (!isText) {
    await guarded(deps, version.id, "receive", async function () {
      const jobId = await deps.parser.start(buffer, fileName, EXTENSIONS[extension]);
      await deps.db.updateVersion(version.id, { parse_job_id: jobId });
    });
  }

  return { versionId: version.id, fileName: fileName, docType: docType, needsParsing: !isText };
}

async function processVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "process");
  if (version.stage === "processed") return { state: "done", chunkCount: version.chunk_count };
  if (version.stage !== "received") throw new PipelineError("process", "שלב העיבוד כבר הסתיים.", 409);

  return guarded(deps, versionId, "process", async function () {
    let text = version.source_text;

    if (!text) {
      const job = await deps.parser.poll(version.parse_job_id);
      if (job.state === "failed") {
        throw new PipelineError("process", "פענוח המסמך נכשל: " + (job.message || "לא צוינה סיבה") + ". ייתכן שהתמונה לא ברורה מספיק.", 422);
      }
      if (job.state === "running") {
        if (deps.now().getTime() - new Date(version.created_at).getTime() > PARSE_TIMEOUT_MS) {
          throw new PipelineError("process", "פענוח המסמך נמשך יותר מ-5 דקות ולא הסתיים.", 504);
        }
        return { state: "running" };
      }
      text = job.markdown || "";
      await deps.db.updateVersion(versionId, { source_text: text });
    }

    const chunks = splitText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (chunks.length === 0) throw new PipelineError("process", "לא נמצא טקסט במסמך.", 422);

    const extracted = version.doc_type === "pricelist" ? await deps.extractPrices(text) : null;

    // Start from a clean slate so a retry can never leave duplicates.
    await deps.db.deleteStaging(versionId);
    const embeddings = await deps.embed(chunks);
    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new PipelineError("process", "שירות ה-embeddings החזיר מספר תוצאות שגוי.", 502);
    }

    const uploadedAt = deps.now().toISOString();
    const doc = version.doc_type === "pricelist" ? "מחירון" : "אחר";
    await deps.db.insertStaging(chunks.map(function (content, index) {
      return {
        version_id: versionId,
        content: content,
        metadata: { doc: doc, fileName: version.file_name, uploadedAt: uploadedAt, version_id: versionId },
        embedding: embeddings[index]
      };
    }));
    await deps.db.updateVersion(versionId, { chunk_count: chunks.length, extracted: extracted, stage: "processed" });
    return { state: "done", chunkCount: chunks.length };
  });
}

async function verifyVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "verify");
  if (version.stage === "verified") return { ok: true, chunkCount: version.chunk_count };
  if (version.stage !== "processed") throw new PipelineError("verify", "אי אפשר לבדוק לפני שהעיבוד הסתיים.", 409);

  return guarded(deps, versionId, "verify", async function () {
    const stats = await deps.db.verifyStaged(versionId);
    if (stats.total !== version.chunk_count) {
      throw new PipelineError("verify", "מספר החתיכות שנשמרו (" + stats.total + ") שונה מהצפוי (" + version.chunk_count + ").", 422);
    }
    if (stats.bad_dims > 0) throw new PipelineError("verify", "בחלק מהחתיכות חסר embedding או שהוא בגודל לא תקין.", 422);
    if (stats.empty > 0) throw new PipelineError("verify", "חלק מהחתיכות ריקות.", 422);

    const patch = { stage: "verified" };
    if (version.doc_type === "pricelist") {
      const result = validatePrices(version.extracted, version.source_text);
      if (!result.ok) throw new PipelineError("verify", result.message, 422);
      patch.extracted = result.values;
    }
    await deps.db.updateVersion(versionId, patch);
    return { ok: true, chunkCount: version.chunk_count };
  });
}

async function activateVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "activate");
  if (version.stage !== "verified") throw new PipelineError("activate", "אי אפשר להחליף לפני שהגרסה נבדקה.", 409);

  return guarded(deps, versionId, "activate", async function () {
    const result = await deps.db.activate(versionId);
    return { ok: true, chunkCount: result.chunk_count };
  });
}

async function listDocuments(deps) {
  try {
    await deps.db.sweep();
  } catch (err) {
    console.error("docs pipeline: sweep failed:", err && err.message);
  }
  const rows = await deps.db.listActive();
  return {
    documents: rows.map(function (row) {
      return {
        id: row.id,
        name: row.file_name,
        type: row.doc_type,
        chunkCount: row.chunk_count,
        updatedAt: row.activated_at || row.created_at
      };
    })
  };
}

module.exports = {
  PipelineError, MAX_BYTES, EXTENSIONS,
  receive, processVersion, verifyVersion, activateVersion, listDocuments
};
