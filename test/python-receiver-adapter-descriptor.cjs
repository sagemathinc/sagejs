// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`receiver-style replacements bypass stale eager caches (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
class Base:
    def __call__(self, value=4, *, offset=0):
        return value * 3 + offset
    def method(self, value=4, *, offset=0):
        return value * 3 + offset
class Callable(Base):
    def __call__(self, value=4, *, offset=0):
        return value * 2 + offset
    def method(self, value=4, *, offset=0):
        return value * 2 + offset
instance = Callable()
saved_call = instance.__call__
saved_method = instance.method
saved_unbound = Callable.method
assert instance(value=4) == instance.method(value=4) == 8

def replacement(self, value=4, *, offset=1):
    assert self is instance
    return value + offset
Callable.__call__ = replacement
Callable.method = replacement
assert instance(4) == instance(value=4) == 5
assert instance.__call__(4) == instance.__call__(value=4) == 5
assert instance.method(4) == instance.method(value=4) == 5
assert Callable.__call__(instance, value=4) == 5
assert Callable.method(instance, value=4) == 5
assert saved_call(value=4) == saved_method(value=4) == 8
assert saved_unbound(instance, value=4) == 8
bound_replacement = instance.method
assert bound_replacement.__self__ is instance
replacement.__defaults__ = (6,)
replacement.__kwdefaults__ = {'offset': 2}
assert instance() == instance.method() == bound_replacement() == 8
assert instance(value=4) == bound_replacement(value=4) == 6

def class_replacement(cls, *, value):
    assert cls is Callable
    return value + 10
Callable.method = classmethod(class_replacement)
assert instance.method(value=4) == Callable.method(value=4) == 14
assert bound_replacement(value=4) == 6

def static_replacement(*, value):
    return value + 20
Callable.method = staticmethod(static_replacement)
assert instance.method(value=4) == Callable.method(value=4) == 24
assert bound_replacement(value=4) == 6

# Deleting a replacement reveals the base descriptor, not the old eager cache.
del Callable.method
del Callable.__call__
assert instance(4) == instance(value=4) == 12
assert instance.method(4) == instance.method(value=4) == 12
assert Callable.method(instance, value=4) == 12
assert saved_method(value=4) == 8
assert bound_replacement(value=4) == 6
print('receiver-adapter-ok')
`);
    assert.equal(result.stdout.trim(), "receiver-adapter-ok");
  });
}
