"""CPython oracle for implicit instance/subclass check slots."""


def raises(error, function, *args):
    try:
        function(*args)
    except error:
        return
    raise AssertionError("expected exception")


events = []


class Reject(type):
    def __instancecheck__(self, value):
        events.append("instance")
        return False

    def __subclasscheck__(self, value):
        events.append("subclass")
        return False


class Rejected(metaclass=Reject):
    pass


class Child(Rejected):
    pass


exact = Rejected()
child = Child()
assert isinstance(exact, Rejected)
assert events == []
assert not isinstance(child, Rejected)
assert events == ["instance"]
assert not issubclass(Rejected, Rejected)
assert not issubclass(Child, Rejected)
assert events == ["instance", "subclass", "subclass"]
assert isinstance(child, Child)
assert not isinstance(exact, Child)


class InheritedReject(Reject):
    pass


class OtherRejected(metaclass=InheritedReject):
    pass


assert not isinstance(1, OtherRejected)
assert not issubclass(int, OtherRejected)


class Accept:
    def __instancecheck__(self, value):
        return 3

    def __subclasscheck__(self, value):
        return [1]


accept = Accept()
assert isinstance(1, accept) is True
assert issubclass([], accept) is True
# Neither instance-level slots nor a spoofed host constructor control lookup.
accept.__instancecheck__ = lambda value: False
accept.__subclasscheck__ = lambda value: False
accept.constructor = Reject
assert isinstance(1, accept) is True
assert issubclass([], accept) is True


class NoHooks:
    pass


no_hooks = NoHooks()
no_hooks.__instancecheck__ = lambda value: True
no_hooks.__subclasscheck__ = lambda value: True
no_hooks.constructor = Accept
raises(TypeError, isinstance, 1, no_hooks)
raises(TypeError, issubclass, int, no_hooks)
# A hook defined on a class is not an implicit hook for that class itself.
raises(TypeError, issubclass, [], Accept)
assert not isinstance(1, Accept)

child.constructor = Rejected
child.__python_type__ = Rejected
events.clear()
assert not isinstance(child, Rejected)
assert events == ["instance"]
exact.constructor = Child
exact.__python_type__ = Child
events.clear()
assert isinstance(exact, Rejected)
assert events == []


class Falsy:
    def __bool__(self):
        return False


class FalseHooks:
    def __instancecheck__(self, value):
        return Falsy()

    def __subclasscheck__(self, value):
        return []


false_hooks = FalseHooks()
assert isinstance(1, false_hooks) is False
assert issubclass(int, false_hooks) is False


class Explode:
    def __instancecheck__(self, value):
        raise ValueError("instance hook")

    def __subclasscheck__(self, value):
        raise ValueError("subclass hook")


explode = Explode()
for check, value in ((isinstance, 1), (issubclass, int)):
    assert check(value, ((), (false_hooks, accept), explode))
    assert check(value, (int, 17))
    assert not check(value, ())
    raises(ValueError, check, value, explode)
    raises(ValueError, check, value, (false_hooks, explode, accept))
    raises(TypeError, check, value, (17, int))
    raises(TypeError, check, value, [int])


class ExplodingTruth:
    def __bool__(self):
        raise RuntimeError("truth conversion")


class TruthHooks:
    def __instancecheck__(self, value):
        return ExplodingTruth()

    def __subclasscheck__(self, value):
        return ExplodingTruth()


raises(RuntimeError, isinstance, 1, TruthHooks())
raises(RuntimeError, issubclass, int, TruthHooks())


class StaticHooks:
    @staticmethod
    def __instancecheck__(value):
        return value == 1

    @classmethod
    def __subclasscheck__(cls, value):
        return cls is StaticHooks and value is int


assert isinstance(1, StaticHooks())
assert issubclass(int, StaticHooks())


class HookDescriptor:
    def __get__(self, instance, owner):
        assert owner is DescriptorHooks
        assert type(instance) is DescriptorHooks
        return lambda value: value is int


class DescriptorHooks:
    __instancecheck__ = HookDescriptor()
    __subclasscheck__ = HookDescriptor()


descriptor_hooks = DescriptorHooks()
descriptor_hooks.constructor = Reject
assert isinstance(int, descriptor_hooks)
assert issubclass(int, descriptor_hooks)


class InvalidHooks:
    __instancecheck__ = None
    __subclasscheck__ = None


raises(TypeError, isinstance, 1, InvalidHooks())
raises(TypeError, issubclass, int, InvalidHooks())


class CallableHook:
    def __call__(self, value):
        return value is int


class CallableHooks:
    __instancecheck__ = CallableHook()
    __subclasscheck__ = CallableHook()


assert isinstance(int, CallableHooks())
assert issubclass(int, CallableHooks())


class BuiltinHooks:
    __instancecheck__ = len
    __subclasscheck__ = len


assert isinstance([1], BuiltinHooks())
assert issubclass([1], BuiltinHooks())


class RaisingDescriptor:
    def __get__(self, instance, owner):
        raise ValueError("slot descriptor")


class RaisingMeta(type):
    __instancecheck__ = RaisingDescriptor()
    __subclasscheck__ = RaisingDescriptor()


class RaisingClass(metaclass=RaisingMeta):
    pass


# Exact isinstance bypasses even descriptor lookup, unlike issubclass.
assert isinstance(RaisingClass(), RaisingClass)
raises(ValueError, isinstance, 1, RaisingClass)
raises(ValueError, issubclass, RaisingClass, RaisingClass)
