// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("integer native adapters preserve small and large receiver behavior", async (context) => {
  const session = await createSage();
  context.after(() => session.close());
  const result = await session.evaluate(`
assert (1).is_one() and not (2).is_one()
assert callable((7).is_irreducible)
assert (0).is_square() and (81).is_square() and not (-1).is_square()
assert (123).digits() == [3, 2, 1]
assert (5).bits() == [1, 0, 1]
assert (5).nbits() == (5).bit_length() == 3
n = 2**80
assert n.is_square() and not n.is_one()
assert n.nbits() == n.bit_length() == 81
assert n.bits() == [0]*80 + [1]
assert n.digits(2) == n.bits()
assert (-n).nbits() == 81
print('integer adapters passed')
`);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout, "integer adapters passed\n");
});
