// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`Boolean identity fast path preserves truth protocols (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
assert bool(True) is True
assert bool(False) is False
assert bool(1) is True and bool(0) is False
assert bool(None) is False
for value in ([], (), '', {}, float('0.0'), float('-0.0')):
    assert bool(value) is False
for value in ([False], (False,), 'x', {'x': False}, float('inf'), float('-inf'), float('1.0'), float('-1.0')):
    assert bool(value) is True

events = []
class Truth:
    def __init__(self, answer):
        self.answer = answer
    def __bool__(self):
        events.append('bool')
        return self.answer
    def __len__(self):
        raise AssertionError('__bool__ must precede __len__')
    def __eq__(self, other):
        raise AssertionError('truth must not invoke equality')
    def __ne__(self, other):
        raise AssertionError('truth must not invoke inequality')
    def __lt__(self, other):
        raise AssertionError('truth must not invoke ordering')
truthful = Truth(True)
falseful = Truth(False)
assert bool(truthful) is True
assert bool(falseful) is False
assert events == ['bool', 'bool']
events.clear()
marker = object()
assert (truthful and marker) is marker
assert (falseful or marker) is marker
assert not falseful
assert events == ['bool', 'bool', 'bool']

for invalid in (0, 1, None, [], object()):
    try:
        bool(Truth(invalid))
    except TypeError:
        pass
    else:
        raise AssertionError('non-Boolean __bool__ result accepted')

class Length:
    def __init__(self, answer):
        self.answer = answer
    def __len__(self):
        return self.answer
    def __eq__(self, other):
        raise AssertionError('truth must not invoke equality')
assert bool(Length(0)) is False
assert bool(Length(2)) is True
try:
    bool(Length(-1))
except ValueError:
    pass
else:
    raise AssertionError('negative length accepted')

class BrokenLength:
    def __len__(self):
        raise RuntimeError('length failed')
class BrokenTruth:
    def __bool__(self):
        raise RuntimeError('truth failed')
for value in (BrokenLength(), BrokenTruth()):
    try:
        bool(value)
    except RuntimeError:
        pass
    else:
        raise AssertionError('truth hook exception was swallowed')

class EqualityOnly:
    def __eq__(self, other):
        raise AssertionError('truth must not compare with Boolean singletons')
    def __ne__(self, other):
        raise AssertionError('truth must not compare with Boolean singletons')
assert bool(EqualityOnly()) is True
print('bool-identity-ok')
`);
    assert.equal(result.stdout.trim(), "bool-identity-ok");
  });
}

