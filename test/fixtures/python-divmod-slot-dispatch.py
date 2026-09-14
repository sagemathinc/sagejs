events = []
observations = []


def check(label, left, right):
    events.clear()
    try:
        value = divmod(left, right)
        observations.append(label + " " + str(value) + " " + str(events))
    except Exception as error:
        observations.append(label + " " + type(error).__name__ + " " + str(events))


class Base:
    def __divmod__(self, other):
        events.append("left")
        return "left"

    def __rdivmod__(self, other):
        events.append("base-right")
        return "base-right"


class Sub(Base):
    def __rdivmod__(self, other):
        events.append("sub-right")
        return "sub-right"


class Deep(Sub):
    pass


class Inherited(Base):
    pass


class Alias(Base):
    __rdivmod__ = Base.__rdivmod__


check("override", Base(), Sub())
check("indirect", Base(), Deep())
check("inherited", Base(), Inherited())
check("alias", Base(), Alias())
check("same", Base(), Base())


def replacement(self, other):
    events.append("dynamic")
    return "dynamic"


Inherited.__rdivmod__ = replacement
check("mutated", Base(), Inherited())
del Inherited.__rdivmod__
check("deleted", Base(), Inherited())
left = Base()
left.__divmod__ = lambda other: "shadow"
right = Sub()
right.__rdivmod__ = lambda other: "shadow"
right.constructor = Base
check("shadow-constructor", left, right)


class Refusal(Base):
    def __rdivmod__(self, other):
        events.append("refused")
        return NotImplemented


check("refuse-once", Base(), Refusal())


class Neither:
    def __divmod__(self, other):
        events.append("direct-no")
        return NotImplemented

    def __rdivmod__(self, other):
        events.append("reflected-no")
        return NotImplemented


check("same-notimplemented", Neither(), Neither())


class ClassBase(Base):
    @classmethod
    def __rdivmod__(cls, other):
        events.append(cls.__name__)
        return "classmethod"


class ClassInherited(ClassBase):
    pass


check("class-inherited", ClassBase(), ClassInherited())


class StaticBase(Base):
    @staticmethod
    def __rdivmod__(other):
        events.append("static")
        return "static"


class StaticInherited(StaticBase):
    pass


check("static-inherited", StaticBase(), StaticInherited())


class Descriptor:
    def __get__(self, obj, owner):
        events.append("descriptor-" + owner.__name__)
        return lambda other: "descriptor-result"


class DescriptorBase(Base):
    __rdivmod__ = Descriptor()


class DescriptorInherited(DescriptorBase):
    pass


check("descriptor-inherited", DescriptorBase(), DescriptorInherited())


class MutationDescriptor:
    def __get__(self, obj, owner):
        events.append("mutation-" + owner.__name__)
        if obj is None:
            MutationBase.__divmod__ = lambda self, other: "new-left"
        return shared_callable


def shared_callable(other):
    return "unused"


class MutationBase(Base):
    __rdivmod__ = MutationDescriptor()


class MutationSub(MutationBase):
    pass


check("descriptor-mutates-left", MutationBase(), MutationSub())


class SharedCompare:
    def __ne__(self, other):
        events.append("unexpected-ne")
        raise ValueError("identity should skip comparison")


shared_compare = SharedCompare()


class IdentityDescriptor:
    def __get__(self, obj, owner):
        return shared_compare


class IdentityBase(Base):
    __rdivmod__ = IdentityDescriptor()


class IdentitySub(IdentityBase):
    pass


check("identity-compare", IdentityBase(), IdentitySub())


class Compare:
    def __init__(self, name):
        self.name = name

    def __ne__(self, other):
        events.append("compare-" + self.name + "-" + other.name)
        return True

    def __call__(self, other):
        return "compared"


class CompareDescriptor:
    def __get__(self, obj, owner):
        events.append("get-" + owner.__name__)
        return Compare(owner.__name__)


class CompareBase(Base):
    __rdivmod__ = CompareDescriptor()


class CompareSub(CompareBase):
    pass


check("rich-compare", CompareBase(), CompareSub())


class MissingDescriptor:
    def __get__(self, obj, owner):
        events.append("missing-" + owner.__name__)
        raise AttributeError("missing")


class MissingBase(Base):
    __rdivmod__ = MissingDescriptor()


class MissingSub(MissingBase):
    pass


check("descriptor-attributeerror", MissingBase(), MissingSub())


def changed_right(self, other):
    events.append("changed-right")
    return "changed"


class ReplaceDescriptor:
    def __get__(self, obj, owner):
        events.append("replace")
        owner.__rdivmod__ = changed_right
        return lambda other: "stale"


class ReplaceSub(Base):
    __rdivmod__ = ReplaceDescriptor()


check("descriptor-mutates-right", Base(), ReplaceSub())


class LaterRight:
    def __rdivmod__(self, other):
        return "stale-later"


class LaterLeft:
    def __divmod__(self, other):
        events.append("later-left")
        LaterRight.__rdivmod__ = changed_right
        return NotImplemented


check("left-mutates-right", LaterLeft(), LaterRight())


class BadSub(Base):
    __rdivmod__ = 1


check("noncallable", Base(), BadSub())


class AttrMeta(type):
    def __getattribute__(cls, name):
        if name == "__rdivmod__":
            events.append("meta")
        return type.__getattribute__(cls, name)


class MetaBase(Base, metaclass=AttrMeta):
    pass


class MetaSub(MetaBase):
    pass


check("metaclass", MetaBase(), MetaSub())


class ErrorDescriptor:
    def __get__(self, obj, owner):
        events.append("error-descriptor")
        raise ValueError("do not suppress")


class ErrorSub(Base):
    __rdivmod__ = ErrorDescriptor()


check("descriptor-error", Base(), ErrorSub())


class FloorOnly:
    def __floordiv__(self, other):
        return 1

    def __mod__(self, other):
        return 2


check("floor-only", FloorOnly(), FloorOnly())
