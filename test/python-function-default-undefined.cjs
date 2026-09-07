// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`declared host-undefined defaults remain present (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
import sagejs.runtime as runtime
def positional(value=runtime.undefined):
    return value is runtime.undefined
def keyword(*, value=runtime.undefined):
    return value is runtime.undefined
assert positional() and positional(**{})
assert keyword() and keyword(**{})
positional.__defaults__ = (runtime.undefined,)
keyword.__kwdefaults__ = {'value': runtime.undefined}
assert positional() and keyword()
class TupleDefaults(tuple):
    def __getitem__(self, key):
        raise AssertionError('tuple hook called')
class DictDefaults(dict):
    def __getitem__(self, key):
        raise AssertionError('dict hook called')
    def __contains__(self, key):
        raise AssertionError('dict membership hook called')
positional.__defaults__ = TupleDefaults((runtime.undefined,))
keyword.__kwdefaults__ = DictDefaults(value=runtime.undefined)
assert positional() and keyword()
def several(a=runtime.undefined, b=runtime.undefined, *, first=runtime.undefined, second):
    return a is runtime.undefined, b is runtime.undefined, first is runtime.undefined, second
assert several(second=4) == (True, True, True, 4)
try:
    several()
except TypeError:
    pass
else:
    raise AssertionError('undefined default hid a missing keyword')
positional.__defaults__ = None
keyword.__kwdefaults__ = {}
for function in (positional, keyword):
    try:
        function()
    except TypeError:
        pass
    else:
        raise AssertionError('absent default was accepted')
from collections import OrderedDict, defaultdict, Counter
assert list(OrderedDict()) == []
groups = defaultdict(list)
groups['odd'].extend([1, 3])
assert groups['odd'] == [1, 3]
assert list(Counter()) == []
print('undefined-default-ok')
`);
    assert.equal(result.stdout.trim(), "undefined-default-ok");
  });
}
