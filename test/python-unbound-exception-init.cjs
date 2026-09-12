// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`inherited exception initializers retain explicit receivers (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
class Direct(ValueError):
    def __init__(self, *args):
        ValueError.__init__(self, *args)

class Indirect(ValueError):
    def __init__(self, *args):
        initializer = ValueError.__init__
        initializer(self, *args)

class Intermediate(ValueError):
    pass

class Inherited(Intermediate):
    def __init__(self, *args):
        Intermediate.__init__(self, *args)

for cls in (Direct, Indirect, Inherited):
    for args in ((), ('message',), (None,), ('one', 'two', 3)):
        error = cls(*args)
        assert error.args == args
        assert isinstance(error, ValueError)
        other = cls('untouched')
        ValueError.__init__(error, 'replaced')
        assert error.args == ('replaced',)
        assert other.args == ('untouched',)
        packed = (error, 'expanded')
        ValueError.__init__(*packed)
        assert error.args == ('expanded',)
a = []
list.append(*(a, 3))
assert a == [3]
assert dict.get(*({'x': 1}, 'x')) == 1
assert str.upper(*('hi',)) == 'HI'
print('exception-init-ok')
`);
    assert.equal(result.stdout.trim(), "exception-init-ok");
  });
  test(`builtin type metadata uses Python names (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
for cls, name in [(int, 'int'), (bool, 'bool'), (float, 'float'),
                  (str, 'str'), (list, 'list'), (dict, 'dict'),
                  (set, 'set'), (frozenset, 'frozenset'), (type, 'type')]:
    assert cls.__name__ == name
    assert cls.__qualname__ == name
    assert cls.__module__ == 'builtins'
assert type(False).__name__ == 'bool'
assert isinstance(False, bool)
assert isinstance(False, int)
print('builtin-names-ok')
`);
    assert.equal(result.stdout.trim(), "builtin-names-ok");
  });
}
