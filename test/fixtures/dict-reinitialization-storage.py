existing = {"old": 1, "shared": 2}
alias = existing
view = existing.keys()
saved_init = existing.__init__
assert saved_init() is None
assert existing == {"old": 1, "shared": 2}
assert list(view) == ["old", "shared"]
dict.__init__(existing, {"new": 3, "shared": 4}, shared=5, last=6)
assert existing is alias
assert existing == {"old": 1, "shared": 5, "new": 3, "last": 6}
assert list(view) == ["old", "shared", "new", "last"]
dict.__init__(existing, existing)
assert list(existing.items()) == [("old", 1), ("shared", 5), ("new", 3), ("last", 6)]


class Mapping:
    def keys(self):
        return ["mapped", "shared"]

    def __getitem__(self, key):
        return 7 if key == "mapped" else 8


dict.__init__(existing, Mapping(), shared=9)
assert existing["old"] == 1 and existing["mapped"] == 7 and existing["shared"] == 9
dict.__init__(existing, [("pair", 10)])
assert existing["pair"] == 10
for invalid in [None, 42]:
    before = dict(existing)
    try:
        dict.__init__(existing, invalid)
    except TypeError:
        pass
    else:
        raise AssertionError("invalid input accepted")
    assert existing == before
try:
    dict.__init__(existing, [("partial", 11), ("invalid",)])
except ValueError:
    pass
else:
    raise AssertionError("invalid pair accepted")
assert existing["old"] == 1 and existing["partial"] == 11


class Child(dict):
    def __setitem__(self, key, value):
        raise AssertionError("base initialization must bypass __setitem__")

    def update(self, *args, **kwargs):
        raise AssertionError("base initialization must bypass update")


child = Child(old=12)
dict.__init__(child, {"new": 13})
assert child == {"old": 12, "new": 13}
dict.__init__(child, child)
assert child == {"old": 12, "new": 13}


class Holder:
    pass


holder = Holder()
holder.value = 14
owned = holder.__dict__
dict.__init__(owned, extra=15)
assert holder.__dict__ is owned and holder.value == 14 and holder.extra == 15
print("dict-reinitialization-storage-ok")
