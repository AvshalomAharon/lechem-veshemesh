// OpenAI REST calls: embeddings (same model as the n8n workflow and the agent's search) and pricelist extraction.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;

const PRICE_SYSTEM_PROMPT =
  "את/ה עוזר שמחלץ מחירים ממחירון של מאפייה. חלץ את מחיר היחידה של כל אחד מארבעת המוצרים: לחם כפרי מחמצת, לחם שיפון, חלה, בורקס גבינה. " +
  "בנוסף חלץ את דמי המשלוח להזמנה אחת, אם הם מופיעים (אם אין במסמך דמי משלוח, החזר null). " +
  "חלץ רק מחירים שמופיעים במפורש בטקסט. אם מחיר של מוצר לא מופיע או לא ברור, אל תנחש - החזר null. דיוק המחירים קריטי ביותר.";

const NUMBER_OR_NULL = { type: ["number", "null"] };
const PRICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["priceSourdough", "priceRye", "priceChallah", "priceBurekas", "deliveryFee"],
  properties: {
    priceSourdough: NUMBER_OR_NULL,
    priceRye: NUMBER_OR_NULL,
    priceChallah: NUMBER_OR_NULL,
    priceBurekas: NUMBER_OR_NULL,
    deliveryFee: NUMBER_OR_NULL
  }
};

async function postJson(doFetch, url, apiKey, body) {
  const response = await doFetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    // The response text is not included: it may echo request details.
    throw new Error("openai " + url.split("/v1/")[1] + " " + response.status);
  }
  return response.json();
}

function createEmbedder(apiKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  return async function embed(texts) {
    const vectors = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const data = await postJson(doFetch, "https://api.openai.com/v1/embeddings", apiKey, {
        model: EMBEDDING_MODEL,
        input: texts.slice(i, i + EMBED_BATCH)
      });
      data.data.slice().sort(function (a, b) { return a.index - b.index; }).forEach(function (item) {
        vectors.push(item.embedding);
      });
    }
    return vectors;
  };
}

function createPriceExtractor(apiKey, model, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  return async function extractPrices(markdown) {
    if (!model) {
      const error = new Error("OPENAI_MODEL missing");
      error.userMessage = "OPENAI_MODEL לא הוגדר בשרת, ולכן אי אפשר לחלץ מחירים ממחירון.";
      throw error;
    }
    const data = await postJson(doFetch, "https://api.openai.com/v1/chat/completions", apiKey, {
      model: model,
      messages: [
        { role: "system", content: PRICE_SYSTEM_PROMPT },
        { role: "user", content: markdown }
      ],
      response_format: { type: "json_schema", json_schema: { name: "bakery_prices", strict: true, schema: PRICE_SCHEMA } }
    });
    return JSON.parse(data.choices[0].message.content);
  };
}

module.exports = { createEmbedder, createPriceExtractor };
