const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePrices } = require("../lib/docs/prices");

const TEXT_V1 = [
  "| לחם כפרי מחמצת | 32 ₪ | |",
  "| לחם שיפון | 36 ₪ | |",
  "| חלה | 28 ₪ | זמינה בימי שישי בלבד |",
  "| בורקס גבינה | 12 ₪ | ליחידה |"
].join("\n");
const RAW_V1 = { priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: null };

test("valid prices pass and a missing delivery fee becomes 0", function () {
  const result = validatePrices(RAW_V1, TEXT_V1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, { price_sourdough: 32, price_rye: 36, price_challah: 28, price_burekas: 12, delivery_fee: 0 });
});

test("a delivery fee that appears in the text is accepted", function () {
  const text = TEXT_V1 + "\n| דמי משלוח להזמנה | 8 ₪ |";
  const result = validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 8 }), text);
  assert.equal(result.ok, true);
  assert.equal(result.values.delivery_fee, 8);
});

test("out of range, fractional and missing prices fail and are named", function () {
  const bad = { priceSourdough: 9999, priceRye: 36.5, priceChallah: null, priceBurekas: 12, deliveryFee: 0 };
  const result = validatePrices(bad, TEXT_V1);
  assert.equal(result.ok, false);
  assert.match(result.message, /לחם כפרי מחמצת/);
  assert.match(result.message, /לחם שיפון/);
  assert.match(result.message, /חלה/);
  assert.match(result.message, /שום דבר לא הוחלף/);
});

test("a price the model invented (not in the text) fails", function () {
  const result = validatePrices(Object.assign({}, RAW_V1, { priceSourdough: 33 }), TEXT_V1);
  assert.equal(result.ok, false);
  assert.match(result.message, /לחם כפרי מחמצת/);
});

test("a price must not match inside a longer number", function () {
  const text = "לחם כפרי מחמצת 132 ₪, לחם שיפון 36 ₪, חלה 28 ₪, בורקס 12 ₪";
  const result = validatePrices(RAW_V1, text);
  assert.equal(result.ok, false);
});

test("delivery fee above 100 or fractional fails", function () {
  assert.equal(validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 101 }), TEXT_V1 + " 101").ok, false);
  assert.equal(validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 7.5 }), TEXT_V1 + " 7.5").ok, false);
});

test("missing extractor output fails cleanly", function () {
  assert.equal(validatePrices(null, TEXT_V1).ok, false);
  assert.equal(validatePrices(undefined, TEXT_V1).ok, false);
});
