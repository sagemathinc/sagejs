// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`keyword signature data preserves binding and live owners (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
def mixed(a, /, b=2, *rest, k=3, **extra):
    return a, b, rest, k, extra
assert mixed(1, k=4) == (1, 2, (), 4, {})
assert mixed(1, 5, 6, 7, k=8, a=9) == (1, 5, (6, 7), 8, {'a': 9})
mixed.__defaults__ = (10,)
mixed.__kwdefaults__['k'] = 11
assert mixed(1, **{}) == (1, 10, (), 11, {})
assert mixed(*(1,), **{'b': 12, 'k': 13}) == (1, 12, (), 13, {})
def only(*, value=20):
    return value
assert only(value=21) == 21
only.__kwdefaults__ = {'value': 22}
assert only(**{}) == 22
def strict(a, /, b, *, k):
    return a + b + k
assert strict(1, b=2, k=3) == 6
for invalid in (
    lambda: strict(a=1, b=2, k=3),
    lambda: strict(1, 2, b=3, k=4),
    lambda: strict(1, b=2, k=3, unexpected=4),
    lambda: strict(1, b=2),
    lambda: strict(1, 2, 3, k=4),
):
    try:
        invalid()
    except TypeError:
        pass
    else:
        raise AssertionError('invalid keyword binding succeeded')
class Base:
    def method(self, *, value=30):
        return value
    @classmethod
    def factory(cls, *, value):
        return cls, value
    @staticmethod
    def static(*, value):
        return value
class Child(Base):
    pass
child = Child()
saved = child.method
assert saved(value=31) == 31
Base.method.__kwdefaults__['value'] = 32
assert saved(**{}) == 32
def replacement(self, *, value):
    return value + 1
Child.method = replacement
assert child.method(value=33) == 34
assert saved(value=33) == 33
assert Child.factory(value=35) == (Child, 35)
assert child.static(value=36) == 36
class Callable:
    def __call__(self, *, value):
        return value * 2
callable_object = Callable()
assert callable_object(value=4) == 8
Callable.__call__ = replacement
assert callable_object(value=4) == 5
class Constructor:
    def __init__(self, *, value):
        self.value = value
assert Constructor(value=40).value == 40
class Holder:
    build = Constructor
assert Holder().build(value=41).value == 41
print('keyword-data-ok')
`);
    assert.equal(result.stdout.trim(), "keyword-data-ok");
  });
}
