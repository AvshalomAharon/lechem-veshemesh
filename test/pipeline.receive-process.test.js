const test = require("node:test");
const assert = require("node:assert/strict");
const pipeline = require("../lib/docs/pipeline");
const { createFakeDeps } = require("./fakes");

const INFO_TEXT = "# מידע ללקוחות\n\nמשלוחים בימי ראשון עד שישי, בין 06:30 ל-08:30.\n";

function mdInput(fileName, text, docType) {
  return { docType: docType || "other", fileName: fileName, buffer: Buffer.from(text, "utf8") };
}

async function rejectsWith(promise, step, status) {
  await assert.rejects(promise, function (err) {
    assert.ok(err instanceof pipeline.PipelineError, "expected PipelineError, got " + err);
    assert.equal(err.step, step);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

test("receive rejects bad input before writing anything", async function () {
  const { deps, state } = createFakeDeps();
  await rejectsWith(pipeline.receive(deps, mdInput("a.md", "x", "invoice")), "receive", 400);
  await rejectsWith(pipeline.receive(deps, mdInput("a.exe", "x")), "receive", 400);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "", buffer: Buffer.from("x") }), "receive", 400);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "a.md", buffer: Buffer.alloc(0) }), "receive", 400);
  await rejectsWith(pipeline.receive(deps, mdInput("a.md", "  \n \n ")), "receive", 422);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "big.pdf", buffer: Buffer.alloc(pipeline.MAX_BYTES + 1) }), "receive", 413);
  assert.equal(state.versions.size, 0);
  assert.equal(state.parseStarts.length, 0);
});

test("receive of a text file stores the text and does not start the parser", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, mdInput("מידע ללקוחות.md", "﻿" + INFO_TEXT));
  assert.equal(result.needsParsing, false);
  const version = state.versions.get(result.versionId);
  assert.equal(version.doc_key, "מידע ללקוחות.md");
  assert.equal(version.source_text, INFO_TEXT);
  assert.equal(state.parseStarts.length, 0);
});

test("the pricelist key is fixed, whatever the file name", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, mdInput("v7.md", INFO_TEXT, "pricelist"));
  assert.equal(state.versions.get(result.versionId).doc_key, "מחירון");
});

test("receive of a PDF starts LlamaParse and remembers the job", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, { docType: "pricelist", fileName: "scan.pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  assert.equal(result.needsParsing, true);
  assert.deepEqual(state.parseStarts.map(function (s) { return s.mime; }), ["application/pdf"]);
  assert.equal(state.versions.get(result.versionId).parse_job_id, "job-1");
});

test("process of a text upload chunks, embeds and stages with full metadata", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  const result = await pipeline.processVersion(deps, versionId);
  assert.deepEqual(result, { state: "done", chunkCount: 1 });
  assert.equal(state.staging.length, 1);
  assert.equal(state.staging[0].metadata.doc, "אחר");
  assert.equal(state.staging[0].metadata.fileName, "info.md");
  assert.equal(state.staging[0].metadata.version_id, versionId);
  assert.match(state.staging[0].metadata.uploadedAt, /^2026-10-07T10:00:00/);
  const version = state.versions.get(versionId);
  assert.equal(version.stage, "processed");
  assert.equal(version.chunk_count, 1);
  assert.equal(state.extractCalls, 0);
});

test("process of a pricelist also extracts prices", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("v1.md", INFO_TEXT, "pricelist"));
  await pipeline.processVersion(deps, versionId);
  assert.equal(state.extractCalls, 1);
  assert.equal(state.versions.get(versionId).extracted.priceSourdough, 32);
  assert.equal(state.staging[0].metadata.doc, "מחירון");
});

test("process of a PDF reports running until LlamaParse is done", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "running" }, { state: "running" }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.pdf", buffer: Buffer.from("%PDF") });
  assert.deepEqual(await pipeline.processVersion(deps, versionId), { state: "running" });
  assert.deepEqual(await pipeline.processVersion(deps, versionId), { state: "running" });
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "pending");
  const done = await pipeline.processVersion(deps, versionId);
  assert.equal(done.state, "done");
  assert.ok(done.chunkCount >= 1);
});

test("a parse job that runs longer than 5 minutes fails the version", async function () {
  const polls = [{ state: "running" }];
  const { deps, state } = createFakeDeps({ parsePolls: polls });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.pdf", buffer: Buffer.from("%PDF") });
  state.advance(5 * 60 * 1000 + 1000);
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 504);
  const version = state.versions.get(versionId);
  assert.equal(version.status, "failed");
  assert.equal(version.error_step, "process");
});

test("a failed LlamaParse job fails the version with its reason", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "failed", message: "bad scan" }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.png", buffer: Buffer.from("png") });
  await assert.rejects(pipeline.processVersion(deps, versionId), function (err) {
    assert.equal(err.step, "process");
    assert.match(err.message, /bad scan/);
    return true;
  });
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("a document with no extractable text fails at process and stages nothing", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "done", markdown: "   \n  " }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "blank.jpg", buffer: Buffer.from("jpg") });
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 422);
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("embedding service failure cleans staging, fails the version, keeps documents", async function () {
  const existing = [{ content: "old", metadata: { doc: "אחר", fileName: "info.md" }, embedding: [1, 1, 1] }];
  const { deps, state } = createFakeDeps({ embedFail: true, documents: existing });
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await assert.rejects(pipeline.processVersion(deps, versionId), function (err) {
    assert.equal(err.step, "process");
    assert.equal(err.versionId, versionId);
    assert.doesNotMatch(err.message, /openai/i);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.equal(state.documents.length, 1);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("fewer embeddings than chunks fails the version (no partial staging)", async function () {
  const longText = new Array(400).fill("מילה").join(" ");
  const { deps, state } = createFakeDeps({ embedShort: true });
  const { versionId } = await pipeline.receive(deps, mdInput("long.md", longText));
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 502);
  assert.equal(state.staging.length, 0);
});

test("a staging insert failure after embedding cleans up", async function () {
  const { deps, state } = createFakeDeps({ failInsertStaging: true });
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await rejectsWith(pipeline.processVersion(deps, versionId), "process");
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("process is idempotent: calling it again after done does not duplicate staging", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await pipeline.processVersion(deps, versionId);
  const again = await pipeline.processVersion(deps, versionId);
  assert.deepEqual(again, { state: "done", chunkCount: 1 });
  assert.equal(state.staging.length, 1);
});

test("stale staging rows of the same version are replaced, not duplicated", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  state.staging.push({ version_id: versionId, content: "leftover", metadata: {}, embedding: [1, 2, 3] });
  await pipeline.processVersion(deps, versionId);
  assert.equal(state.staging.length, 1);
  assert.notEqual(state.staging[0].content, "leftover");
});

test("process of an unknown or finished version is a 404/409 and never marks anything failed", async function () {
  const { deps, state } = createFakeDeps({ seedActive: [{ file_name: "old.md" }] });
  await rejectsWith(pipeline.processVersion(deps, "nope"), "process", 404);
  const activeId = Array.from(state.versions.keys())[0];
  await rejectsWith(pipeline.processVersion(deps, activeId), "process", 409);
  assert.equal(state.versions.get(activeId).status, "active");
});
