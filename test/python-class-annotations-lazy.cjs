// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`lazy class annotation slots (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/class-annotations-lazy.py"), "utf8",
    ));
    assert.equal(result.stdout.trim(), "class-annotations-lazy-ok");
  });

  test(`sequence class proxy preserves annotation slot identity (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
import sagejs.runtime as runtime

captured = []
def capture(cls):
    captured.append(cls.__annotations__)
    return cls

@runtime.sequence_class
@capture
class Sequence:
    def __getitem__(self, index):
        return index

assert Sequence.__annotations__ is captured[0]
assert Sequence.__annotations__ == {}
assert "__annotations__" not in Sequence.__dict__
assert not hasattr(Sequence(), "__annotations__")
print("sequence-class-annotations-ok")
`);
    assert.equal(result.stdout.trim(), "sequence-class-annotations-ok");
  });
}
