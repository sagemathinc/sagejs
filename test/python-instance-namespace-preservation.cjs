// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`instance namespace self-assignment preserves data (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
class Holder:
    pass

holder = Holder()
payload = [1, 2]
holder.kept = payload
holder.owner = holder
holder.__dict__ = holder.__dict__
assert holder.kept is payload
assert holder.owner is holder
object.__setattr__(holder, '__dict__', holder.__dict__)
assert holder.kept is payload
assert holder.owner is holder

class NotADictionary:
    def items(self):
        yield 'tentative', 2
        yield 17, 'invalid namespace key'

try:
    holder.__dict__ = NotADictionary()
except TypeError:
    pass
else:
    raise AssertionError('invalid namespace accepted')
assert holder.kept is payload
assert holder.owner is holder
assert not hasattr(holder, 'tentative')

holder.__dict__ = {'new': payload}
assert holder.new is payload
assert not hasattr(holder, 'kept')
assert not hasattr(holder, 'owner')
print('namespace-preserved')
`);
    assert.equal(result.stdout.trim(), "namespace-preserved");
  });
}
