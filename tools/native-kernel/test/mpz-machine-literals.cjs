"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { lowerSource } = require("../ir.cjs");

test("portable machine-word exact literals bypass GMP decimal parsing", async () => {
  const source = String.raw`
from sagejs.native import native


@native
def exact_literal_witness(selector: int) -> int:
    if selector < 0:
        return -17
    if selector == 0:
        return 3000000000
    return 18446744073709551616
`;
  const ir = await lowerSource(source, "exact-literal-witness.py");
  const core = generateHostCore(ir).source;

  assert.match(core, /mpz_set_si\([^,]+, -17L\);/);
  assert.match(core, /mpz_set_ui\([^,]+, 3000000000UL\);/);
  assert.doesNotMatch(core, /mpz_set_str\([^,]+, "(?:-17|3000000000)"/);
  assert.match(
    core,
    /mpz_set_str\([^,]+, "18446744073709551616", 10\) != 0/,
  );
});
