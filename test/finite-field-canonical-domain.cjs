// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

async function run(context, source) {
  const session = await createSage();
  context.after(() => session.close());
  const result = await session.evaluate(`
import sagejs.runtime as runtime
import sagejs._baselib.finite_fields as finite
${source}
print("canonical-residue-ok")
`);
  assert.equal(result.stdout.trim(), "canonical-residue-ok");
  assert.equal(result.stderr ?? "", "");
}

test("canonical exact-residue tokens cover machine and arbitrary-precision storage", async (t) => {
  await run(t, `
for parent in (GF(65521), Zmod(65520), GF(94906297), Zmod(94906268)):
    keys = [parent(i) for i in range(128)]
    mapping = {key: int(key) for key in keys}
    for i in range(128):
        fresh = parent(i)
        assert mapping[fresh] == i
        first = finite._residue_dict_probe(keys[i])
        second = finite._residue_dict_probe(fresh)
        assert first.domain is second.domain
        assert first.token is second.token
        assert finite._residue_dict_valid(first.guard)
    assert parent(129) not in mapping
    assert finite._residue_dict_probe(parent(129)).token is not first.token
    mapping[parent(1)] = 900
    assert len(mapping) == 128
    assert list(mapping)[1] is keys[1]
    assert mapping[parent(1)] == 900
    copied = mapping.copy()
    assert copied == mapping
    assert copied.pop(parent(1)) == 900
    assert parent(1) not in copied
    copied.clear()
    copied.setdefault(parent(130), 130)
    assert copied[parent(130)] == 130

left = finite._residue_dict_probe(GF(101)(3))
right = finite._residue_dict_probe(Zmod(101)(3))
assert left.domain is not right.domain
assert finite._residue_dict_probe(3) is None
assert finite._residue_dict_probe((1, 2)) is None
`);
});

test("canonical residue keys cannot change behind stored tokens", async (t) => {
  await run(t, `
for parent in (GF(101), Zmod(100), Zmod(94906268)):
    key = parent(3)
    mapping = {key: "original"}
    assert runtime.object.isFrozen(key)
    assert not runtime.reflect.set(key, "_value", 4)
    try:
        object.__setattr__(key, "_value", 4)
    except (AttributeError, TypeError):
        pass
    assert int(key) == 3
    try:
        type(key).__init__(key, parent, 5)
    except (AttributeError, TypeError):
        pass
    assert int(key) == 3
    assert mapping[parent(3)] == "original"
    assert parent(4) not in mapping
    assert parent(5) not in mapping
    assert int(key + parent(1)) == 4
    assert int(key * parent(2)) == 6
    descriptor = finite._residue_dict_probe(key)
    parent._dict_keys.clear()
    parent._dict_keys = runtime.reflect.construct(runtime.map_class, [])
    assert finite._residue_dict_probe(parent(3)).token is descriptor.token
    assert mapping[parent(3)] == "original"
`);
});

for (const method of ["__eq__", "_eq_"]) {
  test(`canonical residue admission fails closed after ${method} replacement`, async (t) => {
    await run(t, `
parent = GF(101)
first = parent(1)
second = parent(2)
mapping = {first: "first", second: "second"}
descriptor = finite._residue_dict_probe(first)
cls = type(first)
old = getattr(cls, "${method}")
setattr(cls, "${method}", lambda self, other: True)
assert not finite._residue_dict_valid(descriptor.guard)
assert finite._residue_dict_probe(parent(3)) is False
assert mapping[parent(2)] == "first"
assert mapping[parent(3)] == "first"
new_mapping = {parent(7): "new"}
assert new_mapping[parent(8)] == "new"
setattr(cls, "${method}", old)
# An observed invalidation cannot capture a new provider as the old authority.
assert finite._residue_dict_probe(parent(9)) is False
`);
  });
}

test("canonical residue admission fails closed after token-hook replacement", async (t) => {
  await run(t, `
parent = Zmod(100)
one = parent(1)
two = parent(2)
mapping = {one: "one", two: "two"}
descriptor = finite._residue_dict_probe(one)
cls = type(one)
old = cls.__sagejs_dict_key__
cls.__sagejs_dict_key__ = lambda self: "collision"
assert not finite._residue_dict_valid(descriptor.guard)
assert mapping[parent(1)] == "one"
assert mapping[parent(2)] == "two"
assert parent(3) not in mapping
mapping[parent(3)] = "three"
assert len(mapping) == 3
assert mapping[parent(3)] == "three"
del cls.__sagejs_dict_key__
assert finite._residue_dict_probe(parent(4)) is False
`);
});

test("canonical residue admission guards coercion equality without invoking new accessors", async (t) => {
  await run(t, `
parent = GF(101)
mapping = {parent(1): "first", parent(2): "second"}
descriptor = finite._residue_dict_probe(parent(1))
runtime.coercion_model.equals = lambda left, right: True
assert not finite._residue_dict_valid(descriptor.guard)
assert finite._residue_dict_probe(parent(3)) is False
assert mapping[parent(2)] == "first"
assert mapping[parent(3)] == "first"
`);
});

