"""CPython oracle: representation fields cannot change Python instance type."""


class Plain:
    pass


plain = Plain()
assert type(plain) is Plain
plain.constructor = int
plain.__python_type__ = str
plain.__sagejs_float__ = True
assert type(plain) is Plain
assert plain.__class__ is Plain


class ConstructorMember:
    constructor = 17


member = ConstructorMember()
assert type(member) is ConstructorMember
ConstructorMember.constructor = str
assert type(member) is ConstructorMember
del ConstructorMember.constructor
assert type(member) is ConstructorMember


class ConstructorGetter:
    @property
    def constructor(self):
        raise AssertionError("type must not read constructor descriptors")


getter = ConstructorGetter()
assert type(getter) is ConstructorGetter


class Child(ConstructorMember):
    constructor = None


assert type(Child()) is Child
Dynamic = type("Dynamic", (Plain,), {"constructor": 91, "__python_type__": int})
dynamic = Dynamic()
assert type(dynamic) is Dynamic
assert type(Dynamic) is type


class Callable:
    def __call__(self):
        return 19


callable_value = Callable()
assert type(callable_value) is Callable
callable_value.constructor = int
callable_value.__python_type__ = str
assert type(callable_value) is Callable
assert callable_value() == 19


class OtherCallable:
    def __call__(self):
        return 23


callable_value = Callable()
callable_value.__python_type__ = str
callable_value.__class__ = OtherCallable
assert type(callable_value) is OtherCallable


class Reassigned:
    constructor = float


plain.__class__ = Reassigned
assert type(plain) is Reassigned
assert plain.__class__ is Reassigned
plain.__class__ = Plain
assert type(plain) is Plain


class OwnerWitness:
    def __set_name__(self, owner, name):
        instance = object.__new__(owner)
        assert type(instance) is owner


class FinalizationWitness(Plain):
    constructor = None
    witness = OwnerWitness()


DynamicWitness = type("DynamicWitness", (Plain,), {"witness": OwnerWitness()})
assert type(object()) is object
assert type(Plain) is type
assert type([]) is list
assert type(()) is tuple
assert type({}) is dict
assert type(set()) is set
assert type(True) is bool
assert type("text") is str


# Re-executing a class definition must not steal ownership of older instances.
class Repeated:
    pass


earlier_class = Repeated
earlier_instance = Repeated()
earlier_instance.constructor = str


class Repeated:
    pass


assert type(earlier_instance) is earlier_class
assert type(Repeated()) is Repeated
print("canonical-instance-type-ok")
