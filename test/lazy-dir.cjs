// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");

test("dir loads lazily and preserves default, custom, class, and module listing", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const result = await session.evaluate(`
import sys
assert 'sagejs._introspection' not in sys.modules
getter_reads = []
class Parent:
    inherited = 1
    def method(self):
        return 2
    @property
    def guarded(self):
        getter_reads.append('guarded')
        raise AssertionError('dir invoked a property')
class Child(Parent):
    own = 3
instance = Child()
instance.dynamic = 4
names = dir(instance)
assert 'sagejs._introspection' in sys.modules
assert names == sorted(set(names))
assert all(name in names for name in ['inherited', 'method', 'guarded', 'own', 'dynamic'])
assert 'constructor' not in names and 'prototype' not in names
assert dir(instance) == names
class_names = dir(Child)
assert all(name in class_names for name in ['inherited', 'method', 'guarded', 'own'])
assert 'dynamic' not in class_names
assert getter_reads == []
class Custom:
    actual = 5
    def __dir__(self):
        return ['zeta', 'alpha']
custom = Custom()
assert dir(custom) == ['alpha', 'zeta']
assert 'actual' in object.__dir__(custom)
class Invalid:
    def __dir__(self):
        return ['ok', 3]
try:
    dir(Invalid())
except TypeError:
    pass
else:
    raise AssertionError('non-string custom dir entry accepted')
import math
assert 'sqrt' in dir(math)
assert 'constructor' not in dir(math)
def local_names():
    local_marker = 7
    return 'local_marker' in dir()
assert local_names()
print('lazy dir contracts passed')
`);
  assert.equal(result.stdout, "lazy dir contracts passed\n");
});
