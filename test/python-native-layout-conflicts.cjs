// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`native layout roots survive class metadata and inheritance (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
def conflict(left, right):
    for dynamic in (False, True):
        try:
            if dynamic:
                type('Conflict', (left, right), {})
            else:
                class Conflict(left, right):
                    pass
        except TypeError:
            pass
        else:
            raise AssertionError('distinct native layouts accepted')

for left, right in ((type, tuple), (tuple, type), (list, tuple),
                    (dict, list), (set, tuple), (bytes, tuple),
                    (bytearray, bytes), (int, float)):
    conflict(left, right)

class NativeList(list):
    pass
class NativeTuple(tuple):
    pass
class Meta(type):
    pass
conflict(NativeList, NativeTuple)
conflict(Meta, NativeTuple)

class Mixin:
    def marker(self):
        return 17
class MixedList(Mixin, list):
    pass
class ListMixed(list, Mixin):
    pass
class MixedMeta(Mixin, type):
    pass
class TupleMixed(tuple, Mixin):
    pass
class Left(NativeList):
    pass
class Right(NativeList):
    pass
class SharedLayout(Left, Right):
    pass
class RedundantCompatible(Left, NativeList):
    pass
assert issubclass(SharedLayout, list)
assert issubclass(MixedMeta, type)
assert issubclass(TupleMixed, tuple)
assert type('DynamicMixed', (Mixin, list), {}).__bases__ == (Mixin, list)
assert type('DynamicShared', (Left, Right), {}).__bases__ == (Left, Right)
assert type('DynamicCompatible', (Left, NativeList), {}).__bases__ == (Left, NativeList)
assert ListMixed([1, 2]).marker() == 17
print('native-layout-ok')
`);
    assert.equal(result.stdout.trim(), "native-layout-ok");
  });
}
