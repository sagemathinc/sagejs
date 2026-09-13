// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("callable inspects the type slot without invoking descriptors or instance hooks", async (context) => {
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(`
events = []
class Plain:
    pass
p = Plain()
p.__call__ = lambda: 1
assert not callable(p)
Plain.__call__ = None
assert callable(p)
del Plain.__call__
assert not callable(p)

class InitiallyCallable:
    def __call__(self):
        return 1
c = InitiallyCallable()
assert callable(c)
del InitiallyCallable.__call__
assert not callable(c)
InitiallyCallable.__call__ = None
assert callable(c)

class NonFunction:
    __call__ = 1
class Child(NonFunction):
    pass
assert callable(NonFunction())
assert callable(Child())

class Descriptor:
    def __get__(self, instance, owner):
        events.append('descriptor')
        raise RuntimeError('callable must not invoke __get__')
class WithDescriptor:
    __call__ = Descriptor()
assert callable(WithDescriptor())

class WithProperty:
    @property
    def __call__(self):
        events.append('property')
        raise RuntimeError('callable must not invoke the property')
assert callable(WithProperty())

class WithLookup:
    def __getattribute__(self, name):
        events.append(name)
        raise RuntimeError('callable must not invoke __getattribute__')
assert not callable(WithLookup())
assert events == []
assert all(callable(value) for value in [int, list, Plain, len, lambda: None])
assert all(not callable(value) for value in [None, 1, 'x', [], {}, ()])
print('callable-slot-ok')
`);
  assert.equal(result.stdout.trim(), "callable-slot-ok");
});
