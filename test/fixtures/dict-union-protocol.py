left = {"a": 1, "shared": 2}


def annotated(constructor: str):
    return constructor


assert annotated("annotation metadata must not break construction") == (
    "annotation metadata must not break construction"
)
right = {"shared": 3, "b": 4}
merged = left | right
assert merged == {"a": 1, "shared": 3, "b": 4}
assert list(merged) == ["a", "shared", "b"]
assert left == {"a": 1, "shared": 2}
assert right.__ror__(left) == merged
assert left.__or__([("x", 1)]) is NotImplemented
assert left.__ror__(None) is NotImplemented


class Mapping:
    def __init__(self):
        self.data = {"a": 5, "c": 6}

    def keys(self):
        return ["a", "c"]

    def __getitem__(self, key):
        return self.data[key]


alias = left
left |= Mapping()
assert left is alias
assert left == {"a": 5, "shared": 2, "c": 6}
left |= ((key, value) for key, value in [("d", 7)])
assert left["d"] == 7
left.update(Mapping())
assert left["c"] == 6
mapping = Mapping()
mapping.__getitem__ = lambda key: "instance shadow must be ignored"
left.update(mapping)
assert left["c"] == 6
left.update([iter(["iterator-pair", 8])])
assert left["iterator-pair"] == 8


class MappingList(list):
    def keys(self):
        return ["list-key"]

    def __getitem__(self, key):
        assert key == "list-key"
        return 9


left.update(MappingList())
assert left["list-key"] == 9
for invalid in [None, 42, [36]]:
    try:
        left |= invalid
    except TypeError:
        pass
    else:
        raise AssertionError("invalid update accepted")


class Child(dict):
    def update(self, other):
        raise AssertionError("union must not dispatch to overridden update")

    def items(self):
        raise AssertionError("union must not dispatch to overridden items")


assert type(Child(a=1) | {"b": 2}) is dict
assert type({"a": 1} | Child(b=2)) is dict
child = Child(a=1)
child |= {"b": 2}
assert child == {"a": 1, "b": 2}
partial = {}
try:
    partial |= [("ok", 1), ("bad",)]
except ValueError:
    pass
else:
    raise AssertionError("invalid pair accepted")
assert partial == {"ok": 1}


class Holder:
    pass


holder = Holder()
value = Holder()
value.__sagejs_eager_bound_cache__ = True
value.__self__ = holder
value.__name__ = "saved"
holder.saved = value
assert "saved" in holder.__dict__
assert holder.__dict__["saved"] is value
assert dict(holder.__dict__)["saved"] is value
print("dict-union-protocol-ok")
