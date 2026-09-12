// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const createCompiler = require("../dist/tools/compiler.js").default;
const { createSage } = require("../dist/tools/kernel.js");

test("self-hosted compiler pools its constants without changing output defaults", () => {
  const source = readFileSync(join(__dirname, "../dist/compiler/compiler.js"), "utf8");
  assert.match(source, /var compiler_ρσ_const_\d+\s*=/);
  const compiler = createCompiler();
  const stream = new compiler.OutputStream({});
  assert.equal(stream.options.pool_numeric_literals, false);
  assert.equal(stream.options.numeric_literal_pool_prefix, "");
  for (let index = 0; index < 100; index++) stream.print("x");
  assert.equal(stream.get(), "x".repeat(100));
});

for (const mode of ["python", "sage"]) {
  test(`pooled compiler retains integer and floating literal semantics (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
def outer():
    def inner():
        return 9007199254740993, 0x20000000000001, 1.25
    class Values:
        def values(self):
            return inner()
    return Values().values()

a, b, c = outer()
assert a == b
assert a - 9007199254740992 == 1
assert c * 4 == 5
assert [i + 1 for i in range(4)] == [1, 2, 3, 4]
print("compiler-literals-ok")
`);
    assert.equal(result.stdout.trim(), "compiler-literals-ok");
  });
}
