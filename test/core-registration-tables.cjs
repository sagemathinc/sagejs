// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");

test("builtin registration tables preserve adapters and public class lookup", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const result = await session.evaluate(`
class TupleChild(tuple):
    pass
values = TupleChild([1, 2, 1])
assert len(values) == 3
assert list(values) == [1, 2, 1]
assert values[1] == 2
assert repr(values) == '(1, 2, 1)'
assert str(values) == '(1, 2, 1)'
assert values + (3,) == (1, 2, 1, 3)
assert values * 2 == (1, 2, 1, 1, 2, 1)
assert 2 * values == (1, 2, 1, 1, 2, 1)
assert values.count(1) == tuple.count(values, 1) == 2
assert values.index(2) == tuple.index(values, 2) == 1
assert tuple.__repr__ is not tuple.__str__
assert tuple.__mul__ is not tuple.__rmul__
assert str.rstrip('text ') == 'text '.rstrip() == 'text'
assert str.format('{value}', value=7) == '{value}'.format(value=7) == '7'
assert str.replace('aba', 'a', 'x') == 'aba'.replace('a', 'x') == 'xbx'
assert str.split('a b') == 'a b'.split() == ['a', 'b']
assert str.partition('a:b', ':') == 'a:b'.partition(':') == ('a', ':', 'b')
class Plain:
    pass
plain = object.__new__(Plain)
object.__init__(plain)
object.__setattr__(plain, 'first', 1)
assert plain.first == 1
plain.__setattr__('second', 2)
assert plain.second == 2
object.__delattr__(plain, 'first')
plain.__delattr__('second')
assert not hasattr(plain, 'first') and not hasattr(plain, 'second')
assert Plain.__new__ is object.__new__
for value, cls, name in [({}, dict, 'dict'), (set(), set, 'set'), (frozenset(), frozenset, 'frozenset')]:
    assert type(value) is cls
    assert cls.__name__ == cls.__qualname__ == name
    assert cls.__module__ == 'builtins'
    assert isinstance(value, cls)
assert dict.fromkeys(['a', 'b'], 3) == {'a': 3, 'b': 3}
assert set([1, 1, 2]) == {1, 2}
assert frozenset([1, 1, 2]) == frozenset([1, 2])
print('registration contracts passed')
`);
  assert.equal(result.stdout, "registration contracts passed\n");
});
