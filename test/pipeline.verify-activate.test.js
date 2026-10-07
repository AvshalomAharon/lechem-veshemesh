const test = require("node:test");
const assert = require("node:assert/strict");
const pipeline = require("../lib/docs/pipeline");
const { createFakeDeps } = require("./fakes");

const PRICELIST_V1 = "| לחם כפרי מחמצת | 32 ₪ |\n| לחם שיפון | 36 ₪ |\n| חלה | 28 ₪ |\n| בורקס גבינה | 12 ₪ |\n";
const OLD_PRICELIST = { content: "old prices", metadata: { doc: "מחירון", fileName: "v3.md" }, embedding: [1, 1, 1] };
const OLD_INFO = { content: "old info", metadata: { doc: "אחר", fileName: "info.md" }, embedding: [1, 1, 1] };
const OTHER_FILE = { content: "other file", metadata: { doc: "אחר", fileName: "keep.md" }, embedding: [1, 1, 1] };

async function upload(deps, fileName, text, docType) {
  const received = await pipeline.receive(deps, { docType: docType || "other", fileName: fileName, buffer: Buffer.from(text, "utf8") });
  await pipeline.processVersion(deps, received.versionId);
  return received.versionId;
}

async function rejectsWith(promise, step, status) {
  await assert.rejects(promise, function (err) {
    assert.ok(err instanceof pipeline.PipelineError, "expected PipelineError, got " + err);
    assert.equal(err.step, step);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

test("full run for 'other' replaces only the same file name", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO, OTHER_FILE] });
  const versionId = await upload(deps, "info.md", "מידע חדש על משלוחים");
  assert.deepEqual(await pipeline.verifyVersion(deps, versionId), { ok: true, chunkCount: 1 });
  assert.deepEqual(await pipeline.activateVersion(deps, versionId), { ok: true, chunkCount: 1 });

  const contents = state.documents.map(function (d) { return d.content; }).sort();
  assert.deepEqual(contents, ["מידע חדש על משלוחים", "other file"].sort());
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "active");
});

test("full run for a pricelist swaps documents and price_list together", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_PRICELIST, OLD_INFO], priceList: { price_sourdough: 30 } });
  const versionId = await upload(deps, "v1.md", PRICELIST_V1, "pricelist");
  await pipeline.verifyVersion(deps, versionId);
  await pipeline.activateVersion(deps, versionId);

  assert.equal(state.documents.some(function (d) { return d.content === "old prices"; }), false);
  assert.equal(state.documents.some(function (d) { return d.content === "old info"; }), true);
  assert.deepEqual(state.priceList, { price_sourdough: 32, price_rye: 36, price_challah: 28, price_burekas: 12, delivery_fee: 0 });
});

test("pricelist with an invalid price fails at verify and changes nothing live", async function () {
  const bad = { priceSourdough: 9999, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
  const { deps, state } = createFakeDeps({ documents: [OLD_PRICELIST], priceList: { price_sourdough: 30 }, prices: bad });
  const versionId = await upload(deps, "v-bad.md", PRICELIST_V1, "pricelist");
  assert.equal(state.staging.length, 1); // the failure really happens in the middle, after staging
  await assert.rejects(pipeline.verifyVersion(deps, versionId), function (err) {
    assert.equal(err.step, "verify");
    assert.equal(err.versionId, versionId);
    assert.match(err.message, /שום דבר לא הוחלף/);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.deepEqual(state.documents.map(function (d) { return d.content; }), ["old prices"]);
  assert.deepEqual(state.priceList, { price_sourdough: 30 });
  assert.equal(state.versions.get(versionId).status, "failed");
  assert.equal(state.versions.get(versionId).error_step, "verify");
});

test("a price missing from the document text fails at verify", async function () {
  const invented = { priceSourdough: 33, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
  const { deps, state } = createFakeDeps({ prices: invented });
  const versionId = await upload(deps, "v1.md", PRICELIST_V1, "pricelist");
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("verify fails when the staged row count differs from the expected one", async function () {
  const { deps, state } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  state.staging.length = 0;
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("verify fails when an embedding has the wrong size", async function () {
  const { deps, state } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  state.staging[0].embedding = [1];
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
});

test("steps cannot be skipped, and a skip does not mark the version failed", async function () {
  const { deps, state } = createFakeDeps();
  const received = await pipeline.receive(deps, { docType: "other", fileName: "info.md", buffer: Buffer.from("טקסט") });
  await rejectsWith(pipeline.verifyVersion(deps, received.versionId), "verify", 409);
  await pipeline.processVersion(deps, received.versionId);
  await rejectsWith(pipeline.activateVersion(deps, received.versionId), "activate", 409);
  assert.equal(state.versions.get(received.versionId).status, "pending");
  assert.equal(state.staging.length, 1);
});

test("an activation failure cleans staging, keeps the old documents, and marks the version failed", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO], failActivate: true });
  const versionId = await upload(deps, "info.md", "מידע חדש");
  await pipeline.verifyVersion(deps, versionId);
  await assert.rejects(pipeline.activateVersion(deps, versionId), function (err) {
    assert.equal(err.step, "activate");
    assert.doesNotMatch(err.message, /activate failed/);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.deepEqual(state.documents.map(function (d) { return d.content; }), ["old info"]);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("a second activate of the same version is rejected and changes nothing", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO] });
  const versionId = await upload(deps, "info.md", "מידע חדש");
  await pipeline.verifyVersion(deps, versionId);
  await pipeline.activateVersion(deps, versionId);
  const before = JSON.stringify(state.documents);
  await rejectsWith(pipeline.activateVersion(deps, versionId), "activate", 409);
  assert.equal(JSON.stringify(state.documents), before);
  assert.equal(state.versions.get(versionId).status, "active");
});

test("verify is idempotent once verified", async function () {
  const { deps } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  await pipeline.verifyVersion(deps, versionId);
  assert.deepEqual(await pipeline.verifyVersion(deps, versionId), { ok: true, chunkCount: 1 });
});

test("listDocuments sweeps first and maps active versions", async function () {
  const { deps, state } = createFakeDeps({
    seedActive: [
      { doc_type: "pricelist", doc_key: "מחירון", file_name: "v3.md", chunk_count: 1, activated_at: "2026-10-06T19:00:00.000Z" },
      { doc_type: "other", file_name: "מידע ללקוחות.md", chunk_count: 2, activated_at: null, created_at: "2026-10-05T08:00:00.000Z" }
    ]
  });
  const result = await pipeline.listDocuments(deps);
  assert.equal(state.sweeps, 1);
  assert.equal(result.documents.length, 2);
  const info = result.documents.find(function (d) { return d.name === "מידע ללקוחות.md"; });
  assert.deepEqual(info, { id: info.id, name: "מידע ללקוחות.md", type: "other", chunkCount: 2, updatedAt: "2026-10-05T08:00:00.000Z" });
});

test("listDocuments still lists when the sweep fails", async function () {
  const { deps } = createFakeDeps({ seedActive: [{ file_name: "a.md" }] });
  deps.db.sweep = async function () { throw new Error("sweep down"); };
  const result = await pipeline.listDocuments(deps);
  assert.equal(result.documents.length, 1);
});
