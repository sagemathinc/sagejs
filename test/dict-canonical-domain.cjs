// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname, "../src/baselib/containers.py"), "utf8");

test("source: canonical metadata stays private and all storage paths maintain it", () => {
  assert.match(source, /_DICT_METADATA = runtime\.reflect\.construct\([\s\S]*?"WeakMap"/);
  assert.doesNotMatch(source, /mapping\._dict_key_|self\._dict_key_|answer\._dict_key_/);
  assert.match(source, /def _register_dict_canonical_provider\(probe: Any, valid: Any\)/);
  assert.match(source, /if descriptor is False:\s+return False/);
  assert.match(source, /key\s+if probe is False/);
  assert.match(source, /retained_probe\[1\]\.token is normalized_key/);
  assert.match(source, /ρσ_dict_storage_setitem = _dict_storage_setitem/);
  assert.match(source, /def _dict_storage_setitem[\s\S]*?metadata\.state == _DICT_EMPTY or metadata\.state == _DICT_PRIMITIVE/);
  assert.match(source, /def setdefault\([\s\S]*?_dict_store_resolved\(self, key, default_value, normalized_key, probe\)/);
  assert.match(source, /def copy\(self\) -> SageDict:[\s\S]*?_DICT_METADATA\.set\(/);
  assert.equal((source.match(/_dict_after_delete\(self\)/g) ?? []).length, 3);
  assert.match(source, /def _refresh\(self\) -> None:\s+SageDict\.clear\(self\)/);
  assert.match(source, /metadata\.state = _DICT_PRIMITIVE if answer\.jsmap\.size else _DICT_EMPTY/);
});

// Loading is deliberately lazy: --test-name-pattern='^source:' checks the
// candidate source without accepting an unrelated generated runtime as evidence.
async function run(context, program, setup = "") {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(`
import sagejs.runtime as runtime
import sagejs._baselib.containers as containers
${setup}
${program}
print("dict-canonical-domain-ok")
`);
  assert.equal(result.stdout.trim(), "dict-canonical-domain-ok");
  assert.equal(result.stderr ?? "", "");
}

const instrumentation = `
def watch_scans(mapping):
    storage = runtime.reflect.get(mapping, "jsmap")
    original = runtime.reflect.get(runtime.map_class.prototype, "keys")
    calls = [0]
    def keys():
        calls[0] += 1
        return runtime.reflect.apply(original, storage, [])
    runtime.reflect.set(storage, "keys", keys)
    return calls
`;

// This controlled test provider isolates the containers protocol. Production
// residue admission/immutability/descriptor guards have their own provider tests.
const canonical = `${instrumentation}
equal_calls = [0]
all_equal = False
def domain():
    record = runtime.object.create(None)
    record.live = True
    record.tokens = runtime.reflect.construct(runtime.map_class, [])
    return record

first_domain = domain()
second_domain = domain()
class Key:
    def __init__(self, value, owner=first_domain):
        self.value = value
        self.owner = owner
    def __eq__(self, other):
        equal_calls[0] += 1
        return all_equal or (isinstance(other, Key) and self.value == other.value)
    def __sagejs_dict_key__(self):
        raise AssertionError("a recognized private provider must bypass the public hook")

def probe(key):
    if type(key) is not Key:
        return None
    if not key.owner.live:
        return False
    token = key.owner.tokens.get(key.value)
    if token is runtime.undefined:
        token = runtime.object.create(None)
        key.owner.tokens.set(key.value, token)
    descriptor = runtime.object.create(None)
    descriptor.domain = key.owner
    descriptor.guard = key.owner
    descriptor.token = token
    return descriptor

def valid(guard):
    return guard.live

containers._register_dict_canonical_provider(probe, valid)
`;

test("primitive-only insertions and misses do not enumerate retained keys", async (t) => {
  await run(t, `
for size in (32, 128, 512):
    mapping = {}
    scans = watch_scans(mapping)
    for i in range(size):
        mapping[str(i)] = i
    for i in range(size):
        assert mapping[str(i)] == i
        assert str(i + size) not in mapping
    assert scans == [0]
    assert containers._dict_metadata(mapping).state == containers._DICT_PRIMITIVE
`, instrumentation);
});

test("live homogeneous canonical operations have zero equality scans as sizes grow", async (t) => {
  await run(t, `
for size in (32, 128, 512):
    mapping = {}
    scans = watch_scans(mapping)
    equal_calls[0] = 0
    retained = Key(0)
    mapping[retained] = 0
    for i in range(1, size):
        mapping[Key(i)] = i
    for i in range(size):
        assert mapping[Key(i)] == i
        assert Key(i + size) not in mapping
        mapping[Key(i)] = i + 1
        assert mapping.setdefault(Key(i), -1) == i + 1
    assert scans == [0]
    assert equal_calls == [0]
    assert next(iter(mapping)) is retained
    assert containers._dict_metadata(mapping).state == containers._DICT_CANONICAL
`, canonical);
});

test("mixed primitive and object equality works in both insertion orders", async (t) => {
  await run(t, `
class Zero:
    def __eq__(self, other):
        return other == 0 if not isinstance(other, Zero) else True
for reverse in (False, True):
    original = Zero() if reverse else 0
    query = 0 if reverse else Zero()
    mapping = {original: "old"}
    mapping[query] = "new"
    assert len(mapping) == 1
    assert next(iter(mapping)) is original
    assert mapping[query] == "new"
    assert mapping.setdefault(query, "missing") == "new"
    assert mapping.pop(query) == "new"
    assert len(mapping) == 0

class Text:
    def __eq__(self, other):
        return other == "same"
for first, second in ((Text(), "same"), ("same", Text())):
    mapping = {first: 1}
    mapping[second] = 2
    assert len(mapping) == 1
    assert next(iter(mapping)) is first
    assert mapping[second] == 2
assert {True: 1, 1: 2, 1.0: 3} == {True: 3}
assert {(1, 2): "tuple"}[(1, 2)] == "tuple"
nan = float("nan")
assert {nan: "nan"}[nan] == "nan"
`);
});

test("foreign domains scan but an equal replacement retains the original domain", async (t) => {
  await run(t, `
retained = Key(1)
mapping = {retained: "one"}
scans = watch_scans(mapping)
mapping[Key(1, second_domain)] = "equal"
assert len(mapping) == 1
assert scans[0] > 0
assert next(iter(mapping)) is retained
assert containers._dict_metadata(mapping).state == containers._DICT_CANONICAL
mapping[Key(2, second_domain)] = "foreign"
assert containers._dict_metadata(mapping).state == containers._DICT_GENERAL
del mapping[Key(2, second_domain)]
assert containers._dict_metadata(mapping).state == containers._DICT_GENERAL
assert mapping[Key(1)] == "equal"
mapping.clear()
assert containers._dict_metadata(mapping).state == containers._DICT_EMPTY
mapping[Key(3)] = "fresh"
assert containers._dict_metadata(mapping).state == containers._DICT_CANONICAL
`, canonical);
});

test("native BigInt tokens may collide across domains and primitive keys", async (t) => {
  await run(t, `
def native_domain(group):
    owner = runtime.object.create(None)
    owner.group = group
    return owner

class NativeKey:
    def __init__(self, value, owner):
        self.value = value
        self.owner = owner
    def __eq__(self, other):
        if type(other) is NativeKey:
            return self.value == other.value and self.owner.group == other.owner.group
        return self.owner.group == "number" and self.value == other

def native_probe(key):
    if type(key) is not NativeKey:
        return None
    descriptor = runtime.object.create(None)
    descriptor.domain = key.owner
    descriptor.guard = key.owner
    descriptor.token = runtime.bigint(key.value)
    return descriptor

def native_valid(guard):
    return True

containers._register_dict_canonical_provider(native_probe, native_valid)
# Above 2^53, primitive normalization preserves this exact native BigInt token.
primitive = runtime.bigint("1208925819614629174706176")
for equivalent in (False, True):
    left_domain = native_domain("number" if equivalent else "left")
    right_domain = native_domain("number" if equivalent else "right")
    left = NativeKey(primitive, left_domain)
    right = NativeKey(primitive, right_domain)
    assert native_probe(left).domain is not native_probe(right).domain
    assert native_probe(left).token is native_probe(right).token
    assert native_probe(left).token is primitive
    assert runtime.jstype(native_probe(left).token) == "bigint"
    entries = ((left, "left"), (right, "right"), (primitive, "primitive"))
    for order in ((0, 1, 2), (2, 0, 1), (1, 2, 0)):
        mapping = {}
        for index in order:
            mapping[entries[index][0]] = entries[index][1]
        if equivalent:
            assert len(mapping) == 1
            assert next(iter(mapping)) is entries[order[0]][0]
            mapping[NativeKey(primitive, left_domain)] = "replacement"
            assert mapping[NativeKey(primitive, right_domain)] == "replacement"
            assert mapping[primitive] == "replacement"
            assert next(iter(mapping)) is entries[order[0]][0]
        else:
            assert len(mapping) == 3
            for position in range(3):
                assert list(mapping)[position] is entries[order[position]][0]
            assert mapping[NativeKey(primitive, left_domain)] == "left"
            assert mapping[NativeKey(primitive, right_domain)] == "right"
            assert mapping[primitive] == "primitive"
            mapping[NativeKey(primitive, left_domain)] = "left replacement"
            mapping[NativeKey(primitive, right_domain)] = "right replacement"
            assert mapping[primitive] == "primitive"
            assert mapping[NativeKey(primitive, left_domain)] == "left replacement"
            assert mapping[NativeKey(primitive, right_domain)] == "right replacement"
            assert len(mapping) == 3
            for position in range(3):
                assert list(mapping)[position] is entries[order[position]][0]
`);
});

test("invalid guards suppress old normalized hits and misses in canonical and mixed tables", async (t) => {
  await run(t, `
first = Key(1)
mapping = {first: "first", Key(2): "second"}
mixed = mapping.copy()
mixed["foreign"] = "foreign"
frozen = mapping.copy()
runtime.object.freeze(frozen)
first_domain.live = False
all_equal = True
for value in (mapping, mixed, frozen):
    assert value[Key(2)] == "first"
    assert value[Key(3)] == "first"
    assert containers._dict_metadata(value).state == containers._DICT_GENERAL
    assert value[0] == "first"
assert runtime.object.isFrozen(frozen)
`, canonical);
});

test("colliding untrusted structural tokens cannot create false hits or overwrite originals", async (t) => {
  await run(t, `
token = runtime.object.create(None)
class Collision:
    def __init__(self, value):
        self.value = value
    def __eq__(self, other):
        return isinstance(other, Collision) and self.value == other.value
    def __sagejs_dict_key__(self):
        return token
one = Collision(1)
two = Collision(2)
mapping = {one: "one", two: "two"}
assert len(mapping) == 2
assert list(mapping)[0] is one
assert list(mapping)[1] is two
assert mapping[Collision(1)] == "one"
assert mapping[Collision(2)] == "two"
assert Collision(3) not in mapping
mapping.setdefault(Collision(3), "three")
assert len(mapping) == 3
assert mapping[Collision(3)] == "three"
`);
});

test("literal, update, direct, copy, deletion and reinitialization share metadata", async (t) => {
  await run(t, `
for mapping in ({Key(1): 1}, {Key(i): i for i in range(1, 3)}, dict([(Key(1), 1)])):
    values = runtime.reflect.get(mapping, "jsmap")
    keys = runtime.reflect.get(mapping, "keymap")
    dict.__init__(mapping, [(Key(3), 3)])
    assert runtime.reflect.get(mapping, "jsmap") is values
    assert runtime.reflect.get(mapping, "keymap") is keys
    mapping.update([(Key(4), 4)])
    containers.ρσ_dict_storage_setitem(mapping, Key(5), 5)
    assert mapping.setdefault(Key(6), 6) == 6
    assert containers._dict_metadata(mapping).state == containers._DICT_CANONICAL
    copied = mapping.copy()
    assert containers._dict_metadata(copied) is not containers._dict_metadata(mapping)
    copied.clear()
    assert containers._dict_metadata(mapping).state == containers._DICT_CANONICAL
    assert containers._dict_metadata(copied).state == containers._DICT_EMPTY
    assert mapping.pop(Key(6)) == 6
    del mapping[Key(5)]
    while mapping:
        mapping.popitem()
    assert containers._dict_metadata(mapping).state == containers._DICT_EMPTY

class Override(dict):
    def __setitem__(self, key, value):
        self.seen = value
subclass = Override()
subclass[Key(1)] = 9
assert subclass.seen == 9
assert len(subclass) == 0
dict.__setitem__(subclass, Key(1), 8)
assert subclass[Key(1)] == 8
`, canonical);
});

test("known scope construction and legacy native string writes remain correct", async (t) => {
  await run(t, `
scope = runtime.object.create(None)
scope.first = 1
mapping = containers.ρσ_scope_dict(scope)
assert containers._dict_metadata(mapping).state == containers._DICT_PRIMITIVE
storage = runtime.reflect.get(mapping, "jsmap")
originals = runtime.reflect.get(mapping, "keymap")
storage.set("second", 2)
originals.set("second", "second")
assert mapping["second"] == 2
assert "absent" not in mapping
assert containers._dict_metadata(mapping).state == containers._DICT_GENERAL
assert mapping.copy() == {"first": 1, "second": 2}
mapping.clear()
mapping["fresh"] = 3
assert containers._dict_metadata(mapping).state == containers._DICT_PRIMITIVE
`);
});
