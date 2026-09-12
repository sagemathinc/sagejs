import builtins


class Parent:
    def value(self):
        return "parent"


class Child(Parent):
    def value(self):
        return super().value() + " child"


def public_super():
    return super


original = builtins.super
assert public_super() is original
assert "super" in dir(builtins)
assert Child().value() == "parent child"
assert builtins.super(Child, Child()).value() == "parent"


def public_dir():
    return dir


original_dir = builtins.dir
try:
    builtins.dir = public_super
    assert public_dir() is public_super
    del builtins.dir
    try:
        public_dir()
    except NameError:
        pass
    else:
        assert False, "deleted ordinary builtin must not reappear"
finally:
    builtins.dir = original_dir

assert public_dir() is original_dir


def replacement(cls, instance):
    assert cls is Child
    assert isinstance(instance, Child)
    return "replacement"


try:
    builtins.super = replacement
    assert public_super() is replacement
    assert public_super()(Child, Child()) == "replacement"
    assert "super" in dir(builtins)
    del builtins.super
    assert not hasattr(builtins, "super")
    assert "super" not in dir(builtins)
    try:
        public_super()
    except NameError:
        pass
    else:
        assert False, "deleted public builtin must not reappear via host fallback"
finally:
    builtins.super = original

assert public_super() is original
assert "super" in dir(builtins)
assert Child().value() == "parent child"
