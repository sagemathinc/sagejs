// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`native-backed exact integers remain valid slice bounds (${mode})`, async (t) => {
    const sage = await createSage({ mode });
    t.after(() => sage.close());
    const result = await sage.evaluate([
      "import sagejs.runtime as runtime",
      "lo = runtime.bigint('1')",
      "hi = runtime.bigint('3')",
      "huge = runtime.bigint('1000000000000000000000000000000000000000')",
      "for values in [[10,20,30,40], (10,20,30,40)]:",
      "    assert list(values[lo:hi]) == [20,30]",
      "    assert list(values[lo:lo]) == []",
      "    assert list(values[-hi:-lo]) == [20,30]",
      "    assert list(values[-huge:huge]) == [10,20,30,40]",
      "    assert list(values[lo:hi:runtime.bigint('1')]) == [20,30]",
      "    assert list(values[hi:lo:runtime.bigint('-1')]) == [40,30]",
      "    assert type(values[lo:hi]) is type(values)",
      "True",
    ].join("\n"));
    assert.equal(result.repr, "True");
  });
}
