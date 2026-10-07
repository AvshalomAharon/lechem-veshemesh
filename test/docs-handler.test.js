const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SESSION_SECRET = "test-secret";
const { createSessionCookie } = require("../lib/session");
const { createHandler } = require("../api/docs");
const { createFakeDeps } = require("./fakes");

const COOKIE = createSessionCookie("admin", "test-secret").split(";")[0];

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: function (name, value) { this.headers[name] = value; },
    status: function (code) { this.statusCode = code; return this; },
    json: function (payload) { this.body = payload; return this; }
  };
}

function request(options) {
  return {
    method: options.method || "POST",
    headers: Object.assign({ cookie: options.cookie === undefined ? COOKIE : options.cookie }, options.headers),
    query: { action: options.action },
    body: options.body
  };
}

function json(body) {
  return { headers: { "content-type": "application/json" }, body: body };
}

test("no session cookie -> 401 and nothing runs", async function () {
  let built = false;
  const handler = createHandler(function () { built = true; return createFakeDeps().deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET", cookie: "" }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "unauthorized");
  assert.equal(built, false);
});

test("a forged cookie is rejected", async function () {
  const handler = createHandler(function () { return createFakeDeps().deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET", cookie: "ls_session=abc.def" }), res);
  assert.equal(res.statusCode, 401);
});

test("unknown action -> 400, wrong method -> 405", async function () {
  const handler = createHandler(function () { return createFakeDeps().deps; });
  let res = fakeRes();
  await handler(request({ action: "nope" }), res);
  assert.equal(res.statusCode, 400);
  res = fakeRes();
  await handler(request({ action: "upload", method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  res = fakeRes();
  await handler(request({ action: "list", method: "POST" }), res);
  assert.equal(res.statusCode, 405);
});

test("missing configuration -> 500 with the variable names", async function () {
  const handler = createHandler(function () {
    const error = new Error("x");
    error.code = "not_configured";
    error.userMessage = "חסרים משתני סביבה בשרת: OPENAI_API_KEY.";
    throw error;
  });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "not_configured");
  assert.match(res.body.message, /OPENAI_API_KEY/);
});

test("upload keeps a Hebrew file name with spaces, quotes and % unchanged", async function () {
  const { deps, state } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const name = 'מידע ללקוחות "חדש" 100%.md';
  const res = fakeRes();
  await handler(request({
    action: "upload",
    headers: { "x-doc-type": "other", "x-file-name": encodeURIComponent(name), "content-type": "application/octet-stream" },
    body: Buffer.from("שלום", "utf8")
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(state.versions.get(res.body.versionId).file_name, name);
  assert.equal(state.versions.get(res.body.versionId).doc_key, name);
});

test("a malformed file-name header is a clean 400, not a crash", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({
    action: "upload",
    headers: { "x-doc-type": "other", "x-file-name": "%E0%A4%A" },
    body: Buffer.from("x")
  }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

test("process / verify / activate over HTTP, then list", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });

  let res = fakeRes();
  await handler(request({ action: "upload", headers: { "x-doc-type": "other", "x-file-name": encodeURIComponent("a.md") }, body: Buffer.from("טקסט") }), res);
  const versionId = res.body.versionId;

  res = fakeRes();
  await handler(request(Object.assign({ action: "process" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.state, res.body.chunkCount], [200, "done", 1]);

  res = fakeRes();
  await handler(request(Object.assign({ action: "verify" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.ok, res.body.chunkCount], [200, true, 1]);

  res = fakeRes();
  await handler(request(Object.assign({ action: "activate" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.ok, res.body.chunkCount], [200, true, 1]);

  res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.body.documents.length, 1);
  assert.equal(res.body.documents[0].name, "a.md");
});

test("a JSON body sent as a string is accepted", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({ action: "process", body: JSON.stringify({ versionId: "nope" }) }), res);
  assert.equal(res.statusCode, 404);
});

test("pipeline errors map to status, step, message and previousKept", async function () {
  const { deps } = createFakeDeps({ embedFail: true });
  const handler = createHandler(function () { return deps; });
  let res = fakeRes();
  await handler(request({ action: "upload", headers: { "x-doc-type": "other", "x-file-name": "a.md" }, body: Buffer.from("טקסט") }), res);
  const versionId = res.body.versionId;
  res = fakeRes();
  await handler(request(Object.assign({ action: "process" }, json({ versionId: versionId }))), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.step, "process");
  assert.equal(res.body.versionId, versionId);
  assert.equal(res.body.previousKept, true);
  assert.ok(res.body.message.length > 0);
});

test("a service error that carries a safe detail shows it to the logged-in admin", async function () {
  const { deps } = createFakeDeps();
  deps.db.listActive = async function () {
    const error = new Error("supabase GET /document_versions 404: relation does not exist");
    error.detail = error.message;
    throw error;
  };
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "server_error");
  assert.match(res.body.detail, /supabase GET \/document_versions 404/);
});

test("a failed pipeline step also passes the safe detail along", async function () {
  const { deps } = createFakeDeps();
  deps.embed = async function () {
    const error = new Error("openai embeddings 401");
    error.detail = error.message;
    throw error;
  };
  const handler = createHandler(function () { return deps; });
  let res = fakeRes();
  await handler(request({ action: "upload", headers: { "x-doc-type": "other", "x-file-name": "a.md" }, body: Buffer.from("טקסט") }), res);
  res = fakeRes();
  await handler(request(Object.assign({ action: "process" }, json({ versionId: "v1" }))), res);
  assert.equal(res.body.step, "process");
  assert.match(res.body.detail, /openai embeddings 401/);
});

test("an unexpected error is a generic 500 without internals", async function () {
  const { deps } = createFakeDeps();
  deps.db.listActive = async function () { throw new Error("connection string leaked here"); };
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /connection string/);
});
