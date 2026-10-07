// Validation of the prices the model extracted from an uploaded pricelist. Same limits as the n8n workflow:
// product price = whole shekels 1-500, delivery fee = whole shekels 0-100. On top of that, every non-zero value
// must literally appear in the document text, which catches values the model made up.
const MAX_PRICE = 500;
const MAX_DELIVERY_FEE = 100;

const PRODUCT_FIELDS = [
  { raw: "priceSourdough", out: "price_sourdough", label: "לחם כפרי מחמצת" },
  { raw: "priceRye", out: "price_rye", label: "לחם שיפון" },
  { raw: "priceChallah", out: "price_challah", label: "חלה" },
  { raw: "priceBurekas", out: "price_burekas", label: "בורקס גבינה" }
];

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

// True when the number appears as a standalone number in the text (not inside 132, 32.5 or 1,32).
function appearsInText(value, text) {
  const pattern = new RegExp("(?<![\\d.,])" + value + "(?!\\d|[.,]\\d)");
  return pattern.test(String(text || ""));
}

function validatePrices(raw, sourceText) {
  const input = raw || {};
  const values = {};
  const problems = [];

  PRODUCT_FIELDS.forEach(function (field) {
    const n = toNumber(input[field.raw]);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PRICE) {
      problems.push(field.label + " (ערך לא תקין)");
    } else if (!appearsInText(n, sourceText)) {
      problems.push(field.label + " (המחיר לא מופיע במסמך)");
    } else {
      values[field.out] = n;
    }
  });

  // A pricelist without a delivery fee means no delivery fee.
  const rawFee = input.deliveryFee;
  const fee = (rawFee === undefined || rawFee === null || rawFee === "") ? 0 : toNumber(rawFee);
  if (!Number.isInteger(fee) || fee < 0 || fee > MAX_DELIVERY_FEE) {
    problems.push("דמי משלוח (ערך לא תקין)");
  } else if (fee > 0 && !appearsInText(fee, sourceText)) {
    problems.push("דמי משלוח (הסכום לא מופיע במסמך)");
  } else {
    values.delivery_fee = fee;
  }

  if (problems.length > 0) {
    return {
      ok: false,
      message: "המערכת לא זיהתה בביטחון ערכים תקינים (מחיר מוצר: מספר שלם בין 1 ל-" + MAX_PRICE +
        " ₪, דמי משלוח: מספר שלם בין 0 ל-" + MAX_DELIVERY_FEE + " ₪) עבור: " + problems.join(", ") +
        ". כדי למנוע עדכון שגוי, שום דבר לא הוחלף."
    };
  }
  return { ok: true, values: values };
}

module.exports = { validatePrices };
