const test = require("node:test");
const assert = require("node:assert/strict");
const { splitText } = require("../lib/docs/chunker");

function words(count) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push("w" + String(i).padStart(4, "0"));
  return out;
}

test("empty or whitespace text gives no chunks", function () {
  assert.deepEqual(splitText("", 1000, 100), []);
  assert.deepEqual(splitText("  \n\n  ", 1000, 100), []);
});

test("short text is one trimmed chunk", function () {
  assert.deepEqual(splitText("  שלום עולם  ", 1000, 100), ["שלום עולם"]);
});

test("CRLF is treated like LF", function () {
  assert.deepEqual(splitText("א\r\n\r\nב", 1000, 100), ["א\n\nב"]);
});

test("long text: every chunk fits, nothing is lost, neighbours overlap", function () {
  const list = words(600);
  const chunks = splitText(list.join(" "), 1000, 100);
  assert.ok(chunks.length >= 4);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000, "chunk too long: " + chunk.length); });
  const joined = chunks.join(" ");
  list.forEach(function (word) { assert.ok(joined.includes(word), "lost " + word); });
  for (let i = 0; i < chunks.length - 1; i++) {
    const firstWordOfNext = chunks[i + 1].split(" ")[0];
    assert.ok(chunks[i].includes(firstWordOfNext), "no overlap between chunk " + i + " and " + (i + 1));
  }
});

test("paragraphs are kept together when they fit", function () {
  const paragraph = words(60).join(" "); // ~360 chars
  const chunks = splitText([paragraph, paragraph, paragraph, paragraph].join("\n\n"), 1000, 100);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000); });
  assert.ok(chunks[0].includes("\n\n"));
});

test("a single huge word without spaces is still split to fit", function () {
  const chunks = splitText("x".repeat(2500), 1000, 100);
  assert.ok(chunks.length >= 3);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000); });
});
