// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`isinstance is available as a first-class builtin (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
import builtins
from builtins import isinstance as check_type
assert check_type is builtins.isinstance
assert callable(check_type)
class Parent:
    pass
class Child(Parent):
    pass
child = Child()
assert check_type(child, Parent)
assert check_type(child, (str, Parent))
assert not check_type(child, str)
assert not check_type(child, ())
class Holder:
    checker = staticmethod(isinstance)
assert Holder.checker(child, Parent)
assert Holder().checker(child, Parent)
checks = [check_type]
assert checks[0]('text', str)
try:
    check_type(value=child, classinfo=Parent)
except TypeError:
    pass
else:
    raise AssertionError('positional-only builtin accepted keywords')
try:
    check_type(child, 42)
except TypeError:
    pass
else:
    raise AssertionError('invalid type operand was accepted')
print('firstclass-isinstance-ok')
`);
    assert.equal(result.stdout.trim(), "firstclass-isinstance-ok");
  });
}
