def test_captured_target_and_lookup_once():
    events = []

    class Target:
        def method(self, *, value):
            events.append("old")
            return value

    class Holder:
        @property
        def child(self):
            events.append("lookup")
            return target

    def replacement(self, *, value):
        events.append("new")
        return value + 1

    def argument():
        events.append("argument")
        Target.method = replacement
        return 4

    target = Target()
    assert Holder().child.method(value=argument()) == 4
    assert events == ["lookup", "argument", "old"]
    assert target.method(value=4) == 5


def test_saved_method_identity():
    class Target:
        def method(self, *, value):
            return value

    def replacement(self, *, value):
        return value + 1

    target = Target()
    original = Target.method
    saved = target.method
    assert saved.__self__ is target
    assert saved.__func__ is original
    assert target.method is not target.method
    Target.method = replacement
    assert saved(value=4) == 4
    assert saved.__func__ is original
    assert target.method(value=4) == 5


def test_owned_and_descriptor_returned_functions():
    events = []

    def function(*, value):
        events.append("body")
        return value

    class Descriptor:
        def __get__(self, instance, owner):
            events.append("get")
            return function

    class Target:
        method = Descriptor()

    target = Target()
    target.owned = function
    assert target.owned(value=3) == 3
    assert target.method(value=4) == 4
    assert events == ["body", "get", "body"]


def test_noncallable_after_argument_expansion():
    events = []

    class Descriptor:
        def __get__(self, instance, owner):
            events.append("get")
            return 42

    class Target:
        method = Descriptor()

    class Mapping:
        def keys(self):
            events.append("keys")
            return ["value"]

        def __getitem__(self, key):
            events.append("item")
            return 1

    try:
        Target().method(**Mapping())
    except TypeError:
        events.append("error")
    else:
        assert False
    assert events == ["get", "keys", "item", "error"]


def test_duplicate_mapping_before_item_and_callability():
    events = []

    class Descriptor:
        def __get__(self, instance, owner):
            events.append("get")
            return 42

    class Target:
        method = Descriptor()

    class Mapping:
        def keys(self):
            events.append("keys")
            return ["value"]

        def __getitem__(self, key):
            events.append("unexpected-item")
            raise AssertionError

    def argument():
        events.append("argument")
        return 1

    try:
        Target().method(value=argument(), **Mapping())
    except TypeError:
        events.append("error")
    else:
        assert False
    assert events == ["get", "argument", "keys", "error"]


def test_argument_error_precedes_noncallable_error():
    events = []
    sentinel = ValueError("argument")

    class Target:
        @property
        def method(self):
            events.append("get")
            return 42

    def argument():
        events.append("argument")
        raise sentinel

    try:
        Target().method(value=argument())
    except ValueError as error:
        assert error is sentinel
    else:
        assert False
    assert events == ["get", "argument"]


def test_bound_class_static_and_positional_only():
    class Base:
        def method(self, positional, /, *, value):
            return positional + value

        @classmethod
        def class_method(cls, *, value):
            return cls, value

        @staticmethod
        def static_method(*, value):
            return value

    class Child(Base):
        pass

    target = Child()
    assert target.method(3, value=4) == 7
    assert Child.method(target, 3, value=4) == 7
    assert target.class_method(value=4) == (Child, 4)
    assert target.static_method(value=4) == 4
    try:
        target.method(positional=3, value=4)
    except TypeError:
        pass
    else:
        assert False


def test_live_defaults_during_arguments():
    class Target:
        def method(self, value=1, *, keyword=2):
            return value, keyword

    def argument():
        Target.method.__defaults__ = (7,)
        Target.method.__kwdefaults__ = {"keyword": 9}
        return {}

    assert Target().method(**argument()) == (7, 9)


def test_duplicate_binding_and_body_typeerror():
    events = []
    sentinel = TypeError("body")

    class Target:
        def method(self, value):
            events.append("body")
            raise sentinel

    def argument(label):
        events.append(label)
        return 1

    target = Target()
    try:
        target.method(argument("positional"), value=argument("keyword"))
    except TypeError as error:
        assert error is not sentinel
    else:
        assert False
    assert events == ["positional", "keyword"]
    try:
        target.method(value=argument("valid"))
    except TypeError as error:
        assert error is sentinel
    else:
        assert False
    assert events == ["positional", "keyword", "valid", "body"]


def test_reentrant_custom_lookup():
    events = []

    class Target:
        def __getattribute__(self, name):
            if name == "method":
                events.append("lookup")
            return object.__getattribute__(self, name)

        def method(self, *, value):
            events.append(value)
            return value

    target = Target()
    assert target.method(value=target.method(value=3)) == 3
    assert events == ["lookup", "lookup", 3, 3]


def test_star_arguments_with_keywords():
    events = []

    class Arguments:
        def __init__(self):
            events.append("star-expression")

        def __iter__(self):
            events.append("iterate")
            return iter([3])

    class Target:
        def method(self, positional, *, value):
            events.append("body")
            return positional + value

    class Holder:
        @property
        def child(self):
            events.append("lookup")
            return Target()

    def keyword():
        events.append("keyword")
        return 4

    assert Holder().child.method(*Arguments(), value=keyword()) == 7
    assert events == ["lookup", "star-expression", "keyword", "iterate", "body"]
    events.clear()
    assert Holder().child.method(value=keyword(), *Arguments()) == 7
    assert events == ["lookup", "star-expression", "keyword", "iterate", "body"]


def test_multiple_stars_and_positional_items():
    events = []

    class Arguments:
        def __init__(self, label):
            self.label = label

        def __iter__(self):
            events.append("iter-" + self.label)
            return iter([1])

    class Target:
        def method(self, *args, value):
            events.append("body")
            return args, value

    def star(label):
        events.append("expr-" + label)
        return Arguments(label)

    def positional():
        events.append("positional")
        return 2

    def keyword():
        events.append("keyword")
        return 3

    target = Target()
    assert target.method(*star("a"), *star("b"), value=keyword()) == ((1, 1), 3)
    assert events == ["expr-a", "iter-a", "expr-b", "iter-b", "keyword", "body"]
    events.clear()
    assert target.method(positional(), *star("a"), value=keyword()) == ((2, 1), 3)
    assert events == ["positional", "expr-a", "iter-a", "keyword", "body"]
    events.clear()
    assert target.method(*star("a"), positional(), value=keyword()) == ((1, 2), 3)
    assert events == ["expr-a", "iter-a", "positional", "keyword", "body"]


def test_explicit_self_and_positional_only_self():
    def external(self, /, value, **keywords):
        return self, value, keywords["self"]

    class Target:
        def ordinary(self, value):
            return value

        def positional_self(self, /, value, **keywords):
            return self, value, keywords["self"]

    Target.external = external
    target = Target()
    assert target.external(value=3, self=4) == (target, 3, 4)
    assert target.positional_self(value=3, self=4) == (target, 3, 4)
    try:
        target.ordinary(value=3, self=4)
    except TypeError:
        pass
    else:
        assert False
