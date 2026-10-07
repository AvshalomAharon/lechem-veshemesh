// In-memory stand-ins for Supabase, OpenAI and LlamaParse. Test-only. The "swap" mirrors docs/rag-pipeline/schema.sql.
const DEFAULT_MARKDOWN = "# מחירון\n\n| מוצר | מחיר |\n|---|---|\n| לחם כפרי מחמצת | 32 ₪ |\n| לחם שיפון | 36 ₪ |\n| חלה | 28 ₪ |\n| בורקס גבינה | 12 ₪ |\n";
const GOOD_PRICES = { priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
const FAKE_DIMENSIONS = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// options: documents, priceList, seedActive, parsePolls, markdown, prices, embedFail, embedShort,
//          failInsertStaging, failActivate
function createFakeDeps(options) {
  const opts = options || {};
  let nowMs = Date.parse("2026-10-07T10:00:00Z");
  const polls = (opts.parsePolls || []).slice();

  const state = {
    versions: new Map(),
    staging: [],
    documents: (opts.documents || []).map(clone),
    priceList: Object.assign({}, opts.priceList || {}),
    parseStarts: [],
    extractCalls: 0,
    sweeps: 0,
    nextId: 1,
    advance: function (ms) { nowMs += ms; }
  };

  (opts.seedActive || []).forEach(function (seed) {
    const id = "seed" + (state.nextId++);
    state.versions.set(id, Object.assign({
      id: id, doc_type: "other", doc_key: seed.file_name, status: "active", stage: "verified",
      chunk_count: 1, source_text: null, extracted: null, parse_job_id: null,
      created_at: "2026-10-01T08:00:00.000Z", activated_at: "2026-10-01T08:00:00.000Z"
    }, seed));
  });

  const db = {
    insertVersion: async function (row) {
      const id = "v" + (state.nextId++);
      const version = Object.assign({
        id: id, status: "pending", stage: "received", chunk_count: null, extracted: null,
        parse_job_id: null, source_text: null, created_at: new Date(nowMs).toISOString(), activated_at: null
      }, row);
      state.versions.set(id, version);
      return clone(version);
    },
    getVersion: async function (id) {
      const version = state.versions.get(id);
      return version ? clone(version) : null;
    },
    updateVersion: async function (id, patch) {
      Object.assign(state.versions.get(id), patch);
    },
    insertStaging: async function (rows) {
      if (opts.failInsertStaging) throw new Error("insert failed");
      rows.forEach(function (row) { state.staging.push(clone(row)); });
    },
    deleteStaging: async function (versionId) {
      state.staging = state.staging.filter(function (row) { return row.version_id !== versionId; });
    },
    verifyStaged: async function (versionId) {
      const rows = state.staging.filter(function (row) { return row.version_id === versionId; });
      return {
        total: rows.length,
        bad_dims: rows.filter(function (row) { return !row.embedding || row.embedding.length !== FAKE_DIMENSIONS; }).length,
        empty: rows.filter(function (row) { return !row.content || !row.content.trim(); }).length
      };
    },
    activate: async function (versionId) {
      if (opts.failActivate) throw new Error("activate failed");
      const version = state.versions.get(versionId);
      if (!version || version.status !== "pending" || version.stage !== "verified") throw new Error("version_not_verified");
      const rows = state.staging.filter(function (row) { return row.version_id === versionId; });
      const label = version.doc_type === "pricelist" ? "מחירון" : "אחר";
      state.documents = state.documents.filter(function (doc) {
        return !(doc.metadata.doc === label && (version.doc_type === "pricelist" || doc.metadata.fileName === version.file_name));
      });
      rows.forEach(function (row) {
        state.documents.push({ content: row.content, metadata: clone(row.metadata), embedding: row.embedding });
      });
      if (version.doc_type === "pricelist") Object.assign(state.priceList, version.extracted);
      Array.from(state.versions.entries()).forEach(function (entry) {
        if (entry[1].doc_key === version.doc_key && entry[1].status === "active") state.versions.delete(entry[0]);
      });
      version.status = "active";
      version.activated_at = new Date(nowMs).toISOString();
      version.source_text = null;
      state.staging = state.staging.filter(function (row) { return row.version_id !== versionId; });
      return { chunk_count: rows.length };
    },
    listActive: async function () {
      return Array.from(state.versions.values()).filter(function (v) { return v.status === "active"; }).map(clone);
    },
    sweep: async function () {
      state.sweeps += 1;
    }
  };

  const parser = {
    start: async function (buffer, fileName, mime) {
      state.parseStarts.push({ fileName: fileName, mime: mime, size: buffer.length });
      return "job-" + state.parseStarts.length;
    },
    poll: async function () {
      return polls.shift() || { state: "done", markdown: opts.markdown || DEFAULT_MARKDOWN };
    }
  };

  const deps = {
    db: db,
    parser: parser,
    embed: async function (texts) {
      if (opts.embedFail) throw new Error("openai 500");
      const list = opts.embedShort ? texts.slice(1) : texts;
      return list.map(function () { return [0.1, 0.2, 0.3]; });
    },
    extractPrices: async function () {
      state.extractCalls += 1;
      return opts.prices || GOOD_PRICES;
    },
    now: function () { return new Date(nowMs); }
  };

  return { deps: deps, state: state };
}

module.exports = { createFakeDeps, DEFAULT_MARKDOWN, GOOD_PRICES };
