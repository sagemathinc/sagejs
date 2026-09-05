class Container:
    class First:
        marker = "first"

    class Second:
        pass

    class Third:
        pass

    class Combined(First, Second, Third):
        pass

    aliases = (First,)

    class Indexed(aliases[0]):
        pass


assert Container.Combined.__bases__ == (
    Container.First,
    Container.Second,
    Container.Third,
)
assert Container.Combined().marker == "first"
assert Container.Indexed.__bases__ == (Container.First,)
assert Container.Indexed().marker == "first"


class Choice:
    marker = "module"


original_choice = Choice


class Scoped:
    class Choice:
        marker = "outer"

    class Nested(Choice):
        # The base uses Scoped's namespace, but the body and a method must
        # not implicitly close over that namespace.
        observed = Choice

        def choose(self):
            return Choice


assert Choice is original_choice
assert Choice.marker == "module"
assert Scoped.Choice is not original_choice
assert Scoped.Choice.marker == "outer"
assert Scoped.Nested.__bases__ == (Scoped.Choice,)
assert Scoped.Nested.observed is original_choice
assert Scoped.Nested().choose() is original_choice


class LevelOne:
    class Base:
        marker = "outer"

    class LevelTwo:
        class Base:
            marker = "nearest"

        class Leaf(Base):
            pass


assert LevelOne.Base is not LevelOne.LevelTwo.Base
assert LevelOne.Base.marker == "outer"
assert LevelOne.LevelTwo.Base.marker == "nearest"
assert LevelOne.LevelTwo.Leaf.__bases__ == (LevelOne.LevelTwo.Base,)
assert LevelOne.LevelTwo.Leaf().marker == "nearest"


class ModuleChild(Choice):
    pass


assert ModuleChild.__bases__ == (original_choice,)
assert ModuleChild().marker == "module"


class MethodBase:
    def describe(self):
        return "base"


class InternalReferences:
    class Choice(MethodBase):
        from math import floor

        marker = "internal"

        def method(self, value=marker):
            return value

        def describe(self):
            return super().describe() + " internal"


assert Choice is original_choice
assert InternalReferences.Choice.__name__ == "Choice"
assert InternalReferences.Choice.floor(1.5) == 1
assert InternalReferences.Choice().method() == "internal"
assert InternalReferences.Choice().describe() == "base internal"


def local_class_scope():
    class Choice:
        marker = "function"

    original_local = Choice

    class Holder:
        class Choice:
            marker = "class"

    assert Choice is original_local
    assert Holder.Choice is not original_local
    return Choice.marker, Holder.Choice.marker


assert local_class_scope() == ("function", "class")


def factory():
    return 23


class ClassReturningPrimitive:
    def __new__(cls):
        return 31


class MetadataOwner:
    class factory:
        def method(self):
            # This body is compiled while its own class is still provisional.
            return factory()

    class ClassReturningPrimitive:
        pass

    class list:
        pass

    local_instance = ClassReturningPrimitive()

    class Inner:
        observed = factory()

    def module_factory(self):
        return factory()

    def module_class(self):
        return ClassReturningPrimitive()

    def builtin_list(self):
        return list((1, 2))


assert MetadataOwner.factory().method() == 23
assert MetadataOwner.Inner.observed == 23
assert MetadataOwner().module_factory() == 23
assert MetadataOwner().module_class() == 31
assert MetadataOwner().builtin_list() == [1, 2]
assert type(MetadataOwner.local_instance) is MetadataOwner.ClassReturningPrimitive
assert ClassReturningPrimitive() == 31
assert factory() == 23


def local_metadata_scope():
    def factory():
        return 37

    class ClassReturningPrimitive:
        def __new__(cls):
            return 41

    class Owner:
        class factory:
            pass

        class ClassReturningPrimitive:
            pass

        def method(self):
            return factory(), ClassReturningPrimitive()

    return Owner().method()


assert local_metadata_scope() == (37, 41)
