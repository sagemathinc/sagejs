import sagejs.runtime as runtime


class Record:
    pass


class Other:
    pass


def rejected(action):
    try:
        action()
    except TypeError:
        return
    raise AssertionError("frozen mutation succeeded")


def write_item(namespace):
    namespace["value"] = 9


def delete_item(namespace):
    del namespace["value"]


def merge_items(namespace):
    namespace |= {"value": 9}


def check_frozen(expose_first):
    owner = Record()
    owner.value = 1
    owner.nested = []
    if expose_first:
        before = owner.__dict__
        saved_set = before.__setitem__
        saved_init = before.__init__
        saved_clear = before.clear
    runtime.object.freeze(owner)
    namespace = owner.__dict__
    assert namespace is owner.__dict__
    if expose_first:
        assert namespace is before
        rejected(lambda: saved_set("value", 9))
        rejected(lambda: saved_init(value=9))
        rejected(saved_clear)
    actions = [
        lambda: write_item(namespace),
        lambda: delete_item(namespace),
        lambda: merge_items(namespace),
        lambda: namespace.update(value=9),
        lambda: namespace.update({"value": 9}),
        lambda: namespace.update([("value", 9)]),
        lambda: namespace.setdefault("new", 9),
        lambda: namespace.pop("value"),
        lambda: namespace.popitem(),
        lambda: namespace.clear(),
        lambda: namespace.__init__({"value": 9}),
        lambda: dict.__init__(namespace, value=9),
        lambda: dict.__setitem__(namespace, "value", 9),
        lambda: dict.__delitem__(namespace, "value"),
        lambda: dict.update(namespace, value=9),
        lambda: setattr(owner, "value", 9),
        lambda: setattr(owner, "new", 9),
        lambda: object.__setattr__(owner, "value", 9),
        lambda: delattr(owner, "value"),
        lambda: object.__delattr__(owner, "value"),
        lambda: setattr(owner, "__dict__", {}),
        lambda: delattr(owner, "__dict__"),
        lambda: object.__setattr__(owner, "__class__", Other),
    ]
    for action in actions:
        for attempt in range(2):
            rejected(action)
            assert owner.value == 1 and namespace["value"] == 1
            assert list(namespace) == ["value", "nested"]
            assert owner.__dict__ is namespace and type(owner) is Record
    # Reads and operations that make no storage writes remain legal.
    namespace.__init__()
    namespace.update({})
    assert namespace.setdefault("value", 9) == 1
    assert namespace.pop("missing", 7) == 7
    assert list(namespace.items()) == [("value", 1), ("nested", [])]
    copied = namespace.copy()
    copied["value"] = 8
    assert owner.value == 1
    owner.nested.append(3)
    assert namespace["nested"] == [3] and copied["nested"] is owner.nested


check_frozen(False)
check_frozen(True)


# Class descriptors are not frozen own host accessors. A property may still
# mutate a nested referent without replacing a frozen own field.
class Described:
    @property
    def latest(self):
        return self.nested[-1]

    @latest.setter
    def latest(self, value):
        self.nested.append(value)


for expose_first in (False, True):
    described = Described()
    described.value = 1
    described.nested = [2]
    if expose_first:
        described_alias = described.__dict__
    runtime.object.freeze(described)
    described_alias = described.__dict__
    assert "latest" not in described_alias
    rejected(lambda: setattr(described, "value", 2))
    assert described.value == 1
    described.latest = 3
    assert described.latest == 3 and described_alias["nested"] == [2, 3]

# Replacing or deleting a namespace releases that owner's old alias.
detached = Record()
detached.value = 1
old = detached.__dict__
detached.__dict__ = {"value": 2}
old["value"] = 3  # Also prunes the inactive weak reference.
detached.__dict__ = old
runtime.object.freeze(detached)
rejected(lambda: old.update(value=4))
assert detached.value == 3

deleted = Record()
deleted.value = 1
old_deleted = deleted.__dict__
del deleted.__dict__
runtime.object.freeze(deleted)
assert deleted.__dict__ == {} and deleted.__dict__ is deleted.__dict__
rejected(lambda: deleted.__dict__.update(value=3))
old_deleted["value"] = 2
assert old_deleted == {"value": 2}

# A shared dictionary cannot mutate while any attached owner is frozen.
shared = {"value": 1}
first = Record()
second = Record()
first.__dict__ = shared
second.__dict__ = shared
saved_update = shared.update
runtime.object.freeze(first)
rejected(lambda: saved_update(value=2))
rejected(lambda: setattr(second, "value", 2))
second.__dict__ = {"value": 3}
second.value = 4
assert first.value == 1 and second.value == 4
rejected(lambda: shared.clear())

