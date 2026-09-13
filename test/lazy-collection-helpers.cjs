// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");

test("flatten can be the first lazy collection helper", async t => {
  const session = await createSage({mode: "sage"});
  t.after(() => session.close());
  const result = await session.evaluate(`
import sys
assert 'sagejs._collection_helpers' not in sys.modules
assert flatten([[1], (2, 3)]) == [1, 2, 3]
assert 'sagejs._collection_helpers' in sys.modules
print('flatten first passed')
`);
  assert.equal(result.stdout, "flatten first passed\n");
});

for (const mode of ["sage", "python"])
test(`${mode}: copy and flatten load on demand and preserve contracts`, async t => {
  const session = await createSage({mode});
  t.after(() => session.close());
  const result = await session.evaluate(`
import sys
assert 'sagejs._collection_helpers' not in sys.modules
nested = [[1], [2]]
cloned = copy(nested)
assert 'sagejs._collection_helpers' in sys.modules
assert cloned == nested and cloned is not nested and cloned[0] is nested[0]
for value in ['text', b'bytes', 123, float('1.5'), (1, 2), frozenset([1])]:
    assert copy(value) is value
class Hooks:
    def __copy__(self):
        return 'special'
    def copy(self):
        return 'ordinary'
assert copy(Hooks()) == 'special'
class Ordinary:
    def copy(self):
        return 'ordinary'
assert copy(Ordinary()) == 'ordinary'
class Constructed:
    def __init__(self, value=None):
        self.value = value
original = Constructed()
assert copy(original).value is original
class Unsupported:
    def __init__(self, value=None):
        if value is not None:
            raise ValueError('cannot reconstruct')
try:
    copy(Unsupported())
except TypeError as error:
    assert str(error) == 'object does not support shallow copying'
else:
    assert False
values = [1, [2, (3, 4)], 'ab']
assert flatten(values) == [1, 2, 3, 4, 'ab']
assert flatten(values, max_level=0) == values
assert flatten(values, max_level=1) == [1, 2, (3, 4), 'ab']
assert flatten(values, ltypes=(str,), max_level=1) == [1, [2, (3, 4)], 'a', 'b']
assert flatten((value for value in [[1], [2]])) == [1, 2]
cycle = []
cycle.append(cycle)
assert flatten(cycle, max_level=3)[0] is cycle
for operation in [lambda: copy(), lambda: flatten(), lambda: flatten(None)]:
    try:
        operation()
    except TypeError:
        pass
    else:
        assert False
print('cold collection helpers passed')
`);
  assert.equal(result.stdout, "cold collection helpers passed\n");
});
