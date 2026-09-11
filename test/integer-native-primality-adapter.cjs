// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

// Unlike adapter installation, invoking primality requires the FLINT backend.
test("integer primality adapter delegates to the mathematical backend", async (context) => {
  const session = await createSage();
  context.after(() => session.close());
  const result = await session.evaluate(`
assert (7).is_irreducible() and not (9).is_irreducible()
print('integer primality adapter passed')
`);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout, "integer primality adapter passed\n");
});