test("inherited canonical hooks do not certify subclasses or instance overrides", async (t) => {
  await run(t, `
parent = GF(101)
class Untrusted(type(parent(1))):
    def __eq__(self, other):
        return True

key = Untrusted(parent, 1)
assert finite._residue_dict_probe(key) is None
mapping = {key: "untrusted"}
assert mapping[parent(7)] == "untrusted"
ordinary = parent(9)
assert runtime.reflect.set(ordinary, "_eq_", lambda other: True)
assert finite._residue_dict_probe(ordinary) is False
marked = parent(10)
object.__setattr__(marked, "__sagejs_float__", True)
assert finite._residue_dict_probe(marked) is False
symbol_key = parent(11)
symbol = runtime.reflect.get(runtime.global_object, "Symbol")
runtime.reflect.set(symbol_key, symbol.toStringTag, "String")
assert finite._residue_dict_probe(symbol_key) is False
`);
});

test("canonical residue tokens unify safe number and bigint representations", async (t) => {
  await run(t, `
parent = GF(101)
one = parent(1)
other = parent(1)
object.__setattr__(other, "_value", runtime.bigint(1))
assert one == other
first = finite._residue_dict_probe(one)
second = finite._residue_dict_probe(other)
assert first.token is second.token
assert {one: "one"}[other] == "one"
`);
});

test("canonical residue guard observes function dispatch flags and class markers", async (t) => {
  await run(t, `
key = GF(101)(1)
descriptor = finite._residue_dict_probe(key)
method = runtime.reflect.get(runtime.object.getPrototypeOf(key), "__eq__")
runtime.reflect.set(method, "__staticmethod__", True)
assert not finite._residue_dict_valid(descriptor.guard)
assert finite._residue_dict_probe(GF(101)(2)) is False
`);
});

test("canonical residue guard rejects newly inherited numeric dispatch markers", async (t) => {
  await run(t, `
key = GF(101)(1)
descriptor = finite._residue_dict_probe(key)
cls = type(key)
cls.__sagejs_float__ = True
assert not finite._residue_dict_valid(descriptor.guard)
assert finite._residue_dict_probe(GF(101)(2)) is False
`);
});

test("canonical residue guard observes same-parent method call overrides", async (t) => {
  await run(t, `
key = GF(101)(1)
descriptor = finite._residue_dict_probe(key)
method = runtime.reflect.get(runtime.object.getPrototypeOf(key), "_eq_")
runtime.reflect.set(method, "call", lambda left, right: True)
assert not finite._residue_dict_valid(descriptor.guard)
assert finite._residue_dict_probe(GF(101)(2)) is False
`);
});

test("residue value tokens preserve mixed-domain and primitive collision semantics", async (t) => {
  await run(t, `
parents = [GF(101), Zmod(101), GF(103)]
values = [runtime.bigint(1)] + [parent(1) for parent in parents]
for value in values[1:]:
    assert finite._residue_dict_probe(value).token is values[0]
assert values[1] != values[3]
for reverse in (False, True):
    ordered = list(reversed(values)) if reverse else values
    for offset in range(len(ordered)):
        keys = ordered[offset:] + ordered[:offset]
        mapping = {}
        expected = []
        # A linear original-key oracle, independent of dictionary tokens.
        for index, key in enumerate(keys):
            for row in expected:
                if row[0] is key or row[0] == key:
                    row[1] = index
                    break
            else:
                expected.append([key, index])
            mapping[key] = index
        assert len(mapping) == len(expected)
        for index, row in enumerate(expected):
            assert list(mapping)[index] is row[0]
        for key in keys:
            for row in expected:
                if row[0] is key or row[0] == key:
                    assert mapping[key] == row[1]
                    break
        assert parents[0](2) not in mapping
        assert parents[2](2) not in mapping

mapping = {parents[0](1): "first", parents[0](2): "second"}
mapping[runtime.bigint(0)] = "zero"
cls = type(parents[0](1))
cls.__eq__ = lambda self, other: True
assert mapping[parents[0](2)] == "first"
assert mapping[parents[0](99)] == "first"
`);
});

test("residue misses do not populate a parent-local value cache", async (t) => {
  await run(t, `
parent = GF(65521)
parent._dict_keys.clear()
mapping = {parent(0): "zero"}
descriptor = finite._residue_dict_probe(parent(0))
assert runtime.reflect.ownKeys(descriptor.domain) == ["parent"]
assert runtime.jstype(descriptor.token) == "bigint"
for value in range(1, 2049):
    assert parent(value) not in mapping
assert parent._dict_keys.size == 0
assert runtime.reflect.ownKeys(descriptor.domain) == ["parent"]
assert len(mapping) == 1
mapping.clear()
assert parent._dict_keys.size == 0
`);
});
