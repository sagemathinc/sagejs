// sagejs-test-tier: unit
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { validateFields } = require("../bench/class-unit-groups/cubic-ablation-fields.cjs");
const field = { coefficients: ["122", "-7", "-1", "1"], h: "8", cyc: "[4, 2]" };
test("diagnostic field expectations are exact and internally consistent", () => {
  assert.deepEqual(validateFields([field]), [field]);
  assert.doesNotThrow(() => validateFields([{ ...field, h: "1", cyc: "[]" }]));
  for (const fields of [[], [field, field], [{ ...field, h: "4" }],
    [{ ...field, cyc: "[2, 4]" }], [{ ...field, cyc: "[8, 1]" }],
    [{ ...field, coefficients: ["122", "-7", "-1", "2"] }],
    [{ ...field, coefficients: [122, "-7", "-1", "1"] }],
    [{ ...field, cyc: "[9007199254740992]" }]]) {
    assert.throws(() => validateFields(fields));
  }
});
