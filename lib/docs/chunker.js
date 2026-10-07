// Recursive character splitter. Mirrors the behaviour of the RecursiveCharacterTextSplitter node used in the
// n8n invoice workflow (chunk 1000, overlap 100, separators paragraph > line > space > character).
const DEFAULT_SEPARATORS = ["\n\n", "\n", " ", ""];

function mergeSplits(splits, separator, chunkSize, chunkOverlap) {
  const separatorLength = separator.length;
  const docs = [];
  let current = [];
  let total = 0;

  for (const piece of splits) {
    const length = piece.length;
    const addedSeparator = current.length > 0 ? separatorLength : 0;
    if (total + length + addedSeparator > chunkSize && current.length > 0) {
      const doc = current.join(separator).trim();
      if (doc) docs.push(doc);
      // Drop pieces from the front until the kept tail fits the overlap and the next piece fits the chunk.
      while (total > chunkOverlap || (total + length + (current.length > 0 ? separatorLength : 0) > chunkSize && total > 0)) {
        total -= current[0].length + (current.length > 1 ? separatorLength : 0);
        current.shift();
      }
    }
    current.push(piece);
    total += length + (current.length > 1 ? separatorLength : 0);
  }

  const last = current.join(separator).trim();
  if (last) docs.push(last);
  return docs;
}

function recursiveSplit(text, separators, chunkSize, chunkOverlap) {
  let separator = separators[separators.length - 1];
  let remaining = [];
  for (let i = 0; i < separators.length; i++) {
    if (separators[i] === "") {
      separator = "";
      break;
    }
    if (text.includes(separators[i])) {
      separator = separators[i];
      remaining = separators.slice(i + 1);
      break;
    }
  }

  const splits = (separator === "" ? Array.from(text) : text.split(separator)).filter(function (piece) {
    return piece !== "";
  });

  const chunks = [];
  let small = [];
  function flush() {
    if (small.length > 0) {
      mergeSplits(small, separator, chunkSize, chunkOverlap).forEach(function (doc) { chunks.push(doc); });
      small = [];
    }
  }

  for (const piece of splits) {
    if (piece.length < chunkSize) {
      small.push(piece);
    } else {
      flush();
      if (remaining.length === 0) {
        chunks.push(piece);
      } else {
        recursiveSplit(piece, remaining, chunkSize, chunkOverlap).forEach(function (doc) { chunks.push(doc); });
      }
    }
  }
  flush();
  return chunks;
}

function splitText(text, chunkSize, chunkOverlap) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  return recursiveSplit(source, DEFAULT_SEPARATORS, chunkSize, chunkOverlap)
    .map(function (chunk) { return chunk.trim(); })
    .filter(function (chunk) { return chunk.length > 0; });
}

module.exports = { splitText };
