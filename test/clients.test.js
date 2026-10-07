const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("../lib/docs/db");
const { createEmbedder, createPriceExtractor } = require("../lib/docs/openai");
const { createParser } = require("../lib/docs/llamaparse");
const { buildDeps } = require("../lib/docs/deps");

function fakeFetch(responses) {
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url: String(url), init: init || {} });
    const next = responses.shift() || { status: 200, body: "" };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async function () { return typeof next.body === "string" ? next.body : JSON.stringify(next.body); },
      json: async function () { return next.body; }
    };
  }
  return { fetchImpl: fetchImpl, calls: calls };
}

const KEY = "secret-service-key";

test("db: insertVersion posts to PostgREST with the service key and returns the row", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, body: [{ id: "abc", status: "pending" }] }]);
  const db = createDb("https://x.supabase.co/", KEY, fetchImpl);
  const row = await db.insertVersion({ doc_type: "other", doc_key: "a.md", file_name: "a.md" });
  assert.equal(row.id, "abc");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, KEY);
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + KEY);
  assert.equal(calls[0].init.headers.Prefer, "return=representation");
});

test("db: a new-style secret key (sb_secret_...) is sent only in the apikey header", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: [] }]);
  const db = createDb("https://x.supabase.co", "sb_secret_abc123", fetchImpl);
  await db.getVersion("abc");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_abc123");
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("db: getVersion filters by id and returns null when missing", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: [] }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  assert.equal(await db.getVersion("id with/odd chars"), null);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions?id=eq.id%20with%2Fodd%20chars&select=*");
});

test("db: updateVersion patches by id", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 204, body: "" }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await db.updateVersion("abc", { stage: "processed" });
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions?id=eq.abc");
  assert.deepEqual(JSON.parse(calls[0].init.body), { stage: "processed" });
});

test("db: insertStaging sends embeddings as pgvector text, in batches of 50", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, body: "" }, { status: 201, body: "" }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  const rows = [];
  for (let i = 0; i < 51; i++) rows.push({ version_id: "v", content: "c" + i, metadata: { n: i }, embedding: [0.5, 0.25] });
  await db.insertStaging(rows);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].init.body).length, 50);
  assert.equal(JSON.parse(calls[1].init.body).length, 1);
  assert.equal(JSON.parse(calls[0].init.body)[0].embedding, "[0.5,0.25]");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/documents_staging");
});

test("db: deleteStaging, rpc calls and listActive use the expected endpoints", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 204, body: "" },
    { status: 200, body: { total: 2, bad_dims: 0, empty: 0 } },
    { status: 200, body: { chunk_count: 2 } },
    { status: 200, body: [{ id: "1" }] },
    { status: 200, body: "" }
  ]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await db.deleteStaging("abc");
  assert.deepEqual(await db.verifyStaged("abc"), { total: 2, bad_dims: 0, empty: 0 });
  assert.deepEqual(await db.activate("abc"), { chunk_count: 2 });
  assert.deepEqual(await db.listActive(), [{ id: "1" }]);
  await db.sweep();
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/documents_staging?version_id=eq.abc");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[1].url, "https://x.supabase.co/rest/v1/rpc/verify_staged_version");
  assert.deepEqual(JSON.parse(calls[1].init.body), { p_version_id: "abc" });
  assert.equal(calls[2].url, "https://x.supabase.co/rest/v1/rpc/activate_document_version");
  assert.match(calls[3].url, /document_versions\?status=eq\.active&select=.*&order=activated_at\.desc\.nullslast$/);
  assert.equal(calls[4].url, "https://x.supabase.co/rest/v1/rpc/sweep_document_versions");
});

test("db: an error response throws without leaking the key", async function () {
  const { fetchImpl } = fakeFetch([{ status: 400, body: { message: "version_not_verified" } }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await assert.rejects(db.activate("abc"), function (err) {
    assert.match(err.message, /version_not_verified/);
    assert.doesNotMatch(err.message, new RegExp(KEY));
    return true;
  });
});

test("embedder: batches of 64, keeps order, uses text-embedding-3-small", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, body: { data: Array.from({ length: 64 }, function (_, i) { return { index: i, embedding: [i] }; }) } },
    { status: 200, body: { data: [{ index: 0, embedding: [64] }] } }
  ]);
  const embed = createEmbedder("sk-test", fetchImpl);
  const result = await embed(Array.from({ length: 65 }, function (_, i) { return "t" + i; }));
  assert.equal(result.length, 65);
  assert.deepEqual(result[64], [64]);
  assert.equal(calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.equal(JSON.parse(calls[0].init.body).model, "text-embedding-3-small");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
});