# Adjacent detached owners are all removed before checking the next owner.
adjacent = {"value": 1}
detachers = [Record(), Record(), Record()]
for owner in detachers:
    owner.__dict__ = adjacent
for owner in detachers[:2]:
    owner.__dict__ = {}
    runtime.object.freeze(owner)
adjacent["value"] = 2
assert detachers[2].value == 2
runtime.object.freeze(detachers[2])
rejected(lambda: adjacent.update(value=3))

# Reattaching the same owner before pruning does not accumulate duplicates.
import sagejs._namespace as namespace_module

reattached = Record()
reused = {"value": 1}
for attempt in range(3):
    reattached.__dict__ = reused
    reattached.__dict__ = {}
reattached.__dict__ = reused
assert len(namespace_module._namespace_owners.get(reused)) == 1
runtime.object.freeze(reattached)
rejected(lambda: reused.update(value=2))


# Explicit base dict operations bypass subclass overrides, not the guard.
class Namespace(dict):
    def __setitem__(self, key, value):
        raise AssertionError("unexpected subclass setitem")


subclass_owner = Record()
subclass_alias = Namespace(value=1)
subclass_owner.__dict__ = subclass_alias
runtime.object.freeze(subclass_owner)
rejected(lambda: dict.__setitem__(subclass_alias, "value", 2))
rejected(lambda: dict.__init__(subclass_alias, value=2))
assert subclass_owner.value == 1

# Raw Object remains the native host constructor; no global freeze facade.
assert runtime.object is runtime.reflect.get(runtime.global_object, "Object")

# Explicit host accessors are not fixed data, even when the owner is frozen.
accessor_owner = Record()
accessor_owner.value = 1
calls = []


def get_value():
    calls.append(1)
    return len(calls)


descriptor = runtime.object.create(None)
descriptor.get = get_value
descriptor.configurable = True
runtime.object.defineProperty(accessor_owner, "value", descriptor)
runtime.object.freeze(accessor_owner)
for attempt in range(2):
    rejected(lambda: getattr(accessor_owner, "__dict__"))
assert calls == []
assert accessor_owner.value == 1 and accessor_owner.value == 2

# Guard installation preflights both backing Maps before changing either.
blocked = Record()
blocked.value = 1
unusable = {"value": 2}
runtime.object.preventExtensions(unusable.jsmap)
for attempt in range(2):
    rejected(lambda: setattr(blocked, "__dict__", unusable))
    assert blocked.value == 1
    assert (
        runtime.object.getOwnPropertyDescriptor(unusable.keymap, "set")
        is runtime.undefined
    )
unusable["value"] = 3
assert unusable["value"] == 3 and blocked.value == 1

# A hostile Proxy can reject the bridge despite extensibility. It must not
# publish ownership or make the proposed replacement behave as frozen storage.
bridge_target = Record()
bridge_target.value = 1
handler = runtime.object.create(None)


def deny_prototype(target, prototype):
    return False


handler.setPrototypeOf = deny_prototype
bridge_proxy = runtime.reflect.construct(runtime.proxy_class, [bridge_target, handler])
proposed = {"value": 2}
rejected(lambda: setattr(bridge_proxy, "__dict__", proposed))
runtime.object.freeze(bridge_proxy)
proposed["value"] = 3
assert bridge_target.value == 1 and proposed == {"value": 3}
next_owner = Record()
next_owner.__dict__ = proposed
next_owner.value = 4
assert proposed == {"value": 4}

# Sealing an exposed object with a writable native field is not freezing it.
# The installed bridge remains usable without changing its native prototype.
sealed = Record()
sealed.value = 1
sealed_alias = sealed.__dict__
native_descriptor = runtime.object.create(None)
native_descriptor.value = 10
native_descriptor.writable = True
native_descriptor.configurable = True
runtime.object.defineProperty(sealed, "native_only", native_descriptor)
runtime.object.seal(sealed)
assert not runtime.object.isFrozen(sealed)
sealed.value = 2
assert sealed_alias["value"] == 2
sealed.__dict__ = {"value": 3}
sealed_alias["value"] = 4
assert sealed.value == 3


# Frozen data snapshots bypass Python attribute overrides and omit raw-deleted
# fields, even if their old field-tracking entry still exists.
class Override:
    def __getattribute__(self, name):
        raise AssertionError("snapshot called Python attribute override")


overridden = Override()
overridden.value = 1
overridden.removed = 2
runtime.reflect.deleteProperty(overridden, "removed")
runtime.object.freeze(overridden)
overridden_alias = Override.__dict__["__dict__"].__get__(overridden, Override)
assert overridden_alias == {"value": 1}
assert overridden_alias.copy() == {"value": 1}

print("frozen-owned-dictionary-ok")
