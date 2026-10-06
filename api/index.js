// Vercel Function behind "/": serves index.html with the current prices from the
// price_list table (via the n8n "site-prices" endpoint) already written into the HTML,
// so customers see the new prices immediately - no flash of old prices, works without JS.
// If the prices cannot be fetched, the static index.html is served as is (fallback prices).
const fs = require("fs");
const path = require("path");

const PRICES_ENDPOINT = "https://avshalom.app.n8n.cloud/webhook/site-prices";
const FETCH_TIMEOUT_MS = 4000;
const PRODUCT_NAMES = ["לחם כפרי מחמצת", "לחם שיפון", "חלה", "בורקס גבינה"];

function readIndexHtml() {
  const candidates = [
    path.join(process.cwd(), "index.html"),
    path.join(__dirname, "..", "index.html")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  throw new Error("index.html not found");
}

function isValidPrices(prices) {
  return !!prices && PRODUCT_NAMES.every(function (name) {
    return typeof prices[name] === "number" && isFinite(prices[name]) && prices[name] > 0;
  });
}

async function fetchPrices() {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(PRICES_ENDPOINT, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return isValidPrices(data && data.prices) ? data.prices : null;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Rewrites only the price spots marked with data-price-for / data-product-price
// (2 visible spots + 1 attribute per product). Returns null if the page structure
// is not as expected, so a broken rewrite never reaches customers.
function applyPrices(html, prices) {
  const counts = {};
  PRODUCT_NAMES.forEach(function (name) { counts[name] = { text: 0, attr: 0 }; });

  let updated = html.replace(/(data-price-for="([^"]+)"[^>]*>)\d+(?:\.\d+)?( ₪)/g, function (match, head, name, tail) {
    if (!(name in prices)) return match;
    counts[name].text += 1;
    return head + prices[name] + tail;
  });
  updated = updated.replace(/(data-product-name="([^"]+)" data-product-price=")\d+(?:\.\d+)?(")/g, function (match, head, name, tail) {
    if (!(name in prices)) return match;
    counts[name].attr += 1;
    return head + prices[name] + tail;
  });

  const intact = PRODUCT_NAMES.every(function (name) {
    return counts[name].text === 2 && counts[name].attr === 1;
  });
  return intact ? updated : null;
}

module.exports = async function handler(req, res) {
  const html = readIndexHtml();
  const prices = await fetchPrices();
  const updated = prices ? applyPrices(html, prices) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Edge cache: new prices reach customers within about a minute of a price list upload.
  res.setHeader(
    "Cache-Control",
    updated ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=10"
  );
  res.status(200).send(updated || html);
};
