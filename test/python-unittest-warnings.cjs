// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`non-callable values raise Python TypeError (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
for value in (None, False, 3, "text", [], {}, object()):
    try:
        value()
    except TypeError as error:
        assert "object is not callable" in str(error)
    else:
        raise AssertionError("non-callable value accepted")

class Callable:
    def __call__(self):
        raise AttributeError("inside callable")

try:
    Callable()()
except AttributeError as error:
    assert str(error) == "inside callable"
else:
    raise AssertionError("callable body exception lost")
print("call-boundary-ok")
`);
    assert.equal(result.stdout.trim(), "call-boundary-ok");
  });
  test(`callable instance names do not leak host function metadata (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
class Named:
    "user documentation"
    __name__ = 17
    __annotations__ = {"field": str}
    name = "user name"
    length = 12
    def __call__(self, value=3):
        return value
value = Named()
assert value.__name__ == 17
assert value.__annotations__ == {"field": str}
assert value.__doc__ == "user documentation"
assert value.name == "user name"
assert value.length == 12
assert value() == 3
assert value(value=5) == 5
value.__name__ = "instance name"
assert value.__name__ == "instance name"
assert Named().__name__ == 17
print("callable-name-ok")
`);
    assert.equal(result.stdout.trim(), "callable-name-ok");
  });
  test(`unittest warning assertions (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(
      readFileSync(
        join(__dirname, "fixtures/unittest-warnings-runtime.py"),
        "utf8",
      ),
    );
    assert.equal(result.stdout.trim(), "unittest-warnings-ok");
  });
}
