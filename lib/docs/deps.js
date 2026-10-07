// Wires the real services into the deps object used by lib/docs/pipeline.js.
const { createDb } = require("./db");
const { createEmbedder, createPriceExtractor } = require("./openai");
const { createParser } = require("./llamaparse");

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];

// getEnv(name) -> string (see lib/env.js). LLAMAPARSE_API_KEY and OPENAI_MODEL are checked only when needed.
function buildDeps(getEnv, fetchImpl) {
  const missing = REQUIRED.filter(function (name) { return !getEnv(name); });
  if (missing.length > 0) {
    const error = new Error("missing env: " + missing.join(", "));
    error.code = "not_configured";
    error.userMessage = "חסרים משתני סביבה בשרת: " + missing.join(", ") + ".";
    throw error;
  }
  return {
    db: createDb(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), fetchImpl),
    parser: createParser(getEnv("LLAMAPARSE_API_KEY"), fetchImpl),
    embed: createEmbedder(getEnv("OPENAI_API_KEY"), fetchImpl),
    extractPrices: createPriceExtractor(getEnv("OPENAI_API_KEY"), getEnv("OPENAI_MODEL"), fetchImpl),
    now: function () { return new Date(); }
  };
}

module.exports = { buildDeps };
