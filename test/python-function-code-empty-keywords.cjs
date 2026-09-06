// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`function code reconstruction strips empty keyword carriers (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
def original():
    return a
factory = type(original)
first = factory(original.__code__, {'a': 1})
second = factory(original.__code__, {'a': 2})
assert first() == 1
assert second(**{}) == 2
assert first(*(), **{}) == 1
assert type(first) is factory
for thunk in (lambda: first(1), lambda: first(unexpected=1)):
    try:
        thunk()
    except TypeError:
        pass
    else:
        raise AssertionError('invalid arguments accepted')
code = (lambda: (lambda: a)).__code__
assert factory(code, {'a': 3})()() == 3
assert factory(code, {'a': 4})()() == 4
print('function-code-ok')
`);
    assert.equal(result.stdout.trim(), "function-code-ok");
  });
}
