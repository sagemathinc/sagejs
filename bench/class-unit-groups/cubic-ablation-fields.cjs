"use strict";
const assert = require("node:assert/strict");

// Exact expectations belong to the diagnostic harness, never kernel dispatch.
function validateFields(fields) {
  assert(Array.isArray(fields) && fields.length > 0, "expected nonempty field list");
  const seen = new Set();
  for (const field of fields) {
    assert(Array.isArray(field.coefficients) && field.coefficients.length === 4);
    assert(field.coefficients.every(x => typeof x === "string" && /^-?(0|[1-9][0-9]*)$/.test(x)));
    assert.equal(field.coefficients[3], "1", "expected monic cubic");
    assert(typeof field.h === "string" && /^[1-9][0-9]*$/.test(field.h));
    assert(typeof field.cyc === "string");
    const cyc = JSON.parse(field.cyc);
    assert(Array.isArray(cyc) && cyc.every(x => Number.isSafeInteger(x) && x > 1));
    for (let i = 1; i < cyc.length; i++) assert.equal(cyc[i - 1] % cyc[i], 0);
    assert.equal(cyc.reduce((p, x) => p * BigInt(x), 1n).toString(), field.h);
    const key = field.coefficients.join(",");
    assert(!seen.has(key), "duplicate field polynomial");
    seen.add(key);
  }
  return fields;
}
module.exports = { validateFields };
