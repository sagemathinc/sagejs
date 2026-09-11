"""CPython oracle for frontend call-shape regression contracts."""


class Replacement:
    def native_get(self, target, name):
        return ("replacement", target, name)


replacement = Replacement()


class Holder:
    global Object
    Object = "class value"
    global runtime
    runtime = replacement


assert Object == "class value"
assert "Object" not in Holder.__dict__
assert "runtime" not in Holder.__dict__
assert runtime is replacement
assert runtime.native_get("target", "property") == (
    "replacement",
    "target",
    "property",
)


class Meta(type):
    def __prepare__(name, bases):
        return {"Object": "prepared shadow", "runtime": "prepared shadow"}


class PreparedHolder(metaclass=Meta):
    global Object, runtime
    Object = "prepared global"
    runtime = replacement
    assert runtime is replacement


assert Object == "prepared global"
assert runtime is replacement
assert PreparedHolder.Object == "prepared shadow"
assert PreparedHolder.runtime == "prepared shadow"


class Represented:
    def __repr__(self):
        return "represented"


assert f"{Represented()!r}" == "represented"
events = []


class Callable:
    def __call__(self, value=0, *, wrapper=False):
        events.append("call")
        return (value, wrapper)


class Package:
    marker = Callable()

    @property
    def factory(self):
        events.append("lookup")
        return Callable()


package = Package()
assert package.marker(wrapper=True) == (0, True)
events.clear()


def argument():
    events.append("argument")
    return 1


assert package.factory(argument()) == (1, False)
assert events == ["lookup", "argument", "call"]


class Config:
    @staticmethod
    def label(value):
        return value

    @staticmethod
    def use(value):
        return Config.label(value)


assert Config.use("first") == "first"
Config.label = staticmethod(lambda value: ("replaced", value))
assert Config.use("second") == ("replaced", "second")


class Base:
    def selected(self):
        return "base"


class Derived(Base):
    selected = staticmethod(lambda: "static")


assert Derived.selected() == "static"
assert Derived().selected() == "static"
Derived.selected = staticmethod(lambda: "updated")
assert Derived.selected() == "updated"

print("python-frontend-call-contracts-ok")
