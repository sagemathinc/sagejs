// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const cases = [
  ["None retains accessors in fresh clones", String.raw`
getter, setter, deleter = object(), object(), object()
original = property(getter, setter, deleter, "documented")
for method in ("getter", "setter", "deleter"):
    clone = getattr(original, method)(None)
    assert type(clone) is property
    assert clone is not original
    assert clone.fget is getter
    assert clone.fset is setter
    assert clone.fdel is deleter
    assert clone.__doc__ == "documented"
    assert getattr(original, method)(None) is not clone
assert original.fget is getter
assert original.fset is setter
assert original.fdel is deleter
empty = property()
for method in ("getter", "setter", "deleter"):
    clone = getattr(empty, method)(None)
    assert clone is not empty
    assert clone.fget is None
    assert clone.fset is None
    assert clone.fdel is None
    assert clone.__doc__ is None
`],
  ["False values replace rather than retain accessors", String.raw`
getter, setter, deleter = object(), object(), object()
original = property(getter, setter, deleter, "documented")
class NoTruthConversion:
    def __bool__(self):
        raise AssertionError("property clone tested replacement truth")
for replacement in (0, False, "", NoTruthConversion()):
    clone = original.getter(replacement)
    assert clone.fget is replacement
    assert clone.fset is setter
    assert clone.fdel is deleter
    clone = original.setter(replacement)
    assert clone.fget is getter
    assert clone.fset is replacement
    assert clone.fdel is deleter
    clone = original.deleter(replacement)
    assert clone.fget is getter
    assert clone.fset is setter
    assert clone.fdel is replacement
`],
  ["Explicit docs survive cloning and later doc assignment", String.raw`
for explicit_doc in ("documented", ""):
    original = property(None, None, None, explicit_doc)
    for method in ("getter", "setter", "deleter"):
        assert getattr(original, method)(None).__doc__ == explicit_doc
    original.__doc__ = "changed"
    for method in ("getter", "setter", "deleter"):
        clone = getattr(original, method)(None)
        assert clone.__doc__ == "changed"
        assert clone.fget is None
        assert clone.fset is None
        assert clone.fdel is None
        clone.__doc__ = "clone only"
        assert original.__doc__ == "changed"
`],
];

for (const mode of ["python", "sage"]) {
  test(`property accessor cloning (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    for (const [name, source] of cases) {
      await t.test(name, async () => {
        const result = await session.evaluate(source + "\nprint('property-clone-ok')\n");
        assert.equal(result.stdout.trim(), "property-clone-ok");
      });
    }
  });
}