test("embedder: an API error throws a generic error without the key", async function () {
  const { fetchImpl } = fakeFetch([{ status: 401, body: { error: { message: "bad key sk-test" } } }]);
  const embed = createEmbedder("sk-test", fetchImpl);
  await assert.rejects(embed(["a"]), function (err) {
    assert.match(err.message, /401/);
    assert.doesNotMatch(err.message, /sk-test/);
    return true;
  });
});

test("price extractor: strict JSON schema request, parsed result", async function () {
  const content = JSON.stringify({ priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: null });
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: content } }] } }]);
  const extract = createPriceExtractor("sk-test", "some-model", fetchImpl);
  const result = await extract("מחירון");
  assert.equal(result.priceRye, 36);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "some-model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[1].content, "מחירון");
});

test("price extractor without a model gives a user-facing configuration error", async function () {
  const extract = createPriceExtractor("sk-test", "", fakeFetch([]).fetchImpl);
  await assert.rejects(extract("x"), function (err) {
    assert.match(err.userMessage, /OPENAI_MODEL/);
    return true;
  });
});

test("parser: start uploads multipart with the agentic configuration", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { id: "job-9" } }]);
  const parser = createParser("llx-test", fetchImpl);
  const jobId = await parser.start(Buffer.from("%PDF"), "מחירון.pdf", "application/pdf");
  assert.equal(jobId, "job-9");
  assert.equal(calls[0].url, "https://api.cloud.llamaindex.ai/api/v2/parse/upload");
  assert.equal(calls[0].init.headers.Authorization, "Bearer llx-test");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.deepEqual(JSON.parse(calls[0].init.body.get("configuration")), { tier: "agentic", version: "latest" });
  assert.equal(calls[0].init.body.get("file").name, "מחירון.pdf");
});

test("parser: poll maps COMPLETED / FAILED / running", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, body: { job: { status: "COMPLETED" }, markdown_full: "# שלום" } },
    { status: 200, body: { job: { status: "COMPLETED" }, markdown: { pages: [{ markdown: "א" }, { markdown: "ב" }] } } },
    { status: 200, body: { job: { status: "FAILED", error_message: "unreadable" } } },
    { status: 200, body: { job: { status: "RUNNING" } } }
  ]);
  const parser = createParser("llx-test", fetchImpl);
  assert.deepEqual(await parser.poll("j1"), { state: "done", markdown: "# שלום" });
  assert.deepEqual(await parser.poll("j1"), { state: "done", markdown: "א\n\nב" });
  assert.deepEqual(await parser.poll("j1"), { state: "failed", message: "unreadable" });
  assert.deepEqual(await parser.poll("j1"), { state: "running" });
  assert.equal(calls[0].url, "https://api.cloud.llamaindex.ai/api/v2/parse/j1?expand=markdown");
});

test("parser without a key gives a user-facing configuration error", async function () {
  const parser = createParser("", fakeFetch([]).fetchImpl);
  await assert.rejects(parser.start(Buffer.from("x"), "a.pdf", "application/pdf"), function (err) {
    assert.match(err.userMessage, /LLAMAPARSE_API_KEY/);
    return true;
  });
});

test("buildDeps lists exactly the missing variable names", function () {
  assert.throws(function () { buildDeps(function () { return ""; }); }, function (err) {
    assert.equal(err.code, "not_configured");
    assert.match(err.userMessage, /SUPABASE_URL/);
    assert.match(err.userMessage, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(err.userMessage, /OPENAI_API_KEY/);
    return true;
  });
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "o" };
  const deps = buildDeps(function (name) { return env[name] || ""; });
  ["db", "parser", "embed", "extractPrices", "now"].forEach(function (name) { assert.ok(deps[name], name); });
});
